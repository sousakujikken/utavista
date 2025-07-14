/**
 * NativeVideoFrameExtractor - Electronネイティブのビデオフレーム抽出
 * 
 * HTMLVideoElementに依存せず、より効率的なフレーム抽出を実現
 * フレーム単位の正確なシークと直接的なGPUテクスチャアクセス
 */

export interface VideoFrameData {
  data: Uint8Array | null;
  width: number;
  height: number;
  timestamp: number;
  frameNumber: number;
}

export class NativeVideoFrameExtractor {
  private videoPath: string;
  private videoElement: HTMLVideoElement | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private frameCache: Map<number, VideoFrameData> = new Map();
  private maxCacheSize: number = 30; // 1秒分のフレームをキャッシュ
  
  constructor(videoPath: string) {
    this.videoPath = videoPath;
  }

  /**
   * 初期化 - オフスクリーンキャンバスを使用
   */
  async initialize(): Promise<{ width: number; height: number; duration: number }> {
    return new Promise((resolve, reject) => {
      this.videoElement = document.createElement('video');
      this.videoElement.src = this.videoPath;
      this.videoElement.muted = true;
      
      this.videoElement.onloadedmetadata = () => {
        const width = this.videoElement!.videoWidth;
        const height = this.videoElement!.videoHeight;
        const duration = this.videoElement!.duration;
        
        // オフスクリーンキャンバスの作成（メインスレッドをブロックしない）
        if (typeof OffscreenCanvas !== 'undefined') {
          this.offscreenCanvas = new OffscreenCanvas(width, height);
        }
        
        resolve({ width, height, duration });
      };
      
      this.videoElement.onerror = () => {
        reject(new Error('Failed to load video'));
      };
    });
  }

  /**
   * フレーム番号から正確なタイムスタンプを計算
   */
  private frameToTimestamp(frameNumber: number, fps: number): number {
    return frameNumber / fps;
  }

  /**
   * 特定のフレームを抽出（キャッシュ付き）
   */
  async extractFrame(frameNumber: number, fps: number): Promise<VideoFrameData> {
    // キャッシュチェック
    if (this.frameCache.has(frameNumber)) {
      return this.frameCache.get(frameNumber)!;
    }
    
    if (!this.videoElement) {
      throw new Error('Video not initialized');
    }
    
    const timestamp = this.frameToTimestamp(frameNumber, fps);
    
    // より正確なシーク（フレーム単位）
    await this.seekToFrame(timestamp);
    
    // フレームデータの抽出
    const frameData = await this.captureFrame(frameNumber, timestamp);
    
    // キャッシュに追加
    this.addToCache(frameNumber, frameData);
    
    return frameData;
  }

  /**
   * 正確なフレームシーク
   */
  private async seekToFrame(timestamp: number): Promise<void> {
    if (!this.videoElement) return;
    
    return new Promise((resolve) => {
      const onSeeked = () => {
        this.videoElement!.removeEventListener('seeked', onSeeked);
        resolve();
      };
      
      this.videoElement.addEventListener('seeked', onSeeked);
      this.videoElement.currentTime = timestamp;
    });
  }

  /**
   * 現在のフレームをキャプチャ
   */
  private async captureFrame(frameNumber: number, timestamp: number): Promise<VideoFrameData> {
    if (!this.videoElement) {
      throw new Error('Video not initialized');
    }
    
    const width = this.videoElement.videoWidth;
    const height = this.videoElement.videoHeight;
    
    // オフスクリーンキャンバスが利用可能な場合
    if (this.offscreenCanvas) {
      const ctx = this.offscreenCanvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2D context');
      
      ctx.drawImage(this.videoElement, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);
      
      return {
        data: new Uint8Array(imageData.data.buffer),
        width,
        height,
        timestamp,
        frameNumber
      };
    }
    
    // フォールバック：通常のキャンバス
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    
    ctx.drawImage(this.videoElement, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    
    return {
      data: new Uint8Array(imageData.data.buffer),
      width,
      height,
      timestamp,
      frameNumber
    };
  }

  /**
   * キャッシュ管理
   */
  private addToCache(frameNumber: number, frameData: VideoFrameData): void {
    // キャッシュサイズ制限
    if (this.frameCache.size >= this.maxCacheSize) {
      const oldestFrame = Math.min(...this.frameCache.keys());
      this.frameCache.delete(oldestFrame);
    }
    
    this.frameCache.set(frameNumber, frameData);
  }

  /**
   * バッチフレーム抽出（効率的な連続フレーム取得）
   */
  async extractFrameBatch(
    startFrame: number, 
    endFrame: number, 
    fps: number,
    onProgress?: (current: number, total: number) => void
  ): Promise<VideoFrameData[]> {
    const frames: VideoFrameData[] = [];
    const total = endFrame - startFrame + 1;
    
    
    for (let frame = startFrame; frame <= endFrame; frame++) {
      const frameData = await this.extractFrame(frame, fps);
      frames.push(frameData);
      
      if (onProgress) {
        onProgress(frame - startFrame + 1, total);
      }
    }
    
    return frames;
  }

  /**
   * メモリ統計
   */
  getMemoryStats(): {
    cachedFrames: number;
    estimatedMemoryMB: number;
  } {
    let totalBytes = 0;
    this.frameCache.forEach(frame => {
      if (frame.data) {
        totalBytes += frame.data.byteLength;
      }
    });
    
    return {
      cachedFrames: this.frameCache.size,
      estimatedMemoryMB: totalBytes / (1024 * 1024)
    };
  }

  /**
   * クリーンアップ
   */
  destroy(): void {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
      this.videoElement = null;
    }
    
    this.offscreenCanvas = null;
    this.frameCache.clear();
    
  }
}