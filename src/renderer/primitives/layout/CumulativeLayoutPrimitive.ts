/**
 * 累積レイアウトプリミティブ
 * WordSlideTextテンプレートの成功パターンを継承した協調的文字配置システム
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
 * 累積レイアウト専用パラメータ
 */
export interface CumulativeLayoutParams extends LayoutParams {
  /** 文字間隔倍率 */
  charSpacing: number;
  /** フォントサイズ */
  fontSize: number;
  /** 半角文字の間隔補正係数 */
  halfWidthSpacingRatio: number;
}

/**
 * 文字が半角文字かどうかを判定
 * オリジナルWordSlideTextロジックを継承
 */
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 累積レイアウトプリミティブの実装
 * オリジナルの協調的階層制御パターンを継承
 */
export class CumulativeLayoutPrimitive implements LayoutPrimitive {
  public readonly name = 'CumulativeLayout';
  
  private parentState: LayerState | null = null;
  private childInstructions: ChildInstruction[] = [];
  
  /**
   * 上位層からの制御を受け入れ
   */
  receiveParentContext(parentState: LayerState): void {
    this.parentState = parentState;
  }
  
  /**
   * 累積レイアウトの計算実行
   * オリジナルの累積X座標オフセット計算を継承
   */
  calculateLayout(
    items: LayoutItem[],
    params: CumulativeLayoutParams
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    let cumulativeXOffset = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const char = item.content;
      
      // 半角文字の場合は文字間隔を補正（デフォルト0.6倍）
      const effectiveSpacing = isHalfWidthChar(char) 
        ? params.charSpacing * (params.halfWidthSpacingRatio || 0.6)
        : params.charSpacing;
      
      // 現在の文字位置を記録
      results.push({
        id: item.id,
        position: { x: cumulativeXOffset, y: 0 }
      });
      
      // 次の文字のために累積オフセットを更新
      // オリジナルロジック: fontSize * effectiveSpacing
      cumulativeXOffset += params.fontSize * effectiveSpacing;
    }
    
    // 配置アライメントの適用
    if (params.alignment === 'center') {
      const totalWidth = cumulativeXOffset;
      const offsetX = -totalWidth / 2;
      results.forEach(result => {
        result.position.x += offsetX;
      });
    } else if (params.alignment === 'right') {
      const totalWidth = cumulativeXOffset;
      results.forEach(result => {
        result.position.x = totalWidth - result.position.x;
      });
    }
    
    return results;
  }
  
  /**
   * 協調的階層内での処理実行
   */
  executeWithinHierarchy(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>
  ): PrimitiveResult {
    try {
      // パラメータの型安全な取得
      const layoutParams: CumulativeLayoutParams = {
        spacing: params.charSpacing as number || 1.0,
        alignment: params.alignment as ('left' | 'center' | 'right') || 'left',
        containerSize: { width: 0, height: 0 }, // 累積レイアウトでは不要
        charSpacing: params.charSpacing as number || 1.0,
        fontSize: params.fontSize as number || 32,
        halfWidthSpacingRatio: params.halfWidthSpacingRatio as number || 0.6
      };
      
      // テキストを文字単位に分解
      const chars = Array.from(text);
      const items: LayoutItem[] = chars.map((char, index) => ({
        id: `char_${index}`,
        content: char,
        size: { 
          width: layoutParams.fontSize * layoutParams.charSpacing, 
          height: layoutParams.fontSize 
        }
      }));
      
      // レイアウト計算実行
      const layoutResults = this.calculateLayout(items, layoutParams);
      
      // 子階層への指示を生成
      this.childInstructions = layoutResults.map(result => ({
        childId: result.id,
        position: result.position,
        alpha: 1.0,
        visible: true,
        childParams: {
          charIndex: parseInt(result.id.split('_')[1]),
          totalChars: chars.length,
          char: chars[parseInt(result.id.split('_')[1])]
        }
      }));
      
      return {
        success: true,
        childInstructions: this.childInstructions
      };
      
    } catch (error) {
      return {
        success: false,
        childInstructions: [],
        error: `CumulativeLayoutPrimitive execution failed: ${error}`
      };
    }
  }
  
  /**
   * 下位層への指示を生成
   */
  generateChildInstructions(): ChildInstruction[] {
    return this.childInstructions;
  }
  
  /**
   * コンテナ内の文字コンテナを協調的に管理
   * オリジナルWordSlideTextの文字管理パターンを継承
   */
  manageCharacterContainers(
    wordContainer: PIXI.Container,
    text: string,
    params: CumulativeLayoutParams,
    charAnimationCallback?: (
      charContainer: PIXI.Container,
      char: string,
      charIndex: number,
      position: { x: number; y: number }
    ) => void
  ): void {
    const chars = Array.from(text);
    const layoutResults = this.calculateLayout(
      chars.map((char, index) => ({
        id: `char_${index}`,
        content: char,
        size: { width: params.fontSize * params.charSpacing, height: params.fontSize }
      })),
      params
    );
    
    // 既存の文字コンテナと新しい計算結果を同期
    chars.forEach((char, index) => {
      const charId = `char_${index}`;
      const layoutResult = layoutResults[index];
      
      // 既存の文字コンテナを検索
      let charContainer: PIXI.Container | null = null;
      
      wordContainer.children.forEach((child: any) => {
        if (child instanceof PIXI.Container && 
            child.name === `char_container_${charId}`) {
          charContainer = child as PIXI.Container;
        }
      });
      
      // 存在しない場合は新規作成
      if (!charContainer) {
        charContainer = new PIXI.Container();
        (charContainer as any).name = `char_container_${charId}`;
        wordContainer.addChild(charContainer);
      }
      
      // 位置設定（累積オフセットベース）
      charContainer.position.set(layoutResult.position.x, layoutResult.position.y);
      
      // 文字アニメーションコールバックの実行
      if (charAnimationCallback) {
        charAnimationCallback(charContainer, char, index, layoutResult.position);
      }
    });
  }
  
  /**
   * レイアウト状態のデバッグ情報を取得
   */
  getDebugInfo(text: string, params: CumulativeLayoutParams): Record<string, unknown> {
    const chars = Array.from(text);
    const items: LayoutItem[] = chars.map((char, index) => ({
      id: `char_${index}`,
      content: char,
      size: { width: params.fontSize * params.charSpacing, height: params.fontSize }
    }));
    
    const layoutResults = this.calculateLayout(items, params);
    
    return {
      primitíveName: this.name,
      charCount: chars.length,
      totalWidth: layoutResults.length > 0 
        ? Math.max(...layoutResults.map(r => r.position.x)) + params.fontSize * params.charSpacing
        : 0,
      layoutResults: layoutResults.map((result, index) => ({
        char: chars[index],
        position: result.position,
        isHalfWidth: isHalfWidthChar(chars[index]),
        effectiveSpacing: isHalfWidthChar(chars[index]) 
          ? params.charSpacing * (params.halfWidthSpacingRatio || 0.6)
          : params.charSpacing
      }))
    };
  }
}