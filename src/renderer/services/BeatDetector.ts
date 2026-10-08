import type { BeatDetectionSettings, BeatMarker } from './AudioAnalyzer';

/**
 * エネルギー包絡からオンセットを検出し、ビート列とBPMを算出する。
 * AudioAnalyzerから検出ロジックを分離し、解析方法を差し替えやすくする。
 */
export class BeatDetector {
  detect(
    energyData: Float32Array,
    sampleRate: number,
    settings: BeatDetectionSettings
  ): BeatMarker[] {
    if (energyData.length < 3 || sampleRate <= 0) return [];

    const beats: BeatMarker[] = [];
    const hopSize = Math.max(1, Math.floor(sampleRate * 0.05 / 4));
    const localAverageWindow = Math.max(1, Math.floor(energyData.length * 0.1));

    for (let i = localAverageWindow; i < energyData.length - localAverageWindow; i++) {
      const currentEnergy = energyData[i];
      let localSum = 0;

      for (let j = i - localAverageWindow; j < i + localAverageWindow; j++) {
        localSum += energyData[j];
      }

      const localAverage = localSum / (2 * localAverageWindow);
      // sensitivity が高いほど閾値を下げ、より小さいオンセットも拾う。
      const sensitivity = Math.max(0.1, settings.sensitivity);
      const threshold = localAverage * (1 + settings.threshold) / sensitivity;
      if (threshold <= 0 || currentEnergy <= threshold) continue;

      const isPeak = currentEnergy >= energyData[i - 1] && currentEnergy >= energyData[i + 1];
      if (!isPeak) continue;

      const timestamp = (i * hopSize / sampleRate) * 1000;
      const lastBeat = beats[beats.length - 1];
      if (!lastBeat || timestamp - lastBeat.timestamp > 100) {
        beats.push({
          timestamp,
          confidence: Math.min(currentEnergy / threshold, 1),
          energy: currentEnergy
        });
      }
    }

    return this.filterByBpmRange(beats, settings.minBPM, settings.maxBPM);
  }

  calculateBpm(beats: BeatMarker[]): number {
    if (beats.length < 2) return 0;

    const intervals = beats.slice(1).map((beat, index) => beat.timestamp - beats[index].timestamp);
    const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    return averageInterval > 0 ? Math.round(60000 / averageInterval) : 0;
  }

  private filterByBpmRange(
    beats: BeatMarker[],
    minBPM: number,
    maxBPM: number
  ): BeatMarker[] {
    if (beats.length < 2) return beats;

    const intervals = beats.slice(1)
      .map((beat, index) => beat.timestamp - beats[index].timestamp)
      .sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    const estimatedBPM = medianInterval > 0 ? 60000 / medianInterval : 0;

    if (estimatedBPM < minBPM || estimatedBPM > maxBPM) {
      return beats
        .filter(beat => beat.confidence > 0.7)
        .sort((a, b) => a.timestamp - b.timestamp);
    }

    return beats;
  }
}
