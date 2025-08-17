/**
 * GlitchEffectPrimitive
 * テキストにグリッチ効果を適用するプリミティブ
 * ピクセルブロック単位での視覚効果を提供
 */

import * as PIXI from 'pixi.js';
import { EffectPrimitive, EffectParams } from '../types';
import { TextStyleFactory } from '../../utils/TextStyleFactory';

/**
 * グリッチ効果パラメータ
 */
export interface GlitchEffectParams extends EffectParams {
  /** グリッチを有効にするか */
  enableGlitch: boolean;
  /** グリッチブロックサイズ（ピクセル） */
  glitchBlockSize: number;
  /** グリッチブロック数 */
  glitchBlockCount: number;
  /** グリッチ更新間隔（ms） */
  glitchUpdateInterval: number;
  /** グリッチ強度（0-1） */
  glitchIntensity: number;
  /** グリッチ時の色変化を有効にするか */
  glitchColorShift: boolean;
  /** グリッチ発生閾値（0-1） */
  glitchThreshold: number;
  /** グリッチ波動速度 */
  glitchWaveSpeed: number;
  /** グリッチランダム性（0-1） */
  glitchRandomness: number;
  /** 現在時刻（ms） */
  nowMs: number;
  /** テキスト内容 */
  text: string;
  /** フォントサイズ */
  fontSize: number;
  /** フォントファミリー */
  fontFamily: string;
  /** テキストカラー */
  textColor: string;
  /** ID（シード生成用） */
  id?: string;
}

/**
 * グリッチ効果を適用するプリミティブ
 */
export class GlitchEffectPrimitive implements EffectPrimitive {
  name = 'GlitchEffectPrimitive';
  
  /**
   * 親階層からの制御を受け入れ
   */
  receiveParentContext(): void {
    // グリッチ効果は親階層の状態に依存しない
  }
  
  /**
   * 自分の責任範囲の処理を実行
   */
  executeWithinHierarchy(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>
  ) {
    // エフェクトプリミティブのため、applyEffectを使用
    return {
      success: true,
      childInstructions: []
    };
  }
  
  /**
   * 下位層への指示を生成
   */
  generateChildInstructions() {
    // グリッチ効果は子階層を持たない
    return [];
  }
  
  /**
   * グリッチ効果の適用
   */
  applyEffect(container: PIXI.Container, params: GlitchEffectParams): void {
    if (!params.enableGlitch || !params.text || params.text.trim() === '') {
      // 通常のテキスト描画
      this.renderNormalText(container, params);
      return;
    }
    
    // 動的グリッチ量を計算
    const dynamicGlitchAmount = this.calculateDynamicGlitchAmount(
      params.nowMs,
      params.glitchBlockCount,
      params.glitchThreshold,
      params.glitchWaveSpeed,
      params.glitchRandomness,
      params.id
    );
    
    if (dynamicGlitchAmount.shouldGlitch) {
      // グリッチ効果を適用
      this.renderGlitchText(
        container,
        params,
        dynamicGlitchAmount.blockCount
      );
    } else {
      // グリッチなしで通常描画
      this.renderNormalText(container, params);
    }
  }
  
  /**
   * グリッチ効果の削除
   */
  removeEffect(container: PIXI.Container): void {
    container.removeChildren();
  }
  
  /**
   * 通常のテキスト描画
   */
  private renderNormalText(container: PIXI.Container, params: GlitchEffectParams): void {
    const textStyle = new PIXI.TextStyle({
      fontFamily: params.fontFamily,
      fontSize: params.fontSize,
      fill: params.textColor,
      align: 'center',
      fontWeight: 'normal'
    });
    
    const textObj = new PIXI.Text(params.text, textStyle);
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    
    container.addChild(textObj);
  }
  
  /**
   * グリッチ効果付きテキスト描画
   */
  private renderGlitchText(
    container: PIXI.Container,
    params: GlitchEffectParams,
    dynamicBlockCount: number
  ): void {
    // アプリケーションの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      console.error('GlitchEffectPrimitive: PIXIアプリが見つかりません');
      this.renderNormalText(container, params);
      return;
    }
    
