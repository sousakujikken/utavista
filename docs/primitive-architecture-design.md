# プリミティブアーキテクチャ設計書 v2.0

## 概要

本文書は、UTAVISTA v0.5.0における階層分離型プリミティブアーキテクチャの設計思想と実装仕様を定義します。現在のプリミティブシステムが抱える責任範囲の曖昧性と重複問題を根本的に解決し、開発者が間違った実装をできない設計を実現します。

## 設計原則

### 1. 階層単一責任原則 (Hierarchical Single Responsibility Principle)

**原則**: 各プリミティブは単一の階層レベルのみを担当し、階層を跨いだ責任を持たない

```
❌ 現在の問題
SlideAnimationPrimitive {
  calculatePhrasePosition()    // フレーズレベル
  calculateWordPosition()      // 単語レベル  
  calculateCharacterAnimation() // 文字レベル
}

✅ 改善後の設計
PhrasePositionPrimitive {
  calculate(): PhrasePosition  // フレーズレベルのみ
}

WordPositionPrimitive {
  calculate(): WordPosition    // 単語レベルのみ
}

CharacterAnimationPrimitive {
  calculate(): CharacterAnimation // 文字レベルのみ
}
```

### 2. 明示的責任境界 (Explicit Responsibility Boundaries)

**原則**: プリミティブの名前と機能が1対1で対応し、責任範囲が名前から明確に理解できる

```typescript
// 責任範囲を明確に表現する命名
PhrasePositionPrimitive     // フレーズ位置計算専用
WordPositionPrimitive       // 単語位置計算専用  
CharacterLayoutPrimitive    // 文字配置計算専用
EffectApplicationPrimitive  // エフェクト適用専用
```

### 3. 組合せ型アーキテクチャ (Compositional Architecture)

**原則**: 複雑な機能は単機能プリミティブの組み合わせで実現し、単一プリミティブの肥大化を防ぐ

```typescript
// テンプレートは複数のプリミティブを組み合わせて機能を実現
class WordSlideTemplate extends HierarchicalAnimationTemplate {
  protected phrasePositioning = new PhrasePositionPrimitive();
  protected wordPositioning = new WordPositionPrimitive();
  protected characterLayout = new CharacterLayoutPrimitive();
  protected effectApplication = new EffectApplicationPrimitive();
}
```

## 新アーキテクチャ構造

### 階層別プリミティブ体系

```
UTAVISTA Primitive Architecture v2.0
├── Position Primitives (位置計算)
│   ├── PhrasePositionPrimitive
│   │   ├── calculateStatic()     // 静的配置
│   │   ├── calculateSlide()      // スライド配置  
│   │   └── calculateRandom()     // ランダム配置
│   ├── WordPositionPrimitive
│   │   ├── calculateStatic()     // 静的配置
│   │   ├── calculateSlide()      // スライドアニメーション
│   │   └── calculateCumulative() // 累積配置
│   └── CharacterPositionPrimitive
│       ├── calculateIndividual() // 個別配置
│       └── calculateRelative()   // 相対配置
│
├── Layout Primitives (レイアウト管理)
│   └── CharacterLayoutPrimitive
│       ├── layoutIndividual()    // 個別レイアウト
│       ├── layoutCumulative()    // 累積レイアウト
│       ├── layoutNewLine()       // 改行レイアウト
│       └── layoutSpacing()       // スペーシングレイアウト
│
├── Animation Primitives (アニメーション制御)
│   ├── FadeAnimationPrimitive
│   ├── SlideAnimationPrimitive
│   └── ScaleAnimationPrimitive
│
└── Effect Primitives (エフェクト適用)
    ├── BlurEffectPrimitive
    ├── GlowEffectPrimitive
    └── ShadowEffectPrimitive
```

### 標準実装パターン

**パターン1: 静的配置テンプレート (フェード・ブラー系)**
```typescript
const StaticPlacementPattern = {
  phrase: PhrasePositionPrimitive.calculateStatic(),
  word: WordPositionPrimitive.calculateStatic(),
  character: CharacterLayoutPrimitive.layoutIndividual()
};
```

**パターン2: スライドアニメーションテンプレート**
```typescript
const SlideAnimationPattern = {
  phrase: PhrasePositionPrimitive.calculateSlide(),
  word: WordPositionPrimitive.calculateSlide(),
  character: CharacterLayoutPrimitive.layoutIndividual()
};
```

**パターン3: フレーズ同期テンプレート**
```typescript
const PhraseSyncPattern = {
  phrase: PhrasePositionPrimitive.calculateStatic(),
  word: WordPositionPrimitive.calculateStatic(),
  character: CharacterLayoutPrimitive.layoutCumulative()
};
```

## 基底クラス設計

### HierarchicalAnimationTemplate基底クラス

