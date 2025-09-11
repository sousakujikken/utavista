/**
 * BlinkFadeTextPrimitive v2.0 - 完全プリミティブ対応版
 * 点滅フェードテキストの完全プリミティブ API 準拠実装
 * v2.0: 全プリミティブAPI完全対応、v0.4.3共通仕様準拠
 */

import * as PIXI from 'pixi.js';
import { 
  IAnimationTemplate, 
  HierarchyType, 
  AnimationPhase, 
  TemplateMetadata, 
  ParameterConfig 
} from '../types/types';
import { 
  FlexibleCumulativeLayoutPrimitive, 
  WordDisplayMode,
  type FlexibleCharacterData 
} from '../primitives/layout/FlexibleCumulativeLayoutPrimitive';
import { MultiLineLayoutPrimitive } from '../primitives/layout/MultiLineLayoutPrimitive';
import { GlowEffectPrimitive } from '../primitives/effects/GlowEffectPrimitive';
import { SlideAnimationPrimitive } from '../primitives/animation/SlideAnimationPrimitive';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { FontService } from '../services/FontService';
import { getLogicalStageSize, applyFallbackPosition, logCoordinates } from '../utils/StageUtils';

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
 * BlinkFadeTextPrimitive v2.0
 * 完全プリミティブ対応の点滅フェードテキスト実装
 * - FlexibleCumulativeLayoutPrimitive: 全4つの単語表示モード対応
 * - MultiLineLayoutPrimitive: 段管理機能
 * - GlowEffectPrimitive: v0.4.3共通仕様のシャドウ・グローエフェクト
 * - SlideAnimationPrimitive: 画面中心基準配置とスライドアニメーション
 * - WordSlideTextPrimitive互換: 文字表示継続性の維持
 */
export class BlinkFadeTextPrimitive_v2 implements IAnimationTemplate {
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
    name: "BlinkFadeTextPrimitive_v2",
    version: "2.0.0",
    description: "完全プリミティブ対応の点滅フェードテキスト。全プリミティブAPI準拠、v0.4.3共通仕様対応。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Claude AI Assistant",
      contribution: "完全プリミティブ対応版点滅フェードテキスト実装（v0.4.3共通仕様準拠）",
      date: "2025-01-10"
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
      
      // v0.4.3標準: 画面中心からのオフセット
      { name: "phraseOffsetX", type: "number", default: 0, min: -1000, max: 1000, step: 10 },
      { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 10 },
      