    try {
      // ベーステキストを作成
      const baseText = TextStyleFactory.createHighDPIText(params.text, {
        fontFamily: params.fontFamily,
        fontSize: params.fontSize,
        fill: params.textColor
      });
      baseText.anchor.set(0.5, 0.5);
      
      // テキストのサイズを取得
      const textWidth = baseText.width;
      const textHeight = baseText.height;
      
      if (textWidth <= 0 || textHeight <= 0) {
        container.addChild(baseText);
        return;
      }
      
      // RenderTextureの作成
      const renderTexture = PIXI.RenderTexture.create({
        width: Math.ceil(textWidth),
        height: Math.ceil(textHeight),
        resolution: 1
      });
      
      // ベーステキストをテクスチャに描画
      baseText.position.set(textWidth / 2, textHeight / 2);
      app.renderer.render(baseText, { renderTexture, clear: true });
      
      // グリッチ更新のタイミング計算
      const updatePhase = Math.floor(params.nowMs / params.glitchUpdateInterval);
      const seed = updatePhase * 1000 + (params.id ? this.hashString(params.id) : 0);
      
      // 擬似乱数生成器
      const random = this.createSeededRandom(seed);
      
      // ブロック分割の計算
      const blocksX = Math.ceil(textWidth / params.glitchBlockSize);
      const blocksY = Math.ceil(textHeight / params.glitchBlockSize);
      const totalBlocks = blocksX * blocksY;
      
      // グリッチするブロックを選択（同じ行内でのみ置き換え）
      const glitchBlocks = new Map<number, number>();
      const actualBlockCount = Math.min(dynamicBlockCount, totalBlocks);
      
      // 各行ごとにグリッチブロックを処理
      for (let row = 0; row < blocksY; row++) {
        const rowBlocks: number[] = [];
        for (let col = 0; col < blocksX; col++) {
          rowBlocks.push(row * blocksX + col);
        }
        
        // この行でグリッチするブロック数を決定
        const rowGlitchCount = Math.floor(actualBlockCount / blocksY) + 
          (row < actualBlockCount % blocksY ? 1 : 0);
        
        // 行内でランダムにブロックを選択
        const shuffledIndices = [...Array(rowBlocks.length).keys()];
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
        }
        
        // 行内でペアを作成して入れ替え
        for (let i = 0; i < Math.min(rowGlitchCount * 2, rowBlocks.length - 1); i += 2) {
          if (i + 1 < rowBlocks.length) {
            const sourceBlock = rowBlocks[shuffledIndices[i]];
            const targetBlock = rowBlocks[shuffledIndices[i + 1]];
            
            glitchBlocks.set(sourceBlock, targetBlock);
            glitchBlocks.set(targetBlock, sourceBlock);
          }
        }
      }
      
      // ブロックごとにスプライトを作成
      for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex++) {
        const blockX = blockIndex % blocksX;
        const blockY = Math.floor(blockIndex / blocksX);
        
        const startX = blockX * params.glitchBlockSize;
        const startY = blockY * params.glitchBlockSize;
        const endX = Math.min(startX + params.glitchBlockSize, textWidth);
        const endY = Math.min(startY + params.glitchBlockSize, textHeight);
        
        const blockWidth = endX - startX;
        const blockHeight = endY - startY;
        
        if (blockWidth <= 0 || blockHeight <= 0) continue;
        
        let sourceStartX = startX;
        let sourceStartY = startY;
        let sourceEndX = endX;
        let sourceEndY = endY;
        
        // グリッチブロックの場合は置き換え先のテクスチャを使用
        if (glitchBlocks.has(blockIndex)) {
          const targetBlockIndex = glitchBlocks.get(blockIndex)!;
          const targetBlockX = targetBlockIndex % blocksX;
          const targetBlockY = Math.floor(targetBlockIndex / blocksX);
          
          sourceStartX = targetBlockX * params.glitchBlockSize;
          sourceStartY = targetBlockY * params.glitchBlockSize;
          sourceEndX = Math.min(sourceStartX + params.glitchBlockSize, textWidth);
          sourceEndY = Math.min(sourceStartY + params.glitchBlockSize, textHeight);
        }
        
        // テクスチャの一部を切り出し
        const frame = new PIXI.Rectangle(sourceStartX, sourceStartY, sourceEndX - sourceStartX, sourceEndY - sourceStartY);
        const blockTexture = new PIXI.Texture(renderTexture.baseTexture, frame);
        
        const sprite = new PIXI.Sprite(blockTexture);
        
        // 位置は元の場所に配置（位置ズレなし）
        sprite.position.set(startX - textWidth / 2, startY - textHeight / 2);
        
        container.addChild(sprite);
      }
      
    } catch (error) {
      console.error('GlitchEffectPrimitive: グリッチ効果の描画中にエラーが発生:', error);
      this.renderNormalText(container, params);
    }
  }
  
  /**
   * 動的グリッチ発生量を計算
   */
  private calculateDynamicGlitchAmount(
    nowMs: number,
    baseBlockCount: number,
    threshold: number,
    waveSpeed: number,
    randomness: number,
    id?: string
  ): { shouldGlitch: boolean, blockCount: number } {
    // 時間ベースの波動関数
    const time = nowMs / 1000;
    const waveValue = Math.sin(time * waveSpeed) * 0.5 + 0.5;
    
    // ランダム要素を追加
    const updatePhase = Math.floor(nowMs / 100);
    const seed = updatePhase * 1000 + (id ? this.hashString(id) : 0);
    const random = this.createSeededRandom(seed);
    const randomValue = random();
    
    // 波動関数とランダム要素を組み合わせ
    const combinedValue = waveValue * (1 - randomness) + randomValue * randomness;
    
    // 閾値と比較してグリッチ発生を判定
    const shouldGlitch = combinedValue > threshold;
    
    // グリッチ量を動的に計算
    const intensityMultiplier = Math.max(0.1, combinedValue);
    const dynamicBlockCount = Math.floor(baseBlockCount * intensityMultiplier);
    
    return {
      shouldGlitch,
      blockCount: Math.max(1, dynamicBlockCount)
    };
  }
  
  /**
   * 文字列のハッシュ値を計算
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  /**
   * シードベースの擬似乱数生成器
   */
  private createSeededRandom(seed: number): () => number {
    let state = seed;
    return function() {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }
}