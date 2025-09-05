# プリミティブAPI仕様書 v4.0

## 概要

本仕様書は、UTAVISTA v0.5.1で使用される協調的プリミティブライブラリのAPI仕様を定義します。v4.0では新たに**グラフィックプリミティブシステム**と**多行表示システム**が追加されました。

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
  INDIVIDUAL_WORD_ENTRANCE_SAME_LINE = 'individual_word_entrance_same_line',   // 単語ごとに個別入場 × 同一行
  PHRASE_CUMULATIVE_SAME_LINE = 'phrase_cumulative_same_line',                 // フレーズ一括入場 × 同一行
  INDIVIDUAL_WORD_ENTRANCE_NEW_LINE = 'individual_word_entrance_new_line',     // 単語ごとに個別入場 × 改行
  PHRASE_CUMULATIVE_NEW_LINE = 'phrase_cumulative_new_line'                    // フレーズ一括入場 × 改行
}
```

**🚨 CRITICAL: 拡張コンテナID対応（v0.5.1+）**:

⚠️ **必須実装事項**：
- **ALL templates using same_line modes MUST implement extended ID support**
- テンプレートは`extractPhraseIdFromFullId`と`generateAllWordExtendedIds`メソッドを実装する必要があります
- `allWordExtendedIds`パラメータをFlexibleCumulativeLayoutParamsに含める必要があります

⚠️ **拡張ID生成の重要性**：
- 拡張IDは正確な単語幅計算に不可欠です（フォーマット: `phrase_N_word_M_hXfY`）
- 間違った拡張IDは単語間隔の計算バグを引き起こします
- 重複するword部分を含むIDは絶対に避けてください（例：`phrase_2_word_2_h0f5_word_0_h0f6` ❌）

⚠️ **SlideAnimationPrimitive連携（v0.5.1+）**：
- same_lineモード使用時は、SlideAnimationPrimitiveでの位置計算を無効化してください
- FlexibleCumulativeLayoutPrimitiveに位置計算を完全に委任することで二重処理を防ぎます

**重要な実装上の注意事項（2025-01-24追加）**:

⚠️ **プリミティブインスタンスの生成タイミング**：
- テンプレート実装時、`FlexibleCumulativeLayoutPrimitive`は**単語コンテナごとに独立して処理される**ため、各単語処理時に新しいインスタンスが作成されます
- これにより、単語間の累積オフセットが自動的にリセットされる可能性があります

⚠️ **単語間オフセット処理**：
- `INDIVIDUAL_WORD_ENTRANCE_SAME_LINE`モードを使用する場合、プリミティブ内部で**コンテナIDから単語インデックスを抽出**し、前の単語までの累積オフセットを自動計算します
- コンテナIDは`phrase_0_word_2_char_1`形式を維持する必要があります

⚠️ **データ型変換の重要性**：
- テンプレート実装時は必ず`CharUnit[]`を`FlexibleCharacterData[]`に正しく変換してください
- 特に**wordIndexプロパティ**の設定が必須です（これがないと単語グループ化が失敗します）

```typescript
// 正しい変換例
const charsData: FlexibleCharacterData[] = rawCharsData.map((char, index) => ({
  id: char.id,
  char: char.char,
  start: char.start,
  end: char.end,
  charIndexInWord: index,
  charIndex: char.charIndex || index,
  wordIndex: params.wordIndex as number || 0,  // ← 重要：必須
  totalChars: char.totalChars || rawCharsData.length,
  totalWords: char.totalWords || 1
}));
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
  allWordExtendedIds?: string[];         // 🚨 v0.5.1+ REQUIRED: 拡張ID配列（正確な単語幅計算用）
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

### 7. SparkleEffectPrimitive（v0.5.0新機能）

#### 概要

文字にキラキラパーティクルエフェクトを適用するプリミティブです。決定論的パーティクルシステムにより、タイムライン操作と動画エクスポート時に完全再現可能なエフェクトを提供します。

#### applyEffect

スパークルエフェクトをテキストに適用します。

```typescript
applyEffect(
  container: PIXI.Container, 
  params: SparkleEffectParams
): void
```

#### SparkleEffectParams

