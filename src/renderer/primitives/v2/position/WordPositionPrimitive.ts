/**
 * 単語位置計算プリミティブ v2.0
 * 責任範囲: 単語レベルの位置計算専用
 */

import { BasePrimitive, Position, WordPositionParams, WordSlideParams, HierarchyType } from '../types';

export class WordPositionPrimitive implements BasePrimitive {
  readonly name = 'WordPosition';
  readonly version = '2.0.0';
  readonly supportedHierarchy: HierarchyType = 'word';

  /**
   * 静的単語位置を計算
   * 用途: フェード・ブラー系、フレーズ同期系
   */
  calculateStatic(params: WordPositionParams): Position {
    // 単語インデックスに基づく垂直配置
    const yOffset = params.wordIndex * params.fontSize * params.lineHeight;

    return {
      x: 0,
      y: yOffset,
      alpha: 1.0
    };
  }

  /**
   * スライドアニメーション位置を計算
   * 用途: スライド系テンプレート
   */
  calculateSlide(params: WordSlideParams): Position {
    const staticPosition = this.calculateStatic(params);
    const slideAnimation = this.calculateSlideAnimation(params);

    return {
      x: slideAnimation.x,
      y: staticPosition.y + slideAnimation.y,
      alpha: slideAnimation.alpha
    };
  }

  /**
   * 累積配置位置を計算
   * 用途: 特殊な累積レイアウト
   */
  calculateCumulative(params: WordPositionParams): Position {
    // 前の単語からの累積オフセット
    const cumulativeOffset = this.calculateCumulativeOffset(params);

    return {
      x: cumulativeOffset.x,
      y: cumulativeOffset.y,
      alpha: 1.0
    };
  }

  /**
   * スライドアニメーション詳細計算
   */
  private calculateSlideAnimation(params: WordSlideParams): Position & { alpha: number } {
    const wordStartMs = params.startMs;
    const wordInStartMs = wordStartMs - params.headTime;

    // 入場前: 右オフセット位置で非表示
    if (params.nowMs < wordInStartMs) {
      return { x: params.rightOffset, y: 0, alpha: 0 };
    }

    // 入場アニメーション中
    if (params.nowMs < wordStartMs) {
      const entranceProgress = (params.nowMs - wordInStartMs) / params.headTime;
      const easedProgress = this.easeOutCubic(entranceProgress);

      return {
        x: params.rightOffset * (1 - easedProgress),
        y: 0,
        alpha: easedProgress
      };
    }

    // アクティブ期間の微細な動き
    const activeOffset = this.calculateActiveMovement(params);
    return {
      x: activeOffset.x,
      y: activeOffset.y,
      alpha: 1.0
    };
  }

  /**
   * アクティブ期間中の微細な動き計算
   */
  private calculateActiveMovement(params: WordSlideParams): Position {
    const activeTime = params.nowMs - params.startMs;
    const activeSpeed = params.activeSpeed;

    if (activeSpeed === 0) {
      return { x: 0, y: 0 };
    }

    // 微細な左右振動
    const oscillation = Math.sin(activeTime * 0.001 * activeSpeed) * 2;

    return {
      x: oscillation,
      y: 0
    };
  }

  /**
   * 累積オフセット計算
   */
  private calculateCumulativeOffset(params: WordPositionParams): Position {
    // 単語インデックスに基づく累積的な水平配置
    const baseWordWidth = params.fontSize * 6; // 平均単語幅の概算
    const wordSpacing = params.fontSize * 0.5;
    
    const xOffset = params.wordIndex * (baseWordWidth + wordSpacing);
    const yOffset = 0; // 累積レイアウトでは同一行

    return {
      x: xOffset,
      y: yOffset
    };
  }

  /**
   * 単語間隔計算（累積レイアウト用）
   */
  private calculateWordSpacing(params: WordPositionParams): number {
    const wordSpacing = (params.params.wordSpacing as number) || 0.3;
    return params.fontSize * wordSpacing;
  }

  /**
   * 単語幅推定（累積レイアウト用）
   */
  private estimateWordWidth(params: WordPositionParams): number {
    const text = (params.params.text as string) || '';
    const words = text.split(' ');
    
    if (params.wordIndex < words.length) {
      const word = words[params.wordIndex];
      // 大まかな文字数 × 文字間隔で幅を推定
      return word.length * params.fontSize * 0.8;
    }
    
    return params.fontSize * 6; // デフォルト幅
  }

  /**
   * イージング関数: EaseOutCubic
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * イージング関数: EaseInOutQuad
   */
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /**
   * 時間基準の周期関数
   */
  private calculateTimedOscillation(timeMs: number, frequency: number, amplitude: number): number {
    return Math.sin(timeMs * 0.001 * frequency * Math.PI * 2) * amplitude;
  }

  /**
   * 単語レベルの可視性判定
   */
  private calculateWordVisibility(params: WordPositionParams): number {
    const wordStartTime = params.startMs - params.headTime;
    const wordEndTime = params.endMs;

    if (params.nowMs < wordStartTime) return 0;
    if (params.nowMs > wordEndTime) return 0;
    
    // フェードイン
    if (params.nowMs < params.startMs) {
      const fadeProgress = (params.nowMs - wordStartTime) / params.headTime;
      return this.easeOutCubic(fadeProgress);
    }

    return 1.0;
  }
}