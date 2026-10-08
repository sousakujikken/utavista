import { promises as fs } from 'fs';

/** フォントファイル内部の name / OS/2 / fvar テーブルから読み取った情報。 */
export interface FontFileMetadata {
  /** 表示・CSSで使うファミリー名（Typographic Family を優先） */
  family: string;
  /** サブファミリー名（Thin / Bold / Italic など） */
  subfamily: string;
  /** OS/2 usWeightClass（1〜1000） */
  weight: number;
  italic: boolean;
  /** fvar テーブルを持つ可変フォントか */
  variable: boolean;
}

interface TableRecord {
  offset: number;
  length: number;
}

const SFNT_VERSIONS = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]);
const NAME_FAMILY = 1;
const NAME_SUBFAMILY = 2;
const NAME_TYPOGRAPHIC_FAMILY = 16;
const NAME_TYPOGRAPHIC_SUBFAMILY = 17;

/**
 * TrueType / OpenType（.ttf / .otf）の先頭フォントのメタデータを読む。
 * ファイル名からの推測と違い、ウェイト別の静的フォントも同じファミリーとして扱える。
 * 読めない形式（WOFF / WOFF2 / TTC など）や壊れたファイルは null を返す。
 */
export async function readFontMetadata(filePath: string): Promise<FontFileMetadata | null> {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = await readBytes(handle, 0, 12);
    if (!header || !SFNT_VERSIONS.has(header.readUInt32BE(0))) return null;
    const numTables = header.readUInt16BE(4);
    const directory = await readBytes(handle, 12, numTables * 16);
    if (!directory) return null;

    const tables = new Map<string, TableRecord>();
    for (let index = 0; index < numTables; index += 1) {
      const base = index * 16;
      tables.set(directory.toString('latin1', base, base + 4), {
        offset: directory.readUInt32BE(base + 8),
        length: directory.readUInt32BE(base + 12)
      });
    }

    const nameTable = tables.get('name');
    if (!nameTable) return null;
    const nameData = await readBytes(handle, nameTable.offset, nameTable.length);
    if (!nameData) return null;
    const names = parseNameTable(nameData);
    const family = names.get(NAME_TYPOGRAPHIC_FAMILY) || names.get(NAME_FAMILY);
    if (!family) return null;
    const subfamily = names.get(NAME_TYPOGRAPHIC_SUBFAMILY) || names.get(NAME_SUBFAMILY) || 'Regular';

    let weight = 400;
    let italic = /italic|oblique/i.test(subfamily);
    const os2 = tables.get('OS/2');
    if (os2 && os2.length >= 64) {
      const os2Data = await readBytes(handle, os2.offset, 64);
      if (os2Data) {
        const weightClass = os2Data.readUInt16BE(4);
        // 古いフォントは 1〜9 で格納していることがある。
        weight = weightClass > 0 && weightClass < 10 ? weightClass * 100 : weightClass || 400;
        italic = italic || (os2Data.readUInt16BE(62) & 0x0001) !== 0;
      }
    }

    return {
      family: family.trim(),
      subfamily: subfamily.trim(),
      weight: Math.min(1000, Math.max(1, weight)),
      italic,
      variable: tables.has('fvar')
    };
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function readBytes(handle: fs.FileHandle, position: number, length: number): Promise<Buffer | null> {
  if (length <= 0) return null;
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : null;
}

/**
 * name テーブルから nameID ごとの文字列を取り出す。
 * 優先順位: Windows・英語(米国) → Windows・任意の言語 → Mac・英語 → Unicode。
 * CSS のファミリー名として扱いやすい英語名を優先する。
 */
function parseNameTable(data: Buffer): Map<number, string> {
  const count = data.readUInt16BE(2);
  const stringOffset = data.readUInt16BE(4);
  const best = new Map<number, { rank: number; value: string }>();

  for (let index = 0; index < count; index += 1) {
    const base = 6 + index * 12;
    if (base + 12 > data.length) break;
    const platformId = data.readUInt16BE(base);
    const encodingId = data.readUInt16BE(base + 2);
    const languageId = data.readUInt16BE(base + 4);
    const nameId = data.readUInt16BE(base + 6);
    const length = data.readUInt16BE(base + 8);
    const offset = data.readUInt16BE(base + 10);
    if (![NAME_FAMILY, NAME_SUBFAMILY, NAME_TYPOGRAPHIC_FAMILY, NAME_TYPOGRAPHIC_SUBFAMILY].includes(nameId)) continue;

    const start = stringOffset + offset;
    if (start + length > data.length) continue;
    const raw = data.subarray(start, start + length);

    let rank: number;
    let value: string;
    if (platformId === 3 && (encodingId === 1 || encodingId === 10 || encodingId === 0)) {
      rank = languageId === 0x0409 ? 0 : 1;
      value = decodeUtf16BE(raw);
    } else if (platformId === 1 && encodingId === 0) {
      rank = languageId === 0 ? 2 : 3;
      value = raw.toString('latin1');
    } else if (platformId === 0) {
      rank = 4;
      value = decodeUtf16BE(raw);
    } else {
      continue;
    }
    value = value.replace(/\0/g, '').trim();
    if (!value) continue;
    const current = best.get(nameId);
    if (!current || rank < current.rank) best.set(nameId, { rank, value });
  }

  return new Map(Array.from(best.entries(), ([nameId, entry]) => [nameId, entry.value]));
}

function decodeUtf16BE(raw: Buffer): string {
  const swapped = Buffer.from(raw);
  for (let index = 0; index + 1 < swapped.length; index += 2) {
    const byte = swapped[index];
    swapped[index] = swapped[index + 1];
    swapped[index + 1] = byte;
  }
  return swapped.toString('utf16le');
}
