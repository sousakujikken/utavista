import * as fs from 'fs';
import * as path from 'path';

/**
 * FFmpeg / FFprobe の実行ファイルを探す。
 * macOS の GUI アプリはシェルの PATH を引き継がないため、代表的なインストール先も直接確認する。
 * 優先順位: 環境変数 → 同梱バイナリ → ffmpeg-static（開発時） → PATH → 既知のインストール先 → コマンド名のまま
 */
export function resolveFFmpegBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  const envOverride = process.env[name === 'ffmpeg' ? 'UTAVISTA_FFMPEG_PATH' : 'UTAVISTA_FFPROBE_PATH'];

  const candidates: string[] = [];
  if (envOverride) candidates.push(envOverride);
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'ffmpeg', executable));
  const devBinary = resolveDevStaticBinary(name);
  if (devBinary) candidates.push(devBinary);
  (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .forEach(dir => candidates.push(path.join(dir, executable)));

  if (process.platform === 'darwin') {
    candidates.push(
      `/opt/homebrew/bin/${name}`, // Apple Silicon Homebrew
      `/usr/local/bin/${name}`, // Intel Homebrew / 手動インストール
      `/opt/local/bin/${name}` // MacPorts
    );
  } else if (process.platform !== 'win32') {
    candidates.push(`/usr/local/bin/${name}`, `/usr/bin/${name}`);
  }

  const found = candidates.find(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  return found ?? executable;
}

/**
 * 開発時（未パッケージ）は devDependencies の ffmpeg-static / ffprobe-static を使う。
 * パッケージ版には node_modules 側が含まれないため、ここは見つからず Resources/ffmpeg が使われる。
 */
function resolveDevStaticBinary(name: 'ffmpeg' | 'ffprobe'): string | null {
  try {
    if (name === 'ffmpeg') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const binary = require('ffmpeg-static') as string | null;
      return typeof binary === 'string' ? binary : null;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const binary = (require('ffprobe-static') as { path?: string }).path;
    return typeof binary === 'string' ? binary : null;
  } catch {
    return null;
  }
}
