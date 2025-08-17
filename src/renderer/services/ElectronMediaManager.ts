// エレクトロン専用メディアファイル管理

import { unifiedFileManager } from './UnifiedFileManager';

export class ElectronMediaManager {
  private backgroundVideo: HTMLVideoElement | null = null;
  private backgroundAudio: HTMLAudioElement | null = null;
  private currentAudioFilePath: string | null = null;
  private currentVideoFilePath: string | null = null;
  private currentVideoTexture: any | null = null; // PIXI.Textureの参照を保持
  
  // エレクトロン環境前提のため、可用性チェックは不要
  
  async loadBackgroundVideo(): Promise<{ video: HTMLVideoElement; fileName: string } | null> {
    return this.loadMediaFile('video');
  }
  
  async loadBackgroundAudio(): Promise<{ audio: HTMLAudioElement; fileName: string } | null> {
    return this.loadMediaFile('audio');
  }
  
  getBackgroundVideo(): HTMLVideoElement | null {
    return this.backgroundVideo;
  }
  
  getBackgroundAudio(): HTMLAudioElement | null {
    return this.backgroundAudio;
  }
  
  getCurrentAudioFilePath(): string | null {
    return this.currentAudioFilePath;
  }
  
  
  getCurrentVideoFilePath(): string | null {
    return this.currentVideoFilePath;
  }
  

  // 音楽ファイルの復元機能 - 改善版
  async restoreAudioFile(originalFileName: string, savedFilePath?: string): Promise<{ audio: HTMLAudioElement; fileName: string } | null> {
    try {
      console.log(`[ElectronMediaManager] ===== 音楽ファイル復元開始 =====`);
      console.log(`[ElectronMediaManager] originalFileName: "${originalFileName}"`);
      console.log(`[ElectronMediaManager] savedFilePath: "${savedFilePath}"`);
      
      // 保存されたファイルパスがある場合は直接読み込みを試行
      if (savedFilePath) {
        try {
          console.log(`[ElectronMediaManager] 保存されたパスの存在確認中: ${savedFilePath}`);
          const fileExists = await window.electronAPI.checkFileExists(savedFilePath);
          console.log(`[ElectronMediaManager] ファイル存在確認結果: ${fileExists}`);
          if (fileExists) {
            console.log(`[ElectronMediaManager] 保存されたパスから読み込み実行: ${savedFilePath}`);
            const result = await this.loadMediaFileFromPath(savedFilePath, 'audio');
            console.log(`[ElectronMediaManager] 保存されたパスからの読み込み成功: ${result?.fileName}`);
            return result;
          } else {
            console.warn(`[ElectronMediaManager] 保存されたファイルが見つかりません: ${savedFilePath}`);
          }
        } catch (error) {
          console.warn(`[ElectronMediaManager] 保存されたパスからの読み込みに失敗: ${savedFilePath}`, error);
        }
      } else {
        console.log(`[ElectronMediaManager] 保存されたファイルパスがありません`);
      }
      
      // 最近使用したファイルから同じ名前のファイルを検索
      try {
        console.log(`[ElectronMediaManager] 最近使用したファイルから検索中...`);
        const recentFiles = await this.getRecentFiles('audio');
        console.log(`[ElectronMediaManager] 最近使用したファイル一覧:`, recentFiles.map(f => ({
          fileName: f.fileName,
          filePath: f.filePath,
          timestamp: new Date(f.timestamp).toISOString()
        })));
        
        const matchingFile = recentFiles.find(file => 
          file.fileName === originalFileName || file.filePath.includes(originalFileName)
        );
        console.log(`[ElectronMediaManager] マッチングファイル検索結果:`, matchingFile ? {
          fileName: matchingFile.fileName,
          filePath: matchingFile.filePath,
          matchType: matchingFile.fileName === originalFileName ? 'exact' : 'partial'
        } : 'なし');
        
        if (matchingFile) {
          console.log(`[ElectronMediaManager] マッチングファイルの存在確認中: ${matchingFile.filePath}`);
          const fileExists = await window.electronAPI.checkFileExists(matchingFile.filePath);
          console.log(`[ElectronMediaManager] マッチングファイル存在確認結果: ${fileExists}`);
          if (fileExists) {
            console.log(`[ElectronMediaManager] マッチングファイルから読み込み実行: ${matchingFile.filePath}`);
            const result = await this.loadMediaFileFromPath(matchingFile.filePath, 'audio');
            console.log(`[ElectronMediaManager] マッチングファイルからの読み込み成功: ${result.fileName}`);
            return result;
          } else {
            console.warn(`[ElectronMediaManager] マッチングファイルが存在しません: ${matchingFile.filePath}`);
          }
        } else {
          console.log(`[ElectronMediaManager] 最近使用したファイルから一致するファイルが見つかりませんでした`);
        }
      } catch (error) {
        console.warn(`[ElectronMediaManager] 最近使用したファイルからの復元に失敗:`, error);
      }
      
      // ファイルが見つからない場合、ユーザーに再選択を求める（通知付き）
      const message = `音楽ファイル "${originalFileName}" が見つかりません。\n同じファイルを選択してください。`;
      if (window.confirm(message)) {
        const mediaInfo = await unifiedFileManager.selectAudioFile();
        return await this.loadMediaFileFromPath(mediaInfo.path, 'audio');
      }
      
      return null;
      
    } catch (error) {
      console.error(`ElectronMediaManager: 音楽ファイル復元に失敗:`, error);
      throw error;
    }
  }
  
