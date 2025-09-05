# キラキラ十字星エフェクト仕様書 (v2.0)

## 概要

「キラキラ十字星エフェクト」は、歌詞アニメーションに装飾的な視覚効果を提供する決定論的パーティクルシステムです。文字ごとに独立したパーティクル発生点を管理し、フレーズ期間中に継続的にパーティクルを生成します。タイムライン操作と動画エクスポートにおいて完全に再現可能な決定論的動作を保証します。

## システム概要

### アーキテクチャ特徴
- **ステージレベル管理**: フレーズ・単語・文字コンテナから完全に独立
- **ジェネレーターベース**: 文字ごとの発生点で継続的パーティクル生成
- **決定論的システム**: タイムライン時間ベースの可逆的パーティクル管理
- **独立更新ループ**: エンジンメインループから独立した更新システム

## パーティクル仕様

### 1. 形状とビジュアル
- **形状**: 5角星（シンプルな星型）
- **描画方式**: PIXI.Graphics による動的生成
- **構造**:
  - 外側半径: パーティクルサイズ
  - 内側半径: パーティクルサイズ * 0.4
  - 5つの尖端を持つ星型パス

### 2. アニメーション特性
- **寿命**: 1500ms（デフォルト）
- **フェードイン**: 最初の10%で0→最大透明度
- **維持期間**: 60%の期間で最大透明度維持
- **フェードアウト**: 最後の40%で透明度減衰（イージングアウト）
- **移動**: ランダムな初期速度による等速直線運動
- **回転**: パラメータ制御による回転速度

## 発生点管理システム

### 1. ジェネレーター（発生点）
```typescript
interface SparkleGenerator {
  charId: string;                    // 文字ID（一意識別子）
  text: string;                      // 文字テキスト
  globalPosition: { x: number; y: number }; // 文字のグローバル座標
  params: SparkleEffectParams;       // エフェクトパラメータ
  startTime: number;                 // 発生開始時刻
  endTime: number;                   // 発生終了時刻（フレーズ終了+tailtime）
  isActive: boolean;                 // アクティブ状態
}
```

### 2. 発生タイミング
- **開始**: 文字がアクティブになった時点
- **終了**: フレーズ終了時刻 + tailtime（デフォルト500ms）
- **生成レート**: 2.0個/秒（デフォルト、パラメータで調整可能）
- **継続性**: 文字表示終了後もフレーズ終了+tailtimeまで継続

### 3. 座標管理
- **固定座標**: パーティクル生成時の文字座標を記録・使用
- **文字連動なし**: 文字移動後もパーティクルは元の位置から発生
- **散布範囲**: 文字中心から半径30px（デフォルト）内でランダム配置

## 決定論的システム

### 1. タイムラインベース生成
```typescript
// 期待パーティクル数の決定論的計算
const elapsedTime = currentTime - generator.startTime;
const expectedParticleCount = Math.floor(elapsedTime / generationInterval);
const particlesToGenerate = expectedParticleCount - existingParticles;
```

### 2. 決定論的ID管理
- **パーティクルID**: `{charId}_{particleIndex}` 形式
- **重複防止**: 既存IDチェックによる重複生成防止
- **インデックスベース**: 時間ではなくパーティクルインデックスでシード生成

### 3. Park-Miller LCG
```typescript
class DeterministicRandom {
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
```

## UI公開パラメータ

| パラメータ名 | 型 | デフォルト値 | 範囲 | 説明 |
|------------|---|------------|------|------|
| enableSparkle | boolean | true | - | エフェクトの有効/無効 |
| sparkleCount | number | 4 | 1-20 | 同時生成パーティクル数 |
| sparkleSize | number | 20 | 4-40 | パーティクルサイズ(px) |
| sparkleColor | color | #FFD700 | - | パーティクルカラー |
| sparkleScale | number | 1.0 | 0.5-5.0 | スケール倍率 |
| sparkleDuration | number | 1500 | 500-3000 | パーティクル寿命(ms) |
| sparkleRadius | number | 30 | 10-100 | 散布半径(px) |
| sparkleAnimationSpeed | number | 1.0 | 0.1-3.0 | アニメーション速度 |
| sparkleAlphaDecay | number | 0.98 | 0.9-0.99 | 透明度減衰率 |
| sparkleRotationSpeed | number | 0.3 | 0.0-2.0 | パーティクル回転速度 |
| sparkleGenerationRate | number | 2.0 | 0.5-10.0 | 1秒間のパーティクル生成数 |

