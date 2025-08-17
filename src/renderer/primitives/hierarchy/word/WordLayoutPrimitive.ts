/**
 * WordLayoutPrimitive - ワードレベル文字レイアウト制御プリミティブ
 * ✅ 許可: character_management, spacing, grouping のみ
 * ❌ 禁止: text_rendering, phrase_control
 * 
 * 参照: development-directive-final.md#4.1, responsibility-separation-detailed-design.md#3.1
 */

import * as PIXI from 'pixi.js';
import { IPrimitive, PrimitiveExecutionData, PrimitiveResult, ResponsibilityCategory } from '../../PrimitiveAPIManager';
import { HierarchyType } from '../../../types/types';

export interface WordLayoutData {
  spacing: number;                    // 文字間隔
  alignment: 'left' | 'center' | 'right'; // 文字配置
  verticalAlign: 'top' | 'middle' | 'bottom'; // 縦配置
  characterOrder?: number[];          // 文字表示順序
  groupSpacing?: number;              // グループ間隔
  kerning?: Record<string, number>;   // 文字ペア間隔調整
  animated?: boolean;                 // アニメーション配置
  animationDelay?: number;            // 文字間アニメーション遅延
}

/**
 * ワードレベル文字レイアウト制御
 * 文字コンテナの配置管理のみを担当（テキスト描画は禁止）
 */
export class WordLayoutPrimitive implements IPrimitive {
  readonly name = 'WordLayout';
  readonly allowedLevels: HierarchyType[] = ['word'];
  readonly responsibilityCategory: ResponsibilityCategory = 'character_management';

