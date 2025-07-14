import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ipcMain } from 'electron';
import type { FontInfo } from '../shared/types';

class FontManager {
  private systemFonts: FontInfo[] = [];
  private fontCache: Map<string, FontInfo[]> = new Map();
  
  // ファイルサイズ制限 (100MB)
  private static readonly MAX_FONT_SIZE = 100 * 1024 * 1024;

  async initialize() {
    this.setupIPC();
    await this.scanSystemFonts();
  }

  private setupIPC() {
    ipcMain.handle('font:get-system-fonts', async () => {
      if (this.systemFonts.length === 0) {
        await this.scanSystemFonts();
      }
      return this.systemFonts;
    });
  }

  private async scanSystemFonts(): Promise<void> {
    console.log('Scanning system fonts...');
    
    try {
      const platform = os.platform();
      const fontDirs = this.getFontDirectories(platform);
      
      this.systemFonts = [];
      
      for (const fontDir of fontDirs) {
        if (await this.directoryExists(fontDir)) {
          await this.scanFontDirectory(fontDir);
        }
      }

      // Add web-safe fallback fonts
      this.addWebSafeFonts();
      
      // Remove duplicates and sort
      const beforeDedup = this.systemFonts.length;
      this.systemFonts = this.removeDuplicates(this.systemFonts);
      this.systemFonts.sort((a, b) => a.family.localeCompare(b.family));
      
      console.log(`Found ${this.systemFonts.length} unique font variants (${beforeDedup} total fonts before deduplication)`);
      console.log('Sample fonts:', this.systemFonts.slice(0, 20).map(f => `${f.family} (${f.weight} ${f.style})`));
    } catch (error) {
      console.error('Error scanning system fonts:', error);
      this.addWebSafeFonts();
    }
  }

  private getFontDirectories(platform: string): string[] {
    switch (platform) {
      case 'darwin': // macOS
        return [
          '/System/Library/Fonts',
          '/System/Library/Fonts/Supplemental',
          '/Library/Fonts',
          path.join(os.homedir(), 'Library/Fonts'),
          '/System/Library/Assets/com_apple_MobileAsset_Font6'
        ];
      
      case 'win32': // Windows
        return [
          'C:\\Windows\\Fonts',
          path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Windows\\Fonts')
        ];
      
      case 'linux': // Linux
        return [
          '/usr/share/fonts',
          '/usr/local/share/fonts',
          path.join(os.homedir(), '.fonts'),
          path.join(os.homedir(), '.local/share/fonts'),
          '/System/Library/Fonts' // For Linux systems with macOS-style paths
        ];
      
      default:
        return [];
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async scanFontDirectory(dirPath: string): Promise<void> {
    try {
      const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanFontDirectory(fullPath);
        } else if (this.isFontFile(file.name)) {
          // ファイルサイズチェック
          try {
            const stats = await fs.promises.stat(fullPath);
            if (stats.size > FontManager.MAX_FONT_SIZE) {
              console.log(`[FontManager] フォントファイルが大きすぎるためスキップ: ${file.name} (${Math.round(stats.size / 1024 / 1024)}MB)`);
              continue;
            }
          } catch (error) {
            console.debug(`[FontManager] ファイルサイズ取得エラー: ${file.name}`);
            continue;
          }
          
          // .ttc ファイルの場合、複数のバリアントを生成
          if (file.name.toLowerCase().endsWith('.ttc')) {
            const fontInfos = this.parseTTCFile(file.name, fullPath);
            this.systemFonts.push(...fontInfos);
          } else {
            const fontInfo = this.parseFontFile(file.name, fullPath);
            if (fontInfo) {
              this.systemFonts.push(fontInfo);
            }
          }
        }
      }
    } catch (error) {
      // Silently continue if we can't read a directory (permission issues, etc.)
      console.debug(`Cannot read font directory ${dirPath}:`, error);
    }
  }

  private isFontFile(fileName: string): boolean {
    const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2', '.ttc', '.dfont'];
    const ext = path.extname(fileName).toLowerCase();
    return fontExtensions.includes(ext);
  }