```typescript
interface SparkleEffectParams extends EffectParams {
  // 基本パラメータ
  enableSparkle: boolean;              // エフェクトの有効/無効
  sparkleCount: number;                // 同時生成パーティクル数 (1-20, デフォルト: 4)
  sparkleSize: number;                 // パーティクルサイズ(px) (4-30, デフォルト: 20)
  sparkleColor: string;                // パーティクルカラー (デフォルト: "#FFD700")
  sparkleStarSpikes: number;           // 星型の角数 (3-12, デフォルト: 5)
  sparkleScale: number;                // スケール倍率 (0.5-10, デフォルト: 3.0)
  sparkleDuration: number;             // パーティクル寿命(ms) (500-3000, デフォルト: 1000)
  sparkleRadius: number;               // 散布半径(px) (5-100, デフォルト: 30)
  sparkleAnimationSpeed: number;       // アニメーション速度 (0.1-3.0, デフォルト: 1.0)
  sparkleAlphaDecay: number;           // 透明度減衰率 (0.9-0.99, デフォルト: 0.98)
  sparkleRotationSpeed: number;        // パーティクル回転速度 (0-2.0, デフォルト: 0.3)
  sparkleGenerationRate: number;       // 1秒間のパーティクル生成数 (0.5-10.0, デフォルト: 2.0)
  sparkleVelocityCoefficient: number;  // 移動速度依存係数 (0-3.0, デフォルト: 1.0)
  
  // グローエフェクト（パーティクル用）
  enableParticleGlow: boolean;         // パーティクルグロー効果
  particleGlowStrength: number;        // グロー強度 (0.1-5.0, デフォルト: 1.2)
  particleGlowBrightness: number;      // グロー明度 (0.5-3.0, デフォルト: 1.1)
  particleGlowBlur: number;            // グローブラー量 (1-20, デフォルト: 4)
  particleGlowQuality: number;         // グロー品質 (2-32, デフォルト: 6)
  particleGlowThreshold: number;       // グロー閾値 (0-1, デフォルト: 0.1)
  
  // 瞬きエフェクト（Twinkle機能 - v0.5.1強化）
  enableTwinkle?: boolean;             // 瞬き機能の有効/無効 (デフォルト: true)
  twinkleFrequency?: number;           // 瞬きの頻度（回/秒） (0.1-5.0, デフォルト: 1.0)
  twinkleBrightness?: number;          // 瞬き時の明度倍率 (未使用、内部で1.5固定)
  twinkleDuration?: number;            // 瞬きの持続時間（ms） (50-500, デフォルト: 120)
  twinkleProbability?: number;         // 瞬きの確率（0-1） (0-1, デフォルト: 0.8)
  
  // システムパラメータ
  nowMs: number;                       // 現在時刻
  startMs: number;                     // 開始時刻
  endMs: number;                       // 終了時刻
  phraseEndMs?: number;                // フレーズ終了時刻
  tailTime?: number;                   // 延長時間（デフォルト: 500ms）
  text?: string;                       // 文字テキスト
  globalPosition?: {x: number; y: number}; // グローバル座標
  charId?: string;                     // 文字ID（シード生成用）
  outputResolutionScale?: number;      // 解像度スケールファクター
}
```

#### 重要な仕様

- **ステージレベル管理**: 文字コンテナから独立したパーティクル描画
- **決定論的システム**: タイムライン時間ベースの可逆的パーティクル生成
- **ジェネレーターベース**: 文字ごとの発生点で継続的にパーティクル生成
- **独立更新ループ**: エンジンメインループから独立した更新システム
- **移動速度依存**: 文字移動速度に応じたパーティクル生成頻度調整
- **グロー対応**: パーティクル専用のAdvancedBloomFilterグロー効果
- **解像度スケーリング**: 動画出力時の品質向上に対応
- **Twinkle効果（v0.5.1）**: パーティクルの瞬き効果（明暗のコントラスト）

#### 使用例

```typescript
// テンプレート内での基本的な使用例
sparkleEffectPrimitive.applyEffect(charContainer, {
  enableSparkle: true,
  sparkleCount: 4,
  sparkleSize: 20,
  sparkleColor: '#FFD700',
  sparkleDuration: 1500,
  sparkleRadius: 30,
  nowMs,
  startMs: charStartMs,
  endMs: charEndMs,
  phraseEndMs: phraseEndMs,
  globalPosition: charContainer.getGlobalPosition(),
  charId: `${phraseId}_${wordId}_${charIndex}`,
  text: charText
});
```

