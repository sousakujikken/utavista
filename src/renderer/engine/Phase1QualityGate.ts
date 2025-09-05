/**
 * Phase1QualityGate - Phase 1品質ゲート検証システム
 * 音楽同期>95%, 60FPS安定, 責任分離100%遵守の確認
 * 
 * 参照: development-directive-final.md#5.2, quality-assurance-design.md#3.1
 */

import { SimplePrecisionTimeManager } from './SimplePrecisionTimeManager';
import { CoreSynchronizationEngine } from './CoreSynchronizationEngine';
import { HierarchicalWrapper } from './HierarchicalWrapper';
import { SimpleFrameScheduler } from './SimpleFrameScheduler';
import { RenderingPipeline } from './RenderingPipeline';
import { ResponsibilityValidator } from '../validators/ResponsibilityValidator';
import AnimationInstance from './AnimationInstance';
import * as PIXI from 'pixi.js';

export interface QualityGateResult {
  phase: 'Phase1';
  passed: boolean;
  results: {
    musicSyncAccuracy: QualityCheck;
    frameRateStability: QualityCheck;
    responsibilitySeparation: QualityCheck;
    systemCompatibility: QualityCheck;
  };
  overallScore: number;
  recommendations: string[];
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  score: number;        // 0-100
  target: string;
  actual: string;
  details: Record<string, any>;
}

export class Phase1QualityGate {
  private timeManager: SimplePrecisionTimeManager;
  private coreEngine: CoreSynchronizationEngine;
  private frameScheduler: SimpleFrameScheduler;
  private renderingPipeline: RenderingPipeline;
  
  constructor() {
    // システム初期化
    this.timeManager = new SimplePrecisionTimeManager();
    this.coreEngine = new CoreSynchronizationEngine(this.timeManager);
    this.frameScheduler = new SimpleFrameScheduler();
    this.renderingPipeline = new RenderingPipeline();
    
    // パイプライン接続
    this.coreEngine.setRenderingPipeline(this.renderingPipeline);
  }
  
  /**
   * Phase 1品質ゲートの実行
   * 全ての必須条件をチェック
   */
  async executeQualityGate(
    testInstance?: AnimationInstance,
    audioElement?: HTMLAudioElement
  ): Promise<QualityGateResult> {
    
    console.log('[Phase1QualityGate] Starting Phase 1 quality gate validation...');
    
    // 音声設定
    if (audioElement) {
      this.timeManager.setAudioElement(audioElement);
    }
    
    // 各品質チェック実行
    const musicSyncResult = await this.checkMusicSyncAccuracy(testInstance);
    const frameRateResult = await this.checkFrameRateStability();
    const responsibilityResult = this.checkResponsibilitySeparation(testInstance);
    const compatibilityResult = this.checkSystemCompatibility(testInstance);
    
    // 総合評価
    const results = {
      musicSyncAccuracy: musicSyncResult,
      frameRateStability: frameRateResult,
      responsibilitySeparation: responsibilityResult,
      systemCompatibility: compatibilityResult
    };
    
    const overallScore = this.calculateOverallScore(results);
    const passed = this.determinePassFail(results);
    const recommendations = this.generateRecommendations(results);
    
    console.log(`[Phase1QualityGate] Quality gate ${passed ? 'PASSED' : 'FAILED'} with score: ${overallScore}/100`);
    
    return {
      phase: 'Phase1',
      passed,
      results,
      overallScore,
      recommendations
    };
  }
  
