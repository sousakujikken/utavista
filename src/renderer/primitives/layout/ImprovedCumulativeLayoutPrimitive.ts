/**
 * 改善された累積レイアウトプリミティブ
 * 文字重複表示を防止し、安全なレイアウト計算を提供
 */

import * as PIXI from 'pixi.js';
import {
  LayoutPrimitive,
  LayerState,
  ChildInstruction,
  PrimitiveResult,
  LayoutItem,
  LayoutParams,
  LayoutResult
} from '../types';

/**
 * 改善された累積レイアウト専用パラメータ
 */
export interface ImprovedCumulativeLayoutParams extends LayoutParams {
  /** 文字間隔倍率 */
  charSpacing: number;
  /** フォントサイズ */
  fontSize: number;
  /** 半角文字の間隔補正係数 */
  halfWidthSpacingRatio: number;
  /** 安全性チェックを有効にするか */
  enableSafetyChecks: boolean;
}

/**
 * レイアウト計算専用結果
 */
export interface LayoutCalculationResult {
  /** 位置情報 */
  positions: LayoutResult[];
  /** 全体の幅 */
  totalWidth: number;
  /** 全体の高さ */
  totalHeight: number;
  /** 計算に使用されたパラメータ */
  usedParams: ImprovedCumulativeLayoutParams;
  /** 警告メッセージ */
  warnings: string[];
}

/**
 * 既存コンテナ適用結果
 */
export interface ContainerApplicationResult {
  /** 適用成功数 */
  appliedCount: number;
  /** スキップされた数 */
  skippedCount: number;
  /** エラー数 */
  errorCount: number;
  /** 詳細ログ */
  details: Array<{
    containerId: string;
    status: 'applied' | 'skipped' | 'error';
    reason?: string;
    position?: { x: number; y: number };
  }>;
}

/**
 * 文字が半角文字かどうかを判定
 */
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 改善された累積レイアウトプリミティブ
 * 計算専用メソッドを提供し、コンテナ作成は外部に委譲
 */
export class ImprovedCumulativeLayoutPrimitive implements LayoutPrimitive {
  public readonly name = 'ImprovedCumulativeLayout';
  
  private parentState: LayerState | null = null;
  private childInstructions: ChildInstruction[] = [];
  
  /**
   * 上位層からの制御を受け入れ
   */
  receiveParentContext(parentState: LayerState): void {
    this.parentState = parentState;
  }
  
  /**
   * 🚫 非推奨: 自動コンテナ作成メソッド
   * 文字重複を防ぐため使用禁止
   */
  executeWithinHierarchy(): PrimitiveResult {
    console.error(
      '[ImprovedCumulativeLayoutPrimitive] executeWithinHierarchy は非推奨です。' +
      'calculateLayoutOnly を使用してください。'
    );
    
    return {
      success: false,
      childInstructions: [],
      error: 'このメソッドは安全性のため無効化されています。calculateLayoutOnly を使用してください。'
    };
  }
  
  /**
   * ✅ 推奨: レイアウト計算のみ実行
   * コンテナ作成は行わず、位置情報のみを返す
   */
  calculateLayoutOnly(
    items: LayoutItem[],
    params: ImprovedCumulativeLayoutParams
  ): LayoutCalculationResult {
    const warnings: string[] = [];
    
    // 安全性チェック
    if (params.enableSafetyChecks) {
      const safetyWarnings = this.performSafetyChecks(items, params);
      warnings.push(...safetyWarnings);
    }
    
    // 累積レイアウト計算
    const positions = this.calculateCumulativePositions(items, params);
    
    // 全体サイズ計算
    const totalWidth = positions.length > 0 
      ? Math.max(...positions.map(p => p.position.x)) + params.fontSize * params.charSpacing
      : 0;
    const totalHeight = params.fontSize;
    
    // 配置アライメントの適用
    const alignedPositions = this.applyAlignment(positions, totalWidth, params.alignment);
    
    return {
      positions: alignedPositions,
      totalWidth,
      totalHeight,
      usedParams: params,
      warnings
    };
  }
  
  /**
   * ✅ 推奨: 既存コンテナへのレイアウト適用
   * 計算済みの位置情報を既存コンテナに適用
   */
  applyLayoutToExistingContainers(
    containers: PIXI.Container[],
    layoutResults: LayoutResult[],
    enableLogging: boolean = false
  ): ContainerApplicationResult {
    const result: ContainerApplicationResult = {
      appliedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      details: []
    };
    
    for (let i = 0; i < Math.min(containers.length, layoutResults.length); i++) {
      const container = containers[i];
      const layout = layoutResults[i];
      
      try {
        // 位置適用
        container.position.set(layout.position.x, layout.position.y);
        
        result.appliedCount++;
        result.details.push({
          containerId: (container as any).name || `container_${i}`,
          status: 'applied',
          position: layout.position
        });
        
        if (enableLogging) {
          console.log(
            `[ImprovedCumulativeLayoutPrimitive] Applied layout to ${(container as any).name}:`,
            layout.position
          );
        }
        
      } catch (error) {
        result.errorCount++;
        result.details.push({
          containerId: (container as any).name || `container_${i}`,
          status: 'error',
          reason: error.message
        });
      }
    }
    
    // 長さの不一致チェック
    if (containers.length !== layoutResults.length) {
      const diff = Math.abs(containers.length - layoutResults.length);
      result.skippedCount = diff;
      
      console.warn(
        `[ImprovedCumulativeLayoutPrimitive] コンテナ数とレイアウト結果数が不一致: ` +
        `containers=${containers.length}, layouts=${layoutResults.length}`
      );
    }
    
    return result;
  }
  
