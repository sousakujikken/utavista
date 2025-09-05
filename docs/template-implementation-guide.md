# テンプレート実装ガイド - UTAVISTA v0.6.0 + グラフィックプリミティブ対応

> **🚨 重要**: 初めてテンプレートを実装する方は、必ず [テンプレート実装クイックスタートガイド](./template-quick-start-guide.md) を最初にお読みください。重要な原則と実装方式の選択について説明しています。

このドキュメントは、**UTAVISTA v0.6.0**で新しいアニメーションテンプレートを実装するための詳細な手順を説明します。新しいParameterRegistryシステム、**文字重複表示防止機能（v2.1）**、**グラフィックプリミティブシステム（v0.6.0新機能）**、**多行表示システム（MultiLineLayoutPrimitive）**を使用し、安全で高品質なテンプレートを作成できるよう指導します。

## ⚡ 実装方式クイック判定

**90%のケース（推奨）**: カラオケ風テンプレート
- ✅ 用途: 一般的な歌詞アニメーション、状態変化重視
- ✅ 方式: **色変化のみ** (`textObj.alpha = 1.0`, `textObj.visible = true`)
- ✅ 参考: WordSlideTextPrimitive (lines 598-599)

**10%のケース（上級者向け）**: フェード効果テンプレート  
- ⚠️ 用途: 特殊なフェード演出、ブラー効果付き
- ⚠️ 方式: **色のアルファ値制御** (`applyAlphaToColor()` 使用)
- ⚠️ 参考: FadeBlurRandomTextPrimitive v2.0

**詳細は [クイックスタートガイド](./template-quick-start-guide.md) を参照してください。**

## 目次

