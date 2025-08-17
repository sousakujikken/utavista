/**
 * PrimitiveTestSuite - プリミティブ責任分離100%検証システム
 * 各プリミティブの実装と実行が責任分離を完全に遵守しているかをテスト
 * 
 * 参照: development-directive-final.md#4.2, quality-assurance-design.md#3.2
 */

import * as PIXI from 'pixi.js';
import { PrimitiveAPIManager, IPrimitive } from './PrimitiveAPIManager';
import { ResponsibilityValidator } from '../validators/ResponsibilityValidator';
import { HierarchyType } from '../types/types';

// テスト対象プリミティブのインポート
import { PhrasePositioningPrimitive } from './hierarchy/phrase/PhrasePositioningPrimitive';
import { PhraseFadePrimitive } from './hierarchy/phrase/PhraseFadePrimitive';
import { WordLayoutPrimitive } from './hierarchy/word/WordLayoutPrimitive';
import { CharacterRenderingPrimitive } from './hierarchy/character/CharacterRenderingPrimitive';

export interface PrimitiveTestResult {
  primitiveName: string;
  level: HierarchyType;
  tests: TestResult[];
  overallResult: 'PASS' | 'FAIL';
  complianceRate: number;
  violations: any[];
  performance: {
    averageExecutionTime: number;
    memoryLeaks: boolean;
  };
}

export interface TestResult {
  testName: string;
  passed: boolean;
  details: string;
  executionTime?: number;
  violations?: any[];
}

export interface TestSuiteResult {
  totalPrimitives: number;
  passedPrimitives: number;
  overallComplianceRate: number;
  results: PrimitiveTestResult[];
  summary: {
    responsibilitySeparationRate: number;
    apiConsistencyRate: number;
    performanceScore: number;
  };
}

/**
 * プリミティブ責任分離テストスイート
 */
export class PrimitiveTestSuite {
  private apiManager: PrimitiveAPIManager;
  private app: PIXI.Application;
  private testContainers: Map<HierarchyType, PIXI.Container> = new Map();

  constructor() {
    this.apiManager = new PrimitiveAPIManager();
    this.app = new PIXI.Application({ width: 800, height: 600 });
    this.setupTestEnvironment();
  }

  /**
   * テスト環境セットアップ
   */
  private setupTestEnvironment(): void {
    // 階層別テストコンテナ作成
    const levels: HierarchyType[] = ['phrase', 'word', 'character'];
    
    levels.forEach(level => {
      const container = new PIXI.Container();
      (container as any).name = `test_${level}_container`;
      this.testContainers.set(level, container);
      this.app.stage.addChild(container);
    });

    // テスト用文字コンテナをワードに追加
    const wordContainer = this.testContainers.get('word')!;
    for (let i = 0; i < 5; i++) {
      const charContainer = new PIXI.Container();
      (charContainer as any).name = `char_container_${i}`;
      wordContainer.addChild(charContainer);
    }
  }

  /**
   * 全プリミティブテスト実行
   */
  async runAllTests(): Promise<TestSuiteResult> {
    console.log('[PrimitiveTestSuite] Starting comprehensive primitive testing...');

    // プリミティブ登録
    const primitives = this.registerTestPrimitives();
    
    const results: PrimitiveTestResult[] = [];
    let totalCompliance = 0;
    let totalTests = 0;

    // 各プリミティブのテスト実行
    for (const primitive of primitives) {
      const result = await this.testPrimitive(primitive);
      results.push(result);
      totalCompliance += result.complianceRate;
      totalTests++;
    }

    // 総合結果計算
    const overallComplianceRate = totalTests > 0 ? totalCompliance / totalTests : 0;
    const passedPrimitives = results.filter(r => r.overallResult === 'PASS').length;

    const summary = this.calculateSummary(results);

    console.log(`[PrimitiveTestSuite] Testing completed. Compliance rate: ${(overallComplianceRate * 100).toFixed(1)}%`);

    return {
      totalPrimitives: primitives.length,
      passedPrimitives,
      overallComplianceRate,
      results,
      summary
    };
  }

  /**
   * テスト対象プリミティブの登録
   */
  private registerTestPrimitives(): IPrimitive[] {
    const primitives = [
      new PhrasePositioningPrimitive(),
      new PhraseFadePrimitive(),
      new WordLayoutPrimitive(),
      new CharacterRenderingPrimitive()
    ];

    primitives.forEach(primitive => {
      const registered = this.apiManager.registerPrimitive(primitive);
      if (!registered) {
        console.error(`[PrimitiveTestSuite] Failed to register ${primitive.name}`);
      }
    });

    return primitives;
  }

