/**
 * VerticalBlackBandTextPrimitive v1.0
 * 縦書き黒帯スワイプアニメーションテンプレート
 * BlackBandMaskTextPrimitiveをベースに縦書き対応実装
 */

import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, ParameterConfig } from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { 
  SlideAnimationPrimitive,
  VerticalLayoutPrimitive,
  WordDisplayMode,
  type FlexibleCharacterData,
  type VerticalLayoutParams,
  type TextDirection,
  ShapePrimitive,
  type RectangleParams,
  MultiLineLayoutPrimitive,
  GlowEffectPrimitive,
  SparkleEffectPrimitive
} from '../primitives';
import { CharUnit } from '../types/types';

/**
 * 水平スライス情報（縦書き用：1文字分のブロック単位）
 */
interface HorizontalSlice {
  y: number;           // スライスのY座標
  height: number;      // 1文字分の高さ
  charId: string;      // 対応する文字ID
  wordIndex: number;   // 単語インデックス
  charIndex: number;   // 文字インデックス
  originalChar: string; // 元の文字
}

/**
 * 縦書き黒帯スワイプアニメーションテンプレート
 */
export class VerticalBlackBandTextPrimitive implements IAnimationTemplate {
  
  // Graphics Primitives
  private shapePrimitive = new ShapePrimitive();
  private textGlowEffectPrimitive = new GlowEffectPrimitive();
  private bandGlowEffectPrimitive = new GlowEffectPrimitive();
  
  // デバッグ用マスク色定義
  private readonly DEBUG_MASK_COLORS = {
    swipeIn: 0xFF0000,    // 赤：スワイプインマスク
    unified: 0x00FF00,    // 緑：統一スワイプマスク
    invert: 0x0000FF      // 青：反転マスク
  };
  
  // グラフィックコンテナ管理
  private graphicsContainers = new Map<string, {
    blackBandContainer: PIXI.Container;
    invertMaskContainer: PIXI.Container;
  }>();
  
  readonly metadata = {
    name: "VerticalBlackBandTextPrimitive",
    version: "1.0.0",
    description: "縦書き黒帯スワイプアニメーションテンプレート - 上から下へのスワイプイン・アウト",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "UTAVISTA Development Team",
      contribution: "縦書き黒帯スワイプテンプレート v1.0 実装",
      date: "2025-09-01"
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
    slices: HorizontalSlice[];
    isSwipeOutActive: boolean;
    swipeStartMs: number;
    tailTime: number;
  }>();

  // シーク検出用の時刻管理
  private lastTimeMap = new Map<string, number>();
  
  // フェーズ変更検出用
  private lastPhaseMap = new Map<string, AnimationPhase>();

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
      
      // 縦書き設定
      { 
        name: "textDirection", 
        type: "string", 
        default: "vertical",
        options: ["vertical"]
      },
      { 
        name: "verticalStartPosition", 
        type: "string", 
        default: "top",
        options: ["top", "center", "bottom"]
      },
      { 
        name: "verticalLineDirection", 
        type: "string", 
        default: "rtl",
        options: ["rtl", "ltr"]
      },
      
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
      
      // 縦書きオフセット設定
      { name: "wordOffsetY", type: "number", default: 0, min: -2000, max: 200, step: 5 },
      
      // 句読点調整
      { name: "enablePunctuationAdjustment", type: "boolean", default: true },
      { name: "punctuationCharacters", type: "string", default: "、。，．" },
      { name: "punctuationOffsetXRatio", type: "number", default: 0, min: -1.0, max: 1.0, step: 0.01 },
      { name: "punctuationOffsetYRatio", type: "number", default: 0, min: -1.0, max: 1.0, step: 0.01 },
      
      // アルファベット回転
      { name: "enableAlphabetRotation", type: "boolean", default: true },
      { name: "alphabetRotationPattern", type: "string", default: "[a-zA-Z0-9]+" },
      { name: "alphabetCharSpacingRatio", type: "number", default: 0.8, min: 0.1, max: 2.0, step: 0.1 },
      
      // 長音記号回転
      { name: "enableLongVowelRotation", type: "boolean", default: true },
      { name: "longVowelCharacters", type: "string", default: "ー－‐−─━" },
      
      // 小文字調整
      { name: "enableSmallCharAdjustment", type: "boolean", default: true },
      { name: "smallCharacters", type: "string", default: "っゃゅょァィゥェォッャュョヮヵヶ" },
      { name: "smallCharOffsetXRatio", type: "number", default: 0.15, min: -1.0, max: 1.0, step: 0.01 },
      { name: "smallCharOffsetYRatio", type: "number", default: 0.1, min: -1.0, max: 1.0, step: 0.01 },
      
