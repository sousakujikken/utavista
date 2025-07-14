import { PhraseUnit } from '../types/types';
import { ProjectState } from '../engine/ProjectStateManager';
import { unifiedFileManager } from './UnifiedFileManager';
import { Engine } from '../engine/Engine';
import { DebugEventBus } from '../utils/DebugEventBus';
import { calculateCharacterIndices } from '../utils/characterIndexCalculator';
import { StandardParameters } from '../types/StandardParameters';
import { ParameterValidator } from '../../utils/ParameterValidator';

// プロジェクトファイルのメタデータ
export interface ProjectMetadata {
  projectName: string;
  createdAt: string;
  modifiedAt: string;
}

// 音楽ファイル参照
export interface AudioReference {
  fileName: string;
  duration: number;
}

// プロジェクトファイルデータ構造
export interface ProjectFileData {
  version: string;
  metadata: ProjectMetadata;
  audio: AudioReference;
  lyricsData: PhraseUnit[];
  globalTemplateId: string;
  globalParams: Record<string, any>;
  objectParams: Record<string, Record<string, any>>;
  backgroundColor?: string;
  // 個別設定情報
  individualSettingsEnabled?: string[];
  // 後方互換性のため（読み込み時のみ使用）
  defaultTemplateId?: string;
  templateAssignments?: Record<string, string>;
}

// バリデーション結果
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * プロジェクトファイルの管理を行うクラス
 */
export class ProjectFileManager {
  private static readonly CURRENT_VERSION = '0.1.0';
  private static readonly FILE_EXTENSION = '.uta';
  
  constructor(private engine: Engine) {}

  /**
   * プロジェクトデータを取得（保存用）
   * @param fileName ファイル名（拡張子なし）
   */
  getProjectData(fileName?: string): ProjectFileData {
    return this.buildProjectData(fileName || 'project');
  }
  
  /**
   * パラメータを正規化するヘルパーメソッド
   */
  private normalizeParameters(params: unknown): StandardParameters {
    // V2の圧縮形式フィールドを除外
    const paramsToValidate = { ...params } as any;
    delete paramsToValidate.parameterDiff;
    delete paramsToValidate.templateId;
    
    const validation = ParameterValidator.validate(paramsToValidate);
    if (!validation.isValid) {
      console.warn('Parameter normalization warnings:', validation.errors);
    }
    return validation.sanitized;
  }
  
