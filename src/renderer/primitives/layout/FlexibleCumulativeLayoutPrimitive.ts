/**
 * FlexibleCumulativeLayoutPrimitive
 * 柔軟な単語配置モードをサポートする累積レイアウトプリミティブ
 * GlitchText、WordSlideText両方のニーズに対応
 */

import * as PIXI from 'pixi.js';
import { LayoutPrimitive, LayoutItem, LayoutParams, LayoutResult } from '../types';
import { WordContainerAttributeManager } from '../../types/WordContainerExtensions';

/**
 * 単語表示モード
 */
export enum WordDisplayMode {
  /** 単語ごとに個別入場 × 同一行 */
  INDIVIDUAL_WORD_ENTRANCE_SAME_LINE = 'individual_word_entrance_same_line',
  /** フレーズ一括入場 × 同一行 */
  PHRASE_CUMULATIVE_SAME_LINE = 'phrase_cumulative_same_line',
  /** 単語ごとに個別入場 × 改行 */
  INDIVIDUAL_WORD_ENTRANCE_NEW_LINE = 'individual_word_entrance_new_line',
  /** フレーズ一括入場 × 改行 */
  PHRASE_CUMULATIVE_NEW_LINE = 'phrase_cumulative_new_line'
}

/**
 * 文字データ（拡張版）
 */
export interface FlexibleCharacterData {
  id: string;
  char: string;
  start: number;
  end: number;
  /** 単語内での文字インデックス */
  charIndexInWord: number;
  /** フレーズ全体での累積文字インデックス */
  charIndex: number;
  /** 単語インデックス */
  wordIndex: number;
  /** フレーズ内の総文字数 */
  totalChars: number;
  /** フレーズ内の総単語数 */
  totalWords: number;
}

/**
 * 柔軟な累積レイアウトパラメータ
 */
export interface FlexibleCumulativeLayoutParams extends LayoutParams {
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
  /** フレーズ一括入場制御用パラメータ（オプション） */
  phraseTimingControl?: {
    /** 現在時刻 */
    nowMs: number;
    /** フレーズ開始時刻 */
    phraseStartMs: number;
    /** フレーズ終了時刻 */
    phraseEndMs: number;
    /** フレーズ入場時間 */
    headTime?: number;
    /** フレーズ退場時間 */
    tailTime?: number;
  };
  /** 全単語の拡張ID情報（正確なオフセット計算用）（オプション） */
  allWordExtendedIds?: string[];
}

/**
 * 文字管理結果（拡張版）
 */
export interface FlexibleCharacterManagementResult {
  success: boolean;
  containersManaged: number;
  layoutResults: LayoutResult[];
  warnings: string[];
  /** 単語別の配置情報 */
  wordLayoutInfo: Array<{
    wordIndex: number;
    startX: number;
    endX: number;
    y: number;
    charCount: number;
  }>;
}

/**
 * 半角文字判定
 */
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 柔軟な累積レイアウトプリミティブ
 */
export class FlexibleCumulativeLayoutPrimitive implements LayoutPrimitive {
  name = 'FlexibleCumulativeLayoutPrimitive';
  
  /**
   * wordDisplayModeの利用可能な選択肢を取得
   * テンプレート実装時の表記揺らぎを防止するため、プリミティブ側で一元管理
   */
  static getWordDisplayModeOptions(): { value: string; label: string }[] {
    return [
      {
        value: WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_SAME_LINE,
        label: "単語ごとに個別入場 × 同一行"
      },
      {
        value: WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE,
        label: "フレーズ一括入場 × 同一行"
      },
      {
        value: WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_NEW_LINE,
        label: "単語ごとに個別入場 × 改行"
      },
      {
        value: WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE,
        label: "フレーズ一括入場 × 改行"
      }
    ];
  }

  /**
   * wordDisplayModeの値のみの配列を取得（互換性のため）
   */
  static getWordDisplayModeValues(): string[] {
    return this.getWordDisplayModeOptions().map(option => option.value);
  }
  
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
    params: FlexibleCumulativeLayoutParams
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    let cumulativeXOffset = 0;
    let currentLineY = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const char = item.content;
      
