/**
 * VideoExporter - Electron対応プレビュー機能活用シークアンドスナップ方式動画エクスポーター
 * 
 * プレビュー機能と同じ統一シーク処理で簡素かつ確実な動画エクスポートを実現
 * ブラウザ最適化されたレンダリングメカニズムを活用
 */

import { Engine } from '../../engine/Engine';
import { ResolutionManager } from './ResolutionManager';
import { getElectronAPI } from '../../../shared/electronAPI';
import { electronMediaManager } from '../../services/ElectronMediaManager';
import type { AspectRatio, Orientation, VideoQuality, CustomResolution } from '../../types/types';

// Legacy compatibility types
export interface VideoExportOptions {
  aspectRatio: AspectRatio;
  orientation: Orientation;
  quality: VideoQuality;
  customResolution?: CustomResolution;
  videoQuality?: 'low' | 'medium' | 'high' | 'highest';
  fps: number;
  fileName: string;
  startTime: number;
  endTime: number;
  includeDebugVisuals?: boolean;
  includeMusicTrack?: boolean;
  outputPath?: string; // 保存先のフルパス（オプション）
}

export interface ModernVideoExportOptions extends VideoExportOptions {}

export interface SeekAndSnapExportOptions extends VideoExportOptions {}

export interface ExportProgress {
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
}

/**
 * VideoExporter (プレビュー機能活用シークアンドスナップ方式)
 * 
 * エレクトロンアプリ専用のシンプルかつ確実な動画エクスポーター
 * - 統一シーク処理: プレビュー機能と同じengine.seek()で背景動画・アニメーション一括同期
 * - シンプル安定化: ブラウザ最適化されたレンダリングメカニズム活用
 * - スモールバッチ処理: 150フレーム単位での効率的処理
 */
export class VideoExporter {
  private readonly BATCH_SIZE = 150; // 5秒分（30fps）
  
  private engine: Engine;
  private resolutionManager: ResolutionManager;
  private electronAPI: any;
  private isExporting: boolean = false;
  private isCancelled: boolean = false;
  private sessionId: string | null = null;
  private progressCallback?: (progress: ExportProgress) => void;
  
  // プレビュー機能活用方式では精密な同期制御は不要
  // Engine.seek()による統一シーク処理で十分な精度を確保
  
  // フレーム処理セマフォ（順序保証） - プレビュー方式でも必要
  private frameProcessingSemaphore = new FrameProcessingSemaphore(1);
  
  constructor(engine: Engine) {
    this.engine = engine;
    this.resolutionManager = new ResolutionManager();
    
    this.electronAPI = getElectronAPI();
    
    if (!this.electronAPI) {
      throw new Error('SeekAndSnapVideoExporter requires Electron environment');
    }
  }
  
  /**
   * シークアンドスナップ方式でエクスポート開始
   */
  async startSeekAndSnapExport(
    options: SeekAndSnapExportOptions,
    progressCallback?: (progress: ExportProgress) => void
  ): Promise<string> {
    if (this.isExporting) {
      throw new Error('Export already in progress');
    }
    
    
    this.isExporting = true;
    this.isCancelled = false;
    this.progressCallback = progressCallback;
    this.sessionId = crypto.randomUUID();
    
    try {
      // 解像度設定
      const { width, height } = this.resolutionManager.getResolutionSize(
        options.aspectRatio,
        options.orientation,
        options.quality,
        options.customResolution
      );
      
      const totalDuration = options.endTime - options.startTime;
      const totalFrames = Math.ceil(totalDuration / 1000 * options.fps);
      
      
      this.reportProgress({
        phase: 'preparing',
        overallProgress: 0,
        totalFrames,
        message: 'セッションを初期化中...'
      });
      
      // RenderTexturePoolを初期化
      this.engine.initializeExportResources(width, height);
      
      // エレクトロンメインプロセスにセッション開始を通知
      const tempSessionDir = await this.electronAPI.createTempSession(this.sessionId);
      
      try {
        // Phase 1: フレームキャプチャ（プレビュー機能活用シークアンドスナップ）
        console.log('📸 [EXPORT_PHASE] Phase 1: フレームキャプチャ開始');
        await this.captureAllFramesWithSemaphore(options, totalFrames, width, height);
        console.log('📸 [EXPORT_PHASE] Phase 1: フレームキャプチャ完了');
        
        // Phase 2: スモールバッチ動画作成
        console.log('🎬 [EXPORT_PHASE] Phase 2: バッチ動画作成開始');
        const batchVideos = await this.createBatchVideos(options, totalFrames, width, height);
        console.log('🎬 [EXPORT_PHASE] Phase 2: バッチ動画作成完了:', batchVideos.length, 'files');
        
        // Phase 3: 最終結合
        console.log('🎯 [EXPORT_PHASE] Phase 3: 最終結合開始');
        const finalVideo = await this.composeFinalVideo(batchVideos, options);
        console.log('🎯 [EXPORT_PHASE] Phase 3: 最終結合完了:', finalVideo);
        
        this.reportProgress({
          phase: 'finalizing',
          overallProgress: 100,
          message: 'エクスポート完了'
        });
        
        return finalVideo;
        
      } finally {
        // テンポラリセッションクリーンアップ
        if (this.sessionId) {
          await this.electronAPI.cleanupTempSession(this.sessionId);
        }
      }
      
    } catch (error) {
      console.error('Seek and Snap export failed:', error);
      // キャンセルによるエラーの場合は、より分かりやすいメッセージにする
      if (this.isCancelled) {
        throw new Error('Export was cancelled by user');
      }
      throw error;
    } finally {
      // RenderTexturePoolをクリーンアップ
      this.engine.cleanupExportResources();
      this.isExporting = false;
      this.isCancelled = false;
      this.sessionId = null;
    }
  }
  