  /**
   * プロジェクトデータを読み込み（Electron経由など）
   * @param projectData プロジェクトデータ
   */
  async loadProjectData(projectData: ProjectFileData): Promise<void> {
    
    // バリデーション
    const validation = this.validateProjectData(projectData);
    if (!validation.isValid) {
      throw new Error(`無効なプロジェクトファイル: ${validation.errors.join(', ')}`);
    }
    
    // 文字インデックスを計算
    const lyricsWithIndices = calculateCharacterIndices(projectData.lyricsData);
    
    // グローバルテンプレートIDを取得（後方互換性対応）
    const globalTemplateId = projectData.globalTemplateId || projectData.defaultTemplateId || 'FadeSlideText';
    
    // プロジェクト状態を復元
    const state: Partial<ProjectState> = {
      lyricsData: lyricsWithIndices,
      defaultTemplateId: globalTemplateId,
      globalParams: projectData.globalParams,
      templateAssignments: {},  // 新しい形式ではobjectParamsにtemplateIdが含まれる
      objectParams: projectData.objectParams,
      backgroundColor: projectData.backgroundColor,
      audioFileName: projectData.audio.fileName,
      audioFileDuration: projectData.audio.duration,
      individualSettingsEnabled: projectData.individualSettingsEnabled || []
    };
    
    // グローバルテンプレートを設定
    this.engine.getTemplateManager().setDefaultTemplateId(globalTemplateId);
    
    // V2パラメータデータの復元
    if ((projectData as any).parameterData) {
      // V2形式のデータを直接インポート
      this.engine.getParameterManager().importCompressed((projectData as any).parameterData);
    } else {
      throw new Error('V1プロジェクトファイルは非対応です。V2形式で再保存してください。');
    }
    
    this.engine.getStateManager().importState(state);
    
    
    // objectParamsからテンプレート割り当てを復元
    for (const [objectId, params] of Object.entries(projectData.objectParams)) {
      const templateId = params.templateId;
      
      if (templateId && templateId !== '__global__') {
        // 個別テンプレートが指定されている場合
        this.engine.getTemplateManager().assignTemplate(objectId, templateId);
      }
    }
    
    // 背景色を復元
    if (projectData.backgroundColor) {
      this.engine.setBackgroundColor(projectData.backgroundColor);
    }
    
    // 音楽ファイル要求イベントを発行
    DebugEventBus.emit('request-audio-file', {
      fileName: projectData.audio.fileName,
      duration: projectData.audio.duration
    });
    
    // プロジェクトロードイベント発行
    window.dispatchEvent(new CustomEvent('project-loaded', { 
      detail: { globalTemplateId }
    }));
    
    // タイムライン更新イベントを発火（アクティベーション状態の反映のため）
    window.dispatchEvent(new CustomEvent('timeline-updated', {
      detail: { lyrics: this.engine.phrases }
    }));
    
    // テンプレート適用完了後に歌詞データを読み込み、その後個別設定を遅延適用
    setTimeout(() => {
      try {
        // 歌詞データをエンジンに設定
        this.engine.loadLyrics(lyricsWithIndices);
        
        // 個別設定の適用
        const individualSettingsEnabled = projectData.individualSettingsEnabled || [];
        if (individualSettingsEnabled.length > 0) {
          this.applyIndividualSettingsToAnimation(individualSettingsEnabled);
        }
      } catch (error) {
        console.error('[ProjectFileManager] 歌詞データ読み込みまたは個別設定適用に失敗:', error);
      }
    }, 150);
    
    DebugEventBus.emit('project-loaded', { 
      fileName: projectData.metadata.projectName,
      globalTemplateId
    });
  }

  /**
   * プロジェクトをファイルに保存（エレクトロン専用）
   * @param fileName ファイル名（拡張子なし）
   */
  async saveProject(fileName: string): Promise<string> {
    try {
      // プロジェクトデータを構築
      const projectData = this.buildProjectData(fileName);
      
    
      // エレクトロンのファイル保存APIを使用
      const filePath = await unifiedFileManager.saveProject(projectData);
      
      // 保存成功時に自動保存データをクリア
      await this.engine.clearAutoSave();
      
      // デバッグイベント発行
      DebugEventBus.emit('project-saved', { fileName: filePath });
      
      return filePath;
    } catch (error) {
      console.error('Project save error:', error);
      throw new Error(`プロジェクトの保存に失敗しました: ${error}`);
    }
  }

