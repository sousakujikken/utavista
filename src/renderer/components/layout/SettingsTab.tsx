import React, { useState, useEffect } from 'react';
import { FontService, FontFamily } from '../../services/FontService';
import Engine from '../../engine/Engine';
import FontPickerModal from '../FontPickerModal';
import TemplateAddModal from '../TemplateAddModal';
import '../../styles/SettingsTab.css';

interface SettingsTabProps {
  engine?: Engine;
}

// ピックアップフォント設定の型定義
interface FontPickupSettings {
  selectedFonts: Set<string>;
  showAllFonts: boolean;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ engine }) => {
  const [fontFamilies, setFontFamilies] = useState<FontFamily[]>([]);
  const [fontPickupSettings, setFontPickupSettings] = useState<FontPickupSettings>({
    selectedFonts: new Set(),
    showAllFonts: true
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTemplateAddModalOpen, setIsTemplateAddModalOpen] = useState(false);

  // フォント一覧を取得
  useEffect(() => {
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

    loadFonts();
  }, []);

  // ローカルストレージから設定を読み込み
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('fontPickupSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setFontPickupSettings({
          selectedFonts: new Set(parsed.selectedFonts || []),
          showAllFonts: parsed.showAllFonts !== false
        });
      }
    } catch (error) {
      console.error('設定の読み込みに失敗しました:', error);
    }
  }, []);

  // 設定をローカルストレージに保存
  const saveSettings = (settings: FontPickupSettings) => {
    try {
      const settingsToSave = {
        selectedFonts: Array.from(settings.selectedFonts),
        showAllFonts: settings.showAllFonts
      };
      localStorage.setItem('fontPickupSettings', JSON.stringify(settingsToSave));
    } catch (error) {
      console.error('設定の保存に失敗しました:', error);
    }
  };

  // フォント選択の切り替え
  const handleFontToggle = (fontFamily: string) => {
    const newSettings = {
      ...fontPickupSettings,
      selectedFonts: new Set(fontPickupSettings.selectedFonts)
    };

    if (newSettings.selectedFonts.has(fontFamily)) {
      newSettings.selectedFonts.delete(fontFamily);
    } else {
      newSettings.selectedFonts.add(fontFamily);
    }

    setFontPickupSettings(newSettings);
    saveSettings(newSettings);
  };

  // 全てのフォントを表示するかどうかの切り替え
  const handleShowAllFontsToggle = () => {
    const newSettings = {
      ...fontPickupSettings,
      showAllFonts: !fontPickupSettings.showAllFonts
    };

    setFontPickupSettings(newSettings);
    saveSettings(newSettings);
  };

  // 全選択/全解除
  const handleSelectAll = () => {
    const newSettings = {
      ...fontPickupSettings,
      selectedFonts: new Set(fontFamilies.map(f => f.family))
    };

    setFontPickupSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleDeselectAll = () => {
    const newSettings = {
      ...fontPickupSettings,
      selectedFonts: new Set()
    };

    setFontPickupSettings(newSettings);
    saveSettings(newSettings);
  };

  // モーダルから設定を受け取って適用
  const handleModalConfirm = (selectedFonts: string[], showAllFonts: boolean) => {
    const newSettings = {
      selectedFonts: new Set(selectedFonts),
      showAllFonts: showAllFonts
    };

    setFontPickupSettings(newSettings);
    saveSettings(newSettings);

    // FontServiceの設定を更新
    FontService.updatePickedFonts(selectedFonts, showAllFonts);
    
    // 設定を再読み込みしてフィルタリングを適用
    FontService.reloadFontSettings();
    
    // FontSelectorなどの再レンダリングをトリガーするため、
    // カスタムイベントを発火
    window.dispatchEvent(new CustomEvent('fontSettingsChanged'));
  };

  // テンプレート追加成功時の処理
  const handleTemplateAddSuccess = () => {
    // テンプレート追加成功のメッセージやリロード処理を実行
    console.log('テンプレートが正常に追加されました');
    
    // テンプレートタブの再読み込みを促すイベントを発火
    window.dispatchEvent(new CustomEvent('templateRegistryChanged'));
  };

  // フォント検索フィルター
  const filteredFonts = fontFamilies.filter(font => 
    font.family.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="settings-tab">
      <div className="settings-section">
        <h3>フォント設定</h3>
        
        <div className="font-display-setting">
          <p className="setting-description">
            テンプレートで使用するフォントを選択できます。<br />
            選択したフォントのみがテンプレートのフォント選択に表示されます。
          </p>
          
          <button 
            className="open-font-picker-button"
            onClick={() => setIsModalOpen(true)}
          >
            有効化フォントを選択
          </button>
          
          <div className="current-settings">
            <div className="setting-item">
              <span className="setting-label">表示モード:</span>
              <span className="setting-value">
                {fontPickupSettings.showAllFonts ? '全てのフォントを表示' : '選択したフォントのみ表示'}
              </span>
            </div>
            <div className="setting-item">
              <span className="setting-label">選択フォント数:</span>
              <span className="setting-value">
                {fontPickupSettings.selectedFonts.size} / {fontFamilies.length} フォント
              </span>
            </div>
          </div>
        </div>

      </div>

      <div className="settings-section">
        <h3>テンプレート管理</h3>
        
        <div className="template-management-setting">
          <p className="setting-description">
            テンプレートフォルダに新しい.tsファイルを配置した後、<br />
            ここからテンプレートレジストリに追加できます。
          </p>
          
          <button 
            className="add-template-button"
            onClick={() => setIsTemplateAddModalOpen(true)}
          >
            テンプレート管理
          </button>
          
          <div className="template-management-description">
            <p className="template-management-note">
              注意: テンプレートを追加した後、アプリケーションの再起動が必要な場合があります。
            </p>
          </div>
        </div>

      </div>
      
      <FontPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleModalConfirm}
        initialSelectedFonts={Array.from(fontPickupSettings.selectedFonts)}
        initialShowAllFonts={fontPickupSettings.showAllFonts}
      />
      
      <TemplateAddModal
        isOpen={isTemplateAddModalOpen}
        onClose={() => setIsTemplateAddModalOpen(false)}
        onSuccess={handleTemplateAddSuccess}
      />
    </div>
  );
};

export default SettingsTab;