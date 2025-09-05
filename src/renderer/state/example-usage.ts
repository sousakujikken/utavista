/**
 * StateManager使用例とテストコード
 */

import { StateManager, StateCalculator } from './index';
import { BlackBandMaskTextStateless } from '../templates/BlackBandMaskTextStateless';
import * as PIXI from 'pixi.js';

// 使用例
export function demonstrateStateManager() {
  console.log('=== StateManager デモンストレーション ===');

  // StateManagerインスタンス作成
  const stateManager = new StateManager();

  // オブジェクトの時間範囲を登録
  const phraseId = 'phrase_1';
  const timeRange = {
    startMs: 1000,
    endMs: 3000,
    headTime: 500,
    tailTime: 800
  };

  stateManager.registerObjectTimeRange(phraseId, timeRange);

  // 各タイムスタンプでの状態をテスト
  const testTimestamps = [0, 700, 1000, 2000, 3000, 3500, 4000];

  console.log('\n--- タイムスタンプごとの状態変化 ---');
  testTimestamps.forEach(timestamp => {
    const objectState = stateManager.getObjectState(phraseId, timestamp);
    const swipeInEffect = stateManager.getEffectState(phraseId, 'swipeIn', timestamp);
    const swipeOutEffect = stateManager.getEffectState(phraseId, 'swipeOut', timestamp);

    console.log(`\nTimestamp: ${timestamp}ms`);
    console.log(`  Phase: ${objectState.phase}`);
    console.log(`  Visible: ${objectState.visible}`);
    console.log(`  Progress: ${objectState.progress.toFixed(3)}`);
    console.log(`  SwipeIn: ${swipeInEffect.enabled ? 'ON (' + swipeInEffect.progress.toFixed(3) + ')' : 'OFF'}`);
    console.log(`  SwipeOut: ${swipeOutEffect.enabled ? 'ON (' + swipeOutEffect.progress.toFixed(3) + ')' : 'OFF'}`);
  });

  // RenderStateの統合テスト
  console.log('\n--- RenderState統合テスト ---');
  const renderState = stateManager.getRenderState(phraseId, 1500);
  console.log('RenderState at 1500ms:', {
    object: renderState.object,
    effectsCount: renderState.effects.size,
    graphicsCount: renderState.graphics.size
  });

  return stateManager;
}

// ステートレステンプレートのテスト
export function testStatelessTemplate() {
  console.log('\n=== BlackBandMaskTextStateless テスト ===');

  // PIXIアプリケーションの最小セットアップ（テスト用）
  const app = new PIXI.Application({
    width: 800,
    height: 600,
    backgroundColor: 0x000000
  });

  const container = new PIXI.Container();
  app.stage.addChild(container);

  const stateManager = new StateManager();
  const template = new BlackBandMaskTextStateless();

  // テスト用の時間範囲設定
  const phraseId = 'test_phrase';
  stateManager.registerObjectTimeRange(phraseId, {
    startMs: 1000,
    endMs: 3000,
    headTime: 500,
    tailTime: 800
  });

  // テスト用パラメータ
  const params = {
    fontSize: 48,
    fontFamily: 'Arial',
    textColor: '#FFFFFF',
    activeColor: '#FFD700',
    blackBandColor: '#000000',
    blackBandWidthRatio: 1.2,
    blackBandHeightRatio: 1.0,
    headTime: 500,
    tailTime: 800,
    text: 'テスト',
    phraseWidth: 200
  };

  // 各フェーズでの描画テスト
  const testPhases = [
    { timestamp: 600, label: 'スワイプイン中' },
    { timestamp: 1500, label: 'アクティブ' },
    { timestamp: 3200, label: 'スワイプアウト中' }
  ];

  testPhases.forEach(({ timestamp, label }) => {
    console.log(`\n--- ${label} (${timestamp}ms) ---`);
    
    const renderState = stateManager.getRenderState(phraseId, timestamp);
    console.log(`Phase: ${renderState.object.phase}`);
    console.log(`Visible: ${renderState.object.visible}`);
    console.log(`Effects: ${Array.from(renderState.effects.keys()).join(', ')}`);

    // 実際の描画テスト
    try {
      const success = template.renderAtTime(container, renderState, params, timestamp);
      console.log(`Render Success: ${success}`);
      console.log(`Container Children: ${container.children.length}`);
    } catch (error) {
      console.error(`Render Error: ${error}`);
    }
  });

  // クリーンアップ
  template.cleanup(container);
  console.log('Template cleanup completed');

  return { app, stateManager, template };
}

