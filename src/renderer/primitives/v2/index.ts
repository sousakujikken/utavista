/**
 * プリミティブ v2.0 エクスポートファイル
 * 階層分離型プリミティブアーキテクチャの統一エントリポイント
 */

// ファクトリー
export { PrimitiveFactory } from './PrimitiveFactory';

// 型定義
export * from './types';

// 位置計算プリミティブ
export { PhrasePositionPrimitive } from './position/PhrasePositionPrimitive';
export { WordPositionPrimitive } from './position/WordPositionPrimitive';

// レイアウト管理プリミティブ
export { CharacterLayoutPrimitive } from './layout/CharacterLayoutPrimitive';

// エフェクトプリミティブ
export { BlurEffectPrimitive } from './effects/BlurEffectPrimitive';
export { GlitchEffectPrimitive } from './effects/GlitchEffectPrimitive';

// 基底クラス
export { HierarchicalAnimationTemplate } from './base/HierarchicalAnimationTemplate';

// 便利な型エイリアス
export type {
  Position,
  HierarchyType,
  BasePrimitive,
  CalculationParams,
  PhrasePositionParams,
  RandomPlacementParams,
  WordPositionParams,
  WordSlideParams,
  CharacterLayoutParams,
  CharacterLayoutResult,
  BlurEffectParams,
  GlitchEffectParams,
  ValidationResult
} from './types';

/**
 * プリミティブv2.0システムの診断情報を取得
 */
export function getSystemDiagnostics() {
  return {
    version: '2.0.0',
    architecture: 'hierarchical-separation',
    primitiveTypes: [
      'PhrasePositionPrimitive',
      'WordPositionPrimitive', 
      'CharacterLayoutPrimitive',
      'BlurEffectPrimitive',
      'GlitchEffectPrimitive'
    ],
    factoryDiagnostics: PrimitiveFactory.getDiagnostics(),
    timestamp: Date.now()
  };
}