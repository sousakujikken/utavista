/**
 * パラメータ整合性テスト
 * 開発中に自動実行可能なテストプログラム
 */

import { ParameterManagerV2 } from '../ParameterManagerV2';
import { TemplateManager } from '../TemplateManager';
import { InstanceManager } from '../InstanceManager';
import type { CompressedProjectData } from '../ParameterManagerV2';

export interface ParameterTestResult {
  testPhraseId: string;
  timestamp: string;
  results: {
    parameterManager: {
      isInitialized: boolean;
      isIndividualEnabled: boolean;
      fontFamily: string;
      fontSize: number;
      templateId?: string;
    };
    templateManager: {
      assignedTemplateId: string;
      hasDirectAssignment: boolean;
    };
    instanceManager: {
      hasInstance: boolean;
      templateClassName?: string;
      renderingFontFamily?: string;
      isActive?: boolean;
    };
    saveData: {
      templateId: string;
      individualSettingEnabled: boolean;
      parameterDiff?: Record<string, any>;
    };
  };
  mismatches: Array<{
    type: string;
    description: string;
    expected: any;
    actual: any;
  }>;
  testPassed: boolean;
}

export class ParameterConsistencyTest {
  constructor(
    private parameterManager: ParameterManagerV2,
    private templateManager: TemplateManager,
    private instanceManager: InstanceManager
  ) {}

  /**
   * 特定フレーズの整合性テストを実行
   */
  runTest(phraseId: string): ParameterTestResult {
    const timestamp = new Date().toISOString();
    const results: ParameterTestResult['results'] = {
      parameterManager: this.getParameterManagerState(phraseId),
      templateManager: this.getTemplateManagerState(phraseId),
      instanceManager: this.getInstanceManagerState(phraseId),
      saveData: this.getSaveDataState(phraseId)
    };

    const mismatches = this.detectMismatches(results, phraseId);
    
    return {
      testPhraseId: phraseId,
      timestamp,
      results,
      mismatches,
      testPassed: mismatches.length === 0
    };
  }

  /**
   * 復元処理のテスト
   */
  runRestorationTest(phraseId: string): {
    before: ParameterTestResult;
    after: ParameterTestResult;
    restorationIssues: string[];
  } {
    // 復元前の状態を記録
    const beforeTest = this.runTest(phraseId);
    
    // 現在の状態をエクスポート
    const exportData = this.parameterManager.exportCompressed();
    
    // 復元処理をシミュレート
    this.parameterManager.importCompressed(exportData);
    
    // 復元後の状態を記録
    const afterTest = this.runTest(phraseId);
    
    // 復元による問題を検出
    const restorationIssues = this.detectRestorationIssues(beforeTest, afterTest);
    
    return {
      before: beforeTest,
      after: afterTest,
      restorationIssues
    };
  }

  /**
   * 全フレーズの整合性テスト
   */
  runFullTest(): {
    totalPhrases: number;
    passedCount: number;
    failedCount: number;
    individualSettingsCount: number;
    failures: Array<{
      phraseId: string;
      mismatches: ParameterTestResult['mismatches'];
    }>;
  } {
    const allPhrases = this.parameterManager.getInitializedPhrases();
    const individualSettings = this.parameterManager.getIndividualSettingsEnabled();
    
    let passedCount = 0;
    let failedCount = 0;
    const failures: Array<{ phraseId: string; mismatches: ParameterTestResult['mismatches'] }> = [];
    
    for (const phraseId of allPhrases) {
      const result = this.runTest(phraseId);
      if (result.testPassed) {
        passedCount++;
      } else {
        failedCount++;
        failures.push({
          phraseId,
          mismatches: result.mismatches
        });
      }
    }
    
    return {
      totalPhrases: allPhrases.length,
      passedCount,
      failedCount,
      individualSettingsCount: individualSettings.length,
      failures
    };
  }

  /**
   * パラメータマネージャーの状態を取得
   */
  private getParameterManagerState(phraseId: string) {
    const params = this.parameterManager.getParameters(phraseId);
    return {
      isInitialized: this.parameterManager.isPhraseInitialized(phraseId),
      isIndividualEnabled: this.parameterManager.isIndividualSettingEnabled(phraseId),
      fontFamily: params.fontFamily,
      fontSize: params.fontSize,
      templateId: params.templateId
    };
  }

  /**
   * テンプレートマネージャーの状態を取得
   */
  private getTemplateManagerState(phraseId: string) {
    const templateId = this.templateManager.getTemplateIdForObject(phraseId);
    const assignments = this.templateManager.getAssignments();
    
    return {
      assignedTemplateId: templateId,
      hasDirectAssignment: assignments.has(phraseId)
    };
  }

  /**
   * インスタンスマネージャーの状態を取得
   */
  private getInstanceManagerState(phraseId: string) {
    const instance = this.instanceManager.getInstance(phraseId);
    
    if (!instance) {
      return { hasInstance: false };
    }
    
    return {
      hasInstance: true,
      templateClassName: instance.template?.constructor?.name,
      renderingFontFamily: instance.params?.fontFamily,
      isActive: this.instanceManager.getActiveInstances().has(phraseId)
    };
  }

