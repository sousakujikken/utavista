import React, { useState, useEffect } from 'react';
import { FontService, FontFamily } from '../services/FontService';
import './FontPickerModal.css';

interface FontPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedFonts: string[], showAllFonts: boolean) => void;
  initialSelectedFonts: string[];
  initialShowAllFonts: boolean;
}

const FontPickerModal: React.FC<FontPickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialSelectedFonts,
  initialShowAllFonts
}) => {
  const [fontFamilies, setFontFamilies] = useState<FontFamily[]>([]);
  const [selectedFonts, setSelectedFonts] = useState<Set<string>>(new Set(initialSelectedFonts));
  const [showAllFonts, setShowAllFonts] = useState(initialShowAllFonts);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // フォント一覧を取得
  useEffect(() => {
    if (isOpen) {
      loadFonts();
    }
  }, [isOpen]);

  const loadFonts = async () => {
    try {
      setIsLoading(true);
      const families = FontService.getFontFamiliesWithStyles();
      setFontFamilies(families);
    } catch (error) {
      console.error('フォント一覧の取得に失敗しました:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // フォント選択の切り替え
  const handleFontToggle = (fontFamily: string) => {
    const newSelectedFonts = new Set(selectedFonts);
    if (newSelectedFonts.has(fontFamily)) {
      newSelectedFonts.delete(fontFamily);
    } else {
      newSelectedFonts.add(fontFamily);
    }
    setSelectedFonts(newSelectedFonts);
  };

  // 全選択/全解除
  const handleSelectAll = () => {
    setSelectedFonts(new Set(fontFamilies.map(f => f.family)));
  };

  const handleDeselectAll = () => {
    setSelectedFonts(new Set());
  };

  // 確定処理
  const handleConfirm = () => {
    onConfirm(Array.from(selectedFonts), showAllFonts);
    onClose();
  };

  // フォント検索フィルター
  const filteredFonts = fontFamilies.filter(font => 
    font.family.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="font-picker-modal-overlay" onClick={onClose}>
      <div className="font-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="font-picker-header">
          <h2>フォント選択</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="font-picker-content">
          <div className="font-picker-controls">
            <div className="display-mode-setting">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showAllFonts}
                  onChange={(e) => setShowAllFonts(e.target.checked)}
                />
                全てのフォントを表示（チェックを外すと選択したフォントのみ表示）
              </label>
            </div>

            <div className="search-and-bulk-controls">
              <input
                type="text"
                placeholder="フォントを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="font-search-input"
              />
              
              <div className="bulk-buttons">
                <button onClick={handleSelectAll} className="bulk-button">
                  全選択
                </button>
                <button onClick={handleDeselectAll} className="bulk-button">
                  全解除
                </button>
              </div>
            </div>

            <div className="selection-status">
              選択中: {selectedFonts.size} / {fontFamilies.length} フォント
            </div>
          </div>

          {isLoading ? (
            <div className="loading-state">フォント一覧を読み込み中...</div>
          ) : (
            <div className="font-grid">
              {filteredFonts.map(font => (
                <div 
                  key={font.family} 
                  className={`font-item ${selectedFonts.has(font.family) ? 'selected' : ''}`}
                  onClick={() => handleFontToggle(font.family)}
                >
                  <div className="font-item-header">
                    <input
                      type="checkbox"
                      checked={selectedFonts.has(font.family)}
                      onChange={() => handleFontToggle(font.family)}
                      onClick={e => e.stopPropagation()}
                      className="font-checkbox"
                    />
                    <div className="font-name-container">
                      <div className="font-name" title={font.family}>{font.family}</div>
                      <div className="font-styles">{font.styles.length} スタイル</div>
                    </div>
                  </div>
                  
                  <div 
                    className="font-preview"
                    style={{ fontFamily: font.family }}
                  >
                    <div className="preview-text-large">
                      Aa あいうえお
                    </div>
                    <div className="preview-text-medium">
                      The quick brown fox jumps over the lazy dog
                    </div>
                    <div className="preview-text-small">
                      1234567890 !"#$%&'()
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredFonts.length === 0 && searchQuery && (
                <div className="no-results">
                  「{searchQuery}」に一致するフォントが見つかりません
                </div>
              )}
            </div>
          )}
        </div>

        <div className="font-picker-footer">
          <button onClick={onClose} className="cancel-button">
            キャンセル
          </button>
          <button onClick={handleConfirm} className="confirm-button">
            確定
          </button>
        </div>
      </div>
    </div>
  );
};

export default FontPickerModal;