### 8. ShapePrimitive（v0.5.1新機能）

#### 概要

基本図形の作成とアニメーション機能を提供するプリミティブです。矩形、円、多角形、星形の描画に加え、複雑なアニメーション制御をサポートします。

#### createRectangle

矩形を作成します。

```typescript
createRectangle(params: {
  width: number;
  height: number;
  x?: number;
  y?: number;
  color?: number | string;
  alpha?: number;
  strokeColor?: number | string;
  strokeWidth?: number;
  cornerRadius?: number;
}): PIXI.Graphics
```

**パラメータ**:
- `width`, `height`: 矩形のサイズ
- `x`, `y`: 位置（デフォルト: 0, 0）
- `color`: 塗りつぶし色（HEXまたは数値）
- `alpha`: 透明度（0-1）
- `strokeColor`, `strokeWidth`: 線の色と太さ
- `cornerRadius`: 角丸半径（0で通常の矩形）

#### createCircle

円を作成します。

```typescript
createCircle(params: {
  radius: number;
  x?: number;
  y?: number;
  color?: number | string;
  alpha?: number;
  strokeColor?: number | string;
  strokeWidth?: number;
}): PIXI.Graphics
```

#### createPolygon

多角形を作成します。

```typescript
createPolygon(params: {
  points: number[];  // [x1, y1, x2, y2, ...]
  color?: number | string;
  alpha?: number;
  strokeColor?: number | string;
  strokeWidth?: number;
  closed?: boolean;  // false で開いた線
}): PIXI.Graphics
```

#### createStar

星形を作成します。

```typescript
createStar(
  points: number,        // 星の角数
  outerRadius: number,   // 外側の半径
  innerRadius: number,   // 内側の半径
  params: {
    color?: number | string;
    alpha?: number;
    strokeColor?: number | string;
    strokeWidth?: number;
  }
): PIXI.Graphics
```

#### startAnimation

図形のアニメーションを開始します。

```typescript
startAnimation(
  animationId: string,
  graphics: PIXI.Graphics,
  config: {
    property: 'x' | 'y' | 'scale' | 'scaleX' | 'scaleY' | 'rotation' | 'alpha' | 'width' | 'height';
    from: number;
    to: number;
    duration: number;
    easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic';
    loop?: boolean;
    yoyo?: boolean;
  },
  startTime: number
): void
```

#### updateAnimation

アニメーションを更新します（毎フレーム呼び出し）。

```typescript
updateAnimation(animationId: string, currentTime: number): void
```

#### 実装例

```typescript
export class MyTemplate implements IAnimationTemplate {
  private shapePrimitive = new ShapePrimitive();

  renderPhraseContainer(container, params, nowMs) {
    // 黒い背景矩形を作成
    const background = this.shapePrimitive.createRectangle({
      width: 800,
      height: 100,
      x: -400,
      y: -50,
      color: '#000000',
      alpha: 0.8,
      cornerRadius: 10
    });
    
    // パルスアニメーションを開始
    this.shapePrimitive.startAnimation(
      'background_pulse',
      background,
      {
        property: 'scale',
        from: 1.0,
        to: 1.1,
        duration: 1000,
        easing: 'easeInOut',
        loop: true,
        yoyo: true
      },
      nowMs
    );
    
    // 毎フレームアニメーション更新
    this.shapePrimitive.updateAnimation('background_pulse', nowMs);
    
    container.addChild(background);
  }
}
```

### 9. GraphicsContainerPrimitive（v0.5.1新機能）

#### 概要

グラフィック要素のレイヤー管理と歌詞タイミング同期を提供するプリミティブです。テキストより下層・上層の分離管理や、歌詞タイミングに基づく自動的な要素制御をサポートします。

#### initializeGraphicsLayers

フレーズコンテナにグラフィックレイヤーシステムを初期化します。

```typescript
initializeGraphicsLayers(
  phraseContainer: PIXI.Container, 
  phraseId: string
): {
  belowTextContainer: PIXI.Container;
  aboveTextContainer: PIXI.Container;
}
```

