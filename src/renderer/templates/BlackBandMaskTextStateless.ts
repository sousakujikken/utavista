/**
 * BlackBandMaskTextStateless
 * 新しいStateManager基盤のステートレス版黒帯スワイプテンプレート
 */

import * as PIXI from 'pixi.js';
import { IStatelessTemplate, TemplateParams } from '../types/StatelessTemplate';
import { ParameterConfig } from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { RenderState, EffectState } from '../state/StateManager';
import { 
  GlowEffectPrimitive,
  ShapePrimitive,
  FlexibleCumulativeLayoutPrimitive,
  WordDisplayMode,
  type CompositeEffectParams,
  type RectangleParams,
  type FlexibleCharacterData
} from '../primitives';

export class BlackBandMaskTextStateless implements IStatelessTemplate {
  // Graphics Primitives（ステートレス）
  private shapePrimitive = new ShapePrimitive();
  private textGlowEffectPrimitive = new GlowEffectPrimitive();
  private bandGlowEffectPrimitive = new GlowEffectPrimitive();

  readonly metadata = {
    name: "BlackBandMaskTextStateless",
    version: "2.0.0",
    description: "ステートレス版 - 黒帯と白矩形マスクによる文字反転表示テンプレート",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "UTAVISTA Development Team",
      contribution: "StateManager対応版への完全リファクタリング",
      date: "2025-01-28"
    }
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
      { name: "maskBlendMode", type: "select", default: "difference", options: [
        { value: "normal", label: "通常" },
        { value: "multiply", label: "乗算" }, 
        { value: "difference", label: "反転" },
        { value: "overlay", label: "オーバーレイ" },
        { value: "screen", label: "スクリーン" }
      ] },
      
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
      { name: "bandShadowQuality", type: "number", default: 4, min: 1, max: 10, step: 1 }
    ];
  }

  renderAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean {
    const { object, effects, graphics } = state;
    
    // 基本的な可視性制御
    if (!object.exists) {
      container.visible = false;
      return true;
    }

    container.visible = object.visible;

    // 階層タイプに応じた描画
    switch (object.hierarchyType) {
      case 'phrase':
        return this.renderPhraseAtTime(container, state, params, timestamp);
      case 'word':
        return this.renderWordAtTime(container, state, params, timestamp);
      case 'char':
        return this.renderCharAtTime(container, state, params, timestamp);
    }

    return false;
  }

  private renderPhraseAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean {
    const { object, effects, graphics } = state;
    const fontSize = params.fontSize as number || 120;

    // 黒帯の描画
    const blackBandGraphics = graphics.get('blackBand');
    if (blackBandGraphics?.visible) {
      this.renderBlackBand(container, state, params);
    }

    // スワイプエフェクトの適用
    const swipeInEffect = effects.get('swipeIn');
    if (swipeInEffect?.enabled) {
      this.applySwipeInEffect(container, swipeInEffect, params);
    }

    const swipeOutEffect = effects.get('swipeOut');
    if (swipeOutEffect?.enabled) {
      this.applySwipeOutEffect(container, swipeOutEffect, params);
    }

    return true;
  }

  private renderWordAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean {
    // 単語レベルでは基本的な可視性制御のみ
    container.visible = state.object.visible;
    
    // FlexibleCumulativeLayoutPrimitiveによる配置は上位で処理済み
    return true;
  }

  private renderCharAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean {
    const { object, effects } = state;

    // 文字が存在すべきでない場合は非表示
    if (!object.visible) {
      container.visible = false;
      return true;
    }

    // 既存の文字オブジェクトをクリア
    container.removeChildren();

    // 基本パラメータ取得
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string || 'Arial';
    const defaultTextColor = params.textColor as string || '#FFFFFF';
    const activeTextColor = params.activeColor as string || '#FFD700';

    // 色の決定（フェーズに基づく）
    let textColor = defaultTextColor;
    if (object.phase === 'active') {
      textColor = activeTextColor;
    }

    // テキスト作成
    const text = params.text as string || '';
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
    container.visible = true;

    // 文字エフェクトの適用
    this.applyTextGlowShadowEffect(container, params);

    return true;
  }

  private renderBlackBand(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams
  ): void {
    const { graphics } = state;
    const blackBandState = graphics.get('blackBand');
    if (!blackBandState) return;

    // 既存の黒帯を検索
    let blackBand = container.children.find(child => 
      child.name === 'black_band'
    ) as PIXI.Graphics;

    if (!blackBand) {
      // 新規作成
      const bandWidth = (params.phraseWidth as number || 400) * (params.blackBandWidthRatio as number || 1.2);
      const bandHeight = (params.fontSize as number || 120) * (params.blackBandHeightRatio as number || 1.0);

      const blackBandParams: RectangleParams = {
        width: bandWidth,
        height: bandHeight,
        x: -bandWidth / 2,
        y: -bandHeight / 2,
        color: params.blackBandColor as string || '#000000',
        alpha: 1.0
      };

      blackBand = this.shapePrimitive.createRectangle(blackBandParams);
      blackBand.name = 'black_band';
      container.addChild(blackBand);

      // 黒帯エフェクトの適用
      this.applyBandGlowShadowEffect(blackBand as any, params);
    }

    // 可視性とマスクの適用
    blackBand.visible = blackBandState.visible;
    if (blackBandState.mask && blackBandState.visible) {
      this.applyMaskToBlackBand(blackBand, blackBandState.mask.progress, params);
    }
  }

  private applySwipeInEffect(
    container: PIXI.Container,
    effect: EffectState,
    params: TemplateParams
  ): void {
    const blackBand = container.children.find(child => 
      child.name === 'black_band'
    ) as PIXI.Graphics;

    if (blackBand && effect.params.maskWidth !== undefined) {
      this.applyMaskToBlackBand(blackBand, effect.params.maskWidth, params);
    }
  }

  private applySwipeOutEffect(
    container: PIXI.Container,
    effect: EffectState,
    params: TemplateParams
  ): void {
    // スワイプアウトは統一マスクで処理
    if (effect.params.swipeProgress !== undefined) {
      this.applyUnifiedSwipeMask(container, effect.params.swipeProgress, params);
    }
  }

  private applyMaskToBlackBand(
    blackBand: PIXI.Graphics,
    progress: number,
    params: TemplateParams
  ): void {
    // 既存マスクをクリア
    if (blackBand.mask) {
      if (blackBand.mask instanceof PIXI.Graphics) {
        blackBand.mask.destroy();
      }
      blackBand.mask = null;
    }

    if (progress <= 0) {
      blackBand.visible = false;
      return;
    }

    blackBand.visible = true;

    if (progress >= 1.0) {
      // 完全表示
      return;
    }

    // マスク作成
    const bandWidth = blackBand.width;
    const visibleWidth = bandWidth * progress;

    const mask = new PIXI.Graphics();
    mask.beginFill(0xFFFFFF, 1.0);
    mask.drawRect(
      -bandWidth / 2,
      -blackBand.height / 2,
      visibleWidth,
      blackBand.height
    );
    mask.endFill();

    blackBand.mask = mask;
    blackBand.addChild(mask);
  }

  private applyUnifiedSwipeMask(
    container: PIXI.Container,
    progress: number,
    params: TemplateParams
  ): void {
    // 統一スワイプマスクの実装
    // 簡略化版：進行度に基づいてコンテナ全体をマスク
    if (progress >= 1.0) {
      container.visible = false;
      return;
    }

    // マスク適用
    let unifiedMask = container.children.find(child => 
      child.name === 'unified_swipe_mask'
    ) as PIXI.Graphics;

    if (!unifiedMask) {
      unifiedMask = new PIXI.Graphics();
      unifiedMask.name = 'unified_swipe_mask';
      container.addChild(unifiedMask);
    }

    unifiedMask.clear();
    const maskWidth = (container.width || 400) * (1 - progress);
    
    unifiedMask.beginFill(0xFFFFFF, 1.0);
    unifiedMask.drawRect(
      -maskWidth / 2,
      -100,
      maskWidth,
      200
    );
    unifiedMask.endFill();

    // 文字コンテナにマスクを適用
    container.children.forEach(child => {
      if (child !== unifiedMask && child instanceof PIXI.Container) {
        child.mask = unifiedMask;
      }
    });
  }

  private applyTextGlowShadowEffect(container: PIXI.Container, params: TemplateParams): void {
    const enableGlow = params.enableTextGlow as boolean || false;
    const enableShadow = params.enableTextShadow as boolean || false;

    if (!enableGlow && !enableShadow) {
      this.textGlowEffectPrimitive.removeEffect(container);
      return;
    }

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

    this.textGlowEffectPrimitive.applyEffect(container, effectParams);
  }

  private applyBandGlowShadowEffect(container: PIXI.Container, params: TemplateParams): void {
    const enableGlow = params.enableBandGlow as boolean || false;
    const enableShadow = params.enableBandShadow as boolean || false;

    if (!enableGlow && !enableShadow) {
      this.bandGlowEffectPrimitive.removeEffect(container);
      return;
    }

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

    this.bandGlowEffectPrimitive.applyEffect(container, effectParams);
  }

  cleanup(container: PIXI.Container): void {
    // マスクを含む全ての子要素をクリーンアップ
    container.children.forEach(child => {
      if (child.mask) {
        if (child.mask instanceof PIXI.Graphics) {
          child.mask.destroy();
        }
        child.mask = null;
      }
      
      if (child instanceof PIXI.Container) {
        child.destroy({ children: true });
      } else {
        child.destroy();
      }
    });
    
    container.removeChildren();
    
    // エフェクトのクリーンアップ
    this.textGlowEffectPrimitive.removeEffect(container);
    this.bandGlowEffectPrimitive.removeEffect(container);
  }
}