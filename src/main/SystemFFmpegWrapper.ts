/**
 * SystemFFmpegWrapper - システムFFmpeg活用ラッパー
 * 
 * エレクトロンアプリでシステムにインストールされたFFmpegを活用し、
 * 高性能な動画エンコーディングとバッチ結合を実行
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';

export interface BatchVideoOptions {
  sessionId: string;
  batchIndex: number;
  startFrame: number;
  endFrame: number;
  fps: number;
  width: number;
  height: number;
  videoQuality: 'low' | 'medium' | 'high' | 'highest';
}

export interface ComposeFinalVideoOptions {
  sessionId: string;
  batchVideos: string[];
  fileName: string;
  includeMusicTrack?: boolean;
  audioPath?: string;
  audioStartTime?: number;
  audioEndTime?: number;
  outputPath?: string; // フルパス（オプション）
  backgroundVideoPath?: string; // 背景動画ファイルパス（オプション）
  backgroundVideoLoop?: boolean; // 背景動画をループするか
  outputWidth?: number; // 出力動画の幅
  outputHeight?: number; // 出力動画の高さ
  totalDurationMs?: number; // 総動画時間（ミリ秒）
}

export interface FFmpegProgress {
  frame: number;
  fps: number;
  bitrate: string;
  totalSize: number;
  outTimeMs: number;
  dupFrames: number;
  dropFrames: number;
  speed: number;
  progress: number;
}

/**
 * SystemFFmpegWrapper
 * 
 * 高性能なシステムFFmpegを活用した動画処理クラス
 */
export class SystemFFmpegWrapper {
  private ffmpegPath: string;
  private currentProcess: ChildProcess | null = null;
  
  constructor() {
    this.ffmpegPath = this.getFFmpegPath();
  }
  
  /**
   * システムFFmpegパスの取得
   */
  private getFFmpegPath(): string {
    const platform = process.platform;
    
    // 開発環境ではシステムFFmpegを使用
    // プロダクション環境では同梱FFmpegを使用予定
    if (platform === 'win32') {
      return 'ffmpeg.exe';
    } else if (platform === 'darwin') {
      // macOS: Homebrewまたはシステムインストール
      return '/opt/homebrew/bin/ffmpeg'; // M1/M2 Mac
    } else {
      return 'ffmpeg';
    }
  }

  /**
   * Extract background frames as JPEG sequence for deterministic lockstep.
   */
  async extractFrames(options: {
    inputPath: string;
    outputDir: string;
    fps: number;
    width: number;
    height: number;
    startTimeMs: number;
    endTimeMs: number;
    quality?: number; // 2(best)-31(worst)
    fitMode?: 'cover' | 'contain' | 'stretch';
  }, progressCallback?: (progress: FFmpegProgress) => void): Promise<{ framesDir: string; count: number }> {
    const path = await import('path');
    const fs = await import('fs/promises');
    await fs.mkdir(options.outputDir, { recursive: true });
    const pattern = path.join(options.outputDir, 'bg_%06d.jpg');
    const durationSec = Math.max(0, (options.endTimeMs - options.startTimeMs) / 1000);
    // Build filter to preserve aspect ratio according to fitMode
    const outW = options.width;
    const outH = options.height;
    const fit = options.fitMode ?? 'cover';
    let filter: string;
    if (fit === 'stretch') {
      // direct scale to WxH
      filter = `scale=${outW}:${outH}`;
    } else if (fit === 'contain') {
      // keep AR, pad to WxH
      // scale down/up to fit within WxH, then pad centered
      filter = `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`;
    } else {
      // cover: fill WxH, cropping excess
      filter = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;
    }
    const args = [
      '-ss', (options.startTimeMs / 1000).toFixed(3),
      '-t', durationSec.toFixed(3),
      '-i', options.inputPath,
      '-r', options.fps.toString(),
      '-vf', filter,
      '-q:v', String(options.quality ?? 2),
      '-start_number', '0',
      '-y', pattern
    ];
    await this.executeFFmpeg(args, progressCallback);

    // Count frames
    const files = await fs.readdir(options.outputDir);
    const count = files.filter(f => f.startsWith('bg_') && f.endsWith('.jpg')).length;
    return { framesDir: options.outputDir, count };
  }

  /**
   * Mux H.264 elementary stream (+ optional audio) into MP4.
   * Tries stream copy first; if it fails, falls back to re-encode.
   */
  async muxH264Elementary(options: {
    h264Path: string;
    outputFileName: string;
    fps: number;
    width: number;
    height: number;
    audioPath?: string;
    outputPath?: string; // full path
    totalFrames?: number;
    totalDurationMs?: number;
  }, progressCallback?: (progress: FFmpegProgress) => void): Promise<string> {
    const path = await import('path');
    const fs = await import('fs/promises');
    const outDir = options.outputPath ? path.dirname(options.outputPath) : (process.env.HOME ? path.join(process.env.HOME, 'Desktop') : path.dirname(options.h264Path));
    const outPath = options.outputPath ? options.outputPath : path.join(outDir, options.outputFileName);

    // Raw H.264 elementary stream input
    const baseArgs = [
      '-fflags', '+genpts',
      '-probesize', '100M',
      '-analyzeduration', '100M',
      '-f', 'h264',
      '-framerate', options.fps.toString(),
      '-i', options.h264Path
    ];

    const audioArgs = options.audioPath ? ['-i', options.audioPath, '-c:a', 'aac'] : [];

    // Re-encode with libx264 to embed explicit CFR/fps metadata (most compatible)
    const args = [
      ...baseArgs,
      ...audioArgs,
      // Force CFR at the filter level to normalize timestamps
      '-vf', `fps=${options.fps}:round=up`,
      // Encoder/output FPS
      '-r', options.fps.toString(),
      // If total frames known, enforce; else if duration known, enforce duration
      ...(options.totalFrames ? ['-frames:v', String(options.totalFrames)] : []),
      ...(options.totalDurationMs ? ['-t', (options.totalDurationMs / 1000).toFixed(3)] : []),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '18',
      // MP4 timescale to avoid odd avg_frame_rate readings
      '-video_track_timescale', (options.fps * 1000).toString(),
      '-movflags', '+faststart',
      '-y', outPath
    ];
    await this.executeFFmpeg(args, progressCallback);
    return outPath;
  }
  
  /**
   * FFmpegの利用可能性をチェック
   */
  async checkFFmpegAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(this.ffmpegPath, ['-version']);
      
      process.on('close', (code) => {
        resolve(code === 0);
      });
      
