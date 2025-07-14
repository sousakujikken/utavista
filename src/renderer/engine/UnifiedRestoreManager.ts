import { Engine } from './Engine';
import { ParameterManagerV2 } from './ParameterManagerV2';
import { ProjectStateManager } from './ProjectStateManager';
import { TemplateManager } from './TemplateManager';
import { InstanceManager } from './InstanceManager';
import { IAnimationTemplate } from '../types/types';
import { 
  NormalizedProjectData, 
  ProjectFileData, 
  AutoSaveData, 
  ProjectDataNormalizer 
} from '../../types/UnifiedProjectData';

/**
 * 統一復元マネージャー
 * ファイル読み込みと自動保存復元の両方を統一的に処理
 */
export class UnifiedRestoreManager {
  constructor(
    private engine: Engine,
    private parameterManager: ParameterManagerV2,
    private projectStateManager: ProjectStateManager,
    private templateManager: TemplateManager,
    private instanceManager: InstanceManager
  ) {}

  /**
   * ファイル保存データから復元
   */
  async restoreFromFile(data: ProjectFileData): Promise<boolean> {
    try {
      const normalizedData = ProjectDataNormalizer.fromFileData(data);
      return await this.restoreCore(normalizedData);
    } catch (error) {
      console.error('UnifiedRestoreManager: ファイル復元エラー:', error);
      return false;
    }
  }

  /**
   * 自動保存データから復元
   */
  async restoreFromAutoSave(data: AutoSaveData): Promise<boolean> {
    try {
      const normalizedData = ProjectDataNormalizer.fromAutoSaveData(data);
      return await this.restoreCore(normalizedData);
    } catch (error) {
      console.error('UnifiedRestoreManager: 自動保存復元エラー:', error);
      return false;
    }
  }

  /**
   * 統一復元処理のコア実装
   */
  private async restoreCore(normalizedData: NormalizedProjectData): Promise<boolean> {
    try {
      // 復元開始ログ削除済み

      // 1. データ妥当性チェック
      if (!ProjectDataNormalizer.validateNormalizedData(normalizedData)) {
        console.warn('UnifiedRestoreManager: データが不完全のためサニタイズします');
        normalizedData = ProjectDataNormalizer.sanitizeNormalizedData(normalizedData);
      }

      // 2. ステージ設定の復元
      await this.restoreStageConfig(normalizedData.stageConfig);

      // 3. 背景設定の復元
      await this.restoreBackgroundConfig(normalizedData.backgroundConfig);

      // 4. 音声情報の復元
      await this.restoreAudioInfo(normalizedData.audioInfo);

      // 5. プロジェクト状態の復元
      await this.restoreProjectState(normalizedData);

      // 6. パラメータの復元（個別設定情報を含む）
      await this.restoreParameters(normalizedData);

      // 7. テンプレート復元（個別設定保護付き）
      await this.restoreTemplateWithProtection(
        normalizedData.templateId,
        normalizedData.templateParams,
        normalizedData.templateAssignments
      );

      // 7.5. InstanceManagerにTemplateManagerを確実に設定
      if (this.instanceManager && this.templateManager) {
        (this.instanceManager as any).templateManager = this.templateManager;
      }

      // 8. 歌詞データの復元
      await this.restoreLyricsData(normalizedData.lyricsData);

      // 9. 強化された復元後処理とインスタンス同期
      setTimeout(() => {
        
        // UIの個別設定状態更新のためのイベント発火
        const enabledSettings = this.parameterManager.getIndividualSettingsEnabled();
        const allPhrases = this.parameterManager.getInitializedPhrases();
        // 個別設定統計ログ削除済み
        
        // インスタンス更新の強化処理
        if (this.instanceManager) {
          
          // 段階1: 全インスタンスのパラメータを強制更新
          this.instanceManager.updateExistingInstances();
          
          // 段階2: テンプレート割り当ての同期確認と修正
          if (this.templateManager) {
            allPhrases.forEach(phraseId => {
              try {
                // TemplateManagerのテンプレート割り当てを確認
                const assignedTemplate = this.templateManager.getTemplateForObject(phraseId);
                const instance = this.instanceManager.getInstance(phraseId);
                
                
                if (instance && assignedTemplate) {
                  const currentTemplate = instance.template?.constructor?.name;
                  const expectedTemplate = assignedTemplate.constructor?.name;
                  
                  if (currentTemplate !== expectedTemplate) {
                    // テンプレート不一致ログ削除済み
                    
                    // テンプレートとパラメータを強制更新
                    instance.template = assignedTemplate;
                    const params = this.parameterManager.getParameters(phraseId);
                    
                    // 保持すべき特殊パラメータ
                    const preservedParams = {
                      id: instance.params.id,
                      words: instance.params.words,
                      chars: instance.params.chars,
                      charIndex: instance.params.charIndex,
                      totalChars: instance.params.totalChars,
                      totalWords: instance.params.totalWords,
                      wordIndex: instance.params.wordIndex,
                      phrasePhase: instance.params.phrasePhase,
                      phraseStartMs: instance.params.phraseStartMs,
                      phraseEndMs: instance.params.phraseEndMs
                    };
                    
                    instance.params = { ...params, ...preservedParams };
                  }
                }
              } catch (error) {
                console.warn(`UnifiedRestoreManager: フレーズ ${phraseId} のテンプレート同期でエラー:`, error);
              }
            });
          }
          
          // 段階3: 個別設定フレーズの階層的更新
          if (enabledSettings.length > 0) {
            enabledSettings.forEach(phraseId => {
              try {
                const params = this.parameterManager.getParameters(phraseId);
                // パラメータ更新ログ削除済み
                
                // フレーズとその子要素（単語、文字）のインスタンスを更新
                this.instanceManager.updateInstanceAndChildren(phraseId);
              } catch (error) {
                console.error(`UnifiedRestoreManager: 個別設定フレーズ ${phraseId} の更新でエラー:`, error);
              }
            });
          }
          
          // 段階4: 最終的な整合性チェックと再描画
          const consistencyResult = this.validateTemplateParameterConsistency();
          if (!consistencyResult.isValid) {
            console.warn('UnifiedRestoreManager: 最終整合性チェックで問題を検出:', consistencyResult);
          }
          
          // 全体を再描画
          this.instanceManager.update((this.engine as any).currentTime);
          
          // 復元完了の確認ログ削除済み
        }
        
        // 個別設定状態変更イベントをUIに通知
        window.dispatchEvent(new CustomEvent('individual-settings-restored', {
          detail: { enabledPhrases: enabledSettings }
        }));
        
      }, 500);

      // V2パラメータ管理では同期不要

      return true;
    } catch (error) {
      console.error('UnifiedRestoreManager: 統一復元処理エラー:', error);
      return false;
    }
  }

