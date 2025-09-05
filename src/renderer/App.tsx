import { useState, useEffect, useRef, useCallback } from 'react';
import { IAnimationTemplate } from './types/types';
import NewLayout from './components/NewLayout';
import Engine from './engine/Engine';
import { getTemplateById } from './templates/registry/templateRegistry';
import { FontService } from './services/FontService';
import { initializeLogging } from '../config/logging';
import testLyricsData from './data/longTestLyrics.json';
import { ParameterProcessor } from './utils/ParameterProcessor';
import { ParameterRegistry } from './utils/ParameterRegistry';
import './App.css';

// Initialize logging configuration
initializeLogging();

// デバッグ情報の型定義
interface DebugInfo {
  previewCenter?: { x: number, y: number };
  phrasePosition?: { x: number, y: number };
  redRectGlobal?: { x: number, y: number };
  redRectLocal?: { x: number, y: number };
  wordRectGlobal?: { x: number, y: number };
  wordRectLocal?: { x: number, y: number };
  wordId?: string;
  wordText?: string;
  charRectGlobal?: { x: number, y: number };
  charRectLocal?: { x: number, y: number };
  charId?: string;
  charText?: string;
  lastUpdated?: number;
}

// タイミングデバッグ情報の型定義
interface TimingDebugInfo {
  currentTime?: number;
  activePhrase?: {
    id?: string;
    inTime?: number;
    outTime?: number;
    isVisible?: boolean;
    state?: string;
  }[];
  activeWord?: {
    id?: string;
    inTime?: number;
    outTime?: number;
    isVisible?: boolean;
    state?: string;
  }[];
}

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60000); // デフォルト60秒（エンジンから実際の値を取得する）
  const [selectedTemplate, setSelectedTemplate] = useState('glitchtextprimitive'); // テンプレート選択状態
  const [engineReady, setEngineReady] = useState(false); // エンジン初期化状態を追加
  const [fontServiceReady, setFontServiceReady] = useState(false); // FontService初期化状態を追加
  const [currentTemplate, setCurrentTemplate] = useState<IAnimationTemplate | null>(null); // 現在のテンプレートを状態として保持
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null); // 読み込み済みテンプレートIDを追跡
  const loadedTemplateIdRef = useRef<string | null>(null); // イベントハンドラーでの参照用
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({});
  const [timingDebugInfo, setTimingDebugInfo] = useState<TimingDebugInfo>({});// タイミングデバッグ情報

  const engineRef = useRef<Engine | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  
  // Electron APIの状態を確認
  useEffect(() => {
  }, []);

  // デバッグ情報を受け取るカスタムイベントリスナー
  useEffect(() => {
    const setupTimestamp = Date.now();
    
    // カスタムイベントのリスナーを設定
    const handleDebugInfo = (event: CustomEvent) => {
      // 新しいデータ形式を確認
      if (event.detail) {
        // timestampを除外して無限ループを防ぐ
        const { timestamp, ...eventData } = event.detail;
        setDebugInfo(prevInfo => ({
          ...prevInfo,
          ...eventData
        }));
      }
    };
    
    // 単語レベルのデバッグ情報リスナー
    const handleWordDebugInfo = (event: CustomEvent) => {
      // 単語始め固有のデバッグ情報を更新
      if (event.detail.wordRectGlobal) {
        setDebugInfo(prevInfo => ({
          ...prevInfo,
          wordRectGlobal: event.detail.wordRectGlobal,
          wordRectLocal: event.detail.wordRectLocal,
          wordId: event.detail.wordId,
          wordText: event.detail.wordText,
          lastUpdated: Date.now()
        }));
      }
    };
    
    // タイミングデバッグ情報リスナー
    const handleTimingDebugInfo = (event: CustomEvent) => {
      setTimingDebugInfo(event.detail);
    };

    // タイムライン更新イベントのリスナー（歌詞データ読み込み後の持続時間更新用）
    const handleTimelineUpdated = (event: CustomEvent) => {
      if (event.detail && event.detail.duration) {
        setTotalDuration(event.detail.duration);
      }
    };
    
    // 波形シークイベントのリスナー
    const handleWaveformSeek = (event: CustomEvent) => {
      if (event.detail && event.detail.currentTime !== undefined) {
        const seekTime = event.detail.currentTime;
        // 共通のhandleSeek関数を使用してエンジンと状態の完全同期を実現
        handleSeek(seekTime);
      }
    };
    
    // エンジンシークイベントのリスナー
    const handleEngineSeek = (event: CustomEvent) => {
      if (event.detail && event.detail.currentTime !== undefined) {
        setCurrentTime(event.detail.currentTime);
      }
    };
    
    // タイムライン終了イベントのリスナー
    const handleTimelineEnded = (event: CustomEvent) => {
      // クロージャ問題を回避するため、isPlayingをチェックせずに常に停止状態に設定
      setIsPlaying(false);
    };
    
    // 音声終了イベントのリスナー
    const handleAudioEnded = (event: CustomEvent) => {
      // クロージャ問題を回避するため、isPlayingをチェックせずに常に停止状態に設定
      setIsPlaying(false);
    };
    
    // キーボードショートカットのハンドラ
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z: Undo
      if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (engineRef.current) {
          const success = engineRef.current.undo();
          if (success) {
          } else {
          }
        }
      }
      // Ctrl+Shift+Z または Ctrl+Y: Redo
      else if ((event.ctrlKey && event.shiftKey && event.key === 'Z') || 
               (event.ctrlKey && event.key === 'y')) {
        event.preventDefault();
        if (engineRef.current) {
          const success = engineRef.current.redo();
          if (success) {
          } else {
          }
        }
      }
      // 開発用ショートカット (Ctrl+Shift+T でパラメータテスト実行)
      else if (process.env.NODE_ENV === 'development' && event.ctrlKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        if ((window as any).__PARAMETER_TEST__) {
          (window as any).__PARAMETER_TEST__();
        }
      }
    };

    // テンプレートレジストリ変更イベントのリスナー
    const handleTemplateRegistryChanged = async () => {
      console.log('テンプレートレジストリが変更されました。プロジェクトの状態を保持して再初期化します。');
      
      if (engineRef.current) {
        // 現在のプロジェクト状態を保存
        const projectStateManager = engineRef.current.getProjectStateManager();
        const currentState = projectStateManager?.exportFullState();
        
        // テンプレート割り当て情報を取得
        const templateAssignments = engineRef.current.getTemplateManager()?.exportAssignments();
        
        // 簡易的な再初期化のため、少し待機してから状態を復元
        setTimeout(() => {
          if (engineRef.current && currentState) {
            // プロジェクト状態を復元
            projectStateManager?.importState(currentState);
            
            // テンプレート割り当てを復元
            if (templateAssignments) {
              const templateManager = engineRef.current.getTemplateManager();
              if (templateManager) {
                // 各フレーズのテンプレート割り当てを復元
                Object.entries(templateAssignments).forEach(([phraseId, templateId]) => {
                  if (templateId && templateId !== templateManager.getDefaultTemplateId()) {
                    templateManager.assignTemplateToPhrase(phraseId, templateId);
                  }
                });
              }
            }
            
            // インスタンスの再生成をトリガー
            engineRef.current.forceRecreateInstances();
            
            console.log('プロジェクトの状態を復元しました。');
          }
        }, 100);
      }
    };

    // イベントリスナーを追加
    window.addEventListener('debug-info-updated', handleDebugInfo as EventListener);
    window.addEventListener('word-debug-info-updated', handleWordDebugInfo as EventListener);
    window.addEventListener('timing-debug-info-updated', handleTimingDebugInfo as EventListener);
    window.addEventListener('timeline-updated', handleTimelineUpdated as EventListener);
    window.addEventListener('waveform-seek', handleWaveformSeek as EventListener);
    window.addEventListener('engine-seeked', handleEngineSeek as EventListener);
    window.addEventListener('timeline-ended', handleTimelineEnded as EventListener);
    window.addEventListener('audio-ended', handleAudioEnded as EventListener);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('templateRegistryChanged', handleTemplateRegistryChanged as EventListener);

    // クリーンアップ
    return () => {
      window.removeEventListener('debug-info-updated', handleDebugInfo as EventListener);
      window.removeEventListener('word-debug-info-updated', handleWordDebugInfo as EventListener);
      window.removeEventListener('timing-debug-info-updated', handleTimingDebugInfo as EventListener);
      window.removeEventListener('timeline-updated', handleTimelineUpdated as EventListener);
      window.removeEventListener('waveform-seek', handleWaveformSeek as EventListener);
      window.removeEventListener('engine-seeked', handleEngineSeek as EventListener);
      window.removeEventListener('timeline-ended', handleTimelineEnded as EventListener);
      window.removeEventListener('audio-ended', handleAudioEnded as EventListener);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('templateRegistryChanged', handleTemplateRegistryChanged as EventListener);
    };
  }, []); // 一度だけ登録し、イベントハンドラ内で最新のstateを参照する方式に変更



  // コンポーネントのアンマウント時にクリーンアップするための効果
  useEffect(() => {
    return () => {
      
      // requestAnimationFrameをキャンセル
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      cleanupEngine();
    };
  }, []);

  // FontServiceの初期化（アプリケーション起動時に一度だけ）
  useEffect(() => {
    
    const initializeFontService = async () => {
      try {
        await FontService.initialize();
        setFontServiceReady(true);
      } catch (error) {
        console.error("FontService初期化エラー:", error);
        // エラーが発生してもアプリケーションは動作させる
        setFontServiceReady(true);
      }
    };
    
    initializeFontService();
  }, []); // 一度だけ実行
  
  // 復元ダイアログを廃止し、Engine側で自動復元を実行
  // 復元関連のイベントリスナーは不要になりました

  // 初回のエンジン初期化（1回のみ）
  useEffect(() => {
    
    // FontServiceの初期化を待ってからエンジンを初期化
    if (!fontServiceReady) {
      return;
    }
    
    // 初回のみエンジンを初期化
    if (!engineRef.current) {
      setEngineReady(false);
      
      // canvasContainer要素が存在することを確認してからエンジンを初期化
      // setTimeout で DOM 更新後に実行することを保証
      setTimeout(() => {
        try {
          const canvasElement = document.getElementById('canvasContainer');
          if (canvasElement) {
            initEngine();
          } else {
            console.error("canvasContainer要素が見つかりません。エンジン初期化をスキップします。");
            // エラー状態を通知
            setEngineReady(false);
          }
        } catch (error) {
          console.error("エンジン初期化エラー:", error);
          setEngineReady(false);
        }
      }, 100); // 100msの遅延を設定
    }
  }, [fontServiceReady]); // FontService初期化完了後に実行
  
  // テンプレート変更の処理（エンジンを再初期化せずテンプレートのみ変更）
  useEffect(() => {
      // 初回の場合はスキップ（上記のuseEffectで初期化される）
      if (!engineRef.current || !engineReady) {
        return;
      }
      
      // 既に同じテンプレートが読み込み済みの場合は処理をスキップ（重複防止）
      if (loadedTemplateId === selectedTemplate) {
        console.log(`[App] Template loading skipped: ${selectedTemplate} already loaded`);
        return;
      }
      
      try {
      // テンプレートレジストリから動的にテンプレートを取得
      console.log(`[App] Loading template: ${selectedTemplate} (current loaded: ${loadedTemplateId})`);
      const template = getTemplateById(selectedTemplate);
      if (!template) {
        console.error(`Template not found: ${selectedTemplate}`);
        return;
      }
      console.log(`[App] Template loaded successfully: ${selectedTemplate}`, template);
      
      
      // 既存のパラメータを取得し、不足分をデフォルト値で補完
      let existingParams = engineRef.current.parameterManager 
        ? engineRef.current.parameterManager.getGlobalDefaults() 
        : {};
      
      // 配列チェック（防御的プログラミング）
      if (Array.isArray(existingParams)) {
        console.error('[App] existingParams is an array, converting to empty object');
        existingParams = {};
      }
      
      // パラメータレジストリからデフォルトパラメータを取得
      const registry = ParameterRegistry.getInstance();
      
      // 標準パラメータとテンプレート固有パラメータを組み合わせ
      const standardParams: Record<string, any> = {};
      const templateParams: Record<string, any> = {};
      
      const allParams = registry.getAllParameters();
      allParams.forEach((definition, name) => {
        if (definition.category === 'standard') {
          standardParams[name] = definition.defaultValue;
        } else if (definition.category === 'template-specific' && definition.templateId === selectedTemplate) {
          templateParams[name] = definition.defaultValue;
        }
      });
      
      const defaultParams = { ...standardParams, ...templateParams };
      
      // 既存のパラメータを正規化し、安全にマージ
      const normalizedExistingParams = ParameterProcessor.normalizeToParameterObject(existingParams);
      const mergedParams = ParameterProcessor.mergeParameterObjects(defaultParams, normalizedExistingParams);
      
      // エンジンのテンプレートを変更（歌詞データを保持）
      const success = engineRef.current.changeTemplate(template, mergedParams, selectedTemplate);
      if (success) {
        setCurrentTemplate(template);
        setLoadedTemplateId(selectedTemplate); // 読み込み済みIDを更新
        loadedTemplateIdRef.current = selectedTemplate; // refも更新
      } else {
        console.error("テンプレート変更に失敗しました");
        }
    } catch (error) {
      console.error("テンプレート変更エラー:", error);
    }
  }, [selectedTemplate, engineReady]); // テンプレート変更時とエンジン準備完了時に実行

  // プロジェクトロード時のイベントリスナー
  useEffect(() => {
    const handleProjectLoaded = (event: CustomEvent) => {
      const { globalTemplateId } = event.detail;
      if (globalTemplateId && globalTemplateId !== loadedTemplateIdRef.current) {
        console.log(`[App] Event: project-loaded, switching from ${loadedTemplateIdRef.current} to template: ${globalTemplateId}`);
        setSelectedTemplate(globalTemplateId);
      } else {
        console.log(`[App] Event: project-loaded ignored - same template: ${globalTemplateId} (current: ${loadedTemplateIdRef.current})`);
      }
    };

    const handleTemplateLoaded = (event: CustomEvent) => {
      const { templateId } = event.detail;
      if (templateId && templateId !== loadedTemplateIdRef.current) {
        console.log(`[App] Event: template-loaded, switching from ${loadedTemplateIdRef.current} to template: ${templateId}`);
        setSelectedTemplate(templateId);
      } else {
        console.log(`[App] Event: template-loaded ignored - same template: ${templateId} (current: ${loadedTemplateIdRef.current})`);
      }
    };

    const handleAutoRestoreTemplateUpdated = (event: CustomEvent) => {
      const { templateId } = event.detail;
      if (templateId && templateId !== loadedTemplateIdRef.current) {
        console.log(`[App] Event: auto-restore-template-updated, switching from ${loadedTemplateIdRef.current} to template: ${templateId}`);
        setSelectedTemplate(templateId);
      } else {
        console.log(`[App] Event: auto-restore-template-updated ignored - same template: ${templateId} (current: ${loadedTemplateIdRef.current})`);
      }
    };

    const handleTemplateFallbackApplied = (event: CustomEvent) => {
      const { originalTemplateId, fallbackTemplateId, availableTemplates } = event.detail;
      console.warn(`[App] Template fallback applied: ${originalTemplateId} → ${fallbackTemplateId}`);
      console.log(`[App] Available templates: ${availableTemplates.join(', ')}`);
      
      // フォールバックテンプレートに切り替え
      if (fallbackTemplateId && fallbackTemplateId !== loadedTemplateIdRef.current) {
        setSelectedTemplate(fallbackTemplateId);
      }
    };

    window.addEventListener('project-loaded', handleProjectLoaded as EventListener);
    window.addEventListener('template-loaded', handleTemplateLoaded as EventListener);
    window.addEventListener('auto-restore-template-updated', handleAutoRestoreTemplateUpdated as EventListener);
    window.addEventListener('template-fallback-applied', handleTemplateFallbackApplied as EventListener);

    return () => {
      window.removeEventListener('project-loaded', handleProjectLoaded as EventListener);
      window.removeEventListener('template-loaded', handleTemplateLoaded as EventListener);
      window.removeEventListener('auto-restore-template-updated', handleAutoRestoreTemplateUpdated as EventListener);
      window.removeEventListener('template-fallback-applied', handleTemplateFallbackApplied as EventListener);
    };
  }, []); // 依存配列を空にしてマウント時のみ実行

  // エンジンのクリーンアップ
  const cleanupEngine = () => {
    // アニメーションフレームをキャンセル
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // エンジンを破棄
    if (engineRef.current) {
      try {
        engineRef.current.destroy();
        engineRef.current = null;
      } catch (error) {
        console.error("Engine cleanup error:", error);
      }
    }
  };

  // エンジン初期化
  const initEngine = async () => {
    try {
      // テンプレートレジストリから動的にテンプレートを取得
      let template = getTemplateById(selectedTemplate);
      let actualTemplateId = selectedTemplate;
      
      if (!template) {
        console.error(`Template not found: ${selectedTemplate}`);
        
        // フォールバック: 最初に登録されているテンプレートを使用
        const { getFirstTemplateId, getAvailableTemplateIds } = await import('./templates/registry/templateRegistry');
        const fallbackTemplateId = getFirstTemplateId();
        
        if (fallbackTemplateId) {
          template = getTemplateById(fallbackTemplateId);
          actualTemplateId = fallbackTemplateId;
          console.log(`[App] Using fallback template: ${fallbackTemplateId}`);
          setSelectedTemplate(fallbackTemplateId);
        } else {
          console.error('No templates available in registry');
          setEngineReady(false);
          return;
        }
      }
      
      if (!template) {
        console.error('Failed to load fallback template');
        setEngineReady(false);
        return;
      }
      
      // テンプレートの検証
      if (typeof template.getParameterConfig !== 'function') {
        console.error(`Invalid template: ${selectedTemplate} must implement getParameterConfig() method`);
        setEngineReady(false);
        return;
      }
      
      // テンプレートのパラメータ設定からデフォルトパラメータを取得
      // システムデフォルト値（Arial, フォントサイズ120, オレンジ色）をベースにする
      const systemDefaults = {
        fontSize: 120,
        fontFamily: 'Arial',
        textColor: '#FFA500', // オレンジ色 - 統一パラメータ名使用
        activeTextColor: '#FFA500', // オレンジ色
        completedTextColor: '#FFA500' // オレンジ色
      };
      
      const params = { ...systemDefaults };
      const paramConfig = template.getParameterConfig();
      paramConfig.forEach((param) => {
        // システムデフォルト値がある場合はそれを優先、ない場合はテンプレートのデフォルト値を使用
        if (systemDefaults[param.name] === undefined) {
          params[param.name] = param.default;
        }
      });
      
      setCurrentTemplate(template);
      
      // canvasContainer要素の再確認
      const canvasElement = document.getElementById('canvasContainer');
      if (!canvasElement) {
        console.error('initEngine: canvasContainer要素が見つかりません');
        setEngineReady(false);
        return;
      }
      
      const engineInitTimestamp = Date.now();
      
      // PIXIエンジンの初期化（実際に使用するテンプレートIDを渡す）
      const engine = new Engine('canvasContainer', template, params, actualTemplateId);
      
      // エンジンインスタンスを保存（自動保存チェックの前に設定）
      engineRef.current = engine;
      
      // 開発用：グローバルアクセスのためにエンジンを設定
      if (process.env.NODE_ENV === 'development') {
        (window as any).__ENGINE__ = engine;
        (window as any).__PARAMETER_TEST__ = () => {
          // 動的にテストプログラムをインポートして実行
          import('./engine/__tests__/ParameterConsistencyTest').then(({ runParameterTest }) => {
            runParameterTest(
              engine.parameterManagerV2,
              engine.templateManager,
              engine.instanceManager,
              'phrase_1751341417869_k7b01lewz'
            );
          }).catch(error => {
            console.error('パラメータテストの実行に失敗しました:', error);
          });
        };
      }
      
      // 注意：テスト歌詞のロードはしない
      // Engine初期化時にcheckAndPromptAutoRestore()が呼ばれ、
      // 自動保存データがある場合は復元ダイアログが表示される
      // 自動保存データがない場合や復元しない場合は、ユーザーが手動で歌詞をロードする

      // エンジンから実際の持続時間を取得
      const { duration: engineDuration } = engine.getTimelineData();
      setTotalDuration(engineDuration);
      
      // デバッグ機能を有効化
      engine.setDebugEnabled(true);
      
      // 初期表示
      engine.seek(0);
      
      // 状態をリセット
      setIsPlaying(false);
      setCurrentTime(0);
      
      // 現在のテンプレートを設定
      setCurrentTemplate(template);
      setLoadedTemplateId(actualTemplateId); // 初期化時にも読み込み済みIDを設定
      loadedTemplateIdRef.current = actualTemplateId; // refも更新
      
      // エンジン初期化完了をマーク
      setEngineReady(true);
      
      // updateFrameループを開始
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateFrame);
      }

      // デバッグ情報の初期化
      setTimeout(() => {
        // エンジンのプレビューエリアサイズを取得
        if (engine.app && engine.app.renderer) {
          const screenWidth = engine.app.screen.width;
          const screenHeight = engine.app.screen.height;
          const centerX = screenWidth / 2;
          const centerY = screenHeight / 2;
          
            setDebugInfo({
              previewCenter: { x: centerX, y: centerY },
              phrasePosition: { x: centerX, y: centerY },
              redRectGlobal: { x: centerX, y: centerY },
              redRectLocal: { x: 0, y: 0 },
              wordRectGlobal: { x: centerX, y: centerY },
              wordRectLocal: { x: 0, y: 0 },
              wordId: 'phrase_1_word_0',
              wordText: '初期化時',
              lastUpdated: Date.now()
            });
            
            // 強制的にグローバル空間に単語情報デバッグデータを追加
            (window as any).wordMarkerDebugInfo = {
              wordId: 'phrase_1_word_0',
              wordText: '初期化時',
              globalPos: { x: centerX, y: centerY },
              timestamp: Date.now()
            };
            
            // 初期化後に強制的にデバッグ情報を更新
            const event = new CustomEvent('debug-info-updated', { 
              detail: {
                previewCenter: { x: centerX, y: centerY },
                phrasePosition: { x: centerX, y: centerY },
                redRectGlobal: { x: centerX, y: centerY },
                redRectLocal: { x: 0, y: 0 },
                wordRectGlobal: { x: centerX, y: centerY },
                wordRectLocal: { x: 0, y: 0 },
                wordId: 'phrase_1_word_0',
                wordText: '初期化時',
                timestamp: Date.now()
              }
            });
          window.dispatchEvent(event);
        }
      }, 100);
    } catch (error) {
      console.error("エンジン初期化エラー:", error);
      setEngineReady(false);
    }
  };

  // アニメーションフレーム更新処理
  const updateFrame = useCallback(() => {
    if (engineRef.current) {
      const currentEngineTime = engineRef.current.currentTime;
      
      // フレームカウントを増やし、30フレームに1回だけ状態を更新（約30FPSで更新）
      frameCountRef.current++;
      
      if (frameCountRef.current % 2 === 0 || Math.abs(currentEngineTime - lastTimeRef.current) > 100) {
        // 2フレームに1回、または100ms以上の差がある場合のみ更新
        setCurrentTime(prevTime => {
          // 値が変わらない場合は更新をスキップ
          if (Math.abs(prevTime - currentEngineTime) < 10) {
            return prevTime;
          }
          return currentEngineTime;
        });
        lastTimeRef.current = currentEngineTime;
      }
      
      // 注意: Engine側で終了時刻チェックが実装されたため、
      // ここでの終了チェックは削除（無限ループの原因を除去）
    }
    
    // 常に次のフレームをリクエスト
    animationFrameRef.current = requestAnimationFrame(updateFrame);
  }, []); // 依存配列を空にして、ref経由で値を参照

  // 再生ハンドラ
  const handlePlay = () => {
    if (engineRef.current) {
      engineRef.current.play();
      setIsPlaying(true);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(updateFrame);
    }
  };

  // 一時停止ハンドラ
  const handlePause = () => {
    if (engineRef.current) {
      engineRef.current.pause();
      setIsPlaying(false);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  };

  // リセットハンドラ
  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.reset();
      setCurrentTime(0);
    }
  };

  // シークハンドラ
  const handleSeek = (value: number) => {
    const handleSeekTimestamp = Date.now();
    
    if (engineRef.current) {
      engineRef.current.seek(value);
      
      setCurrentTime(value);
      
      // シーク後に強制的にデバッグ情報を更新
      setTimeout(() => {
        if (engineRef.current && engineRef.current.app) {
          const centerX = engineRef.current.app.screen.width / 2;
          const centerY = engineRef.current.app.screen.height / 2;
          
          const event = new CustomEvent('debug-info-updated', { 
            detail: {
              previewCenter: { x: centerX, y: centerY },
              phrasePosition: { x: centerX, y: centerY },
              redRectGlobal: { x: centerX, y: centerY },
              redRectLocal: { x: 0, y: 0 },
              wordRectGlobal: { x: centerX, y: centerY },
              wordRectLocal: { x: 0, y: 0 },
              wordId: 'phrase_1_word_0',
              wordText: 'シーク後',
              timestamp: Date.now()
            }
          });
          window.dispatchEvent(event);
        }
      }, 50); // シーク処理の後に実行
    } else {
      console.warn(`[${handleSeekTimestamp}] App.tsx: engineRef.currentがnullのためシークをスキップします`);
    }
  };

  // テンプレート変更ハンドラ（再生を停止ぜずテンプレートのみ変更）
  const handleTemplateChange = (template: string) => {
    // 再生中でも停止せず、テンプレートのみ変更
    setSelectedTemplate(template);
  };

  return (
    <div className="app-container">
      {/* 常に NewLayout をレンダリングし、canvasContainer を確保する */}
      <NewLayout
        onPlay={handlePlay}
        onPause={handlePause}
        onReset={handleReset}
        onSeek={handleSeek}
        onTemplateChange={handleTemplateChange}
        isPlaying={isPlaying}
        currentTime={currentTime}
        totalDuration={totalDuration}
        selectedTemplate={selectedTemplate}
        engine={engineReady ? engineRef.current : undefined}
        template={engineReady ? currentTemplate : undefined}
        debugInfo={debugInfo}
        timingDebugInfo={timingDebugInfo}
      />

      {/* エンジン初期化中はローディングオーバーレイを表示 */}
      {!engineReady && (
        <div className="loading-overlay">
          <div className="loading-container">
            <p>エンジン初期化中...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
