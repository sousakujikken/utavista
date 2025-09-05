# UTAVISTA テンプレート API リファレンス v0.4.3

このドキュメントは、UTAVISTAでアニメーションテンプレートを開発するために必要なAPIと機能を体系的にまとめたリファレンスです。

## 目次

1. [コア API 概要](#コア-api-概要)
2. [テンプレートインターフェース](#テンプレートインターフェース)
3. [エンジン API](#エンジン-api)
4. [PIXI.js オブジェクト API](#pixijs-オブジェクト-api)
5. [フォント処理 API](#フォント処理-api)
6. [パラメータ管理 API](#パラメータ管理-api)
7. [ユーティリティ API](#ユーティリティ-api)
8. [アニメーション パターン](#アニメーション-パターン)
9. [パフォーマンス最適化](#パフォーマンス最適化)

---

## コア API 概要

### システムアーキテクチャ

UTAVISTA は以下の階層構造でアニメーションを管理します：

```
PIXI.Application.stage
├── backgroundLayer
└── mainContainer (InstanceManager が管理)
    ├── phrase_container_0 (フレーズレベル)
    │   ├── word_container_0_0 (単語レベル)
    │   │   ├── char_container_0_0_0 (文字レベル)
    │   │   └── char_container_0_0_1
    │   └── word_container_0_1
    └── phrase_container_1
```

### 責任分離原則

| レベル | 責任 | 描画ルールl |
|--------|------|------------|
| **Phrase** | フレーズ全体の移動・フェード・グローバルエフェクト | ❌ テキスト描画禁止 |
| **Word** | 文字配置管理・単語間の連続性（`charIndex`使用） | ❌ テキスト描画禁止 |
| **Character** | 実際のテキスト描画・個別エフェクト | ✅ テキスト描画のみ |

---

## テンプレートインターフェース

### IAnimationTemplate インターフェース

```typescript
interface IAnimationTemplate {
  metadata?: {
    license?: string;
    licenseUrl?: string;
    originalAuthor?: string;
  };
  
  // === 必須メソッド ===
  
  /** メインルーティングメソッド */
  animateContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,  // 'phrase' | 'word' | 'char'
    phase: AnimationPhase          // 'in' | 'active' | 'out'
  ): boolean;
  
  /** フレーズレベルレンダリング */
  renderPhraseContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean;
  
  /** 単語レベルレンダリング */
  renderWordContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean;
  
  /** 文字レベルレンダリング */
  renderCharContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean;
  
  /** 視覚要素のクリーンアップ */
  removeVisualElements(container: PIXI.Container): void;
  
  /** パラメータ設定（v0.4.3では非推奨、ParameterRegistry使用） */
  getParameterConfig?(): ParameterConfig[];
}
```

### 基本実装パターン

```typescript
export class MyTemplate implements IAnimationTemplate {
  metadata = {
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: "Developer Name"
  };

  animateContainer(container, text, params, nowMs, startMs, endMs, hierarchyType, phase) {
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

  removeVisualElements(container: PIXI.Container): void {
    const childrenToRemove: PIXI.DisplayObject[] = [];
    container.children.forEach(child => {
      // PIXI.Container は保持（階層構造維持）
      if (!(child instanceof PIXI.Container)) {
        childrenToRemove.push(child);
      }
    });
    childrenToRemove.forEach(child => {
      container.removeChild(child);
      child.destroy();
    });
  }
}
```

---

## エンジン API

### Engine クラス

```typescript
class Engine {
  /** PIXIアプリケーションインスタンス */
  app: PIXI.Application;
  
  /** テンプレート割り当て */
  assignTemplate(objectId: string, templateId: string): void;
  
  /** 一括テンプレート割り当て */
  batchAssignTemplate(objectIds: string[], templateId: string, recursive: boolean): void;
  
  /** パラメータ更新 */
  updateParameters(objectId: string, params: Record<string, any>): void;
  
  /** アニメーション再生制御 */
  play(): void;
  pause(): void;
  stop(): void;
  setTime(timeMs: number): void;
}
```

### InstanceManager API

```typescript
class InstanceManager {
  /** フレーズコンテナ作成 */
  createPhraseInstance(phrase: PhraseUnit): PIXI.Container;
  
  /** 単語コンテナ作成 */
  createWordInstance(word: WordUnit): PIXI.Container;
  
  /** 文字コンテナ作成 */
  createCharInstance(char: CharUnit): PIXI.Container;
  
  /** コンテナ取得 */
  getContainer(objectId: string): PIXI.Container | null;
}
```

### グローバルアクセス

```typescript
// PIXIアプリケーションへのグローバルアクセス
const pixiApp = (window as any).__PIXI_APP__ as PIXI.Application;
```

---

## PIXI.js オブジェクト API

### Container API

```typescript
class PIXI.Container {
  // === 基本プロパティ ===
  position: PIXI.Point;          // 位置
  scale: PIXI.Point;             // スケール
  rotation: number;              // 回転（ラジアン）
  alpha: number;                 // 透明度 (0-1)
  visible: boolean;              // 表示/非表示
  name: string;                  // コンテナ名
  
  // === 子オブジェクト管理 ===
  addChild(child: PIXI.DisplayObject): void;
  removeChild(child: PIXI.DisplayObject): void;
  getChildByName(name: string): PIXI.DisplayObject | null;
  children: PIXI.DisplayObject[];
  
  // === 座標変換 ===
  updateTransform(): void;       // 変換マトリックス更新
  toLocal(position: PIXI.Point): PIXI.Point;
  toGlobal(position: PIXI.Point): PIXI.Point;
  
  // === フィルター ===
  filters: PIXI.Filter[] | null;
}
```

### Text API

```typescript
class PIXI.Text extends PIXI.Sprite {
  text: string;                  // 表示テキスト
  style: PIXI.TextStyle;         // テキストスタイル
  anchor: PIXI.Point;            // アンカーポイント
  tint: number;                  // 色合い (0xFFFFFF形式)
  
  constructor(text: string, style?: PIXI.TextStyle);
}

class PIXI.TextStyle {
  constructor(options: {
    fontFamily?: string;
    fontSize?: number;
    fill?: string | number;
    align?: 'left' | 'center' | 'right';
    fontWeight?: string;
    fontStyle?: string;
    stroke?: string | number;
    strokeThickness?: number;
    dropShadow?: boolean;
    dropShadowColor?: string | number;
    dropShadowBlur?: number;
    dropShadowAngle?: number;
    dropShadowDistance?: number;
  });
}
```

### Graphics API

```typescript
class PIXI.Graphics extends PIXI.Container {
  // === 描画開始/終了 ===
  beginFill(color: number, alpha?: number): void;
  endFill(): void;
  clear(): void;
  
  // === 形状描画 ===
  drawRect(x: number, y: number, width: number, height: number): void;
  drawCircle(x: number, y: number, radius: number): void;
  drawEllipse(x: number, y: number, width: number, height: number): void;
  drawPolygon(points: number[] | PIXI.Point[]): void;
  
  // === 線描画 ===
  lineStyle(width: number, color: number, alpha?: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
}
```

### Filter API

```typescript
// グローエフェクト
import { AdvancedBloomFilter } from 'pixi-filters';

const bloomFilter = new AdvancedBloomFilter({
  threshold: number;      // 発光閾値
  bloomScale: number;     // 発光強度
  brightness: number;     // 明度
  blur: number;          // ブラー半径
  quality: number;       // 品質
});

// ドロップシャドウ
class PIXI.filters.DropShadowFilter {
  constructor(options: {
    rotation?: number;     // 影の角度
    distance?: number;     // 影の距離
    color?: number;        // 影の色
    alpha?: number;        // 影の透明度
    shadowOnly?: boolean;  // 影のみ表示
    blur?: number;         // ブラー半径
    quality?: number;      // 品質
  });
}
```

---

## フォント処理 API

### FontService API

```typescript
class FontService {
  /** 初期化（アプリ起動時に必須） */
  static initialize(): Promise<void>;
  
  /** 利用可能フォント一覧取得 */
  static getAvailableFonts(): Array<{value: string, label: string}>;
  
  /** フォントファミリー一覧取得 */
  static getFontFamilies(): string[];
  
  /** フォント利用可能性チェック */
  static isAvailable(fontFamily: string): boolean;
  
  /** デフォルトフォント取得 */
  static getDefaultFont(): string;
  
  /** フォント読み込み確認 */
  static ensureFontLoaded(fontFamily: string): Promise<boolean>;
  
  /** ピックアップフォント設定 */
  static updatePickedFonts(selectedFonts: string[], showAllFonts: boolean): void;
  
  /** ピックアップ設定取得 */
  static getPickedFontsSettings(): {selectedFonts: string[], showAllFonts: boolean};
}
```

### TextStyleFactory API

```typescript
class TextStyleFactory {
  /** 標準テキスト作成 */
  static createText(text: string, options: TextStyleOptions): PIXI.Text;
  
  /** 高DPIテキスト作成 */
  static createHighDPIText(text: string, options: TextStyleOptions): PIXI.Text;
  
  /** エクスポート用テキスト作成 */
  static createExportText(
    text: string, 
    options: TextStyleOptions, 
    width: number, 
    height: number
  ): PIXI.Text;
  
  /** テキストスタイル作成 */
  static createTextStyle(options: TextStyleOptions): PIXI.TextStyle;
}

interface TextStyleOptions {
  fontFamily?: string;
  fontSize?: number;
  fill?: string | number;
  fontWeight?: string;
  fontStyle?: string;
  align?: 'left' | 'center' | 'right';
  stroke?: string | number;
  strokeThickness?: number;
}
```

### フォントパラメータの定義

```typescript
// テンプレートでのフォントパラメータ定義例
getParameterConfig(): ParameterConfig[] {
  return [
    { 
      name: "fontFamily", 
      type: "string",
      default: "Arial",
      get options() {
        return FontService.getAvailableFonts();
      },
      description: "フォントファミリー"
    },
    {
      name: "fontSize",
      type: "number",
      default: 32,
      min: 12,
      max: 256,
      step: 1,
      description: "フォントサイズ"
    }
  ];
}
```

---

## パラメータ管理 API

### ParameterRegistry API (v0.4.3+)

```typescript
class ParameterRegistry {
  /** パラメータ登録 */
  static registerParameter(config: ParameterDefinition): void;
  
  /** パラメータ取得 */
  static getParameter(name: string): ParameterDefinition | null;
  
  /** 全パラメータ取得 */
  static getAllParameters(): Map<string, ParameterDefinition>;
  
  /** テンプレート固有パラメータ取得 */
  static getTemplateParameters(templateId: string): ParameterDefinition[];
  
  /** パラメータ検証 */
  static validateParameter(name: string, value: any): boolean;
}

interface ParameterDefinition {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'color' | 'font';
  category: 'standard' | 'template-specific';
  templateId?: string;       // template-specificの場合必須
  defaultValue: any;
  min?: number;             // number型の場合
  max?: number;             // number型の場合
  options?: any[];          // 選択肢がある場合
  description?: string;
}
```

### 標準パラメータ一覧

```typescript
// 基本文字スタイル
fontSize: number = 32;
fontFamily: string = "Arial";
fontWeight: string = "normal";
textColor: string = "#FFFFFF";
activeTextColor: string = "#FF0000";
completedTextColor: string = "#808080";

// レイアウト
offsetX: number = 0;
offsetY: number = 0;
letterSpacing: number = 0;
lineHeight: number = 150;

// グロー効果
enableGlow: boolean = false;
glowStrength: number = 1.5;
glowBrightness: number = 1.2;
glowBlur: number = 6;
glowQuality: number = 8;
glowPadding: number = 50;

// シャドウ効果
enableShadow: boolean = false;
shadowBlur: number = 6;
shadowColor: string = "#000000";
shadowAngle: number = 45;
shadowDistance: number = 5;

// アニメーション・タイミング
headTime: number = 500;
tailTime: number = 500;

// デバッグ
debugMode: boolean = false;
```

### パラメータアクセスパターン

```typescript
// 安全なパラメータアクセス
private getParam<T>(params: Record<string, any>, key: string, defaultValue: T): T {
  return params[key] ?? defaultValue;
}

// 使用例
const fontSize = this.getParam(params, 'fontSize', 32);
const enableGlow = this.getParam(params, 'enableGlow', false);
const glowColor = this.getParam(params, 'glowColor', '#FFFF00');
```

---

## ユーティリティ API

### 色処理

```typescript
// 色文字列を16進数に変換
private parseColor(colorString: string): number {
  return parseInt(colorString.replace('#', ''), 16);
}

// 色補間
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
```

### イージング関数

```typescript
// 基本イージング関数
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutBounce(t: number): number {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  } else if (t < 2.5 / 2.75) {
    return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  } else {
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
}
```

### 文字・単語位置計算

```typescript
// 文字位置計算
private calculateCharacterPosition(params: Record<string, any>, text: string): {x: number, y: number} {
  const charIndex = this.getParam(params, 'charIndex', 0);
  const fontSize = this.getParam(params, 'fontSize', 32);
  const letterSpacing = this.getParam(params, 'letterSpacing', 0);
  
  const baseX = charIndex * (fontSize * 0.6 + letterSpacing);
  const lineNumber = this.getParam(params, 'lineNumber', 0);
  const baseY = lineNumber * fontSize * 1.2;
  
  return { x: baseX, y: baseY };
}

// 単語境界判定
private isWordBoundary(char: string, nextChar?: string): boolean {
  const isSpaceChar = /\s/.test(char);
  const isPunctuation = /[。、！？,.!?]/.test(char);
  const isEndOfText = !nextChar;
  
  return isSpaceChar || isPunctuation || isEndOfText;
}
```

---

## アニメーション パターン

### フェーズベースアニメーション

```typescript
renderCharContainer(container, text, params, nowMs, startMs, endMs, phase) {
  const duration = endMs - startMs;
  const progress = Math.max(0, Math.min(1, (nowMs - startMs) / duration));
  
  let textObj = container.getChildByName('text') as PIXI.Text;
  if (!textObj) {
    textObj = TextStyleFactory.createText(text, this.createTextStyle(params));
    textObj.name = 'text';
    textObj.anchor.set(0.5);
    container.addChild(textObj);
  }
  
  // フェーズ別処理
  switch (phase) {
    case 'in':
      // 入場アニメーション
      textObj.alpha = progress;
      textObj.scale.set(0.5 + 0.5 * progress);
      textObj.tint = this.interpolateColor('#808080', '#FFFFFF', progress);
      break;
      
    case 'active':
      // アクティブ状態
      textObj.alpha = 1;
      textObj.scale.set(1);
      textObj.tint = this.parseColor('#FF0000');
      break;
      
    case 'out':
      // 退場アニメーション
      textObj.alpha = 1 - progress;
      textObj.tint = this.interpolateColor('#FF0000', '#808080', progress);
      break;
  }
  
  return true;
}
```

### 時間ベースエフェクト

```typescript
// 点滅エフェクト
private applyFlickerEffect(textObj: PIXI.Text, nowMs: number, params: Record<string, any>): void {
  const flickerSpeed = this.getParam(params, 'flickerSpeed', 1.0);
  const flickerIntensity = this.getParam(params, 'flickerIntensity', 0.5);
  
  const flickerTime = (nowMs * flickerSpeed) / 1000;
  const flickerValue = Math.sin(flickerTime * Math.PI * 2) * flickerIntensity;
  
  textObj.alpha = Math.max(0.1, 1 - Math.abs(flickerValue));
}

// 波動エフェクト
private applyWaveEffect(container: PIXI.Container, nowMs: number, params: Record<string, any>): void {
  const waveSpeed = this.getParam(params, 'waveSpeed', 1.0);
  const waveAmplitude = this.getParam(params, 'waveAmplitude', 10);
  const charIndex = this.getParam(params, 'charIndex', 0);
  
  const time = (nowMs * waveSpeed) / 1000;
  const offset = Math.sin(time + charIndex * 0.5) * waveAmplitude;
  
  container.y += offset;
}
```

### 決定論的ランダム生成

```typescript
// 文字ID別固定ランダム値生成
private generateCharacterRandom(charId: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < charId.length; i++) {
    hash = ((hash << 5) - hash) + charId.charCodeAt(i);
    hash = hash & hash; // 32bit integer変換
  }
  
  // 0-1の範囲の擬似ランダム生成
  const rng = Math.abs(hash) + 1;
  return (rng % 10000) / 10000;
}

// 使用例
const charId = params.id || `char_${startMs}_${text}`;
const randomSeed = this.getParam(params, 'randomSeed', 12345);
const randomValue = this.generateCharacterRandom(charId, randomSeed);
const offsetX = (randomValue - 0.5) * 40; // -20 to +20の固定オフセット
```

---

## パフォーマンス最適化

### 早期リターン最適化

```typescript
renderCharContainer(container, text, params, nowMs, startMs, endMs, phase) {
  // 表示範囲外チェック
  const headTime = this.getParam(params, 'headTime', 500);
  const tailTime = this.getParam(params, 'tailTime', 500);
  
  if (nowMs < startMs - headTime || nowMs > endMs + tailTime) {
    container.visible = false;
    return true; // 処理成功だが描画不要
  }
  
  container.visible = true;
  
  // 実際のレンダリング処理
  // ...
  
  return true;
}
```

### オブジェクトプール

```typescript
class MyTemplate {
  private static graphicsPool: PIXI.Graphics[] = [];
  
  private getGraphicsFromPool(): PIXI.Graphics {
    if (MyTemplate.graphicsPool.length > 0) {
      const graphics = MyTemplate.graphicsPool.pop()!;
      graphics.clear();
      return graphics;
    }
    return new PIXI.Graphics();
  }
  
  private returnGraphicsToPool(graphics: PIXI.Graphics): void {
    graphics.clear();
    graphics.visible = false;
    MyTemplate.graphicsPool.push(graphics);
  }
}
```

### フレームレート最適化

```typescript
private lastUpdateTime = 0;

private shouldUpdateThisFrame(nowMs: number): boolean {
  const updateInterval = 1000 / 60; // 60fps
  if (nowMs - this.lastUpdateTime >= updateInterval) {
    this.lastUpdateTime = nowMs;
    return true;
  }
  return false;
}
```

### パフォーマンス監視

```typescript
private performanceMonitor = {
  renderTimes: [] as number[],
  
  startTiming(): number {
    return performance.now();
  },
  
  endTiming(startTime: number, operation: string): void {
    const duration = performance.now() - startTime;
    this.renderTimes.push(duration);
    
    if (this.renderTimes.length > 100) {
      this.renderTimes.shift();
    }
    
    if (duration > 16) { // 60fps threshold
      console.warn(`Slow ${operation}: ${duration.toFixed(2)}ms`);
    }
  },
  
  getAverageRenderTime(): number {
    return this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
  }
};
```

---

## 使用例とベストプラクティス

### 基本テンプレート実装例

```typescript
export class BasicAnimationTemplate implements IAnimationTemplate {
  metadata = {
    license: "CC-BY-4.0",
    originalAuthor: "UTAVISTA Team"
  };

  renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase) {
    // フレーズ全体のフェード
    const progress = (nowMs - startMs) / (endMs - startMs);
    
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
    
    // グローエフェクト適用
    if (this.getParam(params, 'enableGlow', false)) {
      this.applyGlowFilter(container, params);
    }
    
    return true;
  }

  renderWordContainer(container, text, params, nowMs, startMs, endMs, phase) {
    // 文字位置計算と配置
    const position = this.calculateCharacterPosition(params, text);
    container.position.set(position.x, position.y);
    return true;
  }

  renderCharContainer(container, text, params, nowMs, startMs, endMs, phase) {
    // テキストオブジェクト作成/更新
    let textObj = container.getChildByName('text') as PIXI.Text;
    if (!textObj) {
      textObj = TextStyleFactory.createText(text, this.createTextStyle(params));
      textObj.name = 'text';
      textObj.anchor.set(0.5);
      container.addChild(textObj);
    }
    
    // フェーズ別色変更
    const progress = (nowMs - startMs) / (endMs - startMs);
    switch (phase) {
      case 'in':
        textObj.tint = this.interpolateColor('#808080', '#FFFFFF', progress);
        break;
      case 'active':
        textObj.tint = this.parseColor('#FF0000');
        break;
      case 'out':
        textObj.tint = this.interpolateColor('#FF0000', '#808080', progress);
        break;
    }
    
    return true;
  }

  // ヘルパーメソッド
  private getParam<T>(params: Record<string, any>, key: string, defaultValue: T): T {
    return params[key] ?? defaultValue;
  }

  private createTextStyle(params: Record<string, any>): PIXI.TextStyle {
    return new PIXI.TextStyle({
      fontFamily: this.getParam(params, 'fontFamily', 'Arial'),
      fontSize: this.getParam(params, 'fontSize', 32),
      fill: this.getParam(params, 'textColor', '#FFFFFF')
    });
  }
}
```

このAPIリファレンスにより、テンプレート開発者は体系的にUTAVISTAの機能を理解し、効率的にテンプレートを開発できます。