  /**
   * 単一プリミティブテスト実行
   */
  private async testPrimitive(primitive: IPrimitive): Promise<PrimitiveTestResult> {
    console.log(`[PrimitiveTestSuite] Testing ${primitive.name}...`);

    const tests: TestResult[] = [];
    const violations: any[] = [];
    const executionTimes: number[] = [];
    const memoryBefore = this.getMemoryUsage();

    // テスト1: 実装時検証
    const implementationTest = this.testImplementation(primitive);
    tests.push(implementationTest);
    violations.push(...implementationTest.violations || []);

    // テスト2: 責任分離遵守テスト
    for (const level of primitive.allowedLevels) {
      const responsibilityTest = await this.testResponsibilitySeparation(primitive, level);
      tests.push(responsibilityTest);
      violations.push(...responsibilityTest.violations || []);
      
      if (responsibilityTest.executionTime) {
        executionTimes.push(responsibilityTest.executionTime);
      }
    }

    // テスト3: API一貫性テスト
    const apiTest = await this.testAPIConsistency(primitive);
    tests.push(apiTest);
    violations.push(...apiTest.violations || []);

    // テスト4: パフォーマンステスト
    const performanceTest = await this.testPerformance(primitive);
    tests.push(performanceTest);

    // メモリリークチェック
    const memoryAfter = this.getMemoryUsage();
    const memoryLeaks = (memoryAfter - memoryBefore) > 1024 * 1024; // 1MB threshold

    // 結果集計
    const passedTests = tests.filter(t => t.passed).length;
    const complianceRate = passedTests / tests.length;
    const overallResult = complianceRate >= 1.0 ? 'PASS' : 'FAIL';

    return {
      primitiveName: primitive.name,
      level: primitive.allowedLevels[0],
      tests,
      overallResult,
      complianceRate,
      violations,
      performance: {
        averageExecutionTime: executionTimes.length > 0 
          ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length 
          : 0,
        memoryLeaks
      }
    };
  }

  /**
   * 実装時検証テスト
   */
  private testImplementation(primitive: IPrimitive): TestResult {
    try {
      const validation = ResponsibilityValidator.validatePrimitiveImplementation(
        primitive.constructor,
        primitive.allowedLevels[0],
        primitive.responsibilityCategory
      );

      return {
        testName: 'Implementation Validation',
        passed: validation.isValid,
        details: validation.isValid 
          ? 'Implementation follows responsibility separation rules'
          : `Violations: ${validation.violations.map(v => v.description).join(', ')}`,
        violations: validation.violations
      };

    } catch (error) {
      return {
        testName: 'Implementation Validation',
        passed: false,
        details: `Implementation validation error: ${error}`,
        violations: [{
          rule: 'validation_error',
          description: `${error}`,
          severity: 'error'
        }]
      };
    }
  }

  /**
   * 責任分離遵守テスト
   */
  private async testResponsibilitySeparation(
    primitive: IPrimitive,
    level: HierarchyType
  ): Promise<TestResult> {
    const startTime = performance.now();

    try {
      const container = this.testContainers.get(level);
      if (!container) {
        throw new Error(`Test container not found for level: ${level}`);
      }

      // テスト実行前検証
      const preValidation = ResponsibilityValidator.validateAtRuntime(container, level);

      // プリミティブ実行
      const testData = this.createTestData(level, container);
      const result = await this.apiManager.executePrimitive(
        primitive.name,
        level,
        testData
      );

      // 実行後検証
      const postValidation = ResponsibilityValidator.validateAtRuntime(container, level);

      const executionTime = performance.now() - startTime;
      const totalViolations = [...preValidation.violations, ...postValidation.violations];

      return {
        testName: `Responsibility Separation (${level})`,
        passed: result.success && totalViolations.length === 0,
        details: result.success && totalViolations.length === 0
          ? `Executed successfully with no responsibility violations`
          : `Violations or errors: ${totalViolations.map(v => v.description).join(', ')}`,
        executionTime,
        violations: totalViolations
      };

    } catch (error) {
      return {
        testName: `Responsibility Separation (${level})`,
        passed: false,
        details: `Execution failed: ${error}`,
        executionTime: performance.now() - startTime,
        violations: [{
          rule: 'execution_error',
          level,
          description: `${error}`,
          severity: 'error'
        }]
      };
    }
  }

  /**
   * API一貫性テスト
   */
  private async testAPIConsistency(primitive: IPrimitive): Promise<TestResult> {
    try {
      const violations: any[] = [];

      // 必須メソッド存在チェック
      if (typeof primitive.execute !== 'function') {
        violations.push({
          rule: 'missing_execute',
          description: 'Primitive must implement execute method',
          severity: 'error'
        });
      }

      // プロパティ存在チェック
      if (!primitive.name || typeof primitive.name !== 'string') {
        violations.push({
          rule: 'missing_name',
          description: 'Primitive must have a valid name property',
          severity: 'error'
        });
      }

      if (!primitive.allowedLevels || !Array.isArray(primitive.allowedLevels)) {
        violations.push({
          rule: 'missing_allowed_levels',
          description: 'Primitive must define allowedLevels array',
          severity: 'error'
        });
      }

      if (!primitive.responsibilityCategory) {
        violations.push({
          rule: 'missing_responsibility_category',
          description: 'Primitive must define responsibilityCategory',
          severity: 'error'
        });
      }

      return {
        testName: 'API Consistency',
        passed: violations.length === 0,
        details: violations.length === 0 
          ? 'API interface is consistent'
          : `API violations: ${violations.map(v => v.description).join(', ')}`,
        violations
      };

    } catch (error) {
      return {
        testName: 'API Consistency',
        passed: false,
        details: `API consistency check failed: ${error}`
      };
    }
  }

