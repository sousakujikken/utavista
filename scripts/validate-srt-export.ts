import assert from 'node:assert/strict';
import { createSrt, formatSrtTimestamp } from '../src/renderer/utils/SrtExporter';
import type { PhraseUnit } from '../src/renderer/types/types';

assert.equal(formatSrtTimestamp(0), '00:00:00,000');
assert.equal(formatSrtTimestamp(3_661_234), '01:01:01,234');

const phrases: PhraseUnit[] = [
  {
    id: 'phrase_2',
    phrase: '',
    start: 2500,
    end: 4200,
    words: [
      { id: 'word_1', word: '世界', start: 2500, end: 4200, chars: [] }
    ]
  },
  {
    id: 'phrase_1',
    phrase: 'こんにちは',
    start: 500,
    end: 2000,
    words: []
  }
];

assert.equal(
  createSrt(phrases),
  '1\n00:00:00,500 --> 00:00:02,000\nこんにちは\n\n' +
  '2\n00:00:02,500 --> 00:00:04,200\n世界\n'
);
assert.equal(createSrt([]), '');

console.log('SRT export validation passed.');
