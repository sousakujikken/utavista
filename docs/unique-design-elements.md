# 独特の設計要素

## 概要

UTAVISTAには、一般的な動画編集・アニメーションツールとは異なる、歌詞アニメーションシステム特有の独特な設計要素が多数含まれています。これらの設計は、カラオケ歌詞アニメーションの特殊な要求に対応するため、従来のアプローチを見直し、新しい解決策を実装したものです。

## ParameterManagerV2: 完全初期化ベース設計

### 継承チェーン排除の設計思想

**従来の問題（継承ベース）**:
```typescript
// 問題のあった継承チェーン
DEFAULT_PARAMETERS → templateDefaults → globalParams → parentParams → objectParams
```

**新しいアプローチ（完全初期化ベース）**:
```typescript
// V2での完全初期化
class ParameterManagerV2 {
  initializePhrase(phraseId: string, templateId: string, globalSettings?: Partial<StandardParameters>): void {
    // 1. 完全なベースパラメータを作成
    const params = { ...DEFAULT_PARAMETERS };
    
    // 2. テンプレートデフォルトを適用
    const templateDefaults = this.getTemplateDefaults(templateId);
    Object.assign(params, templateDefaults);
    
    // 3. グローバル設定を適用
    if (globalSettings) {
      Object.assign(params, globalSettings);
    }
    
    // 4. 完全なパラメータセットとして保存
    this.phraseParameters.set(phraseId, params);
  }
}
```

**なぜ完全初期化なのか**:
1. **予測可能性**: パラメータ変更の結果が明確
2. **UI一致性**: 表示される値と実際の値が完全一致
3. **パフォーマンス**: 実行時の継承計算が不要
4. **デバッグ性**: 値の出所が明確

### 個別設定保護システム

```typescript
// 個別設定の保護機能
updateGlobalDefaults(updates: Partial<StandardParameters>): void {
  Object.assign(this.globalDefaults, updates);
  
  // 個別設定有効なフレーズは保護（更新しない）
  this.phraseParameters.forEach((params, phraseId) => {
    const isIndividual = this.phraseIndividualSettings.get(phraseId);
    if (!isIndividual) {
      // 個別設定無効の場合のみグローバル変更を適用
      Object.assign(params, updates);
    }
  });
}
```

**保護システムの重要性**:
- ユーザーの意図した個別設定を保持
- グローバル変更の予期しない影響を防止
- 明示的な設定変更のみを反映

## シークアンドスナップ動画エクスポート方式

### プレビュー機能活用の統一シーク処理

**独特なアプローチ**:
```typescript
// 統一シーク処理の活用
class VideoExporter {
  async exportFrame(frameIndex: number, targetTime: number): Promise<Uint8Array> {
    // 1. プレビューと同じシーク機能を使用
    await this.engine.seek(targetTime);
    
    // 2. 背景動画も同じシーク機能で同期
    await this.backgroundVideoManager.seekToTime(targetTime);
    
    // 3. プレビューと同じレンダリングパイプラインでキャプチャ
    const frameData = this.engine.captureOffscreenFrame(outputWidth, outputHeight);
    
    return frameData;
  }
}
```

**なぜこの方式なのか**:
1. **一致保証**: プレビューと出力結果の完全一致
2. **実装効率**: 既存のシーク機能を再利用
3. **同期精度**: 音声・背景動画・歌詞の統一同期
4. **デバッグ性**: プレビューで事前確認可能

### スモールバッチ処理によるメモリ効率化

```typescript
// 150フレーム単位のバッチ処理
const BATCH_SIZE = 150; // 5秒間@30fps

async exportVideo(options: ExportOptions): Promise<string> {
  const totalFrames = Math.ceil(options.duration * options.fps / 1000);
  
  for (let batchStart = 0; batchStart < totalFrames; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalFrames);
    
    // バッチ処理
    await this.processBatch(batchStart, batchEnd, options);
    
    // バッチ間でメモリクリーンアップ
    await this.cleanupBatchResources();
  }
}
```

**スモールバッチの利点**:
- メモリ使用量の制限
- プログレス報告の粒度
- エラー発生時の部分回復
- 長時間エクスポートの安定性

## TextMetricsCache: 正規化文字メトリクス

