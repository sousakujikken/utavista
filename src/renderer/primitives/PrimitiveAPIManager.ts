/**
 * PrimitiveAPIManager - 責任分離検証付きプリミティブ実行システム
 * 階層別責任を100%強制し、違反時は実行を拒否する
 * 
 * 参照: development-directive-final.md#3.1, primitive-responsibility-specification.md
 */

import { ResponsibilityValidator, ValidationResult, ResponsibilityViolation } from '../validators/ResponsibilityValidator';
import { HierarchyType } from '../types/types';
import { LayerState, ChildInstruction, PrimitiveResult } from './types';

export interface IPrimitive {
  readonly name: string;
  readonly allowedLevels: HierarchyType[];
  readonly responsibilityCategory: ResponsibilityCategory;
  execute(data: PrimitiveExecutionData): Promise<PrimitiveResult>;
  validate?(data: PrimitiveExecutionData): ValidationResult;
}

export interface PrimitiveExecutionData {
  level: HierarchyType;
  layerState: LayerState;
  childInstructions?: ChildInstruction[];
  params: Record<string, any>;
  container: import('pixi.js').Container;
}

export interface PrimitiveResult {
  success: boolean;
  level: HierarchyType;
  modifications: PrimitiveModification[];
  errors?: string[];
  warnings?: string[];
  performance?: {
    executionTime: number;
    memoryUsed: number;
  };
}

export interface PrimitiveModification {
  type: 'position' | 'alpha' | 'scale' | 'text' | 'style' | 'visibility';
  target: 'self' | 'children' | 'specific_child';
  targetId?: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

export type ResponsibilityCategory = 'positioning' | 'fade' | 'group_movement' | 
                                   'character_management' | 'spacing' | 'grouping' |
                                   'text_rendering' | 'individual_animation' | 'effects';

/**
 * 責任分離エラー
 */
export class ResponsibilityViolationError extends Error {
  constructor(
    public level: HierarchyType,
    public violations: ResponsibilityViolation[],
    public primitiveInfo: { name: string; category: ResponsibilityCategory }
  ) {
    super(`Responsibility violation in ${level} level: ${violations.map(v => v.description).join(', ')}`);
    this.name = 'ResponsibilityViolationError';
  }
}

/**
 * 階層分離システム用プリミティブAPIマネージャー
 */
export class PrimitiveAPIManager {
  private registry: Map<string, IPrimitive> = new Map();
  private validator: typeof ResponsibilityValidator = ResponsibilityValidator;
  private executionHistory: PrimitiveExecution[] = [];
  private readonly MAX_HISTORY = 1000;

  // 責任分離ルール（development-directive-final.md#1.2準拠）
  private readonly LEVEL_RESPONSIBILITIES = {
    phrase: {
      ALLOWED: ['positioning', 'fade', 'group_movement'] as ResponsibilityCategory[],
      FORBIDDEN: ['text_rendering', 'character_management', 'individual_animation', 'effects'] as ResponsibilityCategory[]
    },
    word: {
      ALLOWED: ['character_management', 'spacing', 'grouping'] as ResponsibilityCategory[],
      FORBIDDEN: ['text_rendering', 'positioning', 'fade', 'individual_animation', 'effects'] as ResponsibilityCategory[]
    },
    character: {
      ALLOWED: ['text_rendering', 'individual_animation', 'effects'] as ResponsibilityCategory[],
      FORBIDDEN: ['positioning', 'fade', 'group_movement', 'character_management', 'spacing', 'grouping'] as ResponsibilityCategory[]
    }
  } as const;

  constructor() {
    console.log('[PrimitiveAPIManager] Initializing with strict responsibility separation');
  }

  /**
   * プリミティブの登録
   * 責任分離ルールに従って登録可否を判定
   */
  registerPrimitive(primitive: IPrimitive): boolean {
    try {
      // 責任分離適合性チェック
      const compatibilityCheck = this.checkPrimitiveCompatibility(primitive);
      if (!compatibilityCheck.isValid) {
        console.error(`[PrimitiveAPIManager] Cannot register primitive ${primitive.name}:`, compatibilityCheck.violations);
        return false;
      }

      // 実装検証
      const implementationValidation = this.validator.validateImplementation(
        primitive.execute,
        primitive.allowedLevels[0] // 最初の許可レベルで検証
      );

      if (!implementationValidation.isValid) {
        console.error(`[PrimitiveAPIManager] Implementation validation failed for ${primitive.name}:`, implementationValidation.violations);
        return false;
      }

      this.registry.set(primitive.name, primitive);
      console.log(`[PrimitiveAPIManager] Registered primitive: ${primitive.name} (${primitive.responsibilityCategory})`);
      return true;

    } catch (error) {
      console.error(`[PrimitiveAPIManager] Registration error for ${primitive.name}:`, error);
      return false;
    }
  }

