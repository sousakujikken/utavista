/**
 * VerticalLayoutPrimitive
 * 縦書きレイアウトをサポートするプリミティブ
 * 句読点位置調整、アルファベット回転機能を含む
 */

import * as PIXI from 'pixi.js';
import { LayoutPrimitive, LayoutItem, LayoutParams, LayoutResult } from '../types';
import { WordContainerAttributeManager } from '../../types/WordContainerExtensions';
import { FlexibleCharacterData, WordDisplayMode } from './FlexibleCumulativeLayoutPrimitive';

/**
 * 書字方向
 */
export type TextDirection = 'horizontal' | 'vertical';

/**
 * 縦書き開始位置
 */
export type VerticalStartPosition = 'top' | 'center' | 'bottom';

/**
 * 縦書き行方向
 */
export type VerticalLineDirection = 'rtl' | 'ltr';

/**
 * 縦書きレイアウトパラメータ
 */
export interface VerticalLayoutParams extends LayoutParams {
  /** 文字間隔 */
  charSpacing: number;
  /** フォントサイズ */
  fontSize: number;
  /** 半角文字の間隔比率 */
  halfWidthSpacingRatio: number;
  /** 文字データ配列 */
  chars: FlexibleCharacterData[];
  /** コンテナ名のプレフィックス */
  containerPrefix: string;
  /** 単語表示モード */
  wordDisplayMode: WordDisplayMode;
  /** 単語間スペース（文字数換算） */
  wordSpacing: number;
  /** 行の高さ（改行モード用） */
  lineHeight: number;
  
  /** 書字方向 */
  textDirection: TextDirection;
  /** 縦書き開始位置 */
  verticalStartPosition?: VerticalStartPosition;
  /** 縦書き行方向 */
  verticalLineDirection?: VerticalLineDirection;
  
  /** 句読点調整有効 */
  enablePunctuationAdjustment?: boolean;
  /** 調整対象文字 */
  punctuationCharacters?: string;
  /** 句読点X座標オフセット比率 */
  punctuationOffsetXRatio?: number;
  /** 句読点Y座標オフセット比率 */
  punctuationOffsetYRatio?: number;
  
  /** アルファベット回転有効 */
  enableAlphabetRotation?: boolean;
  /** 回転対象パターン */
  alphabetRotationPattern?: string;
  /** 回転時の文字間隔比率 */
  alphabetCharSpacingRatio?: number;
  
  /** 長音記号回転有効 */
  enableLongVowelRotation?: boolean;
  /** 長音記号文字パターン */
  longVowelCharacters?: string;
  
  /** 小文字調整有効 */
  enableSmallCharAdjustment?: boolean;
  /** 小文字対象文字 */
  smallCharacters?: string;
  /** 小文字X座標オフセット比率 */
  smallCharOffsetXRatio?: number;
  /** 小文字Y座標オフセット比率 */
  smallCharOffsetYRatio?: number;
  
  /** 画面サイズ情報（縦書き計算用） */
  screenWidth?: number;
  screenHeight?: number;
  
  /** フレーズ一括入場制御用パラメータ（オプション） */
  phraseTimingControl?: {
    nowMs: number;
    phraseStartMs: number;
    phraseEndMs: number;
    headTime?: number;
    tailTime?: number;
  };
}

/**
 * 文字管理結果（拡張版）
 */
export interface VerticalCharacterManagementResult {
  success: boolean;
  containersManaged: number;
  layoutResults: LayoutResult[];
  warnings: string[];
  wordLayoutInfo: Array<{
    wordIndex: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
    charCount: number;
  }>;
}

/**
 * 回転情報
 */
interface RotationInfo {
  angle: number;
  isRotated: boolean;
  spacingMode: 'horizontal' | 'vertical';
}

/**
 * 位置調整情報
 */
interface PositionAdjustment {
  x: number;
  y: number;
}

