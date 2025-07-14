/**
 * 全システムで使用する統一パラメータスキーマ
 * レガシー名は使用禁止
 */
export interface StandardParameters {
  // === 基本テキストパラメータ ===
  fontSize: number;
  fontFamily: string;
  textColor: string;           // 統一色パラメータ（fill, defaultTextColor廃止）
  
  // === テンプレート固有色パラメータ ===
  activeTextColor: string;     // アクティブ時の文字色
  completedTextColor: string;  // 完了時の文字色
  
  // === レイアウトパラメータ ===
  letterSpacing: number;
  lineHeight: number;
  offsetX: number;
  offsetY: number;
  
  // === エフェクトパラメータ ===
  enableGlow: boolean;
  glowStrength: number;
  glowBrightness: number;
  glowBlur: number;
  glowQuality: number;
  glowPadding: number;
  
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowAngle: number;
  shadowDistance: number;
  shadowAlpha: number;
  shadowOnly: boolean;
  
  // === その他 ===
  blendMode: string;
  
  // === テンプレート固有パラメータ ===
  // FlickerFadeTemplate用
  preInDuration?: number;
  flickerMinFrequency?: number;
  flickerMaxFrequency?: number;
  flickerIntensity?: number;
  flickerRandomness?: number;
  frequencyLerpSpeed?: number;
  fadeInVariation?: number;
  fadeOutVariation?: number;
  fadeOutDuration?: number;
  fullDisplayThreshold?: number;
  charSpacing?: number;
  
  // MultiLineText用
  totalLines?: number;
  lineSpacing?: number;
  resetInterval?: number;
  manualLineNumber?: number;
  phraseOverlapThreshold?: number;
  phraseOffsetX?: number;
  phraseOffsetY?: number;
  
  // WordSlideText用
  headTime?: number;
  tailTime?: number;
  entranceInitialSpeed?: number;
  initialSpeed?: number; // 互換性のためのエイリアス
  activeSpeed?: number;
  rightOffset?: number;
  randomPlacement?: boolean;
  randomSeed?: number;
  randomRangeX?: number;
  randomRangeY?: number;
  minDistanceFromPrevious?: number;
  
  // MultiLineText固有の色設定
  inactiveColor?: string;
  activeColor?: string;
  completedColor?: string;
  
  // MultiLineText固有の形状パラメータ
  shapeSize?: number;
  innerShapeSize?: number;
  shapeSizeGrowSpeed?: number;
  innerShapeSizeGrowSpeed?: number;
  shapeRotationSpeed?: number;
  innerShapeRotationSpeed?: number;
  shapeLineWidth?: number;
  innerShapeLineWidth?: number;
  shapeOffsetX?: number;
  shapeOffsetY?: number;
  shapeStartAngle?: number;
  innerShapeStartAngle?: number;
  
  // GlitchText固有のパラメータ
  enableGlitch?: boolean;
  glitchBlockSize?: number;
  glitchBlockCount?: number;
  glitchUpdateInterval?: number;
  glitchIntensity?: number;
  glitchColorShift?: boolean;
  glitchThreshold?: number;
  glitchWaveSpeed?: number;
  glitchRandomness?: number;
}

/**
 * パラメータのデフォルト値定義
 */
export const DEFAULT_PARAMETERS: StandardParameters = {
  // 基本パラメータ
  fontSize: 120,
  fontFamily: 'Arial',
  textColor: '#FFA500',
  activeTextColor: '#FFFF80',
  completedTextColor: '#FFF7EB',
  
  // レイアウト
  letterSpacing: 0,
  lineHeight: 150,
  offsetX: 0,
  offsetY: 0,
  
  // エフェクト
  enableGlow: true,
  glowStrength: 1.5,
  glowBrightness: 1.2,
  glowBlur: 6,
  glowQuality: 8,
  glowPadding: 50,
  
  enableShadow: false,
  shadowBlur: 6,
  shadowColor: '#000000',
  shadowAngle: 45,
  shadowDistance: 8,
  shadowAlpha: 0.8,
  shadowOnly: false,
  
  blendMode: 'normal',
  
  // テンプレート固有（オプショナル）
  preInDuration: 1500,
  flickerMinFrequency: 2,
  flickerMaxFrequency: 15,
  flickerIntensity: 0.8,
  flickerRandomness: 0.7,
  frequencyLerpSpeed: 0.15,
  fadeInVariation: 500,
  fadeOutVariation: 800,
  fadeOutDuration: 1000,
  fullDisplayThreshold: 0.85,
  charSpacing: 1.0,
  
  totalLines: 4,
  lineSpacing: 150,
  resetInterval: 2000,
  manualLineNumber: -1,
  phraseOverlapThreshold: 1000,
  phraseOffsetX: 0,
  phraseOffsetY: 0,
  
  // WordSlideText用デフォルト値
  headTime: 500,
  tailTime: 500,
  entranceInitialSpeed: 1.0,
  initialSpeed: 1.0, // 互換性のためのエイリアス
  activeSpeed: 0.5,
  rightOffset: 100,
  randomPlacement: false,
  randomSeed: 12345,
  randomRangeX: 50,
  randomRangeY: 50,
  minDistanceFromPrevious: 100,
  
  // MultiLineText用デフォルト値
  inactiveColor: "#9d016c",
  activeColor: "#fae0ff",
  completedColor: "#f78dee",
  
  // MultiLineText形状パラメータデフォルト値
  shapeSize: 50,
  innerShapeSize: 30,
  shapeSizeGrowSpeed: 370,
  innerShapeSizeGrowSpeed: 400,
  shapeRotationSpeed: 100,
  innerShapeRotationSpeed: 100,
  shapeLineWidth: 8,
  innerShapeLineWidth: 4,
  shapeOffsetX: 0,
  shapeOffsetY: 0,
  shapeStartAngle: 0,
  innerShapeStartAngle: 0,
  
  // GlitchText用デフォルト値
  enableGlitch: true,
  glitchBlockSize: 8,
  glitchBlockCount: 10,
  glitchUpdateInterval: 100,
  glitchIntensity: 0.5,
  glitchColorShift: true,
  glitchThreshold: 0.3,
  glitchWaveSpeed: 2.0,
  glitchRandomness: 0.5
};