  /**
   * 責任分離検証付きプリミティブ実行
   * 違反時は実行を拒否し、エラーを投げる
   */
  async executePrimitive(
    primitiveName: string,
    level: HierarchyType,
    data: PrimitiveExecutionData
  ): Promise<PrimitiveResult> {
    const executionStart = performance.now();
    const primitive = this.registry.get(primitiveName);

    if (!primitive) {
      throw new Error(`Primitive not found: ${primitiveName}`);
    }

    try {
      // 1. レベル適合性チェック
      if (!primitive.allowedLevels.includes(level)) {
        throw new ResponsibilityViolationError(level, [
          {
            rule: 'level_compatibility',
            level,
            description: `Primitive ${primitiveName} is not allowed on ${level} level`,
            severity: 'error'
          }
        ], { name: primitive.name, category: primitive.responsibilityCategory });
      }

      // 2. 責任分離違反チェック（詳細: responsibility-separation-detailed-design.md#5.1）
      const validation = this.validateResponsibility(primitive, level);
      if (!validation.isValid) {
        throw new ResponsibilityViolationError(level, validation.violations, {
          name: primitive.name,
          category: primitive.responsibilityCategory
        });
      }

      // 3. 実行時コンテナ検証
      const runtimeValidation = this.validator.validateAtRuntime(data.container, level);
      if (!runtimeValidation.isValid) {
        throw new ResponsibilityViolationError(level, runtimeValidation.violations, {
          name: primitive.name,
          category: primitive.responsibilityCategory
        });
      }

      // 4. プリミティブ実行
      const result = await primitive.execute(data);

      // 5. 実行後検証（結果が責任分離を守っているか）
      const postExecutionValidation = this.validateExecutionResult(result, level, primitive);
      if (!postExecutionValidation.isValid) {
        // 実行は成功したが責任分離に違反
        result.success = false;
        result.errors = result.errors || [];
        result.errors.push(...postExecutionValidation.violations.map(v => v.description));
      }

      // 6. パフォーマンス情報追加
      const executionTime = performance.now() - executionStart;
      result.performance = {
        executionTime,
        memoryUsed: this.getMemoryUsage()
      };

      // 7. 実行履歴に記録
      this.recordExecution({
        primitiveName,
        level,
        result,
        timestamp: Date.now(),
        executionTime,
        violations: validation.violations.length
      });

      return result;

    } catch (error) {
      // エラー時も履歴に記録
      this.recordExecution({
        primitiveName,
        level,
        result: { success: false, level, modifications: [], errors: [error.toString()] },
        timestamp: Date.now(),
        executionTime: performance.now() - executionStart,
        violations: error instanceof ResponsibilityViolationError ? error.violations.length : 0
      });

      throw error;
    }
  }

  /**
   * プリミティブ適合性チェック
   */
  private checkPrimitiveCompatibility(primitive: IPrimitive): ValidationResult {
    const violations: ResponsibilityViolation[] = [];

    // 各レベルでの責任カテゴリ適合性をチェック
    primitive.allowedLevels.forEach(level => {
      const levelRules = this.LEVEL_RESPONSIBILITIES[level];
      
      if (levelRules.FORBIDDEN.includes(primitive.responsibilityCategory)) {
        violations.push({
          rule: 'category_forbidden',
          level,
          description: `Category '${primitive.responsibilityCategory}' is forbidden at ${level} level`,
          severity: 'error'
        });
      }

      if (!levelRules.ALLOWED.includes(primitive.responsibilityCategory)) {
        violations.push({
          rule: 'category_not_allowed',
          level,
          description: `Category '${primitive.responsibilityCategory}' is not explicitly allowed at ${level} level`,
          severity: 'warning'
        });
      }
    });

    return {
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      level: primitive.allowedLevels[0],
      checkedRules: primitive.allowedLevels.length * 2, // ALLOWED + FORBIDDEN チェック
      passedRules: primitive.allowedLevels.length * 2 - violations.length
    };
  }

  /**
   * 責任分離検証
   */
  private validateResponsibility(primitive: IPrimitive, level: HierarchyType): ValidationResult {
    const levelRules = this.LEVEL_RESPONSIBILITIES[level];
    const violations: ResponsibilityViolation[] = [];

    // カテゴリ適合性チェック
    if (levelRules.FORBIDDEN.includes(primitive.responsibilityCategory)) {
      violations.push({
        rule: 'responsibility_violation',
        level,
        description: `Primitive category '${primitive.responsibilityCategory}' violates ${level} level responsibilities`,
        severity: 'error',
        location: `primitive: ${primitive.name}`
      });
    }

    return {
      isValid: violations.length === 0,
      violations,
      level,
      checkedRules: 1,
      passedRules: violations.length === 0 ? 1 : 0
    };
  }

