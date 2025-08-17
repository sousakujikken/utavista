# 新プリミティブAPI仕様書 v2.0

## 概要

本仕様書は、階層分離型プリミティブアーキテクチャにおける各プリミティブクラスの詳細API仕様を定義します。すべてのプリミティブは単一階層責任原則に基づいて設計されています。

## 共通インターフェース

### BasePrimitive Interface

```typescript
interface BasePrimitive {
  readonly name: string;
  readonly version: string;
  readonly supportedHierarchy: HierarchyType;
}

interface CalculationParams {
  nowMs: number;
  startMs: number;
  endMs: number;
  phase: AnimationPhase;
  params: Record<string, unknown>;
}

interface Position {
  x: number;
  y: number;
  alpha?: number;
}
```

## 位置計算プリミティブ群

### 1. PhrasePositionPrimitive

**責任範囲**: フレーズレベルの位置計算専用

```typescript
interface PhrasePositionParams extends CalculationParams {
  text: string;
  phraseOffsetX: number;
  phraseOffsetY: number;
  fontSize: number;
  lineHeight: number;
  headTime: number;
  tailTime: number;
}

interface RandomPlacementParams extends PhrasePositionParams {
  randomPlacement: boolean;
  randomSeed: number;
  randomRangeX: number;
  randomRangeY: number;
  minDistanceFromPrevious: number;
  phraseId: string;
}

class PhrasePositionPrimitive implements BasePrimitive {
  readonly name = 'PhrasePosition';
  readonly version = '2.0.0';
  readonly supportedHierarchy = 'phrase';
  
  /**
   * 静的フレーズ位置を計算
   * 用途: フェード・ブラー系テンプレート
   */
  calculateStatic(params: PhrasePositionParams): Position {
    const screenWidth = this.getScreenWidth();
    const screenHeight = this.getScreenHeight();
    
    return {
      x: screenWidth / 2 + params.phraseOffsetX,
      y: screenHeight / 2 + params.phraseOffsetY,
      alpha: this.calculateFadeAlpha(params)
    };
  }
  
  /**
   * スライド配置位置を計算  
   * 用途: スライドアニメーション系テンプレート
   */
  calculateSlide(params: PhrasePositionParams): Position {
    const staticPosition = this.calculateStatic(params);
    const slideOffset = this.calculateSlideOffset(params);
    
    return {
      x: staticPosition.x + slideOffset.x,
      y: staticPosition.y + slideOffset.y,
      alpha: staticPosition.alpha
    };
  }
  
  /**
   * ランダム配置位置を計算
   * 用途: ランダム配置系テンプレート
   */
  calculateRandom(params: RandomPlacementParams): Position {
    const basePosition = this.calculateStatic(params);
    const randomOffset = this.generateRandomOffset(params);
    
    return {
      x: basePosition.x + randomOffset.x,
      y: basePosition.y + randomOffset.y,
      alpha: basePosition.alpha
    };
  }
  
  private calculateFadeAlpha(params: PhrasePositionParams): number {
    // フレーズレベルのフェードアウト計算
    const fadeOutStartTime = params.endMs;
    const fadeOutEndTime = params.endMs + params.tailTime;
    
    if (params.nowMs > fadeOutEndTime) return 0;
    if (params.nowMs < fadeOutStartTime) return 1;
    
    const progress = (params.nowMs - fadeOutStartTime) / params.tailTime;
    return 1 - progress;
  }
}
```

### 2. WordPositionPrimitive

**責任範囲**: 単語レベルの位置計算専用

