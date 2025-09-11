import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata, ParameterConfig } from '../types/types';
import { FlexibleCumulativeLayoutPrimitive, WordDisplayMode } from '../primitives/layout/FlexibleCumulativeLayoutPrimitive';
import { MultiLineLayoutPrimitive } from '../primitives/layout/MultiLineLayoutPrimitive';
import { GlowEffectPrimitive } from '../primitives/effects/GlowEffectPrimitive';
import { SlideAnimationPrimitive } from '../primitives/animation/SlideAnimationPrimitive';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { FontService } from '../services/FontService';

/**
 * イージング関数
 */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 文字別アニメーション状態
 */
interface CharacterAnimationState {
  flickerStartTime: number;
  flickerDuration: number;
  fadeInCompleteTime: number;
  fadeOutStartTime: number;
  fadeOutDuration: number;
}

/**
 * BlinkFadeTextPrimitive
 * プリミティブシステムを使用した点滅フェードテキストの実装
 * 文字がランダムに点滅しながらフェードイン/アウトする
 * WordSlideTextPrimitive互換の文字表示継続性を維持
 */
export class BlinkFadeTextPrimitive implements IAnimationTemplate {
  private flexibleLayoutPrimitive: FlexibleCumulativeLayoutPrimitive;
  private multiLineLayoutPrimitive: MultiLineLayoutPrimitive;
  private glowEffectPrimitive: GlowEffectPrimitive;
  private slideAnimationPrimitive: SlideAnimationPrimitive;

  constructor() {
    this.flexibleLayoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
    this.multiLineLayoutPrimitive = new MultiLineLayoutPrimitive();
    this.glowEffectPrimitive = new GlowEffectPrimitive();
    this.slideAnimationPrimitive = new SlideAnimationPrimitive();
  }

