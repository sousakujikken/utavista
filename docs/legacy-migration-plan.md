# クリーンカット移行計画書 v3.0

## 概要

本計画書は、現在のプリミティブシステムから階層分離型プリミティブアーキテクチャ v2.0 への**完全移行戦略**を定義します。レガシーアダプターや並行運用を排除し、確実な新方式移行により**メンテナンスオーバーヘッドを最小化**します。

## 現状分析

### テンプレート移行適格性評価

**移行対象テンプレート (v2.0対応)**:
| テンプレート | 現状 | 移行方式 | 優先度 |
|------------|------|---------|--------|
| `WordSlideTextPrimitive` | プリミティブ使用済み | 新API直接移行 | 最優先 |
| `FadeBlurRandomTextPrimitive` | 部分的対応済み | 完全移行 | 最優先 |
| `GlitchTextPrimitive` | プリミティブ使用済み | 新API直接移行 | 高 |

**非対応テンプレート (廃止予定)**:
| テンプレート | 理由 | 対応方針 |
|------------|------|---------|
| `PhraseBlurFadeTemplate` | レガシー実装 | 廃止 |
| `PhraseSyncTextPrimitive` | 複雑な互換性 | 廃止 |
| `BlurFadeTemplate` | プリミティブ非対応 | 廃止 |
| その他レガシーテンプレート | メンテナンスコスト過大 | 一括廃止 |

**移行判定基準**:
- ✅ 新プリミティブアーキテクチャに適合可能
- ✅ 移行コストが妥当範囲内
- ❌ 複雑な互換性維持が必要
- ❌ レガシーAPIへの依存度が高い

## クリーンカット移行戦略

### Stage 1: 新アーキテクチャ完全実装 (v0.5.0)

**期間**: 3週間  
**目標**: 新プリミティブシステムの完全実装

#### 1.1 新プリミティブクラス実装

```typescript
// 新プリミティブの完全実装
/src/renderer/primitives/v2/
├── position/
│   ├── PhrasePositionPrimitive.ts
│   ├── WordPositionPrimitive.ts
│   └── CharacterPositionPrimitive.ts
├── layout/
│   └── CharacterLayoutPrimitive.ts  
├── effects/
│   ├── BlurEffectPrimitive.ts
│   ├── GlowEffectPrimitive.ts
│   └── ShadowEffectPrimitive.ts
└── base/
    └── HierarchicalAnimationTemplate.ts
```

#### 1.2 レガシーシステム完全削除準備

```typescript
/**
 * 削除対象レガシーファイル一覧
 */
const LEGACY_FILES_TO_DELETE = [
  '/src/renderer/primitives/layout/CumulativeLayoutPrimitive.ts',
  '/src/renderer/primitives/layout/ImprovedCumulativeLayoutPrimitive.ts',
  '/src/renderer/primitives/layout/EnhancedCumulativeLayoutPrimitive.ts',
  '/src/renderer/primitives/animation/SlideAnimationPrimitive.ts',
  // 全レガシープリミティブを一括削除
];

/**
 * 非対応テンプレート削除対象
 */
const DEPRECATED_TEMPLATES = [
  '/src/renderer/templates/PhraseBlurFadeTemplate.ts',
  '/src/renderer/templates/PhraseSyncTextPrimitive.ts',
  '/src/renderer/templates/BlurFadeTemplate.ts',
  // 複雑な互換性維持が必要なテンプレート群
];
```

### Stage 2: 対象テンプレート直接移行 (v0.5.1)

**期間**: 2週間  
**目標**: 3つの対象テンプレートの完全移行

#### 2.1 直接移行対象テンプレート

**1. FadeBlurRandomTextPrimitive**
```typescript
// 移行後: 完全にv2.0準拠
class FadeBlurRandomTextPrimitive extends HierarchicalAnimationTemplate {
  protected readonly phrasePositioning = new PhrasePositionPrimitive();
  protected readonly wordPositioning = new WordPositionPrimitive();
  protected readonly characterLayout = new CharacterLayoutPrimitive();
  
  protected calculatePhrasePosition(params, nowMs, startMs, endMs, phase) {
    return this.phrasePositioning.calculateRandom(params);
  }
  
  protected calculateWordPosition(params, nowMs, startMs, endMs, phase) {
    return this.wordPositioning.calculateStatic(params);
  }
  
  protected customCharRendering(container, text, params, nowMs, startMs, endMs, phase) {
    return this.applyFadeBlurEffects(container, text, params, nowMs, startMs, endMs, phase);
  }
}
```

**2. WordSlideTextPrimitive**
```typescript
class WordSlideTextPrimitive extends HierarchicalAnimationTemplate {
  protected readonly phrasePositioning = new PhrasePositionPrimitive();
  protected readonly wordPositioning = new WordPositionPrimitive();
  protected readonly characterLayout = new CharacterLayoutPrimitive();
  
  protected calculatePhrasePosition(params, nowMs, startMs, endMs, phase) {
    return this.phrasePositioning.calculateStatic(params);
  }
  
  protected calculateWordPosition(params, nowMs, startMs, endMs, phase) {
    return this.wordPositioning.calculateSlide(params);
  }
}
```

