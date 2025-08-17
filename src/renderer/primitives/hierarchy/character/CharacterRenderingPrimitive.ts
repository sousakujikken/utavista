/**
 * CharacterRenderingPrimitive - キャラクターレベルテキスト描画プリミティブ
 * ✅ 許可: text_rendering, individual_animation, effects のみ（唯一のテキスト描画許可階層）
 * ❌ 禁止: word_management, phrase_control
 * 
 * 参照: development-directive-final.md#4.1, responsibility-separation-detailed-design.md#4.1
 */

import * as PIXI from 'pixi.js';
import { IPrimitive, PrimitiveExecutionData, PrimitiveResult, ResponsibilityCategory } from '../../PrimitiveAPIManager';
import { HierarchyType } from '../../../types/types';

export interface CharacterRenderData {
  character: string;                  // 描画する文字
  style: PIXI.TextStyle | any;       // テキストスタイル
  effects?: CharacterEffect[];       // 個別エフェクト
  animation?: CharacterAnimation;     // 個別アニメーション
  anchor?: { x: number; y: number }; // アンカーポイント
  updateExisting?: boolean;           // 既存テキスト更新フラグ
}

export interface CharacterEffect {
  type: 'glow' | 'shadow' | 'outline' | 'blur';
  strength: number;
  color?: string;
  offset?: { x: number; y: number };
  animated?: boolean;
}

export interface CharacterAnimation {
  type: 'bounce' | 'rotate' | 'scale' | 'pulse';
  duration: number;
  delay?: number;
  repeat?: boolean;
  easing?: string;
}

/**
 * キャラクターレベルテキスト描画・エフェクト制御
 * 唯一テキスト作成・描画が許可された階層
 */
export class CharacterRenderingPrimitive implements IPrimitive {
  readonly name = 'CharacterRendering';
  readonly allowedLevels: HierarchyType[] = ['character'];
  readonly responsibilityCategory: ResponsibilityCategory = 'text_rendering';

  /**
   * キャラクター描画実行
   * responsibility-separation-detailed-design.md#4.1 準拠
   */
  async execute(data: PrimitiveExecutionData): Promise<PrimitiveResult> {
    const startTime = performance.now();
    const modifications: any[] = [];
    const errors: string[] = [];

    try {
      // 1. 責任分離事前チェック
      if (data.level !== 'character') {
        throw new Error('CharacterRenderingPrimitive can only be used at character level');
      }

      // 2. 入力データ検証
      const renderData = this.validateRenderData(data.params as CharacterRenderData);

      // 3. ✅ 許可された操作: text_rendering のみ実行
      const textObject = await this.renderText(data.container, renderData, modifications);

      // 4. ✅ 許可された操作: individual_animation 実行
      if (renderData.animation) {
        await this.applyAnimation(textObject, renderData.animation);
      }

      // 5. ✅ 許可された操作: effects 実行
      if (renderData.effects && renderData.effects.length > 0) {
        await this.applyEffects(textObject, renderData.effects);
      }

      // 6. コンテナの更新
      data.container.updateTransform();

      return {
        success: true,
        level: 'character',
        modifications,
        performance: {
          executionTime: performance.now() - startTime,
          memoryUsed: 0
        }
      };

    } catch (error) {
      errors.push(`CharacterRendering error: ${error}`);
      
      return {
        success: false,
        level: 'character',
        modifications,
        errors,
        performance: {
          executionTime: performance.now() - startTime,
          memoryUsed: 0
        }
      };
    }
  }

  /**
   * 描画データ検証
   */
  private validateRenderData(data: any): CharacterRenderData {
    if (!data.character || typeof data.character !== 'string') {
      throw new Error('Invalid render data: character must be a non-empty string');
    }

    if (!data.style) {
      throw new Error('Invalid render data: style is required');
    }

    return {
      character: data.character,
      style: data.style,
      effects: data.effects || [],
      animation: data.animation,
      anchor: data.anchor || { x: 0.5, y: 0.5 },
      updateExisting: data.updateExisting || false
    };
  }

  /**
   * テキスト描画実行（唯一のテキスト作成許可場所）
   */
  private async renderText(
    container: PIXI.Container,
    renderData: CharacterRenderData,
    modifications: any[]
  ): Promise<PIXI.Text> {
    let textObject: PIXI.Text;
    const oldState = { exists: false, text: '', style: null };

    // 既存のテキストオブジェクトをチェック
    const existingText = container.children.find(child => child instanceof PIXI.Text) as PIXI.Text;

    if (existingText && renderData.updateExisting) {
      // 既存テキスト更新
      oldState.exists = true;
      oldState.text = existingText.text;
      oldState.style = existingText.style;

      existingText.text = renderData.character;
      existingText.style = renderData.style;
      textObject = existingText;
      
      modifications.push({
        type: 'text' as const,
        target: 'self' as const,
        oldValue: oldState,
        newValue: { text: renderData.character, style: renderData.style },
        timestamp: Date.now()
      });

    } else {
      // ✅ 新規テキスト作成（ここだけOK！）
      textObject = new PIXI.Text(renderData.character, renderData.style);
      container.addChild(textObject);

      modifications.push({
        type: 'text' as const,
        target: 'self' as const,
        oldValue: oldState,
        newValue: { text: renderData.character, style: renderData.style, created: true },
        timestamp: Date.now()
      });
    }

    // アンカー設定
    textObject.anchor.set(renderData.anchor.x, renderData.anchor.y);

    // メタデータ設定
    (textObject as any).characterInfo = {
      character: renderData.character,
      renderTime: Date.now(),
      primitiveRendered: true
    };

    return textObject;
  }

