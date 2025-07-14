import * as PIXI from 'pixi.js';

/**
 * 文字メトリクスキャッシュシステム
 * フォントサイズに依存しない正規化されたメトリクスをキャッシュし、
 * 任意のサイズに対してスケーリングすることで計算を最適化
 */

interface NormalizedMetrics {
  normalizedWidth: number;   // 基準サイズでの幅の比率
  normalizedHeight: number;  // 基準サイズでの高さの比率
  baselineRatio: number;     // ベースラインの比率
  timestamp: number;
}

interface CharacterClassMetrics {
  averageWidthRatio: number;
  heightRatio: number;
  samples: string[];
}

// フォント別の調整係数
export interface FontAdjustment {
  widthPadding: number;   // 実測値への追加パディング（ピクセル比率）
  heightPadding: number;  // 高さへの追加パディング（ピクセル比率）
  baselineOffset: number; // ベースライン調整（ピクセル比率）
}

export class TextMetricsCache {
  private cache: Map<string, NormalizedMetrics> = new Map();
  private classMetrics: Map<string, number> = new Map();
  
  private readonly BASE_FONT_SIZE = 100; // 基準フォントサイズ
  private readonly MAX_CACHE_SIZE = 10000;
  private readonly CACHE_TTL = 3600000; // 1時間
  
  // 文字タイプ別の共通メトリクス
  private readonly characterClasses: Record<string, CharacterClassMetrics> = {
    'ascii_uppercase': {
      averageWidthRatio: 0.7,
      heightRatio: 1.0,
      samples: ['A', 'H', 'M', 'W']
    },
    'ascii_lowercase': {
      averageWidthRatio: 0.6,
      heightRatio: 0.7,
      samples: ['a', 'e', 'n', 'w']
    },
    'ascii_number': {
      averageWidthRatio: 0.6,
      heightRatio: 0.8,
      samples: ['0', '5', '8', '9']
    },
    'hiragana': {
      averageWidthRatio: 1.0,
      heightRatio: 1.0,
      samples: ['あ', 'か', 'は', 'ん']
    },
    'katakana': {
      averageWidthRatio: 1.0,
      heightRatio: 1.0,
      samples: ['ア', 'カ', 'ハ', 'ン']
    },
    'kanji': {
      averageWidthRatio: 1.0,
      heightRatio: 1.0,
      samples: ['漢', '字', '東', '京']
    },
    'punctuation': {
      averageWidthRatio: 0.4,
      heightRatio: 0.8,
      samples: ['.', ',', '!', '?']
    },
    'other': {
      averageWidthRatio: 0.7,
      heightRatio: 1.0,
      samples: ['@', '#', '$', '%']
    }
  };
  
  // フォント調整係数（統一値を使用）
  private readonly fontAdjustments: Record<string, FontAdjustment> = {
    // 全フォント共通（最大値ベース + 上部余裕値）
    'default': { widthPadding: 0.08, heightPadding: 0.12, baselineOffset: 0 }
  };
  
  /**
   * キー生成: フォント設定（サイズを除く）
   */
  private generateKey(char: string, fontFamily: string, fontWeight: string, fontStyle: string): string {
    return `${char}:${fontFamily}:${fontWeight}:${fontStyle}`;
  }
  
  /**
   * 文字種別判定
   */
  private detectCharacterClass(char: string): string {
    if (/[A-Z]/.test(char)) return 'ascii_uppercase';
    if (/[a-z]/.test(char)) return 'ascii_lowercase';
    if (/[0-9]/.test(char)) return 'ascii_number';
    if (/[\u3040-\u309F]/.test(char)) return 'hiragana';
    if (/[\u30A0-\u30FF]/.test(char)) return 'katakana';
    if (/[\u4E00-\u9FAF]/.test(char)) return 'kanji';
    if (/[.,!?;:]/.test(char)) return 'punctuation';
    return 'other';
  }
  