      // 縦書き多行表示設定（時間的に隣接するフレーズの行分離）
      { name: "enableVerticalMultiLine", type: "boolean", default: true },
      { name: "maxVerticalLines", type: "number", default: 4, min: 1, max: 8, step: 1 },
      { name: "verticalLineOverlapThreshold", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
      { name: "verticalAutoLineSpacing", type: "number", default: 1.8, min: 1.0, max: 3.0, step: 0.1 },
      { name: "verticalLineResetInterval", type: "number", default: 0, min: 0, max: 30000, step: 1000 },
      
      // デバッグ設定
      { name: "debugShowMasks", type: "boolean", default: false },
    ];
  }
  
  /**
   * テンプレートの内部状態をクリーンアップ
   * テンプレート切り替え時に呼び出される
   */
  cleanup(): void {
    console.log('[VerticalBlackBandTextPrimitive] Cleaning up internal state');
    
    // グラフィックコンテナのクリア
    this.graphicsContainers.clear();
    
    // ワード状態のクリア
    this.wordStates.clear();
    
    // スワイプアウト状態のクリア
    this.swipeOutStates.clear();
    
    // シーク検出用の時刻管理のクリア
    this.lastTimeMap.clear();
    
    // フェーズ変更検出用のクリア
    this.lastPhaseMap.clear();
    
    // プリミティブの全状態クリーンアップ
    SparkleEffectPrimitive.cleanup();
    
    console.log('[VerticalBlackBandTextPrimitive] Cleanup complete');
  }

  /**
   * ビジュアル要素の削除
   */
  removeVisualElements(_container: PIXI.Container): void {
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
    
    // シーク検出による適切な状態管理
    const lastTime = this.lastTimeMap.get(phraseId) || 0;
    if (nowMs < lastTime - 100) { // 100ms以上戻った場合をシークと判定
      console.log(`[VERTICAL_BAND] シーク検出: phraseId=${phraseId}, lastTime=${lastTime}, nowMs=${nowMs}`);
      
      // スワイプアウト状態を現在時刻に基づいて適切に管理
      const tailTime = params.tailTime as number || 800;
      const swipeStartMs = endMs;
      const isInSwipeOutPeriod = nowMs >= swipeStartMs && nowMs <= swipeStartMs + tailTime;
      
      if (isInSwipeOutPeriod) {
        // シーク先がスワイプアウト期間中の場合、状態を保持し適切な進行度で復元
        console.log(`[VERTICAL_BAND] シーク先がスワイプアウト期間内のため状態保持・復元: phraseId=${phraseId}`);
        if (!this.swipeOutStates.has(phraseId)) {
          // 状態が失われている場合は復元
          const slices = this.calculateCharacterSlices(params);
          this.swipeOutStates.set(phraseId, {
            slices: slices,
            isSwipeOutActive: true,
            swipeStartMs: swipeStartMs,
            tailTime: tailTime
          });
          
          // スライス黒帯も強制的に復元
          const graphicsContainers = this.graphicsContainers.get(phraseId);
          if (graphicsContainers?.blackBandContainer) {
            console.log(`[VERTICAL_BAND] スワイプアウト状態復元時にスライス黒帯も復元: phraseId=${phraseId}`);
            this.ensureSliceBlackBand(graphicsContainers.blackBandContainer, params, phraseId, slices);
          }
        }
      } else {
        // シーク先がスワイプアウト期間外の場合のみ状態をリセット
        console.log(`[VERTICAL_BAND] シーク先がスワイプアウト期間外のため状態リセット: phraseId=${phraseId}`);
        this.swipeOutStates.delete(phraseId);
        
        // マスク参照をクリア（横書き版と同じ効率的な処理）
        if (container && !container.destroyed) {
          this.clearAllMaskReferences(container);
          
          // 統一マスクの復元処理（シークバック対応）
          const unifiedMask = container.children.find(child => 
            child && child.name === 'unified_swipe_mask' && !child.destroyed
          );
          if (unifiedMask && unifiedMask instanceof PIXI.Graphics) {
            // スワイプアウト状態が存在する場合は内容を復元
            const swipeOutState = this.swipeOutStates.get(phraseId);
            if (swipeOutState && phase === 'out') {
              console.log(`[VERTICAL_BAND] シーク検出により統一マスク内容を復元: phraseId=${phraseId}`);
              
              // 現在の進行度を計算
              const swipeStartMs = endMs - (params.tailTime as number || 800);
              const timeSinceStart = nowMs - swipeStartMs;
              const swipeDuration = (params.tailTime as number || 800);
              const progress = Math.max(0, Math.min(1, 1 - (timeSinceStart / swipeDuration)));
              
              // マスク内容を復元
              this.restoreUnifiedMaskContent(unifiedMask, progress, params, phraseId);
              unifiedMask.visible = true;
            } else {
              console.log(`[VERTICAL_BAND] シーク検出によりマスクをクリア: phraseId=${phraseId}`);
              unifiedMask.visible = false;
              unifiedMask.clear(); // グラフィックデータのみクリア
            }
          }
        }
      }
    }
    this.lastTimeMap.set(phraseId, nowMs);
    
    // フェーズ変更検出による状態リセット
    const lastPhase = this.lastPhaseMap.get(phraseId);
    if (lastPhase && lastPhase !== phase) {
      console.log(`[VERTICAL_BAND] フェーズ変更検出: phraseId=${phraseId}, lastPhase=${lastPhase}, phase=${phase}`);
      
      // フェーズが変わったら状態をリセット
      if (phase === 'in' || (phase === 'active' && lastPhase === 'out')) {
        console.log(`[VERTICAL_BAND] フェーズ変更により完全状態リセット: phraseId=${phraseId}`);
        this.swipeOutStates.delete(phraseId);
        
        // 完全なクリーンアップ処理
        if (container && !container.destroyed) {
          // マスク参照をクリア
          this.clearAllMaskReferences(container);
          
          // 統一マスクをクリア
          const unifiedMask = container.children.find(child => 
            child && child.name === 'unified_swipe_mask' && !child.destroyed
          );
          if (unifiedMask) {
            console.log(`[VERTICAL_BAND] フェーズ変更によりマスクをクリア: phraseId=${phraseId}`);
            unifiedMask.visible = false;
            if (unifiedMask instanceof PIXI.Graphics) {
              unifiedMask.clear();
            }
          }
          
          // 黒帯コンテナの完全クリーンアップ（スライス黒帯も削除）
          const graphicsContainers = this.graphicsContainers.get(phraseId);
          if (graphicsContainers?.blackBandContainer && !graphicsContainers.blackBandContainer.destroyed) {
            const blackBandContainer = graphicsContainers.blackBandContainer;
            const existingChildren = blackBandContainer.children.length;
            
            if (existingChildren > 0) {
              console.log(`[VERTICAL_BAND] フェーズ変更により黒帯コンテナをクリーンアップ: phraseId=${phraseId}, 既存要素数=${existingChildren}`);
              blackBandContainer.removeChildren();
            }
          }
        }
      }
    }
    this.lastPhaseMap.set(phraseId, phase);
    
    // ログ抑制: フレーズ処理
    
    // フレーズ終了条件の詳細チェック
    
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
    let finalX = phraseAnimationResult.x; // finalXをここで初期化
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
        baseX: phraseAnimationResult.x,
        resetInterval: params.lineResetInterval as number || 0,
        textDirection: 'vertical' as 'horizontal' | 'vertical'
      };
      
      // MultiLineパラメータログを抑制
      
      const lineResult = multiLine.calculatePhrasePosition(multiLineParams);
      
      // 縦書きの場合はX方向にオフセット
      finalY = lineResult.absoluteY;
      finalX = lineResult.absoluteX; // finalXをここで更新
      // MultiLine結果ログを抑制
    } else {
      // MultiLine無効ログを抑制
    }
    
    // スワイプアウト中は位置制御を無効化、通常時のみSlideAnimationPrimitiveの結果を適用
    if (!isSwipeOutActive) {
      // MultiLineが有効な場合はX方向オフセットも適用（縦書きの場合）
      container.position.set(finalX, finalY);
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
      // 縦書き専用：単語のY方向累積位置を計算
      const cumulativeY = this.calculateVerticalWordCumulativeY(params, wordIndex);
      
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
      
      // 縦書き：X=0（中央固定）、Y=累積位置
      container.position.set(0, cumulativeY);
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
    
    
    // VerticalLayoutPrimitive使用して縦書き文字コンテナ管理
    const layoutPrimitive = new VerticalLayoutPrimitive();
    
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
    
    
    const layoutParams: VerticalLayoutParams = {
      charSpacing: params.charSpacing as number || 1.0,
      fontSize: params.fontSize as number || 120,
      halfWidthSpacingRatio: 0.6,
      alignment: 'left' as const,
      containerSize: { width: 0, height: 0 },
      spacing: 1.0,
      chars: charsData,
      containerPrefix: 'char_container_',
      wordDisplayMode: WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE,
      wordSpacing: params.wordSpacing as number || 1.0,
      lineHeight: params.lineHeight as number || 1.2,
      allWordExtendedIds: allWordExtendedIds,
      // 縦書き専用設定
      textDirection: 'vertical' as TextDirection,
      verticalStartPosition: 'top',
      verticalLineDirection: 'rtl'
    };
    
    layoutPrimitive.manageCharacterContainers(
      container,
      layoutParams,
      (charContainer, charData, _position, _rotation) => {
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
      console.log(`[VERTICAL_DEBUG] 新規グラフィックコンテナ作成開始: ${phraseId}`);
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
      
      console.log(`[VERTICAL_TRACE] コンテナ追加後: phraseContainer.children.length=${phraseContainer.children.length}`);
      
      // 管理マップに登録
      this.graphicsContainers.set(phraseId, {
        blackBandContainer,
        invertMaskContainer
      });
      
      console.log(`[VERTICAL_DEBUG] グラフィックコンテナ作成完了: ${phraseId}`);
    }
    
    const containers = this.graphicsContainers.get(phraseId)!;
    
    // 既存コンテナが実際に親に存在するかチェック
    if (containers && (!containers.blackBandContainer.parent || containers.blackBandContainer.destroyed)) {
      console.log(`[VERTICAL_DEBUG] 既存黒帯コンテナが無効化されている。parent=${containers.blackBandContainer.parent?.name}, destroyed=${containers.blackBandContainer.destroyed}`);
      this.graphicsContainers.delete(phraseId);
      this.manageGraphicsContainers(phraseContainer, params, nowMs, startMs, endMs, phraseId, phase, phraseText);
      return;
    }
    
    // wordOffsetXはフレーズコンテナレベルで適用されるため、黒帯コンテナでは適用しない
    containers.blackBandContainer.position.x = 0;
    
    // ログ抑制: コンテナ確認OK
    
    // 純粋な時間ベース: 常に黒帯を作成（フレーズ退場まで維持）
    this.createBlackBand(containers.blackBandContainer, params, nowMs, startMs, endMs, phraseId, phraseText, phase);
    
    // 黒帯コンテナの状態をログ出力
    const totalChildren = containers.blackBandContainer.children.length;
    const normalBand = containers.blackBandContainer.children.find(child => 
      child.name === `black_band_${phraseId}`
    );
    const sliceCount = containers.blackBandContainer.children.filter(child => 
      child.name && child.name.includes('blackband_slice_')
    ).length;
    
    console.log(`[VERTICAL_BAND] 黒帯コンテナ状態: phraseId=${phraseId}, 総要素数=${totalChildren}, 通常黒帯=${!!normalBand}, スライス数=${sliceCount}`);
    
    // 黒帯が存在するかチェック（createBlackBandが早期リターンした場合も処理を継続）
    let blackBand = normalBand;
    
    // 黒帯のマスク状態をログ出力
    if (blackBand) {
      const blackBandGraphics = blackBand as PIXI.Graphics;
      const existingMask = blackBandGraphics.mask;
      const maskName = existingMask?.name || 'none';
      console.log(`[VERTICAL_BAND] 通常黒帯マスク状態: phraseId=${phraseId}, maskName=${maskName}`);
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
    _nowMs: number,
    _startMs: number,
    _endMs: number,
    phraseId: string,
    _phraseText: string,
    phase: AnimationPhase
  ): void {
    console.log(`[VERTICAL_BAND] createBlackBand開始: phraseId=${phraseId}, phase=${phase}`);
    
    // スワイプアウト中は既存黒帯の作成をスキップ
    if (this.swipeOutStates.has(phraseId)) {
      console.log(`[VERTICAL_BAND] スワイプアウト中のためスキップ: phraseId=${phraseId}`);
      return;
    }
    
    // 既存の黒帯（通常・スライス両方）があるかチェック
    const existingBlackBand = blackBandContainer.children.find(child => 
      child.name === `black_band_${phraseId}`
    );
    const existingSlices = blackBandContainer.children.filter(child => 
      child.name && child.name.includes('blackband_slice_')
    );
    
    if (existingBlackBand) {
      const blackBandGraphics = existingBlackBand as PIXI.Graphics;
      const beforeMask = blackBandGraphics.mask;
      console.log(`[VERTICAL_BAND] 既存通常黒帯発見: phraseId=${phraseId}, hasMask=${!!beforeMask}`);
      
      // 重要: マスク状態の管理は applySwipeInMaskToBlackBand に一元化
      // ここではマスククリアを行わず、既存黒帯の存在を確認するのみ
      return;
    }
    
    if (existingSlices.length > 0) {
      console.log(`[VERTICAL_BAND] 既存スライス黒帯発見: phraseId=${phraseId}, スライス数=${existingSlices.length}`);
      console.log(`[VERTICAL_BAND] スライス黒帯を削除して新規通常黒帯を作成: phraseId=${phraseId}`);
      
      // スライス黒帯を削除して新規通常黒帯を作成
      blackBandContainer.removeChildren();
    }
    
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string || 'Arial';
    
    // 縦書き専用：フレーズの高さを計算
    const phraseHeight = this.getActualPhraseHeightForVertical(params);
    
    // 縦書き黒帯のサイズ計算
    const marginHeight = params.blackBandMarginWidth as number || 1.0; // 上下余白
    const bandWidthRatio = params.blackBandWidthRatio as number || 1.2; // 横幅比率
    const bandWidth = fontSize * bandWidthRatio; // 固定幅（フォントサイズベース）
    const bandHeight = phraseHeight + (fontSize * marginHeight * 2); // 上下に固定余白を追加
    
    // 縦書き黒帯の中央位置（X軸中央、Y軸はフレーズ中央）
    const phraseCenterOffset = phraseHeight / 2;
    
    // 縦書き用黒帯の作成（中央配置）
    const blackBandParams: RectangleParams = {
      width: bandWidth,
      height: bandHeight,
      x: -bandWidth / 2, // X軸中央配置（縦書きでは固定）
      y: phraseCenterOffset - (bandHeight / 2), // Y軸中央にフレーズの中央を配置
      color: params.blackBandColor as string || '#000000',
      alpha: 1.0
    };
    
    const blackBand = this.shapePrimitive.createRectangle(blackBandParams);
    blackBand.name = `black_band_${phraseId}`;
    // シーク検出対応: 新規作成時は完全に非表示（progress=0の場合）
    // 入場フェーズのマスク処理で適切に表示状態が管理される
    blackBand.visible = false;
    
    console.log(`[VERTICAL_BAND] 新規黒帯作成完了: phraseId=${phraseId}, サイズ=(${bandWidth}x${bandHeight}), 位置=(${blackBandParams.x}, ${blackBandParams.y})`);
    
    // コンテナに追加
    blackBandContainer.addChild(blackBand);
    
    // 黒帯エフェクトの適用
    this.applyBandGlowShadowEffect(blackBand as PIXI.Container, params);
    
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
    }
    
    // 上層コンテナの非表示化
    try {
      if (containers.invertMaskContainer && !containers.invertMaskContainer.destroyed) {
        containers.invertMaskContainer.visible = false;
        containers.invertMaskContainer.mask = null;
      }
    } catch (e) {
    }
    
    // マップから削除はしない（再利用のため保持）
    
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
      
      // 縦書き用：フレーズ高さとサイズ情報を取得
      const phraseHeight = this.getActualPhraseHeightForVertical(params);
      const fontSize = params.fontSize as number || 120;
      const marginHeight = params.blackBandMarginWidth as number || 1.0;
      const bandWidth = fontSize * (params.blackBandWidthRatio as number || 1.2);
      const bandHeight = phraseHeight + (fontSize * marginHeight * 2);
      const phraseCenterOffset = phraseHeight / 2;
      
      // 縦書き用：上から下へ徐々に表示されるマスク
      swipeInMask.clear();
      swipeInMask.beginFill(0xFFFFFF, 1.0);
      const visibleHeight = bandHeight * progress;
      
      if (visibleHeight > 0) {
        swipeInMask.drawRect(
          -bandWidth / 2, // X軸中央配置
          phraseCenterOffset - bandHeight / 2, // 黒帯の上端から開始
          bandWidth, // 固定幅
          visibleHeight // progressに応じた高さ
        );
      }
      
      swipeInMask.endFill();
      
      // 黒帯にマスクを適用
      blackBandContainer.mask = swipeInMask;
      
      
    } catch (error) {
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
      }
    } catch (error) {
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
    // デバッグモードの取得
    const debugShowMasks = params.debugShowMasks as boolean || false;
    
    // デバッグモード用のプロパティを設定
    if (blackBand.parent) {
      blackBand.parent['debugShowMasks'] = debugShowMasks;
    }
    try {
      if (!blackBand || blackBand.destroyed) {
        return;
      }
      
      
      // シーク時対応: 既存マスクが不適切な状態の場合のみクリア
      const currentMask = blackBand.mask;
      const expectedMaskName = `swipe_in_mask_${phraseId}`;
      const shouldRecreateMask = !currentMask || currentMask.name !== expectedMaskName;
      
      if (shouldRecreateMask) {
      }
      
      // 確定的マスクサイズ決定システム
      const deterministicMaskSize = this.calculateDeterministicMaskSize(progress, params);
      
      // 必要な場合のみマスク再作成
      const swipeInMask = shouldRecreateMask ? 
        this.recreateSwipeInMask(blackBand, phraseId) : 
        currentMask as PIXI.Graphics;
      
      if (!swipeInMask) {
        return;
      }
      
      
      // 確定的マスク描画（時刻に対して一意に決定される）
      this.applyDeterministicMask(swipeInMask, blackBand, deterministicMaskSize, phraseId);
      
      
    } catch (error) {
    }
  }
  
  /**
   * 黒帯オブジェクトからスワイプインマスクをクリア
   */
  private clearSwipeInMaskFromBlackBand(blackBand: PIXI.Graphics, phraseId: string): void {
    try {
      if (!blackBand || blackBand.destroyed) {
        return;
      }
      
      
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
      } else {
      }
    } catch (error) {
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
      try {
        if (wordState.invertMaskElement.parent) {
          wordState.invertMaskParent.removeChild(wordState.invertMaskElement);
        }
        if (!wordState.invertMaskElement.destroyed) {
          wordState.invertMaskElement.destroy();
        }
      } catch (error) {
      }
      wordState.invertMaskElement = null;
      wordState.invertMaskParent = null;
    }
    
    if (currentActiveCharIndex >= 0) {
      // 対象文字のコンテナを見つける
      const targetChar = chars[currentActiveCharIndex];
      let targetCharContainer: PIXI.Container | null = null;
      
      wordContainer.children.forEach((child: any) => {
        if (child instanceof PIXI.Container && child.name && 
            child.name.includes(`char_container_${targetChar.id}`)) {
          targetCharContainer = child;
        }
      });
      
      if (targetCharContainer) {
        const fontSize = params.fontSize as number || 120;
        const maskWidth = this.calculateCharWidth(targetChar.char, fontSize);
        const maskHeight = fontSize;
        
        
        // 【シンプル版】DIFFERENCE ブレンドモードで直接重ねる
        
        // 文字の相対位置を簡易計算（座標変換のエラーを回避）
        const charX = targetCharContainer.position.x;
        const charY = targetCharContainer.position.y;
        
        // デバッグモードの確認
        const debugShowMasks = params.debugShowMasks as boolean || false;
        
        let invertMask;
        if (debugShowMasks) {
          // デバッグモード：半透明の青色矩形として表示
          invertMask = this.shapePrimitive.createRectangle({
            width: maskWidth,
            height: maskHeight,
            x: charX - maskWidth / 2,
            y: charY - maskHeight / 2,
            color: '#0000FF', // 青色（デバッグ用）
            alpha: 0.3 // 半透明
          });
          invertMask.blendMode = PIXI.BLEND_MODES.NORMAL; // デバッグモードでは通常表示
          console.log(`[VERTICAL_BAND_DEBUG] 反転マスク可視化: phraseId=${phraseId}, wordIndex=${wordIndex}, char=${targetChar.char}`);
        } else {
          // 通常モード：白矩形でDIFFERENCEブレンド
          invertMask = this.shapePrimitive.createRectangle({
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
        }
        invertMask.name = `invert_mask_${phraseId}_word_${wordIndex}`;
        
        // グラフィックコンテナに追加
        invertMaskContainer.addChild(invertMask);
        
        // グラフィックコンテナはzIndexで既に上層に設定済み
        
        
        // 状態管理
        wordState.invertMaskElement = invertMask;
        wordState.invertMaskParent = invertMaskContainer;
        
        wordState.currentCharIndex = currentActiveCharIndex;
      } else {
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
    
    // 縦書き特殊文字変換の適用
    this.applyVerticalTextTransforms(textObj, text, params, container);
    
    // 縦書き用の文字位置計算とオフセット適用
    this.applyVerticalCharacterOffset(textObj, container, params);
    
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
        
      }

      // シーク時は黒帯を一時的に非表示にして視覚的継続性を断つ
      blackBand.visible = false;
    } catch (error) {
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
  private calculateCharacterSlices(params: Record<string, unknown>): HorizontalSlice[] {
    const fontSize = params.fontSize as number || 48;
    const marginHeight = params.blackBandMarginWidth as number || 1.0;
    const sliceRatio = 0.8; // 文字サイズの0.8倍をスライス高さとする（animateSynchronizedSwipeOutと統一）
    
    // 総高さ（余白込み）
    const phraseHeight = this.getActualPhraseHeightForVertical(params);
    const totalHeight = phraseHeight + (fontSize * marginHeight * 2);
    
    // 固定スライス高さ（文字サイズベース）
    const sliceHeight = fontSize * sliceRatio;
    
    // スライス数（切り上げでカバー）
    const totalSlices = Math.ceil(totalHeight / sliceHeight);
    
    // デバッグ：スライス計算詳細
    console.log(`[VERTICAL_BAND] 固定スライス計算:`, {
      fontSize: fontSize,
      marginHeight: marginHeight,
      phraseHeight: phraseHeight,
      totalHeight: totalHeight,
      sliceRatio: sliceRatio,
      sliceHeight: sliceHeight,
      totalSlices: totalSlices
    });
    
    // 連続スライス生成（隙間なし）
    const slices: HorizontalSlice[] = [];
    for (let i = 0; i < totalSlices; i++) {
      slices.push({
        y: i * sliceHeight,
        height: sliceHeight,
        wordIndex: -1, // 固定スライスのため文字情報なし
        charIndex: i,
        charId: `fixed_slice_${i}`,
        originalChar: ''
      });
    }
    
    console.log(`[VERTICAL_BAND] 固定スライス生成完了: 総高さ=${totalHeight}, スライス数=${totalSlices}, スライス高さ=${sliceHeight}`);
    
    return slices;
  }
  
  
  /**
   * 黒帯をスライスとして再作成（隙間なく連続配置）
   */
  private recreateBlackBandAsSlices(
    blackBandContainer: PIXI.Container,
    params: Record<string, unknown>,
    phraseId: string,
    slices: HorizontalSlice[]
  ): void {
    // 既存のスライス黒帯があるかチェック
    const hasExistingSlices = blackBandContainer.children.some(child => 
      child.name && child.name.includes('blackband_slice_')
    );
    
    // 既にスライス化済みの場合は何もしない
    if (hasExistingSlices) {
      console.log(`[VERTICAL_BAND] スライス黒帯は既に存在: phraseId=${phraseId}`);
      return;
    }
    
    console.log(`[VERTICAL_BAND] 通常黒帯をスライス黒帯に変換開始: phraseId=${phraseId}, スライス数=${slices.length}`);
    
    // 新しいスライス黒帯を作成してから既存の通常黒帯を削除（瞬間的消失防止）
    const newSlices: PIXI.Graphics[] = [];
    
    const fontSize = params.fontSize as number || 48;
    const bandColor = parseInt((params.blackBandColor as string || '#000000').replace('#', ''), 16);
    // 元の黒帯と同じ幅計算式を使用（ユーザー設定のbandWidthRatioを考慮）
    const bandWidthRatio = params.blackBandWidthRatio as number || 1.2;
    const bandWidth = fontSize * bandWidthRatio;
    const marginHeight = params.blackBandMarginWidth as number || 1.0;
    
    // 通常黒帯と同じ位置計算を使用
    const phraseHeight = this.getActualPhraseHeightForVertical(params);
    const totalHeight = phraseHeight + (fontSize * marginHeight * 2);
    const phraseCenterOffset = phraseHeight / 2;
    const startY = phraseCenterOffset - (totalHeight / 2); // 通常黒帯と同じ開始位置
    
    // 各文字スライス用の黒帯を作成（まずメモリ上に準備）
    slices.forEach((slice, index) => {
      const sliceGraphics = new PIXI.Graphics();
      sliceGraphics.beginFill(bandColor);
      // 縦書き用：幅x高さ形式で描画
      sliceGraphics.drawRect(0, 0, bandWidth, slice.height);
      sliceGraphics.endFill();
      
      // 通常黒帯と同じ座標系で配置（slice.yは余白を含んだ絶対位置）
      sliceGraphics.position.set(-bandWidth / 2, startY + slice.y);
      sliceGraphics.name = `blackband_slice_${index}`;
      
      // まず配列に保存
      newSlices.push(sliceGraphics);
      
    });
    
    // 一度に古い黒帯を削除し、新しいスライス黒帯を追加（瞬間的消失を最小化）
    const oldChildrenCount = blackBandContainer.children.length;
    blackBandContainer.removeChildren();
    newSlices.forEach(slice => blackBandContainer.addChild(slice));
    
    console.log(`[VERTICAL_BAND] スライス黒帯変換完了: phraseId=${phraseId}, 削除=${oldChildrenCount}個, 追加=${newSlices.length}個`);
    
  }
  
  /**
   * スライス黒帯の確実な作成（シークバック対応版）
   */
  private ensureSliceBlackBand(
    blackBandContainer: PIXI.Container,
    params: Record<string, unknown>,
    phraseId: string,
    slices: HorizontalSlice[]
  ): void {
    // 既存のスライス黒帯があるかチェック
    const hasExistingSlices = blackBandContainer.children.some(child => 
      child.name && child.name.includes('blackband_slice_')
    );
    
    if (hasExistingSlices) {
      console.log(`[VERTICAL_BAND] スライス黒帯は既に存在: phraseId=${phraseId}`);
      return;
    }
    
    // スライス黒帯が存在しない場合は強制的に作成
    console.log(`[VERTICAL_BAND] スライス黒帯を強制作成: phraseId=${phraseId}, スライス数=${slices.length}`);
    
    const fontSize = params.fontSize as number || 48;
    const bandColor = parseInt((params.blackBandColor as string || '#000000').replace('#', ''), 16);
    const bandWidthRatio = params.blackBandWidthRatio as number || 1.2;
    const bandWidth = fontSize * bandWidthRatio;
    const marginHeight = params.blackBandMarginWidth as number || 1.0;
    
    // 通常黒帯と同じ位置計算を使用
    const phraseHeight = this.getActualPhraseHeightForVertical(params);
    const totalHeight = phraseHeight + (fontSize * marginHeight * 2);
    const phraseCenterOffset = phraseHeight / 2;
    const startY = phraseCenterOffset - (totalHeight / 2); // 通常黒帯と同じ開始位置
    
    // 既存の全要素をクリアしてからスライスを追加
    const oldChildrenCount = blackBandContainer.children.length;
    blackBandContainer.removeChildren();
    
    const newSlices: PIXI.Graphics[] = [];
    
    // 各文字スライス用の黒帯を作成
    slices.forEach((slice, index) => {
      const sliceGraphics = new PIXI.Graphics();
      sliceGraphics.beginFill(bandColor);
      sliceGraphics.drawRect(0, 0, bandWidth, slice.height);
      sliceGraphics.endFill();
      
      // 通常黒帯と同じ座標系で配置（slice.yは余白を含んだ絶対位置）
      sliceGraphics.position.set(-bandWidth / 2, startY + slice.y);
      sliceGraphics.name = `blackband_slice_${index}`;
      
      newSlices.push(sliceGraphics);
      blackBandContainer.addChild(sliceGraphics);
    });
    
    console.log(`[VERTICAL_BAND] スライス黒帯強制作成完了: phraseId=${phraseId}, 削除=${oldChildrenCount}個, 追加=${newSlices.length}個`);
  }
  
  /**
   * 統一マスクの内容復元（シークバック時のマスク再生成）
   */
  private restoreUnifiedMaskContent(
    unifiedMask: PIXI.Graphics,
    progress: number,
    params: Record<string, unknown>,
    phraseId: string
  ): void {
    if (!unifiedMask || unifiedMask.destroyed) {
      console.warn(`[VERTICAL_BAND] 統一マスクが無効: phraseId=${phraseId}`);
      return;
    }

    // マスクをクリアして再生成
    unifiedMask.clear();
    
    const fontSize = params.fontSize as number || 120;
    const phraseHeight = this.getActualPhraseHeightForVertical(params);
    const marginHeight = params.blackBandMarginWidth as number || 1.0;
    const bandHeight = phraseHeight + (fontSize * marginHeight * 2);
    const phraseCenterOffset = phraseHeight / 2;
    const maskWidth = fontSize * 2;
    
    // デバッグ表示判定
    const debugShowMasks = params.debugShowMasks as boolean || false;
    
    if (debugShowMasks) {
      // デバッグモード：半透明の青色矩形として表示（統一マスク）
      unifiedMask.beginFill(this.DEBUG_MASK_COLORS.unified, 0.3);
      unifiedMask.drawRect(-maskWidth / 2, -phraseCenterOffset, maskWidth, bandHeight);
      unifiedMask.endFill();
      console.log(`[VERTICAL_BAND] 統一マスクデバッグ表示復元: phraseId=${phraseId}, progress=${progress}`);
    } else {
      // 通常モード：白色マスクとしてスワイプアウト領域を定義
      unifiedMask.beginFill(0xFFFFFF, 1.0);
      
      if (progress <= 0) {
        // progress = 0: 完全非表示（マスクなし）
        // マスクは空のまま
      } else if (progress >= 1) {
        // progress = 1: 完全表示（全体マスク）
        unifiedMask.drawRect(-maskWidth / 2, -phraseCenterOffset, maskWidth, bandHeight);
      } else {
        // progress = 0-1: 部分表示（下から上へスワイプアウト）
        const visibleHeight = bandHeight * progress;
        const startY = -phraseCenterOffset + (bandHeight - visibleHeight);
        unifiedMask.drawRect(-maskWidth / 2, startY, maskWidth, visibleHeight);
      }
      unifiedMask.endFill();
      
      console.log(`[VERTICAL_BAND] 統一マスク内容復元: phraseId=${phraseId}, progress=${progress}, visibleHeight=${bandHeight * progress}`);
    }
  }
  
  /**
   * スライススワイプアウトアニメーション
   */
  private animateSliceSwipeOut(
    phraseContainer: PIXI.Container,
    slices: HorizontalSlice[],
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
      // ★ 三重復元処理: スライス + マスク + マスク内容
      const graphicsContainer = this.graphicsContainers.get(phraseId);
      if (graphicsContainer) {
        // 1. スライス黒帯の復元（シークバック後でも確実に作成）
        this.ensureSliceBlackBand(graphicsContainer.blackBandContainer, params, phraseId, slices);
        
        // 2. 統一マスクオブジェクトの復元
        let unifiedMask = phraseContainer.children.find(child => 
          child && child.name === 'unified_swipe_mask' && !child.destroyed
        ) as PIXI.Graphics;
        
        if (!unifiedMask) {
          console.log(`[VERTICAL_BAND] 統一マスクオブジェクトを再作成: phraseId=${phraseId}`);
          unifiedMask = new PIXI.Graphics();
          unifiedMask.name = 'unified_swipe_mask';
          phraseContainer.addChild(unifiedMask);
        }
        
        // 3. 統一マスク内容の復元（進行度に応じた内容再生成）
        const reverseProgress = 1 - easedProgress; // スワイプアウトは進行度を反転
        this.restoreUnifiedMaskContent(unifiedMask, reverseProgress, params, phraseId);
        unifiedMask.visible = true;
        
        console.log(`[VERTICAL_BAND] 三重復元完了: phraseId=${phraseId}, progress=${progress}, reverseProgress=${reverseProgress}`);
      }
      
      // 統一マスクによるスワイプアウト（黒帯と文字を同期）
      this.animateSynchronizedSwipeOut(phraseContainer, slices, easedProgress, phraseId, params);
    }
    
    const isComplete = progress >= 1.0;
    
    return isComplete;
  }
  

  /**
   * 黒帯と文字の同期スワイプアウト（固定幅スライス方式）
   */
  private animateSynchronizedSwipeOut(
    phraseContainer: PIXI.Container,
    slices: HorizontalSlice[],
    progress: number,
    phraseId: string,
    params: Record<string, unknown>
  ): void {
    const graphicsContainer = this.graphicsContainers.get(phraseId);
    if (!graphicsContainer) return;

    // 統一マスクの確定的な作成または再利用（横書き版と同じ効率的な方式）
    let swipeMask = this.ensureUnifiedSwipeMask(phraseContainer, phraseId);
    if (!swipeMask || swipeMask.destroyed) {
      console.log(`[VERTICAL_BAND] マスクが破棄されているため再作成: phraseId=${phraseId}`);
      swipeMask = this.createUnifiedSwipeMask(phraseContainer, phraseId);
    }
    
    // デバッグモードの確認
    const debugShowMasks = params.debugShowMasks as boolean || false;

    // スライス情報をパラメータから取得（calculateCharacterSlicesで統一計算済み）
    const totalSlices = slices.length;
    const sliceHeight = slices.length > 0 ? slices[0].height : 0;
    
    // 余白込み総高さとマスク計算用の値
    const fontSize = params.fontSize as number || 120;
    const marginHeight = params.blackBandMarginWidth as number || 1.0;
    const phraseHeight = this.getActualPhraseHeightForVertical(params);
    const totalHeight = phraseHeight + (fontSize * marginHeight * 2);
    const phraseCenterOffset = phraseHeight / 2;
    const maskWidth = fontSize * 2;

    // マスク領域をクリアして開始
    swipeMask.clear();
    
    if (debugShowMasks) {
      // デバッグモード：半透明の緑色矩形として表示
      swipeMask.beginFill(this.DEBUG_MASK_COLORS.unified, 0.3);
    } else {
      // 通常モード：白色マスク
      swipeMask.beginFill(0xFFFFFF, 1.0);
    }

    // 縦書き用：各スライスを上から順番に時間差でワイプ（統一スライス情報使用）
    for (let sliceIndex = 0; sliceIndex < totalSlices; sliceIndex++) {
      // 上端のスライスから順番にワイプ開始（時間差）
      const sliceStartProgress = (sliceIndex / totalSlices) * 0.3; // 30%の時間差
      const sliceWipeProgress = Math.max(0, Math.min((progress - sliceStartProgress) / 0.7, 1.0)); // 残り70%でワイプ完了

      // スライスがまだワイプされていない場合のみマスクに追加
      if (sliceWipeProgress < 1.0) {
        const slice = slices[sliceIndex];
        
        // 統一スライス情報からY位置を取得（余白込み座標系）
        const startY = phraseCenterOffset - (totalHeight / 2); // 通常黒帯と同じ開始位置
        const sliceY = startY + slice.y;
        
        // スライス高さは統一計算済み
        const maxSliceHeight = slice.height;
        const remainingSliceHeight = maxSliceHeight * (1 - sliceWipeProgress); // スライス内の残り高さ

        // 残り高さが正の値の場合のみ矩形を描画
        if (remainingSliceHeight > 0) {
          // 統一スライス情報では境界は既に適切に設定済みのため、単純に描画
          swipeMask.drawRect(-maskWidth / 2, sliceY, maskWidth, remainingSliceHeight);
        }
      }
    }

    swipeMask.endFill();

    if (debugShowMasks) {
      // デバッグモード：マスクとして適用せず、可視化オブジェクトとして表示
      // 黒帯と文字への実際のマスク適用をスキップ
      console.log(`[VERTICAL_BAND_DEBUG] 統一スワイプマスク可視化: phraseId=${phraseId}, progress=${progress.toFixed(3)}`);
    } else {
      // 通常モード：黒帯コンテナと文字コンテナの両方に同じマスクを安全に適用
      try {
        if (graphicsContainer.blackBandContainer && !graphicsContainer.blackBandContainer.destroyed) {
          graphicsContainer.blackBandContainer.mask = swipeMask;
        }
      } catch (error) {
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
      }
    }

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

    console.log(`[VERTICAL_BAND] 統一マスク新規作成: phraseId=${phraseId}`);
    return swipeMask;
  }
  
  /**
   * 時刻ベースの確定的なマスク生成（廃止済み）
   * 横書き版と同じ効率的な方式（ensureUnifiedSwipeMask）を使用してください
   * @deprecated Use ensureUnifiedSwipeMask instead
   */
  private createDeterministicSwipeMask(
    phraseContainer: PIXI.Container,
    phraseId: string,
    progress: number
  ): PIXI.Graphics {
    // この関数は廃止されました。ensureUnifiedSwipeMaskを使用してください
    console.warn('[VERTICAL_BAND] createDeterministicSwipeMaskは廃止されました。ensureUnifiedSwipeMaskを使用してください');
    return this.ensureUnifiedSwipeMask(phraseContainer, phraseId) || this.createUnifiedSwipeMask(phraseContainer, phraseId);
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
        if (!(slice as any).userData) {
          (slice as any).userData = { 
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
          slice.width = (slice as any).userData.originalWidth;
          slice.x = (slice as any).userData.originalX;
        } else if (normalizedProgress >= 1.0) {
          // 完全にワイプ完了 - 幅を0に
          slice.width = 0;
          slice.x = (slice as any).userData.originalX + (slice as any).userData.originalWidth; // 右端まで移動
        } else {
          // 左から右にワイプ - 左端を右にずらしながら幅を縮小
          const wipeDistance = (slice as any).userData.originalWidth * normalizedProgress;
          slice.x = (slice as any).userData.originalX + wipeDistance; // 左端を右に移動
          slice.width = (slice as any).userData.originalWidth - wipeDistance; // 残り幅
        }
      }
    });
    
  }
  
  /**
   * 文字のワイプアウトアニメーション（旧版・未使用）
   */
  private animateCharacterWipe_OLD(
    phraseContainer: PIXI.Container,
    slices: HorizontalSlice[],
    progress: number,
    phraseId: string
  ): void {
    let charContainerCount = 0;
    let processedCount = 0;
    
    // フレーズコンテナ内の文字コンテナを検索・処理
    
    phraseContainer.children.forEach((child, childIndex) => {
      
      // 文字コンテナ検索（より具体的な条件）
      const isCharContainer = child instanceof PIXI.Container && child.name && 
                             child.name.match(/char.*container|container.*char|word.*container|container.*word/i);
      
      if (isCharContainer) {
        charContainerCount++;
        this.applyCharacterSliceWipe(child as PIXI.Container, childIndex, slices.length, progress, phraseId);
        processedCount++;
      }
    });
    
    // 文字コンテナが見つからない場合、全てのコンテナ子要素を処理
    if (charContainerCount === 0) {
      phraseContainer.children.forEach((child, childIndex) => {
        if (child instanceof PIXI.Container && child.visible) {
          this.applyCharacterSliceWipe(child as PIXI.Container, childIndex, slices.length, progress, phraseId);
          processedCount++;
        }
      });
    }
    
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
    // デバッグ用：文字ワイプマスク機能を一時的に無効化
    // 統一スワイプマスクのみで退場アニメーションを制御
    console.log('[VERTICAL_BAND] 文字ワイプマスク無効化中 - 統一スワイプマスクのみ使用');
    
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
        return;
      }
      
      // 既存のマスクを安全に削除
      this.removeCharacterWipeMask(charContainer);
      
      // 残り幅が0以下の場合は完全に隠すため、マスク不要
      if (remainingWidth <= 0) {
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
      
    } catch (error) {
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
        
        // マスクがDisplayObjectでコンテナの子要素の場合は削除
        if (currentMask instanceof PIXI.DisplayObject) {
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
      
      
    } catch (error) {
    }
  }

  /**
   * 全てのマスク参照を削除（シンプル版）
   */
  private clearAllMaskReferences(phraseContainer: PIXI.Container): void {
    try {
      if (!phraseContainer || phraseContainer.destroyed) {
        return;
      }
      
      // フレーズコンテナ内の全子要素のマスクを削除
      const children = [...phraseContainer.children]; // 配列のコピーを作成
      children.forEach(child => {
        try {
          if (child && !child.destroyed && child.mask && typeof child.mask === 'object' && 'destroyed' in child.mask && !(child.mask as any).destroyed) {
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
    }
  }

  /**
   * スワイプマスクのクリーンアップ（旧版）
   */
  private cleanupSwipeMask_OLD(phraseContainer: PIXI.Container): void {
    try {
      
      // フレーズコンテナが破棄されている場合はスキップ
      if (!phraseContainer || phraseContainer.destroyed) {
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
            }
          }
        } catch (error) {
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
        }
      }
      
    } catch (error) {
    }
  }

  /**
   * シンプルなフレーズグラフィック要素のクリーンアップ
   */
  private clearPhraseGraphics(phraseContainer: PIXI.Container): void {
    // フレーズ終了時のグラフィックコンテナクリーンアップ
    const phraseId = this.extractPhraseIdFromContainerName(phraseContainer.name || '');
    if (phraseId) {
      
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
      }
    }
  }

  /**
   * 確定的マスクサイズ計算（時刻に対して一意に決定）
   */
  private calculateDeterministicMaskSize(progress: number, params: Record<string, unknown>): {
    phraseHeight: number;
    bandWidth: number;
    bandHeight: number;
    visibleHeight: number;
    visibleWidth: number;
    phraseCenterOffset: number;
  } {
    // 縦書き用：通常の高さ計算（キャッシュは不要）
    const phraseHeight = this.getActualPhraseHeightForVertical(params);
    const fontSize = params.fontSize as number || 120;
    const marginHeight = params.blackBandMarginWidth as number || 1.0;
    const bandWidthRatio = params.blackBandWidthRatio as number || 1.2;
    const bandWidth = fontSize * bandWidthRatio;
    const bandHeight = phraseHeight + (fontSize * marginHeight * 2);
    const phraseCenterOffset = phraseHeight / 2;
    
    // 縦書き用：確定的な可視高さ計算（縦書きなので高さ方向にスワイプイン）
    const visibleHeight = bandHeight * Math.max(0, Math.min(1, progress));
    // applyDeterministicMaskとの互換性のためvisibleWidthも提供（縦書きでは高さと同じ値）
    const visibleWidth = visibleHeight;
    
    return {
      phraseHeight,
      bandWidth,
      bandHeight,
      visibleHeight,
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
    
    // デバッグモードの確認
    const debugShowMasks = blackBand.parent?.['debugShowMasks'] || false;
    
    if (maskSize.visibleHeight > 1) { // 1px未満は表示しない（微小値による誤表示防止）
      // 縦書き用マスク描画（上から下へスワイプイン）
      blackBand.visible = true;
      
      if (debugShowMasks) {
        // デバッグモード：半透明の赤色矩形として表示
        swipeInMask.beginFill(this.DEBUG_MASK_COLORS.swipeIn, 0.3);
        swipeInMask.drawRect(
          -maskSize.bandWidth / 2,
          maskSize.phraseCenterOffset - maskSize.bandHeight / 2,
          maskSize.bandWidth,
          maskSize.visibleHeight
        );
        swipeInMask.endFill();
        // デバッグモードではマスクとして適用しない
        blackBand.mask = null;
      } else {
        // 通常モード：白色マスクとして適用
        swipeInMask.beginFill(0xFFFFFF, 1.0);
        swipeInMask.drawRect(
          -maskSize.bandWidth / 2,
          maskSize.phraseCenterOffset - maskSize.bandHeight / 2,
          maskSize.bandWidth,
          maskSize.visibleHeight
        );
        swipeInMask.endFill();
        // マスク適用
        blackBand.mask = swipeInMask;
      }
    } else {
      // progress=0または微小値の場合は完全非表示
      if (!debugShowMasks) {
        blackBand.mask = null;
        blackBand.visible = false;
      }
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
    const effectParams = {
      enableGlow: enableGlow,
      enableShadow: enableShadow,
      blendMode: 'normal',
      glow: enableGlow ? {
        intensity: params.textGlowStrength as number || 1.0,
        glowStrength: params.textGlowStrength as number || 1.0,
        glowBrightness: params.textGlowBrightness as number || 1.0,
        glowBlur: params.textGlowBlur as number || 10,
        glowQuality: params.textGlowQuality as number || 4,
        glowPadding: 10,
        threshold: 0.5
      } : undefined,
      shadow: enableShadow ? {
        intensity: params.textShadowAlpha as number || 0.8,
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
    const effectParams = {
      enableGlow: enableGlow,
      enableShadow: enableShadow,
      blendMode: 'normal',
      glow: enableGlow ? {
        intensity: params.bandGlowStrength as number || 1.0,
        glowStrength: params.bandGlowStrength as number || 1.0,
        glowBrightness: params.bandGlowBrightness as number || 1.0,
        glowBlur: params.bandGlowBlur as number || 10,
        glowQuality: params.bandGlowQuality as number || 4,
        glowPadding: 10,
        threshold: 0.5
      } : undefined,
      shadow: enableShadow ? {
        intensity: params.bandShadowAlpha as number || 0.8,
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

  /**
   * 縦書き特殊文字変換の適用
   */
  private applyVerticalTextTransforms(
    textObj: PIXI.Text,
    text: string,
    params: Record<string, unknown>,
    container: PIXI.Container
  ): void {
    // 句読点調整
    if (params.enablePunctuationAdjustment) {
      this.applyPunctuationAdjustment(textObj, text, params);
    }
    
    // アルファベット回転
    if (params.enableAlphabetRotation) {
      this.applyAlphabetRotation(textObj, text, params);
    }
    
    // 長音記号回転
    if (params.enableLongVowelRotation) {
      this.applyLongVowelRotation(textObj, text, params);
    }
    
    // 小文字調整
    if (params.enableSmallCharAdjustment) {
      this.applySmallCharAdjustment(textObj, text, params);
    }
  }
  
  /**
   * 句読点位置調整
   */
  private applyPunctuationAdjustment(textObj: PIXI.Text, text: string, params: Record<string, unknown>): void {
    const punctuationChars = params.punctuationCharacters as string || "、。，．";
    if (punctuationChars.includes(text)) {
      const offsetXRatio = params.punctuationOffsetXRatio as number || 0;
      const offsetYRatio = params.punctuationOffsetYRatio as number || 0;
      const fontSize = params.fontSize as number || 120;
      
      textObj.x += fontSize * offsetXRatio;
      textObj.y += fontSize * offsetYRatio;
    }
  }
  
  /**
   * アルファベット回転制御
   */
  private applyAlphabetRotation(textObj: PIXI.Text, text: string, params: Record<string, unknown>): void {
    const rotationPattern = params.alphabetRotationPattern as string || "[a-zA-Z0-9]+";
    const regex = new RegExp(rotationPattern);
    
    if (regex.test(text)) {
      textObj.rotation = Math.PI / 2; // 90度回転
    }
  }
  
  /**
   * 長音記号回転制御
   */
  private applyLongVowelRotation(textObj: PIXI.Text, text: string, params: Record<string, unknown>): void {
    const longVowelChars = params.longVowelCharacters as string || "ー－‐−─━";
    if (longVowelChars.includes(text)) {
      textObj.rotation = Math.PI / 2; // 90度回転
    }
  }
  
  /**
   * 小文字位置調整
   */
  private applySmallCharAdjustment(textObj: PIXI.Text, text: string, params: Record<string, unknown>): void {
    const smallChars = params.smallCharacters as string || "っゃゅょァィゥェォッャュョヮヵヶ";
    if (smallChars.includes(text)) {
      const offsetXRatio = params.smallCharOffsetXRatio as number || 0.15;
      const offsetYRatio = params.smallCharOffsetYRatio as number || 0.1;
      const fontSize = params.fontSize as number || 120;
      
      textObj.x += fontSize * offsetXRatio;
      textObj.y += fontSize * offsetYRatio;
    }
  }
  
  /**
   * 縦書き文字のオフセット計算
   */
  private applyVerticalCharacterOffset(textObj: PIXI.Text, container: PIXI.Container, params: Record<string, unknown>): void {
    const containerName = container.name || '';
    
    // コンテナIDから単語内文字インデックスと単語インデックスを抽出
    const charIndexInWord = this.extractCharIndexFromContainerName(containerName);
    const wordIndex = this.extractWordIndexFromContainerName(containerName);
    
    const fontSize = params.fontSize as number || 120;
    const charSpacing = params.charSpacing as number || 1.0;
    const wordSpacing = params.wordSpacing as number || 1.0;
    
    // インデックス抽出に失敗した場合は警告して終了
    if (charIndexInWord === null || wordIndex === null) {
      return;
    }
    
    // 前の単語までの累積文字数を計算
    const cumulativeCharCount = this.calculateCumulativeCharCount(params, wordIndex);
    
    // 縦書きでのY方向オフセット計算
    const totalCharIndex = cumulativeCharCount + charIndexInWord;
    const charOffsetY = 0; // VerticalLayoutPrimitiveが処理するため、ここでは適用しない
    
    // 単語間の追加スペーシングを適用
    // 修正: FlexibleCumulativeLayoutPrimitiveで既に単語間隔が処理済みのため、重複適用を回避
    const additionalWordSpacing = 0; // FlexibleCumulativeLayoutPrimitiveに委譲
    const finalOffsetY = additionalWordSpacing;
    
    // 縦書き用のwordOffsetYも適用
    const wordOffsetY = params.wordOffsetY as number || 0;
    const totalOffsetY = finalOffsetY + wordOffsetY;
    
    // テキストオブジェクトの位置を調整
    // 句読点オフセットなど既存のY座標調整を保持
    textObj.position.set(textObj.x, textObj.y + totalOffsetY);
  }
  
  /**
   * コンテナ名から単語内文字インデックスを抽出
   */
  private extractCharIndexFromContainerName(containerName: string): number | null {
    if (containerName.startsWith('char_container_')) {
      const idPart = containerName.substring('char_container_'.length);
      const charMatch = idPart.match(/.*_char_(\d+)$/);
      if (charMatch) {
        return parseInt(charMatch[1], 10);
      }
    }
    return null;
  }

  /**
   * コンテナ名から単語インデックスを抽出
   */
  private extractWordIndexFromContainerName(containerName: string): number | null {
    if (containerName.startsWith('char_container_')) {
      const idPart = containerName.substring('char_container_'.length);
      const wordMatch = idPart.match(/.*_word_(\d+)_char_\d+$/);
      if (wordMatch) {
        return parseInt(wordMatch[1], 10);
      }
    }
    return null;
  }

  /**
   * 前の単語までの累積文字数を計算
   */
  private calculateCumulativeCharCount(params: Record<string, unknown>, currentWordIndex: number): number {
    const words = params.words as any[] || [];
    let cumulativeCount = 0;
    
    for (let i = 0; i < currentWordIndex && i < words.length; i++) {
      const word = words[i];
      if (word.chars && Array.isArray(word.chars)) {
        cumulativeCount += word.chars.length;
      } else if (word.text) {
        cumulativeCount += word.text.length;
      }
    }
    
    return cumulativeCount;
  }

  /**
   * 縦書き専用：前の単語までのY方向累積位置を計算
   */
  private calculateVerticalWordCumulativeY(params: Record<string, unknown>, wordIndex: number): number {
    const fontSize = params.fontSize as number || 120;
    const charSpacing = params.charSpacing as number || 1.0;
    const wordSpacing = params.wordSpacing as number || 1.0;
    const words = params.words as any[] || [];

    let cumulativeY = 0;

    // 前の単語までのY位置を累積計算
    for (let i = 0; i < wordIndex && i < words.length; i++) {
      const word = words[i];
      let wordHeight = 0;

      // 単語の高さを計算
      let charCount = 0;
      if (word.chars && Array.isArray(word.chars)) {
        charCount = word.chars.length;
      } else if (word.text) {
        charCount = word.text.length;
      }
      
      if (charCount > 0) {
        // charSpacing=0: 文字が重なる、charSpacing=1: 間隔なし
        wordHeight = charCount * fontSize * charSpacing;
      }

      cumulativeY += wordHeight;

      // 単語間隔を追加（最後の単語以外）
      // 修正: VerticalLayoutPrimitive(FlexibleCumulativeLayoutPrimitive)で既に処理済みのため重複適用を回避
      if (i < wordIndex - 1) {
        // cumulativeY += fontSize * wordSpacing; // VerticalLayoutPrimitiveに委譲
      }
    }

    return cumulativeY;
  }

  /**
   * 縦書き専用：フレーズ全体の高さを計算
   */
  private getActualPhraseHeightForVertical(params: Record<string, unknown>): number {
    const fontSize = params.fontSize as number || 120;
    const charSpacing = params.charSpacing as number || 1.0;
    const wordSpacing = params.wordSpacing as number || 1.0;
    const words = params.words as any[] || [];

    // デバッグ：実際のパラメータ値を確認
    console.log(`[VERTICAL_BAND] getActualPhraseHeightForVertical パラメータ値:`, {
      fontSize: params.fontSize,
      fontSizeDefault: params.fontSize == null ? '使用' : '未使用',
      charSpacing: params.charSpacing,
      charSpacingDefault: params.charSpacing == null ? '使用' : '未使用',
      wordSpacing: params.wordSpacing,
      wordSpacingDefault: params.wordSpacing == null ? '使用' : '未使用',
      wordsLength: words.length
    });

    if (!words || words.length === 0) {
      return fontSize * 10; // デフォルト高さ
    }

    let totalHeight = 0;

    // 全単語の高さを累積計算
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordHeight = 0;

      // 単語の高さを計算
      let charCount = 0;
      if (word.chars && Array.isArray(word.chars)) {
        charCount = word.chars.length;
      } else if (word.text) {
        charCount = word.text.length;
      }
      
      if (charCount > 0) {
        // charSpacing=0: 文字が重なる、charSpacing=1: 間隔なし
        wordHeight = charCount * fontSize * charSpacing;
      }

      totalHeight += wordHeight;

      // 単語間隔を追加（最後の単語以外）
      // 修正: VerticalLayoutPrimitive(FlexibleCumulativeLayoutPrimitive)で既に処理済みのため重複適用を回避
      if (i < words.length - 1) {
        // const spacingHeight = fontSize * wordSpacing; // VerticalLayoutPrimitiveに委譲
        // console.log(`[VERTICAL_BAND] getActualPhraseHeightForVertical 単語間スペース: wordIndex=${i}, wordSpacing=${wordSpacing}, fontSize=${fontSize}, 追加高さ=${spacingHeight}`);
        // totalHeight += spacingHeight;
      }
    }

    return totalHeight;
  }
}