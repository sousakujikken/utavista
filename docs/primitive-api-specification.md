# プリミティブAPI仕様書 v3.0

## 概要

本仕様書は、UTAVISTA LLMテンプレート生成システムで使用される協調的プリミティブライブラリのAPI仕様を定義します。

## 基本原則

### 協調的階層制御

プリミティブは階層構造（フレーズ→単語→文字）を尊重し、各階層で適切な制御を行います。

```
フレーズレベル: 全体の配置、エフェクト、退場アニメーション
単語レベル: 入場アニメーション、文字配置
文字レベル: テンプレート要件に応じた状態表現
```

### プリミティブの責任範囲

**計算責任**: プリミティブは物理的・数学的計算のみを担当
**表現責任**: 実際の視覚表現はテンプレート実装者が決定

```
プリミティブ: 「この時刻では非アクティブ状態」という情報を提供
テンプレート: 「非アクティブ状態をどう表現するか」を決定
             - 選択肢A: 完全に非表示 (visible = false)
             - 選択肢B: 色を変更して表示継続 (color = gray)
             - 選択肢C: 透明度を下げて表示継続 (alpha = 0.3)
```

## API仕様

### 1. SlideAnimationPrimitive

#### calculatePhrasePosition

フレーズ全体の位置を計算します。

```typescript
calculatePhrasePosition(params: {
  phraseOffsetX: number;
  phraseOffsetY: number;
  fontSize: number;
  headTime: number;
  tailTime: number;
  randomPlacement: boolean;
  randomSeed: number;
  randomRangeX: number;
  randomRangeY: number;
  minDistanceFromPrevious: number;
  text: string;
  words: any[];
  nowMs: number;
  startMs: number;
  endMs: number;
  phase: string;
}): { x: number; y: number; alpha: number }
```

**戻り値**:
- `x`, `y`: フレーズの位置
- `alpha`: フレーズ全体の透明度（退場時のフェードアウト用）

#### calculateWordPosition

単語の入場アニメーション位置を計算します。

```typescript
calculateWordPosition(params: {
  fontSize: number;
  headTime: number;
  entranceInitialSpeed: number;
  activeSpeed: number;
  rightOffset: number;
  wordIndex: number;
  nowMs: number;
  startMs: number;
  endMs: number;
  phase: string;
}): { x: number; y: number; alpha: number }
```

**戻り値**:
- `x`, `y`: 単語の位置
- `alpha`: 単語の透明度（入場時のフェードイン用）

#### calculateCharacterAnimation

文字レベルのアニメーション情報を計算します。

```typescript
calculateCharacterAnimation(params: {
  charIndex: number;
  totalChars: number;
  fontSize: number;
  nowMs: number;
  startMs: number;
  endMs: number;
  phase: string;
  animationMode?: 'word' | 'phrase';  // v3.2追加
  phraseStartMs?: number;             // v3.2追加（フレーズ全体の開始時刻）
  phraseEndMs?: number;               // v3.2追加（フレーズ全体の終了時刻）
}): { 
  offsetX: number; 
  offsetY: number; 
  scale: number; 
  alpha: number; 
  visible: boolean;
}
```

**戻り値の意図**:
- `offsetX`, `offsetY`: 位置の微調整値
- `scale`: スケール変更の提案値
- `alpha`: 透明度変更の提案値
- `visible`: アクティブ状態の判定結果

**v3.2追加パラメータ**:
- `animationMode`: アニメーションモード
  - `'word'`: 単語ごとに文字が出現（デフォルト、従来の動作）
  - `'phrase'`: フレーズ全体の文字が一度に出現
- `phraseStartMs`: フレーズ全体の開始時刻（フレーズモード時に使用）
- `phraseEndMs`: フレーズ全体の終了時刻（フレーズモード時に使用）

