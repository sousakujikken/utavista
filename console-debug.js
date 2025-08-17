// ブラウザコンソールで実行する詳細デバッグスクリプト

console.log('=== Y座標制限問題デバッグ開始 ===');

// Y座標追跡データの確認
function checkYCoordinateTracking() {
  const tracker = window.__Y_COORDINATE_TRACKER__;
  if (tracker) {
    const yCoords = Array.from(tracker).sort((a, b) => a - b);
    console.log(`Y座標追跡データ: ${yCoords.length}種類`);
    console.log('Y座標一覧:', yCoords.slice(0, 20));
    return yCoords;
  } else {
    console.log('Y座標追跡データが見つかりません');
    return [];
  }
}

// オフセットインデックス使用状況の確認
function checkOffsetIndexUsage() {
  const tracker = window.__OFFSET_INDEX_TRACKER__;
  if (tracker) {
    const usage = Array.from(tracker.entries()).sort((a, b) => a[0] - b[0]);
    console.log(`オフセットインデックス使用: ${usage.length}種類`);
    console.log('使用状況 [インデックス:回数]:', usage.slice(0, 20));
    
    // 最も頻繁に使用されているインデックスを特定
    const sortedByUsage = usage.sort((a, b) => b[1] - a[1]);
    console.log('使用頻度トップ10:', sortedByUsage.slice(0, 10));
    return usage;
  } else {
    console.log('オフセットインデックス追跡データが見つかりません');
    return [];
  }
}

// MultiLineLayoutPrimitiveの状態確認
function checkMultiLineLayoutState() {
  const state = window.__MULTI_LINE_LAYOUT_STATE__;
  if (state) {
    console.log('MultiLineLayoutPrimitive状態:');
    console.log('- currentLine:', state.currentLine);
    console.log('- lastPhraseEndMs:', state.lastPhraseEndMs);
    console.log('- phraseLineMap size:', state.phraseLineMap.size);
    console.log('- lineHistory length:', state.lineHistory.length);
    
    if (state.lineHistory.length > 0) {
      console.log('最新の段履歴 (最新5件):');
      state.lineHistory.slice(-5).forEach((entry, i) => {
        console.log(`  ${i}: phraseId="${entry.phraseId}", lineNumber=${entry.lineNumber}, text="${entry.text}"`);
      });
    }
    return state;
  } else {
    console.log('MultiLineLayoutPrimitive状態が見つかりません（正常）');
    return null;
  }
}

// 実行中のフレーズコンテナ情報を取得
function getCurrentPhraseContainers() {
  const containers = [];
  
  // PIXI Applicationを取得
  const app = window.__PIXI_APP__;
  if (!app || !app.stage) {
    console.log('PIXI Applicationが見つかりません');
    return containers;
  }
  
  // フレーズコンテナを再帰的に検索
  function findPhraseContainers(container, depth = 0) {
    if (container.name && container.name.includes('phrase_container')) {
      containers.push({
        name: container.name,
        x: container.x,
        y: container.y,
        worldY: container.worldTransform.ty,
        visible: container.visible,
        alpha: container.alpha,
        children: container.children.length
      });
    }
    
    if (depth < 5) { // 深度制限
      container.children.forEach(child => {
        findPhraseContainers(child, depth + 1);
      });
    }
  }
  
  findPhraseContainers(app.stage);
  
  console.log(`現在のフレーズコンテナ: ${containers.length}個`);
  containers.forEach((c, i) => {
    console.log(`  ${i}: ${c.name}, y=${c.y.toFixed(1)}, worldY=${c.worldY.toFixed(1)}, visible=${c.visible}`);
  });
  
  return containers;
}

// 総合レポート生成
function generateDebugReport() {
  console.log('\n=== 総合デバッグレポート ===');
  
  const yCoords = checkYCoordinateTracking();
  const offsetUsage = checkOffsetIndexUsage();
  const multiLineState = checkMultiLineLayoutState();
  const phraseContainers = getCurrentPhraseContainers();
  
  console.log('\n=== 問題分析 ===');
  
  if (yCoords.length <= 2) {
    console.warn(`⚠️ Y座標種類数が${yCoords.length}種類しかありません（期待値: 60+種類）`);
  } else {
    console.log(`✅ Y座標種類数: ${yCoords.length}種類（正常範囲）`);
  }
  
  if (offsetUsage.length <= 2) {
    console.warn(`⚠️ オフセットインデックス種類数が${offsetUsage.length}種類しかありません（期待値: 72種類）`);
  } else {
    console.log(`✅ オフセットインデックス種類数: ${offsetUsage.length}種類`);
  }
  
  if (multiLineState && multiLineState.phraseLineMap.size > 0) {
    console.warn('⚠️ MultiLineLayoutPrimitiveの状態が検出されました（干渉の可能性）');
  } else {
    console.log('✅ MultiLineLayoutPrimitiveの干渉なし');
  }
  
  if (phraseContainers.length > 0) {
    const uniqueWorldYs = new Set(phraseContainers.map(c => Math.round(c.worldY)));
    console.log(`フレーズコンテナのY座標種類: ${uniqueWorldYs.size}種類`);
    console.log('Y座標値:', Array.from(uniqueWorldYs).sort((a, b) => a - b));
  }
  
  return {
    yCoordinateCount: yCoords.length,
    offsetIndexCount: offsetUsage.length,
    hasMultiLineInterference: !!multiLineState,
    phraseContainerCount: phraseContainers.length
  };
}

// 定期監視の開始
function startMonitoring() {
  console.log('10秒間隔で監視を開始します...');
  const interval = setInterval(() => {
    console.log('\n--- 定期監視レポート ---');
    generateDebugReport();
  }, 10000);
  
  // 60秒後に監視停止
  setTimeout(() => {
    clearInterval(interval);
    console.log('監視を停止しました');
  }, 60000);
  
  return interval;
}

// 初期レポート実行
generateDebugReport();

console.log('\n=== 使用可能なデバッグ関数 ===');
console.log('- checkYCoordinateTracking(): Y座標追跡データの確認');
console.log('- checkOffsetIndexUsage(): オフセットインデックス使用状況の確認');
console.log('- checkMultiLineLayoutState(): MultiLineLayoutPrimitive状態確認');
console.log('- getCurrentPhraseContainers(): 現在のフレーズコンテナ情報取得');
console.log('- generateDebugReport(): 総合デバッグレポート生成');
console.log('- startMonitoring(): 定期監視開始');

// 監視開始を提案
console.log('\n監視を開始するには: startMonitoring()');