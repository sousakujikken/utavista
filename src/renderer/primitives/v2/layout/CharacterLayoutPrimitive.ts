/**
 * 文字レイアウトプリミティブ v2.0
 * 責任範囲: 単語内文字コンテナの配置とレイアウト管理（単語レベル処理は除外）
 */

import * as PIXI from 'pixi.js';
import { BasePrimitive, CharacterLayoutParams, CharacterLayoutResult, LayoutResult, WordLayoutInfo, Position, HierarchyType } from '../types';
import { FlexibleCharacterData } from '../../../types/types';

export class CharacterLayoutPrimitive implements BasePrimitive {
  readonly name = 'CharacterLayout';
  readonly version = '2.0.0';
  readonly supportedHierarchy: HierarchyType = 'character';

  /**
   * 単語内文字レイアウト
   * 用途: 単語コンテナ内での文字配置
   * 注意: 単語レベル処理は上位層（WordPositionPrimitive）で実行済み
   */
  layoutIndividual(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    const warnings: string[] = [];

    // 文字レベル処理のみ実行（単語は既に分離済み前提）
    let charXOffset = 0;

    params.chars.forEach((charData, index) => {
      try {
        const container = this.getOrCreateContainer(wordContainer, charData, params);
        const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);

        container.position.set(charXOffset, 0);

        results.push({
          id: charData.id,
          position: { x: charXOffset, y: 0 },
          container
        });

        if (animationCallback) {
          animationCallback(container, charData);
        }

        charXOffset += params.fontSize * effectiveSpacing;

      } catch (error) {
        warnings.push(`文字配置エラー (${index}): ${error}`);
      }
    });

