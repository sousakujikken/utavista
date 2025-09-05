/**
 * Word Container拡張
 * 単語コンテナに文字数・幅・テキスト情報を管理する属性を追加
 */

import * as PIXI from 'pixi.js';

/**
 * Word Containerに追加する属性のインターface
 */
export interface WordContainerAttributes {
  /** 単語内の文字数 */
  charCount: number;
  /** 実際の単語幅（フォントサイズ・間隔を考慮） */
  actualWidth: number;
  /** 単語のテキスト内容 */
  wordText: string;
  /** 単語インデックス */
  wordIndex: number;
  /** フォントサイズ */
  fontSize: number;
  /** 文字間隔 */
  charSpacing: number;
  /** 半角文字の間隔比率 */
  halfWidthSpacingRatio: number;
}

/**
 * 拡張されたWord Container
 */
export interface ExtendedWordContainer extends PIXI.Container {
  wordAttributes?: WordContainerAttributes;
}

/**
 * 半角文字判定
 */
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * Word Container属性管理ユーティリティ
 */
export class WordContainerAttributeManager {
  
  /**
   * Word Containerの属性を初期化
   */
  static initializeAttributes(
    container: PIXI.Container,
    wordIndex: number,
    fontSize: number,
    charSpacing: number,
    halfWidthSpacingRatio: number = 0.6,
    forceReset: boolean = false
  ): void {
    const extendedContainer = container as ExtendedWordContainer;
    
    // 強制リセットまたは既存属性がない場合のみ初期化
    if (forceReset || !extendedContainer.wordAttributes) {
      extendedContainer.wordAttributes = {
        charCount: 0,
        actualWidth: 0,
        wordText: '',
        wordIndex,
        fontSize,
        charSpacing,
        halfWidthSpacingRatio
      };
      console.log(`[WordContainerAttributeManager] ${forceReset ? 'Reset' : 'Initialized'} attributes for word ${wordIndex} (${container.name})`);
    }
  }
  
  /**
   * 文字コンテナ追加時の属性更新
   * 注意: 文字の重複チェックは行わない（「ぷくぷく」のような繰り返しを正しく扱うため）
   */
  static addCharacter(container: PIXI.Container, char: string, charIndex?: number): void {
    const extendedContainer = container as ExtendedWordContainer;
    if (!extendedContainer.wordAttributes) {
      console.warn('WordContainerAttributeManager: Word container attributes not initialized');
      return;
    }
    
    const attrs = extendedContainer.wordAttributes;
    
    // 文字を追加（重複チェックなし）
    attrs.charCount++;
    attrs.wordText += char;
    
    // 実際の幅を再計算
    attrs.actualWidth = this.calculateActualWidth(attrs.wordText, attrs.fontSize, attrs.charSpacing, attrs.halfWidthSpacingRatio);
    
    console.log(`[WordContainerAttributeManager] Added char "${char}" to word ${attrs.wordIndex}: "${attrs.wordText}" (${attrs.charCount} chars, width: ${attrs.actualWidth})`);
  }
  
  /**
   * 文字コンテナ削除時の属性更新
   */
  static removeCharacter(container: PIXI.Container, char: string): void {
    const extendedContainer = container as ExtendedWordContainer;
    if (!extendedContainer.wordAttributes) return;
    
    const attrs = extendedContainer.wordAttributes;
    attrs.charCount = Math.max(0, attrs.charCount - 1);
    attrs.wordText = attrs.wordText.replace(char, '');
    
    // 実際の幅を再計算
    attrs.actualWidth = this.calculateActualWidth(attrs.wordText, attrs.fontSize, attrs.charSpacing, attrs.halfWidthSpacingRatio);
  }
  
  /**
   * テキストから実際の幅を計算
   */
  private static calculateActualWidth(
    text: string,
    fontSize: number,
    charSpacing: number,
    halfWidthSpacingRatio: number
  ): number {
    let width = 0;
    for (const char of text) {
      const effectiveSpacing = isHalfWidthChar(char) 
        ? charSpacing * halfWidthSpacingRatio
        : charSpacing;
      width += fontSize * effectiveSpacing;
    }
    return width;
  }
  
