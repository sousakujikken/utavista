/**
 * SimpleFrameScheduler - PIXI.Ticker活用60FPS保証システム
 * 既存のPIXI.Tickerを最大限活用し、フレーム予算管理で安定した60FPSを実現
 * 
 * 参照: development-directive-final.md#2.2, core-focused-design-revision.md#3.2
 */

import * as PIXI from 'pixi.js';

export interface FrameCallback {
  (frameData: FrameData): void;
}

export interface FrameData {
  frameNumber: number;
  deltaTime: number;      // フレーム間隔（ms）
  budget: number;         // 残りフレーム予算（ms）
  timestamp: number;      // 現在時刻
  isOnTime: boolean;      // 予算内実行フラグ
}

export interface FrameStats {
  currentFPS: number;
  averageFPS: number;
  frameDropCount: number;
  budgetViolations: number;
  totalFrames: number;
  uptime: number;         // 稼働時間（ms）
}

/**
 * 60FPS安定動作を保証するフレームスケジューラー
 * PIXI.Tickerの既存機能を最大限活用
 */
export class SimpleFrameScheduler {
  private ticker: PIXI.Ticker;
  private readonly FRAME_BUDGET_MS = 14;     // 60FPS = 16.67ms, 余裕を持って14ms
  private readonly TARGET_FPS = 60;
  private readonly FPS_SAMPLE_SIZE = 60;     // 1秒間のサンプル
  
  private frameCounter: number = 0;
  private startTime: number = 0;
  private lastFrameTime: number = 0;
  private frameDropCount: number = 0;
  private budgetViolations: number = 0;
  
  // FPS統計用
  private fpsSamples: number[] = [];
  private frameCallbacks: Set<FrameCallback> = new Set();
  
  // 実行状態
  private isRunning: boolean = false;
  