/**
 * 半角文字判定
 */
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 縦書きレイアウトプリミティブ
 */
export class VerticalLayoutPrimitive implements LayoutPrimitive {
  name = 'VerticalLayoutPrimitive';
  
  /**
   * 親階層からの制御を受け入れ
   */
  receiveParentContext(): void {
    // レイアウトプリミティブは親階層の状態に依存しない
  }
  
  /**
   * 自分の責任範囲の処理を実行
   */
  executeWithinHierarchy(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>
  ) {
    return {
      success: true,
      childInstructions: []
    };
  }
  
  /**
   * 下位層への指示を生成
   */
  generateChildInstructions() {
    return [];
  }
  
  /**
   * 要素の配置計算（基本的な累積配置）
   */
  calculateLayout(
    items: LayoutItem[],
    params: VerticalLayoutParams
  ): LayoutResult[] {
    if (params.textDirection === 'vertical') {
      return this.calculateVerticalLayout(items, params);
    } else {
      return this.calculateHorizontalLayout(items, params);
    }
  }
  
  /**
   * 横書きレイアウト計算（従来のロジック）
   */
  private calculateHorizontalLayout(
    items: LayoutItem[],
    params: VerticalLayoutParams
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    let cumulativeXOffset = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const char = item.content;
      
      const effectiveSpacing = isHalfWidthChar(char) 
        ? params.charSpacing * params.halfWidthSpacingRatio
        : params.charSpacing;
      
      results.push({
        id: item.id,
        position: { x: cumulativeXOffset, y: 0 }
      });
      
      cumulativeXOffset += params.fontSize * effectiveSpacing;
    }
    
