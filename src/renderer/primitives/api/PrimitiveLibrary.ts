/**
 * プリミティブライブラリファクトリ
 * LLMテンプレート生成用の統合インターフェース
 */

import * as PIXI from 'pixi.js';
import { CumulativeLayoutPrimitive } from '../layout/CumulativeLayoutPrimitive';
import { SlideAnimationPrimitive } from '../animation/SlideAnimationPrimitive';
import { GlowEffectPrimitive } from '../effects/GlowEffectPrimitive';
import { IntentBasedAPI, Direction, RevealOrder, EffectIntensity } from './IntentBasedAPI';

/**
 * レイアウトプリミティブの名前空間
 * 累積配置、グリッド配置等の基盤
 */
export const layout = {
  /**
   * 累積文字配置
   * WordSlideTextの成功パターンを継承
   */
  arrangeCumulative: (
    text: string,
    params: {
      fontSize: number;
      charSpacing: number;
      alignment?: 'left' | 'center' | 'right';
      halfWidthRatio?: number;
    }
  ) => {
    const primitive = new CumulativeLayoutPrimitive();
    
    const chars = Array.from(text);
    const items = chars.map((char, index) => ({
      id: `char_${index}`,
      content: char,
      size: { width: params.fontSize * params.charSpacing, height: params.fontSize }
    }));
    
    const layoutParams = {
      spacing: params.charSpacing,
      alignment: params.alignment || 'left',
      containerSize: { width: 0, height: 0 },
      charSpacing: params.charSpacing,
      fontSize: params.fontSize,
      halfWidthSpacingRatio: params.halfWidthRatio || 0.6
    };
    
    return primitive.calculateLayout(items, layoutParams);
  },
  
  /**
   * グリッド配置
   * 将来的な拡張用
   */
  arrangeGrid: (
    items: Array<{ id: string; content: string }>,
    grid: { columns: number; rows: number; spacing: number }
  ) => {
    // 基本的なグリッド配置の実装
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / grid.columns);
      const col = i % grid.columns;
      results.push({
        id: items[i].id,
        position: {
          x: col * grid.spacing,
          y: row * grid.spacing
        }
      });
    }
    return results;
  },
  
  /**
   * 円形配置
   * 将来的な拡張用
   */
  arrangeCircular: (
    items: Array<{ id: string; content: string }>,
    radius: number
  ) => {
    const results = [];
    const angleStep = (2 * Math.PI) / items.length;
    
    for (let i = 0; i < items.length; i++) {
      const angle = i * angleStep;
      results.push({
        id: items[i].id,
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        }
      });
    }
    return results;
  }
};

/**
 * アニメーションプリミティブの名前空間
 * 物理ベースアニメーション
 */
export const animation = {
  /**
   * 方向別スライドアニメーション
   * 物理計算ベース
   */
  slideFromDirection: (
    direction: Direction,
    physics: {
      initialSpeed?: number;
      finalSpeed?: number;
      distance?: number;
      duration?: number;
    }
  ) => {
    const primitive = new SlideAnimationPrimitive();
    
    return {
      execute: (container: PIXI.Container, params: { nowMs: number; startMs: number }) => {
        return primitive.executeSlideFromDirection(container, direction, {
          initialSpeed: physics.initialSpeed || 4.0,
          finalSpeed: physics.finalSpeed || 0.1,
          initialOffset: physics.distance || 100,
          headTime: physics.duration || 500,
          nowMs: params.nowMs,
          startMs: params.startMs
        });
      }
    };
  },
  
  /**
   * 順次表示アニメーション
   * 順序制御付き
   */
  revealSequentially: (
    order: RevealOrder,
    timing: { delay: number; stagger: number }
  ) => {
    return {
      execute: (text: string, startMs: number) => {
        const chars = Array.from(text);
        let orderedChars = [...chars];
        
        if (order === 'right-to-left') {
          orderedChars = orderedChars.reverse();
        } else if (order === 'random') {
          // Fisher-Yates shuffle
          for (let i = orderedChars.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [orderedChars[i], orderedChars[j]] = [orderedChars[j], orderedChars[i]];
          }
        }
        
        return orderedChars.map((char, index) => ({
          char,
          startMs: startMs + timing.delay + (index * timing.stagger),
          endMs: startMs + timing.delay + (index * timing.stagger) + 1000
        }));
      }
    };
  },
  
  /**
   * フェードイン・アウト
   * イージング制御付き
   */
  fadeInOut: (
    duration: number,
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  ) => {
    return {
      execute: (container: PIXI.Container, progress: number) => {
        let alpha = 1.0;
        
        switch (easing) {
          case 'linear':
            alpha = progress;
            break;
          case 'ease-in':
            alpha = progress * progress;
            break;
          case 'ease-out':
            alpha = 1 - Math.pow(1 - progress, 2);
            break;
          case 'ease-in-out':
            alpha = progress < 0.5 
              ? 2 * progress * progress 
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            break;
        }
        
        container.alpha = alpha;
        container.visible = alpha > 0;
        
        return { alpha, visible: alpha > 0 };
      }
    };
  }
};

