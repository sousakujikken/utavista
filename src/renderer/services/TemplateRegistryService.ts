import { TemplateConfig, TemplatesJson } from '../templates/registry/types';

export class TemplateRegistryService {
  private static readonly REGISTRY_PATH = 'src/renderer/templates/registry/templates.json';
  
  // JSONファイルを読み込み
  static async loadRegistry(): Promise<TemplatesJson> {
    try {
      // ElectronAPIを使用してファイルシステムから直接読み込み
      if (window.electronAPI && window.electronAPI.template) {
        const content = await window.electronAPI.template.readRegistry();
        return JSON.parse(content);
      }
      
      // フォールバックとして直接インポート
      const templatesJson = await import('../templates/registry/templates.json');
      return templatesJson.default as TemplatesJson;
    } catch (error) {
      console.error('テンプレートレジストリの読み込みに失敗:', error);
      return { templates: [] };
    }
  }
  
  // JSONファイルに新しいテンプレートを追加
  static async addTemplate(newTemplate: TemplateConfig): Promise<boolean> {
    try {
      const registry = await this.loadRegistry();
      
      // 既存チェック
      const exists = registry.templates.some(t => 
        t.id === newTemplate.id || t.exportName === newTemplate.exportName
      );
      
      if (exists) {
        throw new Error(`テンプレート "${newTemplate.id}" は既に登録されています`);
      }
      
      // 新しいテンプレートを追加
      registry.templates.push(newTemplate);
      
      // ファイルに保存
      return await this.saveRegistry(registry);
    } catch (error) {
      console.error('テンプレートの追加に失敗:', error);
      return false;
    }
  }
  
  // 複数のテンプレートを一度に追加
  static async addTemplates(newTemplates: TemplateConfig[]): Promise<boolean> {
    try {
      const registry = await this.loadRegistry();
      
      // 既存チェック
      const existingIds = new Set(registry.templates.map(t => t.id));
      const existingExportNames = new Set(registry.templates.map(t => t.exportName));
      
      for (const template of newTemplates) {
        if (existingIds.has(template.id) || existingExportNames.has(template.exportName)) {
          throw new Error(`テンプレート "${template.id}" は既に登録されています`);
        }
      }
      
      // 新しいテンプレートを追加
      registry.templates.push(...newTemplates);
      
      // ファイルに保存
      return await this.saveRegistry(registry);
    } catch (error) {
      console.error('テンプレートの一括追加に失敗:', error);
      return false;
    }
  }
  
  // JSONファイルを保存
  private static async saveRegistry(registry: TemplatesJson): Promise<boolean> {
    try {
      // ElectronAPIを使用してファイルシステムに直接書き込み
      if (window.electronAPI && window.electronAPI.template) {
        const content = JSON.stringify(registry, null, 2);
        await window.electronAPI.template.writeRegistry(content);
        return true;
      }
      
      // フォールバック: 手動更新を促す
      console.warn('テンプレートレジストリの変更を保存するには、以下のJSONを手動で templates.json に保存してください:');
      console.log(JSON.stringify(registry, null, 2));
      
      const message = `テンプレートレジストリが更新されました。\n\n以下の内容を src/renderer/templates/registry/templates.json に手動で保存してください:\n\n${JSON.stringify(registry, null, 2)}`;
      alert(message);
      
      return true;
    } catch (error) {
      console.error('テンプレートレジストリの保存に失敗:', error);
      return false;
    }
  }
  
  // テンプレートを削除
  static async removeTemplate(templateId: string): Promise<boolean> {
    try {
      const registry = await this.loadRegistry();
      
      const originalLength = registry.templates.length;
      registry.templates = registry.templates.filter(t => t.id !== templateId);
      
      if (registry.templates.length === originalLength) {
        throw new Error(`テンプレート "${templateId}" が見つかりません`);
      }
      
      return await this.saveRegistry(registry);
    } catch (error) {
      console.error('テンプレートの削除に失敗:', error);
      return false;
    }
  }
  
  // レジストリをリロード（アプリケーション再起動なしで反映）
  static async reloadRegistry(): Promise<void> {
    try {
      // カスタムイベントを発火してレジストリの更新を通知
      window.dispatchEvent(new CustomEvent('templateRegistryChanged'));
      
      // 開発環境では手動リロードを促す
      console.info('テンプレートレジストリを更新しました。完全に反映するにはアプリケーションを再起動してください。');
    } catch (error) {
      console.error('テンプレートレジストリのリロードに失敗:', error);
    }
  }
}