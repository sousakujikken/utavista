/**
 * 階層分離型アニメーションテンプレート基底クラス v2.0
 * 責任範囲: プリミティブ使用の標準化と階層処理の強制
 */

import * as PIXI from 'pixi.js';
import { IAnimationTemplate, AnimationPhase } from '../../../types/types';
import { FlexibleCharacterData } from '../../../types/types';
import { PhrasePositionPrimitive } from '../position/PhrasePositionPrimitive';
import { WordPositionPrimitive } from '../position/WordPositionPrimitive';
import { CharacterLayoutPrimitive } from '../layout/CharacterLayoutPrimitive';

export abstract class HierarchicalAnimationTemplate implements IAnimationTemplate {
  // プリミティブインスタンス (継承クラスで初期化)
  protected abstract readonly phrasePositioning: PhrasePositionPrimitive;
  protected abstract readonly wordPositioning: WordPositionPrimitive;
  protected abstract readonly characterLayout: CharacterLayoutPrimitive;

  // IAnimationTemplate実装
  abstract getParameterConfig(): any[];
  abstract getName(): string;

  /**
   * メインルーティングメソッド
   */
  animateContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    // 既存のIAnimationTemplateインターフェース互換性のため、
    // 内部でコンテナタイプを判定して適切なメソッドにルーティング
    
    const containerName = container.name || '';
    
