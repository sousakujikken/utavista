// 実際のシステムでのphraseId生成とY座標選択を検証

const puppeteer = require('puppeteer');

async function captureRealPhraseIds() {
  console.log('実際のphraseId生成とY座標選択を検証中...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null
  });
  
  try {
    const page = await browser.newPage();
    
    // Random placement専用ログを収集
    const phraseData = [];
    page.on('console', (msg) => {
      const text = msg.text();
      
      // Random placementログを解析
      if (text.includes('[SlideAnimationPrimitive] Random placement:')) {
        const match = text.match(/phraseId="([^"]*)", hash=(\d+), offsetIndex=(\d+)\/(\d+), offset=\(([^,]+), ([^)]+)\), finalY=([^)]+)/);
        if (match) {
          phraseData.push({
            phraseId: match[1],
            hash: parseInt(match[2]),
            offsetIndex: parseInt(match[3]),
            totalOffsets: parseInt(match[4]),
            offsetX: parseFloat(match[5]),
            offsetY: parseFloat(match[6]),
            finalY: parseFloat(match[7]),
            timestamp: new Date().toISOString()
          });
          
          console.log(`Captured: phraseId="${match[1]}", offsetIndex=${match[3]}, finalY=${match[7]}`);
        }
      }
    });
    
    // アプリケーションロード
    await page.goto('http://localhost:5177', { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // テスト歌詞設定
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = `テスト1
テスト2
テスト3
テスト4
テスト5
テスト6
テスト7
テスト8
テスト9
テスト10`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // PurePrimitiveWordSlideTextテンプレートを選択
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const targetOption = options.find(option => 
          option.text.includes('PurePrimitiveWordSlideText') || 
          option.value.includes('PurePrimitiveWordSlideText')
        );
        if (targetOption) {
          select.value = targetOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('Selected PurePrimitiveWordSlideText');
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // タイミング生成
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('生成') || button.title.includes('自動生成')) {
          button.click();
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 再生開始
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent.includes('▶')) {
          button.click();
          break;
        }
      }
    });
    
    // 15秒間データ収集
    console.log('15秒間データ収集中...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // 結果分析
    console.log(`\n=== 収集結果分析 ===`);
    console.log(`総フレーズ数: ${phraseData.length}`);
    
    if (phraseData.length > 0) {
      // phraseIdのパターン分析
      const phraseIdPatterns = new Set(phraseData.map(p => p.phraseId));
      console.log(`異なるphraseID数: ${phraseIdPatterns.size}`);
      
      // offsetIndexの分布
      const offsetIndexes = phraseData.map(p => p.offsetIndex);
      const uniqueOffsetIndexes = new Set(offsetIndexes);
      console.log(`使用されたoffsetIndex種類数: ${uniqueOffsetIndexes.size}`);
      console.log(`offsetIndex一覧: [${Array.from(uniqueOffsetIndexes).sort((a,b) => a-b).join(', ')}]`);
      
      // finalYの分布
      const finalYs = phraseData.map(p => Math.round(p.finalY));
      const uniqueFinalYs = new Set(finalYs);
      console.log(`最終Y座標種類数: ${uniqueFinalYs.size}`);
      console.log(`Y座標一覧: [${Array.from(uniqueFinalYs).sort((a,b) => a-b).join(', ')}]`);
      
      // 詳細データ表示
      console.log(`\n=== 詳細データ ===`);
      phraseData.slice(0, 10).forEach((p, i) => {
        console.log(`${i+1}: phraseId="${p.phraseId}", offsetIndex=${p.offsetIndex}, finalY=${p.finalY.toFixed(1)}`);
      });
      
      // Math.random()による重複確認
      const phraseIdsByRandom = phraseData.filter(p => p.phraseId.includes('Math.random') || p.phraseId.includes('0.'));
      if (phraseIdsByRandom.length > 0) {
        console.log(`\nMath.random()使用phraseID: ${phraseIdsByRandom.length}個`);
      }
      
      // 同じoffsetIndexが複数回使用されているかチェック
      const offsetIndexCounts = {};
      offsetIndexes.forEach(idx => {
        offsetIndexCounts[idx] = (offsetIndexCounts[idx] || 0) + 1;
      });
      
      console.log(`\n=== offsetIndex使用頻度 ===`);
      Object.entries(offsetIndexCounts)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .forEach(([idx, count]) => {
          console.log(`offsetIndex ${idx}: ${count}回使用`);
        });
    }
    
    // ブラウザ開いたまま30秒待機
    console.log('\n検証のため30秒間ブラウザを開いたままにします...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('検証エラー:', error);
  } finally {
    await browser.close();
  }
}

// サーバー稼働確認してから実行
fetch('http://localhost:5177')
  .then(() => captureRealPhraseIds())
  .catch(() => {
    console.log('開発サーバーがlocalhost:5177で稼働していません');
    console.log('npm run devでサーバーを起動してください');
  });