# テンプレート互換性評価書 v3.0

## 概要

本評価書は、UTAVISTA v0.5.0 クリーンカット移行における全テンプレートの互換性を評価し、移行対象と廃止対象を明確に分類します。複雑な互換性維持コストを排除し、確実な新方式移行を実現します。

## 評価基準

### 移行適格判定基準

**✅ 移行対象 (v2.0対応)**:
1. **プリミティブベース実装**: 既存プリミティブシステムを使用
2. **単純な階層構造**: フレーズ→単語→文字の明確な分離
3. **移行コスト妥当**: 2週間以内で完全移行可能
4. **アクティブ使用**: 実際のプロジェクトで使用実績あり

**❌ 廃止対象 (非対応)**:
1. **レガシー実装**: 古いAPI直接使用
2. **複雑な依存関係**: 複数レガシーシステムへの依存
3. **メンテナンス困難**: 技術的負債が過大
4. **使用頻度低**: 実用性が低い

## 詳細評価結果

### 移行対象テンプレート (3件)

#### 1. WordSlideTextPrimitive ⭐⭐⭐
**評価**: 最優先移行対象

| 項目 | 評価 | 詳細 |
|------|------|------|
| 現在の実装 | ✅ 良好 | SlideAnimationPrimitive使用 |
| 階層分離度 | ✅ 明確 | フレーズ・単語・文字レベル分離済み |
| 移行難易度 | ✅ 低 | 直接的なAPI置き換えのみ |
| 使用頻度 | ✅ 高 | アクティブに使用中 |
| 移行工数 | 3日 | PhrasePosition + WordPosition + CharacterLayout |

**移行方針**:
```typescript
// 移行前: SlideAnimationPrimitive
this.slideAnimation.calculateWordPosition(params);

// 移行後: 分離されたプリミティブ
this.phrasePositioning.calculateStatic(params);
this.wordPositioning.calculateSlide(params);
this.characterLayout.layoutIndividual(container, params);
```

#### 2. FadeBlurRandomTextPrimitive ⭐⭐⭐
**評価**: 最優先移行対象 (部分完了済み)

| 項目 | 評価 | 詳細 |
|------|------|------|
| 現在の実装 | ⚠️ 部分対応 | 一部修正済み、完全移行が必要 |
| 階層分離度 | ✅ 改善済み | deviceScale問題等は解決済み |
| 移行難易度 | ✅ 低 | 既存修正をベースに完全移行 |
| 使用頻度 | ✅ 高 | 実用テンプレートとして重要 |
| 移行工数 | 2日 | 既存修正の完全移行化 |

**移行方針**:
```typescript
// 完全移行: HierarchicalAnimationTemplate継承
class FadeBlurRandomTextPrimitive extends HierarchicalAnimationTemplate {
  protected readonly phrasePositioning = new PhrasePositionPrimitive();
  protected readonly wordPositioning = new WordPositionPrimitive();
  protected readonly characterLayout = new CharacterLayoutPrimitive();
}
```

#### 3. GlitchTextPrimitive ⭐⭐
**評価**: 移行対象

| 項目 | 評価 | 詳細 |
|------|------|------|
| 現在の実装 | ✅ プリミティブ使用 | FlexibleCumulativeLayoutPrimitive使用 |
| 階層分離度 | ⚠️ 要改善 | 累積レイアウトの責任範囲要整理 |
| 移行難易度 | ⚠️ 中 | グリッチエフェクトとの統合要検討 |
| 使用頻度 | ⚠️ 中 | 特殊用途での使用 |
| 移行工数 | 5日 | エフェクト統合とレイアウト分離 |

**移行方針**:
```typescript
// 移行: 累積レイアウト + グリッチエフェクト分離
this.characterLayout.layoutCumulative(container, params);
this.glitchEffect.apply(textObj, glitchParams);
```

### 廃止対象テンプレート (推定15-20件)

#### 高優先度廃止 (即座に削除)