  // 背景動画ファイルの復元機能 - 改善版
  async restoreBackgroundVideo(originalFileName: string, savedFilePath?: string): Promise<{ video: HTMLVideoElement; fileName: string } | null> {
    try {
      
      // 保存されたファイルパスがある場合は直接読み込みを試行
      if (savedFilePath) {
        try {
          const fileExists = await window.electronAPI.checkFileExists(savedFilePath);
          if (fileExists) {
            return await this.loadMediaFileFromPath(savedFilePath, 'video');
          } else {
            console.warn(`ElectronMediaManager: 保存されたファイルが見つかりません: ${savedFilePath}`);
          }
        } catch (error) {
          console.warn(`ElectronMediaManager: 保存されたパスからの読み込みに失敗: ${savedFilePath}`, error);
        }
      }
      
      // 最近使用したファイルから同じ名前のファイルを検索
      try {
        const recentFiles = await this.getRecentFiles('backgroundVideo');
        const matchingFile = recentFiles.find(file => 
          file.fileName === originalFileName || file.filePath.includes(originalFileName)
        );
        
        if (matchingFile) {
          const fileExists = await window.electronAPI.checkFileExists(matchingFile.filePath);
          if (fileExists) {
            return await this.loadMediaFileFromPath(matchingFile.filePath, 'video');
          }
        }
      } catch (error) {
        console.warn(`ElectronMediaManager: 最近使用したファイルからの復元に失敗:`, error);
      }
      
      // ファイルが見つからない場合、ユーザーに再選択を求める（通知付き）
      const message = `背景動画 "${originalFileName}" が見つかりません。\n同じファイルを選択してください。`;
      if (window.confirm(message)) {
        const mediaInfo = await unifiedFileManager.selectVideoFile();
        return await this.loadMediaFileFromPath(mediaInfo.path, 'video');
      }
      
      return null;
      
    } catch (error) {
      console.error(`ElectronMediaManager: 背景動画復元に失敗:`, error);
      throw error;
    }
  }
  
  // PixiJS VideoTextureとの統合
  createPixiVideoTexture(): any | null {
    if (!this.backgroundVideo) {
      return null;
    }
    
    try {
      // 既存のテクスチャがある場合は破棄
      if (this.currentVideoTexture) {
        this.currentVideoTexture.destroy(true); // baseTextureも含めて破棄
        this.currentVideoTexture = null;
      }
      
      // PixiJS VideoTextureを作成（型を緩くしてエラーを回避）
      const PIXI = (window as any).PIXI;
      if (PIXI && PIXI.Texture) {
        const videoTexture = PIXI.Texture.from(this.backgroundVideo);
        this.currentVideoTexture = videoTexture; // 参照を保持
        return videoTexture;
      } else {
        console.warn('PIXI not available');
        return null;
      }
    } catch (error) {
      console.error('Failed to create PIXI VideoTexture:', error);
      return null;
    }
  }
  
