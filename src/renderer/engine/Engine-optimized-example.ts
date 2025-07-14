// Engine.ts の最適化例（最小限の変更で実装可能）

import { RenderTexturePool } from '../export/video/RenderTexturePool';

export class Engine {
  // 既存のプロパティに追加
  private exportTexturePool?: RenderTexturePool;
  
  /**
   * 動画エクスポート開始時に呼び出す
   */
  prepareForExport(width: number, height: number): void {
    
    // テクスチャプールを初期化（3つで十分）
    this.exportTexturePool = new RenderTexturePool(width, height, 3);
  }
  
  /**
   * 最適化されたオフスクリーンフレームキャプチャ
   */
  captureOffscreenFrameOptimized(
    outputWidth: number, 
    outputHeight: number, 
    includeDebugVisuals: boolean = false
  ): Uint8Array {
    try {
      // エクスポート準備がされていない場合は自動初期化
      if (!this.exportTexturePool) {
        this.prepareForExport(outputWidth, outputHeight);
      }
      
      // デバッグビジュアルの一時的な制御（既存コード）
      const originalGridVisible = this.gridOverlay?.isVisible() || false;
      const originalDebugEnabled = this.debugManager?.isEnabled() || false;
      
      if (!includeDebugVisuals) {
        if (this.gridOverlay) {
          this.gridOverlay.hide();
        }
        if (this.debugManager) {
          this.debugManager.setEnabled(false);
        }
      }
      
      // プールからテクスチャを取得（新規作成しない）
      const renderTexture = this.exportTexturePool!.acquire();
      
      try {
        // メインステージをオフスクリーンテクスチャに描画
        this.app.renderer.render(this.app.stage, { renderTexture });
        
        // ピクセルデータを取得
        const pixels = this.app.renderer.extract.pixels(renderTexture);
        
        return pixels;
        
      } finally {
        // テクスチャをプールに返却（破棄しない）
        this.exportTexturePool!.release(renderTexture);
      }
      
    } catch (error) {
      console.error('Engine: Optimized frame capture error:', error);
      throw new Error(`Failed to capture frame: ${error.message}`);
    } finally {
      // デバッグビジュアルの設定を復元
      if (!includeDebugVisuals) {
        if (this.gridOverlay && originalGridVisible) {
          this.gridOverlay.show();
        }
        if (this.debugManager && originalDebugEnabled) {
          this.debugManager.setEnabled(true);
        }
      }
    }
  }
  
  /**
   * エクスポート終了時のクリーンアップ
   */
  cleanupExportResources(): void {
    if (this.exportTexturePool) {
      const stats = this.exportTexturePool.getStats();
      
      this.exportTexturePool.destroy();
      this.exportTexturePool = undefined;
      
    }
  }
  
  // 既存のcaptureOffscreenFrameをラップ（後方互換性）
  captureOffscreenFrame(
    outputWidth: number, 
    outputHeight: number, 
    includeDebugVisuals: boolean = false
  ): Uint8Array {
    // エクスポート中はプール版を使用
    if (this.exportTexturePool) {
      return this.captureOffscreenFrameOptimized(
        outputWidth, 
        outputHeight, 
        includeDebugVisuals
      );
    }
    
    // それ以外は既存の実装を使用
    return this.captureOffscreenFrameOriginal(
      outputWidth, 
      outputHeight, 
      includeDebugVisuals
    );
  }
}