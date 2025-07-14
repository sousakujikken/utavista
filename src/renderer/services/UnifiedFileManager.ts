/**
 * エレクトロン専用統合ファイル管理サービス
 * ブラウザ環境の条件分岐を排除し、エレクトロンのfsモジュールを直接活用
 */

import type { ProjectData, MediaFileInfo } from '../../shared/types';

export class UnifiedFileManager {
  private electronAPI: any;
  
  constructor() {
    // エレクトロン環境前提のため、条件分岐を削除
    this.electronAPI = (window as any).electronAPI;
  }
  
  /**
   * プロジェクト保存
   */
  async saveProject(projectData: ProjectData): Promise<string> {
    try {
      const filePath = await this.electronAPI.saveProject(projectData);
      return filePath;
    } catch (error) {
      console.error('UnifiedFileManager: プロジェクト保存エラー:', error);
      throw new Error(`プロジェクトの保存に失敗しました: ${error}`);
    }
  }
  
  /**
   * プロジェクト読み込み
   */
  async loadProject(): Promise<ProjectData> {
    try {
      const projectData = await this.electronAPI.loadProject();
      return projectData;
    } catch (error) {
      console.error('UnifiedFileManager: プロジェクト読み込みエラー:', error);
      throw new Error(`プロジェクトの読み込みに失敗しました: ${error}`);
    }
  }
  
  /**
   * ビデオファイル選択
   */
  async selectVideoFile(): Promise<MediaFileInfo> {
    try {
      const mediaInfo = await this.electronAPI.selectMedia('video');
      return mediaInfo;
    } catch (error) {
      console.error('UnifiedFileManager: ビデオファイル選択エラー:', error);
      throw new Error(`ビデオファイルの選択に失敗しました: ${error}`);
    }
  }
  
  /**
   * オーディオファイル選択
   */
  async selectAudioFile(): Promise<MediaFileInfo> {
    try {
      const mediaInfo = await this.electronAPI.selectMedia('audio');
      return mediaInfo;
    } catch (error) {
      console.error('UnifiedFileManager: オーディオファイル選択エラー:', error);
      throw new Error(`オーディオファイルの選択に失敗しました: ${error}`);
    }
  }
  
  /**
   * ローカルファイルパスの正規化（Electronネイティブ用）
   * @deprecated URLを使用せず、直接ファイルパスを使用してください
   */
  normalizeFilePath(localPath: string): string {
    if (!localPath) return '';
    
    // file:// プロトコルを除去
    if (localPath.startsWith('file://')) {
      return localPath.replace(/^file:\/\/\/?/, '');
    }
    
    return localPath;
  }
  
  /**
   * ローカルファイルパスか判定
   */
  isLocalFile(path: string): boolean {
    return path.startsWith('/') || 
           path.match(/^[A-Za-z]:\\/) || 
           path.startsWith('file://');
  }
  
  /**
   * アプリケーション情報取得
   */
  async getAppVersion(): Promise<string> {
    return await this.electronAPI.getAppVersion();
  }
  
  /**
   * アプリケーションパス取得
   */
  async getAppPath(name: string): Promise<string> {
    return await this.electronAPI.getAppPath(name);
  }
  
  /**
   * プラットフォーム名取得
   */
  get platform(): string {
    return this.electronAPI.platform;
  }
  
  /**
   * 開発者ツール表示
   */
  openDevTools(): void {
    this.electronAPI.openDevTools();
  }
}

// グローバルインスタンス（シングルトン）
export const unifiedFileManager = new UnifiedFileManager();