      // FlexibleCumulativeLayoutPrimitive: 単語表示モード
      { 
        name: "wordDisplayMode", 
        type: "string", 
        default: "phrase_cumulative_same_line",
        get options() { return FlexibleCumulativeLayoutPrimitive.getWordDisplayModeValues(); }
      },
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "wordSpacing", type: "number", default: 1.0, min: 0.1, max: 5.0, step: 0.1 },
      
      // 単語アライメント設定
      { name: "wordOffsetX", type: "number", default: 0, min: -2000, max: 200, step: 5 },
      { name: "wordSlideDistance", type: "number", default: -1, min: -2000, max: 500, step: 10 },  // -1 = 自動計算
      
      // MultiLineLayoutPrimitive: 段管理設定
      { name: "totalLines", type: "number", default: 4, min: 2, max: 8, step: 1 },
      { name: "lineHeight", type: "number", default: 1.2, min: 0.5, max: 3.0, step: 0.1 },
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
      
      // SlideAnimationPrimitive: スライドアニメーション設定
      { name: "headTime", type: "number", default: 800, min: 0, max: 3000, step: 100 },
      { name: "tailTime", type: "number", default: 1000, min: 0, max: 3000, step: 100 },
      { name: "entranceInitialSpeed", type: "number", default: 8.0, min: 0, max: 50, step: 1 },
      { name: "activeSpeed", type: "number", default: 0.8, min: 0, max: 10, step: 0.1 },
      { name: "rightOffset", type: "number", default: 200, min: 0, max: 500, step: 10 },
      
      // GlowEffectPrimitive: v0.4.3共通仕様（グローエフェクト）
      { name: "enableGlow", type: "boolean", default: true },
      { name: "glowStrength", type: "number", default: 1.5, min: 0, max: 5, step: 0.1 },
      { name: "glowBrightness", type: "number", default: 1.2, min: 0.5, max: 3, step: 0.1 },
      { name: "glowBlur", type: "number", default: 6, min: 0.1, max: 20, step: 0.1 }, // ★v0.4.3共通仕様
      { name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1 },
      
      // GlowEffectPrimitive: v0.4.3共通仕様（シャドウエフェクト）
      { name: "enableShadow", type: "boolean", default: false },
      { name: "shadowBlur", type: "number", default: 6, min: 0, max: 50, step: 0.5 }, // ★v0.4.3共通仕様
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

  /**
   * WordSlideTextPrimitive互換のremoveVisualElements実装
   * v3.1スリープ復帰対策準拠
   */
  removeVisualElements(container: PIXI.Container): void {
    // 1. フィルターのクリーンアップを最初に行う（スリープ復帰対策）
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

  /**
   * フレーズコンテナの描画
   * SlideAnimationPrimitive + MultiLineLayoutPrimitive + GlowEffectPrimitive使用
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
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      applyFallbackPosition(container);
      return true;
    }

    const { width: screenWidth, height: screenHeight } = getLogicalStageSize();
    
    // SlideAnimationPrimitiveを使用してフレーズ位置計算
    const phrasePosition = this.slideAnimationPrimitive.calculatePhrasePosition({
      phraseOffsetX: params.phraseOffsetX as number || 0,
      phraseOffsetY: params.phraseOffsetY as number || 0,
      fontSize: params.fontSize as number || 120,
      lineHeight: params.lineHeight as number || 1.2,
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
    
    // フレーズコンテナの位置設定
    // SlideAnimationPrimitiveが既に画面中央を基準とした座標を返している
    container.position.set(phrasePosition.x, phrasePosition.y);
    container.alpha = phrasePosition.alpha;
    
    // デバッグ用座標ログ
    logCoordinates(
      'BlinkFadeTextPrimitive_v2', 
      container.name || 'unnamed_phrase', 
      { x: phrasePosition.x, y: phrasePosition.y },
      { x: params.phraseOffsetX as number || 0, y: params.phraseOffsetY as number || 0 },
      { phase, alpha: phrasePosition.alpha }
    );
    
    // GlowEffectPrimitiveを使用してエフェクト適用（v0.4.3共通仕様）
    this.glowEffectPrimitive.applyEffect(container, {
      enableGlow: params.enableGlow as boolean ?? true,
      enableShadow: params.enableShadow as boolean ?? false,
      blendMode: params.blendMode as string || 'normal',
      glowStrength: params.glowStrength as number || 1.5,
      glowBrightness: params.glowBrightness as number || 1.2,
      glowBlur: params.glowBlur as number || 6,          // v0.4.3共通仕様
      glowQuality: params.glowQuality as number || 8,
      shadowBlur: params.shadowBlur as number || 6,      // v0.4.3共通仕様
      shadowColor: params.shadowColor as string || '#000000',
      shadowAngle: params.shadowAngle as number || 45,
      shadowDistance: params.shadowDistance as number || 8,
      shadowAlpha: params.shadowAlpha as number || 0.8,
      screenWidth,
      screenHeight
    });
    
    // 単語コンテナの管理（PurePrimitiveWordSlideText互換）
    // 注: 単語コンテナはFlexibleCumulativeLayoutPrimitiveが管理するため、
    // フレーズコンテナ側では作成のみ行う
    
    container.visible = true;
    container.updateTransform();
    
    return true;
  }

  /**
   * 単語コンテナの描画
   * FlexibleCumulativeLayoutPrimitive + SlideAnimationPrimitive使用
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
    // wordDisplayModeの取得
    const wordDisplayModeStr = params.wordDisplayMode as string || "phrase_cumulative_same_line";
    const isSameLineMode = wordDisplayModeStr.includes('same_line');
    
    // 単語位置の計算
    let wordX = 0;
    
    if (isSameLineMode) {
      // same_lineモードでは単語コンテナは(0,0)に配置
      // FlexibleCumulativeLayoutPrimitiveが実際の文字配置を管理
      // wordOffsetXはFlexibleCumulativeLayoutPrimitive内で適用される
      wordX = params.wordOffsetX as number || 0;
    }
    
    container.position.set(wordX, 0);
    container.visible = true;
    
    // フレーズ時間の強制継承設定
    const forcedPhraseStartMs = params.phraseStartMs as number || startMs;
    const forcedPhraseEndMs = params.phraseEndMs as number || endMs;
    
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
      
      // wordDisplayModeの変換
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
      
      // 全単語の拡張ID情報を生成（正確なオフセット計算用）
      const fullId = params.phraseId as string || params.id as string || 'phrase_unknown';
      // フレーズIDのみを抽出（word部分が含まれている場合は除去）
      const phraseId = this.extractPhraseIdFromFullId(fullId);
      console.log(`[BlinkFadeTextPrimitive_v2] デバッグ: fullId=${fullId}, extractedPhraseId=${phraseId}`);
      const allWordExtendedIds = this.generateAllWordExtendedIds(params.words as any[], phraseId);
      
      // レイアウトパラメータの設定
      const layoutParams = {
        charSpacing: params.charSpacing as number || 1.0,
        fontSize: params.fontSize as number || 120,
        halfWidthSpacingRatio: 0.6,
        alignment: 'left' as const,
        containerSize: { width: 0, height: 0 },
        spacing: params.charSpacing as number || 1.0,
        chars: flexibleCharsData,
        containerPrefix: 'char_container_',
        wordDisplayMode: wordDisplayMode,
        wordSpacing: params.wordSpacing as number || 1.0,
        lineHeight: params.lineHeight as number || 1.2,
        // 全単語の拡張ID情報を追加
        allWordExtendedIds: allWordExtendedIds,
        // フレーズ一括入場モードの場合のみタイミング制御パラメータを追加
        ...(isPhraseCumulativeMode && {
          phraseTimingControl: {
            nowMs: nowMs,
            phraseStartMs: forcedPhraseStartMs,
            phraseEndMs: forcedPhraseEndMs,
            headTime: params.headTime as number || 800,
            tailTime: params.tailTime as number || 1000
          }
        })
      };
      
      // フレーズ内全文字の時間範囲を算出
      const allCharStartTimes = flexibleCharsData.map(char => char.start);
      const allCharEndTimes = flexibleCharsData.map(char => char.end);
      const minCharStart = Math.min(...allCharStartTimes);
      const maxCharEnd = Math.max(...allCharEndTimes);
      const originalDuration = maxCharEnd - minCharStart;
      
      // フレーズ入場時間の定義
      const preInDuration = params.preInDuration as number || 1500;
      const phraseEntranceStart = forcedPhraseStartMs - preInDuration;
      const phraseEntranceEnd = forcedPhraseStartMs;
      const targetDuration = phraseEntranceEnd - phraseEntranceStart;
      
      // 時間変換比率の計算（ゼロ除算対策）
      const timeScale = originalDuration > 0 ? targetDuration / originalDuration : 1.0;
      
      // 单語ごとに1回だけログ出力するためのフラグ
      const wordLogKey = `__wordProcessed_${params.wordIndex}`;
      if (!container[wordLogKey]) {
        console.log(`[BlinkFadeTextPrimitive_v2] Word ${params.wordIndex}: Time transformation original=${originalDuration}ms -> target=${targetDuration}ms (scale=${timeScale.toFixed(3)})`);
        (container as any)[wordLogKey] = true;
      }
      
      // FlexibleCumulativeLayoutPrimitiveを使用して文字コンテナを管理
      this.flexibleLayoutPrimitive.manageCharacterContainersFlexible(
        container,
        layoutParams,
        (charContainer, charData) => {
          // wordOffsetXを全文字に適用（フレーズ全体をオフセット）
          if (params.wordOffsetX) {
            const currentX = charContainer.position.x;
            charContainer.position.x = currentX + (params.wordOffsetX as number);
          }
          
          // 文字アニメーションの適用 - フレーズ入場時間への時間変換
          // プリミティブがフレーズタイミングで上書きしたデータを元に戻す
          const originalCharData = flexibleCharsData.find(original => original.id === charData.id);
          const actualCharStartMs = originalCharData ? originalCharData.start : charData.start;
          const actualCharEndMs = originalCharData ? originalCharData.end : charData.end;
          
          // 時間変換: 全文字がフレーズ入場時間内に収まるように比率計算
          const transformedStartMs = phraseEntranceStart + (actualCharStartMs - minCharStart) * timeScale;
          const transformedEndMs = phraseEntranceStart + (actualCharEndMs - minCharStart) * timeScale;
          
          // 初回のみデバッグ情報を出力（最初の文字のみ）
          if (!charContainer.__debugLogged && charData.charIndex === 0) {
            console.log(`[BlinkFadeTextPrimitive_v2] Timing transformation applied for ${flexibleCharsData.length} chars`);
            (charContainer as any).__debugLogged = true;
          }
          
          this.animateContainer(
            charContainer,
            charData.char,
            {
              ...params,
              id: charData.id,
              charIndex: charData.charIndex,
              totalChars: charData.totalChars,
              phraseStartMs: forcedPhraseStartMs,  // フレーズ開始時間を強制継承
              phraseEndMs: forcedPhraseEndMs,      // フレーズ終了時間を強制継承
              wordIndex: params.wordIndex,
              // 元の文字タイミングを明示的に保持（発声タイミング用）
              originalCharStartMs: actualCharStartMs,
              originalCharEndMs: actualCharEndMs,
              // 個別の文字時間を無効化するフラグ
              forcePhraseTiming: true
            },
            nowMs,
            transformedStartMs,  // フレーズ入場時間内に変換されたタイミング
            transformedEndMs,    // 全文字がフレーズ入場期間内に収まる
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
   * 文字コンテナの描画 - 点滅フェード効果実装
   * WordSlideTextPrimitive互換の文字表示継続性を維持
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
    // 既存のテキストオブジェクトをクリア（毎フレーム新規作成）
    container.removeChildren();
    
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string;
    if (!fontFamily) {
      console.error('[BlinkFadeTextPrimitive_v2] fontFamilyパラメータが指定されていません');
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
    
    // フレーズ時間の強制継承
    const forcePhraseTiming = params.forcePhraseTiming as boolean || false;
    const phraseStartMs = params.phraseStartMs as number || startMs;
    const phraseEndMs = params.phraseEndMs as number || endMs;
    
    // 元の文字タイミング（発声タイミング計算用）
    const originalCharStartMs = params.originalCharStartMs as number || startMs;
    const originalCharEndMs = params.originalCharEndMs as number || endMs;
    
    // 強制継承モードの場合の有効な時間計算
    // 入場・退場はフレーズ時間、発声は元の文字タイミングを使用
    // 注: startMs/endMsは既に変換後のタイミングが渡されている
    const effectiveStartMs = forcePhraseTiming ? originalCharStartMs : startMs;
    const effectiveEndMs = forcePhraseTiming ? originalCharEndMs : endMs;
    
    // フレーズタイミング強制継承モードでの入場アニメーションタイミング
    // 重要: startMs/endMsは既に変換後のタイミングが渡されている
    const headTime = params.headTime as number || 800;
    
    // 入場アニメーションのタイミングは変換後の値を直接使用
    const entranceStartMs = forcePhraseTiming ? startMs : effectiveStartMs;  // 変換後の開始時刻
    const entranceEndMs = forcePhraseTiming ? endMs : effectiveEndMs;        // 変換後の終了時刻
    
    // 文字アニメーション状態の生成/取得
    const charIndex = params.charIndex as number || 0;
    const stateKey = forcePhraseTiming ? `charState_${charIndex}_${phraseEndMs}_forced_${startMs}_${endMs}` : `charState_${charIndex}_${phraseEndMs}_normal`;
    
    if (!(container as any)[stateKey]) {
      if (forcePhraseTiming) {
        // フレーズ時間強制継承モード: 変換後のタイミングを直接使用
        const preInDurationForChar = params.preInDuration as number || 1500;
        (container as any)[stateKey] = {
          flickerStartTime: entranceStartMs,                    // 変換後の開始時刻
          flickerDuration: entranceEndMs - entranceStartMs,     // 変換後の期間
          fadeInCompleteTime: entranceEndMs,                   // 変換後の終了時刻
          fadeOutStartTime: phraseEndMs,
          fadeOutDuration: fadeOutDuration
        } as CharacterAnimationState;
        
        // 初回のみデバッグ情報を出力（変換後時間ごとに1回のみ）
        const logKey = `__animationStateLogged_${startMs}_${endMs}`;
        if (!(container as any)[logKey]) {
          // ログ抑制: FIXED Animation state (毎フレーム出力)
          (container as any)[logKey] = true;
        }
      } else {
        // 通常モード: ランダム性あり
        const rng = this.createPseudoRandom(charIndex);
        (container as any)[stateKey] = {
          flickerStartTime: entranceStartMs - preInDuration + rng() * fadeInVariation * flickerRandomness,
          flickerDuration: preInDuration + rng() * fadeInVariation,
          fadeInCompleteTime: entranceEndMs - rng() * fadeInVariation * 0.2,
          fadeOutStartTime: phraseEndMs - rng() * fadeOutVariation,
          fadeOutDuration: fadeOutDuration + rng() * fadeOutVariation * 0.5
        } as CharacterAnimationState;
      }
    }
    
    const charState = (container as any)[stateKey] as CharacterAnimationState;
    
    // 閾値関数を生成
    const flickerThresholdFunc = this.generateFlickerThreshold(charIndex, flickerThreshold, flickerRandomness);
    
    // アニメーションフェーズの判定と計算
    let textColor = defaultTextColor;
    let shouldBlink = false;
    
    // フレーズベースの入場アニメーションが進行中かどうかを判定
    // 重要: フレーズ開始時刻+ヘッドタイムまでが入場期間
    const phraseActualStartMs = params.phraseStartMs as number || startMs;
    const phraseHeadTime = params.headTimeOverride as number || params.phraseHeadTime as number || 800;
    const phraseEntranceEndMs = phraseActualStartMs + phraseHeadTime;
    const isInEntrancePhase = forcePhraseTiming && 
                              nowMs >= charState.flickerStartTime && 
                              nowMs < phraseEntranceEndMs;
    
    // 文字がまだ表示されていない、または入場アニメーション中
    const isBeforeCharStart = forcePhraseTiming && nowMs < effectiveStartMs;
    
    if (nowMs < charState.flickerStartTime) {
      // 開始前
      textColor = defaultTextColor;
      shouldBlink = false;
    } else if (isInEntrancePhase || isBeforeCharStart) {
      // フェードイン（点滅）フェーズ - フレーズベースの入場アニメーション
      // 2単語目以降の文字も、フレーズ開始前から点滅フェードインを行う
      const elapsed = nowMs - charState.flickerStartTime;
      const progress = Math.min(elapsed / charState.flickerDuration, 1);
      const baseAlpha = easeInOutQuad(progress);
      
      // ログ抑制: フリッカーデバッグ情報 (毎フレーム出力)
      
      // フレーズ強制継承モードでは入場期間中は常に点滅可能
      if (forcePhraseTiming && isInEntrancePhase) {
        // フレーズ入場期間中は特別な点滅ロジック
        // baseAlphaが1.0でも点滅を継続（入場期間の残り時間に基づいて点滅）
        const entranceProgress = (nowMs - charState.flickerStartTime) / (phraseEntranceEndMs - charState.flickerStartTime);
        const flickerAlpha = Math.min(entranceProgress, 0.9); // 最大0.9で制限
        
        // 点滅頻度の計算
        const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, flickerAlpha);
        const prevFreq = (container as any).__prevFrequency || targetFreq;
        const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
        (container as any).__prevFrequency = currentFreq;
        
        const flickerPhase = nowMs * currentFreq * Math.PI * 2;
        const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
        
        // 入場期間中は常に点滅効果を適用
        shouldBlink = flickerValue < (1 - flickerIntensity * flickerAlpha);
      } else if (baseAlpha >= fullDisplayThreshold) {
        shouldBlink = false;
      } else {
        shouldBlink = !flickerThresholdFunc(baseAlpha);
        
        if (shouldBlink) {
          const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
          const prevFreq = (container as any).__prevFrequency || targetFreq;
          const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
          (container as any).__prevFrequency = currentFreq;
          
          const flickerPhase = nowMs * currentFreq * Math.PI * 2;
          const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
          
          shouldBlink = flickerValue < (1 - flickerIntensity * baseAlpha);
        }
      }
      
      // 点滅計算の詳細ログ（コメントアウト - デバッグ時のみ有効化）
      // if (!(container as any)[flickerDebugKey + '_detail']) {
      //   console.log(`  Flicker calc: targetFreq=${targetFreq.toFixed(2)}, currentFreq=${currentFreq.toFixed(2)}`);
      //   console.log(`  Flicker calc: phase=${flickerPhase.toFixed(2)}, value=${flickerValue.toFixed(3)}, threshold=${(1 - flickerIntensity * baseAlpha).toFixed(3)}`);
      //   console.log(`  Final shouldBlink: ${shouldBlink} (thresholdFunc result: ${!flickerThresholdFunc(baseAlpha)})`);
      //   (container as any)[flickerDebugKey + '_detail'] = true;
      // }
    }
    
    // テキストカラーの設定
    if (nowMs < effectiveStartMs) {
      textColor = defaultTextColor;
    } else if (nowMs >= effectiveStartMs && nowMs <= effectiveEndMs) {
      // アクティブフェーズ（発声中）
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
        shouldBlink = false;
      } else {
        shouldBlink = !flickerThresholdFunc(baseAlpha);
        
        if (shouldBlink) {
          const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
          const prevFreq = (container as any).__prevFrequency || targetFreq;
          const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
          (container as any).__prevFrequency = currentFreq;
          
          const flickerPhase = nowMs * currentFreq * Math.PI * 2;
          const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
          
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

    // プリミティブの表示制御を無効化し、テンプレート側で完全制御
    // 点滅表現と同様に、テンプレートが表示状態を優先する
    container.visible = true;  // 強制的に表示を有効化
    container.alpha = 1.0;     // プリミティブのアルファ制御を無効化
    
    // テンプレート側で完全な表示制御を実現
    // 点滅、フェードイン、フェードアウトすべてをテンプレートが管理
    let finalColor = textColor;
    let containerAlpha = 1.0;
    let containerVisible = true;
    
    // フェードイン・フェードアウトの計算（テンプレート側で実装）
    if (nowMs < charState.flickerStartTime) {
      // 開始前は完全に非表示
      containerAlpha = 0;
      containerVisible = false;
    } else if (nowMs < charState.fadeInCompleteTime || (isInEntrancePhase && nowMs < phraseEndMs)) {
      // フェードイン期間中、またはフレーズ入場期間中
      const elapsed = nowMs - charState.flickerStartTime;
      const progress = Math.min(elapsed / charState.flickerDuration, 1);
      const baseAlpha = easeInOutQuad(progress);
      
      if (shouldBlink) {
        // 点滅時は非表示
        containerVisible = false;
        containerAlpha = 0;
        
        // 点滅適用のデバッグログ（最初の文字のみ、頻度を下げる）
        const blinkDebugKey = `__blinkApplied_${charIndex}_${Math.floor(nowMs / 500) * 500}`;
        if (!(container as any)[blinkDebugKey] && charIndex === 0) {
          console.log(`[BlinkFadeTextPrimitive_v2] BLINK APPLIED Char[${charIndex}]: visible=${containerVisible}`);
          (container as any)[blinkDebugKey] = true;
        }
      } else {
        // 通常時はフェードインの透明度を適用
        containerVisible = true;
        containerAlpha = baseAlpha;
      }
    } else if (nowMs > phraseEndMs && nowMs < charState.fadeOutStartTime + charState.fadeOutDuration) {
      // フェードアウト期間中
      const elapsed = nowMs - charState.fadeOutStartTime;
      const progress = Math.min(elapsed / charState.fadeOutDuration, 1);
      const baseAlpha = 1 - easeInOutQuad(progress);
      
      if (shouldBlink) {
        // 点滅時は非表示
        containerVisible = false;
        containerAlpha = 0;
      } else {
        // 通常時はフェードアウトの透明度を適用
        containerVisible = true;
        containerAlpha = baseAlpha;
      }
    } else if (nowMs >= charState.fadeOutStartTime + charState.fadeOutDuration) {
      // 完全終了後は非表示
      containerAlpha = 0;
      containerVisible = false;
    } else {
      // 通常表示期間
      if (shouldBlink) {
        // 点滅時は非表示
        containerVisible = false;
        containerAlpha = 0;
      } else {
        // 通常時は完全表示
        containerVisible = true;
        containerAlpha = 1.0;
      }
    }
    
    // テンプレートが決定した表示状態を強制適用（プリミティブを上書き）
    container.visible = containerVisible;
    container.alpha = containerAlpha;
    
    // 表示状態の簡潔なデバッグログ（最初の文字のみ、表示状態変化時のみ）
    if (charIndex === 0) {
      if (!(container as any).__prevVisible || (container as any).__prevVisible !== containerVisible) {
        const phase = nowMs < charState.flickerStartTime ? "before" : 
                      nowMs < charState.fadeInCompleteTime || (isInEntrancePhase && nowMs < phraseEndMs) ? "fade_in" :
                      nowMs <= effectiveEndMs ? "active" : "after";
        console.log(`[BlinkFadeTextPrimitive_v2] Phase: ${phase}, Visible: ${containerVisible}, ShouldBlink: ${shouldBlink}`);
        (container as any).__prevVisible = containerVisible;
      }
    }
    
    
    // テキスト描画（WordSlideTextPrimitive互換）
    const textObj = TextStyleFactory.createHighDPIText(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: finalColor
    });
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    
    // テキストオブジェクトは常に完全表示（コンテナ側で制御）
    textObj.alpha = 1.0;     // テキスト自体は常に不透明
    textObj.visible = true;  // テキスト自体は常に表示
    
    container.addChild(textObj);
    
    return true;
  }

  /**
   * 色のアルファ値を適用するヘルパー関数
   */
  private applyAlphaToColor(color: string, alpha: number): string {
    const rgb = parseInt(color.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    
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
        console.warn(`[BlinkFadeTextPrimitive_v2] 単語${wordIndex}の文字データが不足しています。`);
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
}