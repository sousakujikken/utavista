/**
 * PhrasePositioningPrimitive - フレーズレベル配置制御プリミティブ
 * ✅ 許可: positioning のみ
 * ❌ 禁止: text_rendering, character_control
 * 
 * 参照: development-directive-final.md#4.1, responsibility-separation-detailed-design.md#2.1
 */

import * as PIXI from 'pixi.js';
import { IPrimitive, PrimitiveExecutionData, PrimitiveResult, ResponsibilityCategory } from '../../PrimitiveAPIManager';
import { HierarchyType } from '../../../types/types';
import { getLogicalStageSize } from '../../../utils/StageUtils';

export interface PhrasePositionData {
  x: number;
  y: number;
  centerX?: number;        // 画面中央X座標
  centerY?: number;        // 画面中央Y座標
  offsetX?: number;        // オフセットX
  offsetY?: number;        // オフセットY
  animated?: boolean;      // アニメーション有効フラグ
  animationDuration?: number; // アニメーション時間
}

/**
 * フレーズレベル配置制御（UTAVISTA v0.4.3標準仕様準拠）
 * 画面中央を基準とした配置制御のみを担当
 */
export class PhrasePositioningPrimitive implements IPrimitive {
  readonly name = 'PhrasePositioning';
  readonly allowedLevels: HierarchyType[] = ['phrase'];
  readonly responsibilityCategory: ResponsibilityCategory = 'positioning';

  /**
   * フレーズ配置実行
   * responsibility-separation-detailed-design.md#2.1 準拠
   */
  async execute(data: PrimitiveExecutionData): Promise<PrimitiveResult> {
    const startTime = performance.now();
    const modifications: any[] = [];
    const errors: string[] = [];

    try {
      // 1. 責任分離事前チェック
      if (data.level !== 'phrase') {
        throw new Error('PhrasePositioningPrimitive can only be used at phrase level');
      }

      // 2. 入力データ検証
      const positionData = this.validatePositionData(data.params as PhrasePositionData);

      // 3. 画面中央基準配置計算（UTAVISTA v0.4.3標準）
      const targetPosition = this.calculateScreenCenteredPosition(positionData, data);

      // 4. 現在位置記録
      const oldPosition = {
        x: data.container.position.x,
        y: data.container.position.y
      };

      // 5. ✅ 許可された操作: positioning のみ実行
      if (positionData.animated) {
        await this.animatedPositioning(data.container, targetPosition, positionData.animationDuration || 300);
      } else {
        data.container.position.set(targetPosition.x, targetPosition.y);
      }

      // 6. 変更記録
      modifications.push({
        type: 'position' as const,
        target: 'self' as const,
        oldValue: oldPosition,
        newValue: targetPosition,
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
      errors.push(`PhrasePositioning error: ${error}`);
      
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
   * 位置データ検証
   */
  private validatePositionData(data: any): PhrasePositionData {
    if (typeof data.x !== 'number' || typeof data.y !== 'number') {
      throw new Error('Invalid position data: x and y must be numbers');
    }

    return {
      x: data.x,
      y: data.y,
      centerX: data.centerX,
      centerY: data.centerY,
      offsetX: data.offsetX || 0,
      offsetY: data.offsetY || 0,
      animated: data.animated || false,
      animationDuration: data.animationDuration || 300
    };
  }

  /**
   * 画面中央基準配置計算（UTAVISTA v0.4.3標準仕様）
   */
  private calculateScreenCenteredPosition(
    positionData: PhrasePositionData,
    executionData: PrimitiveExecutionData
  ): { x: number; y: number } {
    // 画面サイズ取得
    const { width: screenWidth, height: screenHeight } = getLogicalStageSize();
    const actualCenterX = positionData.centerX || screenWidth / 2;
    const actualCenterY = positionData.centerY || screenHeight / 2;

    // 中央座標計算 (actualCenterを使用)
    const centerX = actualCenterX;
    const centerY = actualCenterY;

    // オフセット適用
    return {
      x: centerX + positionData.offsetX + (positionData.x - centerX),
      y: centerY + positionData.offsetY + (positionData.y - centerY)
    };
  }

  /**
   * アニメーション配置
   */
  private async animatedPositioning(
    container: PIXI.Container,
    targetPosition: { x: number; y: number },
    duration: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const startPosition = { x: container.position.x, y: container.position.y };
      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // イージング（ease-out）
        const eased = 1 - Math.pow(1 - progress, 3);

        // 補間位置計算
        container.position.x = startPosition.x + (targetPosition.x - startPosition.x) * eased;
        container.position.y = startPosition.y + (targetPosition.y - startPosition.y) * eased;

        container.updateTransform();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
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
        description: 'PhrasePositioningPrimitive requires phrase level',
        severity: 'error' as const
      });
    }

    // 位置データ存在チェック
    if (!data.params || typeof data.params.x !== 'number' || typeof data.params.y !== 'number') {
      violations.push({
        rule: 'invalid_position_data',
        level: data.level,
        description: 'Valid x and y coordinates required',
        severity: 'error' as const
      });
    }

    return {
      isValid: violations.length === 0,
      violations,
      level: data.level,
      checkedRules: 2,
      passedRules: 2 - violations.length
    };
  }
}