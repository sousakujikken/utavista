/**
 * StateCalculator - 純粋関数による状態計算
 */

import type { TimeRange, AnimationPhase, EffectType, EffectState } from './StateManager';

export class StateCalculator {
  /**
   * アニメーションフェーズの計算
   */
  static calculatePhase(timestamp: number, timeRange: TimeRange): AnimationPhase {
    const { startMs, endMs, headTime, tailTime } = timeRange;
    
    if (timestamp < startMs - headTime) {
      return 'before';  // 表示前
    } else if (timestamp < startMs) {
      return 'in';      // 入場アニメーション中
    } else if (timestamp <= endMs) {
      return 'active';  // アクティブ表示中
    } else if (timestamp <= endMs + tailTime) {
      return 'out';     // 退場アニメーション中
    } else {
      return 'after';   // 表示後
    }
  }

  /**
   * 進行度の計算
   */
  static calculateProgress(
    timestamp: number,
    startMs: number,
    duration: number
  ): number {
    if (timestamp < startMs) return 0;
    if (timestamp >= startMs + duration) return 1;
    if (duration === 0) return 1;
    return (timestamp - startMs) / duration;
  }

  /**
   * エフェクト状態の計算
   */
  static calculateEffectState(
    phase: AnimationPhase,
    effectType: EffectType,
    timestamp: number,
    timeRange: TimeRange
  ): EffectState {
    switch (effectType) {
      case 'swipeIn':
        return this.calculateSwipeInState(phase, timestamp, timeRange);
      case 'swipeOut':
        return this.calculateSwipeOutState(phase, timestamp, timeRange);
      case 'glow':
        return this.calculateGlowState(phase, timestamp, timeRange);
      case 'shadow':
        return this.calculateShadowState(phase, timestamp, timeRange);
      default:
        return {
          enabled: false,
          progress: 0,
          params: {},
          phase: 'inactive'
        };
    }
  }

  /**
   * スワイプイン状態の計算
   */
  private static calculateSwipeInState(
    phase: AnimationPhase,
    timestamp: number,
    timeRange: TimeRange
  ): EffectState {
    if (phase === 'in') {
      const progress = this.calculateProgress(
        timestamp,
        timeRange.startMs - timeRange.headTime,
        timeRange.headTime
      );
      
      // 3次イージング適用（速くからゆっくり）
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      return {
        enabled: true,
        progress: easedProgress,
        params: { 
          easedProgress,
          rawProgress: progress,
          maskWidth: easedProgress // マスク幅の進行度
        },
        phase: 'entering'
      };
    }
    
    return {
      enabled: false,
      progress: 0,
      params: {},
      phase: 'inactive'
    };
  }

  /**
   * スワイプアウト状態の計算
   */
  private static calculateSwipeOutState(
    phase: AnimationPhase,
    timestamp: number,
    timeRange: TimeRange
  ): EffectState {
    if (phase === 'out') {
      const progress = this.calculateProgress(
        timestamp,
        timeRange.endMs,
        timeRange.tailTime
      );
      
      return {
        enabled: true,
        progress: progress,
        params: { 
          swipeProgress: progress,
          maskOffset: progress // マスクオフセットの進行度
        },
        phase: 'exiting'
      };
    }
    
    return {
      enabled: false,
      progress: 0,
      params: {},
      phase: 'inactive'
    };
  }

  /**
   * グロー状態の計算
   */
  private static calculateGlowState(
    phase: AnimationPhase,
    timestamp: number,
    timeRange: TimeRange
  ): EffectState {
    // グローは基本的にアクティブフェーズで有効
    const enabled = phase === 'active' || phase === 'in' || phase === 'out';
    
    return {
      enabled,
      progress: enabled ? 1.0 : 0,
      params: {},
      phase: enabled ? 'active' : 'inactive'
    };
  }

  /**
   * シャドウ状態の計算
   */
  private static calculateShadowState(
    phase: AnimationPhase,
    timestamp: number,
    timeRange: TimeRange
  ): EffectState {
    // シャドウは基本的にアクティブフェーズで有効
    const enabled = phase === 'active' || phase === 'in' || phase === 'out';
    
    return {
      enabled,
      progress: enabled ? 1.0 : 0,
      params: {},
      phase: enabled ? 'active' : 'inactive'
    };
  }

  /**
   * イージング関数
   */
  static easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  static easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  static easeInCubic(t: number): number {
    return t * t * t;
  }

  /**
   * 複合進行度計算（複数のイージングを組み合わせ）
   */
  static calculateCompositeProgress(
    timestamp: number,
    startMs: number,
    duration: number,
    easingType: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' = 'linear'
  ): number {
    const linearProgress = this.calculateProgress(timestamp, startMs, duration);
    
    switch (easingType) {
      case 'easeIn':
        return this.easeInCubic(linearProgress);
      case 'easeOut':
        return this.easeOutCubic(linearProgress);
      case 'easeInOut':
        return this.easeInOutCubic(linearProgress);
      default:
        return linearProgress;
    }
  }

  /**
   * 時間範囲の重複チェック
   */
  static isTimeRangeOverlapping(
    range1: TimeRange,
    range2: TimeRange
  ): boolean {
    const start1 = range1.startMs - range1.headTime;
    const end1 = range1.endMs + range1.tailTime;
    const start2 = range2.startMs - range2.headTime;
    const end2 = range2.endMs + range2.tailTime;

    return start1 < end2 && start2 < end1;
  }

  /**
   * 時間範囲内かどうかの判定
   */
  static isTimestampInRange(
    timestamp: number,
    timeRange: TimeRange,
    includeAnimations: boolean = true
  ): boolean {
    if (includeAnimations) {
      return timestamp >= timeRange.startMs - timeRange.headTime &&
             timestamp <= timeRange.endMs + timeRange.tailTime;
    } else {
      return timestamp >= timeRange.startMs &&
             timestamp <= timeRange.endMs;
    }
  }
}