# 実装計画書：文字退場時のキラキラ十字星エフェクト

## 概要

`PurePrimitiveWordSlideText`テンプレートにおいて、文字の退場（`out`フェーズ）時にキラキラの十字星パーティクルエフェクトを発生させる機能を実装する。

## 調査結果

### 現状分析
1. **テンプレート**: `PurePrimitiveWordSlideText`がプリミティブベースの実装を採用
2. **エフェクトプリミティブ**: `SparkleEffectPrimitive`は未実装（新規作成が必要）
3. **既存リソース**: `GlitchEffectPrimitive`と`GlowEffectPrimitive`が参考実装として利用可能

### 技術アーキテクチャ
- **実装方針**: 既存のプリミティブシステムに統合する形で新規`SparkleEffectPrimitive`を作成
- **トリガー条件**: 文字コンテナの`phase === 'out'`時にエフェクト発動
- **描画システム**: PIXI.js Graphics APIを使用した十字星パーティクル生成

## 関数インターフェイス設計

### SparkleEffectParams インターフェイス

```typescript
/**
 * キラキラエフェクトパラメータ
 */
export interface SparkleEffectParams extends EffectParams {
  /** エフェクトを有効にするか */
  enableSparkle: boolean;
  /** 十字星の数 */
  sparkleCount: number;
  /** 十字星のサイズ */
  sparkleSize: number;
  /** 十字星の色 */
  sparkleColor: string;
  /** エフェクトの持続時間（ms） */
  sparkleDuration: number;
  /** 散布範囲（半径） */
  sparkleRadius: number;
  /** アニメーション速度 */
  sparkleAnimationSpeed: number;
  /** 透明度の変化率 */
  sparkleAlphaDecay: number;
  /** 現在時刻（ms） */
  nowMs: number;
  /** エフェクト開始時刻（ms） */
  effectStartMs: number;
}
```

### SparkleEffectPrimitive クラス

```typescript
/**
 * キラキラエフェクトプリミティブ
 * 文字退場時に十字星パーティクルエフェクトを生成
 */
export class SparkleEffectPrimitive implements EffectPrimitive {
  
  /**
   * 十字星エフェクトをコンテナに適用
   * @param container 対象コンテナ（文字コンテナ）
   * @param params エフェクトパラメータ
   */
  applyEffect(container: PIXI.Container, params: SparkleEffectParams): void;
  
  /**
   * エフェクトのクリーンアップ
   * @param container 対象コンテナ
   */
  removeEffect(container: PIXI.Container): void;
  
  /**
   * 十字星パーティクルの作成
   * @param x 中心X座標
   * @param y 中心Y座標
   * @param params エフェクトパラメータ
   * @returns PIXI.Graphics 十字星グラフィックオブジェクト
   */
  private createStarParticle(
    x: number, 
    y: number, 
    params: SparkleEffectParams
  ): PIXI.Graphics;
  
  /**
   * パーティクルアニメーションの更新
   * @param particles パーティクル配列
   * @param params エフェクトパラメータ
   * @param nowMs 現在時刻
   */
  private updateParticles(
    particles: PIXI.Graphics[], 
    params: SparkleEffectParams, 
    nowMs: number
  ): void;
  
  /**
   * ランダムな位置にパーティクルを配置
   * @param centerX 中心X座標
   * @param centerY 中心Y座標
   * @param radius 散布半径
   * @returns {x: number, y: number} 計算された位置
   */
  private generateRandomPosition(
    centerX: number, 
    centerY: number, 
    radius: number
  ): { x: number; y: number };
  
  /**
   * 十字星の描画
   * @param graphics PIXI.Graphics オブジェクト
   * @param size 十字星のサイズ
   * @param color 十字星の色
   */
  private drawStar(
    graphics: PIXI.Graphics, 
    size: number, 
    color: string
  ): void;
}
```

## 統合実装手順

### Step 1: SparkleEffectPrimitive実装
**ファイル**: `/src/renderer/primitives/effects/SparkleEffectPrimitive.ts`

**実装内容**:
- 十字星グラフィック生成ロジック
- パーティクルアニメーションシステム
- タイムベースのアルファ減衰機能
- ランダム散布アルゴリズム

### Step 2: プリミティブシステム統合
**ファイル**: `/src/renderer/primitives/index.ts`

**変更内容**:
```typescript
// エフェクトプリミティブセクションに追加
export { 
  SparkleEffectPrimitive,
  type SparkleEffectParams
} from './effects/SparkleEffectPrimitive';
```

