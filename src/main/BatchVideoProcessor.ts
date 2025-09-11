/**
 * BatchVideoProcessor - 統合バッチ動画処理システム
 * 
 * SystemFFmpegWrapperとTempFileManagerを統合し、
 * シークアンドスナップ方式での高効率動画処理を提供
 */

import { SystemFFmpegWrapper, BatchVideoOptions, ComposeFinalVideoOptions, FFmpegProgress } from './SystemFFmpegWrapper';
import { TempFileManager, TempSession, StorageStats } from './TempFileManager';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fsSync from 'fs';
import * as os from 'os';

export interface VideoExportRequest {
  sessionId: string;
  options: {
    aspectRatio: string;
    orientation: string;
    quality: string;
    videoQuality?: string;
    fps: number;
    fileName: string;
    startTime: number;
    endTime: number;
    includeDebugVisuals?: boolean;
    includeMusicTrack?: boolean;
    audioPath?: string;
  };
}

export interface ProcessingProgress {
  phase: 'preparing' | 'capturing' | 'batch_creation' | 'composition' | 'finalizing';
  overallProgress: number;
  currentFrame?: number;
  totalFrames?: number;
  currentBatch?: number;
  totalBatches?: number;
  timeRemaining?: number;
  memoryUsage?: number;
  tempStorageUsed?: number;
  message?: string;
  ffmpegProgress?: FFmpegProgress;
  // Extended fields for step-wise progress
  sessionId?: string;
  stepIndex?: number; // 1-based
  stepCount?: number;
  stepName?: string;
  stepProgress?: number; // 0..1 within step
}

/**
 * BatchVideoProcessor
 * 
 * 動画エクスポート処理の中央制御クラス
 * メインプロセスでの高性能バッチ処理を管理
 */
export class BatchVideoProcessor {
  private ffmpegWrapper: SystemFFmpegWrapper;
  private tempFileManager: TempFileManager;
  private processingQueue: Map<string, VideoExportRequest> = new Map();
  private isProcessing = false;
  // WebCodecs lockstep session state
  private wcWriters: Map<string, import('fs').WriteStream> = new Map();
  private wcMeta: Map<string, { fps: number; width: number; height: number; fileName: string; audioPath?: string; outputPath?: string; h264Path: string; totalFrames?: number; totalDurationMs?: number } > = new Map();
  private _muxStartTimes?: Map<string, number>;
  // Lockstep plugin (native or system fallback)
  private lockstepPlugin = require('./plugins/PluginRegistry').getLockstepPlugin();
  
  constructor() {
    this.ffmpegWrapper = new SystemFFmpegWrapper();
    this.tempFileManager = new TempFileManager();
  }
  
  /**
   * 初期化とシステムチェック
   */
  async initialize(): Promise<boolean> {
    try {
      const ffmpegAvailable = await this.ffmpegWrapper.checkFFmpegAvailability();
      try { await this.lockstepPlugin.initialize(); } catch (e) { console.warn('Lockstep plugin init failed; using fallback:', e); }
      
      if (!ffmpegAvailable) {
        console.error('FFmpeg is not available on this system');
        return false;
      }
      
      console.log('BatchVideoProcessor initialized successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to initialize BatchVideoProcessor:', error);
      return false;
    }
  }

  // ==============================
  // WebCodecs lockstep export API
  // ==============================

  async webcodecsStart(options: { sessionId: string; fileName: string; fps: number; width: number; height: number; audioPath?: string; outputPath?: string; totalFrames?: number; totalDurationMs?: number }): Promise<void> {
    const { sessionId, fileName, fps, width, height, audioPath, outputPath, totalFrames, totalDurationMs } = options;
    const session = this.tempFileManager.getTempSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(session.sessionDir, 'webcodecs');
    await (await import('fs/promises')).mkdir(dir, { recursive: true });
    const h264Path = path.join(dir, 'video.h264');
    const ws = fs.createWriteStream(h264Path);
    this.wcWriters.set(sessionId, ws);
    this.wcMeta.set(sessionId, { fps, width, height, fileName, audioPath, outputPath, h264Path, totalFrames, totalDurationMs });
  }

