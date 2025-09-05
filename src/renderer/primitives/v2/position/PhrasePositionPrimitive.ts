/**
 * フレーズ位置計算プリミティブ v2.0
 * 責任範囲: フレーズレベルの位置計算専用
 */

import { BasePrimitive, Position, PhrasePositionParams, RandomPlacementParams, HierarchyType } from '../types';
import { getLogicalStageSize } from '../../utils/StageUtils';

export class PhrasePositionPrimitive implements BasePrimitive {
  readonly name = 'PhrasePosition';
  readonly version = '2.0.0';
  readonly supportedHierarchy: HierarchyType = 'phrase';

  /**
   * 静的フレーズ位置を計算
   * 用途: フェード・ブラー系テンプレート
   */
  calculateStatic(params: PhrasePositionParams): Position {
    const screenWidth = this.getScreenWidth();
    const screenHeight = this.getScreenHeight();

    return {
      x: screenWidth / 2 + params.phraseOffsetX,
      y: screenHeight / 2 + params.phraseOffsetY,
      alpha: this.calculateFadeAlpha(params)
    };
  }

  /**
   * スライド配置位置を計算
   * 用途: スライドアニメーション系テンプレート
   */
  calculateSlide(params: PhrasePositionParams): Position {
    const staticPosition = this.calculateStatic(params);
    const slideOffset = this.calculateSlideOffset(params);

    return {
      x: staticPosition.x + slideOffset.x,
      y: staticPosition.y + slideOffset.y,
      alpha: staticPosition.alpha
    };
  }

  /**
   * ランダム配置位置を計算
   * 用途: ランダム配置系テンプレート
   */
  calculateRandom(params: RandomPlacementParams): Position {
    const basePosition = this.calculateStatic(params);
    
    if (!params.randomPlacement) {
      return basePosition;
    }

    const randomOffset = this.generateRandomOffset(params);

    return {
      x: basePosition.x + randomOffset.x,
      y: basePosition.y + randomOffset.y,
      alpha: basePosition.alpha
    };
  }

  /**
   * フレーズレベルのフェードアウト計算
   */
  private calculateFadeAlpha(params: PhrasePositionParams): number {
    const fadeOutStartTime = params.endMs;
    const fadeOutEndTime = params.endMs + params.tailTime;

    if (params.nowMs > fadeOutEndTime) return 0;
    if (params.nowMs < fadeOutStartTime) return 1;

    const progress = (params.nowMs - fadeOutStartTime) / params.tailTime;
    return Math.max(0, 1 - progress);
  }

  /**
   * スライドオフセット計算
   */
  private calculateSlideOffset(params: PhrasePositionParams): Position {
    const slideProgress = this.calculateSlideProgress(params);
    const slideDirection = this.getSlideDirection(params);
    const slideDistance = this.getSlideDistance(params);

    return {
      x: slideDirection.x * slideDistance * (1 - slideProgress),
      y: slideDirection.y * slideDistance * (1 - slideProgress),
      alpha: 1
    };
  }

  /**
   * スライド進行度計算
   */
  private calculateSlideProgress(params: PhrasePositionParams): number {
    const slideStartTime = params.startMs - params.headTime;
    const slideEndTime = params.startMs;

    if (params.nowMs <= slideStartTime) return 0;
    if (params.nowMs >= slideEndTime) return 1;

    const progress = (params.nowMs - slideStartTime) / params.headTime;
    return this.easeOutCubic(progress);
  }

  /**
   * ランダムオフセット生成
   */
  private generateRandomOffset(params: RandomPlacementParams): Position {
    const random = this.createSeededRandom(params.randomSeed + params.phraseId.length);
    
    const offsetX = (random.next() - 0.5) * params.randomRangeX;
    const offsetY = (random.next() - 0.5) * params.randomRangeY;

    return { x: offsetX, y: offsetY, alpha: 1 };
  }

  /**
   * スライド方向取得
   */
  private getSlideDirection(params: PhrasePositionParams): Position {
    const slideDirection = (params.params.slideDirection as string) || 'left';
    
    switch (slideDirection) {
      case 'left': return { x: -1, y: 0 };
      case 'right': return { x: 1, y: 0 };
      case 'up': return { x: 0, y: -1 };
      case 'down': return { x: 0, y: 1 };
      default: return { x: -1, y: 0 };
    }
  }

  /**
   * スライド距離取得
   */
  private getSlideDistance(params: PhrasePositionParams): number {
    return (params.params.slideDistance as number) || this.getScreenWidth() * 0.5;
  }

  /**
   * イージング関数: EaseOutCubic
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * シード付き乱数生成器
   */
  private createSeededRandom(seed: number) {
    let current = seed;
    return {
      next: () => {
        current = (current * 9301 + 49297) % 233280;
        return current / 233280;
      }
    };
  }

  /**
   * 画面幅取得
   */
  private getScreenWidth(): number {
    return getLogicalStageSize().width;
  }

  /**
   * 画面高さ取得
   */
  private getScreenHeight(): number {
    return getLogicalStageSize().height;
  }
}