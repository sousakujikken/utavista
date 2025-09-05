import React, { useState, useEffect } from 'react';
import './ParamEditor.css';
import { useRecentColors } from '../../hooks/useRecentColors';
import FontSelector from './FontSelector';

// パラメータ設定の型定義
export interface ParamConfig {
  name: string;
  type: 'number' | 'string' | 'color' | 'boolean' | 'font';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  options?: string[] | Array<{ value: any, label: string }> | (() => string[]);
}

interface ParamEditorProps {
  params: Record<string, any>;
  paramConfig: ParamConfig[];
  onChange: (updatedParams: Record<string, any>) => void;
  disabled?: boolean;
  onRecalculate?: () => void;
}

const ParamEditor: React.FC<ParamEditorProps> = ({ 
  params, 
  paramConfig, 
  onChange,
  disabled = false,
  onRecalculate
}) => {
  // 現在の値を内部状態として管理
  const [values, setValues] = useState<Record<string, any>>({});
  
  // 最近使用した色の管理
  const { recentColors, addRecentColor } = useRecentColors();
  
  // パラメータが変更されたら内部状態を更新
  useEffect(() => {
    const initialValues: Record<string, any> = {};
    
    // パラメータ設定を適用
    paramConfig.forEach(param => {
      // 入力値かデフォルト値を使用
      initialValues[param.name] = params[param.name] !== undefined 
        ? params[param.name] 
        : param.default;
    });
    
    // 値が実際に変わった場合のみ更新
    setValues(prev => {
      const isEqual = Object.keys(initialValues).every(
        key => prev[key] === initialValues[key]
      ) && Object.keys(prev).every(
        key => initialValues.hasOwnProperty(key)
      );
      return isEqual ? prev : initialValues;
    });
  }, [JSON.stringify(params), JSON.stringify(paramConfig)]);
  
  // 単一パラメータの変更ハンドラ
  const handleChange = (name: string, value: any) => {
    const updatedValues = { ...values, [name]: value };
    setValues(updatedValues);
    
    // 親コンポーネントに変更を通知
    onChange(updatedValues);
  };
  
  // 色の最終確定時のハンドラ（フォーカス離脱時）
  const handleColorBlur = (name: string, value: string) => {
    if (typeof value === 'string' && value.startsWith('#')) {
      addRecentColor(value);
    }
  };
  
  // リセットボタンのハンドラ
  const handleReset = (name: string) => {
    // 該当パラメータの設定を検索
    const paramDef = paramConfig.find(p => p.name === name);
    if (!paramDef) return;
    
    // デフォルト値に戻す
    handleChange(name, paramDef.default);
  };
  
  // 全てリセットボタンのハンドラ
  const handleResetAll = () => {
    const defaultValues: Record<string, any> = {};
    
    // 全パラメータをデフォルト値に
    paramConfig.forEach(param => {
      defaultValues[param.name] = param.default;
    });
    
    setValues(defaultValues);
    onChange(defaultValues);
  };
  
  return (
    <div className="param-editor">
      <div className="param-list">
        {paramConfig.map(param => (
          <div key={param.name} className="param-item">
            <div className="param-label">
              {param.label || param.name}
              <button 
                className="reset-button" 
                onClick={() => handleReset(param.name)}
                disabled={disabled}
                title="デフォルトに戻す"
              >
                ↺
              </button>
            </div>
            
            <div className="param-control">
              {param.type === 'number' && (
                <div className="slider-container">
                  <input
                    type="range"
                    min={param.min || 0}
                    max={param.max || 100}
                    step={param.step || 1}
                    value={values[param.name] || 0}
                    onChange={(e) => handleChange(param.name, parseFloat(e.target.value))}
                    disabled={disabled}
                  />
                  <input
                    type="number"
                    min={param.min}
                    max={param.max}
                    step={param.step || 1}
                    value={values[param.name] || 0}
                    onChange={(e) => handleChange(param.name, parseFloat(e.target.value))}
                    className="number-input"
                    disabled={disabled}
                  />
                </div>
              )}
              
              {param.type === 'string' && param.options && (
                <div className="select-container">
                  <select
                    value={values[param.name] || ''}
                    onChange={(e) => handleChange(param.name, e.target.value)}
                    disabled={disabled}
                  >
                    {(() => {
                      // optionsが関数の場合は実行する
                      const options = typeof param.options === 'function' ? param.options() : param.options;
                      
                      if (Array.isArray(options)) {
                        // 最初の要素で配列の形式を判定
                        if (options.length > 0 && typeof options[0] === 'object' && options[0] !== null) {
                          // オブジェクト配列の場合 { value: any, label: string }
                          return options.map((option: { value: any, label: string }) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ));
                        } else {
                          // 文字列配列の場合
                          return options.map((option: string) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ));
                        }
                      }
                      console.warn(`[ParamEditor] No valid options found for ${param.name}`, options);
                      return null;
                    })()}
                  </select>
                </div>
              )}
              
              {param.type === 'string' && !param.options && (
                <input
                  type="text"
                  value={values[param.name] || ''}
                  onChange={(e) => handleChange(param.name, e.target.value)}
                  disabled={disabled}
                />
              )}
              
              {param.type === 'color' && (
                <div className="color-picker-container">
                  <div className="color-picker">
                    <input
                      type="color"
                      value={values[param.name] || '#FFFFFF'}
                      onChange={(e) => handleChange(param.name, e.target.value)}
                      onBlur={(e) => handleColorBlur(param.name, e.target.value)}
                      disabled={disabled}
                    />
                    <input
                      type="text"
                      value={values[param.name] || '#FFFFFF'}
                      onChange={(e) => handleChange(param.name, e.target.value)}
                      onBlur={(e) => handleColorBlur(param.name, e.target.value)}
                      className="color-input"
                      disabled={disabled}
                    />
                  </div>
                  {recentColors.length > 0 && (
                    <div className="recent-colors">
                      <div className="recent-colors-label">最近使用した色:</div>
                      <div className="recent-colors-grid">
                        {recentColors.map((color, index) => (
                          <button
                            key={`${color}-${index}`}
                            className="recent-color-button"
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              handleChange(param.name, color);
                              handleColorBlur(param.name, color);
                            }}
                            disabled={disabled}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {param.type === 'boolean' && (
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={values[param.name] || false}
                    onChange={(e) => handleChange(param.name, e.target.checked)}
                    disabled={disabled}
                  />
                  <span className="toggle-slider"></span>
                </label>
              )}
              
              {param.type === 'font' && (
                <FontSelector
                  value={values[param.name] || ''}
                  onChange={(fontFamily) => handleChange(param.name, fontFamily)}
                  disabled={disabled}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="param-actions">
        {onRecalculate && (
          <button 
            className="recalculate-button" 
            onClick={onRecalculate}
            disabled={disabled}
            title="文字位置やランダムオフセットを再計算"
          >
            再計算
          </button>
        )}
        <button 
          className="reset-all-button" 
          onClick={handleResetAll}
          disabled={disabled}
        >
          全てリセット
        </button>
      </div>
    </div>
  );
};

export default ParamEditor;