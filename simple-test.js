const puppeteer = require('puppeteer');

async function simpleTest() {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Listen for console logs
  page.on('console', (msg) => {
    if (msg.text().includes('[PrimitiveWordSlideText]')) {
      console.log('PRIMITIVE LOG:', msg.text());
    }
  });
  
  try {
    await page.goto('http://localhost:5174', { timeout: 10000 });
    
    // Take screenshot after 10 seconds
    console.log('Taking screenshot in 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await page.screenshot({ 
      path: 'simple-test-screenshot.png',
      fullPage: true 
    });
    
    console.log('Screenshot saved. Browser will stay open for 30 seconds for manual inspection.');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

simpleTest();