  /**
   * 音楽同期精度チェック（目標: >95%）
   */
  private async checkMusicSyncAccuracy(testInstance?: AnimationInstance): Promise<QualityCheck> {
    const testDuration = 5000; // 5秒間テスト
    const sampleInterval = 100; // 100ms間隔
    const samples = testDuration / sampleInterval;
    
    if (!testInstance) {
      return {
        name: 'Music Sync Accuracy',
        passed: false,
        score: 0,
        target: '>95%',
        actual: 'No test instance',
        details: { error: 'Test instance not provided' }
      };
    }
    
    let accurateSamples = 0;
    const syncResults = [];
    
    // サンプリング実行
    for (let i = 0; i < samples; i++) {
      const musicTime = i * sampleInterval;
      
      try {
        const result = await this.coreEngine.executeWithMusicSync(testInstance, musicTime);
        syncResults.push(result.syncAccuracy);
        
        if (result.syncAccuracy.accuracyRate > 0.95) {
          accurateSamples++;
        }
        
      } catch (error) {
        console.error('[Phase1QualityGate] Sync test error:', error);
      }
    }
    
    const accuracyRate = accurateSamples / samples;
    const passed = accuracyRate > 0.95;
    const score = Math.round(accuracyRate * 100);
    
    return {
      name: 'Music Sync Accuracy',
      passed,
      score,
      target: '>95%',
      actual: `${(accuracyRate * 100).toFixed(1)}%`,
      details: {
        totalSamples: samples,
        accurateSamples,
        syncResults: syncResults.slice(-5) // 最新5件
      }
    };
  }
  
