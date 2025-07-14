import React, { useRef, useEffect, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import Engine from '../../engine/Engine';
import { ViewportManager } from '../../utils/ViewportManager';
import '../../styles/components.css';

interface WaveformPanelProps {
  currentTime: number;
  totalDuration: number;
  viewStart?: number; // 表示開始時間（ズーム機能用）
  viewDuration?: number; // 表示期間（ズーム機能用）
  engine?: Engine;
  onSeek?: (value: number) => void;
  viewportManager?: ViewportManager;
}

const WaveformPanel: React.FC<WaveformPanelProps> = ({ 
  currentTime, 
  totalDuration,
  viewStart = 0,
  viewDuration,
  engine,
  onSeek,
  viewportManager
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [debugInfo, setDebugInfo] = useState<any>({});
  
  // リアルタイム音量分析用
  const [currentVolume, setCurrentVolume] = useState(0);
  const [volumeHistory, setVolumeHistory] = useState<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const volumeAnimationFrameRef = useRef<number>();
  
  // シーク状態管理
  const isSeekingRef = useRef(false);
  const lastSeekTimeRef = useRef(0);
  
  // シークイベントハンドラをコンポーネントトップレベルで定義
  const handleSeek = useCallback((progress: number) => {
    // 統一された全体長（totalDuration）に基づいてシーク位置を計算
    const seekTime = progress * totalDuration;
    
    
    // シーク状態を記録
    isSeekingRef.current = true;
    lastSeekTimeRef.current = Date.now();
    
    // 直接Engineを呼び出して遅延を最小化
    if (engine) {
      try {
        engine.seek(seekTime);
        
        // シーク直後に波形も即座に同期（複数回実行して確実に）
        if (wavesurferRef.current) {
          wavesurferRef.current.seekTo(progress);
          
          // 少し遅延してもう一度同期（確実性向上）
          setTimeout(() => {
            if (wavesurferRef.current) {
              wavesurferRef.current.seekTo(progress);
            }
          }, 16); // 1フレーム後
          
          // さらに遅延してもう一度（最終確認）
          setTimeout(() => {
            if (wavesurferRef.current) {
              const currentProgress = wavesurferRef.current.getCurrentTime() / wavesurferRef.current.getDuration();
              const progressDiff = Math.abs(currentProgress - progress);
              
              if (progressDiff > 0.01) { // 1%以上のズレがある場合
                wavesurferRef.current.seekTo(progress);
              }
            }
            
            // シーク状態を解除
            isSeekingRef.current = false;
          }, 100); // 100ms後
        }
      } catch (error) {
        console.error('[WaveformPanel] Direct engine seek failed:', error);
        isSeekingRef.current = false;
        // フォールバック: イベント経由
        const waveformSeekEvent = new CustomEvent('waveform-seek', {
          detail: { 
            currentTime: seekTime,
            timestamp: Date.now(),
            source: 'WaveformPanel-Fallback',
            progress: progress,
            totalDuration: totalDuration
          }
        });
        window.dispatchEvent(waveformSeekEvent);
      }
    } else {
      // Engineが利用できない場合はイベント経由
      console.warn('[WaveformPanel] Engine not available, using event fallback');
      isSeekingRef.current = false;
      const waveformSeekEvent = new CustomEvent('waveform-seek', {
        detail: { 
          currentTime: seekTime,
          timestamp: Date.now(),
          source: 'WaveformPanel-NoEngine',
          progress: progress,
          totalDuration: totalDuration
        }
      });
      window.dispatchEvent(waveformSeekEvent);
    }
  }, [totalDuration, engine]);
  
  // リアルタイム音量分析機能
  const initializeAudioAnalyzer = useCallback(() => {
    if (!engine || !audioUrl) return;
    
    try {
      // AudioContextの作成（まだない場合）
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      // Analyserノードの作成
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256; // FFTサイズ（小さくして軽量化）
      analyser.smoothingTimeConstant = 0.8; // スムージング
      
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      // Engine側のHowler音源に接続を試行
      // 注意: Howlerは直接Web Audio APIとの接続が難しいため、
      // 代替案としてdummy audio elementを使用
      
      
      // 音量監視開始
      startVolumeMonitoring();
      
    } catch (error) {
      console.error('[WaveformPanel] Audio analyzer initialization failed:', error);
    }
  }, [engine, audioUrl]);
  
  const startVolumeMonitoring = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    
    const analyzeVolume = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      
      // 周波数データを取得
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      
      // RMS（Root Mean Square）で音量を計算
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i] * dataArrayRef.current[i];
      }
      const rms = Math.sqrt(sum / dataArrayRef.current.length);
      const volume = rms / 255; // 0-1の範囲に正規化
      
      setCurrentVolume(volume);
      
      // 音量履歴を更新（直近100フレーム）
      setVolumeHistory(prev => {
        const newHistory = [...prev, volume];
        return newHistory.slice(-100); // 直近100フレームのみ保持
      });
      
      // 次のフレームで再実行
      volumeAnimationFrameRef.current = requestAnimationFrame(analyzeVolume);
    };
    
    // 監視開始
    volumeAnimationFrameRef.current = requestAnimationFrame(analyzeVolume);
  }, []);
  
  // 代替案: WaveSurferの音源から音量を取得
  const getWaveSurferVolumeData = useCallback(() => {
    if (!wavesurferRef.current) return 0;
    
    try {
      // WaveSurferのバックエンドがMediaElementの場合
      const backend = (wavesurferRef.current as any).backend;
      if (backend && backend.media) {
        const mediaElement = backend.media as HTMLAudioElement;
        
        // Web Audio APIでmediaElementに接続
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const audioContext = audioContextRef.current;
        
        // MediaElementSourceを作成
        const source = audioContext.createMediaElementSource(mediaElement);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        // 接続: source -> analyser -> destination
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        
        startVolumeMonitoring();
        
        return true;
      }
    } catch (error) {
      console.warn('[WaveformPanel] WaveSurfer audio connection failed:', error);
    }
    
    return false;
  }, [startVolumeMonitoring]);

  // クリックイベントハンドラ（useRefで最新のpropsを保持）
  const totalDurationRef = useRef(totalDuration);
  const viewStartRef = useRef(viewStart);
  const viewDurationRef = useRef(viewDuration);
  
  // propsの更新時にrefを更新
  useEffect(() => {
    totalDurationRef.current = totalDuration;
    viewStartRef.current = viewStart;
    viewDurationRef.current = viewDuration;
  }, [totalDuration, viewStart, viewDuration]);
  
  const handleClick = (progress: number) => {
    // refで最新の値を参照
    const currentTotalDuration = totalDurationRef.current;
    
    // 統一された全体長（totalDuration）に基づいてシーク位置を計算
    const seekTime = progress * currentTotalDuration;
    
    
    // シーク状態を記録
    isSeekingRef.current = true;
    lastSeekTimeRef.current = Date.now();
    
    // 直接Engineを呼び出して遅延を最小化
    if (engine) {
      try {
        engine.seek(seekTime);
      } catch (error) {
        console.error('[WaveformPanel] Direct engine click seek failed:', error);
      }
    }
    
    // 波形の表示も即座に更新（Engineの更新と並行実行）
    if (wavesurferRef.current) {
      wavesurferRef.current.seekTo(progress);
      
      // 多段階同期で確実性を向上
      setTimeout(() => {
        if (wavesurferRef.current) {
          wavesurferRef.current.seekTo(progress);
        }
      }, 16);
      
      setTimeout(() => {
        if (wavesurferRef.current) {
          const currentProgress = wavesurferRef.current.getCurrentTime() / wavesurferRef.current.getDuration();
          const progressDiff = Math.abs(currentProgress - progress);
          
          if (progressDiff > 0.01) {
            // 最終シーク修正ログ削除済み
            wavesurferRef.current.seekTo(progress);
          }
        }
        
        // シーク状態を解除
        isSeekingRef.current = false;
      }, 100);
    }
  };
  
  // 音声ファイルURLの監視
  useEffect(() => {
    // 音楽ファイル読み込みイベントのリスナー（MusicPanelからの即座のイベント）
    const handleMusicFileLoaded = (event: CustomEvent) => {
      // 音楽ファイル読み込みイベントログ削除済み
      
      // filePathまたはurlプロパティから音楽ファイルパスを取得
      const musicFilePath = event.detail.filePath || event.detail.url;
      
      if (musicFilePath) {
        // ElectronでWaveSurferが動作するよう、file://プロトコルを付与してエンコード
        const fileUrl = 'file://' + encodeURI(musicFilePath.replace(/\\/g, '/'));
        // ファイルURL処理ログ削除済み
        setAudioUrl(fileUrl);
        setIsReady(false); // 新しいファイル読み込み時にリセット
        setForceRefresh(prev => prev + 1); // 強制的に再レンダリングをトリガー
      } else {
        console.warn('WaveformPanel: No filePath or url in music-file-loaded event', event.detail);
      }
    };
  
    window.addEventListener('music-file-loaded', handleMusicFileLoaded as EventListener);
    
    return () => {
      window.removeEventListener('music-file-loaded', handleMusicFileLoaded as EventListener);
    };
  }, []);
  

  // WaveSurferの初期化
  useEffect(() => {
    // WaveSurfer初期化ログ削除済み
    
    if (!waveformRef.current || !audioUrl) {
      setIsReady(false);
      return;
    }
    
    // 既存のインスタンスがあれば破棄
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
      setIsReady(false);
    }
    
    // WaveSurferインスタンスの作成
    try {
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#555',
        progressColor: '#09f',
        cursorColor: '#fff',
        barWidth: 2,
        barGap: 1,
        height: 'auto',
        normalize: true,
        responsive: true,
        fillParent: true,
        backend: 'MediaElement',
        interact: true,
        closeAudioContext: false,
        mediaControls: false,
        autoplay: false, // 自動再生を無効化
        preload: 'metadata' // メタデータのみ読み込み
      });
      
      // 音声ファイル読み込み
      wavesurfer.load(audioUrl);
      
      // イベントリスナー
      wavesurfer.on('ready', () => {
        
        // WaveSurferが勝手に再生しないよう確実に停止
        if (wavesurfer.isPlaying()) {
          wavesurfer.pause();
        }
        
        setIsReady(true);
        
        // 音量分析の初期化を試行
        setTimeout(() => {
          const connected = getWaveSurferVolumeData();
          if (!connected) {
          }
        }, 500); // WaveSurferが完全に準備されるまで少し待機
        
        // 波形読み込み完了イベントを発火
        const waveformReadyEvent = new CustomEvent('waveform-ready', {
          detail: { 
            duration: wavesurfer.getDuration() * 1000 // ミリ秒に変換
          }
        });
        window.dispatchEvent(waveformReadyEvent);
      });
      
      wavesurfer.on('loading', (percent) => {
      });
      
      // クリックイベントの登録
      wavesurfer.on('click', handleClick);
      
      // エラーハンドリング
      wavesurfer.on('error', (err) => {
        console.error('WaveSurfer error details:', {
          error: err,
          audioUrl: audioUrl,
          containerReady: !!waveformRef.current,
          timestamp: Date.now()
        });
        setIsReady(false);
      });
      
      wavesurferRef.current = wavesurfer;
    } catch (error) {
      console.error('WaveSurfer initialization error:', error);
    }
    
    // クリーンアップ
    return () => {
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
        } catch (error) {
          console.warn('[WaveformPanel] Error during WaveSurfer cleanup:', error);
        }
        wavesurferRef.current = null;
        setIsReady(false);
      }
      
      // 音量分析のクリーンアップ
      if (volumeAnimationFrameRef.current) {
        cancelAnimationFrame(volumeAnimationFrameRef.current);
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (error) {
          console.warn('[WaveformPanel] Error during AudioContext cleanup:', error);
        }
        audioContextRef.current = null;
      }
      setCurrentVolume(0);
      setVolumeHistory([]);
    };
  }, [audioUrl, forceRefresh]);
  
  // 統一された時間ソースを使用する単一の同期処理
  useEffect(() => {
    if (wavesurferRef.current && isReady && totalDuration > 0 && !isSeekingRef.current) {
      try {
        // 統一されたtotalDurationに基づいて進行度を計算
        const progress = Math.min(Math.max(currentTime / totalDuration, 0), 1);
        
        // デバッグ情報を更新
        if (engine) {
          const waveSurferCurrentTime = wavesurferRef.current.getCurrentTime();
          const engineTimeInSeconds = engine.currentTime / 1000;
          const timeDifferenceSeconds = Math.abs(engineTimeInSeconds - waveSurferCurrentTime);
          
          const newDebugInfo = {
            timeDifferenceSeconds: timeDifferenceSeconds,
            isMajorDesync: timeDifferenceSeconds > 2.0,
            isRecentSeek: (Date.now() - lastSeekTimeRef.current) < 500
          };
          
          setDebugInfo(newDebugInfo);
        }
        
        // 波形の位置を更新
        wavesurferRef.current.seekTo(progress);
      } catch (error) {
        console.warn('WaveSurfer sync error:', error);
      }
    }
  }, [currentTime, totalDuration, isReady, engine]);
  
  // シークイベントリスナーの設定
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.on('seek', handleSeek);
      
      return () => {
        if (wavesurferRef.current) {
          wavesurferRef.current.un('seek', handleSeek);
        }
      };
    }
  }, [isReady, handleSeek]);
  
  // 簡素化されたデバッグ機能（開発時のみ）
  const outputDebugReport = useCallback(() => {
    if (!import.meta.env.DEV) return;
    
    console.log('[WaveformPanel] Sync Status:', {
      timeDifference: debugInfo.timeDifferenceSeconds?.toFixed(3) + 's',
      isMajorDesync: debugInfo.isMajorDesync
    });
  }, [debugInfo]);
  
  // キーボードショートカット（開発時のみ）
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Shift+S で手動同期実行
      if (event.ctrlKey && event.shiftKey && event.key === 'S') {
        event.preventDefault();
        if (engine && wavesurferRef.current) {
          const engineProgress = engine.currentTime / engine.audioDuration;
          wavesurferRef.current.seekTo(engineProgress);
          console.log('[WaveformPanel] Manual sync executed');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  return (
    <div className="waveform-panel" style={{ position: 'relative' }}>
      <div 
        ref={waveformRef} 
        className="waveform-container"
        style={{
          cursor: isReady ? 'pointer' : 'not-allowed',
          opacity: isReady ? 1 : 0.5
        }}
      />
      
      {!isReady && audioUrl && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#999',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 10
        }}>
          波形を読み込み中...
        </div>
      )}
      
      {/* 🎵 リアルタイム音量メーター */}
      {currentVolume > 0 && (
        <div style={{
          position: 'absolute',
          top: '5px',
          left: '5px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '5px',
          fontSize: '10px',
          borderRadius: '3px',
          fontFamily: 'monospace',
          zIndex: 20,
          minWidth: '120px'
        }}>
          <div>🎵 音量: {(currentVolume * 100).toFixed(1)}%</div>
          <div style={{
            width: '100px',
            height: '8px',
            background: '#333',
            marginTop: '2px',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${currentVolume * 100}%`,
              height: '100%',
              background: currentVolume > 0.8 ? '#ff0000' : currentVolume > 0.5 ? '#ffaa00' : '#00ff00',
              transition: 'width 0.1s ease'
            }} />
          </div>
          
          {/* 音量履歴の波形 */}
          <div style={{
            width: '100px',
            height: '20px',
            background: '#000',
            marginTop: '2px',
            borderRadius: '2px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {volumeHistory.slice(-50).map((vol, index) => (
              <div key={index} style={{
                position: 'absolute',
                left: `${(index / 49) * 100}%`,
                bottom: '0',
                width: '2px',
                height: `${vol * 100}%`,
                background: '#0099ff',
                opacity: 0.7
              }} />
            ))}
          </div>
        </div>
      )}

      
      <div className="time-markers">
        <div className="time-marker start">
          00:00
        </div>
        <div className="time-marker end">
          {formatTime(totalDuration)}
        </div>
      </div>
      
    </div>
  );
};

// 時間をmm:ss形式にフォーマット（ミリ秒なし）
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default WaveformPanel;
