// エレクトロン専用 Type-safe APIラッパー

import type { 
  ProjectData, 
  MediaFileInfo, 
  ExportOptions, 
  ExportProgress, 
  ExportError 
} from './types.js';

export interface ElectronAPI {
  // File management
  saveProject(projectData: ProjectData, options?: { saveAs?: boolean }): Promise<string>;
  loadProject(): Promise<ProjectData>;
  consumePendingProject(): Promise<ProjectData | null>;
  onProjectOpenRequested(callback: () => void): () => void;
  /** 終了前の確認用。handler は未保存の変更があれば true を返す。 */
  onUnsavedChangesQuery(handler: () => boolean | Promise<boolean>): () => void;
  /** 「保存して終了」用。handler は保存できたら true、キャンセル・失敗なら false を返す。 */
  onSaveBeforeClose(handler: () => Promise<boolean>): () => void;
  selectMedia(type: 'video' | 'audio' | 'image'): Promise<MediaFileInfo>;
  exportSrt(content: string, defaultFileName?: string): Promise<string | null>;
  exportPng(imageData: Uint8Array, defaultFileName?: string): Promise<string | null>;
  
  // Video export (legacy)
  startExport(options: ExportOptions): Promise<void>;
  cancelExport(): Promise<void>;
  
  // Video export save dialog
  showSaveDialogForVideo(defaultFileName: string): Promise<string | null>;
  showSaveDialogForAlphaVideo(defaultFileName: string): Promise<string | null>;

  // 透過背景の書き出し（ProRes 4444）。dataは幅×高さ×4のRGBA（非プリマルチプライ）
  alphaExportStart(options: {
    sessionId: string;
    width: number;
    height: number;
    fps: number;
    totalFrames: number;
    outputPath: string;
    audioPath?: string;
    audioStartMs?: number;
  }): Promise<void>;
  alphaExportFrame(payload: { sessionId: string; data: Uint8Array }): Promise<void>;
  alphaExportFinalize(options: { sessionId: string }): Promise<string>;
  alphaExportCancel(options: { sessionId: string }): Promise<void>;
  
  // Video metadata
  getVideoMetadata(videoPath: string): Promise<{
    width: number;
    height: number;
    duration: number;
    frameRate: number;
    frameCount: number;
  }>;
  
  // Seek and Snap Video Export (new)
  createTempSession(sessionId: string): Promise<string>;
  saveFrameImage(sessionId: string, frameName: string, frameData: Uint8Array, width?: number, height?: number): Promise<string>;
  createBatchVideo(options: {
    sessionId: string;
    batchIndex: number;
    startFrame: number;
    endFrame: number;
    fps: number;
    width: number;
    height: number;
    videoQuality: 'low' | 'medium' | 'high' | 'highest';
  }): Promise<string>;
  composeFinalVideo(options: {
    sessionId: string;
    batchVideos: string[];
    fileName: string;
    includeMusicTrack?: boolean;
    audioPath?: string;
    audioStartTime?: number;
    audioEndTime?: number;
    outputPath?: string;
    backgroundVideoPath?: string;
    backgroundVideoLoop?: boolean;
    totalDurationMs?: number;
    outputWidth?: number;
    outputHeight?: number;
  }): Promise<string>;
  cleanupTempSession(sessionId: string): Promise<void>;
  getStorageStats(sessionId?: string): Promise<{
    totalSpace: number;
    freeSpace: number;
    usedBySession: number;
    usagePercent: number;
  }>;

  // WebCodecs lockstep export
  webcodecsStart(options: {
    sessionId: string;
    fileName: string;
    fps: number;
    width: number;
    height: number;
    audioPath?: string;
    audioStartMs?: number; // 書き出し範囲の開始時刻（音声の切り出し位置）
    outputPath?: string; // optional full path; otherwise default behavior
    totalFrames?: number;
    totalDurationMs?: number;
  }): Promise<void>;
  webcodecsSendChunk(payload: {
    sessionId: string;
    data: Uint8Array; // EncodedVideoChunk data
    isKey: boolean;
    timestamp: number; // μs
    duration?: number; // μs
  }): Promise<void>;
  webcodecsFinalize(options: { sessionId: string }): Promise<string>; // returns output path
  webcodecsCancel(options: { sessionId: string }): Promise<void>;
  webcodecsGetTimeline(options: { fps: number; startTimeMs: number; endTimeMs: number }): Promise<number[]>;

  // Background frames extraction for lockstep
  webcodecsExtractBgFrames(options: {
    sessionId: string;
    videoPath: string;
    fps: number;
    width: number;
    height: number;
    startTimeMs: number;
    endTimeMs: number;
    quality?: number; // 2(best)-31(worst) for JPEG
    fitMode?: 'cover' | 'contain' | 'stretch';
  }): Promise<{ framesDir: string; count: number }>;
  
  // Event listeners
  onExportProgress(callback: (progress: ExportProgress) => void): () => void;
  onExportCompleted(callback: (outputPath: string) => void): () => void;
  onExportError(callback: (error: ExportError) => void): () => void;
  onExportRequest(
    channel: 'generate-frame',
    callback: (options: { timeMs: number; width: number; height: number }) => void
  ): () => void;
  sendExportReply(channel: 'frame-ready' | 'frame-error', data: string): void;
  
  // App utilities
  getAppVersion(): Promise<string>;
  getAppPath(name: string): Promise<string>;
  platform: string;
  openDevTools(): void;
}

// Electron専用アプリケーションのため、条件分岐を除去

// Get Electron API（エレクトロン環境前提）
export function getElectronAPI(): ElectronAPI {
  const api = (window as any).electronAPI;
  if (!api) {
    throw new Error('ElectronAPI not available. This application requires Electron environment.');
  }
  return api;
}

// エレクトロンAPIを取得（簡素化版）
export function useElectronAPI(): ElectronAPI {
  return getElectronAPI();
}
