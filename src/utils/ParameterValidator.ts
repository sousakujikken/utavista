import { StandardParameters, DEFAULT_PARAMETERS } from '../types/StandardParameters';
import { ParameterRegistry } from '../renderer/utils/ParameterRegistry';
import type { TemplateId } from '../renderer/types/TemplateParameters';

export class ParameterValidator {
  /**
   * パラメータの型と値の妥当性を検証
   */
  static validate(params: unknown, templateId?: TemplateId): {
    isValid: boolean;
    errors: string[];
    sanitized: Partial<StandardParameters>;
  } {
    const errors: string[] = [];
    const sanitized: Partial<StandardParameters> = {};
    
    // パラメータがオブジェクトかどうか確認（配列を除く）
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      // 配列の場合は詳細なエラーログを出力
      if (Array.isArray(params)) {
        console.error('[ParameterValidator] CRITICAL: Array passed as parameter object. This indicates a bug in the parameter processing pipeline.');
        console.error('[ParameterValidator] Expected: parameter object like {fontSize: 120, textColor: "#fff"}');
        console.error('[ParameterValidator] Received: parameter config array:', params);
        console.error('[ParameterValidator] Stack trace:', new Error().stack);
        
        // Check if this looks like a parameter configuration array
        if (params.length > 0 && typeof params[0] === 'object' && 'name' in params[0] && 'default' in params[0]) {
          console.error('[ParameterValidator] This appears to be a parameter configuration array from getParameterConfig().');
          console.error('[ParameterValidator] The caller should convert this to a parameter object before validation.');
          
          // Provide a helpful conversion example
          const exampleConversion = {};
          params.slice(0, 3).forEach((param: any) => {
            if (param.name && param.default !== undefined) {
              exampleConversion[param.name] = param.default;
            }
          });
          console.error('[ParameterValidator] Example conversion:', exampleConversion);
        }
      }
      return {
        isValid: false,
        errors: ['Invalid parameter object: expected object, received ' + (Array.isArray(params) ? 'array' : typeof params)],
        sanitized: {}
      };
    }
    
    // パラメータレジストリを使用した検証
    const registry = ParameterRegistry.getInstance();
    
    Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
      // templateIdは特別扱い（StandardParametersの一部ではないが有効）
      if (key === 'templateId') {
        if (typeof value === 'string') {
          (sanitized as Record<string, unknown>)[key] = value;
        } else {
          errors.push(`Invalid type for ${key}: expected string, got ${typeof value}`);
        }
      } else if (registry.isRegistered(key, templateId)) {
        // レジストリに登録されたパラメータの検証
        const validation = registry.validateParameter(key, value, templateId);
        if (validation.valid) {
          (sanitized as Record<string, unknown>)[key] = value;
        } else {
          errors.push(validation.error!);
        }
      } else {
        // 不明なパラメータはサイレントに無視（ログのみ出力）
        console.debug(`[ParameterValidator] Ignoring unknown parameter: ${key}`);
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
  
  /**
   * パラメータ設定配列を実際のパラメータオブジェクトに変換
   * getParameterConfig()の戻り値を使用可能なパラメータオブジェクトに変換する
   */
  static convertConfigToParams(paramConfig: any[]): Record<string, any> {
    const params: Record<string, any> = {};
    
    if (!Array.isArray(paramConfig)) {
      console.error('[ParameterValidator] convertConfigToParams: expected array, received:', typeof paramConfig);
      return {};
    }
    
    paramConfig.forEach((param: any) => {
      if (param && typeof param === 'object' && 'name' in param && 'default' in param) {
        params[param.name] = param.default;
      } else {
        console.warn('[ParameterValidator] Invalid parameter config item:', param);
      }
    });
    
    return params;
  }
  
  /**
   * パラメータ設定配列かどうかを判定
   */
  static isParameterConfigArray(value: any): boolean {
    return Array.isArray(value) && 
           value.length > 0 && 
           typeof value[0] === 'object' && 
           'name' in value[0] && 
           'default' in value[0];
  }
  
}