  /**
   * プロジェクトファイルを読み込み（エレクトロン専用）
   */
  async loadProject(): Promise<void> {
    try {
      // エレクトロンのファイル読み込みAPIを使用
      const projectData = await unifiedFileManager.loadProject();
      
      // バリデーション
      const validation = this.validateProjectData(projectData);
      if (!validation.isValid) {
        throw new Error(`無効なプロジェクトファイル: ${validation.errors.join(', ')}`);
      }
      
      // 文字インデックスを計算
      const lyricsWithIndices = calculateCharacterIndices(projectData.lyricsData);
      
      // レガシーparams構造を削除（V2移行後の不整合対策）
      this.cleanupLegacyParams(lyricsWithIndices);
      
      // グローバルテンプレートIDを取得（後方互換性対応）
      const globalTemplateId = projectData.globalTemplateId || projectData.defaultTemplateId || 'FadeSlideText';
      
      // プロジェクト状態を復元
      const state: Partial<ProjectState> = {
        lyricsData: lyricsWithIndices,
        defaultTemplateId: globalTemplateId,
        globalParams: projectData.globalParams,
        templateAssignments: {},  // 新しい形式ではobjectParamsにtemplateIdが含まれる
        objectParams: projectData.objectParams,
        backgroundColor: projectData.backgroundColor,
        audioFileName: projectData.audio.fileName,
        audioFileDuration: projectData.audio.duration,
        individualSettingsEnabled: projectData.individualSettingsEnabled || []
      };
      
      // グローバルテンプレートを設定
      this.engine.getTemplateManager().setDefaultTemplateId(globalTemplateId);
      
      // V2パラメータデータの復元
      if ((projectData as any).parameterData) {
        // V2形式のデータを直接インポート
        this.engine.getParameterManager().importCompressed((projectData as any).parameterData);
        
        // V2パラメータデータは復元完了、テンプレート割り当ては遅延実行
      } else {
        throw new Error('V1プロジェクトファイルは非対応です。V2形式で再保存してください。');
      }
      
      this.engine.getStateManager().importState(state);
      
      // 後方互換性：objectParamsからテンプレート割り当てを復元（V2データがない場合のみ）
      for (const [objectId, params] of Object.entries(projectData.objectParams)) {
        const templateId = params.templateId;
        
        if (templateId && templateId !== '__global__') {
          // V2データで既に設定されていない場合のみ適用
          if (!this.engine.getTemplateManager().assignments.has(objectId)) {
            this.engine.getTemplateManager().assignTemplate(objectId, templateId);
          }
        }
      }
      
      // 後方互換性：旧形式のtemplateAssignmentsがある場合の処理
      if (projectData.templateAssignments) {
        for (const [objectId, templateId] of Object.entries(projectData.templateAssignments)) {
          if (templateId && templateId !== projectData.defaultTemplateId) {
            this.engine.getTemplateManager().assignTemplate(objectId, templateId);
          }
        }
      }
      
      // 背景色を設定
      if (projectData.backgroundColor) {
        this.engine.setBackgroundColor(projectData.backgroundColor);
      }
      
      // 音楽ファイルの再読み込みを促す
      if (projectData.audio.fileName) {
        DebugEventBus.emit('request-audio-file', {
          fileName: projectData.audio.fileName,
          duration: projectData.audio.duration
        });
      }
      
      // テンプレート適用は歌詞データ読み込み後に移動
      
      // デバッグイベント発行
      DebugEventBus.emit('project-loaded', { 
        fileName: projectData.metadata.projectName,
        phraseCount: projectData.lyricsData.length,
        globalTemplateId: globalTemplateId,
        globalParams: projectData.globalParams
      });
      
      // UI更新のためのイベントを発火
      window.dispatchEvent(new CustomEvent('template-loaded', {
        detail: {
          templateId: globalTemplateId,
          params: projectData.globalParams
        }
      }));
      
      // 文字配置の再計算を実行（背景タブ選択時と同じ処理）
      // テンプレート適用が完了してから実行されるように遅延を設定
      setTimeout(async () => {
        if (this.engine && this.engine.app && this.engine.app.renderer) {
          try {
            // 歌詞データをエンジンに設定
            this.engine.loadLyrics(lyricsWithIndices);
            
            // 背景タブでのアスペクト比変更時と同じ処理を実行
            this.engine.arrangeCharsOnStage();
            if (this.engine.instanceManager) {
              this.engine.instanceManager.loadPhrases(this.engine.phrases, this.engine.charPositions);
              this.engine.instanceManager.update(this.engine.currentTime);
            }
            
            // PIXIアプリケーションの完全初期化を待つ
            setTimeout(async () => {
              try {
                // 歌詞データ読み込み後にテンプレートを適用
                if (globalTemplateId && globalTemplateId !== 'default') {
                  
                  // PIXIアプリケーションとインスタンスが完全に準備されているかチェック
                  if (!this.engine.app || !this.engine.app.renderer || !this.engine.instanceManager || !this.engine.phrases || this.engine.phrases.length === 0) {
                    console.warn('ProjectFileManager: PIXI、InstanceManager、または歌詞データが未初期化のため、テンプレート適用をスキップ');
                    return;
                  }
                  
                  // さらに詳細なPIXI状態チェック
                  try {
                    const testRender = this.engine.app.renderer.render;
                    if (!testRender) {
                      console.warn('ProjectFileManager: PIXIレンダラーが完全に初期化されていないため、テンプレート適用をスキップ');
                      return;
                    }
                  } catch (renderTest) {
                    console.warn('ProjectFileManager: PIXIレンダラーテストに失敗、テンプレート適用をスキップ:', renderTest);
                    return;
                  }
                  
                  const { getTemplateById } = await import('../templates/registry/templateRegistry');
                  const globalTemplate = getTemplateById(globalTemplateId);
                  
                  if (globalTemplate) {
                    try {
                      // テンプレートをエンジンに適用
                      const success = this.engine.changeTemplate(globalTemplate, projectData.globalParams || {}, globalTemplateId);
                      if (success) {
                      } else {
                      }
                    } catch (templateError) {
                      console.error('[ProjectFileManager] テンプレート適用エラー:', templateError);
                      // エラーが発生してもプロジェクト読み込みは継続
                    }
                  } else {
                    console.warn('ProjectFileManager: テンプレートが見つかりません:', globalTemplateId);
                  }
                }
                
                // V2データからテンプレート割り当てを復元（フェーズ2で実行）
                if ((projectData as any).parameterData) {
                  this.syncTemplateAssignmentsFromV2Data((projectData as any).parameterData);
                }
                
                // デバッグ情報の表示
                const actualTemplate = this.engine.getTemplateManager().getAssignment('phrase_1751341417869_k7b01lewz');
                
                if (projectData.objectParams['phrase_1751341417869_k7b01lewz']) {
                  const objectParamsTemplate = projectData.objectParams['phrase_1751341417869_k7b01lewz'].templateId;
                }
                
                // テンプレート適用完了後に個別設定を強制適用
                const individualSettingsEnabled = projectData.individualSettingsEnabled || [];
                if (individualSettingsEnabled.length > 0) {
                  this.applyIndividualSettingsToAnimation(individualSettingsEnabled);
                }
              } catch (error) {
                console.error('[ProjectFileManager] テンプレート適用または個別設定適用に失敗:', error);
              }
            }, 300); // テンプレート適用のための追加遅延
          } catch (error) {
            console.error('[ProjectFileManager] 歌詞データ読み込みまたは個別設定適用に失敗:', error);
          }
        }
      }, 500); // PIXIアプリケーションの完全初期化を待つため遅延を延長
      
      // プロジェクトロード完了イベントを発火
      window.dispatchEvent(new CustomEvent('project-loaded', {
        detail: {
          projectName: projectData.metadata.projectName,
          lyricsData: projectData.lyricsData,
          globalTemplateId: globalTemplateId,
          objectParams: projectData.objectParams
        }
      }));
    } catch (error) {
      console.error('Project load error:', error);
      throw new Error(`プロジェクトの読み込みに失敗しました: ${error}`);
    }
  }

