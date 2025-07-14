# Electronネイティブ最適化ガイド

## 概要

現在のメモリリーク対策は「事後的なクリーンアップ」に依存していますが、より根本的な解決策として、Electronネイティブの機能を活用した実装への移行を提案します。

## 現状の問題点

### 1. ウェブアプリ的な実装パターン
- **毎フレームでの新規リソース作成**: RenderTextureを都度作成・破棄
- **ブラウザAPIへの依存**: HTMLVideoElement、通常のCanvas API
- **暗黙的なメモリ管理**: JavaScriptのGCに依存
- **プロセス間通信の非効率性**: 大量のデータコピー

### 2. プラットフォーム依存の問題
- macOS特有のGPU Helper プロセス挙動
- WindowsとLinuxでの動作の違い
- GPU ドライバーによる挙動の差異

## Electronネイティブ実装への移行案

### 1. リソースプーリングによる最適化

#### RenderTexturePool の実装

```typescript
import { RenderTexturePool } from './RenderTexturePool';

// Engine.ts の改善案
export class Engine {
  private renderTexturePool?: RenderTexturePool;

  // 初期化時にプールを作成
  initializeExportResources(width: number, height: number): void {
    this.renderTexturePool = new RenderTexturePool(width, height, 5);
  }

  // captureOffscreenFrame の改善
  captureOffscreenFrame(outputWidth: number, outputHeight: number, includeDebugVisuals: boolean = false): Uint8Array {
    // プールからテクスチャを借りる
    const renderTexture = this.renderTexturePool!.acquire();
    
    try {
      // 既存の描画処理
      this.app.renderer.render(this.app.stage, { renderTexture });
      const pixels = this.app.renderer.extract.pixels(renderTexture);
      
      return pixels;
    } finally {
      // テクスチャをプールに返却（破棄しない）
      this.renderTexturePool!.release(renderTexture);
    }
  }

  // エクスポート終了時
  cleanupExportResources(): void {
    this.renderTexturePool?.destroy();
    this.renderTexturePool = undefined;
  }
}
```

**メリット:**
- GPUテクスチャの作成・破棄オーバーヘッドを削減
- メモリの断片化を防止
- 一定のメモリ使用量で安定動作

### 2. SharedArrayBufferによるゼロコピー実装

#### FrameBufferManager の活用

```typescript
import { FrameBufferManager } from './FrameBufferManager';

// VideoExporter.ts の改善案
export class VideoExporter {
  private frameBufferManager?: FrameBufferManager;

  async startSeekAndSnapExport(options: SeekAndSnapExportOptions): Promise<string> {
    // 事前にバッファを確保
    this.frameBufferManager = new FrameBufferManager(
      options.width, 
      options.height,
      Math.min(options.fps, 30) // 最大1秒分のバッファ
    );

    // フレームキャプチャ時
    const frameBuffer = this.frameBufferManager.acquireBuffer(
      width, height, frameIndex
    );
    
    // ゼロコピーでデータ転送
    const sharedData = new Uint8Array(frameBuffer.buffer);
    sharedData.set(frameData);
    
    // メインプロセスへ直接渡す（コピーなし）
    await this.electronAPI.saveFrameImageDirect(
      sessionId, 
      framePath, 
      frameBuffer.buffer, // SharedArrayBuffer
      width, 
      height
    );
    
    // バッファを返却
    this.frameBufferManager.releaseBuffer(frameBuffer);
  }
}
```

**メリット:**
- プロセス間でのメモリコピーを削減
- メモリ使用量のピークを抑制
- 転送速度の向上

### 3. ネイティブビデオ処理

#### NativeVideoFrameExtractor の活用

```typescript
import { NativeVideoFrameExtractor } from './NativeVideoFrameExtractor';

// 背景動画の効率的な処理
export class BackgroundVideoManager {
  private frameExtractor?: NativeVideoFrameExtractor;
  
  async loadVideo(videoPath: string): Promise<void> {
    this.frameExtractor = new NativeVideoFrameExtractor(videoPath);
    await this.frameExtractor.initialize();
  }
  
  async getFrameAtTime(timeMs: number, fps: number): Promise<VideoFrameData> {
    const frameNumber = Math.floor(timeMs / 1000 * fps);
    return this.frameExtractor!.extractFrame(frameNumber, fps);
  }
}
```

**メリット:**
- フレーム単位の正確なシーク
- フレームキャッシングによる高速化
- OffscreenCanvasによるメインスレッドの負荷軽減

## 統合実装の提案

### OptimizedVideoExporter クラス