  /**
   * パフォーマンステスト
   */
  private async testPerformance(primitive: IPrimitive): Promise<TestResult> {
    const iterations = 10;
    const executionTimes: number[] = [];
    const PERFORMANCE_THRESHOLD = 50; // 50ms

    try {
      for (let i = 0; i < iterations; i++) {
        const level = primitive.allowedLevels[0];
        const container = this.testContainers.get(level)!;
        const testData = this.createTestData(level, container);

        const startTime = performance.now();
        await this.apiManager.executePrimitive(primitive.name, level, testData);
        const endTime = performance.now();

        executionTimes.push(endTime - startTime);
      }

      const averageTime = executionTimes.reduce((a, b) => a + b, 0) / iterations;
      const passed = averageTime < PERFORMANCE_THRESHOLD;

      return {
        testName: 'Performance',
        passed,
        details: `Average execution time: ${averageTime.toFixed(2)}ms (threshold: ${PERFORMANCE_THRESHOLD}ms)`,
        executionTime: averageTime
      };

    } catch (error) {
      return {
        testName: 'Performance',
        passed: false,
        details: `Performance test failed: ${error}`
      };
    }
  }

  /**
   * テストデータ作成
   */
  private createTestData(level: HierarchyType, container: PIXI.Container): any {
    const baseData = {
      level,
      layerState: {
        hierarchyType: level,
        phase: 'active',
        nowMs: Date.now(),
        startMs: 0,
        endMs: 5000,
        parentPosition: { x: 0, y: 0 },
        hierarchyParams: {}
      } as any,
      params: {},
      container
    };

    // レベル別テストパラメータ
    switch (level) {
      case 'phrase':
        baseData.params = {
          x: 400,
          y: 300,
          alpha: 1.0,
          animated: false
        };
        break;
      
      case 'word':
        baseData.params = {
          spacing: 20,
          alignment: 'center',
          animated: false
        };
        break;
      
      case 'character':
        baseData.params = {
          character: 'A',
          style: new PIXI.TextStyle({
            fontSize: 48,
            fill: '#ffffff'
          }),
          anchor: { x: 0.5, y: 0.5 }
        };
        break;
    }

    return baseData;
  }

  /**
   * サマリー計算
   */
  private calculateSummary(results: PrimitiveTestResult[]): {
    responsibilitySeparationRate: number;
    apiConsistencyRate: number;
    performanceScore: number;
  } {
    const responsibilitySeparationTests = results.flatMap(r => 
      r.tests.filter(t => t.testName.includes('Responsibility Separation'))
    );
    const apiConsistencyTests = results.flatMap(r => 
      r.tests.filter(t => t.testName === 'API Consistency')
    );
    const performanceTests = results.flatMap(r => 
      r.tests.filter(t => t.testName === 'Performance')
    );

    return {
      responsibilitySeparationRate: this.calculateTestRate(responsibilitySeparationTests),
      apiConsistencyRate: this.calculateTestRate(apiConsistencyTests),
      performanceScore: this.calculateTestRate(performanceTests)
    };
  }

  /**
   * テスト合格率計算
   */
  private calculateTestRate(tests: TestResult[]): number {
    if (tests.length === 0) return 0;
    const passed = tests.filter(t => t.passed).length;
    return passed / tests.length;
  }

  /**
   * メモリ使用量取得
   */
  private getMemoryUsage(): number {
    if (typeof (performance as any).memory !== 'undefined') {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * 詳細レポート生成
   */
  generateDetailedReport(result: TestSuiteResult): string {
    let report = `\n=== Primitive Test Suite Report ===\n`;
    report += `Overall Compliance Rate: ${(result.overallComplianceRate * 100).toFixed(1)}%\n`;
    report += `Passed Primitives: ${result.passedPrimitives}/${result.totalPrimitives}\n\n`;

    // サマリー
    report += `=== Summary ===\n`;
    report += `Responsibility Separation: ${(result.summary.responsibilitySeparationRate * 100).toFixed(1)}%\n`;
    report += `API Consistency: ${(result.summary.apiConsistencyRate * 100).toFixed(1)}%\n`;
    report += `Performance Score: ${(result.summary.performanceScore * 100).toFixed(1)}%\n\n`;

    // 個別結果
    result.results.forEach(primitiveResult => {
      report += `=== ${primitiveResult.primitiveName} (${primitiveResult.level}) ===\n`;
      report += `Result: ${primitiveResult.overallResult}\n`;
      report += `Compliance: ${(primitiveResult.complianceRate * 100).toFixed(1)}%\n`;
      
      primitiveResult.tests.forEach(test => {
        report += `  [${test.passed ? 'PASS' : 'FAIL'}] ${test.testName}: ${test.details}\n`;
      });

      if (primitiveResult.violations.length > 0) {
        report += `  Violations: ${primitiveResult.violations.length}\n`;
      }

      report += `\n`;
    });

    return report;
  }
}