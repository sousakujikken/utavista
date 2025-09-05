/**
 * LLMフレンドリーな意図ベースAPI
 * 自然言語に近い表現でプリミティブを制御
 */

import * as PIXI from 'pixi.js';
import { CumulativeLayoutPrimitive } from '../layout/CumulativeLayoutPrimitive';
import { SlideAnimationPrimitive } from '../animation/SlideAnimationPrimitive';
import { GlowEffectPrimitive } from '../effects/GlowEffectPrimitive';
import { EasingFunctions } from '../types';

/**
 * 方向の型定義
 */
export type Direction = 'left' | 'right' | 'top' | 'bottom';

/**
 * 配置順序の型定義
 */
export type RevealOrder = 'left-to-right' | 'right-to-left' | 'random' | 'simultaneous';

/**
 * エフェクト強度の型定義
 */
export type EffectIntensity = 'subtle' | 'normal' | 'dramatic';

/**
 * アニメーション結果の型定義
 */
export interface AnimationResult {
  position: { x: number; y: number };
  alpha: number;
  visible: boolean;
}

/**
 * レイアウト結果の型定義
 */
export interface LayoutResult {
  totalWidth: number;
  totalHeight: number;
  characterPositions: Array<{ char: string; x: number; y: number }>;
}

/**
 * エフェクト結果の型定義
 */
export interface EffectResult {
  filtersApplied: boolean;
  filterCount: number;
  effectTypes: string[];
}

/**
 * LLMフレンドリーな意図ベースAPI
 * 自然言語に近い直感的なメソッド名と引数
 */
export class IntentBasedAPI {
  private layoutPrimitive: CumulativeLayoutPrimitive;
  private slidePrimitive: SlideAnimationPrimitive;
  private glowPrimitive: GlowEffectPrimitive;
  
  constructor() {
    this.layoutPrimitive = new CumulativeLayoutPrimitive();
    this.slidePrimitive = new SlideAnimationPrimitive();
    this.glowPrimitive = new GlowEffectPrimitive();
  }
  
  /**
   * 文字を指定方向からスライドイン
   * 例: "文字が左からスライドイン"
   */
  slideTextFromDirection(
    container: PIXI.Container,
    direction: Direction,
    params: {
      nowMs: number;
      startMs: number;
      speed?: 'slow' | 'normal' | 'fast';
      distance?: number;
    }
  ): AnimationResult {
    const speedMap = {
      'slow': { initialSpeed: 2.0, finalSpeed: 0.05 },
      'normal': { initialSpeed: 4.0, finalSpeed: 0.1 },
      'fast': { initialSpeed: 8.0, finalSpeed: 0.2 }
    };
    
    const speedSettings = speedMap[params.speed || 'normal'];
    
    const result = this.slidePrimitive.executeSlideFromDirection(container, direction, {
      initialSpeed: speedSettings.initialSpeed,
      finalSpeed: speedSettings.finalSpeed,
      initialOffset: params.distance || 100,
      headTime: 500,
      nowMs: params.nowMs,
      startMs: params.startMs
    });
    
    return {
      position: { x: result.x, y: result.y },
      alpha: result.alpha,
      visible: result.alpha > 0
    };
  }
  
  /**
   * 文字を順次表示
   * 例: "文字が左から右に順番に現れる"
   */
  revealCharactersSequentially(
    wordContainer: PIXI.Container,
    text: string,
    order: RevealOrder,
    params: {
      fontSize?: number;
      charSpacing?: number;
      alignment?: 'left' | 'center' | 'right';
    }
  ): LayoutResult {
    const layoutParams = {
      spacing: params.charSpacing || 1.0,
      alignment: params.alignment || 'left',
      containerSize: { width: 0, height: 0 },
      charSpacing: params.charSpacing || 1.0,
      fontSize: params.fontSize || 32,
      halfWidthSpacingRatio: 0.6
    };
    
    // 順序に基づく文字配列の並び替え
    let chars = Array.from(text);
    if (order === 'right-to-left') {
      chars = chars.reverse();
    } else if (order === 'random') {
      // シャッフル（Fisher-Yates）
      for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
    }
    
    // 累積レイアウトの管理
    this.layoutPrimitive.manageCharacterContainers(
      wordContainer,
      chars.join(''),
      layoutParams
    );
    
    // デバッグ情報の取得
    const debugInfo = this.layoutPrimitive.getDebugInfo(text, layoutParams);
    
    return {
      totalWidth: debugInfo.totalWidth as number,
      totalHeight: layoutParams.fontSize,
      characterPositions: (debugInfo.layoutResults as any[]).map(result => ({
        char: result.char,
        x: result.position.x,
        y: result.position.y
      }))
    };
  }
  
