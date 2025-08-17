/**
 * 協調的プリミティブライブラリの型定義
 * LLMテンプレート生成システム v2.0
 */

import * as PIXI from 'pixi.js';
import { AnimationPhase, HierarchyType } from '../types/types';

/**
 * 階層状態情報
 * 上位層から下位層に渡される状態データ
 */
export interface LayerState {
  /** 階層タイプ */
  hierarchyType: HierarchyType;
  /** アニメーションフェーズ */
  phase: AnimationPhase;
  /** 現在時刻（ms） */
  nowMs: number;
  /** 開始時刻（ms） */
  startMs: number;
  /** 終了時刻（ms） */
  endMs: number;
  /** 親コンテナからの相対位置 */
  parentPosition: { x: number; y: number };
  /** 階層固有のパラメータ */
  hierarchyParams: Record<string, unknown>;
}

/**
 * 子階層への指示情報
 * 上位層が下位層に与える制御指示
 */
export interface ChildInstruction {
  /** 対象子コンテナのID */
  childId: string;
  /** 子コンテナに適用する位置 */
  position: { x: number; y: number };
  /** 子コンテナに適用するアルファ値 */
  alpha: number;
  /** 子コンテナの可視状態 */
  visible: boolean;
  /** 子階層固有のパラメータ */
  childParams: Record<string, unknown>;
}

/**
 * プリミティブ処理結果
 */
export interface PrimitiveResult {
  /** 処理成功フラグ */
  success: boolean;
  /** 子階層への指示リスト */
  childInstructions: ChildInstruction[];
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * 協調的プリミティブの基底インターフェース
 * オリジナルWordSlideTextの成功パターンを継承
 */
export interface CooperativePrimitive {
  /** プリミティブ名 */
  name: string;
  
  /**
   * 上位層からの制御を受け入れ
   * @param parentState 親階層の状態情報
   */
  receiveParentContext(parentState: LayerState): void;
  
  /**
   * 自分の責任範囲の処理を実行
   * @param container 対象コンテナ
   * @param text テキスト内容
   * @param params パラメータ
   * @returns 処理結果
   */
  executeWithinHierarchy(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>
  ): PrimitiveResult;
  
  /**
   * 下位層への指示を生成
   * @returns 子階層への指示リスト
   */
  generateChildInstructions(): ChildInstruction[];
}

/**
 * レイアウトプリミティブの基底インターフェース
 * 累積配置、グリッド配置等の基盤
 */
export interface LayoutPrimitive extends CooperativePrimitive {
  /**
   * 要素の配置計算
   * @param items 配置対象要素リスト
   * @param params 配置パラメータ
   * @returns 各要素の位置情報
   */
  calculateLayout(
    items: LayoutItem[],
    params: LayoutParams
  ): LayoutResult[];
}

/**
 * アニメーションプリミティブの基底インターフェース
 * スライド、フェード等の物理ベースアニメーション
 */
export interface AnimationPrimitive extends CooperativePrimitive {
  /**
   * アニメーション状態の計算
   * @param progress アニメーション進行度（0-1）
   * @param params アニメーションパラメータ
   * @returns アニメーション状態
   */
  calculateAnimation(
    progress: number,
    params: AnimationParams
  ): AnimationState;
}

/**
 * エフェクトプリミティブの基底インターフェース
 * グロー、シャドウ等のPIXI.js直接制御
 */
export interface EffectPrimitive extends CooperativePrimitive {
  /**
   * エフェクトの適用
   * @param container 対象コンテナ
   * @param params エフェクトパラメータ
   */
  applyEffect(
    container: PIXI.Container,
    params: EffectParams
  ): void;
  
  /**
   * エフェクトの削除
   * @param container 対象コンテナ
   */
  removeEffect(container: PIXI.Container): void;
}

/**
 * レイアウト関連の型定義
 */
export interface LayoutItem {
  id: string;
  content: string;
  size: { width: number; height: number };
  metadata?: Record<string, unknown>;
}

export interface LayoutParams {
  spacing: number;
  alignment: 'left' | 'center' | 'right';
  containerSize: { width: number; height: number };
  [key: string]: unknown;
}

export interface LayoutResult {
  id: string;
  position: { x: number; y: number };
  transform?: PIXI.Matrix;
}

/**
 * アニメーション関連の型定義
 */
export interface AnimationParams {
  duration: number;
  easing: EasingFunction;
  startValue: number;
  endValue: number;
  [key: string]: unknown;
}

/**
 * アニメーション状態
 */
export interface AnimationState {
  /** 位置情報 */
  position: { x: number; y: number };
  /** 透明度（0-1） */
  alpha: number;
  /** スケール値 */
  scale: { x: number; y: number };
  /** 回転角度（ラジアン） */
  rotation: number;
  /** 
   * 可視性フラグ
   * @important 文字レベルでは使用しないでください。文字は常にvisible=trueとし、色で状態を表現してください。
   * @see docs/character-visibility-prevention-guide.md
   */
  visible: boolean;
}

/**
 * エフェクト関連の型定義
 */
export interface EffectParams {
  intensity: number;
  color?: string;
  blur?: number;
  [key: string]: unknown;
}

/**
 * イージング関数の型定義
 */
export type EasingFunction = (t: number) => number;

/**
 * 標準イージング関数
 */
export const EasingFunctions = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
} as const;

/**
 * 物理計算ユーティリティ
 */
export interface PhysicsParams {
  initialSpeed: number;
  finalSpeed: number;
  acceleration?: number;
  friction?: number;
}

/**
 * 距離計算結果
 */
export interface DistanceResult {
  distance: number;
  velocity: number;
  time: number;
}