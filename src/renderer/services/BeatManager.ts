import type { BeatMarker } from './AudioAnalyzer';

export interface BeatEventDetail {
  beat: BeatMarker;
  index: number;
}

type BeatListener = (detail: BeatEventDetail) => void;

/** ビート解析結果を保持し、再生ヘッドがビートを通過した時に通知する。 */
export class BeatManager {
  private beats: BeatMarker[] = [];
  private listeners = new Set<BeatListener>();
  private nextBeatIndex = 0;
  private lastTime: number | null = null;

  setBeats(beats: BeatMarker[]): void {
    this.beats = [...beats].sort((a, b) => a.timestamp - b.timestamp);
    this.sync(0);
  }

  getBeats(): readonly BeatMarker[] {
    return this.beats;
  }

  clear(): void {
    this.beats = [];
    this.nextBeatIndex = 0;
    this.lastTime = null;
  }

  subscribe(listener: BeatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** シークや停止時に通知せずカーソルだけを現在位置へ合わせる。 */
  sync(timeMs: number): void {
    this.lastTime = timeMs;
    this.nextBeatIndex = this.findFirstBeatAfter(timeMs);
  }

  update(timeMs: number): void {
    if (this.lastTime === null || timeMs < this.lastTime || timeMs - this.lastTime > 250) {
      this.sync(timeMs);
      return;
    }

    while (this.nextBeatIndex < this.beats.length) {
      const beat = this.beats[this.nextBeatIndex];
      if (beat.timestamp > timeMs) break;

      if (beat.timestamp > this.lastTime) {
        const detail = { beat, index: this.nextBeatIndex };
        this.listeners.forEach(listener => listener(detail));
        window.dispatchEvent(new CustomEvent<BeatEventDetail>('engine-beat', { detail }));
      }
      this.nextBeatIndex++;
    }

    this.lastTime = timeMs;
  }

  dispose(): void {
    this.clear();
    this.listeners.clear();
  }

  private findFirstBeatAfter(timeMs: number): number {
    let low = 0;
    let high = this.beats.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.beats[middle].timestamp <= timeMs) low = middle + 1;
      else high = middle;
    }
    return low;
  }
}