**戻り値**:
- `belowTextContainer`: テキスト下層コンテナ（zIndex: -100）
- `aboveTextContainer`: テキスト上層コンテナ（zIndex: 100）

#### createGraphicsLayer

グラフィックレイヤーを作成します。

```typescript
createGraphicsLayer(
  parentContainer: PIXI.Container,
  config: {
    layerId: string;
    zIndex: number;
    layerType: 'below_text' | 'above_text';
    visible?: boolean;
    alpha?: number;
    blendMode?: PIXI.BLEND_MODES;
  }
): PIXI.Container
```

#### addGraphicsElement

グラフィック要素をレイヤーに追加します。

```typescript
addGraphicsElement(
  elementId: string,
  element: PIXI.DisplayObject,
  layerId: string,
  lifecycle: {
    createAt: 'phrase_start' | 'word_start' | 'char_start' | 'custom';
    destroyAt: 'phrase_end' | 'word_end' | 'char_end' | 'custom';
    customTiming?: {
      createMs?: number;
      destroyMs?: number;
    };
  }
): void
```

#### syncWithLyrics

歌詞タイミングとの同期を実行します。

```typescript
syncWithLyrics(
  layerId: string,
  timingInfo: {
    phraseStart: number;
    phraseEnd: number;
    wordTimings?: Array<{ start: number; end: number; index: number }>;
    charTimings?: Array<{ start: number; end: number; index: number }>;
    currentTime: number;
  }
): void
```

#### 実装例

```typescript
export class MyTemplate implements IAnimationTemplate {
  private graphicsContainer = new GraphicsContainerPrimitive();
  private shapePrimitive = new ShapePrimitive();

  renderPhraseContainer(container, params, nowMs, startMs, endMs) {
    const phraseId = params.phraseId as string;
    
    // レイヤーシステム初期化
    const { belowTextContainer, aboveTextContainer } = 
      this.graphicsContainer.initializeGraphicsLayers(container, phraseId);
    
    // 背景レイヤー作成
    const backgroundLayer = this.graphicsContainer.createGraphicsLayer(
      belowTextContainer,
      {
        layerId: `${phraseId}_background`,
        zIndex: -50,
        layerType: 'below_text',
        alpha: 0.8
      }
    );
    
    // 背景矩形作成と追加
    const background = this.shapePrimitive.createRectangle({
      width: 800,
      height: 100,
      color: '#000000'
    });
    
    this.graphicsContainer.addGraphicsElement(
      `${phraseId}_bg_rect`,
      background,
      `${phraseId}_background`,
      {
        createAt: 'phrase_start',
        destroyAt: 'phrase_end'
      }
    );
    
    // 歌詞タイミング同期
    this.graphicsContainer.syncWithLyrics(`${phraseId}_background`, {
      phraseStart: startMs,
      phraseEnd: endMs,
      currentTime: nowMs
    });
  }
}
```

### 10. MultiLineLayoutPrimitive（v0.5.1新機能）

#### 概要

時間的に重複するフレーズを自動的に異なる行に配置して視覚的重複を回避するプリミティブです。Singletonパターンでアプリケーション全体の行配置を一元管理します。

#### getInstance

Singletonインスタンスを取得します。

```typescript
static getInstance(): MultiLineLayoutPrimitive
```

#### calculatePhrasePosition

フレーズの行位置を計算します。

```typescript
calculatePhrasePosition(params: {
  phraseId: string;
  startMs: number;
  endMs: number;
  nowMs: number;
  maxLines: number;
  lineSpacing: number;
  overlapThreshold: number;
  fontSize: number;
  baseY?: number;
  resetInterval?: number;
}): {
  lineIndex: number;
  yOffset: number;
  absoluteY: number;
  totalLines: number;
  conflictingPhrases: string[];
}
```

**パラメータ**:
- `phraseId`: フレーズ固有ID
- `startMs`, `endMs`: フレーズの時間範囲
- `nowMs`: 現在時刻
- `maxLines`: 最大行数
- `lineSpacing`: 行間隔倍率
- `overlapThreshold`: 重複判定しきい値（ミリ秒）
- `fontSize`: フォントサイズ
- `baseY`: 基準Y位置（デフォルト: 0）
- `resetInterval`: 自動リセット間隔（0で無効）

