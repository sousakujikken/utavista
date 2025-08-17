// Y座標が2種類に限定される問題のデバッグ用テストスクリプト

function testGenerateOffsetList(seed, rangeX, rangeY, minDistance) {
  const offsets = [];
  const targetCount = 100;
  
  let rng = seed + 1;
  const nextRandom = () => {
    rng = ((rng * 1103515245) + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  
  let attempts = 0;
  const maxAttempts = 10000;
  
  while (offsets.length < targetCount && attempts < maxAttempts) {
    attempts++;
    
    const x = (nextRandom() - 0.5) * rangeX;
    const y = (nextRandom() - 0.5) * rangeY;
    
    let valid = true;
    for (const existing of offsets) {
      const distance = Math.sqrt(Math.pow(x - existing.x, 2) + Math.pow(y - existing.y, 2));
      if (distance < minDistance) {
        valid = false;
        break;
      }
    }
    
    if (valid) {
      offsets.push({ x, y });
    }
  }
  
  return { offsets, attempts };
}

// 現在の設定でテスト
const currentSettings = {
  seed: 0,
  rangeX: 200,
  rangeY: 200,
  minDistance: 20  // 現在の設定
};

console.log('=== 現在の設定でのテスト ===');
const currentResult = testGenerateOffsetList(
  currentSettings.seed,
  currentSettings.rangeX,
  currentSettings.rangeY,
  currentSettings.minDistance
);

console.log(`生成されたオフセット数: ${currentResult.offsets.length}/100`);
console.log(`試行回数: ${currentResult.attempts}`);

// Y座標の分布を確認
const yValues = currentResult.offsets.map(o => o.y);
const uniqueYCount = new Set(yValues.map(y => Math.round(y))).size;
console.log(`Y座標の種類数 (整数値): ${uniqueYCount}`);

// Y座標のヒストグラム（10個のバケット）
const yMin = Math.min(...yValues);
const yMax = Math.max(...yValues);
const bucketSize = (yMax - yMin) / 10;
const buckets = Array(10).fill(0);

yValues.forEach(y => {
  const bucketIndex = Math.min(Math.floor((y - yMin) / bucketSize), 9);
  buckets[bucketIndex]++;
});

console.log('\nY座標分布 (10バケット):');
buckets.forEach((count, i) => {
  const bucketStart = yMin + i * bucketSize;
  const bucketEnd = yMin + (i + 1) * bucketSize;
  console.log(`[${bucketStart.toFixed(1)} ~ ${bucketEnd.toFixed(1)}]: ${count}`);
});

// minDistanceを緩和した場合のテスト
console.log('\n=== minDistance緩和テスト (20→5) ===');
const relaxedResult = testGenerateOffsetList(
  currentSettings.seed,
  currentSettings.rangeX,
  currentSettings.rangeY,
  5  // minDistanceを20→5に緩和
);

console.log(`緩和後の生成オフセット数: ${relaxedResult.offsets.length}/100`);
console.log(`緩和後の試行回数: ${relaxedResult.attempts}`);

const relaxedYValues = relaxedResult.offsets.map(o => o.y);
const relaxedUniqueYCount = new Set(relaxedYValues.map(y => Math.round(y))).size;
console.log(`緩和後のY座標種類数: ${relaxedUniqueYCount}`);

// 更に緩和した場合のテスト
console.log('\n=== minDistance更に緩和テスト (20→1) ===');
const veryRelaxedResult = testGenerateOffsetList(
  currentSettings.seed,
  currentSettings.rangeX,
  currentSettings.rangeY,
  1  // minDistanceを20→1に大幅緩和
);

console.log(`大幅緩和後の生成オフセット数: ${veryRelaxedResult.offsets.length}/100`);
console.log(`大幅緩和後の試行回数: ${veryRelaxedResult.attempts}`);

const veryRelaxedYValues = veryRelaxedResult.offsets.map(o => o.y);
const veryRelaxedUniqueYCount = new Set(veryRelaxedYValues.map(y => Math.round(y))).size;
console.log(`大幅緩和後のY座標種類数: ${veryRelaxedUniqueYCount}`);

// ランダムシードの影響をテスト
console.log('\n=== 異なるランダムシードでのテスト ===');
for (let seed = 0; seed < 5; seed++) {
  const seedResult = testGenerateOffsetList(seed, 200, 200, 5);
  const seedYValues = seedResult.offsets.map(o => o.y);
  const seedUniqueYCount = new Set(seedYValues.map(y => Math.round(y))).size;
  console.log(`Seed ${seed}: オフセット数=${seedResult.offsets.length}, Y座標種類数=${seedUniqueYCount}`);
}