```typescript
interface WordPositionParams extends CalculationParams {
  wordIndex: number;
  fontSize: number;
  lineHeight: number;
  headTime: number;
}

interface WordSlideParams extends WordPositionParams {
  entranceInitialSpeed: number;
  activeSpeed: number;
  rightOffset: number;
}

class WordPositionPrimitive implements BasePrimitive {
  readonly name = 'WordPosition';
  readonly version = '2.0.0';
  readonly supportedHierarchy = 'word';
  
  /**
   * 静的単語位置を計算
   * 用途: フェード・ブラー系、フレーズ同期系
   */
  calculateStatic(params: WordPositionParams): Position {
    // 単語インデックスに基づく垂直配置
    const yOffset = params.wordIndex * params.fontSize * params.lineHeight;
    
    return {
      x: 0,
      y: yOffset,
      alpha: 1.0
    };
  }
  
  /**
   * スライドアニメーション位置を計算
   * 用途: スライド系テンプレート
   */
  calculateSlide(params: WordSlideParams): Position {
    const staticPosition = this.calculateStatic(params);
    const slideAnimation = this.calculateSlideAnimation(params);
    
    return {
      x: slideAnimation.x,
      y: staticPosition.y + slideAnimation.y,
      alpha: slideAnimation.alpha
    };
  }
  
  /**
   * 累積配置位置を計算
   * 用途: 特殊な累積レイアウト
   */
  calculateCumulative(params: WordPositionParams): Position {
    // 前の単語からの累積オフセット
    const cumulativeOffset = this.calculateCumulativeOffset(params);
    
    return {
      x: cumulativeOffset.x,
      y: cumulativeOffset.y,
      alpha: 1.0
    };
  }
  
  private calculateSlideAnimation(params: WordSlideParams): Position & { alpha: number } {
    const wordStartMs = params.startMs;
    const wordInStartMs = wordStartMs - params.headTime;
    
    // 入場アニメーションの計算
    if (params.nowMs < wordInStartMs) {
      return { x: params.rightOffset, y: 0, alpha: 0 };
    }
    
    if (params.nowMs < wordStartMs) {
      const entranceProgress = (params.nowMs - wordInStartMs) / params.headTime;
      const easedProgress = this.easeOutCubic(entranceProgress);
      
      return {
        x: params.rightOffset * (1 - easedProgress),
        y: 0,
        alpha: easedProgress
      };
    }
    
    // アクティブ期間の微細な動き
    const activeOffset = this.calculateActiveMovement(params);
    return {
      x: activeOffset.x,
      y: activeOffset.y,
      alpha: 1.0
    };
  }
}
```

### 3. CharacterPositionPrimitive

**責任範囲**: 文字レベルの相対位置計算

```typescript
interface CharacterPositionParams extends CalculationParams {
  charIndex: number;
  totalChars: number;
  char: string;
  fontSize: number;
}

class CharacterPositionPrimitive implements BasePrimitive {
  readonly name = 'CharacterPosition';
  readonly version = '2.0.0';
  readonly supportedHierarchy = 'character';
  
  /**
   * 個別文字位置を計算
   * 用途: 文字ごとのアニメーション
   */
  calculateIndividual(params: CharacterPositionParams): Position {
    // 文字レベルの微細なアニメーション位置調整
    const baseOffset = this.calculateBaseOffset(params);
    const animationOffset = this.calculateAnimationOffset(params);
    
    return {
      x: baseOffset.x + animationOffset.x,
      y: baseOffset.y + animationOffset.y,
      alpha: this.calculateCharacterAlpha(params)
    };
  }
  
  /**
   * 相対文字位置を計算
   * 用途: 文字間の相対的な位置調整
   */
  calculateRelative(params: CharacterPositionParams): Position {
    const relativeOffset = this.calculateRelativeOffset(params);
    
    return {
      x: relativeOffset.x,
      y: relativeOffset.y,
      alpha: 1.0
    };
  }
}
```

## レイアウト管理プリミティブ

### CharacterLayoutPrimitive

**責任範囲**: 単語内文字コンテナの配置とレイアウト管理（単語レベル処理は除外）