**戻り値**:
- `lineIndex`: 割り当てられた行番号（0から開始）
- `yOffset`: 基準位置からのY軸オフセット
- `absoluteY`: 最終的なY座標
- `totalLines`: 最大行数
- `conflictingPhrases`: 時間的に重複するフレーズのID配列

#### releasePhraseFromLine

フレーズを行から明示的に解放します。

```typescript
releasePhraseFromLine(phraseId: string): void
```

#### resetAllAssignments

全行割り当てをリセットします。

```typescript
resetAllAssignments(): void
```

#### setDebugMode

デバッグモードの有効/無効を設定します。

```typescript
setDebugMode(enabled: boolean): void
```

#### 実装例

```typescript
export class MyTemplate implements IAnimationTemplate {
  renderPhraseContainer(container, params, nowMs, startMs, endMs, phase) {
    const phraseId = params.phraseId as string;
    
    // 基本位置計算
    const slideResult = slideAnimationPrimitive.calculatePhrasePosition({...});
    let finalY = slideResult.y;
    
    // 多行表示処理
    if (params.enableMultiLine !== false) {
      const multiLine = MultiLineLayoutPrimitive.getInstance();
      
      const lineResult = multiLine.calculatePhrasePosition({
        phraseId: phraseId,
        startMs: startMs,
        endMs: endMs,
        nowMs: nowMs,
        maxLines: params.maxLines as number || 4,
        lineSpacing: params.autoLineSpacing as number || 1.5,
        overlapThreshold: params.lineOverlapThreshold as number || 2000,
        fontSize: params.fontSize as number || 120,
        baseY: slideResult.y,
        resetInterval: params.lineResetInterval as number || 0
      });
      
      finalY = lineResult.absoluteY;
      
      console.log(`Phrase "${phraseId}" assigned to line ${lineResult.lineIndex}`);
      if (lineResult.conflictingPhrases.length > 0) {
        console.log(`Conflicts with: ${lineResult.conflictingPhrases.join(', ')}`);
      }
    }
    
    // 最終位置設定
    container.position.set(slideResult.x, finalY);
    
    // フレーズ終了時のクリーンアップ
    if (phase === 'out' && params.enableMultiLine) {
      multiLine.releasePhraseFromLine(phraseId);
    }
  }
}
```

## 実装ガイドライン

### パラメータ同期とメンテナンス（重要）

#### 新パラメータ追加時の必須手順

プリミティブに新しいパラメータを追加した場合、以下の同期作業が**必須**です：

1. **プリミティブのインターフェース更新**
   ```typescript
   // 例: SparkleEffectParams に新パラメータ追加
   export interface SparkleEffectParams extends EffectParams {
     // 既存パラメータ...
     enableTwinkle?: boolean;      // ✅ 新パラメータ
     twinkleFrequency?: number;    // ✅ 新パラメータ
   }
   ```

2. **テンプレートのパラメータ設定更新**
   ```typescript
   // PurePrimitiveWordSlideText.getParameterConfig()
   { name: "enableTwinkle", type: "boolean", default: false },
   { name: "twinkleFrequency", type: "number", default: 0.5, min: 0.1, max: 5.0 }
   ```

3. **テンプレートのプリミティブ呼び出し更新**
   ```typescript
   // ❌ 忘れやすいパターン - 新パラメータが渡されない
   const sparkleParams = {
     enableSparkle: params.enableSparkle,
     sparkleSize: params.sparkleSize,
     // twinkleパラメータが漏れている！
   };
   
   // ✅ 正しいパターン - 新パラメータも含める
   const sparkleParams: SparkleEffectParams = {
     enableSparkle: params.enableSparkle,
     sparkleSize: params.sparkleSize,
     // 新パラメータを必ず追加
     enableTwinkle: params.enableTwinkle as boolean || false,
     twinkleFrequency: params.twinkleFrequency as number || 0.5,
   };
   ```

#### パラメータ漏れ防止チェックリスト

**開発時の確認事項**：
- [ ] プリミティブのインターフェースに新パラメータが定義されている
- [ ] テンプレートのgetParameterConfig()に新パラメータが追加されている  
- [ ] テンプレートのプリミティブ呼び出し部分に新パラメータが含まれている
- [ ] StandardParameters.tsに新パラメータが追加されている（標準パラメータの場合）
- [ ] ParameterRegistry.tsに新パラメータが登録されている
- [ ] npm run validate-parameters が成功する

