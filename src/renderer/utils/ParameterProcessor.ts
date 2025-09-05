import { StandardParameters } from '../types/StandardParameters';

/**
 * パラメータ処理の単一責任クラス
 * 配列→オブジェクト変換は全てここで行い、他の場所では一切配列を扱わない
 */
export class ParameterProcessor {
  /**
   * テンプレート設定配列をパラメータオブジェクトに変換
   * 配列処理はこのメソッドでのみ行う
   */
  static convertConfigToParams(config: any[]): Record<string, any> {
    if (!Array.isArray(config)) {
      throw new TypeError('Expected parameter config array');
    }
    
    const result: Record<string, any> = {};
    config.forEach(item => {
      if (item && typeof item === 'object' && item.name && item.default !== undefined) {
        result[item.name] = item.default;
      }
    });
    
    return result;
  }
  
  /**
   * 安全なパラメータオブジェクト結合
   * スプレッド構文を使わず、明示的にオブジェクトのみを結合
   */
  static mergeParameterObjects(...objects: Record<string, any>[]): Record<string, any> {
    // 全ての引数がオブジェクトであることを保証
    objects.forEach((obj, index) => {
      if (Array.isArray(obj)) {
        throw new TypeError(`Argument ${index} is an array - use convertConfigToParams() first`);
      }
      if (typeof obj !== 'object' || obj === null) {
        throw new TypeError(`Argument ${index} is not an object`);
      }
    });
    
    return Object.assign({}, ...objects);
  }
  
  /**
   * 入力データを安全にパラメータオブジェクトに正規化
   */
  static normalizeToParameterObject(input: unknown): Record<string, any> {
    if (Array.isArray(input)) {
      // 配列の場合は設定配列として変換を試みる
      return this.convertConfigToParams(input);
    }
    
    if (typeof input === 'object' && input !== null) {
      // スプレッド構文を使わず、明示的なコピーを使用
      const result: Record<string, any> = {};
      const inputObj = input as Record<string, any>;
      
      // 数値キーをフィルタリングして、文字列キーのみをコピー
      for (const [key, value] of Object.entries(inputObj)) {
        // 数値キーは除外（配列由来の可能性があるため）
        if (!/^\d+$/.test(key)) {
          result[key] = value;
        }
      }
      
      return result;
    }
    
    // その他の場合は空オブジェクト
    return {};
  }
  
  /**
   * 型安全なパラメータ検証
   */
  static validateParameterObject(params: Record<string, any>): Record<string, any> {
    if (Array.isArray(params)) {
      throw new TypeError('Parameter validation received array - this indicates a design flaw');
    }
    
    return params;
  }
}