  /**
   * セマフォ制御による順序保証フレームキャプチャ
   */
  private async captureAllFramesWithSemaphore(
    options: SeekAndSnapExportOptions,
    totalFrames: number,
    width: number,
    height: number
  ): Promise<void> {
    
    this.reportProgress({
      phase: 'capturing',
      overallProgress: 5,
      totalFrames,
      message: 'フレームキャプチャを開始...'
    });
    
    // 順次処理でフレームをキャプチャ（キャンセル時の即座停止のため）
    for (let frame = 0; frame < totalFrames; frame++) {
      // キャンセルチェック
      if (!this.isExporting || this.isCancelled) {
        throw new Error('Export cancelled');
      }
      
      await this.captureFrameWithSemaphore(frame, options, width, height, totalFrames);
    }
    
  }
  
  /**
   * セマフォ制御による単一フレームキャプチャ（プレビュー機能活用方式）
   */
  private async captureFrameWithSemaphore(
    frame: number,
    options: SeekAndSnapExportOptions,
    width: number,
    height: number,
    totalFrames: number
  ): Promise<void> {
    // セマフォ取得（順序保証）
    await this.frameProcessingSemaphore.acquire();
    
    try {
      if (!this.isExporting || this.isCancelled) {
        throw new Error('Export cancelled');
      }
      
      // 仮想シーク: 正確なタイムスタンプ計算
      const timeMs = options.startTime + (frame / options.fps) * 1000;
      
      
      // プレビュー機能と同じ統一シーク処理（背景動画・アニメーション一括同期）
      this.engine.pause();
      await this.engine.seek(timeMs); // プレビューと同じシーク方式
      
      // シンプルなレンダリング安定化（プレビュー機能と同じ）
      await this.waitForStableRendering();
      
      // リトライ機構付きフレームキャプチャ
      const frameData = await this.captureFrameWithRetry(
        width,
        height,
        options.includeDebugVisuals || false,
        frame,
        totalFrames
      );
      
      // フレームデータの詳細検証（アスペクト比問題の特定）
      if (!frameData || frameData.length === 0) {
        throw new Error(`Empty frame data captured for frame ${frame}`);
      }
      
      const expectedSize = width * height * 4; // RGBA
      const actualSize = frameData.length;
      const expectedAspectRatio = width / height;
      
      console.log(`🔍 [FRAME_VALIDATION] フレーム${frame} キャプチャ検証:`);
      console.log(`🔍 [FRAME_VALIDATION] - 想定解像度: ${width}x${height} (${expectedAspectRatio.toFixed(3)})`);
      console.log(`🔍 [FRAME_VALIDATION] - 想定サイズ: ${expectedSize} bytes`);
      console.log(`🔍 [FRAME_VALIDATION] - 実際サイズ: ${actualSize} bytes`);
      
      if (actualSize !== expectedSize) {
        // サイズ不一致時の詳細分析
        const actualPixels = actualSize / 4;
        const possibleWidth = Math.sqrt(actualPixels * expectedAspectRatio);
        const possibleHeight = actualPixels / possibleWidth;
        
        console.error(`🚨 [ASPECT_RATIO_ERROR] フレーム${frame} サイズ不一致:`);
        console.error(`🚨 [ASPECT_RATIO_ERROR] - 予想される解像度: ${possibleWidth.toFixed(0)}x${possibleHeight.toFixed(0)}`);
        console.error(`🚨 [ASPECT_RATIO_ERROR] - 実際のピクセル数: ${actualPixels}`);
        
        throw new Error(`Frame data size mismatch for frame ${frame}: expected ${expectedSize}, got ${actualSize}`);
      }
      
      // 定期的なアスペクト比監視（最初の数フレームで特に注意）
      if (frame < 10 || frame % 50 === 0) {
        console.log(`📊 [ASPECT_MONITOR] フレーム${frame} アスペクト比確認: ${width}x${height} (${expectedAspectRatio.toFixed(3)})`);
      }
      
      // キャンセルチェック（画像保存前）
      if (!this.isExporting || this.isCancelled) {
        throw new Error('Export cancelled');
      }

      // システムテンポラリフォルダに画像保存（堅牢なPNG出力）
      const framePath = `frame_${frame.toString().padStart(6, '0')}.png`;
      try {
        await this.electronAPI.saveFrameImage(this.sessionId, framePath, frameData, width, height);
      } catch (pngError) {
        // キャンセル時のファイル保存エラーは抑制
        if (this.isCancelled) {
          throw new Error('Export cancelled');
        }
        console.error(`PNG conversion failed for frame ${frame + 1}:`, pngError);
        throw new Error(`PNG conversion failed for frame ${frame + 1}: ${pngError instanceof Error ? pngError.message : 'Unknown PNG error'}`);
      }
      
      // 進捗報告（5% - 85%） - より実際の処理時間に即した配分
      const captureProgress = 5 + (frame / totalFrames) * 80;
      this.reportProgress({
        phase: 'capturing',
        overallProgress: captureProgress,
        currentFrame: frame + 1,
        totalFrames,
        message: `フレーム ${frame + 1}/${totalFrames} をキャプチャ完了`
      });
      
      
      // メモリ効率化: 定期的なクリーンアップ
      if (frame % 50 === 0) {
        await this.cleanupMemory();
      }
      
    } catch (error) {
      console.error(`Failed to capture frame ${frame + 1}:`, error);
      throw new Error(`Frame capture failed for frame ${frame + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // セマフォ解放
      this.frameProcessingSemaphore.release();
    }
  }
  
  /**
   * スモールバッチ動画作成
   */
  private async createBatchVideos(
    options: SeekAndSnapExportOptions,
    totalFrames: number,
    width: number,
    height: number
  ): Promise<string[]> {
    const totalBatches = Math.ceil(totalFrames / this.BATCH_SIZE);
    
    
    this.reportProgress({
      phase: 'batch_creation',
      overallProgress: 85,
      totalBatches,
      message: 'バッチ動画を作成中...'
    });
    
    const batchVideos: string[] = [];
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (!this.isExporting || this.isCancelled) {
        throw new Error('Export cancelled');
      }
      
      const startFrame = batchIndex * this.BATCH_SIZE;
      const endFrame = Math.min(startFrame + this.BATCH_SIZE, totalFrames);
      const frameCount = endFrame - startFrame;
      
      
      // フレーム連続性の検証（重要: 前のバッチとの境界確認）
      if (batchIndex > 0) {
        const prevBatchEndFrame = startFrame - 1;
        if (startFrame !== prevBatchEndFrame + 1) {
          console.warn(`WARNING: Frame discontinuity detected! Gap between batches.`);
        }
      }
      
      console.log(`🎥 [BATCH_CREATE] バッチ${batchIndex} 作成開始:`, {
        sessionId: this.sessionId,
        batchIndex,
        startFrame,
        endFrame,
        frameCount,
        fps: options.fps,
        width,
        height,
        videoQuality: options.videoQuality || 'medium'
      });

      // エレクトロンメインプロセスでFFmpeg実行
      const batchVideoPath = await this.electronAPI.createBatchVideo({
        sessionId: this.sessionId,
        batchIndex,
        startFrame,
        endFrame,
        fps: options.fps,
        width,
        height,
        videoQuality: options.videoQuality || 'medium'
      });
      
      console.log(`🎥 [BATCH_CREATE] バッチ${batchIndex} 作成完了:`, batchVideoPath);
      
      batchVideos.push(batchVideoPath);
      
      // 進捗報告（85% - 95%） - より実際の処理時間に即した配分
      const batchProgress = 85 + (batchIndex / totalBatches) * 10;
      this.reportProgress({
        phase: 'batch_creation',
        overallProgress: batchProgress,
        currentBatch: batchIndex + 1,
        totalBatches,
        message: `バッチ ${batchIndex + 1}/${totalBatches} を作成`
      });
    }
    
    return batchVideos;
  }
  
  /**
   * 最終動画結合
   */
  private async composeFinalVideo(
    batchVideos: string[],
    options: SeekAndSnapExportOptions
  ): Promise<string> {
    
    this.reportProgress({
      phase: 'composition',
      overallProgress: 95,
      message: '最終動画を結合中...'
    });
    
    // 音声ファイルのパスを取得（音楽を含める場合のみ）
    let audioPath: string | undefined;
    if (options.includeMusicTrack) {
      const currentAudioURL = electronMediaManager.getCurrentAudioFilePath();
      if (currentAudioURL) {
        // ElectronMediaManager.getCurrentAudioFilePath() already returns the file path
        audioPath = currentAudioURL;
      }
    }

    // 背景動画の情報を取得
    let backgroundVideoPath: string | undefined;
    let backgroundVideoLoop = false;
    let totalDurationMs: number | undefined;
    
    const backgroundVideo = this.engine.getBackgroundVideo();
    if (backgroundVideo) {
      // ElectronMediaManagerから背景動画のファイルパスを取得
      backgroundVideoPath = electronMediaManager.getCurrentVideoFilePath();
      backgroundVideoLoop = true; // 背景動画がある場合はループを有効化
      totalDurationMs = options.endTime - options.startTime; // 動画の総時間
      
      console.log('🔍 [DURATION_DEBUG] 時間計算デバッグ:');
      console.log('🔍 [DURATION_DEBUG] options.startTime:', options.startTime);
      console.log('🔍 [DURATION_DEBUG] options.endTime:', options.endTime);
      console.log('🔍 [DURATION_DEBUG] 計算結果 totalDurationMs:', totalDurationMs);
      
      // もし totalDurationMs が 0 または負の値の場合、強制的に最小値を設定
      if (!totalDurationMs || totalDurationMs <= 0) {
        totalDurationMs = 1000; // 最低1秒
        console.log('🚨 [DURATION_FIX] totalDurationMs が無効だったため1秒に修正');
      }
      
      console.log('🎬 Background video detected for export:', {
        backgroundVideoPath,
        backgroundVideoLoop,
        totalDurationMs: totalDurationMs / 1000 + 's',
        backgroundVideoElement: backgroundVideo ? 'Present' : 'None'
      });
    } else {
      console.log('🎬 No background video detected for export');
    }

    // 出力解像度を取得
    const { width, height } = this.resolutionManager.getResolutionSize(
      options.aspectRatio,
      options.orientation,
      options.quality,
      options.customResolution
    );

    console.log('🚀 [FINAL_COMPOSE] composeFinalVideo IPC呼び出し開始');
    console.log('🚀 [FINAL_COMPOSE] パラメータ:', {
      sessionId: this.sessionId,
      batchVideosCount: batchVideos.length,
      batchVideos: batchVideos,
      fileName: options.fileName,
      backgroundVideoPath,
      backgroundVideoLoop,
      totalDurationMs
    });

    try {
      const finalVideoPath = await this.electronAPI.composeFinalVideo({
        sessionId: this.sessionId,
        batchVideos,
        fileName: options.fileName,
        includeMusicTrack: options.includeMusicTrack || false,
        audioPath,
        audioStartTime: options.startTime,
        audioEndTime: options.endTime,
        outputPath: options.outputPath, // フルパスを追加
        backgroundVideoPath,
        backgroundVideoLoop,
        totalDurationMs,
        outputWidth: width,
        outputHeight: height
      });
      
      console.log('🚀 [FINAL_COMPOSE] composeFinalVideo IPC呼び出し完了:', finalVideoPath);
      return finalVideoPath;
      
    } catch (error) {
      console.error('🚨 [FINAL_COMPOSE] composeFinalVideo IPC呼び出しエラー:', error);
      console.error('🚨 [FINAL_COMPOSE] エラーの詳細:', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        sessionId: this.sessionId,
        batchVideosCount: batchVideos.length
      });
      throw error;
    }
  }
  
  /**
   * シンプルなレンダリング安定化（プレビュー機能活用方式）
   * プレビュー機能と同じブラウザ最適化されたフレーム更新メカニズムを活用
   */
  private async waitForStableRendering(): Promise<void> {
    return new Promise<void>((resolve) => {
      // 2フレーム待機でレンダリング完了を確実に保証
      // プレビュー時と同じ待機方式
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Engine.seek()により背景動画とアニメーションは既に一括同期済み
          resolve();
        });
      });
    });
  }
  
  /**
   * リトライ機構付きフレームキャプチャ
   * フレームキャプチャ失敗時に最大3回までリトライ
   */
  private async captureFrameWithRetry(
    width: number,
    height: number,
    includeDebugVisuals: boolean,
    frameIndex: number,
    totalFrames: number
  ): Promise<Uint8Array> {
    // フレームキャプチャ実行
    const frameData = this.engine.captureOffscreenFrame(width, height, includeDebugVisuals);
    
    // データ検証
    if (!frameData || frameData.length === 0) {
      throw new Error(`Empty frame data`);
    }
    
    const expectedSize = width * height * 4; // RGBA
    if (frameData.length !== expectedSize) {
      throw new Error(`Frame data size mismatch: expected ${expectedSize}, got ${frameData.length}`);
    }
    
    return frameData;
  }
  
  /**
   * レンダリング状態のリセット
   * フレームキャプチャ失敗時のリカバリー処理
   */
  private async resetRenderingState(): Promise<void> {
    
    // PIXIアプリケーションの強制レンダリング
    if (this.engine.app?.renderer) {
      this.engine.app.render();
      
      // WebGLコンテキストのクリア
      const gl = this.engine.app.renderer.gl;
      if (gl) {
        // GPUコマンドの強制完了
        gl.finish();
        gl.flush();
      }
    }
    
    // ガベージコレクション促進
    if ((globalThis as any).gc) {
      (globalThis as any).gc();
    }
    
    // レンダリング安定化のための待機
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  
  
  /**
   * メモリクリーンアップ
   */
  private async cleanupMemory(): Promise<void> {
    // レンダラープロセスでのメモリクリーンアップ
    if (this.engine.app?.renderer) {
      const gl = this.engine.app.renderer.gl;
      if (gl) {
        gl.finish(); // GPU処理完了待機
        gl.flush();  // GPUコマンドバッファフラッシュ
      }
    }
    
    // ガベージコレクション促進
    if ((globalThis as any).gc) {
      (globalThis as any).gc();
    }
    
    // 短時間待機してメモリ解放を確実にする
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  /**
   * 進捗報告（プレビュー機能活用方式）
   */
  private reportProgress(progress: ExportProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
  
  /**
   * エクスポートキャンセル
   */
  async cancelExport(): Promise<void> {
    if (this.isExporting) {
      this.isCancelled = true;
      this.isExporting = false;
      
      // セッションクリーンアップ
      if (this.sessionId) {
        try {
          await this.electronAPI.cleanupTempSession(this.sessionId);
        } catch (error) {
          console.warn('Failed to cleanup temp session during cancellation:', error);
        }
        this.sessionId = null;
      }
    }
  }
  
  /**
   * エクスポート中かどうかの確認
   */
  isExportInProgress(): boolean {
    return this.isExporting;
  }
  
  /**
   * メモリ使用量予測
   */
  getMemoryEstimate(options: SeekAndSnapExportOptions): {
    totalFrames: number;
    bytesPerFrame: number;
    estimatedMemoryUsage: number;
    recommendedBatchSize: number;
  } {
    const totalDuration = options.endTime - options.startTime;
    const totalFrames = Math.ceil(totalDuration / 1000 * options.fps);
    
    const { width, height } = this.resolutionManager.getResolutionSize(
      options.aspectRatio,
      options.orientation,
      options.quality,
      options.customResolution
    );
    
    const bytesPerFrame = width * height * 4;
    const estimatedMemoryUsage = this.BATCH_SIZE * bytesPerFrame; // バッチサイズ分のみ
    
    return {
      totalFrames,
      bytesPerFrame,
      estimatedMemoryUsage,
      recommendedBatchSize: this.BATCH_SIZE
    };
  }

  // ===================================
  // Legacy API Compatibility Methods
  // ===================================

  /**
   * 従来のVideoExporter APIとの互換性のためのメソッド
   * 新しいSeekAndSnapExport方式を内部で使用
   */
  async startDirectExport(
    options: SeekAndSnapExportOptions, 
    progressCallback?: (progress: number) => void
  ): Promise<string> {
    // progressCallback を新しい形式に変換
    const newProgressCallback = progressCallback ? (progress: ExportProgress) => {
      progressCallback(progress.overallProgress / 100);
    } : undefined;

    return this.startSeekAndSnapExport(options, newProgressCallback);
  }

  /**
   * 推奨エクスポート方法の取得（常にseek-and-snapを推奨）
   */
  getRecommendedExportMethod(options: SeekAndSnapExportOptions): 'seek-and-snap' {
    return 'seek-and-snap';
  }
}

/**
 * フレーム処理順序保証のためのセマフォクラス
 */
class FrameProcessingSemaphore {
  private permits: number;
  private queue: (() => void)[] = [];
  
  constructor(permits: number) {
    this.permits = permits;
  }
  
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }
  
  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}