#### 一般的な実装ミス例

```typescript
// ❌ よくある間違い: パラメータの受け渡し漏れ
private applyEffectAfterLayout(params: Record<string, unknown>): void {
  const effectParams = {
    enableEffect: params.enableEffect,
    effectSize: params.effectSize,
    // 新しく追加された newParameter が漏れている！
  };
  effectPrimitive.applyEffect(container, effectParams);
}

// ✅ 正しい実装: 全パラメータの明示的な受け渡し
private applyEffectAfterLayout(params: Record<string, unknown>): void {
  const effectParams: EffectParams = {
    enableEffect: params.enableEffect as boolean || false,
    effectSize: params.effectSize as number || 10,
    newParameter: params.newParameter as boolean || false,  // 新パラメータを忘れずに
  };
  effectPrimitive.applyEffect(container, effectParams);
}
```

### wordOffsetX実装ガイドライン（v4.0重要追加）

#### 概要

wordOffsetXパラメータは、テキストと関連グラフィック要素（黒帯、背景など）を一体として水平移動するために使用されます。**重要**: 正しい座標系統合により、二重適用バグを防ぐ必要があります。

#### 🚨 CRITICAL: 統合座標系の実装原則

**基本原則**: wordOffsetXは**フレーズコンテナレベルで一度だけ適用**し、すべての子要素（テキスト、グラフィック）が同じオフセットで移動するようにします。

#### 正しい実装パターン

```typescript
// ✅ 正しい実装: フレーズレベルでのwordOffsetX統合
renderPhraseContainer(container, params, nowMs, startMs, endMs, phase) {
  // wordOffsetXをphraseOffsetXに統合
  const baseOffsetX = params.phraseOffsetX as number || 0;
  const wordOffsetX = params.wordOffsetX as number || 0;
  const combinedOffsetX = baseOffsetX + wordOffsetX;
  
  // SlideAnimationPrimitiveでフレーズレベル位置計算
  const phraseResult = slideAnimationPrimitive.calculatePhrasePosition({
    phraseOffsetX: combinedOffsetX,  // 統合オフセット
    phraseOffsetY: params.phraseOffsetY as number || 0,
    // ... その他のパラメータ
  });
  
  // フレーズコンテナに統合位置を適用
  container.position.set(phraseResult.x, phraseResult.y);
  
  // グラフィックコンテナは相対位置(0,0)で配置
  blackBandContainer.position.x = 0;  // wordOffsetX適用しない
  
  // 単語コンテナもFlexibleCumulativeLayoutPrimitiveに委譲
  // wordOffsetXの個別適用は行わない
}
```

#### 間違った実装パターン

```typescript
// ❌ 間違い: 二重適用による座標ずれ
renderPhraseContainer(container, params) {
  // フレーズレベルでwordOffsetX適用
  const phraseResult = slideAnimationPrimitive.calculatePhrasePosition({
    phraseOffsetX: (params.phraseOffsetX || 0) + (params.wordOffsetX || 0)
  });
  container.position.set(phraseResult.x, phraseResult.y);
}

renderWordContainer(container, params) {
  // ❌ さらにwordOffsetX適用 → 二重適用
  const wordOffsetX = params.wordOffsetX as number || 0;
  container.position.x += wordOffsetX;  // BUG: 二重適用
}

// グラフィックコンテナでも個別適用
manageGraphicsContainers(container, params) {
  // ❌ さらにwordOffsetX適用 → 不整合
  const wordOffsetX = params.wordOffsetX as number || 0;
  blackBandContainer.position.x = wordOffsetX;  // BUG: スケール不一致
}
```

#### コンテナ階層と座標系

```
フレーズコンテナ (wordOffsetX統合適用)
├── 単語コンテナ (position: FlexibleCumulativeLayoutで計算)
│   └── 文字コンテナ (position: 相対位置)
├── グラフィックコンテナ (position: 0,0 - フレーズオフセット継承)
│   ├── 黒帯コンテナ (position: 0,0)
│   │   └── 黒帯グラフィック (position: 相対位置)
│   └── マスクコンテナ (position: 0,0)
│       └── マスクグラフィック (position: 相対位置)
```