    return {
      success: results.length > 0,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results, params),
      warnings
    };
  }

  /**
   * 累積フレーズレイアウト
   * 用途: GlitchText系テンプレート
   */
  layoutCumulative(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    const warnings: string[] = [];

    // フレーズ全体でcharIndexを使用した累積配置
    params.chars.forEach((charData, index) => {
      try {
        const container = this.getOrCreateContainer(wordContainer, charData, params);
        const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);

        const xOffset = charData.charIndex * params.fontSize * effectiveSpacing;
        container.position.set(xOffset, 0);

        results.push({
          id: charData.id,
          position: { x: xOffset, y: 0 },
          container
        });

        if (animationCallback) {
          animationCallback(container, charData);
        }

      } catch (error) {
        warnings.push(`累積配置エラー (${index}): ${error}`);
      }
    });

    return {
      success: results.length > 0,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results, params),
      warnings
    };
  }

  /**
   * 改行レイアウト
   * 用途: 縦書き系テンプレート
   */
  layoutNewLine(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    const warnings: string[] = [];
    
    // 単語ごとの改行配置（単語グループ化は最小限）
    const wordsMap = this.groupCharactersByWord(params.chars);
    let currentLineY = 0;

    wordsMap.forEach((wordChars, wordIndex) => {
      let wordXOffset = 0;

      wordChars.forEach((charData, charIndex) => {
        try {
          const container = this.getOrCreateContainer(wordContainer, charData, params);
          const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);

          container.position.set(wordXOffset, currentLineY);

          results.push({
            id: charData.id,
            position: { x: wordXOffset, y: currentLineY },
            container
          });

          if (animationCallback) {
            animationCallback(container, charData);
          }

          wordXOffset += params.fontSize * effectiveSpacing;

        } catch (error) {
          warnings.push(`改行配置エラー (word:${wordIndex}, char:${charIndex}): ${error}`);
        }
      });

      // 次の行に移動
      currentLineY += params.fontSize * params.lineHeight;
    });

    return {
      success: results.length > 0,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results, params),
      warnings
    };
  }

  /**
   * スペーシングレイアウト
   * 用途: 単語間スペース付きテンプレート
   */
  layoutSpacing(
    wordContainer: PIXI.Container,
    params: CharacterLayoutParams,
    animationCallback?: (container: PIXI.Container, charData: FlexibleCharacterData) => void
  ): CharacterLayoutResult {
    const results: LayoutResult[] = [];
    const warnings: string[] = [];
    
    const wordsMap = this.groupCharactersByWord(params.chars);
    let cumulativeXOffset = 0;

    wordsMap.forEach((wordChars, wordIndex) => {
      wordChars.forEach((charData, charIndex) => {
        try {
          const container = this.getOrCreateContainer(wordContainer, charData, params);
          const effectiveSpacing = this.calculateEffectiveSpacing(charData.char, params);

          container.position.set(cumulativeXOffset, 0);

          results.push({
            id: charData.id,
            position: { x: cumulativeXOffset, y: 0 },
            container
          });

          if (animationCallback) {
            animationCallback(container, charData);
          }

          cumulativeXOffset += params.fontSize * effectiveSpacing;

        } catch (error) {
          warnings.push(`スペーシング配置エラー (word:${wordIndex}, char:${charIndex}): ${error}`);
        }
      });

      // 単語間スペースを追加
      cumulativeXOffset += params.fontSize * params.wordSpacing;
    });

    return {
      success: results.length > 0,
      layoutResults: results,
      wordLayoutInfo: this.generateWordLayoutInfo(results, params),
      warnings
    };
  }

  /**
   * 文字コンテナの取得または作成
   */
  private getOrCreateContainer(
    parentContainer: PIXI.Container,
    charData: FlexibleCharacterData,
    params: CharacterLayoutParams
  ): PIXI.Container {
    const containerName = `${params.containerPrefix}${charData.id}`;
    
    let container = parentContainer.children.find(
      child => child.name === containerName
    ) as PIXI.Container;

    if (!container) {
      container = new PIXI.Container();
      container.name = containerName;
      parentContainer.addChild(container);
    }

    return container;
  }

  /**
   * 文字の有効スペーシング計算
   */
  private calculateEffectiveSpacing(char: string, params: CharacterLayoutParams): number {
    // 全角・半角判定
    const isFullWidth = this.isFullWidthCharacter(char);
    
    if (isFullWidth) {
      return params.charSpacing;
    } else {
      return params.charSpacing * params.halfWidthSpacingRatio;
    }
  }

  /**
   * 全角文字判定
   */
  private isFullWidthCharacter(char: string): boolean {
    if (!char) return false;
    
    const code = char.charCodeAt(0);
    
    // 日本語文字範囲
    return (
      (code >= 0x3040 && code <= 0x309F) || // ひらがな
      (code >= 0x30A0 && code <= 0x30FF) || // カタカナ
      (code >= 0x4E00 && code <= 0x9FAF) || // 漢字
      (code >= 0xFF01 && code <= 0xFF5E)    // 全角英数記号
    );
  }

  /**
   * 文字の単語別グループ化（最小限の実装）
   */
  private groupCharactersByWord(chars: FlexibleCharacterData[]): Map<number, FlexibleCharacterData[]> {
    const wordsMap = new Map<number, FlexibleCharacterData[]>();

    chars.forEach(charData => {
      const wordIndex = charData.wordIndex || 0;
      
      if (!wordsMap.has(wordIndex)) {
        wordsMap.set(wordIndex, []);
      }
      
      wordsMap.get(wordIndex)!.push(charData);
    });

    return wordsMap;
  }

  /**
   * 単語レイアウト情報生成
   */
  private generateWordLayoutInfo(results: LayoutResult[], params: CharacterLayoutParams): WordLayoutInfo[] {
    const wordInfo: WordLayoutInfo[] = [];
    const wordsMap = this.groupCharactersByWord(params.chars);

    wordsMap.forEach((wordChars, wordIndex) => {
      const wordResults = results.filter(result => 
        wordChars.some(char => char.id === result.id)
      );

      if (wordResults.length === 0) return;

      const startCharIndex = Math.min(...wordChars.map(char => char.charIndex));
      const endCharIndex = Math.max(...wordChars.map(char => char.charIndex));
      
      const positions = wordResults.map(r => r.position.x);
      const minX = Math.min(...positions);
      const maxX = Math.max(...positions);
      const totalWidth = maxX - minX + params.fontSize;

      wordInfo.push({
        wordIndex,
        startCharIndex,
        endCharIndex,
        totalWidth,
        position: {
          x: minX,
          y: wordResults[0].position.y,
          alpha: 1
        }
      });
    });

    return wordInfo.sort((a, b) => a.wordIndex - b.wordIndex);
  }
}