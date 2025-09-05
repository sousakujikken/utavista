/**
 * スライドアニメーションプリミティブ
 * WordSlideTextテンプレートの物理ベースアニメーションを継承した協調的システム
 */

import * as PIXI from 'pixi.js';
import {
  AnimationPrimitive,
  LayerState,
  ChildInstruction,
  PrimitiveResult,
  AnimationParams,
  AnimationState,
  EasingFunction,
  EasingFunctions,
  PhysicsParams,
  DistanceResult
} from '../types';
import { TextStyleFactory } from '../../utils/TextStyleFactory';
import { WordContainerAttributeManager } from '../../types/WordContainerExtensions';

/**
 * スライドアニメーション専用パラメータ
 */
export interface SlideAnimationParams extends AnimationParams {
  /** スライド方向 */
  direction: 'left' | 'right' | 'top' | 'bottom';
  /** 初期速度（px/ms） */
  initialSpeed: number;
  /** 最終速度（px/ms） */
  finalSpeed: number;
  /** 初期オフセット距離 */
  initialOffset: number;
  /** ヘッドタイム（エントランス時間） */
  headTime: number;
}

/**
 * 速度ベースの距離計算
 * オリジナルWordSlideTextの`calculateDistanceFromSpeed`を継承
 */
function calculateDistanceFromSpeed(
  elapsedTime: number,
  duration: number,
  initialSpeed: number,
  finalSpeed: number,
  easingFn: EasingFunction = EasingFunctions.easeOutCubic
): number {
  if (elapsedTime <= 0) return 0;
  if (elapsedTime >= duration) {
    // 完全な積分値を計算（イージング関数により異なる）
    const integralValue = easingFn === EasingFunctions.easeOutCubic ? 0.75 : 0.25;
    return duration * (initialSpeed + (finalSpeed - initialSpeed) * integralValue);
  }
  
  // 数値積分（台形公式）で正確な距離を計算
  const steps = Math.min(100, Math.ceil(elapsedTime)); // 最大100ステップ
  const dt = elapsedTime / steps;
  let distance = 0;
  
  for (let i = 0; i < steps; i++) {
    const t1 = i * dt;
    const t2 = (i + 1) * dt;
    const progress1 = t1 / duration;
    const progress2 = t2 / duration;
    const eased1 = easingFn(progress1);
    const eased2 = easingFn(progress2);
    const v1 = initialSpeed + (finalSpeed - initialSpeed) * eased1;
    const v2 = initialSpeed + (finalSpeed - initialSpeed) * eased2;
    distance += (v1 + v2) * dt / 2; // 台形公式
  }
  
  return distance;
}

/**
 * スライドアニメーションプリミティブの実装
 * オリジナルの物理ベース計算を継承した協調的制御
 */
export class SlideAnimationPrimitive implements AnimationPrimitive {
  public readonly name = 'SlideAnimation';
  
  private parentState: LayerState | null = null;
  private childInstructions: ChildInstruction[] = [];
  
  /**
   * 上位層からの制御を受け入れ
   */
  receiveParentContext(parentState: LayerState): void {
    this.parentState = parentState;
  }
  
