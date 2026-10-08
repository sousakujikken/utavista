/**
 * 動画へ音声を多重化するときの共通AACエンコード設定。
 * YouTubeのアップロード推奨（AAC-LC・48kHz・ステレオ384kbps）に合わせる。
 * ビットレート未指定だとFFmpeg既定の約128kbpsになる。
 * FFmpeg内蔵AACは既定で高域を約17kHzで切って実効ビットレートが伸びないため、
 * カットオフを20kHzへ広げる（それでも内容により実効は約285kbpsが上限）。
 */
export const AAC_AUDIO_ARGS: readonly string[] = [
  '-c:a', 'aac',
  '-profile:a', 'aac_low',
  '-b:a', '384k',
  '-ar', '48000',
  '-ac', '2',
  '-cutoff', '20000'
];
