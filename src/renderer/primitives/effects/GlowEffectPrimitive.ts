/**
 * グローエフェクトプリミティブ
 * WordSlideTextテンプレートのAdvancedBloomFilterを継承した協調的システム
 */

import * as PIXI from 'pixi.js';
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import { DropShadowFilter } from 'pixi-filters';
import {
  EffectPrimitive,
  LayerState,
  ChildInstruction,
  PrimitiveResult,
  EffectParams
} from '../types';

/**
 * グローエフェクト専用パラメータ
 */
export interface GlowEffectParams extends EffectParams {
  /** グロー強度 */
  glowStrength: number;
  /** 明度 */
  glowBrightness: number;
  /** ブラー量 */
  glowBlur: number;
  /** 品質 */
  glowQuality: number;
  /** パディング量 */
  glowPadding: number;
  /** 閾値 */
  threshold: number;
}

/**
 * シャドウエフェクト専用パラメータ
 */
export interface ShadowEffectParams extends EffectParams {
  /** シャドウブラー */
  shadowBlur: number;
  /** シャドウ色 */
  shadowColor: string;
  /** シャドウ角度 */
  shadowAngle: number;
  /** シャドウ距離 */
  shadowDistance: number;
  /** シャドウアルファ */
  shadowAlpha: number;
  /** シャドウのみ表示 */
  shadowOnly: boolean;
  /** シャドウ品質 */
  shadowQuality?: number;
}

/**
 * 合成エフェクトパラメータ
 */
export interface CompositeEffectParams {
  /** グロー効果の有効化 */
  enableGlow: boolean;
  /** シャドウ効果の有効化 */
  enableShadow: boolean;
  /** ブレンドモード */
  blendMode: string;
  /** グローパラメータ */
  glow?: GlowEffectParams;
  /** シャドウパラメータ */
  shadow?: ShadowEffectParams;
}

/**
 * グローエフェクトプリミティブの実装
 * オリジナルのAdvancedBloomFilter制御を継承
 */
export class GlowEffectPrimitive implements EffectPrimitive {
  public readonly name = 'GlowEffect';
  
  private parentState: LayerState | null = null;
  private childInstructions: ChildInstruction[] = [];
  private currentFilters: PIXI.Filter[] = [];
  
  /**
   * 上位層からの制御を受け入れ
   */
  receiveParentContext(parentState: LayerState): void {
    this.parentState = parentState;
  }
  
  /**
   * グローエフェクトの適用
   * オリジナルWordSlideTextの設定を継承
   */
  applyEffect(container: PIXI.Container, params: CompositeEffectParams): void {
    this.removeEffect(container);
    
    const filters: PIXI.Filter[] = [];
    
    // シャドウエフェクトの適用（先に適用）
    if (params.enableShadow && params.shadow) {
      const shadowFilter = this.createShadowFilter(params.shadow);
      filters.push(shadowFilter);
    }
    
    // グローエフェクトの適用
    if (params.enableGlow && params.glow) {
      const glowFilter = this.createGlowFilter(params.glow);
      filters.push(glowFilter);
    }
    
    // フィルターエリアの設定
    this.configureFilterArea(container, params);
    
    // ブレンドモードの適用
    this.applyBlendMode(container, params.blendMode);
    
    // フィルターの設定
    container.filters = filters.length > 0 ? filters : null;
    this.currentFilters = filters;
  }
  
  /**
   * エフェクトの削除
   */
  removeEffect(container: PIXI.Container): void {
    container.filters = null;
    container.filterArea = null;
    container.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.currentFilters = [];
  }
  
  /**
   * 協調的階層内での処理実行
   */
  executeWithinHierarchy(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>
  ): PrimitiveResult {
    try {
      // パラメータの型安全な変換
      const effectParams: CompositeEffectParams = {
        enableGlow: params.enableGlow as boolean ?? true,
        enableShadow: params.enableShadow as boolean ?? false,
        blendMode: params.blendMode as string || 'normal',
        glow: params.enableGlow ? {
          intensity: 1.0,
          glowStrength: params.glowStrength as number || 1.5,
          glowBrightness: params.glowBrightness as number || 1.2,
          glowBlur: params.glowBlur as number || 6,
          glowQuality: params.glowQuality as number || 8,
          glowPadding: params.glowPadding as number || 50,
          threshold: 0.2
        } : undefined,
        shadow: params.enableShadow ? {
          intensity: 1.0,
          shadowBlur: params.shadowBlur as number || 6,
          shadowColor: params.shadowColor as string || '#000000',
          shadowAngle: params.shadowAngle as number || 45,
          shadowDistance: params.shadowDistance as number || 8,
          shadowAlpha: params.shadowAlpha as number || 0.8,
          shadowOnly: params.shadowOnly as boolean ?? false,
          shadowQuality: params.shadowQuality as number || 4
        } : undefined
      };
      
      // エフェクトの適用
      this.applyEffect(container, effectParams);
      
      // 子階層への指示を生成
      this.childInstructions = [{
        childId: 'effect_target',
        position: { x: 0, y: 0 },
        alpha: 1.0,
        visible: true,
        childParams: {
          effectApplied: true,
          glowEnabled: effectParams.enableGlow,
          shadowEnabled: effectParams.enableShadow,
          blendMode: effectParams.blendMode
        }
      }];
      
      return {
        success: true,
        childInstructions: this.childInstructions
      };
      
    } catch (error) {
      return {
        success: false,
        childInstructions: [],
        error: `GlowEffectPrimitive execution failed: ${error}`
      };
    }
  }
  
  /**
   * 下位層への指示を生成
   */
  generateChildInstructions(): ChildInstruction[] {
    return this.childInstructions;
  }
  
