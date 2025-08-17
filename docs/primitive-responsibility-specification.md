# プリミティブ責任範囲仕様書

## 概要

本仕様書は、協調的プリミティブライブラリにおける「プリミティブの責任」と「テンプレート実装者の責任」を明確に定義します。

## 基本原則

### 分離の原則

**プリミティブ**: 純粋な計算ロジックのみを担当
**テンプレート**: 視覚表現とユーザー体験の決定を担当

```
[時間・物理計算] ← プリミティブの領域
        ↓
[計算結果の提供]
        ↓  
[視覚表現の選択] ← テンプレートの領域
```

## 責任分担の詳細

### プリミティブの責任

1. **時間ベース状態計算**
   ```typescript
   // 現在時刻が発声時間内かどうかの判定
   const isActive = nowMs >= startMs && nowMs <= endMs;
   
   // 物理的なアニメーション進行度の計算
   const progress = Math.min(1.0, elapsedTime / duration);
   
   // イージング関数による値の変換
   const easedValue = easing(progress);
   ```

2. **物理・数学計算**
   ```typescript
   // 距離と速度による位置計算
   const position = calculatePhysicsPosition(time, velocity, acceleration);
   
   // 文字配置の累積オフセット計算
   const cumulativeOffset = calculateCumulativeLayout(characters, spacing);
   ```

3. **標準的な状態値の提供**
   ```typescript
   return {
     offsetX: calculatedX,     // 計算された位置
     offsetY: calculatedY,
     scale: calculatedScale,   // 計算されたスケール
     alpha: calculatedAlpha,   // 計算された透明度
     visible: isActiveState    // アクティブ状態の判定結果
   };
   ```

### テンプレート実装者の責任

1. **視覚表現方針の決定**
   ```typescript
   // プリミティブから受け取った状態をどう表現するか
   if (animationResult.visible) {
     // アクティブ状態の表現方法を選択
     approach1_FullDisplay();      // 完全表示
     approach2_ColorChange();      // 色変更のみ
     approach3_AlphaBlending();    // 透明度調整
   } else {
     // 非アクティブ状態の表現方法を選択
     approach1_Hide();             // 完全非表示
     approach2_DimColor();         // 暗い色で表示
     approach3_LowAlpha();         // 薄く表示
   }
   ```

2. **ユーザーパラメータとの統合**
   ```typescript
   // プリミティブ結果 + ユーザー設定 = 最終表現
   const finalColor = blendColors(
     animationResult.visible ? activeColor : inactiveColor,
     userDefinedColor,
     userBlendMode
   );
   ```

3. **テンプレート固有要件の実装**
   ```typescript
   // 例: カラオケテンプレートの場合
   if (templateType === 'karaoke') {
     // 文字は常に見える必要がある
     textObj.visible = true;
     textObj.style.fill = animationResult.visible ? activeColor : waitingColor;
   }
   
   // 例: アピアランステンプレートの場合  
   if (templateType === 'appearance') {
     // 時間外では完全に非表示
     textObj.visible = animationResult.visible;
     textObj.alpha = animationResult.alpha;
   }
   ```

## 実装パターン例

### パターン1: カラオケ風テンプレート

```typescript
renderCharContainer(container, text, params, nowMs, startMs, endMs) {
  const animResult = slideAnimation.calculateCharacterAnimation({
    charIndex, totalChars, fontSize, nowMs, startMs, endMs, phase
  });
  
  // テンプレート要件: 文字は常に見える
  const textObj = createText(text, params);
  textObj.visible = true;  // 常に表示
  
  // 状態は色で表現
  if (animResult.visible) {
    textObj.style.fill = params.activeTextColor;    // 発声中
  } else if (nowMs < startMs) {
    textObj.style.fill = params.defaultTextColor;   // 発声前
  } else {
    textObj.style.fill = params.completedTextColor; // 発声後
  }
  
  container.addChild(textObj);
}
```

### パターン2: エフェクト重視テンプレート

```typescript
renderCharContainer(container, text, params, nowMs, startMs, endMs) {
  const animResult = slideAnimation.calculateCharacterAnimation({
    charIndex, totalChars, fontSize, nowMs, startMs, endMs, phase
  });
  
  // テンプレート要件: ドラマチックな出現・消失
  const textObj = createText(text, params);
  
  // プリミティブ結果をそのまま適用
  textObj.visible = animResult.visible;
  textObj.alpha = animResult.alpha;
  textObj.scale.set(animResult.scale);
  textObj.position.set(animResult.offsetX, animResult.offsetY);
  
  container.addChild(textObj);
}
```

### パターン3: ハイブリッドテンプレート

```typescript
renderCharContainer(container, text, params, nowMs, startMs, endMs) {
  const animResult = slideAnimation.calculateCharacterAnimation({
    charIndex, totalChars, fontSize, nowMs, startMs, endMs, phase
  });
  
  const textObj = createText(text, params);
  
  // ユーザー設定に応じて表現方法を切り替え
  const displayMode = params.characterDisplayMode as string;
  
  switch (displayMode) {
    case 'karaoke':
      textObj.visible = true;
      textObj.style.fill = animResult.visible ? 
        params.activeColor : params.inactiveColor;
      break;
      
    case 'dramatic':
      textObj.visible = animResult.visible;
      textObj.alpha = animResult.alpha;
      textObj.scale.set(animResult.scale);
      break;
      
    case 'subtle':
      textObj.visible = true;
      textObj.alpha = animResult.visible ? 1.0 : 0.3;
      break;
  }
  
  container.addChild(textObj);
}
```

## 判断基準

### プリミティブへの追加が適切な場合

- 複数のテンプレートで共通して必要な計算
- 時間・物理・数学に基づく客観的な処理
- 表現方法に依存しない汎用的なロジック

### テンプレート実装での対応が適切な場合

- 特定のテンプレートの固有要件
- ユーザーの好みや設定に依存する表現
- ブランドやテーマに関連する視覚的判断

## まとめ

**プリミティブは「何が起きているか」を計算**
**テンプレートは「どう見せるか」を決定**

この明確な分離により、汎用性と表現力を両立した柔軟なテンプレートシステムを実現します。