#### SlideAnimationPrimitive連携の重要事項

**FlexibleCumulativeLayoutPrimitive使用時**:
- same_lineモードでは、SlideAnimationPrimitiveでの単語レベル位置計算を無効化
- 位置計算をFlexibleCumulativeLayoutPrimitiveに完全委譲
- wordOffsetXの適用はフレーズレベルのみ

```typescript
// ✅ 正しいSlideAnimationPrimitive連携
calculateWordPosition(params) {
  if (params.wordDisplayMode === 'phrase_cumulative_same_line') {
    // FlexibleCumulativeLayoutPrimitiveに位置計算を委譲
    // wordOffsetXはフレーズレベルで適用済み
    return { x: 0, y: 0, alpha: 1.0 };  // 相対位置のみ
  }
  // 通常のSlideAnimation処理...
}
```

#### 実装チェックリスト

テンプレート作成時の必須確認事項：

- [ ] wordOffsetXの適用はフレーズコンテナレベルで一度だけ
- [ ] 単語コンテナレベルでwordOffsetXを適用していない
- [ ] グラフィックコンテナはposition(0,0)で相対配置
- [ ] FlexibleCumulativeLayoutPrimitive使用時はSlideAnimationで位置計算を無効化
- [ ] デバッグログで座標系の整合性を確認
- [ ] テスト時にテキストとグラフィックが同じ距離だけ移動することを確認

#### デバッグ時の確認方法

```typescript
// デバッグ用ログ出力例
console.log(`[COORDINATE_DEBUG] wordOffsetX統合確認:
  wordOffsetX: ${wordOffsetX}
  フレーズコンテナ位置: (${container.x}, ${container.y})
  グラフィックコンテナ位置: (${graphicsContainer.x}, ${graphicsContainer.y})
  グラフィック相対位置: (${graphics.x}, ${graphics.y})
  グラフィック最終位置: (${container.x + graphicsContainer.x + graphics.x})
  注意: 全要素が同じwordOffsetX分だけ移動すること
`);
```

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

## パフォーマンス最適化ガイドライン（v4.0新機能）

### レンダリングキャッシュとの連携

プリミティブを使用するテンプレートでは、以下のパフォーマンス最適化を推奨します：

#### 1. 最適化対象の判定

```typescript
// ビューポート最適化とレンダリングキャッシュの組み合わせ
renderCharContainer(container, text, params, nowMs, startMs, endMs, phase) {
  // プリミティブ使用時もキャッシュチェックを実装
  const cacheKey = `${container.name}_${text}`;
  const relevantParams = {
    fontSize: params.fontSize,
    // プリミティブ特有のパラメータも含める
    wordDisplayMode: params.wordDisplayMode,
    charSpacing: params.charSpacing,
    enableGlow: params.enableGlow
  };
  
  // キャッシュチェック...
}
```

#### 2. プリミティブ計算の最適化

- **FlexibleCumulativeLayoutPrimitive**: レイアウト計算結果をキャッシュ
- **SlideAnimationPrimitive**: 位置計算の中間結果を保持
- **GlitchEffectPrimitive**: エフェクトパラメータの変更検出

#### 3. ビューポート連携

エンジンの最適化システムとの連携：

```typescript
// プリミティブ内でのパフォーマンス考慮
if (isInViewport) {
  // 詳細計算を実行
  return detailedCalculation(params);
} else {
  // 簡易計算またはキャッシュ使用
  return getCachedOrSimplifiedResult(params);
}
```

### 実装推奨事項

1. **パラメータ変更の最小化**: 不要なパラメータ更新を避ける
2. **計算結果のキャッシュ**: 重い計算処理の結果保持
3. **段階的更新**: 表示範囲内の優先更新

## バージョン履歴

- v4.0: パフォーマンス最適化ガイドライン追加、レンダリングキャッシュ連携
- v3.2: フレーズ単位での文字アニメーションモードを追加
- v3.1: スリープ復帰時の安全対策を追加
- v3.0: プリミティブとテンプレートの責任分担を明確化、実装パターンの選択肢を提示
- v2.1: 文字可視性制御の明確化、誤実装防止ガイドライン追加
- v2.0: 協調的プリミティブライブラリ初版