  /**
   * 正確なメトリクスを取得（キャッシュ利用）
   */
  getMetrics(
    char: string,
    fontFamily: string,
    fontSize: number,
    fontWeight: string = 'normal',
    fontStyle: string = 'normal'
  ): { width: number; height: number; baselineOffset: number } {
    // 実際のフォントサイズでキャッシュキーを作成（より正確性を重視）
    const key = `${char}:${fontFamily}:${fontWeight}:${fontStyle}:${fontSize}`;
    
    // キャッシュチェック
    let cached = this.cache.get(key);
    
    if (!cached || Date.now() - cached.timestamp > this.CACHE_TTL) {
      // 実際のフォントサイズで測定（欠損防止のため）
      const textStyle = new PIXI.TextStyle({
        fontFamily: fontFamily,
        fontSize: fontSize,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        padding: Math.max(3, Math.ceil(fontSize * 0.15)) // 動的パディング（装飾フォント対応）
      });
      
      const tempText = new PIXI.Text(char, textStyle);
      
      // getLocalBounds()に加えて、複数の測定方法を組み合わせ
      const localBounds = tempText.getLocalBounds();
      const globalBounds = tempText.getBounds();
      const textureWidth = tempText.texture.width;
      const textureHeight = tempText.texture.height;
      
      // より安全な幅・高さを計算（最大値を採用）
      const safeWidth = Math.max(
        localBounds.width,
        globalBounds.width,
        textureWidth,
        fontSize * 0.8  // 最小保証幅
      );
      
      const safeHeight = Math.max(
        localBounds.height,
        globalBounds.height,
        textureHeight,
        fontSize * 1.2  // 最小保証高さ
      );
      
      // フォント調整を適用
      const adjustment = this.getFontAdjustment(fontFamily);
      const finalWidth = safeWidth + (fontSize * adjustment.widthPadding);
      const finalHeight = safeHeight + (fontSize * adjustment.heightPadding);
      
      cached = {
        normalizedWidth: finalWidth / fontSize,  // 正規化は最終的なサイズから
        normalizedHeight: finalHeight / fontSize,
        baselineRatio: adjustment.baselineOffset,
        timestamp: Date.now()
      };
      
      this.cache.set(key, cached);
      tempText.destroy();
      
      // キャッシュサイズ管理
      if (this.cache.size > this.MAX_CACHE_SIZE) {
        this.pruneCache();
      }
    }
    
    // キャッシュからの結果をそのまま使用（既に調整済み）
    return {
      width: cached.normalizedWidth * fontSize,
      height: cached.normalizedHeight * fontSize,
      baselineOffset: cached.baselineRatio * fontSize
    };
  }
  
  /**
   * 推定メトリクスを取得（文字クラスベース、高速）
   */
  getEstimatedMetrics(
    char: string,
    fontFamily: string,
    fontSize: number
  ): { width: number; height: number; baselineOffset: number } {
    const charClass = this.detectCharacterClass(char);
    const classKey = `${fontFamily}:${charClass}`;
    
    if (!this.classMetrics.has(classKey)) {
      // 代表文字のみ測定
      const samples = this.characterClasses[charClass].samples;
      let totalRatio = 0;
      
      for (const sample of samples) {
        const metrics = this.getMetrics(sample, fontFamily, this.BASE_FONT_SIZE);
        totalRatio += metrics.width / this.BASE_FONT_SIZE;
      }
      
      this.classMetrics.set(classKey, totalRatio / samples.length);
    }
    
    const ratio = this.classMetrics.get(classKey)!;
    const adjustment = this.getFontAdjustment(fontFamily);
    
    return {
      width: (ratio * fontSize) + (fontSize * adjustment.widthPadding),
      height: (fontSize * this.characterClasses[charClass].heightRatio) + (fontSize * adjustment.heightPadding),
      baselineOffset: fontSize * adjustment.baselineOffset
    };
  }
  
  /**
   * フォント調整係数を取得
   */
  getFontAdjustment(fontFamily: string): FontAdjustment {
    return this.fontAdjustments[fontFamily] || this.fontAdjustments.default;
  }
  
  /**
   * フォント設定変更時のキャッシュ無効化
   */
  invalidateFont(fontFamily: string): void {
    // 正確なメトリクスキャッシュ
    for (const [key] of this.cache) {
      if (key.includes(`:${fontFamily}:`)) {
        this.cache.delete(key);
      }
    }
    
    // クラスメトリクスキャッシュ
    for (const [key] of this.classMetrics) {
      if (key.startsWith(`${fontFamily}:`)) {
        this.classMetrics.delete(key);
      }
    }
  }
  
  /**
   * 全キャッシュクリア
   */
  clearCache(): void {
    this.cache.clear();
    this.classMetrics.clear();
  }
  
  /**
   * 古いキャッシュエントリを削除
   */
  private pruneCache(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    // TTLを超えたエントリを削除
    for (const [key, value] of entries) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
    
    // それでもサイズが大きい場合は、古い順に削除
    if (this.cache.size > this.MAX_CACHE_SIZE * 0.8) {
      const sortedEntries = entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.2));
      
      for (const [key] of sortedEntries) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * デバッグ情報を出力
   */
  debug(): void {
  }
}

// シングルトンインスタンス
export const textMetricsCache = new TextMetricsCache();