  /**
   * プロジェクトデータを構築
   */
  private buildProjectData(projectName: string): ProjectFileData {
    const state = this.engine.getStateManager().exportFullState();
    
    // Engineから直接歌詞データも取得して比較
    const engineLyrics = this.engine.getTimelineData().lyrics;
    
    const now = new Date().toISOString();
    const templateManager = this.engine.getTemplateManager();
    const globalTemplateId = templateManager.getDefaultTemplateId();
    
    // objectParamsにtemplateIdを追加
    const enhancedObjectParams: Record<string, Record<string, any>> = {};
    
    // 歌詞データから全てのオブジェクトIDを収集してテンプレートIDを設定
    if (state.lyricsData) {
      for (const phrase of state.lyricsData) {
        // フレーズレベル
        const phraseTemplate = templateManager.getTemplateForObject(phrase.id);
        const phraseTemplateId = this.getTemplateIdForObject(phrase.id, phraseTemplate, templateManager, globalTemplateId);
        
        // V2では直接パラメータを取得
        const v2Params = this.engine.getParameterManager().getParameters(phrase.id);
        enhancedObjectParams[phrase.id] = {
          ...this.normalizeParameters(v2Params),
          templateId: phraseTemplateId
        } as StandardParameters;
        
        // 単語レベル
        phrase.words.forEach((word, wordIndex) => {
          const wordId = `${phrase.id}_word_${wordIndex}`;
          const wordTemplate = templateManager.getTemplateForObject(wordId);
          const wordTemplateId = this.getTemplateIdForObject(wordId, wordTemplate, templateManager, globalTemplateId);
          
          if (wordTemplateId !== '__global__') {
            // V2では直接パラメータを取得
            const wordParams = this.engine.getParameterManager().getParameters(wordId);
            enhancedObjectParams[wordId] = {
              ...this.normalizeParameters(wordParams),
              templateId: wordTemplateId
            } as StandardParameters;
          }
          
          // 文字レベル
          word.chars.forEach((char, charIndex) => {
            const charId = `${wordId}_char_${charIndex}`;
            const charTemplate = templateManager.getTemplateForObject(charId);
            const charTemplateId = this.getTemplateIdForObject(charId, charTemplate, templateManager, globalTemplateId);
            
            if (charTemplateId !== '__global__') {
              // V2では直接パラメータを取得
              const charParams = this.engine.getParameterManager().getParameters(charId);
              enhancedObjectParams[charId] = {
                ...this.normalizeParameters(charParams),
                templateId: charTemplateId
              } as StandardParameters;
            }
          });
        });
      }
    }
    
    // V2: パラメータマネージャーからV2形式のデータを取得
    const parameterData = this.engine.getParameterManager().exportCompressed();
    
    const projectData: ProjectFileData = {
      version: ProjectFileManager.CURRENT_VERSION,
      metadata: {
        projectName: projectName.replace(ProjectFileManager.FILE_EXTENSION, ''),
        createdAt: now,
        modifiedAt: now
      },
      audio: {
        fileName: state.audioFileName || '',
        duration: state.audioFileDuration || 0
      },
      lyricsData: engineLyrics || state.lyricsData || [], // Engineから直接取得を優先
      globalTemplateId: globalTemplateId,
      globalParams: this.normalizeParameters(this.engine.getParameterManager().getGlobalDefaults()),
      objectParams: enhancedObjectParams,
      backgroundColor: state.backgroundColor,
      individualSettingsEnabled: this.engine.getParameterManager().getIndividualSettingsEnabled() // V2統一管理で個別設定リストを取得
    };
    
    // V2パラメータデータを別フィールドとして追加
    (projectData as any).parameterData = parameterData;
    
    return projectData;
  }
  