### フォントサイズに依存しない正規化設計

```typescript
class TextMetricsCache {
  private readonly BASE_FONT_SIZE = 100; // 基準サイズで正規化
  
  getMetrics(char: string, fontFamily: string, fontSize: number): CharMetrics {
    // 1. 基準サイズでの測定値を取得
    const baseMetrics = this.getBaseMetrics(char, fontFamily);
    
    // 2. 要求サイズにスケーリング
    const scale = fontSize / this.BASE_FONT_SIZE;
    
    return {
      width: baseMetrics.width * scale,
      height: baseMetrics.height * scale,
      baselineOffset: baseMetrics.baselineOffset * scale
    };
  }
}
```

**なぜ正規化するのか**:
1. **効率性**: サイズ毎の重複測定を回避
2. **一貫性**: スケーリング計算の統一化
3. **キャッシュ効率**: 基準サイズのみキャッシュ
4. **精度保持**: 浮動小数点スケーリングによる高精度

### 文字クラス別最適化

```typescript
// 8言語クラス対応
enum CharacterClass {
  UppercaseAscii = 'A-Z',
  LowercaseAscii = 'a-z', 
  Digits = '0-9',
  Hiragana = 'ひらがな',
  Katakana = 'カタカナ',
  Kanji = '漢字',
  Punctuation = '句読点',
  Other = 'その他'
}

getEstimatedMetrics(char: string, fontFamily: string, fontSize: number): CharMetrics {
  const charClass = this.classifyCharacter(char);
  const representativeChar = this.getRepresentativeChar(charClass);
  
  // 代表文字のメトリクスを使用（高速推定）
  return this.getMetrics(representativeChar, fontFamily, fontSize);
}
```

## Electronネイティブフレーム抽出システム

### HTMLVideoElement非依存の設計

```typescript
class NativeVideoFrameExtractor {
  private offscreenCanvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  
  async extractFrame(frameNumber: number, fps: number): Promise<VideoFrameData> {
    // 1. ネイティブシーク（HTMLVideoElement非依存）
    const targetTime = frameNumber / fps;
    await this.nativeSeek(targetTime);
    
    // 2. OffscreenCanvasで描画（メインスレッド非ブロック）
    this.ctx.drawImage(this.videoElement, 0, 0);
    
    // 3. フレームデータ抽出
    const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    
    return {
      frameNumber,
      timestamp: targetTime,
      data: imageData.data,
      width: this.width,
      height: this.height
    };
  }
}
```

**ネイティブ抽出の利点**:
1. **精度向上**: フレーム境界での正確なシーク
2. **パフォーマンス**: OffscreenCanvasによる並列処理
3. **安定性**: ブラウザ制限の回避
4. **キャッシュ効率**: フレーム単位での効率的キャッシュ

### LRUキャッシュによる最適化

```typescript
// 30フレーム（1秒分）のLRUキャッシュ
class FrameCache {
  private readonly MAX_CACHE_SIZE = 30;
  private cache = new Map<number, VideoFrameData>();
  private accessOrder: number[] = [];
  
  get(frameNumber: number): VideoFrameData | null {
    if (this.cache.has(frameNumber)) {
      // アクセス順序を更新
      this.updateAccessOrder(frameNumber);
      return this.cache.get(frameNumber)!;
    }
    return null;
  }
  
  set(frameNumber: number, frameData: VideoFrameData): void {
    // キャッシュサイズ制限
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestFrame = this.accessOrder.shift()!;
      this.cache.delete(oldestFrame);
    }
    
    this.cache.set(frameNumber, frameData);
    this.accessOrder.push(frameNumber);
  }
}
```

## RenderTexturePool: GPUメモリ最適化

### プーリング型リソース管理

```typescript
class RenderTexturePool {
  private available: PIXI.RenderTexture[] = [];
  private inUse: Set<PIXI.RenderTexture> = new Set();
  
  constructor(width: number, height: number, poolSize: number = 5) {
    // 事前にテクスチャを作成
    for (let i = 0; i < poolSize; i++) {
      const texture = PIXI.RenderTexture.create({ width, height });
      this.available.push(texture);
    }
  }
  
  acquire(): PIXI.RenderTexture {
    if (this.available.length === 0) {
      // プールが空の場合は動的作成（警告付き）
      console.warn('RenderTexturePool: Pool exhausted, creating new texture');
      return PIXI.RenderTexture.create({ width: this.width, height: this.height });
    }
    
    const texture = this.available.pop()!;
    this.inUse.add(texture);
    return texture;
  }
  
  release(texture: PIXI.RenderTexture): void {
    this.inUse.delete(texture);
    this.available.push(texture);
  }
}
```