    return results;
  }
  
  /**
   * 縦書きレイアウト計算
   */
  private calculateVerticalLayout(
    items: LayoutItem[],
    params: VerticalLayoutParams
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    
    // 開始位置の計算
    let cumulativeYOffset = this.getVerticalStartPosition(params);
    const lineX = this.calculateLinePosition(params);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const char = item.content;
      
      // 句読点調整
      const punctuationAdjustment = this.getPunctuationAdjustment(char, params);
      
      // 小文字調整
      const smallCharAdjustment = this.getSmallCharAdjustment(char, params);
      
      // 文字回転チェック（アルファベット + 長音記号）
      const rotationInfo = this.getCharacterRotation(char, params);
      
      // 文字間隔計算
      const spacing = this.calculateVerticalSpacing(char, params, rotationInfo);
      
      const finalX = lineX + punctuationAdjustment.x + smallCharAdjustment.x;
      const finalY = cumulativeYOffset + punctuationAdjustment.y + smallCharAdjustment.y;
      
      // 位置計算と結果の追加
      results.push({
        id: item.id,
        position: { 
          x: finalX, 
          y: finalY
        },
        rotation: rotationInfo.angle
      });
      
      cumulativeYOffset += spacing;
    }
    return results;
  }
  
  /**
   * 縦書き開始位置を取得
   */
  private getVerticalStartPosition(params: VerticalLayoutParams): number {
    const verticalStartPosition = params.verticalStartPosition || 'top';
    const fontSize = params.fontSize || 80;
    
    // 単語コンテナ内での相対座標として計算
    switch (verticalStartPosition) {
      case 'top':
        return 0; // 上から開始
      case 'center':
        // 文字数に応じて中央配置するためのオフセット
        const totalHeight = params.chars.length * fontSize * params.charSpacing;
        return -totalHeight / 2;
      case 'bottom':
        // 下から開始（負の値で上に配置）
        const totalHeightBottom = params.chars.length * fontSize * params.charSpacing;
        return -totalHeightBottom;
      default:
        return 0;
    }
  }
  
  /**
   * 行位置を計算
   */
  private calculateLinePosition(params: VerticalLayoutParams): number {
    // 単語コンテナ内での相対位置なので、0を基準とする
    // フレーズコンテナで絶対位置が設定される
    return 0;
  }
  
  /**
   * 句読点調整を取得（比率ベース）
   */
  private getPunctuationAdjustment(char: string, params: VerticalLayoutParams): PositionAdjustment {
    if (!params.enablePunctuationAdjustment) {
      return { x: 0, y: 0 };
    }
    
    const punctuationChars = params.punctuationCharacters || '、。，．';
    if (!punctuationChars.includes(char)) {
      return { x: 0, y: 0 };
    }
    
    const baseXRatio = params.punctuationOffsetXRatio || 0;
    const baseYRatio = params.punctuationOffsetYRatio || 0;
    
    // 縦書きモードでの自動調整（比率ベース）
    if (params.textDirection === 'vertical') {
      switch (char) {
        case '、':
        case '，':
          return { 
            x: (baseXRatio + 0.3) * params.fontSize, 
            y: (baseYRatio + 0.2) * params.fontSize 
          };
        case '。':
        case '．':
          return { 
            x: (baseXRatio + 0.25) * params.fontSize, 
            y: (baseYRatio + 0.25) * params.fontSize 
          };
        default:
          return { 
            x: baseXRatio * params.fontSize, 
            y: baseYRatio * params.fontSize 
          };
      }
    }
    
    return { 
      x: baseXRatio * params.fontSize, 
      y: baseYRatio * params.fontSize 
    };
  }
  
  /**
   * 小文字調整を取得（撥音・拗音など）
   */
  private getSmallCharAdjustment(char: string, params: VerticalLayoutParams): PositionAdjustment {
    if (!params.enableSmallCharAdjustment) {
      return { x: 0, y: 0 };
    }
    
    const smallChars = params.smallCharacters || 'っゃゅょァィゥェォッャュョヮヵヶ';
    if (!smallChars.includes(char)) {
      return { x: 0, y: 0 };
    }
    
    const xRatio = params.smallCharOffsetXRatio || 0.15;  // デフォルト15%右にオフセット
    const yRatio = params.smallCharOffsetYRatio || 0.1;   // デフォルト10%下にオフセット
    
    return {
      x: xRatio * params.fontSize,
      y: yRatio * params.fontSize
    };
  }
  
  /**
   * 文字回転情報を取得（アルファベット + 長音記号）
   */
  private getCharacterRotation(char: string, params: VerticalLayoutParams): RotationInfo {
    if (params.textDirection !== 'vertical') {
      return { angle: 0, isRotated: false, spacingMode: 'vertical' };
    }
    
    // 長音記号の回転チェック（デフォルトON）
    const enableLongVowel = params.enableLongVowelRotation !== false; // undefinedでもtrueとして扱う
    if (enableLongVowel) {
      const longVowelChars = params.longVowelCharacters || 'ー－‐−─━';
      if (longVowelChars.includes(char)) {
        return { 
          angle: 90,  // 90度回転
          isRotated: true, 
          spacingMode: 'horizontal' 
        };
      }
    }
    
    // アルファベット回転チェック
    if (params.enableAlphabetRotation) {
      const pattern = params.alphabetRotationPattern || '[a-zA-Z0-9]+';
      const regex = new RegExp(pattern);
      
      if (regex.test(char)) {
        return { 
          angle: 90,  // 90度回転
          isRotated: true, 
          spacingMode: 'horizontal' 
        };
      }
    }
    
    return { angle: 0, isRotated: false, spacingMode: 'vertical' };
  }
  
  /**
   * 縦書き時の文字間隔計算
   */
  private calculateVerticalSpacing(
    char: string,
    params: VerticalLayoutParams,
    rotationInfo: RotationInfo
  ): number {
    if (rotationInfo.isRotated) {
      // 長音記号の場合は全角間隔を維持
      const longVowelChars = params.longVowelCharacters || 'ー－‐−─━';
      if (longVowelChars.includes(char)) {
        // 長音記号は回転していても全角間隔を使用
        return params.fontSize * params.charSpacing;
      }
      
      // アルファベット回転時は横書き間隔（文字幅ベース）
      const estimatedCharWidth = params.fontSize * 0.6;
      const ratio = params.alphabetCharSpacingRatio || 0.8;
      return estimatedCharWidth * ratio;
    }
    
    // 通常の縦書き間隔
    // charSpacing=0: 文字が重なる、charSpacing=1: 間隔なし
    const effectiveSpacing = isHalfWidthChar(char) 
      ? params.charSpacing * params.halfWidthSpacingRatio
      : params.charSpacing;
    
    return params.fontSize * effectiveSpacing;
  }
  
  /**
   * 文字コンテナ管理（縦書き対応版）
   */
  manageCharacterContainers(
    wordContainer: PIXI.Container,
    params: VerticalLayoutParams,
    charAnimationCallback?: (
      charContainer: PIXI.Container,
      charData: FlexibleCharacterData,
      position: { x: number; y: number },
      rotation?: number
    ) => void
  ): VerticalCharacterManagementResult {
    const warnings: string[] = [];
    const wordLayoutInfo: Array<{
      wordIndex: number;
      startX: number;
      endX: number;
      startY: number;
      endY: number;
      charCount: number;
    }> = [];
    
    if (!params.chars || !Array.isArray(params.chars)) {
      return {
        success: false,
        containersManaged: 0,
        layoutResults: [],
        warnings: ['params.chars が存在しないか配列ではありません'],
        wordLayoutInfo: []
      };
    }
    
    try {
      const characters = params.chars;
      const layoutItems: LayoutItem[] = characters.map(char => ({
        id: char.id,
        content: char.char
      }));
      
      const layoutResults = this.calculateLayout(layoutItems, params);
      
      // 単語別の配置情報を計算
      const wordsMap = new Map<number, FlexibleCharacterData[]>();
      characters.forEach(char => {
        if (!wordsMap.has(char.wordIndex)) {
          wordsMap.set(char.wordIndex, []);
        }
        wordsMap.get(char.wordIndex)!.push(char);
      });
      
      // 各単語の配置情報を記録
      wordsMap.forEach((wordChars, wordIndex) => {
        const charResults = layoutResults.filter(result => 
          wordChars.some(char => char.id === result.id)
        );
        
        if (charResults.length > 0) {
          const positions = charResults.map(r => r.position);
          const startX = Math.min(...positions.map(p => p.x));
          const endX = Math.max(...positions.map(p => p.x));
          const startY = Math.min(...positions.map(p => p.y));
          const endY = Math.max(...positions.map(p => p.y));
          
          wordLayoutInfo.push({
            wordIndex,
            startX,
            endX,
            startY,
            endY,
            charCount: wordChars.length
          });
        }
      });
      
      // Word Container属性の初期化/更新
      if (characters.length > 0) {
        const firstChar = characters[0];
        const extendedWordContainer = wordContainer as any;
        
        let actualWordIndex = firstChar.wordIndex;
        if (actualWordIndex === undefined && wordContainer.name) {
          const match = wordContainer.name.match(/_word_(\d+)$/);
          if (match) {
            actualWordIndex = parseInt(match[1], 10);
          }
        }
        
        const needsReinit = !extendedWordContainer.wordAttributes || 
          extendedWordContainer.wordAttributes.wordIndex !== actualWordIndex ||
          extendedWordContainer.wordAttributes.fontSize !== params.fontSize ||
          extendedWordContainer.wordAttributes.charSpacing !== params.charSpacing ||
          extendedWordContainer.wordAttributes.halfWidthSpacingRatio !== params.halfWidthSpacingRatio;

        if (needsReinit) {
          WordContainerAttributeManager.initializeAttributes(
            wordContainer,
            actualWordIndex,
            params.fontSize,
            params.charSpacing,
            params.halfWidthSpacingRatio,
            true
          );
          
          characters.forEach((charData, idx) => {
            WordContainerAttributeManager.addCharacter(wordContainer, charData.char, idx);
          });
        }
      }
      
      // 各文字コンテナの処理
      characters.forEach((charData, index) => {
        const layoutResult = layoutResults[index];
        const containerName = `${params.containerPrefix}${charData.id}`;
        
        // 既存の文字コンテナを検索
        let charContainer: PIXI.Container | null = null;
        
        wordContainer.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && child.name === containerName) {
            charContainer = child as PIXI.Container;
          }
        });
        
        // コンテナが存在しない場合は作成
        if (!charContainer) {
          charContainer = new PIXI.Container();
          (charContainer as any).name = containerName;
          wordContainer.addChild(charContainer);
        }
        
        // 計算された位置を設定
        charContainer.position.set(layoutResult.position.x, layoutResult.position.y);
        
        // 回転はテンプレート側で適用するため、コンテナレベルでは適用しない
        charContainer.rotation = 0;
        
        // フレーズ一括入場制御の適用
        if (this.isPhraseCumulativeMode(params.wordDisplayMode) && params.phraseTimingControl) {
          this.applyPhraseCumulativeTimingControl(charContainer, charData, params.phraseTimingControl);
        }
        
        // アニメーションコールバックを実行
        if (charAnimationCallback) {
          if (this.isPhraseCumulativeMode(params.wordDisplayMode) && params.phraseTimingControl) {
            const modifiedCharData = {
              ...charData,
              start: params.phraseTimingControl.phraseStartMs,
              end: params.phraseTimingControl.phraseEndMs
            };
            charAnimationCallback(charContainer, modifiedCharData, layoutResult.position, layoutResult.rotation);
          } else {
            charAnimationCallback(charContainer, charData, layoutResult.position, layoutResult.rotation);
          }
        }
      });
      
      return {
        success: true,
        containersManaged: characters.length,
        layoutResults: layoutResults,
        warnings: warnings,
        wordLayoutInfo: wordLayoutInfo
      };
      
    } catch (error) {
      console.error('VerticalLayoutPrimitive: エラーが発生しました', error);
      return {
        success: false,
        containersManaged: 0,
        layoutResults: [],
        warnings: [`エラーが発生しました: ${error}`],
        wordLayoutInfo: []
      };
    }
  }
  
  /**
   * フレーズ一括入場モードかどうかを判定
   */
  private isPhraseCumulativeMode(wordDisplayMode: WordDisplayMode): boolean {
    return wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE ||
           wordDisplayMode === WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE;
  }
  
  /**
   * フレーズ一括入場タイミング制御を適用
   */
  private applyPhraseCumulativeTimingControl(
    charContainer: PIXI.Container,
    _charData: FlexibleCharacterData,
    phraseControl: NonNullable<VerticalLayoutParams['phraseTimingControl']>
  ): void {
    const { nowMs, phraseStartMs, phraseEndMs, headTime = 500, tailTime = 500 } = phraseControl;
    
    const phraseInStartTime = phraseStartMs - headTime;
    const phraseOutEndTime = phraseEndMs + tailTime;
    
    if (nowMs < phraseInStartTime || nowMs > phraseOutEndTime) {
      charContainer.visible = false;
      charContainer.alpha = 0;
    } else if (nowMs < phraseStartMs) {
      const progress = (nowMs - phraseInStartTime) / headTime;
      charContainer.visible = true;
      charContainer.alpha = Math.max(0, Math.min(1, progress));
    } else if (nowMs <= phraseEndMs) {
      charContainer.visible = true;
      charContainer.alpha = 1;
    } else if (nowMs < phraseOutEndTime) {
      const exitProgress = (nowMs - phraseEndMs) / tailTime;
      charContainer.visible = true;
      charContainer.alpha = Math.max(0, 1 - exitProgress);
    }
    
    charContainer.updateTransform();
  }
}