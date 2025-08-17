import React, { useRef, useState, useEffect } from 'react';
import Engine from '../../engine/Engine';
import { electronMediaManager } from '../../services/ElectronMediaManager';
import { logger } from '../../../utils/logger';
import { AspectRatio, Orientation, BackgroundType, BackgroundFitMode } from '../../types/types';
import { Button, Select, Section, StatusMessage } from '../common';
import '../../styles/components.css';

interface ContentTabProps {
  engine?: Engine;
  onLyricsEditModeToggle?: () => void;
}

const ContentTab: React.FC<ContentTabProps> = ({ engine, onLyricsEditModeToggle }) => {
  // 歌詞関連の状態
  const [lyricsFileName, setLyricsFileName] = useState<string | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [lyricsSuccessMessage, setLyricsSuccessMessage] = useState<string | null>(null);
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);

  // 音楽関連の状態
  const [musicFileName, setMusicFileName] = useState<string | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<Array<{fileName: string, filePath: string, timestamp: number}>>([]);
  const [audioOffset, setAudioOffset] = useState<number>(0); // 音楽オフセット（ms）

  // 背景関連の状態
  const [backgroundColor, setBackgroundColor] = useState<string>('#000000');
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('color');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>('');
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState<string>('');
  const [fitMode, setFitMode] = useState<BackgroundFitMode>('cover');
  const [opacity, setOpacity] = useState<number>(1);
  const [videoLoop, setVideoLoop] = useState<boolean>(false);
  const [recentVideoFiles, setRecentVideoFiles] = useState<Array<{fileName: string, filePath: string, timestamp: number}>>([]);
  const [recentImageFiles, setRecentImageFiles] = useState<Array<{fileName: string, filePath: string, timestamp: number}>>([]);
  const [currentAspectRatio, setCurrentAspectRatio] = useState<AspectRatio>('16:9');
  const [currentOrientation, setCurrentOrientation] = useState<Orientation>('landscape');

  // 歌詞データのバリデーション関数
  const validateLyricsData = (data: unknown): boolean => {
    console.log('ContentTab: バリデーション開始', { data });
    
    if (!Array.isArray(data)) {
      const errorMsg = '歌詞データは配列である必要があります。';
      setLyricsError(errorMsg);
      console.error('ContentTab: バリデーションエラー', { errorMsg, dataType: typeof data, data });
      return false;
    }
    
    for (let i = 0; i < data.length; i++) {
      const phrase = data[i];
      
      if (!phrase.phrase || typeof phrase.phrase !== 'string') {
        const errorMsg = `フレーズ ${i}: phraseフィールドが必要です。`;
        setLyricsError(errorMsg);
        console.error('ContentTab: バリデーションエラー', { errorMsg, phrase });
        return false;
      }
      
      if (typeof phrase.start !== 'number' || typeof phrase.end !== 'number') {
        setLyricsError(`フレーズ ${i}: start/endフィールドは数値である必要があります。`);
        return false;
      }
      
      if (phrase.start >= phrase.end) {
        setLyricsError(`フレーズ ${i}: start時間がend時間以上になっています。`);
        return false;
      }
      
      if (!Array.isArray(phrase.words)) {
        setLyricsError(`フレーズ ${i}: wordsフィールドは配列である必要があります。`);
        return false;
      }
      
      for (let j = 0; j < phrase.words.length; j++) {
        const word = phrase.words[j];
        
        if (!word.word || typeof word.word !== 'string') {
          setLyricsError(`フレーズ ${i}, 単語 ${j}: wordフィールドが必要です。`);
          return false;
        }
        
        if (typeof word.start !== 'number' || typeof word.end !== 'number') {
          setLyricsError(`フレーズ ${i}, 単語 ${j}: start/endフィールドは数値である必要があります。`);
          return false;
        }
        
        if (!Array.isArray(word.chars)) {
          setLyricsError(`フレーズ ${i}, 単語 ${j}: charsフィールドは配列である必要があります。`);
          return false;
        }
        
        for (let k = 0; k < word.chars.length; k++) {
          const char = word.chars[k];
          
          if (!char.char || typeof char.char !== 'string') {
            setLyricsError(`フレーズ ${i}, 単語 ${j}, 文字 ${k}: charフィールドが必要です。`);
            return false;
          }
          
          if (typeof char.start !== 'number' || typeof char.end !== 'number') {
            setLyricsError(`フレーズ ${i}, 単語 ${j}, 文字 ${k}: start/endフィールドは数値である必要があります。`);
            return false;
          }
        }
      }
    }
    
    console.log('ContentTab: バリデーション成功');
    return true;
  };

  // 歌詞ファイル選択処理
  const handleLyricsFileSelect = () => {
    lyricsFileInputRef.current?.click();
  };

  // 歌詞ファイル変更処理
  const handleLyricsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLyricsError(null);
    setLyricsSuccessMessage(null);

    try {
      console.log('ContentTab: ファイル読み込み開始', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      
      const text = await file.text();
      console.log('ContentTab: ファイルテキスト読み込み完了', {
        textLength: text.length,
        firstChars: text.substring(0, 100)
      });
      
      let data;
      try {
        data = JSON.parse(text);
        console.log('ContentTab: JSONパース成功', {
          dataType: typeof data,
          isArray: Array.isArray(data),
          dataLength: Array.isArray(data) ? data.length : undefined
        });
      } catch (parseError) {
        console.error('ContentTab: JSONパースエラー', {
          error: parseError,
          errorMessage: parseError instanceof Error ? parseError.message : String(parseError),
          text: text.substring(0, 200) + '...',
          fileName: file.name
        });
        setLyricsError(`JSONパースエラー: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        return;
      }

      if (!validateLyricsData(data)) {
        console.error('ContentTab: バリデーションエラー');
        return;
      }

      if (engine) {
        try {
          engine.loadLyrics(data);
          setLyricsFileName(file.name);
          setLyricsSuccessMessage('歌詞データを正常に読み込みました');
          console.log('ContentTab: 歌詞ファイルの読み込み完了', { fileName: file.name });
          
          setTimeout(() => {
            setLyricsSuccessMessage(null);
          }, 3000);
        } catch (engineError) {
          console.error('ContentTab: Engine.loadLyricsエラー', {
            error: engineError,
            errorMessage: engineError instanceof Error ? engineError.message : String(engineError),
            errorStack: engineError instanceof Error ? engineError.stack : undefined
          });
          setLyricsError(`Engine読み込みエラー: ${engineError instanceof Error ? engineError.message : String(engineError)}`);
        }
      } else {
        setLyricsError('エンジンが初期化されていません');
        console.error('ContentTab: エンジンが初期化されていません');
      }
    } catch (error) {
      console.error('ContentTab: 歌詞ファイルの読み込みエラー', error);
      console.error('ContentTab: 歌詞ファイルの読み込みエラー詳細:', {
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        fileName: file?.name,
        fileSize: file?.size,
        fileType: file?.type
      });
      setLyricsError('ファイルの読み込みに失敗しました。JSONファイルか確認してください。');
    }
  };

  // 音楽オフセット更新処理
  const handleAudioOffsetChange = (newOffset: number) => {
    setAudioOffset(newOffset);
    if (engine && engine.projectStateManager) {
      // プロジェクト状態を更新
      const currentState = engine.projectStateManager.getCurrentState();
      currentState.audioOffset = newOffset;
      engine.projectStateManager.saveCurrentState('音楽オフセット調整');
    }
  };

  // 音楽ファイル読み込み処理
  const handleMusicLoad = async () => {
    try {
      const result = await electronMediaManager.loadBackgroundAudio();
      
      if (result && engine) {
        const { audio, fileName } = result;
        engine.loadAudioElement(audio, fileName);
        setMusicFileName(fileName);
        
        setTimeout(async () => {
          const updatedFiles = await electronMediaManager.getRecentFiles('audio');
          setRecentFiles(updatedFiles);
        }, 100);
        
        setTimeout(() => {
          const actualFileURL = electronMediaManager.getCurrentAudioFilePath();
          const audioLoadEvent = new CustomEvent('music-file-loaded', {
            detail: { 
              url: actualFileURL || 'electron://loaded',
              filePath: actualFileURL,
              fileName,
              timestamp: Date.now(),
              source: 'ContentTab-NewFile'
            }
          });
          window.dispatchEvent(audioLoadEvent);
          console.log('[ContentTab] 新規音楽ファイル読み込み完了イベント発火:', fileName);
        }, 50);
      }
    } catch (error) {
      setMusicError('音楽ファイルの読み込みに失敗しました');
    }
  };

  // アスペクト比変更処理
  const handleAspectRatioChange = (value: string) => {
    const [aspectRatio, orientation] = value.split('-') as [AspectRatio, Orientation];
    
    if (engine) {
      engine.resizeStage(aspectRatio, orientation);
      setCurrentAspectRatio(aspectRatio);
      setCurrentOrientation(orientation);
    }
  };

  // 背景設定更新処理
  const updateBackgroundConfig = (updates: Partial<{
    type: BackgroundType;
    backgroundColor: string;
    imageFilePath: string;
    videoFilePath: string;
    fitMode: BackgroundFitMode;
    opacity: number;
    videoLoop: boolean;
  }>) => {
    if (engine) {
      engine.updateBackgroundConfig(updates);
    }
  };

  // エンジンから現在の設定を取得し、適用
  useEffect(() => {
    if (engine) {
      const currentConfig = engine.getBackgroundConfig();
      
      setBackgroundType(currentConfig.type);
      if (currentConfig.backgroundColor) {
        setBackgroundColor(currentConfig.backgroundColor);
      }
      if (currentConfig.imageFilePath) {
        setBackgroundImageUrl(currentConfig.imageFilePath);
      }
      if (currentConfig.videoFilePath) {
        setBackgroundVideoUrl(currentConfig.videoFilePath);
      }
      if (currentConfig.fitMode) {
        setFitMode(currentConfig.fitMode);
      }
      if (currentConfig.opacity !== undefined) {
        setOpacity(currentConfig.opacity);
      }
      if (currentConfig.videoLoop !== undefined) {
        setVideoLoop(currentConfig.videoLoop);
      }
      
      const stageConfig = engine.getStageConfig();
      setCurrentAspectRatio(stageConfig.aspectRatio);
      setCurrentOrientation(stageConfig.orientation);

      // リサイズイベントリスナーを追加
      const handleResize = () => {
        setTimeout(() => {
          engine.resizeStage(stageConfig.aspectRatio, stageConfig.orientation);
        }, 100);
      };

      window.addEventListener('resize', handleResize);
      
      if (engine.projectStateManager) {
        const currentState = engine.projectStateManager.getCurrentState();
        
        if (currentState.backgroundConfig) {
          const config = currentState.backgroundConfig;
          setBackgroundType(config.type);
          if (config.backgroundColor) setBackgroundColor(config.backgroundColor);
          if (config.imageFilePath) setBackgroundImageUrl(config.imageFilePath);
          if (config.videoFilePath) setBackgroundVideoUrl(config.videoFilePath);
          if (config.fitMode) setFitMode(config.fitMode);
          if (config.opacity !== undefined) setOpacity(config.opacity);
          if (config.videoLoop !== undefined) setVideoLoop(config.videoLoop);
        }
        
        // 音楽オフセット値を読み込み
        if (currentState.audioOffset !== undefined) {
          setAudioOffset(currentState.audioOffset);
        }
      }

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [engine]);

  // 最近使用したファイル読み込み
  useEffect(() => {
    const loadRecentFiles = async () => {
      try {
        const audioFiles = await electronMediaManager.getRecentFiles('audio');
        const videoFiles = await electronMediaManager.getRecentFiles('backgroundVideo');
        const imageFiles = await electronMediaManager.getRecentFiles('image');
        
        setRecentFiles(audioFiles);
        setRecentVideoFiles(videoFiles);
        setRecentImageFiles(imageFiles);
      } catch (error) {
        console.error('Failed to load recent files:', error);
      }
    };

    loadRecentFiles();
  }, []);

  // アスペクト比選択肢を生成
  const getAspectRatioOptions = () => {
    return [
      { value: '16:9-landscape', label: '16:9 (横画面)' },
      { value: '4:3-landscape', label: '4:3 (横画面)' },
      { value: '1:1-landscape', label: '1:1 (正方形)' },
      { value: '16:9-portrait', label: '9:16 (縦画面)' },
      { value: '4:3-portrait', label: '3:4 (縦画面)' }
    ];
  };

  return (
    <div className="panel-content">
      {/* 歌詞セクション */}
      <Section title="歌詞データ">
        <div className="u-flex u-gap-sm u-mb-md">
          <Button variant="primary" onClick={handleLyricsFileSelect}>
            JSONファイルを読み込み
          </Button>
          
          <Button 
            variant="primary"
            onClick={onLyricsEditModeToggle}
            disabled={!engine}
          >
            歌詞を編集
          </Button>
          
          <input
            ref={lyricsFileInputRef}
            type="file"
            accept=".json"
            onChange={handleLyricsFileChange}
            style={{ display: 'none' }}
          />
        </div>
        
        {!engine && (
          <StatusMessage 
            type="warning" 
            message="注意: 先にテンプレートを選択してEngineを初期化してください" 
          />
        )}
        
        {lyricsFileName && (
          <div className="u-bg-level-3 u-p-sm u-radius-small u-mb-sm u-text-small">
            読み込み済み: {lyricsFileName}
          </div>
        )}
        
        {lyricsSuccessMessage && (
          <StatusMessage 
            type="success" 
            message={lyricsSuccessMessage}
            onClose={() => setLyricsSuccessMessage(null)}
          />
        )}
        
        {lyricsError && (
          <StatusMessage 
            type="error" 
            message={lyricsError}
            onClose={() => setLyricsError(null)}
          />
        )}
      </Section>

      <hr className="u-divider" />

      {/* 音楽セクション */}
      <Section title="音楽データ">
        <div className="u-mb-md">
          <Button variant="primary" onClick={handleMusicLoad}>
            音楽ファイルを選択
          </Button>
        </div>

        {/* 最近使用したファイル */}
        {recentFiles.length > 0 && (
          <Select 
            label="最近使用したファイル:"
            onChange={async (e) => {
              if (e.target.value && engine) {
                const selectedFile = recentFiles.find(f => f.filePath === e.target.value);
                if (selectedFile) {
                  try {
                    const result = await electronMediaManager.loadRecentAudioFile(selectedFile.filePath);
                    if (result) {
                      const { audio, fileName } = result;
                      engine.loadAudioElement(audio, fileName);
                      setMusicFileName(fileName);
                      
                      // 最近使用したファイルリストを更新
                      setTimeout(async () => {
                        const updatedFiles = await electronMediaManager.getRecentFiles('audio');
                        setRecentFiles(updatedFiles);
                      }, 100);
                      
                      // 音楽読み込み完了イベントを発火（WaveformPanel向け）
                      setTimeout(() => {
                        const actualFileURL = electronMediaManager.getCurrentAudioFilePath();
                        const audioLoadEvent = new CustomEvent('music-file-loaded', {
                          detail: { 
                            url: actualFileURL || 'electron://loaded',
                            filePath: selectedFile.filePath,
                            fileName,
                            timestamp: Date.now(),
                            source: 'ContentTab-RecentFiles'
                          }
                        });
                        window.dispatchEvent(audioLoadEvent);
                        console.log('[ContentTab] 最近使用したファイル読み込み完了イベント発火:', fileName);
                      }, 50);
                    }
                  } catch (error) {
                    setMusicError('ファイルの読み込みに失敗しました');
                  }
                }
              }
              
              // セレクトボックスをリセット
              e.target.value = '';
            }}
          >
            <option value="">選択してください</option>
            {recentFiles.map((file, index) => (
              <option key={index} value={file.filePath}>
                {file.fileName}
              </option>
            ))}
          </Select>
        )}

        {musicFileName && (
          <div className="u-bg-level-3 u-p-sm u-radius-small u-mb-sm u-text-small">
            読み込み済み: {musicFileName}
          </div>
        )}

        {musicError && (
          <StatusMessage 
            type="error" 
            message={musicError}
            onClose={() => setMusicError(null)}
          />
        )}

        {/* 音楽タイミングオフセット調整 */}
        <div className="u-mt-md">
          <label className="u-text-secondary u-mb-xs">
            音楽タイミングオフセット: {audioOffset}ms
            <span className="u-text-small u-text-muted u-ml-xs">
              (±200ms範囲で微調整)
            </span>
          </label>
          <input
            type="range"
            min="-500"
            max="500"
            step="10"
            value={audioOffset}
            onChange={(e) => handleAudioOffsetChange(Number(e.target.value))}
            className="slider u-w-full"
          />
          <div className="u-flex u-justify-between u-text-small u-text-muted u-mt-xs">
            <span>-500ms (早める)</span>
            <span>0ms</span>
            <span>+500ms (遅らせる)</span>
          </div>
          {audioOffset !== 0 && (
            <div className="u-mt-xs">
              <button
                onClick={() => handleAudioOffsetChange(0)}
                className="u-text-small u-text-primary u-cursor-pointer u-bg-transparent u-border-none"
                style={{ textDecoration: 'underline' }}
              >
                リセット (0ms)
              </button>
            </div>
          )}
        </div>
      </Section>

      <hr className="u-divider" />

      {/* アスペクト比・向きセクション */}
      <Section title="表示設定">
        <Select
          label="アスペクト比・向き:"
          value={`${currentAspectRatio}-${currentOrientation}`}
          onChange={(e) => handleAspectRatioChange(e.target.value)}
        >
          {getAspectRatioOptions().map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Section>

      <hr className="u-divider" />

      {/* 背景セクション */}
      <Section title="背景設定">
        <Select
          label="背景タイプ:"
          value={backgroundType}
          onChange={(e) => {
            const newType = e.target.value as BackgroundType;
            setBackgroundType(newType);
            updateBackgroundConfig({ type: newType });
          }}
        >
          <option value="color">単色</option>
          <option value="image">画像</option>
          <option value="video">動画</option>
        </Select>

        {backgroundType === 'color' && (
          <div className="u-mt-md">
            <label className="u-text-secondary u-mb-xs">背景色:</label>
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => {
                setBackgroundColor(e.target.value);
                updateBackgroundConfig({ backgroundColor: e.target.value });
              }}
              className="color-picker"
            />
          </div>
        )}

        {backgroundType === 'image' && (
          <div className="u-mt-md">
            <Button 
              variant="secondary"
              onClick={async () => {
                try {
                  const result = await electronMediaManager.loadBackgroundImage();
                  if (result && engine) {
                    const { imageUrl, fileName } = result;
                    setBackgroundImageUrl(imageUrl);
                    updateBackgroundConfig({ imageFilePath: imageUrl });
                    
                    setTimeout(async () => {
                      const updatedFiles = await electronMediaManager.getRecentFiles('image');
                      setRecentImageFiles(updatedFiles);
                    }, 100);
                  }
                } catch (error) {
                  console.error('画像読み込みエラー:', error);
                }
              }}
            >
              画像を選択
            </Button>

            {backgroundImageUrl && (
              <div className="u-mt-sm u-text-small u-text-muted">
                選択中: {backgroundImageUrl.split('/').pop()}
              </div>
            )}
          </div>
        )}

        {backgroundType === 'video' && (
          <div className="u-mt-md">
            <Button 
              variant="secondary"
              onClick={async () => {
                try {
                  const result = await electronMediaManager.loadBackgroundVideo();
                  if (result && engine) {
                    const { video, fileName } = result;
                    console.log('動画読み込み成功:', { fileName, videoSrc: video.src });
                    setBackgroundVideoUrl(video.src);
                    setBackgroundType('video');
                    video.muted = true;
                    engine.setBackgroundVideoElement(video, fitMode, fileName, videoLoop);
                    updateBackgroundConfig({ type: 'video', videoFilePath: video.src, videoLoop });
                    
                    setTimeout(async () => {
                      const updatedFiles = await electronMediaManager.getRecentFiles('backgroundVideo');
                      setRecentVideoFiles(updatedFiles);
                    }, 100);
                  } else {
                    console.error('動画読み込みに失敗: result または engine が null');
                  }
                } catch (error) {
                  console.error('動画読み込みエラー:', error);
                }
              }}
            >
              動画を選択
            </Button>

            {/* 最近使用したファイル */}
            {recentVideoFiles.length > 0 && (
              <Select 
                label="最近使用したファイル:"
                onChange={async (e) => {
                  if (e.target.value && engine) {
                    const selectedFile = recentVideoFiles.find(f => f.filePath === e.target.value);
                    if (selectedFile) {
                      try {
                        const result = await electronMediaManager.loadRecentBackgroundVideo(selectedFile.filePath);
                        if (result) {
                          const { video, fileName } = result;
                          console.log('最近使用ファイルから動画読み込み成功:', { fileName, videoSrc: video.src });
                          setBackgroundVideoUrl(video.src);
                          setBackgroundType('video');
                          video.muted = true;
                          engine.setBackgroundVideoElement(video, fitMode, fileName, videoLoop);
                          updateBackgroundConfig({ type: 'video', videoFilePath: video.src, videoLoop });
                        } else {
                          console.error('最近使用ファイルの動画読み込みに失敗');
                        }
                      } catch (error) {
                        console.error('最近使用ファイルの動画読み込みエラー:', error);
                      }
                    }
                  }
                }}
              >
                <option value="">選択してください</option>
                {recentVideoFiles.map((file, index) => (
                  <option key={index} value={file.filePath}>
                    {file.fileName}
                  </option>
                ))}
              </Select>
            )}

            {backgroundVideoUrl && (
              <div className="u-mt-sm u-text-small u-text-muted">
                選択中: {backgroundVideoUrl.split('/').pop()}
              </div>
            )}

            <div className="u-mt-md">
              <label className="u-flex u-align-center u-gap-xs">
                <input
                  type="checkbox"
                  checked={videoLoop}
                  onChange={(e) => {
                    const newVideoLoop = e.target.checked;
                    setVideoLoop(newVideoLoop);
                    updateBackgroundConfig({ videoLoop: newVideoLoop });
                    
                    // 既に読み込まれている動画がある場合は即座に設定を適用
                    if (engine && backgroundVideoUrl) {
                      const currentVideo = engine.getBackgroundVideo();
                      if (currentVideo) {
                        currentVideo.loop = newVideoLoop;
                      }
                    }
                  }}
                />
                <span className="u-text-secondary">自動ループ再生（短い動画用）</span>
              </label>
            </div>
          </div>
        )}

        {(backgroundType === 'image' || backgroundType === 'video') && (
          <>
            <Select
              label="フィットモード:"
              value={fitMode}
              onChange={(e) => {
                const newFitMode = e.target.value as BackgroundFitMode;
                setFitMode(newFitMode);
                updateBackgroundConfig({ fitMode: newFitMode });
              }}
            >
              <option value="cover">カバー (全体を覆う)</option>
              <option value="contain">コンテイン (全体を表示)</option>
              <option value="stretch">ストレッチ (引き伸ばし)</option>
            </Select>

            <div className="u-mt-md">
              <label className="u-text-secondary u-mb-xs">不透明度: {Math.round(opacity * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={opacity}
                onChange={(e) => {
                  const newOpacity = parseFloat(e.target.value);
                  setOpacity(newOpacity);
                  updateBackgroundConfig({ opacity: newOpacity });
                }}
                className="slider"
              />
            </div>
          </>
        )}
      </Section>
    </div>
  );
};

export default ContentTab;