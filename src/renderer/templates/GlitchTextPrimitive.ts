/**
 * GlitchTextPrimitive
 * 完全プリミティブベースのグリッチテキストテンプレート
 * オリジナルGlitchTextと同等の機能をプリミティブのみで実装
 */

import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata, ParameterConfig } from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { 
  GlowEffectPrimitive,
  SlideAnimationPrimitive,
  MultiLineLayoutPrimitive,
  FlexibleCumulativeLayoutPrimitive,
  WordDisplayMode,
  GlitchEffectPrimitive,
  type GlitchEffectParams,
  type FlexibleCharacterData
} from '../primitives';

/**
 * プリミティブ完全活用版 GlitchText
 */
export class GlitchTextPrimitive implements IAnimationTemplate {
  
  readonly metadata = {
    name: "GlitchTextPrimitive",
    version: "1.0.0",
    description: "プリミティブ完全活用版グリッチテキスト - 手動実装なしの完全プリミティブベース実装",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Sousakujikken_HIRO",
      contribution: "オリジナルGlitchTextテンプレートの作成",
      date: "2025-06-14"
    },
    contributors: [
      {
        name: "UTAVISTA Development Team",
        contribution: "プリミティブベース実装",
        date: "2025-08-05"
      }
    ]
  };
  
  /**
   * パラメータ設定（オリジナルと同じ）
   */
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
      
      // 段構成設定
      { name: "totalLines", type: "number", default: 4, min: 2, max: 8, step: 1 },
      { name: "lineSpacing", type: "number", default: 50, min: 20, max: 100, step: 5 },
      { name: "resetInterval", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
      { name: "manualLineNumber", type: "number", default: -1, min: -1, max: 7, step: 1 },
      
      // 文字色設定
      { name: "inactiveColor", type: "color", default: "#FFA500" },
      { name: "activeColor", type: "color", default: "#FFA500" },
      
      // アニメーション速度とタイミング
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "initialSpeed", type: "number", default: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: "activeSpeed", type: "number", default: 0.01, min: 0.001, max: 1.0, step: 0.001 },
      
      // 文字設定
      { name: "charSpacing", type: "number", default: 1.2, min: 0.1, max: 3.0, step: 0.1 },
      { name: "rightOffset", type: "number", default: 100, min: 0, max: 500, step: 10 },
      
      // 単語表示モード設定（プリミティブ側から選択肢を取得）
      { name: "wordDisplayMode", type: "string", default: "phrase_cumulative_same_line",
        get options() {
          return FlexibleCumulativeLayoutPrimitive.getWordDisplayModeValues();
        }
      },
      { name: "wordSpacing", type: "number", default: 1.0, min: 0.1, max: 5.0, step: 0.1 },
      { name: "lineHeight", type: "number", default: 1.2, min: 0, max: 3.0, step: 0.1 },
      
      // グリッチ効果設定
      { name: "enableGlitch", type: "boolean", default: true },
      { name: "glitchBlockSize", type: "number", default: 8, min: 2, max: 32, step: 1 },
      { name: "glitchBlockCount", type: "number", default: 10, min: 1, max: 50, step: 1 },
      { name: "glitchUpdateInterval", type: "number", default: 100, min: 50, max: 1000, step: 10 },
      { name: "glitchIntensity", type: "number", default: 0.5, min: 0.0, max: 1.0, step: 0.1 },
      { name: "glitchColorShift", type: "boolean", default: true },
      { name: "glitchThreshold", type: "number", default: 0.3, min: 0.0, max: 1.0, step: 0.1 },
      { name: "glitchWaveSpeed", type: "number", default: 2.0, min: 0.1, max: 10.0, step: 0.1 },
      { name: "glitchRandomness", type: "number", default: 0.5, min: 0.0, max: 1.0, step: 0.1 },
    ];
  }
  
  /**
   * 表示要素のみを削除するメソッド
   */
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
  
  /**
   * 階層対応のアニメーションメソッド（プリミティブ完全活用）
   */
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
    this.removeVisualElements!(container);
    
    let rendered = false;
    switch (hierarchyType) {
      case 'phrase':
        rendered = this.renderPhraseContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'word':
        rendered = this.renderWordContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'char':
        rendered = this.renderCharContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
    }
    
    return rendered;
  }
  
  /**
   * フレーズコンテナの描画（MultiLineLayoutPrimitive + SlideAnimationPrimitive完全活用）
   */
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
    
    // MultiLineLayoutPrimitive使用して段配置計算
    const multiLineLayoutPrimitive = new MultiLineLayoutPrimitive();
    
    const phraseId = params.id as string || `phrase_${startMs}_${text.substring(0, 10)}`;
    const phrasePosition = multiLineLayoutPrimitive.calculatePhrasePosition({
      phraseId: phraseId,
      startMs: startMs,
      endMs: endMs,
      nowMs: nowMs,
      text: text,
      totalLines: params.totalLines as number || 4,
      lineSpacing: params.lineSpacing as number || 50,
      resetInterval: params.resetInterval as number || 2000,
      manualLineNumber: params.manualLineNumber as number || -1
    });
    
    // SlideAnimationPrimitive使用してスライドアニメーション計算
    const slideAnimationPrimitive = new SlideAnimationPrimitive();
    
    const slideResult = slideAnimationPrimitive.calculatePhrasePosition({
      phraseOffsetX: 0,
      phraseOffsetY: phrasePosition.y,
      fontSize: params.fontSize as number || 120,
      lineHeight: 1.2,
      headTime: params.headTime as number || 500,
      tailTime: params.tailTime as number || 500,
      randomPlacement: false, // GlitchTextでは段組み配置のためランダム配置は無効
      randomSeed: 0,
      randomRangeX: 0,
      randomRangeY: 0,
      minDistanceFromPrevious: 0,
      text: text,
      words: [],
      nowMs,
      startMs,
      endMs,
      phase,
      phraseId: phraseId
    });
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      container.position.set(0, phrasePosition.y);
      return true;
    }
    
    const screenWidth = app.renderer.width;
    const rightOffset = params.rightOffset as number || 100;
    const startPositionX = screenWidth + rightOffset;
    
    // スライドアニメーション位置計算（オリジナルロジック準拠）
    const headTime = params.headTime as number || 500;
    const tailTime = params.tailTime as number || 500;
    const initialSpeed = params.initialSpeed as number || 0.1;
    const activeSpeed = params.activeSpeed as number || 0.01;
    
    const inStartTime = startMs - headTime;
    const outEndTime = endMs + tailTime;
    
    let posX = startPositionX;
    let alpha = 1.0;
    
    // スライドアニメーションの計算（オリジナルと同じ）
    if (nowMs < inStartTime) {
      posX = startPositionX;
      alpha = 0;
    } else if (nowMs < startMs) {
      const progress = (nowMs - inStartTime) / headTime;
      const easedProgress = this.easeOutCubic(progress);
      posX = startPositionX - (startPositionX - screenWidth/2) * easedProgress;
      alpha = progress;
    } else if (nowMs <= endMs) {
      const activeTime = nowMs - startMs;
      posX = screenWidth/2 - activeTime * activeSpeed;
      alpha = 1.0;
    } else if (nowMs < outEndTime) {
      const exitProgress = (nowMs - endMs) / tailTime;
      const easedProgress = this.easeInCubic(exitProgress);
      const activeTime = endMs - startMs;
      const basePos = screenWidth/2 - activeTime * activeSpeed;
      posX = basePos - easedProgress * activeSpeed * tailTime * (initialSpeed / activeSpeed);
      alpha = 1.0 - exitProgress;
    } else {
      alpha = 0;
    }
    
    // コンテナの設定
    container.position.set(posX, phrasePosition.y);
    container.alpha = alpha;
    container.updateTransform();
    
    // 段番号を子に渡す
    (params as any).currentLineNumber = phrasePosition.lineNumber;
    
    return true;
  }
  
  /**
   * 単語コンテナの描画（FlexibleCumulativeLayoutPrimitive完全活用）
   */
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
    
    container.position.set(0, 0);
    container.visible = true;
    
    // FlexibleCumulativeLayoutPrimitive使用して文字コンテナ管理
    const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
    
    const charsData = params.chars as FlexibleCharacterData[];
    if (!charsData || !Array.isArray(charsData) || charsData.length === 0) {
      return true;
    }
    
    // 文字間隔を動的に設定
    let charSpacing = params.charSpacing as number;
    if (charSpacing === undefined || charSpacing === null || charSpacing <= 0) {
      charSpacing = this.getDefaultCharSpacing(text);
    }
    
    // 単語表示モードの決定
    const wordDisplayModeStr = params.wordDisplayMode as string || "phrase_cumulative_same_line";
    let wordDisplayMode: WordDisplayMode;
    
    switch (wordDisplayModeStr) {
      case "individual_word_entrance":
        wordDisplayMode = WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE;
        break;
      case "phrase_cumulative_same_line":
        wordDisplayMode = WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE;
        break;
      case "individual_word_entrance_new_line":
        wordDisplayMode = WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_NEW_LINE;
        break;
      case "phrase_cumulative_new_line":
        wordDisplayMode = WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
        break;
      default:
        wordDisplayMode = WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE;
        break;
    }
    
    // フレーズ一括入場モードの場合のタイミング制御パラメータ
    const isPhraseCumulativeMode = wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE || 
                                   wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
    
    const layoutParams = {
      charSpacing: charSpacing,
      fontSize: params.fontSize as number || 120,
      halfWidthSpacingRatio: 0.6,
      alignment: 'left' as const,
      containerSize: { width: 0, height: 0 },
      spacing: charSpacing,
      chars: charsData,
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
          headTime: params.headTime as number || 500,
          tailTime: params.tailTime as number || 500
        }
      })
    };
    
    layoutPrimitive.manageCharacterContainersFlexible(
      container,
      layoutParams,
      (charContainer, charData) => {
        // 文字アニメーションの適用
        this.animateContainer!(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars,
            phrasePhase: phase,
            phraseStartMs: params.phraseStartMs || startMs,
            phraseEndMs: params.phraseEndMs || endMs
          },
          nowMs,
          charData.start,
          charData.end,
          'char',
          phase
        );
      }
    );
    
    return true;
  }
  
  /**
   * 文字コンテナの描画（GlitchEffectPrimitive完全活用）
   */
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
    
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string;
    
    if (!fontFamily) {
      console.error('[GlitchTextPrimitive] fontFamilyパラメータが指定されていません');
      return false;
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
      // 個別入場モードの場合のみフレーズタイミング制御を実行
      const phraseStartMs = params.phraseStartMs as number || startMs;
      const phraseEndMs = params.phraseEndMs as number || endMs;
      const headTime = params.headTime as number || 500;
      const tailTime = params.tailTime as number || 500;
      
      const phraseInStartTime = phraseStartMs - headTime;
      const phraseOutEndTime = phraseEndMs + tailTime;
      
      if (nowMs < phraseInStartTime || nowMs > phraseOutEndTime) {
        container.visible = false;
        return true;
      }
      
      container.visible = true;
    }
    
    // 文字の状態を判定
    const isActive = nowMs >= startMs && nowMs <= endMs;
    
    // グリッチ効果を適用するか判定（発声中以外にグリッチを適用）
    const enableGlitch = params.enableGlitch as boolean ?? true;
    const phraseStartMs = params.phraseStartMs as number || startMs;
    const phraseEndMs = params.phraseEndMs as number || endMs;
    const shouldApplyGlitch = enableGlitch && !isActive && nowMs >= phraseStartMs && nowMs <= phraseEndMs;
    
    // 文字の色を状態に応じて決定
    let textColor = params.inactiveColor as string || '#FFA500';
    if (isActive) {
      textColor = params.activeColor as string || '#FFA500';
    }
    
    if (shouldApplyGlitch && text && text.trim() !== '') {
      // GlitchEffectPrimitive使用
      const glitchPrimitive = new GlitchEffectPrimitive();
      
      const glitchParams: GlitchEffectParams = {
        enableGlitch: true,
        glitchBlockSize: params.glitchBlockSize as number || 8,
        glitchBlockCount: params.glitchBlockCount as number || 10,
        glitchUpdateInterval: params.glitchUpdateInterval as number || 100,
        glitchIntensity: params.glitchIntensity as number || 0.5,
        glitchColorShift: params.glitchColorShift as boolean ?? true,
        glitchThreshold: params.glitchThreshold as number || 0.3,
        glitchWaveSpeed: params.glitchWaveSpeed as number || 2.0,
        glitchRandomness: params.glitchRandomness as number || 0.5,
        nowMs: nowMs,
        text: text,
        fontSize: fontSize,
        fontFamily: fontFamily,
        textColor: textColor,
        id: params.id as string,
        intensity: params.glitchIntensity as number || 0.5
      };
      
      glitchPrimitive.applyEffect(container, glitchParams);
    } else {
      // 通常のテキスト描画
      const textObj = TextStyleFactory.createHighDPIText(text, {
        fontFamily: fontFamily,
        fontSize: fontSize,
        fill: textColor
      });
      
      textObj.anchor.set(0.5, 0.5);
      textObj.position.set(0, 0);
      
      container.addChild(textObj);
    }
    
    return true;
  }
  
  /**
   * 文字種別に応じたデフォルト文字間隔を取得
   */
  private getDefaultCharSpacing(text: string): number {
    if (!text || text.length === 0) {
      return 1.2;
    }
    
    let halfWidthCount = 0;
    let fullWidthCount = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);
      
      if (charCode >= 0x20 && charCode <= 0x7E) {
        halfWidthCount++;
      } else if (
        (charCode >= 0x3040 && charCode <= 0x309F) ||
        (charCode >= 0x30A0 && charCode <= 0x30FF) ||
        (charCode >= 0x4E00 && charCode <= 0x9FAF) ||
        (charCode >= 0xFF01 && charCode <= 0xFF5E)
      ) {
        fullWidthCount++;
      }
    }
    
    if (fullWidthCount > halfWidthCount) {
      return 1.0;
    } else if (halfWidthCount > 0) {
      return 0.7;
    } else {
      return 1.2;
    }
  }
  
  /**
   * イージング関数
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  private easeInCubic(t: number): number {
    return t * t * t;
  }
  
  /**
   * 従来のanimateメソッド（互換性のため）
   */
  animate(
    container: PIXI.Container,
    text: string | string[],
    x: number,
    y: number,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number
  ): boolean {
    let hierarchyType: HierarchyType = 'char';
    
    if (params.id) {
      const id = params.id as string;
      if (id.includes('phrase')) {
        hierarchyType = 'phrase';
      } else if (id.includes('word')) {
        hierarchyType = 'word';
      }
    }
    
    let phase: AnimationPhase = 'active';
    if (nowMs < startMs) {
      phase = 'in';
    } else if (nowMs > endMs) {
      phase = 'out';
    }
    
    return this.animateContainer!(
      container,
      text,
      params,
      nowMs,
      startMs,
      endMs,
      hierarchyType,
      phase
    );
  }
}