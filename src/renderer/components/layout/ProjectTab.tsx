import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Engine } from '../../engine/Engine';
import { ProjectFileManager } from '../../services/ProjectFileManager';
import { hasUnsavedChanges } from '../../services/ProjectDirtyTracker';
import { DebugEventBus } from '../../utils/DebugEventBus';
import { Button, Section, StatusMessage } from '../common';
import './ProjectTab.css';
import { getProjectSaveSnapshot, subscribeProjectSaveStatus } from '../../services/ProjectSaveStatus';

interface ProjectTabProps {
  engine: Engine;
}

/**
 * プロジェクトタブ: 保存・別名保存・読み込みと保存状態の表示。
 * Ctrl/Cmd+O や音声ファイル要求の受け付けを常に有効にするため、タブ切替でアンマウントしない。
 */
const ProjectTab: React.FC<ProjectTabProps> = ({ engine }) => {
  // 保存・読み込み関連の状態
  const [lastSaved, setLastSaved] = useState<string>(() => {
    const snapshot = getProjectSaveSnapshot();
    return snapshot ? new Date(snapshot.savedAt).toLocaleString('ja-JP') : '';
  });
  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // プロジェクトタブはタブ切替でアンマウントせず、エンジン準備前から表示されるため、
  // 起動時の engine（未設定）を保持し続けないよう engine ごとに作り直す。
  const projectFileManager = useMemo(
    () => (engine ? new ProjectFileManager(engine) : null),
    [engine]
  );
  const requireProjectFileManager = useCallback((): ProjectFileManager => {
    if (!projectFileManager) throw new Error('エンジンの準備が完了していません');
    return projectFileManager;
  }, [projectFileManager]);

  // 未保存の変更の表示。保存内容の比較は軽くないため、一定間隔と基準更新時にだけ判定する。
  const [hasUnsaved, setHasUnsaved] = useState(false);
  useEffect(() => {
    if (!projectFileManager) return;
    const refresh = () => setHasUnsaved(hasUnsavedChanges(() => projectFileManager.getContentFingerprint()));
    refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('project-dirty-state-changed', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('project-dirty-state-changed', refresh);
    };
  }, [projectFileManager]);

  useEffect(() => subscribeProjectSaveStatus(snapshot => {
    setLastSaved(snapshot ? new Date(snapshot.savedAt).toLocaleString('ja-JP') : '');
  }), []);

  // ステータス表示の更新
  const showStatus = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setStatus(message);
    setStatusType(type);
    
    setTimeout(() => {
      setStatus('');
    }, 3000);
  }, []);

  // プロジェクト保存
  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      const savedPath = await requireProjectFileManager().saveProject('project');
      setLastSaved(new Date().toLocaleString('ja-JP'));
      showStatus(`プロジェクトを保存しました: ${savedPath}`, 'success');
    } catch (error) {
      console.error('Save error:', error);
      showStatus(`保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showStatus, requireProjectFileManager]);

  const handleSaveAs = useCallback(async () => {
    setIsLoading(true);
    try {
      const savedPath = await requireProjectFileManager().saveProject('project', true);
      setLastSaved(new Date().toLocaleString('ja-JP'));
      showStatus(`別名で保存しました: ${savedPath}`, 'success');
    } catch (error) {
      console.error('Save as error:', error);
      showStatus(`別名保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showStatus, requireProjectFileManager]);

  // プロジェクト読み込み
  const handleOpen = useCallback(async () => {
    setIsLoading(true);
    try {
      await requireProjectFileManager().loadProject();
      showStatus('プロジェクトを読み込みました', 'success');
    } catch (error) {
      console.error('Load error:', error);
      showStatus(`読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showStatus, requireProjectFileManager]);

  // オーディオファイルパスリクエストのハンドリング
  useEffect(() => {
    const handleRequestAudioFile = async () => {
      try {
        const audioFilePath = engine.getAudioFilePath();
        if (audioFilePath) {
          DebugEventBus.emit('audio-file-response', audioFilePath);
        } else {
          throw new Error('音声ファイルが設定されていません');
        }
      } catch (error) {
        console.error('Audio file request error:', error);
        showStatus('音声ファイルの取得に失敗しました', 'error');
      }
    };

    DebugEventBus.on('request-audio-file', handleRequestAudioFile);

    return () => {
      DebugEventBus.off('request-audio-file', handleRequestAudioFile);
    };
  }, [engine, showStatus]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleOpen]);

  return (
    <div className="project-tab panel-content">
      {/* プロジェクト管理セクション */}
      <Section title="プロジェクト管理">
        <div className="project-actions">
          <Button
            variant="primary"
            className="project-actions-main"
            onClick={handleSave}
            disabled={isLoading}
          >
            保存 (Ctrl+S)
          </Button>
          <Button
            variant="secondary"
            onClick={handleSaveAs}
            disabled={isLoading}
          >
            別名で保存 (Ctrl+Shift+S)
          </Button>
          <Button
            variant="secondary"
            onClick={handleOpen}
            disabled={isLoading}
          >
            読み込み (Ctrl+O)
          </Button>
        </div>

        <div className="project-info">
          <div className="info-item">
            <span className="label">最終保存:</span>
            <span className="value">{lastSaved || '未保存'}</span>
          </div>
          {hasUnsaved && (
            <div className="info-item unsaved-indicator">● 未保存の変更があります</div>
          )}
        </div>

        {/* ステータス表示エリア */}
        <div className="status-container">
          {status && (
            <StatusMessage 
              type={statusType} 
              message={status}
              onClose={() => setStatus('')}
            />
          )}

          {isLoading && (
            <div className="loading">
              処理中...
            </div>
          )}
        </div>
      </Section>

    </div>
  );
};

export default ProjectTab;
