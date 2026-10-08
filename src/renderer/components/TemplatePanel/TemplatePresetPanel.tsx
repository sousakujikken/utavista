import React, { useEffect, useMemo, useState } from 'react';
import { TemplatePreset, TemplatePresetService } from '../../services/TemplatePresetService';
import type { ParamConfig } from '../ParamEditor/ParamEditor';
import { Button } from '../common';
import './TemplatePresetPanel.css';

interface TemplatePresetPanelProps {
  templateId: string;
  params: Record<string, unknown>;
  paramConfig: ParamConfig[];
  onApply: (params: Record<string, unknown>) => void;
}

const TemplatePresetPanel: React.FC<TemplatePresetPanelProps> = ({
  templateId,
  params,
  paramConfig,
  onApply
}) => {
  const [presets, setPresets] = useState<TemplatePreset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const selectedPreset = useMemo(
    () => presets.find(preset => preset.id === selectedId),
    [presets, selectedId]
  );
  const builtInPresets = presets.filter(preset => preset.builtIn);
  const userPresets = presets.filter(preset => !preset.builtIn);

  const reload = () => setPresets(TemplatePresetService.list(templateId));

  useEffect(() => {
    reload();
    setSelectedId('');
    setName('');
    setMessage('');
  }, [templateId]);

  const createSnapshot = (): Record<string, unknown> => {
    const snapshot: Record<string, unknown> = {};
    paramConfig.forEach(config => {
      snapshot[config.name] = params[config.name] !== undefined
        ? params[config.name]
        : config.default;
    });
    return snapshot;
  };

  const savePreset = (overwrite: boolean) => {
    try {
      const saved = TemplatePresetService.save(
        templateId,
        name,
        createSnapshot(),
        overwrite ? selectedId : undefined
      );
      reload();
      setSelectedId(saved.id);
      setName(saved.name);
      setMessage(overwrite ? 'プリセットを上書きしました' : '新しいプリセットを保存しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存に失敗しました');
    }
  };

  const applyPreset = () => {
    if (!selectedPreset) return;
    onApply({ ...params, ...selectedPreset.params });
    setMessage(`「${selectedPreset.name}」を適用しました`);
  };

  const deletePreset = () => {
    if (!selectedPreset) return;
    if (!window.confirm(`プリセット「${selectedPreset.name}」を削除しますか？`)) return;
    TemplatePresetService.delete(selectedPreset.id);
    setSelectedId('');
    setName('');
    setMessage('プリセットを削除しました');
    reload();
  };

  return (
    <div className="common-section template-preset-panel">
      <div className="template-preset-heading">
        <h3 className="common-section-title">シーン設定プリセット</h3>
        <span>{presets.length}件</span>
      </div>
      <p>現在の設定に名前を付けて保存し、別のプロジェクトやフレーズでも再利用できます。</p>

      {/* 保存済みプリセットを選んで使う */}
      <div className="template-preset-group">
        <label className="template-preset-label">
          保存済みプリセット
          <select
            value={selectedId}
            onChange={event => {
              const nextId = event.target.value;
              const preset = presets.find(item => item.id === nextId);
              setSelectedId(nextId);
              setName(preset?.name || '');
              setMessage('');
            }}
          >
            <option value="">選択してください</option>
            {builtInPresets.length > 0 && (
              <optgroup label="内蔵バリエーション">
                {builtInPresets.map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </optgroup>
            )}
            {userPresets.length > 0 && (
              <optgroup label="ユーザープリセット">
                {userPresets.map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {selectedPreset?.description && (
          <div className="template-preset-description">
            <strong>{selectedPreset.builtIn ? '内蔵バリエーション' : 'プリセット'}</strong>
            <span>{selectedPreset.description}</span>
            {selectedPreset.referenceUrl && (
              <a href={selectedPreset.referenceUrl} target="_blank" rel="noreferrer">参考実装を開く</a>
            )}
          </div>
        )}

        <div className="template-preset-actions">
          <Button variant="primary" onClick={applyPreset} disabled={!selectedPreset}>
            適用
          </Button>
          <Button variant="danger-outline" onClick={deletePreset} disabled={!selectedPreset || selectedPreset.builtIn}>
            削除
          </Button>
        </div>
      </div>

      {/* 現在の設定を保存する */}
      <div className="template-preset-group">
        <label className="template-preset-label">
          保存名
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="例: サビ用・強いスラム"
          />
        </label>

        <div className="template-preset-actions">
          <Button onClick={() => savePreset(false)} disabled={!name.trim()}>
            新規保存
          </Button>
          <Button onClick={() => savePreset(true)} disabled={!selectedPreset || selectedPreset.builtIn || !name.trim()}>
            上書き
          </Button>
        </div>
      </div>

      {message && <div className="template-preset-message">{message}</div>}
    </div>
  );
};

export default TemplatePresetPanel;