```typescript
interface CharacterLayoutParams {
  chars: FlexibleCharacterData[];
  charSpacing: number;
  fontSize: number;
  halfWidthSpacingRatio: number;
  wordSpacing: number;
  lineHeight: number;
  containerPrefix: string;
}

interface LayoutResult {
  id: string;
  position: Position;
  container: PIXI.Container;
}

interface CharacterLayoutResult {
  success: boolean;
  layoutResults: LayoutResult[];
  wordLayoutInfo: WordLayoutInfo[];
  warnings: string[];
}

class CharacterLayoutPrimitive implements BasePrimitive {
  readonly name = 'CharacterLayout';
  readonly version = '2.0.0';
  readonly supportedHierarchy = 'character';
  
  /**
   * 単語内文字レイアウト
   * 用途: 単語コンテナ内での文字配置
   * 注意: 単語レベル処理は上位層（WordPositionPrimitive）で実行済み
   */
  layoutIndividual(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    
    // 文字レベル処理のみ実行（単語は既に分離済み前提）
    let charXOffset = 0;
    
    params.chars.forEach((charData) => {
      const container = this.getOrCreateContainer(wordContainer, charData, params);
      const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);
      
      container.position.set(charXOffset, 0);
      
      results.push({
        id: charData.id,
        position: { x: charXOffset, y: 0 },
        container
      });
      
      if (animationCallback) {
        animationCallback(container, charData);
      }
      
      charXOffset += params.fontSize * effectiveSpacing;
    });
    
    return {
      success: true,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results),
      warnings: []
    };
  }
  
  /**
   * 累積フレーズレイアウト
   * 用途: GlitchText系テンプレート
   */
  layoutCumulative(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    
    // フレーズ全体でcharIndexを使用した累積配置
    params.chars.forEach((charData) => {
      const container = this.getOrCreateContainer(wordContainer, charData, params);
      const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);
      
      const xOffset = charData.charIndex * params.fontSize * effectiveSpacing;
      container.position.set(xOffset, 0);
      
      results.push({
        id: charData.id,
        position: { x: xOffset, y: 0 },
        container
      });
      
      if (animationCallback) {
        animationCallback(container, charData);
      }
    });
    
    return {
      success: true,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results),
      warnings: []
    };
  }
  
  /**
   * 改行レイアウト
   * 用途: 縦書き系テンプレート
   */
  layoutNewLine(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    const wordsMap = this.groupCharactersByWord(params.chars);
    
    let currentLineY = 0;
    
    wordsMap.forEach((wordChars) => {
      let wordXOffset = 0;
      
      wordChars.forEach((charData) => {
        const container = this.getOrCreateContainer(wordContainer, charData, params);
        const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);
        
        container.position.set(wordXOffset, currentLineY);
        
        results.push({
          id: charData.id,
          position: { x: wordXOffset, y: currentLineY },
          container
        });
        
        if (animationCallback) {
          animationCallback(container, charData);
        }
        
        wordXOffset += params.fontSize * effectiveSpacing;
      });
      
      // 次の行に移動
      currentLineY += params.fontSize * params.lineHeight;
    });
    
    return {
      success: true,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results),
      warnings: []
    };
  }
  
  /**
   * スペーシングレイアウト
   * 用途: 単語間スペース付きテンプレート
   */
  layoutSpacing(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    const wordsMap = this.groupCharactersByWord(params.chars);
    
    let cumulativeXOffset = 0;
    
    wordsMap.forEach((wordChars, wordIndex) => {
      wordChars.forEach((charData) => {
        const container = this.getOrCreateContainer(wordContainer, charData, params);
        const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);
        
        container.position.set(cumulativeXOffset, 0);
        
        results.push({
          id: charData.id,
          position: { x: cumulativeXOffset, y: 0 },
          container
        });
        
        if (animationCallback) {
          animationCallback(container, charData);
        }
        
        cumulativeXOffset += params.fontSize * effectiveSpacing;
      });
      
      // 単語間スペースを追加
      cumulativeXOffset += params.fontSize * params.wordSpacing;
    });
    
    return {
      success: true,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results),
      warnings: []
    };
  }
}
```