  /**
   * 個別アニメーション適用
   */
  private async applyAnimation(
    textObject: PIXI.Text,
    animation: CharacterAnimation
  ): Promise<void> {
    if (animation.delay && animation.delay > 0) {
      await this.delay(animation.delay);
    }

    switch (animation.type) {
      case 'bounce':
        await this.bounceAnimation(textObject, animation);
        break;
      case 'rotate':
        await this.rotateAnimation(textObject, animation);
        break;
      case 'scale':
        await this.scaleAnimation(textObject, animation);
        break;
      case 'pulse':
        await this.pulseAnimation(textObject, animation);
        break;
    }
  }

  /**
   * バウンスアニメーション
   */
  private async bounceAnimation(textObject: PIXI.Text, animation: CharacterAnimation): Promise<void> {
    const originalY = textObject.position.y;
    const bounceHeight = 20;
    const duration = animation.duration;
    const startTime = performance.now();

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = (elapsed / duration) % 1;
        
        // バウンス曲線
        const bounce = Math.abs(Math.sin(progress * Math.PI * 2)) * bounceHeight;
        textObject.position.y = originalY - bounce;

        if (elapsed < duration || animation.repeat) {
          requestAnimationFrame(animate);
        } else {
          textObject.position.y = originalY;
          resolve();
        }
      };
      animate();
    });
  }

  /**
   * 回転アニメーション
   */
  private async rotateAnimation(textObject: PIXI.Text, animation: CharacterAnimation): Promise<void> {
    const duration = animation.duration;
    const startTime = performance.now();

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = elapsed / duration;
        
        textObject.rotation = progress * Math.PI * 2;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          if (!animation.repeat) textObject.rotation = 0;
          resolve();
        }
      };
      animate();
    });
  }

  /**
   * スケールアニメーション
   */
  private async scaleAnimation(textObject: PIXI.Text, animation: CharacterAnimation): Promise<void> {
    const originalScale = { x: textObject.scale.x, y: textObject.scale.y };
    const maxScale = 1.2;
    const duration = animation.duration;
    const startTime = performance.now();

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = elapsed / duration;
        
        const scale = 1 + Math.sin(progress * Math.PI) * (maxScale - 1);
        textObject.scale.set(scale, scale);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          textObject.scale.set(originalScale.x, originalScale.y);
          resolve();
        }
      };
      animate();
    });
  }

  /**
   * パルスアニメーション
   */
  private async pulseAnimation(textObject: PIXI.Text, animation: CharacterAnimation): Promise<void> {
    const originalAlpha = textObject.alpha;
    const minAlpha = 0.3;
    const duration = animation.duration;
    const startTime = performance.now();

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = (elapsed / duration) % 1;
        
        textObject.alpha = minAlpha + (originalAlpha - minAlpha) * (0.5 + 0.5 * Math.cos(progress * Math.PI * 2));

        if (elapsed < duration || animation.repeat) {
          requestAnimationFrame(animate);
        } else {
          textObject.alpha = originalAlpha;
          resolve();
        }
      };
      animate();
    });
  }

  /**
   * エフェクト適用
   */
  private async applyEffects(textObject: PIXI.Text, effects: CharacterEffect[]): Promise<void> {
    const filters: PIXI.Filter[] = [];

    effects.forEach(effect => {
      switch (effect.type) {
        case 'glow':
          // グローエフェクト（簡易版）
          textObject.style.dropShadow = true;
          textObject.style.dropShadowColor = effect.color || '#ffff00';
          textObject.style.dropShadowBlur = effect.strength * 3;
          textObject.style.dropShadowDistance = 0;
          break;

        case 'shadow':
          // シャドウエフェクト
          textObject.style.dropShadow = true;
          textObject.style.dropShadowColor = effect.color || '#000000';
          textObject.style.dropShadowBlur = effect.strength;
          textObject.style.dropShadowDistance = effect.strength * 2;
          textObject.style.dropShadowAngle = effect.offset ? 
            Math.atan2(effect.offset.y, effect.offset.x) : Math.PI / 4;
          break;

        case 'outline':
          // アウトラインエフェクト
          textObject.style.stroke = effect.color || '#000000';
          textObject.style.strokeThickness = effect.strength;
          break;
      }
    });
  }

  /**
   * 遅延実行
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 事前検証（オプション）
   */
  validate(data: PrimitiveExecutionData): any {
    const violations: any[] = [];

    // レベル適合性チェック
    if (data.level !== 'character') {
      violations.push({
        rule: 'wrong_level',
        level: data.level,
        description: 'CharacterRenderingPrimitive requires character level',
        severity: 'error' as const
      });
    }

    // 文字データチェック
    if (!data.params || !data.params.character || typeof data.params.character !== 'string') {
      violations.push({
        rule: 'invalid_character',
        level: data.level,
        description: 'Valid character string required',
        severity: 'error' as const
      });
    }

    // スタイルデータチェック
    if (!data.params || !data.params.style) {
      violations.push({
        rule: 'missing_style',
        level: data.level,
        description: 'Text style is required for rendering',
        severity: 'error' as const
      });
    }

    return {
      isValid: violations.length === 0,
      violations,
      level: data.level,
      checkedRules: 3,
      passedRules: 3 - violations.length
    };
  }
}