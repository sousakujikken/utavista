const puppeteer = require('puppeteer');

async function finalTest() {
  console.log('Running final test for character positioning fix...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[PrimitiveWordSlideText]') && 
        (text.includes('final position') || text.includes('Word container summary'))) {
      console.log('📍 POSITION LOG:', text);
    }
  });
  
  try {
    await page.goto('http://localhost:5174', { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Setting up primitive template test...');
    
    // Add test lyrics and setup
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = `テストABC
あいうえお
12345`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Select primitive template
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const primitiveOption = options.find(option => 
          option.text.includes('Primitive') || option.value.includes('Primitive')
        );
        if (primitiveOption) {
          select.value = primitiveOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('Selected primitive template');
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Take screenshot before
    await page.screenshot({ path: 'final-test-before.png', fullPage: true });
    
    // Generate timing and play
    await page.evaluate(() => {
      // Generate timing
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('生成')) {
          button.click();
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await page.evaluate(() => {
      // Start playback
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('▶')) {
          button.click();
          break;
        }
      }
    });
    
    console.log('Capturing data for 8 seconds...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Take screenshot after
    await page.screenshot({ path: 'final-test-after.png', fullPage: true });
    
    console.log('Final test completed.');
    console.log('Screenshots: final-test-before.png, final-test-after.png');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('Final test failed:', error);
  } finally {
    await browser.close();
  }
}

finalTest();