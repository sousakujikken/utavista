/**
 * ResponsibilityValidator - 責任分離100%検証システム
 * 階層別責任の遵守を実装時・実行時の両方で厳格にチェック
 * 
 * 参照: development-directive-final.md#5.1, responsibility-separation-detailed-design.md#5.1
 */

import * as PIXI from 'pixi.js';
import { HierarchyType } from '../types/types';

export interface ValidationResult {
  isValid: boolean;
  violations: ResponsibilityViolation[];
  level: HierarchyType;
  checkedRules: number;
  passedRules: number;
}

export interface ResponsibilityViolation {
  rule: string;
  level: HierarchyType;
  description: string;
  severity: 'error' | 'warning';
  location?: string;
}

export interface RuntimeValidationResult extends ValidationResult {
  containerInfo: ContainerAnalysis;
  textObjectCount: number;
  childAnalysis: ChildAnalysis[];
}

export interface ContainerAnalysis {
  name: string;
  childCount: number;
  hasTextObjects: boolean;
  hasContainerChildren: boolean;
  position: { x: number; y: number };
  alpha: number;
}

export interface ChildAnalysis {
  type: string;
  isTextObject: boolean;
  properties: Record<string, any>;
}

/**
 * 責任分離の絶対ルール（development-directive-final.md#1.2準拠）
 */
const RESPONSIBILITY_RULES = {
  phrase: {
    ALLOWED: ['positioning', 'fade', 'group_movement'],
    FORBIDDEN: ['text_rendering', 'character_control'],
    CHECKS: [
      'no_text_creation',
      'no_direct_character_manipulation',
      'position_control_only',
      'alpha_control_only'
    ]
  },
  word: {
    ALLOWED: ['character_management', 'spacing', 'grouping'],
    FORBIDDEN: ['text_rendering', 'phrase_control'],
    CHECKS: [
      'no_text_creation',
      'character_container_management_only',
      'spacing_control_only',
      'no_phrase_level_changes'
    ]
  },
  character: {
    ALLOWED: ['text_rendering', 'individual_animation', 'effects'],
    FORBIDDEN: ['word_management', 'phrase_control'],
    CHECKS: [
      'text_creation_allowed',
      'individual_effects_only',
      'no_sibling_manipulation'
    ]
  }
} as const;

export class ResponsibilityValidator {
  private static violationHistory: ResponsibilityViolation[] = [];
  private static validationCount: number = 0;
  
  /**
   * 実装時検証（静的解析風）
   * コード実装が責任分離ルールに従っているかチェック
   */
  static validateImplementation(
    implementation: any,
    level: HierarchyType
  ): ValidationResult {
    const violations: ResponsibilityViolation[] = [];
    const rules = RESPONSIBILITY_RULES[level];
    let checkedRules = 0;
    
    // コードパターン解析（簡易版）
    if (typeof implementation === 'function') {
      const code = implementation.toString();
      
      // フレーズレベル検証
      if (level === 'phrase') {
        checkedRules += this.validatePhraseImplementation(code, violations);
      }
      // ワードレベル検証
      else if (level === 'word') {
        checkedRules += this.validateWordImplementation(code, violations);
      }
      // キャラクターレベル検証
      else if (level === 'character') {
        checkedRules += this.validateCharacterImplementation(code, violations);
      }
    }
    
    const passedRules = checkedRules - violations.length;
    this.violationHistory.push(...violations);
    this.validationCount++;
    
    return {
      isValid: violations.length === 0,
      violations,
      level,
      checkedRules,
      passedRules
    };
  }
  
