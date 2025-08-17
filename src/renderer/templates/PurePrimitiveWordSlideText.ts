/**
 * PurePrimitiveWordSlideText
 * 完全プリミティブベースの単語スライドテキストテンプレート
 * 単語配置ロジックをテンプレート側に一切実装せず、プリミティブに完全委譲
 */

import * as PIXI from 'pixi.js';
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import { DropShadowFilter } from 'pixi-filters';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata, ParameterConfig } from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { 
  GlowEffectPrimitive,
  SlideAnimationPrimitive,
  FlexibleCumulativeLayoutPrimitive,
  WordDisplayMode,
  type FlexibleCharacterData
} from '../primitives';

/**
 * 完全プリミティブベースの単語スライドテキスト
 */
export class PurePrimitiveWordSlideText implements IAnimationTemplate {
  
  readonly metadata: TemplateMetadata = {
    name: "PurePrimitiveWordSlideText",
    version: "1.0.0",
    description: "完全プリミティブベースの単語スライドテキスト - 単語配置をプリミティブに完全委譲",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "UTAVISTA Development Team",
      contribution: "完全プリミティブベース実装",
      date: "2025-08-09"
    }
  };
  
  /**
   * パラメータ設定
   */
  getParameterConfig(): ParameterConfig[] {
    return [
      // 基本パラメータ
      { name: "fontSize", type: "number", default: 32, min: 12, max: 128, step: 1 },
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
      { name: "activeTextColor", type: "color", default: "#FF0000" },
      { name: "completedTextColor", type: "color", default: "#800000" },
      
      // アニメーション設定
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "initialSpeed", type: "number", default: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: "finalSpeed", type: "number", default: 0.05, min: 0.01, max: 1.0, step: 0.01 },
      
      // エフェクト設定
      { name: "enableGlow", type: "boolean", default: true },
      { name: "glowStrength", type: "number", default: 2.0, min: 0.0, max: 10.0, step: 0.1 },
      { name: "glowBlur", type: "number", default: 6, min: 0, max: 20, step: 1 },
      { name: "glowColor", type: "color", default: "#FFFFFF" },
      { name: "enableShadow", type: "boolean", default: false },
      { name: "shadowDistance", type: "number", default: 5, min: 0, max: 20, step: 1 },
      { name: "shadowBlur", type: "number", default: 6, min: 0, max: 20, step: 1 },
      { name: "shadowColor", type: "color", default: "#000000" },
      { name: "shadowAlpha", type: "number", default: 0.5, min: 0.0, max: 1.0, step: 0.1 },
      
      // 合成モード設定
      { name: "blendMode", type: "string", default: "normal",
        options: ["normal", "add", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"] },
      
      // 画面中央からのオフセット（標準仕様）
      { name: "phraseOffsetX", type: "number", default: 0, min: -500, max: 500, step: 5 },
      { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 5 },
      
      // 単語表示モード設定（プリミティブ側から選択肢を取得）
      { 
        name: "wordDisplayMode", 
        type: "string", 
        default: "individual_word_entrance_same_line",
        get options() {
          return FlexibleCumulativeLayoutPrimitive.getWordDisplayModeValues();
        }
      },
      { name: "wordSpacing", type: "number", default: 1.0, min: 0.1, max: 5.0, step: 0.1 },
      { name: "lineHeight", type: "number", default: 1.2, min: 0, max: 3.0, step: 0.1 },
      
      // 単語アライメント設定
      { name: "wordOffsetX", type: "number", default: 0, min: -200, max: 200, step: 5 },
      { name: "wordOffsetY", type: "number", default: 0, min: -200, max: 200, step: 5 },
      { name: "randomPlacement", type: "boolean", default: true },
      { name: "randomSeed", type: "number", default: 0, min: 0, max: 1000, step: 1 },
      { name: "randomRangeX", type: "number", default: 200, min: 0, max: 1200, step: 20 },
      { name: "randomRangeY", type: "number", default: 200, min: 0, max: 1200, step: 20 },
      { name: "minDistanceFromPrevious", type: "number", default: 70, min: 0, max: 200, step: 10 },
      
      // 文字設定
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 }
    ];
  }
  
  /**
   * フェーズに応じたテキストカラーを取得
   */
  private getTextColorForPhase(
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number
  ): string {
    const defaultTextColor = params.textColor as string || '#808080';
    const activeTextColor = params.activeTextColor as string || '#FF0000';
    const completedTextColor = params.completedTextColor as string || '#800000';
    
    if (nowMs < startMs) {
      return defaultTextColor;
    } else if (nowMs <= endMs) {
      return activeTextColor;
    } else {
      return completedTextColor;
    }
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
   * 階層対応のアニメーションメソッド（完全プリミティブベース）
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
   * フレーズコンテナの描画（GlowEffectPrimitive完全活用）
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
    
    // SlideAnimationPrimitive使用してフレーズ位置計算
    const slideAnimationPrimitive = new SlideAnimationPrimitive();
    
    const phraseOffsetX = params.phraseOffsetX as number || 0;
    const phraseOffsetY = params.phraseOffsetY as number || 0;
    
    const slideResult = slideAnimationPrimitive.calculatePhrasePosition({
      phraseOffsetX: phraseOffsetX,
      phraseOffsetY: phraseOffsetY,
      fontSize: params.fontSize as number || 32,
      lineHeight: params.lineHeight as number || 1.2,
      headTime: params.headTime as number || 500,
      tailTime: params.tailTime as number || 500,
      initialSpeed: params.initialSpeed as number || 0.1,
      finalSpeed: params.finalSpeed as number || 0.05,
      randomPlacement: params.randomPlacement as boolean ?? true,  // デフォルトをtrueに変更
      randomSeed: params.randomSeed as number || 0,
      randomRangeX: params.randomRangeX as number || 200,
      randomRangeY: params.randomRangeY as number || 200,
      minDistanceFromPrevious: params.minDistanceFromPrevious as number || 70,
      text: text,
      words: params.words as any[] || [],  // params.wordsを使用するように修正
      nowMs,
      startMs,
      endMs,
      phase,
      wordIndex: 0,
      wordDisplayMode: params.wordDisplayMode as string || "individual_word_entrance_same_line",
      phraseId: params.id as string || `phrase_${startMs}_${text.substring(0, 10).replace(/\s/g, '_')}`
    });
    
    // フレーズコンテナの位置設定
    container.position.set(slideResult.x, slideResult.y);
    container.alpha = slideResult.alpha;
    container.visible = true;
    container.updateTransform();
    
    // 詳細位置情報ログ（全フレーズ対象）
    const phraseIdForLog = params.id as string || 'unknown';
    const currentTime = nowMs - startMs;
    
    // フレーズ開始から1秒間のみログ出力（過度な出力を防ぐ）
    if (currentTime >= 0 && currentTime <= 1000) {
      console.log(`[PurePrimitiveWordSlideText] PHRASE_POSITION: id="${phraseIdForLog}", time=${currentTime}ms, xy=(${slideResult.x.toFixed(1)}, ${slideResult.y.toFixed(1)}), alpha=${slideResult.alpha.toFixed(2)}`);
    }
    
    // Y座標の種類を追跡（グローバル変数に記録）
    if (!(window as any).__Y_COORDINATE_TRACKER__) {
      (window as any).__Y_COORDINATE_TRACKER__ = new Set();
    }
    (window as any).__Y_COORDINATE_TRACKER__.add(Math.round(slideResult.y * 10) / 10);
    
    // 追跡状況を定期的に報告
    if (Math.random() < 0.1) { // 10%の確率で状況報告
      const trackedYs = (window as any).__Y_COORDINATE_TRACKER__;
      console.log(`[PurePrimitiveWordSlideText] Y_COORDINATE_SUMMARY: ${trackedYs.size}種類のY座標を確認 [${Array.from(trackedYs).sort((a,b) => a-b).slice(0, 10).join(', ')}...]`);
    }
    
    // GlowEffectPrimitive使用
    const glowPrimitive = new GlowEffectPrimitive();
    
    // エフェクト設定
    const enableGlow = params.enableGlow as boolean ?? true;
    const enableShadow = params.enableShadow as boolean ?? false;
    const blendMode = params.blendMode as string || 'normal';
    
    if (enableGlow || enableShadow) {
      glowPrimitive.applyEffect(container, {
        enableGlow,
        enableShadow,
        blendMode,
        glow: enableGlow ? {
          intensity: 1.0,
          glowStrength: params.glowStrength as number || 2.0,
          glowBrightness: 1.2,
          glowBlur: params.glowBlur as number || 6,
          glowQuality: 8,
          glowPadding: 50,
          threshold: 0.2
        } : undefined,
        shadow: enableShadow ? {
          intensity: 1.0,
          shadowBlur: params.shadowBlur as number || 6,
          shadowColor: params.shadowColor as string || '#000000',
          shadowAngle: 45,
          shadowDistance: params.shadowDistance as number || 5,
          shadowAlpha: params.shadowAlpha as number || 0.5,
          shadowOnly: false
        } : undefined
      });
    }
    
    return true;
  }
  
  /**
   * 単語コンテナの描画（完全プリミティブ委譲）
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
    
    // SlideAnimationPrimitive使用して単語位置計算
    const slideAnimationPrimitive = new SlideAnimationPrimitive();
    
    const wordDisplayModeStr = params.wordDisplayMode as string || "individual_word_entrance_same_line";
    const wordIndex = params.wordIndex as number || 0;
    
    // 文字データの準備とwordIndex補完（累積オフセット計算前に実行）
    const charsData = params.chars as FlexibleCharacterData[];
    let correctedCharsData: FlexibleCharacterData[] = [];
    
    if (charsData && Array.isArray(charsData) && charsData.length > 0) {
      // wordIndexが未設定の場合は補完
      const currentWordIndex = params.wordIndex as number || 0;
      correctedCharsData = charsData.map(charData => ({
        ...charData,
        wordIndex: charData.wordIndex !== undefined ? charData.wordIndex : currentWordIndex
      }));
      
      console.log(`[PurePrimitiveWordSlideText] Original chars data ALL:`, charsData.map(c => ({ id: c.id, char: c.char, wordIndex: c.wordIndex })));
      console.log(`[PurePrimitiveWordSlideText] Corrected chars data ALL:`, correctedCharsData.map(c => ({ id: c.id, char: c.char, wordIndex: c.wordIndex })));
    }
    
    // same_lineモード用の累積文字オフセット計算はプリミティブ側で実行
    
    const wordAnimationResult = slideAnimationPrimitive.calculateWordPosition({
      fontSize: params.fontSize as number || 32,
      lineHeight: params.lineHeight as number || 1.2,
      headTime: params.headTime as number || 500,
      entranceInitialSpeed: params.initialSpeed as number || 0.1,
      activeSpeed: params.finalSpeed as number || 0.05,
      rightOffset: params.wordOffsetX as number || 0,
      wordIndex: wordIndex,
      nowMs,
      startMs,
      endMs,
      phase: phase === 'in' ? 'in' : phase === 'out' ? 'out' : 'active',
      wordAlignment: 'trailing_align',
      firstWordFinalX: 0,
      wordDisplayMode: wordDisplayModeStr,  // 単語表示モードを渡す
      charSpacing: params.charSpacing as number || 1.0,  // 文字間隔
      wordSpacing: params.wordSpacing as number || 1.0,   // 単語間隔
      phraseContainer: container.parent  // フレーズコンテナの参照を渡す
    });
    
    // 単語コンテナの位置設定（NaN値のチェックと修正）
    const validX = isNaN(wordAnimationResult.x) ? 0 : wordAnimationResult.x;
    const validY = isNaN(wordAnimationResult.y) ? 0 : wordAnimationResult.y;
    const validAlpha = isNaN(wordAnimationResult.alpha) ? 1 : Math.max(0, Math.min(1, wordAnimationResult.alpha));
    
    container.position.set(validX, validY);
    container.alpha = validAlpha;
    container.visible = true;
    container.updateTransform();
    
    // エラー時のみログ出力
    if (isNaN(wordAnimationResult.x) || isNaN(wordAnimationResult.y) || isNaN(wordAnimationResult.alpha)) {
      console.warn(`[PurePrimitiveWordSlideText] Word container had NaN values - original: (${wordAnimationResult.x}, ${wordAnimationResult.y}), alpha=${wordAnimationResult.alpha}, corrected to: (${validX}, ${validY}), alpha=${validAlpha}`);
    }
    
    // FlexibleCumulativeLayoutPrimitive使用して文字コンテナ管理
    const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
    
    if (!correctedCharsData || correctedCharsData.length === 0) {
      return true;
    }
    
    // 単語表示モードの決定
    let wordDisplayMode: WordDisplayMode;
    
    switch (wordDisplayModeStr) {
      case "individual_word_entrance_same_line":
        wordDisplayMode = WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_SAME_LINE;
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
        wordDisplayMode = WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_SAME_LINE;
        break;
    }
    
    // フレーズ一括入場モードの場合のタイミング制御パラメータ
    const isPhraseCumulativeMode = wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE || 
                                   wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
    
    const layoutParams = {
      charSpacing: params.charSpacing as number || 1.0,
      fontSize: params.fontSize as number || 32,
      halfWidthSpacingRatio: 0.6,
      alignment: 'left' as const,
      containerSize: { width: 0, height: 0 },
      spacing: params.charSpacing as number || 1.0,
      chars: correctedCharsData,
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
        // 文字アニメーションの適用（プリミティブベース）
        this.animateContainer!(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars,
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
    
    return true;
  }
  
  /**
   * 文字コンテナの描画（完全プリミティブベース）
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
    
    // フレーズ一括入場モードかどうかを判定
    const wordDisplayModeStr = params.wordDisplayMode as string || "individual_word_entrance_same_line";
    const isPhraseCumulativeMode = wordDisplayModeStr === "phrase_cumulative_same_line" || 
                                   wordDisplayModeStr === "phrase_cumulative_new_line";
    
    console.log(`[PurePrimitiveWordSlideText] renderCharContainer: char="${text}", wordDisplayMode="${wordDisplayModeStr}", isPhraseCumulativeMode=${isPhraseCumulativeMode}`);
    
    // フレーズ一括入場モードの場合は、プリミティブ側の制御を完全に委譲し、
    // テキストオブジェクトが存在する場合は再作成を避ける
    if (isPhraseCumulativeMode && container.children.length > 0) {
      // 既存のテキストオブジェクトの色のみ更新
      container.children.forEach(child => {
        if (child instanceof PIXI.Text) {
          const textColor = this.getTextColorForPhase(params, nowMs, startMs, endMs);
          child.style.fill = textColor;
        }
      });
      return true;
    }
    
    // 既存のテキストオブジェクトをクリア（毎フレーム新規作成または個別入場モード）
    container.removeChildren();
    
    // 基本パラメータ取得
    const fontSize = params.fontSize as number || 32;
    const fontFamily = params.fontFamily as string;
    
    // フォントファミリーチェック
    if (!fontFamily) {
      console.error('[PurePrimitiveWordSlideText] fontFamilyパラメータが指定されていません');
      return false;
    }
    
    // カラーパラメータ
    const defaultTextColor = params.textColor as string || '#808080';
    const activeTextColor = params.activeTextColor as string || '#FF0000';
    const completedTextColor = params.completedTextColor as string || '#800000';
    
    // 表示状態の制御
    if (!isPhraseCumulativeMode) {
      // 個別入場モードの場合は常に表示（従来の動作）
      container.visible = true;
      container.alpha = 1;
    }
    // フレーズ一括入場モードの場合は、プリミティブ側の制御値をそのまま保持
    
    // テキストカラーを計算
    const textColor = this.getTextColorForPhase(params, nowMs, startMs, endMs);
    
    // テキストオブジェクト作成
    const textObj = TextStyleFactory.createHighDPIText(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor
    });
    
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    
    container.addChild(textObj);
    
    // デバッグログ出力（最小限に）
    const hasNaNPosition = isNaN(container.worldTransform.tx) || isNaN(container.worldTransform.ty);
    const isFirstChar = (params.charIndex as number || 0) === 0;
    
    if (hasNaNPosition) {
      console.error(`[PurePrimitiveWordSlideText] NaN position detected for char "${text}"`);
    } else if (isFirstChar && !isPhraseCumulativeMode) {
      // フレーズ一括入場モードでない場合のみ成功ログ表示
      console.log(`[PurePrimitiveWordSlideText] Successfully rendered first char "${text}" at world position (${container.worldTransform.tx}, ${container.worldTransform.ty})`);
    }
    
    return true;
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