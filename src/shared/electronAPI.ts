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
  saveProject(projectData: ProjectData): Promise<string>;
  loadProject(): Promise<ProjectData>;
  selectMedia(type: 'video' | 'audio'): Promise<MediaFileInfo>;
  
  // Video export (legacy)
  startExport(options: ExportOptions): Promise<void>;
  cancelExport(): Promise<void>;
  
  // Video export save dialog
  showSaveDialogForVideo(defaultFileName: string): Promise<string | null>;
  
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
