# 文字可視性制御の誤実装防止ガイド

## 概要

このドキュメントは、テンプレート実装時に発生しやすい「文字可視性制御の誤実装」を防止するためのガイドラインです。

## 問題の詳細

### 実際に発生した問題

WordSlideTextPrimitiveの初期実装で、以下の誤った実装が行われました：

```typescript
// ❌ 誤った実装
textObj.visible = charAnimationResult.visible;  // 時間範囲外でfalse
```

この実装により、文字が発声時間外で非表示になり、「アニメーションエラー」が発生しました。

### 根本原因

1. **API仕様の曖昧さ**
   - プリミティブが返す`visible`プロパティの意図が不明確
   - 文字レベルでの可視性制御の必要性について明記なし

2. **実装パターンの相違**
   - オリジナル: 文字は常に表示、色のみで状態表現
   - 誤った実装: 文字自体を非表示にしてしまう

## 正しい実装パターン

### 階層別の可視性制御原則

```
フレーズレベル: 全体の表示/非表示を制御（退場時のフェードアウト等）
単語レベル: 入場時の表示制御（フェードイン等）
文字レベル: 常に表示、色変化のみで状態を表現 ← 重要！
```

### 文字レベルの正しい実装

```typescript
// ✅ 正しい実装
renderCharContainer(...) {
  // 文字の状態を色で表現
  let textColor = defaultTextColor;
  
  if (nowMs < startMs) {
    textColor = defaultTextColor;      // 発声前：グレー
  } else if (nowMs <= endMs) {
    textColor = activeTextColor;        // 発声中：アクティブカラー
  } else {
    textColor = completedTextColor;     // 発声後：完了カラー
  }
  
  // テキストオブジェクト作成
  const textObj = TextStyleFactory.createHighDPIText(text, {
    fontFamily: fontFamily,
    fontSize: fontSize,
    fill: textColor  // 色で状態を表現
  });
  
  // 文字は常に表示
  textObj.visible = true;   // ← 重要：常にtrue
  textObj.alpha = 1.0;      // ← 重要：透明度も常に1.0
  
  container.addChild(textObj);
}
```

## 防止策

### 1. プリミティブAPI仕様の明確化

プリミティブが返す値の意図を明確にする：

```typescript
interface CharacterAnimationResult {
  offsetX: number;      // 追加オフセット（通常0）
  offsetY: number;      // 追加オフセット（通常0）
  scale: number;        // スケール値（通常1.0）
  alpha: number;        // 透明度（通常1.0）
  visible: boolean;     // 時間範囲内判定（表示制御には使用しない）
}
```

### 2. 実装時のチェックリスト

- [ ] 文字レベルで`visible = false`にしていないか？
- [ ] 文字の状態は色変化のみで表現しているか？
- [ ] 単語の入退場に文字が追従するか？
- [ ] 発声時間外でも文字が見えるか？

### 3. テスト観点

1. **表示確認**
   - 単語入場時：グレー文字が見える
   - 発声中：アクティブカラーで表示
   - 発声後：完了カラーで表示
   - 単語退場時：文字も一緒に退場

2. **エラー確認**
   - 「アニメーションエラー」が表示されない
   - コンソールにエラーが出力されない

## まとめ

**重要な原則：文字は常に表示、状態は色で表現**

この原則を守ることで、自然なカラオケアニメーションを実現し、エンジンエラーを防止できます。