**3. GlitchTextPrimitive**
```typescript
class GlitchTextPrimitive extends HierarchicalAnimationTemplate {
  protected readonly phrasePositioning = new PhrasePositionPrimitive();
  protected readonly wordPositioning = new WordPositionPrimitive();
  protected readonly characterLayout = new CharacterLayoutPrimitive();
  
  protected calculatePhrasePosition(params, nowMs, startMs, endMs, phase) {
    return this.phrasePositioning.calculateStatic(params);
  }
  
  protected calculateWordPosition(params, nowMs, startMs, endMs, phase) {
    return this.wordPositioning.calculateStatic(params);
  }
  
  protected performCharacterLayout(container, params) {
    return this.characterLayout.layoutCumulative(container, params, (charContainer, charData) => {
      this.animateContainer(charContainer, charData.char, params, ...);
    });
  }
}
```

### Stage 3: レガシーシステム完全削除 (v0.5.2)

**期間**: 1週間  
**目標**: 全レガシーコードの完全削除

#### 3.1 一括削除実行

```bash
#!/bin/bash
# レガシーシステム完全削除スクリプト

echo "🗑️  レガシープリミティブ削除開始..."

# レガシープリミティブファイル削除
rm -f src/renderer/primitives/layout/CumulativeLayoutPrimitive.ts
rm -f src/renderer/primitives/layout/ImprovedCumulativeLayoutPrimitive.ts
rm -f src/renderer/primitives/layout/EnhancedCumulativeLayoutPrimitive.ts
rm -f src/renderer/primitives/layout/FlexibleCumulativeLayoutPrimitive.ts
rm -f src/renderer/primitives/animation/SlideAnimationPrimitive.ts

echo "🗑️  非対応テンプレート削除開始..."

# 非対応テンプレート削除
rm -f src/renderer/templates/PhraseBlurFadeTemplate.ts
rm -f src/renderer/templates/PhraseSyncTextPrimitive.ts
rm -f src/renderer/templates/BlurFadeTemplate.ts

echo "📝  テンプレートレジストリ更新..."

# templates/index.ts から削除されたテンプレートのexportを削除
# registry/templateRegistry.ts から削除されたテンプレートの登録を削除

echo "✅  クリーンカット移行完了"
```

#### 2.3 自動テストスイート強化

```typescript
/**
 * 移行中のテンプレートの動作を検証
 */
describe('Migration Validation', () => {
  describe('FadeBlurRandomTextPrimitive', () => {
    test('新実装が既存の視覚的出力と一致', async () => {
      const legacyTemplate = new LegacyFadeBlurRandomTextPrimitive();
      const newTemplate = new FadeBlurRandomTextPrimitive();
      
      const testParams = generateTestParameters();
      
      const legacyOutput = await renderTemplate(legacyTemplate, testParams);
      const newOutput = await renderTemplate(newTemplate, testParams);
      
      expect(compareVisualOutput(legacyOutput, newOutput)).toBeWithinTolerance(0.95);
    });
    
    test('単語位置が正しく分離されている', () => {
      const template = new FadeBlurRandomTextPrimitive();
      const result = template.renderWordContainer(/* params */);
      
      // 全単語が同じ位置に重ならないことを検証
      expect(result.wordPositions).toHaveUniquePositions();
    });
  });
});
```

### Stage 3: レガシーシステム統合 (v0.5.2)

**期間**: 4週間  
**目標**: 累積レイアウトプリミティブ群の統合

#### 3.1 累積レイアウトプリミティブ統合計画

```typescript
/**
 * 4つの重複するレイアウトプリミティブを統合
 */

// 統合前: 4つのクラスが重複機能を提供
// - CumulativeLayoutPrimitive
// - ImprovedCumulativeLayoutPrimitive  
// - EnhancedCumulativeLayoutPrimitive
// - FlexibleCumulativeLayoutPrimitive

// 統合後: 単一の統一クラス
class CharacterLayoutPrimitive {
  // 全ての表示モードを統合
  layoutIndividual() // <- FlexibleCumulativeLayoutPrimitive.INDIVIDUAL_WORD_ENTRANCE
  layoutCumulative() // <- EnhancedCumulativeLayoutPrimitive互換
  layoutNewLine()    // <- FlexibleCumulativeLayoutPrimitive.PHRASE_CUMULATIVE_NEW_LINE
  layoutSpacing()    // <- FlexibleCumulativeLayoutPrimitive.SIMULTANEOUS_WITH_SPACING
}

/**
 * 自動マイグレーションスクリプト
 */
class LayoutPrimitiveMigrator {
  migrateTemplate(templatePath: string): MigrationResult {
    const sourceCode = this.readTemplate(templatePath);
    
    // 旧プリミティブ使用箇所を検出
    const usages = this.detectLegacyUsage(sourceCode);
    
    // 新プリミティブの対応メソッドに自動変換
    const transformedCode = this.transformUsages(sourceCode, usages);
    
    return {
      originalPath: templatePath,
      transformedCode,
      changes: usages.length,
      warnings: this.analyzeWarnings(usages)
    };
  }
}
```

