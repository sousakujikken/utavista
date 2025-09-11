import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata, ParameterConfig } from '../types/types';
import { FlexibleCumulativeLayoutPrimitive } from '../primitives/layout/FlexibleCumulativeLayoutPrimitive';
import { MultiLineLayoutPrimitive } from '../primitives/layout/MultiLineLayoutPrimitive';
import { GlowEffectPrimitive } from '../primitives/effects/GlowEffectPrimitive';
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
 * FlickerFadeTextPrimitive
 * プリミティブシステムを使用した点滅フェードテキストの実装
 * 文字がランダムに点滅しながらフェードイン/アウトする
 */
export class FlickerFadeTextPrimitive implements IAnimationTemplate {
  private flexibleLayoutPrimitive: FlexibleCumulativeLayoutPrimitive;
  private multiLineLayoutPrimitive: MultiLineLayoutPrimitive;
  private glowEffectPrimitive: GlowEffectPrimitive;

  constructor() {
    this.flexibleLayoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
    this.multiLineLayoutPrimitive = new MultiLineLayoutPrimitive();
    this.glowEffectPrimitive = new GlowEffectPrimitive();
  }

  readonly metadata: TemplateMetadata = {
    name: "FlickerFadeTextPrimitive",
    version: "2.0.0",
    description: "プリミティブシステムを使用した点滅フェードテキスト。文字がランダムに点滅しながらフェードイン/アウトする。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Claude AI Assistant",
      contribution: "プリミティブベースの点滅フェードテキスト実装",
      date: "2025-01-06"
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
      
      // フェード制御
      { name: "fadeInVariation", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "fadeOutVariation", type: "number", default: 800, min: 0, max: 2000, step: 50 },
      { name: "fadeOutDuration", type: "number", default: 1000, min: 200, max: 3000, step: 100 },
      { name: "fullDisplayThreshold", type: "number", default: 0.85, min: 0.5, max: 1, step: 0.05 },
      
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
    
    // MultiLineLayoutPrimitiveを使用して段管理
    const phraseId = params.phraseId as string || params.id as string || `phrase_${startMs}`;
    const phrasePosition = this.multiLineLayoutPrimitive.calculatePhrasePosition({
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
    const centerX = (screenWidth - phraseWidth) / 2 + (params.phraseOffsetX as number || 0);
    container.position.set(centerX, phrasePosition.y);
    
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
    
    // 単語コンテナの管理
    if (params.words && Array.isArray(params.words)) {
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
        
        // 単語コンテナにメタデータを保存
        (wordContainer as any).__wordOffsetX = cumulativeWidth;
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
            previousWordsWidth: cumulativeWidth,
            chars: wordData.chars,
            phraseEndMs: endMs
          },
          nowMs,
          wordData.start,
          wordData.end,
          'word',
          phase
        );
        
        // 次の単語のために累積幅を更新
        cumulativeWidth += wordWidth;
      });
    }
    
    container.alpha = 1.0;
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
    
    // 単語コンテナの位置設定（オリジナルと同じ）
    container.position.set(wordOffsetX, 0);
    container.alpha = 1.0;
    container.visible = true;
    
    // 文字コンテナの管理（オリジナルと完全同一）
    if (params.chars && Array.isArray(params.chars)) {
      let cumulativeXOffset = 0;
      
      (params.chars as any[]).forEach((charData: any) => {
        // 既存の文字コンテナを検索
        let charContainer: PIXI.Container | null = null;
        
        container.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && 
              (child as any).name === `char_container_${charData.id}`) {
            charContainer = child as PIXI.Container;
          }
        });
        
        // 存在しない場合は新規作成
        if (!charContainer) {
          charContainer = new PIXI.Container();
          (charContainer as any).name = `char_container_${charData.id}`;
          container.addChild(charContainer);
        }
        
        // 文字コンテナの位置設定（オリジナルと同じ計算）
        const char = charData.char;
        const code = char.charCodeAt(0);
        const isHalfWidth = (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
        const effectiveSpacing = isHalfWidth ? charSpacing * 0.6 : charSpacing;
        
        charContainer.position.set(cumulativeXOffset, 0);
        cumulativeXOffset += fontSize * effectiveSpacing;
        
        // 文字アニメーションの適用
        this.animateContainer(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars,
            phraseEndMs: params.phraseEndMs
          },
          nowMs,
          charData.start,
          charData.end,
          'char',
          phase
        );
      });
    }
    
    container.updateTransform();
    return true;
  }

  renderCharContainer(
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
    const fontFamily = params.fontFamily as string;
    if (!fontFamily) {
      console.error('[FlickerFadeTextPrimitive] fontFamilyパラメータが指定されていません');
      return false;
    }

    // パラメータ取得
    const preInDuration = params.preInDuration as number || 1500;
    const flickerMinFrequency = params.flickerMinFrequency as number || 2;
    const flickerMaxFrequency = params.flickerMaxFrequency as number || 15;
    const flickerIntensity = params.flickerIntensity as number || 0.8;
    const flickerRandomness = params.flickerRandomness as number || 0.7;
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
      const seedRandom = (seed: number) => {
        let state = seed + 1;
        return () => {
          state = ((state * 1103515245) + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };
      };
      
      const rng = seedRandom(charIndex);
      
      (container as any)[stateKey] = {
        flickerStartTime: startMs - preInDuration + rng() * fadeInVariation * flickerRandomness,
        flickerDuration: preInDuration + rng() * fadeInVariation,
        fadeInCompleteTime: startMs - rng() * fadeInVariation * 0.2,
        fadeOutStartTime: phraseEndMs - rng() * fadeOutVariation,
        fadeOutDuration: fadeOutDuration + rng() * fadeOutVariation * 0.5
      } as CharacterAnimationState;
    }
    
    const charState = (container as any)[stateKey] as CharacterAnimationState;
    
    // アニメーションフェーズの判定と計算
    let currentAlpha = 0;
    let textColor = defaultTextColor;
    
    if (nowMs < charState.flickerStartTime) {
      currentAlpha = 0;
      textColor = defaultTextColor;
    } else if (nowMs < startMs) {
      // フェードイン（点滅）フェーズ
      const elapsed = nowMs - charState.flickerStartTime;
      const progress = Math.min(elapsed / charState.flickerDuration, 1);
      const baseAlpha = easeInOutQuad(progress);
      
      if (baseAlpha >= fullDisplayThreshold) {
        currentAlpha = baseAlpha;
      } else {
        const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
        const prevFreq = (container as any).__prevFrequency || targetFreq;
        const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
        (container as any).__prevFrequency = currentFreq;
        
        const flickerPhase = nowMs * currentFreq * Math.PI * 2;
        const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
        currentAlpha = baseAlpha * (1 - flickerIntensity + flickerIntensity * flickerValue);
      }
      
      textColor = defaultTextColor;
    } else if (nowMs <= phraseEndMs) {
      // アクティブフェーズ
      currentAlpha = 1.0;
      textColor = activeTextColor;
    } else if (nowMs < charState.fadeOutStartTime + charState.fadeOutDuration) {
      // フェードアウト（点滅）フェーズ
      const elapsed = nowMs - charState.fadeOutStartTime;
      const progress = Math.min(elapsed / charState.fadeOutDuration, 1);
      const baseAlpha = 1 - easeInOutQuad(progress);
      
      if (baseAlpha >= fullDisplayThreshold) {
        currentAlpha = baseAlpha;
      } else {
        const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
        const prevFreq = (container as any).__prevFrequency || targetFreq;
        const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
        (container as any).__prevFrequency = currentFreq;
        
        const flickerPhase = nowMs * currentFreq * Math.PI * 2;
        const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
        currentAlpha = baseAlpha * (1 - flickerIntensity + flickerIntensity * flickerValue);
      }
      
      textColor = completedTextColor;
    } else {
      currentAlpha = 0;
      textColor = completedTextColor;
    }
    
    currentAlpha = Math.max(0, Math.min(1, currentAlpha));
    
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
      container.visible = currentAlpha > 0;
    }
    
    // テキスト描画
    const textObj = TextStyleFactory.createHighDPIText(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor
    });
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    textObj.alpha = currentAlpha;
    
    container.addChild(textObj);
    
    return true;
  }
}