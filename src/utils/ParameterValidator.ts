import { StandardParameters, DEFAULT_PARAMETERS } from '../types/StandardParameters';

export class ParameterValidator {
  /**
   * パラメータの型と値の妥当性を検証
   */
  static validate(params: unknown): {
    isValid: boolean;
    errors: string[];
    sanitized: Partial<StandardParameters>;
  } {
    const errors: string[] = [];
    const sanitized: Partial<StandardParameters> = {};
    
    // Removed verbose logging - only log for specific debugging if needed
    
    // パラメータがオブジェクトかどうか確認（配列を除く）
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      // 配列の場合は詳細なエラーログを出力
      if (Array.isArray(params)) {
        console.warn('[ParameterValidator] Array passed as parameter object. This is invalid.', params);
      }
      return {
        isValid: false,
        errors: ['Invalid parameter object'],
        sanitized: {}
      };
    }
    
    // 各パラメータの検証と正規化
    Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
      // templateIdは特別扱い（StandardParametersの一部ではないが有効）
      if (key === 'templateId') {
        if (typeof value === 'string') {
          (sanitized as Record<string, unknown>)[key] = value;
        } else {
          errors.push(`Invalid type for ${key}: expected string, got ${typeof value}`);
        }
      } else if (key in DEFAULT_PARAMETERS) {
        const defaultValue = DEFAULT_PARAMETERS[key as keyof StandardParameters];
        
        if (typeof value === typeof defaultValue) {
          (sanitized as Record<string, unknown>)[key] = value;
        } else {
          errors.push(`Invalid type for ${key}: expected ${typeof defaultValue}, got ${typeof value}`);
        }
      } else {
        errors.push(`Unknown parameter: ${key}`);
      }
    });
    
    const result = {
      isValid: errors.length === 0,
      errors,
      sanitized
    };
    
    // Only log validation errors for debugging
    if (!result.isValid && result.errors.length > 0) {
      console.warn('[ParameterValidator] Validation errors:', result.errors);
    }
    
    return result;
  }
  
}