**実装者の選択**:
```typescript
// 選択肢A: 完全な状態制御（推奨）
textObj.visible = animationResult.visible;
textObj.alpha = animationResult.alpha;
textObj.scale.set(animationResult.scale);

// 選択肢B: 色による状態表現（カラオケ風）
textObj.visible = true;  // 常に表示
textObj.style.fill = animationResult.visible ? activeColor : inactiveColor;

// 選択肢C: 透明度による状態表現
textObj.visible = true;
textObj.alpha = animationResult.visible ? 1.0 : 0.3;
```

### 2. EnhancedCumulativeLayoutPrimitive

#### manageCharacterContainersCompatible

文字コンテナの配置と管理を行います。

```typescript
manageCharacterContainersCompatible(
  wordContainer: PIXI.Container,
  params: EnhancedCumulativeLayoutParams,
  charAnimationCallback?: (
    charContainer: PIXI.Container,
    charData: CharacterData,
    position: { x: number; y: number }
  ) => void
): CharacterManagementResult
```

**重要な仕様**:
- 文字コンテナの作成と配置のみを担当
- 文字の表示/非表示制御は行わない
- 累積オフセット計算による正確な文字配置

### 3. FlexibleCumulativeLayoutPrimitive（v0.4.3新機能）

#### 概要

**FlexibleCumulativeLayoutPrimitive**は、従来の単語配置問題を解決し、2つの異なる表示モードをサポートする統合レイアウトプリミティブです。

#### 2つの単語表示モード

```typescript
enum WordDisplayMode {
  INDIVIDUAL_WORD_ENTRANCE = 'individual_word_entrance',      // 単語ごとに個別入場（WordSlideText）
  PHRASE_CUMULATIVE_SAME_LINE = 'phrase_cumulative_same_line' // 同じ行に単語を配置（GlitchText）
}
```

**注意**: v0.4.3より、フレーズ単位入場や同時表示などの複雑な表示モードは削除されました。これらが必要な場合は、テンプレート側でカスタム実装する必要があります。詳細は[フレーズ単位入場テンプレート設計ガイド](./phrase-level-template-design-guide.md)を参照してください。

#### manageCharacterContainersFlexible

柔軟な単語表示モードに対応した文字コンテナ管理を行います。

```typescript
manageCharacterContainersFlexible(
  wordContainer: PIXI.Container,
  params: FlexibleCumulativeLayoutParams,
  charAnimationCallback?: (
    charContainer: PIXI.Container,
    charData: FlexibleCharacterData,
    position: { x: number; y: number }
  ) => void
): FlexibleCharacterManagementResult
```

#### FlexibleCumulativeLayoutParams

```typescript
interface FlexibleCumulativeLayoutParams extends LayoutParams {
  charSpacing: number;                    // 文字間隔
  fontSize: number;                       // フォントサイズ
  halfWidthSpacingRatio: number;         // 半角文字の間隔比率
  chars: FlexibleCharacterData[];        // 文字データ配列
  containerPrefix: string;               // コンテナ名のプレフィックス
  wordDisplayMode: WordDisplayMode;      // 単語表示モード
  wordSpacing: number;                   // 単語間スペース
  lineHeight: number;                    // 行の高さ
}
```

#### FlexibleCharacterData

```typescript
interface FlexibleCharacterData {
  id: string;                    // 文字ID
  char: string;                  // 文字内容
  start: number;                 // 開始時刻
  end: number;                   // 終了時刻
  charIndexInWord: number;       // 単語内での文字インデックス
  charIndex: number;             // フレーズ全体での累積文字インデックス ★重要
  wordIndex: number;             // 単語インデックス
  totalChars: number;            // フレーズ内の総文字数
  totalWords: number;            // フレーズ内の総単語数
}
```

#### 各表示モードの動作

| モード | 位置計算方法 | 用途 | 特徴 |
|--------|-------------|------|------|
| `INDIVIDUAL_WORD_ENTRANCE` | 単語ごとにx=0からリセット | WordSlideText | 単語ごとに個別のタイミングで入場 |
| `PHRASE_CUMULATIVE_SAME_LINE` | フレーズ全体で累積計算 | GlitchText | 同じ行に単語を配置、隙間なく連続配置 |

