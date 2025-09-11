export interface PrepareBgFramesOptions {
  sessionId: string;
  videoPath: string;
  fps: number;
  width: number;
  height: number;
  startTimeMs: number;
  endTimeMs: number;
  quality?: number; // 1..5 smaller is higher quality
  fitMode?: 'cover' | 'contain' | 'stretch';
}

export interface PrepareBgFramesResult {
  framesDir: string;
  count: number;
}

export interface TimelineOptions {
  fps: number;
  startTimeMs: number;
  endTimeMs: number;
}

export interface LockstepPlugin {
  id: string;
  name: string;
  initialize(): Promise<void>;
  prepareBackgroundFrames(
    options: PrepareBgFramesOptions,
    onProgress?: (progress: { outTimeMs?: number; fps?: number; frame?: number }) => void
  ): Promise<PrepareBgFramesResult>;
  computeTimeline(options: TimelineOptions): Promise<number[]>; // array of timestamps(ms), length = total frames
}
