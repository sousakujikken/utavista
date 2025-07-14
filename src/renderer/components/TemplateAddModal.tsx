import React, { useState, useEffect } from 'react';
import { DiscoveredTemplate, TemplateDiscoveryService } from '../services/TemplateDiscoveryService';
import { TemplateRegistryService } from '../services/TemplateRegistryService';
import { TemplateConfig } from '../templates/registry/types';
import { getAllTemplates } from '../templates/registry/templateRegistry';
import '../styles/TemplateAddModal.css';

interface TemplateAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface RegisteredTemplate {
  id: string;
  name: string;
  inJson: boolean; // JSONファイルに存在するかどうか
}

const TemplateAddModal: React.FC<TemplateAddModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [unregisteredTemplates, setUnregisteredTemplates] = useState<DiscoveredTemplate[]>([]);
  const [registeredTemplates, setRegisteredTemplates] = useState<RegisteredTemplate[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'unregistered' | 'registered'>('unregistered');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 未登録テンプレートを読み込み
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // JSONファイルのレジストリを読み込み
      const jsonRegistry = await TemplateRegistryService.loadRegistry();
      const jsonTemplateIds = new Set(jsonRegistry.templates.map(t => t.id));
      
      // アプリケーション上のレジストリを取得
      const appTemplates = getAllTemplates();
      
      // 登録済みテンプレートを構築（アプリケーション上のレジストリから）
      const registered: RegisteredTemplate[] = appTemplates.map(template => ({
        id: template.id,
        name: template.name,
        inJson: jsonTemplateIds.has(template.id)
      }));
      
      // 未登録テンプレートを取得
      const unregistered = await TemplateDiscoveryService.getUnregisteredTemplates(jsonRegistry.templates);
      
      setUnregisteredTemplates(unregistered);
      setRegisteredTemplates(registered);
      setSelectedTemplates(new Set());
      setSelectedForRemoval(new Set());
    } catch (err) {
      setError('テンプレートの読み込みに失敗しました');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // テンプレート選択の切り替え
  const handleTemplateToggle = (templateId: string) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedTemplates(newSelected);
  };

  // 削除用テンプレート選択の切り替え
  const handleRemovalToggle = (templateId: string) => {
    const newSelected = new Set(selectedForRemoval);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedForRemoval(newSelected);
  };

  // 全選択/全解除
  const handleSelectAll = () => {
    if (activeTab === 'unregistered') {
      setSelectedTemplates(new Set(unregisteredTemplates.map(t => t.className)));
    } else {
      setSelectedForRemoval(new Set(registeredTemplates.map(t => t.id)));
    }
  };

  const handleDeselectAll = () => {
    if (activeTab === 'unregistered') {
      setSelectedTemplates(new Set());
    } else {
      setSelectedForRemoval(new Set());
    }
  };

  // テンプレートを追加
  const handleAddTemplates = async () => {
    if (selectedTemplates.size === 0) {
      setError('追加するテンプレートを選択してください');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const templatesToAdd: TemplateConfig[] = unregisteredTemplates
        .filter(t => selectedTemplates.has(t.className))
        .map(t => TemplateDiscoveryService.discoveredToConfig(t));

      const success = await TemplateRegistryService.addTemplates(templatesToAdd);
      
      if (success) {
        // レジストリをリロード
        await TemplateRegistryService.reloadRegistry();
        await loadTemplates(); // テンプレート一覧を再読み込み
        onSuccess();
        setActiveTab('registered'); // 追加後は登録済みタブに切り替え
      } else {
        setError('テンプレートの追加に失敗しました');
      }
    } catch (err) {
      setError(`テンプレートの追加に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // テンプレートを削除
  const handleRemoveTemplates = async () => {
    if (selectedForRemoval.size === 0) {
      setError('削除するテンプレートを選択してください');
      return;
    }

    // JSONファイルに存在するテンプレートのみを抽出
    const templatesToRemove = registeredTemplates
      .filter(t => selectedForRemoval.has(t.id) && t.inJson)
      .map(t => t.id);

    if (templatesToRemove.length === 0) {
      setError('選択したテンプレートはJSONファイルに登録されていません。\nアプリケーションレジストリからの削除にはアプリケーションの再起動が必要です。');
      return;
    }

    const confirmMessage = templatesToRemove.length === selectedForRemoval.size
      ? `選択した${selectedForRemoval.size}個のテンプレートをJSONファイルから削除しますか？\n削除後、アプリケーションの再起動が必要です。`
      : `選択した${selectedForRemoval.size}個のテンプレートのうち、${templatesToRemove.length}個をJSONファイルから削除しますか？\n削除後、アプリケーションの再起動が必要です。`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let successCount = 0;
      for (const templateId of templatesToRemove) {
        const success = await TemplateRegistryService.removeTemplate(templateId);
        if (success) successCount++;
      }
      
      if (successCount > 0) {
        await loadTemplates(); // テンプレート一覧を再読み込み
        onSuccess();
        
        // 成功メッセージを表示
        const message = `${successCount}個のテンプレートをJSONファイルから削除しました。\nアプリケーションから完全に削除するには再起動してください。`;
        alert(message);
        
        if (registeredTemplates.filter(t => t.inJson).length - successCount === 0) {
          setActiveTab('unregistered'); // JSONファイルから全て削除された場合は未登録タブに切り替え
        }
      } else {
        setError('テンプレートの削除に失敗しました');
      }
    } catch (err) {
      setError(`テンプレートの削除に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // モーダルを閉じる
  const handleClose = () => {
    setSelectedTemplates(new Set());
    setSelectedForRemoval(new Set());
    setError(null);
    setActiveTab('unregistered');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="template-add-modal-overlay">
      <div className="template-add-modal">
        <div className="template-add-modal-header">
          <h3>テンプレート管理</h3>
          <button className="template-add-modal-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="template-add-modal-tabs">
          <button
            className={`tab-button ${activeTab === 'unregistered' ? 'active' : ''}`}
            onClick={() => setActiveTab('unregistered')}
          >
            未登録テンプレート ({unregisteredTemplates.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'registered' ? 'active' : ''}`}
            onClick={() => setActiveTab('registered')}
          >
            登録済みテンプレート ({registeredTemplates.length})
          </button>
        </div>

        <div className="template-add-modal-content">
          {isLoading ? (
            <div className="template-add-loading">
              <div className="loading-spinner"></div>
              <p>テンプレートを読み込み中...</p>
            </div>
          ) : error ? (
            <div className="template-add-error">
              <p>{error}</p>
              <button onClick={loadTemplates}>再試行</button>
            </div>
          ) : activeTab === 'unregistered' ? (
            unregisteredTemplates.length === 0 ? (
            <div className="template-add-empty">
              <p>追加可能な新しいテンプレートがありません</p>
              <p className="template-add-empty-description">
                テンプレートフォルダに新しい.tsファイルを配置してから再度お試しください
              </p>
            </div>
            ) : (
              <>
                <div className="template-add-description">
                  <p>以下の未登録テンプレートが見つかりました。追加したいテンプレートを選択してください：</p>
                </div>

                <div className="template-add-controls">
                  <button 
                    className="template-add-control-btn"
                    onClick={handleSelectAll}
                    disabled={unregisteredTemplates.length === 0}
                  >
                    全選択
                  </button>
                  <button 
                    className="template-add-control-btn"
                    onClick={handleDeselectAll}
                    disabled={selectedTemplates.size === 0}
                  >
                    全解除
                  </button>
                  <span className="template-add-selection-count">
                    {selectedTemplates.size} / {unregisteredTemplates.length} 選択
                  </span>
                </div>

                <div className="template-add-list">
                  {unregisteredTemplates.map(template => (
                    <div 
                      key={template.className}
                      className={`template-add-item ${selectedTemplates.has(template.className) ? 'selected' : ''}`}
                      onClick={() => handleTemplateToggle(template.className)}
                    >
                      <div className="template-add-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedTemplates.has(template.className)}
                          onChange={() => handleTemplateToggle(template.className)}
                        />
                      </div>
                      <div className="template-add-info">
                        <div className="template-add-name">{template.displayName}</div>
                        <div className="template-add-details">
                          <span className="template-add-class">クラス: {template.className}</span>
                          <span className="template-add-file">ファイル: {template.fileName}.ts</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : (
            // 登録済みテンプレートタブ
            registeredTemplates.length === 0 ? (
              <div className="template-add-empty">
                <p>登録済みのテンプレートがありません</p>
              </div>
            ) : (
              <>
                <div className="template-add-description">
                  <p>登録済みのテンプレート一覧です。削除したいテンプレートを選択してください：</p>
                </div>

                <div className="template-add-controls">
                  <button 
                    className="template-add-control-btn"
                    onClick={handleSelectAll}
                    disabled={registeredTemplates.length === 0}
                  >
                    全選択
                  </button>
                  <button 
                    className="template-add-control-btn"
                    onClick={handleDeselectAll}
                    disabled={selectedForRemoval.size === 0}
                  >
                    全解除
                  </button>
                  <span className="template-add-selection-count">
                    {selectedForRemoval.size} / {registeredTemplates.length} 選択
                  </span>
                </div>

                <div className="template-add-list">
                  {registeredTemplates.map(template => (
                    <div 
                      key={template.id}
                      className={`template-add-item ${selectedForRemoval.has(template.id) ? 'selected' : ''} ${!template.inJson ? 'no-json' : ''}`}
                      onClick={() => handleRemovalToggle(template.id)}
                    >
                      <div className="template-add-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedForRemoval.has(template.id)}
                          onChange={() => handleRemovalToggle(template.id)}
                        />
                      </div>
                      <div className="template-add-info">
                        <div className="template-add-name">
                          {template.name}
                          {!template.inJson && <span className="template-add-badge">組み込み</span>}
                        </div>
                        <div className="template-add-details">
                          <span className="template-add-class">ID: {template.id}</span>
                          <span className="template-add-status">
                            {template.inJson ? 'JSONファイルに登録済み' : 'アプリケーション組み込み'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}
        </div>

        <div className="template-add-modal-footer">
          <button 
            className="template-add-modal-cancel"
            onClick={handleClose}
            disabled={isLoading}
          >
            キャンセル
          </button>
          {activeTab === 'unregistered' ? (
            <button 
              className="template-add-modal-confirm"
              onClick={handleAddTemplates}
              disabled={isLoading || selectedTemplates.size === 0 || unregisteredTemplates.length === 0}
            >
              {isLoading ? '追加中...' : `選択したテンプレートを追加 (${selectedTemplates.size})`}
            </button>
          ) : (
            <button 
              className="template-add-modal-remove"
              onClick={handleRemoveTemplates}
              disabled={isLoading || selectedForRemoval.size === 0 || registeredTemplates.length === 0}
            >
              {isLoading ? '削除中...' : `選択したテンプレートを削除 (${selectedForRemoval.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateAddModal;