import React, { useRef, useState } from 'react';
import Engine from '../../engine/Engine';
import '../../styles/components.css';

interface LyricsPanelProps {
  engine?: Engine; // Engineインスタンスを受け取る
  onLyricsEditModeToggle?: () => void; // 歌詞編集モード切り替え
}

const LyricsPanel: React.FC<LyricsPanelProps> = ({ engine, onLyricsEditModeToggle }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);


  // 歌詞データのバリデーション関数
  const validateLyricsData = (data: unknown): boolean => {
    if (!Array.isArray(data)) {
      setError('歌詞データは配列である必要があります。');
      return false;
    }
    
    for (let i = 0; i < data.length; i++) {
      const phrase = data[i];
      
      // フレーズの必須フィールドをチェック
      if (!phrase.phrase || typeof phrase.phrase !== 'string') {
        setError(`フレーズ ${i}: phraseフィールドが必要です。`);
        return false;
      }
      
      if (typeof phrase.start !== 'number' || typeof phrase.end !== 'number') {
        setError(`フレーズ ${i}: start/endフィールドは数値である必要があります。`);
        return false;
      }
      
      if (phrase.start >= phrase.end) {
        setError(`フレーズ ${i}: start時間がend時間以上になっています。`);
        return false;
      }
      
      // 単語配列をチェック
      if (!Array.isArray(phrase.words)) {
        setError(`フレーズ ${i}: wordsフィールドは配列である必要があります。`);
        return false;
      }
      
      // 各単語をチェック
      for (let j = 0; j < phrase.words.length; j++) {
        const word = phrase.words[j];
        
        if (!word.word || typeof word.word !== 'string') {
          setError(`フレーズ ${i}, 単語 ${j}: wordフィールドが必要です。`);
          return false;
        }
        
        if (typeof word.start !== 'number' || typeof word.end !== 'number') {
          setError(`フレーズ ${i}, 単語 ${j}: start/endフィールドは数値である必要があります。`);
          return false;
        }
        
        // 文字配列をチェック
        if (!Array.isArray(word.chars)) {
          setError(`フレーズ ${i}, 単語 ${j}: charsフィールドは配列である必要があります。`);
          return false;
        }
        
        // 各文字をチェック
        for (let k = 0; k < word.chars.length; k++) {
          const char = word.chars[k];
          
          if (!char.char || typeof char.char !== 'string') {
            setError(`フレーズ ${i}, 単語 ${j}, 文字 ${k}: charフィールドが必要です。`);
            return false;
          }
          
          if (typeof char.start !== 'number' || typeof char.end !== 'number') {
            setError(`フレーズ ${i}, 単語 ${j}, 文字 ${k}: start/endフィールドは数値である必要があります。`);
            return false;
          }
        }
      }
    }
    
    return true;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMessage(null);
    const file = event.target.files?.[0];
    
    if (file) {
      setFileName(file.name);
      
      file.text().then(text => {
        try {
          const json = JSON.parse(text);
          
          // データバリデーション
          if (!validateLyricsData(json)) {
            return; // エラーはvalidateData内で設定済み
          }
          
          // Engineが利用可能な場合、歌詞をロード
          if (engine) {
            try {
              engine.loadLyrics(json);
              setError(null); // エラーをクリア
              setSuccessMessage(`歌詞データ "${file.name}" を正常に読み込みました。`);
              
              // 5秒後に成功メッセージを消去
              setTimeout(() => {
                setSuccessMessage(null);
              }, 5000);
            } catch (engineError) {
              const errorMessage = engineError instanceof Error ? engineError.message : String(engineError);
              setError(`歌詞データのロード中にエラーが発生しました: ${errorMessage}`);
              console.error('Engine.loadLyrics error:', engineError);
              console.error('Engine.loadLyrics error details:', {
                fileName: file.name,
                errorMessage,
                errorStack: engineError instanceof Error ? engineError.stack : undefined
              });
            }
          } else {
            setError('Engineが初期化されていません。');
            console.error('Engine not available for loading lyrics');
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          setError(`JSONの解析中にエラーが発生しました: ${errorMessage}`);
          console.error('JSON parse error:', e);
          console.error('Error details:', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            errorMessage,
            errorStack: e instanceof Error ? e.stack : undefined,
            fileContent: text.substring(0, 200) + '...' // 最初の200文字を表示
          });
        }
      }).catch(err => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`ファイルの読み込み中にエラーが発生しました: ${errorMessage}`);
        console.error('File read error:', err);
        console.error('File read error details:', {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          errorMessage,
          errorStack: err instanceof Error ? err.stack : undefined
        });
      });
    }
  };


  return (
    <div className="panel-content">
      <h3>歌詞データ</h3>
      
      {/* ボタン群 */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        alignItems: 'center'
      }}>
        <button
          onClick={handleFileSelect}
          style={{
            padding: '10px 16px',
            backgroundColor: '#09f',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          JSONファイルを読み込み
        </button>
        
        <button
          onClick={onLyricsEditModeToggle}
          disabled={!engine}
          style={{
            padding: '10px 16px',
            backgroundColor: engine ? '#28a745' : '#666',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: engine ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          歌詞を編集
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
      
      {/* エンジン未初期化警告 */}
      {!engine && (
        <div style={{ 
          color: '#ffaa00', 
          marginBottom: '10px', 
          fontSize: '12px',
          padding: '8px',
          backgroundColor: 'rgba(255, 170, 0, 0.1)',
          borderRadius: '4px'
        }}>
          注意: 先にテンプレートを選択してEngineを初期化してください
        </div>
      )}
      
      {/* ファイル名表示 */}
      {fileName && (
        <div style={{ 
          marginBottom: '10px',
          padding: '8px',
          backgroundColor: '#111',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          読み込み済み: {fileName}
        </div>
      )}
      
      {/* 成功メッセージ */}
      {successMessage && (
        <div style={{ 
          color: '#4caf50', 
          marginBottom: '10px',
          padding: '8px',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderRadius: '4px'
        }}>
          ✓ {successMessage}
        </div>
      )}
      
      {/* エラーメッセージ */}
      {error && (
        <div style={{ 
          color: '#ff6b6b', 
          marginBottom: '10px',
          padding: '8px',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          borderRadius: '4px'
        }}>
          エラー: {error}
        </div>
      )}
      
    </div>
  );
};

export default LyricsPanel;
