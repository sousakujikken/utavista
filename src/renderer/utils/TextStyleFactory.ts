import * as PIXI from 'pixi.js';

export interface TextStyleOptions {
  fontFamily: string;
  fontSize: number;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: string;
  paddingMultiplier?: number;
  minPadding?: number;
  resolutionScale?: number; // 解像度スケーリング係数
}

/**
 * テキストスタイル作成のファクトリークラス
 * 全テンプレートで統一されたパディング設定と解像度適応型テキストレンダリングを提供
 */
export class TextStyleFactory {
  // 基準解像度 (16:9 の基準値)
  private static readonly BASE_RESOLUTION_WIDTH = 1920;
  private static readonly BASE_RESOLUTION_HEIGHT = 1080;
  
  /**
   * 解像度スケール係数を計算
   * @param targetWidth 目標幅
   * @param targetHeight 目標高さ
   * @returns スケール係数
   */
  static calculateResolutionScale(targetWidth: number, targetHeight: number): number {
    // より大きい次元を基準にスケール係数を計算（アスペクト比を考慮）
    const scaleX = targetWidth / this.BASE_RESOLUTION_WIDTH;
    const scaleY = targetHeight / this.BASE_RESOLUTION_HEIGHT;
    
    // より大きい方のスケールを採用（品質を優先）
    return Math.max(scaleX, scaleY);
  }
  
  /**
   * 統一されたパディング設定でPIXI.TextStyleを作成（解像度適応型）
   */
  static createTextStyle(options: TextStyleOptions): PIXI.TextStyle {
    const {
      fontFamily,
      fontSize,
      fill = '#FFFFFF',
      align = 'center',
      fontWeight = 'normal',
      fontStyle = 'normal',
      paddingMultiplier = 0.20,
      minPadding = 10,
      resolutionScale = 1
    } = options;

    // 解像度に応じてフォントサイズを調整
    const scaledFontSize = Math.round(fontSize * resolutionScale);
    const scaledMinPadding = Math.round(minPadding * resolutionScale);

    return new PIXI.TextStyle({
      fontFamily,
      fontSize: scaledFontSize,
      fill,
      align,
      fontWeight,
      fontStyle,
      padding: Math.max(scaledMinPadding, Math.ceil(scaledFontSize * paddingMultiplier))
    });
  }

  /**
   * 統一されたスタイルでPIXI.Textオブジェクトを作成（解像度適応型）
   */
  static createText(text: string, options: TextStyleOptions): PIXI.Text {
    const style = this.createTextStyle(options);
    return new PIXI.Text(text, style);
  }
  
  /**
   * エクスポート用の高解像度テキストを作成
   * @param text テキスト内容
   * @param options 基本オプション
   * @param exportWidth エクスポート幅
   * @param exportHeight エクスポート高さ
   * @returns 高解像度テキストオブジェクト
   */
  static createExportText(
    text: string, 
    options: TextStyleOptions, 
    exportWidth: number, 
    exportHeight: number
  ): PIXI.Text {
    const resolutionScale = this.calculateResolutionScale(exportWidth, exportHeight);
    
    // エクスポート時のみ解像度スケールを適用（デバイスピクセル比は無視）
    const exportOptions: TextStyleOptions = {
      ...options,
      resolutionScale: resolutionScale
    };
    
    const textObj = this.createText(text, exportOptions);
    
    // テキストオブジェクトのスケールを逆算して調整（表示サイズを維持）
    textObj.scale.set(1 / resolutionScale);
    
    return textObj;
  }
  
  /**
   * 標準テキストを作成（高DPI処理を無効化し、純粋な画面ピクセル数に基づく）
   * @param text テキスト内容
   * @param options 基本オプション
   * @returns 標準テキストオブジェクト
   */
  static createHighDPIText(text: string, options: TextStyleOptions): PIXI.Text {
    // 高DPI処理を無効化し、純粋な画面ピクセル数に基づくレンダリング
    return this.createText(text, options);
  }
}
