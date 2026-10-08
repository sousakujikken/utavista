import * as electron from 'electron';
const { contextBridge, ipcRenderer } = electron;
import type { 
  ProjectData, 
  MediaFileInfo, 
  ExportOptions, 
  ExportProgress, 
  ExportError,
  FontInfo
} from '../shared/types';

// Secure API exposure to renderer process
const electronAPI = {
  // File management
  saveProject: (projectData: ProjectData, options?: { saveAs?: boolean }): Promise<string> =>
    ipcRenderer.invoke('file:save-project', projectData, options),
  
  loadProject: (): Promise<ProjectData> => 
    ipcRenderer.invoke('file:load-project'),

  consumePendingProject: (): Promise<ProjectData | null> =>
    ipcRenderer.invoke('file:consume-pending-project'),

  onProjectOpenRequested: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('file:open-project-requested', listener);
    return () => ipcRenderer.removeListener('file:open-project-requested', listener);
  },

  // 終了前の確認: メインプロセスからの問い合わせに、未保存かどうか／保存できたかを返す。
  onUnsavedChangesQuery: (handler: () => boolean | Promise<boolean>): (() => void) => {
    const listener = async (_event: unknown, requestId: number) => {
      let dirty = false;
      try { dirty = await handler(); } catch { dirty = false; }
      ipcRenderer.send('app:unsaved-result', requestId, { dirty });
    };
    ipcRenderer.on('app:query-unsaved', listener);
    return () => ipcRenderer.removeListener('app:query-unsaved', listener);
  },

  onSaveBeforeClose: (handler: () => Promise<boolean>): (() => void) => {
    const listener = async (_event: unknown, requestId: number) => {
      let saved = false;
      try { saved = await handler(); } catch { saved = false; }
      ipcRenderer.send('app:save-before-close-result', requestId, saved);
    };
    ipcRenderer.on('app:save-before-close', listener);
    return () => ipcRenderer.removeListener('app:save-before-close', listener);
  },

  selectMedia: (type: 'video' | 'audio' | 'image'): Promise<MediaFileInfo> =>
    ipcRenderer.invoke('file:select-media', type),

  exportSrt: (content: string, defaultFileName?: string): Promise<string | null> =>
    ipcRenderer.invoke('file:export-srt', content, defaultFileName),

  exportPng: (imageData: Uint8Array, defaultFileName?: string): Promise<string | null> =>
    ipcRenderer.invoke('file:export-png', imageData, defaultFileName),
  
  // Video export (legacy)
  startExport: (options: ExportOptions): Promise<void> => 
    ipcRenderer.invoke('export:start', options),
  
  cancelExport: (): Promise<void> => 
    ipcRenderer.invoke('export:cancel'),
  
  // Video export save dialog
  showSaveDialogForVideo: (defaultFileName: string): Promise<string | null> =>
    ipcRenderer.invoke('export:showSaveDialogForVideo', defaultFileName),
  showSaveDialogForAlphaVideo: (defaultFileName: string): Promise<string | null> =>
    ipcRenderer.invoke('export:showSaveDialogForAlphaVideo', defaultFileName),

  // 透過背景の書き出し（ProRes 4444）
  alphaExportStart: (options: {
    sessionId: string;
    width: number;
    height: number;
    fps: number;
    totalFrames: number;
    outputPath: string;
    audioPath?: string;
    audioStartMs?: number;
  }): Promise<void> => ipcRenderer.invoke('export:alpha:start', options),
  alphaExportFrame: (payload: { sessionId: string; data: Uint8Array }): Promise<void> =>
    ipcRenderer.invoke('export:alpha:frame', payload),
  alphaExportFinalize: (options: { sessionId: string }): Promise<string> =>
    ipcRenderer.invoke('export:alpha:finalize', options),
  alphaExportCancel: (options: { sessionId: string }): Promise<void> =>
    ipcRenderer.invoke('export:alpha:cancel', options),

  // Seek and Snap Video Export (new)
  createTempSession: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke('export:createTempSession', sessionId),
  
  saveFrameImage: (sessionId: string, frameName: string, frameData: Uint8Array, width?: number, height?: number): Promise<string> =>
    ipcRenderer.invoke('export:saveFrameImage', sessionId, frameName, frameData, width, height),
  
  createBatchVideo: (options: {
    sessionId: string;
    batchIndex: number;
    startFrame: number;
    endFrame: number;
    fps: number;
    width: number;
    height: number;
    videoQuality: 'low' | 'medium' | 'high' | 'highest';
  }): Promise<string> =>
    ipcRenderer.invoke('export:createBatchVideo', options),
  
  composeFinalVideo: (options: {
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
  }): Promise<string> =>
    ipcRenderer.invoke('export:composeFinalVideo', options),
  
  cleanupTempSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('export:cleanupTempSession', sessionId),
  
  getStorageStats: (sessionId?: string): Promise<{
    totalSpace: number;
    freeSpace: number;
    usedBySession: number;
    usagePercent: number;
  }> =>
    ipcRenderer.invoke('export:getStorageStats', sessionId),

  // WebCodecs lockstep export
  webcodecsStart: (options: {
    sessionId: string;
    fileName: string;
    fps: number;
    width: number;
    height: number;
    audioPath?: string;
    audioStartMs?: number;
    outputPath?: string;
    totalFrames?: number;
    totalDurationMs?: number;
  }): Promise<void> => ipcRenderer.invoke('export:webcodecs:start', options),

  webcodecsSendChunk: (payload: {
    sessionId: string;
    data: Uint8Array;
    isKey: boolean;
    timestamp: number;
    duration?: number;
  }): Promise<void> => ipcRenderer.invoke('export:webcodecs:chunk', payload),

  webcodecsFinalize: (options: { sessionId: string }): Promise<string> =>
    ipcRenderer.invoke('export:webcodecs:finalize', options),

  webcodecsCancel: (options: { sessionId: string }): Promise<void> =>
    ipcRenderer.invoke('export:webcodecs:cancel', options),

  // Optional: compute deterministic lockstep timeline in main/native plugin
  webcodecsGetTimeline: (options: { fps: number; startTimeMs: number; endTimeMs: number }): Promise<number[]> =>
    ipcRenderer.invoke('export:webcodecs:timeline', options),

  webcodecsExtractBgFrames: (options: {
    sessionId: string;
    videoPath: string;
    fps: number;
    width: number;
    height: number;
    startTimeMs: number;
    endTimeMs: number;
    quality?: number;
    fitMode?: 'cover' | 'contain' | 'stretch';
  }): Promise<{ framesDir: string; count: number }> =>
    ipcRenderer.invoke('export:webcodecs:extract-bg-frames', options),
  
  // Event listeners for export process
  onExportProgress: (callback: (progress: ExportProgress) => void) => {
    const subscription = (event: any, progress: ExportProgress) => callback(progress);
    ipcRenderer.on('export:progress', subscription);
    return () => ipcRenderer.removeListener('export:progress', subscription);
  },
  
  onExportCompleted: (callback: (outputPath: string) => void) => {
    const subscription = (event: any, outputPath: string) => callback(outputPath);
    ipcRenderer.on('export:completed', subscription);
    return () => ipcRenderer.removeListener('export:completed', subscription);
  },
  
  onExportError: (callback: (error: ExportError) => void) => {
    const subscription = (event: any, error: ExportError) => callback(error);
    ipcRenderer.on('export:error', subscription);
    return () => ipcRenderer.removeListener('export:error', subscription);
  },
  
  // Frame generation for export (renderer -> main)
  onExportRequest: (
    channel: 'generate-frame', 
    callback: (options: { timeMs: number; width: number; height: number }) => void
  ) => {
    const subscription = (event: any, options: any) => callback(options);
    ipcRenderer.on(`export:${channel}`, subscription);
    return () => ipcRenderer.removeListener(`export:${channel}`, subscription);
  },
  
  sendExportReply: (channel: 'frame-ready' | 'frame-error', data: string) => {
    ipcRenderer.send(`export:${channel}`, data);
  },
  
  // App utilities
  getAppVersion: (): Promise<string> => 
    ipcRenderer.invoke('app:get-version'),
  
  getAppPath: (name: string): Promise<string> => 
    ipcRenderer.invoke('app:get-path', name),
  
  // Font management
  getSystemFonts: (): Promise<FontInfo[]> => 
    ipcRenderer.invoke('font:get-system-fonts'),
  
  // Persistence
  persistence: {
    saveAutoSave: (data: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:save-autosave', data),
    
    loadAutoSave: (): Promise<{ success: boolean; data?: any; error?: string }> =>
      ipcRenderer.invoke('persistence:load-autosave'),
    
    hasAutoSave: (): Promise<boolean> =>
      ipcRenderer.invoke('persistence:has-autosave'),
    
    deleteAutoSave: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:delete-autosave'),

    addRecentAudio: (fileName: string, filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:add-recent-audio', fileName, filePath),

    addRecentBackgroundVideo: (fileName: string, filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:add-recent-background-video', fileName, filePath),

    getRecentAudio: (): Promise<{ success: boolean; files?: any[]; error?: string }> =>
      ipcRenderer.invoke('persistence:get-recent-audio'),

    getRecentBackgroundVideo: (): Promise<{ success: boolean; files?: any[]; error?: string }> =>
      ipcRenderer.invoke('persistence:get-recent-background-video'),
    
    saveFontBlacklist: (blacklist: any[]): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('persistence:save-font-blacklist', blacklist),
    
    loadFontBlacklist: (): Promise<{ success: boolean; data?: any; error?: string }> =>
      ipcRenderer.invoke('persistence:load-font-blacklist'),
  },
  
  // File system utilities
  checkFileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:check-file-exists', filePath),
  
  readFileAsURL: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file-as-url', filePath),
  
  // テンプレートレジストリ関連のAPI
  template: {
    readRegistry: (): Promise<string> =>
      ipcRenderer.invoke('template:read-registry'),
    
    writeRegistry: (content: string): Promise<boolean> =>
      ipcRenderer.invoke('template:write-registry', content),
    
    readFile: (fileName: string): Promise<string> =>
      ipcRenderer.invoke('template:read-file', fileName),
    
    listFiles: (): Promise<string[]> =>
      ipcRenderer.invoke('template:list-files')
  },
  
  // Platform info
  platform: process.platform,
  
  // Development utilities
  openDevTools: () => {
    if (process.env.NODE_ENV === 'development') {
      ipcRenderer.send('dev:open-devtools');
    }
  },
  
  // システム情報取得
  getMemoryInfo: (): Promise<any> => 
    ipcRenderer.invoke('system:getMemoryInfo'),
  
  // GPU プロセス デバッグ
  debugGPUProcesses: (): Promise<any> =>
    ipcRenderer.invoke('system:debugGPUProcesses')
};

// Type declaration for renderer process
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
