import React, { useState, useEffect } from 'react';
import { FontService, FontFamily, FontStyle } from '../../services/FontService';
import './FontSelector.css';

interface FontSelectorProps {
  value: string;
  onChange: (fontFamily: string) => void;
  disabled?: boolean;
}

const FontSelector: React.FC<FontSelectorProps> = ({ value, onChange, disabled = false }) => {
  const [fontFamilies, setFontFamilies] = useState<FontFamily[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [availableStyles, setAvailableStyles] = useState<FontStyle[]>([]);

  // フォントファミリーリストを取得
  useEffect(() => {
    const loadFontFamilies = () => {
      const families = FontService.getFontFamiliesWithStyles();
      setFontFamilies(families);
    };

    // 初回読み込み
    loadFontFamilies();

    // 設定変更イベントのリスナー
    const handleFontSettingsChange = () => {
      // FontServiceの設定を再読み込み
      FontService.reloadFontSettings();
      // フォントファミリーリストを再取得
      loadFontFamilies();
    };

    window.addEventListener('fontSettingsChanged', handleFontSettingsChange);

    return () => {
      window.removeEventListener('fontSettingsChanged', handleFontSettingsChange);
    };
  }, []);

  // 現在の値からファミリーとスタイルを解析
  useEffect(() => {
    if (value && fontFamilies.length > 0) {
      // 完全一致するフォント名を検索
      let foundFamily = '';
      let foundStyle = '';

      for (const family of fontFamilies) {
        for (const style of family.styles) {
          if (style.fullName === value) {
            foundFamily = family.family;
            foundStyle = style.fullName;
            break;
          }
        }
        if (foundFamily) break;
      }

      // 完全一致が見つからない場合は、ファミリー名で検索
      if (!foundFamily) {
        const family = fontFamilies.find(f => f.family === value);
        if (family) {
          foundFamily = family.family;
          foundStyle = family.styles[0]?.fullName || family.family;
        }
      }

      // 見つからない場合は最初のフォントを選択
      if (!foundFamily && fontFamilies.length > 0) {
        foundFamily = fontFamilies[0].family;
        foundStyle = fontFamilies[0].styles[0]?.fullName || fontFamilies[0].family;
      }

      setSelectedFamily(foundFamily);
      setSelectedStyle(foundStyle);
      
      // 利用可能なスタイルを更新
      const family = fontFamilies.find(f => f.family === foundFamily);
      if (family) {
        setAvailableStyles(family.styles);
      }
    }
  }, [value, fontFamilies]);

  // フォントファミリーが変更された時の処理
  const handleFamilyChange = (familyName: string) => {
    setSelectedFamily(familyName);
    
    const family = fontFamilies.find(f => f.family === familyName);
    if (family) {
      setAvailableStyles(family.styles);
      
      // 最初のスタイルを自動選択
      const firstStyle = family.styles[0];
      if (firstStyle) {
        setSelectedStyle(firstStyle.fullName);
        onChange(firstStyle.fullName);
      }
    }
  };

  // フォントスタイルが変更された時の処理
  const handleStyleChange = (styleName: string) => {
    setSelectedStyle(styleName);
    onChange(styleName);
  };

  return (
    <div className="font-selector">
      <div className="font-family-selector">
        <label className="font-selector-label">フォントファミリー:</label>
        <select
          value={selectedFamily}
          onChange={(e) => handleFamilyChange(e.target.value)}
          disabled={disabled}
          className="font-family-select"
        >
          <option value="">フォントを選択...</option>
          {fontFamilies.map(family => (
            <option key={family.family} value={family.family}>
              {family.family}
            </option>
          ))}
        </select>
      </div>

      {selectedFamily && availableStyles.length > 1 && (
        <div className="font-style-selector">
          <label className="font-selector-label">スタイル:</label>
          <select
            value={selectedStyle}
            onChange={(e) => handleStyleChange(e.target.value)}
            disabled={disabled}
            className="font-style-select"
          >
            {availableStyles.map(style => (
              <option key={style.fullName} value={style.fullName}>
                {style.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedFamily && (
        <div className="font-preview">
          <div 
            className="font-preview-text"
            style={{ 
              fontFamily: selectedStyle || selectedFamily,
              fontSize: '16px',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: '#f9f9f9'
            }}
          >
            {selectedFamily} - {availableStyles.find(s => s.fullName === selectedStyle)?.displayName || 'Regular'}
          </div>
        </div>
      )}
    </div>
  );
};

export default FontSelector;