/**
 * FontLoader - ElectronネイティブアプリでシステムフォントをPIXI.jsで使用可能にする
 * 
 * システムフォントファイルを直接読み込み、CSS @font-face として登録することで
 * PIXI.jsでも使用可能にする
 */

import { FontInfo } from '../../shared/types';
import { persistenceService } from '../services/PersistenceService';

export class FontLoader {
  private static loadedFonts: Set<string> = new Set();
  private static loadedFamilies: Set<string> = new Set();
  private static failedFonts: Set<string> = new Set();
  private static styleElement: HTMLStyleElement | null = null;
  private static loadingPromises: Map<string, Promise<boolean>> = new Map();
  private static dynamicBlacklist: Set<string> = new Set();
  private static blacklistLoaded: boolean = false;
  
  // 問題のあるフォントのブラックリスト（デフォルトは空）
  // 環境依存の問題は動的ブラックリストで対応
  private static PROBLEMATIC_FONTS: string[] = [];

  /**
   * 初期化
   */
  static async initialize(): Promise<void> {
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      document.head.appendChild(this.styleElement);
    }
    
    // 動的ブラックリストを読み込み（初回のみ）
    if (!this.blacklistLoaded) {
      await this.loadDynamicBlacklist();
      this.blacklistLoaded = true;
    }
  }

  /**
   * システムフォントをCSS @font-face として登録
   * @param fontInfo フォント情報
   * @returns 登録成功した場合true
   */
  static async loadSystemFont(fontInfo: FontInfo): Promise<boolean> {
    if (!fontInfo.path) {
      console.warn(`[FontLoader] フォントパスが指定されていません: ${fontInfo.family}`);
      return false;
    }

    // 問題のあるフォントをスキップ（デフォルトブラックリストと動的ブラックリストの両方をチェック）
    if (this.PROBLEMATIC_FONTS.some(prob => fontInfo.family.includes(prob))) {
      return false;
    }

    // フォントの一意なキーを生成（family + weight + style）
    const fontKey = this.getFontKey(fontInfo);
    
    // 既に読み込み済みの場合はスキップ
    if (this.loadedFonts.has(fontKey)) {
      return true;
    }
    
    // 既に失敗したフォントの場合はスキップ（サイレント）
    if (this.failedFonts.has(fontKey)) {
      return false;
    }
    
    // 現在読み込み中の場合は、その Promise を返す
    if (this.loadingPromises.has(fontKey)) {
      return this.loadingPromises.get(fontKey)!;
    }

    // 読み込み処理をPromiseでラップして、重複を防ぐ
    const loadPromise = (async () => {
      try {
        const fontUrl = this.toFileUrl(fontInfo.path);
        const weight = this.getFontWeightDescriptor(fontInfo);
        const style = fontInfo.style.toLowerCase().includes('italic') ? 'italic' : 'normal';
        const source = `url(${JSON.stringify(fontUrl)}) format("${this.getFontFormat(fontInfo.path)}")`;

        if (!('fonts' in document) || typeof FontFace === 'undefined') {
          throw new Error('CSS Font Loading API が利用できません');
        }

        // FontFaceを直接登録し、ロード完了後にだけPIXIへ利用可能と通知する。
        // CSS文字列へのWindowsパス埋め込みではバックスラッシュがエスケープ扱いになる。
        const fontFace = new FontFace(fontInfo.family, source, { weight, style });
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        const fontSpecWeight = weight.includes(' ') ? '400' : weight;
        const fontSpec = `${style} ${fontSpecWeight} 12px ${JSON.stringify(fontInfo.family)}`;
        await document.fonts.load(fontSpec);
        if (!document.fonts.check(fontSpec)) {
          throw new Error(`登録後のフォント確認に失敗しました: ${fontSpec}`);
        }

        this.loadedFonts.add(fontKey);
        this.loadedFamilies.add(fontInfo.family);
        return true;

      } catch (error) {
        // 失敗したフォントをキャッシュ
        this.failedFonts.add(fontKey);
        console.error(`[FontLoader] フォント読み込みエラー: ${fontInfo.family} (${fontInfo.weight} ${fontInfo.style})`, error);
        console.error(`[FontLoader] フォントパス: ${fontInfo.path}`);
        return false;
      } finally {
        // 読み込み完了後、Promise を削除
        this.loadingPromises.delete(fontKey);
      }
    })();
    
    // Promise をマップに保存
    this.loadingPromises.set(fontKey, loadPromise);
    return loadPromise;
  }

  /**
   * 複数のシステムフォントを一括読み込み
   * @param fontInfos フォント情報の配列
   * @returns 読み込み成功したフォント名の配列
   */
  static async loadSystemFonts(fontInfos: FontInfo[]): Promise<string[]> {
    this.initialize();
    
    // フォントファイルパスでグループ化して、同じファイルへの同時アクセスを減らす
    const fontsByPath = new Map<string, FontInfo[]>();
    fontInfos.forEach(fontInfo => {
      if (fontInfo.path) {
        const path = fontInfo.path;
        if (!fontsByPath.has(path)) {
          fontsByPath.set(path, []);
        }
        fontsByPath.get(path)!.push(fontInfo);
      }
    });
    
    const loadedFonts: string[] = [];
    
    // .ttc ファイルは順次処理、それ以外は並列処理
    const ttcPaths = Array.from(fontsByPath.keys()).filter(path => path.toLowerCase().endsWith('.ttc'));
    const otherPaths = Array.from(fontsByPath.keys()).filter(path => !path.toLowerCase().endsWith('.ttc'));
    
    // .ttc ファイルのフォントを順次処理
    for (const ttcPath of ttcPaths) {
      const fonts = fontsByPath.get(ttcPath)!;
      for (const fontInfo of fonts) {
        const success = await this.loadSystemFont(fontInfo);
        if (success) {
          loadedFonts.push(fontInfo.family);
        }
      }
    }
    
    // その他のフォントは並列処理
    const otherPromises = otherPaths.flatMap(path => {
      const fonts = fontsByPath.get(path)!;
      return fonts.map(async (fontInfo) => {
        const success = await this.loadSystemFont(fontInfo);
        if (success) {
          loadedFonts.push(fontInfo.family);
        }
      });
    });
    
    await Promise.all(otherPromises);
    
    // 重複を除去して返す
    return [...new Set(loadedFonts)];
  }

  /**
   * フォントファイルの形式を判定
   * @param filePath フォントファイルパス
   * @returns フォント形式
   */
  private static getFontFormat(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    switch (ext) {
      case 'ttf': return 'truetype';
      case 'otf': return 'opentype';
      case 'woff': return 'woff';
      case 'woff2': return 'woff2';
      case 'ttc': return 'truetype';
      default: return 'truetype';
    }
  }

  /** Windows/macOS/Linuxの絶対パスをCSSで利用できるfile URLへ変換する。 */
  private static toFileUrl(filePath: string): string {
    if (/^file:\/\//i.test(filePath)) return filePath;

    const normalized = filePath.replace(/\\/g, '/');
    const encoded = normalized
      .split('/')
      .map((segment, index) => {
        if (index === 0 && /^[a-z]:$/i.test(segment)) return segment;
        return encodeURIComponent(segment);
      })
      .join('/');

    if (normalized.startsWith('//')) return `file:${encoded}`;
    if (normalized.startsWith('/')) return `file://${encoded}`;
    return `file:///${encoded}`;
  }

  private static getFontWeightDescriptor(fontInfo: FontInfo): string {
    if (fontInfo.variable || /variablefont|(?:^|[_-])wght(?:[_,-]|$)|\[.*wght.*\]/i.test(fontInfo.path || '')) {
      return '100 900';
    }
    return fontInfo.weight || 'normal';
  }

  /**
   * フォントが読み込み済みかチェック
   * @param fontFamily フォントファミリー名
   * @returns 読み込み済みの場合true
   */
  static isLoaded(fontFamily: string): boolean {
    return this.loadedFamilies.has(fontFamily);
  }

  /**
   * 読み込み済みフォントのリストを取得
   * @returns フォントファミリー名の配列
   */
  static getLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }

  /**
   * フォントの一意なキーを生成
   * @param fontInfo フォント情報
   * @returns フォントの一意なキー
   */
  private static getFontKey(fontInfo: FontInfo): string {
    const weight = fontInfo.weight || 'normal';
    const style = fontInfo.style === 'Italic' ? 'italic' : 'normal';
    return `${fontInfo.family}_${weight}_${style}`;
  }
  
  /**
   * デバッグ情報を出力
   */
  static debug(): void {
    if (this.styleElement) {
      // Check font-face count for debugging
    }
  }

  /**
   * 動的ブラックリストを読み込み
   */
  private static async loadDynamicBlacklist(): Promise<void> {
    try {
      const data = await persistenceService.loadFontBlacklist();
      if (data && data.blacklist) {
        data.blacklist.forEach(entry => {
          this.dynamicBlacklist.add(entry.fontFamily);
        });
      }
    } catch (error) {
      console.error('[FontLoader] 動的ブラックリスト読み込みエラー:', error);
    }
  }
  
  /**
   * 動的ブラックリストを保存
   */
  private static async saveDynamicBlacklist(): Promise<void> {
    try {
      const blacklist = Array.from(this.dynamicBlacklist).map(fontFamily => ({
        fontFamily,
        fontKey: fontFamily,
        reason: 'load_error',
        timestamp: Date.now()
      }));
      
      await persistenceService.saveFontBlacklist(blacklist);
    } catch (error) {
      console.error('[FontLoader] 動的ブラックリスト保存エラー:', error);
    }
  }

  /**
   * Electronプロセス間通信でフォント情報を取得して読み込み
   * @param fontFamilies 読み込みたいフォントファミリー名の配列
   */
  static async loadElectronFonts(fontFamilies: string[]): Promise<void> {
    try {
      // システムフォント情報を取得
      const systemFonts = await (window as any).electronAPI.getSystemFonts();
      
      // 指定されたフォントファミリーに一致するフォント情報を抽出
      const targetFonts = systemFonts.filter((font: FontInfo) => 
        fontFamilies.includes(font.family)
      );

      // フォントを読み込み
      const loaded = await this.loadSystemFonts(targetFonts);
      
    } catch (error) {
      console.error('[FontLoader] Electronフォント読み込みエラー:', error);
    }
  }

  /**
   * 動的ブラックリストとキャッシュをクリア
   */
  static clearBlacklist(): void {
    this.dynamicBlacklist.clear();
    this.failedFonts.clear();
  }

  /**
   * 現在のブラックリストを取得
   */
  static getBlacklist(): string[] {
    return Array.from(this.dynamicBlacklist);
  }

  /**
   * 失敗したフォントのリストを取得
   */
  static getFailedFonts(): string[] {
    return Array.from(this.failedFonts);
  }
}