  /**
   * 累積位置計算の実装
   */
  private calculateCumulativePositions(
    items: LayoutItem[],
    params: ImprovedCumulativeLayoutParams
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    let cumulativeXOffset = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const char = item.content;
      
      // 半角文字の場合は文字間隔を補正
      const effectiveSpacing = isHalfWidthChar(char) 
        ? params.charSpacing * (params.halfWidthSpacingRatio || 0.6)
        : params.charSpacing;
      
      // 現在の文字位置を記録
      results.push({
        id: item.id,
        position: { x: cumulativeXOffset, y: 0 }
      });
      
      // 次の文字のために累積オフセットを更新
      cumulativeXOffset += params.fontSize * effectiveSpacing;
    }
    
    return results;
  }
  
  /**
   * 配置アライメントの適用
   */
  private applyAlignment(
    positions: LayoutResult[],
    totalWidth: number,
    alignment: string
  ): LayoutResult[] {
    if (alignment === 'center') {
      const offsetX = -totalWidth / 2;
      return positions.map(result => ({
        ...result,
        position: { x: result.position.x + offsetX, y: result.position.y }
      }));
    } else if (alignment === 'right') {
      return positions.map(result => ({
        ...result,
        position: { x: totalWidth - result.position.x, y: result.position.y }
      }));
    }
    
    return positions; // left alignment (default)
  }
  
  /**
   * 安全性チェックの実行
   */
  private performSafetyChecks(
    items: LayoutItem[],
    params: ImprovedCumulativeLayoutParams
  ): string[] {
    const warnings: string[] = [];
    
    // アイテムID重複チェック
    const ids = items.map(item => item.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      warnings.push('レイアウトアイテムにID重複があります');
    }
    
    // パラメータ妥当性チェック
    if (params.fontSize <= 0) {
      warnings.push('フォントサイズが無効です');
    }
    
    if (params.charSpacing <= 0) {
      warnings.push('文字間隔が無効です');
    }
    
    if (params.halfWidthSpacingRatio <= 0 || params.halfWidthSpacingRatio > 1) {
      warnings.push('半角文字間隔補正係数が無効です');
    }
    
    // 文字数チェック
    if (items.length === 0) {
      warnings.push('レイアウト対象アイテムが空です');
    } else if (items.length > 100) {
      warnings.push('文字数が多すぎます（100文字以上）');
    }
    
    return warnings;
  }
  
  /**
   * 従来のcalculateLayoutインターフェース（互換性維持）
   */
  calculateLayout(
    items: LayoutItem[],
    params: LayoutParams
  ): LayoutResult[] {
    const improvedParams: ImprovedCumulativeLayoutParams = {
      ...params,
      charSpacing: (params as any).charSpacing || 1.0,
      fontSize: (params as any).fontSize || 32,
      halfWidthSpacingRatio: (params as any).halfWidthSpacingRatio || 0.6,
      enableSafetyChecks: false // 互換性のためデフォルトは無効
    };
    
    const result = this.calculateLayoutOnly(items, improvedParams);
    return result.positions;
  }
  
  /**
   * 下位層への指示を生成（従来インターフェース）
   */
  generateChildInstructions(): ChildInstruction[] {
    return this.childInstructions;
  }
  
  /**
   * デバッグ情報の取得
   */
  getDebugInfo(
    text: string,
    params: ImprovedCumulativeLayoutParams
  ): Record<string, unknown> {
    const chars = Array.from(text);
    const items: LayoutItem[] = chars.map((char, index) => ({
      id: `char_${index}`,
      content: char,
      size: { width: params.fontSize * params.charSpacing, height: params.fontSize }
    }));
    
    const result = this.calculateLayoutOnly(items, params);
    
    return {
      primitiveName: this.name,
      charCount: chars.length,
      totalWidth: result.totalWidth,
      totalHeight: result.totalHeight,
      warnings: result.warnings,
      layoutResults: result.positions.map((pos, index) => ({
        char: chars[index],
        position: pos.position,
        isHalfWidth: isHalfWidthChar(chars[index]),
        effectiveSpacing: isHalfWidthChar(chars[index]) 
          ? params.charSpacing * (params.halfWidthSpacingRatio || 0.6)
          : params.charSpacing
      }))
    };
  }
}