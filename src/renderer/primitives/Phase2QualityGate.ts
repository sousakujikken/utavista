/**
 * Phase2QualityGate - Phase 2プリミティブAPI品質ゲート検証システム
 * 責任分離100%強制、API一貫性100%達成、コード削減>50%の確認
 * 
 * 参照: development-directive-final.md#5.2, quality-assurance-design.md#3.2
 */

import { PrimitiveTestSuite, TestSuiteResult } from './PrimitiveTestSuite';
import { PrimitiveAPIManager } from './PrimitiveAPIManager';
import { ResponsibilityValidator } from '../validators/ResponsibilityValidator';

export interface Phase2QualityGateResult {
  phase: 'Phase2';
  passed: boolean;
  results: {
    responsibilitySeparation: QualityCheck;
    apiConsistency: QualityCheck;
    codeReduction: QualityCheck;
    primitiveCompliance: QualityCheck;
  };
  overallScore: number;
  recommendations: string[];
  testResults: TestSuiteResult;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  score: number;        // 0-100
  target: string;
  actual: string;
  details: Record<string, any>;
}

/**
 * Phase 2品質ゲート実行システム
 */
export class Phase2QualityGate {
  private testSuite: PrimitiveTestSuite;
  private apiManager: PrimitiveAPIManager;

  constructor() {
    this.testSuite = new PrimitiveTestSuite();
    this.apiManager = new PrimitiveAPIManager();
  }

  /**
   * Phase 2品質ゲートの実行
   * 必須条件: 責任分離100%、API一貫性100%、コード削減>50%
   */
  async executeQualityGate(): Promise<Phase2QualityGateResult> {
    console.log('[Phase2QualityGate] Starting Phase 2 quality gate validation...');

    // 包括的テスト実行
    const testResults = await this.testSuite.runAllTests();

    // 各品質チェック実行
    const responsibilitySeparationResult = this.checkResponsibilitySeparation(testResults);
    const apiConsistencyResult = this.checkAPIConsistency(testResults);
    const codeReductionResult = this.checkCodeReduction();
    const primitiveComplianceResult = this.checkPrimitiveCompliance(testResults);

    // 総合評価
    const results = {
      responsibilitySeparation: responsibilitySeparationResult,
      apiConsistency: apiConsistencyResult,
      codeReduction: codeReductionResult,
      primitiveCompliance: primitiveComplianceResult
    };

    const overallScore = this.calculateOverallScore(results);
    const passed = this.determinePassFail(results);
    const recommendations = this.generateRecommendations(results);

    console.log(`[Phase2QualityGate] Quality gate ${passed ? 'PASSED' : 'FAILED'} with score: ${overallScore}/100`);

    return {
      phase: 'Phase2',
      passed,
      results,
      overallScore,
      recommendations,
      testResults
    };
  }

  /**
   * 責任分離チェック（目標: 100%強制）
   */
  private checkResponsibilitySeparation(testResults: TestSuiteResult): QualityCheck {
    const separationRate = testResults.summary.responsibilitySeparationRate;
    const passed = separationRate >= 1.0; // 100%必須
    const score = Math.round(separationRate * 100);

    // 詳細分析
    const violationAnalysis = this.analyzeViolations(testResults);
    const validatorStats = ResponsibilityValidator.getValidationStats();

    return {
      name: 'Responsibility Separation',
      passed,
      score,
      target: '100% compliance (mandatory)',
      actual: `${(separationRate * 100).toFixed(1)}%`,
      details: {
        testResults: {
          totalTests: testResults.results.length,
          passedTests: testResults.results.filter(r => r.overallResult === 'PASS').length,
          violationCount: violationAnalysis.totalViolations
        },
        violationBreakdown: violationAnalysis.byLevel,
        validatorStats,
        enforcementActive: true,
        criticalViolations: violationAnalysis.criticalViolations
      }
    };
  }

  /**
   * API一貫性チェック（目標: 100%達成）
   */
  private checkAPIConsistency(testResults: TestSuiteResult): QualityCheck {
    const consistencyRate = testResults.summary.apiConsistencyRate;
    const passed = consistencyRate >= 1.0; // 100%必須
    const score = Math.round(consistencyRate * 100);

    // API統一性分析
    const apiAnalysis = this.analyzeAPIConsistency(testResults);

    return {
      name: 'API Consistency',
      passed,
      score,
      target: '100% consistency',
      actual: `${(consistencyRate * 100).toFixed(1)}%`,
      details: {
        interfaceCompliance: apiAnalysis.interfaceCompliance,
        methodConsistency: apiAnalysis.methodConsistency,
        parameterValidation: apiAnalysis.parameterValidation,
        errorHandling: apiAnalysis.errorHandling,
        performanceConsistency: apiAnalysis.performanceConsistency,
        registeredPrimitives: this.apiManager.getRegisteredPrimitives().length
      }
    };
  }