      // 半角文字の場合は文字間隔を補正
      const effectiveSpacing = isHalfWidthChar(char) 
        ? params.charSpacing * params.halfWidthSpacingRatio
        : params.charSpacing;
      
      // 現在の文字位置を記録
      results.push({
        id: item.id,
        position: { x: cumulativeXOffset, y: currentLineY }
      });
      
      // 次の文字のために累積オフセットを更新
      cumulativeXOffset += params.fontSize * effectiveSpacing;
    }
    
    return results;
  }
  
  /**
   * 柔軟な文字コンテナ管理（複数表示モード対応）
   */
  manageCharacterContainersFlexible(
    wordContainer: PIXI.Container,
    params: FlexibleCumulativeLayoutParams,
    charAnimationCallback?: (
      charContainer: PIXI.Container,
      charData: FlexibleCharacterData,
      position: { x: number; y: number }
    ) => void
  ): FlexibleCharacterManagementResult {
    const warnings: string[] = [];
    const wordLayoutInfo: Array<{
      wordIndex: number;
      startX: number;
      endX: number;
      y: number;
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
      const layoutResults = this.calculateLayoutByMode(characters, params);
      
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
          const startX = Math.min(...charResults.map(r => r.position.x));
          const endX = Math.max(...charResults.map(r => r.position.x));
          const y = charResults[0].position.y;
          
          wordLayoutInfo.push({
            wordIndex,
            startX,
            endX,
            y,
            charCount: wordChars.length
          });
        }
      });
      
      // 文字コンテナの管理とWord Container属性の更新
      // console.log(`[FlexibleCumulativeLayoutPrimitive] Managing ${characters.length} characters for word ${characters[0]?.wordIndex}`);
      
      // 最初の文字でWord Container属性を初期化/更新
      if (characters.length > 0) {
        const firstChar = characters[0];
        const extendedWordContainer = wordContainer as any;
        
        // wordIndexを取得（undefinedの場合はコンテナ名から推定）
        let actualWordIndex = firstChar.wordIndex;
        if (actualWordIndex === undefined && wordContainer.name) {
          const match = wordContainer.name.match(/_word_(\d+)$/);
          if (match) {
            actualWordIndex = parseInt(match[1], 10);
            // console.log(`[FlexibleCumulativeLayoutPrimitive] Inferred wordIndex ${actualWordIndex} from container name ${wordContainer.name}`);
          }
        }
        
        // 属性の初期化が必要かチェック
        const needsReinit = !extendedWordContainer.wordAttributes || 
          extendedWordContainer.wordAttributes.wordIndex !== actualWordIndex ||
          extendedWordContainer.wordAttributes.fontSize !== params.fontSize ||
          extendedWordContainer.wordAttributes.charSpacing !== params.charSpacing ||
          extendedWordContainer.wordAttributes.halfWidthSpacingRatio !== params.halfWidthSpacingRatio;

        if (needsReinit) {
          // console.log(`[FlexibleCumulativeLayoutPrimitive] Reinitializing attributes for word ${actualWordIndex} due to parameter changes`);
          WordContainerAttributeManager.initializeAttributes(
            wordContainer,
            actualWordIndex,
            params.fontSize,
            params.charSpacing,
            params.halfWidthSpacingRatio,
            true  // 強制リセット
          );
          
          // 全文字を一度に追加
          characters.forEach((charData, idx) => {
            // console.log(`[FlexibleCumulativeLayoutPrimitive] Adding char[${idx}] "${charData.char}" to word ${actualWordIndex}`);
            WordContainerAttributeManager.addCharacter(wordContainer, charData.char, idx);
          });
        }
      }
      
      // 各文字コンテナの処理
      characters.forEach((charData, index) => {
        const layoutResult = layoutResults[index];
        const containerName = `${params.containerPrefix}${charData.id}`;
        
        // console.log(`[FlexibleCumulativeLayoutPrimitive] Processing char container "${charData.char}" (${containerName})`);
        
        // 既存の文字コンテナを検索
        let charContainer: PIXI.Container | null = null;
        
        wordContainer.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && child.name === containerName) {
            charContainer = child as PIXI.Container;
          }
        });
        
        // コンテナが存在しない場合は作成
        if (!charContainer) {
          // console.log(`[FlexibleCumulativeLayoutPrimitive] Creating new char container: ${containerName}`);
          charContainer = new PIXI.Container();
          (charContainer as any).name = containerName;
          wordContainer.addChild(charContainer);
        }
        
        // 計算された位置を設定
        charContainer.position.set(layoutResult.position.x, layoutResult.position.y);
        
        // フレーズ一括入場制御の適用
        if (this.isPhraseCumulativeMode(params.wordDisplayMode) && params.phraseTimingControl) {
          this.applyPhraseCumulativeTimingControl(charContainer, charData, params.phraseTimingControl);
          
          // 初回のみ制御結果をログ出力
          if (charData.charIndex === 0) {
            // console.log(`[FlexibleCumulativeLayoutPrimitive] Phrase cumulative timing control applied: visible=${charContainer.visible}, alpha=${charContainer.alpha}`);
          }
        }
        
        // アニメーションコールバックを実行
        if (charAnimationCallback) {
          // フレーズ一括入場モードの場合、文字データにフレーズタイミング情報を追加
          if (this.isPhraseCumulativeMode(params.wordDisplayMode) && params.phraseTimingControl) {
            const modifiedCharData = {
              ...charData,
              // フレーズ一括入場モードでは、フレーズのタイミングを使用
              start: params.phraseTimingControl.phraseStartMs,
              end: params.phraseTimingControl.phraseEndMs
            };
            charAnimationCallback(charContainer, modifiedCharData, layoutResult.position);
          } else {
            charAnimationCallback(charContainer, charData, layoutResult.position);
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
      console.error('FlexibleCumulativeLayoutPrimitive: エラーが発生しました', error);
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
   * 表示モードに応じたレイアウト計算
   */
  private calculateLayoutByMode(
    characters: FlexibleCharacterData[],
    params: FlexibleCumulativeLayoutParams
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    
    // デバッグ：使用されるレイアウトモードとwordSpacingを確認
    // ログ抑制: wordDisplayMode (毎フレーム出力)
    
    switch (params.wordDisplayMode) {
      case WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_SAME_LINE:
        // 単語ごとに個別入場 × 同一行
        this.calculateIndividualWordLayout(characters, params, results);
        break;
        
      case WordDisplayMode.PHRASE_CUMULATIVE_SAME_LINE:
        // フレーズ一括入場 × 同一行
        this.calculatePhraseCumulativeLayout(characters, params, results);
        break;
        
      case WordDisplayMode.INDIVIDUAL_WORD_ENTRANCE_NEW_LINE:
        // 単語ごとに個別入場 × 改行
        this.calculateIndividualWordNewLineLayout(characters, params, results);
        break;
        
      case WordDisplayMode.PHRASE_CUMULATIVE_NEW_LINE:
        // フレーズ一括入場 × 改行
        this.calculatePhraseCumulativeNewLineLayout(characters, params, results);
        break;
        
      default:
        // デフォルトは単語ごとに個別入場 × 同一行
        this.calculateIndividualWordLayout(characters, params, results);
        break;
    }
    
    return results;
  }
  
  /**
   * 単語ごとに個別入場の基本レイアウト
   * 単語の配置戦略を制御（行頭配置 or 前の単語の末尾配置）
   */
  private calculateIndividualWordLayout(
    characters: FlexibleCharacterData[],
    params: FlexibleCumulativeLayoutParams,
    results: LayoutResult[]
  ): void {
    // 単語インデックスをIDから抽出（フォールバック）
    characters.forEach(char => {
      if (char.wordIndex === undefined || char.wordIndex === null) {
        const wordIndexFromId = this.extractWordIndexFromId(char.id);
        if (wordIndexFromId !== null) {
          char.wordIndex = wordIndexFromId;
        }
      }
    });
    
    // 単語ごとにグループ化
    const wordsMap = new Map<number, FlexibleCharacterData[]>();
    characters.forEach(char => {
      if (!wordsMap.has(char.wordIndex)) {
        wordsMap.set(char.wordIndex, []);
      }
      wordsMap.get(char.wordIndex)!.push(char);
    });
    
    // 現在処理している単語のインデックスを取得
    const currentWordIndex = Math.min(...Array.from(wordsMap.keys()));
    
    // 前の単語までの累積オフセットを計算（改良版）
    let cumulativeXOffset;
    try {
      cumulativeXOffset = this.calculateImprovedPreviousWordsOffset(currentWordIndex, characters, params);
      // ログ抑制: calculateImprovedPreviousWordsOffset成功 (毎フレーム出力)
    } catch (error) {
      console.error(`[FlexibleCumulativeLayoutPrimitive] calculateImprovedPreviousWordsOffset失敗:`, error);
      // フォールバック処理
      cumulativeXOffset = this.calculatePreviousWordsOffset(characters, currentWordIndex, params);
      // ログ抑制: フォールバック使用 (毎フレーム出力)
    }
    
    const sortedWordIndices = Array.from(wordsMap.keys()).sort((a, b) => a - b);
    
    // 現在の単語の文字のみを処理（単語間スペースはオフセットで管理済み）
    sortedWordIndices.forEach((wordIndex) => {
      const wordChars = wordsMap.get(wordIndex)!;
      
      // 単語内の文字を順番通りにソート（charIndex順）
      wordChars.sort((a, b) => {
        const aLocalIndex = a.charIndex - Math.min(...wordChars.map(c => c.charIndex));
        const bLocalIndex = b.charIndex - Math.min(...wordChars.map(c => c.charIndex));
        return aLocalIndex - bLocalIndex;
      });
      
      // 各文字を累積位置に配置
      wordChars.forEach((charData) => {
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) 
          ? params.charSpacing * params.halfWidthSpacingRatio
          : params.charSpacing;
        
        results.push({
          id: charData.id,
          position: { x: cumulativeXOffset, y: 0 }
        });
        
        cumulativeXOffset += params.fontSize * effectiveSpacing;
      });
    });
  }
  
  
  
  /**
   * 同じ行に単語を配置（GlitchTextスタイル）
   */
  private calculatePhraseCumulativeLayout(
    characters: FlexibleCharacterData[],
    params: FlexibleCumulativeLayoutParams,
    results: LayoutResult[]
  ): void {
    // 単語ごとにグループ化してwordSpacingを適用
    const wordsMap = new Map<number, FlexibleCharacterData[]>();
    characters.forEach(char => {
      if (!wordsMap.has(char.wordIndex)) {
        wordsMap.set(char.wordIndex, []);
      }
      wordsMap.get(char.wordIndex)!.push(char);
    });
    
    let cumulativeXOffset = 0;
    const sortedWordIndices = Array.from(wordsMap.keys()).sort((a, b) => a - b);
    
    sortedWordIndices.forEach((wordIndex, index) => {
      const wordChars = wordsMap.get(wordIndex)!;
      
      wordChars.forEach((charData) => {
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) 
          ? params.charSpacing * params.halfWidthSpacingRatio
          : params.charSpacing;
        
        results.push({
          id: charData.id,
          position: { x: cumulativeXOffset, y: 0 }
        });
        
        cumulativeXOffset += params.fontSize * effectiveSpacing;
      });
      
      // 最後の単語以外の後に単語間スペースを追加
      // ただし、拡張ID使用時は calculateImprovedPreviousWordsOffset 内で既に適用済みのためスキップ
      // 修正: より厳密な条件で重複適用を防止
      if (index < sortedWordIndices.length - 1 && 
          (!params.allWordExtendedIds || params.allWordExtendedIds.length === 0)) {
        // フォールバック時のみ適用：通常は calculateImprovedPreviousWordsOffset で処理済み
        const fallbackSpacing = params.fontSize * params.wordSpacing;
        cumulativeXOffset += fallbackSpacing;
        console.log(`[FlexibleCumulativeLayoutPrimitive] フォールバック時のwordSpacing適用: ${fallbackSpacing}`);
      }
    });
  }

  /**
   * 単語ごとに個別入場 × 改行
   * 各単語を異なる行に配置し、単語ごとに時間制御
   */
  private calculateIndividualWordNewLineLayout(
    characters: FlexibleCharacterData[],
    params: FlexibleCumulativeLayoutParams,
    results: LayoutResult[]
  ): void {
    // 単語ごとにグループ化
    const wordsMap = new Map<number, FlexibleCharacterData[]>();
    characters.forEach(char => {
      if (!wordsMap.has(char.wordIndex)) {
        wordsMap.set(char.wordIndex, []);
      }
      wordsMap.get(char.wordIndex)!.push(char);
    });

    const sortedWordIndices = Array.from(wordsMap.keys()).sort((a, b) => a - b);
    
    sortedWordIndices.forEach((wordIndex) => {
      const wordChars = wordsMap.get(wordIndex)!;
      let wordXOffset = 0;
      
      // 行の高さを計算（単語インデックス基準）
      const lineY = wordIndex * params.fontSize * params.lineHeight;
      
      // 単語内の文字を順番通りにソート（charIndex順）
      wordChars.sort((a, b) => {
        const aLocalIndex = a.charIndex - Math.min(...wordChars.map(c => c.charIndex));
        const bLocalIndex = b.charIndex - Math.min(...wordChars.map(c => c.charIndex));
        return aLocalIndex - bLocalIndex;
      });
      
      wordChars.forEach((charData) => {
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) 
          ? params.charSpacing * params.halfWidthSpacingRatio
          : params.charSpacing;
        
        results.push({
          id: charData.id,
          position: { x: wordXOffset, y: lineY }
        });
        
        wordXOffset += params.fontSize * effectiveSpacing;
      });
    });
  }

  /**
   * フレーズ一括入場 × 改行
   * 単語を異なる行に配置するが、表示タイミングはフレーズ単位で一括制御
   */
  private calculatePhraseCumulativeNewLineLayout(
    characters: FlexibleCharacterData[],
    params: FlexibleCumulativeLayoutParams,
    results: LayoutResult[]
  ): void {
    // 単語ごとにグループ化
    const wordsMap = new Map<number, FlexibleCharacterData[]>();
    characters.forEach(char => {
      if (!wordsMap.has(char.wordIndex)) {
        wordsMap.set(char.wordIndex, []);
      }
      wordsMap.get(char.wordIndex)!.push(char);
    });

    const sortedWordIndices = Array.from(wordsMap.keys()).sort((a, b) => a - b);
    
    sortedWordIndices.forEach((wordIndex) => {
      const wordChars = wordsMap.get(wordIndex)!;
      let wordXOffset = 0;
      
      // 行の高さを計算（単語インデックス基準）
      const lineY = wordIndex * params.fontSize * params.lineHeight;
      
      // 文字をcharIndex順でソート
      wordChars.sort((a, b) => a.charIndex - b.charIndex);
      
      wordChars.forEach((charData) => {
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) 
          ? params.charSpacing * params.halfWidthSpacingRatio
          : params.charSpacing;
        
        results.push({
          id: charData.id,
          position: { x: wordXOffset, y: lineY }
        });
        
        wordXOffset += params.fontSize * effectiveSpacing;
      });
    });
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
    phraseControl: NonNullable<FlexibleCumulativeLayoutParams['phraseTimingControl']>
  ): void {
    const { nowMs, phraseStartMs, phraseEndMs, headTime = 500, tailTime = 500 } = phraseControl;
    
    const phraseInStartTime = phraseStartMs - headTime;
    const phraseOutEndTime = phraseEndMs + tailTime;
    
    // タイミング計算詳細ログは削除（パフォーマンス向上）
    
    // フレーズのタイミングに基づいて表示制御
    if (nowMs < phraseInStartTime || nowMs > phraseOutEndTime) {
      // フレーズ範囲外 - 非表示
      charContainer.visible = false;
      charContainer.alpha = 0;
    } else if (nowMs < phraseStartMs) {
      // フレーズ入場中 - フェードイン
      const progress = (nowMs - phraseInStartTime) / headTime;
      charContainer.visible = true;
      charContainer.alpha = Math.max(0, Math.min(1, progress));
    } else if (nowMs <= phraseEndMs) {
      // フレーズアクティブ中 - 完全表示
      charContainer.visible = true;
      charContainer.alpha = 1;
    } else if (nowMs < phraseOutEndTime) {
      // フレーズ退場中 - フェードアウト
      const exitProgress = (nowMs - phraseEndMs) / tailTime;
      charContainer.visible = true;
      charContainer.alpha = Math.max(0, 1 - exitProgress);
    }
    
    // トランスフォームを更新
    charContainer.updateTransform();
  }

  /**
   * IDから単語インデックスを抽出
   * 例: "phrase_0_word_2_char_1" -> 2
   */
  private extractWordIndexFromId(id: string): number | null {
    const match = id.match(/word_(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 前の単語までの累積オフセットを計算
   * 各単語の実際の文字数を考慮して正確に計算
   */
  private calculatePreviousWordsOffset(
    currentWordIndex: number, 
    characters: FlexibleCharacterData[], 
    params: FlexibleCumulativeLayoutParams
  ): number {
    if (currentWordIndex === 0) {
      return 0; // 最初の単語なのでオフセット不要
    }
    
    // 現在の単語の文字数から、前の単語の文字数を推定
    const currentWordChars = characters.length;
    
    // 前の各単語の文字数を推定（IDパターンから）
    let totalPreviousChars = 0;
    
    // フレーズ全体の平均文字数から前の単語の文字数を推定
    const firstChar = characters[0];
    if (firstChar && firstChar.totalChars && firstChar.totalWords) {
      // フレーズ全体の平均文字数を計算
      const avgCharsPerWord = firstChar.totalChars / firstChar.totalWords;
      
      // 前の単語（index: 0 から currentWordIndex-1）の文字数合計を推定
      totalPreviousChars = Math.round(avgCharsPerWord * currentWordIndex);
    } else {
      // フォールバック: 推定値を使用
      const estimatedCharsPerWord = 4;
      totalPreviousChars = currentWordIndex * estimatedCharsPerWord;
    }
    
    // 文字分のオフセットのみ計算（単語間スペースはcalculateIndividualWordLayoutで管理）
    const charOffset = totalPreviousChars * params.fontSize * params.charSpacing;
    
    const totalOffset = charOffset;
    
    return totalOffset;
  }

  /**
   * 前の単語までのオフセット計算
   * 拡張IDから文字幅情報を抽出して正確な計算を実行
   */
  private calculateImprovedPreviousWordsOffset(
    currentWordIndex: number,
    characters: FlexibleCharacterData[],
    params: FlexibleCumulativeLayoutParams
  ): number {
    if (currentWordIndex === 0) {
      return 0; // 最初の単語なのでオフセット不要
    }

    const firstChar = characters[0];
    if (!firstChar || !firstChar.id) {
      throw new Error('[FlexibleCumulativeLayoutPrimitive] 文字IDが不足しています');
    }

    // 拡張IDから各単語の正確な文字幅情報を取得
    const previousWordsWidth = this.calculatePreviousWordsWidthFromExtendedIds(
      firstChar.id, 
      currentWordIndex, 
      params
    );
    
    // 単語間スペース分のオフセット
    // 正しい計算: 単語Nの前には、単語間隔がN個存在する（単語0の前は0個、単語1の前は1個）
    // 例: 単語0 → 間隔0個、単語1 → 単語0との間隔1個、単語2 → 単語0,1との間隔2個
    // 修正: charSpacing の重複適用を除去（単語間隔は文字間隔とは独立）
    const wordSpaceOffset = currentWordIndex * params.fontSize * params.wordSpacing;
    
    // ログ抑制: FlexibleCumulativeLayout wordSpaceOffset calculation (毎フレーム出力)
    
    return previousWordsWidth + wordSpaceOffset;
  }


  /**
   * 単語の実際の幅を計算（半角/全角の文字幅を考慮）
   */
  private calculateWordWidth(
    characters: FlexibleCharacterData[],
    params: FlexibleCumulativeLayoutParams
  ): number {
    let totalWidth = 0;
    
    characters.forEach(charData => {
      const char = charData.char;
      const effectiveSpacing = isHalfWidthChar(char) 
        ? params.charSpacing * params.halfWidthSpacingRatio
        : params.charSpacing;
      
      totalWidth += params.fontSize * effectiveSpacing;
    });
    
    return totalWidth;
  }

  /**
   * 拡張IDから前の単語の正確な累積幅を計算
   * 全単語の拡張ID情報を使用して各単語の実際の幅を計算
   */
  private calculatePreviousWordsWidthFromExtendedIds(
    currentCharId: string,
    currentWordIndex: number,
    params: FlexibleCumulativeLayoutParams
  ): number {
    // 拡張ID形式のパターンマッチ (複数の形式をサポート)
    // 形式1: phrase_X_word_Y_hZfW_char_N (拡張ID形式)
    // 形式2: phrase_X_word_Y_char_N (標準ID形式)
    // 形式3: phrase_TIMESTAMP_RANDOMID_word_Y_char_N (タイムスタンプ付きID形式)
    // 形式4: phrase_TIMESTAMP_RANDOMID_word_Y_hZfW_char_N (タイムスタンプ付き拡張ID形式)
    const extendedIdPattern = /phrase_(\d+)_word_(\d+)_h(\d+)f(\d+)_char_(\d+)/;
    const standardIdPattern = /phrase_(\d+)_word_(\d+)_char_(\d+)/;
    const timestampIdPattern = /phrase_(\d+)_([a-z0-9]+)_word_(\d+)_char_(\d+)/;
    const timestampExtendedIdPattern = /phrase_(\d+)_([a-z0-9]+)_word_(\d+)_h(\d+)f(\d+)_char_(\d+)/;
    
    let currentMatch = currentCharId.match(extendedIdPattern);
    let isExtendedFormat = true;
    
    if (!currentMatch) {
      // タイムスタンプ付き拡張ID形式を試す
      const timestampExtendedMatch = currentCharId.match(timestampExtendedIdPattern);
      if (timestampExtendedMatch) {
        // タイムスタンプ付き拡張形式の場合、拡張形式と同様に扱う
        const [, timestamp, randomId, wordIndex, halfWidthCount, fullWidthCount, charIndex] = timestampExtendedMatch;
        currentMatch = [currentCharId, `${timestamp}_${randomId}`, wordIndex, halfWidthCount, fullWidthCount, charIndex];
        isExtendedFormat = true;
        console.log(`[FlexibleCumulativeLayoutPrimitive] Matched timestamp extended format: ${currentCharId}`);
      } else {
        // 標準ID形式を試す
        currentMatch = currentCharId.match(standardIdPattern);
        isExtendedFormat = false;
        
        if (!currentMatch) {
          // タイムスタンプ付きID形式を試す
          const timestampMatch = currentCharId.match(timestampIdPattern);
          if (timestampMatch) {
            // タイムスタンプ付き形式の場合、標準形式と同様に扱う
            const [, timestamp, randomId, wordIndex, charIndex] = timestampMatch;
            currentMatch = [currentCharId, `${timestamp}_${randomId}`, wordIndex, charIndex];
            console.log(`[FlexibleCumulativeLayoutPrimitive] Matched timestamp format: ${currentCharId}`);
          } else {
            throw new Error(`[FlexibleCumulativeLayoutPrimitive] 認識できないID形式: ${currentCharId}`);
          }
        }
      }
    }
    
    const [, phraseId] = currentMatch;
    
    // デバッグ出力
    // ログ抑制: FlexibleCumulativeLayout received (毎フレーム出力)

    // 全単語の拡張ID情報が提供されている場合
    if (params.allWordExtendedIds && params.allWordExtendedIds.length > 0) {
      const previousWordsWidth = this.calculatePreviousWordsWidthFromAllIds(
        params.allWordExtendedIds, 
        currentWordIndex, 
        params
      );
      // ログ抑制: FlexibleCumulativeLayout previousWordsWidth (毎フレーム出力)
      
      // 単語間スペース分のオフセット
      // 修正: charSpacing の重複適用を除去（単語間隔は文字間隔とは独立）
      const wordSpaceOffset = currentWordIndex * params.fontSize * params.wordSpacing;
      // ログ抑制: FlexibleCumulativeLayout wordSpaceOffset calculation (毎フレーム出力)
      
      return previousWordsWidth + wordSpaceOffset;
    }
    
    // 拡張ID情報が不足している場合はエラー
    throw new Error(`[FlexibleCumulativeLayoutPrimitive] 全単語の拡張ID情報が必要です。allWordExtendedIds が提供されていません。`);
  }

  /**
   * 全単語の拡張ID情報から前の単語の正確な累積幅を計算
   */
  private calculatePreviousWordsWidthFromAllIds(
    allWordIds: string[],
    currentWordIndex: number,
    params: FlexibleCumulativeLayoutParams
  ): number {
    let totalWidth = 0;
    
    // 不要なログを抑制
    
    // 前の単語（0からcurrentWordIndex-1）の各単語の実際の幅を計算
    for (let wordIndex = 0; wordIndex < currentWordIndex; wordIndex++) {
      if (wordIndex >= allWordIds.length) {
        throw new Error(`[FlexibleCumulativeLayoutPrimitive] 単語インデックス${wordIndex}の拡張ID情報が不足しています`);
      }
      
      const wordId = allWordIds[wordIndex];
      const wordWidth = this.extractWordWidthFromExtendedId(wordId, params);
      totalWidth += wordWidth;
      
      // 不要なログを抑制
    }
    
    return totalWidth;
  }

  /**
   * 拡張IDから単語の幅を抽出
   * 文字IDまたは単語IDのいずれにも対応
   */
  private extractWordWidthFromExtendedId(
    id: string,
    params: FlexibleCumulativeLayoutParams
  ): number {
    // 複数の拡張ID形式をサポート
    // 形式1: phrase_0_word_1_h5f0_char_2 (標準拡張ID形式)
    // 形式2: phrase_0_word_1_h5f0 (標準単語ID形式)
    // 形式3: phrase_1755356496072_lntjd5nj_word_0_h0f5 (タイムスタンプ付き単語ID形式)
    // 形式4: phrase_1755356496072_lntjd5nj_word_0_h0f5_char_2 (タイムスタンプ付き文字ID形式)
    
    const standardExtendedIdPattern = /phrase_(\d+)_word_(\d+)_h(\d+)f(\d+)(?:_char_(\d+))?/;
    const timestampExtendedIdPattern = /phrase_(\d+)_([a-z0-9]+)_word_(\d+)_h(\d+)f(\d+)(?:_char_(\d+))?/;
    
    // タイムスタンプ付き拡張ID形式を先に試す
    let match = id.match(timestampExtendedIdPattern);
    let halfWidthCount, fullWidthCount;
    
    if (match) {
      // タイムスタンプ付き形式：[全体, timestamp, randomId, wordIndex, halfWidth, fullWidth, charIndex?]
      [, , , , halfWidthCount, fullWidthCount] = match;
      // ID解析成功ログを抑制
    } else {
      // 標準拡張ID形式を試す
      match = id.match(standardExtendedIdPattern);
      if (match) {
        // 標準形式：[全体, phraseIndex, wordIndex, halfWidth, fullWidth, charIndex?]
        [, , , halfWidthCount, fullWidthCount] = match;
        // ID解析成功ログを抑制
      } else {
        // 不正な形式の場合は警告を出してデフォルト幅を返す
        console.warn(`[FlexibleCumulativeLayoutPrimitive] 拡張ID形式ではありません: ${id}. デフォルト文字幅を使用します。`);
        // デフォルトの文字幅を返す（半角1文字分）
        return params.fontSize * params.charSpacing * params.halfWidthSpacingRatio;
      }
    }
    
    // 文字幅のサイズを計算
    const halfWidthSize = params.fontSize * params.charSpacing * params.halfWidthSpacingRatio;
    const fullWidthSize = params.fontSize * params.charSpacing;
    
    // 単語の実際の幅
    return (parseInt(halfWidthCount) * halfWidthSize) + 
           (parseInt(fullWidthCount) * fullWidthSize);
  }
}