import { BeatDetector } from './BeatDetector';

/**
 * 音楽ファイルの解析とビート検出を行うサービス
 */
export interface BeatDetectionSettings {
  threshold: number; // ビート検出の閾値 (0.0-1.0)
  minBPM: number;    // 最小BPM
  maxBPM: number;    // 最大BPM
  sensitivity: number; // 検出感度 (0.1-2.0)
  lowFreqCutoff: number;  // ローパス周波数 (Hz)
  highFreqCutoff: number; // ハイパス周波数 (Hz)
}

export interface BeatMarker {
  timestamp: number;  // ビートのタイムスタンプ (ms)
  confidence: number; // 検出の信頼度 (0.0-1.0)
  energy: number;     // そのポイントのエネルギー値
}

export interface AnalysisResult {
  beats: BeatMarker[];
  bpm: number;
  duration: number; // トラック全体の長さ (ms)
  averageEnergy: number;
}

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private readonly beatDetector = new BeatDetector();
  
  constructor() {
    this.initializeAudioContext();
  }
  
  private initializeAudioContext(): void {
    try {
      // Web Audio APIのコンテキストを初期化
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('AudioContext initialized:', this.audioContext.state);
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
    }
  }
  
  /**
   * AudioElementまたはファイルからオーディオバッファを作成
   */
  async createAudioBuffer(audioElement: HTMLAudioElement): Promise<AudioBuffer | null> {
    if (!this.audioContext) {
      console.error('AudioContext not initialized');
      return null;
    }
    
    try {
      // AudioElementのsrcからArrayBufferを取得
      const response = await fetch(audioElement.src);
      const arrayBuffer = await response.arrayBuffer();
      
      // デコードしてAudioBufferを作成
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      console.log('AudioBuffer created:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels
      });
      
      return audioBuffer;
    } catch (error) {
      console.error('Failed to create AudioBuffer:', error);
      return null;
    }
  }
  
  /**
   * 音楽ファイルを解析してビートを検出
   */
  async analyzeAudio(
    audioElement: HTMLAudioElement,
    settings: BeatDetectionSettings
  ): Promise<AnalysisResult | null> {
    if (!this.audioContext) {
      await this.initializeAudioContext();
      if (!this.audioContext) {
        console.error('Cannot initialize AudioContext');
        return null;
      }
    }
    
    try {
      const audioBuffer = await this.createAudioBuffer(audioElement);
      if (!audioBuffer) {
        return null;
      }
      
      console.log('Starting audio analysis with settings:', settings);
      
      // チャンネルデータを取得（モノラル化）
      const channelData = this.getMonoChannelData(audioBuffer);
      
      // 周波数フィルタリング
      const filteredData = this.applyFrequencyFiltering(
        channelData,
        audioBuffer.sampleRate,
        settings.lowFreqCutoff,
        settings.highFreqCutoff
      );
      
      // エネルギー計算
      const energyData = this.calculateEnergyData(filteredData, audioBuffer.sampleRate);
      
      // ビート検出
      const beats = this.beatDetector.detect(
        energyData,
        audioBuffer.sampleRate,
        settings
      );
      
      // BPM計算
      const bpm = this.beatDetector.calculateBpm(beats);
      
      // 平均エネルギー計算
      const averageEnergy = energyData.reduce((sum, val) => sum + val, 0) / energyData.length;
      
      const result: AnalysisResult = {
        beats,
        bpm,
        duration: audioBuffer.duration * 1000, // msに変換
        averageEnergy
      };
      
      console.log('Analysis completed:', {
        beatsCount: beats.length,
        bpm: result.bpm,
        duration: result.duration,
        averageEnergy: result.averageEnergy
      });
      
      return result;
    } catch (error) {
      console.error('Audio analysis failed:', error);
      return null;
    }
  }
  
  /**
   * ステレオをモノラルに変換
   */
  private getMonoChannelData(audioBuffer: AudioBuffer): Float32Array {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const monoData = new Float32Array(length);
    
    if (numberOfChannels === 1) {
      // モノラルの場合はそのまま
      return audioBuffer.getChannelData(0);
    } else {
      // ステレオ以上の場合は平均を取る
      for (let i = 0; i < length; i++) {
        let sum = 0;
        for (let channel = 0; channel < numberOfChannels; channel++) {
          sum += audioBuffer.getChannelData(channel)[i];
        }
        monoData[i] = sum / numberOfChannels;
      }
    }
    
    return monoData;
  }
  
  /**
   * 周波数フィルタリング（簡易実装）
   */
  private applyFrequencyFiltering(
    data: Float32Array,
    sampleRate: number,
    lowCutoff: number,
    highCutoff: number
  ): Float32Array {
    // 簡易的なバンドパスフィルタ
    // より高度なフィルタリングが必要な場合はFFTを使用
    const filteredData = new Float32Array(data.length);
    
    // ハイパスフィルタ（低周波数除去）
    const highPassCoeff = 1 - Math.exp(-2 * Math.PI * lowCutoff / sampleRate);
    let highPassOutput = 0;
    
    for (let i = 0; i < data.length; i++) {
      highPassOutput = highPassCoeff * (data[i] - highPassOutput) + highPassOutput;
      filteredData[i] = data[i] - highPassOutput;
    }
    
    // ローパスフィルタ（高周波数除去）
    const lowPassCoeff = Math.exp(-2 * Math.PI * highCutoff / sampleRate);
    let lowPassOutput = 0;
    
    for (let i = 0; i < data.length; i++) {
      lowPassOutput = lowPassCoeff * lowPassOutput + (1 - lowPassCoeff) * Math.abs(filteredData[i]);
      filteredData[i] = lowPassOutput;
    }
    
    return filteredData;
  }
  
  /**
   * エネルギーデータを計算
   */
  private calculateEnergyData(data: Float32Array, sampleRate: number): Float32Array {
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
    const hopSize = Math.floor(windowSize / 4); // 75% overlap
    const energyData: number[] = [];
    
    for (let i = 0; i < data.length - windowSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += data[i + j] * data[i + j];
      }
      energyData.push(Math.sqrt(energy / windowSize));
    }
    
    return new Float32Array(energyData);
  }
  
  /**
   * デフォルトの検出設定
   */
  static getDefaultSettings(): BeatDetectionSettings {
    return {
      threshold: 0.3,     // 30%の閾値
      minBPM: 60,        // 最小60 BPM
      maxBPM: 200,       // 最大200 BPM
      sensitivity: 1.0,   // 標準感度
      lowFreqCutoff: 60,  // 60Hz以下をカット
      highFreqCutoff: 8000 // 8kHz以上をカット
    };
  }
  
  /**
   * リソースをクリーンアップ
   */
  dispose(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.analyserNode) {
      this.analyserNode = null;
    }
  }
}