#### 重要な仕様

- **累積文字位置計算**: `charIndex`を使用してフレーズ全体での正確な文字位置を計算
- **文字間隔計算式**: `xOffset = charIndex * fontSize * charSpacing` （deviceScaleは使用しない）
- **単語重複問題の解決**: 従来のEnhancedCumulativeLayoutPrimitiveで発生していた単語の重複表示を解決
- **モード切り替え**: パラメータによる動的な表示モード制御
- **後方互換性**: 既存のテンプレートとの互換性を維持

#### v0.4.3重要変更

- **deviceScale削除**: レイアウト計算からdevicePixelRatioの影響を完全に除去
- **文字間隔標準化**: `charSpacing=1.0`で標準的な文字間隔を実現
- **解像度とレイアウトの分離**: テキスト解像度向上とレイアウト計算を明確に分離

#### 使用例

```typescript
// GlitchTextスタイルでの使用
const layoutParams = {
  charSpacing: 1.2,
  fontSize: 120,
  halfWidthSpacingRatio: 0.6,
  alignment: 'left' as const,
  containerSize: { width: 0, height: 0 },
  spacing: 1.2,
  chars: flexibleCharsData,
  containerPrefix: 'char_container_',
  wordDisplayMode: WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE,
  wordSpacing: 1.0,
  lineHeight: 1.2
};

layoutPrimitive.manageCharacterContainersFlexible(
  container, 
  layoutParams, 
  charAnimationCallback
);
```

### 4. MultiLineLayoutPrimitive（v0.4.3新機能）

#### 概要

複数フレーズの段組み配置を管理するプリミティブです。GlitchTextテンプレートの段組み機能をプリミティブ化したものです。

#### calculatePhrasePosition

フレーズの段番号とY座標を計算します。

```typescript
calculatePhrasePosition(params: {
  phraseId: string;
  startMs: number;
  endMs: number;
  nowMs: number;
  text: string;
  totalLines: number;        // 総段数
  lineSpacing: number;       // 段間隔
  resetInterval: number;     // 段リセット間隔
  manualLineNumber: number;  // 手動段番号指定
}): { lineNumber: number; y: number }
```

#### 重要な仕様

- **グローバル段管理**: フレーズ間で段番号を自動管理
- **自動段リセット**: 指定間隔での段番号リセット機能
- **段番号キャッシュ**: 同一フレーズの段番号を記憶
- **画面中央基準**: 画面中央を基準とした段配置計算

### 5. GlitchEffectPrimitive（v0.4.3新機能）

#### 概要

テキストにピクセルブロック単位のグリッチ効果を適用するプリミティブです。

#### applyEffect

グリッチ効果をテキストに適用します。

```typescript
applyEffect(
  container: PIXI.Container, 
  params: GlitchEffectParams
): void
```

#### GlitchEffectParams

```typescript
interface GlitchEffectParams extends EffectParams {
  enableGlitch: boolean;           // グリッチ有効化
  glitchBlockSize: number;         // ピクセルブロックサイズ
  glitchBlockCount: number;        // ブロック数
  glitchUpdateInterval: number;    // 更新間隔
  glitchIntensity: number;         // 強度
  glitchThreshold: number;         // 発生閾値
  glitchWaveSpeed: number;         // 波動速度
  glitchRandomness: number;        // ランダム性
  nowMs: number;                   // 現在時刻
  text: string;                    // テキスト内容
  fontSize: number;                // フォントサイズ
  fontFamily: string;              // フォントファミリー
  textColor: string;               // テキストカラー
}
```

#### 重要な仕様

