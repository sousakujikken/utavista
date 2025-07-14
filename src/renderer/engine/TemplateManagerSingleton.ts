import { TemplateManager } from './TemplateManager';

// グローバルなTemplateManagerインスタンス
export const globalTemplateManager = new TemplateManager();

// デフォルトテンプレートIDを設定
export function setGlobalDefaultTemplateId(templateId: string): void {
  globalTemplateManager.setDefaultTemplateId(templateId);
}