  /**
   * オブジェクトのテンプレートIDを取得（グローバルと同じ場合は'__global__'を返す）
   */
  private getTemplateIdForObject(
    objectId: string, 
    template: any, 
    templateManager: any, 
    globalTemplateId: string
  ): string {
    // テンプレートマネージャーから実際のテンプレートIDを取得
    const assignments = templateManager.getAssignments();
    
    // 直接割り当てがある場合はそのIDを使用
    if (assignments.has(objectId)) {
      return assignments.get(objectId);
    }
    
    // テンプレートがグローバルと同じ場合は'__global__'を返す
    const allTemplates = templateManager.getAllTemplates();
    const currentTemplateId = allTemplates.find(t => 
      templateManager.getTemplateById(t.id) === template
    )?.id;
    
    return currentTemplateId === globalTemplateId ? '__global__' : (currentTemplateId || '__global__');
  }

  /**
   * プロジェクトデータの検証
   */
  validateProjectData(data: any): ValidationResult {
    const errors: string[] = [];
    
    
    // 必須フィールドのチェック（必要最小限に緩和）
    if (!data.version) {
      console.warn('ProjectFileManager: バージョン情報がありません。デフォルト値を設定します');
      data.version = ProjectFileManager.CURRENT_VERSION;
    }
    
    if (!data.metadata) {
      console.warn('ProjectFileManager: メタデータがありません。デフォルト値を設定します');
      data.metadata = {
        projectName: 'Imported Project',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };
    }
    
    if (!data.lyricsData) {
      errors.push('歌詞データがありません');
    }
    
    // テンプレートIDのデフォルト設定
    if (!data.globalTemplateId && !data.defaultTemplateId) {
      console.warn('ProjectFileManager: テンプレートIDがありません。デフォルト値を設定します');
      data.globalTemplateId = 'fadeslidetext';
    }
    
    // 音楽ファイル情報のデフォルト設定
    if (!data.audio) {
      console.warn('ProjectFileManager: 音楽ファイル情報がありません。デフォルト値を設定します');
      data.audio = {
        fileName: 'no-audio',
        duration: 30000
      };
    }
    
    // グローバルパラメータのデフォルト設定
    if (!data.globalParams) {
      console.warn('ProjectFileManager: グローバルパラメータがありません。デフォルト値を設定します');
      data.globalParams = {};
    }
    
    // オブジェクトパラメータのデフォルト設定
    if (!data.objectParams) {
      console.warn('ProjectFileManager: オブジェクトパラメータがありません。デフォルト値を設定します');
      data.objectParams = {};
    }
    
    // バージョンチェック（警告のみ）
    if (data.version && !this.isVersionCompatible(data.version)) {
      console.warn(`ProjectFileManager: バージョン ${data.version} は想定バージョンと異なりますが、読み込みを継続します`);
    }
    
    // 歌詞データの検証（新しいフィールド名に対応）
    if (data.lyricsData && Array.isArray(data.lyricsData)) {
      for (const phrase of data.lyricsData) {
        // 新しいフィールド名（phrase, start, end）を基準として検証
        const hasNewFormat = phrase.phrase && typeof phrase.start === 'number' && typeof phrase.end === 'number';
        const hasOldFormat = phrase.text && typeof phrase.inTime === 'number' && typeof phrase.outTime === 'number';
        
        if (!phrase.id || (!hasNewFormat && !hasOldFormat)) {
          console.warn(`ProjectFileManager: 不正なフレーズデータを検出: ${phrase.id || 'unknown'}. 修正を試みます`);
          
          // データ修正の試み
          if (!phrase.id) phrase.id = `phrase_${Date.now()}`;
          
          // 新しい形式への統一（phrase, start, end）
          if (!phrase.phrase) {
            phrase.phrase = phrase.text || 'テキストなし'; // 旧形式から変換
          }
          if (typeof phrase.start !== 'number') {
            phrase.start = phrase.inTime || 0; // 旧形式から変換
          }
          if (typeof phrase.end !== 'number') {
            phrase.end = phrase.outTime || 1000; // 旧形式から変換
          }
          
          // 旧形式フィールドを削除（データクリーンアップ）
          delete phrase.text;
          delete phrase.inTime;
          delete phrase.outTime;
        } else if (hasOldFormat && !hasNewFormat) {
          // 旧形式のデータを新しい形式に変換
          phrase.phrase = phrase.text;
          phrase.start = phrase.inTime;
          phrase.end = phrase.outTime;
          
          // 旧形式フィールドを削除
          delete phrase.text;
          delete phrase.inTime;
          delete phrase.outTime;
        }
        
        // WordUnitとCharUnitの構造も検証
        if (phrase.words && Array.isArray(phrase.words)) {
          for (const word of phrase.words) {
            // WordUnitの新形式検証
            if (!word.id || !word.word || typeof word.start !== 'number' || typeof word.end !== 'number') {
              console.warn(`ProjectFileManager: 不正な単語データを検出: ${word.id || 'unknown'}. 修正を試みます`);
              
              if (!word.id) word.id = `word_${Date.now()}`;
              if (!word.word) word.word = word.text || 'unknown';
              if (typeof word.start !== 'number') word.start = word.inTime || 0;
              if (typeof word.end !== 'number') word.end = word.outTime || 1000;
              
              // 旧形式フィールドを削除
              delete word.text;
              delete word.inTime;
              delete word.outTime;
            }
            
            // CharUnitの検証
            if (word.chars && Array.isArray(word.chars)) {
              for (const char of word.chars) {
                if (!char.id || !char.char || typeof char.start !== 'number' || typeof char.end !== 'number') {
                  console.warn(`ProjectFileManager: 不正な文字データを検出: ${char.id || 'unknown'}. 修正を試みます`);
                  
                  if (!char.id) char.id = `char_${Date.now()}`;
                  if (!char.char) char.char = 'X';
                  if (typeof char.start !== 'number') char.start = char.inTime || 0;
                  if (typeof char.end !== 'number') char.end = char.outTime || 1000;
                  
                  // 旧形式フィールドを削除
                  delete char.inTime;
                  delete char.outTime;
                }
              }
            }
          }
        }
      }
    }
    
    const result = {
      isValid: errors.length === 0,
      errors
    };
    
    return result;
  }