**プーリングの効果**:
1. **GPU効率**: テクスチャ作成・破棄コストの削減
2. **メモリ断片化防止**: 安定したメモリ使用パターン
3. **予測可能性**: 最大メモリ使用量の制限
4. **パフォーマンス**: 動画エクスポート時の高速化

## UnifiedRestoreManager: 統一復元処理

### 段階的復元による安全性確保

```typescript
class UnifiedRestoreManager {
  async restoreProject(data: UnifiedProjectData): Promise<void> {
    try {
      // 段階的復元（順序が重要）
      await this.restoreStage(data.stageConfig);
      await this.restoreBackground(data.backgroundConfig);
      await this.restoreAudio(data.audioInfo);
      await this.restoreParameters(data.parameterState);
      await this.restoreTemplates(data.templateState);
      await this.restoreLyrics(data.lyricsData);
      
      // 整合性検証
      await this.validateConsistency();
      
    } catch (error) {
      // 復元失敗時のロールバック
      await this.rollbackToSafeState();
      throw error;
    }
  }
}
```

**段階的復元の重要性**:
1. **依存関係**: コンポーネント間の依存順序を考慮
2. **エラー安全性**: 途中でエラーが発生した場合の復旧
3. **一貫性保証**: 復元後の状態の整合性確認
4. **デバッグ性**: 問題発生箇所の特定が容易

### データ形式の正規化

```typescript
// 異なるデータ形式を統一形式に正規化
interface DataNormalizer {
  fromProjectFile(data: ProjectFileData): UnifiedProjectData;
  fromAutoSave(data: AutoSaveData): UnifiedProjectData;
  fromLegacyFormat(data: LegacyData): UnifiedProjectData;
}

// 統一復元処理
async restore(data: unknown): Promise<void> {
  // 1. 形式判定
  const format = this.detectDataFormat(data);
  
  // 2. 正規化
  const normalizedData = this.normalizeData(data, format);
  
  // 3. 統一復元処理
  await this.restoreProject(normalizedData);
}
```

## DebugManager: 統合デバッグシステム

### スロットリング付きイベント管理

```typescript
class DebugManager {
  private readonly EVENT_THROTTLE_MS = 100;
  private lastEventTime = 0;
  
  emitEvent(eventType: DebugEventType, data: DebugEventData): void {
    const now = performance.now();
    if (now - this.lastEventTime < this.EVENT_THROTTLE_MS) {
      return; // スロットリング
    }
    
    this.lastEventTime = now;
    this.eventBus.emit(eventType, data);
  }
}
```

**統合デバッグの利点**:
1. **パフォーマンス保護**: デバッグ機能がアプリ性能に影響しない
2. **情報集約**: 各コンポーネントの情報を統一形式で収集
3. **選択的出力**: 開発時のみ詳細情報を出力
4. **リアルタイム監視**: アニメーション実行中の状態追跡

## まとめ

UTAVISTAの独特な設計要素は、歌詞アニメーションシステムの特殊な要求に対応するため開発されました：

1. **ParameterManagerV2**: 継承チェーン排除による予測可能なパラメータ管理
2. **シークアンドスナップ**: プレビュー統一による一致保証エクスポート
3. **TextMetricsCache**: 正規化文字メトリクスによる効率的文字配置
4. **ネイティブフレーム抽出**: HTMLVideoElement非依存の高精度動画処理
5. **RenderTexturePool**: GPUメモリ最適化によるプール型リソース管理
6. **UnifiedRestoreManager**: 段階的復元による安全性確保
7. **統合デバッグシステム**: スロットリング付きパフォーマンス保護

これらの設計により、従来のアプローチでは困難だった、精密な歌詞アニメーション制作と高性能な動画エクスポートを両立しています。