  // メディア再生制御
  playMedia() {
    if (this.backgroundVideo) {
      this.backgroundVideo.play().catch(console.error);
    }
    if (this.backgroundAudio) {
      this.backgroundAudio.play().catch(console.error);
    }
  }
  
  pauseMedia() {
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
    }
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
    }
  }
  
  seekMedia(timeSeconds: number) {
    if (this.backgroundVideo) {
      this.backgroundVideo.currentTime = timeSeconds;
    }
    if (this.backgroundAudio) {
      this.backgroundAudio.currentTime = timeSeconds;
    }
  }
  
  // クリーンアップ
  cleanup() {
    // VideoTextureの破棄
    if (this.currentVideoTexture) {
      this.currentVideoTexture.destroy(true);
      this.currentVideoTexture = null;
    }
    
    // HTMLVideoElementの完全なクリーンアップ
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
      this.backgroundVideo.removeAttribute('src'); // srcを完全に削除
      this.backgroundVideo.load(); // 内部バッファをクリア
      this.backgroundVideo = null;
    }
    
    // HTMLAudioElementの完全なクリーンアップ
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
      this.backgroundAudio.removeAttribute('src'); // srcを完全に削除
      this.backgroundAudio.load(); // 内部バッファをクリア
      this.backgroundAudio = null;
    }
    
    this.currentAudioFilePath = null;
    this.currentVideoFilePath = null;
  }

  // 統一されたメディアファイル読み込みメソッド
  private async loadMediaFile(type: 'video' | 'audio'): Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string } | null> {
    try {
      
      // ファイル選択
      const mediaInfo = type === 'video' 
        ? await unifiedFileManager.selectVideoFile()
        : await unifiedFileManager.selectAudioFile();
      
      
      // ファイル名を取得
      const fileName = mediaInfo.path.split('/').pop() || mediaInfo.path.split('\\').pop() || 'unknown';
      const filePath = mediaInfo.path;
      
      console.log(`[ElectronMediaManager] ===== 新しい${type}ファイル読み込み =====`);
      console.log(`[ElectronMediaManager] 選択されたファイルパス: "${filePath}"`);
      console.log(`[ElectronMediaManager] ファイル名: "${fileName}"`);
      console.log(`[ElectronMediaManager] mediaInfo:`, mediaInfo);
      
      
      // メディア要素を作成
      const mediaElement = type === 'video' 
        ? document.createElement('video') as HTMLVideoElement
        : document.createElement('audio') as HTMLAudioElement;
      
      mediaElement.preload = 'metadata';
      if (type === 'video') {
        (mediaElement as HTMLVideoElement).muted = true; // 動画は常にミュート
      }
      
      // メディアファイル読み込み（Promise化）
      const loadResult = await new Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string }>((resolve, reject) => {
        mediaElement.onloadedmetadata = async () => {
          try {
            
            // メディア要素をインスタンス変数に保存する前に古いものをクリーンアップ
            if (type === 'video') {
              // 既存のVideoTextureを破棄
              if (this.currentVideoTexture) {
                this.currentVideoTexture.destroy(true);
                this.currentVideoTexture = null;
              }
              // 既存のHTMLVideoElementをクリーンアップ
              if (this.backgroundVideo) {
                this.backgroundVideo.pause();
                this.backgroundVideo.removeAttribute('src');
                this.backgroundVideo.load();
              }
              
              this.backgroundVideo = mediaElement as HTMLVideoElement;
              this.currentVideoFilePath = filePath;
            } else {
              // 既存のHTMLAudioElementをクリーンアップ
              if (this.backgroundAudio) {
                this.backgroundAudio.pause();
                this.backgroundAudio.removeAttribute('src');
                this.backgroundAudio.load();
              }
              
              this.backgroundAudio = mediaElement as HTMLAudioElement;
              this.currentAudioFilePath = filePath;
            }
            
            // 最近使用したファイルに追加（読み込み成功後）
            const recentFileType = type === 'video' ? 'backgroundVideo' : 'audio';
            console.log(`[ElectronMediaManager] 最近使用したファイルに追加: ${recentFileType}, fileName: "${fileName}", path: "${mediaInfo.path}"`);
            await this.addToRecentFiles(recentFileType, fileName, mediaInfo.path);
            
            // 結果を返す
            const result = type === 'video' 
              ? { video: mediaElement as HTMLVideoElement, fileName }
              : { audio: mediaElement as HTMLAudioElement, fileName };
            
            resolve(result);
          } catch (error) {
            console.error(`ElectronMediaManager: Error during ${type} processing:`, error);
            reject(error);
          }
        };
        
        mediaElement.onerror = (error) => {
          console.error(`ElectronMediaManager: ${type} load error:`, error);
          reject(new Error(`Failed to load ${type} file: ${fileName}`));
        };
        
        // ElectronでHTMLメディア要素を使用する場合、file://プロトコルが必要
        // パスコンポーネントのみをエンコード（file://プロトコルはエンコードしない）
        const fileUrl = 'file://' + encodeURI(filePath.replace(/\\/g, '/'));
        mediaElement.src = fileUrl;
      });
      
      return loadResult;
      
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to load ${type} file:`, error);
      throw error;
    }
  }

  // 最近使用したファイルに追加
  private async addToRecentFiles(type: 'audio' | 'backgroundVideo', fileName: string, filePath: string): Promise<void> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.error('ElectronMediaManager: electronAPI not available in addToRecentFiles');
        return;
      }

      let result;
      if (type === 'audio') {
        result = await electronAPI.persistence.addRecentAudio(fileName, filePath);
      } else {
        result = await electronAPI.persistence.addRecentBackgroundVideo(fileName, filePath);
      }
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to add recent file (${type}):`, error);
    }
  }

  // 最近使用したファイルを取得
  async getRecentFiles(type: 'audio' | 'backgroundVideo'): Promise<Array<{fileName: string, filePath: string, timestamp: number}>> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.error('ElectronMediaManager: electronAPI not available');
        return [];
      }


      const result = type === 'audio' 
        ? await electronAPI.persistence.getRecentAudio()
        : await electronAPI.persistence.getRecentBackgroundVideo();


      const finalResult = result.success ? (result.files || []) : [];
      return finalResult;
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to get recent files for ${type}:`, error);
      return [];
    }
  }

  // 最近使用したファイルから音楽ファイルを読み込み
  async loadRecentAudioFile(filePath: string): Promise<{ audio: HTMLAudioElement; fileName: string } | null> {
    return this.loadRecentMediaFile('audio', filePath);
  }

  // 最近使用したファイルから背景動画を読み込み
  async loadRecentBackgroundVideo(filePath: string): Promise<{ video: HTMLVideoElement; fileName: string } | null> {
    return this.loadRecentMediaFile('video', filePath);
  }

  // ファイルパスから直接メディアファイルを読み込むメソッド（復元機能で使用）
  private async loadMediaFileFromPath(filePath: string, type: 'video' | 'audio'): Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string }> {
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
    
    
    // メディア要素を作成
    const mediaElement = type === 'video' 
      ? document.createElement('video') as HTMLVideoElement
      : document.createElement('audio') as HTMLAudioElement;
    
    mediaElement.preload = 'metadata';
    if (type === 'video') {
      (mediaElement as HTMLVideoElement).muted = true; // 動画は常にミュート
    }
    
    // メディアファイル読み込み（Promise化）
    return new Promise((resolve, reject) => {
      mediaElement.onloadedmetadata = async () => {
        try {
          
          // メディア要素をインスタンス変数に保存
          if (type === 'video') {
            this.backgroundVideo = mediaElement as HTMLVideoElement;
            this.currentVideoFilePath = filePath;
          } else {
            this.backgroundAudio = mediaElement as HTMLAudioElement;
            this.currentAudioFilePath = filePath;
          }
          
          // 最近使用したファイルに追加
          const recentFileType = type === 'video' ? 'backgroundVideo' : 'audio';
          await this.addToRecentFiles(recentFileType, fileName, filePath);
          
          // 結果を返す
          const result = type === 'video' 
            ? { video: mediaElement as HTMLVideoElement, fileName }
            : { audio: mediaElement as HTMLAudioElement, fileName };
          
          resolve(result);
        } catch (error) {
          console.error(`ElectronMediaManager: Error during ${type} processing from path:`, error);
          reject(error);
        }
      };
      
      mediaElement.onerror = (error) => {
        console.error(`ElectronMediaManager: ${type} load error from path:`, error);
        reject(new Error(`Failed to load ${type} file from path: ${filePath}`));
      };
      
      // ElectronでHTMLメディア要素を使用する場合、file://プロトコルが必要
      const fileUrl = 'file://' + encodeURI(filePath.replace(/\\/g, '/'));
      mediaElement.src = fileUrl;
    });
  }

  // 統一された最近使用したファイル読み込みメソッド
  private async loadRecentMediaFile(type: 'video' | 'audio', filePath: string): Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string } | null> {
    try {
      
      // ファイル名を取得
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
      
      
      // メディア要素を作成
      const mediaElement = type === 'video' 
        ? document.createElement('video') as HTMLVideoElement
        : document.createElement('audio') as HTMLAudioElement;
      
      mediaElement.preload = 'metadata';
      if (type === 'video') {
        (mediaElement as HTMLVideoElement).muted = true; // 動画は常にミュート
      }
      
      // メディアファイル読み込み（Promise化）
      const loadResult = await new Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string }>((resolve, reject) => {
        mediaElement.onloadedmetadata = async () => {
          try {
            // メディア要素をインスタンス変数に保存する前に古いものをクリーンアップ
            if (type === 'video') {
              // 既存のVideoTextureを破棄
              if (this.currentVideoTexture) {
                this.currentVideoTexture.destroy(true);
                this.currentVideoTexture = null;
              }
              // 既存のHTMLVideoElementをクリーンアップ
              if (this.backgroundVideo) {
                this.backgroundVideo.pause();
                this.backgroundVideo.removeAttribute('src');
                this.backgroundVideo.load();
              }
              
              this.backgroundVideo = mediaElement as HTMLVideoElement;
              this.currentVideoFilePath = filePath;
            } else {
              // 既存のHTMLAudioElementをクリーンアップ
              if (this.backgroundAudio) {
                this.backgroundAudio.pause();
                this.backgroundAudio.removeAttribute('src');
                this.backgroundAudio.load();
              }
              
              this.backgroundAudio = mediaElement as HTMLAudioElement;
              this.currentAudioFilePath = filePath;
            }
            
            // 最近使用したファイルに追加（リストの先頭に移動）
            const recentFileType = type === 'video' ? 'backgroundVideo' : 'audio';
            await this.addToRecentFiles(recentFileType, fileName, filePath);
            
            // 結果を返す
            const result = type === 'video' 
              ? { video: mediaElement as HTMLVideoElement, fileName }
              : { audio: mediaElement as HTMLAudioElement, fileName };
            
            resolve(result);
          } catch (error) {
            console.error(`ElectronMediaManager: Error during recent ${type} processing:`, error);
            reject(error);
          }
        };
        
        mediaElement.onerror = (error) => {
          console.error(`ElectronMediaManager: Recent ${type} load error:`, error);
          console.error(`ElectronMediaManager: Failed file path: ${filePath}`);
          console.error(`ElectronMediaManager: File URL: ${fileUrl}`);
          console.error(`ElectronMediaManager: Media element:`, mediaElement);
          reject(new Error(`Failed to load recent ${type} file: ${fileName} from ${filePath}`));
        };
        
        // ElectronでHTMLメディア要素を使用する場合、file://プロトコルが必要
        const fileUrl = 'file://' + encodeURI(filePath.replace(/\\/g, '/'));
        mediaElement.src = fileUrl;
      });
      
      return loadResult;
      
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to load recent ${type} file:`, error);
      throw error;
    }
  }
}

// グローバルインスタンス
export const electronMediaManager = new ElectronMediaManager();