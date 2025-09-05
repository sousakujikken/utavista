/**
 * BlackBandMaskTextPrimitive v1.0
 * 黒帯と白矩形マスクによる文字反転表示テンプレート
 * FadeBlurRandomTextPrimitiveをベースに実装
 */

import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata, ParameterConfig } from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { ParameterRegistry } from '../utils/ParameterRegistry';
import { TemplateValidationHelper, validateInDevelopment } from '../utils/TemplateValidationHelper';
import { 
  SlideAnimationPrimitive,
  FlexibleCumulativeLayoutPrimitive,
  WordDisplayMode,
  type FlexibleCharacterData,
  ShapePrimitive,
  type RectangleParams,
  MultiLineLayoutPrimitive,
  GlowEffectPrimitive,
  type CompositeEffectParams,
  SparkleEffectPrimitive
} from '../primitives';
import { CharUnit } from '../types/types';

/**
 * 垂直スライス情報（1文字分のブロック単位）
 */
interface VerticalSlice {
  x: number;           // スライスのX座標
  width: number;       // 1文字分の幅
  charId: string;      // 対応する文字ID
  wordIndex: number;   // 単語インデックス
  charIndex: number;   // 文字インデックス
  originalChar: string; // 元の文字
}

/**
 * 黒帯と白矩形マスクによる文字反転表示テンプレート
 */
export class BlackBandMaskTextPrimitive implements IAnimationTemplate {
  
  // Graphics Primitives
  private shapePrimitive = new ShapePrimitive();
  private textGlowEffectPrimitive = new GlowEffectPrimitive();
  private bandGlowEffectPrimitive = new GlowEffectPrimitive();
  
  // グラフィックコンテナ管理
  private graphicsContainers = new Map<string, {
    blackBandContainer: PIXI.Container;
    invertMaskContainer: PIXI.Container;
  }>();
  
