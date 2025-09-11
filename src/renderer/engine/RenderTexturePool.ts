import * as PIXI from 'pixi.js';

/**
 * RenderTexturePool - GPU テクスチャの再利用によるメモリ効率化
 * 
 * 毎フレームでのRenderTexture作成・破棄を避け、事前に確保したプールから
 * テクスチャを借りて返すことで、GPUメモリの断片化とGCオーバーヘッドを削減する。
 */
export class RenderTexturePool {
  private readonly availableTextures: PIXI.RenderTexture[] = [];
  private readonly borrowedTextures = new Set<PIXI.RenderTexture>();
  private readonly width: number;
  private readonly height: number;
  private readonly poolSize: number;
  private isDestroyed = false;

  /**
   * @param width テクスチャの幅
   * @param height テクスチャの高さ  
   * @param poolSize プールサイズ（推奨: 3-5個）
   */
  constructor(width: number, height: number, poolSize: number = 5) {
    // 安全のため整数化
    const intWidth = Math.round(width);
    const intHeight = Math.round(height);
    if (intWidth !== width || intHeight !== height) {
      // ここでの丸めはログのみ（UI分解能とズレる状況の検出用）
      console.warn(`RenderTexturePool: non-integer size (${width}x${height}) -> using ${intWidth}x${intHeight}`);
    }
    this.width = intWidth;
    this.height = intHeight;
    this.poolSize = poolSize;
    
    // プール内のテクスチャを事前作成
    for (let i = 0; i < poolSize; i++) {
      const texture = PIXI.RenderTexture.create({
        width,
        height,
        resolution: 1
      });
      this.availableTextures.push(texture);
    }
    
  }

  /**
   * プールからテクスチャを取得
   * プールが空の場合は新しいテクスチャを作成（例外的）
   */
  acquire(): PIXI.RenderTexture {
    if (this.isDestroyed) {
      throw new Error('RenderTexturePool has been destroyed');
    }
    
    let texture: PIXI.RenderTexture;
    
    if (this.availableTextures.length > 0) {
      texture = this.availableTextures.pop()!;
    } else {
      // プールが空の場合は新しいテクスチャを作成（警告出力）
      console.warn('RenderTexturePool: Pool exhausted, creating new texture');
      texture = PIXI.RenderTexture.create({
        width: this.width,
        height: this.height,
        resolution: 1
      });
    }
    
    this.borrowedTextures.add(texture);
    return texture;
  }

  /**
   * テクスチャをプールに返却
   */
  release(texture: PIXI.RenderTexture): void {
    if (this.isDestroyed) {
      // プールが破棄済みの場合はテクスチャも破棄
      texture.destroy(true);
      return;
    }
    
    if (!this.borrowedTextures.has(texture)) {
      console.warn('RenderTexturePool: Attempting to release texture not from this pool');
      return;
    }
    
    this.borrowedTextures.delete(texture);
    
    // プールサイズを超えた場合は破棄、そうでなければ再利用のため保持
    if (this.availableTextures.length < this.poolSize) {
      this.availableTextures.push(texture);
    } else {
      texture.destroy(true);
    }
  }

  /**
   * プール全体を破棄（エクスポート終了時）
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    
    // 利用可能なテクスチャをすべて破棄
    for (const texture of this.availableTextures) {
      texture.destroy(true);
    }
    this.availableTextures.length = 0;
    
    // 借り出し中のテクスチャも破棄
    for (const texture of this.borrowedTextures) {
      texture.destroy(true);
    }
    this.borrowedTextures.clear();
    
    this.isDestroyed = true;
  }

  /**
   * プールの状態を取得（デバッグ用）
   */
  getStatus(): { available: number; borrowed: number; poolSize: number } {
    return {
      available: this.availableTextures.length,
      borrowed: this.borrowedTextures.size,
      poolSize: this.poolSize
    };
  }
}