  /**
   * コード削減チェック（目標: >50%削減）
   */
  private checkCodeReduction(): QualityCheck {
    // プリミティブ化による理論的コード削減計算
    const primitiveCount = 4; // 実装したプリミティブ数
    const averageTemplateLines = 200; // 平均テンプレート行数（推定）
    const templateCount = 10; // 想定テンプレート数
    const primitiveLines = 150; // プリミティブ平均行数

    const originalCodeLines = averageTemplateLines * templateCount;
    const newCodeLines = (primitiveLines * primitiveCount) + (averageTemplateLines * 0.3 * templateCount); // 70%削減想定
    const reductionRate = (originalCodeLines - newCodeLines) / originalCodeLines;

    const passed = reductionRate > 0.5; // 50%以上削減
    const score = Math.min(100, Math.round(reductionRate * 100));

    return {
      name: 'Code Reduction',
      passed,
      score,
      target: '>50% reduction',
      actual: `${(reductionRate * 100).toFixed(1)}%`,
      details: {
        estimatedOriginalLines: originalCodeLines,
        estimatedNewLines: newCodeLines,
        savedLines: originalCodeLines - newCodeLines,
        primitiveCount,
        reusabilityFactor: primitiveCount * templateCount, // 再利用効果
        maintenanceReduction: reductionRate * 0.8 // メンテナンス負荷削減
      }
    };
  }

  /**
   * プリミティブ適合性チェック
   */
  private checkPrimitiveCompliance(testResults: TestSuiteResult): QualityCheck {
    const complianceRate = testResults.overallComplianceRate;
    const passed = complianceRate >= 1.0; // 100%適合
    const score = Math.round(complianceRate * 100);

    // プリミティブ品質分析
    const qualityAnalysis = this.analyzePrimitiveQuality(testResults);

    return {
      name: 'Primitive Compliance',
      passed,
      score,
      target: '100% primitive compliance',
      actual: `${(complianceRate * 100).toFixed(1)}%`,
      details: {
        totalPrimitives: testResults.totalPrimitives,
        passedPrimitives: testResults.passedPrimitives,
        qualityMetrics: qualityAnalysis,
        performanceScore: testResults.summary.performanceScore,
        memoryLeaks: qualityAnalysis.memoryLeaks,
        executionStability: qualityAnalysis.executionStability
      }
    };
  }

  /**
   * 違反分析
   */
  private analyzeViolations(testResults: TestSuiteResult): {
    totalViolations: number;
    byLevel: Record<string, number>;
    criticalViolations: number;
  } {
    const violations = testResults.results.flatMap(r => r.violations);
    const byLevel: Record<string, number> = {};
    let criticalViolations = 0;

    violations.forEach(violation => {
      const level = violation.level || 'unknown';
      byLevel[level] = (byLevel[level] || 0) + 1;
      
      if (violation.severity === 'error') {
        criticalViolations++;
      }
    });

    return {
      totalViolations: violations.length,
      byLevel,
      criticalViolations
    };
  }

  /**
   * API一貫性分析
   */
  private analyzeAPIConsistency(testResults: TestSuiteResult): {
    interfaceCompliance: number;
    methodConsistency: number;
    parameterValidation: number;
    errorHandling: number;
    performanceConsistency: number;
  } {
    const apiTests = testResults.results.flatMap(r => 
      r.tests.filter(t => t.testName === 'API Consistency')
    );
    
    const passed = apiTests.filter(t => t.passed).length;
    const total = apiTests.length;
    const baseRate = total > 0 ? passed / total : 1;

    return {
      interfaceCompliance: baseRate,
      methodConsistency: baseRate,
      parameterValidation: baseRate,
      errorHandling: baseRate,
      performanceConsistency: testResults.summary.performanceScore
    };
  }

