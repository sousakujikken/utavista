import React, { useState, useEffect, useRef } from 'react';
import Engine from '../../engine/Engine';
import { PhraseUnit, WordUnit, CharUnit } from '../../types/types';
import { ProjectFileManager } from '../../services/ProjectFileManager';
import { calculateCharacterIndices } from '../../utils/characterIndexCalculator';
import { Button } from '../common';
import WordSplitEditor from './WordSplitEditor';
import './LyricsEditor.css';

interface LyricsEditorProps {
  engine: Engine;
  onClose?: () => void;
}

interface EditableCell {
  phraseId: string;
  field: 'phrase' | 'start' | 'end';
  value: string | number;
}

const LyricsEditor: React.FC<LyricsEditorProps> = ({ engine, onClose }) => {
  const [lyrics, setLyrics] = useState<PhraseUnit[]>([]);
  const [editingCell, setEditingCell] = useState<EditableCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [wordSplitModalPhrase, setWordSplitModalPhrase] = useState<PhraseUnit | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const projectFileManager = useRef<ProjectFileManager>(new ProjectFileManager(engine));

  // 歌詞データの取得
  useEffect(() => {
    if (engine) {
      const loadLyrics = () => {
        const { lyrics: engineLyrics } = engine.getTimelineData();
        setLyrics(JSON.parse(JSON.stringify(engineLyrics)));
      };

      loadLyrics();

      // タイムライン更新イベントのリスナー
      const handleTimelineUpdated = (event: CustomEvent) => {
        setLyrics(JSON.parse(JSON.stringify(event.detail.lyrics)));
      };

      window.addEventListener('timeline-updated', handleTimelineUpdated as EventListener);
      return () => {
        window.removeEventListener('timeline-updated', handleTimelineUpdated as EventListener);
      };
    }
  }, [engine]);

  // 編集開始
  const startEdit = (phraseId: string, field: 'phrase' | 'start' | 'end', currentValue: string | number) => {
    setEditingCell({ phraseId, field, value: currentValue });
    if (field === 'start' || field === 'end') {
      // 時間フィールドの場合は秒単位で表示
      setEditValue(formatTime(currentValue as number));
    } else {
      // テキストフィールドの場合はそのまま
      setEditValue(String(currentValue));
    }
  };

  // 編集確定
  const confirmEdit = () => {
    if (!editingCell) return;

    const updatedLyrics = lyrics.map(phrase => {
      if (phrase.id === editingCell.phraseId) {
        if (editingCell.field === 'phrase') {
          // フレーズテキストの変更 - 文字タイミングを自動調整
          return updatePhraseText(phrase, editValue);
        } else if (editingCell.field === 'start') {
          // 開始時刻の変更（秒単位からms単位に変換）
          const newStart = parseTimeFromSeconds(editValue);
          if (newStart < phrase.end) {
            return adjustPhraseTiming(phrase, newStart, phrase.end);
          }
        } else if (editingCell.field === 'end') {
          // 終了時刻の変更（秒単位からms単位に変換）
          const newEnd = parseTimeFromSeconds(editValue);
          if (newEnd > phrase.start) {
            return adjustPhraseTiming(phrase, phrase.start, newEnd);
          }
        }
      }
      return phrase;
    });

    // 文字インデックスを再計算
    const lyricsWithIndices = calculateCharacterIndices(updatedLyrics);
    
    // Engineに反映
    engine.updateLyricsData(lyricsWithIndices);
    setEditingCell(null);
  };

  // フレーズテキスト更新と文字タイミング自動調整
  const updatePhraseText = (phrase: PhraseUnit, newText: string): PhraseUnit => {
    const newWords = splitIntoWords(newText);
    const totalDuration = phrase.end - phrase.start;
    
    // 新しい文字数の合計を計算
    const totalChars = newWords.reduce((sum, word) => sum + word.length, 0);
    if (totalChars === 0) {
      console.warn('LyricsEditor: 文字数が0のため、元のフレーズを返します');
      return phrase;
    }

    // 文字あたりの時間を計算
    const timePerChar = totalDuration / totalChars;
    
    let currentTime = phrase.start;
    let wordIndex = 0;
    
    const newWordUnits: WordUnit[] = newWords.map((word, wIdx) => {
      const wordStart = currentTime;
      const wordChars = Array.from(word);
      const wordDuration = wordChars.length * timePerChar;
      const wordEnd = Math.min(wordStart + wordDuration, phrase.end);
      
      const charUnits: CharUnit[] = wordChars.map((char, cIdx) => {
        const charStart = wordStart + (cIdx * timePerChar);
        const charEnd = Math.min(charStart + timePerChar, wordEnd);
        
        return {
          id: `${phrase.id}_word_${wIdx}_char_${cIdx}`,
          char: char,
          start: Math.round(charStart),
          end: Math.round(charEnd)
        };
      });
      
      currentTime = wordEnd;
      
      return {
        id: `${phrase.id}_word_${wIdx}`,
        word: word,
        start: Math.round(wordStart),
        end: Math.round(wordEnd),
        chars: charUnits
      };
    });

    const updatedPhrase = {
      ...phrase,
      phrase: newText,
      words: newWordUnits
    };
    
    return updatedPhrase;
  };

  // タイミング調整（開始・終了時刻変更時）
  const adjustPhraseTiming = (phrase: PhraseUnit, newStart: number, newEnd: number): PhraseUnit => {
    const oldDuration = phrase.end - phrase.start;
    const newDuration = newEnd - newStart;
    const ratio = newDuration / oldDuration;

    const adjustedWords = phrase.words.map(word => {
      const wordRelativeStart = word.start - phrase.start;
      const wordRelativeEnd = word.end - phrase.start;
      const newWordStart = newStart + (wordRelativeStart * ratio);
      const newWordEnd = newStart + (wordRelativeEnd * ratio);

      const adjustedChars = word.chars.map(char => {
        const charRelativeStart = char.start - phrase.start;
        const charRelativeEnd = char.end - phrase.start;
        return {
          ...char,
          start: Math.round(newStart + (charRelativeStart * ratio)),
          end: Math.round(newStart + (charRelativeEnd * ratio))
        };
      });

      return {
        ...word,
        start: Math.round(newWordStart),
        end: Math.round(newWordEnd),
        chars: adjustedChars
      };
    });

    return {
      ...phrase,
      start: newStart,
      end: newEnd,
      words: adjustedWords
    };
  };

  // テキストを単語に分割
  const splitIntoWords = (text: string): string[] => {
    
    // 日本語を含むかチェック
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    
    if (hasJapanese) {
      // 日本語の場合: 句読点や区切り文字で分割
      // より適切な分割パターンを使用（半角・全角の両方に対応）
      const separators = /[、。，．！？!?]/;
      const words: string[] = [];
      
      // 区切り文字で分割し、空でない部分のみを保持
      const parts = text.split(separators);
      
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          // さらに長い単語は意味のある単位で分割することも考慮
          // ただし、今回はシンプルに区切り文字で分割した結果をそのまま使用
          words.push(trimmed);
        }
      }
      
      // 単語分割ログ削除済み
      
      // 分割できなかった場合は元のテキストをそのまま返す
      return words.length > 0 ? words : [text.trim()];
    } else {
      // 英語等の場合: スペースとカンマ、ピリオドで分割
      const words = text.split(/[\s,.!?]+/).filter(word => word !== '');
      // 単語分割ログ削除済み
      return words;
    }
  };

  // フレーズの削除
  const deletePhrase = (phraseId: string) => {
    const updatedLyrics = lyrics.filter(phrase => phrase.id !== phraseId);
    // 文字インデックスを再計算
    const lyricsWithIndices = calculateCharacterIndices(updatedLyrics);
    engine.updateLyricsData(lyricsWithIndices);
  };

  // 上に行を挿入
  const insertLineAbove = (currentPhraseId: string) => {
    const currentIndex = lyrics.findIndex(phrase => phrase.id === currentPhraseId);
    if (currentIndex === -1) return;

    const currentPhrase = lyrics[currentIndex];
    let newStart: number;
    let newEnd: number;

    if (currentIndex === 0) {
      // 先頭の行の場合: 0からcurrentPhraseの開始時刻まで
      newStart = 0;
      newEnd = currentPhrase.start;
    } else {
      // それ以外: 前の行の終了時刻からcurrentPhraseの開始時刻まで
      const previousPhrase = lyrics[currentIndex - 1];
      newStart = previousPhrase.end;
      newEnd = currentPhrase.start;
    }

    // 新しいフレーズを作成
    const newPhrase: PhraseUnit = {
      id: `phrase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      phrase: '新しい歌詞',
      start: newStart,
      end: newEnd,
      words: []
    };

    // 新しいフレーズのテキストと文字タイミングを設定
    const updatedNewPhrase = updatePhraseText(newPhrase, '新しい歌詞');

    // 歌詞配列に挿入
    const updatedLyrics = [
      ...lyrics.slice(0, currentIndex),
      updatedNewPhrase,
      ...lyrics.slice(currentIndex)
    ];

    // 文字インデックスを再計算
    const lyricsWithIndices = calculateCharacterIndices(updatedLyrics);
    engine.updateLyricsData(lyricsWithIndices);
  };

  // プロジェクトの保存
  const handleSave = async () => {
    setSaveStatus('保存中...');
    
    // Engineの現在の歌詞データも確認
    const engineLyrics = engine.getTimelineData().lyrics;
    
    // 比較してデータが一致しているかチェック
    const isDataSynced = JSON.stringify(lyrics) === JSON.stringify(engineLyrics);
    
    try {
      await projectFileManager.current.saveProject('project');
      setSaveStatus('保存しました');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      setSaveStatus('保存エラー');
      console.error('Save error:', error);
    }
  };

  // 単語分割編集を開始
  const openWordSplitEditor = (phrase: PhraseUnit) => {
    setWordSplitModalPhrase(phrase);
  };

  // 単語分割編集結果を保存
  const handleWordSplitSave = (updatedPhrase: PhraseUnit) => {
    const updatedLyrics = lyrics.map(phrase => 
      phrase.id === updatedPhrase.id ? updatedPhrase : phrase
    );
    
    setLyrics(updatedLyrics);
    
    // エンジンに更新を反映
    engine.updateLyricsData(updatedLyrics, true, '単語分割編集');
    
    setWordSplitModalPhrase(null);
  };

  // 単語分割編集をキャンセル
  const handleWordSplitClose = () => {
    setWordSplitModalPhrase(null);
  };

  // 時間フォーマット（秒単位で表示、1ms精度）
  const formatTime = (ms: number): string => {
    return (ms / 1000).toFixed(3);
  };

  // 秒をミリ秒に変換
  const parseTimeFromSeconds = (timeStr: string): number => {
    const seconds = parseFloat(timeStr);
    return isNaN(seconds) ? 0 : Math.round(seconds * 1000);
  };

  // キーボードイベント処理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      confirmEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // 編集入力フィールドのフォーカス
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  return (
    <div className="lyrics-editor">
      <div className="lyrics-editor-header">
        <h3>歌詞編集</h3>
        <div className="lyrics-editor-controls">
          <Button variant="primary" onClick={handleSave}>
            プロジェクトを保存
          </Button>
          {saveStatus && <span className="save-status">{saveStatus}</span>}
          {onClose && (
            <Button 
              variant="secondary" 
              onClick={() => {
                // アニメーション状態を強制更新
                if (engine && engine.instanceManager) {
                  engine.arrangeCharsOnStage();
                  engine.instanceManager.loadPhrases(engine.phrases, engine.charPositions);
                  engine.instanceManager.update(engine.currentTime);
                }
                onClose();
              }}
            >
              閉じる
            </Button>
          )}
        </div>
      </div>

      <div className="lyrics-editor-content">
        <table className="lyrics-table">
          <thead>
            <tr>
              <th>フレーズ</th>
              <th>開始時刻 (秒)</th>
              <th>終了時刻 (秒)</th>
              <th>アクション</th>
            </tr>
          </thead>
          <tbody>
            {lyrics.map((phrase) => (
              <tr key={phrase.id}>
                <td 
                  className="editable-cell"
                  onClick={() => startEdit(phrase.id, 'phrase', phrase.phrase)}
                >
                  {editingCell?.phraseId === phrase.id && editingCell.field === 'phrase' ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={confirmEdit}
                      onKeyDown={handleKeyDown}
                      className="edit-input"
                    />
                  ) : (
                    phrase.phrase
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(phrase.id, 'start', phrase.start)}
                >
                  {editingCell?.phraseId === phrase.id && editingCell.field === 'start' ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={confirmEdit}
                      onKeyDown={handleKeyDown}
                      className="edit-input time-input"
                    />
                  ) : (
                    formatTime(phrase.start)
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(phrase.id, 'end', phrase.end)}
                >
                  {editingCell?.phraseId === phrase.id && editingCell.field === 'end' ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={confirmEdit}
                      onKeyDown={handleKeyDown}
                      className="edit-input time-input"
                    />
                  ) : (
                    formatTime(phrase.end)
                  )}
                </td>
                <td className="action-cell">
                  <Button 
                    variant="warning"
                    size="small"
                    onClick={() => openWordSplitEditor(phrase)}
                    title="単語分割を編集"
                  >
                    単語分割
                  </Button>
                  <Button 
                    variant="success"
                    size="small"
                    onClick={() => insertLineAbove(phrase.id)}
                    title="上に行を挿入"
                  >
                    ↑挿入
                  </Button>
                  <Button 
                    variant="danger"
                    size="small"
                    onClick={() => deletePhrase(phrase.id)}
                    title="フレーズを削除"
                  >
                    削除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {lyrics.length === 0 && (
          <div className="no-lyrics">
            歌詞データがありません。まず歌詞タブからJSONファイルを読み込んでください。
          </div>
        )}
      </div>
      
      {/* 単語分割編集モーダル */}
      {wordSplitModalPhrase && (
        <div className="modal-overlay">
          <div className="modal-content">
            <WordSplitEditor 
              phrase={wordSplitModalPhrase}
              onSave={handleWordSplitSave}
              onClose={handleWordSplitClose}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LyricsEditor;