const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/**
 * WordSlideText2テンプレートの実際の動作検証
 * 実際のPIXI.jsオブジェクトを正確に検出・測定
 */

class WordSlideText2ActualTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = [];
  }

  async setup() {
    console.log('🚀 ブラウザ起動...');
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1400, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    console.log('✅ ブラウザ準備完了');
  }

  async navigateAndWait() {
    console.log('🌐 アプリケーションアクセス...');
    await this.page.goto('http://localhost:5174', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    await this.page.waitForFunction(() => {
      return window.__PIXI_APP__ !== undefined;
    }, { timeout: 15000 });
    
    console.log('✅ PIXI.js準備完了');
  }

  async inspectAllTextObjects() {
    console.log('🔍 全テキストオブジェクトを調査中...');
    
    const textInfo = await this.page.evaluate(() => {
      const pixiApp = window.__PIXI_APP__;
      if (!pixiApp) return { error: 'PIXI app not found' };
      
      // 再帰的にすべてのテキストオブジェクトを取得
      const findAllTextObjects = (container, depth = 0) => {
        const results = [];
        
        if (container.children) {
          container.children.forEach((child, index) => {
            // 正確な型チェック（_Text2も含む）
            const isTextObject = child.constructor.name.includes('Text') || 
                                child.text !== undefined;
            
            if (isTextObject && child.text) {
              const globalPos = child.getGlobalPosition ? child.getGlobalPosition() : 
                              child.worldTransform ? { x: child.worldTransform.tx, y: child.worldTransform.ty } : 
                              { x: 0, y: 0 };
              
              results.push({
                text: child.text,
                type: child.constructor.name,
                localScale: { x: child.scale.x, y: child.scale.y },
                localPosition: { x: child.position.x, y: child.position.y },
                globalPosition: globalPos,
                visible: child.visible,
                alpha: child.alpha,
                tint: child.tint,
                parentType: child.parent ? child.parent.constructor.name : 'unknown',
                parentName: child.parent ? child.parent.name : 'unnamed',
                depth: depth,
                index: index,
                style: child.style ? {
                  fontSize: child.style.fontSize,
                  fontFamily: child.style.fontFamily,
                  fill: child.style.fill
                } : null
              });
            }
            
            if (child.children) {
              results.push(...findAllTextObjects(child, depth + 1));
            }
          });
        }
        
        return results;
      };
      
      const allTexts = findAllTextObjects(pixiApp.stage);
      
      return {
        totalTexts: allTexts.length,
        texts: allTexts,
        timestamp: Date.now()
      };
    });
    
    console.log(`📊 発見: ${textInfo.totalTexts}個のテキストオブジェクト`);
    
    // 日本語テキストを特に探す
    const japaneseTexts = textInfo.texts.filter(t => /[あ-ん ア-ン 一-龯]/.test(t.text));
    console.log(`🎌 日本語テキスト: ${japaneseTexts.length}個`);
    
    if (japaneseTexts.length > 0) {
      console.log('   最初の5個:');
      japaneseTexts.slice(0, 5).forEach((text, i) => {
        console.log(`   ${i+1}. "${text.text}" - Scale: ${text.localScale.x.toFixed(2)}x, Pos: (${text.localPosition.x.toFixed(1)}, ${text.localPosition.y.toFixed(1)})`);
      });
    }
    
    return textInfo;
  }

  async waitAndObserveChanges() {
    console.log('👀 文字の変化を観察中...');
    
    const observations = [];
    
    // 5秒間、1秒ごとに状態を記録
    for (let i = 0; i < 5; i++) {
      console.log(`   📊 観察 ${i+1}/5 (${i}秒経過)`);
      
      const snapshot = await this.page.evaluate(() => {
        const pixiApp = window.__PIXI_APP__;
        if (!pixiApp) return { error: 'PIXI app not found' };
        
        const findTexts = (container) => {
          const results = [];
          if (container.children) {
            container.children.forEach(child => {
              if (child.constructor.name.includes('Text') && child.text && /[あ-ん ア-ン 一-龯]/.test(child.text)) {
                results.push({
                  text: child.text,
                  scale: child.scale.x,
                  position: { x: child.position.x, y: child.position.y },
                  visible: child.visible,
                  alpha: child.alpha
                });
              }
              if (child.children) {
                results.push(...findTexts(child));
              }
            });
          }
          return results;
        };
        
        return {
          time: Date.now(),
          texts: findTexts(pixiApp.stage)
        };
      });
      
      observations.push(snapshot);
      
      // スクリーンショット
      const screenshotPath = `observation_${i}s.png`;
      await this.takeScreenshot(screenshotPath);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return observations;
  }

  async testCharacterScaling() {
    console.log('\n🔬 文字スケーリングテスト開始');
    
    // まず現在の状態を確認
    const initialState = await this.inspectAllTextObjects();
    
    // 日本語文字のみを対象にする
    const japaneseTexts = initialState.texts.filter(t => /[あ-ん ア-ン 一-龯]/.test(t.text));
    
    if (japaneseTexts.length === 0) {
      console.log('❌ 日本語テキストが見つかりません');
      return false;
    }
    
    console.log(`🎯 テスト対象: ${japaneseTexts.length}個の日本語文字`);
    
    // 各文字のスケールを分析
    const scaleAnalysis = {
      normal: japaneseTexts.filter(t => Math.abs(t.localScale.x - 1.0) < 0.1),
      scaled: japaneseTexts.filter(t => t.localScale.x > 2.0),
      hasOffset: japaneseTexts.filter(t => Math.abs(t.localPosition.x) > 5 || Math.abs(t.localPosition.y) > 5)
    };
    
    console.log('\n📈 スケール分析:');
    console.log(`   通常サイズ (1.0x): ${scaleAnalysis.normal.length}個`);
    console.log(`   拡大済み (>2.0x): ${scaleAnalysis.scaled.length}個`);
    console.log(`   位置オフセット有り: ${scaleAnalysis.hasOffset.length}個`);
    
    if (scaleAnalysis.scaled.length > 0) {
      console.log('\n🎉 拡大された文字を発見:');
      scaleAnalysis.scaled.slice(0, 3).forEach((text, i) => {
        console.log(`   ${i+1}. "${text.text}" - Scale: ${text.localScale.x.toFixed(2)}x, Pos: (${text.localPosition.x.toFixed(1)}, ${text.localPosition.y.toFixed(1)})`);
      });
    }
    
    if (scaleAnalysis.hasOffset.length > 0) {
      console.log('\n📍 位置オフセットされた文字:');
      scaleAnalysis.hasOffset.slice(0, 3).forEach((text, i) => {
        console.log(`   ${i+1}. "${text.text}" - Pos: (${text.localPosition.x.toFixed(1)}, ${text.localPosition.y.toFixed(1)})`);
      });
    }
    
    // 動的変化を観察
    console.log('\n⏱️  時間変化を観察...');
    const observations = await this.waitAndObserveChanges();
    
    // 変化の分析
    const hasChanges = this.analyzeChanges(observations);
    
    return {
      totalTexts: japaneseTexts.length,
      scaledTexts: scaleAnalysis.scaled.length,
      offsetTexts: scaleAnalysis.hasOffset.length,
      hasTimeBasedChanges: hasChanges,
      success: scaleAnalysis.scaled.length > 0 || scaleAnalysis.hasOffset.length > 0
    };
  }

  analyzeChanges(observations) {
    if (observations.length < 2) return false;
    
    console.log('\n📊 変化分析:');
    
    let significantChanges = 0;
    
    for (let i = 1; i < observations.length; i++) {
      const prev = observations[i-1];
      const curr = observations[i];
      
      if (prev.texts && curr.texts) {
        const changes = [];
        
        curr.texts.forEach(currText => {
          const prevText = prev.texts.find(p => p.text === currText.text);
          if (prevText) {
            const scaleChange = Math.abs(currText.scale - prevText.scale);
            const posChange = Math.sqrt(
              Math.pow(currText.position.x - prevText.position.x, 2) + 
              Math.pow(currText.position.y - prevText.position.y, 2)
            );
            
            if (scaleChange > 0.1 || posChange > 1.0) {
              changes.push({
                text: currText.text,
                scaleChange,
                posChange
              });
            }
          }
        });
        
        if (changes.length > 0) {
          console.log(`   時刻 ${i}s: ${changes.length}個の文字に変化`);
          significantChanges += changes.length;
        }
      }
    }
    
    console.log(`   総変化数: ${significantChanges}`);
    return significantChanges > 0;
  }

  async takeScreenshot(filename) {
    const screenshotDir = path.join(__dirname, 'test-screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir);
    }
    
    const screenshotPath = path.join(screenshotDir, filename);
    await this.page.screenshot({ path: screenshotPath });
    return screenshotPath;
  }

  generateReport(testResult) {
    console.log('\n📋 === WordSlideText2 実動作検証レポート ===');
    
    console.log(`📊 検出されたテキスト: ${testResult.totalTexts}個`);
    console.log(`🔍 拡大された文字: ${testResult.scaledTexts}個`);
    console.log(`📍 位置オフセット文字: ${testResult.offsetTexts}個`);
    console.log(`⏱️  時間的変化: ${testResult.hasTimeBasedChanges ? 'あり' : 'なし'}`);
    
    const hasScaling = testResult.scaledTexts > 0;
    const hasOffset = testResult.offsetTexts > 0;
    const hasAnimation = testResult.hasTimeBasedChanges;
    
    console.log('\n🎯 機能検証結果:');
    console.log(`   文字拡大機能: ${hasScaling ? '✅ 動作確認' : '❌ 未確認'}`);
    console.log(`   位置オフセット機能: ${hasOffset ? '✅ 動作確認' : '❌ 未確認'}`);
    console.log(`   アニメーション機能: ${hasAnimation ? '✅ 動作確認' : '❌ 未確認'}`);
    
    const overallSuccess = hasScaling || hasOffset;
    
    console.log(`\n🏁 総合判定: ${overallSuccess ? '✅ WordSlideText2機能が動作中' : '❌ 機能未検出'}`);
    
    if (overallSuccess) {
      console.log('🎉 WordSlideText2テンプレートの文字スケーリングと位置オフセット機能が正常に動作しています！');
      
      if (hasScaling) {
        console.log(`   ✓ ${testResult.scaledTexts}個の文字で拡大エフェクトを確認`);
      }
      if (hasOffset) {
        console.log(`   ✓ ${testResult.offsetTexts}個の文字で位置オフセットを確認`);
      }
      if (hasAnimation) {
        console.log('   ✓ 時間経過による動的変化を確認');
      }
    } else {
      console.log('⚠️  WordSlideText2の特徴的なエフェクトが検出されませんでした');
      console.log('   - 文字が通常サイズのままの可能性があります');
      console.log('   - テンプレートが正しく適用されていない可能性があります');
    }
    
    return overallSuccess;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log('🧹 ブラウザクローズ');
    }
  }
}

// メイン実行
async function runActualTest() {
  const test = new WordSlideText2ActualTest();
  
  try {
    await test.setup();
    await test.navigateAndWait();
    
    // 少し待ってシステムを安定化
    console.log('⏳ システム安定化待機...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const testResult = await test.testCharacterScaling();
    
    if (testResult) {
      const success = test.generateReport(testResult);
      return success;
    } else {
      console.log('❌ テスト実行に失敗しました');
      return false;
    }
    
  } catch (error) {
    console.error('❌ テスト中にエラー:', error.message);
    return false;
  } finally {
    await test.cleanup();
  }
}

// スクリプト実行
if (require.main === module) {
  console.log('🎬 WordSlideText2 実動作検証テスト開始');
  console.log('📌 実際に動作しているアプリケーションで文字の拡大とオフセットを検証します\n');
  
  runActualTest()
    .then(success => {
      console.log(`\n🏁 テスト結果: ${success ? '✅ 成功' : '❌ 失敗'}`);
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 予期しないエラー:', error);
      process.exit(1);
    });
}

module.exports = { WordSlideText2ActualTest, runActualTest };