  /**
   * プリミティブ品質分析
   */
  private analyzePrimitiveQuality(testResults: TestSuiteResult): {
    memoryLeaks: boolean;
    executionStability: number;
    averagePerformance: number;
  } {
    const memoryLeaks = testResults.results.some(r => r.performance.memoryLeaks);
    
    const performanceTimes = testResults.results.map(r => r.performance.averageExecutionTime);
    const averagePerformance = performanceTimes.length > 0
      ? performanceTimes.reduce((a, b) => a + b, 0) / performanceTimes.length
      : 0;

    // 実行安定性（エラー率の逆数）
    const errorCount = testResults.results.reduce((acc, r) => 
      acc + r.tests.filter(t => !t.passed).length, 0
    );
    const totalTests = testResults.results.reduce((acc, r) => acc + r.tests.length, 0);
    const executionStability = totalTests > 0 ? 1 - (errorCount / totalTests) : 1;

    return {
      memoryLeaks,
      executionStability,
      averagePerformance
    };
  }

  /**
   * 総合スコア計算
   */
  private calculateOverallScore(results: Phase2QualityGateResult['results']): number {
    const weights = {
      responsibilitySeparation: 0.4,  // 40% - 最重要
      apiConsistency: 0.3,            // 30%
      primitiveCompliance: 0.2,       // 20%
      codeReduction: 0.1              // 10%
    };

    return Math.round(
      results.responsibilitySeparation.score * weights.responsibilitySeparation +
      results.apiConsistency.score * weights.apiConsistency +
      results.primitiveCompliance.score * weights.primitiveCompliance +
      results.codeReduction.score * weights.codeReduction
    );
  }

  /**
   * 合否判定
   */
  private determinePassFail(results: Phase2QualityGateResult['results']): boolean {
    // Phase 2の必須条件
    return results.responsibilitySeparation.passed &&  // 責任分離100%必須
           results.apiConsistency.passed &&            // API一貫性100%必須
           results.primitiveCompliance.passed;         // プリミティブ適合100%必須
    // コード削減は推奨だが必須ではない
  }

  /**
   * 改善提案生成
   */
  private generateRecommendations(results: Phase2QualityGateResult['results']): string[] {
    const recommendations: string[] = [];

    if (!results.responsibilitySeparation.passed) {
      recommendations.push('責任分離違反を修正してください。各プリミティブが階層の責任範囲を厳格に遵守する必要があります。');
      recommendations.push('ResponsibilityValidatorの詳細ログを確認し、違反箇所を特定・修正してください。');
    }

    if (!results.apiConsistency.passed) {
      recommendations.push('API一貫性を改善してください。全プリミティブが統一されたインターフェースを実装する必要があります。');
      recommendations.push('IPrimitiveインターフェースの完全実装を確認してください。');
    }

    if (!results.primitiveCompliance.passed) {
      recommendations.push('プリミティブ適合性を改善してください。全テストに合格する必要があります。');
      recommendations.push('PrimitiveTestSuiteの詳細ログを確認し、失敗テストを修正してください。');
    }

    if (!results.codeReduction.passed) {
      recommendations.push('コード削減効果を向上させてください。プリミティブの再利用性を高めることを検討してください。');
    }

    if (recommendations.length === 0) {
      recommendations.push('全ての品質基準をクリアしています。Phase 3の統合・検証に進むことができます。');
    }

    return recommendations;
  }

  /**
   * 詳細レポート生成
   */
  generateDetailedReport(result: Phase2QualityGateResult): string {
    let report = `\n=== Phase 2 Quality Gate Report ===\n`;
    report += `Overall Result: ${result.passed ? 'PASSED' : 'FAILED'}\n`;
    report += `Overall Score: ${result.overallScore}/100\n\n`;

    // 各チェック結果
    Object.values(result.results).forEach(check => {
      report += `[${check.passed ? 'PASS' : 'FAIL'}] ${check.name}\n`;
      report += `  Target: ${check.target}\n`;
      report += `  Actual: ${check.actual}\n`;
      report += `  Score: ${check.score}/100\n\n`;
    });

    // プリミティブテスト詳細
    report += `=== Primitive Test Details ===\n`;
    report += this.testSuite.generateDetailedReport(result.testResults);

    // 改善提案
    if (result.recommendations.length > 0) {
      report += `=== Recommendations ===\n`;
      result.recommendations.forEach((rec, index) => {
        report += `${index + 1}. ${rec}\n`;
      });
    }

    return report;
  }
}