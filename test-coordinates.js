const puppeteer = require('puppeteer');
const fs = require('fs');

async function testCharacterCoordinates() {
  console.log('Testing character coordinates in Primitive WordSlideText...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null
  });
  
  try {
    const page = await browser.newPage();
    
    // Collect all console logs
    const logs = [];
    page.on('console', (msg) => {
      const text = msg.text();
      logs.push(`${new Date().toISOString()}: ${text}`);
      
      // Print important logs to terminal immediately
      if (text.includes('[PrimitiveWordSlideText]')) {
        console.log('PAGE:', text);
      }
    });
    
    // Load the app
    console.log('Loading application...');
    await page.goto('http://localhost:5174', { timeout: 15000 });
    
    // Wait a bit for initial loading
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Setting up test lyrics and template...');
    
    // Add test lyrics and setup
    await page.evaluate(() => {
      // Add simple test lyrics
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = `テストあいう
ABCDEFG
123456789`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Try to select Primitive template
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const primitiveOption = options.find(option => 
          option.text.includes('Primitive') || option.value.includes('Primitive')
        );
        if (primitiveOption) {
          select.value = primitiveOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('Selected primitive template:', primitiveOption.text);
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate timing
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('生成') || button.title.includes('自動生成')) {
          button.click();
          console.log('Clicked timing generation');
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Starting playback to capture coordinate data...');
    
    // Start playback
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('▶') || button.title.includes('再生')) {
          button.click();
          console.log('Started playback');
          break;
        }
      }
    });
    
    // Let it run for 10 seconds to capture character display
    console.log('Capturing coordinate data for 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Pause
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('⏸') || button.textContent.includes('||')) {
          button.click();
          console.log('Paused playback');
          break;
        }
      }
    });
    
    // Save all logs to file for analysis
    const logFile = 'coordinate-test-logs.txt';
    fs.writeFileSync(logFile, logs.join('\n'));
    console.log(`All logs saved to ${logFile}`);
    
    // Filter and display visible character logs
    const visibleCharLogs = logs.filter(log => log.includes('📍 VISIBLE CHAR'));
    console.log(`\n=== VISIBLE CHARACTER COORDINATES (${visibleCharLogs.length} entries) ===`);
    visibleCharLogs.slice(0, 20).forEach(log => console.log(log)); // Show first 20
    
    if (visibleCharLogs.length > 20) {
      console.log(`... and ${visibleCharLogs.length - 20} more entries (see ${logFile})`);
    }
    
    // Take a screenshot
    await page.screenshot({ 
      path: 'coordinate-test-screenshot.png',
      fullPage: true 
    });
    console.log('Screenshot saved as coordinate-test-screenshot.png');
    
    // Keep browser open for manual inspection
    console.log('\nBrowser will stay open for 30 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

// Check if server is running
fetch('http://localhost:5174')
  .then(() => testCharacterCoordinates())
  .catch(() => {
    console.log('Development server not running on localhost:5174');
    console.log('Please start the dev server with: npm run dev');
  });