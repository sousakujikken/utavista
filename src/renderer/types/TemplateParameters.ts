/**
 * テンプレート固有パラメータの型定義
 * 
 * 各テンプレートが独自に必要とするパラメータを厳密に型定義し、
 * StandardParametersとの分離を明確にする
 */

import { StandardParameters } from '../../types/StandardParameters';

/**
 * FlickerFadeTemplate専用パラメータ
 */
export interface FlickerFadeParameters {
  preInDuration: number;
  flickerMinFrequency: number;
  flickerMaxFrequency: number;
  flickerIntensity: number;
  flickerRandomness: number;
  frequencyLerpSpeed: number;
  fadeInVariation: number;
  fadeOutVariation: number;
  fadeOutDuration: number;
  fullDisplayThreshold: number;
  charSpacing: number;
}

/**
 * BlinkFadeTextPrimitive専用パラメータ
 */
export interface BlinkFadeTextPrimitiveParameters {
  preInDuration: number;
  flickerMinFrequency: number;
  flickerMaxFrequency: number;
  flickerIntensity: number;
  flickerRandomness: number;
  flickerThreshold: number;
  frequencyLerpSpeed: number;
  fadeInVariation: number;
  fadeOutVariation: number;
  fadeOutDuration: number;
  fullDisplayThreshold: number;
}

/**
 * MultiLineText専用パラメータ
 */
export interface MultiLineTextParameters {
  totalLines: number;
  lineSpacing: number;
  resetInterval: number;
  manualLineNumber: number;
  phraseOverlapThreshold: number;
  phraseOffsetX: number;
  phraseOffsetY: number;
  inactiveColor: string;
  activeColor: string;
  completedColor: string;
  shapeSize: number;
  innerShapeSize: number;
  shapeSizeGrowSpeed: number;
  innerShapeSizeGrowSpeed: number;
  shapeRotationSpeed: number;
  innerShapeRotationSpeed: number;
  shapeLineWidth: number;
  innerShapeLineWidth: number;
  shapeOffsetX: number;
  shapeOffsetY: number;
  shapeStartAngle: number;
  innerShapeStartAngle: number;
}

/**
 * WordSlideText専用パラメータ
 */
export interface WordSlideTextParameters {
  headTime: number;
  tailTime: number;
  entranceInitialSpeed: number;
  activeSpeed: number;
  rightOffset: number;
  randomPlacement: boolean;
  randomSeed: number;
  randomRangeX: number;
  randomRangeY: number;
  minDistanceFromPrevious: number;
}

/**
 * WordSlideText2専用パラメータ
 */
export interface WordSlideText2Parameters extends WordSlideTextParameters {
  // 文字スケーリング
  enableCharScaling: boolean;
  charScaleMultiplier: number;
  charPositionOffsetX: number;
  charPositionOffsetY: number;
  charScalingSeed: number;
  // 退場アニメーション
  enableExitAnimation: boolean;
  exitCopyCount: number;
  exitFrameDelay: number;
  exitCopyScale: number;
  exitCopyColor: string;
  exitAnimationDuration: number;
  copyPositionRandomRange: number;
  copyPositionSeed: number;
}

/**
 * GlitchText専用パラメータ
 */
export interface GlitchTextParameters {
  enableGlitch: boolean;
  glitchBlockSize: number;
  glitchBlockCount: number;
  glitchUpdateInterval: number;
  glitchIntensity: number;
  glitchColorShift: boolean;
  glitchThreshold: number;
  glitchWaveSpeed: number;
  glitchRandomness: number;
}

/**
 * MultiLineStackTemplate専用パラメータ
 */
export interface MultiLineStackTemplateParameters {
  stackLineSpacing: number;
  maxBlurRadius: number;
  stackStartX: number;
  stackStartY: number;
  stackCharSpacing: number;
}

/**
 * VerticalTextTemplate専用パラメータ
 */
export interface VerticalTextTemplateParameters {
  textDirection: 'horizontal' | 'vertical';
  verticalStartPosition: 'top' | 'center' | 'bottom';
  verticalLineDirection: 'rtl' | 'ltr';
  enablePunctuationAdjustment: boolean;
  punctuationCharacters: string;
  punctuationOffsetX: number;
  punctuationOffsetY: number;
  enableAlphabetRotation: boolean;
  alphabetRotationPattern: string;
  alphabetCharSpacingRatio: number;
}

/**
 * BlackBandMaskTextPrimitive専用パラメータ
 */
export interface BlackBandMaskTextPrimitiveParameters {
  maskBlendMode: 'normal' | 'multiply' | 'difference' | 'overlay' | 'screen';
}

/**
 * テンプレートごとのパラメータマッピング
 */
export type TemplateParameterMap = {
  'flickerfadetemplate': FlickerFadeParameters;
  'blinkfadetextprimitive': BlinkFadeTextPrimitiveParameters;
  'multilinetext': MultiLineTextParameters;
  'wordslidetext': WordSlideTextParameters;
  'wordslidetext2': WordSlideText2Parameters;
  'glitchtext': GlitchTextParameters;
  'multilinestacktemplate': MultiLineStackTemplateParameters;
  'verticaltexttemplate': VerticalTextTemplateParameters;
  'blackbandmasktextprimitive': BlackBandMaskTextPrimitiveParameters;
};

/**
 * テンプレートIDの型
 */
export type TemplateId = keyof TemplateParameterMap;

/**
 * 完全なパラメータセット（基本 + テンプレート固有）
 */
export type CompleteTemplateParameters<T extends TemplateId> = 
  StandardParameters & Partial<TemplateParameterMap[T]>;

/**
 * パラメータ設定の型ガード
 */
export function isTemplateParameter<T extends TemplateId>(
  templateId: T,
  key: string
): key is keyof TemplateParameterMap[T] {
  const templateParams: Record<TemplateId, string[]> = {
    'flickerfadetemplate': Object.keys({} as FlickerFadeParameters),
    'blinkfadetextprimitive': Object.keys({} as BlinkFadeTextPrimitiveParameters),
    'multilinetext': Object.keys({} as MultiLineTextParameters),
    'wordslidetext': Object.keys({} as WordSlideTextParameters),
    'wordslidetext2': Object.keys({} as WordSlideText2Parameters),
    'glitchtext': Object.keys({} as GlitchTextParameters),
    'multilinestacktemplate': Object.keys({} as MultiLineStackTemplateParameters),
    'verticaltexttemplate': Object.keys({} as VerticalTextTemplateParameters),
    'blackbandmasktextprimitive': Object.keys({} as BlackBandMaskTextPrimitiveParameters),
  };
  
  return templateParams[templateId]?.includes(key) ?? false;
}

/**
 * 標準パラメータかどうかの型ガード
 */
export function isStandardParameter(key: string): key is keyof StandardParameters {
  return key in ({} as StandardParameters);
}