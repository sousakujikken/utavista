// Electron-integrated video export service

import { useElectronAPI } from '../../shared/electronAPI';
import type { ExportOptions, ExportProgress, ExportError } from '../../shared/types';
import type { Engine } from '../engine/Engine';

export class ElectronVideoExporter {
  private electronAPI;
  private engine: Engine | null = null;
  private isExporting = false;
  // Reuse offscreen RenderTexture pool across frame requests
  private exportPoolInitialized = false;
  private exportPoolWidth = 0;
  private exportPoolHeight = 0;
  
  // Event handlers
  private onProgressHandler: ((progress: ExportProgress) => void) | null = null;
  private onCompletedHandler: ((outputPath: string) => void) | null = null;
  private onErrorHandler: ((error: ExportError) => void) | null = null;
  
  // Cleanup functions for event listeners
  private cleanupHandlers: (() => void)[] = [];
  
  constructor() {
    const { electronAPI } = useElectronAPI();
    this.electronAPI = electronAPI;
    
    if (this.electronAPI) {
      this.setupEventListeners();
    }
  }
  
  get isAvailable(): boolean {
    return this.electronAPI !== null;
  }
  
  setEngine(engine: Engine) {
    this.engine = engine;
  }
  
  private setupEventListeners() {
    if (!this.electronAPI) return;
    
    // Export progress
    const progressCleanup = this.electronAPI.onExportProgress((progress) => {
      if (this.onProgressHandler) {
        this.onProgressHandler(progress);
      }
    });
    this.cleanupHandlers.push(progressCleanup);
    
    // Export completed
    const completedCleanup = this.electronAPI.onExportCompleted((outputPath) => {
      this.isExporting = false;
      // Cleanup export resources when export completes
      if (this.engine && this.exportPoolInitialized) {
        try { this.engine.cleanupExportResources(); } catch {}
        this.exportPoolInitialized = false;
      }
      if (this.onCompletedHandler) {
        this.onCompletedHandler(outputPath);
      }
    });
    this.cleanupHandlers.push(completedCleanup);
    
    // Export error
    const errorCleanup = this.electronAPI.onExportError((error) => {
      this.isExporting = false;
      // Cleanup export resources on error to avoid leaks
      if (this.engine && this.exportPoolInitialized) {
        try { this.engine.cleanupExportResources(); } catch {}
        this.exportPoolInitialized = false;
      }
      if (this.onErrorHandler) {
        this.onErrorHandler(error);
      }
    });
    this.cleanupHandlers.push(errorCleanup);
    
    // Frame generation request from main process
    const frameRequestCleanup = this.electronAPI.onExportRequest('generate-frame', async (options) => {
      await this.handleFrameRequest(options);
    });
    this.cleanupHandlers.push(frameRequestCleanup);
  }
  
  private async handleFrameRequest(options: { timeMs: number; width: number; height: number }) {
    if (!this.engine || !this.electronAPI) {
      this.electronAPI?.sendExportReply('frame-error', 'Engine not available');
      return;
    }
    
    try {
      const { timeMs, width, height } = options;

      // Set engine to specific time
      // Avoid redundant pause calls if already paused (prevents extra video/CALayer churn)
      if (this.engine.isRunning) {
        this.engine.pause();
      }
      await this.engine.seek(timeMs);

      // 背景動画はシーク後に停止状態へ（フリーズ）
      await this.engine.freezeBackgroundVideoAt(timeMs);

      // Allow some time for the engine to update (shortened due to explicit freeze)
      await new Promise(resolve => setTimeout(resolve, 20));

      // Initialize or update offscreen RenderTexture pool (avoids renderer resize churn)
      if (!this.exportPoolInitialized || this.exportPoolWidth !== width || this.exportPoolHeight !== height) {
        // Cleanup previous pool if size changed
        if (this.exportPoolInitialized) {
          try { this.engine.cleanupExportResources(); } catch {}
        }
        this.engine.initializeExportResources(width, height);
        this.exportPoolInitialized = true;
        this.exportPoolWidth = width;
        this.exportPoolHeight = height;
      }

      // Capture frame using offscreen pool
      const frameData = this.engine.captureOffscreenFrame(width, height, false);
      
      // Convert Uint8Array to base64
      const base64Data = this.uint8ArrayToBase64(frameData);
      
      // Send frame data back to main process
      this.electronAPI.sendExportReply('frame-ready', base64Data);
      
    } catch (error) {
      console.error('Frame generation failed:', error);
      this.electronAPI?.sendExportReply('frame-error', 
        error instanceof Error ? error.message : 'Unknown frame generation error'
      );
    }
  }
  
  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }
  
  async startExport(options: ExportOptions): Promise<void> {
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }
    
    if (this.isExporting) {
      throw new Error('Export already in progress');
    }
    
    if (!this.engine) {
      throw new Error('Engine not set');
    }
    
    try {
      this.isExporting = true;
      await this.electronAPI.startExport(options);
    } catch (error) {
      this.isExporting = false;
      throw error;
    }
  }
  
  async cancelExport(): Promise<void> {
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }
    
    try {
      await this.electronAPI.cancelExport();
      this.isExporting = false;
      // Cleanup export resources on cancel
      if (this.engine && this.exportPoolInitialized) {
        try { this.engine.cleanupExportResources(); } catch {}
        this.exportPoolInitialized = false;
      }
    } catch (error) {
      console.error('Failed to cancel export:', error);
      throw error;
    }
  }
  
  // Event handler setters
  onProgress(handler: (progress: ExportProgress) => void) {
    this.onProgressHandler = handler;
  }
  
  onCompleted(handler: (outputPath: string) => void) {
    this.onCompletedHandler = handler;
  }
  
  onError(handler: (error: ExportError) => void) {
    this.onErrorHandler = handler;
  }
  
  // Cleanup
  dispose() {
    this.cleanupHandlers.forEach(cleanup => cleanup());
    this.cleanupHandlers = [];
    this.onProgressHandler = null;
    this.onCompletedHandler = null;
    this.onErrorHandler = null;
  }
}

// Global instance
export const electronVideoExporter = new ElectronVideoExporter();