  /**
   * バージョン互換性チェック
   */
  private isVersionCompatible(version: string): boolean {
    // 現在は0.1.0のみサポート
    return version === ProjectFileManager.CURRENT_VERSION;
  }
  
  /**
   * 個別設定が有効なオブジェクトのパラメータを強制的にアニメーションに適用
   */
  private applyIndividualSettingsToAnimation(individualSettingsEnabled: string[]): void {
    // 各個別設定オブジェクトのパラメータをエンジンに強制適用
    individualSettingsEnabled.forEach((objectId) => {
      try {
        // パラメータキャッシュを強制的に無効化
        const paramManager = this.engine.getParameterManager();
        paramManager.forceRefreshCache();
        
        // エンジンのforceUpdateObjectInstanceメソッドを使用してアニメーションに反映
        this.engine.forceUpdateObjectInstance(objectId);
        
        // 追加の強制更新：InstanceManagerの既存インスタンスを更新
        if (this.engine.instanceManager) {
          this.engine.instanceManager.updateExistingInstances();
        }
      } catch (error) {
        console.warn(`ProjectFileManager: オブジェクト ${objectId} の個別パラメータ適用に失敗:`, error);
      }
    });
    
    // 全体のインスタンス更新を実行
    try {
      if (this.engine.instanceManager) {
        // テンプレートとパラメータの割り当て情報を更新
        this.engine.instanceManager.updateTemplateAssignments(
          this.engine.getTemplateManager()
        );
        
        // テンプレート全体を再適用（個別設定を含む）
        if (this.engine.template) {
          this.engine.instanceManager.updateTemplate(this.engine.template);
        }
        
        // 全インスタンスを更新
        this.engine.instanceManager.updateExistingInstances();
        
        // 現在時刻でアニメーション更新
        this.engine.instanceManager.update(this.engine.currentTime);
      }
    } catch (error) {
      console.warn('ProjectFileManager: 全体のインスタンス更新に失敗:', error);
    }
  }