**1. PhraseBlurFadeTemplate**
- **廃止理由**: EnhancedCumulativeLayoutPrimitiveへの重度依存
- **互換性維持コスト**: 3-4週間の改修が必要
- **使用頻度**: 低 (実用例がほとんどない)
- **代替案**: FadeBlurRandomTextPrimitiveで同等機能実現可能

**2. PhraseSyncTextPrimitive**
- **廃止理由**: 複雑なフレーズ同期ロジック + レガシーAPI依存
- **互換性維持コスト**: 5-6週間の大規模改修が必要
- **使用頻度**: 低 (特殊用途のみ)
- **代替案**: 新規実装の方が効率的

**3. BlurFadeTemplate**
- **廃止理由**: 古いブラー実装 + レガシーレイアウト
- **互換性維持コスト**: 2-3週間の中規模改修
- **使用頻度**: 低 (FadeBlurRandomTextPrimitiveで代替可能)
- **代替案**: 移行対象テンプレートで完全代替

#### 中優先度廃止 (v0.5.1で削除)

**レガシーテキストテンプレート群**:
- `BasicTextTemplate`
- `SimpleAnimationTemplate`
- `LegacySlideTemplate`
- `OldCumulativeTemplate`

**評価基準不適合テンプレート**:
- プリミティブ非使用の古い実装
- 複雑な内部状態管理
- 技術的負債が過大

## 移行スケジュール

### Phase 1: 対象テンプレート移行 (2週間)
```
Week 1:
- WordSlideTextPrimitive完全移行 (3日)
- FadeBlurRandomTextPrimitive完全移行 (2日)

Week 2:
- GlitchTextPrimitive移行 (5日)
- 移行テスト・検証 (5日)
```

### Phase 2: 廃止テンプレート削除 (1週間)
```
Week 3:
- 高優先度廃止テンプレート削除 (3日)
- 中優先度廃止テンプレート削除 (2日)
- レジストリ更新・クリーンアップ (2日)
```

## 品質保証

### 移行後テスト要件

**必須テスト項目**:
1. ✅ 移行テンプレートが期待される視覚的出力を生成
2. ✅ 全単語が正しい位置に配置される
3. ✅ エフェクトが適切に適用される
4. ✅ パフォーマンスが維持される

**テスト実装例**:
```typescript
describe('Migration Quality Assurance', () => {
  const MIGRATED_TEMPLATES = [
    'WordSlideTextPrimitive',
    'FadeBlurRandomTextPrimitive', 
    'GlitchTextPrimitive'
  ];
  
  MIGRATED_TEMPLATES.forEach(templateName => {
    test(`${templateName} 正常動作確認`, () => {
      const template = new (getTemplateClass(templateName))();
      
      // HierarchicalAnimationTemplate継承確認
      expect(template).toBeInstanceOf(HierarchicalAnimationTemplate);
      
      // プリミティブ適切使用確認
      expect(template.phrasePositioning).toBeInstanceOf(PhrasePositionPrimitive);
      expect(template.wordPositioning).toBeInstanceOf(WordPositionPrimitive);
      expect(template.characterLayout).toBeInstanceOf(CharacterLayoutPrimitive);
      
      // 視覚的出力確認
      const result = template.renderWordContainer(mockParams);
      expect(result).toBe(true);
      expect(mockContainer.children).toHaveUniqueWordPositions();
    });
  });
});
```

## リスク管理

### 移行リスク

| リスク | 確率 | 影響度 | 対策 |
|--------|------|--------|------|
| 移行テンプレートの機能不足 | 低 | 中 | 事前の機能比較テスト |
| 廃止テンプレートへの依存発覚 | 中 | 低 | プロジェクト全体での使用状況調査 |
| 新プリミティブのバグ | 低 | 高 | 徹底的な単体・統合テスト |

### 緊急時対応

**ロールバック不要方針**:
- クリーンカット移行により中途半端な状態を回避
- 移行前の十分なテストにより品質確保
- 問題発生時は新システム内での修正で対応

この評価に基づく確実な移行により、システムの複雑性を大幅に削減し、保守性を向上させます。