## エフェクト適用プリミティブ群

### BlurEffectPrimitive

```typescript
interface BlurEffectParams {
  enableBlur: boolean;
  blurStrength: number;
  blurFadeType: 'sync_with_alpha' | 'inverse_alpha' | 'independent';
  fadeInDuration: number;
  fadeOutDuration: number;
  currentAlpha: number;
  nowMs: number;
  startMs: number;
  endMs: number;
}

class BlurEffectPrimitive implements BasePrimitive {
  readonly name = 'BlurEffect';
  readonly version = '2.0.0';
  readonly supportedHierarchy = 'character';
  
  /**
   * ブラーエフェクトを適用
   */
  apply(target: PIXI.DisplayObject, params: BlurEffectParams): void {
    if (!params.enableBlur) {
      this.remove(target);
      return;
    }
    
    const blurStrength = this.calculateBlurStrength(params);
    
    if (blurStrength > 0.1) {
      const blurFilter = new PIXI.BlurFilter();
      blurFilter.blur = blurStrength;
      
      target.filters = [blurFilter];
      
      // 適切なフィルターエリアを設定
      if (target instanceof PIXI.Text) {
        const bounds = target.getBounds();
        const padding = Math.ceil(blurStrength * 2);
        target.filterArea = new PIXI.Rectangle(
          bounds.x - padding,
          bounds.y - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2
        );
      }
    } else {
      this.remove(target);
    }
  }
  
  remove(target: PIXI.DisplayObject): void {
    if (target.filters) {
      target.filters.forEach(filter => {
        if (filter && typeof filter.destroy === 'function') {
          filter.destroy();
        }
      });
    }
    target.filters = null;
    target.filterArea = null;
  }
}
```

### GlitchEffectPrimitive

```typescript
interface GlitchEffectParams {
  enableGlitch: boolean;
  glitchBlockSize: number;
  glitchThreshold: number;
  glitchIntensity: number;
  glitchFrequency: number;
  randomSeed: number;
}

class GlitchEffectPrimitive implements BasePrimitive {
  readonly name = 'GlitchEffect';
  readonly version = '2.0.0';
  readonly supportedHierarchy = 'character';
  
  /**
   * グリッチエフェクトを適用
   */
  apply(target: PIXI.DisplayObject, params: GlitchEffectParams): void {
    if (!params.enableGlitch) {
      this.remove(target);
      return;
    }
    
    // ピクセルブロック基準のグリッチ処理
    const glitchFilter = this.createGlitchFilter(params);
    target.filters = [glitchFilter];
    
    // グリッチエリア設定
    if (target instanceof PIXI.Text) {
      const bounds = target.getBounds();
      const blockPadding = params.glitchBlockSize * 2;
      target.filterArea = new PIXI.Rectangle(
        bounds.x - blockPadding,
        bounds.y - blockPadding,
        bounds.width + blockPadding * 2,
        bounds.height + blockPadding * 2
      );
    }
  }
  
  remove(target: PIXI.DisplayObject): void {
    if (target.filters) {
      target.filters.forEach(filter => {
        if (filter && typeof filter.destroy === 'function') {
          filter.destroy();
        }
      });
    }
    target.filters = null;
    target.filterArea = null;
  }
  
  private createGlitchFilter(params: GlitchEffectParams): PIXI.Filter {
    // グリッチフィルターの実装
    return new PIXI.Filter(/* glitch shader */);
  }
}
```

## 基底クラス仕様

### HierarchicalAnimationTemplate