- **RenderTexture使用**: テキストをテクスチャ化してピクセル単位制御
- **動的グリッチ制御**: 時間ベースの波動関数による自然なグリッチ
- **ブロック入れ替え**: 同一行内でのピクセルブロック位置入れ替え
- **フォールバック機能**: エラー時の通常テキスト描画

### 6. GlowEffectPrimitive

#### applyEffect

エフェクトをコンテナに適用します。

```typescript
applyEffect(
  container: PIXI.Container,
  params: CompositeEffectParams
): void
```

#### CompositeEffectParams

```typescript
interface CompositeEffectParams {
  enableGlow: boolean;           // グロー効果の有効化
  enableShadow: boolean;         // シャドウ効果の有効化
  blendMode: string;             // ブレンドモード
  
  // グローエフェクト標準パラメータ（v0.4.3共通仕様）
  glowStrength: number;          // グロー強度 (0-5, デフォルト: 1.5)
  glowBrightness: number;        // 明度 (0.5-3, デフォルト: 1.2)
  glowBlur: number;              // ぼかし半径 (0.1-20, デフォルト: 6) ★共通仕様
  glowQuality: number;           // グロー精細度 (0.1-20, デフォルト: 8) ★標準公開
  
  // シャドウエフェクト標準パラメータ（v0.4.3共通仕様）
  shadowBlur: number;            // シャドウぼかし半径 (0-50, デフォルト: 6) ★共通仕様
  shadowColor: string;           // シャドウ色 (デフォルト: "#000000")
  shadowAngle: number;           // シャドウ角度 (0-360°, デフォルト: 45)
  shadowDistance: number;        // シャドウ距離 (0-100, デフォルト: 8)
  shadowAlpha: number;           // シャドウ透明度 (0-1, デフォルト: 0.8)
  shadowQuality: number;         // シャドウ精細度 (1-10, デフォルト: 4) ★標準公開
  
  // 画面サイズ情報（フィルターエリア計算用）
  screenWidth: number;
  screenHeight: number;
}
```

#### v0.4.3共通仕様: エフェクト精細度パラメータ

**全テンプレート共通で以下のエフェクトパラメータをUIに標準公開することを必須とします**：

1. **glowBlur** (グローぼかし半径)
   - 範囲: 0.1-20
   - デフォルト: 6
   - 単位: ピクセル単位のぼかし効果

2. **glowQuality** (グロー精細度) ★新標準
   - 範囲: 0.1-20
   - デフォルト: 8
   - 効果: 高いほど高品質だが処理負荷が重い

3. **shadowBlur** (シャドウぼかし半径)
   - 範囲: 0-50
   - デフォルト: 6
   - 単位: ピクセル単位のぼかし効果

4. **shadowQuality** (シャドウ精細度) ★新標準
   - 範囲: 1-10 (整数値)
   - デフォルト: 4
   - 効果: 高いほど高品質だが処理負荷が重い

これらの精細度パラメータは、**テンプレート作成者が必ず`getParameterConfig()`に含める必要があります**。ユーザーが品質とパフォーマンスのバランスを調整できるようにするためです。

**適用階層**:
- 主にフレーズレベルで使用
- 文字レベルでは使用しない

## 実装ガイドライン

### 状態表現の選択

テンプレートの要件に応じて適切な状態表現を選択してください：

#### パターンA: 完全制御（一般的）
```typescript
const animResult = slideAnimation.calculateCharacterAnimation(params);
textObj.visible = animResult.visible;
textObj.alpha = animResult.alpha;
textObj.scale.set(animResult.scale);
```
**用途**: 文字の出現・消失アニメーションが必要なテンプレート

#### パターンB: カラオケ風表現
```typescript
const animResult = slideAnimation.calculateCharacterAnimation(params);
textObj.visible = true;  // 常に表示
const textColor = animResult.visible ? activeColor : defaultColor;
textObj.style.fill = textColor;
```
**用途**: 歌詞表示のように文字を常に見せたいテンプレート