```typescript
abstract class HierarchicalAnimationTemplate implements IAnimationTemplate {
  // プリミティブインスタンス (継承クラスで初期化)
  protected abstract phrasePositioning: PhrasePositionPrimitive;
  protected abstract wordPositioning: WordPositionPrimitive;
  protected abstract characterLayout: CharacterLayoutPrimitive;
  
  // 標準的な階層処理を実装 (オーバーライド不可)
  final renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    // 標準的なフレーズ位置計算を強制
    const position = this.phrasePositioning.calculate({
      text, params, nowMs, startMs, endMs, phase
    });
    
    container.position.set(position.x, position.y);
    container.alpha = position.alpha;
    
    // カスタム処理を委譲
    return this.customPhraseRendering(container, text, params, nowMs, startMs, endMs, phase);
  }
  
  final renderWordContainer(...): boolean {
    // 標準的な単語位置計算を強制
    const position = this.wordPositioning.calculate(...);
    container.position.set(position.x, position.y);
    
    // 標準的な文字レイアウトを強制
    const layout = this.characterLayout.layout(...);
    
    return this.customWordRendering(...);
  }
  
  final renderCharContainer(...): boolean {
    // 文字レベルの標準処理
    return this.customCharRendering(...);
  }
  
  // テンプレート固有の実装を強制 (必須実装)
  protected abstract customPhraseRendering(...): boolean;
  protected abstract customWordRendering(...): boolean;
  protected abstract customCharRendering(...): boolean;
}
```

## パフォーマンス設計考慮事項

### プリミティブインスタンス管理

```typescript
// シングルトンパターンによるインスタンス効率化
class PrimitiveFactory {
  private static instances = new Map<string, any>();
  
  static getPhrasePositionPrimitive(): PhrasePositionPrimitive {
    if (!this.instances.has('phrase')) {
      this.instances.set('phrase', new PhrasePositionPrimitive());
    }
    return this.instances.get('phrase');
  }
}
```

### 計算結果キャッシュ

```typescript
// 重複計算の回避
interface CacheableCalculation {
  getCacheKey(): string;
  calculate(): any;
}

class CalculationCache {
  private cache = new Map<string, any>();
  
  getOrCalculate<T>(calculation: CacheableCalculation): T {
    const key = calculation.getCacheKey();
    if (!this.cache.has(key)) {
      this.cache.set(key, calculation.calculate());
    }
    return this.cache.get(key);
  }
}
```

## エラーハンドリング設計

### 階層不整合の検出

```typescript
class HierarchyValidator {
  validateHierarchyConsistency(template: HierarchicalAnimationTemplate): ValidationResult {
    // フレーズ・単語・文字レベルの整合性をチェック
    // 不正な組み合わせを検出
    // パフォーマンス影響を分析
  }
}
```

### デバッグ支援

```typescript
class PrimitiveDebugger {
  // 実行時の階層処理を可視化
  visualizeHierarchyFlow(template: HierarchicalAnimationTemplate): DebugReport;
  
  // プリミティブ間の依存関係を分析
  analyzePrimitiveDependencies(template: HierarchicalAnimationTemplate): DependencyReport;
}
```

## クリーンカット移行戦略

### レガシーシステム完全削除

```typescript
/**
 * v2.0アーキテクチャでは互換性レイヤーを排除
 * 確実な新方式移行によりメンテナンスオーバーヘッドを最小化
 */

// ❌ 削除: 複雑な互換性維持システム
class LegacySlideAnimationAdapter { /* 削除 */ }
class MigrationController { /* 削除 */ }
class ParallelExecutionValidator { /* 削除 */ }

// ✅ 採用: 直接移行による単純化
class HierarchicalAnimationTemplate {
  // 新プリミティブの直接使用を強制
  protected abstract readonly phrasePositioning: PhrasePositionPrimitive;
  protected abstract readonly wordPositioning: WordPositionPrimitive;
  protected abstract readonly characterLayout: CharacterLayoutPrimitive;
}
```

### 対象テンプレート限定方針

```typescript
/**
 * 移行対象: 3つのテンプレートのみ
 * 非対応テンプレート: 完全廃止
 */
const MIGRATION_TARGETS = [
  'WordSlideTextPrimitive',    // ✅ 移行
  'FadeBlurRandomTextPrimitive', // ✅ 移行  
  'GlitchTextPrimitive'        // ✅ 移行
];

const DEPRECATED_TEMPLATES = [
  'PhraseBlurFadeTemplate',    // ❌ 廃止
  'PhraseSyncTextPrimitive',   // ❌ 廃止
  'BlurFadeTemplate',          // ❌ 廃止
  // 他15-20個の非対応テンプレート
];
```

## 品質保証

### アーキテクチャ適合性テスト

```typescript
describe('Architecture Compliance', () => {
  test('プリミティブは単一階層のみを担当', () => {
    // 各プリミティブが複数階層にまたがっていないことを検証
  });
  
  test('基底クラスが標準パターンを強制', () => {
    // HierarchicalAnimationTemplateの継承クラスが正しい実装パターンを使用
  });
  
  test('プリミティブ命名と機能の一致', () => {
    // クラス名と実際の責任範囲が一致することを検証
  });
});
```

この設計により、開発者が間違った実装をできない堅牢なアーキテクチャを実現し、今回のような位置計算問題を根本的に防止します。