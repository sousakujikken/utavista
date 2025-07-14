import { IAnimationTemplate } from '../types/types';

export interface TemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class TemplateValidator {
  /**
   * テンプレートオブジェクトの構造を検証
   */
  static validateTemplateStructure(template: any): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本的なオブジェクト検証
    if (!template || typeof template !== 'object') {
      errors.push('テンプレートオブジェクトが無効です');
      return { isValid: false, errors, warnings };
    }

    // 必須メソッドの存在確認
    const requiredMethods = ['getParameterConfig', 'animateContainer', 'removeVisualElements'];
    
    for (const method of requiredMethods) {
      if (typeof template[method] !== 'function') {
        errors.push(`必須メソッド '${method}' が見つかりません`);
      }
    }

    // 推奨メソッドの存在確認
    const recommendedMethods = ['renderPhraseContainer', 'renderWordContainer', 'renderCharContainer'];
    
    for (const method of recommendedMethods) {
      if (typeof template[method] !== 'function') {
        warnings.push(`推奨メソッド '${method}' が見つかりません`);
      }
    }

    // メタデータの検証
    if (template.metadata) {
      if (!template.metadata.name || typeof template.metadata.name !== 'string') {
        warnings.push('メタデータにテンプレート名がありません');
      }
      if (!template.metadata.version || typeof template.metadata.version !== 'string') {
        warnings.push('メタデータにバージョン情報がありません');
      }
    } else {
      warnings.push('メタデータがありません');
    }

    // パラメータ設定の検証
    try {
      if (typeof template.getParameterConfig === 'function') {
        const paramConfig = template.getParameterConfig();
        if (!Array.isArray(paramConfig)) {
          errors.push('getParameterConfig() は配列を返す必要があります');
        } else {
          // 各パラメータの検証
          paramConfig.forEach((param, index) => {
            if (!param.name || typeof param.name !== 'string') {
              errors.push(`パラメータ ${index}: name プロパティが必要です`);
            }
            if (!param.type || typeof param.type !== 'string') {
              errors.push(`パラメータ ${index}: type プロパティが必要です`);
            }
            if (param.default === undefined) {
              warnings.push(`パラメータ ${param.name}: デフォルト値が設定されていません`);
            }
          });
        }
      }
    } catch (error) {
      errors.push(`getParameterConfig() の実行中にエラーが発生しました: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * テンプレートファイルの動的読み込みと検証
   */
  static async validateTemplateFile(filePath: string): Promise<TemplateValidationResult> {
    try {
      const module = await import(filePath);
      const template = module.default || module;
      
      return this.validateTemplateStructure(template);
    } catch (error) {
      return {
        isValid: false,
        errors: [`テンプレートファイルの読み込みに失敗しました: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * パラメータ設定の詳細検証
   */
  static validateParameterConfig(paramConfig: any[]): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(paramConfig)) {
      errors.push('パラメータ設定は配列である必要があります');
      return { isValid: false, errors, warnings };
    }

    const validTypes = ['number', 'string', 'color', 'select', 'boolean', 'font'];
    const paramNames = new Set<string>();

    paramConfig.forEach((param, index) => {
      // 必須プロパティの確認
      if (!param.name || typeof param.name !== 'string') {
        errors.push(`パラメータ ${index}: name プロパティが必要です`);
        return;
      }

      // 重複チェック
      if (paramNames.has(param.name)) {
        errors.push(`パラメータ名 '${param.name}' が重複しています`);
      }
      paramNames.add(param.name);

      // 型の確認
      if (!validTypes.includes(param.type)) {
        errors.push(`パラメータ '${param.name}': 無効な型 '${param.type}'`);
      }

      // 数値型の検証
      if (param.type === 'number') {
        if (param.min !== undefined && typeof param.min !== 'number') {
          errors.push(`パラメータ '${param.name}': min は数値である必要があります`);
        }
        if (param.max !== undefined && typeof param.max !== 'number') {
          errors.push(`パラメータ '${param.name}': max は数値である必要があります`);
        }
        if (param.step !== undefined && typeof param.step !== 'number') {
          errors.push(`パラメータ '${param.name}': step は数値である必要があります`);
        }
      }

      // 選択肢型の検証
      if (param.type === 'select') {
        if (!Array.isArray(param.options) || param.options.length === 0) {
          errors.push(`パラメータ '${param.name}': options 配列が必要です`);
        }
      }

      // デフォルト値の検証
      if (param.default === undefined) {
        warnings.push(`パラメータ '${param.name}': デフォルト値が設定されていません`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}