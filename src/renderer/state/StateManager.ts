/**
 * StateManager - 時間ベースの状態管理を一元化するマネージャー
 */

import { StateCalculator } from './StateCalculator';

export interface TimeRange {
  startMs: number;
  endMs: number;
  headTime: number;
  tailTime: number;
}

export type AnimationPhase = 'before' | 'in' | 'active' | 'out' | 'after';
export type HierarchyType = 'phrase' | 'word' | 'char';
export type EffectType = 'swipeIn' | 'swipeOut' | 'glow' | 'shadow' | 'blur' | 'maskTransition';

export interface ObjectState {
  id: string;
  visible: boolean;
  phase: AnimationPhase;
  progress: number;        // 0.0-1.0
  exists: boolean;         // オブジェクトが存在すべきか
  hierarchyType: HierarchyType;
  startMs: number;
  endMs: number;
}

export interface EffectState {
  enabled: boolean;
  progress: number;        // 0.0-1.0
  params: Record<string, any>;
  phase: 'entering' | 'active' | 'exiting' | 'inactive';
}

export interface GraphicsState {
  visible: boolean;
  opacity: number;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  mask?: {
    type: 'rectangle' | 'custom';
    progress: number;
    bounds?: { x: number; y: number; width: number; height: number; };
  };
}

export interface RenderState {
  object: ObjectState;
  effects: Map<EffectType, EffectState>;
  graphics: Map<string, GraphicsState>;
  children?: RenderState[];
}

export interface IStateManager {
  getObjectState(objectId: string, timestamp: number): ObjectState;
  getEffectState(objectId: string, effectType: EffectType, timestamp: number): EffectState;
  getAnimationPhase(objectId: string, timestamp: number): AnimationPhase;
  getGraphicsState(graphicsId: string, parentId: string, timestamp: number): GraphicsState;
  registerObjectTimeRange(objectId: string, timeRange: TimeRange): void;
  getRenderState(objectId: string, timestamp: number): RenderState;
}

export class StateManager implements IStateManager {
  private timeRanges: Map<string, TimeRange> = new Map();
  private objectHierarchy: Map<string, HierarchyType> = new Map();
  private stateCache: Map<string, { state: RenderState; timestamp: number; }> = new Map();
  
  // キャッシュの有効期間（ミリ秒）
  private readonly CACHE_DURATION = 50;

  registerObjectTimeRange(objectId: string, timeRange: TimeRange): void {
    this.timeRanges.set(objectId, timeRange);
    
    // オブジェクトIDから階層タイプを推定
    if (objectId.includes('phrase_')) {
      this.objectHierarchy.set(objectId, 'phrase');
    } else if (objectId.includes('word_')) {
      this.objectHierarchy.set(objectId, 'word');
    } else if (objectId.includes('char_')) {
      this.objectHierarchy.set(objectId, 'char');
    }
  }

  getObjectState(objectId: string, timestamp: number): ObjectState {
    const timeRange = this.timeRanges.get(objectId);
    if (!timeRange) {
      // デフォルト状態を返す
      return {
        id: objectId,
        visible: false,
        phase: 'before',
        progress: 0,
        exists: false,
        hierarchyType: this.objectHierarchy.get(objectId) || 'char',
        startMs: 0,
        endMs: 0
      };
    }

    const phase = StateCalculator.calculatePhase(timestamp, timeRange);
    const visible = phase !== 'before' && phase !== 'after';
    const exists = timestamp >= timeRange.startMs - timeRange.headTime && 
                   timestamp <= timeRange.endMs + timeRange.tailTime;

    // 進行度の計算（フェーズに応じて）
    let progress = 0;
    switch (phase) {
      case 'in':
        progress = StateCalculator.calculateProgress(
          timestamp,
          timeRange.startMs - timeRange.headTime,
          timeRange.headTime
        );
        break;
      case 'active':
        progress = 1.0;
        break;
      case 'out':
        progress = 1.0 - StateCalculator.calculateProgress(
          timestamp,
          timeRange.endMs,
          timeRange.tailTime
        );
        break;
      default:
        progress = 0;
    }

    return {
      id: objectId,
      visible,
      phase,
      progress,
      exists,
      hierarchyType: this.objectHierarchy.get(objectId) || 'char',
      startMs: timeRange.startMs,
      endMs: timeRange.endMs
    };
  }

