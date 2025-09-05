# テンプレート実装クイックスタートガイド

## 🚨 必読: カラオケテンプレートの基本原則（重要度：高）

### 🔴 CRITICAL: 拡張ID対応（v0.6.0+）
```typescript
// 🚨 ALL templates using same_line modes MUST implement these methods:

/**
 * Extract phrase ID from full container ID
 * Example: "phrase_2_word_2_h0f5" → "phrase_2"
 */
private extractPhraseIdFromFullId(fullId: string): string {
  const wordIndex = fullId.indexOf('_word_');
  return wordIndex !== -1 ? fullId.substring(0, wordIndex) : fullId;
}

/**
 * Generate extended IDs for accurate word spacing calculation
 */
private generateAllWordExtendedIds(words: any[], phraseId: string): string[] {
  // Implementation required - see CLAUDE.md for full example
}

// Template must include allWordExtendedIds in layoutParams:
const layoutParams = {
  // ... other parameters
  allWordExtendedIds: this.generateAllWordExtendedIds(params.words, phraseId),
  wordSpacing: params.wordSpacing as number || 1.0
};
```

### 文字表示継続性の鉄則
```typescript
// ✅ 正しい実装（WordSlideTextPrimitive方式）
textObj.visible = true;  // 常に表示
textObj.alpha = 1.0;     // 常に1.0
textObj.style.fill = getStateColor(nowMs, startMs, endMs); // 色で状態表現

// ❌ 間違った実装（FadeBlurRandomTextPrimitive v1.0の問題）
textObj.visible = alpha > 0.01;  // 発声期間外で非表示になる
textObj.alpha = calculateFadeAlpha(); // アルファ値で制御
```

**理由**: カラオケアニメーションでは「単語コンテナ表示中は全ての単語が表示されている」ことが必須要件です。

## 🎯 実装方式の選択（重要度：高）

### A. カラオケ風テンプレート（推奨 - 90%のケース）
**用途**: 一般的な歌詞アニメーション、WordSlideText系、状態変化重視
**実装方式**: **色変化のみ**
```typescript
// 状態判定
let textColor = defaultTextColor;
if (nowMs < startMs) {
  textColor = defaultTextColor;    // 待機中
} else if (nowMs <= endMs) {
  textColor = activeTextColor;     // 発声中
} else {
  textColor = completedTextColor;  // 完了
}

// 文字作成
const textObj = TextStyleFactory.createHighDPIText(text, {
  fill: textColor // 色で状態表現
});
textObj.alpha = 1.0;     // 常に1.0
textObj.visible = true;  // 常に表示
```

### B. フェード効果テンプレート（上級者向け - 10%のケース）
**用途**: 特殊なフェード演出、ブラー効果付き、透明度変化重視
**実装方式**: **色のアルファ値制御**
```typescript
// フェードアルファ計算（フレーズベース）
const alpha = calculatePhraseBasedFadeAlpha(nowMs, phraseStartMs, phraseEndMs);

// 色にアルファ値適用
const colorWithAlpha = applyAlphaToColor(textColor, alpha);

// 文字作成
const textObj = TextStyleFactory.createHighDPIText(text, {
  fill: colorWithAlpha // 色+アルファで状態表現
});
textObj.alpha = 1.0;     // 常に1.0（重要）
textObj.visible = true;  // 常に表示（重要）
```

## 📋 必須実装チェックリスト