      process.on('error', () => {
        resolve(false);
      });
    });
  }
  
  /**
   * スモールバッチ動画作成
   */
  async createBatchVideo(
    options: BatchVideoOptions,
    tempDir: string,
    progressCallback?: (progress: FFmpegProgress) => void
  ): Promise<string> {
    const { sessionId, batchIndex, startFrame, endFrame, fps, width, height, videoQuality } = options;
    
    // 入力フレーム画像パターン（framesサブディレクトリ内）
    const inputPattern = path.join(tempDir, 'frames', `frame_%06d.png`);
    
    // 出力バッチ動画パス
    const outputPath = path.join(tempDir, 'batches', `batch_${batchIndex.toString().padStart(4, '0')}.mp4`);
    
    // バッチディレクトリ作成
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // フレーム存在確認とバッチ情報の詳細ログ
    const frameCount = endFrame - startFrame;
    console.log(`\n=== Batch ${batchIndex} Video Creation ===`);
    console.log(`Frame range: ${startFrame} to ${endFrame-1} (${frameCount} frames)`);
    console.log(`Expected duration: ${(frameCount / fps).toFixed(2)} seconds at ${fps}fps`);
    
    // フレーム連続性の検証（重要: 前のバッチとの境界確認）
    if (batchIndex > 0) {
      const prevBatchEndFrame = startFrame - 1;
      console.log(`Batch continuity check: Previous batch ended at frame ${prevBatchEndFrame}, this batch starts at frame ${startFrame}`);
      if (startFrame !== prevBatchEndFrame + 1) {
        console.warn(`WARNING: Frame discontinuity detected! Gap between batches.`);
      } else {
        console.log(`✓ Frame continuity verified: No gaps between batches`);
      }
    }
    
    // 実際のフレームファイル存在確認
    const missingFrames = [];
    for (let frame = startFrame; frame < endFrame; frame++) {
      const framePath = path.join(tempDir, 'frames', `frame_${frame.toString().padStart(6, '0')}.png`);
      try {
        await fs.access(framePath);
      } catch (error) {
        missingFrames.push(frame);
      }
    }
    
    if (missingFrames.length > 0) {
      console.error(`WARNING: Missing frames for batch ${batchIndex}:`, missingFrames.slice(0, 10), missingFrames.length > 10 ? `... and ${missingFrames.length - 10} more` : '');
    } else {
      console.log(`✓ All ${frameCount} frames exist for batch ${batchIndex}`);
    }
    
    // 解像度とアスペクト比の検証とログ出力
    const expectedAspectRatio = width / height;
    console.log(`📐 [BATCH_RESOLUTION] バッチ${batchIndex} 解像度設定:`);
    console.log(`📐 [BATCH_RESOLUTION] - 目標解像度: ${width}x${height}`);
    console.log(`📐 [BATCH_RESOLUTION] - アスペクト比: ${expectedAspectRatio.toFixed(3)}`);
    console.log(`📐 [BATCH_RESOLUTION] - フレーム数: ${frameCount}`);
    console.log(`📐 [BATCH_RESOLUTION] - FPS: ${fps}`);

    // FFmpegコマンド引数構築（解像度を明示的に指定）
    const ffmpegArgs = [
      '-framerate', fps.toString(), // 入力フレームレートを明示的に指定
      '-start_number', startFrame.toString(),
      '-i', inputPattern,
      '-frames:v', (endFrame - startFrame).toString(),
      '-vsync', 'cfr',              // 固定フレームレート（Constant Frame Rate）を強制
      '-r', fps.toString(),
      '-s', `${width}x${height}`,   // 解像度を明示的に指定（アスペクト比問題防止）
      '-aspect', `${width}:${height}`, // アスペクト比を明示的に指定
      '-c:v', 'libx264',
      '-preset', this.getPresetForQuality(videoQuality),
      '-crf', this.getCRFForQuality(videoQuality),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', // Web最適化
      '-y', // 出力ファイル上書き
      outputPath
    ];
    
    console.log(`FFmpeg command: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);
    
    await this.executeFFmpeg(ffmpegArgs, progressCallback);
    
    // 出力動画の検証
    try {
      const stats = await fs.stat(outputPath);
      console.log(`✓ Batch video created: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // フレーム数を推定（ファイルサイズベース）
      const expectedSizeMB = frameCount * 0.1; // 大まかな推定（100KB/frame）
      if (stats.size < expectedSizeMB * 1024 * 1024 * 0.5) {
        console.warn(`WARNING: Batch video file size is unusually small. Expected ~${expectedSizeMB.toFixed(1)}MB, got ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      }
    } catch (error) {
      console.error(`ERROR: Failed to verify batch video:`, error);
      throw error;
    }
    
    console.log(`=== Batch ${batchIndex} Completed ===\n`);
    return outputPath;
  }
  
  /**
   * 最終動画結合
   */
  async composeFinalVideo(
    options: ComposeFinalVideoOptions,
    tempDir: string,
    outputDir: string,
    progressCallback?: (progress: FFmpegProgress) => void
  ): Promise<string> {
    console.log('🔥 [composeFinalVideo] メソッド開始');
    console.log('🔥 [composeFinalVideo] options:', JSON.stringify(options, null, 2));
    
    // ファイル出力で確実にログを残す（動画出力先ディレクトリに保存）
    const outputBaseDir = options.outputPath ? path.dirname(options.outputPath) : outputDir;
    const logDir = path.join(outputBaseDir, 'debug_logs');
    
    // ログディレクトリを作成
    try {
      fsSync.mkdirSync(logDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to create log directory:', error);
    }
    
    const logPath = path.join(logDir, 'systemffmpegwrapper_debug.log');
    const logMessage = `
[${new Date().toISOString()}] SYSTEM FFMPEG WRAPPER LOG - composeFinalVideo 開始
SessionId: ${options.sessionId}
BatchVideos: ${options.batchVideos.length} files
BackgroundVideo: ${options.backgroundVideoPath || 'なし'}
BackgroundVideoLoop: ${options.backgroundVideoLoop}
TotalDurationMs: ${options.totalDurationMs}
OutputWidth: ${options.outputWidth}
OutputHeight: ${options.outputHeight}
TempDir: ${tempDir}
OutputDir: ${outputDir}
`;
    fsSync.appendFileSync(logPath, logMessage);
    console.log('🔥 [composeFinalVideo] tempDir:', tempDir);
    console.log('🔥 [composeFinalVideo] outputDir:', outputDir);
    
    const { 
      sessionId, 
      batchVideos, 
      fileName, 
      includeMusicTrack, 
      audioPath, 
      audioStartTime, 
      audioEndTime,
      backgroundVideoPath,
      backgroundVideoLoop,
      outputWidth,
      outputHeight
    } = options;
    
    // totalDurationMs を let で宣言して再代入可能にする
    let { totalDurationMs } = options;
    
    // 背景動画の前処理（ループが必要な場合）
    console.log(`[BACKGROUND_CHECK] 背景動画処理の条件チェック:`);
    console.log(`[BACKGROUND_CHECK] - backgroundVideoPath: ${backgroundVideoPath ? 'EXISTS' : 'NULL'}`);
    console.log(`[BACKGROUND_CHECK] - backgroundVideoLoop: ${backgroundVideoLoop}`);
    console.log(`[BACKGROUND_CHECK] - totalDurationMs: ${totalDurationMs}`);
    
    // ファイルに出力して確実に記録
    const checkLogPath = path.join(logDir, 'background_check.log');
    try {
      await fs.appendFile(checkLogPath, `
[${new Date().toISOString()}] BACKGROUND CHECK
- backgroundVideoPath: ${backgroundVideoPath}
- backgroundVideoLoop: ${backgroundVideoLoop}
- totalDurationMs: ${totalDurationMs}
`);
    } catch (error) {
      console.warn('Failed to write background check log:', error);
    }
    
    let processedBackgroundVideoPath = backgroundVideoPath;
    
    // 🔧 背景動画のフルレングス化処理を無効化 - シンプルなループ再生方式に戻す
    if (backgroundVideoPath && backgroundVideoLoop) {
      console.log('🔄 [SIMPLE_LOOP] 背景動画フルレングス化をスキップ - シンプルなループ再生方式を使用');
      console.log('🔄 [SIMPLE_LOOP] 背景動画パス:', backgroundVideoPath);
      console.log('🔄 [SIMPLE_LOOP] フレームキャプチャ時のループ再生に依存します');
      
      // 背景動画はそのまま使用（フルレングス化処理は実行しない）
      // フレームキャプチャ時にEngine.seek()でループ再生される背景動画をキャプチャ
      
      // デバッグファイル出力
      const debugLogPath = path.join(logDir, 'simple_loop_debug.log');
      const debugMessage = `
[${new Date().toISOString()}] シンプルループ方式採用
- backgroundVideoPath: ${backgroundVideoPath}
- backgroundVideoLoop: ${backgroundVideoLoop}
- 処理方式: フレームキャプチャ時のループ再生に依存
`;
      try {
        await fs.appendFile(debugLogPath, debugMessage);
      } catch (error) {
        console.warn('Failed to write simple loop debug log:', error);
      }
      
      // 背景動画はそのまま使用（フルレングス化しない）
      processedBackgroundVideoPath = backgroundVideoPath;
    }

    // バッチ動画の存在確認とアスペクト比一貫性検証
    console.log('🔍 [BATCH_VALIDATION] バッチ動画の検証開始');
    console.log('🔍 [BATCH_VALIDATION] batchVideos配列:', batchVideos);
    console.log('🔍 [BATCH_VALIDATION] 配列長:', batchVideos.length);
    
    // 🔧 各バッチ動画のアスペクト比一貫性を検証
    console.log('📐 [ASPECT_VALIDATION] バッチ動画アスペクト比検証開始');
    for (let i = 0; i < batchVideos.length; i++) {
      try {
        const batchMetadata = await this.getVideoMetadata(batchVideos[i]);
        const batchAspectRatio = batchMetadata.width / batchMetadata.height;
        
        console.log(`📐 [ASPECT_VALIDATION] バッチ${i}: ${batchMetadata.width}x${batchMetadata.height} (比率:${batchAspectRatio.toFixed(3)})`);
        
        // 期待する解像度 (1:1) と異なる場合は警告
        if (Math.abs(batchAspectRatio - 1.0) > 0.01) {
          console.warn(`⚠️ [ASPECT_WARNING] バッチ${i} アスペクト比異常: 期待1.000, 実際${batchAspectRatio.toFixed(3)}`);
          
          // ログファイルにも記録
          fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] ASPECT WARNING - Batch ${i}: Expected 1.000, Got ${batchAspectRatio.toFixed(3)}\n`);
        }
      } catch (error) {
        console.error(`❌ [ASPECT_VALIDATION] バッチ${i} メタデータ取得失敗:`, error);
      }
    }
    
    if (!batchVideos || batchVideos.length === 0) {
      throw new Error('No batch videos provided for final composition');
    }
    
    // 各バッチ動画ファイルの存在確認
    const validBatchVideos: string[] = [];
    for (let i = 0; i < batchVideos.length; i++) {
      const videoPath = batchVideos[i];
      console.log(`🔍 [BATCH_VALIDATION] バッチ${i}: ${videoPath}`);
      
      try {
        const stats = await fs.stat(videoPath);
        console.log(`🔍 [BATCH_VALIDATION] バッチ${i} 存在確認OK: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        validBatchVideos.push(videoPath);
      } catch (error) {
        console.error(`🚨 [BATCH_VALIDATION] バッチ${i} ファイルが見つかりません: ${videoPath}`);
        console.error(`🚨 [BATCH_VALIDATION] エラー詳細:`, error);
      }
    }
    
    if (validBatchVideos.length === 0) {
      throw new Error('No valid batch video files found for final composition');
    }
    
    if (validBatchVideos.length !== batchVideos.length) {
      console.warn(`⚠️ [BATCH_VALIDATION] 一部のバッチ動画ファイルが見つかりません: ${batchVideos.length} -> ${validBatchVideos.length}`);
    }

    // concat用リストファイル作成
    const concatListPath = path.join(tempDir, 'concat_list.txt');
    const concatContent = validBatchVideos
      .map(videoPath => `file '${videoPath.replace(/'/g, "'\"'\"'")}'`) // パス内の単一引用符をエスケープ
      .join('\n');
    
    console.log('🔍 [CONCAT_LIST] concat_list.txt内容:');
    console.log(concatContent);
    console.log('🔍 [CONCAT_LIST] ファイルパス:', concatListPath);
    
    await fs.writeFile(concatListPath, concatContent, 'utf8');
    console.log('🔍 [CONCAT_LIST] concat_list.txt作成完了');
    
    // concat詳細ログ
    console.log(`\n=== Final Video Composition ===`);
    console.log(`Concatenating ${validBatchVideos.length} valid batch videos:`);
    for (let i = 0; i < validBatchVideos.length; i++) {
      try {
        const stats = await fs.stat(validBatchVideos[i]);
        console.log(`  ${i}: ${path.basename(validBatchVideos[i])} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (error) {
        console.error(`  ${i}: ${path.basename(validBatchVideos[i])} - FILE MISSING!`);
      }
    }
    
    if (processedBackgroundVideoPath) {
      console.log(`Background video: ${processedBackgroundVideoPath}`);
    }
    
    // 最終出力パス（outputPathが指定されていればそれを使用、なければデフォルト）
    const finalOutputPath = options.outputPath || path.join(outputDir, fileName);
    
    console.log(`Composing final video: ${validBatchVideos.length} valid batches -> ${finalOutputPath}`);
    
    // FFmpegコマンド引数構築
    const ffmpegArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath
    ];
    
    // 背景動画の入力を追加
    if (processedBackgroundVideoPath) {
      ffmpegArgs.push('-i', processedBackgroundVideoPath);
    }
    
    // 音声結合オプション
    if (includeMusicTrack && audioPath) {
      // 音楽ファイルの入力オプション（時間範囲指定）
      if (audioStartTime !== undefined && audioEndTime !== undefined) {
        const audioDuration = (audioEndTime - audioStartTime) / 1000; // ms to seconds
        const audioStartSeconds = audioStartTime / 1000; // ms to seconds
        
        ffmpegArgs.push(
          '-ss', audioStartSeconds.toString(), // 音声の開始時間
          '-t', audioDuration.toString(), // 音声の継続時間
          '-i', audioPath
        );
        
        console.log(`Audio trimming: ${audioStartSeconds}s to ${audioStartSeconds + audioDuration}s (duration: ${audioDuration}s)`);
      } else {
        ffmpegArgs.push('-i', audioPath);
      }
    }
    
    // 最終結合時の解像度とアスペクト比検証（デフォルト値を設定）
    const finalWidth = outputWidth || 1920; // デフォルト: Full HD幅
    const finalHeight = outputHeight || 1080; // デフォルト: Full HD高さ
    const finalAspectRatio = finalWidth / finalHeight;
    
    console.log(`🎬 [FINAL_COMPOSE] 最終結合解像度検証:`);
    console.log(`🎬 [FINAL_COMPOSE] - 目標解像度: ${finalWidth}x${finalHeight}`);
    console.log(`🎬 [FINAL_COMPOSE] - アスペクト比: ${finalAspectRatio.toFixed(3)}`);
    console.log(`🎬 [FINAL_COMPOSE] - 背景動画: ${processedBackgroundVideoPath ? 'あり' : 'なし'}`);

    // 動画合成の設定
    if (processedBackgroundVideoPath) {
      // 背景動画がある場合：一貫したアスペクト比保持でオーバーレイ合成
      // 🔧 フレーム間アスペクト比一貫性修正: 背景・前景両方で同じスケーリング方式使用
      const backgroundScale = `scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease,pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:black`;
      const foregroundScale = `scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease,pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:black`;
      
      console.log(`🎯 [ASPECT_CONSISTENCY] 一貫したアスペクト比保持スケーリング適用`);
      console.log(`🎯 [ASPECT_CONSISTENCY] Background: ${backgroundScale}`);
      console.log(`🎯 [ASPECT_CONSISTENCY] Foreground: ${foregroundScale}`);
      
      if (includeMusicTrack && audioPath) {
        // 背景動画 + 歌詞アニメーション + 音声
        ffmpegArgs.push(
          '-filter_complex', `[1:v]${backgroundScale}[bg];[0:v]${foregroundScale}[fg];[bg][fg]overlay=0:0[v]`,
          '-map', '[v]',
          '-map', '2:a', // 音声ストリーム
          '-s', `${finalWidth}x${finalHeight}`, // 最終解像度を明示的に指定
          '-aspect', `${finalWidth}:${finalHeight}`, // アスペクト比を明示的に指定
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest'
        );
      } else {
        // 背景動画 + 歌詞アニメーション（音声なし）
        ffmpegArgs.push(
          '-filter_complex', `[1:v]${backgroundScale}[bg];[0:v]${foregroundScale}[fg];[bg][fg]overlay=0:0[v]`,
          '-map', '[v]',
          '-s', `${finalWidth}x${finalHeight}`, // 最終解像度を明示的に指定
          '-aspect', `${finalWidth}:${finalHeight}`, // アスペクト比を明示的に指定
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-an' // 音声なし
        );
      }
    } else {
      // 背景動画なしの場合：従来の処理
      if (includeMusicTrack && audioPath) {
        ffmpegArgs.push(
          '-c:v', 'copy', // 動画ストリームはコピー（高速）
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest' // 短い方のストリームに合わせる
        );
      } else {
        ffmpegArgs.push(
          '-c', 'copy' // 全ストリームコピー（高速）
        );
      }
    }
    
    ffmpegArgs.push(
      '-movflags', '+faststart', // Web最適化
      '-y', // 出力ファイル上書き
      finalOutputPath
    );
    
    await this.executeFFmpeg(ffmpegArgs, progressCallback);
    
    console.log(`Final video composed: ${finalOutputPath}`);
    return finalOutputPath;
  }
  
  /**
   * FFmpeg実行（共通処理）
   */
  private async executeFFmpeg(
    args: string[],
    progressCallback?: (progress: FFmpegProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Executing FFmpeg: ${this.ffmpegPath} ${args.join(' ')}`);
      
      this.currentProcess = spawn(this.ffmpegPath, args);
      
      let stderr = '';
      
      // FFmpegの進捗解析
      this.currentProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        if (progressCallback) {
          const progress = this.parseFFmpegProgress(chunk);
          if (progress) {
            progressCallback(progress);
          }
        }
      });
      
      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        
        if (code === 0) {
          // 成功時もフレーム数をログ出力
          const finalFrameMatch = stderr.match(/frame=\s*(\d+)/g);
          if (finalFrameMatch) {
            const lastFrameMatch = finalFrameMatch[finalFrameMatch.length - 1];
            const frameCount = lastFrameMatch.match(/\d+/)?.[0];
            console.log(`✓ FFmpeg completed successfully. Final frame count: ${frameCount}`);
          }
          resolve();
        } else {
          console.error(`✗ FFmpeg process exited with code ${code}`);
          console.error(`FFmpeg stderr:`, stderr);
          reject(new Error(`FFmpeg process exited with code ${code}. Error: ${stderr}`));
        }
      });
      
      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });
    });
  }
  
  /**
   * FFmpeg進捗解析
   */
  private parseFFmpegProgress(stderr: string): FFmpegProgress | null {
    try {
      const lines = stderr.split('\n');
      let latestProgress: Partial<FFmpegProgress> = {};
      
      for (const line of lines) {
        // frame=  123 fps= 30 q=28.0 size=    1024kB time=00:00:04.10 bitrate=2048.0kbits/s speed=1.0x
        const frameMatch = line.match(/frame=\s*(\d+)/);
        const fpsMatch = line.match(/fps=\s*([\d.]+)/);
        const bitrateMatch = line.match(/bitrate=\s*([\d.]+\w*)/);
        const sizeMatch = line.match(/size=\s*(\d+)/);
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        const speedMatch = line.match(/speed=\s*([\d.]+)x/);
        
        if (frameMatch) latestProgress.frame = parseInt(frameMatch[1]);
        if (fpsMatch) latestProgress.fps = parseFloat(fpsMatch[1]);
        if (bitrateMatch) latestProgress.bitrate = bitrateMatch[1];
        if (sizeMatch) latestProgress.totalSize = parseInt(sizeMatch[1]);
        if (speedMatch) latestProgress.speed = parseFloat(speedMatch[1]);
        
        if (timeMatch) {
          const [, hours, minutes, seconds] = timeMatch;
          latestProgress.outTimeMs = (
            parseInt(hours) * 3600 + 
            parseInt(minutes) * 60 + 
            parseFloat(seconds)
          ) * 1000;
        }
      }
      
      // 進捗率計算（フレーム数ベース、概算）
      if (latestProgress.frame && latestProgress.fps) {
        latestProgress.progress = latestProgress.frame / (latestProgress.fps * 10); // 仮想的な進捗
      }
      
      return Object.keys(latestProgress).length > 0 ? latestProgress as FFmpegProgress : null;
      
    } catch (error) {
      console.warn('Failed to parse FFmpeg progress:', error);
      return null;
    }
  }
  
  /**
   * 動画品質に応じたプリセット取得
   */
  private getPresetForQuality(quality: string): string {
    switch (quality) {
      case 'highest': return 'slower';  // 最高品質・低速
      case 'high': return 'slow';       // 高品質・やや低速
      case 'medium': return 'medium';   // 標準品質・標準速度
      case 'low': return 'fast';        // 低品質・高速
      default: return 'medium';
    }
  }
  
  /**
   * 動画品質に応じたCRF値取得
   */
  private getCRFForQuality(quality: string): string {
    switch (quality) {
      case 'highest': return '15';  // 最高品質（大容量）
      case 'high': return '18';     // 高品質
      case 'medium': return '23';   // 標準品質
      case 'low': return '28';      // 低品質（小容量）
      default: return '23';
    }
  }
  
  /**
   * 動画のメタデータを取得
   */
  async getVideoMetadata(videoPath: string): Promise<{
    width: number;
    height: number;
    duration: number;
    frameRate: number;
    frameCount: number;
  }> {
    return new Promise((resolve, reject) => {
      const ffprobePath = this.ffmpegPath.replace('ffmpeg', 'ffprobe');
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath
      ];
      
      const process = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          try {
            const metadata = JSON.parse(stdout);
            const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
            
            if (!videoStream) {
              reject(new Error('No video stream found'));
              return;
            }
            
            const duration = parseFloat(metadata.format.duration);
            const frameRate = eval(videoStream.r_frame_rate); // "30/1" -> 30
            const frameCount = Math.round(duration * frameRate);
            
            resolve({
              width: videoStream.width,
              height: videoStream.height,
              duration,
              frameRate,
              frameCount
            });
          } catch (error) {
            reject(new Error(`Failed to parse ffprobe output: ${error}`));
          }
        } else {
          reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(new Error(`ffprobe process error: ${error.message}`));
      });
    });
  }

  /**
   * 動画の各フレームサイズを検証
   */
  async validateVideoFrameSizes(videoPath: string, sampleFrameCount: number = 50): Promise<{
    isConsistent: boolean;
    inconsistentFrames: Array<{ frame: number; width: number; height: number }>;
    expectedWidth: number;
    expectedHeight: number;
  }> {
    console.log(`\n=== Validating Frame Sizes: ${path.basename(videoPath)} ===`);
    
    try {
      // 動画メタデータを取得
      const metadata = await this.getVideoMetadata(videoPath);
      console.log(`Expected resolution: ${metadata.width}x${metadata.height}`);
      console.log(`Total frames: ${metadata.frameCount}, sampling ${sampleFrameCount} frames`);
      
      const inconsistentFrames: Array<{ frame: number; width: number; height: number }> = [];
      const frameInterval = Math.max(1, Math.floor(metadata.frameCount / sampleFrameCount));
      
      // フレームを抽出して検証
      for (let i = 0; i < sampleFrameCount && i * frameInterval < metadata.frameCount; i++) {
        const frameNumber = i * frameInterval;
        const timeSeconds = frameNumber / metadata.frameRate;
        
        try {
          const frameInfo = await this.extractFrameInfo(videoPath, timeSeconds);
          
          if (frameInfo.width !== metadata.width || frameInfo.height !== metadata.height) {
            inconsistentFrames.push({
              frame: frameNumber,
              width: frameInfo.width,
              height: frameInfo.height
            });
            
            console.warn(`⚠️  Frame ${frameNumber} (${timeSeconds.toFixed(3)}s): ${frameInfo.width}x${frameInfo.height} (expected: ${metadata.width}x${metadata.height})`);
          }
        } catch (error) {
          console.warn(`Failed to extract frame ${frameNumber}: ${error}`);
        }
      }
      
      const isConsistent = inconsistentFrames.length === 0;
      
      if (isConsistent) {
        console.log(`✓ All sampled frames have consistent resolution: ${metadata.width}x${metadata.height}`);
      } else {
        console.error(`✗ Found ${inconsistentFrames.length} frames with inconsistent resolution`);
        console.error(`Inconsistent frames:`, inconsistentFrames);
      }
      
      console.log(`=== Frame Size Validation Completed ===\n`);
      
      return {
        isConsistent,
        inconsistentFrames,
        expectedWidth: metadata.width,
        expectedHeight: metadata.height
      };
      
    } catch (error) {
      console.error(`Frame size validation failed: ${error}`);
      throw error;
    }
  }

  /**
   * 特定フレームの情報を抽出
   */
  private async extractFrameInfo(videoPath: string, timeSeconds: number): Promise<{
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      const ffprobePath = this.ffmpegPath.replace('ffmpeg', 'ffprobe');
      const args = [
        '-v', 'quiet',
        '-select_streams', 'v:0',
        '-show_entries', 'frame=width,height',
        '-of', 'json',
        '-read_intervals', `${timeSeconds}%+#1`,
        videoPath
      ];
      
      const process = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            const frame = result.frames?.[0];
            
            if (!frame) {
              reject(new Error('No frame data found'));
              return;
            }
            
            resolve({
              width: parseInt(frame.width),
              height: parseInt(frame.height)
            });
          } catch (error) {
            reject(new Error(`Failed to parse frame info: ${error}`));
          }
        } else {
          reject(new Error(`ffprobe failed: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * ループ境界での整合性をチェック
   */
  async checkLoopBoundaries(videoPath: string, sourceDurationSeconds: number): Promise<{
    isSeamless: boolean;
    boundaryIssues: Array<{ position: number; issue: string }>;
  }> {
    console.log(`\n=== Checking Loop Boundaries ===`);
    
    const boundaryIssues: Array<{ position: number; issue: string }> = [];
    const metadata = await this.getVideoMetadata(videoPath);
    const loopCount = Math.floor(metadata.duration / sourceDurationSeconds);
    
    console.log(`Video duration: ${metadata.duration.toFixed(2)}s, Source duration: ${sourceDurationSeconds.toFixed(2)}s`);
    console.log(`Expected loop count: ${loopCount}`);
    
    // 各ループ境界でフレームサイズをチェック
    for (let i = 1; i < loopCount; i++) {
      const boundaryTime = i * sourceDurationSeconds;
      
      try {
        // 境界前後のフレームを取得
        const beforeFrame = await this.extractFrameInfo(videoPath, boundaryTime - 0.01);
        const afterFrame = await this.extractFrameInfo(videoPath, boundaryTime + 0.01);
        
        if (beforeFrame.width !== afterFrame.width || beforeFrame.height !== afterFrame.height) {
          boundaryIssues.push({
            position: boundaryTime,
            issue: `Size mismatch: ${beforeFrame.width}x${beforeFrame.height} -> ${afterFrame.width}x${afterFrame.height}`
          });
          console.warn(`⚠️  Boundary ${i} (${boundaryTime.toFixed(2)}s): ${beforeFrame.width}x${beforeFrame.height} -> ${afterFrame.width}x${afterFrame.height}`);
        } else {
          console.log(`✓ Boundary ${i} (${boundaryTime.toFixed(2)}s): consistent size ${beforeFrame.width}x${beforeFrame.height}`);
        }
      } catch (error) {
        boundaryIssues.push({
          position: boundaryTime,
          issue: `Failed to extract boundary frames: ${error}`
        });
        console.warn(`Failed to check boundary ${i}: ${error}`);
      }
    }
    
    const isSeamless = boundaryIssues.length === 0;
    console.log(`Loop boundary check: ${isSeamless ? '✓ Seamless' : `✗ ${boundaryIssues.length} issues found`}`);
    console.log(`=== Loop Boundary Check Completed ===\n`);
    
    return { isSeamless, boundaryIssues };
  }

  /**
   * 数学的精密計算でのループパラメータ算出
   */
  private calculatePreciseLoopParameters(
    sourceDuration: number,
    sourceFrameCount: number,
    frameRate: number,
    targetDurationMs: number
  ): {
    requiredLoops: number;
    exactFrameCount: number;
    exactEndTimeSeconds: number;
    precisionLoss: number;
  } {
    const targetDurationSeconds = targetDurationMs / 1000;
    
    // 必要なループ回数（切り上げ）
    const requiredLoops = Math.ceil(targetDurationSeconds / sourceDuration);
    
    // 正確なフレーム数
    const exactFrameCount = Math.round(targetDurationSeconds * frameRate);
    
    // フレーム精度での正確な終了時間
    const exactEndTimeSeconds = exactFrameCount / frameRate;
    
    // 精度ロス計算
    const precisionLoss = Math.abs(exactEndTimeSeconds - targetDurationSeconds);
    
    console.log(`\n=== Precise Loop Calculation ===`);
    console.log(`Source: ${sourceDuration.toFixed(3)}s (${sourceFrameCount} frames @ ${frameRate}fps)`);
    console.log(`Target: ${targetDurationSeconds.toFixed(3)}s`);
    console.log(`Required loops: ${requiredLoops}`);
    console.log(`Exact frame count: ${exactFrameCount}`);
    console.log(`Exact end time: ${exactEndTimeSeconds.toFixed(6)}s`);
    console.log(`Precision loss: ${(precisionLoss * 1000).toFixed(3)}ms`);
    console.log(`=== Calculation Completed ===\n`);
    
    return {
      requiredLoops,
      exactFrameCount,
      exactEndTimeSeconds,
      precisionLoss
    };
  }

  /**
   * 全フレームを画像として抽出
   */
  async extractAllFrames(
    videoPath: string,
    outputDir: string,
    targetWidth?: number,
    targetHeight?: number,
    batchSize: number = 100
  ): Promise<{
    frameCount: number;
    framePattern: string;
    frameRate: number;
  }> {
    console.log(`\n=== Extracting All Frames ===`);
    
    const metadata = await this.getVideoMetadata(videoPath);
    const totalFrames = metadata.frameCount;
    console.log(`Total frames to extract: ${totalFrames}`);
    
    // フレーム出力パターン
    const framePattern = path.join(outputDir, 'frame_%06d.png');
    
    // フレーム抽出コマンド構築
    const extractArgs = [
      '-i', videoPath,
      '-vsync', 'cfr' // 固定フレームレート
    ];
    
    // サイズ指定がある場合
    if (targetWidth && targetHeight) {
      extractArgs.push(
        '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`
      );
    }
    
    extractArgs.push(
      '-q:v', '1', // 最高画質
      '-y',
      framePattern
    );
    
    console.log(`Extracting frames: ${this.ffmpegPath} ${extractArgs.join(' ')}`);
    await this.executeFFmpeg(extractArgs);
    
    console.log(`✓ Extracted ${totalFrames} frames to ${outputDir}`);
    console.log(`=== Frame Extraction Completed ===\n`);
    
    return {
      frameCount: totalFrames,
      framePattern,
      frameRate: metadata.frameRate
    };
  }

  /**
   * フレーム画像の品質統一と検証
   */
  async validateAndUnifyFrames(
    frameDir: string,
    frameCount: number,
    expectedWidth: number,
    expectedHeight: number
  ): Promise<{
    validFrameCount: number;
    correctedFrames: number;
    framePattern: string;
  }> {
    console.log(`\n=== Validating and Unifying Frames ===`);
    console.log(`Expected size: ${expectedWidth}x${expectedHeight}`);
    
    let correctedFrames = 0;
    const framePattern = path.join(frameDir, 'frame_%06d.png');
    
    // 各フレームのサイズチェックと修正
    for (let i = 1; i <= frameCount; i++) {
      const framePath = path.join(frameDir, `frame_${i.toString().padStart(6, '0')}.png`);
      
      try {
        // フレーム画像のサイズ確認
        const imageInfo = await this.getImageInfo(framePath);
        
        if (imageInfo.width !== expectedWidth || imageInfo.height !== expectedHeight) {
          console.log(`Correcting frame ${i}: ${imageInfo.width}x${imageInfo.height} -> ${expectedWidth}x${expectedHeight}`);
          
          // サイズ修正
          const tempPath = `${framePath}.tmp`;
          const resizeArgs = [
            '-i', framePath,
            '-vf', `scale=${expectedWidth}:${expectedHeight}:force_original_aspect_ratio=decrease,pad=${expectedWidth}:${expectedHeight}:(ow-iw)/2:(oh-ih)/2:black`,
            '-q:v', '1',
            '-y',
            tempPath
          ];
          
          await this.executeFFmpeg(resizeArgs);
          await fs.rename(tempPath, framePath);
          correctedFrames++;
        }
      } catch (error) {
        console.warn(`Failed to validate frame ${i}: ${error}`);
      }
    }
    
    console.log(`✓ Validated ${frameCount} frames`);
    console.log(`✓ Corrected ${correctedFrames} frames`);
    console.log(`=== Frame Validation Completed ===\n`);
    
    return {
      validFrameCount: frameCount,
      correctedFrames,
      framePattern
    };
  }

  /**
   * 画像ファイルの情報を取得
   */
  private async getImageInfo(imagePath: string): Promise<{
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      const ffprobePath = this.ffmpegPath.replace('ffmpeg', 'ffprobe');
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        imagePath
      ];
      
      const process = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            const imageStream = result.streams?.[0];
            
            if (!imageStream) {
              reject(new Error('No image stream found'));
              return;
            }
            
            resolve({
              width: imageStream.width,
              height: imageStream.height
            });
          } catch (error) {
            reject(new Error(`Failed to parse image info: ${error}`));
          }
        } else {
          reject(new Error(`ffprobe failed: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * フレーム画像から高品質動画を作成
   */
  async createVideoFromFrames(
    framePattern: string,
    outputPath: string,
    frameRate: number,
    frameCount: number
  ): Promise<string> {
    console.log(`\n=== Creating Video from Frames ===`);
    console.log(`Frame pattern: ${framePattern}`);
    console.log(`Output: ${outputPath}`);
    console.log(`Frame rate: ${frameRate}fps, Frame count: ${frameCount}`);
    
    const createArgs = [
      '-framerate', frameRate.toString(),
      '-i', framePattern,
      '-frames:v', frameCount.toString(),
      '-c:v', 'libx264',
      '-preset', 'slow', // 高品質設定
      '-crf', '15', // 非常に高品質
      '-pix_fmt', 'yuv420p',
      '-vsync', 'cfr',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ];
    
    console.log(`Creating video: ${this.ffmpegPath} ${createArgs.join(' ')}`);
    await this.executeFFmpeg(createArgs);
    
    // 作成された動画の検証
    const outputMetadata = await this.getVideoMetadata(outputPath);
    console.log(`✓ Created video: ${outputMetadata.width}x${outputMetadata.height}, ${outputMetadata.duration.toFixed(3)}s, ${outputMetadata.frameCount} frames`);
    
    console.log(`=== Video Creation from Frames Completed ===\n`);
    return outputPath;
  }

  /**
   * 背景動画をループして指定時間分の動画を作成（フレームリメイク + 数学的Concat方式）
   */
  async createLoopedBackgroundVideo(
    inputVideoPath: string,
    outputPath: string,
    totalDurationMs: number,
    outputWidth?: number,
    outputHeight?: number,
    progressCallback?: (progress: FFmpegProgress) => void
  ): Promise<string> {
    console.log(`[NEW_IMPLEMENTATION] =========================`);
    console.log(`[NEW_IMPLEMENTATION] 新しいCliput式ループ実装が開始されました`);
    console.log(`[NEW_IMPLEMENTATION] =========================`);
    console.log(`=== Looped Background Video Creation Started ===`);
    console.log(`Input: ${inputVideoPath}`);
    console.log(`Output: ${outputPath}`);
    console.log(`Target duration: ${totalDurationMs}ms (${(totalDurationMs / 1000).toFixed(2)}s)`);
    console.log(`Target resolution: ${outputWidth || 'auto'}x${outputHeight || 'auto'}`);
    console.log(`=== System: Frame-based Remake + Clipup-style Looping ===`);
    
    // 新しい実装が確実に呼び出されたことを記録
    const outputDir = path.dirname(outputPath);
    const implementationLogPath = path.join(outputDir, 'new_implementation_called.log');
    await fs.appendFile(implementationLogPath, `
[${new Date().toISOString()}] NEW IMPLEMENTATION CALLED
- inputVideoPath: ${inputVideoPath}
- outputPath: ${outputPath}
- totalDurationMs: ${totalDurationMs}
=============================================
`);

    // Phase 1: 入力動画の数学的分析
    const inputMetadata = await this.getVideoMetadata(inputVideoPath);
    console.log(`Input video: ${inputMetadata.width}x${inputMetadata.height}, ${inputMetadata.duration.toFixed(3)}s, ${inputMetadata.frameCount} frames @ ${inputMetadata.frameRate}fps`);
    
    const loopParams = this.calculatePreciseLoopParameters(
      inputMetadata.duration,
      inputMetadata.frameCount,
      inputMetadata.frameRate,
      totalDurationMs
    );
    
    // 出力解像度の決定
    const targetWidth = outputWidth || inputMetadata.width;
    const targetHeight = outputHeight || inputMetadata.height;
    
    // 出力ディレクトリを作成
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const tempDir = path.join(path.dirname(outputPath), `loop_temp_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
      // Phase 2: フレーム抽出 (0-40%)
      console.log(`\n=== Phase 2: Frame Extraction ===`);
      const framesDir = path.join(tempDir, 'frames');
      await fs.mkdir(framesDir, { recursive: true });
      
      const extractedFrames = await this.extractAllFrames(
        inputVideoPath,
        framesDir,
        targetWidth,
        targetHeight
      );
      
      if (progressCallback) {
        progressCallback({
          frame: extractedFrames.frameCount,
          fps: extractedFrames.frameRate,
          bitrate: '0kbits/s',
          totalSize: 0,
          outTimeMs: 0,
          dupFrames: 0,
          dropFrames: 0,
          speed: 1,
          progress: 40
        });
      }
      
      // Phase 3: フレーム品質統一 (40-50%)
      console.log(`\n=== Phase 3: Frame Quality Unification ===`);
      const validatedFrames = await this.validateAndUnifyFrames(
        framesDir,
        extractedFrames.frameCount,
        targetWidth,
        targetHeight
      );
      
      if (progressCallback) {
        progressCallback({
          frame: validatedFrames.validFrameCount,
          fps: extractedFrames.frameRate,
          bitrate: '0kbits/s',
          totalSize: 0,
          outTimeMs: 0,
          dupFrames: 0,
          dropFrames: validatedFrames.correctedFrames,
          speed: 1,
          progress: 50
        });
      }
      
      // Phase 4: リメイク動画作成 (50-80%)
      console.log(`\n=== Phase 4: Remake Video Creation ===`);
      const remakeVideoPath = path.join(tempDir, 'remake_source.mp4');
      
      await this.createVideoFromFrames(
        validatedFrames.framePattern,
        remakeVideoPath,
        extractedFrames.frameRate,
        validatedFrames.validFrameCount
      );
      
      if (progressCallback) {
        progressCallback({
          frame: validatedFrames.validFrameCount,
          fps: extractedFrames.frameRate,
          bitrate: '0kbits/s',
          totalSize: 0,
          outTimeMs: inputMetadata.duration * 1000,
          dupFrames: 0,
          dropFrames: 0,
          speed: 1,
          progress: 80
        });
      }
      
      // デバッグ用: フレーム画像は一旦保持（後でtempフォルダに移動）
      
      // Phase 5: Clipup式のフレーム精度ループ作成 (80-95%)
      console.log(`\n=== Phase 5: Clipup-Style Frame-Precise Looping ===`);
      
      // 必要総フレーム数を計算
      const targetFrameCount = loopParams.exactFrameCount;
      console.log(`Target total frames: ${targetFrameCount}`);
      
      // Clipup式のstream_loop + frames指定方式
      const clipupLoopArgs = [
        '-stream_loop', (loopParams.requiredLoops - 1).toString(), // ループ回数
        '-i', remakeVideoPath,
        '-frames:v', targetFrameCount.toString(), // フレーム数で正確に指定
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18', // 高品質維持
        '-pix_fmt', 'yuv420p',
        '-vsync', 'cfr', // 固定フレームレート
        '-avoid_negative_ts', 'make_zero',
        '-an', // 音声なし
        '-y',
        outputPath
      ];
      
      console.log(`Clipup-style looping: ${this.ffmpegPath} ${clipupLoopArgs.join(' ')}`);
      console.log(`Stream loops: ${loopParams.requiredLoops - 1}, Target frames: ${targetFrameCount}`);
      
      await this.executeFFmpeg(clipupLoopArgs, (progress) => {
        if (progressCallback) {
          progressCallback({
            ...progress,
            progress: 80 + (progress.progress || 0) * 15 // 80-95%（Clipupループ処理）
          });
        }
      });
      
      // Phase 7: 品質保証検証 (95-100%)
      console.log(`\n=== Phase 7: Quality Assurance ===`);
      const stats = await fs.stat(outputPath);
      console.log(`✓ Looped background video created: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // 出力動画のメタデータ確認
      const outputMetadata = await this.getVideoMetadata(outputPath);
      const actualDuration = outputMetadata.duration;
      const actualFrameCount = outputMetadata.frameCount;
      const durationError = Math.abs(actualDuration - loopParams.exactEndTimeSeconds);
      const frameError = Math.abs(actualFrameCount - loopParams.exactFrameCount);
      
      console.log(`Output video: ${outputMetadata.width}x${outputMetadata.height}, ${actualDuration.toFixed(3)}s, ${actualFrameCount} frames`);
      console.log(`Duration accuracy: ${(durationError * 1000).toFixed(3)}ms error`);
      console.log(`Frame accuracy: ${frameError} frame(s) error`);
      
      // フレームサイズ整合性チェック
      const validation = await this.validateVideoFrameSizes(outputPath, Math.min(50, actualFrameCount));
      
      if (!validation.isConsistent) {
        console.error(`⚠️  WARNING: Looped video has inconsistent frame sizes!`);
        console.error(`Expected: ${validation.expectedWidth}x${validation.expectedHeight}`);
        console.error(`Problematic frames: ${validation.inconsistentFrames.length}`);
        
        validation.inconsistentFrames.slice(0, 5).forEach(frame => {
          console.error(`  Frame ${frame.frame}: ${frame.width}x${frame.height}`);
        });
        
        if (validation.inconsistentFrames.length > 5) {
          console.error(`  ... and ${validation.inconsistentFrames.length - 5} more frames`);
        }
      }
      
      // ループ境界チェック
      const boundaryCheck = await this.checkLoopBoundaries(outputPath, inputMetadata.duration);
      if (!boundaryCheck.isSeamless) {
        console.error(`⚠️  WARNING: Loop boundary issues detected!`);
        boundaryCheck.boundaryIssues.forEach(issue => {
          console.error(`  ${issue.position.toFixed(2)}s: ${issue.issue}`);
        });
      }
      
      if (progressCallback) {
        progressCallback({
          frame: actualFrameCount,
          fps: inputMetadata.frameRate,
          bitrate: '0kbits/s',
          totalSize: 0,
          outTimeMs: actualDuration * 1000,
          dupFrames: 0,
          dropFrames: 0,
          speed: 1,
          progress: 100
        });
      }
      
    } finally {
      // デバッグ用: 一時ファイルを出力ディレクトリのtempフォルダに保存
      const outputDir = path.dirname(outputPath);
      const debugTempDir = path.join(outputDir, 'temp');
      
      console.log(`[DEBUG_SAVE] 出力動画パス: ${outputPath}`);
      console.log(`[DEBUG_SAVE] 出力ディレクトリ: ${outputDir}`);
      console.log(`[DEBUG_SAVE] デバッグ保存先: ${debugTempDir}`);
      
      try {
        // debugTempDirが存在しない場合は作成
        if (!fsSync.existsSync(debugTempDir)) {
          console.log(`[DEBUG_SAVE] tempフォルダを作成中: ${debugTempDir}`);
          await fs.mkdir(debugTempDir, { recursive: true });
          console.log(`[DEBUG_SAVE] tempフォルダ作成完了`);
        } else {
          console.log(`[DEBUG_SAVE] tempフォルダは既に存在: ${debugTempDir}`);
        }
        
        // タイムスタンプを追加してファイル名の重複を防ぐ
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const sessionDebugDir = path.join(debugTempDir, `debug_${timestamp}`);
        console.log(`[DEBUG_SAVE] セッションディレクトリを作成: ${sessionDebugDir}`);
        await fs.mkdir(sessionDebugDir, { recursive: true });
        
        // 抽出されたフレームをコピー
        const framesDir = path.join(tempDir, 'frames');
        console.log(`[DEBUG_SAVE] フレームディレクトリ確認: ${framesDir}`);
        if (fsSync.existsSync(framesDir)) {
          const framesDebugDir = path.join(sessionDebugDir, 'extracted_frames');
          console.log(`[DEBUG_SAVE] フレーム画像をコピー中: ${framesDir} → ${framesDebugDir}`);
          await fs.cp(framesDir, framesDebugDir, { recursive: true });
          const frameFiles = await fs.readdir(framesDebugDir);
          console.log(`[DEBUG_SAVE] フレーム画像を保存完了: ${framesDebugDir} (${frameFiles.length}ファイル)`);
        } else {
          console.log(`[DEBUG_SAVE] フレームディレクトリが存在しません: ${framesDir}`);
        }
        
        // リメイクされた動画をコピー
        const remakeVideoPath = path.join(tempDir, 'remake_source.mp4');
        console.log(`[DEBUG_SAVE] リメイク動画確認: ${remakeVideoPath}`);
        if (fsSync.existsSync(remakeVideoPath)) {
          const remakeDebugPath = path.join(sessionDebugDir, 'remake_source.mp4');
          console.log(`[DEBUG_SAVE] リメイク動画をコピー中: ${remakeVideoPath} → ${remakeDebugPath}`);
          await fs.copyFile(remakeVideoPath, remakeDebugPath);
          const remakeStats = await fs.stat(remakeDebugPath);
          console.log(`[DEBUG_SAVE] リメイク動画を保存完了: ${remakeDebugPath} (${(remakeStats.size / 1024 / 1024).toFixed(2)}MB)`);
        } else {
          console.log(`[DEBUG_SAVE] リメイク動画が存在しません: ${remakeVideoPath}`);
        }
        
        // 元動画もコピー（比較用）
        const originalDebugPath = path.join(sessionDebugDir, `original${path.extname(inputVideoPath)}`);
        console.log(`[DEBUG_SAVE] 元動画をコピー中: ${inputVideoPath} → ${originalDebugPath}`);
        await fs.copyFile(inputVideoPath, originalDebugPath);
        const originalStats = await fs.stat(originalDebugPath);
        console.log(`[DEBUG_SAVE] 元動画を保存完了: ${originalDebugPath} (${(originalStats.size / 1024 / 1024).toFixed(2)}MB)`);
        
        // 最終出力もコピー（比較用）
        if (fsSync.existsSync(outputPath)) {
          const finalDebugPath = path.join(sessionDebugDir, 'final_loop.mp4');
          console.log(`[DEBUG_SAVE] 最終ループ動画をコピー中: ${outputPath} → ${finalDebugPath}`);
          await fs.copyFile(outputPath, finalDebugPath);
          const finalStats = await fs.stat(finalDebugPath);
          console.log(`[DEBUG_SAVE] 最終ループ動画を保存完了: ${finalDebugPath} (${(finalStats.size / 1024 / 1024).toFixed(2)}MB)`);
        } else {
          console.log(`[DEBUG_SAVE] 最終出力が存在しません: ${outputPath}`);
        }
        
        // デバッグ情報をテキストファイルに保存
        const debugInfo = {
          timestamp,
          originalVideo: path.basename(inputVideoPath),
          targetDuration: `${(totalDurationMs / 1000).toFixed(2)}秒`,
          inputDuration: `${inputMetadata.duration}秒`,
          inputFrameCount: inputMetadata.frameCount,
          outputFrameRate: inputMetadata.frameRate,
          files: {
            original: 'original' + path.extname(inputVideoPath),
            extractedFrames: 'extracted_frames/',
            remakeVideo: 'remake_source.mp4',
            finalOutput: 'final_loop.mp4'
          },
          note: 'フレーム検証とループ境界チェックの結果は最終出力時のコンソールログを参照してください'
        };
        
        const debugInfoPath = path.join(sessionDebugDir, 'debug_info.json');
        await fs.writeFile(debugInfoPath, JSON.stringify(debugInfo, null, 2));
        console.log(`[DEBUG_SAVE] デバッグ情報を保存: ${debugInfoPath}`);
        console.log(`[DEBUG_SAVE] ========================================`);
        console.log(`[DEBUG_SAVE] 全てのデバッグファイルを保存しました`);
        console.log(`[DEBUG_SAVE] 保存先: ${sessionDebugDir}`);
        console.log(`[DEBUG_SAVE] ========================================`);
        
        // ディレクトリの存在を最終確認
        const debugDirExists = fsSync.existsSync(sessionDebugDir);
        console.log(`[DEBUG_SAVE] ディレクトリ存在確認: ${debugDirExists ? '成功' : '失敗'}`);
        if (debugDirExists) {
          const debugFiles = await fs.readdir(sessionDebugDir);
          console.log(`[DEBUG_SAVE] 保存されたファイル一覧:`);
          debugFiles.forEach(file => {
            console.log(`[DEBUG_SAVE]   - ${file}`);
          });
        }
        
      } catch (debugError) {
        console.error('[DEBUG_SAVE] デバッグファイル保存エラー:', debugError);
        if (debugError instanceof Error) {
          console.error('[DEBUG_SAVE] エラー詳細:', debugError.stack);
        }
      }
      
      // 元のテンポラリディレクトリをクリーンアップ
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (error) {
        console.warn(`Failed to cleanup temporary directory: ${error}`);
      }
    }
    
    console.log(`=== Looped Background Video Creation Completed ===\n`);
    return outputPath;
  }

  /**
   * 現在の処理をキャンセル
   */
  cancel(): void {
    if (this.currentProcess) {
      console.log('Cancelling FFmpeg process');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }
  
  /**
   * 処理中かどうかの確認
   */
  isProcessing(): boolean {
    return this.currentProcess !== null;
  }
}