### 回転速度の動作仕様
- **0.0**: 完全に回転停止
- **> 0.0**: `rng.nextRange(-value * 0.01, value * 0.01)` の範囲でランダム回転
- **例**: 1.0設定時 → -0.01～0.01 rad/frameの回転速度

## 技術実装詳細

### 1. クラス構造
```
SparkleEffectPrimitive
├── ステージコンテナ管理（静的）
├── ジェネレーター管理（Map）
├── パーティクル管理（Map）
├── 決定論的生成システム
├── 独立更新ループ
└── エンジン時刻取得
```

### 2. 主要メソッド

#### applyEffect()
- ジェネレーター登録・更新
- 決定論的パーティクル生成
- パーティクル状態更新
- 期限切れクリーンアップ

#### generateDeterministicParticles()
- タイムライン時間ベースの期待パーティクル数計算
- 不足分の決定論的生成
- 重複防止チェック

#### runIndependentUpdate()
- エンジンから現在時刻取得
- パーティクル状態更新のみ実行
- レンダリング強制実行
- 16ms間隔での独立更新

### 3. ステージレベル管理
```typescript
// ステージコンテナ構造
PIXI.Stage
└── sparkle_stage_layer (zIndex: 1000)
    ├── particle_1
    ├── particle_2
    └── ...
```

## 継続更新システム

### 1. 独立更新の仕組み
- **開始条件**: パーティクルまたはジェネレーターが存在
- **停止条件**: 両方が存在しなくなった時点
- **更新内容**: パーティクル状態更新とレンダリングのみ
- **時刻取得**: `window.engineInstance.getCurrentTime()`

### 2. フレーズ退場後の動作
- **ジェネレーター**: フレーズ終了+tailtimeで削除
- **パーティクル**: 個別の寿命まで表示継続
- **更新継続**: 最後のパーティクルが消えるまで独立更新継続

## シーク対応

### 1. ジェネレータークリーンアップ
```typescript
private cleanupInvalidGenerators(currentTime: number): void {
  for (const [charId, generator] of activeGenerators.entries()) {
    if (currentTime > generator.endTime) {
      activeGenerators.delete(charId);
    }
  }
}
```

### 2. 可逆的動作
- **巻き戻し**: 未来のパーティクルは生成されない
- **早送り**: 必要なパーティクルが一括で決定論的に生成
- **一時停止**: 独立更新ループにより状態保持

## パフォーマンス最適化

### 1. メモリ管理
- **期限切れ削除**: パーティクル寿命による自動削除
- **ジェネレーター削除**: 時刻ベースの期限切れ削除
- **リソース解放**: PIXIオブジェクトの適切な破棄

### 2. 計算効率
- **O(n)生成**: アクティブジェネレーター数に比例
- **バッチ削除**: 期限切れオブジェクトの一括削除
- **条件分岐最適化**: ゼロ値の早期リターン

## 実装ファイル

### 主要ファイル
- `/src/renderer/primitives/effects/SparkleEffectPrimitive.ts` - メインエフェクト実装
- `/src/renderer/templates/PurePrimitiveWordSlideText.ts` - テンプレート統合
- `/src/renderer/utils/ParameterRegistry.ts` - パラメータ登録
- `/src/renderer/engine/Engine.ts` - エンジン統合

### 統合ポイント
```typescript
// テンプレート内での呼び出し
this.applySparkleEffectAfterLayout(
  charContainer, 
  charData.char, 
  params, 
  nowMs, 
  charData.start, 
  charData.end, 
  charData.charIndex, 
  params.phraseEndMs
);
```

## 動作保証

### 1. 決定論的保証
- 同一条件下で常に同じパーティクル配置
- タイムライン操作による状態の完全再現
- 動画エクスポート時の一貫性保持

### 2. 性能保証
- 60FPSでの滑らかなアニメーション
- 最大数百個のパーティクル同時表示対応
- メモリリークの防止

### 3. 互換性保証
- エンジンメインループからの独立性
- 他のテンプレートとの干渉なし
- プロジェクト保存・読み込み対応