// パフォーマンステスト
export function performanceTest() {
  console.log('\n=== パフォーマンステスト ===');

  const stateManager = new StateManager();
  const objectCount = 100;
  const testDuration = 5000; // 5秒
  const timeStep = 16; // 60FPS

  // 複数オブジェクトを登録
  for (let i = 0; i < objectCount; i++) {
    stateManager.registerObjectTimeRange(`obj_${i}`, {
      startMs: Math.random() * 1000,
      endMs: 1000 + Math.random() * 3000,
      headTime: 200 + Math.random() * 300,
      tailTime: 200 + Math.random() * 300
    });
  }

  console.log(`${objectCount}オブジェクトを登録`);

  const startTime = performance.now();
  let calculations = 0;

  for (let timestamp = 0; timestamp <= testDuration; timestamp += timeStep) {
    for (let i = 0; i < objectCount; i++) {
      stateManager.getRenderState(`obj_${i}`, timestamp);
      calculations++;
    }
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;
  const avgTimePerCalculation = totalTime / calculations;

  console.log(`総計算数: ${calculations}`);
  console.log(`総時間: ${totalTime.toFixed(2)}ms`);
  console.log(`1計算あたりの平均時間: ${avgTimePerCalculation.toFixed(4)}ms`);
  console.log(`FPS換算での処理能力: ${objectCount}オブジェクト @ ${(1000/16).toFixed(1)}fps = ${(16/avgTimePerCalculation).toFixed(1)}x`);

  return {
    calculations,
    totalTime,
    avgTimePerCalculation
  };
}

// 単体テスト関数群
export const tests = {
  testPhaseCalculation: () => {
    const timeRange = { startMs: 1000, endMs: 2000, headTime: 200, tailTime: 300 };
    
    const testCases = [
      { timestamp: 500, expected: 'before' },
      { timestamp: 900, expected: 'in' },
      { timestamp: 1500, expected: 'active' },
      { timestamp: 2100, expected: 'out' },
      { timestamp: 2500, expected: 'after' }
    ];

    console.log('Phase Calculation Test:');
    testCases.forEach(({ timestamp, expected }) => {
      const actual = StateCalculator.calculatePhase(timestamp, timeRange);
      const passed = actual === expected;
      console.log(`  ${timestamp}ms: ${actual} ${passed ? '✓' : '✗ (expected: ' + expected + ')'}`);
    });
  },

  testProgressCalculation: () => {
    console.log('\nProgress Calculation Test:');
    const testCases = [
      { timestamp: 0, start: 100, duration: 200, expected: 0 },
      { timestamp: 150, start: 100, duration: 200, expected: 0.25 },
      { timestamp: 200, start: 100, duration: 200, expected: 0.5 },
      { timestamp: 300, start: 100, duration: 200, expected: 1 },
      { timestamp: 400, start: 100, duration: 200, expected: 1 }
    ];

    testCases.forEach(({ timestamp, start, duration, expected }) => {
      const actual = StateCalculator.calculateProgress(timestamp, start, duration);
      const passed = Math.abs(actual - expected) < 0.001;
      console.log(`  ${timestamp}ms: ${actual.toFixed(3)} ${passed ? '✓' : '✗ (expected: ' + expected + ')'}`);
    });
  }
};

// 全テスト実行
export function runAllTests() {
  console.log('🧪 StateManager統合テスト開始\n');
  
  try {
    demonstrateStateManager();
    testStatelessTemplate();
    performanceTest();
    tests.testPhaseCalculation();
    tests.testProgressCalculation();
    
    console.log('\n✅ すべてのテストが完了しました！');
  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生:', error);
  }
}

// デバッグ用の出力関数
if (typeof window !== 'undefined') {
  // ブラウザ環境でのみ実行
  (window as any).stateManagerTest = {
    demo: demonstrateStateManager,
    testTemplate: testStatelessTemplate,
    performance: performanceTest,
    tests,
    runAll: runAllTests
  };
}