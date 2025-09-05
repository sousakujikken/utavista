import React, { useState, useEffect, useRef } from 'react';
import { Button, Section, StatusMessage } from '../common';
import { AudioAnalyzer, BeatDetectionSettings, AnalysisResult } from '../../services/AudioAnalyzer';
import Engine from '../../engine/Engine';

interface BeatDetectionPanelProps {
  engine?: Engine;
}

const BeatDetectionPanel: React.FC<BeatDetectionPanelProps> = ({ engine }) => {
  const [settings, setSettings] = useState<BeatDetectionSettings>(() => 
    AudioAnalyzer.getDefaultSettings()
  );
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const analyzerRef = useRef<AudioAnalyzer | null>(null);

  // コンポーネントマウント時にAudioAnalyzerを初期化
  useEffect(() => {
    analyzerRef.current = new AudioAnalyzer();
    
    return () => {
      // クリーンアップ
      if (analyzerRef.current) {
        analyzerRef.current.dispose();
        analyzerRef.current = null;
      }
    };
  }, []);

  // 設定更新ハンドラー
  const updateSetting = <K extends keyof BeatDetectionSettings>(
    key: K, 
    value: BeatDetectionSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // ビート検出実行
  const handleAnalyzeBeats = async () => {
    if (!engine || !analyzerRef.current) {
      setErrorMessage('エンジンまたは音楽ファイルが読み込まれていません');
      return;
    }

    // 現在読み込まれている音楽要素を取得
    const audioElement = engine.getCurrentAudioElement();
    if (!audioElement) {
      setErrorMessage('音楽ファイルが読み込まれていません');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      console.log('Starting beat analysis with settings:', settings);
      const result = await analyzerRef.current.analyzeAudio(audioElement, settings);
      
      if (result) {
        setAnalysisResult(result);
        setSuccessMessage(
          `ビート検出完了: ${result.beats.length}個のビートを検出 (BPM: ${result.bpm})`
        );
        
        // エンジンにビート情報を送信
        if (engine.setBeatMarkers) {
          engine.setBeatMarkers(result.beats);
        }
        
        // タイムラインにビートマーカー表示イベントを発火
        const beatEvent = new CustomEvent('beat-detection-completed', {
          detail: { result }
        });
        window.dispatchEvent(beatEvent);
        
        console.log('Beat detection completed:', {
          beatsCount: result.beats.length,
          bpm: result.bpm,
          averageConfidence: result.beats.reduce((sum, beat) => sum + beat.confidence, 0) / result.beats.length
        });
      } else {
        setErrorMessage('ビート検出に失敗しました');
      }
    } catch (error) {
      console.error('Beat analysis error:', error);
      setErrorMessage(
        `ビート検出エラー: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // プリセット設定
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'sensitive':
        setSettings({
          threshold: 0.2,
          minBPM: 60,
          maxBPM: 200,
          sensitivity: 1.5,
          lowFreqCutoff: 40,
          highFreqCutoff: 10000
        });
        break;
      case 'standard':
        setSettings(AudioAnalyzer.getDefaultSettings());
        break;
      case 'strict':
        setSettings({
          threshold: 0.5,
          minBPM: 80,
          maxBPM: 180,
          sensitivity: 0.7,
          lowFreqCutoff: 80,
          highFreqCutoff: 6000
        });
        break;
    }
  };

  // ビート情報をクリア
  const clearBeats = () => {
    setAnalysisResult(null);
    setSuccessMessage(null);
    
    if (engine && engine.setBeatMarkers) {
      engine.setBeatMarkers([]);
    }
    
    const clearEvent = new CustomEvent('beat-detection-cleared');
    window.dispatchEvent(clearEvent);
  };

  return (
    <div className="panel-content">
      <Section title="ビート検出">
        <div className="u-mb-md">
          <Button 
            variant="primary" 
            onClick={handleAnalyzeBeats}
            disabled={isAnalyzing || !engine}
          >
            {isAnalyzing ? 'ビート検出中...' : 'ビートを検出'}
          </Button>
          
          {analysisResult && (
            <Button 
              variant="secondary" 
              onClick={clearBeats}
              style={{ marginLeft: '10px' }}
            >
              ビートをクリア
            </Button>
          )}
        </div>

        {/* プリセット設定 */}
        <div className="u-mb-md">
          <label className="u-text-secondary u-mb-xs">プリセット設定:</label>
          <div className="u-flex u-gap-sm">
            <Button variant="tertiary" onClick={() => applyPreset('sensitive')}>
              高感度
            </Button>
            <Button variant="tertiary" onClick={() => applyPreset('standard')}>
              標準
            </Button>
            <Button variant="tertiary" onClick={() => applyPreset('strict')}>
              厳格
            </Button>
          </div>
        </div>

        {/* 検出設定 */}
        <div className="u-grid u-grid-cols-2 u-gap-md u-mb-md">
          <div>
            <label className="u-text-secondary u-mb-xs">
              検出閾値: {(settings.threshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={settings.threshold}
              onChange={(e) => updateSetting('threshold', parseFloat(e.target.value))}
              className="slider u-w-full"
            />
          </div>
          
          <div>
            <label className="u-text-secondary u-mb-xs">
              感度: {settings.sensitivity.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={settings.sensitivity}
              onChange={(e) => updateSetting('sensitivity', parseFloat(e.target.value))}
              className="slider u-w-full"
            />
          </div>
        </div>

        {/* BPM範囲設定 */}
        <div className="u-grid u-grid-cols-2 u-gap-md u-mb-md">
          <div>
            <label className="u-text-secondary u-mb-xs">
              最小BPM: {settings.minBPM}
            </label>
            <input
              type="range"
              min="30"
              max="150"
              step="5"
              value={settings.minBPM}
              onChange={(e) => updateSetting('minBPM', parseInt(e.target.value))}
              className="slider u-w-full"
            />
          </div>
          
          <div>
            <label className="u-text-secondary u-mb-xs">
              最大BPM: {settings.maxBPM}
            </label>
            <input
              type="range"
              min="100"
              max="300"
              step="5"
              value={settings.maxBPM}
              onChange={(e) => updateSetting('maxBPM', parseInt(e.target.value))}
              className="slider u-w-full"
            />
          </div>
        </div>

        {/* 周波数フィルタリング設定 */}
        <div className="u-grid u-grid-cols-2 u-gap-md u-mb-md">
          <div>
            <label className="u-text-secondary u-mb-xs">
              ローカット: {settings.lowFreqCutoff}Hz
            </label>
            <input
              type="range"
              min="20"
              max="200"
              step="10"
              value={settings.lowFreqCutoff}
              onChange={(e) => updateSetting('lowFreqCutoff', parseInt(e.target.value))}
              className="slider u-w-full"
            />
          </div>
          
          <div>
            <label className="u-text-secondary u-mb-xs">
              ハイカット: {(settings.highFreqCutoff / 1000).toFixed(1)}kHz
            </label>
            <input
              type="range"
              min="2000"
              max="20000"
              step="500"
              value={settings.highFreqCutoff}
              onChange={(e) => updateSetting('highFreqCutoff', parseInt(e.target.value))}
              className="slider u-w-full"
            />
          </div>
        </div>

        {/* 結果表示 */}
        {analysisResult && (
          <div className="u-bg-level-3 u-p-sm u-radius-small u-mb-sm">
            <div className="u-text-small">
              <div><strong>検出結果:</strong></div>
              <div>ビート数: {analysisResult.beats.length}個</div>
              <div>BPM: {analysisResult.bpm}</div>
              <div>楽曲長: {(analysisResult.duration / 1000).toFixed(1)}秒</div>
              <div>平均信頼度: {
                analysisResult.beats.length > 0 
                  ? (analysisResult.beats.reduce((sum, beat) => sum + beat.confidence, 0) / analysisResult.beats.length * 100).toFixed(1)
                  : 0
              }%</div>
            </div>
          </div>
        )}

        {/* メッセージ表示 */}
        {successMessage && (
          <StatusMessage 
            type="success" 
            message={successMessage}
            onClose={() => setSuccessMessage(null)}
          />
        )}
        
        {errorMessage && (
          <StatusMessage 
            type="error" 
            message={errorMessage}
            onClose={() => setErrorMessage(null)}
          />
        )}

        {!engine && (
          <StatusMessage 
            type="warning" 
            message="音楽ファイルを読み込んでからビート検出を実行してください" 
          />
        )}
      </Section>
    </div>
  );
};

export default BeatDetectionPanel;