  /**
   * ワード文字レイアウト実行
   * responsibility-separation-detailed-design.md#3.1 準拠
   */
  async execute(data: PrimitiveExecutionData): Promise<PrimitiveResult> {
    const startTime = performance.now();
    const modifications: any[] = [];
    const errors: string[] = [];

    try {
      // 1. 責任分離事前チェック
      if (data.level !== 'word') {
        throw new Error('WordLayoutPrimitive can only be used at word level');
      }

      // 2. 入力データ検証
      const layoutData = this.validateLayoutData(data.params as WordLayoutData);

      // 3. ✅ 許可された操作: character_management のみ
      // 文字コンテナの取得（テキスト作成はしない）
      const characterContainers = this.getCharacterContainers(data.container);

      if (characterContainers.length === 0) {
        throw new Error('No character containers found for layout');
      }

      // 4. 文字配置計算・実行
      const positionChanges = await this.layoutCharacters(
        characterContainers, 
        layoutData
      );

      // 5. 変更記録
      modifications.push(...positionChanges);

      // 6. グループ情報設定（grouping 責任）
      this.setGroupingInfo(characterContainers, data.container);

      // 7. ワードコンテナの更新
      data.container.updateTransform();

      return {
        success: true,
        level: 'word',
        modifications,
        performance: {
          executionTime: performance.now() - startTime,
          memoryUsed: 0
        }
      };

    } catch (error) {
      errors.push(`WordLayout error: ${error}`);
      
      return {
        success: false,
        level: 'word',
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
   * レイアウトデータ検証
   */
  private validateLayoutData(data: any): WordLayoutData {
    if (typeof data.spacing !== 'number') {
      throw new Error('Invalid layout data: spacing must be a number');
    }

    return {
      spacing: data.spacing,
      alignment: data.alignment || 'left',
      verticalAlign: data.verticalAlign || 'middle',
      characterOrder: data.characterOrder,
      groupSpacing: data.groupSpacing || data.spacing,
      kerning: data.kerning || {},
      animated: data.animated || false,
      animationDelay: data.animationDelay || 50
    };
  }

  /**
   * 文字コンテナ取得（テキスト作成はしない）
   */
  private getCharacterContainers(wordContainer: PIXI.Container): PIXI.Container[] {
    return wordContainer.children
      .filter(child => child instanceof PIXI.Container) as PIXI.Container[];
  }

  /**
   * 文字配置実行
   */
  private async layoutCharacters(
    characterContainers: PIXI.Container[],
    layoutData: WordLayoutData
  ): Promise<any[]> {
    const modifications: any[] = [];
    
    // 表示順序決定
    const displayOrder = layoutData.characterOrder || 
      Array.from({ length: characterContainers.length }, (_, i) => i);

    // 配置計算
    let currentX = 0;
    const positions: { container: PIXI.Container; x: number; y: number }[] = [];

    for (let i = 0; i < displayOrder.length; i++) {
      const containerIndex = displayOrder[i];
      const container = characterContainers[containerIndex];
      
      if (!container) continue;

      // カーニング適用
      const prevChar = i > 0 ? characterContainers[displayOrder[i - 1]] : null;
      const kerningAdjustment = this.calculateKerning(
        prevChar, 
        container, 
        layoutData.kerning || {}
      );

      currentX += kerningAdjustment;

      // 縦配置計算
      const y = this.calculateVerticalPosition(layoutData.verticalAlign);

      positions.push({ container, x: currentX, y });

      // 次の位置計算
      currentX += layoutData.spacing + (layoutData.groupSpacing || 0);
    }

    // 水平配置調整
    this.adjustHorizontalAlignment(positions, layoutData.alignment);

    // 実際の配置実行
    if (layoutData.animated) {
      await this.animatePositions(positions, layoutData.animationDelay || 50);
    } else {
      positions.forEach(({ container, x, y }) => {
        const oldPos = { x: container.position.x, y: container.position.y };
        container.position.set(x, y);
        container.updateTransform();

        modifications.push({
          type: 'position' as const,
          target: 'specific_child' as const,
          targetId: (container as any).name || `char_${positions.indexOf({ container, x, y })}`,
          oldValue: oldPos,
          newValue: { x, y },
          timestamp: Date.now()
        });
      });
    }

    return modifications;
  }

  /**
   * カーニング計算
   */
  private calculateKerning(
    prevContainer: PIXI.Container | null,
    currentContainer: PIXI.Container,
    kerning: Record<string, number>
  ): number {
    if (!prevContainer) return 0;

    const prevName = (prevContainer as any).name || '';
    const currentName = (currentContainer as any).name || '';
    const pair = `${prevName}_${currentName}`;

    return kerning[pair] || 0;
  }

  /**
   * 縦配置計算
   */
  private calculateVerticalPosition(alignment: string): number {
    switch (alignment) {
      case 'top':
        return 0;
      case 'bottom':
        return -20; // 仮の値、実際の文字高さに基づく
      case 'middle':
      default:
        return -10; // 中央配置
    }
  }

  /**
   * 水平配置調整
   */
  private adjustHorizontalAlignment(
    positions: { container: PIXI.Container; x: number; y: number }[],
    alignment: string
  ): void {
    if (alignment === 'left' || positions.length === 0) return;

    const totalWidth = positions[positions.length - 1].x;
    let offset = 0;

    switch (alignment) {
      case 'center':
        offset = -totalWidth / 2;
        break;
      case 'right':
        offset = -totalWidth;
        break;
    }

    positions.forEach(pos => {
      pos.x += offset;
    });
  }

  /**
   * アニメーション配置
   */
  private async animatePositions(
    positions: { container: PIXI.Container; x: number; y: number }[],
    delay: number
  ): Promise<void> {
    const animations = positions.map((pos, index) => 
      new Promise<void>(resolve => {
        setTimeout(() => {
          const startPos = { x: pos.container.position.x, y: pos.container.position.y };
          const targetPos = { x: pos.x, y: pos.y };
          
          this.animatePosition(pos.container, startPos, targetPos, 200).then(resolve);
        }, index * delay);
      })
    );

    await Promise.all(animations);
  }

  /**
   * 単一文字位置アニメーション
   */
  private async animatePosition(
    container: PIXI.Container,
    start: { x: number; y: number },
    target: { x: number; y: number },
    duration: number
  ): Promise<void> {
    return new Promise(resolve => {
      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        container.position.x = start.x + (target.x - start.x) * eased;
        container.position.y = start.y + (target.y - start.y) * eased;
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
   * グループ情報設定（grouping 責任）
   */
  private setGroupingInfo(
    characterContainers: PIXI.Container[],
    wordContainer: PIXI.Container
  ): void {
    characterContainers.forEach((container, index) => {
      // ワードグループ情報設定（メタデータのみ）
      (container as any).wordGroupInfo = {
        wordContainer: wordContainer,
        characterIndex: index,
        totalCharacters: characterContainers.length
      };
    });
  }

  /**
   * 事前検証（オプション）
   */
  validate(data: PrimitiveExecutionData): any {
    const violations: any[] = [];

    // レベル適合性チェック
    if (data.level !== 'word') {
      violations.push({
        rule: 'wrong_level',
        level: data.level,
        description: 'WordLayoutPrimitive requires word level',
        severity: 'error' as const
      });
    }

    // 間隔データチェック
    if (!data.params || typeof data.params.spacing !== 'number') {
      violations.push({
        rule: 'invalid_spacing',
        level: data.level,
        description: 'Valid spacing value required',
        severity: 'error' as const
      });
    }

    // 文字コンテナ存在チェック
    const characterContainers = this.getCharacterContainers(data.container);
    if (characterContainers.length === 0) {
      violations.push({
        rule: 'no_character_containers',
        level: data.level,
        description: 'Word container must have character containers',
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