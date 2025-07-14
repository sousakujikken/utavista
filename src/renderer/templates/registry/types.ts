// JSONテンプレート設定の型定義
export interface TemplateConfig {
  id: string;
  name: string;
  importPath: string;
  exportName: string;
}

export interface TemplatesJson {
  templates: TemplateConfig[];
}