    if (containerName.includes('phrase_container')) {
      return this.renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase);
    } else if (containerName.includes('word_container')) {
      return this.renderWordContainer(container, text, params, nowMs, startMs, endMs, phase);
    } else if (containerName.includes('char_container')) {
      return this.renderCharContainer(container, text, params, nowMs, startMs, endMs, phase);
    }
    
    // デフォルトは単語コンテナとして処理
    return this.renderWordContainer(container, text, params, nowMs, startMs, endMs, phase);
  }

  /**
   * 視覚要素削除メソッド
   */
  removeVisualElements(container: PIXI.Container): void {
    // フィルターとエフェクトのクリーンアップ
    this.cleanupFilters(container);
    
    // 子コンテナの再帰的クリーンアップ
    container.children.forEach(child => {
      if (child instanceof PIXI.Container) {
        this.removeVisualElements(child);
      }
    });
  }

  /**
   * フレーズコンテナレンダリング (オーバーライド禁止)
   */
  protected renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    try {
      // プリミティブ直接使用による位置計算
      const position = this.phrasePositioning.calculateStatic({
        text,
        params,
        nowMs,
        startMs,
        endMs,
        phase,
        phraseOffsetX: (params.phraseOffsetX as number) || 0,
        phraseOffsetY: (params.phraseOffsetY as number) || 0,
        fontSize: (params.fontSize as number) || 120,
        lineHeight: (params.lineHeight as number) || 1.2,
        headTime: (params.headTime as number) || 800,
        tailTime: (params.tailTime as number) || 800
      });

      container.position.set(position.x, position.y);
      container.alpha = position.alpha || 1.0;

      return this.customPhraseRendering(container, text, params, nowMs, startMs, endMs, phase);

    } catch (error) {
      console.error(`フレーズレンダリングエラー (${this.getName()}):`, error);
      return false;
    }
  }

  /**
   * 単語コンテナレンダリング (オーバーライド禁止)
   */
  protected renderWordContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    try {
      // プリミティブ直接使用による位置計算
      const position = this.wordPositioning.calculateStatic({
        wordIndex: (params.wordIndex as number) || 0,
        fontSize: (params.fontSize as number) || 120,
        lineHeight: (params.lineHeight as number) || 1.2,
        headTime: (params.headTime as number) || 800,
        nowMs,
        startMs,
        endMs,
        phase,
        params
      });

      container.position.set(position.x, position.y);
      container.alpha = position.alpha || 1.0;

      // 標準的な文字レイアウト処理
      this.performCharacterLayout(container, params);

      return this.customWordRendering(container, text, params, nowMs, startMs, endMs, phase);

    } catch (error) {
      console.error(`単語レンダリングエラー (${this.getName()}):`, error);
      return false;
    }
  }

  /**
   * 文字コンテナレンダリング (オーバーライド禁止)
   */
  protected renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean {
    try {
      return this.customCharRendering(container, text, params, nowMs, startMs, endMs, phase);
    } catch (error) {
      console.error(`文字レンダリングエラー (${this.getName()}):`, error);
      return false;
    }
  }

  /**
   * 文字レイアウト処理 (継承クラスでオーバーライド可能)
   */
  protected performCharacterLayout(container: PIXI.Container, params: Record<string, unknown>): void {
    try {
      // デフォルト実装: layoutIndividualを使用
      this.characterLayout.layoutIndividual(container, {
        chars: (params.chars as FlexibleCharacterData[]) || [],
        charSpacing: (params.charSpacing as number) || 1.0,
        fontSize: (params.fontSize as number) || 120,
        halfWidthSpacingRatio: (params.halfWidthSpacingRatio as number) || 0.5,
        wordSpacing: (params.wordSpacing as number) || 0.3,
        lineHeight: (params.lineHeight as number) || 1.2,
        containerPrefix: 'char_container_'
      }, (charContainer, charData) => {
        // 文字レベルアニメーション呼び出し
        this.animateContainer(charContainer, charData.char, params, 0, 0, 1000, 'active');
      });
    } catch (error) {
      console.error(`文字レイアウトエラー (${this.getName()}):`, error);
    }
  }

  /**
   * フィルタークリーンアップ
   */
  private cleanupFilters(container: PIXI.Container): void {
    if (container.filters) {
      container.filters.forEach(filter => {
        if (filter && typeof filter.destroy === 'function') {
          filter.destroy();
        }
      });
      container.filters = null;
    }
    container.filterArea = null;
  }

  // テンプレート固有実装 (必須実装)
  protected abstract customPhraseRendering(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean;

  protected abstract customWordRendering(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean;

  protected abstract customCharRendering(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): boolean;

  /**
   * プリミティブ選択支援メソッド群
   */
  
  /**
   * フレーズ位置計算戦略の選択
   */
  protected calculatePhrasePositionByStrategy(
    strategy: 'static' | 'slide' | 'random',
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): { x: number; y: number; alpha: number } {
    const baseParams = {
      text: (params.text as string) || '',
      params,
      nowMs,
      startMs,
      endMs,
      phase,
      phraseOffsetX: (params.phraseOffsetX as number) || 0,
      phraseOffsetY: (params.phraseOffsetY as number) || 0,
      fontSize: (params.fontSize as number) || 120,
      lineHeight: (params.lineHeight as number) || 1.2,
      headTime: (params.headTime as number) || 800,
      tailTime: (params.tailTime as number) || 800
    };

    switch (strategy) {
      case 'static':
        return this.phrasePositioning.calculateStatic(baseParams);
      case 'slide':
        return this.phrasePositioning.calculateSlide(baseParams);
      case 'random':
        return this.phrasePositioning.calculateRandom({
          ...baseParams,
          randomPlacement: (params.enableRandomPlacement as boolean) || false,
          randomSeed: (params.randomSeed as number) || 42,
          randomRangeX: (params.randomRangeX as number) || 200,
          randomRangeY: (params.randomRangeY as number) || 200,
          minDistanceFromPrevious: (params.minDistanceFromPrevious as number) || 100,
          phraseId: (params.phraseId as string) || 'default'
        });
      default:
        return this.phrasePositioning.calculateStatic(baseParams);
    }
  }

  /**
   * 単語位置計算戦略の選択
   */
  protected calculateWordPositionByStrategy(
    strategy: 'static' | 'slide' | 'cumulative',
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase
  ): { x: number; y: number; alpha: number } {
    const baseParams = {
      wordIndex: (params.wordIndex as number) || 0,
      fontSize: (params.fontSize as number) || 120,
      lineHeight: (params.lineHeight as number) || 1.2,
      headTime: (params.headTime as number) || 800,
      nowMs,
      startMs,
      endMs,
      phase,
      params
    };

    switch (strategy) {
      case 'static':
        return this.wordPositioning.calculateStatic(baseParams);
      case 'slide':
        return this.wordPositioning.calculateSlide({
          ...baseParams,
          entranceInitialSpeed: (params.entranceInitialSpeed as number) || 1.0,
          activeSpeed: (params.activeSpeed as number) || 0.0,
          rightOffset: (params.rightOffset as number) || 300
        });
      case 'cumulative':
        return this.wordPositioning.calculateCumulative(baseParams);
      default:
        return this.wordPositioning.calculateStatic(baseParams);
    }
  }
}