  async webcodecsAppendChunk(payload: { sessionId: string; data: Uint8Array; isKey: boolean; timestamp: number; duration?: number }): Promise<void> {
    const { sessionId, data } = payload;
    const ws = this.wcWriters.get(sessionId);
    if (!ws) throw new Error(`WebCodecs writer not initialized for session ${sessionId}`);
    return new Promise((resolve, reject) => {
      ws.write(Buffer.from(data), (err) => err ? reject(err) : resolve());
    });
  }

  async webcodecsFinalize(options: { sessionId: string }): Promise<string> {
    const { sessionId } = options;
    const meta = this.wcMeta.get(sessionId);
    const writer = this.wcWriters.get(sessionId);
    if (!meta || !writer) throw new Error(`WebCodecs session not found: ${sessionId}`);

    await new Promise<void>((resolve) => writer.end(resolve));
    this.wcWriters.delete(sessionId);

    // Mux to MP4 (try copy first, fallback to re-encode if needed)
    try {
      const outPath = await this.ffmpegWrapper.muxH264Elementary({
        h264Path: meta.h264Path,
        outputFileName: meta.fileName,
        fps: meta.fps,
        width: meta.width,
        height: meta.height,
        audioPath: meta.audioPath,
        outputPath: meta.outputPath,
        totalFrames: meta.totalFrames,
        totalDurationMs: meta.totalDurationMs
      }, (ff) => {
        try {
          const totalMs = meta.totalDurationMs || 0;
          const outMs = ff.outTimeMs || 0;
          const stepProgress = totalMs > 0 ? Math.min(Math.max(outMs / totalMs, 0), 1) : undefined;
          // Simple ETA per step
          const now = Date.now();
          if (!this._muxStartTimes) this._muxStartTimes = new Map<string, number>();
          if (!this._muxStartTimes.has(sessionId)) this._muxStartTimes.set(sessionId, now);
          const start = this._muxStartTimes.get(sessionId)!;
          const elapsed = (now - start) / 1000;
          const etaSeconds = stepProgress && stepProgress > 0 ? Math.max(0, elapsed * (1 - stepProgress) / stepProgress) : undefined;
          const overall = stepProgress !== undefined ? 90 + stepProgress * 10 : 90;
          this.sendProgressToRenderer({
            phase: 'finalizing',
            overallProgress: overall,
            message: '最終mux処理中...',
            ffmpegProgress: ff,
            sessionId,
            stepIndex: 3,
            stepCount: 3,
            stepName: '最終mux',
            stepProgress,
            timeRemaining: etaSeconds ? Math.round(etaSeconds * 1000) : undefined
          });
        } catch {}
      });
      return outPath;
    } finally {
      this.wcMeta.delete(sessionId);
    }
  }

  async webcodecsCancel(options: { sessionId: string }): Promise<void> {
    const { sessionId } = options;
    const writer = this.wcWriters.get(sessionId);
    if (writer) {
      try { writer.destroy(); } catch {}
      this.wcWriters.delete(sessionId);
    }
    this.wcMeta.delete(sessionId);
  }
  
