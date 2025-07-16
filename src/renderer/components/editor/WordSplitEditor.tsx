import React, { useState, useEffect, useRef } from 'react';
import { PhraseUnit, WordUnit, CharUnit } from '../../types/types';
import { generateUniqueId } from '../../utils/idGenerator';
import { Button } from '../common';
import './WordSplitEditor.css';

// 階層的ID生成用のヘルパー関数
const generateHierarchicalWordId = (phraseId: string, wordIndex: number): string => {
  return `${phraseId}_word_${wordIndex}`;
};

const generateHierarchicalCharId = (wordId: string, charIndex: number): string => {
  return `${wordId}_char_${charIndex}`;
};

interface WordSplitEditorProps {
  phrase: PhraseUnit;
  onSave: (updatedPhrase: PhraseUnit) => void;
  onClose: () => void;
}

interface EditableWordCell {
  wordId: string;
  field: 'word' | 'start' | 'end';
  value: string | number;
}

const WordSplitEditor: React.FC<WordSplitEditorProps> = ({ phrase, onSave, onClose }) => {
  const [words, setWords] = useState<WordUnit[]>([]);
  const [editingCell, setEditingCell] = useState<EditableWordCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // 初期化時に現在のフレーズの単語データを設定
  useEffect(() => {
    setWords(JSON.parse(JSON.stringify(phrase.words)));
  }, [phrase]);

  // 日本語対応の単語分割関数
  const splitIntoWords = (text: string): string[] => {
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    
    if (hasJapanese) {
      // 日本語の場合: 句読点や区切り文字で分割
      const separators = /[、。，．！？!?\s]/;
      const words: string[] = [];
      const parts = text.split(separators);
      
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          words.push(trimmed);
        }
      }
      return words.length > 0 ? words : [text.trim()];
    } else {
      // 英語等の場合: スペースとカンマ、ピリオドで分割
      return text.split(/[\s,.!?]+/).filter(word => word !== '');
    }
  };

  // 文字を新しい単語に再分配する関数
  const redistributeCharactersToWords = (newWords: string[], originalPhrase: PhraseUnit): WordUnit[] => {
    const totalDuration = originalPhrase.end - originalPhrase.start;
    const totalChars = originalPhrase.phrase.length;
    
    let globalCharIndex = 0; // フレーズ全体での連続インデックス
    const newWordUnits: WordUnit[] = [];
    
    newWords.forEach((wordText, wordIndex) => {
      const wordLength = wordText.length;
      const wordStartTime = originalPhrase.start + (globalCharIndex / totalChars) * totalDuration;
      const wordEndTime = originalPhrase.start + ((globalCharIndex + wordLength) / totalChars) * totalDuration;
      
      // 単語内の文字を作成
      const chars: CharUnit[] = [];
      for (let i = 0; i < wordLength; i++) {
        const charStartTime = wordStartTime + (i / wordLength) * (wordEndTime - wordStartTime);
        const charEndTime = wordStartTime + ((i + 1) / wordLength) * (wordEndTime - wordStartTime);
        
        const charId = generateHierarchicalCharId(`${originalPhrase.id}_word_${wordIndex}`, i);
        
        chars.push({
          id: charId,
          char: wordText[i],
          start: Math.round(charStartTime),
          end: Math.round(charEndTime),
          charIndex: globalCharIndex + i, // フレーズ全体での連続番号
          totalChars: totalChars
        });
      }
      
      const wordId = generateHierarchicalWordId(originalPhrase.id, wordIndex);
      
      newWordUnits.push({
        id: wordId,
        word: wordText,
        start: Math.round(wordStartTime),
        end: Math.round(wordEndTime),
        chars: chars
      });
      
      globalCharIndex += wordLength;
    });
    
    return newWordUnits;
  };

  // 自動分割機能
  const handleAutoSplit = () => {
    const newWordTexts = splitIntoWords(phrase.phrase);
    const newWords = redistributeCharactersToWords(newWordTexts, phrase);
    setWords(newWords);
  };

  // 編集開始
  const startEdit = (wordId: string, field: 'word' | 'start' | 'end', value: string | number) => {
    setEditingCell({ wordId, field, value });
    if (field === 'start' || field === 'end') {
      // 時間フィールドの場合は秒単位で表示
      setEditValue(formatTime(value as number));
    } else {
      // テキストフィールドの場合はそのまま
      setEditValue(value.toString());
    }
  };

  // 編集確定
  const confirmEdit = () => {
    if (!editingCell) return;

    const updatedWords = words.map(word => {
      if (word.id === editingCell.wordId) {
        const newWord = { ...word };
        
        if (editingCell.field === 'word') {
          newWord.word = editValue;
          // 単語テキストが変更された場合、文字も再生成
          const chars: CharUnit[] = [];
          const wordDuration = word.end - word.start;
          
          const baseCharIndex = word.chars[0]?.charIndex || 0;
          
          for (let i = 0; i < editValue.length; i++) {
            const charStart = word.start + (i / editValue.length) * wordDuration;
            const charEnd = word.start + ((i + 1) / editValue.length) * wordDuration;
            const charId = generateHierarchicalCharId(word.id, i);
            
            chars.push({
              id: charId,
              char: editValue[i],
              start: Math.round(charStart),
              end: Math.round(charEnd),
              charIndex: baseCharIndex + i, // 元の位置を基準に連続番号
              totalChars: phrase.phrase.length
            });
          }
          newWord.chars = chars;
          // 注意: 全体のcharIndex整合性はEngineで再計算される
        } else if (editingCell.field === 'start') {
          // 開始時刻の変更（秒単位からms単位に変換）
          const newStart = parseTimeFromSeconds(editValue);
          newWord.start = newStart;
          // 文字の時間も調整
          const wordDuration = newWord.end - newWord.start;
          newWord.chars = newWord.chars.map((char, index) => ({
            ...char,
            start: Math.round(newWord.start + (index / newWord.chars.length) * wordDuration),
            end: Math.round(newWord.start + ((index + 1) / newWord.chars.length) * wordDuration)
          }));
        } else if (editingCell.field === 'end') {
          // 終了時刻の変更（秒単位からms単位に変換）
          const newEnd = parseTimeFromSeconds(editValue);
          newWord.end = newEnd;
          // 文字の時間も調整
          const wordDuration = newWord.end - newWord.start;
          newWord.chars = newWord.chars.map((char, index) => ({
            ...char,
            start: Math.round(newWord.start + (index / newWord.chars.length) * wordDuration),
            end: Math.round(newWord.start + ((index + 1) / newWord.chars.length) * wordDuration)
          }));
        }
        
        return newWord;
      }
      return word;
    });

    setWords(updatedWords);
    setEditingCell(null);
  };

  // 単語追加
  const addWord = (afterWordId?: string) => {
    // 新しい単語のインデックスを決定
    const newWordIndex = words.length;
    const newWordId = generateHierarchicalWordId(phrase.id, newWordIndex);
    const newCharId = generateHierarchicalCharId(newWordId, 0);
    
    const newWord: WordUnit = {
      id: newWordId,
      word: '新しい単語',
      start: phrase.start,
      end: phrase.end,
      chars: [{
        id: newCharId,
        char: '新',
        start: phrase.start,
        end: phrase.end,
        charIndex: 0,
        totalChars: 1
      }]
    };

    if (afterWordId) {
      const index = words.findIndex(w => w.id === afterWordId);
      const updatedWords = [...words];
      updatedWords.splice(index + 1, 0, newWord);
      setWords(updatedWords);
    } else {
      setWords([...words, newWord]);
    }
  };

  // 単語削除
  const deleteWord = (wordId: string) => {
    setWords(words.filter(w => w.id !== wordId));
  };

  // 自動時間割り当て機能
  const handleAutoAssignTime = () => {
    // 全体の文字数を計算
    const totalChars = words.reduce((sum, word) => sum + word.word.length, 0);
    if (totalChars === 0) return;

    // フレーズの総時間
    const totalDuration = phrase.end - phrase.start;
    
    // 各単語に時間を割り当て
    let currentTime = phrase.start;
    const updatedWords = words.map((word, index) => {
      const wordCharCount = word.word.length;
      const wordDuration = (wordCharCount / totalChars) * totalDuration;
      
      const newStart = currentTime;
      const newEnd = index === words.length - 1 
        ? phrase.end  // 最後の単語は正確にフレーズの終了時刻に
        : currentTime + wordDuration;
      
      currentTime = newEnd;
      
      // 単語内の文字の時間も再計算
      const chars = word.chars.map((char, charIndex) => ({
        ...char,
        start: Math.round(newStart + (charIndex / wordCharCount) * (newEnd - newStart)),
        end: Math.round(newStart + ((charIndex + 1) / wordCharCount) * (newEnd - newStart))
      }));
      
      return {
        ...word,
        start: Math.round(newStart),
        end: Math.round(newEnd),
        chars
      };
    });
    
    setWords(updatedWords);
  };

  // 保存処理
  const handleSave = () => {
    // charIndexはredistributeCharactersToWordsで正しく設定済み
    // calculateCharacterIndicesはEngineで実行されるため呼び出さない
    const updatedPhrase: PhraseUnit = {
      ...phrase,
      words: words
    };
    
    onSave(updatedPhrase);
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
    <div className="word-split-editor">
      <div className="word-split-editor-header">
        <h3>単語分割編集: "{phrase.phrase}"</h3>
        <div className="word-split-editor-controls">
          <Button variant="info" onClick={handleAutoSplit} disabled={true}>
            自動分割
          </Button>
          <Button variant="info" onClick={handleAutoAssignTime}>
            自動時間割り当て
          </Button>
          <Button variant="primary" onClick={handleSave}>
            OK
          </Button>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
        </div>
      </div>

      <div className="word-split-editor-content">
        <table className="words-table">
          <thead>
            <tr>
              <th>単語</th>
              <th>開始時刻 (秒)</th>
              <th>終了時刻 (秒)</th>
              <th>アクション</th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => (
              <tr key={word.id}>
                <td 
                  className="editable-cell"
                  onClick={() => startEdit(word.id, 'word', word.word)}
                >
                  {editingCell?.wordId === word.id && editingCell.field === 'word' ? (
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
                    word.word
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(word.id, 'start', word.start)}
                >
                  {editingCell?.wordId === word.id && editingCell.field === 'start' ? (
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
                    formatTime(word.start)
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(word.id, 'end', word.end)}
                >
                  {editingCell?.wordId === word.id && editingCell.field === 'end' ? (
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
                    formatTime(word.end)
                  )}
                </td>
                <td className="action-cell">
                  <Button 
                    variant="success"
                    size="small"
                    onClick={() => addWord(word.id)}
                    title="下に単語を追加"
                  >
                    ↓追加
                  </Button>
                  <Button 
                    variant="danger"
                    size="small"
                    onClick={() => deleteWord(word.id)}
                    title="単語を削除"
                  >
                    削除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {words.length === 0 && (
          <div className="no-words">
            単語がありません。「自動分割」ボタンを押すかテーブルから単語を追加してください。
          </div>
        )}
        
        <div className="add-word-section">
          <Button variant="primary" onClick={() => addWord()}>
            + 単語を追加
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WordSplitEditor;