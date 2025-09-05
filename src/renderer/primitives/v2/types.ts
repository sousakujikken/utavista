/**
 * プリミティブ v2.0 共通型定義
 */

import { AnimationPhase } from '../../types/types';
import { FlexibleCharacterData } from '../../types/types';

/**
 * 階層タイプ定義
 */
export type HierarchyType = 'phrase' | 'word' | 'character';

/**
 * プリミティブ基底インターフェース
 */
export interface BasePrimitive {
  readonly name: string;
  readonly version: string;
  readonly supportedHierarchy: HierarchyType;
}

/**
 * 位置情報インターフェース
 */
export interface Position {
  x: number;
  y: number;
  alpha?: number;
}

/**
 * 基本計算パラメータ
 */
export interface CalculationParams {
  nowMs: number;
  startMs: number;
  endMs: number;
  phase: AnimationPhase;
  params: Record<string, unknown>;
}

/**
 * フレーズ位置計算パラメータ
 */
export interface PhrasePositionParams extends CalculationParams {
  text: string;
  phraseOffsetX: number;
  phraseOffsetY: number;
  fontSize: number;
  lineHeight: number;
  headTime: number;
  tailTime: number;
}

/**
 * ランダム配置パラメータ
 */
export interface RandomPlacementParams extends PhrasePositionParams {
  randomPlacement: boolean;
  randomSeed: number;
  randomRangeX: number;
  randomRangeY: number;
  minDistanceFromPrevious: number;
  phraseId: string;
}

/**
 * 単語位置計算パラメータ
 */
export interface WordPositionParams extends CalculationParams {
  wordIndex: number;
  fontSize: number;
  lineHeight: number;
  headTime: number;
}

/**
 * 単語スライドパラメータ
 */
export interface WordSlideParams extends WordPositionParams {
  entranceInitialSpeed: number;
  activeSpeed: number;
  rightOffset: number;
}

/**
 * 文字レイアウトパラメータ
 */
export interface CharacterLayoutParams {
  chars: FlexibleCharacterData[];
  charSpacing: number;
  fontSize: number;
  halfWidthSpacingRatio: number;
  wordSpacing: number;
  lineHeight: number;
  containerPrefix: string;
}

/**
 * レイアウト結果
 */
export interface LayoutResult {
  id: string;
  position: Position;
  container: PIXI.Container;
}

/**
 * 単語レイアウト情報
 */
export interface WordLayoutInfo {
  wordIndex: number;
  startCharIndex: number;
  endCharIndex: number;
  totalWidth: number;
  position: Position;
}

/**
 * 文字レイアウト結果
 */
export interface CharacterLayoutResult {
  success: boolean;
  layoutResults: LayoutResult[];
  wordLayoutInfo: WordLayoutInfo[];
  warnings: string[];
}

/**
 * ブラーエフェクトパラメータ
 */
export interface BlurEffectParams {
  enableBlur: boolean;
  blurStrength: number;
  blurFadeType: 'sync_with_alpha' | 'inverse_alpha' | 'independent';
  fadeInDuration: number;
  fadeOutDuration: number;
  currentAlpha: number;
  nowMs: number;
  startMs: number;
  endMs: number;
}

/**
 * グリッチエフェクトパラメータ
 */
export interface GlitchEffectParams {
  enableGlitch: boolean;
  glitchBlockSize: number;
  glitchThreshold: number;
  glitchIntensity: number;
  glitchFrequency: number;
  randomSeed: number;
}

/**
 * 階層制約の基本チェック（実行時）
 */
export function validateHierarchyUsage(
  primitive: BasePrimitive,
  expectedHierarchy: HierarchyType
): boolean {
  return primitive.supportedHierarchy === expectedHierarchy;
}

/**
 * 検証結果インターフェース
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}