  /**
   * 実行時検証（動的解析）
   * 実際のPIXIコンテナが責任分離を守っているかチェック
   */
  static validateAtRuntime(
    container: PIXI.Container,
    level: HierarchyType
  ): RuntimeValidationResult {
    const violations: ResponsibilityViolation[] = [];
    let checkedRules = 0;
    
    // コンテナ分析
    const containerInfo = this.analyzeContainer(container);
    
    // 子要素分析
    const childAnalysis = this.analyzeChildren(container);
    
    // レベル別実行時チェック
    if (level === 'phrase') {
      checkedRules += this.validatePhraseRuntime(container, containerInfo, violations);
    } else if (level === 'word') {
      checkedRules += this.validateWordRuntime(container, containerInfo, violations);
    } else if (level === 'character') {
      checkedRules += this.validateCharacterRuntime(container, containerInfo, violations);
    }
    
    const passedRules = checkedRules - violations.length;
    const textObjectCount = this.countTextObjects(container);
    
    this.violationHistory.push(...violations);
    this.validationCount++;
    
    return {
      isValid: violations.length === 0,
      violations,
      level,
      checkedRules,
      passedRules,
      containerInfo,
      textObjectCount,
      childAnalysis
    };
  }
  
  /**
   * フレーズ実装検証
   */
  private static validatePhraseImplementation(code: string, violations: ResponsibilityViolation[]): number {
    let checkedRules = 0;
    
    // テキスト作成の禁止チェック
    if (code.includes('new PIXI.Text') || code.includes('PIXI.Text(')) {
      violations.push({
        rule: 'no_text_creation',
        level: 'phrase',
        description: 'Phrase level cannot create PIXI.Text objects',
        severity: 'error',
        location: 'code analysis'
      });
    }
    checkedRules++;
    
    // 個別文字制御の禁止チェック
    if (code.match(/\.children\[\d+\]\.(?:text|style|anchor)/)) {
      violations.push({
        rule: 'no_direct_character_manipulation',
        level: 'phrase',
        description: 'Phrase level cannot directly manipulate character properties',
        severity: 'error',
        location: 'code analysis'
      });
    }
    checkedRules++;
    
    return checkedRules;
  }
  
  /**
   * ワード実装検証
   */
  private static validateWordImplementation(code: string, violations: ResponsibilityViolation[]): number {
    let checkedRules = 0;
    
    // テキスト作成の禁止チェック
    if (code.includes('new PIXI.Text') || code.includes('PIXI.Text(')) {
      violations.push({
        rule: 'no_text_creation',
        level: 'word',
        description: 'Word level cannot create PIXI.Text objects',
        severity: 'error',
        location: 'code analysis'
      });
    }
    checkedRules++;
    
    // フレーズ制御の禁止チェック
    if (code.includes('phraseContainer') || code.match(/\.parent\.(?:position|alpha|scale)/)) {
      violations.push({
        rule: 'no_phrase_level_changes',
        level: 'word',
        description: 'Word level cannot control phrase-level properties',
        severity: 'error',
        location: 'code analysis'
      });
    }
    checkedRules++;
    
    return checkedRules;
  }
  
  /**
   * キャラクター実装検証
   */
  private static validateCharacterImplementation(code: string, violations: ResponsibilityViolation[]): number {
    let checkedRules = 0;
    
    // 兄弟要素操作の禁止チェック
    if (code.match(/siblings|\.parent\.children\[\d+\]/)) {
      violations.push({
        rule: 'no_sibling_manipulation',
        level: 'character',
        description: 'Character level cannot manipulate sibling containers',
        severity: 'warning',
        location: 'code analysis'
      });
    }
    checkedRules++;
    
    // 上位レベル制御の禁止チェック
    if (code.match(/wordContainer|phraseContainer/)) {
      violations.push({
        rule: 'no_upward_control',
        level: 'character',
        description: 'Character level cannot control word or phrase level',
        severity: 'error',
        location: 'code analysis'
      });
    }
    checkedRules++;
    
    return checkedRules;
  }
  
  /**
   * フレーズ実行時検証
   */
  private static validatePhraseRuntime(
    container: PIXI.Container, 
    info: ContainerAnalysis, 
    violations: ResponsibilityViolation[]
  ): number {
    let checkedRules = 0;
    
    // テキストオブジェクトの存在チェック
    if (info.hasTextObjects) {
      violations.push({
        rule: 'no_text_objects',
        level: 'phrase',
        description: 'Phrase container must not contain PIXI.Text objects',
        severity: 'error',
        location: `container: ${info.name}`
      });
    }
    checkedRules++;
    
    return checkedRules;
  }
  