  private parseFontFile(fileName: string, fullPath: string): FontInfo | null {
    try {
      const baseName = path.basename(fileName, path.extname(fileName));
      
      // Extract font family from filename
      let family = baseName;
      let style = 'Regular';
      let weight = 'normal';

      // Common style patterns (より詳細なパターンマッチング)
      const stylePatterns = [
        { pattern: /(.+?)[-\s]*(BoldItalic|BoldOblique|Bold-Italic)/i, style: 'Bold Italic', weight: 'bold' },
        { pattern: /(.+?)[-\s]*(Bold|Heavy|Black|ExtraBold|SemiBold|Bd)/i, style: 'Bold', weight: 'bold' },
        { pattern: /(.+?)[-\s]*(Italic|Oblique|It)/i, style: 'Italic', weight: 'normal' },
        { pattern: /(.+?)[-\s]*(Light|Thin|UltraLight|Lt)/i, style: 'Light', weight: 'lighter' },
        { pattern: /(.+?)[-\s]*(Medium|Med)/i, style: 'Medium', weight: '500' },
        { pattern: /(.+?)[-\s]*(Regular|Normal|Reg)/i, style: 'Regular', weight: 'normal' }
      ];

      for (const { pattern, style: s, weight: w } of stylePatterns) {
        const match = baseName.match(pattern);
        if (match) {
          family = match[1].trim();
          style = s;
          weight = w;
          break;
        }
      }

      // Clean up family name - より包括的なクリーンアップ
      family = family
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\.(ttf|otf|woff|woff2)$/i, '')
        .trim();

      // 空文字や無効な名前をフィルタリング
      if (!family || family.length < 1 || family.startsWith('.')) {
        return null;
      }

      return {
        family,
        fullName: baseName,
        style,
        weight,
        path: fullPath
      };
    } catch (error) {
      console.debug(`Error parsing font file ${fileName}:`, error);
      return null;
    }
  }

  private addWebSafeFonts(): void {
    const webSafeFonts: FontInfo[] = [
      { family: 'Arial', fullName: 'Arial', style: 'Regular', weight: 'normal' },
      { family: 'Helvetica', fullName: 'Helvetica', style: 'Regular', weight: 'normal' },
      { family: 'Times New Roman', fullName: 'Times New Roman', style: 'Regular', weight: 'normal' },
      { family: 'Times', fullName: 'Times', style: 'Regular', weight: 'normal' },
      { family: 'Courier New', fullName: 'Courier New', style: 'Regular', weight: 'normal' },
      { family: 'Courier', fullName: 'Courier', style: 'Regular', weight: 'normal' },
      { family: 'Verdana', fullName: 'Verdana', style: 'Regular', weight: 'normal' },
      { family: 'Georgia', fullName: 'Georgia', style: 'Regular', weight: 'normal' },
      { family: 'Palatino', fullName: 'Palatino', style: 'Regular', weight: 'normal' },
      { family: 'Garamond', fullName: 'Garamond', style: 'Regular', weight: 'normal' },
      { family: 'Bookman', fullName: 'Bookman', style: 'Regular', weight: 'normal' },
      { family: 'Tahoma', fullName: 'Tahoma', style: 'Regular', weight: 'normal' },
      { family: 'Trebuchet MS', fullName: 'Trebuchet MS', style: 'Regular', weight: 'normal' },
      { family: 'Arial Black', fullName: 'Arial Black', style: 'Regular', weight: 'normal' },
      { family: 'Impact', fullName: 'Impact', style: 'Regular', weight: 'normal' },
      
      // Japanese fonts
      { family: 'Hiragino Sans', fullName: 'Hiragino Sans', style: 'Regular', weight: 'normal' },
      { family: 'Hiragino Kaku Gothic ProN', fullName: 'Hiragino Kaku Gothic ProN', style: 'Regular', weight: 'normal' },
      { family: 'Yu Gothic', fullName: 'Yu Gothic', style: 'Regular', weight: 'normal' },
      { family: 'Meiryo', fullName: 'Meiryo', style: 'Regular', weight: 'normal' },
      { family: 'MS Gothic', fullName: 'MS Gothic', style: 'Regular', weight: 'normal' },
      { family: 'MS Mincho', fullName: 'MS Mincho', style: 'Regular', weight: 'normal' },
      
      // Generic families
      { family: 'sans-serif', fullName: 'sans-serif', style: 'Regular', weight: 'normal' },
      { family: 'serif', fullName: 'serif', style: 'Regular', weight: 'normal' },
      { family: 'monospace', fullName: 'monospace', style: 'Regular', weight: 'normal' },
      { family: 'cursive', fullName: 'cursive', style: 'Regular', weight: 'normal' },
      { family: 'fantasy', fullName: 'fantasy', style: 'Regular', weight: 'normal' }
    ];

    // Add web-safe fonts if not already present
    for (const webFont of webSafeFonts) {
      if (!this.systemFonts.some(font => font.family === webFont.family)) {
        this.systemFonts.push(webFont);
      }
    }
  }

  private removeDuplicates(fonts: FontInfo[]): FontInfo[] {
    const seen = new Set<string>();
    const uniqueFonts: FontInfo[] = [];
    
    // ファミリー名でグループ化
    const fontGroups = new Map<string, FontInfo[]>();
    fonts.forEach(font => {
      const familyKey = font.family.toLowerCase();
      if (!fontGroups.has(familyKey)) {
        fontGroups.set(familyKey, []);
      }
      fontGroups.get(familyKey)!.push(font);
    });
    
    // 各グループから、異なるweight/styleの組み合わせを保持
    fontGroups.forEach((groupFonts, familyKey) => {
      const variantsSeen = new Set<string>();
      
      groupFonts.forEach(font => {
        // weight と style の組み合わせでユニークチェック
        const variantKey = `${font.weight}_${font.style}`;
        if (!variantsSeen.has(variantKey)) {
          variantsSeen.add(variantKey);
          uniqueFonts.push(font);
        }
      });
    });
    
    return uniqueFonts;
  }

  private parseTTCFile(fileName: string, fullPath: string): FontInfo[] {
    const baseName = path.basename(fileName, '.ttc');
    const fontInfos: FontInfo[] = [];
    
    // TTC ファイルから一般的なバリアントを生成
    const variants = [
      { style: 'Regular', weight: 'normal' },
      { style: 'Bold', weight: 'bold' },
      { style: 'Italic', weight: 'normal' },
      { style: 'Bold Italic', weight: 'bold' }
    ];
    
    // ファミリー名を抽出
    let family = baseName
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // 少なくともRegularバリアントを追加
    fontInfos.push({
      family,
      fullName: `${baseName}-Regular`,
      style: 'Regular',
      weight: 'normal',
      path: fullPath
    });
    
    return fontInfos;
  }

  getFonts(): FontInfo[] {
    return this.systemFonts;
  }

  async refreshFonts(): Promise<FontInfo[]> {
    await this.scanSystemFonts();
    return this.systemFonts;
  }
}

export const fontManager = new FontManager();