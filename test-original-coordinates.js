const puppeteer = require('puppeteer');
const fs = require('fs');

async function testOriginalWordSlideCoordinates() {
  console.log('Testing character coordinates in ORIGINAL WordSlideText...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox'],
    defaultViewport: null
  });
  
  try {
    const page = await browser.newPage();
    
    // Collect logs
    const logs = [];
    page.on('console', (msg) => {
      const text = msg.text();
      logs.push(`${new Date().toISOString()}: ${text}`);
      
      if (text.includes('[WordSlideText]') || text.includes('VISIBLE CHAR')) {
        console.log('PAGE:', text);
      }
    });
    
    console.log('Loading application...');
    await page.goto('http://localhost:5174', { timeout: 20000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Setting up test with ORIGINAL WordSlideText...');
    
    // Add test lyrics and setup for original template
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = `テストABC
あいうえお
123456`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Try to select original WordSlideText template (not Primitive)
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const originalOption = options.find(option => 
          option.text.includes('WordSlideText') && !option.text.includes('Primitive')
        );
        if (originalOption) {
          select.value = originalOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('Selected original template:', originalOption.text);
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate timing
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('生成')) {
          button.click();
          console.log('Generated timing');
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Start playback
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('▶')) {
          button.click();
          console.log('Started playback');
          break;
        }
      }
    });
    
    // Capture for 8 seconds
    console.log('Capturing original template data...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Save logs
    fs.writeFileSync('original-wordslide-logs.txt', logs.join('\n'));
    
    // Take screenshot
    await page.screenshot({ 
      path: 'original-wordslide-screenshot.png',
      fullPage: true 
    });
    
    console.log('Original WordSlideText test completed');
    console.log('Logs saved to original-wordslide-logs.txt');
    console.log('Screenshot saved to original-wordslide-screenshot.png');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

testOriginalWordSlideCoordinates();