  /**
   * ステージ設定の復元
   */
  private async restoreStageConfig(stageConfig: any): Promise<void> {
    try {
      if (stageConfig) {
        // Engineのステージ設定更新メソッドを呼び出し
        const currentStageConfig = (this.engine as any).stageConfig;
        const needsResize = (
          currentStageConfig.aspectRatio !== stageConfig.aspectRatio ||
          currentStageConfig.orientation !== stageConfig.orientation
        );
        
        if (needsResize) {
          (this.engine as any).stageConfig = stageConfig;
          await (this.engine as any).resizeStage(stageConfig.aspectRatio, stageConfig.orientation);
        } else {
          (this.engine as any).stageConfig = stageConfig;
        }
      }
    } catch (error) {
      console.error('UnifiedRestoreManager: ステージ設定復元エラー:', error);
    }
  }

  /**
   * 背景設定の復元
   */
  private async restoreBackgroundConfig(backgroundConfig: any): Promise<void> {
    try {
      if (backgroundConfig) {
        await (this.engine as any).updateBackgroundConfig(backgroundConfig);
      }
    } catch (error) {
      console.error('UnifiedRestoreManager: 背景設定復元エラー:', error);
    }
  }

  /**
   * 音声情報の復元
   */
  private async restoreAudioInfo(audioInfo: any): Promise<void> {
    try {
      if (audioInfo && audioInfo.fileName) {
        (this.engine as any).audioFileName = audioInfo.fileName;
        (this.engine as any).audioDuration = audioInfo.duration || 10000;
        (this.engine as any).audioFilePath = audioInfo.filePath;
      }
    } catch (error) {
      console.error('UnifiedRestoreManager: 音声情報復元エラー:', error);
    }
  }

