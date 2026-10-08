// 透過背景の書き出し（ProRes 4444 / .mov）。
// WebCodecsのH.264はアルファを持てないため、各フレームをRGBAで読み出してメインプロセスのFFmpegへ渡す。

import type { Engine } from '../../engine/Engine';
import { getElectronAPI } from '../../../shared/electronAPI';

export interface TransparentExportOptions {
  fps: number;
  width: number;
  height: number;
  startTime: number;
  endTime: number;
  outputPath: string;
  audioPath?: string;
}

export interface TransparentExportProgress {
  overall: number;
  step: number;
  steps: number;
  stepName: string;
  stepProgress: number;
  etaSeconds?: number;
}

export class TransparentVideoExporter {
  private engine: Engine;
  private electronAPI = getElectronAPI();
  private cancelled = false;
  private activeSessionId: string | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  async start(
    options: TransparentExportOptions,
    onProgress?: (progress: TransparentExportProgress) => void
  ): Promise<string> {
    const { fps, width, height, startTime, endTime } = options;
    const totalFrames = Math.ceil((endTime - startTime) / 1000 * fps);
    if (totalFrames <= 0) throw new Error('書き出し範囲が空です');

    this.cancelled = false;
    const sessionId = crypto.randomUUID();
    this.activeSessionId = sessionId;

    if ((this.engine as any).isRunning) {
      try { (this.engine as any).pause(); } catch {}
    }

    // WebGLキャンバスを2Dキャンバスへ描き写し、非プリマルチプライのRGBAとして読み出す。
    const readback = document.createElement('canvas');
    readback.width = width;
    readback.height = height;
    const context = readback.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('フレーム読み出し用のキャンバスを作成できません');
    const sourceCanvas = this.engine.app.view as HTMLCanvasElement;

    await this.electronAPI.alphaExportStart({
      sessionId,
      width,
      height,
      fps,
      totalFrames,
      outputPath: options.outputPath,
      audioPath: options.audioPath,
      audioStartMs: startTime
    });

    try {
      const renderStart = Date.now();
      for (let frame = 0; frame < totalFrames; frame++) {
        if (this.cancelled) throw new Error('Export cancelled');

        this.engine.setTimeForVideoCapture(startTime + Math.round((frame * 1000) / fps));
        this.engine.app.render();
        context.clearRect(0, 0, width, height);
        context.drawImage(sourceCanvas, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        await this.electronAPI.alphaExportFrame({
          sessionId,
          data: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
        });

        if (onProgress) {
          const stepProgress = (frame + 1) / totalFrames;
          const elapsed = (Date.now() - renderStart) / 1000;
          onProgress({
            overall: stepProgress * 0.95,
            step: 1,
            steps: 2,
            stepName: 'ProRes 4444 エンコード',
            stepProgress,
            etaSeconds: Math.max(0, elapsed * (1 - stepProgress) / stepProgress)
          });
        }
      }

      onProgress?.({ overall: 0.95, step: 2, steps: 2, stepName: '仕上げ', stepProgress: 0 });
      const outPath = await this.electronAPI.alphaExportFinalize({ sessionId });
      onProgress?.({ overall: 1, step: 2, steps: 2, stepName: '仕上げ', stepProgress: 1 });
      return outPath;
    } catch (error) {
      await this.electronAPI.alphaExportCancel({ sessionId }).catch(() => undefined);
      throw error;
    } finally {
      if (this.activeSessionId === sessionId) this.activeSessionId = null;
    }
  }

  cancel(): void {
    this.cancelled = true;
    if (this.activeSessionId) {
      void this.electronAPI.alphaExportCancel({ sessionId: this.activeSessionId }).catch(() => undefined);
    }
  }
}
