import { PhraseUnit, StageConfig, BackgroundConfig, AudioReference } from '../renderer/types/types';
import { StandardParameters } from './StandardParameters';

/**
 * 統一プロジェクトデータ構造（V2対応）
 * ファイル保存・自動保存の両方で使用する正規化されたデータ形式
 */
export interface NormalizedProjectData {
  version: string;
  lyricsData: PhraseUnit[];
  globalParams: StandardParameters;
  objectParams: Record<string, StandardParameters>;
  individualSettingsEnabled: string[];
  templateId: string;
  templateParams: StandardParameters;
  templateAssignments: Record<string, string>;
  stageConfig: StageConfig;
  backgroundConfig: BackgroundConfig;
  audioInfo: AudioReference;
  timestamp: number;
  // V2統一管理パラメータデータ（オプション）
  parameterData?: any; // CompressedProjectDataだがimportできないためany
}

/**
 * ファイル保存データ構造（既存）
 */
export interface ProjectFileData {
  name: string;
  version: string;
  timestamp: number;
  defaultTemplateId: string;
  templates: Record<string, any>;
  templateAssignments: Record<string, string>;
  globalParams: StandardParameters;
  objectParams: Record<string, StandardParameters>;
  individualSettingsEnabled?: string[];
  lyrics: PhraseUnit[];
  stageConfig?: StageConfig;
  backgroundConfig?: BackgroundConfig;
  audioInfo?: AudioReference;
}

/**
 * 自動保存データ構造（V2対応版）
 */
export interface AutoSaveData {
  timestamp: number;
  projectState: {
    lyricsData: PhraseUnit[];
    currentTime: number;
    templateAssignments: Record<string, string>;
    globalParams: StandardParameters;
    objectParams: Record<string, StandardParameters>;
    individualSettingsEnabled: string[];
    defaultTemplateId: string;
  };
  // V2統一管理パラメータデータ（オプション）
  parameterData?: any; // CompressedProjectDataだがimportできないためany
  // V2個別設定状態（オプション）
  individualSettingsEnabled?: string[];
  engineState: {
    phrases: PhraseUnit[];
    audioInfo: AudioReference;
    stageConfig: StageConfig;
    backgroundConfig?: BackgroundConfig;
    selectedTemplate: string;
    templateParams: StandardParameters;
    backgroundVideoInfo?: {
      fileName: string;
      filePath?: string;
    };
  };
}

/**
 * プロジェクトデータ正規化クラス
 * 異なるデータ構造間の変換を担当
 */
export class ProjectDataNormalizer {
  /**
   * ファイル保存データから正規化データに変換
   */
  static fromFileData(data: ProjectFileData): NormalizedProjectData {
    return {
      version: data.version,
      lyricsData: data.lyrics,
      globalParams: data.globalParams,
      objectParams: data.objectParams,
      individualSettingsEnabled: data.individualSettingsEnabled || [],
      templateId: data.defaultTemplateId,
      templateParams: data.globalParams, // ファイル形式ではglobalParamsがテンプレートパラメータ
      templateAssignments: data.templateAssignments,
      stageConfig: data.stageConfig || {
        aspectRatio: '16:9' as const,
        orientation: 'landscape' as const
      },
      backgroundConfig: data.backgroundConfig || {
        type: 'color' as const,
        backgroundColor: '#000000'
      },
      audioInfo: data.audioInfo || {
        fileName: '',
        duration: 10000,
        filePath: ''
      },
      timestamp: data.timestamp
    };
  }