  /**
   * ワード実行時検証
   */
  private static validateWordRuntime(
    container: PIXI.Container, 
    info: ContainerAnalysis, 
    violations: ResponsibilityViolation[]
  ): number {
    let checkedRules = 0;
    
    // テキストオブジェクトの存在チェック
    if (info.hasTextObjects) {
      violations.push({
        rule: 'no_text_objects',
        level: 'word',
        description: 'Word container must not contain PIXI.Text objects',
        severity: 'error',
        location: `container: ${info.name}`
      });
    }
    checkedRules++;
    
    return checkedRules;
  }
  
  /**
   * キャラクター実行時検証
   */
  private static validateCharacterRuntime(
    container: PIXI.Container, 
    info: ContainerAnalysis, 
    violations: ResponsibilityViolation[]
  ): number {
    let checkedRules = 0;
    
    // キャラクターレベルはテキストオブジェクト許可
    // 必要に応じて他のルールを追加
    
    return checkedRules;
  }
  
  /**
   * コンテナ分析
   */
  private static analyzeContainer(container: PIXI.Container): ContainerAnalysis {
    return {
      name: (container as any).name || 'unnamed',
      childCount: container.children.length,
      hasTextObjects: container.children.some(child => child instanceof PIXI.Text),
      hasContainerChildren: container.children.some(child => child instanceof PIXI.Container),
      position: { x: container.position.x, y: container.position.y },
      alpha: container.alpha
    };
  }
  
  /**
   * 子要素分析
   */
  private static analyzeChildren(container: PIXI.Container): ChildAnalysis[] {
    return container.children.map(child => ({
      type: child.constructor.name,
      isTextObject: child instanceof PIXI.Text,
      properties: {
        visible: child.visible,
        alpha: child.alpha,
        position: { x: child.position.x, y: child.position.y }
      }
    }));
  }
  
  /**
   * テキストオブジェクト数カウント
   */
  private static countTextObjects(container: PIXI.Container): number {
    let count = 0;
    
    container.children.forEach(child => {
      if (child instanceof PIXI.Text) {
        count++;
      }
      if (child instanceof PIXI.Container) {
        count += this.countTextObjects(child);
      }
    });
    
    return count;
  }
  
  /**
   * 全体検証統計
   */
  static getValidationStats(): {
    totalValidations: number;
    totalViolations: number;
    violationsByLevel: Record<HierarchyType, number>;
    violationsBySeverity: Record<'error' | 'warning', number>;
  } {
    const violationsByLevel = this.violationHistory.reduce((acc, violation) => {
      acc[violation.level] = (acc[violation.level] || 0) + 1;
      return acc;
    }, {} as Record<HierarchyType, number>);
    
    const violationsBySeverity = this.violationHistory.reduce((acc, violation) => {
      acc[violation.severity] = (acc[violation.severity] || 0) + 1;
      return acc;
    }, { error: 0, warning: 0 });
    
    return {
      totalValidations: this.validationCount,
      totalViolations: this.violationHistory.length,
      violationsByLevel,
      violationsBySeverity
    };
  }
  
  /**
   * 違反履歴クリア
   */
  static clearViolationHistory(): void {
    this.violationHistory = [];
    this.validationCount = 0;
  }
  
