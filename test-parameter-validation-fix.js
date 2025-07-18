const puppeteer = require('puppeteer');

/**
 * Test script to verify parameter validation fixes
 */

async function testParameterValidationFix() {
  console.log('🧪 Testing parameter validation fixes...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      defaultViewport: { width: 1400, height: 900 }
    });
    
    const page = await browser.newPage();
    
    // Track validation errors
    const validationErrors = [];
    const successfulValidations = [];
    
    // Listen for console messages
    page.on('console', msg => {
      const text = msg.text();
      
      if (text.includes('ParameterValidator') || text.includes('validation')) {
        if (text.includes('Unknown parameter') || text.includes('CRITICAL') || text.includes('Array passed as parameter')) {
          validationErrors.push(text);
          console.log(`🔴 VALIDATION ERROR: ${text}`);
        } else if (text.includes('Converting parameter config array') || text.includes('validation successful')) {
          successfulValidations.push(text);
          console.log(`🟢 VALIDATION SUCCESS: ${text}`);
        }
      }
    });
    
    // Navigate to the app
    console.log('🌐 Loading application...');
    await page.goto('http://localhost:5174', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Wait for the app to load
    await page.waitForFunction(() => {
      return window.__PIXI_APP__ !== undefined;
    }, { timeout: 15000 });
    
    console.log('✅ Application loaded successfully');
    
    // Try to access WordSlideText2 template
    console.log('🎯 Testing WordSlideText2 template access...');
    const templateTest = await page.evaluate(() => {
      try {
        const app = window.__PIXI_APP__;
        if (!app || !app.engine) return { error: 'Engine not found' };
        
        const templateManager = app.engine.templateManager;
        if (!templateManager) return { error: 'Template manager not found' };
        
        // Try to get the template
        const template = templateManager.getTemplate('wordslidetext2');
        if (!template) return { error: 'WordSlideText2 template not found' };
        
        // Test parameter configuration
        if (typeof template.getParameterConfig === 'function') {
          const paramConfig = template.getParameterConfig();
          return {
            success: true,
            paramCount: paramConfig.length,
            firstParams: paramConfig.slice(0, 3).map(p => ({ name: p.name, type: p.type, default: p.default }))
          };
        }
        
        return { error: 'getParameterConfig method not found' };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    if (templateTest.error) {
      console.log(`❌ Template test failed: ${templateTest.error}`);
    } else {
      console.log(`✅ Template test passed:`);
      console.log(`   Parameter count: ${templateTest.paramCount}`);
      console.log(`   First parameters:`, templateTest.firstParams);
    }
    
    // Try to trigger parameter updates
    console.log('🔄 Testing parameter updates...');
    await page.evaluate(() => {
      try {
        const app = window.__PIXI_APP__;
        if (app && app.engine && app.engine.parameterManager) {
          // Test updating global parameters
          app.engine.parameterManager.updateGlobalDefaults({
            fontSize: 150,
            textColor: '#ff0000'
          });
          
          console.log('✅ Global parameter update test completed');
        }
      } catch (error) {
        console.error('❌ Parameter update test failed:', error);
      }
    });
    
    // Wait for any additional validation errors
    console.log('⏱️ Waiting for validation results...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Report results
    console.log('\n📊 Test Results:');
    console.log(`   Validation errors: ${validationErrors.length}`);
    console.log(`   Successful validations: ${successfulValidations.length}`);
    
    if (validationErrors.length === 0) {
      console.log('🎉 SUCCESS: No parameter validation errors detected!');
      return true;
    } else {
      console.log('❌ FAILURE: Parameter validation errors still present');
      console.log('   Errors:', validationErrors);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testParameterValidationFix()
    .then(success => {
      console.log(`\n🏁 Test result: ${success ? '✅ PASSED' : '❌ FAILED'}`);
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test error:', error);
      process.exit(1);
    });
}

module.exports = { testParameterValidationFix };