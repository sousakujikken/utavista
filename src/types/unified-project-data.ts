/**
 * 統一プロジェクトデータ型定義
 * 
 * プロジェクトファイルと自動保存データの統一形式
 */

import { ProjectMetadata } from './types';

/**
 * 統一されたテンプレート状態
 */
export interface TemplateState {
  /** グローバルデフォルトテンプレートID */
  defaultTemplateId: string;
  /** オブジェクト別テンプレート割り当て */
  assignments: Record<string, string>;
}

/**
 * 統一されたパラメータ状態
 */
export interface ParameterState {
  /** グローバルパラメータ */
  global: Record<string, any>;
  /** オブジェクト別パラメータ */
  objects: Record<string, Record<string, any>>;
}

/**
 * 音声ファイル参照情報
 */
export interface AudioReference {
  /** ファイルパス */
  filePath: string;
  /** ファイル名 */
  fileName: string;
  /** 音声時長（ミリ秒） */
  duration?: number;
  /** 音声メタデータ */
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
  };
}

/**
 * フレーズ単位データ
 */
export interface PhraseUnit {
  /** フレーズID */
  phraseId: string;
  /** フレーズテキスト */
  phrase: string;
  /** 開始時刻（ミリ秒） */
  start: number;
  /** 終了時刻（ミリ秒） */
  end: number;
  /** 単語レベルデータ */
  words?: WordUnit[];
}

/**
 * 単語単位データ
 */
export interface WordUnit {
  /** 単語ID */
  wordId: string;
  /** 単語テキスト */
  word: string;
  /** 開始時刻（ミリ秒） */
  start: number;
  /** 終了時刻（ミリ秒） */
  end: number;
  /** 文字レベルデータ */
  characters?: CharacterUnit[];
}

/**
 * 文字単位データ
 */
export interface CharacterUnit {
  /** 文字ID */
  charId: string;
  /** 文字テキスト */
  char: string;
  /** 開始時刻（ミリ秒） */
  start: number;
  /** 終了時刻（ミリ秒） */
  end: number;
}

/**
 * ステージ設定
 */
export interface StageConfig {
  /** ステージ幅 */
  width: number;
  /** ステージ高さ */
  height: number;
  /** 背景色 */
  backgroundColor?: string;
  /** 背景画像 */
  backgroundImage?: string;
  /** 背景設定 */
  backgroundConfig?: {
    scale?: number;
    position?: { x: number; y: number };
    opacity?: number;
  };
}

/**
 * 統一プロジェクトデータ構造
 */
export interface UnifiedProjectData {
  /** データ形式バージョン */
  version: string;
  
  /** プロジェクトメタデータ */
  metadata: ProjectMetadata;
  
  /** 音声ファイル情報 */
  audio: AudioReference;
  
  /** 歌詞データ */
  lyricsData: PhraseUnit[];
  
  /** テンプレート状態（統一） */
  templateState: TemplateState;
  
  /** パラメータ状態（統一） */
  parameterState: ParameterState;
  
  /** ステージ設定 */
  stageConfig: StageConfig;
  
  /** 個別設定有効化リスト */
  individualSettingsEnabled?: string[];
}

/**
 * 統一自動保存データ構造
 */
export interface UnifiedAutoSaveData {
  /** データ形式バージョン */
  version: string;
  
  /** 保存タイムスタンプ */
  timestamp: number;
  
  /** プロジェクトデータ（統一形式） */
  projectData: UnifiedProjectData;
  
  /** 最近使用ファイル情報 */
  recentFiles?: RecentFilesData;
}

/**
 * 最近使用ファイル情報
 */
export interface RecentFilesData {
  /** 最近使用プロジェクトファイル */
  projects: string[];
  /** 最近使用音声ファイル */
  audioFiles: string[];
  /** 最大保持数 */
  maxEntries: number;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  /** バリデーション成功フラグ */
  isValid: boolean;
  /** エラーメッセージ配列 */
  errors: ValidationError[];
  /** 警告メッセージ配列 */
  warnings: ValidationWarning[];
}

/**
 * バリデーションエラー
 */
export interface ValidationError {
  /** エラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
  /** フィールドパス */
  field?: string;
  /** 詳細情報 */
  details?: any;
}

/**
 * バリデーション警告
 */
export interface ValidationWarning {
  /** 警告コード */
  code: string;
  /** 警告メッセージ */
  message: string;
  /** フィールドパス */
  field?: string;
  /** 詳細情報 */
  details?: any;
}

/**
 * データ形式判定結果
 */
export type DataFormat = 'unified' | 'legacy-project' | 'legacy-autosave' | 'unknown';

/**
 * 復元オプション
 */
export interface RestoreOptions {
  /** バックアップ作成フラグ */
  createBackup?: boolean;
  /** 厳密バリデーション */
  strictValidation?: boolean;
  /** 部分復元許可 */
  allowPartialRestore?: boolean;
  /** 進捗コールバック */
  onProgress?: (progress: RestoreProgress) => void;
}

/**
 * 復元進捗情報
 */
export interface RestoreProgress {
  /** 現在のステップ */
  currentStep: string;
  /** 進捗割合（0-1） */
  progress: number;
  /** 完了フラグ */
  completed: boolean;
  /** エラー情報 */
  error?: Error;
}