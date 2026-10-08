import React, { useEffect, useMemo, useState } from 'react';
import { FontService, FontFamily } from '../../services/FontService';
import './FontSelector.css';

interface FontSelectorProps {
  value: string;
  weightValue: string;
  onChange: (fontFamily: string, fontWeight: string) => void;
  disabled?: boolean;
}

const FontSelector: React.FC<FontSelectorProps> = ({ value, weightValue, onChange, disabled = false }) => {
  const [fontFamilies, setFontFamilies] = useState<FontFamily[]>([]);

  useEffect(() => {
    const loadFontFamilies = () => setFontFamilies(FontService.getFontFamiliesWithStyles());
    loadFontFamilies();
    window.addEventListener('fontSettingsChanged', loadFontFamilies);
    return () => window.removeEventListener('fontSettingsChanged', loadFontFamilies);
  }, []);

  const selectedFamily = useMemo(() => {
    if (fontFamilies.some(font => font.family === value)) return value;
    const normalizedValue = FontService.normalizeFontFamily(value);
    if (fontFamilies.some(font => font.family === normalizedValue)) return normalizedValue;
    const legacyMatch = fontFamilies.find(font => font.styles.some(style => style.fullName === value));
    return legacyMatch?.family || '';
  }, [fontFamilies, value]);

  const weightOptions = useMemo(
    () => selectedFamily ? FontService.getFontWeightOptions(selectedFamily) : [],
    [selectedFamily, fontFamilies]
  );
  const selectedWeight = weightOptions.some(option => option.value === weightValue)
    ? weightValue
    : weightOptions.find(option => option.value === '400')?.value || weightOptions[0]?.value || '400';

  const handleFamilyChange = async (familyName: string) => {
    if (!familyName) return;
    const options = FontService.getFontWeightOptions(familyName);
    const nextWeight = options.some(option => option.value === weightValue)
      ? weightValue
      : options.find(option => option.value === '400')?.value || options[0]?.value || '400';
    await FontService.ensureFontLoaded(familyName, nextWeight);
    onChange(familyName, nextWeight);
  };

  const handleWeightChange = async (fontWeight: string) => {
    if (!selectedFamily) return;
    await FontService.ensureFontLoaded(selectedFamily, fontWeight);
    onChange(selectedFamily, fontWeight);
  };

  return (
    <div className="font-selector">
      <div className="font-family-selector">
        <label className="font-selector-label">フォントファミリー:</label>
        <select
          value={selectedFamily}
          onChange={event => void handleFamilyChange(event.target.value)}
          disabled={disabled}
          className="font-family-select"
        >
          <option value="">フォントを選択...</option>
          {fontFamilies.map(font => (
            <option key={font.family} value={font.family}>{font.family}</option>
          ))}
        </select>
      </div>

      {selectedFamily && weightOptions.length > 0 && (
        <div className="font-style-selector">
          <label className="font-selector-label">書体:</label>
          <select
            value={selectedWeight}
            onChange={event => void handleWeightChange(event.target.value)}
            disabled={disabled}
            className="font-style-select"
          >
            {weightOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}

      {selectedFamily && (
        <div className="font-preview">
          <div className="font-preview-text" style={{ fontFamily: selectedFamily, fontWeight: selectedWeight }}>
            {selectedFamily} — あいうえお ABC 123
          </div>
        </div>
      )}
    </div>
  );
};

export default FontSelector;
