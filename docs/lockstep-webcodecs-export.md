# ロックステップ方式 WebCodecs エクスポート設計

目的: 背景動画/全体シーンを固定タイムベースで 1 フレームずつ決定論的に進め、PNG/FFmpeg 依存の中間ファイル生成を避けて高速・安定な CFR 動画を書き出す。

## 方針概要
- 固定タイムベース: `t_n = startTime + n * (1000 / fps)` を厳密採用。
- バックプレッシャ: `encoder.encodeQueueSize` を監視、閾値を超えたら短い待機。`flush()` は最後のみ。
- VideoFrame 生成最短経路: 可能なら `new VideoFrame(offscreenCanvas, { timestamp })`。未対応時は `transferToImageBitmap()` 経由で `new VideoFrame(imageBitmap)` を使用し、`imageBitmap.close()` を即時実行。
- I-Frame 制御: `GOP = fps * 2` など 2 秒周期で `keyFrame: true` を明示。
- 非リアルタイム設定: `latencyMode: 'quality'`、CFR はタイムスタンプで固定（μs）。
- 表示はオマケ: プレビューは 2〜3 フレームに 1 回の間引き更新で十分。
- 音声は後段 mux: 正確なサンプル長で最終 mux を FFmpeg で実行（既存ラッパー再利用）。
- Electron 対策: `backgroundThrottling: false`（実装済）、必要に応じて `powerSaveBlocker`。

## コンポーネント構成
- Renderer: `WebCodecsLockstepExporter`
  - 機能: エンジンに `setTimeForVideoCapture()` / `freezeBackgroundVideoAt()` で決定論レンダ、`VideoEncoder` で逐次エンコード、IPC でチャンク送信。
  - 入出力: `start(options)`, `cancel()`, 進捗/完了/エラーコールバック。
  - 互換: WebCodecs 未対応なら既存 PNG+FFmpeg 経路へフォールバック。

- Main: `WebCodecsChunkMuxer`（exportManager/BatchVideoProcessor 配下に実装）
  - 機能: IPC で受け取った Annex‑B H.264（Raw）を `.h264` に追記。完了時に FFmpeg で音声と mux→`.mp4` 出力。
  - API: `export:webcodecs:start`, `export:webcodecs:chunk`, `export:webcodecs:finalize`, `export:webcodecs:cancel`。

## エンコードループ擬似コード
```ts
const fps = options.fps;
const dt_us = Math.round(1_000_000 / fps);
let n = 0;
const N = Math.ceil((endTime - startTime) / 1000 * fps);

const encoder = new VideoEncoder({
  output: chunk => ipc.send('export:webcodecs:chunk', serializeChunk(chunk)),
  error: e => onError(e)
});
encoder.configure({
  codec: 'avc1.640028',       // H.264 High
  width, height, framerate: fps,
  hardwareAcceleration: 'prefer-hardware',
  latencyMode: 'quality'
});

const GOP = fps * 2;
while (n < N && running) {
  const t_ms = startTime + Math.round((n * 1000) / fps);
  engine.setTimeForVideoCapture(t_ms);
  await engine.freezeBackgroundVideoAt(t_ms);
  // ここで Pixi を recordCanvas に描画済みとする

  let vf: VideoFrame;
  if (supportsCanvasVideoFrame) {
    vf = new VideoFrame(recordCanvas as any, { timestamp: n * dt_us });
  } else {
    const bmp = await (recordCanvas as any).transferToImageBitmap();
    vf = new VideoFrame(bmp, { timestamp: n * dt_us });
    bmp.close();
  }
  encoder.encode(vf, { keyFrame: (n % GOP) === 0 });
  vf.close();

  while (encoder.encodeQueueSize > 2) {
    await sleep(0);
  }

  if ((n % 3) === 0) maybeUpdatePreview();
  n++;
}

await encoder.flush();
ipc.invoke('export:webcodecs:finalize', { sessionId, fileName, audioPath, fps, width, height });
```

## IPC 仕様
- `export:webcodecs:start` → { sessionId, fileName, fps, width, height, audioPath? }
- `export:webcodecs:chunk` → { sessionId, data: Uint8Array, isKey: boolean, timestamp: number, duration?: number }
- `export:webcodecs:finalize` → mux 実行、最終パスを返す
- `export:webcodecs:cancel` → 中断と部分ファイル削除

Main 側は `.h264` へ追記し、`ffmpeg -f h264 -r <fps> -i in.h264 -i audio -c:v copy|-c:v libx264 -c:a aac -shortest out.mp4` で mux。色空間は sRGB→BT.709 前提（必要に応じて `-colorspace bt709` など明示）。

## 実装ステップ
1. Renderer: `WebCodecsLockstepExporter` 追加（エンコードループ/バックプレッシャ/Keyframe制御/プレビュー間引き）。
2. Main: チャンク受信と追記、finalize で FFmpeg mux。TempSession 再利用。
3. Engine: 既存の `freezeBackgroundVideoAt` を再利用。OffscreenCanvas 経路が使えるなら導入（将来）。
4. API 統合: 既存エクスポートUIから方式選択（PNG+FFmpeg / WebCodecs lockstep）。
5. 検証: 長尺・高解像度でのメモリ/速度、音声同期、キーフレーム間隔の調整。

## 落とし穴と対策
- flush の多用 → 避ける。最後だけ。
- close 漏れ → `VideoFrame`/`ImageBitmap` は都度 `close()`。
- 背面/最小化での停止 → `backgroundThrottling:false`（実装済）。必要なら `powerSaveBlocker`。
- WebCodecs 非対応 → 自動的に既存経路へフォールバック。

---
最小実装では、`renderer` 側は既存 Pixi canvas をソースに `new VideoFrame(canvas)` を試し、未対応時のみ `transferToImageBitmap()` にフォールバックします。オフスクリーン専用 Pixi/Canvas への移行は第2段階で対応します。