```typescript
abstract class HierarchicalAnimationTemplate implements IAnimationTemplate {
  // プリミティブインスタンス (継承クラスで初期化)
  protected abstract readonly phrasePositioning: PhrasePositionPrimitive;
  protected abstract readonly wordPositioning: WordPositionPrimitive;
  protected abstract readonly characterLayout: CharacterLayoutPrimitive;
  
  // 標準実装 (オーバーライド禁止)
  final renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    // プリミティブ直接使用による位置計算
    const position = this.phrasePositioning.calculateStatic({
      text, params, nowMs, startMs, endMs, phase,
      phraseOffsetX: params.phraseOffsetX as number || 0,
      phraseOffsetY: params.phraseOffsetY as number || 0,
      fontSize: params.fontSize as number || 120,
      lineHeight: params.lineHeight as number || 1.2,
      headTime: params.headTime as number || 800,
      tailTime: params.tailTime as number || 800
    });
    
    container.position.set(position.x, position.y);
    container.alpha = position.alpha || 1.0;
    
    return this.customPhraseRendering(container, text, params, nowMs, startMs, endMs, phase);
  }
  
  final renderWordContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    // プリミティブ直接使用による位置計算
    const position = this.wordPositioning.calculateStatic({
      wordIndex: params.wordIndex as number || 0,
      fontSize: params.fontSize as number || 120,
      lineHeight: params.lineHeight as number || 1.2,
      headTime: params.headTime as number || 800,
      nowMs, startMs, endMs, phase, params
    });
    
    container.position.set(position.x, position.y);
    container.alpha = position.alpha || 1.0;
    
    // 標準的な文字レイアウト処理
    this.performCharacterLayout(container, params);
    
    return this.customWordRendering(container, text, params, nowMs, startMs, endMs, phase);
  }
  
  final renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    return this.customCharRendering(container, text, params, nowMs, startMs, endMs, phase);
  }
  
  // テンプレート固有実装 (必須実装)
  protected abstract customPhraseRendering(...): boolean;
  protected abstract customWordRendering(...): boolean;
  protected abstract customCharRendering(...): boolean;
  
  // 文字レイアウト処理 (継承クラスでオーバーライド可能)
  protected performCharacterLayout(container: PIXI.Container, params: Record<string, unknown>): void {
    // デフォルト実装: layoutIndividualを使用
    this.characterLayout.layoutIndividual(container, {
      chars: params.chars as FlexibleCharacterData[] || [],
      charSpacing: params.charSpacing as number || 1.0,
      fontSize: params.fontSize as number || 120,
      halfWidthSpacingRatio: params.halfWidthSpacingRatio as number || 0.5,
      wordSpacing: params.wordSpacing as number || 0.3,
      lineHeight: params.lineHeight as number || 1.2,
      containerPrefix: 'char_container_'
    }, (charContainer, charData) => {
      this.animateContainer(charContainer, charData.char, params, 0, 0, 1000, 'active');
    });
  }
}
```

## プリミティブファクトリー

### シングルトンインスタンス管理

```typescript
/**
 * メモリ効率化のためのプリミティブファクトリー
 */
class PrimitiveFactory {
  private static phrasePositionInstance: PhrasePositionPrimitive;
  private static wordPositionInstance: WordPositionPrimitive;
  private static characterLayoutInstance: CharacterLayoutPrimitive;
  
  static getPhrasePositionPrimitive(): PhrasePositionPrimitive {
    if (!this.phrasePositionInstance) {
      this.phrasePositionInstance = new PhrasePositionPrimitive();
    }
    return this.phrasePositionInstance;
  }
  
  static getWordPositionPrimitive(): WordPositionPrimitive {
    if (!this.wordPositionInstance) {
      this.wordPositionInstance = new WordPositionPrimitive();
    }
    return this.wordPositionInstance;
  }
  
  static getCharacterLayoutPrimitive(): CharacterLayoutPrimitive {
    if (!this.characterLayoutInstance) {
      this.characterLayoutInstance = new CharacterLayoutPrimitive();
    }
    return this.characterLayoutInstance;
  }
}
```

この仕様に基づいて実装されたプリミティブは、単一責任原則を満たし、階層を跨いだ責任の混乱を根本的に防止します。