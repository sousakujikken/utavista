import { LockstepPlugin, PrepareBgFramesOptions, PrepareBgFramesResult, TimelineOptions } from './LockstepPlugin';
import { SystemFFmpegWrapper } from '../SystemFFmpegWrapper';
import * as path from 'path';

export class SystemLockstepPlugin implements LockstepPlugin {
  id = 'system-lockstep';
  name = 'System FFmpeg Lockstep (fallback)';
  private ffmpeg = new SystemFFmpegWrapper();

  async initialize(): Promise<void> {
    await this.ffmpeg.checkFFmpegAvailability();
  }

  async prepareBackgroundFrames(
    options: PrepareBgFramesOptions,
    onProgress?: (progress: { outTimeMs?: number; fps?: number; frame?: number }) => void
  ): Promise<PrepareBgFramesResult> {
    const framesDir = path.join(options.sessionId, 'webcodecs', 'bg_frames');
    const result = await this.ffmpeg.extractFrames({
      inputPath: options.videoPath,
      outputDir: framesDir,
      fps: options.fps,
      width: options.width,
      height: options.height,
      startTimeMs: options.startTimeMs,
      endTimeMs: options.endTimeMs,
      quality: options.quality ?? 2,
      fitMode: options.fitMode ?? 'cover',
    }, (ff) => {
      try {
        onProgress?.({ outTimeMs: ff.outTimeMs, fps: ff.fps, frame: ff.frame });
      } catch {}
    });
    return { framesDir: result.framesDir, count: result.count };
  }

  async computeTimeline(options: TimelineOptions): Promise<number[]> {
    const { fps, startTimeMs, endTimeMs } = options;
    const totalFrames = Math.ceil(((endTimeMs - startTimeMs) / 1000) * fps);
    const timeline: number[] = new Array(totalFrames);
    for (let n = 0; n < totalFrames; n++) {
      const t = startTimeMs + Math.round((n * 1000) / fps);
      timeline[n] = t;
    }
    return timeline;
  }
}