  /**
   * アニメーション状態の計算
   * オリジナルの速度ベース計算を継承
   */
  calculateAnimation(
    progress: number,
    params: SlideAnimationParams
  ): AnimationState {
    const { direction, initialSpeed, finalSpeed, initialOffset, headTime, easing } = params;
    
    // 経過時間の計算
    const elapsedTime = progress * headTime;
    
    // 方向ベクトルの計算
    const directionVector = this.getDirectionVector(direction);
    
    // 物理ベースの距離計算
    const distance = calculateDistanceFromSpeed(
      elapsedTime,
      headTime,
      initialSpeed,
      finalSpeed,
      easing
    );
    
    // 位置の計算（初期オフセットから距離分移動）
    const position = {
      x: directionVector.x * (initialOffset - distance),
      y: directionVector.y * (initialOffset - distance)
    };
    
    // アルファ値の計算（エントランス期間中）
    const alpha = Math.min(progress, 1.0);
    
    return {
      position,
      alpha,
      scale: { x: 1, y: 1 },
      rotation: 0,
      visible: alpha > 0
    };
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
      if (!this.parentState) {
        throw new Error('Parent state not received');
      }
      
      const { nowMs, startMs, hierarchyParams } = this.parentState;
      
      // パラメータの型安全な取得
      const slideParams: SlideAnimationParams = {
        duration: params.headTime as number || 500,
        easing: EasingFunctions.easeOutCubic,
        startValue: 0,
        endValue: 1,
        direction: params.direction as ('left' | 'right' | 'top' | 'bottom') || 'left',
        initialSpeed: params.entranceInitialSpeed as number || 4.0,
        finalSpeed: params.activeSpeed as number || 0.1,
        initialOffset: params.wordOffsetX as number || 100,
        headTime: params.headTime as number || 500
      };
      
      // アニメーション進行度の計算
      const inStartTime = startMs - slideParams.headTime;
      let progress = 0;
      
      if (nowMs >= inStartTime && nowMs < startMs) {
        progress = (nowMs - inStartTime) / slideParams.headTime;
      } else if (nowMs >= startMs) {
        progress = 1.0;
      }
      
      // アニメーション状態の計算
      const animationState = this.calculateAnimation(progress, slideParams);
      
      // コンテナへの適用
      container.position.set(animationState.position.x, animationState.position.y);
      container.alpha = animationState.alpha;
      container.visible = animationState.visible;
      container.updateTransform();
      
      // 子階層への指示を生成（位置情報を伝達）
      this.childInstructions = [{
        childId: 'slide_target',
        position: animationState.position,
        alpha: animationState.alpha,
        visible: animationState.visible,
        childParams: {
          animationProgress: progress,
          slideDirection: slideParams.direction,
          currentDistance: this.getCurrentDistance(progress, slideParams)
        }
      }];
      
      return {
        success: true,
        childInstructions: this.childInstructions
      };
      
    } catch (error) {
      return {
        success: false,
        childInstructions: [],
        error: `SlideAnimationPrimitive execution failed: ${error}`
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
   * 方向ベクトルの取得
   */
  private getDirectionVector(direction: string): { x: number; y: number } {
    switch (direction) {
      case 'left':
        return { x: 1, y: 0 };
      case 'right':
        return { x: -1, y: 0 };
      case 'top':
        return { x: 0, y: 1 };
      case 'bottom':
        return { x: 0, y: -1 };
      default:
        return { x: 1, y: 0 };
    }
  }
  
  /**
   * 現在の移動距離を取得
   */
  private getCurrentDistance(progress: number, params: SlideAnimationParams): number {
    const elapsedTime = progress * params.headTime;
    return calculateDistanceFromSpeed(
      elapsedTime,
      params.headTime,
      params.initialSpeed,
      params.finalSpeed,
      params.easing
    );
  }
  
  /**
   * スライドアニメーションの一括実行
   * オリジナルWordSlideTextパターンに基づく簡易API
   */
  executeSlideFromDirection(
    container: PIXI.Container,
    direction: 'left' | 'right' | 'top' | 'bottom',
    params: {
      initialSpeed?: number;
      finalSpeed?: number;
      initialOffset?: number;
      headTime?: number;
      nowMs: number;
      startMs: number;
    }
  ): { x: number; y: number; alpha: number } {
    const slideParams: SlideAnimationParams = {
      duration: params.headTime || 500,
      easing: EasingFunctions.easeOutCubic,
      startValue: 0,
      endValue: 1,
      direction,
      initialSpeed: params.initialSpeed || 4.0,
      finalSpeed: params.finalSpeed || 0.1,
      initialOffset: params.initialOffset || 100,
      headTime: params.headTime || 500
    };
    
    // 進行度計算
    const inStartTime = params.startMs - slideParams.headTime;
    let progress = 0;
    
    if (params.nowMs >= inStartTime && params.nowMs < params.startMs) {
      progress = (params.nowMs - inStartTime) / slideParams.headTime;
    } else if (params.nowMs >= params.startMs) {
      progress = 1.0;
    }
    
    // アニメーション状態計算
    const animationState = this.calculateAnimation(progress, slideParams);
    
    // コンテナに適用
    container.position.set(animationState.position.x, animationState.position.y);
    container.alpha = animationState.alpha;
    container.visible = animationState.visible;
    container.updateTransform();
    
    return {
      x: animationState.position.x,
      y: animationState.position.y,
      alpha: animationState.alpha
    };
  }
  
  /**
   * アニメーション状態のデバッグ情報を取得
   */
  getDebugInfo(progress: number, params: SlideAnimationParams): Record<string, unknown> {
    const animationState = this.calculateAnimation(progress, params);
    const currentDistance = this.getCurrentDistance(progress, params);
    
    return {
      primitiveName: this.name,
      progress,
      direction: params.direction,
      currentDistance,
      position: animationState.position,
      alpha: animationState.alpha,
      visible: animationState.visible,
      elapsedTime: progress * params.headTime,
      initialSpeed: params.initialSpeed,
      finalSpeed: params.finalSpeed,
      initialOffset: params.initialOffset
    };
  }
  
  /**
   * フレーズ位置計算（オリジナルWordSlideTextのロジック継承）
   */
  calculatePhrasePosition(params: {
    phraseOffsetX: number;
    phraseOffsetY: number;
    fontSize: number;
    lineHeight?: number;
    headTime: number;
    tailTime: number;
    randomPlacement: boolean;
    randomSeed: number;
    randomRangeX: number;
    randomRangeY: number;
    minDistanceFromPrevious: number;
    text: string;
    words: any[];
    nowMs: number;
    startMs: number;
    endMs: number;
    phase: string;
    phraseId?: string;  // フレーズ固有ID（オリジナル準拠）
    wordDisplayMode?: string;  // 単語表示モード（動的Y座標計算用）
  }): { x: number; y: number; alpha: number } {
    
    // 画面中心計算（フォールバック値付き）
    const app = (window as any).__PIXI_APP__;
    let centerX: number;
    let centerY: number;
    
    // オフセット値のNaNチェック
    const safeOffsetX = isNaN(params.phraseOffsetX) || params.phraseOffsetX === undefined ? 0 : params.phraseOffsetX;
    const safeOffsetY = isNaN(params.phraseOffsetY) || params.phraseOffsetY === undefined ? 0 : params.phraseOffsetY;
    
    if (app && app.renderer) {
      // 実際のレンダラーサイズを使用（ただし正方形の場合は16:9を想定）
      const actualWidth = app.renderer.width;
      const actualHeight = app.renderer.height;
      
      // 正方形（1080x1080）の場合は16:9として扱う
      const isSquare = Math.abs(actualWidth - actualHeight) < 10;
      const effectiveWidth = isSquare ? 1920 : actualWidth;
      const effectiveHeight = actualHeight;
      
      centerX = effectiveWidth / 2 + safeOffsetX;
      centerY = effectiveHeight / 2 + safeOffsetY;
      
      // console.log(`[SlideAnimationPrimitive] calculatePhrasePosition: PIXI_APP OK, renderer=${actualWidth}x${actualHeight}, effective=${effectiveWidth}x${effectiveHeight}, isSquare=${isSquare}, centerX=${centerX}, centerY=${centerY}, offsetX=${safeOffsetX}, offsetY=${safeOffsetY}`);
    } else {
      // PIXI_APP__が取得できない場合のフォールバック値（一般的な画面中央）
      centerX = 960 + safeOffsetX;  // 1920px幅の中央
      centerY = 540 + safeOffsetY;  // 1080px高さの中央
      // console.log(`[SlideAnimationPrimitive] calculatePhrasePosition: PIXI_APP FAIL, using fallback, centerX=${centerX}, centerY=${centerY}, offsetX=${safeOffsetX}, offsetY=${safeOffsetY}`);
    }
    
    // ランダム配置計算（オリジナル準拠のフレーズ固有ハッシュ）
    let randomOffsetY = 0; // ランダムY位置を保持
    
    // デバッグログ：randomPlacementパラメータの値を確認
    // console.log(`[SlideAnimationPrimitive] calculatePhrasePosition called with:`, {
    //   phraseId: params.phraseId,
    //   randomPlacement: params.randomPlacement,
    //   randomSeed: params.randomSeed,
    //   randomRangeX: params.randomRangeX,
    //   randomRangeY: params.randomRangeY
    // });
    
    if (params.randomPlacement) {
      const offsets = this.generateOffsetList(
        params.randomSeed, 
        params.randomRangeX, 
        params.randomRangeY, 
        params.minDistanceFromPrevious
      );
      
      if (offsets.length > 0) {
        // フレーズIDからハッシュを計算（オリジナル準拠）
        const phraseId = params.phraseId || `phrase_${params.startMs}_${params.text.substring(0, 10)}`;
        let hash = 0;
        for (let i = 0; i < phraseId.length; i++) {
          const char = phraseId.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32bit integer
        }
        
        // オフセットリストからインデックスを選択（0-99の範囲）
        const offsetIndex = Math.abs(hash) % offsets.length;
        const offset = offsets[offsetIndex];
        centerX += offset.x;
        centerY += offset.y;
        randomOffsetY = offset.y; // Y位置を記録
        
        // 詳細デバッグログ出力（ハッシュ計算過程も含む）
        // console.log(`[SlideAnimationPrimitive] HASH_CALC: phraseId="${phraseId}" (length=${phraseId.length})`);
        // console.log(`[SlideAnimationPrimitive] HASH_RESULT: hash=${hash}, Math.abs(hash)=${Math.abs(hash)}, offsetIndex=${offsetIndex}/${offsets.length})`);
        // console.log(`[SlideAnimationPrimitive] OFFSET_SELECTED: offset[${offsetIndex}]=(${offset.x.toFixed(1)}, ${offset.y.toFixed(1)}), centerY=${centerY.toFixed(1)})`);
        
        // オフセット選択の履歴をグローバルに記録
        if (!(window as any).__OFFSET_INDEX_TRACKER__) {
          (window as any).__OFFSET_INDEX_TRACKER__ = new Map();
        }
        const tracker = (window as any).__OFFSET_INDEX_TRACKER__;
        tracker.set(offsetIndex, (tracker.get(offsetIndex) || 0) + 1);
        
        // オフセット使用状況の定期報告
        if (tracker.size > 0 && tracker.size % 5 === 0) {
          const usage = Array.from(tracker.entries()).sort((a, b) => a[0] - b[0]);
          // console.log(`[SlideAnimationPrimitive] OFFSET_USAGE: ${usage.length}種類使用 [${usage.slice(0, 10).map(([idx, count]) => `${idx}:${count}`).join(', ')}...]`);
        }
      }
    } else {
      // randomPlacementがfalseの場合の警告
      // console.log(`[SlideAnimationPrimitive] Random placement is DISABLED for phrase "${params.phraseId}" (randomPlacement=${params.randomPlacement})`);
    }
    
    // 各単語のスライドインタイミングに応じてフレーズY座標を動的に計算（オリジナル準拠）
    // newline系統のwordDisplayModeの場合のみ動的Y座標計算を実行
    let totalYOffset = 0;
    
    const isNewLineMode = params.wordDisplayMode === 'individual_word_entrance_new_line' || 
                          params.wordDisplayMode === 'phrase_cumulative_new_line';
    
    const lineHeight = params.lineHeight || 1.2;  // lineHeightを取得
    
    if (isNewLineMode && params.words && params.words.length > 0) {
      for (let i = 0; i < params.words.length; i++) {
        const word = params.words[i];
        const wordStartMs = word.start;
        const wordInStartTime = wordStartMs - params.headTime;
        
        // 最初の単語（i === 0）の場合はY方向シフトをスキップ（オリジナル準拠）
        if (i === 0) {
          continue;
        }
        
        // この単語のアニメーション期間内かチェック
        if (params.nowMs >= wordInStartTime && params.nowMs < wordStartMs) {
          // アニメーション進行度を計算（0～1）
          const progress = (params.nowMs - wordInStartTime) / params.headTime;
          // イージングを適用した進行度（オリジナルのeaseOutCubic）
          const easedProgress = this.easeOutCubic(progress);
          // この単語の分の部分的なオフセット
          totalYOffset += params.fontSize * easedProgress;
        } else if (params.nowMs >= wordStartMs) {
          // この単語のアニメーションが完了している場合、全体のオフセットを加算
          totalYOffset += params.fontSize;
        }
        // nowMs < wordInStartTime の場合はまだアニメーションが始まっていないので何もしない
      }
      
      // Y座標を上方向に移動（totalYOffsetを減算）（オリジナル準拠）
      const centerYBeforeShift = centerY;
      centerY -= totalYOffset;
      
      // デバッグログ出力
      // console.log(`[SlideAnimationPrimitive] Dynamic Y offset applied: lineHeight=${lineHeight}, totalYOffset=${totalYOffset}, centerY before=${centerYBeforeShift}, centerY after=${centerY}`);
    } else {
      // newline系統でない場合は動的Y座標計算をスキップ
      // console.log(`[SlideAnimationPrimitive] Non-newline mode (${params.wordDisplayMode}) - skipping dynamic Y offset. centerY=${centerY})`);
    }
    
    // フレーズ退場アニメーション
    let alpha = 1.0;
    let xOffset = 0;
    
    const lastWord = params.words.length > 0 ? params.words[params.words.length - 1] : null;
    const phraseOutStartMs = lastWord ? lastWord.end : params.endMs;
    
    if (params.nowMs > phraseOutStartMs) {
      const fadeProgress = Math.min((params.nowMs - phraseOutStartMs) / params.tailTime, 1.0);
      alpha = 1.0 - fadeProgress;
      const slideDistance = 200;
      xOffset = -slideDistance * this.easeInCubic(fadeProgress);
    }
    
    return {
      x: centerX + xOffset,
      y: centerY,
      alpha: alpha
    };
  }
  
  /**
   * 単語位置計算（オリジナルWordSlideTextのロジック継承 + アライメント対応）
   */
  calculateWordPosition(params: {
    fontSize: number;
    lineHeight?: number;
    headTime: number;
    entranceInitialSpeed: number;
    activeSpeed: number;
    wordOffsetX: number;  // 単語オフセット（旧rightOffset）
    wordSlideDistance?: number;  // -1 = 自動計算
    wordIndex: number;
    nowMs: number;
    startMs: number;
    endMs: number;
    phase: string;
    wordAlignment?: string; // 新規追加
    firstWordFinalX?: number; // 新規追加：先頭揃え用の基準X座標
    wordDisplayMode?: string; // 新規追加：単語表示モード
    charSpacing?: number; // 新規追加：文字間隔
    wordSpacing?: number; // 新規追加：単語間隔
    phraseContainer?: PIXI.Container; // 新規追加：フレーズコンテナ参照
  }): { x: number; y: number; alpha: number } {
    
    const lineHeight = params.lineHeight || 1.2;
    
    // wordDisplayModeに応じてY座標を計算
    // ⚠️ Y座標計算を無効化：FlexibleCumulativeLayoutPrimitiveで行うため重複を避ける
    let yOffset = 0;
    // if (params.wordDisplayMode === 'individual_word_entrance_new_line' || 
    //     params.wordDisplayMode === 'phrase_cumulative_new_line') {
    //   // 改行モードの場合のみwordIndexに基づくY座標を設定
    //   yOffset = params.wordIndex * params.fontSize * lineHeight;
    //   // console.log(`[SlideAnimationPrimitive] Word Y offset: wordIndex=${params.wordIndex}, fontSize=${params.fontSize}, lineHeight=${lineHeight}, yOffset=${yOffset}`);
    // }
    // same_lineモードの場合はyOffset = 0のまま
    const inStartTime = params.startMs - params.headTime;
    const wordAlignment = params.wordAlignment || 'trailing_align';
    
    // 基準となるスライド距離を計算（カスタム値または自動計算）
    const entranceEndDistance = (params.wordSlideDistance !== undefined && params.wordSlideDistance !== -1) 
      ? Math.abs(params.wordSlideDistance)  // カスタム距離を使用
      : calculateDistanceFromSpeed(        // 自動計算
          params.headTime,
          params.headTime,
          params.entranceInitialSpeed,
          params.activeSpeed
        );
    
    // wordDisplayModeに応じてX座標を計算
    let startPositionX = params.wordOffsetX;
    
    if (params.wordDisplayMode === 'individual_word_entrance_same_line' || 
        params.wordDisplayMode === 'phrase_cumulative_same_line') {
      // same_lineモード: FlexibleCumulativeLayoutPrimitiveに完全に委任
      // SlideAnimationPrimitiveでは位置計算を行わず、0から開始してプリミティブに任せる
      startPositionX = 0;
      // ログ抑制: same_line mode delegation (毎フレーム出力)
      
    } else if (params.wordDisplayMode === 'individual_word_entrance_new_line' || 
               params.wordDisplayMode === 'phrase_cumulative_new_line') {
      // new_lineモード: 行頭に配置（X座標は0）
      startPositionX = 0;
      
    }
    
    let posX = startPositionX;
    let alpha = 1.0;
    
    // スライドインアニメーション
    if (params.nowMs < inStartTime) {
      posX = startPositionX;
      alpha = 0;
    } else if (params.nowMs < params.startMs) {
      const elapsedTime = params.nowMs - inStartTime;
      const distance = (params.wordSlideDistance !== undefined && params.wordSlideDistance !== -1)
        ? Math.abs(params.wordSlideDistance) * (elapsedTime / params.headTime)  // カスタム距離の比例分
        : calculateDistanceFromSpeed(                                             // 自動計算
            elapsedTime,
            params.headTime,
            params.entranceInitialSpeed,
            params.activeSpeed
          );
      posX = startPositionX - distance;
      alpha = elapsedTime / params.headTime;
    } else {
      posX = startPositionX - entranceEndDistance;
      alpha = 1.0;
    }
    
    return {
      x: posX,
      y: yOffset,
      alpha: alpha
    };
  }
  
  /**
   * 文字アニメーション計算（オリジナルWordSlideText互換）
   */
  calculateCharacterAnimation(params: {
    charIndex: number;
    totalChars: number;
    fontSize: number;
    nowMs: number;
    startMs: number;
    endMs: number;
    phase: string;
    animationMode?: 'word' | 'phrase';  // v3.2追加
    phraseStartMs?: number;             // v3.2追加
    phraseEndMs?: number;               // v3.2追加
  }): { offsetX: number; offsetY: number; scale: number; alpha: number; visible: boolean } {
    
    // アニメーションモード判定（デフォルトは'word'）
    const mode = params.animationMode || 'word';
    
    let isVisible = false;
    
    if (mode === 'phrase') {
      // フレーズモード：フレーズの開始・終了時刻に基づいて全文字の可視性を判定
      const phraseStart = params.phraseStartMs || params.startMs;
      const phraseEnd = params.phraseEndMs || params.endMs;
      isVisible = params.nowMs >= phraseStart && params.nowMs <= phraseEnd;
    } else {
      // 単語モード（従来の動作）：各単語の開始・終了時刻に基づいて判定
      isVisible = params.nowMs >= params.startMs && params.nowMs <= params.endMs;
    }
    
    // オリジナルでは文字レベルでのスケールやオフセットアニメーションはない
    // 全て単語・フレーズレベルで制御される
    
    return {
      offsetX: 0,
      offsetY: 0,
      scale: 1.0,  // スケールアニメーションなし（オリジナル準拠）
      alpha: 1.0,  // アルファは外部で制御（オリジナル準拠）
      visible: isVisible
    };
  }
  
  /**
   * オリジナルのeaseInCubic（内部使用）
   */
  private easeInCubic(t: number): number {
    return t * t * t;
  }
  
  /**
   * オリジナルのeaseOutCubic（内部使用）
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  /**
   * ランダムオフセット生成（オリジナルWordSlideTextから継承）
   */
  private generateOffsetList(seed: number, rangeX: number, rangeY: number, minDistance: number): Array<{ x: number; y: number }> {
    const offsets: Array<{ x: number; y: number }> = [];
    const targetCount = 100;
    
    let rng = seed + 1;
    const nextRandom = () => {
      rng = ((rng * 1103515245) + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };
    
    // 効率的なグリッドベース候補生成
    // グリッドサイズはminDistanceとは独立した座標精度パラメータ
    const gridSize = 20; // 20px間隔で候補点を生成（minDistanceとは独立）
    const candidatePoints: Array<{ x: number; y: number }> = [];
    
    // グリッド候補点を生成
    const stepsX = Math.floor(rangeX / gridSize);
    const stepsY = Math.floor(rangeY / gridSize);
    const startX = -(stepsX * gridSize) / 2;
    const startY = -(stepsY * gridSize) / 2;
    
    for (let i = 0; i <= stepsX; i++) {
      for (let j = 0; j <= stepsY; j++) {
        const x = startX + i * gridSize;
        const y = startY + j * gridSize;
        
        // 範囲内チェック
        if (Math.abs(x) <= rangeX / 2 && Math.abs(y) <= rangeY / 2) {
          candidatePoints.push({ x, y });
        }
      }
    }
    
    // 候補点をシャッフル（ランダム性確保）
    for (let i = candidatePoints.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom() * (i + 1));
      [candidatePoints[i], candidatePoints[j]] = [candidatePoints[j], candidatePoints[i]];
    }
    
    // console.log(`[SlideAnimationPrimitive] Generated ${candidatePoints.length} candidate points with gridSize=${gridSize}px (minDistance=${minDistance}px)`);
    
    // シャッフルされた候補から距離制約を満たすものを選択
    let attempts = 0;
    for (const candidate of candidatePoints) {
      attempts++;
      
      let valid = true;
      for (const existing of offsets) {
        const distance = Math.sqrt(Math.pow(candidate.x - existing.x, 2) + Math.pow(candidate.y - existing.y, 2));
        if (distance < minDistance) {
          valid = false;
          break;
        }
      }
      
      if (valid) {
        offsets.push(candidate);
        if (offsets.length >= targetCount) {
          break;
        }
      }
    }
    
    // 詳細デバッグログ：生成結果とY座標分布を出力
    // console.log(`[SlideAnimationPrimitive] generateOffsetList: Generated ${offsets.length}/${targetCount} offsets (attempts=${attempts})`);
    
    if (offsets.length > 0) {
      const yValues = offsets.map(o => o.y);
      const uniqueYCount = new Set(yValues.map(y => Math.round(y))).size; // 1px精度で種類数計算
      const yMin = Math.min(...yValues);
      const yMax = Math.max(...yValues);
      // console.log(`[SlideAnimationPrimitive] Y座標分布: ${uniqueYCount}種類, 範囲[${yMin.toFixed(1)} ~ ${yMax.toFixed(1)}]`);
      
      // 最初の10個のオフセットを表示
      // console.log(`[SlideAnimationPrimitive] 最初の10個のオフセット:`, offsets.slice(0, 10).map(o => `(${o.x.toFixed(1)}, ${o.y.toFixed(1)})`));
    }
    
    if (offsets.length < targetCount) {
      // console.warn(`[SlideAnimationPrimitive] generateOffsetList: Only generated ${offsets.length}/${targetCount} offsets with minDistance=${minDistance}, rangeX=${rangeX}, rangeY=${rangeY}`);
    }
    
    return offsets;
  }
  
}