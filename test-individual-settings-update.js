/**
 * 個別設定状態変更時のUI更新テストスクリプト
 * 
 * このスクリプトは以下を確認します：
 * 1. objects-activated/deactivated イベントが正しく発火されるか
 * 2. TemplateTab の useIndividualSettings が正しく更新されるか
 * 3. 個別設定クリアボタンの表示条件が正しく動作するか
 */

const puppeteer = require('puppeteer');

async function testIndividualSettingsUpdate() {
  console.log('=== 個別設定UI更新テスト開始 ===\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  // コンソールログを表示
  page.on('console', msg => {
    if (msg.text().includes('[TemplateTab]')) {
      console.log('Console:', msg.text());
    }
  });
  
  // ページを開く
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000);
  
  try {
    // エンジンの準備を待つ
    await page.waitForFunction(() => {
      return window.engine && window.engine.isInitialized();
    }, { timeout: 10000 });
    
    console.log('✓ エンジンが初期化されました\n');
    
    // テスト用フレーズを作成
    const testResult = await page.evaluate(() => {
      const engine = window.engine;
      const timeline = engine.getTimeline();
      
      // テスト用フレーズを作成
      const phrase1 = {
        id: 'test-phrase-1',
        text: 'テストフレーズ1',
        startTime: 1000,
        endTime: 3000,
        words: []
      };
      
      timeline.push(phrase1);
      engine.processTimeline(timeline);
      
      // フレーズを選択
      window.dispatchEvent(new CustomEvent('object-selected', {
        detail: {
          objectId: 'test-phrase-1',
          objectType: 'phrase'
        }
      }));
      
      return {
        phraseId: phrase1.id,
        timelineLength: timeline.length
      };
    });
    
    console.log('✓ テストフレーズを作成・選択しました:', testResult);
    await page.waitForTimeout(1000);
    
    // 個別設定を有効化
    console.log('\n--- 個別設定を有効化 ---');
    await page.evaluate((phraseId) => {
      const engine = window.engine;
      
      // 個別設定を有効化
      engine.enableIndividualSetting(phraseId, true);
      
      // イベントリスナーの状態を確認
      console.log('[Test] 個別設定を有効化しました:', phraseId);
    }, testResult.phraseId);
    
    await page.waitForTimeout(1500);
    
    // UI状態を確認
    const uiState1 = await page.evaluate(() => {
      // TemplateTabの状態を取得する方法を探す
      const templateTab = document.querySelector('.template-tab');
      const clearButton = document.querySelector('.clear-params-button');
      const individualStatus = document.querySelector('.individual-mode-description');
      
      return {
        hasTemplateTab: !!templateTab,
        hasClearButton: !!clearButton,
        hasIndividualStatus: !!individualStatus,
        clearButtonVisible: clearButton ? getComputedStyle(clearButton).display !== 'none' : false
      };
    });
    
    console.log('UI状態（個別設定有効後）:', uiState1);
    
    // 個別設定を無効化
    console.log('\n--- 個別設定を無効化 ---');
    await page.evaluate((phraseId) => {
      const engine = window.engine;
      
      // 個別設定を無効化
      engine.enableIndividualSetting(phraseId, false);
      
      console.log('[Test] 個別設定を無効化しました:', phraseId);
    }, testResult.phraseId);
    
    await page.waitForTimeout(1500);
    
    // UI状態を再確認
    const uiState2 = await page.evaluate(() => {
      const clearButton = document.querySelector('.clear-params-button');
      const individualStatus = document.querySelector('.individual-mode-description');
      
      return {
        hasClearButton: !!clearButton,
        hasIndividualStatus: !!individualStatus,
        clearButtonVisible: clearButton ? getComputedStyle(clearButton).display !== 'none' : false
      };
    });
    
    console.log('UI状態（個別設定無効後）:', uiState2);
    
    // 結果を評価
    console.log('\n=== テスト結果 ===');
    if (uiState1.hasClearButton && !uiState2.hasClearButton) {
      console.log('✅ 個別設定クリアボタンの表示/非表示が正しく動作しています');
    } else {
      console.log('❌ 個別設定クリアボタンの表示が正しく更新されていません');
      console.log('  - 有効時:', uiState1);
      console.log('  - 無効時:', uiState2);
    }
    
  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
  }
  
  // ブラウザは開いたままにして手動確認可能にする
  console.log('\n手動確認のためブラウザを開いたままにしています。');
  console.log('確認が終わったらCtrl+Cで終了してください。');
}

testIndividualSettingsUpdate().catch(console.error);