  /**
   * 保存データの状態を取得
   */
  private getSaveDataState(phraseId: string) {
    const exportData = this.parameterManager.exportCompressed();
    const phraseData = exportData.phrases[phraseId];
    
    if (!phraseData) {
      return {
        templateId: 'N/A',
        individualSettingEnabled: false
      };
    }
    
    return {
      templateId: phraseData.templateId,
      individualSettingEnabled: phraseData.individualSettingEnabled || false,
      parameterDiff: phraseData.parameterDiff
    };
  }

  /**
   * 不一致を検出
   */
  private detectMismatches(results: ParameterTestResult['results'], phraseId: string): ParameterTestResult['mismatches'] {
    const mismatches: ParameterTestResult['mismatches'] = [];
    
    // フォントの不一致チェック
    const paramFont = results.parameterManager.fontFamily;
    const renderingFont = results.instanceManager.renderingFontFamily;
    
    if (results.instanceManager.hasInstance && paramFont !== renderingFont) {
      mismatches.push({
        type: 'font',
        description: 'パラメータとレンダリングのフォントが不一致',
        expected: paramFont,
        actual: renderingFont
      });
    }
    
    // テンプレートの不一致チェック
    const saveTemplateId = results.saveData.templateId;
    const assignedTemplateId = results.templateManager.assignedTemplateId;
    
    if (saveTemplateId !== assignedTemplateId && saveTemplateId !== 'N/A') {
      mismatches.push({
        type: 'template',
        description: '保存データとテンプレート割り当てが不一致',
        expected: saveTemplateId,
        actual: assignedTemplateId
      });
    }
    
    // 個別設定の不一致チェック
    const paramIndividual = results.parameterManager.isIndividualEnabled;
    const saveIndividual = results.saveData.individualSettingEnabled;
    
    if (paramIndividual !== saveIndividual) {
      mismatches.push({
        type: 'individualSetting',
        description: '個別設定状態が不一致',
        expected: saveIndividual,
        actual: paramIndividual
      });
    }
    
    // 個別設定が有効なのに差分がない場合
    if (saveIndividual && !results.saveData.parameterDiff) {
      mismatches.push({
        type: 'parameterDiff',
        description: '個別設定が有効だが差分パラメータがない',
        expected: 'パラメータ差分あり',
        actual: 'パラメータ差分なし'
      });
    }
    
    return mismatches;
  }

  /**
   * 復元による問題を検出
   */
  private detectRestorationIssues(before: ParameterTestResult, after: ParameterTestResult): string[] {
    const issues: string[] = [];
    
    // フォントが変更された場合
    if (before.results.parameterManager.fontFamily !== after.results.parameterManager.fontFamily) {
      issues.push(`フォントが変更された: ${before.results.parameterManager.fontFamily} → ${after.results.parameterManager.fontFamily}`);
    }
    
    // 個別設定状態が変更された場合
    if (before.results.parameterManager.isIndividualEnabled !== after.results.parameterManager.isIndividualEnabled) {
      issues.push(`個別設定状態が変更された: ${before.results.parameterManager.isIndividualEnabled} → ${after.results.parameterManager.isIndividualEnabled}`);
    }
    
    // 新たな不一致が発生した場合
    if (before.testPassed && !after.testPassed) {
      issues.push('復元後に新たな不一致が発生');
    }
    
    return issues;
  }
}

/**
 * テスト実行用のヘルパー関数
 */
export function runParameterTest(
  paramManager: ParameterManagerV2,
  templateManager: TemplateManager,
  instanceManager: InstanceManager,
  targetPhraseId: string = 'phrase_1751341417869_k7b01lewz'
): void {
  const tester = new ParameterConsistencyTest(paramManager, templateManager, instanceManager);
  
  
  // 単一フレーズのテスト
  const singleResult = tester.runTest(targetPhraseId);
  
  if (!singleResult.testPassed) {
    console.error('検出された不一致:');
    singleResult.mismatches.forEach((mismatch, index) => {
      console.error(`  ${index + 1}. ${mismatch.description}`);
      console.error(`     期待値: ${mismatch.expected}`);
      console.error(`     実際値: ${mismatch.actual}`);
    });
  }
  
  // 復元テスト
  const restorationResult = tester.runRestorationTest(targetPhraseId);
  
  if (restorationResult.restorationIssues.length > 0) {
    console.error('復元による問題:');
    restorationResult.restorationIssues.forEach(issue => {
      console.error(`  - ${issue}`);
    });
  } else {
  }
  
  // 全体テスト
  const fullResult = tester.runFullTest();
  
  if (fullResult.failedCount > 0) {
    console.error('\n失敗したフレーズ:');
    fullResult.failures.forEach(failure => {
      console.error(`  ${failure.phraseId}:`);
      failure.mismatches.forEach(mismatch => {
        console.error(`    - ${mismatch.description}`);
      });
    });
  }
  
}