#### 3.2 非推奨化とドキュメント更新

```typescript
/**
 * レガシープリミティブの段階的非推奨化
 */

// v0.5.2: 非推奨警告を追加
@deprecated('v0.5.2', 'CharacterLayoutPrimitive.layoutCumulativeを使用してください')
class EnhancedCumulativeLayoutPrimitive {
  manageCharacterContainersCompatible() {
    console.warn('非推奨: EnhancedCumulativeLayoutPrimitiveは将来のバージョンで削除されます');
    // 機能は維持
  }
}

// v0.6.0: 削除予定の明示
@willBeRemoved('v0.6.0')
class ImprovedCumulativeLayoutPrimitive {
  // v0.6.0で完全削除
}
```

### Stage 4: エフェクトシステム改善 (v0.5.3)

**期間**: 3週間  
**目標**: エフェクトプリミティブの責任分離

#### 4.1 エフェクトプリミティブ分離

```typescript
// 現在: 責任範囲が曖昧
class GlowEffectPrimitive {
  applyEffect() {
    // グロー + シャドウの複合エフェクト
    // 実際の名前と異なる責任範囲
  }
}

// 改善後: 責任を明確に分離
class GlowEffectPrimitive {
  apply(target: PIXI.DisplayObject, params: GlowParams): void {
    // グロー効果のみ
  }
}

class ShadowEffectPrimitive {
  apply(target: PIXI.DisplayObject, params: ShadowParams): void {
    // シャドウ効果のみ
  }
}

class CompositeEffectPrimitive {
  apply(target: PIXI.DisplayObject, effects: EffectConfig[]): void {
    // 複数エフェクトの組み合わせ管理
    effects.forEach(effect => {
      this.getEffectPrimitive(effect.type).apply(target, effect.params);
    });
  }
}
```

### Stage 5: 完全移行とクリーンアップ (v0.6.0)

**期間**: 2週間  
**目標**: レガシーコードの完全削除

#### 5.1 レガシーコード削除

```bash
# 削除対象ファイル
/src/renderer/primitives/layout/CumulativeLayoutPrimitive.ts
/src/renderer/primitives/layout/ImprovedCumulativeLayoutPrimitive.ts
/src/renderer/primitives/animation/SlideAnimationPrimitive.ts (旧版)

# 移行完了確認
npm run migration:validate
npm run test:full-suite
npm run build:production
```

#### 5.2 最終検証

```typescript
/**
 * 移行完了の最終検証
 */
describe('Migration Completion Validation', () => {
  test('全テンプレートが新アーキテクチャを使用', () => {
    const templates = getAllTemplates();
    templates.forEach(template => {
      expect(template).toExtend(HierarchicalAnimationTemplate);
      expect(template).not.toUseLegacyPrimitives();
    });
  });
  
  test('レガシープリミティブが完全に削除されている', () => {
    expect(() => new SlideAnimationPrimitive()).toThrow();
    expect(() => new CumulativeLayoutPrimitive()).toThrow();
  });
  
  test('全テンプレートが期待される視覚的出力を生成', async () => {
    const visualRegressionResults = await runVisualRegressionTests();
    expect(visualRegressionResults.failureRate).toBeLessThan(0.01);
  });
});
```

## リスク管理

### 高リスク項目と対策

| リスク | 影響度 | 確率 | 対策 |
|--------|--------|------|------|
| 新プリミティブのバグ | 高 | 中 | 並行実行による検証、段階的ロールアウト |
| パフォーマンス劣化 | 中 | 低 | ベンチマークテスト、最適化 |
| 移行期間の延長 | 低 | 中 | バッファ期間の設定、優先度調整 |
| 既存テンプレートの破損 | 高 | 低 | 自動テスト、ロールバック計画 |

### 緊急時対応

```typescript
/**
 * 移行で問題が発生した場合の緊急ロールバック
 */
class EmergencyRollback {
  rollbackToStable(version: string): void {
    // 安定版への自動ロールバック
    this.disableFeatureFlags();
    this.restoreLegacyPrimitives();
    this.validateSystemStability();
  }
}
```

## 成功指標

### 技術指標
- プリミティブ責任範囲の違反: 0件
- テンプレート実装時の位置計算エラー: 0件  
- 累積レイアウトプリミティブ数: 4 → 1
- テストカバレッジ: 95%以上

### 開発者体験指標
- 新テンプレート実装時間: 30%短縮
- プリミティブ選択迷い時間: 80%削減
- デバッグ時間: 50%短縮

この段階的移行計画により、システムの安定性を維持しながら新アーキテクチャの利点を確実に実現します。