  /**
   * 実行結果検証
   */
  private validateExecutionResult(
    result: PrimitiveResult,
    level: HierarchyType,
    primitive: IPrimitive
  ): ValidationResult {
    const violations: ResponsibilityViolation[] = [];

    // 実行結果が責任分離を守っているかチェック
    result.modifications.forEach(mod => {
      const violation = this.checkModificationResponsibility(mod, level, primitive);
      if (violation) {
        violations.push(violation);
      }
    });

    return {
      isValid: violations.length === 0,
      violations,
      level,
      checkedRules: result.modifications.length,
      passedRules: result.modifications.length - violations.length
    };
  }

  /**
   * 変更の責任分離チェック
   */
  private checkModificationResponsibility(
    modification: PrimitiveModification,
    level: HierarchyType,
    primitive: IPrimitive
  ): ResponsibilityViolation | null {
    // レベル別変更可能項目チェック
    const levelRules = this.LEVEL_RESPONSIBILITIES[level];

    // フレーズレベルの制限
    if (level === 'phrase') {
      if (modification.type === 'text') {
        return {
          rule: 'phrase_text_forbidden',
          level,
          description: 'Phrase level cannot modify text content',
          severity: 'error',
          location: `primitive: ${primitive.name}, modification: ${modification.type}`
        };
      }
    }

    // ワードレベルの制限  
    if (level === 'word') {
      if (modification.type === 'text') {
        return {
          rule: 'word_text_forbidden',
          level,
          description: 'Word level cannot modify text content',
          severity: 'error',
          location: `primitive: ${primitive.name}, modification: ${modification.type}`
        };
      }
    }

    // キャラクターレベルの制限
    if (level === 'character') {
      if (modification.target === 'children' && modification.type === 'position') {
        return {
          rule: 'character_children_position_forbidden',
          level,
          description: 'Character level cannot modify children positions (word responsibility)',
          severity: 'error',
          location: `primitive: ${primitive.name}, modification: ${modification.type}`
        };
      }
    }

    return null;
  }

  /**
   * 実行履歴記録
   */
  private recordExecution(execution: PrimitiveExecution): void {
    this.executionHistory.push(execution);
    
    // 履歴サイズ管理
    if (this.executionHistory.length > this.MAX_HISTORY) {
      this.executionHistory.shift();
    }
  }

  /**
   * メモリ使用量取得（概算）
   */
  private getMemoryUsage(): number {
    if (typeof (performance as any).memory !== 'undefined') {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * 登録済みプリミティブ一覧取得
   */
  getRegisteredPrimitives(): Array<{name: string; category: ResponsibilityCategory; levels: HierarchyType[]}> {
    return Array.from(this.registry.values()).map(primitive => ({
      name: primitive.name,
      category: primitive.responsibilityCategory,
      levels: primitive.allowedLevels
    }));
  }

  /**
   * 実行統計取得
   */
  getExecutionStats(): PrimitiveExecutionStats {
    const stats = this.executionHistory.reduce((acc, exec) => {
      acc.totalExecutions++;
      if (exec.result.success) acc.successfulExecutions++;
      if (exec.violations > 0) acc.violationCount += exec.violations;
      acc.totalExecutionTime += exec.executionTime;
      
      // レベル別統計
      acc.executionsByLevel[exec.level] = (acc.executionsByLevel[exec.level] || 0) + 1;
      
      return acc;
    }, {
      totalExecutions: 0,
      successfulExecutions: 0,
      violationCount: 0,
      totalExecutionTime: 0,
      executionsByLevel: {} as Record<HierarchyType, number>
    });

    return {
      ...stats,
      successRate: stats.totalExecutions > 0 ? stats.successfulExecutions / stats.totalExecutions : 0,
      averageExecutionTime: stats.totalExecutions > 0 ? stats.totalExecutionTime / stats.totalExecutions : 0,
      violationRate: stats.totalExecutions > 0 ? stats.violationCount / stats.totalExecutions : 0
    };
  }

  /**
   * デバッグ情報取得
   */
  getDebugInfo(): Record<string, any> {
    const stats = this.getExecutionStats();
    
    return {
      registeredPrimitives: this.getRegisteredPrimitives(),
      executionStats: stats,
      responsibilityRules: this.LEVEL_RESPONSIBILITIES,
      recentExecutions: this.executionHistory.slice(-10),
      validator: this.validator.getDebugInfo()
    };
  }
}

interface PrimitiveExecution {
  primitiveName: string;
  level: HierarchyType;
  result: PrimitiveResult;
  timestamp: number;
  executionTime: number;
  violations: number;
}

interface PrimitiveExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  violationCount: number;
  totalExecutionTime: number;
  successRate: number;
  averageExecutionTime: number;
  violationRate: number;
  executionsByLevel: Record<HierarchyType, number>;
}