  /**
   * プロジェクト状態の復元
   */
  private async restoreProjectState(normalizedData: NormalizedProjectData): Promise<void> {
    try {
      // ProjectStateManagerにデータをインポート
      const projectStateData = {
        lyricsData: normalizedData.lyricsData,
        currentTime: 0,
        templateAssignments: normalizedData.templateAssignments,
        globalParams: normalizedData.globalParams,
        objectParams: normalizedData.objectParams,
        individualSettingsEnabled: normalizedData.individualSettingsEnabled,
        defaultTemplateId: normalizedData.templateId
      };
      
      this.projectStateManager.importState(projectStateData);
    } catch (error) {
      console.error('UnifiedRestoreManager: プロジェクト状態復元エラー:', error);
    }
  }

  /**
   * パラメータの復元（V2統一管理対応）
   */
  private async restoreParameters(normalizedData: NormalizedProjectData): Promise<void> {
    try {
      // V2データの確認（parameterDataの存在とversion）
      if ((normalizedData as any).parameterData) {
        
        // parameterDataの妥当性をチェック
        const parameterData = (normalizedData as any).parameterData;
        if (Array.isArray(parameterData)) {
          console.error('UnifiedRestoreManager: parameterDataが配列として渡されました。これは不正です。', parameterData);
          throw new Error('parameterDataが配列として渡されました。正しいオブジェクト形式である必要があります。');
        }
        
        // V2データを直接インポート（個別設定情報も含む）
        this.parameterManager.importCompressed(parameterData);
        
        // 個別設定状態の確認とログ出力
        const enabledSettings = this.parameterManager.getIndividualSettingsEnabled();
        
        // 復元されたデータの詳細確認
        enabledSettings.forEach(phraseId => {
          const params = this.parameterManager.getParameters(phraseId);
          const isIndividual = this.parameterManager.isIndividualSettingEnabled(phraseId);
          // 個別設定確認ログ削除済み
          
          // 個別設定がある場合、TemplateManagerにも割り当てを設定
          if (isIndividual && params.templateId) {
            this.templateManager.assignTemplate(phraseId, params.templateId);
          }
        });
        
        // 正規化データの個別設定情報も更新（UI通知用）
        if (enabledSettings.length > 0) {
          normalizedData.individualSettingsEnabled = enabledSettings;
        }
      } else {
        console.warn('UnifiedRestoreManager: V1データは非対応です。V2データのみサポートされています。');
        throw new Error('V1データは非対応です。プロジェクトをV2形式で再保存してください。');
      }

      // テンプレート割り当ての復元と強化同期
      if (normalizedData.templateAssignments) {
        this.templateManager.importAssignments(normalizedData.templateAssignments);
      }
      
      // テンプレート割り当ての検証
      const assignments = this.templateManager.getAssignments();
      for (const [objectId, templateId] of assignments.entries()) {
      }
    } catch (error) {
      console.error('UnifiedRestoreManager: パラメータ復元エラー:', error);
    }
  }

  /**
   * テンプレート復元（個別設定保護付き）
   */
  private async restoreTemplateWithProtection(
    templateId: string,
    templateParams: any,
    templateAssignments: Record<string, string>
  ): Promise<void> {
    try {

      // テンプレートレジストリからテンプレートを取得
      const { getTemplateById } = await import('../templates/registry/templateRegistry');
      const template = getTemplateById(templateId);
      
      if (!template) {
        console.warn(`UnifiedRestoreManager: テンプレート ${templateId} が見つかりません`);
        return;
      }

      // テンプレートのデフォルトパラメータを取得
      const defaultParams: any = {};
      if (typeof template.getParameterConfig === 'function') {
        const params = template.getParameterConfig();
        params.forEach((param: any) => {
          defaultParams[param.name] = param.default;
        });
      }

      // パラメータをマージ（空値をフィルタリング）
      const mergedParams = { ...defaultParams, ...templateParams };
      
      // 空値や無効な値を除去
      const validParams: any = {};
      for (const [key, value] of Object.entries(mergedParams)) {
        if (value !== undefined && value !== null && value !== '') {
          validParams[key] = value;
        }
      }

      // テンプレートマネージャーを更新
      this.templateManager.registerTemplate(templateId, template, {name: templateId}, true);
      this.templateManager.setDefaultTemplateId(templateId);

      // 個別設定フレーズのテンプレート割り当てを保護
      // templateAssignmentsがある場合は、既存の割り当てを保護
      if (templateAssignments && Object.keys(templateAssignments).length > 0) {
        // 現在の割り当て状態を確認
        const currentAssignments = this.templateManager.getAssignments();
        if (currentAssignments.size === 0) {
          // まだ割り当てが復元されていない場合のみインポート
          this.templateManager.importAssignments(templateAssignments);
        } else {
          // 既に割り当てがある場合は、個別設定以外のみ更新
          const individualSettings = this.parameterManager.getIndividualSettingsEnabled();
          for (const [objectId, newTemplateId] of Object.entries(templateAssignments)) {
            const phraseId = this.parameterManager.extractPhraseId(objectId);
            
            if (!individualSettings.includes(phraseId)) {
              // 個別設定がないフレーズのみ更新
              this.templateManager.setAssignment(objectId, newTemplateId);
            }
          }
        }
      }

      // V2: グローバルデフォルトを更新（有効なパラメータのみ）
      if (Object.keys(validParams).length > 0) {
        this.parameterManager.updateGlobalDefaults(validParams);
      } else {
      }

      // メインテンプレートを更新
      (this.engine as any).template = template;

      // フォント読み込み待機処理
      if (mergedParams.fontFamily) {
        try {
          const { FontService } = await import('../services/FontService');
          await FontService.ensureFontLoaded(mergedParams.fontFamily);
        } catch (error) {
          console.warn(`UnifiedRestoreManager: Font loading failed for ${mergedParams.fontFamily}:`, error);
        }
      }

      // インスタンスマネージャーのテンプレートを更新
      if (this.instanceManager) {
        this.instanceManager.updateTemplate(template, mergedParams);
        this.instanceManager.update((this.engine as any).currentTime);
      }

    } catch (error) {
      console.error('UnifiedRestoreManager: テンプレート復元エラー:', error);
    }
  }

