import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Engine from '../../engine/Engine';
import { KineticSceneTemplate } from '../../templates/KineticSceneTemplate';
import ParamEditor from '../ParamEditor/ParamEditor';
import TemplatePresetPanel from '../TemplatePanel/TemplatePresetPanel';
import PostEffectPanel from '../SceneSettings/PostEffectPanel';
import {
  getObjectSelectionSnapshot,
  subscribeObjectSelection
} from '../../services/ObjectSelectionState';
import '../../styles/SceneSettingsTab.css';

type EditorMode = 'global' | 'selection';

interface SceneSettingsTabProps {
  engine?: Engine;
}

const FIXED_TEMPLATE_ID = 'kineticscenetemplate';
const fixedTemplate = new KineticSceneTemplate();

function normalizeTargetId(objectId: string, objectType: string): string {
  if (objectType !== 'char') return objectId;
  return objectId.replace(/_char_(?:\d+|.+)$/, '');
}

const SceneSettingsTab: React.FC<SceneSettingsTabProps> = ({ engine }) => {
  const initialSelection = useMemo(() => getObjectSelectionSnapshot(), []);
  const paramConfig = useMemo(() => fixedTemplate.getParameterConfig(), []);
  const defaults = useMemo(() => Object.fromEntries(paramConfig.map(param => [param.name, param.default])), [paramConfig]);
  const [mode, setMode] = useState<EditorMode>('global');
  const [globalParams, setGlobalParams] = useState<Record<string, unknown>>(defaults);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>(initialSelection.objectIds);
  const [selectedObjectType, setSelectedObjectType] = useState(initialSelection.objectType);
  const [objectParams, setObjectParams] = useState<Record<string, unknown>>(defaults);

  const resolveTargetId = useCallback((objectId: string, objectType: string): string => {
    if (objectType !== 'char') return objectId;
    const lyrics = engine?.getTimelineData().lyrics || [];
    for (const phrase of lyrics) {
      const parentWord = phrase.words.find(word => word.chars.some(character => character.id === objectId));
      if (parentWord) return parentWord.id;
    }
    return normalizeTargetId(objectId, objectType);
  }, [engine]);

  const targetIds = useMemo(
    () => Array.from(new Set(selectedObjectIds.map(id => resolveTargetId(id, selectedObjectType)))),
    [selectedObjectIds, selectedObjectType, resolveTargetId]
  );

  const syncGlobalParams = useCallback(() => {
    if (!engine) return;
    setGlobalParams({ ...defaults, ...engine.parameterManager.getGlobalDefaults() });
  }, [engine, defaults]);

  const syncObjectParams = useCallback((ids: string[]) => {
    if (!engine || ids.length === 0) return;
    setObjectParams({ ...defaults, ...engine.parameterManager.getParameters(ids[0]) });
  }, [engine, defaults]);

  useEffect(() => {
    syncGlobalParams();
  }, [syncGlobalParams]);

  useEffect(() => subscribeObjectSelection(snapshot => {
    setSelectedObjectIds(snapshot.objectIds);
    setSelectedObjectType(snapshot.objectType);
    const normalized = Array.from(new Set(
      snapshot.objectIds.map(id => resolveTargetId(id, snapshot.objectType))
    ));
    syncObjectParams(normalized);
    if (snapshot.objectIds.length > 0) setMode('selection');
  }), [resolveTargetId, syncObjectParams]);

  useEffect(() => {
    const handleProjectLoaded = () => {
      syncGlobalParams();
      const snapshot = getObjectSelectionSnapshot();
      const normalized = Array.from(new Set(
        snapshot.objectIds.map(id => resolveTargetId(id, snapshot.objectType))
      ));
      syncObjectParams(normalized);
    };
    window.addEventListener('project-loaded', handleProjectLoaded);
    window.addEventListener('project-state-restored', handleProjectLoaded);
    return () => {
      window.removeEventListener('project-loaded', handleProjectLoaded);
      window.removeEventListener('project-state-restored', handleProjectLoaded);
    };
  }, [resolveTargetId, syncGlobalParams, syncObjectParams]);

  const applyGlobalParams = (next: Record<string, unknown>) => {
    setGlobalParams(next);
    engine?.updateGlobalParameters(next);
  };

  const applyObjectParams = (next: Record<string, unknown>) => {
    if (!engine || targetIds.length === 0) return;
    engine.updateMultipleObjectParameters(targetIds, next);
    setObjectParams(next);
  };

  const clearObjectSettings = () => {
    if (!engine || targetIds.length === 0) return;
    engine.clearSelectedObjectParams(targetIds);
    syncObjectParams(targetIds);
  };

  const selectedLabel = selectedObjectType === 'phrase'
    ? 'フレーズ'
    : selectedObjectType === 'word'
      ? '単語'
      : selectedObjectType === 'char'
        ? '文字の親単語'
        : 'オブジェクト';

  const presetParams = mode === 'global' ? globalParams : objectParams;
  const applyPreset = mode === 'global' ? applyGlobalParams : applyObjectParams;
  const canEditPreset = mode === 'global' || targetIds.length > 0;

  return (
    <div className="panel-content scene-settings-tab">
      <div className="editor-mode-switch">
        <div className="switch-container">
          <button className={`mode-button ${mode === 'global' ? 'active' : ''}`} onClick={() => setMode('global')}>
            基本シーン設定
          </button>
          <button
            className={`mode-button ${mode === 'selection' ? 'active' : ''}`}
            onClick={() => setMode('selection')}
            disabled={targetIds.length === 0}
          >
            選択オブジェクト
          </button>
        </div>
      </div>

      {canEditPreset && (
        <TemplatePresetPanel
          templateId={FIXED_TEMPLATE_ID}
          params={presetParams}
          paramConfig={paramConfig}
          onApply={applyPreset}
        />
      )}

      {mode === 'global' && (
        <>
          <section className="params-section">
            <h3>基本シーン設定</h3>
            <p>個別プリセットがないオブジェクトへ継承されます。</p>
            <ParamEditor params={globalParams} paramConfig={paramConfig} onChange={applyGlobalParams} />
          </section>
          <PostEffectPanel engine={engine} />
        </>
      )}

      {mode === 'selection' && targetIds.length > 0 && (
        <section className="params-section selection-mode-background">
          <h3>{selectedLabel}のシーン設定</h3>
          <p>{targetIds.length}個へ設定を割り当てます。</p>
          {selectedObjectType === 'char' && <p>文字単位ではなく、選択文字を含む単語へ適用します。</p>}
          <button type="button" className="clear-params-button" onClick={clearObjectSettings}>
            個別設定を解除して親設定を継承
          </button>
          <ParamEditor params={objectParams} paramConfig={paramConfig} onChange={applyObjectParams} />
        </section>
      )}

      {mode === 'selection' && targetIds.length === 0 && (
        <div className="no-selection-message"><p>タイムラインからフレーズまたは単語を選択してください。</p></div>
      )}
    </div>
  );
};

export default SceneSettingsTab;
