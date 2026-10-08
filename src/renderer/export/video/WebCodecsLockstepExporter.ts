// Lockstep WebCodecs exporter (deterministic CFR, background-friendly)

import type { Engine } from '../../engine/Engine';
import { getElectronAPI } from '../../../shared/electronAPI';
import { findSupportedH264Config } from './H264EncoderConfig';

export interface LockstepExportOptions {
  sessionId?: string;
  fileName: string;
  fps: number;
  width: number;
  height: number;
  startTime: number;
  endTime: number;
  includeDebugVisuals?: boolean; // reserved
  audioPath?: string;
  outputPath?: string;
}

export class WebCodecsLockstepExporter {
  private engine: Engine;
  private electronAPI = getElectronAPI();
  private cancelled = false;
  private encoder: any = null;
  private encoderError: Error | null = null;
  private pendingChunkWrites = new Set<Promise<void>>();
  private activeSessionId: string | null = null;
  private supportsCanvasVideoFrame = false;

  constructor(engine: Engine) {
    this.engine = engine;
    this.supportsCanvasVideoFrame = typeof (window as any).VideoFrame === 'function';
  }

  get isSupported(): boolean {
    return typeof (window as any).VideoEncoder === 'function';
  }

  async start(options: LockstepExportOptions, onProgress?: (progress: number | {
    overall: number;
    step: number;
    steps: number;
    stepName: string;
    stepProgress: number;
    etaSeconds?: number;
  }) => void): Promise<string> {
    if (!this.isSupported) {
      throw new Error('WebCodecs is not supported in this environment');
    }

    this.cancelled = false;
    this.encoderError = null;
    this.pendingChunkWrites.clear();
    const sessionId = options.sessionId || crypto.randomUUID();
    this.activeSessionId = sessionId;
    const { fps, width, height, startTime, endTime } = options;

    // Ensure engine is paused to prevent any runtime playback side-effects
    if ((this.engine as any).isRunning) {
      try { (this.engine as any).pause(); } catch {}
    }

    const totalFrames = Math.ceil((endTime - startTime) / 1000 * fps);
    // Prepare temp session and main muxer
    await this.electronAPI.createTempSession(sessionId);
    await this.electronAPI.webcodecsStart({
      sessionId,
      fileName: options.fileName,
      fps,
      width,
      height,
      audioPath: options.audioPath,
      audioStartMs: startTime,
      outputPath: options.outputPath,
      totalFrames,
      totalDurationMs: (endTime - startTime)
    });
    const dt_us = Math.round(1_000_000 / fps);

    // Configure encoder
    const encoder = new (window as any).VideoEncoder({
      output: (chunk: any) => {
        const write = this.handleChunk(sessionId, chunk)
          .catch(error => {
            this.encoderError = error instanceof Error ? error : new Error(String(error));
          })
          .finally(() => this.pendingChunkWrites.delete(write));
        this.pendingChunkWrites.add(write);
      },
      error: (error: unknown) => {
        this.encoderError = error instanceof Error ? error : new Error(String(error));
        console.error('[WebCodecs] encoder error:', error);
      }
    });
    this.encoder = encoder;
    let unsubscribe: (() => void) | undefined;

    try {

    // Hardware first (Level 4.0 → 5.0), then software fallback
    const encoderConfig = await findSupportedH264Config(width, height, fps);
    if (encoderConfig) {
      encoder.configure(encoderConfig);
    } else {
      // Provide a helpful error for common square resolutions like 1920x1920
      const coded = width * height;
      const hint = (coded > 2097152)
        ? '解像度が大きすぎます。1:1 の場合は 1440x1440 以下にするか、長辺解像度を下げてください。'
        : '別の解像度やフレームレートを試してください。';
      throw new Error(`この環境では指定のH.264設定がサポートされません ( ${width}x${height}@${fps} ). ${hint}`);
    }

    const canvas = this.engine.app?.view as HTMLCanvasElement | undefined;
    if (!canvas) throw new Error('Engine canvas not available');

    // Bridge progress from main process (bg prep + mux)
    unsubscribe = this.electronAPI.onExportProgress((evt: any) => {
      try {
        if (!onProgress) return;
        if (!evt || evt.sessionId !== sessionId) return; // Filter by session
        // Background preparation (step 1)
        if (evt.stepIndex === 1) {
          const stepProgress = typeof evt.stepProgress === 'number' ? evt.stepProgress : 0;
          const overall = typeof evt.overallProgress === 'number' ? evt.overallProgress : 5 + stepProgress * 5;
          onProgress({
            overall: overall / 100,
            step: 1,
            steps: 3,
            stepName: '背景準備',
            stepProgress,
            etaSeconds: typeof evt.timeRemaining === 'number' ? Math.round(evt.timeRemaining / 1000) : undefined
          });
        }
        // Final mux (step 3)
        if (evt.stepIndex === 3) {
          const stepProgress = typeof evt.stepProgress === 'number' ? evt.stepProgress : 0;
          const overall = typeof evt.overallProgress === 'number' ? evt.overallProgress : 90 + stepProgress * 10;
          onProgress({
            overall: overall / 100,
            step: 3,
            steps: 3,
            stepName: '最終mux',
            stepProgress,
            etaSeconds: typeof evt.timeRemaining === 'number' ? Math.round(evt.timeRemaining / 1000) : undefined
          });
        }
      } catch {}
    });

    // Prepare background image sequence if a background video is present
    let bgFramesDir: string | null = null;
    try {
      const { electronMediaManager } = await import('../../services/ElectronMediaManager');
      const bgVideoPath = electronMediaManager.getCurrentVideoFilePath();
      if (bgVideoPath) {
        // 可能であれば現在の背景フィットモードを取得（デフォルト: cover）
        let fitMode: 'cover' | 'contain' | 'stretch' = 'cover';
        try {
          const cfg = (this.engine as any).getBackgroundConfig?.();
          if (cfg?.fitMode) fitMode = cfg.fitMode;
        } catch {}

        const prep = await this.electronAPI.webcodecsExtractBgFrames({
          sessionId,
          videoPath: bgVideoPath,
          fps,
          width,
          height,
          startTimeMs: startTime,
          endTimeMs: endTime,
          quality: 2,
          fitMode,
        });
        bgFramesDir = prep.framesDir;
      }
    } catch (e) {
      console.warn('Background frames preparation skipped:', e);
    }

    // Try to get deterministic timeline from main/native plugin; fallback to local calculation
    let timeline: number[] | null = null;
    try {
      timeline = await this.electronAPI.webcodecsGetTimeline({ fps, startTimeMs: startTime, endTimeMs: endTime });
      if (!Array.isArray(timeline) || timeline.length !== totalFrames) timeline = null;
    } catch {}

    const GOP = fps * 2;
    const step2Start = Date.now();
    for (let n = 0; n < totalFrames; n++) {
      if (this.cancelled) throw new Error('Export cancelled');

      const t_ms = timeline ? timeline[n] : (startTime + Math.round((n * 1000) / fps));
      // Deterministic scene update
      this.engine.setTimeForVideoCapture(t_ms);
      if (bgFramesDir) {
        const framePath = `${bgFramesDir}/bg_${n.toString().padStart(6, '0')}.jpg`;
        await this.engine.setBackgroundImageForCapture(framePath);
      } else {
        // fallback: use HTMLVideoElement path
        await this.engine.freezeBackgroundVideoAt(t_ms);
      }

      // Ensure final render
      this.engine.app.render();

      // Create VideoFrame and ensure it is closed even if encode throws
      let vf: any = null;
      let bmp: any = null;
      try {
        try {
          vf = new (window as any).VideoFrame(canvas as any, { timestamp: n * dt_us });
        } catch {
          // Fallback: ImageBitmap path
          bmp = await (canvas as any).transferToImageBitmap();
          vf = new (window as any).VideoFrame(bmp, { timestamp: n * dt_us });
        }
        this.assertEncoderReady(encoder);
        encoder.encode(vf, { keyFrame: (n % GOP) === 0 });
      } finally {
        try { vf?.close?.(); } catch {}
        try { bmp?.close?.(); } catch {}
      }

      // Backpressure: avoid frequent flush; just yield if queue is large
      while (!this.cancelled && encoder.encodeQueueSize > 2) {
        this.assertEncoderReady(encoder);
        await new Promise(r => setTimeout(r, 0));
      }

      if (onProgress) {
        const stepProgress = (n + 1) / totalFrames;
        const elapsed = (Date.now() - step2Start) / 1000;
        const eta = stepProgress > 0 ? Math.max(0, elapsed * (1 - stepProgress) / stepProgress) : undefined;
        // Map step2 to overall: 10% -> 90%
        const overall = 0.10 + stepProgress * 0.80;
        onProgress({
          overall,
          step: 2,
          steps: 3,
          stepName: 'メイン処理',
          stepProgress,
          etaSeconds: eta
        });
      }
    }

    this.assertEncoderReady(encoder);
    await encoder.flush();
    await Promise.all(Array.from(this.pendingChunkWrites));
    this.assertEncoderReady(encoder);
    const outPath = await this.electronAPI.webcodecsFinalize({ sessionId });
    return outPath;
    } catch (error) {
      try { await this.electronAPI.webcodecsCancel({ sessionId }); } catch {}
      throw error;
    } finally {
      try { unsubscribe?.(); } catch {}
      await Promise.allSettled(Array.from(this.pendingChunkWrites));
      try {
        if (encoder.state !== 'closed') encoder.close();
      } catch {}
      if (this.encoder === encoder) this.encoder = null;
      if (this.activeSessionId === sessionId) this.activeSessionId = null;
    }
  }

  cancel() {
    this.cancelled = true;
    // encode中にcodecを閉じると次フレームとの競合になるため、ループ側で安全に停止する。
    if (this.activeSessionId) {
      void this.electronAPI.webcodecsCancel({ sessionId: this.activeSessionId }).catch(() => undefined);
    }
  }

  private assertEncoderReady(encoder: any): void {
    if (this.cancelled) throw new Error('Export cancelled');
    if (this.encoderError) throw this.encoderError;
    if (encoder.state !== 'configured') {
      throw new Error(`VideoEncoder stopped unexpectedly (state: ${encoder.state})`);
    }
  }

  private async handleChunk(sessionId: string, chunk: any) {
    // EncodedVideoChunk
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    await this.electronAPI.webcodecsSendChunk({
      sessionId,
      data,
      isKey: chunk.type === 'key',
      timestamp: chunk.timestamp ?? 0,
      duration: chunk.duration ?? undefined
    });
  }
}
