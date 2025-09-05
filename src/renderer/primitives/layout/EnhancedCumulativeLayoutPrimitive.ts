/**
 * 拡張された累積レイアウトプリミティブ
 * 既存システムとの完全互換性を持つコンテナ管理機能
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
import { TextStyleFactory } from '../../utils/TextStyleFactory';

/**
 * 文字データインターフェース（既存システム互換）
 */
export interface CharacterData {
  id: string;
  char: string;
  charIndex: number;
  totalChars: number;
  start: number;
  end: number;
}

/**
 * 拡張レイアウトパラメータ
 */
export interface EnhancedCumulativeLayoutParams extends LayoutParams {
  /** 文字間隔倍率 */
  charSpacing: number;
  /** フォントサイズ */
  fontSize: number;
  /** 半角文字の間隔補正係数 */
  halfWidthSpacingRatio: number;
  /** 文字データ配列（既存システム互換） */
  chars?: CharacterData[];
  /** コンテナ名プレフィックス */
  containerPrefix?: string;
}

/**
 * 文字管理結果
 */
export interface CharacterManagementResult {
  success: boolean;
  containersManaged: number;
  layoutResults: LayoutResult[];
  warnings: string[];
}

/**
 * 半角文字判定
 */
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 拡張された累積レイアウトプリミティブ
 * 既存システムと完全に互換性のあるコンテナ管理機能を提供
 */
export class EnhancedCumulativeLayoutPrimitive implements LayoutPrimitive {
  public readonly name = 'EnhancedCumulativeLayout';
  
  private parentState: LayerState | null = null;
  private childInstructions: ChildInstruction[] = [];
  
  /**
   * 上位層からの制御を受け入れ
   */
  receiveParentContext(parentState: LayerState): void {
    this.parentState = parentState;
  }
  
  /**
   * 協調的階層内での処理実行（従来互換）
   */
  executeWithinHierarchy(): PrimitiveResult {
    return {
      success: true,
      childInstructions: this.childInstructions
    };
  }
  
  /**
   * レイアウト計算の実行
   */
  calculateLayout(
    items: LayoutItem[],
    params: LayoutParams
  ): LayoutResult[] {
    const enhancedParams = params as EnhancedCumulativeLayoutParams;
    const results: LayoutResult[] = [];
    let cumulativeXOffset = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const char = item.content;
      
      // 半角文字の場合は文字間隔を補正
      const effectiveSpacing = isHalfWidthChar(char) 
        ? enhancedParams.charSpacing * (enhancedParams.halfWidthSpacingRatio || 0.6)
        : enhancedParams.charSpacing;
      
      // 現在の文字位置を記録
      results.push({
        id: item.id,
        position: { x: cumulativeXOffset, y: 0 }
      });
      
      // 次の文字のために累積オフセットを更新
      cumulativeXOffset += enhancedParams.fontSize * effectiveSpacing;
    }
    
    // 配置アライメントの適用
    if (enhancedParams.alignment === 'center') {
      const totalWidth = cumulativeXOffset;
      const offsetX = -totalWidth / 2;
      results.forEach(result => {
        result.position.x += offsetX;
      });
    } else if (enhancedParams.alignment === 'right') {
      const totalWidth = cumulativeXOffset;
      results.forEach(result => {
        result.position.x = totalWidth - result.position.x;
      });
    }
    
    return results;
  }
  
  /**
   * 既存システム互換の文字コンテナ管理
   * params.chars配列を使用してコンテナを管理
   */
  manageCharacterContainersCompatible(
    wordContainer: PIXI.Container,
    params: EnhancedCumulativeLayoutParams,
    charAnimationCallback?: (
      charContainer: PIXI.Container,
      charData: CharacterData,
      position: { x: number; y: number }
    ) => void
  ): CharacterManagementResult {
    const warnings: string[] = [];
    
    if (!params.chars || !Array.isArray(params.chars)) {
      return {
        success: false,
        containersManaged: 0,
        layoutResults: [],
        warnings: ['params.chars が存在しないか配列ではありません']
      };
    }
    
    try {
      // params.charsから文字データを取得
      const characters = params.chars;
      
      // レイアウト計算用のアイテム配列を作成
      const layoutItems: LayoutItem[] = characters.map(charData => ({
        id: charData.id,
        content: charData.char,
        size: { 
          width: params.fontSize * params.charSpacing, 
          height: params.fontSize 
        }
      }));
      
      // レイアウト計算実行
      const layoutResults = this.calculateLayout(layoutItems, params);
      
      // 文字コンテナの管理
      characters.forEach((charData, index) => {
        const layoutResult = layoutResults[index];
        const containerName = `${params.containerPrefix || 'char_container_'}${charData.id}`;
        
        // 既存の文字コンテナを検索
        let charContainer: PIXI.Container | null = null;
        
        wordContainer.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && 
              child.name === containerName) {
            charContainer = child as PIXI.Container;
          }
        });
        
        // 存在しない場合は新規作成
        if (!charContainer) {
          charContainer = new PIXI.Container();
          (charContainer as any).name = containerName;
          wordContainer.addChild(charContainer);
        }
        
        // 位置設定（レイアウト計算結果を使用）
        charContainer.position.set(layoutResult.position.x, layoutResult.position.y);
        
        // アニメーションコールバックの実行
        if (charAnimationCallback) {
          charAnimationCallback(charContainer, charData, layoutResult.position);
        }
      });
      
      return {
        success: true,
        containersManaged: characters.length,
        layoutResults,
        warnings
      };
      
    } catch (error) {
      return {
        success: false,
        containersManaged: 0,
        layoutResults: [],
        warnings: [`エラー: ${error.message}`]
      };
    }
  }
  
  /**
   * テキスト文字列から文字データ配列を生成
   * 簡単なケース用のヘルパーメソッド
   */
  generateCharacterDataFromText(
    text: string,
    baseId: string = 'char',
    startMs: number = 0,
    endMs: number = 1000
  ): CharacterData[] {
    const chars = Array.from(text);
    const duration = endMs - startMs;
    const charDuration = duration / chars.length;
    
    return chars.map((char, index) => ({
      id: `${baseId}_${index}`,
      char,
      charIndex: index,
      totalChars: chars.length,
      start: startMs + (index * charDuration),
      end: startMs + ((index + 1) * charDuration)
    }));
  }
  
  /**
   * 下位層への指示を生成
   */
  generateChildInstructions(): ChildInstruction[] {
    return this.childInstructions;
  }
  
  /**
   * デバッグ情報の取得
   */
  getDebugInfo(params: EnhancedCumulativeLayoutParams): Record<string, unknown> {
    const characters = params.chars || [];
    
    return {
      primitiveName: this.name,
      charCount: characters.length,
      hasCharacterData: !!params.chars,
      containerPrefix: params.containerPrefix || 'char_container_',
      layoutParams: {
        fontSize: params.fontSize,
        charSpacing: params.charSpacing,
        halfWidthSpacingRatio: params.halfWidthSpacingRatio,
        alignment: params.alignment
      },
      characterData: characters.map(char => ({
        id: char.id,
        char: char.char,
        charIndex: char.charIndex
      }))
    };
  }
}