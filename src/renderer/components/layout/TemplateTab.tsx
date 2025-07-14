import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAllTemplates, getTemplateById } from '../../templates/registry/templateRegistry';
import TemplateSelector from '../TemplatePanel/TemplateSelector';
import ParamEditor from '../ParamEditor/ParamEditor';
import Engine from '../../engine/Engine';
import { IAnimationTemplate } from '../../types/types';
import '../../styles/TemplateTab.css';

interface TemplateTabProps {
  selectedTemplate: string;
  onTemplateChange: (templateId: string) => void;
  engine?: Engine; // Engineインスタンスを受け取る
  template?: IAnimationTemplate; // 現在のテンプレート
}

// 設定モード
type EditorMode = 'global' | 'selection';

const TemplateTab: React.FC<TemplateTabProps> = ({
  selectedTemplate,
  onTemplateChange,
  engine,
  template
}) => {
  // テンプレート一覧を取得
  const templateList = getAllTemplates();
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [selectedObjectType, setSelectedObjectType] = useState<string>('');
  const [objectParams, setObjectParams] = useState<Record<string, any>>({});
  
  // 統合された状態管理
  const [state, setState] = useState({
    editorMode: 'global' as EditorMode,
    selectionTemplateMap: new Map<string, string>(),
    hasMixedTemplates: false,
    selectedPhraseTemplateId: 'fadeslidetext',
    selectedWordTemplateId: 'fadeslidetext', 
    selectedCharTemplateId: 'fadeslidetext',
    globalParams: {} as Record<string, any>,
    hasParamsChanged: false,
    useIndividualSettings: false // 個別設定使用フラグ
  });

  // 状態更新ヘルパー関数
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  
  // 前回のパラメータを記録するRef
  const prevParamsRef = useRef<Record<string, any>>({});
  
  // onTemplateChangeをメモ化
  const memoizedOnTemplateChange = useCallback(onTemplateChange, []);
  
  // タブフォーカス時に現在のエンジン状態を同期する関数
  const syncWithEngineState = useCallback(() => {
    if (!engine) return;
    
    // 現在のグローバルテンプレートIDをエンジンから取得して同期
    const currentTemplateId = engine.getTemplateManager().getDefaultTemplateId();
    if (currentTemplateId !== selectedTemplate) {
      // 親コンポーネントのselectedTemplateを更新
      memoizedOnTemplateChange(currentTemplateId);
    }
    
    // 現在のグローバルパラメータを読み込んで表示（V2専用）
    if (engine.parameterManager) {
      // V2モード: グローバルデフォルトを取得
      const currentParams = engine.parameterManager.getGlobalDefaults();
      
      // パラメータが実際に変更された場合のみ更新
      const paramsChanged = JSON.stringify(currentParams) !== JSON.stringify(prevParamsRef.current);
      if (paramsChanged) {
        prevParamsRef.current = currentParams;
        updateState({ globalParams: currentParams });
      }
    }
  }, [engine, selectedTemplate, memoizedOnTemplateChange]);
  
  // テンプレートタブが表示された時に現在のエンジン状態を同期
  useEffect(() => {
    // 初回マウント時と依存関係変更時に同期
    syncWithEngineState();
  }, [syncWithEngineState]);
  
  // タブがフォーカスされた時にも同期（手動で呼び出し可能にする）
  useEffect(() => {
    // タブ切り替えを検知するためのカスタムイベントリスナー
    const handleTabFocus = () => {
      syncWithEngineState();
    };
    
    // カスタムイベントまたはMutationObserverでタブの表示を検知することも可能
    window.addEventListener('template-tab-focused', handleTabFocus);
    
    // プロジェクトロード時にも同期
    const handleProjectLoaded = () => {
      // 少し遅延を入れてエンジンの状態が完全に更新されるのを待つ
      setTimeout(() => {
        syncWithEngineState();
        
        // 個別設定状態の同期を追加（V2対応）
        if (engine && selectedObjectIds.length > 0) {
          let hasIndividualSettings = false;
          
          if (engine.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
            // V2モード: 個別設定が有効かチェック
            hasIndividualSettings = selectedObjectIds.some(id =>
              engine.parameterManagerV2.isIndividualSettingEnabled(id)
            );
          } else {
            // V1モード: 従来の方法（現在はV2のみのため使用されない）
            hasIndividualSettings = selectedObjectIds.some(id =>
              engine.parameterManager?.isIndividualSettingEnabled?.(id) || false
            );
          }
          
          updateState({ useIndividualSettings: hasIndividualSettings });
        }
      }, 100);
    };
    window.addEventListener('project-loaded', handleProjectLoaded);
    
    return () => {
      window.removeEventListener('template-tab-focused', handleTabFocus);
      window.removeEventListener('project-loaded', handleProjectLoaded);
    };
  }, [syncWithEngineState]);
  
  // 選択されたオブジェクトの情報を更新（別のuseEffect）
  useEffect(() => {
    if (!engine || !engine.templateManager || selectedObjectIds.length === 0) return;
    
    const assignments = engine.templateManager.getAssignments();
    const templateMap = new Map<string, string>();
    let commonTemplateId: string | null = null;
    let hasDifferentTemplates = false;
    
    selectedObjectIds.forEach(id => {
      if (assignments.has(id)) {
        const templateId = assignments.get(id)!;
        templateMap.set(id, templateId);
        
        if (commonTemplateId === null) {
          commonTemplateId = templateId;
        } else if (commonTemplateId !== templateId) {
          hasDifferentTemplates = true;
        }
      }
    });
    
    updateState({ 
      selectionTemplateMap: templateMap,
      hasMixedTemplates: hasDifferentTemplates
    });
    
    // 共通のテンプレートIDがある場合は選択状態を更新
    if (commonTemplateId && !hasDifferentTemplates) {
      updateSelectedTemplateId(selectedObjectType, commonTemplateId);
    }
    
    // 選択されたオブジェクトの個別設定状態をチェック（V2対応）
    if (engine && selectedObjectIds.length > 0) {
      let hasIndividualSettings = false;
      
      if (engine.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
        // V2モード: 個別設定が有効かチェック
        hasIndividualSettings = selectedObjectIds.some(id =>
          engine.parameterManagerV2.isIndividualSettingEnabled(id)
        );
      } else {
        // V1モード: 従来の方法（現在はV2のみのため使用されない）
        hasIndividualSettings = selectedObjectIds.some(id =>
          engine.parameterManager?.isIndividualSettingEnabled?.(id) || false
        );
      }
      
      // UI状態を実際の状態に同期
      if (hasIndividualSettings !== state.useIndividualSettings) {
        updateState({ useIndividualSettings: hasIndividualSettings });
      }
    }
  }, [selectedObjectIds, selectedObjectType, engine, updateState]);
  
  // TemplateManagerのセットアップ
  useEffect(() => {
    if (engine && template) {
      // すべてのテンプレートをEngineのTemplateManagerに登録
      registerAllTemplates();
      
      // 初回マウント時のみグローバルパラメータを取得
      // （既存のパラメータを上書きしないため）
      if (engine.parameterManager && Object.keys(state.globalParams).length === 0) {
        updateState({ globalParams: engine.parameterManager.getGlobalDefaults() });
      }
    }
  }, [engine]); // templateの変更では再実行しない
  
  // プロジェクト読み込み時のテンプレート更新を受け取る
  useEffect(() => {
    const handleTemplateLoaded = (event: CustomEvent) => {
      const { templateId, params } = event.detail;
      
      // テンプレートIDを更新
      if (templateId) {
        memoizedOnTemplateChange(templateId);
      }
      
      // パラメータを更新
      if (params) {
        updateState({ globalParams: params });
      }
    };
    
    // プロジェクトロード完了イベントを受け取ってUI初期化を実行
    const handleProjectLoaded = () => {
      
      // 少し遅延を入れてからUI初期化（エンジンの状態が完全に更新されるのを待つ）
      setTimeout(() => {
        if (!engine) return;
        
        // グローバルテンプレートの取得と反映
        const currentTemplateId = engine.getTemplateManager().getDefaultTemplateId();
        if (currentTemplateId && currentTemplateId !== selectedTemplate) {
          memoizedOnTemplateChange(currentTemplateId);
        }
        
        // グローバルパラメータの取得と反映
        if (engine.parameterManager) {
          const globalParams = engine.parameterManager.getGlobalDefaults();
          updateState({ globalParams });
        }
      }, 100);
    };
    
    window.addEventListener('template-loaded', handleTemplateLoaded as EventListener);
    window.addEventListener('project-loaded', handleProjectLoaded as EventListener);
    
    return () => {
      window.removeEventListener('template-loaded', handleTemplateLoaded as EventListener);
      window.removeEventListener('project-loaded', handleProjectLoaded as EventListener);
    };
  }, [memoizedOnTemplateChange, engine]);
  
  // すべてのテンプレートをTemplateManagerに登録する関数
  const registerAllTemplates = () => {
    if (!engine) return;
    
    const templateManager = engine.getTemplateManager();
    if (!templateManager) return;
    
    // まずエンジンのTemplateManagerに登録されているか確認して、
    // 登録されていないテンプレートを追加する
    templateList.forEach(template => {
      // 既に登録されているテンプレートはスキップ
      if (templateManager.isTemplateRegistered(template.id)) {
        return;
      }
      
      const templateObj = getTemplateById(template.id);
      if (templateObj) {
        try {
          // テンプレートのパラメータ設定からデフォルトパラメータを取得
          const params = {};
          if (typeof templateObj.getParameterConfig === 'function') {
            const paramConfig = templateObj.getParameterConfig();
            paramConfig.forEach((param) => {
              params[param.name] = param.default;
            });
          }
          
          // エンジンにテンプレートを登録
          engine.addTemplate(
            template.id,
            templateObj,
            { name: template.name },
            params
          );
        } catch (error) {
          console.error(`テンプレート「${template.name}」(${template.id})の登録に失敗しました:`, error);
        }
      }
    });
  };
  
  // オブジェクト選択イベントのハンドラ
  useEffect(() => {
    // 従来の単一選択イベント（後方互換性のため）
    const handleSingleObjectSelected = (event: CustomEvent) => {
      const { objectId, objectType, params } = event.detail;
      
      setSelectedObjectIds([objectId]);
      setSelectedObjectType(objectType);
      
      // 個別設定の状態を確認（V2対応）
      let hasIndividualSettings = false;
      
      if (engine?.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
        // V2モード: 個別設定が有効かチェック
        hasIndividualSettings = engine.parameterManagerV2.isIndividualSettingEnabled(objectId);
      } else {
        // V1モード: 従来の方法（現在はV2のみのため使用されない）
        hasIndividualSettings = engine?.parameterManager?.isIndividualSettingEnabled?.(objectId) || false;
      }
      
      // フレーズオブジェクトの場合、個別設定の有無に基づいてモードを決定
      if (objectType === 'phrase') {
        // 個別設定がアクティブな場合は個別設定モード、そうでなければグローバルモード
        const newEditorMode = hasIndividualSettings ? 'selection' : 'global';
        updateState({ 
          editorMode: newEditorMode,
          hasParamsChanged: false,
          useIndividualSettings: hasIndividualSettings
        });
      } else {
        // フレーズ以外のオブジェクトの場合、現在のモードを維持
        // ただし、個別設定は無効化（フレーズ以外は個別設定をサポートしない）
        updateState({ 
          hasParamsChanged: false,
          useIndividualSettings: false
        });
      }
      
      // 表示するパラメータを決定
      let displayParams = params || {};
      
      // エンジンが初期化済みの場合は常にグローバルパラメータを基準に開始
      if (engine && engine.parameterManager) {
        try {
          // まずグローバルパラメータを取得（個別設定の有無に関わらず）
          const globalParams = engine.parameterManager.getGlobalDefaults();
          if (globalParams && Object.keys(globalParams).length > 0) {
            displayParams = globalParams;
          }
          
          // V2では個別設定の概念がないため、この処理をスキップ
          if (hasIndividualSettings) {
            // V2専用: フレーズパラメータを取得
            const objectParams = engine.parameterManager.getParameters(objectId);
            
            if (objectParams && Object.keys(objectParams).length > 0) {
              displayParams = objectParams;
            }
          }
        } catch (error) {
          console.warn('TemplateTab: パラメータの取得に失敗、歌詞データのparamsを使用:', error);
        }
      }
      setObjectParams(displayParams);
      
      // テンプレートマップをクリア（単一選択なので）
      const templateMap = new Map<string, string>();
      
      // 現在のテンプレートIDを取得（エンジンから取得できる場合）
      if (engine && engine.templateManager) {
        const assignments = engine.templateManager.getAssignments();
        if (assignments.has(objectId)) {
          const templateId = assignments.get(objectId)!;
          templateMap.set(objectId, templateId);
          
          // 適切なテンプレート選択状態を更新
          updateSelectedTemplateId(objectType, templateId);
        }
      }
      
      updateState({ 
        selectionTemplateMap: templateMap,
        hasMixedTemplates: false
      });
    };
    
    // 新しい複数選択イベント
    const handleMultipleObjectsSelected = (event: CustomEvent) => {
      const { objectIds, objectType, params } = event.detail;
      
      setSelectedObjectIds(objectIds || []);
      setSelectedObjectType(objectType);
      
      // 個別設定の状態を確認（V2対応）
      let hasAnyIndividualSettings = false;
      let allHaveIndividualSettings = false;
      
      if (engine?.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
        // V2モード: 個別設定が有効かチェック
        hasAnyIndividualSettings = objectIds.some(id =>
          engine.parameterManagerV2.isIndividualSettingEnabled(id)
        );
        allHaveIndividualSettings = objectIds.length > 0 && objectIds.every(id => 
          engine.parameterManagerV2.isIndividualSettingEnabled(id)
        );
      } else {
        // V1モード: 従来の方法（現在はV2のみのため使用されない）
        hasAnyIndividualSettings = objectIds.some(id =>
          engine?.parameterManager?.isIndividualSettingEnabled?.(id) || false
        );
        allHaveIndividualSettings = objectIds.length > 0 && objectIds.every(id => 
          engine?.parameterManager?.isIndividualSettingEnabled?.(id) || false
        );
      }
      
      // フレーズオブジェクトの場合、個別設定の有無に基づいてモードを決定
      if (objectType === 'phrase') {
        // 一つでも個別設定がアクティブな場合は個別設定モード、全て非アクティブならグローバルモード
        const newEditorMode = hasAnyIndividualSettings ? 'selection' : 'global';
        updateState({ 
          editorMode: newEditorMode,
          hasParamsChanged: false,
          useIndividualSettings: hasAnyIndividualSettings
        });
      } else {
        // フレーズ以外のオブジェクトの場合、現在のモードを維持
        // ただし、個別設定は無効化（フレーズ以外は個別設定をサポートしない）
        updateState({ 
          hasParamsChanged: false,
          useIndividualSettings: false
        });
      }
      
      // 表示するパラメータを決定
      let displayParams = params || {};
      
      // エンジンが初期化済みの場合は常にグローバルパラメータを基準に開始
      if (engine && engine.parameterManager) {
        try {
          // まずグローバルパラメータを取得（個別設定の有無に関わらず）
          const globalParams = engine.parameterManager.getGlobalDefaults();
          if (globalParams && Object.keys(globalParams).length > 0) {
            displayParams = globalParams;
          }
          
          // 全てが個別設定を持つ場合のみ、個別パラメータで上書き（V2対応）
          if (allHaveIndividualSettings && objectIds.length > 0) {
            let firstObjectParams;
            
            if (engine.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
              // V2モード: フレーズパラメータを取得
              firstObjectParams = engine.parameterManagerV2.getParameters(objectIds[0]);
            } else {
              // V1モード: 従来の方法
              firstObjectParams = engine.parameterManager.getParameters(objectIds[0]);
            }
            
            if (firstObjectParams && Object.keys(firstObjectParams).length > 0) {
              displayParams = firstObjectParams;
            }
          }
        } catch (error) {
          console.warn('TemplateTab: 複数選択でのパラメータ取得に失敗:', error);
        }
      }
      setObjectParams(displayParams);
      
      // 選択されたオブジェクトのテンプレートIDを取得
      const templateMap = new Map<string, string>();
      let commonTemplateId: string | null = null;
      let hasDifferentTemplates = false;
      
      if (engine && engine.templateManager) {
        const assignments = engine.templateManager.getAssignments();
        
        objectIds.forEach(id => {
          if (assignments.has(id)) {
            const templateId = assignments.get(id)!;
            templateMap.set(id, templateId);
            
            if (commonTemplateId === null) {
              commonTemplateId = templateId;
            } else if (commonTemplateId !== templateId) {
              hasDifferentTemplates = true;
            }
          }
        });
        
        // 共通のテンプレートIDがある場合は選択状態を更新
        if (commonTemplateId && !hasDifferentTemplates) {
          updateSelectedTemplateId(objectType, commonTemplateId);
        }
      }
      
      updateState({ 
        selectionTemplateMap: templateMap,
        hasMixedTemplates: hasDifferentTemplates
      });
    };
    
    // イベントリスナー追加
    window.addEventListener('object-selected', handleSingleObjectSelected as EventListener);
    window.addEventListener('objects-selected', handleMultipleObjectsSelected as EventListener);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('object-selected', handleSingleObjectSelected as EventListener);
      window.removeEventListener('objects-selected', handleMultipleObjectsSelected as EventListener);
    };
  }, [engine]);
  
  // 選択されたオブジェクトタイプに応じてテンプレートID選択状態を更新
  const updateSelectedTemplateId = (objectType: string, templateId: string) => {
    switch (objectType) {
      case 'phrase':
        updateState({ selectedPhraseTemplateId: templateId });
        break;
      case 'word':
        updateState({ selectedWordTemplateId: templateId });
        break;
      case 'char':
        updateState({ selectedCharTemplateId: templateId });
        break;
    }
  };
  
  // グローバルテンプレート変更ハンドラ
  const handleGlobalTemplateChange = (templateId: string) => {
    onTemplateChange(templateId);
    
    // エンジンを介してグローバルテンプレートを設定（可能な場合）
    if (engine) {
      try {
        engine.setDefaultTemplate(templateId, true);
        
        // テンプレートのパラメータ設定を取得して更新
        const templateObj = getTemplateById(templateId);
        if (templateObj && typeof templateObj.getParameterConfig === 'function') {
          const defaultParams: Record<string, any> = {};
          const paramConfig = templateObj.getParameterConfig();
          paramConfig.forEach(param => {
            defaultParams[param.name] = param.default;
          });
          
          // 既存のパラメータを優先し、不足分をデフォルト値で補完
          const existingParams = engine.parameterManager
            ? engine.parameterManager.getGlobalDefaults()
            : {};
          
          // 既存のパラメータを保持し、新しいパラメータのみデフォルト値を設定
          const mergedParams = { ...defaultParams, ...existingParams };
          updateState({ globalParams: mergedParams });
        }
      } catch (error) {
        console.error('グローバルテンプレート変更エラー:', error);
      }
    }
  };
  
  // オブジェクト選択時のテンプレート適用ハンドラ
  const handleSelectionTemplateChange = (templateId: string) => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    // 適切なテンプレート選択状態を更新
    updateSelectedTemplateId(selectedObjectType, templateId);
    
    // テンプレートオブジェクトを取得
    const templateObj = getTemplateById(templateId);
    if (!templateObj) {
      console.error(`テンプレートID「${templateId}」が見つかりません`);
      return;
    }
    
    try {
      // まずエンジンにテンプレートが登録されているか確認し、登録されていなければ登録する
      const params = {};
      if (typeof templateObj.getParameterConfig === 'function') {
        const paramConfig = templateObj.getParameterConfig();
        paramConfig.forEach((param) => {
          params[param.name] = param.default;
        });
      }
      
      // テンプレート名を取得
      const templateName = templateList.find(t => t.id === templateId)?.name || templateId;
      
      // テンプレートを登録（すでに登録されている場合は上書き）
      engine.addTemplate(
        templateId,
        templateObj,
        { name: templateName },
        params
      );
      
      // 現在のテンプレートと同じかチェック（強制再適用の判定のため）
      const currentTemplateId = selectedObjectIds.length === 1 
        ? engine.getCurrentTemplateId(selectedObjectIds[0]) 
        : null;
      const isSameTemplate = currentTemplateId === templateId;
      const forceReapply = isSameTemplate || state.hasParamsChanged;
      
      
      // 複数のオブジェクトに対してテンプレートを一括適用
      if (selectedObjectIds.length === 1) {
        // 単一選択の場合は従来の方法
        const success = engine.assignTemplate(selectedObjectIds[0], templateId, true, true, forceReapply);
        if (!success) {
          console.error(`オブジェクト ${selectedObjectIds[0]} のテンプレート適用に失敗しました`);
        } else {
          
          // パラメータ変更フラグをリセット
          updateState({ hasParamsChanged: false });
          
          // 選択オブジェクトパラメータを更新（V2対応）
          if (engine.parameterManager) {
            let updatedParams;
            
            if (engine.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
              // V2モード: フレーズパラメータを取得
              updatedParams = engine.parameterManagerV2.getParameters(selectedObjectIds[0]);
            } else {
              // V1モード: 従来の方法
              updatedParams = engine.parameterManager.getParameters(selectedObjectIds[0]);
            }
            
            setObjectParams(updatedParams);
          }
          
          // テンプレートマップを更新
          const newMap = new Map(state.selectionTemplateMap);
          newMap.set(selectedObjectIds[0], templateId);
          updateState({ 
            selectionTemplateMap: newMap,
            hasMixedTemplates: false
          });
        }
      } else {
        // 複数選択の場合は個別に適用（forceReapplyをサポートするため）
        let allSuccess = true;
        const newMap = new Map();
        
        for (const objectId of selectedObjectIds) {
          const success = engine.assignTemplate(objectId, templateId, true, true, forceReapply);
          if (!success) {
            console.error(`オブジェクト ${objectId} のテンプレート適用に失敗しました`);
            allSuccess = false;
          } else {
            newMap.set(objectId, templateId);
          }
        }
        
        if (allSuccess) {
          
          // パラメータ変更フラグをリセット
          updateState({ hasParamsChanged: false });
          
          // テンプレートマップを更新（全て同じテンプレートになるので混在ではない）
          const newMap = new Map();
          selectedObjectIds.forEach(id => newMap.set(id, templateId));
          updateState({ 
            selectionTemplateMap: newMap,
            hasMixedTemplates: false
          });
          
          // UIフィードバックのためにカスタムイベントを発火
          const event = new CustomEvent('template-batch-applied', {
            detail: {
              objectIds: selectedObjectIds,
              objectType: selectedObjectType,
              templateId: templateId,
              templateName: templateName
            }
          });
          window.dispatchEvent(event);
        }
      }
    } catch (error) {
      console.error(`テンプレート適用に失敗しました`, error);
    }
  };
  
  // 現在選択されているテンプレートID（モードに応じて）
  const getCurrentTemplateId = useCallback(() => {
    if (state.editorMode === 'global') {
      return selectedTemplate;
    } else {
      // 選択オブジェクトモードの場合
      switch (selectedObjectType) {
        case 'phrase':
          return state.selectedPhraseTemplateId;
        case 'word':
          return state.selectedWordTemplateId;
        case 'char':
          return state.selectedCharTemplateId;
        default:
          return selectedTemplate;
      }
    }
  }, [state.editorMode, state.selectedPhraseTemplateId, state.selectedWordTemplateId, state.selectedCharTemplateId, selectedTemplate, selectedObjectType]);

  // グローバルパラメータ変更ハンドラ（統合版・V2対応）
  const handleGlobalParamChange = useCallback((updatedParams: Record<string, any>) => {
    if (!engine) return;
    
    
    // 深いコピーを作成して参照問題を防ぐ
    const paramsCopy = JSON.parse(JSON.stringify(updatedParams));
    
    // V2対応のラッパーメソッドを使用
    if (engine.updateGlobalParameters) {
      engine.updateGlobalParameters(paramsCopy);
    } else {
      // フォールバック: V1メソッド
      engine.updateGlobalParams(paramsCopy);
    }
    
    // リアルタイム反映のため強制レンダリング
    if (engine.instanceManager) {
      engine.instanceManager.updateExistingInstances();
      if (engine.currentTime !== undefined) {
        engine.instanceManager.update(engine.currentTime);
      }
    }
    
    updateState({ globalParams: paramsCopy });
  }, [engine, updateState]);
  
  // オブジェクトパラメータ変更ハンドラ（統合版・V2対応）
  const handleObjectParamChange = useCallback((updatedParams: Record<string, any>) => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    // 深いコピーを作成して参照問題を防ぐ
    const paramsCopy = JSON.parse(JSON.stringify(updatedParams));
    
    // パラメータを更新（V2対応）
    selectedObjectIds.forEach(id => {
      
      if (engine.updatePhraseParameters && selectedObjectType === 'phrase') {
        // V2パラメータ更新（フレーズレベル）
        engine.updatePhraseParameters(id, paramsCopy);
      } else {
        // フレーズ以外は現状V2で未対応のため、ログ出力のみ
        console.warn(`[TemplateTab] ${selectedObjectType}レベルの個別パラメータ更新はV2では未対応: ${id}`);
      }
    });
    setObjectParams(paramsCopy);
    
    // リアルタイム反映のため強制レンダリング
    if (engine.instanceManager) {
      engine.instanceManager.updateExistingInstances();
      if (engine.currentTime !== undefined) {
        engine.instanceManager.update(engine.currentTime);
      }
    }
    
    // assignTemplateの呼び出しを削除
    // （updateObjectParams内で既にインスタンス更新が行われているため）
  }, [engine, selectedObjectIds, selectedObjectType]);
  
  // フォント更新のためのリロード状態
  const [fontReloadTrigger, setFontReloadTrigger] = useState(0);
  
  // 選択中のオブジェクトの個別パラメータをクリア（フレーズレベル統一）
  const handleClearSelectedObjectParams = useCallback(() => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    // フレーズIDを抽出して重複を除去
    const phraseIds = new Set<string>();
    selectedObjectIds.forEach(id => {
      const phraseId = engine.parameterManager?.extractPhraseId?.(id) || id;
      phraseIds.add(phraseId);
    });
    
    const confirmMessage = phraseIds.size === 1
      ? `フレーズ ${Array.from(phraseIds)[0]} の個別設定をクリアしますか？`
      : `選択された ${phraseIds.size}個のフレーズの個別設定をクリアしますか？`;
    
    if (window.confirm(confirmMessage)) {
      // エンジンでフレーズレベルの個別パラメータをクリア
      const success = engine.clearSelectedObjectParams(Array.from(phraseIds));
      
      if (success) {
        
        // パラメータ表示をクリア
        setObjectParams({});
        
        // UIフィードバックのためにカスタムイベントを発火
        const event = new CustomEvent('params-cleared', {
          detail: {
            objectIds: selectedObjectIds,
            objectType: selectedObjectType
          }
        });
        window.dispatchEvent(event);
      } else {
        console.error('TemplateTab: 個別パラメータのクリアに失敗しました');
      }
    }
  }, [engine, selectedObjectIds, selectedObjectType]);

  // オブジェクトの個別設定を有効化（フレーズレベル統一）
  const handleEnableIndividualSettings = useCallback(() => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    // フレーズIDを抽出して重複を除去
    const phraseIds = new Set<string>();
    selectedObjectIds.forEach(id => {
      const phraseId = engine.parameterManager?.extractPhraseId?.(id) || id;
      phraseIds.add(phraseId);
    });
    
    phraseIds.forEach(phraseId => {
      // V2統一管理でフレーズレベルの個別設定を有効化
      engine.parameterManager?.enableIndividualSetting?.(phraseId);
    });
    
    
    // タイムラインマーカーの色変更をトリガー（フレーズIDで通知）
    const event = new CustomEvent('individual-settings-enabled', {
      detail: {
        objectIds: Array.from(phraseIds),
        objectType: 'phrase'
      }
    });
    window.dispatchEvent(event);
  }, [engine, selectedObjectIds, selectedObjectType]);

  // オブジェクトの個別設定を無効化
  const handleDisableIndividualSettings = useCallback(() => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    const confirmMessage = selectedObjectIds.length === 1
      ? `${selectedObjectIds[0]} の個別設定を無効化しますか？（個別設定はクリアされます）`
      : `選択された ${selectedObjectIds.length}個の${selectedObjectType} の個別設定を無効化しますか？（個別設定はクリアされます）`;
    
    if (window.confirm(confirmMessage)) {
      // フレーズIDを抽出して重複を除去
      const phraseIds = new Set<string>();
      selectedObjectIds.forEach(id => {
        const phraseId = engine.parameterManager?.extractPhraseId?.(id) || id;
        phraseIds.add(phraseId);
      });
      
      phraseIds.forEach(phraseId => {
        // V2統一管理でフレーズレベルの個別設定を無効化
        engine.parameterManager?.disableIndividualSetting?.(phraseId);
      });
      
      
      // パラメータ表示をクリア
      setObjectParams({});
      
      // タイムラインマーカーの色変更をトリガー（フレーズIDで通知）
      const event = new CustomEvent('individual-settings-disabled', {
        detail: {
          objectIds: Array.from(phraseIds),
          objectType: 'phrase'
        }
      });
      window.dispatchEvent(event);
    }
  }, [engine, selectedObjectIds, selectedObjectType]);

  // 選択されたオブジェクトの個別設定状態を取得（V2対応）
  const getIndividualSettingsStatus = useCallback(() => {
    if (!engine || selectedObjectIds.length === 0) return { allEnabled: false, someEnabled: false };
    
    let enabledCount = 0;
    
    if (engine.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
      // V2モード: 個別設定が有効かチェック
      enabledCount = selectedObjectIds.filter(id => 
        engine.parameterManagerV2.isIndividualSettingEnabled(id)
      ).length;
    } else {
      // V1モード: 従来の方法（現在はV2のみのため使用されない）
      enabledCount = selectedObjectIds.filter(id => 
        engine.parameterManager?.isIndividualSettingEnabled?.(id) || false
      ).length;
    }
    
    return {
      allEnabled: enabledCount === selectedObjectIds.length,
      someEnabled: enabledCount > 0
    };
  }, [engine, selectedObjectIds]);

  const individualSettingsStatus = getIndividualSettingsStatus();

  // 全ての個別オブジェクトデータを強制クリア
  const handleForceCleanAllObjectData = useCallback(() => {
    if (!engine) return;
    
    const confirmMessage = '警告: 全ての個別オブジェクトパラメータとアクティベーション状態を完全にクリアします。\n\nこの操作により、過去に設定された全ての個別設定（フレーズ、単語、文字レベル）が削除され、グローバル設定のみが適用されるようになります。\n\nこの操作は元に戻せません。続行しますか？';
    
    if (window.confirm(confirmMessage)) {
      const success = engine.forceCleanAllObjectData();
      
      if (success) {
        
        // 選択オブジェクトのパラメータ表示もクリア
        setObjectParams({});
        
        // エンジン状態を同期
        syncWithEngineState();
        
        alert('全ての個別オブジェクト設定をクリアしました。\n\nタイムライン上の緑色マーカーが全て消え、グローバル設定のみが適用されています。');
      } else {
        console.error('個別オブジェクトデータのクリアに失敗しました');
        alert('エラー: 個別オブジェクトデータのクリアに失敗しました。');
      }
    }
  }, [engine, syncWithEngineState]);
  
  // fontsLoadedイベントリスナーの設定
  useEffect(() => {
    const handleFontsLoaded = () => {
      setFontReloadTrigger(prev => prev + 1);
    };
    
    window.addEventListener('fontsLoaded', handleFontsLoaded);
    
    return () => {
      window.removeEventListener('fontsLoaded', handleFontsLoaded);
    };
  }, []);
  
  // 個別設定スイッチの切り替えハンドラ
  const handleIndividualSettingToggle = useCallback((enabled: boolean) => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    // フレーズオブジェクトの場合、editorModeも同時に更新
    if (selectedObjectType === 'phrase') {
      updateState({ 
        useIndividualSettings: enabled,
        editorMode: enabled ? 'selection' : 'global'
      });
    } else {
      updateState({ useIndividualSettings: enabled });
    }
    
    if (enabled) {
      // 個別設定を有効化：フレーズレベルで統一管理
      const phraseIds = new Set<string>();
      selectedObjectIds.forEach(objectId => {
        // オブジェクトIDからフレーズIDを抽出
        const phraseId = engine.parameterManager?.extractPhraseId?.(objectId) || objectId;
        phraseIds.add(phraseId);
      });
      
      phraseIds.forEach(phraseId => {
        // ParameterManagerでフレーズレベルの個別設定を有効化（V2統一管理）
        engine.parameterManager?.enableIndividualSetting?.(phraseId);
        
        // 初期化されたパラメータを取得してUI表示を更新（V2対応）
        let initializedParams;
        
        // V2専用: フレーズパラメータの初期化と取得
        if (!engine.parameterManager.isPhraseInitialized(objectId)) {
          const currentTemplateId = getCurrentTemplateId();
          engine.parameterManager.initializePhrase(objectId, currentTemplateId);
        }
        initializedParams = engine.parameterManager.getParameters(objectId);
        
        if (initializedParams) {
          setObjectParams(initializedParams);
        }
      });
      
      // タイムラインマーカーの色変更をトリガー（フレーズIDで通知）
      const event = new CustomEvent('individual-settings-enabled', {
        detail: {
          objectIds: Array.from(phraseIds),
          objectType: 'phrase'
        }
      });
      window.dispatchEvent(event);
      
    } else {
      // 個別設定を無効化：フレーズレベルで統一管理
      const phraseIds = new Set<string>();
      selectedObjectIds.forEach(objectId => {
        // オブジェクトIDからフレーズIDを抽出
        const phraseId = engine.parameterManager?.extractPhraseId?.(objectId) || objectId;
        phraseIds.add(phraseId);
      });
      
      phraseIds.forEach(phraseId => {
        engine.parameterManager?.disableIndividualSetting?.(phraseId);
      });
      
      // タイムラインマーカーの色変更をトリガー（フレーズIDで通知）
      const event = new CustomEvent('individual-settings-disabled', {
        detail: {
          objectIds: Array.from(phraseIds),
          objectType: 'phrase'
        }
      });
      window.dispatchEvent(event);
    }
  }, [engine, selectedObjectIds, selectedObjectType, getCurrentTemplateId, updateState]);
  
  // 個別設定の現在の状態を取得
  const getIndividualSettingCurrentStatus = useCallback(() => {
    if (!engine || selectedObjectIds.length === 0) return false;
    
    // 選択されたオブジェクトのうち、個別設定が有効になっているものの数を確認（V2対応）
    let enabledCount = 0;
    
    if (engine.isUsingParameterManagerV2 && engine.isUsingParameterManagerV2()) {
      // V2モード: 個別設定が有効かチェック
      enabledCount = selectedObjectIds.filter(id => 
        engine.parameterManagerV2.isIndividualSettingEnabled(id)
      ).length;
    } else {
      // V1モード: 従来の方法（現在はV2のみのため使用されない）
      enabledCount = selectedObjectIds.filter(id => 
        engine.parameterManager?.isIndividualSettingEnabled?.(id) || false
      ).length;
    }
    
    // 全て有効化されている場合のみtrueを返す
    return enabledCount === selectedObjectIds.length;
  }, [engine, selectedObjectIds]);
  
  // 選択されたテンプレートのパラメータ情報を取得
  const getTemplateParamConfig = (templateId: string) => {
    const templateObj = getTemplateById(templateId);
    
    // パラメータ設定を取得
    if (templateObj && typeof templateObj.getParameterConfig === 'function') {
      const paramConfig = templateObj.getParameterConfig();
      return paramConfig;
    }
    
    // getParameterConfig()が未実装の場合はエラー
    console.error(`Template ${templateId} must implement getParameterConfig() method`);
    return [];
  };
  
  
  return (
    <div className="template-tab">
      <h2>テンプレート</h2>
      
      {/* モード切り替えスイッチ */}
      <div className="editor-mode-switch">
        <div className="switch-container">
          <button 
            className={`mode-button ${state.editorMode === 'global' ? 'active' : ''}`}
            onClick={() => updateState({ editorMode: 'global' })}
          >
            グローバル設定
          </button>
          <button 
            className={`mode-button ${state.editorMode === 'selection' ? 'active' : ''}`}
            onClick={() => {
              updateState({ editorMode: 'selection' });
            }}
            disabled={selectedObjectIds.length === 0}
          >
            選択オブジェクト設定
          </button>
        </div>
      </div>
      
      {/* グローバル設定モード */}
      {state.editorMode === 'global' && (
        <div className="global-settings">
          <div className="template-section">
            <h3>アニメーションテンプレート</h3>
            <p>アニメーション全体に適用するテンプレートを選択してください。</p>
            
            {/* V2モード表示 */}
            {engine && engine.isUsingParameterManagerV2 && (
              <div className="v2-mode-indicator" style={{
                padding: '8px',
                margin: '8px 0',
                backgroundColor: engine.isUsingParameterManagerV2() ? '#e8f5e8' : '#f5f5f5',
                border: engine.isUsingParameterManagerV2() ? '1px solid #4caf50' : '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                <strong>パラメータシステム:</strong> {
                  engine.isUsingParameterManagerV2() ? 
                  'V2 (完全初期化モード)' : 
                  'V1 (継承チェーンモード)'
                }
                {engine.isUsingParameterManagerV2() && (
                  <div style={{ marginTop: '4px', color: '#2e7d32' }}>
                    ✓ 予測可能なパラメータ動作・継承問題なし
                  </div>
                )}
                {engine.enableParameterManagerV2 && !engine.isUsingParameterManagerV2() && (
                  <button 
                    onClick={() => engine.enableParameterManagerV2()}
                    style={{
                      marginTop: '4px',
                      padding: '4px 8px',
                      backgroundColor: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    V2モードに切り替え
                  </button>
                )}
              </div>
            )}
            
            {/* グローバルテンプレートセレクタ */}
            <TemplateSelector
              templates={templateList}
              selectedTemplateId={selectedTemplate}
              onSelect={handleGlobalTemplateChange}
            />
          </div>
          
          {/* グローバルパラメータ編集セクション */}
          {template && typeof template.getParameterConfig === 'function' && (
            <div className="params-section">
              <h3>グローバルパラメータ設定</h3>
              <p>全体に適用されるパラメータを調整してください。</p>
              
              <ParamEditor
                key={`global-${selectedTemplate}-${fontReloadTrigger}`}
                params={state.globalParams}
                paramConfig={getTemplateParamConfig(selectedTemplate)}
                onChange={handleGlobalParamChange}
              />
              
              {/* 全個別設定強制クリアセクション */}
              <div className="force-clean-section">
                <h4>システムメンテナンス</h4>
                <p>過去に設定された全ての個別オブジェクトパラメータとアクティベーション状態を強制的にクリアします</p>
                
                <button 
                  className="force-clean-button"
                  onClick={handleForceCleanAllObjectData}
                  title="全ての個別オブジェクト設定を完全にクリアし、グローバル設定のみを適用します（元に戻せません）"
                >
                  全個別設定を強制クリア
                </button>
                
                <div className="force-clean-warning">
                  ⚠️ 注意: この操作は元に戻せません。全ての緑色マーカーが消え、グローバル設定のみが適用されます。
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 選択オブジェクト設定モード */}
      {state.editorMode === 'selection' && selectedObjectIds.length > 0 && (
        <div className="selection-settings selection-mode-background">
          <div className="object-template-section">
            <h3>
              {selectedObjectType === 'phrase' && 'フレーズテンプレート'}
              {selectedObjectType === 'word' && '単語テンプレート'}
              {selectedObjectType === 'char' && '文字テンプレート'}
            </h3>
            
            {selectedObjectIds.length === 1 ? (
              <p>選択中の{selectedObjectType}: {selectedObjectIds[0]}</p>
            ) : (
              <p>{selectedObjectIds.length}個の{selectedObjectType}を選択中</p>
            )}
            
            {/* 混在テンプレートの警告 */}
            {state.hasMixedTemplates && (
              <div className="mixed-templates-warning">
                <p>選択されたオブジェクトに異なるテンプレートが適用されています。テンプレートを選択すると全てのオブジェクトに同じテンプレートが適用されます。</p>
              </div>
            )}
            
            {/* オブジェクト種類に応じたテンプレートセレクタ */}
            <TemplateSelector
              templates={templateList}
              selectedTemplateId={
                selectedObjectType === 'phrase' ? state.selectedPhraseTemplateId : 
                selectedObjectType === 'word' ? state.selectedWordTemplateId : 
                selectedObjectType === 'char' ? state.selectedCharTemplateId : 'fadeslidetext'
              }
              onSelect={handleSelectionTemplateChange}
              selectedPhraseIds={selectedObjectIds}
            />
          </div>
          
          {/* パラメータ編集セクション */}
          <div className="params-section">
            <h3>パラメータ設定</h3>
            
            {selectedObjectIds.length === 1 ? (
              <p>選択オブジェクト: {selectedObjectIds[0]} のパラメータを調整</p>
            ) : (
              <p>選択された {selectedObjectIds.length}個の{selectedObjectType} のパラメータを一括調整</p>
            )}
            
            {/* 個別設定・グローバル設定切り替えスイッチ */}
            <div className="individual-setting-switch-section">
              <div className="switch-container">
                <label className="switch-label">
                  <span className="switch-text">
                    設定モード: {state.useIndividualSettings ? '個別設定' : 'グローバル設定'}
                  </span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={state.useIndividualSettings}
                      onChange={(e) => handleIndividualSettingToggle(e.target.checked)}
                      className="switch-input"
                    />
                    <span className="switch-slider"></span>
                  </div>
                </label>
              </div>
              <div className="switch-description">
                {state.useIndividualSettings ? (
                  <p className="individual-mode-description">
                    💡 個別設定モード: このオブジェクト専用の設定が適用されます（緑色マーカー表示）
                  </p>
                ) : (
                  <p className="global-mode-description">
                    💡 グローバル設定モード: プロジェクト全体の設定が適用されます
                  </p>
                )}
              </div>
            </div>
            
            {/* 個別設定がONの場合のみクリアボタンを表示 */}
            {state.useIndividualSettings && (
              <div className="clear-params-section">
                <button 
                  className="clear-params-button"
                  onClick={handleClearSelectedObjectParams}
                  title="選択中のオブジェクトの個別設定をすべてクリアします"
                >
                  個別設定をクリア
                </button>
              </div>
            )}
            
            {/* 複数選択で異なるテンプレートが混在する場合はパラメータ編集を無効化 */}
            {state.hasMixedTemplates ? (
              <div className="param-editor-disabled">
                <p>異なるテンプレートが選択されているため、パラメータ編集はできません。<br />
                テンプレートを統一するか、単一のオブジェクトを選択してください。</p>
              </div>
            ) : (
              <ParamEditor
                key={`object-${getCurrentTemplateId()}-${fontReloadTrigger}`}
                params={objectParams}
                paramConfig={getTemplateParamConfig(getCurrentTemplateId())}
                onChange={handleObjectParamChange}
                disabled={state.hasMixedTemplates}
              />
            )}
          </div>
        </div>
      )}
      
      {/* 選択オブジェクトがない場合の表示 */}
      {state.editorMode === 'selection' && selectedObjectIds.length === 0 && (
        <div className="no-selection-message">
          <p>フレーズ、単語、または文字を選択してください。</p>
        </div>
      )}
    </div>
  );
};

export default TemplateTab;