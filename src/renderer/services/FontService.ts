/**
 * FontService - Electronネイティブ環境での統一フォント管理サービス
 * 
 * 全テンプレートが共通で使用するシンプルなフォント取得API
 * アプリケーション初期化時に一度だけシステムフォントを読み込み、
 * フォント検証を行い、実際に使用可能なフォントのみを提供
 * 以降は高速なメモリアクセスでフォント一覧を提供
 */

import { FontValidator } from '../utils/FontValidator';
import { FontLoader } from '../utils/FontLoader';
import { FontInfo } from '../../shared/types';

export interface FontOption {
  value: string;
  label: string;
}

export interface FontFamily {
  family: string;
  styles: FontStyle[];
}

export interface FontStyle {
  style: string;
  weight: string;
  fullName: string;
  displayName: string;
  variable: boolean;
}

export interface FontWeightOption {
  value: string;
  label: string;
}

const VARIABLE_WEIGHT_OPTIONS: FontWeightOption[] = [
  { value: '100', label: 'Thin (100)' },
  { value: '200', label: 'Extra Light (200)' },
  { value: '300', label: 'Light (300)' },
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semi Bold (600)' },
  { value: '700', label: 'Bold (700)' },
  { value: '800', label: 'Extra Bold (800)' },
  { value: '900', label: 'Black (900)' }
];

export class FontService {
  private static systemFonts: string[] = [];
  private static validatedFonts: string[] = [];
  private static fontInfoMap: Map<string, FontInfo> = new Map();
  private static fontFamilyMap: Map<string, FontInfo[]> = new Map();
  private static initialized: boolean = false;
  private static pickedFonts: Set<string> = new Set();
  // デフォルトフォントのフォールバックを削除
  // システムフォントが取得できない場合はエラーとして適切に処理する

  /**
   * フォントサービスの初期化
   * アプリケーション起動時に一度だけ呼び出す
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Electron環境の確認
      if (!(window as any).electronAPI?.getSystemFonts) {
        throw new Error('[FontService] Electron環境ではありません。システムフォントにアクセスできません。');
      }

      // システムフォントの取得
      const systemFontData: FontInfo[] = await (window as any).electronAPI.getSystemFonts();

      // フォント情報をマップに保存し、フォントファミリーの重複を除去
      const fontFamilySet = new Set<string>();
      
      systemFontData.forEach((font: FontInfo) => {
        if (font.family && typeof font.family === 'string') {
          fontFamilySet.add(font.family);
          // フォント情報をマップに保存（パス情報を含む）
          this.fontInfoMap.set(font.family, font);
          
          // ファミリーごとのフォント情報を保存
          if (!this.fontFamilyMap.has(font.family)) {
            this.fontFamilyMap.set(font.family, []);
          }
          this.fontFamilyMap.get(font.family)!.push(font);
        }
      });

      // アルファベット順にソート
      this.systemFonts = Array.from(fontFamilySet).sort((a, b) => 
        a.localeCompare(b, 'ja', { sensitivity: 'base' })
      );


      // 一覧は即時に利用可能にし、フォントファイル自体は選択時に自動ロードする。
      // 全件の読み込み完了を待たないことで、エンジンと再生UIをブロックしない。
      await FontLoader.initialize();
      this.validatedFonts = [...this.systemFonts];
      this.initialized = true;

      // 初期描画で使用する標準フォントだけを先に確保する。
      await this.ensureFontLoaded('Arial');

      // 起動直後に先に表示されたフォント選択欄へ、一覧が使えるようになったことを通知する。
      window.dispatchEvent(new CustomEvent('fontSettingsChanged'));

    } catch (error) {
      console.error('[FontService] システムフォント取得エラー:', error);
      // エラーを再スローして上位で適切に処理
      throw error;
    }
  }

  /**
   * 全システムフォントを@font-faceとして登録
   * Electronネイティブアプリとして、全システムフォントをPIXI.jsで使用可能にする
   */
  private static async loadAllSystemFonts(): Promise<void> {
    // FontLoaderを初期化（動的ブラックリストの読み込みを含む）
    await FontLoader.initialize();
    
    // パス情報を持つフォントのみを抽出
    const fontsWithPath: FontInfo[] = [];
    this.systemFonts.forEach(fontFamily => {
      const fontInfo = this.fontInfoMap.get(fontFamily);
      if (fontInfo && fontInfo.path) {
        fontsWithPath.push(fontInfo);
      }
    });
    
    // フォントを@font-faceとして登録
    
    // .ttc ファイルの数をカウント
    const ttcCount = fontsWithPath.filter(f => f.path && f.path.toLowerCase().endsWith('.ttc')).length;
    if (ttcCount > 0) {
    }
    
    const loadedFonts = await FontLoader.loadSystemFonts(fontsWithPath);
    
    // 読み込み成功したフォントを検証済みリストに追加
    this.validatedFonts = loadedFonts.sort((a, b) => 
      a.localeCompare(b, 'ja', { sensitivity: 'base' })
    );
    
    // デフォルトフォントのフォールバックは使用しない
    // システムフォントのみを使用し、問題があれば明確にする
    
  }

