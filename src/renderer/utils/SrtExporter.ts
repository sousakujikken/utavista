import type { PhraseUnit } from '../types/types';

export function formatSrtTimestamp(timeMs: number): string {
  const totalMs = Math.max(0, Math.round(Number.isFinite(timeMs) ? timeMs : 0));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const milliseconds = totalMs % 1_000;

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':') + `,${String(milliseconds).padStart(3, '0')}`;
}

function getPhraseText(phrase: PhraseUnit): string {
  const phraseText = typeof phrase.phrase === 'string' ? phrase.phrase.trim() : '';
  if (phraseText) return phraseText.replace(/\r\n?/g, '\n');

  return phrase.words
    .map(word => word.word)
    .join('')
    .trim()
    .replace(/\r\n?/g, '\n');
}

export function createSrt(phrases: PhraseUnit[]): string {
  const entries = phrases
    .map(phrase => ({
      text: getPhraseText(phrase),
      start: Number(phrase.start),
      end: Number(phrase.end)
    }))
    .filter(entry => entry.text && Number.isFinite(entry.start) && Number.isFinite(entry.end))
    .sort((a, b) => a.start - b.start);

  return entries.map((entry, index) => {
    const start = Math.max(0, entry.start);
    const end = Math.max(start + 1, entry.end);
    return `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${entry.text}`;
  }).join('\n\n') + (entries.length > 0 ? '\n' : '');
}