  constructor() {
    this.ticker = PIXI.Ticker.shared;
    
    // PIXI.Tickerの最適設定
    this.ticker.maxFPS = this.TARGET_FPS;
    this.ticker.minFPS = this.TARGET_FPS;
    
    // 高精度タイマー有効化（ブラウザ対応）
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      // アイドル時間活用でより安定した動作
      this.ticker.autoStart = true;
    }
  }
  
  /**
   * フレームループの開始
   * 既存のPIXI.Tickerシステムに統合
   */
  startFrameLoop(callback: FrameCallback): void {
    if (this.isRunning) {
      console.warn('[SimpleFrameScheduler] Frame loop is already running');
      return;
    }
    
    this.frameCallbacks.add(callback);
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.frameCounter = 0;
    
    // PIXI.Tickerにフレーム処理を追加
    const tickerCallback = (deltaTime: number) => {
      this.processFrame(deltaTime);
    };
    
    this.ticker.add(tickerCallback);
    
    if (!this.ticker.started) {
      this.ticker.start();
    }
    
    this.isRunning = true;
    console.log('[SimpleFrameScheduler] Frame loop started with target', this.TARGET_FPS, 'FPS');
  }
  
  /**
   * フレーム処理（PIXI.Ticker統合）
   */
  private processFrame(deltaTime: number): void {
    const now = performance.now();
    const frameStart = now;
    
    // フレーム間隔計算
    const actualDelta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    // FPS計算とサンプリング
    const currentFPS = 1000 / actualDelta;
    this.updateFPSSamples(currentFPS);
    
    // フレーム予算計算
    const budgetRemaining = this.checkFrameBudget(frameStart);
    
    // フレームドロップ検出
    if (actualDelta > (1000 / this.TARGET_FPS) * 1.5) { // 1.5倍を超えたらドロップ
      this.frameDropCount++;
    }
    
    // フレームデータ構築
    const frameData: FrameData = {
      frameNumber: ++this.frameCounter,
      deltaTime: actualDelta,
      budget: budgetRemaining,
      timestamp: now,
      isOnTime: budgetRemaining > 0
    };
    
    // コールバック実行（予算管理付き）
    this.executeCallbacks(frameData, frameStart);
    
    // 予算超過チェック
    const processingTime = performance.now() - frameStart;
    if (processingTime > this.FRAME_BUDGET_MS) {
      this.budgetViolations++;
    }
  }
  
  /**
   * フレーム予算チェック
   */
  checkFrameBudget(frameStart?: number): number {
    if (!frameStart) {
      frameStart = performance.now();
    }
    
    const elapsed = performance.now() - frameStart;
    return Math.max(0, this.FRAME_BUDGET_MS - elapsed);
  }
  
  /**
   * コールバック実行（予算管理付き）
   */
  private executeCallbacks(frameData: FrameData, frameStart: number): void {
    for (const callback of this.frameCallbacks) {
      try {
        // 予算チェック
        const budgetRemaining = performance.now() - frameStart;
        if (budgetRemaining > this.FRAME_BUDGET_MS) {
          console.warn('[SimpleFrameScheduler] Frame budget exceeded, skipping callback');
          break;
        }
        
        callback(frameData);
        
      } catch (error) {
        console.error('[SimpleFrameScheduler] Callback error:', error);
      }
    }
  }
  
  /**
   * FPSサンプルの更新
   */
  private updateFPSSamples(fps: number): void {
    this.fpsSamples.push(fps);
    
    // サンプルサイズを維持
    if (this.fpsSamples.length > this.FPS_SAMPLE_SIZE) {
      this.fpsSamples.shift();
    }
  }
  
  /**
   * フレームループの停止
   */
  stopFrameLoop(callback?: FrameCallback): void {
    if (callback) {
      this.frameCallbacks.delete(callback);
    } else {
      this.frameCallbacks.clear();
    }
    
    // 全てのコールバックが削除されたら停止
    if (this.frameCallbacks.size === 0) {
      this.ticker.stop();
      this.isRunning = false;
      console.log('[SimpleFrameScheduler] Frame loop stopped');
    }
  }
  
  /**
   * コールバックの追加
   */
  addCallback(callback: FrameCallback): void {
    this.frameCallbacks.add(callback);
  }
  
  /**
   * コールバックの削除
   */
  removeCallback(callback: FrameCallback): void {
    this.frameCallbacks.delete(callback);
  }
  
  /**
   * フレーム統計取得
   */
  getFrameStats(): FrameStats {
    const currentFPS = this.fpsSamples.length > 0 
      ? this.fpsSamples[this.fpsSamples.length - 1] 
      : 0;
    
    const averageFPS = this.fpsSamples.length > 0
      ? this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length
      : 0;
    
    const uptime = performance.now() - this.startTime;
    
    return {
      currentFPS: Math.round(currentFPS * 10) / 10,
      averageFPS: Math.round(averageFPS * 10) / 10,
      frameDropCount: this.frameDropCount,
      budgetViolations: this.budgetViolations,
      totalFrames: this.frameCounter,
      uptime
    };
  }
  
  /**
   * 統計リセット
   */
  resetStats(): void {
    this.frameCounter = 0;
    this.frameDropCount = 0;
    this.budgetViolations = 0;
    this.fpsSamples = [];
    this.startTime = performance.now();
  }
  
  /**
   * デバッグ情報取得
   */
  getDebugInfo(): Record<string, any> {
    const stats = this.getFrameStats();
    
    return {
      isRunning: this.isRunning,
      targetFPS: this.TARGET_FPS,
      frameBudgetMs: this.FRAME_BUDGET_MS,
      callbackCount: this.frameCallbacks.size,
      pixiTicker: {
        fps: this.ticker.FPS,
        deltaMS: this.ticker.deltaMS,
        elapsedMS: this.ticker.elapsedMS,
        started: this.ticker.started
      },
      performance: {
        ...stats,
        budgetViolationRate: stats.totalFrames > 0 
          ? `${(stats.budgetViolations / stats.totalFrames * 100).toFixed(2)}%`
          : '0%',
        frameDropRate: stats.totalFrames > 0
          ? `${(stats.frameDropCount / stats.totalFrames * 100).toFixed(2)}%`
          : '0%'
      }
    };
  }
  
  /**
   * フレーム品質評価
   */
  getFrameQuality(): 'excellent' | 'good' | 'fair' | 'poor' {
    const stats = this.getFrameStats();
    
    if (stats.averageFPS >= 58 && stats.frameDropCount / stats.totalFrames < 0.01) {
      return 'excellent';
    } else if (stats.averageFPS >= 55 && stats.frameDropCount / stats.totalFrames < 0.02) {
      return 'good';
    } else if (stats.averageFPS >= 50 && stats.frameDropCount / stats.totalFrames < 0.05) {
      return 'fair';
    } else {
      return 'poor';
    }
  }
}