  getEffectState(objectId: string, effectType: EffectType, timestamp: number): EffectState {
    const timeRange = this.timeRanges.get(objectId);
    if (!timeRange) {
      return {
        enabled: false,
        progress: 0,
        params: {},
        phase: 'inactive'
      };
    }

    const objectPhase = StateCalculator.calculatePhase(timestamp, timeRange);
    
    return StateCalculator.calculateEffectState(
      objectPhase,
      effectType,
      timestamp,
      timeRange
    );
  }

  getAnimationPhase(objectId: string, timestamp: number): AnimationPhase {
    const timeRange = this.timeRanges.get(objectId);
    if (!timeRange) {
      return 'before';
    }

    return StateCalculator.calculatePhase(timestamp, timeRange);
  }

  getGraphicsState(graphicsId: string, parentId: string, timestamp: number): GraphicsState {
    const parentTimeRange = this.timeRanges.get(parentId);
    if (!parentTimeRange) {
      return {
        visible: false,
        opacity: 0,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0
        }
      };
    }

    const parentPhase = StateCalculator.calculatePhase(timestamp, parentTimeRange);
    
    // グラフィック要素の種類に応じた状態計算
    switch (graphicsId) {
      case 'blackBand':
        return this.calculateBlackBandState(parentPhase, timestamp, parentTimeRange);
      case 'invertMask':
        return this.calculateInvertMaskState(parentPhase, timestamp, parentTimeRange);
      default:
        return {
          visible: parentPhase === 'active' || parentPhase === 'in' || parentPhase === 'out',
          opacity: 1,
          transform: {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0
          }
        };
    }
  }

  private calculateBlackBandState(
    phase: AnimationPhase,
    timestamp: number,
    timeRange: TimeRange
  ): GraphicsState {
    let visible = false;
    let maskProgress = 0;

    switch (phase) {
      case 'in':
        visible = true;
        maskProgress = StateCalculator.calculateProgress(
          timestamp,
          timeRange.startMs - timeRange.headTime,
          timeRange.headTime
        );
        break;
      case 'active':
        visible = true;
        maskProgress = 1.0;
        break;
      case 'out':
        visible = true;
        maskProgress = 1.0 - StateCalculator.calculateProgress(
          timestamp,
          timeRange.endMs,
          timeRange.tailTime
        );
        break;
    }

    return {
      visible,
      opacity: 1,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      },
      mask: visible ? {
        type: 'rectangle',
        progress: maskProgress
      } : undefined
    };
  }

  private calculateInvertMaskState(
    phase: AnimationPhase,
    timestamp: number,
    timeRange: TimeRange
  ): GraphicsState {
    return {
      visible: phase === 'active',
      opacity: phase === 'active' ? 1 : 0,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      }
    };
  }

  getRenderState(objectId: string, timestamp: number): RenderState {
    // キャッシュチェック
    const cacheKey = `${objectId}_${timestamp}`;
    const cached = this.stateCache.get(cacheKey);
    if (cached && Math.abs(cached.timestamp - timestamp) < this.CACHE_DURATION) {
      return cached.state;
    }

    // 新しい状態を計算
    const objectState = this.getObjectState(objectId, timestamp);
    const effects = new Map<EffectType, EffectState>();
    const graphics = new Map<string, GraphicsState>();

    // エフェクト状態を計算
    const effectTypes: EffectType[] = ['swipeIn', 'swipeOut', 'glow', 'shadow'];
    for (const effectType of effectTypes) {
      const effectState = this.getEffectState(objectId, effectType, timestamp);
      if (effectState.enabled) {
        effects.set(effectType, effectState);
      }
    }

    // グラフィック状態を計算
    const graphicsIds = ['blackBand', 'invertMask'];
    for (const graphicsId of graphicsIds) {
      const graphicsState = this.getGraphicsState(graphicsId, objectId, timestamp);
      graphics.set(graphicsId, graphicsState);
    }

    const renderState: RenderState = {
      object: objectState,
      effects,
      graphics
    };

    // キャッシュに保存
    this.stateCache.set(cacheKey, {
      state: renderState,
      timestamp
    });

    return renderState;
  }

  // キャッシュをクリアする（メモリ管理用）
  public clearCache(): void {
    this.stateCache.clear();
  }

  // 古いキャッシュエントリを削除
  public cleanupOldCache(currentTimestamp: number): void {
    const cutoffTime = currentTimestamp - this.CACHE_DURATION * 10;
    for (const [key, value] of this.stateCache.entries()) {
      if (value.timestamp < cutoffTime) {
        this.stateCache.delete(key);
      }
    }
  }
}