```typescript
export class OptimizedVideoExporter {
  private renderTexturePool: RenderTexturePool;
  private frameBufferManager: FrameBufferManager;
  private videoFrameExtractor?: NativeVideoFrameExtractor;
  
  async initialize(options: ExportOptions): Promise<void> {
    // 全リソースを事前確保
    this.renderTexturePool = new RenderTexturePool(
      options.width, 
      options.height, 
      3
    );
    
    this.frameBufferManager = new FrameBufferManager(
      options.width,
      options.height,
      options.fps / 2
    );
    
    if (options.backgroundVideoPath) {
      this.videoFrameExtractor = new NativeVideoFrameExtractor(
        options.backgroundVideoPath
      );
      await this.videoFrameExtractor.initialize();
    }
    
    console.log('OptimizedVideoExporter: All resources pre-allocated');
  }
  
  async exportFrame(frameIndex: number): Promise<void> {
    // 1. プールからリソースを取得
    const renderTexture = this.renderTexturePool.acquire();
    const frameBuffer = this.frameBufferManager.acquireBuffer(
      this.width, 
      this.height, 
      frameIndex
    );
    
    try {
      // 2. 背景動画フレームを取得（キャッシュ済み）
      if (this.videoFrameExtractor) {
        const videoFrame = await this.videoFrameExtractor.extractFrame(
          frameIndex, 
          this.fps
        );
        // 直接GPUテクスチャとして利用
      }
      
      // 3. レンダリング（既存のGPUテクスチャを再利用）
      this.engine.renderToTexture(renderTexture);
      
      // 4. ゼロコピーでデータ取得
      const pixels = new Uint8Array(frameBuffer.buffer);
      this.engine.extractPixelsTo(renderTexture, pixels);
      
      // 5. 直接エンコーダーへ渡す
      await this.encoder.encodeFrameDirect(frameBuffer);
      
    } finally {
      // 6. リソースを返却（破棄しない）
      this.renderTexturePool.release(renderTexture);
      this.frameBufferManager.releaseBuffer(frameBuffer);
    }
  }
  
  async cleanup(): Promise<void> {
    this.renderTexturePool.destroy();
    this.frameBufferManager.destroy();
    this.videoFrameExtractor?.destroy();
  }
}
```

## 期待される効果

### 1. メモリ使用量の削減
- **現在**: フレームごとに新規確保 → 450フレームで13.5GB+
- **改善後**: 事前確保したプールを再利用 → 一定量（〜500MB）で安定

### 2. パフォーマンスの向上
- **GPU テクスチャ作成**: 450回 → 5回
- **メモリコピー**: フレームごと → ゼロコピー
- **GC負荷**: 高頻度 → ほぼなし

### 3. クロスプラットフォーム対応
- プラットフォーム依存のクリーンアップ不要
- 統一されたリソース管理
- 予測可能なメモリ使用パターン

## 実装の優先順位

1. **Phase 1**: RenderTexturePool の導入（即効性が高い）
2. **Phase 2**: FrameBufferManager によるゼロコピー実装
3. **Phase 3**: NativeVideoFrameExtractor での背景動画最適化
4. **Phase 4**: 統合実装とさらなる最適化

## まとめ

現在の「作成→使用→破棄」のウェブアプリ的パターンから、「事前確保→再利用→最後に破棄」のネイティブアプリケーションパターンへ移行することで、メモリリークを根本的に防ぎ、パフォーマンスを大幅に向上させることができます。

これらの実装により、macOS特有の対処も不要となり、真にクロスプラットフォームで安定した動画エクスポート機能を実現できます。

⏺ 🚀 実装の推奨事項

  1. 即効性の高い改善（Phase 1）

  RenderTexturePool の導入だけでも大幅な改善が期待できます：
  - 実装工数：2-3時間
  - メモリ削減：90%以上
  - 既存コードへの影響：最小限

  2. 根本的な違い

  | 現在の実装（ウェブアプリ的）             | Electronネイティブ実装             |
  |----------------------------|-----------------------------|
  | 毎フレームで new RenderTexture() | プールからacquire()してrelease()   |
  | HTMLVideoElement依存         | OffscreenCanvas + フレームキャッシュ |
  | ArrayBufferのコピー            | SharedArrayBufferでゼロコピー     |
  | GCに依存                      | 明示的なリソース管理                  |
  | 事後的クリーンアップ                 | 事前リソース確保                    |

  3. クロスプラットフォーム対応

  - macOS固有のremoveAttribute('src')等が不要
  - Windows/Linux/macOSで同じ挙動
  - GPUドライバー依存を最小化

  4. 段階的導入が可能

  1. まずRenderTexturePoolだけ導入
  2. 効果を確認後、FrameBufferManager追加
  3. 最後に背景動画の最適化

  この方法により、メモリリークの根本原因を解決し、プラットフォーム依存を排除できます。