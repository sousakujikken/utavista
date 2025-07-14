/**
 * FrameBufferManager - SharedArrayBufferによるゼロコピーフレーム管理
 * 
 * Electronのマルチプロセス間で効率的にフレームデータを共有
 * メモリコピーを最小限に抑え、パフォーマンスを向上
 */

export interface FrameBuffer {
  buffer: SharedArrayBuffer | ArrayBuffer;
  width: number;
  height: number;
  timestamp: number;
  frameIndex: number;
}

export class FrameBufferManager {
  private bufferPool: (SharedArrayBuffer | ArrayBuffer)[] = [];
  private inUse: Map<SharedArrayBuffer | ArrayBuffer, FrameBuffer> = new Map();
  private bufferSize: number;
  private poolSize: number;
  private useSharedBuffer: boolean;

  constructor(width: number, height: number, poolSize: number = 10) {
    this.bufferSize = width * height * 4; // RGBA
    this.poolSize = poolSize;
    
    // SharedArrayBufferが利用可能かチェック
    this.useSharedBuffer = typeof SharedArrayBuffer !== 'undefined';
    
    if (!this.useSharedBuffer) {
      console.warn('FrameBufferManager: SharedArrayBuffer not available, falling back to ArrayBuffer');
    }
    
    this.initializePool();
  }

  /**
   * バッファプールの初期化
   */
  private initializePool(): void {
    
    for (let i = 0; i < this.poolSize; i++) {
      const buffer = this.useSharedBuffer 
        ? new SharedArrayBuffer(this.bufferSize)
        : new ArrayBuffer(this.bufferSize);
      
      this.bufferPool.push(buffer);
    }
    
    const totalMemoryMB = (this.poolSize * this.bufferSize) / (1024 * 1024);
  }

  /**
   * フレームバッファを取得
   */
  acquireBuffer(width: number, height: number, frameIndex: number): FrameBuffer {
    let buffer = this.bufferPool.find(b => !this.inUse.has(b));
    
    if (!buffer) {
      console.warn('FrameBufferManager: Pool exhausted, creating new buffer');
      buffer = this.useSharedBuffer 
        ? new SharedArrayBuffer(this.bufferSize)
        : new ArrayBuffer(this.bufferSize);
      
      this.bufferPool.push(buffer);
    }
    
    const frameBuffer: FrameBuffer = {
      buffer,
      width,
      height,
      timestamp: Date.now(),
      frameIndex
    };
    
    this.inUse.set(buffer, frameBuffer);
    return frameBuffer;
  }

  /**
   * フレームバッファを返却
   */
  releaseBuffer(frameBuffer: FrameBuffer): void {
    if (this.inUse.has(frameBuffer.buffer)) {
      this.inUse.delete(frameBuffer.buffer);
      
      // バッファをクリア（セキュリティとデバッグのため）
      if (process.env.NODE_ENV === 'development') {
        const view = new Uint8Array(frameBuffer.buffer);
        view.fill(0);
      }
    }
  }

  /**
   * 統計情報の取得
   */
  getStats(): {
    totalBuffers: number;
    inUse: number;
    available: number;
    memoryUsageMB: number;
    usingSharedBuffer: boolean;
  } {
    return {
      totalBuffers: this.bufferPool.length,
      inUse: this.inUse.size,
      available: this.bufferPool.length - this.inUse.size,
      memoryUsageMB: (this.bufferPool.length * this.bufferSize) / (1024 * 1024),
      usingSharedBuffer: this.useSharedBuffer
    };
  }

  /**
   * メモリ使用量の推定
   */
  estimateMemoryUsage(frameCount: number, fps: number): {
    requiredBuffers: number;
    memoryMB: number;
    recommendation: string;
  } {
    // 同時に必要なバッファ数を推定（エンコーディングの遅延を考慮）
    const concurrentBuffers = Math.min(fps / 2, 30); // 最大0.5秒分
    const requiredBuffers = Math.min(concurrentBuffers, frameCount);
    const memoryMB = (requiredBuffers * this.bufferSize) / (1024 * 1024);
    
    let recommendation = '';
    if (requiredBuffers > this.poolSize) {
      recommendation = `プールサイズを${requiredBuffers}に増やすことを推奨`;
    } else {
      recommendation = '現在のプールサイズで十分です';
    }
    
    return {
      requiredBuffers,
      memoryMB,
      recommendation
    };
  }

  /**
   * プールの破棄
   */
  destroy(): void {
    this.bufferPool = [];
    this.inUse.clear();
  }
}