  /**
   * AdvancedBloomFilterの作成
   * オリジナル設定を継承
   */
  private createGlowFilter(params: GlowEffectParams): AdvancedBloomFilter {
    return new AdvancedBloomFilter({
      threshold: params.threshold,
      bloomScale: params.glowStrength,
      brightness: params.glowBrightness,
      blur: params.glowBlur,
      quality: params.glowQuality,
      kernels: null,
      pixelSize: { x: 1, y: 1 }
    });
  }
  
  /**
   * DropShadowFilterの作成
   * オリジナル設定を継承
   */
  private createShadowFilter(params: ShadowEffectParams): DropShadowFilter {
    const shadowFilter = new DropShadowFilter({
      blur: params.shadowBlur,
      color: params.shadowColor,
      alpha: params.shadowAlpha,
      angle: params.shadowAngle,
      distance: params.shadowDistance,
      quality: params.shadowQuality || 4
    });
    
    // shadowOnlyプロパティの設定
    (shadowFilter as any).shadowOnly = params.shadowOnly;
    
    return shadowFilter;
  }
  
  /**
   * フィルターエリアの設定
   * パフォーマンス最適化のため
   */
  private configureFilterArea(container: PIXI.Container, params: CompositeEffectParams): void {
    const needsPadding = params.enableGlow || params.enableShadow;
    
    if (!needsPadding) {
      container.filterArea = null;
      return;
    }
    
    // パディング量の計算
    const glowPadding = params.glow?.glowPadding || 0;
    const shadowPadding = params.shadow ? (params.shadow.shadowDistance + params.shadow.shadowBlur) : 0;
    const maxPadding = Math.max(glowPadding, shadowPadding);
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (app && app.renderer) {
      const screenWidth = app.renderer.width;
      const screenHeight = app.renderer.height;
      
      container.filterArea = new PIXI.Rectangle(
        -maxPadding,
        -maxPadding,
        screenWidth + maxPadding * 2,
        screenHeight + maxPadding * 2
      );
    }
  }
  
  /**
   * ブレンドモードの適用
   */
  private applyBlendMode(container: PIXI.Container, blendMode: string): void {
    const blendModeMap: Record<string, PIXI.BLEND_MODES> = {
      'normal': PIXI.BLEND_MODES.NORMAL,
      'add': PIXI.BLEND_MODES.ADD,
      'multiply': PIXI.BLEND_MODES.MULTIPLY,
      'screen': PIXI.BLEND_MODES.SCREEN,
      'overlay': PIXI.BLEND_MODES.OVERLAY,
      'darken': PIXI.BLEND_MODES.DARKEN,
      'lighten': PIXI.BLEND_MODES.LIGHTEN,
      'color-dodge': PIXI.BLEND_MODES.COLOR_DODGE,
      'color-burn': PIXI.BLEND_MODES.COLOR_BURN,
      'hard-light': PIXI.BLEND_MODES.HARD_LIGHT,
      'soft-light': PIXI.BLEND_MODES.SOFT_LIGHT,
      'difference': PIXI.BLEND_MODES.DIFFERENCE,
      'exclusion': PIXI.BLEND_MODES.EXCLUSION
    };
    
    container.blendMode = blendModeMap[blendMode] || PIXI.BLEND_MODES.NORMAL;
  }
  
  /**
   * 単語コンテナ用のフィルターエリア設定
   * オリジナルの文字幅計算ロジックを継承
   */
  configureWordFilterArea(
    container: PIXI.Container,
    text: string,
    params: {
      fontSize: number;
      charSpacing: number;
      glowPadding: number;
    }
  ): void {
    // 文字幅の計算（半角・全角対応）
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const isHalfWidth = this.isHalfWidthChar(char);
      const effectiveSpacing = isHalfWidth ? params.charSpacing * 0.6 : params.charSpacing;
      totalWidth += params.fontSize * effectiveSpacing;
    }
    
    const wordWidth = totalWidth + params.glowPadding * 2;
    const wordHeight = params.fontSize + params.glowPadding * 2;
    
    container.filterArea = new PIXI.Rectangle(
      -params.glowPadding,
      -params.glowPadding,
      wordWidth,
      wordHeight
    );
  }
  
  /**
   * 半角文字判定
   * オリジナルロジックを継承
   */
  private isHalfWidthChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
  }
  
  /**
   * エフェクト強度の動的調整
   * LLMパラメータに対応
   */
  adjustEffectIntensity(
    container: PIXI.Container,
    intensity: 'subtle' | 'normal' | 'dramatic'
  ): void {
    const intensityMap = {
      'subtle': { strength: 0.8, brightness: 1.0, blur: 4 },
      'normal': { strength: 1.5, brightness: 1.2, blur: 6 },
      'dramatic': { strength: 2.5, brightness: 1.5, blur: 10 }
    };
    
    const settings = intensityMap[intensity];
    
    if (container.filters && container.filters.length > 0) {
      container.filters.forEach(filter => {
        if (filter instanceof AdvancedBloomFilter) {
          filter.bloomScale = settings.strength;
          filter.brightness = settings.brightness;
          filter.blur = settings.blur;
        }
      });
    }
  }
  
  /**
   * エフェクト状態のデバッグ情報を取得
   */
  getDebugInfo(container: PIXI.Container): Record<string, unknown> {
    return {
      primitiveName: this.name,
      filtersCount: container.filters?.length || 0,
      hasFilterArea: !!container.filterArea,
      blendMode: container.blendMode,
      filterTypes: container.filters?.map(f => f.constructor.name) || [],
      filterArea: container.filterArea ? {
        x: container.filterArea.x,
        y: container.filterArea.y,
        width: container.filterArea.width,
        height: container.filterArea.height
      } : null
    };
  }
}