  /**
   * グロー効果を適用
   * 例: "文字を光らせる"
   */
  applyGlowEffect(
    container: PIXI.Container,
    intensity: EffectIntensity,
    color?: string
  ): EffectResult {
    const intensityMap = {
      'subtle': { strength: 0.8, brightness: 1.0, blur: 4, padding: 30 },
      'normal': { strength: 1.5, brightness: 1.2, blur: 6, padding: 50 },
      'dramatic': { strength: 2.5, brightness: 1.5, blur: 10, padding: 80 }
    };
    
    const settings = intensityMap[intensity];
    
    const effectParams = {
      enableGlow: true,
      enableShadow: false,
      blendMode: 'normal',
      glow: {
        intensity: 1.0,
        glowStrength: settings.strength,
        glowBrightness: settings.brightness,
        glowBlur: settings.blur,
        glowQuality: 8,
        glowPadding: settings.padding,
        threshold: 0.2
      }
    };
    
    this.glowPrimitive.applyEffect(container, effectParams);
    
    const debugInfo = this.glowPrimitive.getDebugInfo(container);
    
    return {
      filtersApplied: true,
      filterCount: debugInfo.filtersCount as number,
      effectTypes: debugInfo.filterTypes as string[]
    };
  }
  
  /**
   * バウンスイン効果
   * 例: "文字が弾んで入る"
   */
  bounceIn(
    container: PIXI.Container,
    elasticity: number,
    params: {
      nowMs: number;
      startMs: number;
      duration?: number;
    }
  ): AnimationResult {
    const duration = params.duration || 800;
    const progress = Math.min(Math.max((params.nowMs - params.startMs) / duration, 0), 1);
    
    // バウンス効果の計算（減衰振動）
    const bounceProgress = this.calculateBounceEasing(progress, elasticity);
    
    // スケールアニメーション
    const scale = 0.3 + (1.0 - 0.3) * bounceProgress;
    container.scale.set(scale, scale);
    
    // アルファアニメーション
    const alpha = Math.min(progress * 2, 1.0);
    container.alpha = alpha;
    container.visible = alpha > 0;
    
    return {
      position: { x: container.position.x, y: container.position.y },
      alpha: alpha,
      visible: alpha > 0
    };
  }
  
  /**
   * フェードアウト効果
   * 例: "文字を薄くしていく"
   */
  fadeOut(
    container: PIXI.Container,
    duration: number,
    params: {
      nowMs: number;
      startMs: number;
    }
  ): AnimationResult {
    const progress = Math.min(Math.max((params.nowMs - params.startMs) / duration, 0), 1);
    const alpha = 1.0 - EasingFunctions.easeInQuad(progress);
    
    container.alpha = alpha;
    container.visible = alpha > 0;
    
    return {
      position: { x: container.position.x, y: container.position.y },
      alpha: alpha,
      visible: alpha > 0
    };
  }
  
  /**
   * 複合アニメーション: スライド + グロー
   * 例: "文字が左からスライドインして光る"
   */
  slideAndGlow(
    container: PIXI.Container,
    direction: Direction,
    intensity: EffectIntensity,
    params: {
      nowMs: number;
      startMs: number;
      speed?: 'slow' | 'normal' | 'fast';
      distance?: number;
    }
  ): { animation: AnimationResult; effect: EffectResult } {
    // スライドアニメーション
    const animationResult = this.slideTextFromDirection(container, direction, params);
    
    // グロー効果
    const effectResult = this.applyGlowEffect(container, intensity);
    
    return {
      animation: animationResult,
      effect: effectResult
    };
  }
  
  /**
   * エフェクトの削除
   * 例: "効果を取り除く"
   */
  clearAllEffects(container: PIXI.Container): void {
    this.glowPrimitive.removeEffect(container);
    container.scale.set(1, 1);
    container.alpha = 1;
    container.visible = true;
  }
  
  /**
   * バウンスイージングの計算
   */
  private calculateBounceEasing(t: number, elasticity: number): number {
    if (t >= 1) return 1;
    
    // 減衰振動の計算
    const frequency = 3 + elasticity * 2; // 振動の頻度
    const decay = 5 - elasticity * 2; // 減衰率
    
    return 1 - Math.exp(-decay * t) * Math.cos(frequency * Math.PI * t);
  }
  
  /**
   * APIの使用例を取得（LLM学習用）
   */
  getUsageExamples(): Record<string, string> {
    return {
      'slide_from_left': 'api.slideTextFromDirection(container, "left", { nowMs, startMs, speed: "normal" })',
      'reveal_sequential': 'api.revealCharactersSequentially(container, text, "left-to-right", { fontSize: 32 })',
      'apply_glow': 'api.applyGlowEffect(container, "normal")',
      'bounce_in': 'api.bounceIn(container, 0.8, { nowMs, startMs, duration: 800 })',
      'fade_out': 'api.fadeOut(container, 500, { nowMs, startMs })',
      'slide_and_glow': 'api.slideAndGlow(container, "left", "dramatic", { nowMs, startMs })',
      'clear_effects': 'api.clearAllEffects(container)'
    };
  }
}