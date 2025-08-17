/**
 * FadeBlurRandomTextPrimitive v2.0
 * 透明度とブラーフェードイン/アウトを組み合わせたランダム配置テキストテンプレート
 * v2.0: 階層分離型プリミティブアーキテクチャ準拠
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
  type FlexibleCharacterData
} from '../primitives';

/**
 * 透明度＋ブラーフェードとランダム配置を組み合わせたテンプレート
 * WordSlideTextPrimitive互換の実装方式を採用
 */
export class FadeBlurRandomTextPrimitive implements IAnimationTemplate {
  
  readonly metadata = {
    name: "FadeBlurRandomTextPrimitive",
    version: "2.0.0",
    description: "透明度とブラーフェードイン/アウトを組み合わせたランダム配置テキストテンプレート (v2.0)",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "UTAVISTA Development Team",
      contribution: "フェード＋ブラー＋ランダム配置テンプレート v2.0 実装",
      date: "2025-08-05"
    }
  };
  
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
      
      // ランダム配置設定
      { name: "enableRandomPlacement", type: "boolean", default: true },
      { name: "randomSeed", type: "number", default: 123, min: 1, max: 1000, step: 1 },
      { name: "randomRangeX", type: "number", default: 600, min: 100, max: 1000, step: 50 },
      { name: "randomRangeY", type: "number", default: 400, min: 100, max: 800, step: 50 },
      { name: "minDistanceFromPrevious", type: "number", default: 100, min: 50, max: 300, step: 25 },
      
      // タイミング設定
      { name: "headTime", type: "number", default: 800, min: 200, max: 2000, step: 100 },
      { name: "tailTime", type: "number", default: 800, min: 200, max: 2000, step: 100 },
      { name: "wordStaggerDelay", type: "number", default: 200, min: 0, max: 1000, step: 50 },
      
      // フェード効果設定
      { name: "fadeInDuration", type: "number", default: 500, min: 100, max: 1500, step: 50 },
      { name: "fadeOutDuration", type: "number", default: 500, min: 100, max: 1500, step: 50 },
      { name: "minAlpha", type: "number", default: 0.0, min: 0.0, max: 0.8, step: 0.1 },
      
      // ブラー効果設定
      { name: "enableBlur", type: "boolean", default: true },
      { name: "maxBlurStrength", type: "number", default: 8.0, min: 0.0, max: 20.0, step: 0.5 },
      { 
        name: "blurFadeType", 
        type: "string", 
        default: "sync_with_alpha",
        options: [
          "sync_with_alpha",    // 透明度と同期
          "inverse_alpha",      // 透明度と逆相関
          "independent"         // 独立したタイミング
        ]
      },
      
      // 文字間隔と配置（v0.4.3: deviceScale削除により1.0が標準）
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "lineHeight", type: "number", default: 1.2, min: 0, max: 3.0, step: 0.1 },
      
      // 単語表示モード（UI公開用）
      { 
        name: "wordDisplayMode", 
        type: "string", 
        default: "individual_word_entrance",
        get options() {
          return FlexibleCumulativeLayoutPrimitive.getWordDisplayModeValues();
        }
      },
    ];
  }
  
  /**
   * WordSlideTextPrimitive互換のremoveVisualElements実装
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
   * 階層対応のアニメーションメソッド（WordSlideTextPrimitive互換）
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
   * フレーズコンテナの描画（WordSlideTextPrimitive互換）
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
    
    // SlideAnimationPrimitive使用（WordSlideTextPrimitive互換）
    const slideAnimationPrimitive = new SlideAnimationPrimitive();
    
    const phraseAnimationResult = slideAnimationPrimitive.calculatePhrasePosition({
      phraseOffsetX: params.phraseOffsetX as number || 0,
      phraseOffsetY: params.phraseOffsetY as number || 0,
      fontSize: params.fontSize as number || 120,
      lineHeight: params.lineHeight as number || 1.2,
      headTime: params.headTime as number || 800,
      tailTime: params.tailTime as number || 800,
      randomPlacement: params.enableRandomPlacement as boolean ?? true,
      randomSeed: params.randomSeed as number || 123,
      randomRangeX: params.randomRangeX as number || 600,
      randomRangeY: params.randomRangeY as number || 400,
      minDistanceFromPrevious: params.minDistanceFromPrevious as number || 100,
      text: text,
      words: params.words as any[] || [],
      nowMs,
      startMs,
      endMs,
      phase,
      phraseId: params.phraseId as string || params.id as string || `phrase_${startMs}_${text.substring(0, 10)}`
    });
    
    // 最終位置設定
    container.position.set(phraseAnimationResult.x, phraseAnimationResult.y);
    container.alpha = phraseAnimationResult.alpha;
    container.visible = phraseAnimationResult.alpha > 0;
    container.updateTransform();
    
    return true;
  }
  
  /**
   * 単語コンテナの描画（WordSlideTextPrimitive互換）
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
    
    // 単語表示モードをパラメータから取得
    const wordDisplayModeParam = params.wordDisplayMode as string || 'individual_word_entrance';
    const wordIndex = params.wordIndex as number || 0;
    const fontSize = params.fontSize as number || 120;
    const lineHeight = params.lineHeight as number || 1.2;
    
    // 単語コンテナの位置を設定
    let wordY = 0;
    
    container.position.set(0, wordY);
    container.alpha = 1.0;
    container.visible = true;
    
    // FlexibleCumulativeLayoutPrimitive使用して文字コンテナ管理
    const layoutPrimitive = new FlexibleCumulativeLayoutPrimitive();
    
    // 文字データの検証と処理
    const charsData = params.chars as FlexibleCharacterData[];
    if (!charsData || !Array.isArray(charsData) || charsData.length === 0) {
      return true; // 文字データがない場合は単語コンテナのみ設定して終了
    }
    
    // 単語表示モードをパラメータから取得
    const wordDisplayModeStr = params.wordDisplayMode as string || 'individual_word_entrance';
    const wordDisplayModeEnum = this.mapWordDisplayModeToEnum(wordDisplayModeStr);
    
    // フレーズ一括入場モードの場合のタイミング制御パラメータ
    const isPhraseCumulativeMode = wordDisplayModeEnum === WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE || 
                                   wordDisplayModeEnum === WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
    
    // wordDisplayModeに基づいて適切なアライメントを自動設定
    // 注: 単語コンテナの位置は renderWordContainer で設定されているため、
    // ここでは単語内の文字の相対位置のみを管理します
    
    // 単語コンテナごとの処理
    const effectiveWordDisplayMode = wordDisplayModeEnum;
    
    const layoutParams = {
      charSpacing: params.charSpacing as number || 1.0,
      fontSize: params.fontSize as number || 120,
      halfWidthSpacingRatio: 0.6,
      alignment: 'left' as const,  // FlexibleCumulativeLayoutPrimitiveは'left'のみサポート
      containerSize: { width: 0, height: 0 },
      spacing: params.charSpacing as number || 1.0,
      chars: charsData,
      containerPrefix: 'char_container_',
      wordDisplayMode: effectiveWordDisplayMode,
      wordSpacing: params.wordSpacing as number || 1.0,
      lineHeight: params.lineHeight as number || 1.2,
      // フレーズ一括入場モードの場合のみタイミング制御パラメータを追加
      ...(isPhraseCumulativeMode && {
        phraseTimingControl: {
          nowMs: nowMs,
          phraseStartMs: params.phraseStartMs as number || startMs,
          phraseEndMs: params.phraseEndMs as number || endMs,
          headTime: params.headTime as number || 800,
          tailTime: params.tailTime as number || 800
        }
      })
    };
    
    layoutPrimitive.manageCharacterContainersFlexible(
      container,
      layoutParams,
      (charContainer, charData) => {
        // 文字アニメーションの適用（WordSlideTextPrimitive互換）
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
   * 文字コンテナの描画（WordSlideTextPrimitive互換 + フェード・ブラー効果）
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
    
    // 基本パラメータ取得
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string;
    
    // フォントファミリーチェック
    if (!fontFamily) {
      console.error('[FadeBlurRandomTextPrimitive] fontFamilyパラメータが指定されていません');
      return false;
    }
    
    // フレーズ一括入場モードかどうかを判定
    const wordDisplayModeStr = params.wordDisplayMode as string || "individual_word_entrance";
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
    
    // WordSlideTextPrimitive互換の色状態判定
    const defaultTextColor = params.textColor as string || '#FFFFFF';
    const activeTextColor = params.activeColor as string || '#FFD700';
    const completedTextColor = params.textColor as string || '#FFFFFF';
    
    let textColor = defaultTextColor;
    
    // フレーズレベルの時間でフェード計算（文字レベルではなく）
    // headTime/tailTimeを含めた拡張されたフレーズ期間を使用（GlitchTextPrimitive方式）
    const phraseStartMs = params.phraseStartMs as number || startMs;
    const phraseEndMs = params.phraseEndMs as number || endMs;
    const headTime = params.headTime as number || 800;
    const tailTime = params.tailTime as number || 800;
    
    // 拡張されたフレーズ期間を計算
    const extendedPhraseStartMs = phraseStartMs - headTime;
    const extendedPhraseEndMs = phraseEndMs + tailTime;
    
    let alpha = this.calculatePhraseBasedFadeAlpha(params, nowMs, extendedPhraseStartMs, extendedPhraseEndMs);
    
    if (nowMs < startMs) {
      // 文字のイン前
      textColor = defaultTextColor;
    } else if (nowMs <= endMs) {
      // 文字のアクティブ期間
      textColor = activeTextColor;
    } else {
      // 文字のアウト後
      textColor = completedTextColor;
    }
    
    // フェード効果をカラーのアルファ値で表現
    const colorWithAlpha = this.applyAlphaToColor(textColor, alpha);
    
    // WordSlideTextPrimitive方式でテキスト作成
    const textObj = TextStyleFactory.createHighDPIText(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: colorWithAlpha
    });
    
    // アンカー設定（WordSlideTextPrimitive互換）
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    textObj.scale.set(1.0, 1.0);
    textObj.alpha = 1.0;  // 常に1.0（WordSlideTextPrimitive互換）
    textObj.visible = true;  // 常に表示（WordSlideTextPrimitive互換）
    
    // ブラー効果適用（フェード効果と連動）
    if (params.enableBlur as boolean) {
      const blurStrength = (params.maxBlurStrength as number || 8.0) * (1 - alpha);
      if (blurStrength > 0.1) {
        const blurFilter = new PIXI.BlurFilter();
        blurFilter.blur = blurStrength;
        textObj.filters = [blurFilter];
        
        // フィルターエリア設定
        const bounds = textObj.getBounds();
        if (bounds.width > 0 && bounds.height > 0) {
          const padding = Math.ceil(blurStrength * 2);
          textObj.filterArea = new PIXI.Rectangle(
            bounds.x - padding,
            bounds.y - padding,
            bounds.width + padding * 2,
            bounds.height + padding * 2
          );
        }
      }
    }
    
    container.addChild(textObj);
    
    // 開発時検証（本番では無効）
    validateInDevelopment(() => {
      TemplateValidationHelper.validateCharacterContinuity(textObj, 'FadeBlurRandomTextPrimitive');
      TemplateValidationHelper.validateFadeImplementation(textObj, alpha, 'FadeBlurRandomTextPrimitive');
      TemplateValidationHelper.debugCharacterState(textObj, 'FadeBlurRandomTextPrimitive', {
        fadeAlpha: alpha,
        blurEnabled: params.enableBlur,
        nowMs, startMs, endMs
      });
    });
    
    return true;
  }


  /**
   * フェードアルファ計算（文字レベル - 従来版）
   */
  private calculateFadeAlpha(
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number
  ): number {
    const fadeInDuration = params.fadeInDuration as number || 500;
    const fadeOutDuration = params.fadeOutDuration as number || 500;
    const minAlpha = params.minAlpha as number || 0.0;

    // フェードイン期間
    if (nowMs < startMs + fadeInDuration) {
      const progress = Math.max(0, (nowMs - startMs) / fadeInDuration);
      return minAlpha + (1 - minAlpha) * this.easeOutCubic(progress);
    }

    // アクティブ期間
    if (nowMs < endMs - fadeOutDuration) {
      return 1.0;
    }

    // フェードアウト期間
    const progress = Math.min(1, (nowMs - (endMs - fadeOutDuration)) / fadeOutDuration);
    return 1.0 - (1 - minAlpha) * this.easeInCubic(progress);
  }
  
  /**
   * フレーズベースのフェードアルファ計算
   * 全ての文字がフレーズ表示期間中は表示されるように調整
   */
  private calculatePhraseBasedFadeAlpha(
    params: Record<string, unknown>,
    nowMs: number,
    phraseStartMs: number,
    phraseEndMs: number
  ): number {
    // フレーズが表示されている期間は常にalpha=1.0
    if (nowMs >= phraseStartMs && nowMs <= phraseEndMs) {
      return 1.0;
    }
    
    const fadeInDuration = params.fadeInDuration as number || 500;
    const fadeOutDuration = params.fadeOutDuration as number || 500;
    const minAlpha = params.minAlpha as number || 0.0;

    // フレーズ開始前のフェードイン
    if (nowMs < phraseStartMs) {
      const fadeInStart = phraseStartMs - fadeInDuration;
      if (nowMs < fadeInStart) {
        return minAlpha;
      }
      const progress = (nowMs - fadeInStart) / fadeInDuration;
      return minAlpha + (1 - minAlpha) * this.easeOutCubic(Math.max(0, progress));
    }

    // フレーズ終了後のフェードアウト
    if (nowMs > phraseEndMs) {
      const fadeOutEnd = phraseEndMs + fadeOutDuration;
      if (nowMs > fadeOutEnd) {
        return minAlpha;
      }
      const progress = (nowMs - phraseEndMs) / fadeOutDuration;
      return 1.0 - (1 - minAlpha) * this.easeInCubic(Math.min(1, progress));
    }

    return 1.0;
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private easeInCubic(t: number): number {
    return t * t * t;
  }
  
  /**
   * 単語表示モードの文字列をenumに変換
   */
  private mapWordDisplayModeToEnum(mode: string): WordDisplayMode {
    switch (mode) {
      case 'phrase_cumulative_same_line':
        return WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE;
      case 'individual_word_entrance_new_line':
        return WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_NEW_LINE;
      case 'phrase_cumulative_new_line':
        return WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
      case 'individual_word_entrance':
      default:
        if (mode !== 'individual_word_entrance') {
          console.warn(`[FadeBlurRandomTextPrimitive] Unknown wordDisplayMode: ${mode}, using default`);
        }
        return WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE;
    }
  }
  
  /**
   * カラーにアルファ値を適用するヘルパーメソッド
   */
  private applyAlphaToColor(color: string, alpha: number): string {
    try {
      // HEX色の場合
      if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 6) {
          const r = parseInt(hex.substr(0, 2), 16);
          const g = parseInt(hex.substr(2, 2), 16);
          const b = parseInt(hex.substr(4, 2), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
      
      // RGB/RGBA色の場合はそのまま返す（簡易処理）
      if (color.includes('rgb')) {
        // 簡易的にアルファ値を調整
        if (color.includes('rgba')) {
          return color.replace(/rgba\(([^)]+)\)/, (match, params) => {
            const parts = params.split(',');
            if (parts.length >= 4) {
              parts[3] = ` ${alpha}`;
            }
            return `rgba(${parts.join(',')})`;
          });
        } else {
          return color.replace(/rgb\(([^)]+)\)/, `rgba($1, ${alpha})`);
        }
      }
      
      // その他の場合はそのまま返す
      return color;
    } catch (error) {
      console.warn('[FadeBlurRandomTextPrimitive] Color conversion error:', error);
      return color;
    }
  }
}