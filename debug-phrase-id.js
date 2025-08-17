// phraseId生成とハッシュ計算の問題を検証

function simulateHashCalculation(phraseId) {
  let hash = 0;
  for (let i = 0; i < phraseId.length; i++) {
    const char = phraseId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

console.log('=== phraseId生成パターンの検証 ===');

// 現在の実装（Math.random()使用）をシミュレート
const startMs = 1000;
const phrases = [];

for (let i = 0; i < 10; i++) {
  // 現在の実装: Math.random()を使用
  const currentPhraseId = `phrase_${startMs}_${Math.random()}`;
  const hash = simulateHashCalculation(currentPhraseId);
  const offsetIndex72 = hash % 72;  // 現在生成される72個のオフセットから選択
  
  phrases.push({
    phraseId: currentPhraseId,
    hash: hash,
    offsetIndex: offsetIndex72
  });
}

console.log('現在の実装（Math.random()使用）:');
phrases.forEach((p, i) => {
  console.log(`Phrase ${i}: offsetIndex=${p.offsetIndex} (hash=${p.hash})`);
});

// 重複する offsetIndex を確認
const offsetIndexes = phrases.map(p => p.offsetIndex);
const uniqueIndexes = new Set(offsetIndexes);
console.log(`\n使用されたオフセット種類数: ${uniqueIndexes.size}/10`);
console.log(`重複があった場合の実際の種類: [${Array.from(uniqueIndexes).sort((a,b) => a-b).join(', ')}]`);

console.log('\n=== 修正案: 一意なphraseId生成 ===');

// 修正案1: テキスト内容+開始時刻ベース
const fixedPhrases1 = [];
for (let i = 0; i < 10; i++) {
  const text = `テストフレーズ${i}`;
  const phraseStartMs = startMs + i * 1000;
  const fixedPhraseId = `phrase_${phraseStartMs}_${text.substring(0, 10)}`;
  const hash = simulateHashCalculation(fixedPhraseId);
  const offsetIndex = hash % 72;
  
  fixedPhrases1.push({
    phraseId: fixedPhraseId,
    hash: hash,
    offsetIndex: offsetIndex
  });
}

console.log('修正案1（テキスト+時刻ベース）:');
fixedPhrases1.forEach((p, i) => {
  console.log(`Phrase ${i}: offsetIndex=${p.offsetIndex} (hash=${p.hash})`);
});

const fixedIndexes1 = fixedPhrases1.map(p => p.offsetIndex);
const uniqueFixed1 = new Set(fixedIndexes1);
console.log(`修正案1の使用オフセット種類数: ${uniqueFixed1.size}/10`);

// 修正案2: インデックスベース
const fixedPhrases2 = [];
for (let i = 0; i < 10; i++) {
  const fixedPhraseId = `phrase_${i}_${startMs}`;
  const hash = simulateHashCalculation(fixedPhraseId);
  const offsetIndex = hash % 72;
  
  fixedPhrases2.push({
    phraseId: fixedPhraseId,
    hash: hash,
    offsetIndex: offsetIndex
  });
}

console.log('\n修正案2（インデックス+時刻ベース）:');
fixedPhrases2.forEach((p, i) => {
  console.log(`Phrase ${i}: offsetIndex=${p.offsetIndex} (hash=${p.hash})`);
});

const fixedIndexes2 = fixedPhrases2.map(p => p.offsetIndex);
const uniqueFixed2 = new Set(fixedIndexes2);
console.log(`修正案2の使用オフセット種類数: ${uniqueFixed2.size}/10`);

console.log('\n=== 結論 ===');
console.log(`現在の実装: ${uniqueIndexes.size}/10種類のオフセットを使用`);
console.log(`修正案1: ${uniqueFixed1.size}/10種類のオフセットを使用`);
console.log(`修正案2: ${uniqueFixed2.size}/10種類のオフセットを使用`);