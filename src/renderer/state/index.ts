/**
 * State management system exports
 */

export { StateManager } from './StateManager';
export { StateCalculator } from './StateCalculator';
export type {
  IStateManager,
  ObjectState,
  EffectState,
  GraphicsState,
  RenderState,
  TimeRange,
  AnimationPhase,
  HierarchyType,
  EffectType
} from './StateManager';

// Re-export for convenience
export { TemplateAdapter } from '../types/StatelessTemplate';
export type { IStatelessTemplate, TemplateParams } from '../types/StatelessTemplate';