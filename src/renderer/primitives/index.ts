/**
 * 協調的プリミティブライブラリ v2.1
 * 文字重複表示防止機能付きLLMテンプレート生成システム
 */

// 型定義のエクスポート
export * from './types';

// レイアウトプリミティブ
export { CumulativeLayoutPrimitive } from './layout/CumulativeLayoutPrimitive';
export { ImprovedCumulativeLayoutPrimitive } from './layout/ImprovedCumulativeLayoutPrimitive';
export { 
  EnhancedCumulativeLayoutPrimitive,
  type CharacterData,
  type EnhancedCumulativeLayoutParams,
  type CharacterManagementResult
} from './layout/EnhancedCumulativeLayoutPrimitive';
export { 
  MultiLineLayoutPrimitive,
  type MultiLineLayoutParams,
  type MultiLineLayoutResult,
  type LineAssignment as MultiLineAssignment,
  type MultiLinePhraseParams,
  type MultiLineResult as MultiLinePhraseResult
} from './layout/MultiLineLayoutPrimitive';
export { 
  FlexibleCumulativeLayoutPrimitive,
  WordDisplayMode,
  type FlexibleCharacterData,
  type FlexibleCumulativeLayoutParams,
  type FlexibleCharacterManagementResult
} from './layout/FlexibleCumulativeLayoutPrimitive';
export {
  VerticalLayoutPrimitive,
  type TextDirection,
  type VerticalStartPosition,
  type VerticalLineDirection,
  type VerticalLayoutParams,
  type VerticalCharacterManagementResult
} from './layout/VerticalLayoutPrimitive';

// アニメーションプリミティブ
export { SlideAnimationPrimitive } from './animation/SlideAnimationPrimitive';

// エフェクトプリミティブ
export { GlowEffectPrimitive } from './effects/GlowEffectPrimitive';
export { 
  GlitchEffectPrimitive,
  type GlitchEffectParams
} from './effects/GlitchEffectPrimitive';
export { 
  SparkleEffectPrimitive,
  type SparkleEffectParams
} from './effects/SparkleEffectPrimitive';

// 安全なプリミティブシステム（v2.1新機能）
export { 
  SafeCharacterManager,
  CharacterManagementMode,
  type SafeCharacterConfig,
  type CharacterData,
  type CharacterManagementResult
} from './safe/SafeCharacterManager';

export {
  CharacterOverlapDetector,
  type OverlapDetectionResult,
  type DetectionConfig
} from './safe/CharacterOverlapDetector';

// LLMフレンドリーな意図ベースAPI
export { IntentBasedAPI } from './api/IntentBasedAPI';

// プリミティブライブラリファクトリ
export { PrimitiveLibrary } from './api/PrimitiveLibrary';

// グラフィックプリミティブ（v0.5.1新機能）
export {
  GraphicsContainerPrimitive,
  type GraphicsTimingInfo,
  type GraphicsLayerConfig,
  type GraphicsLifecycle
} from './graphics';

export {
  ShapePrimitive,
  type RectangleParams,
  type CircleParams,
  type PolygonParams,
  type AnimationConfig
} from './graphics';