  readonly metadata = {
    name: "BlackBandMaskTextPrimitive",
    version: "1.0.0",
    description: "黒帯と白矩形マスクによる文字反転表示テンプレート",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "UTAVISTA Development Team",
      contribution: "黒帯マスクテンプレート v1.0 実装",
      date: "2025-08-24"
    }
  };
  
  // アニメーション状態管理
  private wordStates = new Map<string, {
    currentCharIndex: number;
    totalChars: number;
    isComplete: boolean;
    wordStartMs: number;
    wordEndMs: number;
    invertMaskElement: PIXI.Graphics | null;
    invertMaskParent: PIXI.Container | null;
  }>();
  
  // スワイプアウト管理
  private swipeOutStates = new Map<string, {
    slices: VerticalSlice[];
    isSwipeOutActive: boolean;
    swipeStartMs: number;
    tailTime: number;
  }>();

  // 状態管理を削除 - 純粋な時間ベース計算のみ使用

  
  /**
   * パラメータ設定
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
      { name: "textColor", type: "color", default: "#FFFFFF" },
      { name: "activeColor", type: "color", default: "#FFD700" },
      
      // 画面中心からのオフセット (v0.4.3標準)
      { name: "phraseOffsetX", type: "number", default: 0, min: -500, max: 500, step: 10 },
      { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 10 },
      
      // 黒帯設定
      { name: "blackBandColor", type: "color", default: "#000000" },
      { name: "blackBandWidthRatio", type: "number", default: 1.2, min: 1.0, max: 2.0, step: 0.1 },
      { name: "blackBandHeightRatio", type: "number", default: 1.0, min: 0.8, max: 1.5, step: 0.1 },
      
      // 反転マスク設定
      { name: "invertMaskColor", type: "color", default: "#FFFFFF" },
      { name: "maskBlendMode", type: "select", default: "difference", options: ["normal", "multiply", "difference", "overlay", "screen"] },
      
      // タイミング設定
      { name: "headTime", type: "number", default: 800, min: 200, max: 2000, step: 100 },
      { name: "tailTime", type: "number", default: 800, min: 200, max: 2000, step: 100 },
      { name: "charStaggerDelay", type: "number", default: 100, min: 0, max: 500, step: 25 },
      
      // スワイプアウトアニメーション設定
      { name: "swipeOutDistance", type: "number", default: 500, min: 200, max: 1000, step: 50 },
      { name: "swipeOutEasing", type: "select", default: "easeOutQuad", options: [
        { value: "linear", label: "リニア" },
        { value: "easeOutQuad", label: "イーズアウト" },
        { value: "easeInQuad", label: "イーズイン" },
        { value: "easeInOutQuad", label: "イーズインアウト" }
      ] },
      
      // 文字間隔と配置
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "wordSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      
      // 黒帯余白設定
      { name: "blackBandMarginWidth", type: "number", default: 1.0, min: 0.0, max: 5.0, step: 0.1 },
      { name: "halfWidthSpacingRatio", type: "number", default: 0.6, min: 0.1, max: 1.0, step: 0.1 },
      { name: "lineHeight", type: "number", default: 1.2, min: 0, max: 3.0, step: 0.1 },
      
      // 単語表示モード（same line固定）
      { 
        name: "wordDisplayMode", 
        type: "string", 
        default: "phrase_cumulative_same_line",
        get options() {
          return ["phrase_cumulative_same_line"];
        }
      },
      
      // 多行表示設定
      { name: "enableMultiLine", type: "boolean", default: true },
      { name: "maxLines", type: "number", default: 4, min: 1, max: 8, step: 1 },
      { name: "lineOverlapThreshold", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
      { name: "autoLineSpacing", type: "number", default: 1.5, min: 1.0, max: 3.0, step: 0.1 },
      { name: "lineResetInterval", type: "number", default: 0, min: 0, max: 30000, step: 1000 },

      // 文字エフェクト設定
      { name: "enableTextGlow", type: "boolean", default: false },
      { name: "enableTextShadow", type: "boolean", default: false },
      { name: "textGlowStrength", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "textGlowBrightness", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "textGlowBlur", type: "number", default: 10, min: 1, max: 50, step: 1 },
      { name: "textGlowQuality", type: "number", default: 4, min: 1, max: 10, step: 1 },
      { name: "textShadowBlur", type: "number", default: 10, min: 1, max: 50, step: 1 },
      { name: "textShadowColor", type: "color", default: "#000000" },
      { name: "textShadowDistance", type: "number", default: 5, min: 0, max: 50, step: 1 },
      { name: "textShadowAngle", type: "number", default: 45, min: 0, max: 360, step: 1 },
      { name: "textShadowAlpha", type: "number", default: 0.8, min: 0.1, max: 1.0, step: 0.1 },
      { name: "textShadowQuality", type: "number", default: 4, min: 1, max: 10, step: 1 },

      // 黒帯エフェクト設定
      { name: "enableBandGlow", type: "boolean", default: false },
      { name: "enableBandShadow", type: "boolean", default: false },
      { name: "bandGlowStrength", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "bandGlowBrightness", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "bandGlowBlur", type: "number", default: 10, min: 1, max: 50, step: 1 },
      { name: "bandGlowQuality", type: "number", default: 4, min: 1, max: 10, step: 1 },
      { name: "bandShadowBlur", type: "number", default: 10, min: 1, max: 50, step: 1 },
      { name: "bandShadowColor", type: "color", default: "#000000" },
      { name: "bandShadowDistance", type: "number", default: 5, min: 0, max: 50, step: 1 },
      { name: "bandShadowAngle", type: "number", default: 45, min: 0, max: 360, step: 1 },
      { name: "bandShadowAlpha", type: "number", default: 0.8, min: 0.1, max: 1.0, step: 0.1 },
      { name: "bandShadowQuality", type: "number", default: 4, min: 1, max: 10, step: 1 },
      
      // 単語アライメント設定
      { name: "wordOffsetX", type: "number", default: 0, min: -2000, max: 200, step: 5 },
    ];
  }
  
  /**
   * テンプレートの内部状態をクリーンアップ
   * テンプレート切り替え時に呼び出される
   */
  cleanup(): void {
    console.log('[BlackBandMaskTextPrimitive] Cleaning up internal state');
    
    // グラフィックコンテナのクリア
    this.graphicsContainers.clear();
    
    // ワード状態のクリア
    this.wordStates.clear();
    
    // スワイプアウト状態のクリア
    this.swipeOutStates.clear();
    
    // プリミティブの全状態クリーンアップ
    SparkleEffectPrimitive.cleanup();
    
    console.log('[BlackBandMaskTextPrimitive] Cleanup complete');
  }

  /**
   * ビジュアル要素の削除
   */
  removeVisualElements(container: PIXI.Container): void {
    // プリミティブ一貫管理システムでは、
    // コンテナ構造は Engine/InstanceManager で管理され、
    // テンプレートは既存のコンテナに描画するだけなので
    // removeVisualElementsでの削除処理は不要
    // 
    // フレーズ終了時の真のクリーンアップは
    // スワイプアウト完了後に適切に実行される
  }
  
  /**
   * コンテナ名からフレーズIDを抽出
   */
  private extractPhraseIdFromContainerName(containerName: string): string | null {
    const match = containerName.match(/phrase_container_(.+)/);
    return match ? match[1] : null;
  }
  
  /**
   * 階層対応のアニメーションメソッド
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
    
    // ログ抑制: animateContainer
    
    container.visible = true;
    // 毎フレーム実行していたremoveVisualElementsを削除
    // クリーンアップは適切なタイミング（スワイプアウト完了時など）で実行される
    
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
   * フレーズコンテナの描画
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
    
    // phraseIdを最初に定義（後で使用するため）
    const phraseId = params.phraseId as string || params.id as string || `phrase_${startMs}_${text.substring(0, 10)}`;
    
    // ログ抑制: フレーズ処理
    
    // フレーズ終了条件の詳細チェック
    const phraseEndTime = endMs;
    const tailTime = params.tailTime as number || 800;
    const actualPhraseEndTime = phraseEndTime + tailTime;
    const timeUntilEnd = actualPhraseEndTime - nowMs;
    
    // ログ抑制: フレーズ終了時刻詳細
    
    // SlideAnimationPrimitive使用（スワイプアウト中は退場アニメーションを無効化）
    const slideAnimationPrimitive = new SlideAnimationPrimitive();
    
    // スワイプアウト中は'out'フェーズを'active'に変換してSlideAnimationの退場アニメーションを無効化
    const isSwipeOutActive = this.swipeOutStates.has(phraseId);
    const effectivePhase = (phase === 'out' && isSwipeOutActive) ? 'active' : phase;
    
    // ログ抑制: SlideAnimationフェーズ制御
    
    // wordOffsetXをphraseOffsetXに統合してフレーズレベルで適用
    const baseOffsetX = params.phraseOffsetX as number || 0;
    const wordOffsetX = params.wordOffsetX as number || 0;
    const combinedOffsetX = baseOffsetX + wordOffsetX;
    
    const phraseAnimationResult = slideAnimationPrimitive.calculatePhrasePosition({
      phraseOffsetX: combinedOffsetX,
      phraseOffsetY: params.phraseOffsetY as number || 0,
      fontSize: params.fontSize as number || 120,
      lineHeight: params.lineHeight as number || 1.2,
      headTime: params.headTime as number || 800,
      tailTime: params.tailTime as number || 800,
      randomPlacement: false, // 固定位置
      randomSeed: params.randomSeed as number || 123,
      randomRangeX: 0,
      randomRangeY: 0,
      minDistanceFromPrevious: 0,
      text: text,
      words: params.words as any[] || [],
      nowMs,
      startMs,
      endMs,
      effectivePhase, // 変換されたフェーズを使用
      phraseId: phraseId
    });
    
    // 多行表示処理
    let finalY = phraseAnimationResult.y;
    // ログ抑制: enableMultiLine
    
    if (params.enableMultiLine !== false) {  // undefined または true の場合に実行
      // ログ抑制: MultiLineLayoutPrimitive call
      const multiLine = MultiLineLayoutPrimitive.getInstance();
      
      const multiLineParams = {
        phraseId: phraseId,
        startMs: startMs,
        endMs: endMs,
        nowMs: nowMs,
        maxLines: params.maxLines as number || 4,
        lineSpacing: params.autoLineSpacing as number || 1.5,
        overlapThreshold: params.lineOverlapThreshold as number || 2000,
        fontSize: params.fontSize as number || 120,
        baseY: phraseAnimationResult.y,
        resetInterval: params.lineResetInterval as number || 0
      };
      
      // MultiLineパラメータログを抑制
      
      const lineResult = multiLine.calculatePhrasePosition(multiLineParams);
      
      finalY = lineResult.absoluteY;
      // MultiLine結果ログを抑制
    } else {
      // MultiLine無効ログを抑制
    }
    
    // スワイプアウト中は位置制御を無効化、通常時のみSlideAnimationPrimitiveの結果を適用
    if (!isSwipeOutActive) {
      container.position.set(phraseAnimationResult.x, finalY);
      container.alpha = phraseAnimationResult.alpha;
      // ログ抑制: 通常位置制御
    } else {
      // スワイプアウト中は位置とアルファを固定（元の値を保持）
      // ログ抑制: スワイプアウト中位置制御無効化
    }
    container.visible = container.alpha > 0;
    container.updateTransform();
    
    // フレーズレベルでグラフィックコンテナを管理
    this.manageGraphicsContainers(container, params, nowMs, startMs, endMs, phraseId, phase, text);
    
    return true;
  }
  
  /**
   * 単語コンテナの描画
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
    
    const wordIndex = params.wordIndex as number || 0;
    const wordId = `${params.phraseId || 'phrase'}_word_${wordIndex}`;
    const phraseId = params.phraseId as string || params.id as string || 'phrase_unknown';
    
    // フレーズコンテナを取得
    let phraseContainer = container.parent as PIXI.Container;
    // container.parentがword_containerの場合、その上がphrase_container
    if (phraseContainer && phraseContainer.name && phraseContainer.name.includes('word_container_')) {
      phraseContainer = phraseContainer.parent as PIXI.Container;
    }
    
    // 反転マスクの管理（グラフィックコンテナベース）
    const graphicsContainers = this.graphicsContainers.get(phraseId);
    if (graphicsContainers) {
      this.manageInvertMask(graphicsContainers.invertMaskContainer, container, text, params, nowMs, startMs, endMs, wordId, phraseId, wordIndex);
    }
    
    // same_lineモード：FlexibleCumulativeLayoutPrimitiveで直接単語位置を計算
    // BlackBandMaskTextPrimitiveは常にsame_lineモードで動作（パラメータ設定で固定済み）
    const wordDisplayModeStr = "phrase_cumulative_same_line"; // 強制的にsame_lineモードに設定
    
    // ログ抑制: WordDisplayMode
    
    if (wordDisplayModeStr === 'phrase_cumulative_same_line') {
      // ログ抑制: cumulative mode
      // FlexibleCumulativeLayoutPrimitiveを使って単語の累積X位置を計算
      const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
      
      // 全単語の拡張ID情報を生成
      const fullId = params.phraseId as string || params.id as string || 'phrase_unknown';
      // ログ抑制: cumulative mode fullId
      // ログ抑制: cumulative mode words
      
      const extractedPhraseId = this.extractPhraseIdFromFullId(fullId);
      const allWordExtendedIds = this.generateAllWordExtendedIds(params.words as any[], extractedPhraseId);
      
      // ログ抑制: cumulative mode results
      
      // 現在の単語の文字データを取得
      const rawCharsData = params.chars as CharUnit[];
      if (!rawCharsData || !Array.isArray(rawCharsData) || rawCharsData.length === 0) {
        console.warn(`[BLACKBAND_SIZE_CALC] No chars data available for wordIndex=${wordIndex}`);
        container.position.set(0, 0);
        container.alpha = 1.0;
        container.visible = true;
        return true;
      }
      
      // 最初の文字のIDを使用
      const firstCharId = rawCharsData[0].id;
      
      // FlexibleCumulativeLayoutParams オブジェクトを作成
      const layoutParams = {
        charSpacing: params.charSpacing as number || 1.0,
        fontSize: params.fontSize as number || 120,
        halfWidthSpacingRatio: params.halfWidthSpacingRatio as number || 0.6,
        alignment: 'left' as const,
        containerSize: { width: 0, height: 0 },
        chars: [],
        containerPrefix: 'char_container_',
        wordDisplayMode: WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE,
        wordSpacing: params.wordSpacing as number || 1.0,
        lineHeight: params.lineHeight as number || 1.2,
        allWordExtendedIds: allWordExtendedIds
      };
      
      // 単語位置の計算（同一行モード専用：FlexibleCumulativeLayoutPrimitive使用）
      const cumulativeWidth = (layoutPrimitive as any).calculatePreviousWordsWidthFromExtendedIds(
        firstCharId,
        wordIndex,
        layoutParams
      );
      
      // wordOffsetXはフレーズコンテナレベルで適用されるため、ここでは追加しない
      
      // same_lineモードでのアニメーション効果：フレーズレベルでの表示制御
      let alpha = 1.0;
      if (phase === 'in') {
        // 単語レベルでのフェードイン（通常通り）
        const progress = Math.min(1.0, Math.max(0.0, (nowMs - startMs) / (params.headTime as number || 800)));
        alpha = progress;
      } else if (phase === 'active') {
        // アクティブ段階では完全表示
        alpha = 1.0;
      } else if (phase === 'out') {
        // same_lineモードでは単語レベルでの'out'は無視し、フレーズレベルでの制御に委譲
        // 一度表示された単語はフレーズ終了まで表示継続
        alpha = 1.0;
        // ログ抑制: Word maintaining display
      }
      
      // ログ抑制: Word alpha calculation
      
      container.position.set(cumulativeWidth, 0);
      container.alpha = alpha;
      container.visible = true;
      
      // ログ抑制: Word container positioned (cumulative)
      
    } else {
      // 非same_lineモード：SlideAnimationPrimitiveを使用
      const slideAnimationPrimitive = new SlideAnimationPrimitive();
      
      const wordAnimationResult = slideAnimationPrimitive.calculateWordPosition({
        fontSize: params.fontSize as number || 120,
        lineHeight: params.lineHeight as number || 1.2,
        headTime: params.headTime as number || 800,
        entranceInitialSpeed: 0.1,
        activeSpeed: 0.05,
        wordOffsetX: 0,
        wordIndex: wordIndex,
        nowMs,
        startMs,
        endMs,
        phase: phase === 'in' ? 'in' : phase === 'out' ? 'out' : 'active',
        wordAlignment: 'trailing_align',
        firstWordFinalX: 0,
        wordDisplayMode: wordDisplayModeStr,
        charSpacing: params.charSpacing as number || 1.0,
        wordSpacing: params.wordSpacing as number || 1.0,
        phraseContainer: phraseContainer
      });
      
      const validX = isNaN(wordAnimationResult.x) ? 0 : wordAnimationResult.x;
      const validY = isNaN(wordAnimationResult.y) ? 0 : wordAnimationResult.y;
      const validAlpha = isNaN(wordAnimationResult.alpha) ? 1 : Math.max(0, Math.min(1, wordAnimationResult.alpha));
      
      container.position.set(validX, validY);
      container.alpha = validAlpha;
      container.visible = true;
      
      // ログ抑制: Word container positioned (slide)
    }
    
    
    // FlexibleCumulativeLayoutPrimitive使用して文字コンテナ管理
    const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
    
    // 文字データの検証と処理
    const rawCharsData = params.chars as CharUnit[];
    if (!rawCharsData || !Array.isArray(rawCharsData) || rawCharsData.length === 0) {
      return true;
    }

    // CharUnit[]をFlexibleCharacterData[]に変換
    const charsData: FlexibleCharacterData[] = rawCharsData.map((char, index) => ({
      id: char.id,
      char: char.char,
      start: char.start,
      end: char.end,
      charIndexInWord: index,
      charIndex: char.charIndex || index,
      wordIndex: wordIndex,
      totalChars: char.totalChars || rawCharsData.length,
      totalWords: char.totalWords || 1
    }));
    
    // 全単語の拡張ID情報を生成
    const fullId = params.phraseId as string || params.id as string || 'phrase_unknown';
    const extractedPhraseId = this.extractPhraseIdFromFullId(fullId);
    const allWordExtendedIds = this.generateAllWordExtendedIds(params.words as any[], extractedPhraseId);
    
    
    const layoutParams = {
      charSpacing: params.charSpacing as number || 1.0,
      fontSize: params.fontSize as number || 120,
      halfWidthSpacingRatio: 0.6,
      alignment: 'left' as const,
      containerSize: { width: 0, height: 0 },
      spacing: params.charSpacing as number || 1.0,
      chars: charsData,
      containerPrefix: 'char_container_',
      wordDisplayMode: WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE,
      wordSpacing: params.wordSpacing as number || 1.0,
      lineHeight: params.lineHeight as number || 1.2,
      allWordExtendedIds: allWordExtendedIds
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
            wordIndex: params.wordIndex,
            wordId: wordId
          },
          nowMs,
          charData.start,
          charData.end,
          'char',
          phase
        );
      }
    );
    
    // 黒帯はフレーズレベルで管理する
    
    return true;
  }
  
  /**
   * グラフィックコンテナの管理
   */
  private manageGraphicsContainers(
    phraseContainer: PIXI.Container,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phraseId: string,
    phase: AnimationPhase,
    phraseText: string
  ): void {
    // ログ抑制: manageGraphicsContainers
    
    // グラフィックコンテナが存在しない場合は作成
    if (!this.graphicsContainers.has(phraseId)) {
      console.log(`[SWIPE_OUT_DEBUG] 新規グラフィックコンテナ作成開始: ${phraseId}`);
      // 下層コンテナ（黒帯用） - 背景動画(-1000)とテキスト(0)の間
      const blackBandContainer = new PIXI.Container();
      blackBandContainer.name = `black_band_container_${phraseId}`;
      blackBandContainer.zIndex = -50; // 背景動画より上、テキストより下
      // 黒帯コンテナの位置は相対位置（0,0）で単語位置に従う
      
      // 上層コンテナ（反転マスク用）
      const invertMaskContainer = new PIXI.Container();
      invertMaskContainer.name = `invert_mask_container_${phraseId}`;
      invertMaskContainer.zIndex = 50; // テキストより上
      
      // フレーズコンテナに追加
      phraseContainer.addChild(blackBandContainer);
      phraseContainer.addChild(invertMaskContainer);
      
      // sortable = trueを設定してからsortChildren()を実行
      phraseContainer.sortableChildren = true;
      phraseContainer.sortChildren();
      
      console.log(`[BLACK_BAND_TRACE] コンテナ追加後: phraseContainer.children.length=${phraseContainer.children.length}`);
      
      // 管理マップに登録
      this.graphicsContainers.set(phraseId, {
        blackBandContainer,
        invertMaskContainer
      });
      
      console.log(`[BLACKBAND_SIZE_CALC] グラフィックコンテナ作成完了: ${phraseId}`);
    }
    
    const containers = this.graphicsContainers.get(phraseId)!;
    
    // 既存コンテナが実際に親に存在するかチェック
    if (containers && (!containers.blackBandContainer.parent || containers.blackBandContainer.destroyed)) {
      console.log(`[BLACKBAND_SIZE_CALC] 既存黒帯コンテナが無効化されている。parent=${containers.blackBandContainer.parent?.name}, destroyed=${containers.blackBandContainer.destroyed}`);
      this.graphicsContainers.delete(phraseId);
      this.manageGraphicsContainers(phraseContainer, params, nowMs, startMs, endMs, phraseId, phase, phraseText);
      return;
    }
    
    // wordOffsetXはフレーズコンテナレベルで適用されるため、黒帯コンテナでは適用しない
    containers.blackBandContainer.position.x = 0;
    
    // ログ抑制: コンテナ確認OK
    
    // 純粋な時間ベース: 常に黒帯を作成（フレーズ退場まで維持）
    this.createBlackBand(containers.blackBandContainer, params, nowMs, startMs, endMs, phraseId, phraseText, phase);
    
    // 黒帯が存在するかチェック（createBlackBandが早期リターンした場合も処理を継続）
    let blackBand = containers.blackBandContainer.children.find(child => 
      child.name === `black_band_${phraseId}`
    );
    
    console.log(`[SEEK_SWIPE_DEBUG] ステップ4: 黒帯存在チェック: phraseId=${phraseId}, phase=${phase}, blackBandExists=${!!blackBand}, containerChildren=${containers.blackBandContainer.children.length}`);
    
    // 黒帯のマスク状態をログ出力
    if (blackBand) {
      const blackBandGraphics = blackBand as PIXI.Graphics;
      const existingMask = blackBandGraphics.mask;
      const maskName = existingMask?.name || 'none';
      console.log(`[SEEK_SWIPE_DEBUG] 既存黒帯のマスク状態: phraseId=${phraseId}, hasMask=${!!existingMask}, maskName=${maskName}, blackBandVisible=${blackBandGraphics.visible}`);
    }
    
    // phase === 'in' の場合、スワイプインアニメーション（純粋な時間ベース計算）
    if (phase === 'in' && blackBand) {
      const headTime = params.headTime as number || 800;
      
      // 純粋な時間ベース計算: 常に同じ結果を返す
      const swipeInStartTime = startMs - headTime;
      let progress = 0.0;
      
      if (nowMs <= swipeInStartTime) {
        progress = 0.0;
      } else if (nowMs >= startMs) {
        progress = 1.0;
      } else {
        const elapsed = nowMs - swipeInStartTime;
        progress = elapsed / headTime;
      }
      
      // 3次イージング適用（速くからゆっくり）
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      console.log(`[SWIPE_IN] 純粋時間ベース計算: phraseId=${phraseId}, nowMs=${nowMs}, swipeInStartTime=${swipeInStartTime}, progress=${progress.toFixed(3)}, easedProgress=${easedProgress.toFixed(3)}`);
      
      // スワイプアニメーション実行
      this.applySwipeInMaskToBlackBand(blackBand as PIXI.Graphics, easedProgress, phraseId, params);
    } else if (phase === 'active' && blackBand) {
      // アクティブ段階ではマスクを削除して完全表示
      this.clearSwipeInMaskFromBlackBand(blackBand as PIXI.Graphics, phraseId);
    }
    
    // ログ抑制: スワイプアウト処理（スワイプイン処理に集中）
    
    // 純粋な時間ベースでスワイプアウト状態を決定
    const tailTime = params.tailTime as number || 800;
    const swipeStartMs = endMs;
    const swipeEndMs = swipeStartMs + tailTime;
    
    // 現在時刻がスワイプアウト期間内かどうか
    const isInSwipeOutPeriod = nowMs >= swipeStartMs && nowMs <= swipeEndMs;
    const isAfterSwipeOut = nowMs > swipeEndMs;
    
    if (isInSwipeOutPeriod) {
      // スワイプアウトアニメーション中
      const progress = (nowMs - swipeStartMs) / tailTime;
      const easedProgress = Math.min(1.0, progress); // 0〜1にクランプ
      
      console.log(`[SWIPE_OUT_DEBUG] スワイプアウト中: phraseId=${phraseId}, nowMs=${nowMs}, progress=${easedProgress.toFixed(3)}`);
      
      // スライス情報の準備
      const slices = this.calculateCharacterSlices(params);
      
      // スワイプ状態を記録（状態管理用）
      if (!this.swipeOutStates.has(phraseId)) {
        this.swipeOutStates.set(phraseId, {
          slices: slices,
          isSwipeOutActive: true,
          swipeStartMs: swipeStartMs,
          tailTime: tailTime
        });
      }
      
      // スワイプアウトアニメーション実行
      const isSwipeComplete = this.animateSliceSwipeOut(
        phraseContainer,
        slices,
        params,
        nowMs,
        swipeStartMs,
        tailTime,
        phraseId
      );
      
      if (isSwipeComplete) {
        console.log(`[SWIPE_OUT_DEBUG] スワイプアウト完了: phraseId=${phraseId}`);
        
        // 統一マスクをクリーンアップ（破棄せずに非表示のみ）
        this.cleanupUnifiedSwipeMask(phraseContainer);
        
        // フレーズコンテナ全体も非表示にして確実に文字が見えないようにする
        if (phraseContainer && !phraseContainer.destroyed) {
          phraseContainer.visible = false;
        }
        
        // 多行表示のフレーズ解放
        if (params.enableMultiLine) {
          MultiLineLayoutPrimitive.getInstance().releasePhraseFromLine(phraseId);
        }
        
        // 状態をクリア
        this.swipeOutStates.delete(phraseId);
      }
    } else if (isAfterSwipeOut) {
      // スワイプアウト完了後はコンテナを非表示
      if (phraseContainer && !phraseContainer.destroyed) {
        phraseContainer.visible = false;
      }
      
      // 状態が残っていればクリア
      if (this.swipeOutStates.has(phraseId)) {
        this.swipeOutStates.delete(phraseId);
      }
    } else {
      // スワイプアウト前の通常状態
      // 状態が残っていればクリア（シークで戻った場合など）
      if (this.swipeOutStates.has(phraseId)) {
        console.log(`[SWIPE_OUT_DEBUG] スワイプアウト前の状態に戻る: phraseId=${phraseId}`);
        
        try {
          // マスク参照のみクリア
          this.clearAllMaskReferences(phraseContainer);
          
          // コンテナを再表示
          if (phraseContainer && !phraseContainer.destroyed) {
            phraseContainer.visible = true;
            
            // 統一マスクを非表示にする
            const unifiedMask = phraseContainer.children.find(child => 
              child && child.name === 'unified_swipe_mask' && !child.destroyed
            );
            if (unifiedMask) {
              unifiedMask.visible = false;
              if (unifiedMask instanceof PIXI.Graphics) {
                unifiedMask.clear();
              }
            }
            
            // 子要素も安全に再表示
            phraseContainer.children.forEach(child => {
              try {
                if (child && !child.destroyed && child instanceof PIXI.Container && child.name && 
                    (child.name.includes('char_container') || child.name.includes('word_container'))) {
                  child.visible = true;
                }
              } catch (error) {
                // エラーは無視
              }
            });
          }
          
          this.swipeOutStates.delete(phraseId);
        } catch (error) {
          // エラーが発生しても状態をクリア
          this.swipeOutStates.delete(phraseId);
        }
      }
    }
  }
  
  /**
   * 黒帯の作成（スワイプイン対応版）
   */
  private createBlackBand(
    blackBandContainer: PIXI.Container,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phraseId: string,
    phraseText: string,
    phase: AnimationPhase
  ): void {
    console.log(`[SWIPE_IN_FLOW] ステップ3開始: createBlackBand: phraseId=${phraseId}, phase=${phase}`);
    
    // スワイプアウト中は既存黒帯の作成をスキップ
    if (this.swipeOutStates.has(phraseId)) {
      console.log(`[SWIPE_IN_FLOW] ステップ3終了: スワイプアウト中のためスキップ: phraseId=${phraseId}`);
      return;
    }
    
    // 既存の黒帯があるかチェック
    const existingBlackBand = blackBandContainer.children.find(child => 
      child.name === `black_band_${phraseId}`
    );
    if (existingBlackBand) {
      const blackBandGraphics = existingBlackBand as PIXI.Graphics;
      const beforeMask = blackBandGraphics.mask;
      console.log(`[SEEK_SWIPE_DEBUG] 既存黒帯発見 - マスク管理をapplySwipeInMaskToBlackBandに委譲: phraseId=${phraseId}, beforeMask=${!!beforeMask}, maskName=${beforeMask?.name || 'none'}`);
      
      // 重要: マスク状態の管理は applySwipeInMaskToBlackBand に一元化
      // ここではマスククリアを行わず、既存黒帯の存在を確認するのみ
      return;
    }
    
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string || 'Arial';
    
    // FlexibleCumulativeLayoutPrimitiveから直接幅情報を取得
    const phraseWidth = this.getActualPhraseWidthFromLayout(params);
    
    // 黒帯のサイズ計算（固定余白ベース）
    const marginWidth = params.blackBandMarginWidth as number || 1.0; // 文字数ベースの余白
    const bandHeightRatio = params.blackBandHeightRatio as number || 1.0;
    const bandWidth = phraseWidth + (fontSize * marginWidth * 2); // 左右に固定余白を追加
    const bandHeight = fontSize * bandHeightRatio * 1.5; // 高さを少し大きめに
    
    // フレーズ全体の中央位置を計算（same lineモード対応）
    const phraseCenterOffset = phraseWidth / 2;
    
    // ShapePrimitiveを使用して黒帯を作成（フレーズ中央配置）
    const blackBandParams: RectangleParams = {
      width: bandWidth,
      height: bandHeight,
      x: phraseCenterOffset - (bandWidth / 2), // フレーズ中央に黒帯中央を配置（コンテナレベルでwordOffsetX適用済み）
      y: -bandHeight / 2,
      color: params.blackBandColor as string || '#000000',
      alpha: 1.0
    };
    
    const blackBand = this.shapePrimitive.createRectangle(blackBandParams);
    blackBand.name = `black_band_${phraseId}`;
    // シーク検出対応: 新規作成時は一時的に非表示（マスク適用まで）
    blackBand.visible = false;
    
    // コンテナに追加
    blackBandContainer.addChild(blackBand);
    
    // 黒帯エフェクトの適用
    this.applyBandGlowShadowEffect(blackBand as PIXI.Container, params);
    
    // デバッグ：黒帯とコンテナの座標情報
    const wordOffsetX = params.wordOffsetX as number || 0;
    console.log(`[BLACKBAND_COORD_DEBUG] 黒帯作成座標情報:
      phraseId: ${phraseId}
      wordOffsetX: ${wordOffsetX} (フレーズコンテナレベルで適用)
      黒帯グラフィック ローカル座標: (${blackBand.x.toFixed(1)}, ${blackBand.y.toFixed(1)})
      黒帯コンテナ ローカル座標: (${blackBandContainer.x.toFixed(1)}, ${blackBandContainer.y.toFixed(1)})
      黒帯グラフィック 相対座標: (${(blackBandContainer.x + blackBand.x).toFixed(1)}, ${(blackBandContainer.y + blackBand.y).toFixed(1)})
      計算詳細:
        phraseCenterOffset: ${phraseCenterOffset.toFixed(1)}
        bandWidth/2: ${(bandWidth / 2).toFixed(1)}
        計算式: ${phraseCenterOffset.toFixed(1)} - ${(bandWidth / 2).toFixed(1)} = ${blackBandParams.x.toFixed(1)}
        注意: wordOffsetXはフレーズコンテナで適用済み
    `);
    console.log(`[SWIPE_IN_FLOW] ステップ3終了: 新規黒帯作成完了: phraseId=${phraseId}, phase=${phase}`);
  }
  
  /**
   * グラフィックコンテナのクリア（非表示のみ、破棄しない）
   */
  private clearGraphicsContainers(phraseId: string): void {
    const containers = this.graphicsContainers.get(phraseId);
    if (!containers) return;
    
    // コンテナを非表示にするのみ（破棄しない）
    try {
      if (containers.blackBandContainer && !containers.blackBandContainer.destroyed) {
        containers.blackBandContainer.visible = false;
        containers.blackBandContainer.mask = null;
      }
    } catch (e) {
      console.warn('[BBMT_DEBUG] 下層コンテナの非表示化エラー:', e);
    }
    
    // 上層コンテナの非表示化
    try {
      if (containers.invertMaskContainer && !containers.invertMaskContainer.destroyed) {
        containers.invertMaskContainer.visible = false;
        containers.invertMaskContainer.mask = null;
      }
    } catch (e) {
      console.warn('[BBMT_DEBUG] 上層コンテナの非表示化エラー:', e);
    }
    
    // マップから削除はしない（再利用のため保持）
    
    console.log(`[BLACKBAND_SIZE_CALC] グラフィックコンテナ削除完了: ${phraseId}`);
  }
  
  /**
   * スワイプインマスクの適用（左から右へ徐々に表示）
   */
  private applySwipeInMask(
    blackBandContainer: PIXI.Container,
    progress: number, // 0.0 = 非表示, 1.0 = 完全表示
    phraseId: string,
    params: Record<string, unknown>
  ): void {
    try {
      if (!blackBandContainer || blackBandContainer.destroyed) {
        return;
      }
      
      // スワイプインマスクの作成または取得
      let swipeInMask = blackBandContainer.children.find(
        child => child && child.name === 'swipe_in_mask' && !child.destroyed
      ) as PIXI.Graphics;
      
      if (!swipeInMask) {
        swipeInMask = new PIXI.Graphics();
        swipeInMask.name = 'swipe_in_mask';
        blackBandContainer.addChild(swipeInMask);
      }
      
      // フレーズ幅とサイズ情報を取得
      const phraseWidth = this.getActualPhraseWidthFromLayout(params);
      const fontSize = params.fontSize as number || 120;
      const marginWidth = params.blackBandMarginWidth as number || 1.0;
      const bandWidth = phraseWidth + (fontSize * marginWidth * 2);
      const bandHeight = fontSize * 1.5;
      const phraseCenterOffset = phraseWidth / 2;
      
      // 左から右へ徐々に表示されるマスク
      swipeInMask.clear();
      swipeInMask.beginFill(0xFFFFFF, 1.0);
      const visibleWidth = bandWidth * progress;
      
      if (visibleWidth > 0) {
        swipeInMask.drawRect(
          phraseCenterOffset - bandWidth / 2, // 黒帯の左端（コンテナレベルでwordOffsetX適用済み）
          -bandHeight,
          visibleWidth, // progressに応じた幅
          bandHeight * 2
        );
      }
      
      swipeInMask.endFill();
      
      // 黒帯にマスクを適用
      blackBandContainer.mask = swipeInMask;
      
      // デバッグ：マスクの座標情報
      const wordOffsetX = params.wordOffsetX as number || 0;
      console.log(`[BLACKBAND_COORD_DEBUG] スワイプインマスク座標情報:
        phraseId: ${phraseId}
        wordOffsetX: ${wordOffsetX} (フレーズコンテナレベルで適用)
        progress: ${progress.toFixed(3)}
        マスク ローカル座標: (${swipeInMask.x.toFixed(1)}, ${swipeInMask.y.toFixed(1)})
        マスクコンテナ(blackBandContainer) ローカル座標: (${blackBandContainer.x.toFixed(1)}, ${blackBandContainer.y.toFixed(1)})
        マスク描画範囲: x=${(phraseCenterOffset - bandWidth / 2).toFixed(1)}, width=${visibleWidth.toFixed(1)}
        相対X座標（コンテナ込み）: ${(blackBandContainer.x + phraseCenterOffset - bandWidth / 2).toFixed(1)}
        注意: wordOffsetXはフレーズコンテナで適用済み
      `);
      
    } catch (error) {
      console.error(`[SWIPE_IN_DEBUG] スワイプインマスク適用エラー:`, error);
    }
  }
  
  /**
   * スワイプインマスクのクリア
   */
  private clearSwipeInMask(blackBandContainer: PIXI.Container, phraseId: string): void {
    try {
      if (!blackBandContainer || blackBandContainer.destroyed) {
        return;
      }
      
      const swipeInMask = blackBandContainer.children.find(
        child => child && child.name === 'swipe_in_mask' && !child.destroyed
      );
      
      if (swipeInMask) {
        // マスクを削除
        blackBandContainer.mask = null;
        swipeInMask.visible = false;
        if (swipeInMask instanceof PIXI.Graphics) {
          swipeInMask.clear();
        }
        console.log(`[SWIPE_IN_DEBUG] スワイプインマスクをクリア: phraseId=${phraseId}`);
      }
    } catch (error) {
      console.error(`[SWIPE_IN_DEBUG] スワイプインマスククリアエラー:`, error);
    }
  }
  
  /**
   * 黒帯オブジェクトに直接スワイプインマスクを適用（確定的サイズ決定）
   */
  private applySwipeInMaskToBlackBand(
    blackBand: PIXI.Graphics,
    progress: number,
    phraseId: string,
    params: Record<string, unknown>
  ): void {
    try {
      if (!blackBand || blackBand.destroyed) {
        console.log(`[SEEK_SWIPE_DEBUG] applySwipeInMaskToBlackBand: 黒帯が無効: phraseId=${phraseId}`);
        return;
      }
      
      console.log(`[SEEK_SWIPE_DEBUG] applySwipeInMaskToBlackBand開始: phraseId=${phraseId}, progress=${progress.toFixed(3)}, currentMask=${!!blackBand.mask}`);
      
      // シーク時対応: 既存マスクが不適切な状態の場合のみクリア
      const currentMask = blackBand.mask;
      const expectedMaskName = `swipe_in_mask_${phraseId}`;
      const shouldRecreateMask = !currentMask || currentMask.name !== expectedMaskName;
      
      if (shouldRecreateMask) {
        console.log(`[SEEK_SWIPE_DEBUG] マスク再作成が必要: phraseId=${phraseId}, currentMask=${!!currentMask}, expectedName=${expectedMaskName}`);
      }
      
      // 確定的マスクサイズ決定システム
      const deterministicMaskSize = this.calculateDeterministicMaskSize(progress, params);
      console.log(`[SEEK_SWIPE_DEBUG] マスクサイズ計算完了: phraseId=${phraseId}, bandWidth=${deterministicMaskSize.bandWidth.toFixed(1)}, visibleWidth=${deterministicMaskSize.visibleWidth.toFixed(1)}, phraseCenterOffset=${deterministicMaskSize.phraseCenterOffset.toFixed(1)}, maskLeftX=${(deterministicMaskSize.phraseCenterOffset - deterministicMaskSize.bandWidth / 2).toFixed(1)}`);
      
      // 必要な場合のみマスク再作成
      const swipeInMask = shouldRecreateMask ? 
        this.recreateSwipeInMask(blackBand, phraseId) : 
        currentMask as PIXI.Graphics;
      
      if (!swipeInMask) {
        console.log(`[SEEK_SWIPE_DEBUG] マスク取得失敗: phraseId=${phraseId}, shouldRecreateMask=${shouldRecreateMask}`);
        return;
      }
      
      console.log(`[SEEK_SWIPE_DEBUG] マスク準備完了: phraseId=${phraseId}, maskName=${swipeInMask.name}, recreated=${shouldRecreateMask}`);
      
      // 確定的マスク描画（時刻に対して一意に決定される）
      this.applyDeterministicMask(swipeInMask, blackBand, deterministicMaskSize, phraseId);
      
      console.log(`[SEEK_SWIPE_DEBUG] マスク適用完了: phraseId=${phraseId}, progress=${progress.toFixed(3)}, visibleWidth=${deterministicMaskSize.visibleWidth.toFixed(1)}, blackBandVisible=${blackBand.visible}, finalMask=${!!blackBand.mask}`);
      
    } catch (error) {
      console.error(`[SWIPE_IN_DEBUG] 黒帯マスク適用エラー:`, error);
    }
  }
  
  /**
   * 黒帯オブジェクトからスワイプインマスクをクリア
   */
  private clearSwipeInMaskFromBlackBand(blackBand: PIXI.Graphics, phraseId: string): void {
    try {
      if (!blackBand || blackBand.destroyed) {
        console.log(`[SEEK_SWIPE_DEBUG] clearSwipeInMaskFromBlackBand: 黒帯が無効: phraseId=${phraseId}`);
        return;
      }
      
      console.log(`[SEEK_SWIPE_DEBUG] clearSwipeInMaskFromBlackBand開始: phraseId=${phraseId}, beforeMask=${!!blackBand.mask}, visible=${blackBand.visible}`);
      
      // マスクを削除して黒帯を完全表示
      blackBand.mask = null;
      blackBand.visible = true;
      
      // マスクオブジェクトを非表示化
      const swipeInMask = blackBand.parent?.children.find(
        child => child && child.name === `swipe_in_mask_${phraseId}` && !child.destroyed
      );
      
      if (swipeInMask) {
        swipeInMask.visible = false;
        if (swipeInMask instanceof PIXI.Graphics) {
          swipeInMask.clear();
        }
        console.log(`[SEEK_SWIPE_DEBUG] マスクオブジェクトをクリア: phraseId=${phraseId}, maskName=${swipeInMask.name}`);
      } else {
        console.log(`[SEEK_SWIPE_DEBUG] マスクオブジェクトが見つからない: phraseId=${phraseId}`);
      }
    } catch (error) {
      console.error(`[SWIPE_IN_DEBUG] 黒帯マスククリアエラー:`, error);
    }
  }
  
  /**
   * 反転マスクの管理（グラフィックコンテナベース）
   */
  private manageInvertMask(
    invertMaskContainer: PIXI.Container,
    wordContainer: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    wordId: string,
    phraseId: string,
    wordIndex: number
  ): void {
    // 単語の状態を初期化
    if (!this.wordStates.has(wordId)) {
      const chars = params.chars as CharUnit[] || [];
      this.wordStates.set(wordId, {
        currentCharIndex: -1,
        totalChars: chars.length,
        isComplete: false,
        wordStartMs: startMs,
        wordEndMs: endMs,
        invertMaskElement: null,
        invertMaskParent: null
      });
    }
    
    const wordState = this.wordStates.get(wordId)!;
    
    // フレーズ終了時刻の取得
    const phraseEndMs = params.phraseEndMs as number || endMs;
    const isInPhraseFadeOut = nowMs >= phraseEndMs;
    
    if (!isInPhraseFadeOut) {
      // 反転マスクの管理（フレーズ終了前のみ）
      this.createInvertMask(invertMaskContainer, wordContainer, params, nowMs, wordState, phraseId);
    }
  }
  
  /**
   * 反転マスクの作成（グラフィックコンテナベース）
   */
  private createInvertMask(
    invertMaskContainer: PIXI.Container,
    wordContainer: PIXI.Container,
    params: Record<string, unknown>,
    nowMs: number,
    wordState: any,
    phraseId: string
  ): void {
    const chars = params.chars as CharUnit[] || [];
    const wordIndex = params.wordIndex as number || 0;
    
    // 現在アクティブな文字を特定
    let currentActiveCharIndex = -1;
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (nowMs >= char.start && nowMs <= char.end) {
        currentActiveCharIndex = i;
        break;
      }
    }
    
    const maskElementId = `${phraseId}_invert_mask_${wordIndex}`;
    
    // 既存のマスクを削除（同一階層管理に対応）
    if (wordState.invertMaskElement && wordState.invertMaskParent) {
      console.log(`[BBMT_DEBUG] 既存反転マスク削除: ${wordState.invertMaskElement.name}`);
      try {
        if (wordState.invertMaskElement.parent) {
          wordState.invertMaskParent.removeChild(wordState.invertMaskElement);
        }
        if (!wordState.invertMaskElement.destroyed) {
          wordState.invertMaskElement.destroy();
        }
      } catch (error) {
        console.warn(`[BBMT_DEBUG] マスク削除エラー:`, error);
      }
      wordState.invertMaskElement = null;
      wordState.invertMaskParent = null;
    }
    
    if (currentActiveCharIndex >= 0) {
      // 対象文字のコンテナを見つける
      const targetChar = chars[currentActiveCharIndex];
      let targetCharContainer: PIXI.Container | null = null;
      
      container.children.forEach((child: any) => {
        if (child instanceof PIXI.Container && child.name && 
            child.name.includes(`char_container_${targetChar.id}`)) {
          targetCharContainer = child;
          console.log(`[BBMT_DEBUG] 対象文字コンテナ発見: ${child.name}, visible=${child.visible}, alpha=${child.alpha}`);
          // 文字コンテナ内のテキストオブジェクトも確認
          child.children.forEach((textChild: any, index: number) => {
            console.log(`[BBMT_DEBUG]   テキスト子要素${index}: ${textChild.constructor.name}, visible=${textChild.visible}, alpha=${textChild.alpha}`);
          });
        }
      });
      
      if (targetCharContainer) {
        const fontSize = params.fontSize as number || 120;
        const maskWidth = this.calculateCharWidth(targetChar.char, fontSize);
        const maskHeight = fontSize;
        
        console.log(`[BBMT_DEBUG] 反転マスク作成: targetChar='${targetChar.char}', pos=(${targetCharContainer.position.x}, ${targetCharContainer.position.y})`);
        
        // 【シンプル版】DIFFERENCE ブレンドモードで直接重ねる
        console.log(`[BBMT_DEBUG] シンプルDIFFERENCE反転マスク作成開始`);
        
        // 文字の相対位置を簡易計算（座標変換のエラーを回避）
        const charX = targetCharContainer.position.x;
        const charY = targetCharContainer.position.y;
        
        // 白矩形でDIFFERENCEブレンド
        const invertMask = this.shapePrimitive.createRectangle({
          width: maskWidth,
          height: maskHeight,
          x: charX - maskWidth / 2,
          y: charY - maskHeight / 2,
          color: '#FFFFFF', // 白色
          alpha: 1.0
        });
        
        // ブレンドモード設定
        const blendMode = params.maskBlendMode as string || 'difference';
        switch (blendMode) {
          case 'normal':
            invertMask.blendMode = PIXI.BLEND_MODES.NORMAL;
            break;
          case 'multiply':
            invertMask.blendMode = PIXI.BLEND_MODES.MULTIPLY;
            break;
          case 'difference':
            invertMask.blendMode = PIXI.BLEND_MODES.DIFFERENCE;
            break;
          case 'overlay':
            invertMask.blendMode = PIXI.BLEND_MODES.OVERLAY;
            break;
          case 'screen':
            invertMask.blendMode = PIXI.BLEND_MODES.SCREEN;
            break;
          default:
            invertMask.blendMode = PIXI.BLEND_MODES.DIFFERENCE;
        }
        invertMask.name = `invert_mask_${phraseId}_word_${wordIndex}`;
        
        // グラフィックコンテナに追加
        invertMaskContainer.addChild(invertMask);
        
        // グラフィックコンテナはzIndexで既に上層に設定済み
        
        console.log(`[BBMT_DEBUG] 反転マスク作成完了 (${blendMode}):`);
        console.log(`[BBMT_DEBUG] - マスク位置: (${invertMask.x}, ${invertMask.y})`);
        console.log(`[BBMT_DEBUG] - マスクコンテナ: ${invertMaskContainer.name}`);
        console.log(`[BBMT_DEBUG] - ブレンドモード: ${invertMask.blendMode}`);
        
        // 状態管理
        wordState.invertMaskElement = invertMask;
        wordState.invertMaskParent = invertMaskContainer;
        
        console.log(`[BBMT_DEBUG] 反転マスク作成完了: elementId=${maskElementId}, layerId=${phraseId}_white_mask`);
        wordState.currentCharIndex = currentActiveCharIndex;
      } else {
        console.log(`[BBMT_DEBUG] 対象文字コンテナが見つからない: targetChar.id=${targetChar.id}`);
      }
    }
  }
  
  /**
   * 黒帯のコラプスアニメーション
   */
  private animateBlackBandCollapse(
    phraseContainer: PIXI.Container,
    params: Record<string, unknown>,
    nowMs: number,
    collapseStartMs: number,
    elementId: string
  ): void {
    const collapseDuration = params.bandCollapseDuration as number || 800;
    const maxBandWidth = params.maxBandWidth as number || 4000;
    
    const progress = Math.min(1, (nowMs - collapseStartMs) / collapseDuration);
    
    // プリミティブのアニメーション機能を使用
    if (progress < 1) {
      // 高さアニメーション（収束）
      this.shapePrimitive.updateAnimation(
        `${elementId}_height_collapse`,
        nowMs
      );
      
      // 幅アニメーション（拡張）
      this.shapePrimitive.updateAnimation(
        `${elementId}_width_expand`,
        nowMs
      );
    } else {
      // アニメーション完了時にシンプル削除
      const blackBand = phraseContainer.children.find(child => 
        child.name && child.name.includes(`black_band_${elementId.replace('_black_band_rect', '')}`)
      );
      if (blackBand) {
        phraseContainer.removeChild(blackBand);
        if (blackBand instanceof PIXI.Graphics) {
          blackBand.clear();
        }
        blackBand.destroy();
        console.log(`[BBMT_DEBUG] 黒帯削除完了`);
      }
    }
  }
  
  /**
   * 文字コンテナの描画
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
    
    // ログ抑制: renderCharContainer
    
    // 既存のテキストオブジェクトをクリア
    container.removeChildren();
    
    // 基本パラメータ取得
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string;
    
    if (!fontFamily) {
      console.error('[BlackBandMaskTextPrimitive] fontFamilyパラメータが指定されていません');
      return false;
    }
    
    // 文字の表示タイミング制御（個別タイミング）
    const isCharActive = nowMs >= startMs && nowMs <= endMs;
    const shouldShowChar = nowMs >= startMs; // 文字のタイミング以降は表示し続ける
    
    // フレーズ終了時を除いて常に表示
    container.visible = true;
    
    // 文字のタイミング前は非表示
    if (!shouldShowChar) {
      container.visible = false;
      return true;
    }
    
    // 色の決定
    const defaultTextColor = params.textColor as string || '#FFFFFF';
    const activeTextColor = params.activeColor as string || '#FFD700';
    
    let textColor = defaultTextColor;
    
    // フレーズ終了時の処理（スワイプアウトに変更）
    const phraseEndMs = params.phraseEndMs as number || endMs;
    const isInPhraseSwipeOut = nowMs >= phraseEndMs;
    
    // スワイプアウト状態の確認
    const phraseId = params.phraseId as string || params.id as string || 'unknown';
    const isSwipeOutActive = this.swipeOutStates.has(phraseId);
    
    // ログ抑制: 文字レベル状態チェック
    
    // ログ抑制: フレーズ退場中だがスワイプアウト未開始
    
    if (isInPhraseSwipeOut && isSwipeOutActive) {
      // スワイプアウト中は文字を維持表示（コンテナの移動で制御）
      textColor = defaultTextColor; // 通常色で維持
      // ログ抑制: スワイプアウト中の文字維持表示
    } else {
      // 通常の表示状態判定
      if (isCharActive) {
        textColor = activeTextColor; // アクティブ期間
      } else {
        textColor = defaultTextColor; // アクティブ前またはアクティブ後
      }
    }
    
    // テキスト作成
    const textObj = TextStyleFactory.createHighDPIText(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor
    });
    
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    textObj.scale.set(1.0, 1.0);
    textObj.alpha = 1.0;
    textObj.visible = true;
    
    container.addChild(textObj);
    
    // 文字エフェクトの適用
    this.applyTextGlowShadowEffect(container, params);
    
    return true;
  }

  /**
   * 文字幅の計算
   */
  private calculateCharWidth(char: string, fontSize: number): number {
    if (this.isHalfWidthChar(char)) {
      return fontSize * 0.6; // 半角文字
    } else {
      return fontSize; // 全角文字
    }
  }
  
  /**
   * 文字コンテナの実際の位置を取得
   */
  private getCharContainerPosition(
    container: PIXI.Container,
    charId: string
  ): { x: number; y: number } | null {
    let position = null;
    
    container.children.forEach((child: any) => {
      if (child instanceof PIXI.Container && child.name && 
          child.name.includes(`char_container_${charId}`)) {
        position = { x: child.position.x, y: child.position.y };
      }
    });
    
    return position;
  }
  
  /**
   * 色の反転
   */
  private invertColor(color: string): string {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 6) {
        const r = 255 - parseInt(hex.substr(0, 2), 16);
        const g = 255 - parseInt(hex.substr(2, 2), 16);
        const b = 255 - parseInt(hex.substr(4, 2), 16);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
    
    // 簡易的な反転処理
    if (color.includes('rgb')) {
      return color.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/, (match, r, g, b) => {
        return `rgb(${255 - parseInt(r)}, ${255 - parseInt(g)}, ${255 - parseInt(b)})`;
      });
    }
    
    return '#000000'; // デフォルト
  }
  
  /**
   * 全単語の拡張ID情報を生成
   * タイムスタンプ+ランダム文字列形式のphraseIdにも対応
   */
  private generateAllWordExtendedIds(words: any[], phraseId: string): string[] {
    // ログ抑制: generateAllWordExtendedIds (毎フレーム出力)
    
    if (!words || !Array.isArray(words)) {
      console.warn(`[BLACKBAND_SIZE_CALC] generateAllWordExtendedIds: words data is invalid`);
      return [];
    }

    const result = words.map((word, wordIndex) => {
      if (!word.chars || !Array.isArray(word.chars)) {
        console.warn(`[BLACKBAND_SIZE_CALC] 単語${wordIndex}の文字データが不足しています。`);
        return `${phraseId}_word_${wordIndex}_h0f0`;
      }

      let halfWidth = 0;
      let fullWidth = 0;
      
      word.chars.forEach((char: any) => {
        if (char.char && this.isHalfWidthChar(char.char)) {
          halfWidth++;
        } else if (char.char) {
          fullWidth++;
        }
      });

      const extendedId = `${phraseId}_word_${wordIndex}_h${halfWidth}f${fullWidth}`;
      // ログ抑制: Generated extended ID (毎フレーム出力)
      return extendedId;
    });
    
    // ログ抑制: Generated all extended IDs (毎フレーム出力)
    return result;
  }

  /**
   * 半角文字判定
   */
  private isHalfWidthChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
  }

  // detectSeekメソッドを削除 - 純粋な時間ベース計算では不要

  /**
   * 既存マスクを強制削除し、黒帯を非表示にする
   */
  private clearExistingMask(blackBand: PIXI.Graphics, phraseId: string): void {
    try {
      if (!blackBand || blackBand.destroyed) return;

      // 既存マスクを削除
      if (blackBand.mask) {
        const maskToRemove = blackBand.mask;
        blackBand.mask = null;
        
        // マスクオブジェクトが親コンテナの子要素の場合は削除
        if (maskToRemove.parent) {
          maskToRemove.parent.removeChild(maskToRemove);
        }
        if (!maskToRemove.destroyed) {
          maskToRemove.destroy();
        }
        
        console.log(`[SEEK_SWIPE_DEBUG] 既存マスクを強制削除: phraseId=${phraseId}`);
      }

      // シーク時は黒帯を一時的に非表示にして視覚的継続性を断つ
      blackBand.visible = false;
      console.log(`[SEEK_SWIPE_DEBUG] 黒帯を一時的に非表示化: phraseId=${phraseId}`);
    } catch (error) {
      console.error(`[SEEK_SWIPE_DEBUG] マスククリアエラー:`, error);
    }
  }



  /**
   * フルIDからフレーズIDのみを抽出
   * サポート形式:
   * - "phrase_2_word_2_h0f5" → "phrase_2" (標準形式)
   * - "phrase_1755356679637_9qpijaf0e" → "phrase_1755356679637_9qpijaf0e" (タイムスタンプ+ランダム形式)
   * - "phrase_1755356679637_9qpijaf0e_word_0_char_1" → "phrase_1755356679637_9qpijaf0e" (タイムスタンプ+ランダム+word形式)
   */
  private extractPhraseIdFromFullId(fullId: string): string {
    // ログ抑制: extractPhraseIdFromFullId input (毎フレーム出力)
    
    // _word_ が含まれている場合は、その前までがフレーズID
    const wordIndex = fullId.indexOf('_word_');
    if (wordIndex !== -1) {
      const result = fullId.substring(0, wordIndex);
      // ログ抑制: extractPhraseIdFromFullId word found (毎フレーム出力)
      return result;
    }
    
    // _word_ が含まれていない場合は、全体がフレーズID
    // ログ抑制: extractPhraseIdFromFullId no word found (毎フレーム出力)
    return fullId;
  }

  /**
   * カラーにアルファ値を適用
   */
  private applyAlphaToColor(color: string, alpha: number): string {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 6) {
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
    
    if (color.includes('rgba')) {
      return color.replace(/rgba\(([^)]+)\)/, (match, params) => {
        const parts = params.split(',');
        if (parts.length >= 4) {
          parts[3] = ` ${alpha}`;
        }
        return `rgba(${parts.join(',')})`;
      });
    } else if (color.includes('rgb')) {
      return color.replace(/rgb\(([^)]+)\)/, `rgba($1, ${alpha})`);
    }
    
    return color;
  }
  
  /**
   * FlexibleCumulativeLayoutPrimitiveから実際の幅を取得
   */
  private getActualPhraseWidthFromLayout(params: Record<string, unknown>): number {
    const words = params.words as any[] || [];
    
    if (!words || words.length === 0) {
      // ログ抑制: 単語データなし、デフォルト幅使用 (毎フレーム出力)
      return (params.fontSize as number || 120) * 10;
    }
    
    // renderWordContainerと同じパラメータでFlexibleCumulativeLayoutPrimitiveを作成
    const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
    const fontSize = params.fontSize as number || 120;
    
    // 文字データを構築（renderWordContainerと同じロジック）
    const phraseId = params.phraseId as string || params.id as string || 'phrase_unknown';
    const extractedPhraseId = this.extractPhraseIdFromFullId(phraseId);
    const allWordExtendedIds = this.generateAllWordExtendedIds(words, extractedPhraseId);
    
    // 全単語の文字データを収集
    let allCharsData: any[] = [];
    words.forEach((word, wordIndex) => {
      if (word.chars && Array.isArray(word.chars)) {
        const wordCharsData = word.chars.map((char: any, charIndex: number) => ({
          id: char.id,
          char: char.char,
          start: char.start,
          end: char.end,
          charIndexInWord: charIndex,
          charIndex: char.charIndex || charIndex,
          wordIndex: wordIndex,
          totalChars: char.totalChars || word.chars.length,
          totalWords: char.totalWords || words.length
        }));
        allCharsData = allCharsData.concat(wordCharsData);
      }
    });
    
    const layoutParams = {
      charSpacing: params.charSpacing as number || 1.0,
      fontSize: fontSize,
      halfWidthSpacingRatio: 0.6,
      alignment: 'left' as const,
      containerSize: { width: 0, height: 0 },
      spacing: params.charSpacing as number || 1.0,
      chars: allCharsData,
      containerPrefix: 'char_container_',
      wordDisplayMode: WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE,
      wordSpacing: params.wordSpacing as number || 1.0,
      lineHeight: params.lineHeight as number || 1.2,
      allWordExtendedIds: allWordExtendedIds
    };
    
    // FlexibleCumulativeLayoutPrimitiveの実際の幅計算を使用
    // 最後の単語の最後の文字まで計算
    const lastWordIndex = words.length - 1;
    const totalWidth = this.calculateCumulativeWidthUsingPrimitive(layoutPrimitive, layoutParams, lastWordIndex, allCharsData.length - 1);
    
    // ログ抑制: FlexibleCumulativeLayoutPrimitive実測幅 (毎フレーム出力)
    
    // 拡張IDベース計算と比較
    const oldWidth = this.calculateFlexiblePhraseWidth_old(params);
    // ログ抑制: 幅計算比較 (毎フレーム出力)
    
    return totalWidth;
  }
  
  /**
   * FlexibleCumulativeLayoutPrimitiveの累積幅計算を利用
   */
  private calculateCumulativeWidthUsingPrimitive(
    layoutPrimitive: FlexibleCumulativeLayoutPrimitive,
    layoutParams: any,
    targetWordIndex: number,
    targetCharIndex: number
  ): number {
    // FlexibleCumulativeLayoutPrimitiveの内部メソッドを呼び出し
    // （実際のAPIに応じて調整が必要）
    
    // 暫定的に手動計算（FlexibleCumulativeLayoutPrimitiveと同じロジック）
    const fontSize = layoutParams.fontSize;
    const wordSpacing = layoutParams.wordSpacing;
    const charSpacing = layoutParams.charSpacing;
    
    let totalWidth = 0;
    let currentWordIndex = 0;
    
    layoutParams.chars.forEach((char: any, charIndex: number) => {
      // 文字幅を計算
      const charWidth = this.calculateCharWidth(char.char, fontSize);
      totalWidth += charWidth;
      
      // ログ抑制: 文字幅計算 (毎フレーム出力)
      
      // 文字間隔（単語内）- FlexibleCumulativeLayoutPrimitiveに合わせて調整
      const isLastCharInWord = charIndex === layoutParams.chars.length - 1 || 
                              layoutParams.chars[charIndex + 1]?.wordIndex !== char.wordIndex;
      
      if (!isLastCharInWord) {
        const charGap = charSpacing * fontSize * 0.05; // 係数を0.05に調整
        totalWidth += charGap;
        // ログ抑制: 文字間隔追加 (毎フレーム出力)
      } else if (char.wordIndex < targetWordIndex) {
        // 単語間隔
        const wordGap = wordSpacing * fontSize * 0.6; // 係数を0.6に調整
        totalWidth += wordGap;
        // ログ抑制: 単語間隔追加 (毎フレーム出力)
      }
    });
    
    return totalWidth;
  }
  
  /**
   * FlexibleCumulativeLayoutPrimitive準拠のフレーズ幅計算（旧版）
   */
  private calculateFlexiblePhraseWidth_old(params: Record<string, unknown>): number {
    const fontSize = params.fontSize as number || 120;
    const wordSpacing = params.wordSpacing as number || 1.0;
    const words = params.words as any[] || [];
    
    if (!words || words.length === 0) {
      // ログ抑制: 単語データなし、デフォルト幅使用 (毎フレーム出力)
      return fontSize * 10;
    }
    
    // 拡張IDを生成（FlexibleCumulativeLayoutPrimitiveと同じロジック）
    const phraseId = params.phraseId as string || params.id as string || 'phrase_unknown';
    const extractedPhraseId = this.extractPhraseIdFromFullId(phraseId);
    const allWordExtendedIds = this.generateAllWordExtendedIds(words, extractedPhraseId);
    
    // ログ抑制: FlexibleCumulativeLayoutPrimitive準拠幅計算 (毎フレーム出力)
    
    // FlexibleCumulativeLayoutPrimitiveと同じ幅計算ロジック
    let totalWidth = 0;
    const halfWidthCharWidth = fontSize * 0.6;
    const fullWidthCharWidth = fontSize;
    
    allWordExtendedIds.forEach((extendedId, wordIndex) => {
      // 拡張IDから文字数情報を解析
      const match = extendedId.match(/_h(\d+)f(\d+)$/);
      if (!match) {
        console.warn(`[BLACKBAND_SIZE_CALC] 無効な拡張ID: ${extendedId}`);
        return;
      }
      
      const halfWidthCount = parseInt(match[1]);
      const fullWidthCount = parseInt(match[2]);
      
      // 単語幅を計算
      const wordWidth = (halfWidthCount * halfWidthCharWidth) + (fullWidthCount * fullWidthCharWidth);
      totalWidth += wordWidth;
      
      // 単語間隔（最後の単語以外）
      if (wordIndex < allWordExtendedIds.length - 1) {
        totalWidth += wordSpacing * fontSize * 0.3;
      }
      
      // ログ抑制: 単語幅計算 (毎フレーム出力)
    });
    
    // ログ抑制: FlexibleCumulativeLayoutPrimitive準拠幅計算完了 (毎フレーム出力)
    return totalWidth;
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
   * 文字スライスの計算
   */
  private calculateCharacterSlices(params: Record<string, unknown>): VerticalSlice[] {
    const words = params.words as any[] || [];
    const fontSize = params.fontSize as number || 48;
    const charSpacing = params.charSpacing as number || 0.1;
    
    const slices: VerticalSlice[] = [];
    let currentX = 0;
    
    // 各単語の文字を処理
    words.forEach((word, wordIndex) => {
      if (!word.chars || !Array.isArray(word.chars)) return;
      
      word.chars.forEach((char: any, charIndex: number) => {
        const charWidth = this.calculateCharWidth(char.char || '', fontSize);
        
        slices.push({
          x: currentX,
          width: charWidth,
          wordIndex: wordIndex,
          charIndex: charIndex,
          charId: char.id || `${wordIndex}_${charIndex}`,
          originalChar: char.char || ''
        });
        
        currentX += charWidth + (charSpacing * fontSize);
      });
      
      // 単語間スペース
      if (wordIndex < words.length - 1) {
        const wordSpacing = params.wordSpacing as number || 1.0;
        currentX += wordSpacing * fontSize * 0.3;
      }
    });
    
    console.log(`[SWIPE_OUT_DEBUG] 文字スライス計算完了: ${slices.length}個のスライス, 総幅=${currentX}`);
    return slices;
  }
  
  
  /**
   * 黒帯をスライスとして再作成（隙間なく連続配置）
   */
  private recreateBlackBandAsSlices(
    blackBandContainer: PIXI.Container,
    params: Record<string, unknown>,
    phraseId: string,
    slices: VerticalSlice[]
  ): void {
    // 既存のスライス黒帯があるかチェック
    const hasExistingSlices = blackBandContainer.children.some(child => 
      child.name && child.name.includes('blackband_slice_')
    );
    
    // 既にスライス化済みの場合は何もしない
    if (hasExistingSlices) {
      console.log(`[SWIPE_OUT_DEBUG] 黒帯は既にスライス化済み: phraseId=${phraseId}`);
      return;
    }
    
    // 新しいスライス黒帯を作成してから既存の通常黒帯を削除（瞬間的消失防止）
    const newSlices: PIXI.Graphics[] = [];
    
    const fontSize = params.fontSize as number || 48;
    const bandHeight = fontSize * 1.5;
    const bandColor = 0x000000;
    
    console.log(`[SWIPE_OUT_DEBUG] 黒帯スライス再作成開始: ${slices.length}個のスライス`);
    
    let cumulativeX = 0; // 隙間なく連続配置するためのX座標（コンテナレベルでwordOffsetX適用済み）
    
    // 各文字スライス用の黒帯を作成（まずメモリ上に準備）
    slices.forEach((slice, index) => {
      const sliceGraphics = new PIXI.Graphics();
      sliceGraphics.beginFill(bandColor);
      sliceGraphics.drawRect(0, 0, slice.width, bandHeight);
      sliceGraphics.endFill();
      
      // 隙間なく連続配置（スペーシングを無視）
      sliceGraphics.position.set(cumulativeX, -bandHeight / 2);
      sliceGraphics.name = `blackband_slice_${index}`;
      
      // 次のスライスの位置を計算
      cumulativeX += slice.width;
      
      // まず配列に保存
      newSlices.push(sliceGraphics);
      
      console.log(`[SWIPE_OUT_DEBUG] スライス${index}作成: 元X=${slice.x.toFixed(1)}, 配置X=${sliceGraphics.x.toFixed(1)}, 幅=${slice.width.toFixed(1)}`);
    });
    
    // 一度に古い黒帯を削除し、新しいスライス黒帯を追加（瞬間的消失を最小化）
    blackBandContainer.removeChildren();
    newSlices.forEach(slice => blackBandContainer.addChild(slice));
    
    console.log(`[SWIPE_OUT_DEBUG] 黒帯スライス再作成完了: ${blackBandContainer.children.length}個, 総幅=${cumulativeX.toFixed(1)}`);
  }
  
  /**
   * スライススワイプアウトアニメーション
   */
  private animateSliceSwipeOut(
    phraseContainer: PIXI.Container,
    slices: VerticalSlice[],
    params: Record<string, unknown>,
    nowMs: number,
    swipeStartMs: number,
    tailTime: number,
    phraseId: string
  ): boolean {
    // 進行度計算の詳細ログ
    const timeSinceStart = nowMs - swipeStartMs;
    const progress = Math.max(0, Math.min(timeSinceStart / tailTime, 1.0));
    const easedProgress = this.easeOutCubic(progress);
    
    // ログ抑制: 詳細タイミング (毎フレーム出力)
    
    // プログレスが0より大きい場合のみアニメーションを実行
    if (progress > 0) {
      // 統一マスクによるスワイプアウト（黒帯と文字を同期）
      this.animateSynchronizedSwipeOut(phraseContainer, slices, easedProgress, phraseId, params);
    }
    
    const isComplete = progress >= 1.0;
    console.log(`[SWIPE_OUT_DEBUG] スワイプアニメーション: progress=${progress.toFixed(3)}, easedProgress=${easedProgress.toFixed(3)}, complete=${isComplete}`);
    
    return isComplete;
  }
  

  /**
   * 黒帯と文字の同期スワイプアウト（固定幅スライス方式）
   */
  private animateSynchronizedSwipeOut(
    phraseContainer: PIXI.Container,
    slices: VerticalSlice[],
    progress: number,
    phraseId: string,
    params: Record<string, unknown>
  ): void {
    const graphicsContainer = this.graphicsContainers.get(phraseId);
    if (!graphicsContainer) return;

    // 統一マスクの確定的な作成または再作成（シーク対応）
    let swipeMask = this.ensureUnifiedSwipeMask(phraseContainer, phraseId);
    if (!swipeMask || swipeMask.destroyed) {
      console.log(`[SWIPE_OUT_DEBUG] マスクが破棄されているため再作成: phraseId=${phraseId}`);
      swipeMask = this.createUnifiedSwipeMask(phraseContainer, phraseId);
    }

    // 固定幅スライスの計算
    const fontSize = params.fontSize as number || 120;
    const sliceWidth = fontSize * 0.8; // フォントサイズの80%を1スライス幅
    const phraseWidth = this.getActualPhraseWidthFromLayout(params);
    const totalSlices = Math.ceil(phraseWidth / sliceWidth);
    const phraseCenterOffset = phraseWidth / 2;
    const maskHeight = fontSize * 2;

    // マスク領域をクリアして開始
    swipeMask.clear();
    swipeMask.beginFill(0xFFFFFF, 1.0);

    // 各スライスを左から順番に時間差でワイプ（右端問題修正版）
    for (let sliceIndex = 0; sliceIndex < totalSlices; sliceIndex++) {
      // 左端のスライスから順番にワイプ開始（時間差）
      const sliceStartProgress = (sliceIndex / totalSlices) * 0.3; // 30%の時間差
      const sliceWipeProgress = Math.max(0, Math.min((progress - sliceStartProgress) / 0.7, 1.0)); // 残り70%でワイプ完了

      // スライスがまだワイプされていない場合のみマスクに追加
      if (sliceWipeProgress < 1.0) {
        const sliceX = phraseCenterOffset - phraseWidth / 2 + (sliceIndex * sliceWidth); // スライスの左端位置
        
        // 右端スライスの正確な幅計算（部分スライス対応）
        const maxSliceWidth = Math.min(sliceWidth, phraseWidth - (sliceIndex * sliceWidth));
        const remainingSliceWidth = maxSliceWidth * (1 - sliceWipeProgress); // スライス内の残り幅

        // 残り幅が正の値かつ有効な範囲内の場合のみ矩形を描画
        if (remainingSliceWidth > 0 && maxSliceWidth > 0) {
          // フレーズ境界を考慮した最終的な幅決定
          const actualSliceWidth = Math.min(remainingSliceWidth, maxSliceWidth);
          
          if (actualSliceWidth > 0 && sliceX < phraseCenterOffset + phraseWidth / 2) {
            // 右端境界チェック: スライスが右端を超えないように調整
            const rightEdge = sliceX + actualSliceWidth;
            const phraseRightEdge = phraseCenterOffset + phraseWidth / 2;
            const clampedWidth = rightEdge > phraseRightEdge ? 
              Math.max(0, phraseRightEdge - sliceX) : actualSliceWidth;
            
            if (clampedWidth > 0) {
              swipeMask.drawRect(sliceX, -maskHeight / 2, clampedWidth, maskHeight);
              console.log(`[SWIPE_RIGHT_EDGE_FIX] スライス${sliceIndex}: X=${sliceX.toFixed(1)}, 幅=${clampedWidth.toFixed(1)}, 最大幅=${maxSliceWidth.toFixed(1)}, 残り幅=${remainingSliceWidth.toFixed(1)}`);
            }
          }
        }
      }
    }

    swipeMask.endFill();

    // 黒帯コンテナと文字コンテナの両方に同じマスクを安全に適用
    try {
      if (graphicsContainer.blackBandContainer && !graphicsContainer.blackBandContainer.destroyed) {
        graphicsContainer.blackBandContainer.mask = swipeMask;
      }
    } catch (error) {
      console.warn(`[SWIPE_OUT_DEBUG] 黒帯コンテナマスク適用エラー:`, error);
    }

    // 文字コンテナにも同じマスクを安全に適用
    try {
      phraseContainer.children.forEach(child => {
        try {
          const isCharContainer = child && !child.destroyed && child instanceof PIXI.Container && child.name && 
                                 (child.name.includes('char_container') || child.name.includes('word_container'));
          if (isCharContainer) {
            child.mask = swipeMask;
          }
        } catch (error) {
          // 個別の子要素でエラーが発生しても継続
        }
      });
    } catch (error) {
      console.warn(`[SWIPE_OUT_DEBUG] 文字コンテナマスク適用エラー:`, error);
    }

    console.log(`[SWIPE_OUT_DEBUG] 固定幅スライススワイプ: progress=${progress.toFixed(2)}, totalSlices=${totalSlices}, sliceWidth=${sliceWidth.toFixed(1)}`);
  }

  /**
   * 統一スワイプマスクの確定的な取得・作成（シーク対応）
   */
  private ensureUnifiedSwipeMask(phraseContainer: PIXI.Container, phraseId: string): PIXI.Graphics | null {
    if (!phraseContainer || phraseContainer.destroyed) {
      return null;
    }

    // 既存のマスクを検索
    const existingMask = phraseContainer.children.find(child => 
      child.name === 'unified_swipe_mask' && !child.destroyed
    ) as PIXI.Graphics;

    if (existingMask) {
      return existingMask;
    }

    // マスクが見つからない場合は新規作成
    return this.createUnifiedSwipeMask(phraseContainer, phraseId);
  }

  /**
   * 統一スワイプマスクの作成
   */
  private createUnifiedSwipeMask(phraseContainer: PIXI.Container, phraseId: string): PIXI.Graphics {
    // 古いマスクが残っている場合は削除
    this.removeOldSwipeMasks(phraseContainer);

    const swipeMask = new PIXI.Graphics();
    swipeMask.name = 'unified_swipe_mask';
    phraseContainer.addChild(swipeMask);

    console.log(`[SWIPE_OUT_DEBUG] 統一マスク新規作成: phraseId=${phraseId}`);
    return swipeMask;
  }

  /**
   * 古いスワイプマスクのシンプルなクリア
   */
  private removeOldSwipeMasks(phraseContainer: PIXI.Container): void {
    try {
      if (!phraseContainer || phraseContainer.destroyed) {
        return;
      }

      // 古いマスクは非表示にするだけ（破棄しない）
      phraseContainer.children.forEach(child => {
        try {
          if (child && child.name === 'unified_swipe_mask' && !child.destroyed) {
            child.visible = false;
            if (child instanceof PIXI.Graphics) {
              child.clear(); // グラフィックデータのみクリア
            }
          }
        } catch (error) {
          // エラーは無視
        }
      });
    } catch (error) {
      // 全体エラーは無視
    }
  }

  /**
   * タイムライン時間に基づくスワイプ状態の確定
   */

  /**
   * 黒帯スライスのワイプアウトアニメーション（旧版・未使用）
   */
  private animateBlackBandSliceWipe_OLD(phraseId: string, progress: number): void {
    const graphicsContainer = this.graphicsContainers.get(phraseId);
    if (!graphicsContainer || !graphicsContainer.blackBandContainer) return;
    
    const blackBandContainer = graphicsContainer.blackBandContainer;
    const totalSlices = blackBandContainer.children.length;
    
    // 各黒帯スライスを左から右への時間差でワイプ処理
    blackBandContainer.children.forEach((slice: any, sliceIndex: number) => {
      if (slice instanceof PIXI.Graphics && slice.name && slice.name.includes('blackband_slice_')) {
        // 元の幅と位置を保存
        if (!slice.userData) {
          slice.userData = { 
            originalWidth: slice.width,
            originalX: slice.x
          };
        }
        
        // 左から右への時間差計算 (左端のスライスから順にワイプ開始)
        const sliceProgress = totalSlices > 1 ? sliceIndex / (totalSlices - 1) : 0; // 0.0〜1.0
        const adjustedProgress = Math.max(0, progress - sliceProgress * 0.3); // 0.3の時間差
        const normalizedProgress = Math.min(adjustedProgress / 0.7, 1.0); // 残り0.7でワイプ完了
        
        // スライス内での左から右へのワイプ（位置と幅の調整、アルファ値は1.0維持）
        slice.alpha = 1.0; // アルファ値は変更しない
        
        if (normalizedProgress <= 0) {
          // まだワイプ開始前 - 元の状態を維持
          slice.width = slice.userData.originalWidth;
          slice.x = slice.userData.originalX;
        } else if (normalizedProgress >= 1.0) {
          // 完全にワイプ完了 - 幅を0に
          slice.width = 0;
          slice.x = slice.userData.originalX + slice.userData.originalWidth; // 右端まで移動
        } else {
          // 左から右にワイプ - 左端を右にずらしながら幅を縮小
          const wipeDistance = slice.userData.originalWidth * normalizedProgress;
          slice.x = slice.userData.originalX + wipeDistance; // 左端を右に移動
          slice.width = slice.userData.originalWidth - wipeDistance; // 残り幅
        }
      }
    });
    
    console.log(`[SWIPE_OUT_DEBUG] 黒帯時間差ワイプ: progress=${progress.toFixed(2)}, ${totalSlices}スライス, 左から右へ順次ワイプ（幅調整）`);
  }
  
  /**
   * 文字のワイプアウトアニメーション（旧版・未使用）
   */
  private animateCharacterWipe_OLD(
    phraseContainer: PIXI.Container,
    slices: VerticalSlice[],
    progress: number,
    phraseId: string
  ): void {
    let charContainerCount = 0;
    let processedCount = 0;
    
    // フレーズコンテナ内の文字コンテナを検索・処理
    console.log(`[SWIPE_OUT_DEBUG] フレーズコンテナ内容: ${phraseContainer.children.length}個の子要素`);
    
    phraseContainer.children.forEach((child, childIndex) => {
      console.log(`[SWIPE_OUT_DEBUG] 子要素${childIndex}: name="${child.name || 'unnamed'}", type=${child.constructor.name}, visible=${child.visible}`);
      
      // 文字コンテナ検索（より具体的な条件）
      const isCharContainer = child instanceof PIXI.Container && child.name && 
                             child.name.match(/char.*container|container.*char|word.*container|container.*word/i);
      
      if (isCharContainer) {
        charContainerCount++;
        console.log(`[SWIPE_OUT_DEBUG] ✓ 文字コンテナ発見: "${child.name}", 処理開始`);
        this.applyCharacterSliceWipe(child as PIXI.Container, childIndex, slices.length, progress, phraseId);
        processedCount++;
      }
    });
    
    // 文字コンテナが見つからない場合、全てのコンテナ子要素を処理
    if (charContainerCount === 0) {
      console.log(`[SWIPE_OUT_DEBUG] 文字コンテナが見つからない - 全PIXIコンテナを処理`);
      phraseContainer.children.forEach((child, childIndex) => {
        if (child instanceof PIXI.Container && child.visible) {
          console.log(`[SWIPE_OUT_DEBUG] 代替処理: コンテナ "${child.name || 'unnamed'}" を処理`);
          this.applyCharacterSliceWipe(child as PIXI.Container, childIndex, slices.length, progress, phraseId);
          processedCount++;
        }
      });
    }
    
    console.log(`[SWIPE_OUT_DEBUG] 文字時間差ワイプ完了: progress=${progress.toFixed(2)}, 総子要素=${phraseContainer.children.length}, 文字コンテナ数=${charContainerCount}, 処理済み=${processedCount}`);
  }
  
  /**
   * 個別文字コンテナのスライスワイプアウト（マスクによる左から右へのワイプ）
   */
  private applyCharacterSliceWipe(
    charContainer: PIXI.Container,
    charIndex: number,
    totalChars: number,
    progress: number,
    phraseId: string
  ): void {
    // 左から右への時間差計算（黒帯と同じロジック）
    const charProgress = totalChars > 1 ? charIndex / (totalChars - 1) : 0; // 0.0〜1.0
    const adjustedProgress = Math.max(0, progress - charProgress * 0.3); // 0.3の時間差
    const normalizedProgress = Math.min(adjustedProgress / 0.7, 1.0); // 残り0.7でワイプ完了
    
    // 文字のアルファ値は変更せず、マスクでワイプ効果
    charContainer.alpha = 1.0;
    
    if (normalizedProgress <= 0) {
      // まだワイプ開始前 - マスクなし
      charContainer.mask = null;
      // 既存のマスクを削除
      this.removeCharacterWipeMask(charContainer);
    } else if (normalizedProgress >= 1.0) {
      // 完全にワイプ完了 - 完全に隠す
      this.applyCharacterWipeMask(charContainer, 0, phraseId);
    } else {
      // 部分的にワイプ - 右側から徐々に隠す
      const charBounds = charContainer.getBounds();
      const remainingWidth = charBounds.width * (1 - normalizedProgress);
      this.applyCharacterWipeMask(charContainer, remainingWidth, phraseId);
    }
    
    // 完全にワイプ完了した場合は文字コンテナ自体を非表示にする（マスク削除後の再表示防止）
    if (normalizedProgress >= 1.0) {
      charContainer.visible = false;
      console.log(`[SWIPE_OUT_DEBUG] 文字完全非表示化: charIndex=${charIndex}`);
    }
    
    console.log(`[SWIPE_OUT_DEBUG] 文字ワイプマスク更新: charIndex=${charIndex}, progress=${progress.toFixed(3)}, normalizedProgress=${normalizedProgress.toFixed(3)}, ワイプ進行度=${(normalizedProgress * 100).toFixed(1)}%`);
  }
  
  /**
   * 文字コンテナにワイプマスクを適用（安全な作成処理）
   */
  private applyCharacterWipeMask(
    charContainer: PIXI.Container,
    remainingWidth: number,
    phraseId: string
  ): void {
    try {
      // コンテナの有効性をチェック
      if (!charContainer || charContainer.destroyed) {
        console.warn(`[SWIPE_OUT_DEBUG] 無効なコンテナ: マスク適用をスキップ`);
        return;
      }
      
      // 既存のマスクを安全に削除
      this.removeCharacterWipeMask(charContainer);
      
      // 残り幅が0以下の場合は完全に隠すため、マスク不要
      if (remainingWidth <= 0) {
        console.log(`[SWIPE_OUT_DEBUG] 完全ワイプ: "${charContainer.name}" マスク不要`);
        return;
      }
      
      // 新しいマスクを作成
      const mask = new PIXI.Graphics();
      mask.name = 'char_wipe_mask';
      mask.renderable = true;
      mask.eventMode = 'none'; // イベント処理を無効化してパフォーマンス向上
      
      mask.beginFill(0x000000);
      
      // より確実なマスク領域の設定
      const maskWidth = Math.max(1, remainingWidth); // 最小1px
      const maskHeight = 100; // 十分な高さ
      
      // 左側から残り幅分だけ表示（簡単な矩形マスク）
      mask.drawRect(
        -50, // 左端を十分左に
        -maskHeight / 2, // 中央揃え
        maskWidth + 50, // 幅を十分に確保
        maskHeight
      );
      mask.endFill();
      
      // マスクをコンテナに追加してから適用
      charContainer.addChild(mask);
      charContainer.mask = mask;
      
      console.log(`[SWIPE_OUT_DEBUG] マスク適用完了: "${charContainer.name}", remainingWidth=${remainingWidth.toFixed(1)}, maskWidth=${maskWidth.toFixed(1)}`);
    } catch (error) {
      console.error(`[SWIPE_OUT_DEBUG] マスク適用エラー:`, error);
      // エラー時は既存マスクのみ削除
      this.removeCharacterWipeMask(charContainer);
    }
  }
  
  /**
   * 文字コンテナからワイプマスクを削除（安全な破棄処理）
   */
  private removeCharacterWipeMask(charContainer: PIXI.Container): void {
    try {
      // 現在のマスクを安全に削除
      if (charContainer.mask) {
        const currentMask = charContainer.mask;
        charContainer.mask = null; // 先にマスクを無効化
        
        // マスクがコンテナの子要素の場合は削除
        if (currentMask.parent === charContainer) {
          charContainer.removeChild(currentMask);
        }
        
        // マスクオブジェクトを破棄
        if (!currentMask.destroyed) {
          currentMask.destroy({
            children: true,
            texture: false,
            baseTexture: false
          });
        }
      }
      
      // 名前による検索での削除（念のため）
      const maskToRemove = charContainer.children.find(child => child.name === 'char_wipe_mask');
      if (maskToRemove) {
        charContainer.removeChild(maskToRemove);
        if (!maskToRemove.destroyed) {
          maskToRemove.destroy({
            children: true,
            texture: false,
            baseTexture: false
          });
        }
      }
    } catch (error) {
      console.warn(`[SWIPE_OUT_DEBUG] マスク削除エラー:`, error);
      // エラーが発生してもマスクは無効化
      charContainer.mask = null;
    }
  }
  
  /**
   * 旧マスク処理（アルファベース処理に置き換えたため使用しない）
   */
  private applyPhraseWipeMask(
    phraseContainer: PIXI.Container,
    remainingWidth: number,
    phraseId: string
  ): void {
    // 新しいアルファベーススライス処理により、このマスク処理は使用しない
    console.log(`[SWIPE_OUT_DEBUG] 旧マスク処理スキップ: アルファベース処理に置き換え済み`);
  }
  
  /**
   * 統一スワイプマスクのシンプルなクリーンアップ
   */
  private cleanupUnifiedSwipeMask(phraseContainer: PIXI.Container): void {
    try {
      if (!phraseContainer || phraseContainer.destroyed) {
        return;
      }

      // マスク参照を全て削除（破棄はしない）
      this.clearAllMaskReferences(phraseContainer);
      
      // 統一マスクを探して非表示化のみ（破棄しない）
      const unifiedMask = phraseContainer.children.find(child => 
        child && child.name === 'unified_swipe_mask' && !child.destroyed
      );
      
      if (unifiedMask) {
        unifiedMask.visible = false;
        (unifiedMask as PIXI.Graphics).clear(); // グラフィックデータのみクリア
      }
      
      console.log(`[SWIPE_OUT_DEBUG] 統一マスククリーンアップ完了（破棄なし）`);
      
    } catch (error) {
      console.error(`[SWIPE_OUT_DEBUG] クリーンアップエラー:`, error);
    }
  }

  /**
   * 全てのマスク参照を削除（シンプル版）
   */
  private clearAllMaskReferences(phraseContainer: PIXI.Container): void {
    try {
      // フレーズコンテナ内の全子要素のマスクを削除
      phraseContainer.children.forEach(child => {
        try {
          if (child && !child.destroyed && child.mask) {
            child.mask = null;
          }
        } catch (error) {
          // エラーは無視して継続
        }
      });

      // グラフィックコンテナのマスクも削除
      const phraseId = this.extractPhraseIdFromFullId(phraseContainer.name || '');
      const graphicsContainer = this.graphicsContainers.get(phraseId);
      if (graphicsContainer && graphicsContainer.blackBandContainer && !graphicsContainer.blackBandContainer.destroyed) {
        try {
          graphicsContainer.blackBandContainer.mask = null;
        } catch (error) {
          // エラーは無視
        }
      }
    } catch (error) {
      // 全体エラーは無視
    }
  }

  /**
   * 文字コンテナの安全な非表示化
   */
  private safelyHideCharContainers(phraseContainer: PIXI.Container): void {
    try {
      phraseContainer.children.forEach(child => {
        try {
          if (child && !child.destroyed && child instanceof PIXI.Container && child.name && 
              (child.name.includes('char_container') || child.name.includes('word_container'))) {
            child.visible = false;
          }
        } catch (error) {
          // 個別の子要素でエラーが発生しても継続
        }
      });
    } catch (error) {
      console.warn(`[SWIPE_OUT_DEBUG] 文字コンテナ非表示化エラー:`, error);
    }
  }

  /**
   * スワイプマスクのクリーンアップ（旧版）
   */
  private cleanupSwipeMask_OLD(phraseContainer: PIXI.Container): void {
    try {
      console.log(`[SWIPE_OUT_DEBUG] スワイプマスククリーンアップ開始`);
      
      // フレーズコンテナが破棄されている場合はスキップ
      if (!phraseContainer || phraseContainer.destroyed) {
        console.warn(`[SWIPE_OUT_DEBUG] フレーズコンテナが無効: クリーンアップスキップ`);
        return;
      }
      
      let cleanedCount = 0;
      let hiddenCount = 0;
      
      // 文字コンテナからワイプマスクを削除（安全な反復処理）
      const childrenToClean = [...phraseContainer.children]; // コピーを作成
      
      // ステップ1: まず全ての文字コンテナを非表示にする
      childrenToClean.forEach(child => {
        try {
          if (child instanceof PIXI.Container && !child.destroyed) {
            // スワイプアウトした文字は非表示のままにする
            if (child.visible) {
              child.visible = false;
              hiddenCount++;
              console.log(`[SWIPE_OUT_DEBUG] 文字コンテナ非表示化: "${child.name || 'unnamed'}"`);
            }
          }
        } catch (error) {
          console.warn(`[SWIPE_OUT_DEBUG] 文字非表示化エラー:`, error);
        }
      });
      
      // ステップ2: 次にマスクを削除（文字が非表示になった後）
      childrenToClean.forEach(child => {
        try {
          if (child instanceof PIXI.Container && !child.destroyed) {
            // アルファ値リセット（将来の再利用のため）
            child.alpha = 1.0;
            
            // ワイプマスクを安全に削除
            this.removeCharacterWipeMask(child);
            cleanedCount++;
          }
        } catch (error) {
          console.warn(`[SWIPE_OUT_DEBUG] 個別マスククリーンアップエラー:`, error);
        }
      });
      
      // ステップ3: フレーズレベルのマスククリーンアップ
      if (phraseContainer.mask) {
        phraseContainer.mask = null;
      }
      
      // 旧フレーズマスクが残っている場合は削除
      const maskToRemove = phraseContainer.children.find(child => child.name === 'phrase_swipe_mask');
      if (maskToRemove) {
        try {
          phraseContainer.removeChild(maskToRemove);
          if (!maskToRemove.destroyed) {
            maskToRemove.destroy({
              children: true,
              texture: false,
              baseTexture: false
            });
          }
        } catch (error) {
          console.warn(`[SWIPE_OUT_DEBUG] フレーズマスク削除エラー:`, error);
        }
      }
      
      console.log(`[SWIPE_OUT_DEBUG] スワイプマスククリーンアップ完了: ${hiddenCount}個を非表示化, ${cleanedCount}個のマスクを削除`);
    } catch (error) {
      console.error(`[SWIPE_OUT_DEBUG] スワイプマスククリーンアップ致命的エラー:`, error);
    }
  }

  /**
   * シンプルなフレーズグラフィック要素のクリーンアップ
   */
  private clearPhraseGraphics(phraseContainer: PIXI.Container): void {
    // フレーズ終了時のグラフィックコンテナクリーンアップ
    const phraseId = this.extractPhraseIdFromContainerName(phraseContainer.name || '');
    if (phraseId) {
      console.log(`[GRAPHICS_CLEANUP] フレーズ終了によるクリーンアップ開始: phraseId=${phraseId}`);
      
      // グラフィックコンテナの完全削除
      const containers = this.graphicsContainers.get(phraseId);
      if (containers) {
        // 黒帯コンテナの削除
        if (containers.blackBandContainer && !containers.blackBandContainer.destroyed) {
          containers.blackBandContainer.removeChildren();
          if (containers.blackBandContainer.parent) {
            containers.blackBandContainer.parent.removeChild(containers.blackBandContainer);
          }
          containers.blackBandContainer.destroy({ children: true });
        }
        
        // 反転マスクコンテナの削除
        if (containers.invertMaskContainer && !containers.invertMaskContainer.destroyed) {
          containers.invertMaskContainer.removeChildren();
          if (containers.invertMaskContainer.parent) {
            containers.invertMaskContainer.parent.removeChild(containers.invertMaskContainer);
          }
          containers.invertMaskContainer.destroy({ children: true });
        }
        
        // マップから削除
        this.graphicsContainers.delete(phraseId);
        console.log(`[GRAPHICS_CLEANUP] グラフィックコンテナ完全削除完了: phraseId=${phraseId}`);
      }
    }
  }

  /**
   * 確定的マスクサイズ計算（時刻に対して一意に決定）
   */
  private calculateDeterministicMaskSize(progress: number, params: Record<string, unknown>): {
    phraseWidth: number;
    bandWidth: number;
    bandHeight: number;
    visibleWidth: number;
    phraseCenterOffset: number;
  } {
    // 通常の幅計算（キャッシュは不要）
    const phraseWidth = this.getActualPhraseWidthFromLayout(params);
    const fontSize = params.fontSize as number || 120;
    const marginWidth = params.blackBandMarginWidth as number || 1.0;
    const bandHeightRatio = params.blackBandHeightRatio as number || 1.0;
    const bandWidth = phraseWidth + (fontSize * marginWidth * 2);
    const bandHeight = fontSize * bandHeightRatio * 1.5;
    const phraseCenterOffset = phraseWidth / 2;
    
    // 確定的な可視幅計算（補間は不要）
    const visibleWidth = bandWidth * Math.max(0, Math.min(1, progress));
    
    return {
      phraseWidth,
      bandWidth,
      bandHeight,
      visibleWidth,
      phraseCenterOffset
    };
  }


  /**
   * マスク強制再作成（既存マスクを完全削除して新規作成）
   */
  private recreateSwipeInMask(blackBand: PIXI.Graphics, phraseId: string): PIXI.Graphics | null {
    if (!blackBand || !blackBand.parent) {
      return null;
    }
    
    const maskName = `swipe_in_mask_${phraseId}`;
    
    // 既存マスクを完全に削除
    const existingMask = blackBand.parent.children.find(
      child => child && child.name === maskName
    );
    
    if (existingMask) {
      // マスク関連付けを解除
      if (blackBand.mask === existingMask) {
        blackBand.mask = null;
      }
      
      // マスクオブジェクトを完全削除
      blackBand.parent.removeChild(existingMask);
      existingMask.destroy({ children: true });
    }
    
    // 新規マスク作成
    const newMask = new PIXI.Graphics();
    newMask.name = maskName;
    blackBand.parent.addChild(newMask);
    
    return newMask;
  }

  /**
   * 確定的マスク描画適用
   */
  private applyDeterministicMask(
    swipeInMask: PIXI.Graphics,
    blackBand: PIXI.Graphics,
    maskSize: ReturnType<typeof this.calculateDeterministicMaskSize>,
    phraseId: string
  ): void {
    // マスクをクリア（新規作成されているが念のため）
    swipeInMask.clear();
    
    if (maskSize.visibleWidth > 1) { // 1px未満は表示しない（微小値による誤表示防止）
      // マスク描画（左から右へスワイプイン）
      blackBand.visible = true;
      swipeInMask.beginFill(0xFFFFFF, 1.0);
      swipeInMask.drawRect(
        maskSize.phraseCenterOffset - maskSize.bandWidth / 2, // 左端
        -maskSize.bandHeight / 2,                              // 上端
        maskSize.visibleWidth,                                // 進行度に応じた幅
        maskSize.bandHeight                                   // 高さ
      );
      swipeInMask.endFill();
      
      // マスク適用
      blackBand.mask = swipeInMask;
      console.log(`[MASK_DEBUG] 黒帯表示: phraseId=${phraseId}, visibleWidth=${maskSize.visibleWidth.toFixed(1)}`);
    } else {
      // progress=0または微小値の場合は完全非表示
      blackBand.mask = null;
      blackBand.visible = false;
      console.log(`[MASK_DEBUG] 黒帯非表示: phraseId=${phraseId}, visibleWidth=${maskSize.visibleWidth.toFixed(1)}`);
    }
  }

  /**
   * 文字エフェクトの適用
   */
  private applyTextGlowShadowEffect(container: PIXI.Container, params: Record<string, unknown>): void {
    const enableGlow = params.enableTextGlow as boolean || false;
    const enableShadow = params.enableTextShadow as boolean || false;

    if (!enableGlow && !enableShadow) {
      // エフェクトが無効な場合は既存のエフェクトを削除
      this.textGlowEffectPrimitive.removeEffect(container);
      return;
    }

    // エフェクトパラメータを構築
    const effectParams: CompositeEffectParams = {
      enableGlow: enableGlow,
      enableShadow: enableShadow,
      blendMode: 'normal',
      glow: enableGlow ? {
        glowStrength: params.textGlowStrength as number || 1.0,
        glowBrightness: params.textGlowBrightness as number || 1.0,
        glowBlur: params.textGlowBlur as number || 10,
        glowQuality: params.textGlowQuality as number || 4,
        glowPadding: 10,
        threshold: 0.5
      } : undefined,
      shadow: enableShadow ? {
        shadowBlur: params.textShadowBlur as number || 10,
        shadowColor: params.textShadowColor as string || '#000000',
        shadowAngle: params.textShadowAngle as number || 45,
        shadowDistance: params.textShadowDistance as number || 5,
        shadowAlpha: params.textShadowAlpha as number || 0.8,
        shadowOnly: false,
        shadowQuality: params.textShadowQuality as number || 4
      } : undefined
    };

    // エフェクトを適用
    this.textGlowEffectPrimitive.applyEffect(container, effectParams);
  }

  /**
   * 黒帯エフェクトの適用
   */
  private applyBandGlowShadowEffect(container: PIXI.Container, params: Record<string, unknown>): void {
    const enableGlow = params.enableBandGlow as boolean || false;
    const enableShadow = params.enableBandShadow as boolean || false;

    if (!enableGlow && !enableShadow) {
      // エフェクトが無効な場合は既存のエフェクトを削除
      this.bandGlowEffectPrimitive.removeEffect(container);
      return;
    }

    // エフェクトパラメータを構築
    const effectParams: CompositeEffectParams = {
      enableGlow: enableGlow,
      enableShadow: enableShadow,
      blendMode: 'normal',
      glow: enableGlow ? {
        glowStrength: params.bandGlowStrength as number || 1.0,
        glowBrightness: params.bandGlowBrightness as number || 1.0,
        glowBlur: params.bandGlowBlur as number || 10,
        glowQuality: params.bandGlowQuality as number || 4,
        glowPadding: 10,
        threshold: 0.5
      } : undefined,
      shadow: enableShadow ? {
        shadowBlur: params.bandShadowBlur as number || 10,
        shadowColor: params.bandShadowColor as string || '#000000',
        shadowAngle: params.bandShadowAngle as number || 45,
        shadowDistance: params.bandShadowDistance as number || 5,
        shadowAlpha: params.bandShadowAlpha as number || 0.8,
        shadowOnly: false,
        shadowQuality: params.bandShadowQuality as number || 4
      } : undefined
    };

    // エフェクトを適用
    this.bandGlowEffectPrimitive.applyEffect(container, effectParams);
  }
}