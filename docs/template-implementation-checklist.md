# テンプレート実装チェックリスト

このチェックリストは、テンプレート実装時の品質保証と問題防止のための必須手順です。

## 📋 Phase 1: 実装開始前（必須）

### 準備
- [ ] **[テンプレート実装クイックスタートガイド](./template-quick-start-guide.md) を読了**
- [ ] 実装方式を決定（90%: カラオケ風、10%: フェード効果）
- [ ] リファレンス実装を特定（WordSlideTextPrimitive または FadeBlurRandomTextPrimitive v2.0）

### リファレンス実装分析
- [ ] **WordSlideTextPrimitive lines 598-599 を確認**
  ```typescript
  textObj.alpha = 1.0;    // アルファは常に1.0
  textObj.visible = true; // 文字は常に表示
  ```
- [ ] 選択したリファレンス実装の動作をテスト環境で確認
- [ ] 同じ歌詞データでテスト実行

## 📋 Phase 2: 基本実装（必須）

### IAnimationTemplate基本構造
- [ ] `export class [TemplateName] implements IAnimationTemplate`
- [ ] `getParameterConfig()` メソッド実装
- [ ] `removeVisualElements()` メソッド実装
- [ ] `animateContainer()` メソッド実装

### 階層メソッド実装
- [ ] `renderPhraseContainer()` 実装
- [ ] `renderWordContainer()` 実装  
- [ ] `renderCharContainer()` 実装

### 文字表示継続性（🚨 重要）
- [ ] **`textObj.visible = true` 設定**
- [ ] **`textObj.alpha = 1.0` 設定**
- [ ] 色変化による状態表現実装
  ```typescript
  if (nowMs < startMs) {
    textColor = defaultTextColor;    // 待機中
  } else if (nowMs <= endMs) {
    textColor = activeTextColor;     // 発声中  
  } else {
    textColor = completedTextColor;  // 完了
  }
  ```

## 📋 Phase 3: 基本動作テスト（必須）

### 文字表示確認
- [ ] 全発声期間で文字が表示されることを確認
- [ ] 単語コンテナ表示中に全単語が見えることを確認
- [ ] 文字が途中で消えないことを確認

### WordSlideTextPrimitive比較テスト
- [ ] 同じ歌詞で両テンプレートを実行
- [ ] 基本的な表示タイミングが同等であることを確認
- [ ] 違いがあれば基本実装を見直し

### 開発時警告チェック
- [ ] ブラウザコンソールに文字表示継続性警告が出ていないことを確認
- [ ] TemplateValidationHelper の警告に対処

## 📋 Phase 4: エフェクト実装（該当する場合）

### フェード効果（上級者向け）
- [ ] **フレーズベースのフェード計算を使用**
  ```typescript
  // ❌ 個別文字時間ベース（問題あり）
  calculateFadeAlpha(nowMs, charStartMs, charEndMs);
  
  // ✅ フレーズベース（推奨）
  calculatePhraseBasedFadeAlpha(nowMs, phraseStartMs, phraseEndMs);
  ```
- [ ] **`applyAlphaToColor()` でフェード実装**
- [ ] `textObj.alpha = 1.0` と `textObj.visible = true` を維持

### ブラー効果
- [ ] `PIXI.BlurFilter` 使用
- [ ] `filterArea` 適切に設定
- [ ] フェードアルファと連動した強度調整

### 位置・アニメーション効果
- [ ] SlideAnimationPrimitive 使用（推奨）
- [ ] FlexibleCumulativeLayoutPrimitive 使用（推奨）
- [ ] 手動計算は最小限に抑制

## 📋 Phase 5: 最終検証（必須）

### 動作確認
- [ ] 複数の歌詞で正常動作することを確認
- [ ] 短い単語・長い単語での表示確認
- [ ] パラメータ変更時の動作確認

### パフォーマンス確認  
- [ ] アニメーション中にエラーが発生しないことを確認
- [ ] メモリリークが発生しないことを確認（長時間実行）
- [ ] CPU使用率が適切な範囲内であることを確認

### コード品質
- [ ] TypeScriptエラーがないことを確認
- [ ] ESLintエラーがないことを確認
- [ ] 不要なconsole.logを削除

## 📋 Phase 6: ドキュメント・登録（推奨）

### パラメータレジストリ
- [ ] 新規パラメータをParameterRegistryに登録
- [ ] パラメータ検証を実行
  ```bash
  npm run validate-parameters
  ```

### テンプレートレジストリ
- [ ] `/src/renderer/templates/index.ts` にエクスポート追加
- [ ] テンプレートレジストリに登録
- [ ] UI上でテンプレートが選択できることを確認

### ドキュメント更新（オプション）
- [ ] 特殊な実装がある場合は実装ガイドに追記
- [ ] 新しいエフェクトがある場合はプリミティブAPI仕様に追記

## 🚨 重要な警告事項

### 絶対に避けるべき実装
```typescript
// ❌ これらの実装は文字表示継続性を破る
textObj.alpha = fadeAlpha;              // アルファ値制御
textObj.visible = fadeAlpha > 0.01;     // 条件付き表示
textObj.visible = nowMs >= startMs && nowMs <= endMs; // 時間ベース表示制御

// ❌ 個別文字時間でのフェード計算
const alpha = calculateFade(nowMs, charStartMs, charEndMs);

// ❌ v2.0 HierarchicalAnimationTemplate の使用（複雑すぎる）
export class MyTemplate extends HierarchicalAnimationTemplate
```

### 推奨される実装
```typescript
// ✅ 正しい文字表示継続性
textObj.alpha = 1.0;
textObj.visible = true;
const colorWithAlpha = applyAlphaToColor(baseColor, fadeAlpha);

// ✅ フレーズベースのフェード計算
const alpha = calculatePhraseBasedFadeAlpha(nowMs, phraseStartMs, phraseEndMs);

// ✅ WordSlideTextPrimitive互換実装
export class MyTemplate implements IAnimationTemplate
```

## 📞 トラブルシューティング

### 文字が表示されない場合
1. [テンプレート実装クイックスタートガイド](./template-quick-start-guide.md#よくある間違いと対策) を確認
2. WordSlideTextPrimitive との比較テストを実行
3. TemplateValidationHelper の警告メッセージを確認
4. `textObj.visible` と `textObj.alpha` の値をデバッグ出力

### 文字が途中で消える場合  
1. フェード計算がフレーズベースになっているか確認
2. 個別文字時間ベースの計算を使用していないか確認
3. `textObj.alpha` による制御をしていないか確認

### エフェクトが効かない場合
1. 基本的な文字表示を先に完成させる
2. エフェクトを段階的に追加
3. 各段階で動作確認を実施

---

**このチェックリストに従うことで、文字表示継続性の問題や実装ミスを大幅に削減できます。**