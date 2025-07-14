# メモリリーク修正レポート

## 概要

Visiblyrics v0.1.0において、動画出力機能でElectron Helper (GPU)プロセスのメモリが100GBまで増加し、背景動画再生がクラッシュする問題が発生していました。この問題を調査・修正した結果、動画出力が正常に完了するようになりました。

## 問題の症状

### 主要症状
- **Electron Helper (GPU)プロセス**のメモリ使用量が動画出力に伴い継続的に増加
- 100GB到達時点で背景動画再生機能がクラッシュ
- プレビューで背景動画が常に表示されなくなる
- 長時間の動画出力が完了しない

### 影響範囲
- 動画出力機能全体
- 背景動画プレビュー機能
- PIXIJSベースのレンダリング全般

## 根本原因の特定

### 1. PIXI RenderTextureの不完全な破棄

**問題コード:**
```typescript
// Engine.ts - captureOffscreenFrame() メソッド
const renderTexture = PIXI.RenderTexture.create({
  width: outputWidth,
  height: outputHeight,
  resolution: 1
});

// 問題: baseTextureが破棄されていない
renderTexture.destroy(); // ❌ 不完全
```

**原因:**
- 毎フレームの動画出力で新しい`PIXI.RenderTexture`を作成
- `destroy()`だけではbaseTextureが残り、WebGLテクスチャがGPUメモリに蓄積
- 450フレーム（15秒@30fps）× 約30MB = 13.5GB以上のリーク

### 2. 背景動画PIXIテクスチャの蓄積

**問題箇所:**
```typescript
// ElectronMediaManager.ts - createPixiVideoTexture() メソッド
createPixiVideoTexture(): any | null {
  // 問題: 既存テクスチャが破棄されずに新しいものを作成
  const videoTexture = PIXI.Texture.from(this.backgroundVideo);
  return videoTexture; // ❌ 古いテクスチャがリーク
}
```

**原因:**
- 背景動画変更時に古い`VideoTexture`が破棄されない
- HTMLVideoElementのクリーンアップが不完全（`src = ''`のみ）

### 3. GPU Helper プロセス監視機能の欠如

**問題:**
- JavaScript Heapメモリのみ監視
- GPU Helper プロセスのメモリが監視対象外
- メモリリークの発生源が特定できない

## 実装した修正

### 修正1: PIXI RenderTextureの完全破棄

**修正コード:**
```typescript
// Engine.ts - captureOffscreenFrame() メソッド
// オフスクリーンテクスチャをクリーンアップ（baseTextureも含めて完全に破棄）
renderTexture.destroy(true); // ✅ baseTextureも破棄
```

**効果:**
- WebGLテクスチャとbaseTextureを完全に解放
- フレームごとのGPUメモリリークを防止

### 修正2: 背景動画テクスチャの適切な管理

**修正コード:**
```typescript
// ElectronMediaManager.ts
export class ElectronMediaManager {
  private currentVideoTexture: any | null = null; // テクスチャ参照を保持

  createPixiVideoTexture(): any | null {
    // 既存のテクスチャがある場合は破棄
    if (this.currentVideoTexture) {
      console.log('Destroying existing PIXI VideoTexture');
      this.currentVideoTexture.destroy(true); // baseTextureも含めて破棄
      this.currentVideoTexture = null;
    }
    
    const videoTexture = PIXI.Texture.from(this.backgroundVideo);
    this.currentVideoTexture = videoTexture; // 参照を保持
    return videoTexture;
  }

  cleanup() {
    // VideoTextureの破棄
    if (this.currentVideoTexture) {
      this.currentVideoTexture.destroy(true);
      this.currentVideoTexture = null;
    }
    
    // HTMLVideoElementの完全なクリーンアップ
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
      this.backgroundVideo.removeAttribute('src'); // srcを完全に削除
      this.backgroundVideo.load(); // 内部バッファをクリア
      this.backgroundVideo = null;
    }
  }
}
```

**効果:**
- 背景動画変更時の旧テクスチャリークを防止
- HTMLVideoElementの内部バッファも確実にクリア

### 修正3: GPU Helper プロセス監視機能の実装

**新機能:**
```typescript
// main.ts - GPU/システムメモリ情報取得
ipcMain.handle('system:getMemoryInfo', async () => {
  const metrics = app.getAppMetrics();
  
  // GPU Helperプロセスを特定（複数の方法で検索）
  let gpuProcess = processMemory.find(p => p.type === 'GPU');
  if (!gpuProcess) {
    gpuProcess = processMemory.find(p => 
      p.type === 'Utility' && 
      (p.name?.toLowerCase().includes('gpu') || false)
    );
  }
  
  const gpuProcessMemory = gpuProcess ? 
    Math.round(gpuProcess.memory.workingSetSize / 1024) : 0;
  
  return { gpuProcessMemory, ... };
});
```

**効果:**
- Electron Helper (GPU)プロセスのリアルタイム監視
- メモリリーク発生の早期検知
- デバッグ情報の詳細出力

### 修正4: 15秒メモリリークテスト機能

**新機能:**
- プロジェクトタブに専用テストボタンを追加
- 実際の動画出力プロセスをシミュレーション
- JavaScript HeapとGPU Helper の両方を監視
- 150フレームごとのクリーンアップ効果を確認

## 修正結果

### パフォーマンス改善
- **動画出力完了**: 15秒テストが最後まで実行可能
- **メモリ使用量安定化**: GPU Helper プロセスの異常増加を抑制
- **背景動画安定性**: プレビュー機能のクラッシュが解消

### 監視機能強化
- **リアルタイム監視**: GPU Helper メモリの変化を追跡可能
- **詳細ログ**: フレームごとのメモリ使用量を出力
- **問題の早期発見**: メモリリーク閾値での警告表示

## 技術的学習事項

### PIXI.js メモリ管理のベストプラクティス
1. **RenderTexture**: `destroy(true)`でbaseTextureも破棄
2. **VideoTexture**: 明示的な参照管理と破棄
3. **リソース追跡**: 作成したテクスチャの寿命を管理

### Electron プロセス監視
1. **app.getAppMetrics()**: 全プロセス情報の取得
2. **GPU Helper 特定**: macOSではUtilityプロセスとして動作する場合
3. **IPCシリアライゼーション**: 複雑なオブジェクトの安全な転送

### WebGL リソース管理
1. **GPU メモリリーク**: JavaScript GCでは解放されない
2. **明示的破棄**: WebGLリソースは手動管理が必要
3. **定期クリーンアップ**: `gl.finish()` + `gl.flush()` + 強制GC

## 今後の改善案

### 追加の最適化
1. **RenderTexture再利用**: 毎回作成ではなく使い回し
2. **テクスチャプール**: 頻繁に作成されるリソースの事前確保
3. **メモリ使用量アラート**: 閾値超過時の自動警告

### 監視機能拡張
1. **WebGL コンテキスト監視**: テクスチャ数、バッファ数の追跡
2. **自動メモリ解放**: 閾値到達時の強制クリーンアップ
3. **パフォーマンス統計**: フレームレート、メモリ効率の測定

## 結論

主要なメモリリーク原因は**PIXI RenderTextureの不完全な破棄**でした。`destroy(true)`による完全破棄と、背景動画テクスチャの適切な管理により問題を解決しました。また、GPU Helper プロセス監視機能により、今後の類似問題の早期発見が可能になりました。

この修正により、長時間の動画出力が安定して実行できるようになり、アプリケーションの信頼性が大幅に向上しました。