1. [前提知識と準備](#前提知識と準備)
2. [🕒 タイムスタンプベース状態一元管理（必須）](#タイムスタンプベース状態一元管理)
3. [🎨 グラフィックプリミティブシステム（v0.5.1新機能）](#グラフィックプリミティブシステム)
4. [📏 多行表示システム（MultiLineLayoutPrimitive）](#多行表示システム)
5. [🎯 画面中心配置の標準仕様（v0.4.3標準）](#画面中心配置の標準仕様)
6. [🚨 文字重複表示防止ガイド（v2.1新機能）](#文字重複表示防止ガイド)
7. [⚡ レンダリング最適化実装（v0.5.0新機能）](#レンダリング最適化実装)
8. [🔧 プリミティブパラメータメンテナンス（重要）](#プリミティブパラメータメンテナンス)
9. [📋 安全なテンプレート実装チェックリスト（v2.1）](#安全なテンプレート実装チェックリスト)
10. [現行システムアーキテクチャの理解](#現行システムアーキテクチャの理解)
11. [基本構造の実装](#基本構造の実装)
12. [階層対応のアニメーション実装](#階層対応のアニメーション実装)
13. [パラメータレジストリ登録と管理](#パラメータレジストリ登録と管理)
14. [文字・単語カウント管理](#文字・単語カウント管理)
15. [PixiJSフィルタとエフェクト実装](#PixiJSフィルタとエフェクト実装)
16. [FontService統合とフォント管理](#FontService統合とフォント管理)
17. [パフォーマンス最適化技法](#パフォーマンス最適化技法)
18. [エラーハンドリングとデバッグ](#エラーハンドリングとデバッグ)
19. [文字位置計算の実装ガイド](#文字位置計算の実装ガイド)
20. [テンプレートレジストリへの登録](#テンプレートレジストリへの登録)
21. [実装パターン総合ガイド](#実装パターン総合ガイド)
22. [フレーズタイミング優先実装ガイド](#フレーズタイミング優先実装ガイドv043新機能)
23. [よくある失敗事例と対策](#よくある失敗事例と対策)

---

## 🕒 タイムスタンプベース状態一元管理（必須）

### 概要

**重要**: UTAVISTA v0.4.3でプリミティブAPI導入時点より、すべてのテンプレートは**タイムスタンプベースの純粋な状態計算**を実装することが必須要件です。シーク検出やアニメーション状態の分散管理は**禁止されたアンチパターン**です。

### 基本原則

#### 1. 純粋な時間計算のみを使用

```typescript
// ✅ 正しい実装: 純粋な時間ベース計算
renderPhraseContainer(container: PIXI.Container, params: any, nowMs: number, startMs: number, endMs: number) {
  const headTime = (params.headTime as number) || 500;
  const tailTime = (params.tailTime as number) || 500;
  
  // 純粋な時間計算でフェーズを決定
  const swipeInStartTime = startMs - headTime;
  const swipeOutStartTime = endMs;
  const swipeOutEndTime = endMs + tailTime;
  
  let progress = 0;
  if (nowMs <= swipeInStartTime) {
    progress = 0.0;
  } else if (nowMs <= startMs) {
    // スワイプイン中
    const elapsed = nowMs - swipeInStartTime;
    progress = elapsed / headTime;
  } else if (nowMs <= endMs) {
    // アクティブ期間
    progress = 1.0;
  } else if (nowMs <= swipeOutEndTime) {
    // スワイプアウト中
    const elapsed = nowMs - swipeOutStartTime;
    progress = 1.0 - (elapsed / tailTime);
  } else {
    progress = 0.0;
  }
  
  // プログレスに基づいてアニメーション実行
  this.applySwipeAnimation(container, progress);
}
```

#### 2. 禁止されたアンチパターン

```typescript
// ❌ 禁止: シーク検出ロジック
private detectSeek(nowMs: number, lastTimeMs: number): boolean {
  // このような実装は禁止
}

// ❌ 禁止: アニメーション状態の分散管理
private animationRestartState = new Map<string, {
  restartTime: number;
  isRestarting: boolean;
}>();

// ❌ 禁止: 前フレーム状態への依存
private lastTimeState = new Map<string, number>();
```

### グラフィックコンテナの一元管理

#### GraphicsContainerPrimitive との統合

グラフィック要素を使用するテンプレートでは、GraphicsContainerPrimitiveを通じた状態管理も時間ベースで行う必要があります：

```typescript
// ✅ 正しい実装: 時間ベースでグラフィック要素を管理
renderPhraseContainer(container: PIXI.Container, params: any, nowMs: number, startMs: number, endMs: number) {
  const phraseId = this.extractPhraseIdFromFullId(params.phraseId as string);
  
  // 時間ベースでグラフィック要素の表示/非表示を決定
  if (nowMs >= startMs - headTime && nowMs <= endMs + tailTime) {
    // グラフィック要素を作成/更新（まだ存在しない場合のみ）
    if (!this.hasGraphicsElements(phraseId)) {
      this.createGraphicsElements(container, phraseId, params);
    }
    
    // 時間に基づいてアニメーション更新
    this.updateGraphicsAnimation(phraseId, nowMs, startMs, endMs);
  } else {
    // 時間範囲外では要素をクリーンアップ
    this.cleanupGraphicsElements(phraseId);
  }
}

// グラフィック要素存在確認も状態ベース
private hasGraphicsElements(phraseId: string): boolean {
  const containers = this.graphicsContainers.get(phraseId);
  return containers?.blackBandContainer?.children?.length > 0;
}
```

### 実装上の注意点

#### 1. 状態の永続化禁止

```typescript
// ❌ 禁止: 前回状態の保存
private previousStates = new Map<string, any>();

// ✅ 正しい: 必要な状態はすべてタイムスタンプから計算
calculateCurrentState(nowMs: number, startMs: number, endMs: number) {
  // すべての状態をパラメータから純粋計算
}
```

#### 2. 一貫したタイミング保証

```typescript
// ✅ 正しい: 通常再生でもシークでも同じ結果
const getAnimationProgress = (nowMs: number, startMs: number, duration: number): number => {
  if (nowMs <= startMs) return 0;
  if (nowMs >= startMs + duration) return 1;
  return (nowMs - startMs) / duration;
};
```

### StateManager システムとの連携

新しい StateManager システムを使用する場合は、以下のパターンに従います：

```typescript
// StatelessTemplate インターフェースの実装例
export class MyStatelessTemplate implements IStatelessTemplate {
  renderAtTime(container: PIXI.Container, renderState: RenderState, params: TemplateParams, timestamp: number): boolean {
    // RenderState から状態を取得（すべて時間ベース計算済み）
    const { phase, visible, progress } = renderState.object;
    const swipeInEffect = renderState.effects.get('swipeIn');
    
    if (!visible) {
      this.cleanup(container);
      return false;
    }
    
    // 状態に基づいて描画実行
    this.renderBasedOnState(container, phase, progress, swipeInEffect, params);
    return true;
  }
}
```

### 問題事例: BlackBandMaskTextPrimitive での課題

過去に BlackBandMaskTextPrimitive で発生した問題：

- **問題**: シーク検出でアニメーション開始時間が通常再生時（800ms前）と異なる（80ms前）
- **原因**: `startAnimationRestart()` でリスタート時間を `nowMs` に設定
- **解決**: シーク検出ロジック完全除去、純粋な時間計算への移行

この事例を参考に、すべてのテンプレートで同様の問題を予防してください。

---

## 🎨 グラフィックプリミティブシステム

### 概要

v0.5.1で新たに導入されたグラフィックプリミティブシステムにより、テンプレートでの図形描画とアニメーション機能が大幅に強化されました。

### 主要コンポーネント

#### 1. ShapePrimitive

基本図形の作成とアニメーション機能を提供：

```typescript
import { ShapePrimitive, type RectangleParams } from '../primitives';

// 初期化
private shapePrimitive = new ShapePrimitive();

// 矩形の作成
const blackBandParams: RectangleParams = {
  width: bandWidth,
  height: bandHeight,
  x: centerX - bandWidth / 2,
  y: -bandHeight / 2,
  color: '#000000',
  alpha: 1.0
};

const blackBand = this.shapePrimitive.createRectangle(blackBandParams);
blackBand.name = `black_band_${phraseId}`;
```

**サポート図形**:
- 矩形 (`createRectangle`)
- 円 (`createCircle`) 
- 多角形 (`createPolygon`)
- 星形 (`createStar`)

**アニメーション機能**:
- 位置、スケール、回転、透明度の制御
- イージング関数対応 (`linear`, `easeIn`, `easeOut`, `easeInCubic`等)
- ループ・ヨーヨーアニメーション

#### 2. GraphicsContainerPrimitive

グラフィック要素のレイヤー管理システム：

```typescript
import { GraphicsContainerPrimitive, type GraphicsLayerConfig } from '../primitives';

// 初期化
private graphicsContainer = new GraphicsContainerPrimitive();

// レイヤーシステム初期化
const { belowTextContainer, aboveTextContainer } = 
  this.graphicsContainer.initializeGraphicsLayers(phraseContainer, phraseId);

// グラフィック要素の追加
this.graphicsContainer.addGraphicsElement(
  `${phraseId}_black_band`,
  blackBandGraphics,
  'below_text_layer',
  {
    createAt: 'phrase_start',
    destroyAt: 'phrase_end'
  }
);
```

**レイヤー管理**:
- **下層コンテナ** (`below_text`): テキストより下層（zIndex: -100）
- **上層コンテナ** (`above_text`): テキストより上層（zIndex: 100）
- 歌詞タイミングとの自動同期
- ライフサイクル管理（作成・破棄タイミング制御）

**⚠️ 重要: 時間ベース状態管理との統合**

GraphicsContainerPrimitive を使用するテンプレートでも、タイムスタンプベース状態一元管理の原則に従い、すべてのグラフィック要素の状態を時間から純粋計算する必要があります：

```typescript
// ✅ 正しい実装: 時間ベースグラフィック管理
renderPhraseContainer(container: PIXI.Container, params: any, nowMs: number, startMs: number, endMs: number) {
  const headTime = (params.headTime as number) || 500;
  const tailTime = (params.tailTime as number) || 500;
  
  // 時間範囲内でのみグラフィック要素を管理
  if (nowMs >= startMs - headTime && nowMs <= endMs + tailTime) {
    // グラフィック要素を作成（初回のみ）
    this.ensureGraphicsElementsExist(container, phraseId, params);
    
    // 時間に基づくアニメーション更新
    this.updateGraphicsAnimationByTime(phraseId, nowMs, startMs, endMs, headTime, tailTime);
  } else {
    // 時間範囲外では完全クリーンアップ
    this.cleanupGraphicsElements(phraseId);
  }
}

// グラフィック要素の存在確認（状態ベース）
private ensureGraphicsElementsExist(container: PIXI.Container, phraseId: string, params: any) {
  const containers = this.graphicsContainers.get(phraseId);
  if (!containers || containers.blackBandContainer.children.length === 0) {
    this.createGraphicsElements(container, phraseId, params);
  }
}
```

### 実装例: BlackBandMaskTextPrimitive

```typescript
export class BlackBandMaskTextPrimitive implements IAnimationTemplate {
  private shapePrimitive = new ShapePrimitive();
  private graphicsContainers = new Map<string, {
    blackBandContainer: PIXI.Container;
    invertMaskContainer: PIXI.Container;
  }>();

  // フレーズレベルでグラフィックコンテナを管理
  private manageGraphicsContainers(phraseContainer: PIXI.Container, ...params) {
    // 黒帯用下層コンテナ
    const blackBandContainer = new PIXI.Container();
    blackBandContainer.zIndex = -50; // テキストより下層
    
    // 反転マスク用上層コンテナ  
    const invertMaskContainer = new PIXI.Container();
    invertMaskContainer.zIndex = 50; // テキストより上層
    
    phraseContainer.addChild(blackBandContainer);
    phraseContainer.addChild(invertMaskContainer);
    phraseContainer.sortChildren();
  }
  
  // 黒帯の作成
  private createBlackBand(container: PIXI.Container, params: any) {
    const blackBand = this.shapePrimitive.createRectangle({
      width: phraseWidth * 1.2,
      height: fontSize * 1.5,
      x: centerX - bandWidth / 2,
      y: -bandHeight / 2,
      color: '#000000',
      alpha: 1.0
    });
    
    container.addChild(blackBand);
  }
}
```

---

## 📏 多行表示システム（MultiLineLayoutPrimitive）

### 概要

時間的に重複するフレーズを自動的に異なる行に配置して視覚的重複を回避するシステムです。

### 主要機能

#### 1. 自動行配置

```typescript
import { MultiLineLayoutPrimitive, type MultiLinePhraseParams } from '../primitives';

// Singletonインスタンス取得
const multiLine = MultiLineLayoutPrimitive.getInstance();

const multiLineParams: MultiLinePhraseParams = {
  phraseId: phraseId,
  startMs: startMs,
  endMs: endMs,
  nowMs: nowMs,
  maxLines: 4,                    // 最大行数
  lineSpacing: 1.5,              // 行間隔倍率
  overlapThreshold: 2000,        // 重複判定しきい値(ms)
  fontSize: fontSize,
  baseY: phraseAnimationResult.y, // 基準Y位置
  resetInterval: 0               // 自動リセット間隔(0=無効)
};

const lineResult = multiLine.calculatePhrasePosition(multiLineParams);
const finalY = lineResult.absoluteY; // 最終Y位置
```

#### 2. 重複検出アルゴリズム

システムは以下の条件で時間的重複を検出：

1. **直接オーバーラップ**: フレーズの時間範囲が重複
2. **近接判定**: 終了時刻から`overlapThreshold`以内での開始
3. **先行判定**: 開始時刻から`overlapThreshold`以内での先行終了

#### 3. 行管理とクリーンアップ

```typescript
// フレーズ終了時の明示的解放
multiLine.releasePhraseFromLine(phraseId);

// 全割り当てリセット
multiLine.resetAllAssignments();

// デバッグモード設定
multiLine.setDebugMode(true);
```

### 実装パターン

#### テンプレートでの基本的な使用方法

```typescript
renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase) {
  // 基本位置計算
  const phraseResult = slideAnimationPrimitive.calculatePhrasePosition({...});
  
  let finalY = phraseResult.y;
  
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
      baseY: phraseResult.y,
      resetInterval: params.lineResetInterval as number || 0
    });
    
    finalY = lineResult.absoluteY;
  }
  
  // 最終位置設定
  container.position.set(phraseResult.x, finalY);
  
  // フレーズ終了時のクリーンアップ
  if (phase === 'out') {
    if (params.enableMultiLine) {
      multiLine.releasePhraseFromLine(phraseId);
    }
  }
}
```

#### 推奨パラメータ設定

```typescript
// 多行表示パラメータ
{ name: "enableMultiLine", type: "boolean", default: true },
{ name: "maxLines", type: "number", default: 4, min: 1, max: 8, step: 1 },
{ name: "lineOverlapThreshold", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
{ name: "autoLineSpacing", type: "number", default: 1.5, min: 1.0, max: 3.0, step: 0.1 },
{ name: "lineResetInterval", type: "number", default: 0, min: 0, max: 30000, step: 1000 },
```

---

## 📋 v0.5.1重要変更事項

### グラフィックプリミティブシステムの導入

- **ShapePrimitive**: 基本図形作成とアニメーション機能
- **GraphicsContainerPrimitive**: レイヤー管理と歌詞同期システム
- **BlackBandMaskTextPrimitive**: 実装参考例として新規追加

### 多行表示システムの実装

- **MultiLineLayoutPrimitive**: 時間的重複フレーズの自動行配置
- Singletonパターンによる全テンプレート共通の状態管理
- 自動クリーンアップとリセット機能

### 拡張IDシステムの強化

- すべてのsame_lineモード使用テンプレートで拡張ID対応が**必須**
- `extractPhraseIdFromFullId()` および `generateAllWordExtendedIds()` メソッドの実装義務化
- 単語間隔計算の精度向上とバグ修正

---

## 📋 v0.4.3重要変更事項

### レイアウト計算の重要変更

**deviceScale削除**: プリミティブシステムからdevicePixelRatioに基づくスケール計算を完全に削除しました。

#### 変更の影響

- **文字間隔**: `charSpacing=1.0`で標準的な間隔を実現
- **計算式**: `xOffset = charIndex * fontSize * charSpacing * scaleFactor`（deviceScale不使用）
- **解像度**: テキスト解像度向上とレイアウト計算を明確に分離

#### 対象プリミティブ

- `FlexibleCumulativeLayoutPrimitive`
- `EnhancedCumulativeLayoutPrimitive`  
- `SlideAnimationPrimitive`

#### 移行方法

既存のテンプレートで`charSpacing=0.5`を使用していた場合は、`charSpacing=1.0`に変更してください。

```typescript
// ❌ 旧方式（v0.4.2以前）
charSpacing: 0.5  // deviceScaleで2倍されるため0.5で調整

// ✅ 新方式（v0.4.3以降）
charSpacing: 1.0  // 標準的な文字間隔
```

### 🚨 new_lineモードのlineHeight暫定対応（既知の問題）

**問題**: `individual_word_entrance_new_line`および`phrase_cumulative_new_line`モードで、`lineHeight`パラメータが期待値の2倍の行間になる既知の問題があります。

**原因**: 論理解像度（1920×1080）とCSSスケーリング（~0.417）の間の座標変換が適切に処理されていないため。

#### 暫定対応方法

new_lineモードを使用する際は、**希望する行高さの半分の値**を指定してください：

```typescript
// ❌ 直感的な指定（期待通りに動作しない）
lineHeight: 1.0  // 実際には2行分の間隔になる
lineHeight: 1.5  // 実際には3行分の間隔になる

// ✅ 暫定対応（期待通りの間隔を得る）
lineHeight: 0.5  // 1行分の間隔を得る
lineHeight: 0.75 // 1.5行分の間隔を得る
lineHeight: 1.0  // 2行分の間隔を得る
```

#### 対象モード

- `WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_NEW_LINE`
- `WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE`

### 🔴 wordDisplayMode実装時の重要な注意事項（2025-01-24追加）

**問題**: `FlexibleCumulativeLayoutPrimitive`を使用する際、単語間のXオフセットが正しく適用されない場合があります。

**原因と対策**:

#### 1. プリミティブインスタンスの独立処理

```typescript
// ⚠️ 問題のある実装（各単語で新しいインスタンス）
renderWordContainer() {
  const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
  // 各単語処理時に新しいインスタンスが作成され、累積オフセットがリセットされる
}
```

プリミティブは内部で**コンテナIDから単語インデックスを抽出**し、自動的に累積オフセットを計算しますが、正確性に限界があります。

#### 2. CharUnit[]からFlexibleCharacterData[]への変換（必須）

```typescript
// ✅ 正しい変換実装
const rawCharsData = params.chars as CharUnit[];
const currentWordIndex = params.wordIndex as number || 0;

const charsData: FlexibleCharacterData[] = rawCharsData.map((char, index) => ({
  id: char.id,
  char: char.char,
  start: char.start,
  end: char.end,
  charIndexInWord: index,
  charIndex: char.charIndex || index,
  wordIndex: currentWordIndex,  // ⚠️ 必須：これがないと単語グループ化が失敗
  totalChars: char.totalChars || rawCharsData.length,
  totalWords: char.totalWords || 1
}));
```

#### 3. コンテナID形式の維持

プリミティブが単語インデックスを抽出できるよう、コンテナIDは必ず以下の形式を維持してください：
- フレーズ: `phrase_0`
- 単語: `phrase_0_word_2`  
- 文字: `phrase_0_word_2_char_1`

#### 注意事項

- 同一行モード（`SAME_LINE`）では通常通り動作します
- 将来のバージョンで修正予定のため、修正後は設定値の再調整が必要です
- 詳細は[known-issues.md](./known-issues.md#line-height-001-lineheight-parameter-double-scaling-in-new_line-modes)を参照

---

## 🎯 画面中心配置の標準仕様（v0.4.3標準）

### 概要

**すべてのテンプレートは画面中心を基準とした配置をデフォルトとし、`phraseOffsetX`と`phraseOffsetY`パラメータで調整可能にする必要があります。** これはUTAVISTAの標準仕様であり、ユーザビリティと一貫性を確保するための重要な要件です。

### wordOffsetX統合実装ガイドライン（v0.5.1重要追加）

#### 🚨 CRITICAL: wordOffsetX二重適用の防止

wordOffsetXパラメータを使用する際は、**フレーズコンテナレベルで一度だけ適用**し、テキストとグラフィック要素が統合して移動するよう実装する必要があります。

```typescript
// ✅ 正しい実装: フレーズレベルでのwordOffsetX統合
renderPhraseContainer(container, params, nowMs, startMs, endMs, phase) {
  // wordOffsetXをphraseOffsetXに統合
  const baseOffsetX = params.phraseOffsetX as number || 0;
  const wordOffsetX = params.wordOffsetX as number || 0;
  const combinedOffsetX = baseOffsetX + wordOffsetX;
  
  // SlideAnimationPrimitiveで統合位置を計算
  const phraseResult = slideAnimationPrimitive.calculatePhrasePosition({
    phraseOffsetX: combinedOffsetX,  // 統合オフセット
    phraseOffsetY: params.phraseOffsetY as number || 0,
    // ... その他のパラメータ
  });
  
  // フレーズコンテナに統合位置を適用
  container.position.set(phraseResult.x, phraseResult.y);
}

// グラフィックコンテナは相対配置（wordOffsetX適用しない）
manageGraphicsContainers(phraseContainer, params) {
  blackBandContainer.position.x = 0;  // 重要: 個別適用しない
}

// 単語コンテナもFlexibleCumulativeLayoutPrimitiveに委譲
renderWordContainer(container, params) {
  // wordOffsetXの個別適用は行わない
  // FlexibleCumulativeLayoutPrimitiveが相対位置を計算
}
```

#### 座標系統合の重要性

- **問題**: 異なるコンテナレベルで個別にwordOffsetXを適用すると、テキストとグラフィックが異なるスケールで移動し、視覚的な不整合が発生
- **解決**: フレーズコンテナレベルでの統合により、全子要素が同じ座標系で移動
- **効果**: ユーザーがwordOffsetXを変更した際、テキストと背景要素（黒帯など）が完全に一体として移動

### 標準パラメータ

```typescript
// 標準パラメータ（ParameterRegistryに登録済み）
phraseOffsetX: number  // デフォルト: 0, 範囲: -500〜500
phraseOffsetY: number  // デフォルト: 0, 範囲: -500〜500
```

### 実装方法

#### 1. パラメータ定義

```typescript
getParameterConfig(): ParameterConfig[] {
  return [
    // 画面中心からのオフセット（標準パラメータ）
    { name: "phraseOffsetX", type: "number", default: 0, min: -500, max: 500, step: 10 },
    { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 10 },
    // その他のパラメータ...
  ];
}
```

#### 2. フレーズコンテナでの位置計算

```typescript
renderPhraseContainer(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  // ... その他の引数
): boolean {
  // アプリケーションサイズの取得
  const app = (window as any).__PIXI_APP__;
  if (app && app.renderer) {
    const screenWidth = app.renderer.width;
    const screenHeight = app.renderer.height;
    
    // 画面中心を基準にオフセットを適用
    const baseX = screenWidth / 2 + (params.phraseOffsetX as number || 0);
    const baseY = screenHeight / 2 + (params.phraseOffsetY as number || 0);
    
    // さらにテンプレート固有の位置計算を加算
    container.position.set(baseX + specificX, baseY + specificY);
  }
  
  return true;
}
```

#### 3. SlideAnimationPrimitiveを使用する場合

```typescript
const phraseResult = slideAnimationPrimitive.calculatePhrasePosition({
  phraseOffsetX: params.phraseOffsetX as number || 0,
  phraseOffsetY: params.phraseOffsetY as number || 0,
  // その他のパラメータ...
});

// 画面中心を基準に調整
if (app && app.renderer) {
  container.position.set(
    app.renderer.width / 2 + phraseResult.x,
    app.renderer.height / 2 + phraseResult.y
  );
}
```

### 設計原則

1. **一貫性**: すべてのテンプレートで同じ基準点（画面中心）を使用
2. **調整可能性**: ユーザーがパラメータで位置を微調整可能
3. **予測可能性**: デフォルト値（0,0）で画面中心に配置
4. **互換性**: 既存のテンプレートと同じパラメータ名を使用

### よくある実装パターン

#### パターン1: 静的配置

```typescript
// シンプルな中心配置
const centerX = screenWidth / 2 + (params.phraseOffsetX as number || 0);
const centerY = screenHeight / 2 + (params.phraseOffsetY as number || 0);
container.position.set(centerX, centerY);
```

#### パターン2: ランダム配置との組み合わせ

```typescript
// ランダム配置でも画面中心を基準に
const randomX = (Math.random() - 0.5) * randomRangeX;
const randomY = (Math.random() - 0.5) * randomRangeY;

const finalX = screenWidth / 2 + (params.phraseOffsetX as number || 0) + randomX;
const finalY = screenHeight / 2 + (params.phraseOffsetY as number || 0) + randomY;
```

#### パターン3: 段組み配置

```typescript
// 段組みでも画面中心を基準に
const lineY = (lineNumber - totalLines / 2) * lineSpacing;
const finalY = screenHeight / 2 + (params.phraseOffsetY as number || 0) + lineY;
```

---

## 🚨 文字重複表示防止ガイド（v2.1新機能）

**UTAVISTA v2.1では、文字コンテナの重複作成による表示不具合を防止する安全機能が追加されました。**

### 文字重複表示問題とは

文字重複表示問題は、同一の文字に対して複数のコンテナが作成され、文字が重なって表示される現象です：

```
通常の表示:  あ  い  う  え  お
重複時の表示: あああ いいい うううえええ おおお （文字が重なって見える）
```

### 発生原因と対策

#### 1. 主な発生原因

```typescript
// ❌ 危険: プリミティブと既存システムの両方でコンテナ作成
layoutPrimitive.manageCharacterContainers(wordContainer, params);  // コンテナ作成①
// 同時に
params.chars.forEach(charData => {
  const charContainer = new PIXI.Container();  // コンテナ作成② → 重複!
});
```

#### 2. 安全な実装パターン

```typescript
// ✅ 推奨: 単一責任でのコンテナ管理
if (params.chars && Array.isArray(params.chars)) {
  // 既存システムのみでコンテナ管理
  params.chars.forEach((charData: any, index: number) => {
    let charContainer: PIXI.Container | null = null;
    
    // 既存コンテナ検索
    container.children.forEach((child: any) => {
      if (child instanceof PIXI.Container && 
          (child as any).name === `char_container_${charData.id}`) {
        charContainer = child as PIXI.Container;
      }
    });
    
    // 新規作成（必要時のみ）
    if (!charContainer) {
      charContainer = new PIXI.Container();
      (charContainer as any).name = `char_container_${charData.id}`;
      container.addChild(charContainer);
    }
    
    // レイアウト計算はプリミティブに委譲
    const layoutResult = layoutPrimitive.calculatePositionOnly(charData);
    charContainer.position.set(layoutResult.x, layoutResult.y);
  });
}
```

### 安全機能の使用方法

#### SafeCharacterManager の活用

```typescript
import { SafeCharacterManager, CharacterManagementMode } from '../primitives/safe/SafeCharacterManager';

// 安全な文字管理の設定
const safeManager = new SafeCharacterManager({
  mode: CharacterManagementMode.COOPERATIVE,
  containerPrefix: 'char_container_',
  layoutParams: {
    fontSize: params.fontSize || 32,
    charSpacing: params.charSpacing || 1.0,
    halfWidthSpacingRatio: 0.6,
    alignment: 'left'
  },
  enableSafetyChecks: true,
  enableDebugLogs: process.env.NODE_ENV === 'development'
});

// 安全な文字管理実行
const result = safeManager.manageCharacters(
  wordContainer,
  text,
  characters,
  (charContainer, charData, position) => {
    // アニメーション処理
    this.renderCharContainer(charContainer, charData.char, params, nowMs, startMs, endMs, phase);
  }
);

if (!result.success) {
  console.error('文字管理エラー:', result.warnings);
}
```

#### CharacterOverlapDetector による開発時検証

```typescript
import { CharacterOverlapDetector } from '../primitives/safe/CharacterOverlapDetector';

// 開発時自動チェック
if (process.env.NODE_ENV === 'development') {
  CharacterOverlapDetector.autoCheck(wordContainer);
}
```

---

## ⚡ レンダリング最適化実装（v0.5.0新機能）

**UTAVISTA v0.5.0では、大規模プロジェクトでのUI応答性を向上させるレンダリング最適化機能が追加されました。**

### レンダリングキャッシュシステム

パラメータ変更時のUI固まりを防止するため、文字オブジェクトのキャッシュ機能を実装できます。

#### 1. 基本実装パターン

```typescript
export class OptimizedTemplate implements IAnimationTemplate {
  // レンダリングキャッシュ
  private renderCache = new Map<string, {
    textObject: PIXI.Text;
    lastParams: string;
    lastPhase: AnimationPhase;
    lastNowMs: number;
  }>();

  renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    hierarchyType: HierarchyType
  ): boolean {
    
    // 1. キャッシュキーを生成
    const cacheKey = `${container.name || 'unknown'}_${text}`;
    
    // 2. レンダリングに影響するパラメータのみでハッシュ生成
    const relevantParams = {
      fontSize: params.fontSize,
      fontFamily: params.fontFamily,
      textColor: params.textColor,
      enableGlow: params.enableGlow,
      glowStrength: params.glowStrength,
      // 必要に応じて他のパラメータを追加
    };
    const paramsHash = JSON.stringify(relevantParams);
    
    // 3. キャッシュチェック
    const cached = this.renderCache.get(cacheKey);
    if (cached && 
        cached.lastParams === paramsHash && 
        cached.lastPhase === phase &&
        Math.abs(cached.lastNowMs - nowMs) < 50) { // 50ms以内の時間差は無視
      
      // キャッシュされたテキストオブジェクトを使用
      if (container.children.length === 0) {
        container.addChild(cached.textObject);
      }
      return true;
    }
    
    // 4. 新しいテキストオブジェクトを作成
    container.removeChildren();
    const textObj = new PIXI.Text(text, textStyle);
    container.addChild(textObj);
    
    // 5. キャッシュに保存
    this.renderCache.set(cacheKey, {
      textObject: textObj,
      lastParams: paramsHash,
      lastPhase: phase,
      lastNowMs: nowMs
    });
    
    return true;
  }

  // 6. キャッシュクリア（removeVisualElementsで実行）
  removeVisualElements(container: PIXI.Container): void {
    // 通常のクリーンアップ処理...
    
    // レンダリングキャッシュをクリア
    this.renderCache.clear();
  }
}
```

#### 2. キャッシュ最適化のポイント

- **パラメータハッシュ**: 視覚に影響しないパラメータは除外
- **時間閾値**: 50ms以内の時間変動はキャッシュヒット
- **フェーズ管理**: アニメーションフェーズ変更時は新規作成
- **メモリ管理**: `removeVisualElements`でキャッシュクリア

#### 3. ビューポート最適化

エンジンレベルで自動実装される最適化：

- **表示範囲判定**: 現在時刻±2秒のフレーズのみ同期更新
- **非同期処理**: 表示範囲外フレーズは非同期バッチ処理
- **更新制御**: `updateGlobalDefaultsSilent`による通知無効化

### パフォーマンス効果

- **UI応答性**: パラメータ変更時の固まりを大幅軽減
- **メモリ効率**: 不要なオブジェクト生成を抑制
- **スケーラビリティ**: 大規模プロジェクトでも安定動作

---

## 🔧 プリミティブパラメータメンテナンス（重要）

### 新パラメータ追加時の必須同期作業

**最重要**: プリミティブに新しいパラメータを追加した場合、**テンプレート側の呼び出し箇所も同期更新**が必要です。

#### よくある実装ミス

```typescript
// ❌ 危険: 新パラメータが渡されない
private applySparkleEffectAfterLayout(...): void {
  const sparkleParams: SparkleEffectParams = {
    enableSparkle: params.enableSparkle,
    sparkleSize: params.sparkleSize,
    sparkleColor: params.sparkleColor,
    // enableTwinkle などの新パラメータが漏れている！
  };
  sparklePrimitive.applyEffect(container, sparkleParams);
}
```

#### 正しい実装パターン

```typescript
// ✅ 安全: 全パラメータを明示的に渡す
private applySparkleEffectAfterLayout(...): void {
  const sparkleParams: SparkleEffectParams = {
    // 基本パラメータ
    enableSparkle: params.enableSparkle as boolean || false,
    sparkleSize: params.sparkleSize as number || 20,
    sparkleColor: params.sparkleColor as string || '#FFD700',
    
    // 新機能パラメータも忘れずに追加
    enableTwinkle: params.enableTwinkle as boolean || false,
    twinkleFrequency: params.twinkleFrequency as number || 0.5,
    twinkleBrightness: params.twinkleBrightness as number || 2.5,
    twinkleDuration: params.twinkleDuration as number || 100,
    twinkleProbability: params.twinkleProbability as number || 0.3,
  };
  sparklePrimitive.applyEffect(container, sparkleParams);
}
```

#### パラメータ同期チェックリスト

プリミティブパラメータ追加時は以下を確認：

**1. プリミティブ側の更新**
- [ ] プリミティブのParamsインターフェースに新パラメータ追加
- [ ] プリミティブ内で新パラメータを適切に処理

**2. テンプレート側の更新**
- [ ] getParameterConfig()に新パラメータ設定を追加
- [ ] プリミティブ呼び出し箇所で新パラメータを渡している

**3. 型システムの更新**
- [ ] StandardParameters.tsに新パラメータ追加（標準パラメータの場合）
- [ ] ParameterRegistry.tsに新パラメータ登録

**4. 動作確認**
- [ ] `npm run validate-parameters` が成功する
- [ ] UI上で新パラメータが正しく表示・制御できる
- [ ] 新パラメータが実際に効果として反映される

#### 実装事例: SparkleEffect Twinkle機能

```typescript
// PurePrimitiveWordSlideText.ts 内の実装例
private applySparkleEffectAfterLayout(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  // ... 他のパラメータ
): void {
  const sparkleParams: SparkleEffectParams = {
    // 既存の必須パラメータ
    enableSparkle: (params.enableSparkle as boolean !== false), 
    sparkleCount: params.sparkleCount as number || 4,
    sparkleSize: params.sparkleSize as number || 20,
    // ... 他の既存パラメータ
    
    // 新機能パラメータ群（追加時に忘れやすい）
    enableTwinkle: params.enableTwinkle as boolean || false,
    twinkleFrequency: params.twinkleFrequency as number || 0.5,
    twinkleBrightness: params.twinkleBrightness as number || 2.5,
    twinkleDuration: params.twinkleDuration as number || 100,
    twinkleProbability: params.twinkleProbability as number || 0.3,
  };
  
  sparklePrimitive.applyEffect(container, sparkleParams);
}
```

**重要**: TypeScript型システムを活用し、`SparkleEffectParams`のような型注釈を使用することで、パラメータ漏れを早期発見できます。

---

## 📋 安全なテンプレート実装チェックリスト（v2.1）

### 🛡️ 必須安全チェック

- [ ] **❗ タイムスタンプベース状態一元管理の実装**
  - シーク検出ロジックを実装していないことを確認（禁止パターン）
  - すべてのアニメーション状態を `nowMs`, `startMs`, `endMs` から純粋計算
  - 前フレーム状態への依存を排除（`lastTimeState` 等の使用禁止）
  - 通常再生とシーク操作で同一のアニメーション動作を保証

- [ ] **文字コンテナ作成は単一責任で実装**
  - プリミティブまたは既存システムのどちらか一方のみを使用
  - 両方を同時使用していないことを確認

- [ ] **SafeCharacterManager の使用を検討**
  - 複雑な文字管理が必要な場合は安全機能を活用
  - 適切な CharacterManagementMode を選択

- [ ] **開発時検証の有効化**
  - CharacterOverlapDetector.autoCheck() を呼び出し
  - 開発環境でのみ実行されることを確認

- [ ] **ImprovedCumulativeLayoutPrimitive の使用**
  - calculateLayoutOnly() を使用してレイアウト計算のみ実行
  - executeWithinHierarchy() は使用禁止

### 🧪 テスト・検証項目

- [ ] **文字表示の確認**
  - 各文字が一度だけ表示されること
  - 文字の位置が正確に計算されていること

- [ ] **重複検出テスト**
  - 開発環境で CharacterOverlapDetector が正常に動作
  - 重複が検出された場合の適切なエラーメッセージ

- [ ] **パフォーマンステスト**
  - 文字数が多い場合の処理速度
  - メモリ使用量の確認

### 🔍 コードレビューポイント

- [ ] **コンテナ名の一貫性**
  - 文字コンテナの命名規則が統一されている
  - 重複しないユニークな名前が付けられている

- [ ] **エラーハンドリング**
  - 安全機能のエラーが適切に処理されている
  - ユーザーへの適切なフィードバック

- [ ] **ドキュメント記載**
  - 使用している安全機能の記載
  - 実装時の注意点の明記

---

## 前提知識と準備

### 必要な知識

1. **PIXI.js の基本概念**
   - Container, Graphics, Text の使い方
   - 親子関係とローカル/グローバル座標
   - イベントシステムとライフサイクル

2. **UTAVISTA の階層システム**
   - 階層構造：フレーズ > 単語 > 文字
   - テンプレート継承：親から子への自動継承
   - パラメータ管理：階層的パラメータオーバーライド
   - 一括操作：複数オブジェクトへの同時適用

3. **実装済みシステムコンポーネント**
   - `TemplateManager`: テンプレート管理と割り当て
   - `ParameterManagerV2`: 階層的パラメータ管理
   - `ParameterRegistry`: 一元化されたパラメータ登録と検証システム
   - `ProjectStateManager`: 状態保存とUndo/Redo機能
   - `templateRegistry`: テンプレート中央登録

### 準備する要素

1. **型定義の理解**
   ```typescript
   interface IAnimationTemplate {
     metadata?: {
       license?: string;
       licenseUrl?: string;
       originalAuthor?: string;
     };
     
     // 必須メソッド
     animateContainer(container: PIXI.Container, text: string, params: StandardParameters, 
                     nowMs: number, startMs: number, endMs: number, 
                     hierarchyType: HierarchyType, phase: AnimationPhase): boolean;
     
     // 階層別レンダリングメソッド
     renderPhraseContainer(container: PIXI.Container, text: string, params: StandardParameters, 
                          nowMs: number, startMs: number, endMs: number, phase: AnimationPhase): boolean;
     renderWordContainer(container: PIXI.Container, text: string, params: StandardParameters, 
                        nowMs: number, startMs: number, endMs: number, phase: AnimationPhase): boolean;
     renderCharContainer(container: PIXI.Container, text: string, params: StandardParameters, 
                        nowMs: number, startMs: number, endMs: number, phase: AnimationPhase): boolean;
     
     // 必須クリーンアップメソッド
     removeVisualElements(container: PIXI.Container): void;
     
     // 非推奨: v0.4.3ではParameterRegistryを使用
     getParameterConfig(): ParameterConfig[]; // レガシーサポートのみ
   }
   ```

2. **階層継承システムの理解**
   ```typescript
   // 実際の継承例
   phrase_0: "MultiLineText"           // フレーズレベル設定
     └── phrase_0_word_1: (継承)        // 自動継承
         └── phrase_0_word_1_char_2: (継承)  // 自動継承
   
   phrase_1: "FlickerFadeTemplate"     // 別フレーズ
     └── phrase_1_word_0: "CustomTemplate"  // オーバーライド
         └── phrase_1_word_0_char_0: (継承)    // CustomTemplateを継承
   ```

---

## 現行システムアーキテクチャの理解

### テンプレート割り当てシステム

```typescript
// Engine.ts での使用例
engine.assignTemplate('phrase_0', 'MultiLineText');  // フレーズレベル設定
engine.assignTemplate('phrase_0_word_1', 'CustomTemplate');  // 単語レベルオーバーライド

// 一括割り当て
engine.batchAssignTemplate(['phrase_0', 'phrase_1'], 'MultiLineText', true);
```

### 階層的パラメータ管理

```typescript
// パラメータの優先順位
// 1. オブジェクト固有パラメータ (phrase_0_word_1の個別設定)
// 2. 親オブジェクトパラメータ (phrase_0の設定)  
// 3. グローバルパラメータ (全体設定)
// 4. テンプレートデフォルト (テンプレート標準値)

// パラメータアクセス例
const fontSize = params.fontSize || 32;
const textColor = params.defaultTextColor || '#FFFFFF';
```

### JSON駆動テンプレート登録

```typescript
// templates.json での設定
{
  "MultiLineText": {
    "displayName": "Multi-Line Text",
    "exportName": "MultiLineText",
    "category": "カラオケ",
    "description": "多行歌詞表示テンプレート"
  }
}
```

---

## 基本構造の実装

### 1. テンプレートファイルの作成

新しいテンプレートファイルを作成します：

```typescript
// src/renderer/templates/MyCustomTemplate.ts
import * as PIXI from 'pixi.js';
import { 
  IAnimationTemplate, 
  StandardParameters, 
  HierarchyType, 
  AnimationPhase,
  ParameterConfig
} from '../types/types';

export class MyCustomTemplate implements IAnimationTemplate {
  metadata = {
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: "Your Name"
  };

  // パラメータ設定
  getParameterConfig(): ParameterConfig[] {
    return [
      {
        name: "fontSize",
        type: "number",
        default: 32,
        min: 12,
        max: 72,
        step: 1,
        description: "フォントサイズ"
      },
      {
        name: "defaultTextColor",
        type: "color",
        default: "#FFFFFF",
        description: "デフォルトテキスト色"
      },
      {
        name: "animationSpeed",
        type: "number",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
        description: "アニメーション速度"
      }
    ];
  }

  // メインルーティングメソッド
  animateContainer(
    container: PIXI.Container,
    text: string,
    params: StandardParameters,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,
    phase: AnimationPhase
  ): boolean {
    switch (hierarchyType) {
      case 'phrase':
        return this.renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase);
      case 'word':
        return this.renderWordContainer(container, text, params, nowMs, startMs, endMs, phase);
      case 'char':
        return this.renderCharContainer(container, text, params, nowMs, startMs, endMs, phase);
      default:
        return false;
    }
  }

  // 階層別実装メソッド（後述）
  renderPhraseContainer(/* ... */): boolean { /* 実装 */ }
  renderWordContainer(/* ... */): boolean { /* 実装 */ }
  renderCharContainer(/* ... */): boolean { /* 実装 */ }

  // クリーンアップメソッド
  removeVisualElements(container: PIXI.Container): void {
    // 視覚要素のみを削除、コンテナは保持
    const childrenToRemove: PIXI.DisplayObject[] = [];
    
    container.children.forEach(child => {
      if (child instanceof PIXI.Text || child instanceof PIXI.Graphics) {
        childrenToRemove.push(child);
      }
      // PIXI.Container は保持（階層構造を維持）
    });
    
    childrenToRemove.forEach(child => {
      container.removeChild(child);
      child.destroy();
    });
  }
}
```

### 2. エクスポート設定

```typescript
// src/renderer/templates/index.ts に追加
export { MyCustomTemplate } from './MyCustomTemplate';
```

---

## 階層対応のアニメーション実装

### フレーズコンテナの実装

```typescript
renderPhraseContainer(
  container: PIXI.Container,
  text: string,
  params: StandardParameters,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  // フレーズ全体の配置・移動・フィルター適用
  // 重要: テキストレンダリングは行わない
  
  const duration = endMs - startMs;
  const progress = Math.max(0, Math.min(1, (nowMs - startMs) / duration));
  
  // フレーズ全体のフェードイン・アウト
  switch (phase) {
    case 'in':
      container.alpha = progress;
      break;
    case 'active':
      container.alpha = 1;
      break;
    case 'out':
      container.alpha = 1 - progress;
      break;
  }
  
  // グローバルフィルター適用
  if (params.enableGlow) {
    this.applyGlowFilter(container, params);
  }
  
  // 位置調整
  const offsetX = params.phraseOffsetX || 0;
  const offsetY = params.phraseOffsetY || 0;
  container.position.set(offsetX, offsetY);
  
  return true;
}
```

### 単語コンテナの実装

```typescript
renderWordContainer(
  container: PIXI.Container,
  text: string,
  params: StandardParameters,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  // 文字配置の管理・単語間の連続性
  // 重要: テキストレンダリングは行わない
  
  // charIndexによる正確な文字位置計算
  const charIndex = (params as any).charIndex || 0;
  const fontSize = params.fontSize || 32;
  const letterSpacing = params.letterSpacing || 0;
  
  // 文字間隔の計算
  const xOffset = charIndex * (fontSize * 0.6 + letterSpacing);
  container.position.set(xOffset, 0);
  
  // 単語レベルのアニメーション効果
  const duration = endMs - startMs;
  const progress = Math.max(0, Math.min(1, (nowMs - startMs) / duration));
  
  // 単語別のスライド効果
  if (phase === 'in') {
    const slideDistance = params.slideDistance || 100;
    container.x = xOffset - slideDistance * (1 - progress);
  }
  
  return true;
}
```

### 文字コンテナの実装

#### ⚠️ 重要：文字の可視性制御について

**文字は常に表示し、状態は色の変化のみで表現してください。**

```typescript
// ❌ 誤った実装：文字を非表示にしてしまう
textObj.visible = (nowMs >= startMs && nowMs <= endMs);  // 間違い！
textObj.visible = animationResult.visible;               // 間違い！

// ✅ 正しい実装：常に表示し、色で状態を表現
textObj.visible = true;  // 文字は常に表示
textObj.alpha = 1.0;     // 透明度も常に1.0
```

**理由**：
- 文字を非表示にすると、エンジンが文字を検出できず「アニメーションエラー」が発生
- 単語の入退場時に文字が見えなくなり、不自然な表示になる
- カラオケアニメーションでは、文字は常に見えている状態が自然

#### 実装例

```typescript
renderCharContainer(
  container: PIXI.Container,
  text: string,
  params: StandardParameters,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  // 実際のテキスト描画・個別アニメーション
  
  // 既存のテキストオブジェクトを取得または作成
  let textObj = container.getChildByName('text') as PIXI.Text;
  if (!textObj) {
    textObj = new PIXI.Text(text, this.createTextStyle(params));
    textObj.name = 'text';
    textObj.anchor.set(0.5);
    container.addChild(textObj);
  }
  
  // テキストスタイルの更新
  textObj.style = this.createTextStyle(params);
  textObj.text = text;
  
  // 文字固有のアニメーション
  const duration = endMs - startMs;
  const progress = Math.max(0, Math.min(1, (nowMs - startMs) / duration));
  
  // フェーズ別の色変更
  switch (phase) {
    case 'in':
      textObj.tint = this.interpolateColor(
        params.defaultTextColor || '#808080',
        params.activeTextColor || '#FFFFFF',
        progress
      );
      break;
    case 'active':
      textObj.tint = this.parseColor(params.activeTextColor || '#FFFFFF');
      break;
    case 'out':
      textObj.tint = this.interpolateColor(
        params.activeTextColor || '#FFFFFF',
        params.completedTextColor || '#808080',
        progress
      );
      break;
  }
  
  // カスタムエフェクト
  if (params.enableFlicker) {
    this.applyFlickerEffect(textObj, nowMs, params);
  }
  
  return true;
}
```

---

## パラメータレジストリ登録と管理

### 新しいParameterRegistryシステム（v0.4.3以降）

UTAVISTA v0.4.3では、パラメータの乱造を防ぎ、一元管理を実現するためにParameterRegistryシステムを導入しました。テンプレートで新しいパラメータを使用する場合は、まずParameterRegistryに登録する必要があります。

### 基本公開パラメータ（全テンプレート標準）

すべてのテンプレートは、特に理由がない限り以下の基本パラメータをUIで公開すべきです：

#### 1. 基本文字スタイルパラメータ
```typescript
{ name: "fontSize", type: "number", default: 32, min: 12, max: 256, step: 1 },
{ name: "fontFamily", type: "font", default: "Arial" },
{ name: "fontWeight", type: "string", default: "normal" },
{ name: "textColor", type: "color", default: "#FFFFFF" },
{ name: "activeTextColor", type: "color", default: "#FF0000" },
{ name: "completedTextColor", type: "color", default: "#808080" },
```

#### 2. レイアウト・位置設定パラメータ
```typescript
{ name: "offsetX", type: "number", default: 0, min: -1000, max: 1000, step: 1 },
{ name: "offsetY", type: "number", default: 0, min: -1000, max: 1000, step: 1 },
{ name: "letterSpacing", type: "number", default: 0, min: -20, max: 100, step: 1 },
{ name: "lineHeight", type: "number", default: 150, min: 50, max: 400, step: 10 },
```

#### 3. グロー効果パラメータ
```typescript
{ name: "enableGlow", type: "boolean", default: false },
{ name: "glowStrength", type: "number", default: 1.5, min: 0, max: 5, step: 0.1 },
{ name: "glowBrightness", type: "number", default: 1.2, min: 0.5, max: 3, step: 0.1 },
{ name: "glowBlur", type: "number", default: 6, min: 0.1, max: 20, step: 0.1 },
{ name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1 },
{ name: "glowPadding", type: "number", default: 50, min: 0, max: 200, step: 10 },
```

#### 4. シャドウ効果パラメータ
```typescript
{ name: "enableShadow", type: "boolean", default: false },
{ name: "shadowBlur", type: "number", default: 6, min: 0, max: 50, step: 0.5 },
{ name: "shadowColor", type: "color", default: "#000000" },
{ name: "shadowAngle", type: "number", default: 45, min: 0, max: 360, step: 15 },
{ name: "shadowDistance", type: "number", default: 5, min: 0, max: 50, step: 1 },
```

#### 5. アニメーション・タイミングパラメータ
```typescript
{ name: "headTime", type: "number", default: 500, min: 0, max: 5000, step: 100 },
{ name: "tailTime", type: "number", default: 500, min: 0, max: 5000, step: 100 },
```

#### 6. デバッグ・開発支援パラメータ
```typescript
{ name: "debugMode", type: "boolean", default: false }
```

### パラメータ公開の実装例

新しいテンプレートで基本パラメータを公開する場合の実装例：

```typescript
getParameterConfig(): ParameterConfig[] {
  return [
    // === 基本文字スタイル（標準パラメータ）===
    { name: "fontSize", type: "number", default: 32, min: 12, max: 256, step: 1 },
    { name: "fontFamily", type: "font", default: "Arial" },
    { name: "fontWeight", type: "string", default: "normal" },
    { name: "textColor", type: "color", default: "#FFFFFF" },
    { name: "activeTextColor", type: "color", default: "#FF0000" },
    { name: "completedTextColor", type: "color", default: "#808080" },
    
    // === レイアウト・位置設定 ===
    { name: "offsetX", type: "number", default: 0, min: -1000, max: 1000, step: 1 },
    { name: "offsetY", type: "number", default: 0, min: -1000, max: 1000, step: 1 },
    { name: "letterSpacing", type: "number", default: 0, min: -20, max: 100, step: 1 },
    { name: "lineHeight", type: "number", default: 150, min: 50, max: 400, step: 10 },
    
    // === グロー効果 ===
    { name: "enableGlow", type: "boolean", default: false },
    { name: "glowStrength", type: "number", default: 1.5, min: 0, max: 5, step: 0.1 },
    { name: "glowBrightness", type: "number", default: 1.2, min: 0.5, max: 3, step: 0.1 },
    { name: "glowBlur", type: "number", default: 6, min: 0.1, max: 20, step: 0.1 },
    { name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1 },
    { name: "glowPadding", type: "number", default: 50, min: 0, max: 200, step: 10 },
    
    // === シャドウ効果 ===
    { name: "enableShadow", type: "boolean", default: false },
    { name: "shadowBlur", type: "number", default: 6, min: 0, max: 50, step: 0.5 },
    { name: "shadowColor", type: "color", default: "#000000" },
    { name: "shadowAngle", type: "number", default: 45, min: 0, max: 360, step: 15 },
    { name: "shadowDistance", type: "number", default: 5, min: 0, max: 50, step: 1 },
    
    // === アニメーション・タイミング ===
    { name: "headTime", type: "number", default: 500, min: 0, max: 5000, step: 100 },
    { name: "tailTime", type: "number", default: 500, min: 0, max: 5000, step: 100 },
    
    // === デバッグ・開発支援 ===
    { name: "debugMode", type: "boolean", default: false },
    
    // === テンプレート固有パラメータ ===
    // ここに特定のテンプレートでのみ必要なパラメータを追加
  ];
}
```

### パラメータ公開の原則

1. **一貫性の維持**: すべてのテンプレートで同じ基本パラメータを公開することで、ユーザー体験を統一
2. **必要最小限**: 特別な理由がない限り、上記の基本パラメータセットを使用
3. **拡張性**: テンプレート固有の機能に必要な場合のみ、追加パラメータを定義
4. **互換性**: 既存のテンプレートとの互換性を維持
5. **システム統一性**: フォント選択等の既存システム機能と一貫した動作を保証

**重要**: 新しいテンプレート完成後は、必ず他のテンプレートと機能比較テストを実行し、システム全体での整合性を確認すること。

#### パラメータレジストリへの登録

```typescript
// /src/renderer/utils/ParameterRegistry.ts で登録
private initializeTemplateParameters(): void {
  // カスタムテンプレート用パラメータの例
  this.registerParameter({
    name: 'myCustomEffect',
    type: 'boolean',
    category: 'template-specific',
    templateId: 'mycustomtemplate',  // テンプレートIDと一致させる
    defaultValue: true,
    description: 'カスタムエフェクトの有効化'
  });
  
  this.registerParameter({
    name: 'effectIntensity',
    type: 'number',
    category: 'template-specific',
    templateId: 'mycustomtemplate',
    defaultValue: 1.0,
    min: 0.1,
    max: 3.0,
    description: 'エフェクトの強度'
  });
}
```

#### パラメータの分類

1. **標準パラメータ** (`category: 'standard'`)
   - 複数のテンプレートで共通使用されるパラメータ
   - 例: `fontSize`, `textColor`, `enableGlow`

2. **テンプレート固有パラメータ** (`category: 'template-specific'`)
   - 特定のテンプレートでのみ使用されるパラメータ
   - `templateId`で所属テンプレートを指定

#### レガシーgetParameterConfig()からの移行

v0.4.2以前の`getParameterConfig()`メソッドは非推奨となりました：

```typescript
// ❌ 非推奨（v0.4.2以前）
getParameterConfig(): ParameterConfig[] {
  return [...]; // パラメータ定義
}

// ✅ 推奨（v0.4.3以降）
// ParameterRegistryで事前に登録済みのパラメータを使用
// テンプレート内では登録済みパラメータのみアクセス可能
```

### パラメータアクセスパターン

```typescript
// 安全なパラメータアクセス
private getParam<T>(params: StandardParameters, key: string, defaultValue: T): T {
  return (params as any)[key] ?? defaultValue;
}

// 使用例
const fontSize = this.getParam(params, 'fontSize', 32);
const enableGlow = this.getParam(params, 'enableGlow', true);
const glowColor = this.getParam(params, 'glowColor', '#FFFF00');
```

---

## 文字・単語カウント管理

### 文字インデックスの活用

```typescript
// 文字位置の計算
calculateCharacterPosition(params: StandardParameters, text: string): { x: number; y: number } {
  const charIndex = this.getParam(params, 'charIndex', 0);
  const fontSize = this.getParam(params, 'fontSize', 32);
  const letterSpacing = this.getParam(params, 'letterSpacing', 0);
  
  // 基本の横位置計算
  const baseX = charIndex * (fontSize * 0.6 + letterSpacing);
  
  // 改行処理
  const lineNumber = this.getOrCalculateLineNumber(params, text);
  const lineHeight = fontSize * 1.2;
  const baseY = lineNumber * lineHeight;
  
  return { x: baseX, y: baseY };
}
```

### フレーズ単位での文字表示（v3.2追加）

プリミティブAPI v3.2では、フレーズ全体の文字を同時に表示するモードがサポートされています：

```typescript
// フレーズ単位モードの使用例
import { SlideAnimationPrimitive } from '../primitives';

renderCharContainer(
  container: PIXI.Container,
  text: string,
  params: StandardParameters,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  const slideAnimation = new SlideAnimationPrimitive();
  
  // フレーズモードで文字の可視性を計算
  const animResult = slideAnimation.calculateCharacterAnimation({
    charIndex: this.getParam(params, 'charIndex', 0),
    totalChars: this.getParam(params, 'totalChars', 1),
    fontSize: this.getParam(params, 'fontSize', 32),
    nowMs: nowMs,
    startMs: startMs,
    endMs: endMs,
    phase: phase,
    animationMode: 'phrase',  // フレーズモードを指定
    phraseStartMs: this.getParam(params, 'phraseStartMs', startMs),
    phraseEndMs: this.getParam(params, 'phraseEndMs', endMs)
  });
  
  // テキストオブジェクトの作成
  const textObj = TextStyleFactory.createHighDPIText(text, {
    fontFamily: this.getParam(params, 'fontFamily', 'Arial'),
    fontSize: this.getParam(params, 'fontSize', 32),
    fill: animResult.visible ? 
      this.getParam(params, 'activeTextColor', '#FFFF00') : 
      this.getParam(params, 'textColor', '#FFFFFF')
  });
  
  // フレーズモードでは全文字が同時に表示/非表示
  textObj.visible = animResult.visible;
  textObj.alpha = animResult.alpha;
  
  container.addChild(textObj);
  return true;
}

// 改行番号の計算
private getOrCalculateLineNumber(params: StandardParameters, text: string): number {
  const lineNumber = this.getParam(params, 'lineNumber', 0);
  if (lineNumber !== 0) return lineNumber;
  
  // 自動計算ロジック
  const charIndex = this.getParam(params, 'charIndex', 0);
  const maxCharsPerLine = this.getParam(params, 'maxCharsPerLine', 20);
  
  return Math.floor(charIndex / maxCharsPerLine);
}
```

### 単語境界の検出

```typescript
// 単語境界の判定
private isWordBoundary(char: string, nextChar: string): boolean {
  const isSpaceChar = /\s/.test(char);
  const isPunctuation = /[。、！？,.!?]/.test(char);
  const isEndOfText = !nextChar;
  
  return isSpaceChar || isPunctuation || isEndOfText;
}

// 単語の開始・終了判定
private isWordStart(params: StandardParameters, text: string): boolean {
  const charIndex = this.getParam(params, 'charIndex', 0);
  if (charIndex === 0) return true;
  
  const previousChar = text[charIndex - 1];
  const currentChar = text[charIndex];
  
  return this.isWordBoundary(previousChar, currentChar);
}

private isWordEnd(params: StandardParameters, text: string): boolean {
  const charIndex = this.getParam(params, 'charIndex', 0);
  const currentChar = text[charIndex];
  const nextChar = text[charIndex + 1];
  
  return this.isWordBoundary(currentChar, nextChar);
}
```

---

## PixiJSフィルタとエフェクト実装

### グローエフェクトの実装

```typescript
import { GlowFilter } from 'pixi-filters';

private applyGlowFilter(container: PIXI.Container, params: StandardParameters): void {
  const glowColor = this.parseColor(this.getParam(params, 'glowColor', '#FFFF00'));
  const glowStrength = this.getParam(params, 'glowStrength', 0.5);
  const glowDistance = this.getParam(params, 'glowDistance', 10);
  
  const glowFilter = new GlowFilter({
    distance: glowDistance,
    outerStrength: glowStrength,
    innerStrength: glowStrength * 0.5,
    color: glowColor,
    quality: 0.5
  });
  
  container.filters = [glowFilter];
}
```

### カスタムエフェクトの実装

```typescript
// 点滅エフェクト
private applyFlickerEffect(textObj: PIXI.Text, nowMs: number, params: StandardParameters): void {
  const flickerSpeed = this.getParam(params, 'flickerSpeed', 1.0);
  const flickerIntensity = this.getParam(params, 'flickerIntensity', 0.5);
  
  const flickerTime = (nowMs * flickerSpeed) / 1000;
  const flickerValue = Math.sin(flickerTime * Math.PI * 2) * flickerIntensity;
  
  textObj.alpha = Math.max(0.1, 1 - Math.abs(flickerValue));
}

// 回転エフェクト
private applyRotationEffect(container: PIXI.Container, nowMs: number, params: StandardParameters): void {
  const rotationSpeed = this.getParam(params, 'rotationSpeed', 1.0);
  const maxRotation = this.getParam(params, 'maxRotation', 0.1);
  
  const time = (nowMs * rotationSpeed) / 1000;
  container.rotation = Math.sin(time * Math.PI * 2) * maxRotation;
}
```

### パーティクルエフェクトの実装（v0.5.0新機能）

**SparkleEffectPrimitive**を使用したキラキラパーティクルエフェクトの実装：

```typescript
import { SparkleEffectPrimitive, type SparkleEffectParams } from '../primitives';

// パーティクルエフェクトプリミティブのインスタンス
private sparkleEffectPrimitive = new SparkleEffectPrimitive();

// 文字レベルでのパーティクルエフェクト適用
private applySparkleEffect(
  container: PIXI.Container, 
  text: string,
  params: StandardParameters, 
  nowMs: number, 
  startMs: number, 
  endMs: number, 
  charIndex: number,
  phraseEndMs?: number
): void {
  // パーティクルエフェクトが有効でない場合は処理をスキップ
  if (!this.getParam(params, 'enableSparkle', false)) {
    return;
  }
  
  // グローバル座標を取得（パーティクル生成に必要）
  const globalPos = container.getGlobalPosition();
  
  // SparkleEffectParamsを構築
  const sparkleParams: SparkleEffectParams = {
    // 基本パラメータ
    enableSparkle: true,
    sparkleCount: this.getParam(params, 'sparkleCount', 4),
    sparkleSize: this.getParam(params, 'sparkleSize', 20),
    sparkleColor: this.getParam(params, 'sparkleColor', '#FFD700'),
    sparkleStarSpikes: this.getParam(params, 'sparkleStarSpikes', 5),
    sparkleScale: this.getParam(params, 'sparkleScale', 3.0),
    sparkleDuration: this.getParam(params, 'sparkleDuration', 1000),
    sparkleRadius: this.getParam(params, 'sparkleRadius', 30),
    sparkleAnimationSpeed: this.getParam(params, 'sparkleAnimationSpeed', 1.0),
    sparkleAlphaDecay: this.getParam(params, 'sparkleAlphaDecay', 0.98),
    sparkleRotationSpeed: this.getParam(params, 'sparkleRotationSpeed', 0.3),
    sparkleGenerationRate: this.getParam(params, 'sparkleGenerationRate', 2.0),
    sparkleVelocityCoefficient: this.getParam(params, 'sparkleVelocityCoefficient', 1.0),
    
    // Twinkle効果（v0.5.1）- パーティクルの瞬き効果
    enableTwinkle: this.getParam(params, 'enableTwinkle', true),
    twinkleFrequency: this.getParam(params, 'twinkleFrequency', 1.0),
    twinkleDuration: this.getParam(params, 'twinkleDuration', 120),
    twinkleProbability: this.getParam(params, 'twinkleProbability', 0.8),
    
    // パーティクル専用グローエフェクト
    enableParticleGlow: this.getParam(params, 'enableParticleGlow', false),
    particleGlowStrength: this.getParam(params, 'particleGlowStrength', 1.2),
    particleGlowBrightness: this.getParam(params, 'particleGlowBrightness', 1.1),
    particleGlowBlur: this.getParam(params, 'particleGlowBlur', 4),
    particleGlowQuality: this.getParam(params, 'particleGlowQuality', 6),
    particleGlowThreshold: this.getParam(params, 'particleGlowThreshold', 0.1),
    
    // システムパラメータ
    nowMs,
    startMs,
    endMs,
    phraseEndMs,
    tailTime: 500, // パーティクル継続時間
    text,
    globalPosition: globalPos,
    charId: `phrase_${params.phraseId || 'unknown'}_word_${params.wordId || 'unknown'}_char_${charIndex}`,
    outputResolutionScale: 1.0 // 通常表示時は1.0、動画出力時は自動調整
  };
  
  // パーティクルエフェクトを適用
  this.sparkleEffectPrimitive.applyEffect(container, sparkleParams);
}

// テンプレート内での使用例（renderCharContainerメソッド内）
renderCharContainer(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  // 通常のテキスト描画処理
  // ...

  // パーティクルエフェクトを適用
  this.applySparkleEffect(
    container, 
    text, 
    params, 
    nowMs, 
    startMs, 
    endMs, 
    params.charIndex as number || 0,
    params.phraseEndMs as number
  );
  
  return true;
}
```

#### パーティクルエフェクト用パラメータ設定

パラメータ設定で以下のスパークルエフェクト関連パラメータを追加：

```typescript
getParameterConfig(): ParameterConfig[] {
  return [
    // 基本パーティクルパラメータ
    { name: "enableSparkle", type: "boolean", default: false, description: "キラキラエフェクトの有効化" },
    { name: "sparkleCount", type: "number", default: 4, min: 1, max: 20, step: 1, description: "同時生成パーティクル数" },
    { name: "sparkleSize", type: "number", default: 20, min: 4, max: 30, step: 2, description: "パーティクルサイズ(px)" },
    { name: "sparkleColor", type: "color", default: "#FFD700", description: "パーティクルカラー" },
    { name: "sparkleStarSpikes", type: "number", default: 5, min: 3, max: 12, step: 1, description: "星型の角数" },
    { name: "sparkleDuration", type: "number", default: 1000, min: 500, max: 3000, step: 100, description: "パーティクル寿命(ms)" },
    { name: "sparkleRadius", type: "number", default: 30, min: 5, max: 100, step: 5, description: "散布半径(px)" },
    { name: "sparkleRotationSpeed", type: "number", default: 0.3, min: 0.0, max: 2.0, step: 0.1, description: "回転速度" },
    { name: "sparkleGenerationRate", type: "number", default: 2.0, min: 0.5, max: 10.0, step: 0.5, description: "1秒間の生成数" },
    
    // Twinkle効果パラメータ（v0.5.1）
    { name: "enableTwinkle", type: "boolean", default: true, description: "パーティクル瞬き効果の有効化" },
    { name: "twinkleFrequency", type: "number", default: 1.0, min: 0.1, max: 5.0, step: 0.1, description: "瞬きの頻度（回/秒）" },
    { name: "twinkleDuration", type: "number", default: 120, min: 50, max: 500, step: 10, description: "瞬きの持続時間（ms）" },
    { name: "twinkleProbability", type: "number", default: 0.8, min: 0.0, max: 1.0, step: 0.1, description: "瞬きの確率" },
    
    // パーティクルグローエフェクト
    { name: "enableParticleGlow", type: "boolean", default: false, description: "パーティクルグロー効果" },
    { name: "particleGlowStrength", type: "number", default: 1.2, min: 0.1, max: 5.0, step: 0.1, description: "グロー強度" },
    { name: "particleGlowBlur", type: "number", default: 4, min: 1, max: 20, step: 1, description: "グローブラー量" },
    
    // その他の標準パラメータ...
  ];
}
```

#### 重要な注意点

1. **ステージレベル管理**: SparkleEffectPrimitiveは文字コンテナから独立してパーティクルを管理します
2. **決定論的動作**: タイムライン操作時に完全に再現可能なパーティクル表示
3. **メモリ管理**: パーティクルは自動的に寿命管理され、メモリリークを防ぎます
4. **パフォーマンス**: 大量のパーティクルでも滑らかな動作を保証
5. **グローバル座標**: `container.getGlobalPosition()`で取得した座標をパーティクル生成に使用

---

## FontService統合とフォント管理

### 重要：システム機能統一性の確保

**フォント選択機能を使用する際の必須確認事項**:

```typescript
// テンプレート実装完了後は必ず他のテンプレートと比較テストを実行
// 1. フォント候補一覧の一致確認
const multiLineStackFonts = FontService.getFontFamiliesWithStyles(); // type: "font"
const wordSlideTextFonts = FontService.getAvailableFonts(); // type: "string"

// 2. フォントピックアップ設定の反映確認
// - フォント選択画面で一部フォントをピックアップ
// - 「全フォント表示」をオフにする
// - 両方のテンプレートで同じフォント候補が表示されることを確認

// 3. 設定変更の即座反映確認  
// - フォント設定変更後、両テンプレートの選択肢が同時に更新されることを確認
```

**避けるべき実装パターン**:
- 独自のフォント取得ロジックの実装
- FontServiceを経由しない直接的なシステムフォントアクセス
- フィルタリング設定を無視したフォント表示

### FontServiceの活用

```typescript
// フォントの動的検証
private validateFont(fontFamily: string): string {
  const availableFonts = FontService.getAvailableFonts();
  const fontExists = availableFonts.some(font => font.value === fontFamily);
  
  if (!fontExists) {
    console.warn(`Font "${fontFamily}" not found, using fallback`);
    return 'Arial'; // フォールバック
  }
  
  return fontFamily;
}

// テキストスタイルの作成
private createTextStyle(params: StandardParameters): PIXI.TextStyle {
  const fontSize = this.getParam(params, 'fontSize', 32);
  const fontFamily = this.validateFont(this.getParam(params, 'fontFamily', 'Arial'));
  const textColor = this.getParam(params, 'defaultTextColor', '#FFFFFF');
  
  return new PIXI.TextStyle({
    fontFamily: fontFamily,
    fontSize: fontSize,
    fill: textColor,
    align: 'center',
    fontWeight: this.getParam(params, 'fontWeight', 'normal'),
    fontStyle: this.getParam(params, 'fontStyle', 'normal')
  });
}
```

---

## パフォーマンス最適化技法

### 早期リターンパターン

```typescript
renderCharContainer(
  container: PIXI.Container,
  text: string,
  params: StandardParameters,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  // 早期リターンによる最適化
  const headTime = this.getParam(params, 'headTime', 500);
  const tailTime = this.getParam(params, 'tailTime', 500);
  
  if (nowMs < startMs - headTime || nowMs > endMs + tailTime) {
    container.visible = false;
    return true; // 処理は成功したが、レンダリングは不要
  }
  
  container.visible = true;
  
  // 実際のレンダリング処理
  // ...
  
  return true;
}
```

### オブジェクトプールの実装

```typescript
// グラフィックスオブジェクトプール
private static graphicsPool: PIXI.Graphics[] = [];

private getGraphicsFromPool(): PIXI.Graphics {
  if (MyCustomTemplate.graphicsPool.length > 0) {
    const graphics = MyCustomTemplate.graphicsPool.pop()!;
    graphics.clear();
    return graphics;
  }
  
  return new PIXI.Graphics();
}

private returnGraphicsToPool(graphics: PIXI.Graphics): void {
  graphics.clear();
  graphics.visible = false;
  MyCustomTemplate.graphicsPool.push(graphics);
}
```

### 条件付きレンダリング

```typescript
// フレームレート適応レンダリング
private shouldUpdateThisFrame(nowMs: number, lastUpdateMs: number): boolean {
  const updateInterval = 1000 / 60; // 60fps
  return nowMs - lastUpdateMs >= updateInterval;
}

// 可視性チェック
private isVisible(container: PIXI.Container): boolean {
  return container.worldVisible && container.worldAlpha > 0.01;
}
```

---

## 文字位置計算の実装ガイド

> **⚠️ 重要**: 文字位置計算は最も重要かつ間違いやすい実装領域です。正しい階層での実装が必要です。

### 基本原則

1. **文字位置計算は文字レベルでのみ実行**
   - `renderCharContainer`で実装する
   - `renderWordContainer`では実装しない
   - `renderPhraseContainer`では実装しない

2. **charIndexパラメータの必須使用**
   - 各文字の順序位置を示す`charIndex`を必ず参照
   - 累積オフセット方式で位置を計算

3. **半角文字への対応**
   - 半角文字には適切なスケールファクターを適用
   - 通常は0.6倍の係数を使用

### 正しい実装パターン

```typescript
// ✅ 正しい実装: renderCharContainerで文字位置を計算
renderCharContainer(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  try {
    // 1. 文字位置の計算（必須）
    this.applyCharacterPosition(container, params);
    
    // 2. テキストオブジェクトの作成・更新
    this.renderCharacterText(container, text, params, nowMs, startMs, endMs, phase);
    
    return true;
  } catch (error) {
    console.error('Character rendering failed:', error);
    return false;
  }
}

/**
 * 文字位置計算の標準実装
 */
private applyCharacterPosition(container: PIXI.Container, params: Record<string, unknown>): void {
  const charIndex = this.getParam(params, 'charIndex', 0);
  const fontSize = this.getParam(params, 'fontSize', 120);
  const charSpacing = this.getParam(params, 'charSpacing', 1.0);
  const char = this.getParam(params, 'char', '') as string;
  
  // 半角文字の判定
  const isHalfWidth = this.isHalfWidthChar(char);
  const scaleFactor = isHalfWidth ? 0.6 : 1.0;
  
  // 累積オフセット方式による位置計算（v0.4.3: deviceScale削除）
  const xOffset = charIndex * fontSize * charSpacing * scaleFactor;
  
  // Y位置は親コンテナに依存、X位置のみ設定
  container.position.set(xOffset, container.position.y);
  
  // デバッグログ（開発時のみ）
  if (process.env.NODE_ENV === 'development') {
    console.log(`Character "${char}" positioned at:`, {
      charIndex,
      fontSize,
      charSpacing,
      scaleFactor,
      xOffset,
      finalPosition: { x: container.position.x, y: container.position.y }
    });
  }
}

/**
 * 半角文字の判定
 */
private isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}
```

### 間違った実装パターン

```typescript
// ❌ 間違い: renderWordContainerで文字間隔を処理
renderWordContainer(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  ...
): boolean {
  this.applyWordSlideAnimation(container, params, ...);
  this.applyCharacterSpacing(container, params); // ❌ ここで実行するのは間違い
  return true;
}

// ❌ 間違い: 文字位置を単語レベルで一括処理
private applyCharacterSpacing(container: PIXI.Container, params: Record<string, unknown>): void {
  // これは間違ったアプローチ
  // 各文字は個別にcharIndexに基づいて位置計算されるべき
}
```

### パラメータ要件

文字位置計算に必要なパラメータ：

```typescript
// 必須パラメータ
{ name: "charIndex", type: "number", required: true }, // 文字の順序位置
{ name: "fontSize", type: "number", default: 120 },    // フォントサイズ
{ name: "charSpacing", type: "number", default: 1.0 }, // 文字間隔

// オプションパラメータ
{ name: "char", type: "string", required: true },      // 文字内容（半角判定用）
```

### 検証とデバッグ

```typescript
/**
 * 文字位置計算の検証
 */
private validateCharacterPositioning(container: PIXI.Container, params: Record<string, unknown>): boolean {
  const charIndex = this.getParam(params, 'charIndex', 0);
  const expectedX = charIndex * this.getParam(params, 'fontSize', 120) * this.getParam(params, 'charSpacing', 1.0) * 0.6;
  const actualX = container.position.x;
  
  const tolerance = 1; // 1ピクセルの誤差は許容
  const isValid = Math.abs(expectedX - actualX) <= tolerance;
  
  if (!isValid) {
    console.warn(`Character positioning mismatch:`, {
      charIndex,
      expected: expectedX,
      actual: actualX,
      difference: Math.abs(expectedX - actualX)
    });
  }
  
  return isValid;
}
```

### FlexibleCumulativeLayoutPrimitive - 柔軟な単語配置システム（v0.4.3新機能）

**FlexibleCumulativeLayoutPrimitive**は、従来の単語配置の問題を解決し、4つの異なる表示モードをサポートする統合プリミティブです。

#### 4つの単語表示モード

```typescript
import { 
  FlexibleCumulativeLayoutPrimitive, 
  WordDisplayMode,
  type FlexibleCharacterData 
} from '../primitives';

enum WordDisplayMode {
  INDIVIDUAL_WORD_ENTRANCE = 'individual_word_entrance',      // 単語ごとに個別入場
  PHRASE_CUMULATIVE_SAME_LINE = 'phrase_cumulative_same_line' // 同じ行に単語を配置
}
```

#### 使用例：GlitchTextスタイルの実装

```typescript
renderWordContainer(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase,
  hierarchyType: HierarchyType
): boolean {
  const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
  
  // 文字データ（拡張版FlexibleCharacterData使用）
  const charsData = params.chars as FlexibleCharacterData[];
  
  // 表示モードの設定
  const layoutParams = {
    charSpacing: params.charSpacing as number || 1.2,
    fontSize: params.fontSize as number || 120,
    halfWidthSpacingRatio: 0.6,
    alignment: 'left' as const,
    containerSize: { width: 0, height: 0 },
    spacing: params.charSpacing as number || 1.2,
    chars: charsData,
    containerPrefix: 'char_container_',
    wordDisplayMode: WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE, // GlitchTextスタイル
    wordSpacing: params.wordSpacing as number || 1.0,
    lineHeight: params.lineHeight as number || 1.2
  };
  
  // 柔軟な文字コンテナ管理
  layoutPrimitive.manageCharacterContainersFlexible(
    container,
    layoutParams,
    (charContainer, charData, position) => {
      // 各文字のアニメーション処理
      this.animateContainer!(
        charContainer,
        charData.char,
        { ...params, id: charData.id, charIndex: charData.charIndex },
        nowMs, charData.start, charData.end, 'char', phase
      );
    }
  );
  
  return true;
}
```

#### FlexibleCharacterData 構造

```typescript
interface FlexibleCharacterData {
  id: string;
  char: string;
  start: number;
  end: number;
  charIndexInWord: number;    // 単語内での文字インデックス
  charIndex: number;          // フレーズ全体での累積文字インデックス ★重要
  wordIndex: number;          // 単語インデックス
  totalChars: number;         // フレーズ内の総文字数
  totalWords: number;         // フレーズ内の総単語数
}
```

#### 各表示モードの特徴

| モード | 用途 | 累積位置計算 | 単語間制御 |
|--------|------|-------------|------------|
| `INDIVIDUAL_WORD_ENTRANCE` | WordSlideText | 単語ごとリセット | 個別入場タイミング |
| `PHRASE_CUMULATIVE_SAME_LINE` | GlitchText | フレーズ全体累積 | 同一行連続配置 |
| `PHRASE_CUMULATIVE_NEW_LINE` | 縦書きレイアウト | フレーズ全体累積 | 単語ごとに改行 |
| `SIMULTANEOUS_WITH_SPACING` | 読みやすい表示 | フレーズ全体累積 | 単語間スペース付き |

#### パラメータでの制御方法

```typescript
getParameterConfig(): ParameterConfig[] {
  return [
    // 単語表示モード設定
    { 
      name: "wordDisplayMode", 
      type: "string", 
      default: "phrase_cumulative_same_line",
      options: [
        "individual_word_entrance",      // 単語ごとに個別入場
        "phrase_cumulative_same_line"    // 同じ行に単語を配置
      ]
    },
    { name: "wordSpacing", type: "number", default: 1.0, min: 0.0, max: 5.0, step: 0.1 },
    { name: "lineHeight", type: "number", default: 1.2, min: 0.5, max: 3.0, step: 0.1 },
    // ... 他のパラメータ
  ];
}
```

### トラブルシューティング

| 症状 | 原因 | 解決方法 |
|------|------|----------|
| 全文字が同じ位置に表示 | 単語レベルで文字間隔を処理 | 文字レベルに移動 |
| 文字が重なって表示 | charIndexを無視した実装 | charIndexを使用した累積計算 |
| 単語が同じ位置に重複表示 | EnhancedCumulativeLayoutPrimitive使用 | FlexibleCumulativeLayoutPrimitive移行 |
| 半角文字の間隔が不自然 | スケールファクター未適用 | 半角判定とスケールファクター追加 |
| 文字位置がフレームごとに変化 | 位置計算の一貫性不足 | 決定論的な位置計算の実装 |

## エラーハンドリングとデバッグ

### 多層フォールバックシステム

```typescript
renderCharContainer(
  container: PIXI.Container,
  text: string,
  params: StandardParameters,
  nowMs: number,
  startMs: number,
  endMs: number,
  phase: AnimationPhase
): boolean {
  try {
    // 高度なレンダリング
    return this.renderAdvancedCharacter(container, text, params, nowMs, startMs, endMs, phase);
  } catch (error) {
    console.warn('Advanced rendering failed, falling back to basic:', error);
    
    try {
      // 基本レンダリング
      return this.renderBasicCharacter(container, text, params, nowMs, startMs, endMs, phase);
    } catch (fallbackError) {
      console.error('Basic rendering failed, using minimal:', fallbackError);
      
      // 最小限のレンダリング
      return this.renderMinimalCharacter(container, text, params);
    }
  }
}

// 最小限のレンダリング（フォールバック）
private renderMinimalCharacter(
  container: PIXI.Container,
  text: string,
  params: StandardParameters
): boolean {
  let textObj = container.getChildByName('text') as PIXI.Text;
  if (!textObj) {
    textObj = new PIXI.Text(text, { fontSize: 32, fill: '#FFFFFF' });
    textObj.name = 'text';
    textObj.anchor.set(0.5);
    container.addChild(textObj);
  }
  
  textObj.text = text;
  return true;
}
```

### デバッグ支援

```typescript
// デバッグモード
private debugLog(message: string, hierarchyType: HierarchyType, params: StandardParameters): void {
  const debugMode = this.getParam(params, 'debugMode', false);
  if (debugMode) {
    console.log(`[${hierarchyType}] ${message}`);
  }
}

// パフォーマンスモニタリング
private performanceMonitor = {
  renderTimes: [] as number[],
  
  startTiming(): number {
    return performance.now();
  },
  
  endTiming(startTime: number, operation: string): void {
    const endTime = performance.now();
    const duration = endTime - startTime;
    this.renderTimes.push(duration);
    
    if (this.renderTimes.length > 100) {
      this.renderTimes.shift();
    }
    
    if (duration > 16) { // 60fps threshold
      console.warn(`Slow ${operation}: ${duration.toFixed(2)}ms`);
    }
  },
  
  getAverageRenderTime(): number {
    if (this.renderTimes.length === 0) return 0;
    return this.renderTimes.reduce((a, b) => a + b) / this.renderTimes.length;
  }
};
```

---

## テンプレートレジストリへの登録

### 1. templates.json への追加

```json
{
  "MyCustomTemplate": {
    "displayName": "My Custom Template",
    "exportName": "MyCustomTemplate",
    "category": "カスタム",
    "description": "カスタムテンプレートの説明"
  }
}
```

### 2. テンプレートの動的ロード確認

```typescript
// テンプレートが正しく登録されているか確認
import { templateRegistry } from '../templates/registry/templateRegistry';

const myTemplate = templateRegistry.getTemplateById('MyCustomTemplate');
if (myTemplate) {
  console.log('テンプレートが正常に登録されました:', myTemplate.metadata);
} else {
  console.error('テンプレートの登録に失敗しました');
}
```

---

## 実装パターン総合ガイド

### 完全実装例

```typescript
// src/renderer/templates/MyCustomTemplate.ts
import * as PIXI from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { 
  IAnimationTemplate, 
  StandardParameters, 
  HierarchyType, 
  AnimationPhase,
  ParameterConfig
} from '../types/types';

export class MyCustomTemplate implements IAnimationTemplate {
  metadata = {
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: "Your Name"
  };

  private static graphicsPool: PIXI.Graphics[] = [];
  private performanceMonitor = {
    renderTimes: [] as number[],
    startTiming: () => performance.now(),
    endTiming: (startTime: number, operation: string) => {
      const duration = performance.now() - startTime;
      this.renderTimes.push(duration);
      if (duration > 16) console.warn(`Slow ${operation}: ${duration.toFixed(2)}ms`);
    }
  };

  getParameterConfig(): ParameterConfig[] {
    return [
      { name: "fontSize", type: "number", default: 32, min: 12, max: 72, step: 1, description: "フォントサイズ" },
      { name: "defaultTextColor", type: "color", default: "#FFFFFF", description: "デフォルトテキスト色" },
      { name: "activeTextColor", type: "color", default: "#FF0000", description: "アクティブテキスト色" },
      { name: "enableGlow", type: "boolean", default: true, description: "グローエフェクトの有効化" },
      { name: "glowColor", type: "color", default: "#FFFF00", description: "グローの色" },
      { name: "animationSpeed", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1, description: "アニメーション速度" }
    ];
  }

  animateContainer(
    container: PIXI.Container,
    text: string,
    params: StandardParameters,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,
    phase: AnimationPhase
  ): boolean {
    const startTime = this.performanceMonitor.startTiming();
    
    try {
      let result = false;
      
      switch (hierarchyType) {
        case 'phrase':
          result = this.renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase);
          break;
        case 'word':
          result = this.renderWordContainer(container, text, params, nowMs, startMs, endMs, phase);
          break;
        case 'char':
          result = this.renderCharContainer(container, text, params, nowMs, startMs, endMs, phase);
          break;
      }
      
      this.performanceMonitor.endTiming(startTime, `${hierarchyType} rendering`);
      return result;
      
    } catch (error) {
      console.error(`Error in ${hierarchyType} rendering:`, error);
      this.performanceMonitor.endTiming(startTime, `${hierarchyType} rendering (error)`);
      return false;
    }
  }

  renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: StandardParameters,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    const duration = endMs - startMs;
    const progress = Math.max(0, Math.min(1, (nowMs - startMs) / duration));
    
    // フレーズレベルのフェード
    switch (phase) {
      case 'in':
        container.alpha = progress;
        break;
      case 'active':
        container.alpha = 1;
        break;
      case 'out':
        container.alpha = 1 - progress;
        break;
    }
    
    // グローエフェクトの適用
    if (this.getParam(params, 'enableGlow', true)) {
      this.applyGlowFilter(container, params);
    }
    
    return true;
  }

  renderWordContainer(
    container: PIXI.Container,
    text: string,
    params: StandardParameters,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    // 文字位置の計算
    const position = this.calculateCharacterPosition(params, text);
    container.position.set(position.x, position.y);
    
    return true;
  }

  renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: StandardParameters,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    // 早期リターン最適化
    if (nowMs < startMs - 500 || nowMs > endMs + 500) {
      container.visible = false;
      return true;
    }
    
    container.visible = true;
    
    // テキストオブジェクトの作成/更新
    let textObj = container.getChildByName('text') as PIXI.Text;
    if (!textObj) {
      textObj = new PIXI.Text(text, this.createTextStyle(params));
      textObj.name = 'text';
      textObj.anchor.set(0.5);
      container.addChild(textObj);
    }
    
    // フェーズ別の色変更
    const duration = endMs - startMs;
    const progress = Math.max(0, Math.min(1, (nowMs - startMs) / duration));
    
    switch (phase) {
      case 'in':
        textObj.tint = this.interpolateColor(
          this.getParam(params, 'defaultTextColor', '#FFFFFF'),
          this.getParam(params, 'activeTextColor', '#FF0000'),
          progress
        );
        break;
      case 'active':
        textObj.tint = this.parseColor(this.getParam(params, 'activeTextColor', '#FF0000'));
        break;
      case 'out':
        textObj.tint = this.interpolateColor(
          this.getParam(params, 'activeTextColor', '#FF0000'),
          this.getParam(params, 'defaultTextColor', '#FFFFFF'),
          progress
        );
        break;
    }
    
    return true;
  }

  removeVisualElements(container: PIXI.Container): void {
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
  }

  // ヘルパーメソッド
  private getParam<T>(params: StandardParameters, key: string, defaultValue: T): T {
    return (params as any)[key] ?? defaultValue;
  }

  private createTextStyle(params: StandardParameters): PIXI.TextStyle {
    return new PIXI.TextStyle({
      fontFamily: this.getParam(params, 'fontFamily', 'Arial'),
      fontSize: this.getParam(params, 'fontSize', 32),
      fill: this.getParam(params, 'defaultTextColor', '#FFFFFF'),
      align: 'center'
    });
  }

  private calculateCharacterPosition(params: StandardParameters, text: string): { x: number; y: number } {
    const charIndex = this.getParam(params, 'charIndex', 0);
    const fontSize = this.getParam(params, 'fontSize', 32);
    const letterSpacing = this.getParam(params, 'letterSpacing', 0);
    
    const baseX = charIndex * (fontSize * 0.6 + letterSpacing);
    const lineNumber = this.getParam(params, 'lineNumber', 0);
    const baseY = lineNumber * fontSize * 1.2;
    
    return { x: baseX, y: baseY };
  }

  private applyGlowFilter(container: PIXI.Container, params: StandardParameters): void {
    const glowColor = this.parseColor(this.getParam(params, 'glowColor', '#FFFF00'));
    const glowStrength = this.getParam(params, 'glowStrength', 0.5);
    
    const glowFilter = new GlowFilter({
      distance: 10,
      outerStrength: glowStrength,
      innerStrength: glowStrength * 0.5,
      color: glowColor,
      quality: 0.5
    });
    
    container.filters = [glowFilter];
  }

  private parseColor(colorString: string): number {
    return parseInt(colorString.replace('#', ''), 16);
  }

  private interpolateColor(color1: string, color2: string, progress: number): number {
    const c1 = this.parseColor(color1);
    const c2 = this.parseColor(color2);
    
    const r1 = (c1 >> 16) & 0xFF;
    const g1 = (c1 >> 8) & 0xFF;
    const b1 = c1 & 0xFF;
    
    const r2 = (c2 >> 16) & 0xFF;
    const g2 = (c2 >> 8) & 0xFF;
    const b2 = c2 & 0xFF;
    
    const r = Math.round(r1 + (r2 - r1) * progress);
    const g = Math.round(g1 + (g2 - g1) * progress);
    const b = Math.round(b1 + (b2 - b1) * progress);
    
    return (r << 16) | (g << 8) | b;
  }
}
```

---

## フレーズタイミング優先実装ガイド（v0.4.3新機能）

### 概要

点滅フェードテキストv2.0で実装されたフレーズタイミング優先機能は、個々の文字や単語のタイミングを無視し、すべての文字をフレーズの入場期間（HeadTime）内に収めて表示する高度な機能です。この機能により、文字がフレーズ開始と同時に一斉に入場し、統一感のあるアニメーションを実現できます。

### 実装の背景と必要性

#### プリミティブAPIの制約

FlexibleCumulativeLayoutPrimitiveなどの標準プリミティブは、以下の制約があります：

1. **個別タイミング制御の制限**: プリミティブは各文字の元のタイミング（start/end）に基づいて表示制御を行う
2. **フレーズ全体の統一制御困難**: フレーズベースでの一斉入場や退場を直接サポートしていない
3. **タイミング変換の必要性**: テンプレート側でタイミングのラッピング処理が必要

```typescript
// プリミティブが期待するデータ構造
interface FlexibleCharacterData {
  char: string;
  start: number;  // 文字の元のタイミング
  end: number;    // プリミティブはこれを直接使用
}
```

### 実装手法

#### 1. タイミング変換（ラッピング）処理

```typescript
// BlinkFadeTextPrimitive_v2の実装例
renderWordContainer(container, _, params, nowMs, startMs, endMs) {
  // フレーズタイミング強制フラグ
  const forcePhraseTiming = params.forcePhraseTiming as boolean || false;
  
  if (forcePhraseTiming) {
    // フレーズの入場期間を計算
    const phraseStartMs = params.phraseStartMs as number || startMs;
    const headTime = params.headTimeOverride as number || 800;
    const phraseEntranceStart = phraseStartMs - headTime;
    const phraseEntranceEnd = phraseStartMs;
    
    // すべての文字のタイミングを収集
    const flexibleCharsData = characters.map(char => ({
      char: char.char,
      start: char.start,
      end: char.end,
      // ... その他のプロパティ
    }));
    
    // タイミングの最小値と範囲を計算
    const minCharStart = Math.min(...flexibleCharsData.map(c => c.start));
    const maxCharEnd = Math.max(...flexibleCharsData.map(c => c.end));
    const originalDuration = maxCharEnd - minCharStart;
    const targetDuration = phraseEntranceEnd - phraseEntranceStart;
    
    // スケール係数を計算
    const timeScale = targetDuration / originalDuration;
    
    // プリミティブのコールバック内でタイミングを変換
    this.flexibleLayoutPrimitive.manageCharacterContainersFlexible(
      container,
      layoutParams,
      (charContainer, charData) => {
        // 元のデータを取得（プリミティブが変更したものを元に戻す）
        const originalCharData = flexibleCharsData.find(c => c.id === charData.id);
        const actualCharStartMs = originalCharData ? originalCharData.start : charData.start;
        const actualCharEndMs = originalCharData ? originalCharData.end : charData.end;
        
        // フレーズ入場期間内に収まるようにタイミングを変換
        const transformedStartMs = phraseEntranceStart + (actualCharStartMs - minCharStart) * timeScale;
        const transformedEndMs = phraseEntranceStart + (actualCharEndMs - minCharStart) * timeScale;
        
        // 変換されたタイミングでアニメーションを実行
        this.animateContainer(charContainer, charData.char, {
          ...params,
          startMs: transformedStartMs,
          endMs: transformedEndMs
        });
      }
    );
  }
}
```

#### 2. 入場期間の判定ロジック

```typescript
// フレーズベースの入場期間判定
const phraseActualStartMs = params.phraseStartMs as number || startMs;
const phraseHeadTime = params.headTimeOverride as number || params.phraseHeadTime as number || 800;
const phraseEntranceEndMs = phraseActualStartMs + phraseHeadTime;

// 重要: フレーズ開始時刻+ヘッドタイムまでが入場期間
const isInEntrancePhase = forcePhraseTiming && 
                          nowMs >= charState.flickerStartTime && 
                          nowMs < phraseEntranceEndMs;
```

### 実装上の注意事項

#### 1. プリミティブとテンプレートの責任分担

- **プリミティブの責任**: 文字の配置、基本的な表示/非表示制御
- **テンプレートの責任**: タイミング変換、フレーズベースのアニメーション制御

```typescript
// テンプレートが完全な制御を行う
container.visible = true;  // プリミティブの制御を上書き
container.alpha = 1.0;     // プリミティブのアルファ制御を無効化

// テンプレート側で独自の表示制御
if (shouldBlink) {
  container.visible = false;
  container.alpha = 0;
} else {
  container.visible = true;
  container.alpha = calculatedAlpha;
}
```

#### 2. タイミングの一貫性維持

```typescript
// 文字状態の初期化時にタイミングを事前計算
const charState = {
  flickerStartTime: transformedStartMs - flickerEarlyStartMs,
  fadeInCompleteTime: transformedStartMs,
  fadeOutStartTime: transformedEndMs,
  fadeOutDuration: params.fadeOutDuration as number || 500
};

// 保存して再利用
(container as any).__charState = charState;
```

### 開発時に発生した不具合と解決方法

#### 不具合1: 点滅エフェクトが適用されない

**原因**: 
- `isInEntrancePhase`の判定が `nowMs < phraseActualStartMs` を使用していたため、フレーズ開始後は入場期間として認識されなかった
- `baseAlpha`が1.0になると`fullDisplayThreshold`を超えて点滅が停止していた

**解決方法**:
```typescript
// 修正前
const isInEntrancePhase = forcePhraseTiming && 
                          nowMs >= charState.flickerStartTime && 
                          nowMs < phraseActualStartMs;

// 修正後: ヘッドタイムを含めた入場期間を正しく判定
const phraseEntranceEndMs = phraseActualStartMs + phraseHeadTime;
const isInEntrancePhase = forcePhraseTiming && 
                          nowMs >= charState.flickerStartTime && 
                          nowMs < phraseEntranceEndMs;

// 入場期間中の特別な点滅ロジック
if (forcePhraseTiming && isInEntrancePhase) {
  // baseAlphaが1.0でも点滅を継続
  const entranceProgress = (nowMs - charState.flickerStartTime) / 
                           (phraseEntranceEndMs - charState.flickerStartTime);
  const flickerAlpha = Math.min(entranceProgress, 0.9);
  // 点滅計算...
}
```

#### 不具合2: フェードイン期間の条件分岐に入らない

**原因**: 
- `progress`が1.0になっていても、フェードイン期間の条件（`nowMs < charState.fadeInCompleteTime`）を満たさなかった

**解決方法**:
```typescript
// 修正前
} else if (nowMs < charState.fadeInCompleteTime) {

// 修正後: 入場期間中も含める
} else if (nowMs < charState.fadeInCompleteTime || (isInEntrancePhase && nowMs < phraseEndMs)) {
```

#### 不具合3: 構文エラー（インデント不整合）

**原因**:
- 複雑なif-else文の構造でインデントが不整合になり、括弧の対応が崩れた

**解決方法**:
- 各if-else節のインデントを統一
- 入場期間の処理を含む大きなif-else文を適切に閉じる

### プリミティブAPIの制約と対処方法

#### 制約1: プリミティブのタイミング制御

**制約内容**: 
FlexibleCumulativeLayoutPrimitiveは`wordDisplayMode`で表示モードを制御するが、個々の文字のタイミングは元のデータを使用する。

**対処方法**:
```typescript
// プリミティブに渡す前のデータを保持
const originalCharsData = [...flexibleCharsData];

// プリミティブのコールバック内で元のデータを復元
(charContainer, charData) => {
  const originalData = originalCharsData.find(d => d.id === charData.id);
  // originalDataを使用してタイミングを制御
}
```

#### 制約2: 表示制御の競合

**制約内容**: 
プリミティブが`container.visible`や`container.alpha`を制御するため、テンプレートの制御と競合する。

**対処方法**:
```typescript
// プリミティブの処理後に強制的に上書き
container.visible = true;  // 強制的に表示を有効化
container.alpha = 1.0;     // プリミティブのアルファ制御を無効化

// その後、テンプレート独自の制御を適用
container.visible = containerVisible;
container.alpha = containerAlpha;
```

### 実装チェックリスト

フレーズタイミング優先機能を実装する際のチェックリスト：

- [ ] `forcePhraseTiming`パラメータの追加と適切なデフォルト値設定
- [ ] フレーズの入場期間（HeadTime）の正確な計算
- [ ] タイミング変換のスケール係数計算
- [ ] 元のタイミングデータの保持と復元
- [ ] `isInEntrancePhase`の正確な判定
- [ ] プリミティブの制御を適切に上書き
- [ ] 入場期間中の特別な点滅ロジックの実装
- [ ] フェードイン/アウトの条件分岐の調整
- [ ] デバッグログの適切な配置（開発時）

### パフォーマンス考慮事項

1. **タイミング計算のキャッシュ**: 文字状態を`__charState`として保存し、毎フレーム再計算を避ける
2. **デバッグログの制限**: 本番環境では最小限に抑える
3. **条件分岐の最適化**: 最も頻繁に実行されるケースを先に配置

### まとめ

フレーズタイミング優先実装は、プリミティブAPIの制約を理解し、適切なラッピング処理を行うことで実現できます。重要なのは：

1. プリミティブとテンプレートの責任分担を明確にする
2. タイミング変換ロジックを正確に実装する
3. 入場期間の判定を正しく行う
4. プリミティブの制御を必要に応じて上書きする

この実装パターンは、他のテンプレートでも同様のフレーズベースの制御が必要な場合に参考になります。

---

## よくある失敗事例と対策

実際のテンプレート開発で遭遇した問題と解決方法を紹介します。

### 0. シーク検出による状態管理の破綻（最重要・禁止パターン）❗

**最も危険なアンチパターン**: シーク検出ロジックの実装により、通常再生とシーク操作で異なるアニメーション動作が発生する問題。

**❌ 問題事例**: BlackBandMaskTextPrimitive での実装（現在は修正済み）
```typescript
// ❌ 危険: シーク検出ロジック
private lastTimeState = new Map<string, number>();
private animationRestartState = new Map<string, {
  restartTime: number;
  isRestarting: boolean;
  originalStartTime: number;
}>();

private detectSeek(nowMs: number, phraseId: string): boolean {
  const lastTime = this.lastTimeState.get(phraseId) || 0;
  const threshold = 100; // 100ms
  const isSeekDetected = Math.abs(nowMs - lastTime) > threshold;
  this.lastTimeState.set(phraseId, nowMs);
  return isSeekDetected;
}

renderPhraseContainer(container: PIXI.Container, params: any, nowMs: number, startMs: number, endMs: number) {
  const phraseId = params.phraseId as string;
  const isSeekDetected = this.detectSeek(nowMs, phraseId);
  
  if (isSeekDetected) {
    // ❌ この時点で restartTime = nowMs になり、本来のアニメーション開始時間を破壊
    this.startAnimationRestart(phraseId, nowMs, startMs);
  }
  
  // ❌ 結果: 通常再生では800ms前からスワイプイン、シーク時は80ms前から開始
}
```

**✅ 正しい解決方法**: 純粋な時間ベース計算
```typescript
// ✅ 正しい: すべて時間から純粋計算
renderPhraseContainer(container: PIXI.Container, params: any, nowMs: number, startMs: number, endMs: number) {
  const headTime = (params.headTime as number) || 500;
  const tailTime = (params.tailTime as number) || 500;
  
  // シーク検出不要 - すべて時間から直接計算
  const swipeInStartTime = startMs - headTime;
  const swipeOutEndTime = endMs + tailTime;
  
  if (nowMs >= swipeInStartTime && nowMs <= swipeOutEndTime) {
    // アニメーション実行（通常再生でもシークでも同一動作）
    const progress = this.calculateSwipeProgress(nowMs, swipeInStartTime, startMs, endMs, tailTime);
    this.applySwipeAnimation(container, progress);
  } else {
    // 時間範囲外ではクリーンアップ
    this.cleanupElements(container);
  }
}

// 純粋関数による進行度計算
private calculateSwipeProgress(nowMs: number, swipeInStart: number, activeStart: number, activeEnd: number, tailTime: number): number {
  if (nowMs <= swipeInStart) return 0;
  if (nowMs <= activeStart) return (nowMs - swipeInStart) / (activeStart - swipeInStart);
  if (nowMs <= activeEnd) return 1;
  if (nowMs <= activeEnd + tailTime) return 1 - (nowMs - activeEnd) / tailTime;
  return 0;
}
```

**この実装パターンが禁止される理由**:
1. **タイミング不整合**: 再生方法により異なるアニメーション動作
2. **デバッグ困難**: 状態が分散し、問題の特定が困難
3. **予期しないバグ**: エッジケースで予想外の動作
4. **メンテナンス困難**: ロジックが複雑化し、修正が困難

### 1. 文字重複表示問題（重要）❗ v2.1更新

**UTAVISTA v2.1では、文字重複表示を防止する安全機能が追加されました。** 詳細は「[🚨 文字重複表示防止ガイド](#文字重複表示防止ガイド)」を参照してください。

**❌ 問題**: 文字コンテナの重複作成により、同じ文字が複数回表示される
```typescript
// ❌ 間違った実装: プリミティブと既存システムの併用
layoutPrimitive.manageCharacterContainers(wordContainer, params);  // コンテナ作成①
params.chars.forEach(charData => {
  const charContainer = new PIXI.Container();  // コンテナ作成② → 重複!
});
```

**✅ v2.1 推奨解決方法**: SafeCharacterManager の使用
```typescript
import { SafeCharacterManager, CharacterManagementMode } from '../primitives/safe/SafeCharacterManager';

// 安全な文字管理
const safeManager = new SafeCharacterManager({
  mode: CharacterManagementMode.COOPERATIVE,
  containerPrefix: 'char_container_',
  layoutParams: { fontSize: 32, charSpacing: 1.0, halfWidthSpacingRatio: 0.6, alignment: 'left' },
  enableSafetyChecks: true,
  enableDebugLogs: process.env.NODE_ENV === 'development'
});

const result = safeManager.manageCharacters(wordContainer, text, characters, 
  (charContainer, charData, position) => {
    this.renderCharContainer(charContainer, charData.char, params, nowMs, startMs, endMs, phase);
  }
);
```

**✅ 従来の解決方法**: 単一責任でのコンテナ管理
```typescript
// 既存システムのみ使用（プリミティブとの併用禁止）
if (params.chars && Array.isArray(params.chars)) {
  params.chars.forEach((charData: any, index: number) => {
    // 既存コンテナ検索
    let charContainer: PIXI.Container | null = null;
    container.children.forEach((child: any) => {
      if (child instanceof PIXI.Container && 
          (child as any).name === `char_container_${charData.id}`) {
        charContainer = child as PIXI.Container;
      }
    });
    
    // 新規作成（必要時のみ）
    if (!charContainer) {
      charContainer = new PIXI.Container();
      (charContainer as any).name = `char_container_${charData.id}`;
      container.addChild(charContainer);
    }
    
    // 累積位置計算
    const charSpacing = params.charSpacing || 1.0;
    const fontSize = params.fontSize || 32;
    charContainer.position.set(cumulativeXOffset, 0);
    cumulativeXOffset += fontSize * charSpacing;
  });
}
```

### 1. 文字位置計算の階層間違い（重要）

**❌ 問題**: 全ての文字が同じ座標に表示される

```typescript
// ❌ 間違った実装
renderWordContainer(container, text, params, ...): boolean {
  this.applyWordSlideAnimation(container, params, ...);
  this.applyCharacterSpacing(container, params); // ここで実行するのが間違い
  return true;
}
```

**✅ 解決方法**: 文字位置計算は文字レベルでのみ実行

```typescript
// ✅ 正しい実装
renderCharContainer(container, text, params, ...): boolean {
  this.applyCharacterPosition(container, params); // 文字レベルで実行
  this.renderCharacterText(container, text, params, ...);
  return true;
}

private applyCharacterPosition(container: PIXI.Container, params: Record<string, unknown>): void {
  const charIndex = this.getParam(params, 'charIndex', 0);
  const fontSize = this.getParam(params, 'fontSize', 120);
  const charSpacing = this.getParam(params, 'charSpacing', 1.0);
  
  const xOffset = charIndex * fontSize * charSpacing * 0.6;
  container.position.set(xOffset, container.position.y);
}
```

**検証方法**:
```typescript
// テンプレート実装検証チェックリスト
function validateCharacterPositioning(template: IAnimationTemplate): ValidationResult {
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  // 1. renderCharContainerで文字位置計算を実行しているか
  if (!template.renderCharContainer.toString().includes('charIndex')) {
    results.failed.push('renderCharContainer does not use charIndex parameter');
  }
  
  // 2. renderWordContainerで文字位置計算をしていないか
  if (template.renderWordContainer.toString().includes('CharacterSpacing') ||
      template.renderWordContainer.toString().includes('charIndex')) {
    results.failed.push('renderWordContainer incorrectly handles character positioning');
  }
  
  // 3. 必要なパラメータが定義されているか
  const params = template.getParameterConfig?.() || [];
  const hasCharSpacing = params.some(p => p.name === 'charSpacing');
  const hasFontSize = params.some(p => p.name === 'fontSize');
  
  if (!hasCharSpacing) results.failed.push('Missing charSpacing parameter');
  if (!hasFontSize) results.failed.push('Missing fontSize parameter');
  
  return {
    valid: results.failed.length === 0,
    errors: results.failed,
    warnings: results.warnings
  };
}
```

### 2. フィルター蓄積とリソース管理の問題

#### 失敗事例
```typescript
// シャドウ半径が際限なく拡大していく問題
renderPhraseContainer(...) {
  // 毎フレーム新しいアニメーションオブジェクトを作成
  const animation = this.buildPhraseAnimation(params, nowMs, startMs, endMs);
  animation.apply(context, progress); // フィルターが累積されていく
}
```

#### 原因
- アニメーションオブジェクトが毎フレーム再作成される
- エフェクトプリミティブの`initialized`フラグがリセットされる
- フィルターが重複して追加され累積される

#### 対策
```typescript
// アニメーションオブジェクトのキャッシュ化
class CompleteWordSlideTemplateClass implements IAnimationTemplate {
  private animations = new Map<string, CompositeAnimation>();
  
  renderPhraseContainer(...) {
    // コンテナIDを生成
    const containerId = (container as any).name || `phrase_${startMs}_${text.substring(0, 10)}`;
    
    // キャッシュから取得、または新規作成
    let animation = this.animations.get(containerId);
    if (!animation) {
      animation = this.buildPhraseAnimation(params, nowMs, startMs, endMs);
      this.animations.set(containerId, animation);
    }
    
    // アニメーションの適用
    animation.apply(context, progress);
  }
}
```

#### デバッグ方法
```typescript
// フィルター数の監視
if (context.container.filters && context.container.filters.length > 10) {
  console.warn(`[EffectPrimitive] Too many filters detected: ${context.container.filters.length}`);
  console.log('[EffectPrimitive] Filter list:', context.container.filters.map(f => f.constructor.name));
}

// シャドウの異常値検出
if (newDistance > 1000 || newDistance < 0) {
  console.warn(`[ShadowEffect] Abnormal distance detected: ${newDistance}`);
  return;
}
```

### 3. 高DPIディスプレイでの文字サイズ問題

#### 失敗事例
```typescript
// 文字拡大エフェクト実装時
textObj = TextStyleFactory.createHighDPIText(text, {
  fontSize: 93,  // 設定値
  // ...
});
textObj.scale.set(8, 8); // 8倍拡大

// 結果: Retinaディスプレイで想定の2倍の大きさに表示される
```

#### 原因
`createHighDPIText()`はdevicePixelRatio（Retinaでは2.0）を考慮して：
- フォントサイズを自動拡大: 93px → 186px
- テキストscaleを自動縮小: 1.0 → 0.5
- 最終的なスケール: 0.5 × 8 = 4倍（見た目は8倍相当だが、ベースサイズが2倍）

#### 対策
```typescript
// 正確なサイズ制御が必要な場合はcreateText()を使用
textObj = TextStyleFactory.createText(text, {
  fontSize: 93,  // この値がそのまま使用される
  // ...
});
textObj.scale.set(8, 8); // 期待通りの8倍拡大
```

### 4. 文字が表示されない問題（removeVisualElements）

#### 失敗事例
```typescript
// 文字が作成されるが毎フレーム削除される
renderCharContainer(...) {
  // テキストオブジェクトの作成
  const textObj = TextStyleFactory.createHighDPIText(text, style);
  container.addChild(textObj);
  
  // 次のフレームでremoveVisualElementsが呼ばれて削除される
}

removeVisualElements(container: PIXI.Container): void {
  // 全ての子要素を削除
  container.children.forEach(child => {
    container.removeChild(child);
    child.destroy();
  });
}
```

#### 原因
`removeVisualElements`が毎フレーム呼ばれ、文字コンテナ内のテキストオブジェクトも削除される

#### 対策
```typescript
removeVisualElements(container: PIXI.Container): void {
  const containerName = (container as any).name || 'unnamed';
  
  // 文字コンテナの場合は、コンテナ階層を維持して他の要素のみを削除
  if (containerName.includes('char_container_')) {
    const childrenToRemove = container.children.filter(child => {
      const childName = (child as any).name;
      // 子コンテナは保持
      const isContainer = child instanceof PIXI.Container && 
                         childName && 
                         (childName.includes('phrase_container_') || 
                          childName.includes('word_container_') || 
                          childName.includes('char_container_'));
      return !isContainer; // コンテナ以外を削除対象とする
    });
    
    childrenToRemove.forEach(child => {
      container.removeChild(child);
      child.destroy();
    });
  }
}
```

### 5. 文字スケーリング効果が適用されない問題

#### 失敗事例
```typescript
renderCharContainer(...) {
  // 毎フレーム新しいTextオブジェクトを作成
  const textObj = new PIXI.Text(text, style);
  textObj.scale.set(8, 8);  // スケール設定
  container.addChild(textObj);
  
  // 次のフレームでremoveVisualElementsが呼ばれて削除される
}
```

#### 原因
`removeVisualElements`が毎フレーム呼ばれ、設定したスケールごとTextオブジェクトが削除される

#### 対策
```typescript
// animateContainerで文字レベルの場合は削除をスキップ
if (hierarchyType !== 'char') {
  this.removeVisualElements!(container);
}

// removeVisualElementsでテキストオブジェクトを保護
if (child instanceof PIXI.Text && child.name === 'text') {
  childrenToKeep.push(child);
}

// renderCharContainerでオブジェクトを再利用
let textObj = container.getChildByName('text') as PIXI.Text;
if (!textObj) {
  textObj = TextStyleFactory.createText(text, style);
  textObj.name = 'text';  // 重要: 名前を設定
  container.addChild(textObj);
}
```

### 6. デバッグログの過剰出力とパフォーマンス問題

#### 失敗事例
```typescript
// 毎フレームログ出力でパフォーマンス低下とログの可読性低下
renderCharContainer(...) {
  console.log(`[Template] Character rendered: ${text}`);
  console.log(`[EffectPrimitive] Effect applied with progress ${progress}`);
  console.log(`[ShadowEffect] Shadow updated: distance=${distance}`);
}
```

#### 原因
- 60fps で実行されるため、毎秒180回のログが出力される
- ログの量が膨大でデバッグが困難になる
- パフォーマンスが低下する

#### 対策
```typescript
// 確率的ログ出力
if (Math.random() < 0.001) { // 0.1%の確率で出力
  console.log(`[EffectPrimitive] Effect applied with progress ${progress}`);
}

// 重要度別ログ管理
console.log(`[Template] Initialized`); // 初期化ログは常時出力
console.warn(`[Template] Abnormal value detected: ${value}`); // 警告は常時出力
console.error(`[Template] Error occurred:`, error); // エラーは常時出力

// デバッグ用フレームカウンター
let frameCounter = 0;
frameCounter++;
if (frameCounter % 60 === 0) { // 1秒に1回
  console.log(`[Template] Debug info - Frame ${frameCounter}`);
}
```

### 7. パラメータ検証エラー

#### 失敗事例
```
ParameterValidator.ts:60 Parameter validation errors: 
['Unknown parameter: enableCharScaling', 'Unknown parameter: charScaleMultiplier', ...]
```

#### 原因
新しいパラメータを`getParameterConfig()`に追加したが、`StandardParameters.ts`に登録していない

#### 対策
```typescript
// StandardParameters.tsに追加
export interface StandardParameters {
  // ... 既存のパラメータ
  
  // 新規パラメータを追加
  enableCharScaling?: boolean;
  charScaleMultiplier?: number;
  charPositionOffsetX?: number;
  charPositionOffsetY?: number;
  charScalingSeed?: number;
}

// DEFAULT_PARAMETERSにも追加
export const DEFAULT_PARAMETERS: StandardParameters = {
  // ... 既存のデフォルト値
  
  enableCharScaling: true,
  charScaleMultiplier: 8.0,
  charPositionOffsetX: 20,
  charPositionOffsetY: 100,
  charScalingSeed: 12345,
};
```

### 8. Engine.tsでのパラメータ配列エラー

#### 失敗事例
```
Parameter validation errors: ['Unknown parameter: 0', 'Unknown parameter: 1', ...]
```

#### 原因
Engine.tsの`changeTemplate`メソッドで、配列形式の`params`が誤って`updateGlobalDefaults`に渡される

#### 現状と対策
これはEngine側のバグですが、実際の動作には影響しません。将来的な修正案：
```typescript
// Engine.ts changeTemplateメソッド内
const mergedParams = { ...defaultParams };
// paramsが配列の場合はスキップ
if (!Array.isArray(params)) {
  Object.assign(mergedParams, params);
}
```

### 9. ランダム値が毎フレーム変化する問題

#### 失敗事例
```typescript
// 毎フレーム異なるランダム値が生成される
const offsetX = (Math.random() - 0.5) * 40;
const offsetY = (Math.random() - 0.5) * 200;
textObj.position.set(offsetX, offsetY);
```

#### 原因
`Math.random()`は毎回異なる値を返すため、文字が震え続ける

#### 対策
```typescript
// 文字IDベースの決定論的ランダム生成
function generateCharacterOffset(charId: string, seed: number, rangeX: number, rangeY: number) {
  let hash = seed;
  for (let i = 0; i < charId.length; i++) {
    hash = ((hash << 5) - hash) + charId.charCodeAt(i);
    hash = hash & hash; // 32bit integer変換
  }
  
  // ハッシュから擬似ランダム生成
  let rng = Math.abs(hash) + 1;
  const nextRandom = () => {
    rng = ((rng * 1103515245) + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  
  const x = (nextRandom() - 0.5) * rangeX;
  const y = (nextRandom() - 0.5) * rangeY;
  
  return { x, y };
}

// 使用例
const charId = params.id || `char_${startMs}_${text}`;
const offset = generateCharacterOffset(charId, seed, 40, 200);
```

### 10. フォント選択機能の不整合問題（従来）

#### 失敗事例
```typescript
// 毎フレームログ出力でパフォーマンス低下
console.log(`Frame ${frameCounter}: ${詳細情報...}`);
```

#### 対策
```typescript
// グローバルフレームカウンター
let frameCounter = 0;
let lastLogFrame = 0;

// 10フレームごとにログ出力
frameCounter++;
if (frameCounter - lastLogFrame >= 10) {
  lastLogFrame = frameCounter;
  console.log(`=== フレーム ${frameCounter} ===`);
  console.log(詳細情報...);
}

// または確率的なログ出力
if (Math.random() < 0.1) { // 10%の確率
  console.log(デバッグ情報...);
}
```

### 11. フレーズが重複表示される問題

#### 失敗事例
フォント選択UIで無効なフォントや予期しないフォントが表示される

#### 根本原因
FontServiceに2つの異なるフォント取得メソッドがあり、フィルタリングロジックが統一されていなかった：

- `getAvailableFonts()`: パラメータ`type: "string"`で使用（正しくフィルタリング）
- `getFontFamiliesWithStyles()`: パラメータ`type: "font"`で使用（フィルタリング不整合）

#### 問題の発見方法
```typescript
// 他のテンプレートと比較してフォント選択候補を確認
console.log('WordSlideText fonts:', FontService.getAvailableFonts());
console.log('MultiLineStack fonts:', FontService.getFontFamiliesWithStyles());
```

#### 対策と修正
```typescript
// FontService.ts の getFontFamiliesWithStyles() に統一フィルタリング追加
static getFontFamiliesWithStyles(): FontFamily[] {
  // getAvailableFonts()と同じフィルタリングロジックを適用
  const showAllFonts = this.getShowAllFonts();
  
  let fontsToShow: string[];
  if (showAllFonts || this.pickedFonts.size === 0) {
    fontsToShow = this.validatedFonts;
  } else {
    fontsToShow = this.validatedFonts.filter(font => this.pickedFonts.has(font));
  }
  
  // フィルタリングされたフォントのみを対象に処理
  fontsToShow.forEach(fontFamily => {
    // ... スタイル情報付きフォント生成
  });
}
```

#### 再発防止のガイドライン

**1. FontServiceの統一原則**
- 新しいフォント取得メソッドを追加する場合は、必ず既存の`getAvailableFonts()`と同じフィルタリングロジックを適用する
- フォントピックアップ設定（`pickedFonts`、`showAllFonts`）を尊重する

**2. テンプレート開発時の確認事項**
```typescript
// テンプレート実装完了後の確認チェックリスト
// ✅ フォント選択で表示されるフォント一覧が他のテンプレートと一致するか
// ✅ フォントピックアップ設定が正しく反映されるか
// ✅ 「全フォント表示」設定の切り替えが動作するか
```

**3. パラメータタイプ選択指針**
- `type: "font"`: 豊富なフォント選択UI（ファミリー + スタイル選択）が必要な場合
- `type: "string"`: シンプルなドロップダウン選択で十分な場合
- **どちらを選んでも、フォントフィルタリング動作は統一されている必要がある**

### 12. フレーズが重複表示される問題

#### 失敗事例
同じフレーズが複数重なって表示される

#### 原因の可能性
- 階層構造の処理が正しく行われていない
- コンテナの削除・再作成タイミングの問題
- 親子関係の設定ミス

#### デバッグ方法
```typescript
// フレーズコンテナ処理時のログ追加
if (frameCounter % 10 === 0) {
  console.log(`=== フレーズコンテナ処理 ===`);
  console.log(`フレーズテキスト: "${text}"`);
  console.log(`コンテナ名: ${container.name}`);
  console.log(`子コンテナ数: ${container.children.length}`);
  console.log(`位置: (${container.position.x}, ${container.position.y})`);
}
```

## 重要な再発防止ガイドライン

### プリミティブシステム使用時の必須チェックリスト

テンプレート開発完了後、以下のチェックリストを確認してください：

#### 1. リソース管理の確認
- [ ] アニメーションオブジェクトがキャッシュされている
- [ ] エフェクトプリミティブで`initialized`フラグが適切に使用されている
- [ ] `cleanup()`メソッドでフィルターが適切に削除されている
- [ ] フィルター数の監視ログが実装されている（10個超過で警告）

#### 2. デバッグログの適切性
- [ ] 高頻度実行される処理では確率的ログ出力を使用（0.1%〜1%）
- [ ] 初期化・クリーンアップログは保持されている
- [ ] エラー・警告ログは常時出力される
- [ ] 異常値検出ログが実装されている

#### 3. テキスト表示の確認
- [ ] `removeVisualElements`で文字コンテナ内のテキストが保護されている
- [ ] 階層別に削除対象が適切に判定されている
- [ ] テキストオブジェクトに適切な名前（`name`プロパティ）が設定されている

#### 4. パフォーマンスの確認
- [ ] 早期リターンが実装されている（可視範囲外の場合など）
- [ ] 毎フレーム新規オブジェクト作成を避けている
- [ ] 重い処理に条件分岐がある

#### 5. テスト確認項目
- [ ] エフェクトを有効にして長時間実行してもフィルターが蓄積しない
- [ ] デバッグコンソールが過剰なログで埋まらない
- [ ] シャドウ・グローエフェクトが正常に動作する
- [ ] 文字が期待通りに表示される

---

## まとめ

このガイドでは、UTAVISTA v0.4.2における包括的なテンプレート実装手順を説明しました。

### 重要なポイント

1. **階層責任分離**: フレーズ・単語・文字の明確な役割分担
2. **パフォーマンス最適化**: 早期リターン、オブジェクトプール、条件付きレンダリング
3. **エラーハンドリング**: 多層フォールバックシステム
4. **パラメータ管理**: 型安全なパラメータアクセス
5. **JSON駆動登録**: 動的なテンプレート登録システム
6. **システム機能統一性**: フォント選択などの既存機能と一貫性のある実装
7. **失敗事例からの学習**: よくある問題とその対策

### 次のステップ

1. このガイドを参考に基本テンプレートを作成
2. 既存テンプレートを参考に機能を拡張
3. 失敗事例を確認して問題を回避
4. **システム機能確認**: フォント選択、パラメータ表示等の既存機能との整合性チェック
5. パフォーマンス測定とデバッグ
6. テンプレートレジストリへの登録とテスト

高品質なテンプレート実装により、UTAVISTAの表現力を大幅に向上させることができます。