  /**
   * 自動保存データから正規化データに変換（V2対応）
   */
  static fromAutoSaveData(data: AutoSaveData): NormalizedProjectData {
    // V2データがある場合は優先使用（個別設定情報はV2データ内に含まれる）
    const hasV2Data = data.parameterData != null;
    
    
    // V2データがある場合はV2データから個別設定情報を抽出
    let individualSettings: string[] = [];
    if (hasV2Data && data.parameterData?.phrases) {
      // V2データから個別設定が有効なフレーズを抽出
      individualSettings = Object.keys(data.parameterData.phrases).filter(
        phraseId => data.parameterData?.phrases[phraseId]?.individualSettingEnabled === true
      );
    } else {
      // V1データまたはV2データがない場合は従来の方法
      individualSettings = data.individualSettingsEnabled || data.projectState.individualSettingsEnabled || [];
    }
    
    // テンプレートパラメータの取得 - V2データがある場合は優先使用
    const templateParams = hasV2Data && data.parameterData?.globalDefaults 
      ? data.parameterData.globalDefaults
      : data.engineState.templateParams;
    
    return {
      version: hasV2Data ? '2.0.0' : '1.0.0',
      lyricsData: data.engineState.phrases,
      globalParams: data.projectState.globalParams,
      objectParams: data.projectState.objectParams,
      individualSettingsEnabled: individualSettings,
      templateId: data.projectState.defaultTemplateId,
      templateParams: templateParams,
      templateAssignments: data.projectState.templateAssignments,
      stageConfig: data.engineState.stageConfig,
      backgroundConfig: data.engineState.backgroundConfig || {
        type: 'color' as const,
        backgroundColor: '#000000'
      },
      audioInfo: data.engineState.audioInfo,
      timestamp: data.timestamp,
      // V2データを別フィールドとして保持
      parameterData: data.parameterData
    };
  }

  /**
   * 正規化データからファイル保存データに変換
   */
  static toFileData(data: NormalizedProjectData): ProjectFileData {
    return {
      name: 'UTAVISTA Project',
      version: data.version,
      timestamp: data.timestamp,
      defaultTemplateId: data.templateId,
      templates: {}, // 空のテンプレート定義（既存の保存形式に合わせる）
      templateAssignments: data.templateAssignments,
      globalParams: data.globalParams,
      objectParams: data.objectParams,
      individualSettingsEnabled: data.individualSettingsEnabled,
      lyrics: data.lyricsData,
      stageConfig: data.stageConfig,
      backgroundConfig: data.backgroundConfig,
      audioInfo: data.audioInfo
    };
  }

  /**
   * 正規化データから自動保存データに変換
   */
  static toAutoSaveData(data: NormalizedProjectData): AutoSaveData {
    return {
      timestamp: data.timestamp,
      projectState: {
        lyricsData: data.lyricsData,
        currentTime: 0, // 現在時刻は実行時に設定
        templateAssignments: data.templateAssignments,
        globalParams: data.globalParams,
        objectParams: data.objectParams,
        individualSettingsEnabled: data.individualSettingsEnabled,
        defaultTemplateId: data.templateId
      },
      engineState: {
        phrases: data.lyricsData,
        audioInfo: data.audioInfo,
        stageConfig: data.stageConfig,
        backgroundConfig: data.backgroundConfig,
        selectedTemplate: data.templateId,
        templateParams: data.templateParams
      }
    };
  }

  /**
   * データ構造の妥当性チェック
   */
  static validateNormalizedData(data: Partial<NormalizedProjectData>): boolean {
    const required = [
      'version', 'lyricsData', 'globalParams', 'objectParams',
      'individualSettingsEnabled', 'templateId', 'templateParams',
      'templateAssignments', 'stageConfig', 'backgroundConfig', 'audioInfo'
    ];

    return required.every(key => data.hasOwnProperty(key));
  }

  /**
   * データのサニタイズ（不正なデータの修正）
   */
  static sanitizeNormalizedData(data: Partial<NormalizedProjectData>): NormalizedProjectData {
    return {
      version: data.version || '1.0.0',
      lyricsData: data.lyricsData || [],
      globalParams: data.globalParams || {},
      objectParams: data.objectParams || {},
      individualSettingsEnabled: data.individualSettingsEnabled || [],
      templateId: data.templateId || 'fadeslidetext',
      templateParams: data.templateParams || {},
      templateAssignments: data.templateAssignments || {},
      stageConfig: data.stageConfig || {
        aspectRatio: '16:9' as const,
        orientation: 'landscape' as const
      },
      backgroundConfig: data.backgroundConfig || {
        type: 'color' as const,
        backgroundColor: '#000000'
      },
      audioInfo: data.audioInfo || {
        fileName: '',
        duration: 10000,
        filePath: ''
      },
      timestamp: data.timestamp || Date.now()
    };
  }
}