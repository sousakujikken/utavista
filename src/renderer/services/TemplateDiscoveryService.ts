import { TemplateConfig } from '../templates/registry/types';

// 発見されたテンプレートの情報
export interface DiscoveredTemplate {
  fileName: string;
  className: string;
  displayName: string;
  filePath: string;
}

// テンプレートファイルからメタデータを抽出
export class TemplateDiscoveryService {
  private static readonly TEMPLATE_FOLDER = 'src/renderer/templates';
  
  // テンプレートフォルダ内のファイルを取得
  static async getTemplateFiles(): Promise<string[]> {
    try {
      // ElectronAPIを使用してファイルシステムから直接取得
      if (window.electronAPI && window.electronAPI.template) {
        return await window.electronAPI.template.listFiles();
      }
      
      // フォールバック: 静的にテンプレートファイルのリストを定義
      const knownTemplates = [
        'GlitchText.ts',
        'MultiLineText.ts',
        'WordSlideText.ts',
        'FlickerFadeTemplate.ts'
      ];
      
      return knownTemplates;
    } catch (error) {
      console.error('テンプレートファイル一覧の取得に失敗:', error);
      return [];
    }
  }
  
  // テンプレートファイルからメタデータを読み取り
  static async readTemplateMetadata(fileName: string): Promise<DiscoveredTemplate | null> {
    try {
      const filePath = `${this.TEMPLATE_FOLDER}/${fileName}`;
      
      // ElectronAPIを使用してファイル内容を読み取り
      if (window.electronAPI && window.electronAPI.template) {
        try {
          const content = await window.electronAPI.template.readFile(fileName);
          return this.parseTemplateContent(fileName, content, filePath);
        } catch (error) {
          console.warn(`ファイル読み取りに失敗、フォールバック処理を実行: ${fileName}`, error);
        }
      }
      
      // フォールバック: ファイル名からメタデータを推測
      const className = fileName.replace('.ts', '');
      const displayName = this.classNameToDisplayName(className);
      
      return {
        fileName: fileName.replace('.ts', ''),
        className,
        displayName,
        filePath
      };
    } catch (error) {
      console.error(`テンプレートファイル ${fileName} の読み取りに失敗:`, error);
      return null;
    }
  }
  
  // テンプレートファイルの内容を解析
  private static parseTemplateContent(fileName: string, content: string, filePath: string): DiscoveredTemplate | null {
    try {
      // クラス名を抽出（export class ClassName または export default class ClassName）
      const classMatch = content.match(/export\s+(?:default\s+)?class\s+(\w+)/);
      if (!classMatch) {
        return null;
      }
      
      const className = classMatch[1];
      
      // 表示名を抽出（コメントまたはメタデータから）
      let displayName = className;
      
      // JSDocコメントからdisplayNameを探す
      const displayNameMatch = content.match(/@displayName\s+(.+)/);
      if (displayNameMatch) {
        displayName = displayNameMatch[1].trim();
      } else {
        // クラス名から推測
        displayName = this.classNameToDisplayName(className);
      }
      
      return {
        fileName: fileName.replace('.ts', ''),
        className,
        displayName,
        filePath
      };
    } catch (error) {
      console.error(`テンプレート内容の解析に失敗 (${fileName}):`, error);
      return null;
    }
  }
  
  
  // クラス名を表示名に変換
  private static classNameToDisplayName(className: string): string {
    // キャメルケースを日本語風に変換
    const displayNames: { [key: string]: string } = {
      'GlitchText': 'グリッチテキスト',
      'MultiLineText': '多段歌詞テキスト',
      'WordSlideText': '単語スライドテキスト',
      'FlickerFadeTemplate': '点滅フェードテキスト'
    };
    
    return displayNames[className] || className;
  }
  
  // 未登録のテンプレートを検出
  static async getUnregisteredTemplates(registeredTemplates: TemplateConfig[]): Promise<DiscoveredTemplate[]> {
    // templates/index.tsからエクスポートされているテンプレートを取得
    const exportedTemplates = await import('../templates/index');
    const exportedTemplateNames = Object.keys(exportedTemplates);
    
    // 登録済みテンプレートのクラス名セット
    const registeredIds = new Set(registeredTemplates.map(t => t.exportName));
    
    const unregistered: DiscoveredTemplate[] = [];
    
    // エクスポートされているが登録されていないテンプレートを検出
    for (const templateName of exportedTemplateNames) {
      if (!registeredIds.has(templateName)) {
        const displayName = this.classNameToDisplayName(templateName);
        unregistered.push({
          fileName: templateName,
          className: templateName,
          displayName,
          filePath: `${this.TEMPLATE_FOLDER}/${templateName}.ts`
        });
      }
    }
    
    return unregistered;
  }
  
  // DiscoveredTemplateをTemplateConfigに変換
  static discoveredToConfig(discovered: DiscoveredTemplate): TemplateConfig {
    const id = discovered.className.toLowerCase();
    
    return {
      id,
      name: discovered.displayName,
      importPath: `./${discovered.className}`,
      exportName: discovered.className
    };
  }
}