  /**
   * 高度な実装時検証（コード静的解析）
   * プリミティブクラスの実装が責任分離を守っているかを詳細チェック
   */
  static validatePrimitiveImplementation(
    primitiveClass: any,
    level: HierarchyType,
    category: string
  ): ValidationResult {
    const violations: ResponsibilityViolation[] = [];
    let checkedRules = 0;

    try {
      // クラス定義の検証
      if (typeof primitiveClass === 'function') {
        const classString = primitiveClass.toString();
        
        // メソッド存在チェック
        if (!classString.includes('execute')) {
          violations.push({
            rule: 'missing_execute_method',
            level,
            description: 'Primitive must implement execute method',
            severity: 'error',
            location: 'class definition'
          });
        }
        checkedRules++;

        // 責任分離チェック（レベル別）
        checkedRules += this.checkClassResponsibility(classString, level, violations);

        // プロトタイプメソッドチェック
        if (primitiveClass.prototype && primitiveClass.prototype.execute) {
          const executeString = primitiveClass.prototype.execute.toString();
          checkedRules += this.validateExecuteMethod(executeString, level, violations);
        }
      }

    } catch (error) {
      violations.push({
        rule: 'validation_error',
        level,
        description: `Validation failed: ${error}`,
        severity: 'error',
        location: 'validation process'
      });
    }

    const passedRules = checkedRules - violations.length;
    this.violationHistory.push(...violations);
    this.validationCount++;

    return {
      isValid: violations.length === 0,
      violations,
      level,
      checkedRules,
      passedRules
    };
  }