  /**
   * フレームレート安定性チェック（目標: 60FPS）
   */
  private async checkFrameRateStability(): Promise<QualityCheck> {
    const testDuration = 3000; // 3秒間テスト
    let frameCount = 0;
    let totalFrames = 0;
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      // フレームカウンター
      const frameCallback = (frameData: any) => {
        frameCount++;
        totalFrames++;
        
        // テスト終了チェック
        if (performance.now() - startTime >= testDuration) {
          this.frameScheduler.removeCallback(frameCallback);
          
          const actualFPS = (totalFrames / (testDuration / 1000));
          const passed = actualFPS >= 58; // 60FPSの96.7%以上
          const score = Math.min(100, Math.round((actualFPS / 60) * 100));
          
          const stats = this.frameScheduler.getFrameStats();
          
          resolve({
            name: 'Frame Rate Stability',
            passed,
            score,
            target: '60FPS',
            actual: `${actualFPS.toFixed(1)}FPS`,
            details: {
              testDuration: testDuration,
              totalFrames,
              averageFPS: stats.averageFPS,
              frameDrops: stats.frameDropCount,
              quality: this.frameScheduler.getFrameQuality()
            }
          });
        }
      };
      
      this.frameScheduler.addCallback(frameCallback);
      this.frameScheduler.startFrameLoop(frameCallback);
    });
  }
  
  /**
   * 責任分離チェック（目標: 100%遵守）
   */
  private checkResponsibilitySeparation(testInstance?: AnimationInstance): QualityCheck {
    if (!testInstance) {
      return {
        name: 'Responsibility Separation',
        passed: false,
        score: 0,
        target: '100% compliance',
        actual: 'No test instance',
        details: { error: 'Test instance not provided' }
      };
    }
    
    // 実装検証
    const implementationResults = [
      ResponsibilityValidator.validateImplementation(this.coreEngine, 'phrase'),
      ResponsibilityValidator.validateImplementation(this.renderingPipeline, 'character')
    ];
    
    // 実行時検証
    const runtimeResults = [
      ResponsibilityValidator.validateAtRuntime(testInstance.container, testInstance.hierarchyType)
    ];
    
    const allResults = [...implementationResults, ...runtimeResults];
    const totalChecks = allResults.reduce((sum, result) => sum + result.checkedRules, 0);
    const passedChecks = allResults.reduce((sum, result) => sum + result.passedRules, 0);
    
    const complianceRate = totalChecks > 0 ? passedChecks / totalChecks : 0;
    const passed = complianceRate === 1.0; // 100%遵守必須
    const score = Math.round(complianceRate * 100);
    
    const violations = allResults.flatMap(result => result.violations);
    
    return {
      name: 'Responsibility Separation',
      passed,
      score,
      target: '100% compliance',
      actual: `${(complianceRate * 100).toFixed(1)}%`,
      details: {
        totalChecks,
        passedChecks,
        violations: violations.map(v => `${v.level}: ${v.description}`),
        validationStats: ResponsibilityValidator.getValidationStats()
      }
    };
  }
  
  /**
   * システム互換性チェック（目標: 100%互換）
   */
  private checkSystemCompatibility(testInstance?: AnimationInstance): QualityCheck {
    if (!testInstance) {
      return {
        name: 'System Compatibility',
        passed: false,
        score: 0,
        target: '100% compatibility',
        actual: 'No test instance',
        details: { error: 'Test instance not provided' }
      };
    }
    
    try {
      // HierarchicalWrapperで既存システムとの統合テスト
      const wrapper = new HierarchicalWrapper(testInstance);
      
      // 統合テスト実行
      const originalMethod = testInstance.update;
      const testTime = performance.now();
      
      // 既存システム実行テスト
      const originalResult = originalMethod.call(testInstance, testTime);
      
      // 統合システム実行テスト
      const integratedResult = testInstance.update(testTime);
      
      // 統計取得
      const wrapperStats = wrapper.getStats();
      
      const passed = wrapperStats.fallbackCount === 0 && wrapperStats.errorCount === 0;
      const score = passed ? 100 : Math.max(0, 100 - (wrapperStats.errorCount * 10));
      
      return {
        name: 'System Compatibility',
        passed,
        score,
        target: '100% compatibility',
        actual: `${wrapperStats.errorCount} errors, ${wrapperStats.fallbackCount} fallbacks`,
        details: {
          wrapperStats,
          originalResult,
          integratedResult,
          hierarchicalEnabled: wrapperStats.hierarchicalEnabled
        }
      };
      
    } catch (error) {
      return {
        name: 'System Compatibility',
        passed: false,
        score: 0,
        target: '100% compatibility',
        actual: 'Integration error',
        details: { error: error.toString() }
      };
    }
  }
  
  /**
   * 総合スコア計算
   */
  private calculateOverallScore(results: QualityGateResult['results']): number {
    const weights = {
      musicSyncAccuracy: 0.3,      // 30%
      frameRateStability: 0.3,     // 30%
      responsibilitySeparation: 0.3, // 30%
      systemCompatibility: 0.1     // 10%
    };
    
    return Math.round(
      results.musicSyncAccuracy.score * weights.musicSyncAccuracy +
      results.frameRateStability.score * weights.frameRateStability +
      results.responsibilitySeparation.score * weights.responsibilitySeparation +
      results.systemCompatibility.score * weights.systemCompatibility
    );
  }
  
  /**
   * 合否判定
   */
  private determinePassFail(results: QualityGateResult['results']): boolean {
    // 全ての必須条件をクリアする必要がある
    return results.musicSyncAccuracy.passed &&
           results.frameRateStability.passed &&
           results.responsibilitySeparation.passed &&
           results.systemCompatibility.passed;
  }
  
  /**
   * 改善提案生成
   */
  private generateRecommendations(results: QualityGateResult['results']): string[] {
    const recommendations: string[] = [];
    
    if (!results.musicSyncAccuracy.passed) {
      recommendations.push('音楽同期精度を改善してください。HTMLAudioElementの時間精度を確認し、performance.now()との同期を調整してください。');
    }
    
    if (!results.frameRateStability.passed) {
      recommendations.push('フレームレート安定性を改善してください。PIXI.Tickerの設定を確認し、フレーム予算管理を最適化してください。');
    }
    
    if (!results.responsibilitySeparation.passed) {
      recommendations.push('責任分離ルールの遵守を改善してください。各階層の責任範囲を再確認し、違反箇所を修正してください。');
    }
    
    if (!results.systemCompatibility.passed) {
      recommendations.push('既存システムとの互換性を改善してください。HierarchicalWrapperのエラーハンドリングを確認してください。');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('全ての品質基準をクリアしています。Phase 2の実装に進むことができます。');
    }
    
    return recommendations;
  }
  
  /**
   * デバッグ用詳細レポート生成
   */
  generateDetailedReport(result: QualityGateResult): string {
    let report = `\n=== Phase 1 Quality Gate Report ===\n`;
    report += `Overall Result: ${result.passed ? 'PASSED' : 'FAILED'}\n`;
    report += `Overall Score: ${result.overallScore}/100\n\n`;
    
    // 各チェック結果
    Object.values(result.results).forEach(check => {
      report += `[${check.passed ? 'PASS' : 'FAIL'}] ${check.name}\n`;
      report += `  Target: ${check.target}\n`;
      report += `  Actual: ${check.actual}\n`;
      report += `  Score: ${check.score}/100\n\n`;
    });
    
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