#### パターンC: 半透明表現
```typescript
const animResult = slideAnimation.calculateCharacterAnimation(params);
textObj.visible = true;
textObj.alpha = animResult.visible ? 1.0 : 0.3;  // 薄く表示
```
**用途**: 文字を薄く表示して視認性を保ちたいテンプレート

#### パターンD: フレーズ単位表現（v3.2追加）
```typescript
// フレーズ内の全文字を一度に表示する場合
const animResult = slideAnimation.calculateCharacterAnimation({
  ...baseParams,
  animationMode: 'phrase',
  phraseStartMs: phrase.start,
  phraseEndMs: phrase.end
});
textObj.visible = animResult.visible;
textObj.alpha = animResult.alpha;
```
**用途**: フレーズ全体の文字を同時に出現させたいテンプレート

### プリミティブとテンプレートの責任分担

**プリミティブの責任**:
- 時間に基づく状態計算
- 物理的な位置・スケール・透明度の算出
- アクティブ/非アクティブの判定

**テンプレートの責任**:
- プリミティブの計算結果をどう視覚表現するかの決定
- テンプレート固有の表現要件の実装
- ユーザーパラメータとの統合

## スリープ復帰時の安全対策（v3.1追加）

### 問題の背景
システムスリープからの復帰時に、テンプレート切り替え処理が異常に繰り返される問題が発生することがあります。これは主に以下の要因によります：

1. フィルターの不完全なクリーンアップ
2. 階層的なフィルター適用の重複
3. スリープ復帰時の再描画処理

### 必須実装要件

#### 1. removeVisualElements の完全実装
```typescript
removeVisualElements(container: PIXI.Container): void {
  // 1. フィルターのクリーンアップを最初に行う
  if (container.filters && container.filters.length > 0) {
    container.filters.forEach(filter => {
      if (filter && typeof filter.destroy === 'function') {
        filter.destroy();
      }
    });
    container.filters = [];
  }
  container.filterArea = null;
  
  // 2. 視覚要素の削除
  const childrenToRemove: PIXI.DisplayObject[] = [];
  container.children.forEach(child => {
    if (child instanceof PIXI.Text || child instanceof PIXI.Graphics) {
      childrenToRemove.push(child);
    }
  });
  
  childrenToRemove.forEach(child => {
    container.removeChild(child);
    child.destroy();
  });
  
  // 3. 子コンテナのフィルターも再帰的にクリア
  container.children.forEach(child => {
    if (child instanceof PIXI.Container) {
      if (child.filters && child.filters.length > 0) {
        child.filters.forEach(filter => {
          if (filter && typeof filter.destroy === 'function') {
            filter.destroy();
          }
        });
        child.filters = [];
      }
      child.filterArea = null;
    }
  });
}
```

#### 2. フィルター適用の単一責任原則
- フィルター（特にブラー）は単一の階層でのみ適用する
- フレーズレベルで適用する場合は、単語・文字レベルでは適用しない
- 重複適用を避けるため、適用前に既存フィルターの確認を行う

#### 3. スリープ復帰対策
- `removeVisualElements`は必ずフィルターの完全クリーンアップを含める
- フィルターの`destroy()`メソッドを確実に呼び出す
- `filterArea`のnull設定を忘れない

### 実装チェックリスト
- [ ] `removeVisualElements`でフィルターを完全にクリーンアップしているか
- [ ] フィルターの`destroy()`を呼び出しているか
- [ ] `filterArea`をnullに設定しているか
- [ ] 子コンテナのフィルターも再帰的にクリアしているか
- [ ] フィルター適用が単一階層に限定されているか

## バージョン履歴

- v3.2: フレーズ単位での文字アニメーションモードを追加
- v3.1: スリープ復帰時の安全対策を追加
- v3.0: プリミティブとテンプレートの責任分担を明確化、実装パターンの選択肢を提示
- v2.1: 文字可視性制御の明確化、誤実装防止ガイドライン追加
- v2.0: 協調的プリミティブライブラリ初版