/**
 * エフェクトプリミティブの名前空間
 * PIXI.js直接制御
 */
export const effects = {
  /**
   * グロー効果
   * 強度制御付き
   */
  applyGlow: (
    intensity: EffectIntensity,
    color?: string
  ) => {
    const primitive = new GlowEffectPrimitive();
    
    return {
      execute: (container: PIXI.Container) => {
        const intensityMap = {
          'subtle': { strength: 0.8, brightness: 1.0, blur: 4, padding: 30 },
          'normal': { strength: 1.5, brightness: 1.2, blur: 6, padding: 50 },
          'dramatic': { strength: 2.5, brightness: 1.5, blur: 10, padding: 80 }
        };
        
        const settings = intensityMap[intensity];
        
        primitive.applyEffect(container, {
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
        });
        
        return primitive.getDebugInfo(container);
      }
    };
  },
  
  /**
   * シャドウ効果
   * 方向・距離制御付き
   */
  applyShadow: (
    offset: { x: number; y: number },
    blur: number,
    color?: string
  ) => {
    const primitive = new GlowEffectPrimitive();
    
    return {
      execute: (container: PIXI.Container) => {
        const distance = Math.sqrt(offset.x * offset.x + offset.y * offset.y);
        const angle = Math.atan2(offset.y, offset.x) * (180 / Math.PI);
        
        primitive.applyEffect(container, {
          enableGlow: false,
          enableShadow: true,
          blendMode: 'normal',
          shadow: {
            intensity: 1.0,
            shadowBlur: blur,
            shadowColor: color || '#000000',
            shadowAngle: angle,
            shadowDistance: distance,
            shadowAlpha: 0.8,
            shadowOnly: false
          }
        });
        
        return primitive.getDebugInfo(container);
      }
    };
  },
  
  /**
   * ディストーション効果
   * 将来的な拡張用（プレースホルダー）
   */
  applyDistortion: (
    type: 'wave' | 'twist' | 'bulge',
    amount: number
  ) => {
    return {
      execute: (container: PIXI.Container) => {
        // TODO: ディストーション効果の実装
        console.warn(`Distortion effect '${type}' not yet implemented`);
        return { applied: false, type, amount };
      }
    };
  }
};

/**
 * プリミティブライブラリの統合名前空間
 * LLM生成コードで使用される主要インターフェース
 */
export const PrimitiveLibrary = {
  layout,
  animation,
  effects,
  
  /**
   * 意図ベースAPIのインスタンス取得
   */
  getIntentAPI: () => new IntentBasedAPI(),
  
  /**
   * プリミティブの一括実行
   * 複数のプリミティブを協調的に組み合わせ
   */
  executeComposite: (
    container: PIXI.Container,
    text: string,
    operations: Array<{
      type: 'layout' | 'animation' | 'effect';
      primitive: string;
      params: Record<string, unknown>;
    }>,
    context: {
      nowMs: number;
      startMs: number;
      endMs: number;
    }
  ) => {
    const results: Array<{ type: string; primitive: string; result: unknown }> = [];
    
    for (const operation of operations) {
      try {
        let result;
        
        switch (operation.type) {
          case 'layout':
            if (operation.primitive === 'cumulative') {
              result = layout.arrangeCumulative(text, operation.params as any);
            }
            break;
            
          case 'animation':
            if (operation.primitive === 'slide') {
              const slideAnim = animation.slideFromDirection(
                operation.params.direction as Direction,
                operation.params as any
              );
              result = slideAnim.execute(container, context);
            }
            break;
            
          case 'effect':
            if (operation.primitive === 'glow') {
              const glowEffect = effects.applyGlow(
                operation.params.intensity as EffectIntensity,
                operation.params.color as string
              );
              result = glowEffect.execute(container);
            }
            break;
        }
        
        results.push({
          type: operation.type,
          primitive: operation.primitive,
          result
        });
        
      } catch (error) {
        results.push({
          type: operation.type,
          primitive: operation.primitive,
          result: { error: error.toString() }
        });
      }
    }
    
    return results;
  }
};

export default PrimitiveLibrary;