  readonly metadata: TemplateMetadata = {
    name: "BlinkFadeTextPrimitive",
    version: "3.0.0",
    description: "プリミティブシステムを使用した点滅フェードテキスト。文字がランダムに点滅しながらフェードイン/アウトする。文字表示継続性を維持。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Claude AI Assistant",
      contribution: "プリミティブベースの点滅フェードテキスト実装（WordSlideTextPrimitive互換）",
      date: "2025-01-09"
    },
    contributors: []
  };

  getParameterConfig(): ParameterConfig[] {
    return [
      // 基本パラメータ
      { name: "fontSize", type: "number", default: 120, min: 12, max: 256, step: 1 },
      { 
        name: "fontFamily", 
        type: "string", 
        default: "Arial",
        get options() {
          return FontService.getAvailableFonts();
        }
      },
      
      // 色設定
      { name: "textColor", type: "color", default: "#808080" },
      { name: "activeTextColor", type: "color", default: "#FFFF80" },
      { name: "completedTextColor", type: "color", default: "#FFF7EB" },
      
      // レイアウト設定（FlexibleCumulativeLayoutPrimitive）
      { 
        name: "wordDisplayMode", 
        type: "string", 
        default: "phrase_cumulative_same_line",
        get options() { return FlexibleCumulativeLayoutPrimitive.getWordDisplayModeValues(); }
      },
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "phraseOffsetX", type: "number", default: 0, min: -1000, max: 1000, step: 10 },
      { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 10 },
      
      // 段管理設定（MultiLineLayoutPrimitive）
      { name: "totalLines", type: "number", default: 4, min: 2, max: 8, step: 1 },
      { name: "lineSpacing", type: "number", default: 1.2, min: 0.5, max: 3.0, step: 0.1 },
      { name: "resetInterval", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
      { name: "manualLineNumber", type: "number", default: -1, min: -1, max: 7, step: 1 },
      
      // 点滅エフェクト設定
      { name: "preInDuration", type: "number", default: 1500, min: 500, max: 5000, step: 100 },
      { name: "flickerMinFrequency", type: "number", default: 2, min: 0.5, max: 10, step: 0.5 },
      { name: "flickerMaxFrequency", type: "number", default: 15, min: 5, max: 30, step: 1 },
      { name: "flickerIntensity", type: "number", default: 0.8, min: 0, max: 1, step: 0.1 },
      { name: "flickerRandomness", type: "number", default: 0.7, min: 0, max: 1, step: 0.1 },
      { name: "frequencyLerpSpeed", type: "number", default: 0.15, min: 0.01, max: 1, step: 0.01 },
      { name: "flickerThreshold", type: "number", default: 0.5, min: 0, max: 1, step: 0.1 },
      
      // フェード制御
      { name: "fadeInVariation", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "fadeOutVariation", type: "number", default: 800, min: 0, max: 2000, step: 50 },
      { name: "fadeOutDuration", type: "number", default: 1000, min: 200, max: 3000, step: 100 },
      { name: "fullDisplayThreshold", type: "number", default: 0.85, min: 0.5, max: 1, step: 0.05 },
      
      // スライドアニメーション設定（SlideAnimationPrimitive）
      { name: "headTime", type: "number", default: 800, min: 0, max: 3000, step: 100 },
      { name: "tailTime", type: "number", default: 1000, min: 0, max: 3000, step: 100 },
      { name: "entranceInitialSpeed", type: "number", default: 8.0, min: 0, max: 50, step: 1 },
      { name: "activeSpeed", type: "number", default: 0.8, min: 0, max: 10, step: 0.1 },
      { name: "rightOffset", type: "number", default: 200, min: 0, max: 500, step: 10 },
      
      // Glowエフェクト設定（GlowEffectPrimitive）
      { name: "enableGlow", type: "boolean", default: true },
      { name: "glowStrength", type: "number", default: 1.5, min: 0, max: 5, step: 0.1 },
      { name: "glowBrightness", type: "number", default: 1.2, min: 0.5, max: 3, step: 0.1 },
      { name: "glowBlur", type: "number", default: 6, min: 0.1, max: 20, step: 0.1 },
      { name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1 },
      
      // Shadowエフェクト設定（GlowEffectPrimitive）
      { name: "enableShadow", type: "boolean", default: false },
      { name: "shadowBlur", type: "number", default: 6, min: 0, max: 50, step: 0.5 },
      { name: "shadowColor", type: "color", default: "#000000" },
      { name: "shadowAngle", type: "number", default: 45, min: 0, max: 360, step: 15 },
      { name: "shadowDistance", type: "number", default: 8, min: 0, max: 100, step: 1 },
      { name: "shadowAlpha", type: "number", default: 0.8, min: 0, max: 1, step: 0.1 },
      
      // 合成モード
      { 
        name: "blendMode", 
        type: "string", 
        default: "normal",
        options: ["normal", "add", "multiply", "screen", "overlay"]
      }
    ];
  }

  removeVisualElements(container: PIXI.Container): void {
    // フィルターのクリーンアップを最初に行う（スリープ復帰対策）
    if (container.filters && container.filters.length > 0) {
      container.filters.forEach(filter => {
        if (filter && typeof filter.destroy === 'function') {
          filter.destroy();
        }
      });
      container.filters = [];
    }
    container.filterArea = null;
    
    // 視覚要素の削除
    const childrenToKeep: PIXI.DisplayObject[] = [];
    const childrenToRemove: PIXI.DisplayObject[] = [];
    
    container.children.forEach(child => {
      if (child instanceof PIXI.Container && 
          (child as any).name && 
          ((child as any).name.includes('phrase_container_') || 
           (child as any).name.includes('word_container_') || 
           (child as any).name.includes('char_container_'))) {
        childrenToKeep.push(child);
      } else {
        childrenToRemove.push(child);
      }
    });
    
    childrenToRemove.forEach(child => {
      container.removeChild(child);
      if (child instanceof PIXI.Container) {
        child.destroy({ children: true });
      } else {
        child.destroy();
      }
    });
    
    // 子コンテナのフィルターも再帰的にクリア
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

  animateContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,
    phase: AnimationPhase
  ): boolean {
    const textContent = Array.isArray(text) ? text.join('') : text;
    
    container.visible = true;
    this.removeVisualElements(container);
    
    let rendered = false;
    switch (hierarchyType) {
      case 'phrase':
        rendered = this.renderPhraseContainer(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'word':
        rendered = this.renderWordContainer(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'char':
        rendered = this.renderCharContainer(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
    }
    
    return rendered;
  }

  renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      container.position.set(0, 0);
      return true;
    }

    const screenWidth = app.renderer.width;
    const screenHeight = app.renderer.height;
    const fontSize = params.fontSize as number || 120;
    const charSpacing = params.charSpacing as number || 1.0;
    
    // フレーズの総幅を計算
    let phraseWidth = 0;
    if (params.words && Array.isArray(params.words)) {
      (params.words as any[]).forEach((wordData: any) => {
        for (let i = 0; i < wordData.word.length; i++) {
          const char = wordData.word[i];
          const code = char.charCodeAt(0);
          const isHalfWidth = (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
          const effectiveSpacing = isHalfWidth ? charSpacing * 0.6 : charSpacing;
          phraseWidth += fontSize * effectiveSpacing;
        }
      });
    }
    
    // SlideAnimationPrimitiveを使用してフレーズ位置計算
    const phrasePosition = this.slideAnimationPrimitive.calculatePhrasePosition({
      phraseOffsetX: params.phraseOffsetX as number || 0,
      phraseOffsetY: params.phraseOffsetY as number || 0,
      fontSize,
      headTime: params.headTime as number || 800,
      tailTime: params.tailTime as number || 1000,
      randomPlacement: false,
      randomSeed: 0,
      randomRangeX: 0,
      randomRangeY: 0,
      minDistanceFromPrevious: 0,
      text,
      words: params.words || [],
      nowMs,
      startMs,
      endMs,
      phase: phase.toString()
    });
    
    // MultiLineLayoutPrimitiveを使用して段管理
    const phraseId = params.phraseId as string || params.id as string || `phrase_${startMs}`;
    const linePosition = this.multiLineLayoutPrimitive.calculatePhrasePosition({
      phraseId,
      startMs,
      endMs,
      totalLines: params.totalLines as number || 4,
      lineSpacing: params.lineSpacing as number || 1.2,
      resetInterval: params.resetInterval as number || 2000,
      manualLineNumber: params.manualLineNumber as number || -1,
      screenWidth,
      screenHeight,
      offsetX: params.phraseOffsetX as number || 0,
      offsetY: params.phraseOffsetY as number || 0
    });
    
    // フレーズを中央に配置（phraseOffsetXを考慮）
    const centerX = (screenWidth - phraseWidth) / 2 + phrasePosition.x;
    container.position.set(centerX, linePosition.y);
    container.alpha = phrasePosition.alpha;
    
    // GlowEffectPrimitiveを使用してエフェクト適用
    this.glowEffectPrimitive.applyEffect(container, {
      enableGlow: params.enableGlow as boolean ?? true,
      glowStrength: params.glowStrength as number || 1.5,
      glowBrightness: params.glowBrightness as number || 1.2,
      glowBlur: params.glowBlur as number || 6,
      glowQuality: params.glowQuality as number || 8,
      enableShadow: params.enableShadow as boolean ?? false,
      shadowBlur: params.shadowBlur as number || 6,
      shadowColor: params.shadowColor as string || '#000000',
      shadowAngle: params.shadowAngle as number || 45,
      shadowDistance: params.shadowDistance as number || 8,
      shadowAlpha: params.shadowAlpha as number || 0.8,
      blendMode: params.blendMode as string || 'normal',
      screenWidth,
      screenHeight
    });
    
    // 単語コンテナの管理（wordDisplayModeに応じた配置）
    if (params.words && Array.isArray(params.words)) {
      const wordDisplayModeStr = params.wordDisplayMode as string || "phrase_cumulative_same_line";
      let cumulativeWidth = 0;
      
      (params.words as any[]).forEach((wordData: any, index: number) => {
        // 既存の単語コンテナを検索
        let wordContainer: PIXI.Container | null = null;
        
        container.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && 
              (child as any).name === `word_container_${wordData.id}`) {
            wordContainer = child as PIXI.Container;
          }
        });

        // 存在しない場合は新規作成
        if (!wordContainer) {
          wordContainer = new PIXI.Container();
          (wordContainer as any).name = `word_container_${wordData.id}`;
          container.addChild(wordContainer);
        }

        // 単語の幅を計算
        let wordWidth = 0;
        for (let i = 0; i < wordData.word.length; i++) {
          const char = wordData.word[i];
          const code = char.charCodeAt(0);
          const isHalfWidth = (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
          const effectiveSpacing = isHalfWidth ? (params.charSpacing as number || 1.0) * 0.6 : (params.charSpacing as number || 1.0);
          wordWidth += (params.fontSize as number || 120) * effectiveSpacing;
        }
        
        // wordDisplayModeに応じて単語コンテナの位置を決定
        let wordOffsetX = 0;
        if (wordDisplayModeStr === "phrase_cumulative_same_line") {
          // phrase_cumulative_same_lineモード：累積幅を使用
          wordOffsetX = cumulativeWidth;
        } else {
          // individual_word_entranceモード：単語ごとに独立配置（x=0からスタート）
          wordOffsetX = 0;
        }
        
        // 単語コンテナにメタデータを保存
        (wordContainer as any).__wordOffsetX = wordOffsetX;
        (wordContainer as any).__wordIndex = index;
        (wordContainer as any).__totalWords = params.words.length;
        
        // 単語アニメーションの適用
        this.animateContainer(
          wordContainer,
          wordData.word,
          {
            ...params,
            id: wordData.id,
            wordIndex: index,
            totalWords: params.words.length,
            previousWordsWidth: wordOffsetX,  // wordDisplayModeに応じた値を使用
            chars: wordData.chars,
            phraseEndMs: endMs,
            wordDisplayMode: params.wordDisplayMode  // wordDisplayModeを渡す
          },
          nowMs,
          wordData.start,
          wordData.end,
          'word',
          phase
        );
        
        // phrase_cumulative_same_lineモードの場合のみ累積幅を更新
        if (wordDisplayModeStr === "phrase_cumulative_same_line") {
          cumulativeWidth += wordWidth;
        }
      });
    }
    
    container.visible = true;
    container.updateTransform();
    
    return true;
  }

  renderWordContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    const fontSize = params.fontSize as number || 120;
    const charSpacing = params.charSpacing as number || 1.0;
    const wordOffsetX = params.previousWordsWidth as number || 0;
    const wordDisplayModeStr = params.wordDisplayMode as string || "phrase_cumulative_same_line";
    
    // SlideAnimationPrimitiveを使用して単語の入場アニメーション位置を計算
    const wordPosition = this.slideAnimationPrimitive.calculateWordPosition({
      fontSize,
      headTime: params.headTime as number || 800,
      entranceInitialSpeed: params.entranceInitialSpeed as number || 8.0,
      activeSpeed: params.activeSpeed as number || 0.8,
      rightOffset: params.rightOffset as number || 200,
      wordIndex: params.wordIndex as number || 0,
      nowMs,
      startMs,
      endMs,
      phase: phase.toString()
    });
    
    // wordDisplayModeに応じた単語コンテナの位置設定
    let finalY = wordPosition.y;
    if (wordDisplayModeStr === "phrase_cumulative_same_line") {
      // phrase_cumulative_same_lineモード：すべての単語を同じY座標に配置
      finalY = 0;
    } else {
      // individual_word_entranceモード：SlideAnimationPrimitiveのY座標を使用
      finalY = wordPosition.y;
    }
    
    container.position.set(wordOffsetX + wordPosition.x, finalY);
    container.alpha = wordPosition.alpha;
    container.visible = true;
    
    // FlexibleCumulativeLayoutPrimitiveを使用した文字配置
    if (params.chars && Array.isArray(params.chars)) {
      // 文字データをFlexibleCharacterData形式に変換
      const flexibleCharsData = (params.chars as any[]).map((charData: any, index: number) => ({
        id: charData.id,
        char: charData.char,
        start: charData.start,
        end: charData.end,
        charIndexInWord: index,
        charIndex: charData.charIndex,
        wordIndex: params.wordIndex as number || 0,
        totalChars: charData.totalChars,
        totalWords: params.totalWords as number || 1
      }));
      
      // wordDisplayModeの適切な処理
      let wordDisplayMode: WordDisplayMode;
      switch (wordDisplayModeStr) {
        case "phrase_cumulative_same_line":
          wordDisplayMode = WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE;
          break;
        case "individual_word_entrance_new_line":
          wordDisplayMode = WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_NEW_LINE;
          break;
        case "phrase_cumulative_new_line":
          wordDisplayMode = WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
          break;
        case "individual_word_entrance":
        default:
          wordDisplayMode = WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE;
          break;
      }
      
      // フレーズ一括入場モードの場合のタイミング制御パラメータ
      const isPhraseCumulativeMode = wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE || 
                                     wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
      
      // レイアウトパラメータの設定
      const layoutParams = {
        charSpacing: charSpacing,
        fontSize: fontSize,
        halfWidthSpacingRatio: 0.6,
        alignment: 'left' as const,
        containerSize: { width: 0, height: 0 },
        spacing: charSpacing,
        chars: flexibleCharsData,
        containerPrefix: 'char_container_',
        wordDisplayMode: wordDisplayMode,
        wordSpacing: params.wordSpacing as number || 1.0,
        lineHeight: params.lineHeight as number || 1.2,
        // フレーズ一括入場モードの場合のみタイミング制御パラメータを追加
        ...(isPhraseCumulativeMode && {
          phraseTimingControl: {
            nowMs: nowMs,
            phraseStartMs: params.phraseStartMs as number || startMs,
            phraseEndMs: params.phraseEndMs as number || endMs,
            headTime: params.headTime as number || 800,
            tailTime: params.tailTime as number || 1000
          }
        })
      };
      
      // FlexibleCumulativeLayoutPrimitiveを使用して文字コンテナを管理
      this.flexibleLayoutPrimitive.manageCharacterContainersFlexible(
        container,
        layoutParams,
        (charContainer, charData) => {
          // 文字アニメーションの適用
          this.animateContainer(
            charContainer,
            charData.char,
            {
              ...params,
              id: charData.id,
              charIndex: charData.charIndex,
              totalChars: charData.totalChars,
              phraseEndMs: params.phraseEndMs,
              wordIndex: params.wordIndex
            },
            nowMs,
            charData.start,
            charData.end,
            'char',
            phase
          );
        }
      );
    }
    
    container.updateTransform();
    return true;
  }

  /**
   * 色のアルファ値を適用するヘルパー関数
   */
  private applyAlphaToColor(color: string, alpha: number): string {
    // 色を解析
    const rgb = parseInt(color.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    
    // アルファ値を適用した色を返す
    const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${alphaHex}`;
  }

  /**
   * 擬似乱数生成器
   */
  private createPseudoRandom(seed: number): () => number {
    let state = seed + 1;
    return () => {
      state = ((state * 1103515245) + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  /**
   * 点滅の閾値関数を生成
   */
  private generateFlickerThreshold(
    charIndex: number,
    flickerThreshold: number,
    flickerRandomness: number
  ): (t: number) => boolean {
    const rng = this.createPseudoRandom(charIndex * 137 + 42);
    
    // 擬似乱数的な閾値パターンを生成
    const patterns: number[] = [];
    for (let i = 0; i < 10; i++) {
      patterns.push(rng());
    }
    
    return (t: number): boolean => {
      // 基本閾値チェック
      if (t >= flickerThreshold) {
        return true; // 閾値を超えたら常に表示
      }
      
      // 閾値以下の場合、擬似乱数パターンで点滅
      const patternIndex = Math.floor(t * patterns.length);
      const patternValue = patterns[patternIndex % patterns.length];
      
      // ランダム性を考慮した点滅判定
      const threshold = flickerThreshold * (1 - flickerRandomness * patternValue);
      return t >= threshold;
    };
  }

  renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    _phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    // 既存のテキストオブジェクトをクリア（毎フレーム新規作成）
    container.removeChildren();
    
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string;
    if (!fontFamily) {
      console.error('[BlinkFadeTextPrimitive] fontFamilyパラメータが指定されていません');
      return false;
    }

    // パラメータ取得
    const preInDuration = params.preInDuration as number || 1500;
    const flickerMinFrequency = params.flickerMinFrequency as number || 2;
    const flickerMaxFrequency = params.flickerMaxFrequency as number || 15;
    const flickerIntensity = params.flickerIntensity as number || 0.8;
    const flickerRandomness = params.flickerRandomness as number || 0.7;
    const flickerThreshold = params.flickerThreshold as number || 0.5;
    const frequencyLerpSpeed = params.frequencyLerpSpeed as number || 0.15;
    const fadeInVariation = params.fadeInVariation as number || 500;
    const fadeOutVariation = params.fadeOutVariation as number || 800;
    const fadeOutDuration = params.fadeOutDuration as number || 1000;
    const fullDisplayThreshold = params.fullDisplayThreshold as number || 0.85;
    
    const defaultTextColor = params.textColor as string || '#808080';
    const activeTextColor = params.activeTextColor as string || '#FFFF80';
    const completedTextColor = params.completedTextColor as string || '#FFF7EB';
    
    const phraseEndMs = params.phraseEndMs as number || endMs;
    
    // 文字アニメーション状態の生成/取得
    const charIndex = params.charIndex as number || 0;
    const stateKey = `charState_${charIndex}_${phraseEndMs}`;
    
    if (!(container as any)[stateKey]) {
      const rng = this.createPseudoRandom(charIndex);
      
      (container as any)[stateKey] = {
        flickerStartTime: startMs - preInDuration + rng() * fadeInVariation * flickerRandomness,
        flickerDuration: preInDuration + rng() * fadeInVariation,
        fadeInCompleteTime: startMs - rng() * fadeInVariation * 0.2,
        fadeOutStartTime: phraseEndMs - rng() * fadeOutVariation,
        fadeOutDuration: fadeOutDuration + rng() * fadeOutVariation * 0.5
      } as CharacterAnimationState;
    }
    
    const charState = (container as any)[stateKey] as CharacterAnimationState;
    
    // 閾値関数を生成
    const flickerThresholdFunc = this.generateFlickerThreshold(charIndex, flickerThreshold, flickerRandomness);
    
    // アニメーションフェーズの判定と計算
    let currentAlpha = 1.0;
    let textColor = defaultTextColor;
    let shouldBlink = false;
    
    if (nowMs < charState.flickerStartTime) {
      // 開始前
      textColor = defaultTextColor;
      shouldBlink = false;
    } else if (nowMs < startMs) {
      // フェードイン（点滅）フェーズ
      const elapsed = nowMs - charState.flickerStartTime;
      const progress = Math.min(elapsed / charState.flickerDuration, 1);
      const baseAlpha = easeInOutQuad(progress);
      
      if (baseAlpha >= fullDisplayThreshold) {
        // 閾値を超えたら点滅なし
        shouldBlink = false;
      } else {
        // 閾値ベースの点滅判定
        shouldBlink = !flickerThresholdFunc(baseAlpha);
        
        if (shouldBlink) {
          // 点滅時の周波数計算
          const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
          const prevFreq = (container as any).__prevFrequency || targetFreq;
          const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
          (container as any).__prevFrequency = currentFreq;
          
          const flickerPhase = nowMs * currentFreq * Math.PI * 2;
          const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
          
          // 点滅の強度を適用
          shouldBlink = flickerValue < (1 - flickerIntensity * baseAlpha);
        }
      }
      
      textColor = defaultTextColor;
    } else if (nowMs <= endMs) {
      // アクティブフェーズ
      textColor = activeTextColor;
      shouldBlink = false;
    } else if (nowMs <= phraseEndMs) {
      // 完了後フレーズ終了まで
      textColor = completedTextColor;
      shouldBlink = false;
    } else if (nowMs < charState.fadeOutStartTime + charState.fadeOutDuration) {
      // フェードアウト（点滅）フェーズ
      const elapsed = nowMs - charState.fadeOutStartTime;
      const progress = Math.min(elapsed / charState.fadeOutDuration, 1);
      const baseAlpha = 1 - easeInOutQuad(progress);
      
      if (baseAlpha >= fullDisplayThreshold) {
        // 閾値を超えたら点滅なし
        shouldBlink = false;
      } else {
        // 閾値ベースの点滅判定
        shouldBlink = !flickerThresholdFunc(baseAlpha);
        
        if (shouldBlink) {
          // 点滅時の周波数計算
          const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
          const prevFreq = (container as any).__prevFrequency || targetFreq;
          const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
          (container as any).__prevFrequency = currentFreq;
          
          const flickerPhase = nowMs * currentFreq * Math.PI * 2;
          const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
          
          // 点滅の強度を適用
          shouldBlink = flickerValue < (1 - flickerIntensity * baseAlpha);
        }
      }
      
      textColor = completedTextColor;
    } else {
      // 完全終了後
      textColor = completedTextColor;
      shouldBlink = true; // 最終的に非表示
    }
    
    // フレーズ一括入場モードかどうかを判定
    const wordDisplayModeStr = params.wordDisplayMode as string || "phrase_cumulative_same_line";
    const isPhraseCumulativeMode = wordDisplayModeStr === "phrase_cumulative_same_line" || 
                                   wordDisplayModeStr === "phrase_cumulative_new_line";

    // 表示状態の制御
    if (isPhraseCumulativeMode) {
      // フレーズ一括入場モードの場合、プリミティブ側でタイミング制御が行われるため
      // テンプレート側では表示制御に干渉しない（プリミティブ側の設定をそのまま使用）
      // ただし、containerが非表示の場合は何も描画しない
      if (!container.visible) {
        return true;
      }
    } else {
      // 個別入場モードの場合は常に表示
      container.visible = true;
    }
    
    // WordSlideTextPrimitive互換: 色で状態を表現し、文字は常に表示
    // 点滅効果も色のアルファ値で実現
    let finalColor = textColor;
    if (shouldBlink) {
      // 点滅時は透明度を下げる（完全に消さない）
      finalColor = this.applyAlphaToColor(textColor, 0.1);
    }
    
    // テキスト描画（WordSlideTextPrimitive互換）
    const textObj = TextStyleFactory.createHighDPIText(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: finalColor
    });
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    
    // 文字表示継続性の維持（重要）
    textObj.alpha = 1.0;     // 常に1.0
    textObj.visible = true;  // 常に表示
    
    container.addChild(textObj);
    
    return true;
  }
}