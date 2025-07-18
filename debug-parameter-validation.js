const puppeteer = require('puppeteer');

/**
 * Debug script to investigate parameter validation issues
 */

async function debugParameterValidation() {
  console.log('🔍 Debugging parameter validation issues...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      defaultViewport: { width: 1400, height: 900 }
    });
    
    const page = await browser.newPage();
    
    // Listen for console messages
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ParameterValidator') || 
          text.includes('Unknown parameter') || 
          text.includes('validation errors') ||
          text.includes('Array passed as parameter')) {
        console.log(`🔴 VALIDATION ERROR: ${text}`);
      }
    });
    
    // Navigate to the app
    await page.goto('http://localhost:5174', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Wait for the app to load
    await page.waitForFunction(() => {
      return window.__PIXI_APP__ !== undefined;
    }, { timeout: 15000 });
    
    console.log('✅ App loaded, checking for parameter validation issues...');
    
    // Check if WordSlideText2 template is available
    const templateInfo = await page.evaluate(() => {
      // Try to access the template registry
      const registry = window.__TEMPLATE_REGISTRY__;
      if (registry) {
        return registry.map(t => ({ id: t.id, name: t.name }));
      }
      return null;
    });
    
    if (templateInfo) {
      console.log('📋 Available templates:', templateInfo);
      
      const wordSlideText2 = templateInfo.find(t => t.id === 'wordslidetext2');
      if (wordSlideText2) {
        console.log('✅ WordSlideText2 template found');
      } else {
        console.log('❌ WordSlideText2 template not found');
      }
    }
    
    // Try to get parameter config from WordSlideText2
    const parameterConfig = await page.evaluate(() => {
      try {
        // Try to access the template directly
        const app = window.__PIXI_APP__;
        if (app && app.engine && app.engine.templateManager) {
          const template = app.engine.templateManager.getTemplate('wordslidetext2');
          if (template && template.getParameterConfig) {
            return template.getParameterConfig();
          }
        }
        return null;
      } catch (error) {
        return { error: error.message };
      }
    });
    
    if (parameterConfig) {
      if (parameterConfig.error) {
        console.log('❌ Error getting parameter config:', parameterConfig.error);
      } else {
        console.log('✅ Parameter config retrieved:');
        console.log(`   Total parameters: ${parameterConfig.length}`);
        console.log('   First 5 parameters:');
        parameterConfig.slice(0, 5).forEach((param, i) => {
          console.log(`   ${i + 1}. ${param.name} (${param.type}): ${param.default}`);
        });
      }
    }
    
    // Wait for a bit to see if any validation errors occur
    console.log('⏱️ Waiting for validation errors...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the debug script
if (require.main === module) {
  debugParameterValidation()
    .then(() => {
      console.log('🏁 Debug completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Debug failed:', error);
      process.exit(1);
    });
}

module.exports = { debugParameterValidation };