  /**
   * 利用可能なフォント一覧を取得
   * @returns フォントオプションの配列
   */
  static getAvailableFonts(): FontOption[] {
    if (!this.initialized) {
      console.error('[FontService] フォントサービスが初期化されていません。initialize()を呼び出してください。');
      return [];
    }

    if (this.validatedFonts.length === 0) {
      console.error('[FontService] 利用可能なフォントがありません。システムフォントの読み込みに失敗しました。');
      return [];
    }

    return this.validatedFonts.map(fontFamily => ({
      value: fontFamily,
      label: fontFamily
    }));
  }

  /**
   * フォントファミリー名のリストを取得（後方互換性のため）
   * @returns フォントファミリー名の配列
   */
  static getFontFamilies(): string[] {
    return this.getAvailableFonts().map(font => font.value);
  }

  /**
   * フォントファミリーとそのスタイルを取得
   * @returns フォントファミリーとスタイル情報の配列
   */
  static getFontFamiliesWithStyles(): FontFamily[] {
    if (!this.initialized) {
      console.error('[FontService] フォントサービスが初期化されていません。initialize()を呼び出してください。');
      return [];
    }

    const fontFamilies: FontFamily[] = [];
    
    if (this.validatedFonts.length === 0) {
      console.warn('[FontService] No fonts available after filtering');
      return [];
    }
    
    this.validatedFonts.forEach(fontFamily => {
      const fontInfos = this.fontFamilyMap.get(fontFamily);
      if (fontInfos && fontInfos.length > 0) {
        const styles: FontStyle[] = fontInfos.map(font => ({
          style: font.style || 'Regular',
          weight: font.weight || 'Normal',
          fullName: font.fullName || font.family,
          displayName: this.createDisplayName(font.style, font.weight),
          variable: this.isVariableFont(font)
        }));

        // スタイルを重複除去してソート
        const uniqueStyles = styles.filter((style, index, self) => 
          index === self.findIndex(s => s.fullName === style.fullName)
        ).sort((a, b) => this.compareStyles(a, b));

        fontFamilies.push({
          family: fontFamily,
          styles: uniqueStyles
        });
      }
    });

    return fontFamilies.sort((a, b) => 
      a.family.localeCompare(b.family, 'ja', { sensitivity: 'base' })
    );
  }

  /**
   * 指定されたファミリーのスタイル一覧を取得
   * @param fontFamily フォントファミリー名
   * @returns そのファミリーのスタイル一覧
   */
  static getFontStyles(fontFamily: string): FontStyle[] {
    if (!this.initialized) {
      console.error('[FontService] フォントサービスが初期化されていません。');
      return [];
    }

    const fontInfos = this.fontFamilyMap.get(fontFamily);
    if (!fontInfos || fontInfos.length === 0) {
      return [];
    }

    const styles: FontStyle[] = fontInfos.map(font => ({
      style: font.style || 'Regular',
      weight: font.weight || 'Normal',
      fullName: font.fullName || font.family,
      displayName: this.createDisplayName(font.style, font.weight),
      variable: this.isVariableFont(font)
    }));

    // スタイルを重複除去してソート
    return styles.filter((style, index, self) => 
      index === self.findIndex(s => s.fullName === style.fullName)
    ).sort((a, b) => this.compareStyles(a, b));
  }

  static getFontWeightOptions(fontFamily: string): FontWeightOption[] {
    const variants = this.fontFamilyMap.get(fontFamily) || [];
    if (variants.some(font => this.isVariableFont(font))) {
      return VARIABLE_WEIGHT_OPTIONS;
    }

    const options = variants.map(font => {
      const value = this.normalizeFontWeight(font.weight, font.style);
      return {
        value,
        label: `${this.createDisplayName(font.style, font.weight)} (${value})`
      };
    });
    return options.filter((option, index, all) =>
      index === all.findIndex(candidate => candidate.value === option.value)
    ).sort((a, b) => Number(a.value) - Number(b.value));
  }