  /**
   * クラス責任分離チェック
   */
  private static checkClassResponsibility(
    classString: string,
    level: HierarchyType,
    violations: ResponsibilityViolation[]
  ): number {
    let checkedRules = 0;

    // 共通禁止パターン
    const forbiddenPatterns = [
      { pattern: /new\s+PIXI\.Text\s*\(/, rule: 'text_creation', levels: ['phrase', 'word'] },
      { pattern: /\.addChild\s*\(\s*new\s+PIXI\.Text/, rule: 'direct_text_add', levels: ['phrase', 'word'] },
      { pattern: /\.removeChild/, rule: 'child_removal', levels: ['character'] },
      { pattern: /\.parent\./, rule: 'parent_manipulation', levels: ['character'] }
    ];

    forbiddenPatterns.forEach(({ pattern, rule, levels }) => {
      if (levels.includes(level) && pattern.test(classString)) {
        violations.push({
          rule,
          level,
          description: `${level} level cannot use ${rule.replace('_', ' ')}`,
          severity: 'error',
          location: 'class implementation'
        });
      }
      checkedRules++;
    });

    return checkedRules;
  }

  /**
   * executeメソッド検証
   */
  private static validateExecuteMethod(
    executeString: string,
    level: HierarchyType,
    violations: ResponsibilityViolation[]
  ): number {
    let checkedRules = 0;

    // 非同期パターンチェック
    if (!executeString.includes('async') && !executeString.includes('Promise')) {
      // 同期実行の場合の追加チェック
      checkedRules += this.validateSyncExecution(executeString, level, violations);
    }

    // パフォーマンスチェック
    if (executeString.includes('while(true)') || executeString.includes('for(;;)')) {
      violations.push({
        rule: 'infinite_loop_risk',
        level,
        description: 'Primitive should not contain infinite loops',
        severity: 'warning',
        location: 'execute method'
      });
    }
    checkedRules++;

    return checkedRules;
  }

  /**
   * 同期実行検証
   */
  private static validateSyncExecution(
    executeString: string,
    level: HierarchyType,
    violations: ResponsibilityViolation[]
  ): number {
    let checkedRules = 0;

    // 重い処理の検出
    const heavyOperations = [
      'JSON.parse',
      'JSON.stringify',
      'Math.pow',
      'setInterval',
      'setTimeout'
    ];

    heavyOperations.forEach(op => {
      if (executeString.includes(op)) {
        violations.push({
          rule: 'heavy_sync_operation',
          level,
          description: `Avoid heavy synchronous operation: ${op}`,
          severity: 'warning',
          location: 'execute method'
        });
      }
      checkedRules++;
    });

    return checkedRules;
  }

  /**
   * 実行時メモリリーク検証
   */
  static validateMemoryUsage(
    container: PIXI.Container,
    level: HierarchyType,
    beforeMemory: number,
    afterMemory: number
  ): ValidationResult {
    const violations: ResponsibilityViolation[] = [];
    const memoryIncrease = afterMemory - beforeMemory;
    const MEMORY_THRESHOLD = 1024 * 1024; // 1MB

    if (memoryIncrease > MEMORY_THRESHOLD) {
      violations.push({
        rule: 'memory_leak_risk',
        level,
        description: `Memory usage increased by ${(memoryIncrease / (1024 * 1024)).toFixed(2)}MB`,
        severity: 'warning',
        location: 'execution result'
      });
    }

    // オブジェクトリークの検出
    const objectCount = this.countContainerObjects(container);
    if (objectCount > 1000) {
      violations.push({
        rule: 'object_count_high',
        level,
        description: `Container has ${objectCount} objects, potential memory issue`,
        severity: 'warning',
        location: 'container analysis'
      });
    }

    return {
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      level,
      checkedRules: 2,
      passedRules: 2 - violations.length
    };
  }

  /**
   * コンテナ内オブジェクト数カウント（再帰）
   */
  private static countContainerObjects(container: PIXI.Container): number {
    let count = 1; // 自分自身
    container.children.forEach(child => {
      if (child instanceof PIXI.Container) {
        count += this.countContainerObjects(child);
      } else {
        count++;
      }
    });
    return count;
  }

  /**
   * バッチ検証（複数コンテナの一括検証）
   */
  static validateBatch(
    containers: Array<{ container: PIXI.Container; level: HierarchyType; id: string }>
  ): { results: RuntimeValidationResult[]; summary: BatchValidationSummary } {
    const results: RuntimeValidationResult[] = [];
    let totalViolations = 0;
    let totalChecks = 0;

    containers.forEach(({ container, level, id }) => {
      try {
        const result = this.validateAtRuntime(container, level);
        results.push({ ...result, containerId: id } as any);
        totalViolations += result.violations.length;
        totalChecks += result.checkedRules;
      } catch (error) {
        results.push({
          isValid: false,
          violations: [{
            rule: 'batch_validation_error',
            level,
            description: `Batch validation failed for ${id}: ${error}`,
            severity: 'error',
            location: `container: ${id}`
          }],
          level,
          checkedRules: 0,
          passedRules: 0,
          containerInfo: { name: id, childCount: 0, hasTextObjects: false, hasContainerChildren: false, position: { x: 0, y: 0 }, alpha: 1 },
          textObjectCount: 0,
          childAnalysis: [],
          containerId: id
        } as any);
      }
    });

    const summary: BatchValidationSummary = {
      totalContainers: containers.length,
      totalViolations,
      totalChecks,
      complianceRate: totalChecks > 0 ? (totalChecks - totalViolations) / totalChecks : 1,
      violationsByLevel: results.reduce((acc, result) => {
        acc[result.level] = (acc[result.level] || 0) + result.violations.length;
        return acc;
      }, {} as Record<HierarchyType, number>)
    };

    return { results, summary };
  }

  /**
   * デバッグ情報取得
   */
  static getDebugInfo(): Record<string, any> {
    const stats = this.getValidationStats();
    
    return {
      stats,
      rules: RESPONSIBILITY_RULES,
      recentViolations: this.violationHistory.slice(-10), // 最新10件
      complianceRate: this.validationCount > 0 
        ? `${((this.validationCount - stats.totalViolations) / this.validationCount * 100).toFixed(2)}%`
        : '100%',
      memoryUsage: typeof (performance as any).memory !== 'undefined' 
        ? {
            used: (performance as any).memory.usedJSHeapSize,
            total: (performance as any).memory.totalJSHeapSize,
            limit: (performance as any).memory.jsHeapSizeLimit
          }
        : null
    };
  }
}

interface BatchValidationSummary {
  totalContainers: number;
  totalViolations: number;
  totalChecks: number;
  complianceRate: number;
  violationsByLevel: Record<HierarchyType, number>;
}