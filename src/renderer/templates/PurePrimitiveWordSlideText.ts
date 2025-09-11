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
  SparkleEffectPrimitive,
  WordDisplayMode,
  type FlexibleCharacterData,
  type SparkleEffectParams
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

  // レンダリングキャッシュ
  private renderCache = new Map<string, {
    textObject: PIXI.Text;
    lastParams: string;
    lastPhase: AnimationPhase;
    lastNowMs: number;
  }>();
  
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
      { name: "phraseOffsetX", type: "number", default: 0, min: -1000, max: 1000, step: 5 },
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
      { name: "wordOffsetX", type: "number", default: 0, min: -2000, max: 200, step: 5 },
      { name: "wordSlideDistance", type: "number", default: -1, min: -2000, max: 500, step: 10 },  // -1 = 自動計算
      
      // キラキラエフェクト設定
      { name: "enableSparkle", type: "boolean", default: true },
      { name: "sparkleCount", type: "number", default: 4, min: 1, max: 20, step: 1 },
      { name: "sparkleSize", type: "number", default: 20, min: 4, max: 40, step: 1 },
      { name: "sparkleColor", type: "color", default: "#FFD700" },
      { name: "sparkleStarSpikes", type: "number", default: 5, min: 3, max: 12, step: 1 },
      { name: "sparkleScale", type: "number", default: 1.0, min: 0.5, max: 5.0, step: 0.1 },
      { name: "sparkleDuration", type: "number", default: 1500, min: 500, max: 3000, step: 100 },
      { name: "sparkleRadius", type: "number", default: 30, min: 10, max: 100, step: 5 },
      { name: "sparkleAnimationSpeed", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "sparkleAlphaDecay", type: "number", default: 0.98, min: 0.5, max: 0.99, step: 0.01 },
      { name: "sparkleRotationSpeed", type: "number", default: 0.3, min: 0.0, max: 2.0, step: 0.1 },
      { name: "sparkleGenerationRate", type: "number", default: 2.0, min: 0.5, max: 10.0, step: 0.5 },
      { name: "sparkleVelocityCoefficient", type: "number", default: 1.0, min: 0.0, max: 3.0, step: 0.1 },
      
      // パーティクルグローエフェクト設定
      { name: "enableParticleGlow", type: "boolean", default: false },
      { name: "particleGlowStrength", type: "number", default: 1.2, min: 0.1, max: 5.0, step: 0.1 },
      { name: "particleGlowBrightness", type: "number", default: 1.1, min: 0.5, max: 3.0, step: 0.1 },
      { name: "particleGlowBlur", type: "number", default: 4, min: 1, max: 20, step: 1 },
      { name: "particleGlowQuality", type: "number", default: 6, min: 2, max: 32, step: 1 },
      { name: "particleGlowThreshold", type: "number", default: 0.1, min: 0.0, max: 1.0, step: 0.1 },
      
      // パーティクル瞬きエフェクト設定
      { name: "enableTwinkle", type: "boolean", default: false },
      { name: "twinkleFrequency", type: "number", default: 0.5, min: 0.1, max: 5.0, step: 0.1 },
      { name: "twinkleBrightness", type: "number", default: 2.5, min: 1.0, max: 10.0, step: 0.5 },
      { name: "twinkleDuration", type: "number", default: 100, min: 50, max: 500, step: 10 },
      { name: "twinkleProbability", type: "number", default: 0.3, min: 0.0, max: 1.0, step: 0.1 },
      
      // パーティクルサイズ縮小エフェクト設定
      { name: "enableSizeShrink", type: "boolean", default: false },
      { name: "sizeShrinkRate", type: "number", default: 1.0, min: 0.0, max: 3.0, step: 0.1 },
      { name: "sizeShrinkRandomRange", type: "number", default: 0.0, min: 0.0, max: 1.0, step: 0.1 },
      
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
   * テンプレートの内部状態をクリーンアップ
   * テンプレート切り替え時に呼び出される
   */
  cleanup(): void {
    console.log('[PurePrimitiveWordSlideText] Cleaning up internal state');
    
    // レンダリングキャッシュのクリア
    this.renderCache.clear();
    
    // SparkleEffectPrimitive の全状態クリーンアップ
    SparkleEffectPrimitive.cleanup();
    
    console.log('[PurePrimitiveWordSlideText] Cleanup complete');
  }

  /**
   * 表示要素のみを削除するメソッド
   */
  removeVisualElements(container: PIXI.Container): void {
    // プリミティブ一貫管理システムでは、
    // コンテナ構造は Engine/InstanceManager で管理され、
    // テンプレートは既存のコンテナに描画するだけなので
    // removeVisualElementsでの削除処理は不要
    //
    // レンダリングキャッシュのクリアも不要
    // （キャッシュは適切なタイミングで管理される）
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
    // removeVisualElementsの呼び出しを削除
    // プリミティブ管理システムではコンテナ構造は保持される
    
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
    
    // フレーズ終了時刻をパラメータに設定（下位階層で使用）
    params.phraseEndMs = endMs;
    
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
    // if (currentTime >= 0 && currentTime <= 1000) {
    //   console.log(`[PurePrimitiveWordSlideText] PHRASE_POSITION: id="${phraseIdForLog}", time=${currentTime}ms, xy=(${slideResult.x.toFixed(1)}, ${slideResult.y.toFixed(1)}), alpha=${slideResult.alpha.toFixed(2)}, offsetX=${phraseOffsetX}, offsetY=${phraseOffsetY}`);
    // }
    
    // Y座標の種類を追跡（グローバル変数に記録）
    if (!(window as any).__Y_COORDINATE_TRACKER__) {
      (window as any).__Y_COORDINATE_TRACKER__ = new Set();
    }
    (window as any).__Y_COORDINATE_TRACKER__.add(Math.round(slideResult.y * 10) / 10);
    
    // 追跡状況を定期的に報告
    // if (Math.random() < 0.1) { // 10%の確率で状況報告
    //   const trackedYs = (window as any).__Y_COORDINATE_TRACKER__;
    //   console.log(`[PurePrimitiveWordSlideText] Y_COORDINATE_SUMMARY: ${trackedYs.size}種類のY座標を確認 [${Array.from(trackedYs).sort((a,b) => a-b).slice(0, 10).join(', ')}...]`);
    // }
    
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
      
      // console.log(`[PurePrimitiveWordSlideText] Original chars data ALL:`, charsData.map(c => ({ id: c.id, char: c.char, wordIndex: c.wordIndex })));
      // console.log(`[PurePrimitiveWordSlideText] Corrected chars data ALL:`, correctedCharsData.map(c => ({ id: c.id, char: c.char, wordIndex: c.wordIndex })));
    }
    
    // same_lineモード用の累積文字オフセット計算はプリミティブ側で実行
    
    const wordAnimationResult = slideAnimationPrimitive.calculateWordPosition({
      fontSize: params.fontSize as number || 32,
      lineHeight: params.lineHeight as number || 1.2,
      headTime: params.headTime as number || 500,
      entranceInitialSpeed: params.initialSpeed as number || 0.1,
      activeSpeed: params.finalSpeed as number || 0.05,
      wordOffsetX: params.wordOffsetX as number || 0,
      wordSlideDistance: params.wordSlideDistance as number || -1,  // -1 = 自動計算
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
    
    // 全単語の拡張ID情報を生成（正確なオフセット計算用）
    const fullId = params.phraseId as string || params.id as string || 'phrase_unknown';
    // フレーズIDのみを抽出（word部分が含まれている場合は除去）
    const phraseId = this.extractPhraseIdFromFullId(fullId);
    // console.log(`[PurePrimitiveWordSlideText] デバッグ: fullId=${fullId}, extractedPhraseId=${phraseId}`);
    const allWordExtendedIds = this.generateAllWordExtendedIds(params.words as any[], phraseId);

    // デバッグ：PurePrimitiveWordSlideTextでのwordSpacing値確認
    const actualWordSpacing = params.wordSpacing as number || 1.0;
    // console.log(`[PurePrimitiveWordSlideText] wordSpacing: 受け取った値=${params.wordSpacing}, 使用する値=${actualWordSpacing}, wordDisplayMode=${wordDisplayModeStr}`);
    
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
      wordSpacing: actualWordSpacing,
      lineHeight: params.lineHeight as number || 1.2,
      // 全単語の拡張ID情報を追加
      allWordExtendedIds: allWordExtendedIds,
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
        
        // レイアウト後にスパークルエフェクトを適用
        this.applySparkleEffectAfterLayout(charContainer, charData.char, params, nowMs, charData.start, charData.end, charData.charIndex, params.phraseEndMs as number);
      }
    );
    
    return true;
  }
  
  /**
   * レイアウト後のスパークルエフェクト適用
   */
  private applySparkleEffectAfterLayout(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    charIndex: number,
    phraseEndMs?: number
  ): void {
    if (!(params.enableSparkle as boolean)) {
      return;
    }
    
    // キラキラエフェクトの管理（文字座標中心版）
    const sparklePrimitive = new SparkleEffectPrimitive();
    
    // ワールド変換を強制更新してから座標を取得
    if (container.parent) {
      container.parent.updateTransform();
    }
    container.updateTransform();
    
    // 複数の方法で座標を取得して確実性を高める
    const bounds = container.getBounds();
    const globalPosition = {
      x: bounds.x + bounds.width / 2,  // 中心座標を計算
      y: bounds.y + bounds.height / 2
    };
    
    // フォールバック: transform座標も確認
    const transformPos = {
      x: container.worldTransform.tx,
      y: container.worldTransform.ty
    };
    
    // console.log(`[CharPositionAfterLayout] Char "${text}" bounds: (${bounds.x.toFixed(1)}, ${bounds.y.toFixed(1)}) size: ${bounds.width.toFixed(1)}x${bounds.height.toFixed(1)}`);
    // console.log(`[CharPositionAfterLayout] Char "${text}" transform: (${transformPos.x.toFixed(1)}, ${transformPos.y.toFixed(1)}) final: (${globalPosition.x.toFixed(1)}, ${globalPosition.y.toFixed(1)})`);
    
    // 文字特定のための一意ID生成
    const phraseId = params.phraseId as string || 'phrase';
    const wordId = params.wordId as string || 'word';
    const charId = `${phraseId}_${wordId}_${charIndex}_${text}`;
    
    const sparkleParams: SparkleEffectParams = {
      enableSparkle: (params.enableSparkle as boolean !== false), 
      sparkleCount: params.sparkleCount as number || 4,
      sparkleSize: params.sparkleSize as number || 20,
      sparkleColor: params.sparkleColor as string || '#FFD700',
      sparkleStarSpikes: params.sparkleStarSpikes as number || 5,
      sparkleScale: params.sparkleScale as number || 1.0,
      sparkleDuration: params.sparkleDuration as number || 1500,
      sparkleRadius: params.sparkleRadius as number || 30,
      sparkleAnimationSpeed: params.sparkleAnimationSpeed as number || 1.0,
      sparkleAlphaDecay: params.sparkleAlphaDecay as number || 0.98,
      sparkleRotationSpeed: params.sparkleRotationSpeed as number || 0.3,
      sparkleGenerationRate: params.sparkleGenerationRate as number || 2.0,
      sparkleVelocityCoefficient: params.sparkleVelocityCoefficient as number || 1.0,
      nowMs,
      startMs,
      endMs,
      phraseEndMs: phraseEndMs, // フレーズ全体の終了時刻
      tailTime: params.tailTime as number || 500, // フレーズのtailtime
      text,
      globalPosition: globalPosition,
      // 文字識別情報（決定論的シード生成用）
      phraseId: phraseId,
      wordId: wordId,
      charIndex: charIndex,
      charId: charId,
      intensity: 1.0,
      // パーティクルグローエフェクト設定
      enableParticleGlow: params.enableParticleGlow as boolean || false,
      particleGlowStrength: params.particleGlowStrength as number || 1.2,
      particleGlowBrightness: params.particleGlowBrightness as number || 1.1,
      particleGlowBlur: params.particleGlowBlur as number || 4,
      particleGlowQuality: params.particleGlowQuality as number || 6,
      particleGlowThreshold: params.particleGlowThreshold as number || 0.1,
      
      // パーティクル瞬きエフェクト設定
      enableTwinkle: params.enableTwinkle as boolean ?? true,
      twinkleFrequency: params.twinkleFrequency as number || 1.0,
      twinkleBrightness: params.twinkleBrightness as number || 3.0,
      twinkleDuration: params.twinkleDuration as number || 120,
      twinkleProbability: params.twinkleProbability as number || 0.8,
      
      // パーティクルサイズ縮小エフェクト設定
      enableSizeShrink: params.enableSizeShrink as boolean || false,
      sizeShrinkRate: params.sizeShrinkRate as number || 1.0,
      sizeShrinkRandomRange: params.sizeShrinkRandomRange as number || 0.0
    };
    
    sparklePrimitive.applyEffect(container, sparkleParams);
    
    // console.log(`[SparkleAfterLayout] Applied sparkle effect to char "${text}" (index: ${charIndex}) at global pos (${globalPosition.x.toFixed(1)}, ${globalPosition.y.toFixed(1)})`);
  }
  
  /**
   * 文字コンテナの描画（完全プリミティブベース + レンダリングキャッシュ）
   */
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
    
    // キャッシュキーを生成
    const cacheKey = `${container.name || 'unknown'}_${text}`;
    
    // パラメータハッシュを生成（レンダリングに影響するパラメータのみ）
    const relevantParams = {
      fontSize: params.fontSize,
      fontFamily: params.fontFamily,
      textColor: params.textColor,
      activeTextColor: params.activeTextColor,
      completedTextColor: params.completedTextColor,
      enableGlow: params.enableGlow,
      glowStrength: params.glowStrength,
      glowColor: params.glowColor,
      enableShadow: params.enableShadow,
      shadowDistance: params.shadowDistance,
      shadowColor: params.shadowColor,
      blendMode: params.blendMode
    };
    const paramsHash = JSON.stringify(relevantParams);
    
    // キャッシュチェック
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
    
    // フレーズ一括入場モードかどうかを判定
    const wordDisplayModeStr = params.wordDisplayMode as string || "individual_word_entrance_same_line";
    const isPhraseCumulativeMode = wordDisplayModeStr === "phrase_cumulative_same_line" || 
                                   wordDisplayModeStr === "phrase_cumulative_new_line";
    
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
    
    // レンダリングキャッシュに保存
    this.renderCache.set(cacheKey, {
      textObject: textObj,
      lastParams: paramsHash,
      lastPhase: phase,
      lastNowMs: nowMs
    });
    
    // NOTE: スパークルエフェクトはレイアウト後に applySparkleEffectAfterLayout() で適用
    
    // デバッグログ出力（最小限に）
    const hasNaNPosition = isNaN(container.worldTransform.tx) || isNaN(container.worldTransform.ty);
    const isFirstChar = (params.charIndex as number || 0) === 0;
    
    if (hasNaNPosition) {
      console.error(`[PurePrimitiveWordSlideText] NaN position detected for char "${text}"`);
    } else if (isFirstChar && !isPhraseCumulativeMode) {
      // フレーズ一括入場モードでない場合のみ成功ログ表示
      // console.log(`[PurePrimitiveWordSlideText] Successfully rendered first char "${text}" at world position (${container.worldTransform.tx}, ${container.worldTransform.ty})`);
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

  /**
   * 全単語の拡張ID情報を生成
   */
  private generateAllWordExtendedIds(words: any[], phraseId: string): string[] {
    if (!words || !Array.isArray(words)) {
      return [];
    }

    return words.map((word, wordIndex) => {
      if (!word.chars || !Array.isArray(word.chars)) {
        // 文字データが不足している場合は推定しない（エラーハンドリング）
        console.warn(`[PurePrimitiveWordSlideText] 単語${wordIndex}の文字データが不足しています。`);
        return `${phraseId}_word_${wordIndex}_h0f0`;
      }

      // 文字から半角・全角数をカウント
      let halfWidth = 0;
      let fullWidth = 0;
      
      word.chars.forEach((char: any) => {
        if (char.char && this.isHalfWidthChar(char.char)) {
          halfWidth++;
        } else if (char.char) {
          fullWidth++;
        }
      });

      // 拡張ID形式で生成（実際のフレーズIDを使用）
      return `${phraseId}_word_${wordIndex}_h${halfWidth}f${fullWidth}`;
    });
  }

  /**
   * 半角文字判定
   */
  private isHalfWidthChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
  }

  /**
   * フルIDからフレーズIDのみを抽出
   * 例: "phrase_2_word_2_h0f5" → "phrase_2"
   */
  private extractPhraseIdFromFullId(fullId: string): string {
    // "_word_" が含まれている場合は、その前の部分のみを取得
    const wordIndex = fullId.indexOf('_word_');
    if (wordIndex !== -1) {
      return fullId.substring(0, wordIndex);
    }
    
    // "_word_" が含まれていない場合はそのまま返す
    return fullId;
  }
}