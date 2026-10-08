/**
 * プロジェクトの未保存の変更を判定する。
 * 保存・読み込みなどの基準時点で「保存される内容」を記録し、現在の内容と比べる。
 * 編集操作ごとにフラグを立てる方式と違い、元に戻した場合は未保存扱いにならない。
 * 内容の取得は ProjectFileManager.getContentFingerprint を渡して行う（循環参照を避けるため）。
 */
export type FingerprintProvider = () => string;

let baselineFingerprint: string | null = null;
let pendingBaselineTimer: number | null = null;

function readFingerprint(provider: FingerprintProvider): string | null {
  try {
    return provider();
  } catch (error) {
    console.warn('[ProjectDirtyTracker] プロジェクト内容の取得に失敗しました:', error);
    return null;
  }
}

/**
 * 現在の内容を「保存済み」の基準にする。
 * 読み込み直後は歌詞の反映などが遅れて行われるため、delayMs 待ってから記録する。
 */
export function markProjectClean(provider: FingerprintProvider, delayMs = 0): void {
  if (pendingBaselineTimer !== null) {
    window.clearTimeout(pendingBaselineTimer);
    pendingBaselineTimer = null;
  }
  const record = () => {
    pendingBaselineTimer = null;
    baselineFingerprint = readFingerprint(provider);
    window.dispatchEvent(new CustomEvent('project-dirty-state-changed'));
  };
  if (delayMs > 0) {
    pendingBaselineTimer = window.setTimeout(record, delayMs);
  } else {
    record();
  }
}

/** 基準時点から保存される内容が変わっていれば true。基準が未記録の間は false。 */
export function hasUnsavedChanges(provider: FingerprintProvider): boolean {
  if (baselineFingerprint === null) return false;
  const current = readFingerprint(provider);
  return current !== null && current !== baselineFingerprint;
}