  /**
   * Word Containerの属性を取得
   */
  static getAttributes(container: PIXI.Container): WordContainerAttributes | null {
    const extendedContainer = container as ExtendedWordContainer;
    return extendedContainer.wordAttributes || null;
  }
  
  /**
   * フレーズコンテナから指定された単語インデックスのWord Containerを検索
   */
  static findWordContainer(phraseContainer: PIXI.Container, targetWordIndex: number): ExtendedWordContainer | null {
    for (const child of phraseContainer.children) {
      if (child.name && child.name.includes(`word_container_`) && child.name.includes(`_word_${targetWordIndex}`)) {
        return child as ExtendedWordContainer;
      }
    }
    console.warn(`[WordContainerAttributeManager] Container not found for word ${targetWordIndex} in phrase with ${phraseContainer.children.length} children`);
    console.log(`[WordContainerAttributeManager] Available containers:`, 
      phraseContainer.children.map(c => c.name).filter(name => name && name.includes('word_container_')));
    return null;
  }
  
  /**
   * フレーズコンテナから指定された単語インデックス未満のすべての単語の累積幅を計算
   */
  static calculateCumulativeWidth(
    phraseContainer: PIXI.Container,
    targetWordIndex: number,
    wordSpacing: number,
    fontSize: number,
    charSpacing: number
  ): number {
    let cumulativeWidth = 0;
    
    console.log(`[WordContainerAttributeManager] Calculating cumulative width for word ${targetWordIndex}`);
    console.log(`[WordContainerAttributeManager] Available children:`, phraseContainer.children.map(c => ({ name: c.name, type: c.constructor.name })));
    
    for (let i = 0; i < targetWordIndex; i++) {
      const wordContainer = this.findWordContainer(phraseContainer, i);
      if (wordContainer && wordContainer.wordAttributes) {
        const attrs = wordContainer.wordAttributes;
        
        // 単語の実際の幅を追加
        cumulativeWidth += attrs.actualWidth;
        
        // 単語間スペースを追加
        // 修正: charSpacingの重複適用を除去（単語間隔は文字間隔とは独立）
        const spacing = fontSize * wordSpacing;
        cumulativeWidth += spacing;
        
        console.log(`[WordContainerAttributeManager] Word ${i}: "${attrs.wordText}" (chars: ${attrs.charCount}, width: ${attrs.actualWidth}, spacing: ${spacing}, total: ${cumulativeWidth})`);
      } else {
        console.warn(`[WordContainerAttributeManager] Word ${i}: No container or attributes found`);
        if (wordContainer) {
          this.debugAttributes(wordContainer, `Word ${i}`);
        }
      }
    }
    
    console.log(`[WordContainerAttributeManager] Final cumulative width for word ${targetWordIndex}: ${cumulativeWidth}`);
    return cumulativeWidth;
  }
  
  /**
   * フレーズコンテナ内の全Word Container属性をリセット
   * パラメータ変更時に使用
   */
  static resetAllWordAttributes(
    phraseContainer: PIXI.Container,
    fontSize: number,
    charSpacing: number,
    halfWidthSpacingRatio: number = 0.6
  ): void {
    console.log(`[WordContainerAttributeManager] Resetting all word attributes in phrase container`);
    
    phraseContainer.children.forEach(child => {
      if (child.name && child.name.includes('word_container_')) {
        const match = child.name.match(/_word_(\d+)$/);
        if (match) {
          const wordIndex = parseInt(match[1], 10);
          this.initializeAttributes(
            child as PIXI.Container,
            wordIndex,
            fontSize,
            charSpacing,
            halfWidthSpacingRatio,
            true  // 強制リセット
          );
        }
      }
    });
  }
  
  /**
   * デバッグ用：Word Container属性の詳細を出力
   */
  static debugAttributes(container: PIXI.Container, label: string = ''): void {
    const attrs = this.getAttributes(container);
    if (attrs) {
      console.log(`[WordContainerAttributes${label ? ' ' + label : ''}]:`, {
        wordIndex: attrs.wordIndex,
        charCount: attrs.charCount,
        wordText: attrs.wordText,
        actualWidth: attrs.actualWidth,
        fontSize: attrs.fontSize,
        charSpacing: attrs.charSpacing
      });
    } else {
      console.log(`[WordContainerAttributes${label ? ' ' + label : ''}]: No attributes found`);
    }
  }
}