  /**
   * テンポラリセッション作成
   */
  async createTempSession(sessionId: string): Promise<string> {
    try {
      const session = await this.tempFileManager.createTempSession(sessionId);
      return session.sessionDir;
    } catch (error) {
      console.error(`Failed to create temp session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * フレーム画像保存
   */
  async saveFrameImage(sessionId: string, frameName: string, frameData: Uint8Array, width?: number, height?: number): Promise<string> {
    try {
      return await this.tempFileManager.saveFrameImage(sessionId, frameName, frameData, width, height);
    } catch (error) {
      console.error(`Failed to save frame image ${frameName} for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * スモールバッチ動画作成
   */
  async createBatchVideo(batchOptions: BatchVideoOptions): Promise<string> {
    try {
      const session = this.tempFileManager.getTempSession(batchOptions.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${batchOptions.sessionId}`);
      }
      
      // FFmpegでバッチ動画作成
      const batchVideoPath = await this.ffmpegWrapper.createBatchVideo(
        batchOptions,
        session.sessionDir,
        (progress) => {
          this.sendProgressToRenderer({
            phase: 'batch_creation',
            overallProgress: 60, // ベース進捗
            currentBatch: batchOptions.batchIndex + 1,
            message: `バッチ ${batchOptions.batchIndex + 1} を処理中...`,
            ffmpegProgress: progress
          });
        }
      );
      
      // 使用済みフレーム画像をクリーンアップ
      const frameFiles: string[] = [];
      for (let frame = batchOptions.startFrame; frame < batchOptions.endFrame; frame++) {
        frameFiles.push(path.join(session.framesDir, `frame_${frame.toString().padStart(6, '0')}.png`));
      }
      
      await this.tempFileManager.cleanupFrameImages(batchOptions.sessionId, frameFiles);
      
      return batchVideoPath;
      
    } catch (error) {
      console.error(`Failed to create batch video for session ${batchOptions.sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * 最終動画結合
   */
  async composeFinalVideo(composeOptions: ComposeFinalVideoOptions): Promise<string> {
    console.log('📍 [BatchVideoProcessor] composeFinalVideo 開始');
    console.log('📍 [BatchVideoProcessor] options:', JSON.stringify(composeOptions, null, 2));
    
    // ファイル出力で確実にログを残す（動画出力先ディレクトリに保存）
    const outputBaseDir = composeOptions.outputPath ? path.dirname(composeOptions.outputPath) : (process.env.HOME ? path.join(process.env.HOME, 'Desktop') : '/tmp');
    const logDir = path.join(outputBaseDir, 'debug_logs');
    
    // ログディレクトリを作成
    try {
      fsSync.mkdirSync(logDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to create log directory:', error);
    }
    
    const logPath = path.join(logDir, 'batch_processor_debug.log');
    const logMessage = `
[${new Date().toISOString()}] BATCH PROCESSOR LOG - composeFinalVideo 開始
SessionId: ${composeOptions.sessionId}
BatchVideos: ${composeOptions.batchVideos.length} files
BackgroundVideo: ${composeOptions.backgroundVideoPath || 'なし'}
BackgroundVideoLoop: ${composeOptions.backgroundVideoLoop}
TotalDurationMs: ${composeOptions.totalDurationMs}
OutputWidth: ${composeOptions.outputWidth}
OutputHeight: ${composeOptions.outputHeight}
`;
    fsSync.appendFileSync(logPath, logMessage);
    
    try {
      const session = this.tempFileManager.getTempSession(composeOptions.sessionId);
      if (!session) {
        console.error('📍 [BatchVideoProcessor] Session not found:', composeOptions.sessionId);
        fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] エラー: Session not found: ${composeOptions.sessionId}\n`);
        throw new Error(`Session not found: ${composeOptions.sessionId}`);
      }
      console.log('📍 [BatchVideoProcessor] Session found:', session.sessionDir);
      fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] Session found: ${session.sessionDir}\n`);
      
      // 出力ディレクトリを使用者のデスクトップまたは指定ディレクトリに設定
      const outputDir = process.env.HOME ? path.join(process.env.HOME, 'Desktop') : session.outputDir;
      
      // outputPathが指定されていれば、それを使用するためoutputDirは無視される
      fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] SystemFFmpegWrapper.composeFinalVideo 呼び出し開始\n`);
      
      const finalVideoPath = await this.ffmpegWrapper.composeFinalVideo(
        composeOptions,
        session.sessionDir,
        outputDir,
        (progress) => {
          // 背景動画処理がある場合は進捗を調整
          let adjustedProgress = 85; // ベース進捗
          if (composeOptions.backgroundVideoPath && composeOptions.backgroundVideoLoop) {
            // 背景動画処理30% + 合成処理70%
            adjustedProgress = 30 + (progress.progress || 0) * 70;
          } else {
            adjustedProgress = 85 + (progress.progress || 0) * 15;
          }
          
          this.sendProgressToRenderer({
            phase: 'composition',
            overallProgress: Math.min(adjustedProgress, 99),
            message: composeOptions.backgroundVideoPath 
              ? '背景動画と合成中...' 
              : '最終動画を結合中...',
            ffmpegProgress: progress
          });
        }
      );
      
      fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] SystemFFmpegWrapper.composeFinalVideo 完了: ${finalVideoPath}\n`);
      
      return finalVideoPath;
      
    } catch (error) {
      console.error(`Failed to compose final video for session ${composeOptions.sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * テンポラリセッションクリーンアップ
   */
  async cleanupTempSession(sessionId: string): Promise<void> {
    try {
      await this.tempFileManager.cleanupTempSession(sessionId);
      this.processingQueue.delete(sessionId);
    } catch (error) {
      console.error(`Failed to cleanup temp session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * ストレージ使用量統計取得
   */
  async getStorageStats(sessionId?: string): Promise<StorageStats> {
    try {
      return await this.tempFileManager.getStorageStats(sessionId);
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw error;
    }
  }
  
  /**
   * 動画エクスポート要求の追加
   */
  async queueVideoExport(request: VideoExportRequest): Promise<void> {
    this.processingQueue.set(request.sessionId, request);
    
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }
  
  /**
   * エクスポートキュー処理
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.size === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      for (const [sessionId, request] of this.processingQueue) {
        await this.processVideoExport(request);
        this.processingQueue.delete(sessionId);
      }
    } catch (error) {
      console.error('Error processing export queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * 個別動画エクスポート処理
   */
  private async processVideoExport(request: VideoExportRequest): Promise<void> {
    const { sessionId, options } = request;
    
    try {
      this.sendProgressToRenderer({
        phase: 'preparing',
        overallProgress: 0,
        message: 'エクスポートを準備中...'
      });
      
      // セッション作成
      await this.createTempSession(sessionId);
      
      // この時点でレンダラープロセスがフレームキャプチャを開始
      // BatchVideoProcessorは主にFFmpeg処理を担当
      
      this.sendProgressToRenderer({
        phase: 'capturing',
        overallProgress: 5,
        message: 'フレームキャプチャ準備完了'
      });
      
    } catch (error) {
      console.error(`Failed to process video export for session ${sessionId}:`, error);
      
      this.sendErrorToRenderer({
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown export error',
        sessionId
      });
      
      // エラー時のクリーンアップ
      await this.cleanupTempSession(sessionId);
    }
  }
  
  /**
   * 進捗をレンダラープロセスに送信
   */
  private sendProgressToRenderer(progress: ProcessingProgress): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('export:progress', progress);
    });
  }
  
  /**
   * エラーをレンダラープロセスに送信
   */
  private sendErrorToRenderer(error: { code: string; message: string; sessionId?: string }): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('export:error', error);
    });
  }
  
  /**
   * 完了通知をレンダラープロセスに送信
   */
  sendCompletedToRenderer(outputPath: string): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('export:completed', outputPath);
    });
  }
  
  /**
   * 現在の処理をキャンセル
   */
  async cancelCurrentProcessing(): Promise<void> {
    if (this.ffmpegWrapper.isProcessing()) {
      this.ffmpegWrapper.cancel();
    }
    
    // 処理中のセッションをクリーンアップ
    const cleanupPromises = Array.from(this.processingQueue.keys()).map(sessionId =>
      this.cleanupTempSession(sessionId)
    );
    
    await Promise.allSettled(cleanupPromises);
    
    this.isProcessing = false;
    this.processingQueue.clear();
  }
  
  /**
   * リソースクリーンアップ（アプリ終了時）
   */
  async dispose(): Promise<void> {
    await this.cancelCurrentProcessing();
    await this.tempFileManager.dispose();
  }
  
  /**
   * 処理中かどうかの確認
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
  
  /**
   * キュー内のセッション数取得
   */
  getQueueSize(): number {
    return this.processingQueue.size;
  }
  
  /**
   * SystemFFmpegWrapperへのアクセサ
   */
  getFFmpegWrapper(): SystemFFmpegWrapper {
    return this.ffmpegWrapper;
  }

  // Extract background frames to session/webcodecs/bg_frames
  async webcodecsExtractBgFrames(options: {
    sessionId: string;
    videoPath: string;
    fps: number;
    width: number;
    height: number;
    startTimeMs: number;
    endTimeMs: number;
    quality?: number;
    fitMode?: 'cover' | 'contain' | 'stretch';
  }): Promise<{ framesDir: string; count: number }> {
    const session = this.tempFileManager.getTempSession(options.sessionId);
    if (!session) throw new Error(`Session not found: ${options.sessionId}`);
    // Delegate to plugin (native or system fallback). The system plugin will internally call ffmpeg wrapper.
    const totalMs = Math.max(0, options.endTimeMs - options.startTimeMs);
    const startTs = Date.now();
    this.sendProgressToRenderer({
      phase: 'preparing',
      overallProgress: 5,
      message: '背景動画の事前準備を開始...',
      sessionId: options.sessionId,
      stepIndex: 1,
      stepCount: 3,
      stepName: '背景準備',
      stepProgress: 0
    });
    const result = await this.lockstepPlugin.prepareBackgroundFrames({
      sessionId: session.sessionDir,
      videoPath: options.videoPath,
      fps: options.fps,
      width: options.width,
      height: options.height,
      startTimeMs: options.startTimeMs,
      endTimeMs: options.endTimeMs,
      quality: options.quality ?? 2,
      fitMode: options.fitMode ?? 'cover',
    }, (ff) => {
      try {
        const outMs = ff.outTimeMs ?? 0;
        let stepProgress = totalMs > 0 ? Math.min(Math.max(outMs / totalMs, 0), 1) : undefined;
        if ((stepProgress === undefined || isNaN(stepProgress)) && typeof ff.frame === 'number') {
          const totalFramesApprox = Math.max(1, Math.ceil((totalMs / 1000) * options.fps));
          stepProgress = Math.min(Math.max(ff.frame / totalFramesApprox, 0), 1);
        }
        const elapsed = (Date.now() - startTs) / 1000;
        const etaSeconds = stepProgress && stepProgress > 0 ? Math.max(0, elapsed * (1 - stepProgress) / stepProgress) : undefined;
        const overall = stepProgress !== undefined ? 5 + stepProgress * 5 : 5; // 5% -> 10%
        this.sendProgressToRenderer({
          phase: 'preparing',
          overallProgress: overall,
          message: '背景動画の事前準備中...',
          ffmpegProgress: {
            frame: ff.frame ?? 0,
            fps: ff.fps ?? 0,
            bitrate: '',
            totalSize: 0,
            outTimeMs: ff.outTimeMs ?? 0,
            dupFrames: 0,
            dropFrames: 0,
            speed: 0,
            progress: stepProgress ?? 0
          },
          sessionId: options.sessionId,
          stepIndex: 1,
          stepCount: 3,
          stepName: '背景準備',
          stepProgress,
          timeRemaining: etaSeconds ? Math.round(etaSeconds * 1000) : undefined
        });
      } catch {}
    });
    return result;
  }

  // Compute lockstep timeline (timestamps per frame). Falls back to simple rounding if plugin unavailable.
  async webcodecsGetTimeline(options: { fps: number; startTimeMs: number; endTimeMs: number }): Promise<number[]> {
    try {
      return await this.lockstepPlugin.computeTimeline(options);
    } catch {
      const { fps, startTimeMs, endTimeMs } = options;
      const totalFrames = Math.ceil(((endTimeMs - startTimeMs) / 1000) * fps);
      const arr: number[] = new Array(totalFrames);
      for (let n = 0; n < totalFrames; n++) arr[n] = startTimeMs + Math.round((n * 1000) / fps);
      return arr;
    }
  }
}