  /**
   * スタイル名の表示用文字列を作成
   * @param style スタイル
   * @param weight ウェイト
   * @returns 表示用文字列
   */
  private static createDisplayName(style?: string, weight?: string): string {
    const parts: string[] = [];

    // 数値ウェイトはラベル側で "(500)" のように併記するため、名前には含めない。
    if (weight && weight !== 'Normal' && weight !== 'Regular' && !/^\d+$/.test(weight)) {
      parts.push(weight);
    }
    
    if (style && style !== 'Regular' && style !== 'Normal') {
      parts.push(style);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Regular';
  }

  /**
   * スタイルの比較関数（ソート用）
   * @param a 比較対象A
   * @param b 比較対象B
   * @returns 比較結果
   */
  private static compareStyles(a: FontStyle, b: FontStyle): number {
    // まずウェイトで比較
    const weightOrder = ['Light', 'Regular', 'Normal', 'Medium', 'Bold', 'Heavy', 'Black'];
    const aWeightIndex = weightOrder.indexOf(a.weight);
    const bWeightIndex = weightOrder.indexOf(b.weight);
    
    if (aWeightIndex !== bWeightIndex) {
      return (aWeightIndex === -1 ? 999 : aWeightIndex) - (bWeightIndex === -1 ? 999 : bWeightIndex);
    }
    
    // 次にスタイルで比較
    return a.style.localeCompare(b.style, 'ja', { sensitivity: 'base' });
  }

  /**
   * ピックアップフォント設定を読み込み
   */
  private static loadPickedFonts(): void {
    try {
      const saved = localStorage.getItem('fontPickupSettings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.pickedFonts = new Set(settings.selectedFonts || []);
      }
    } catch (error) {
      console.error('[FontService] ピックアップフォント設定の読み込みに失敗しました:', error);
    }
  }

  /**
   * 全フォント表示設定を取得
   * @returns 全フォント表示するかどうか
   */
  private static getShowAllFonts(): boolean {
    try {
      const saved = localStorage.getItem('fontPickupSettings');
      if (saved) {
        const settings = JSON.parse(saved);
        return settings.showAllFonts !== false;
      }
    } catch (error) {
      console.error('[FontService] 設定の読み込みに失敗しました:', error);
    }
    return true; // デフォルトは全フォント表示
  }

  /**
   * ピックアップフォント設定を更新
   * @param selectedFonts 選択されたフォント一覧
   * @param showAllFonts 全フォント表示フラグ
   */
  static updatePickedFonts(selectedFonts: string[], _showAllFonts: boolean): void {
    // 互換API。現在はPCにインストール済みの全フォントを常に表示する。
    this.pickedFonts = new Set(selectedFonts);
  }

  /**
   * 現在のピックアップフォント設定を取得
   * @returns 現在の設定
   */
  static getPickedFontsSettings(): { selectedFonts: string[], showAllFonts: boolean } {
    return {
      selectedFonts: [...this.validatedFonts],
      showAllFonts: true
    };
  }

  /**
   * フォント設定を再読み込み（設定変更時に呼び出し）
   */
  static reloadFontSettings(): void {
    // 全システムフォント自動利用へ移行したため、手動設定の再読込は不要。
  }

  /**
   * 指定されたフォントが利用可能かチェック
   * @param fontFamily チェックするフォントファミリー名
   * @returns 利用可能な場合true
   */
  static isAvailable(fontFamily: string): boolean {
    return this.validatedFonts.includes(fontFamily) || 
           this.validatedFonts.includes(FontValidator.normalizeFontName(fontFamily));
  }

  /**
   * デフォルトフォントを取得
   * @returns デフォルトのフォントファミリー名（システムフォントから選択）
   */
  static getDefaultFont(): string {
    if (this.validatedFonts.length === 0) {
      throw new Error('[FontService] 利用可能なフォントがありません');
    }
    // システムフォントの最初のフォントを返す
    return this.validatedFonts[0];
  }

  /**
   * フォントサービスが初期化済みかチェック
   * @returns 初期化済みの場合true
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * デバッグ用：現在の状態を出力
   */
  static debug(): void {
    
    // FontValidatorとFontLoaderのデバッグ情報も出力
    FontValidator.debug();
    FontLoader.debug();
  }

  /**
   * フォント正規化機能のテスト（デバッグ用）
   * @param fontFamily テストするフォント名
   */
  static testFontNormalization(fontFamily: string): void {
    const info = FontValidator.getFontInfo(fontFamily);
  }

  /**
   * フォント読み込みを再試行（ブラックリストクリア後）
   */
  static async retryFontLoading(): Promise<void> {
    if (!this.initialized) {
      console.error('[FontService] フォントサービスが初期化されていません');
      return;
    }

    
    // ブラックリストをクリア
    FontLoader.clearBlacklist();
    
    // 再度フォントを読み込み
    await this.loadAllSystemFonts();
    
  }

  /**
   * フォント読み込みの詳細情報を取得
   */
  static getFontLoadingInfo(): {
    totalSystemFonts: number;
    validatedFonts: number;
    blacklistedFonts: number;
    failedFonts: number;
    sampleSystemFonts: string[];
    sampleValidatedFonts: string[];
    blacklistedFontList: string[];
    failedFontList: string[];
  } {
    return {
      totalSystemFonts: this.systemFonts.length,
      validatedFonts: this.validatedFonts.length,
      blacklistedFonts: FontLoader.getBlacklist().length,
      failedFonts: FontLoader.getFailedFonts().length,
      sampleSystemFonts: this.systemFonts.slice(0, 10),
      sampleValidatedFonts: this.validatedFonts.slice(0, 10),
      blacklistedFontList: FontLoader.getBlacklist(),
      failedFontList: FontLoader.getFailedFonts()
    };
  }

  /**
   * 特定のフォントが読み込まれていることを確保する
   * @param fontFamily フォントファミリー名
   * @returns フォント読み込み完了のPromise
   */
  static async ensureFontLoaded(fontFamily: string, fontWeight?: string): Promise<void> {
    if (!this.initialized) {
      console.warn('[FontService] フォントサービスが未初期化のため、フォント確保をスキップします');
      return;
    }

    const resolvedFamily = this.resolveFontFamily(fontFamily);
    if (!resolvedFamily) {
      console.warn(`[FontService] フォント ${fontFamily} はシステムに存在しません`);
      return;
    }
    if (!fontWeight && FontLoader.isLoaded(resolvedFamily)) {
      return;
    }
    try {
      const variants = this.fontFamilyMap.get(resolvedFamily) || [];
      const preferred = variants.find(font => this.isVariableFont(font) && font.path)
        || variants.find(font => fontWeight
          && this.normalizeFontWeight(font.weight, font.style) === fontWeight
          && font.path)
        || variants.find(font => font.style === 'Regular' && font.path)
        || variants.find(font => font.path);
      // Web-safeフォントなどパスを持たないものはChromiumのネイティブ解決に任せる。
      if (preferred) {
        const loaded = await FontLoader.loadSystemFont(preferred);
        if (!loaded) {
          throw new Error(`フォントファイルを読み込めませんでした: ${preferred.path}`);
        }
      }
    } catch (error) {
      console.error(`[FontService] フォント ${resolvedFamily} の読み込みに失敗しました:`, error);
      throw error;
    }
  }

  /**
   * 旧プロジェクトに保存されたフルネームを、描画に使うファミリー名へ変換する。
   */
  static normalizeFontFamily(fontName: string): string {
    return this.resolveFontFamily(fontName) || fontName;
  }

  private static resolveFontFamily(fontName: string): string | undefined {
    if (this.fontFamilyMap.has(fontName)) return fontName;
    const normalizedRequestedName = this.normalizeComparableFontName(fontName);
    for (const [family, variants] of this.fontFamilyMap.entries()) {
      if (variants.some(font => font.fullName === fontName)) return family;
      if (this.normalizeComparableFontName(family) === normalizedRequestedName) return family;
      if (variants.some(font => this.normalizeComparableFontName(font.fullName) === normalizedRequestedName)) {
        return family;
      }
    }
    return this.systemFonts.includes(fontName) ? fontName : undefined;
  }

  private static normalizeComparableFontName(fontName: string): string {
    return fontName
      .replace(/[-_\s]*VariableFont[-_\s]*(?:[A-Za-z]+(?:[,\s_-]+[A-Za-z]+)*)?$/i, '')
      .replace(/[-_\s]*\[[^\]]*wght[^\]]*\]$/i, '')
      .replace(/[-_\s]+/g, '')
      .toLowerCase();
  }

  private static isVariableFont(font: FontInfo): boolean {
    return font.variable === true
      || /variablefont|(?:^|[_-])wght(?:[_,-]|$)|\[.*wght.*\]/i.test(font.path || font.fullName || '');
  }

  private static normalizeFontWeight(weight?: string, style?: string): string {
    const normalized = (weight || '').toLowerCase();
    // フォントファイルから読んだ数値ウェイト（250, 350 なども含む）はそのまま使う。
    if (/^\d{1,4}$/.test(normalized) && Number(normalized) >= 1 && Number(normalized) <= 1000) return normalized;
    if (normalized === 'bold' || /bold|heavy|black/i.test(style || '')) return '700';
    if (normalized === 'lighter' || /light|thin/i.test(style || '')) return '300';
    return '400';
  }
}

// デバッグ用にグローバルに公開
if (typeof window !== 'undefined') {
  (window as any).FontService = FontService;
  
  // フォント関連のデバッグ用コマンドを追加
  (window as any).debugFonts = {
    getFontInfo: () => FontService.getFontLoadingInfo(),
    debug: () => FontService.debug(),
    retryLoading: () => FontService.retryFontLoading(),
    clearBlacklist: () => FontLoader.clearBlacklist(),
    getBlacklist: () => FontLoader.getBlacklist(),
    getFailedFonts: () => FontLoader.getFailedFonts()
  };
}