  /**
   * 歌詞データの復元
   */
  private async restoreLyricsData(lyricsData: any[]): Promise<void> {
    try {
      if (lyricsData && lyricsData.length > 0) {
        // PIXI初期化が完了していることを確認してから歌詞データを復元
        const app = (this.engine as any).app;
        if (!app || !app.screen || app.screen.width <= 0) {
          console.warn('UnifiedRestoreManager: PIXI未初期化のため歌詞データ復元を延期');
          // 少し待ってからリトライ
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        (this.engine as any).loadLyrics(lyricsData);
      }
    } catch (error) {
      console.error('UnifiedRestoreManager: 歌詞データ復元エラー:', error);
    }
  }

  /**
   * 個別設定の適用（V2では個別設定の概念がないため、実質的にno-op）
   */
  private applyIndividualSettings(individualSettingsEnabled: string[]): void {
    try {
      
      // V2では個別設定の概念がないため、単純にインスタンス更新のみ実行
      this.instanceManager.updateExistingInstances();
      this.instanceManager.update((this.engine as any).currentTime);
      
    } catch (error) {
      console.error('UnifiedRestoreManager: インスタンス更新エラー:', error);
    }
  }

  /**
   * 復元状態の検証
   */
  async validateRestoreState(): Promise<boolean> {
    try {
      // 基本的な状態チェック
      const hasTemplate = !!(this.engine as any).template;
      const hasInstanceManager = !!(this.engine as any).instanceManager;
      const hasLyrics = (this.engine as any).phrases?.length > 0;
      
      // 復元状態検証ログ削除済み

      return hasTemplate && hasInstanceManager;
    } catch (error) {
      console.error('UnifiedRestoreManager: 復元状態検証エラー:', error);
      return false;
    }
  }

  /**
   * テンプレート・パラメータ整合性チェック（V2専用）
   */
  validateTemplateParameterConsistency(): {
    isValid: boolean;
    issues: string[];
    autoFixApplied?: string[];
  } {
    const issues: string[] = [];
    const autoFixApplied: string[] = [];

    try {
      // V2では個別設定の概念がないため、テンプレート割り当ての整合性のみチェック
      const templateAssignments = this.templateManager.exportAssignments();
      Object.keys(templateAssignments).forEach(objectId => {
        const templateId = templateAssignments[objectId];
        const template = this.templateManager.getTemplateById(templateId);
        
        if (!template) {
          issues.push(`存在しないテンプレートが割り当てられている: ${objectId} -> ${templateId}`);
        }
      });

      // テンプレート検証結果ログ削除済み

      return {
        isValid: issues.length === 0,
        issues,
        autoFixApplied: autoFixApplied.length > 0 ? autoFixApplied : undefined
      };

    } catch (error) {
      console.error('UnifiedRestoreManager: 整合性チェックエラー:', error);
      return {
        isValid: false,
        issues: [`整合性チェック中にエラーが発生: ${error.message}`]
      };
    }
  }
}