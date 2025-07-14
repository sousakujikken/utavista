/**
 * RenderTexturePool - リソースプーリングによるメモリ効率化
 * 
 * 毎フレーム新規作成ではなく、事前確保したテクスチャを再利用
 * GPUメモリの断片化を防ぎ、パフォーマンスを向上
 */
import * as PIXI from 'pixi.js';

export class RenderTexturePool {
  private pool: PIXI.RenderTexture[] = [];
  private inUse: Set<PIXI.RenderTexture> = new Set();
  private width: number;
  private height: number;
  private maxPoolSize: number;

  constructor(width: number, height: number, maxPoolSize: number = 5) {
    this.width = width;
    this.height = height;
    this.maxPoolSize = maxPoolSize;
    
    // 事前にプールを初期化
    this.initializePool();
  }

  /**
   * プールの初期化 - 事前にテクスチャを確保
   */
  private initializePool(): void {
    
    for (let i = 0; i < this.maxPoolSize; i++) {
      const renderTexture = PIXI.RenderTexture.create({
        width: this.width,
        height: this.height,
        resolution: 1
      });
      this.pool.push(renderTexture);
    }
  }

  /**
   * テクスチャを取得（プールから借りる）
   */
  acquire(): PIXI.RenderTexture {
    let texture: PIXI.RenderTexture | undefined;
    
    // 利用可能なテクスチャを探す
    for (const rt of this.pool) {
      if (!this.inUse.has(rt)) {
        texture = rt;
        break;
      }
    }
    
    // プールが空の場合は新規作成（警告付き）
    if (!texture) {
      console.warn('RenderTexturePool: Pool exhausted, creating new texture');
      texture = PIXI.RenderTexture.create({
        width: this.width,
        height: this.height,
        resolution: 1
      });
      this.pool.push(texture);
    }
    
    this.inUse.add(texture);
    return texture;
  }

  /**
   * テクスチャを返却（プールに戻す）
   */
  release(texture: PIXI.RenderTexture): void {
    if (this.inUse.has(texture)) {
      this.inUse.delete(texture);
      
      // テクスチャをクリア（次回使用のため）
      const renderer = PIXI.Renderer.lastObjectRendered;
      if (renderer) {
        renderer.renderTexture.clear(texture);
      }
    }
  }

  /**
   * プールの破棄
   */
  destroy(): void {
    
    for (const texture of this.pool) {
      texture.destroy(true);
    }
    
    this.pool = [];
    this.inUse.clear();
  }

  /**
   * プールの統計情報
   */
  getStats(): { total: number; inUse: number; available: number } {
    return {
      total: this.pool.length,
      inUse: this.inUse.size,
      available: this.pool.length - this.inUse.size
    };
  }
}