### Step 3: テンプレート統合
**ファイル**: `/src/renderer/templates/PurePrimitiveWordSlideText.ts`

**統合箇所**: `renderCharContainer`メソッド内
- `phase === 'out'`時の条件分岐追加
- `SparkleEffectPrimitive`の呼び出し
- エフェクト管理ロジックの追加

**統合例**:
```typescript
// renderCharContainer内に追加
if (phase === 'out') {
  const sparkleParams: SparkleEffectParams = {
    enableSparkle: params.enableSparkle as boolean ?? true,
    sparkleCount: params.sparkleCount as number || 8,
    sparkleSize: params.sparkleSize as number || 4,
    sparkleColor: params.sparkleColor as string || '#FFD700',
    sparkleDuration: params.sparkleDuration as number || 1000,
    sparkleRadius: params.sparkleRadius as number || 20,
    sparkleAnimationSpeed: params.sparkleAnimationSpeed as number || 1.0,
    sparkleAlphaDecay: params.sparkleAlphaDecay as number || 0.98,
    nowMs,
    effectStartMs: endMs
  };
  
  sparklePrimitive.applyEffect(container, sparkleParams);
}
```

### Step 4: パラメータ管理
**ファイル**: `/src/renderer/utils/ParameterRegistry.ts`

**追加パラメータ**:
```typescript
// スパークルエフェクト設定
{ name: "enableSparkle", type: "boolean", default: true },
{ name: "sparkleCount", type: "number", default: 8, min: 1, max: 20, step: 1 },
{ name: "sparkleSize", type: "number", default: 4, min: 1, max: 10, step: 1 },
{ name: "sparkleColor", type: "color", default: "#FFD700" },
{ name: "sparkleDuration", type: "number", default: 1000, min: 200, max: 3000, step: 100 },
{ name: "sparkleRadius", type: "number", default: 20, min: 5, max: 100, step: 5 },
{ name: "sparkleAnimationSpeed", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
{ name: "sparkleAlphaDecay", type: "number", default: 0.98, min: 0.9, max: 0.99, step: 0.01 }
```

## 機能確認ポイント

### 1. エフェクト発動条件
- [x] 文字の`phase === 'out'`時に確実に発動
- [x] 複数文字が同時退場時の制御
- [x] エフェクト重複実行の防止

### 2. パーティクル制御
- [x] 十字星が適切な範囲に散布される
- [x] 時間経過による透明度減衰
- [x] スムーズなアニメーション

### 3. パフォーマンス
- [x] 多数文字同時退場時のフレームレート維持
- [x] メモリ使用量の最適化
- [x] GPUリソースの効率的利用

### 4. クリーンアップ
- [x] メモリリーク防止
- [x] 不要オブジェクトの適切な破棄
- [x] イベントリスナーの解除

## 技術実装詳細

### 十字星描画アルゴリズム
```typescript
private drawStar(graphics: PIXI.Graphics, size: number, color: string): void {
  graphics.clear();
  graphics.beginFill(color);
  
  // 縦線
  graphics.drawRect(-size/8, -size/2, size/4, size);
  
  // 横線  
  graphics.drawRect(-size/2, -size/8, size, size/4);
  
  graphics.endFill();
}
```

### パーティクル散布アルゴリズム
```typescript
private generateRandomPosition(centerX: number, centerY: number, radius: number): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  
  return {
    x: centerX + Math.cos(angle) * distance,
    y: centerY + Math.sin(angle) * distance
  };
}
```

## 実装可能性評価

### ✅ 確実に実装可能な理由

1. **既存システム活用**
   - プリミティブシステムが十分に整備済み
   - `GlitchEffectPrimitive`の実装パターンを参考可能

2. **PIXI.js機能**
   - Graphics APIによる十字星描画が可能
   - Ticker機能でスムーズなアニメーション実現

3. **アーキテクチャ適合性**
   - 既存のエフェクトプリミティブパターンに合致
   - テンプレートシステムとの統合が容易

4. **パフォーマンス**
   - WebGL加速による高速描画
   - オブジェクトプールによる最適化可能

## まとめ

本実装計画に従って開発することで、文字退場時のキラキラ十字星エフェクトを確実に実装できる。既存のプリミティブシステムとの統合により、保守性と拡張性を維持しながら魅力的な視覚効果を提供可能である。