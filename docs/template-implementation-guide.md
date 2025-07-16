# テンプレート実装ガイド - UTAVISTA v0.4.1

このドキュメントは、**UTAVISTA v0.4.1**で新しいアニメーションテンプレートを実装するための詳細な手順を説明します。実装済みのMultiLineText、FlickerFadeTemplate、GlitchText、WordSlideTextテンプレートの実際の実装パターンを基に、高品質なテンプレートを作成できるよう指導します。

## 目次

1. [前提知識と準備](#前提知識と準備)
2. [現行システムアーキテクチャの理解](#現行システムアーキテクチャの理解)
3. [基本構造の実装](#基本構造の実装)
4. [階層対応のアニメーション実装](#階層対応のアニメーション実装)
5. [パラメータ設定とUI生成](#パラメータ設定とUI生成)
6. [文字・単語カウント管理](#文字・単語カウント管理)
7. [PixiJSフィルタとエフェクト実装](#PixiJSフィルタとエフェクト実装)
8. [FontService統合とフォント管理](#FontService統合とフォント管理)
9. [パフォーマンス最適化技法](#パフォーマンス最適化技法)
10. [エラーハンドリングとデバッグ](#エラーハンドリングとデバッグ)
11. [テンプレートレジストリへの登録](#テンプレートレジストリへの登録)
12. [実装パターン総合ガイド](#実装パターン総合ガイド)

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
     
     // パラメータ設定
     getParameterConfig(): ParameterConfig[];
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

## パラメータ設定とUI生成

### 包括的なパラメータ設定

```typescript
getParameterConfig(): ParameterConfig[] {
  return [
    // 基本テキスト設定
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
      name: "fontFamily",
      type: "string",
      default: "Arial",
      description: "フォントファミリー"
    },
    
    // 色設定（状態別）
    {
      name: "defaultTextColor",
      type: "color",
      default: "#808080",
      description: "デフォルトテキスト色"
    },
    {
      name: "activeTextColor",
      type: "color",
      default: "#FFFFFF",
      description: "アクティブテキスト色"
    },
    {
      name: "completedTextColor",
      type: "color",
      default: "#808080",
      description: "完了テキスト色"
    },
    
    // 階層別オフセット
    {
      name: "phraseOffsetX",
      type: "number",
      default: 0,
      min: -200,
      max: 200,
      step: 1,
      description: "フレーズX座標オフセット"
    },
    {
      name: "wordOffsetX",
      type: "number",
      default: 0,
      min: -100,
      max: 100,
      step: 1,
      description: "単語X座標オフセット"
    },
    
    // エフェクト設定
    {
      name: "enableGlow",
      type: "boolean",
      default: true,
      description: "グローエフェクトの有効化"
    },
    {
      name: "glowColor",
      type: "color",
      default: "#FFFF00",
      description: "グローの色"
    },
    {
      name: "glowStrength",
      type: "number",
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.1,
      description: "グローの強度"
    },
    
    // アニメーション設定
    {
      name: "animationSpeed",
      type: "number",
      default: 1.0,
      min: 0.1,
      max: 3.0,
      step: 0.1,
      description: "アニメーション速度"
    },
    {
      name: "slideDistance",
      type: "number",
      default: 100,
      min: 0,
      max: 300,
      step: 10,
      description: "スライド距離"
    }
  ];
}
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

---

## FontService統合とフォント管理

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

## まとめ

このガイドでは、UTAVISTA v0.4.1における包括的なテンプレート実装手順を説明しました。

### 重要なポイント

1. **階層責任分離**: フレーズ・単語・文字の明確な役割分担
2. **パフォーマンス最適化**: 早期リターン、オブジェクトプール、条件付きレンダリング
3. **エラーハンドリング**: 多層フォールバックシステム
4. **パラメータ管理**: 型安全なパラメータアクセス
5. **JSON駆動登録**: 動的なテンプレート登録システム

### 次のステップ

1. このガイドを参考に基本テンプレートを作成
2. 既存テンプレートを参考に機能を拡張
3. パフォーマンス測定とデバッグ
4. テンプレートレジストリへの登録とテスト

高品質なテンプレート実装により、UTAVISTAの表現力を大幅に向上させることができます。