### Phase 0: wordOffsetX実装（グラフィック要素使用時）
- [ ] **wordOffsetXは**フレーズコンテナレベル**で一度だけ適用**
- [ ] 単語・文字・グラフィックコンテナレベルで個別適用していない
- [ ] テキストとグラフィック要素が同じ距離だけ移動することをテスト
- [ ] [詳細ガイド](./primitive-api-specification.md#wordOffsetX実装ガイドライン) を参照

### Phase 1: 基本実装
- [ ] **WordSlideTextPrimitive (lines 598-599) を確認**
- [ ] 文字レベルで `visible = true`, `alpha = 1.0` を設定
- [ ] 全発声期間で文字が表示されることをテスト
- [ ] 色変化による状態表現をテスト

### Phase 2: エフェクト追加（該当する場合）
- [ ] エフェクト追加前後で基本動作が変わらないことを確認
- [ ] フェード効果は `applyAlphaToColor()` で実装
- [ ] ブラー効果は `PIXI.BlurFilter` + `filterArea` で実装
- [ ] 文字表示継続性を維持

### Phase 3: 最終検証
- [ ] 単語コンテナ表示中に全単語が見えることを確認
- [ ] アニメーションエラーが発生しないことを確認
- [ ] WordSlideTextPrimitive と同等の基本動作を確認

## 🔍 リファレンス実装

### 必須参考: WordSlideTextPrimitive
**ファイル**: `/src/renderer/templates/WordSlideTextPrimitive.ts`
**重要な実装部分**:
```typescript
// lines 598-599: 文字表示の標準実装
textObj.alpha = 1.0;    // アルファは常に1.0
textObj.visible = true; // 文字は常に表示（オリジナル準拠）
```

### フェード効果リファレンス: FadeBlurRandomTextPrimitive v2.0
**ファイル**: `/src/renderer/templates/FadeBlurRandomTextPrimitive.ts`
**重要な実装部分**:
```typescript
// フェード効果をカラーのアルファ値で表現
const colorWithAlpha = this.applyAlphaToColor(textColor, alpha);
textObj.alpha = 1.0;     // 常に1.0（WordSlideTextPrimitive互換）
textObj.visible = true;  // 常に表示（WordSlideTextPrimitive互換）
```

## ⚠️ よくある間違いと対策

### 間違い1: アルファ値での可視性制御
```typescript
// ❌ 間違い
textObj.alpha = fadeAlpha; // 発声期間外で消える
textObj.visible = fadeAlpha > 0.01;

// ✅ 正解
textObj.alpha = 1.0;
textObj.visible = true;
const colorWithAlpha = applyAlphaToColor(baseColor, fadeAlpha);
```

### 間違い2: 個別文字時間ベースのフェード
```typescript
// ❌ 間違い - 個別文字の発声時間
calculateFadeAlpha(nowMs, charStartMs, charEndMs);

// ✅ 正解 - フレーズ全体の表示時間
calculatePhraseBasedFadeAlpha(nowMs, phraseStartMs, phraseEndMs);
```

### 間違い3: v2.0 HierarchicalAnimationTemplate の誤用
```typescript
// ❌ 間違い - v2.0は実装が複雑
export class MyTemplate extends HierarchicalAnimationTemplate

// ✅ 正解 - WordSlideTextPrimitive互換
export class MyTemplate implements IAnimationTemplate
```

## 🛠️ デバッグ手順

### Step 1: 基本表示確認
```typescript
console.log('文字表示状態:', {
  visible: textObj.visible,
  alpha: textObj.alpha,
  color: textObj.style.fill
});
```

### Step 2: WordSlideTextPrimitive との比較
1. 同じ歌詞で両テンプレートをテスト
2. 文字の表示タイミングを比較
3. 差異があれば基本実装を見直し

### Step 3: 段階的実装
1. まず色変化のみで実装
2. 動作確認後にエフェクト追加
3. 各段階で表示継続性をテスト

## 📚 関連ドキュメント

- [Template Implementation Guide](/docs/template-implementation-guide.md) - 詳細な実装ガイド
- [Primitive API Specification](/docs/primitive-api-specification.md) - プリミティブAPI仕様
- [Character Visibility Prevention Guide](/docs/character-visibility-prevention-guide.md) - 文字表示問題の予防策

---

**重要**: このガイドを最初に読んでから詳細ドキュメントに進むことで、重要な原則を見落とすリスクを大幅に削減できます。