  /**
   * V2パラメータデータからテンプレート割り当てを同期
   */
  private syncTemplateAssignmentsFromV2Data(parameterData: any): void {
    if (!parameterData.phrases) return;
    
    
    for (const [phraseId, phraseData] of Object.entries(parameterData.phrases)) {
      const v2Data = phraseData as any;
      
      // フレーズIDの場合のみ処理（非フレーズIDはスキップ）
      if (phraseId.startsWith('phrase_') && phraseId.split('_').length >= 2) {
        
        // 個別設定が有効な場合のみV2データのテンプレートIDを使用
        if (v2Data.individualSettingEnabled && v2Data.templateId && v2Data.templateId !== '__global__') {
          const success = this.engine.getTemplateManager().assignTemplate(phraseId, v2Data.templateId);
        } else {
          // 個別設定がない場合は、デフォルトテンプレートを使用（V2データは無視）
          const currentAssignment = this.engine.getTemplateManager().getAssignment(phraseId);
          if (currentAssignment) {
            // 既存の割り当てを削除してデフォルトに戻す
            this.engine.getTemplateManager().unassignTemplate(phraseId);
          }
        }
        
        // 割り当て確認
        const assigned = this.engine.getTemplateManager().getAssignment(phraseId);
        
      } else {
        console.warn(`ProjectFileManager: ${phraseId}は非フレーズIDのためスキップ`);
      }
    }
    
    // 最終的な割り当て状況を確認
    const assignments = this.engine.getTemplateManager().getAssignments();
  }

  /**
   * レガシーparams構造を削除（V2移行後の不整合対策）
   */
  private cleanupLegacyParams(lyricsData: LyricsData[]): void {
    
    let cleanupCount = 0;
    
    for (const phrase of lyricsData) {
      for (const word of phrase.words) {
        for (const char of word.chars) {
          // レガシーparamsプロパティがある場合は削除
          if ('params' in char) {
            delete (char as any).params;
            cleanupCount++;
          }
        }
      }
    }
    
    if (cleanupCount > 0) {
    }
  }
}