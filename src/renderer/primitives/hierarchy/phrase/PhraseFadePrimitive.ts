/**
 * PhraseFadePrimitive - フレーズレベルフェード制御プリミティブ
 * ✅ 許可: fade のみ
 * ❌ 禁止: text_rendering, character_control
 * 
 * 参照: development-directive-final.md#4.1, responsibility-separation-detailed-design.md#2.1
 */

import * as PIXI from 'pixi.js';
import { IPrimitive, PrimitiveExecutionData, PrimitiveResult, ResponsibilityCategory } from '../../PrimitiveAPIManager';
import { HierarchyType } from '../../../types/types';

export interface PhraseFadeData {
  alpha: number;              // 目標透明度（0-1）
  fadeIn?: boolean;           // フェードイン実行フラグ
  fadeOut?: boolean;          // フェードアウト実行フラグ
  duration?: number;          // フェード時間（ms）
  delay?: number;             // 遅延時間（ms）
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  startAlpha?: number;        // 開始透明度（指定時）
}

/**
 * フレーズレベルフェード制御
 * グループ全体の透明度制御のみを担当
 */
export class PhraseFadePrimitive implements IPrimitive {
  readonly name = 'PhraseFade';
  readonly allowedLevels: HierarchyType[] = ['phrase'];
  readonly responsibilityCategory: ResponsibilityCategory = 'fade';

  /**
   * フレーズフェード実行
   * responsibility-separation-detailed-design.md#2.1 準拠
   */
  async execute(data: PrimitiveExecutionData): Promise<PrimitiveResult> {
    const startTime = performance.now();
    const modifications: any[] = [];
    const errors: string[] = [];

    try {
      // 1. 責任分離事前チェック
      if (data.level !== 'phrase') {
        throw new Error('PhraseFadePrimitive can only be used at phrase level');
      }

      // 2. 入力データ検証
      const fadeData = this.validateFadeData(data.params as PhraseFadeData);

      // 3. 現在のアルファ値記録
      const oldAlpha = data.container.alpha;

      // 4. 遅延実行（指定時）
      if (fadeData.delay && fadeData.delay > 0) {
        await this.delay(fadeData.delay);
      }

      // 5. ✅ 許可された操作: fade のみ実行
      if (fadeData.duration && fadeData.duration > 0) {
        await this.animatedFade(data.container, fadeData);
      } else {
        // 即座にフェード
        data.container.alpha = Math.max(0, Math.min(1, fadeData.alpha));
      }

      // 6. 変更記録
      modifications.push({
        type: 'alpha' as const,
        target: 'self' as const,
        oldValue: oldAlpha,
        newValue: data.container.alpha,
        timestamp: Date.now()
      });

      // 7. トランスフォーム更新（必須）
      data.container.updateTransform();

      return {
        success: true,
        level: 'phrase',
        modifications,
        performance: {
          executionTime: performance.now() - startTime,
          memoryUsed: 0
        }
      };

    } catch (error) {
      errors.push(`PhraseFade error: ${error}`);
      
      return {
        success: false,
        level: 'phrase',
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
   * フェードデータ検証
   */
  private validateFadeData(data: any): PhraseFadeData {
    if (typeof data.alpha !== 'number') {
      throw new Error('Invalid fade data: alpha must be a number');
    }

    if (data.alpha < 0 || data.alpha > 1) {
      throw new Error('Invalid fade data: alpha must be between 0 and 1');
    }

    return {
      alpha: data.alpha,
      fadeIn: data.fadeIn || false,
      fadeOut: data.fadeOut || false,
      duration: data.duration || 0,
      delay: data.delay || 0,
      easing: data.easing || 'ease-out',
      startAlpha: data.startAlpha
    };
  }

  /**
   * アニメーションフェード
   */
  private async animatedFade(
    container: PIXI.Container,
    fadeData: PhraseFadeData
  ): Promise<void> {
    return new Promise((resolve) => {
      const startAlpha = fadeData.startAlpha !== undefined 
        ? fadeData.startAlpha 
        : container.alpha;
      const targetAlpha = fadeData.alpha;
      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / (fadeData.duration || 300), 1);

        // イージング適用
        const eased = this.applyEasing(progress, fadeData.easing || 'ease-out');

        // 透明度補間
        container.alpha = startAlpha + (targetAlpha - startAlpha) * eased;

        // アルファ値クランプ
        container.alpha = Math.max(0, Math.min(1, container.alpha));

        container.updateTransform();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // 最終値を保証
          container.alpha = targetAlpha;
          container.updateTransform();
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * イージング関数適用
   */
  private applyEasing(progress: number, easing: string): number {
    switch (easing) {
      case 'linear':
        return progress;
      case 'ease-in':
        return progress * progress;
      case 'ease-out':
        return 1 - Math.pow(1 - progress, 2);
      case 'ease-in-out':
        return progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      default:
        return 1 - Math.pow(1 - progress, 2); // デフォルト: ease-out
    }
  }

  /**
   * 遅延実行
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * フェード種別実行（コンビニエンスメソッド）
   */
  async fadeIn(container: PIXI.Container, duration: number = 300): Promise<void> {
    const data: PrimitiveExecutionData = {
      level: 'phrase',
      layerState: {} as any,
      params: {
        alpha: 1,
        fadeIn: true,
        duration,
        startAlpha: 0
      },
      container
    };

    await this.execute(data);
  }

  async fadeOut(container: PIXI.Container, duration: number = 300): Promise<void> {
    const data: PrimitiveExecutionData = {
      level: 'phrase',
      layerState: {} as any,
      params: {
        alpha: 0,
        fadeOut: true,
        duration,
        startAlpha: container.alpha
      },
      container
    };

    await this.execute(data);
  }

  /**
   * 事前検証（オプション）
   */
  validate(data: PrimitiveExecutionData): any {
    const violations: any[] = [];

    // レベル適合性チェック
    if (data.level !== 'phrase') {
      violations.push({
        rule: 'wrong_level',
        level: data.level,
        description: 'PhraseFadePrimitive requires phrase level',
        severity: 'error' as const
      });
    }

    // アルファ値チェック
    if (!data.params || typeof data.params.alpha !== 'number') {
      violations.push({
        rule: 'invalid_alpha',
        level: data.level,
        description: 'Valid alpha value (0-1) required',
        severity: 'error' as const
      });
    }

    if (data.params && data.params.alpha !== undefined) {
      if (data.params.alpha < 0 || data.params.alpha > 1) {
        violations.push({
          rule: 'alpha_out_of_range',
          level: data.level,
          description: 'Alpha value must be between 0 and 1',
          severity: 'error' as const
        });
      }
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