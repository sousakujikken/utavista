/**
 * SparkleEffectPrimitive v2.0
 * 固定ステージ座標上でのキラキラエフェクト（フレーズ非連動）
 */

import * as PIXI from 'pixi.js';
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import {
  EffectPrimitive,
  LayerState,
  ChildInstruction,
  PrimitiveResult,
  EffectParams
} from '../types';

/**
 * キラキラエフェクトパラメータ
 */
export interface SparkleEffectParams extends EffectParams {
  /** エフェクトの有効/無効 */
  enableSparkle: boolean;
  /** 同時生成パーティクル数 */
  sparkleCount: number;
  /** パーティクルサイズ(px) */
  sparkleSize: number;
  /** パーティクルカラー */
  sparkleColor: string;
  /** 星型の角数 */
  sparkleStarSpikes: number;
  /** スケール倍率 */
  sparkleScale: number;
  /** パーティクル寿命(ms) */
  sparkleDuration: number;
  /** 散布半径(px) */
  sparkleRadius: number;
  /** アニメーション速度 */
  sparkleAnimationSpeed: number;
  /** 透明度減衰率 */
  sparkleAlphaDecay: number;
  /** パーティクル回転速度 */
  sparkleRotationSpeed: number;
  /** 1秒間のパーティクル生成数 */
  sparkleGenerationRate: number;
  /** 移動速度依存の出現頻度係数のn乗 */
  sparkleVelocityCoefficient: number;
  /** 現在時刻（ms） */
  nowMs: number;
  /** 開始時刻（ms） */
  startMs: number;
  /** 終了時刻（ms） */
  endMs: number;
  /** フレーズ全体の終了時刻（ms） */
  phraseEndMs?: number;
  /** フレーズのtailtime（ms） */
  tailTime?: number;
  /** 文字テキスト */
  text?: string;
  /** 文字のグローバル位置 */
  globalPosition?: { x: number; y: number };
  /** 文字ID（シード生成用） */
  charId?: string;
  /** フレーズID */
  phraseId?: string;
  /** 単語ID */
  wordId?: string;
  /** 文字インデックス */
  charIndex?: number;
  /** パーティクルグロー効果の有効/無効 */
  enableParticleGlow?: boolean;
  /** パーティクルグロー強度 */
  particleGlowStrength?: number;
  /** パーティクルグロー明度 */
  particleGlowBrightness?: number;
  /** パーティクルグローブラー量 */
  particleGlowBlur?: number;
  /** パーティクルグロー品質 */
  particleGlowQuality?: number;
  /** パーティクルグロー閾値 */
  particleGlowThreshold?: number;
  /** 出力解像度スケールファクター（動画出力時の品質向上用） */
  outputResolutionScale?: number;
  /** 瞬き機能の有効/無効 */
  enableTwinkle?: boolean;
  /** 瞬きの頻度（回/秒） */
  twinkleFrequency?: number;
  /** 瞬き時の明度倍率 */
  twinkleBrightness?: number;
  /** 瞬きの持続時間（ms） */
  twinkleDuration?: number;
  /** 瞬きの確率（0-1） */
  twinkleProbability?: number;
  /** パーティクルサイズ縮小機能の有効/無効 */
  enableSizeShrink?: boolean;
  /** サイズ縮小速度の指数（0乗=一定、1乗=線形、2乗=二次、3乗=三次） */
  sizeShrinkRate?: number;
  /** 縮小速度のランダム範囲（0%から100%） */
  sizeShrinkRandomRange?: number;
}

/**
 * 決定論的乱数生成器（Park-Miller LCG）
 */
class DeterministicRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = Math.abs(seed) || 1;
  }

  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/**
 * パーティクル情報
 */
interface ParticleData {
  birthTime: number;
  lifeSpan: number;
  deathTime: number;
  originalAlpha: number;
  stageX: number;
  stageY: number;
  velocity: { x: number; y: number };
  rotationSpeed: number;
  // Twinkle関連
  nextTwinkleTime: number;
  twinkleEndTime: number;
  isTwinkling: boolean;
  twinkleAlphaMultiplier: number;
  // Size Shrink関連
  initialScale: number;
  shrinkRate: number;
  shrinkRandomMultiplier: number;
}

/**
 * 発生点情報
 */
interface SparkleGenerator {
  charId: string;
  text: string;
  globalPosition: { x: number; y: number };
  previousPosition?: { x: number; y: number };
  lastUpdateTime?: number;
  velocity?: number;
  params: SparkleEffectParams;
  startTime: number;
  endTime: number;
  isActive: boolean;
}

/**
 * 固定ステージ座標キラキラエフェクトプリミティブ
 */
export class SparkleEffectPrimitive implements EffectPrimitive {
  public readonly name = 'SparkleEffectPrimitive';
  
  private parentState: LayerState | null = null;
  private childInstructions: ChildInstruction[] = [];
  private currentParams: SparkleEffectParams | null = null;
  
  // ステージレベルの管理用
  private static stageContainer: PIXI.Container | null = null;
  private static particles: Map<string, PIXI.Graphics> = new Map();
  private static lastUpdateTime: number = 0;
  private static particleCounter: number = 0;
  
  // 発生点管理
  private static activeGenerators: Map<string, SparkleGenerator> = new Map();
  
  // グローバル更新システム
  private static updateTimer: number | null = null;
  private static isGlobalUpdateActive: boolean = false;
  private static lastSystemTime: number = 0;
  
  // 解像度スケール管理（動画出力時の品質向上用）
  private static globalResolutionScale: number = 1.0;
  
  // ステージレベルグローフィルター管理
  private static stageGlowFilter: AdvancedBloomFilter | null = null;
  private static currentGlowSettings: any = null;

  /**
   * グローバル解像度スケールファクターを設定（動画出力時）
   */
  static setGlobalResolutionScale(scale: number): void {
    SparkleEffectPrimitive.globalResolutionScale = scale;
    // console.log(`[SparkleEffect] Global resolution scale set to: ${scale}`);
  }

  /**
   * グローバル解像度スケールファクターを取得
   */
  static getGlobalResolutionScale(): number {
    return SparkleEffectPrimitive.globalResolutionScale;
  }

  /**
   * 通常表示モードに戻す（スケール=1.0）
   */
  static resetGlobalResolutionScale(): void {
    SparkleEffectPrimitive.globalResolutionScale = 1.0;
    // console.log(`[SparkleEffect] Global resolution scale reset to 1.0`);
  }

  /**
   * ステージレベルでグローフィルターを適用・更新
   */
  private static updateStageGlowFilter(params: SparkleEffectParams): void {
    if (!SparkleEffectPrimitive.stageContainer) return;

    const glowSettings = {
      threshold: params.particleGlowThreshold || 0.1,
      bloomScale: params.particleGlowStrength || 1.2,
      brightness: params.particleGlowBrightness || 1.1,
      blur: params.particleGlowBlur || 4,
      quality: params.particleGlowQuality || 6,
    };

    // 設定が変わった場合のみフィルターを更新
    const settingsChanged = !SparkleEffectPrimitive.currentGlowSettings || 
      JSON.stringify(glowSettings) !== JSON.stringify(SparkleEffectPrimitive.currentGlowSettings);

    if (params.enableParticleGlow) {
      if (settingsChanged) {
        console.log(`[SparkleStageGlow] Updating stage glow filter:`, glowSettings);
        
        SparkleEffectPrimitive.stageGlowFilter = new AdvancedBloomFilter({
          ...glowSettings,
          kernels: null,
          pixelSize: { x: 1, y: 1 }
        });
        
        SparkleEffectPrimitive.stageContainer.filters = [SparkleEffectPrimitive.stageGlowFilter];
        SparkleEffectPrimitive.currentGlowSettings = { ...glowSettings };
      }
    } else {
      // グロー無効時はフィルターを削除
      if (SparkleEffectPrimitive.stageGlowFilter) {
        console.log(`[SparkleStageGlow] Removing stage glow filter`);
        SparkleEffectPrimitive.stageContainer.filters = null;
        SparkleEffectPrimitive.stageGlowFilter = null;
        SparkleEffectPrimitive.currentGlowSettings = null;
      }
    }
  }

  /**
   * 上位層からの制御を受け入れ
   */
  receiveParentContext(parentState: LayerState): void {
    this.parentState = parentState;
  }

  /**
   * 自分の責任範囲の処理を実行
   */
  executeWithinHierarchy(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>
  ): PrimitiveResult {
    try {
      this.applyEffect(container, params as SparkleEffectParams);
      return {
        success: true,
        childInstructions: this.childInstructions
      };
    } catch (error) {
      return {
        success: false,
        childInstructions: [],
        error: `SparkleEffectPrimitive error: ${error}`
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
   * エフェクトの適用（ステージレベル管理）
   */
  applyEffect(container: PIXI.Container, params: SparkleEffectParams): void {
    // 現在のパラメータを保存
    this.currentParams = params;
    
    // デバッグ: twinkleパラメータの確認
    if (params.enableTwinkle && params.charId && params.text) {
      console.log(`[SparkleTwinkleDebug] Twinkle enabled for "${params.text}": freq=${params.twinkleFrequency}, brightness=${params.twinkleBrightness}, prob=${params.twinkleProbability}, duration=${params.twinkleDuration}ms`);
    }
    
    // ステージコンテナの初期化
    this.initializeStageContainer(container);
    
    // ステージレベルでグローフィルターを適用・更新
    SparkleEffectPrimitive.updateStageGlowFilter(params);
    
    if (!params.enableSparkle) {
      return;
    }
    
    const currentTime = params.nowMs;
    const charId = params.charId || 'default';
    
    // シーク時などの古いジェネレーターをクリーンアップ
    this.cleanupInvalidGenerators(currentTime);
    
    // 発生点の登録・更新
    this.registerOrUpdateGenerator(charId, params, currentTime);
    
    // タイムライン時間ベースでパーティクルを決定論的に生成・更新
    this.generateDeterministicParticles(currentTime);
    this.updateAllParticles(currentTime);
    this.removeExpiredParticles();
    
    // エンジン更新の継続が必要な場合（パーティクルまたはジェネレーターが存在）
    this.ensureContinuousUpdate();
    
    // console.log(`[SparkleEffect] Active generators: ${SparkleEffectPrimitive.activeGenerators.size}, Active particles: ${SparkleEffectPrimitive.particles.size}`);
  }

  /**
   * 無効なジェネレーターをクリーンアップ（シーク時対応）
   */
  private cleanupInvalidGenerators(currentTime: number): void {
    const toRemove: string[] = [];
    
    for (const [charId, generator] of SparkleEffectPrimitive.activeGenerators.entries()) {
      // ジェネレーターの期限切れ確認
      if (currentTime > generator.endTime) {
        toRemove.push(charId);
        console.log(`[SparkleCleanup] Removing expired generator "${charId}" (end: ${generator.endTime}, current: ${currentTime})`);
      }
    }
    
    // 期限切れジェネレーターを削除
    for (const charId of toRemove) {
      SparkleEffectPrimitive.activeGenerators.delete(charId);
    }
    
    if (toRemove.length > 0) {
      console.log(`[SparkleCleanup] Removed ${toRemove.length} expired generators`);
    }
  }

  /**
   * 発生点の登録・更新
   */
  private registerOrUpdateGenerator(charId: string, params: SparkleEffectParams, currentTime: number): void {
    const generator = SparkleEffectPrimitive.activeGenerators.get(charId);
    
    // パーティクル発生の終了時刻：フレーズ終了時刻 + tailtime
    let generationEndTime = params.endMs;
    if (params.phraseEndMs) {
      generationEndTime = params.phraseEndMs;
      // tailtimeがある場合はさらに延長
      if (params.tailTime) {
        generationEndTime += params.tailTime;
      }
    }
    
    const currentPosition = params.globalPosition || { x: 0, y: 0 };
    
    if (generator) {
      // 移動速度を計算
      let velocity = 0;
      if (generator.previousPosition && generator.lastUpdateTime) {
        const deltaTime = currentTime - generator.lastUpdateTime;
        if (deltaTime > 0) {
          const deltaX = currentPosition.x - generator.previousPosition.x;
          const deltaY = currentPosition.y - generator.previousPosition.y;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          velocity = distance / deltaTime; // ピクセル/ms
        }
      }
      
      // 既存の発生点を更新
      generator.previousPosition = { ...generator.globalPosition };
      generator.globalPosition = currentPosition;
      generator.lastUpdateTime = currentTime;
      generator.velocity = velocity;
      generator.params = params;
      // 文字アクティブかつフレーズ終了前まで発生点をアクティブに
      generator.isActive = (currentTime >= params.startMs && currentTime <= generationEndTime);
      generator.endTime = generationEndTime;
      
      if (!generator.isActive && currentTime > generationEndTime) {
        // フレーズ終了後は発生点を削除
        SparkleEffectPrimitive.activeGenerators.delete(charId);
        console.log(`[SparkleGenerator] Removed generator for char "${params.text}" (phrase ended)`);
      }
    } else if (currentTime >= params.startMs) {
      // 新しい発生点を登録（文字アクティブ開始時）
      const newGenerator: SparkleGenerator = {
        charId: charId,
        text: params.text || '',
        globalPosition: currentPosition,
        previousPosition: undefined, // 初回は前のフレーム位置なし
        lastUpdateTime: currentTime,
        velocity: 0, // 初期速度はゼロ
        params: params,
        startTime: params.startMs,
        endTime: generationEndTime, // フレーズ終了まで
        isActive: currentTime <= generationEndTime
      };
      
      SparkleEffectPrimitive.activeGenerators.set(charId, newGenerator);
      console.log(`[SparkleGenerator] Registered generator for char "${params.text}" (${charId}) until ${generationEndTime}ms`);
    }
  }

  /**
   * ステージコンテナの初期化
   */
  private initializeStageContainer(referenceContainer: PIXI.Container): void {
    if (SparkleEffectPrimitive.stageContainer) return;
    
    // 最上位のステージを取得
    let stage = referenceContainer;
    while (stage.parent) {
      stage = stage.parent;
    }
    
    // スパークル専用レイヤーを作成
    SparkleEffectPrimitive.stageContainer = new PIXI.Container();
    SparkleEffectPrimitive.stageContainer.name = 'sparkle_stage_layer';
    SparkleEffectPrimitive.stageContainer.zIndex = 1000; // 最前面
    SparkleEffectPrimitive.stageContainer.visible = true; // 明示的に可視に設定
    SparkleEffectPrimitive.stageContainer.alpha = 1.0; // 明示的に不透明に設定
    
    // ソートを有効にしてzIndexを反映
    stage.sortableChildren = true;
    stage.addChild(SparkleEffectPrimitive.stageContainer);
    // console.log(`[SparkleStageInit] Initialized stage container at stage: ${stage.constructor.name}`);
    // console.log(`[SparkleStageInit] Stage dimensions: ${stage.width}x${stage.height}, position: (${stage.x}, ${stage.y})`);
    // console.log(`[SparkleStageInit] Stage children count: ${stage.children.length}, container zIndex: ${SparkleEffectPrimitive.stageContainer.zIndex}`);
  }

  /**
   * タイムライン時間ベースでの決定論的パーティクル生成
   */
  private generateDeterministicParticles(currentTime: number): void {
    // 全てのアクティブなジェネレーターについて処理
    for (const [charId, generator] of SparkleEffectPrimitive.activeGenerators.entries()) {
      if (!generator.isActive) continue;
      
      const baseGenerationRate = generator.params.sparkleGenerationRate || 2.0; // particles/second
      const velocityCoefficient = generator.params.sparkleVelocityCoefficient || 1.0;
      
      // 移動速度による生成頻度の調整
      let velocityMultiplier = 1.0;
      if (generator.velocity !== undefined && generator.velocity > 0 && velocityCoefficient > 0) {
        // 移動速度をピクセル/秒に変換（現在はピクセル/ms）
        const velocityPixelsPerSecond = generator.velocity * 1000;
        // 正規化：100ピクセル/秒を基準値とする
        const normalizedVelocity = velocityPixelsPerSecond / 100.0;
        // velocityCoefficient乗を適用
        velocityMultiplier = Math.pow(normalizedVelocity, velocityCoefficient);
        // 実用的な範囲に制限（0.1倍〜10倍）
        velocityMultiplier = Math.max(0.1, Math.min(10.0, velocityMultiplier));
      }
      
      const adjustedGenerationRate = baseGenerationRate * velocityMultiplier;
      const generationInterval = 1000 / adjustedGenerationRate; // ms間隔
      
      // このジェネレーターの生成開始時刻からの経過時間
      const elapsedTime = currentTime - generator.startTime;
      if (elapsedTime < 0) continue; // まだ開始時刻に達していない
      
      // この時刻までに生成されるべきパーティクル数を決定論的に計算
      const expectedParticleCount = Math.floor(elapsedTime / generationInterval);
      
      // このジェネレーター用のパーティクルIDプレフィックス
      const generatorPrefix = `${charId}_`;
      
      // 現在このジェネレーターのパーティクル数をカウント
      const existingParticles = Array.from(SparkleEffectPrimitive.particles.keys())
        .filter(id => id.startsWith(generatorPrefix)).length;
      
      // 不足している分のパーティクルを生成
      const particlesToGenerate = expectedParticleCount - existingParticles;
      
      // デバッグログ（速度依存）
      if (generator.velocity !== undefined && generator.velocity > 0.01) {
        // console.log(`[SparkleVelocity] Char "${generator.text}": velocity=${(generator.velocity * 1000).toFixed(1)}px/s, multiplier=${velocityMultiplier.toFixed(2)}, rate=${adjustedGenerationRate.toFixed(2)})`;
      }
      
      for (let i = 0; i < particlesToGenerate; i++) {
        // パーティクルIDを決定論的に生成（時刻とインデックスベース）
        const particleIndex = existingParticles + i;
        const birthTime = generator.startTime + (particleIndex * generationInterval);
        
        // 現在時刻より未来のパーティクルは生成しない
        if (birthTime > currentTime) break;
        
        this.createDeterministicParticle(generator, birthTime, particleIndex);
      }
    }
  }

  /**
   * Twinkle状態を更新
   */
  private updateTwinkleState(sparkleData: ParticleData, currentTime: number, particleId: string, params?: SparkleEffectParams): void {
    // 瞬き機能が無効の場合は何もしない
    if (sparkleData.nextTwinkleTime === Infinity) {
      sparkleData.twinkleAlphaMultiplier = 1.0;
      return;
    }
    
    // 瞬き開始チェック
    if (!sparkleData.isTwinkling && currentTime >= sparkleData.nextTwinkleTime) {
      // 瞬き開始
      sparkleData.isTwinkling = true;
      const twinkleDuration = params?.twinkleDuration || 100; // デフォルト100ms
      sparkleData.twinkleEndTime = currentTime + twinkleDuration;
      
      // 次の瞬き時刻を計算（決定論的ランダム）
      const seed = this.hashString(particleId + "_" + currentTime.toString());
      const rng = new DeterministicRandom(seed);
      const frequency = params?.twinkleFrequency || 0.5; // デフォルト0.5回/秒
      const averageInterval = 1000 / frequency;
      const randomVariation = rng.nextRange(0.5, 2.0);
      const nextInterval = averageInterval * randomVariation;
      sparkleData.nextTwinkleTime = currentTime + nextInterval;
      
      console.log(`[SparkleTwinkle] ✨ Particle "${particleId}" TWINKLE START at ${currentTime}ms, brightness: ${params?.twinkleBrightness || 2.5}x, duration: ${twinkleDuration}ms, next twinkle: ${sparkleData.nextTwinkleTime}ms`);
    }
    
    // 瞬き中の処理
    if (sparkleData.isTwinkling) {
      if (currentTime < sparkleData.twinkleEndTime) {
        // 瞬き中：明度を上げる（実際にはalphaを最大値にする）
        // twinkleBrightnessは無視して、alphaを最大化
        sparkleData.twinkleAlphaMultiplier = 1.5; // 1.5倍で明るく見せる（元のalphaが低い場合でも明るくなる）
      } else {
        // 瞬き終了
        sparkleData.isTwinkling = false;
        sparkleData.twinkleAlphaMultiplier = 0.5; // 通常時は半分の明るさ
      }
    } else {
      // 通常状態
      sparkleData.twinkleAlphaMultiplier = 0.5; // 通常時は半分の明るさ
    }
  }

  /**
   * 次の瞬き時刻を計算
   */
  private calculateNextTwinkleTime(birthTime: number, params: SparkleEffectParams, rng: DeterministicRandom): number {
    if (!params.enableTwinkle) {
      console.log(`[TwinkleInit] Twinkle disabled for particle`);
      return Infinity;
    }
    
    const frequency = params.twinkleFrequency || 0.5; // デフォルト0.5回/秒
    const probability = params.twinkleProbability || 0.3; // デフォルト30%の確率
    
    // 確率判定
    const randomValue = rng.next();
    if (randomValue > probability) {
      console.log(`[TwinkleInit] Particle will not twinkle (random=${randomValue.toFixed(3)} > prob=${probability})`);
      return Infinity; // このパーティクルは瞬かない
    }
    
    // 頻度に基づいて次の瞬き時刻を計算
    const averageInterval = 1000 / frequency; // ms
    const randomVariation = rng.nextRange(0.5, 2.0); // 0.5〜2.0倍のランダム変動
    const nextInterval = averageInterval * randomVariation;
    const nextTwinkleTime = birthTime + nextInterval;
    
    console.log(`[TwinkleInit] Particle will twinkle: first twinkle at ${nextTwinkleTime}ms (birth=${birthTime}ms, interval=${nextInterval.toFixed(0)}ms)`);
    return nextTwinkleTime;
  }

  /**
   * 決定論的パーティクル作成（タイムライン時間ベース）
   */
  private createDeterministicParticle(generator: SparkleGenerator, birthTime: number, particleIndex: number): void {
    if (!SparkleEffectPrimitive.stageContainer) {
      console.error(`[SparkleDeterministic] Stage container not initialized!`);
      return;
    }
    
    const params = generator.params;
    // 決定論的なパーティクルID（ジェネレーターIDとインデックスベース）
    const particleId = `${generator.charId}_${particleIndex}`;
    
    // 既に存在する場合はスキップ
    if (SparkleEffectPrimitive.particles.has(particleId)) {
      return;
    }
    
    const graphics = new PIXI.Graphics();
    graphics.name = particleId;
    
    // パーティクル設定
    const particleDuration = params.sparkleDuration || 1500;
    const baseSize = (params.sparkleSize || 20) * 1.2;
    // 解像度スケールファクターを適用（グローバル設定 + パラメータ指定の両方を考慮）
    const paramResolutionScale = params.outputResolutionScale || 1.0;
    const globalResolutionScale = SparkleEffectPrimitive.getGlobalResolutionScale();
    const finalScale = paramResolutionScale * globalResolutionScale;
    const size = baseSize * finalScale;
    const color = this.parseColor(params.sparkleColor || '#FFD700');
    
    // console.log(`[SparkleEffect] Particle size: base=${baseSize}, paramScale=${paramResolutionScale}, globalScale=${globalResolutionScale}, final=${size}`);
    
    // 座標の有効性チェック（先に実行）
    const globalPos = generator.globalPosition;
    if (!globalPos || (globalPos.x === 0 && globalPos.y === 0)) {
      console.error(`[SparkleDeterministic] INVALID POSITION for generator "${generator.charId}": globalPosition is ${JSON.stringify(globalPos)}`);
      return;
    }
    
    // 星型形状を描画
    graphics.clear();
    graphics.beginFill(color, 1.0);
    const starSpikes = params.sparkleStarSpikes || 5;
    this.drawStarShape(graphics, 0, 0, size, starSpikes);
    graphics.endFill();
    
    // パーティクルにグローエフェクトを適用
    // 注意: グロー効果はステージレベルで適用されるため、個別パーティクルには適用しない
    
    // 決定論的ランダム生成（パーティクルインデックスベース）
    const seed = this.generateDeterministicSeed(params, particleIndex);
    const rng = new DeterministicRandom(seed);
    
    // 文字中心から半径内のランダム位置
    const radius = params.sparkleRadius || 30;
    const angle = rng.next() * Math.PI * 2;
    const distance = rng.next() * radius;
    const stageX = globalPos.x + Math.cos(angle) * distance;
    const stageY = globalPos.y + Math.sin(angle) * distance;
    
    graphics.position.set(stageX, stageY);
    
    // 回転速度をパラメータから取得
    const baseRotationSpeed = params.sparkleRotationSpeed || 0.3;
    const rotationSpeed = baseRotationSpeed === 0 
      ? 0 // パラメータがゼロの場合は回転なし
      : rng.nextRange(-baseRotationSpeed * 0.01, baseRotationSpeed * 0.01);
    
    // Twinkle初期化
    const nextTwinkleTime = this.calculateNextTwinkleTime(birthTime, params, rng);
    
    // Size Shrink初期化
    const scale = 0.8 + rng.next() * 0.4;
    const shrinkRate = params.sizeShrinkRate || 1.0;
    const shrinkRandomRange = params.sizeShrinkRandomRange || 0.0;
    const shrinkRandomMultiplier = 1.0 + (rng.next() - 0.5) * 2 * shrinkRandomRange;
    
    // パーティクルデータを作成
    const particleData: ParticleData = {
      birthTime: birthTime, // 決定論的な誕生時刻
      lifeSpan: particleDuration,
      deathTime: birthTime + particleDuration,
      originalAlpha: 0.4 + rng.next() * 0.2, // 0.4〜0.6の範囲（Twinkle効果が見えやすいように低めに設定）
      stageX: stageX,
      stageY: stageY,
      velocity: {
        x: rng.nextRange(-5, 5),
        y: rng.nextRange(-5, 5)
      },
      rotationSpeed: rotationSpeed,
      // Twinkle関連
      nextTwinkleTime: nextTwinkleTime,
      twinkleEndTime: 0,
      isTwinkling: false,
      twinkleAlphaMultiplier: 0.5, // 初期状態は通常の明るさ（0.5）
      // Size Shrink関連
      initialScale: scale,
      shrinkRate: shrinkRate,
      shrinkRandomMultiplier: shrinkRandomMultiplier
    };
    
    (graphics as any)._sparkleData = particleData;
    graphics.alpha = 0; // フェードインから開始
    graphics.visible = true;
    
    graphics.scale.set(scale, scale);
    graphics.rotation = rng.next() * Math.PI * 2;
    
    SparkleEffectPrimitive.stageContainer.addChild(graphics);
    SparkleEffectPrimitive.particles.set(particleId, graphics);
    
    // console.log(`[SparkleDeterministic] Created particle "${particleId}" at birth time ${birthTime}ms, position (${stageX.toFixed(1)}, ${stageY.toFixed(1)})`);
  }

  /**
   * 単一パーティクルを作成（文字座標中心）
   */
  private createSingleParticle(params: SparkleEffectParams): void {
    if (!SparkleEffectPrimitive.stageContainer) return;
    
    const particleId = `sparkle_${SparkleEffectPrimitive.particleCounter++}`;
    const graphics = new PIXI.Graphics();
    graphics.name = particleId;
    
    // パーティクルの設定
    const currentTime = params.nowMs;
    const particleDuration = params.sparkleDuration || 1500; // デフォルト1.5秒
    const baseSize = (params.sparkleSize || 20) * 1.2; // 適度なサイズ
    // 解像度スケールファクターを適用（グローバル設定 + パラメータ指定の両方を考慮）
    const paramResolutionScale = params.outputResolutionScale || 1.0;
    const globalResolutionScale = SparkleEffectPrimitive.getGlobalResolutionScale();
    const finalScale = paramResolutionScale * globalResolutionScale;
    const size = baseSize * finalScale;
    const color = this.parseColor(params.sparkleColor || '#FFD700');
    
    // 座標の有効性をチェック（先に実行）
    const globalPos = params.globalPosition || { x: 0, y: 0 };
    
    if (!params.globalPosition || (globalPos.x === 0 && globalPos.y === 0)) {
      console.error(`[SparkleEffect] INVALID POSITION for char "${params.text}": globalPosition is ${JSON.stringify(params.globalPosition)}`);
      console.error(`[SparkleEffect] Skipping particle creation to avoid masking coordinate issues`);
      return; // パーティクルを生成せず、問題を明確にする
    }
    
    // 星型形状を描画
    graphics.clear(); // 既存の描画をクリア
    graphics.beginFill(color, 1.0);
    const starSpikes = params.sparkleStarSpikes || 5;
    this.drawStarShape(graphics, 0, 0, size, starSpikes);
    graphics.endFill();
    
    // パーティクルにグローエフェクトを適用
    // 注意: グロー効果はステージレベルで適用されるため、個別パーティクルには適用しない
    
    // 文字座標中心の範囲内でランダム配置
    const radius = params.sparkleRadius || 30; // 散布半径
    
    const seed = this.generateSeed(params, particleId);
    const rng = new DeterministicRandom(seed);
    
    // 文字中心から半径内のランダム位置
    const angle = rng.next() * Math.PI * 2;
    const distance = rng.next() * radius;
    const stageX = globalPos.x + Math.cos(angle) * distance;
    const stageY = globalPos.y + Math.sin(angle) * distance;
    
    graphics.position.set(stageX, stageY);
    
    // 回転速度をパラメータから取得
    const baseRotationSpeed = params.sparkleRotationSpeed || 0.3;
    const rotationSpeed = baseRotationSpeed === 0 
      ? 0 // パラメータがゼロの場合は回転なし
      : rng.nextRange(-baseRotationSpeed * 0.01, baseRotationSpeed * 0.01);
    
    // Twinkle初期化
    const nextTwinkleTime = this.calculateNextTwinkleTime(currentTime, params, rng);
    
    // Size Shrink初期化
    const scale = 0.8 + rng.next() * 0.4; // 0.8-1.2（より大きく）
    const shrinkRate = params.sizeShrinkRate || 1.0;
    const shrinkRandomRange = params.sizeShrinkRandomRange || 0.0;
    const shrinkRandomMultiplier = 1.0 + (rng.next() - 0.5) * 2 * shrinkRandomRange;
    
    // パーティクルデータを作成
    const particleData: ParticleData = {
      birthTime: currentTime,
      lifeSpan: particleDuration,
      deathTime: currentTime + particleDuration,
      originalAlpha: 0.6 + rng.next() * 0.3, // 0.6-0.9
      stageX: stageX,
      stageY: stageY,
      velocity: {
        x: rng.nextRange(-5, 5), // より遅い移動
        y: rng.nextRange(-5, 5)
      },
      rotationSpeed: rotationSpeed,
      // Twinkle関連
      nextTwinkleTime: nextTwinkleTime,
      twinkleEndTime: 0,
      isTwinkling: false,
      twinkleAlphaMultiplier: 0.5, // 初期状態は通常の明るさ（0.5）
      // Size Shrink関連
      initialScale: scale,
      shrinkRate: shrinkRate,
      shrinkRandomMultiplier: shrinkRandomMultiplier
    };
    
    // パーティクル作成の詳細ログ（一時的にコメントアウト）
    // console.log(`[SparkleLifetime] Particle "${particleId}" created at ${currentTime}ms, will die at ${particleData.deathTime}ms (lifespan: ${particleDuration}ms)`);
    
    (graphics as any)._sparkleData = particleData;
    graphics.alpha = 0; // フェードインから開始
    graphics.visible = true; // 明示的に可視に設定
    
    graphics.scale.set(scale, scale);
    graphics.rotation = rng.next() * Math.PI * 2;
    
    SparkleEffectPrimitive.stageContainer.addChild(graphics);
    SparkleEffectPrimitive.particles.set(particleId, graphics);
    
    // システム時刻を記録（グローバル更新での時刻推定用）
    SparkleEffectPrimitive.lastSystemTime = Date.now();
    
    // console.log(`[SparkleParticlePosition] Particle "${particleId}" created for char "${params.text || 'unknown'}" at (${stageX.toFixed(1)}, ${stageY.toFixed(1)})`);
  }

  /**
   * すべてのパーティクルを更新
   */
  private updateAllParticles(currentTime: number): void {
    for (const [id, particle] of SparkleEffectPrimitive.particles.entries()) {
      const sparkleData = (particle as any)._sparkleData as ParticleData;
      if (!sparkleData) continue;
      
      const particleAge = currentTime - sparkleData.birthTime;
      const lifeProgress = Math.min(1, particleAge / sparkleData.lifeSpan);
      
      // Twinkle処理
      this.updateTwinkleState(sparkleData, currentTime, id, this.currentParams || undefined);
      
      // フェードイン・フェードアウトの管理
      let alphaMultiplier = 1;
      
      if (lifeProgress < 0.1) {
        // 最初の10%でフェードイン（素早く出現）
        alphaMultiplier = lifeProgress / 0.1;
      } else if (lifeProgress > 0.6) {
        // 最後の40%で徐々にフェードアウト
        const fadeOutProgress = (lifeProgress - 0.6) / 0.4;
        alphaMultiplier = 1 - (fadeOutProgress * fadeOutProgress); // イージングアウト
      }
      
      // Twinkle効果を適用（フェードイン/アウトと乗算）
      const finalAlphaMultiplier = alphaMultiplier * sparkleData.twinkleAlphaMultiplier;
      // alpha値を0〜1の範囲に制限
      particle.alpha = Math.min(1.0, Math.max(0, sparkleData.originalAlpha * finalAlphaMultiplier));
      
      // ゆっくりとした移動（null チェック追加）
      if (particle && particle.position) {
        particle.position.x += sparkleData.velocity.x * 0.016; // ~60FPS想定
        particle.position.y += sparkleData.velocity.y * 0.016;
      } else {
        // particleがnullの場合はこのパーティクルをスキップ
        continue;
      }
      
      // ゆっくりとした回転
      particle.rotation += sparkleData.rotationSpeed;
      
      // サイズ縮小エフェクト
      if (this.currentParams?.enableSizeShrink) {
        // 時間経過による縮小倍率の計算
        let shrinkMultiplier = 1.0;
        if (sparkleData.shrinkRate > 0) {
          // lifeProgressを指数で計算（0乗=一定、1乗=線形、2乗=二次、3乗=三次）
          const shrinkProgress = Math.pow(lifeProgress, sparkleData.shrinkRate);
          // 縮小倍率：1.0から0.0まで減少
          shrinkMultiplier = 1.0 - shrinkProgress;
        }
        
        // ランダム変動を適用
        const finalShrinkMultiplier = shrinkMultiplier * sparkleData.shrinkRandomMultiplier;
        
        // 初期スケールに縮小倍率を適用
        const currentScale = sparkleData.initialScale * Math.max(0.0, finalShrinkMultiplier);
        particle.scale.set(currentScale, currentScale);
      }
      
      // 期限切れのマーク
      if (currentTime >= sparkleData.deathTime) {
        (particle as any)._shouldRemove = true;
        console.log(`[SparkleRemoval] Marking particle "${id}" for removal - current: ${currentTime}ms, death: ${sparkleData.deathTime}ms`);
      }
    }
  }

  /**
   * 期限切れパーティクルを削除
   */
  private removeExpiredParticles(): void {
    const toRemove: string[] = [];
    
    for (const [id, particle] of SparkleEffectPrimitive.particles.entries()) {
      if ((particle as any)._shouldRemove) {
        toRemove.push(id);
      }
    }
    
    for (const id of toRemove) {
      const particle = SparkleEffectPrimitive.particles.get(id);
      if (particle && particle.parent) {
        particle.parent.removeChild(particle);
        particle.destroy();
      }
      SparkleEffectPrimitive.particles.delete(id);
    }
    
    // if (toRemove.length > 0) {
    //   console.log(`[SparkleParticleRemoval] Removed ${toRemove.length} expired particles`);
    //   console.log(`[SparkleParticleRemoval] Remaining particles: ${SparkleEffectPrimitive.particles.size}, stage children: ${SparkleEffectPrimitive.stageContainer?.children.length || 0}`);
    // }
  }

  /**
   * 【廃止】旧リアルタイム更新システム
   * 決定論的システムに移行済み
   */
  private static generateFromActiveGenerators(currentTime: number): void {
    // 決定論的システムでは不要
  }
  
  /**
   * 発生点からの単一パーティクル作成
   */
  private static createSingleParticleFromGenerator(generator: SparkleGenerator, currentTime: number): void {
    if (!SparkleEffectPrimitive.stageContainer) {
      console.error(`[SparkleGeneration] Stage container not initialized!`);
      return;
    }
    
    const params = generator.params;
    const particleId = `sparkle_${SparkleEffectPrimitive.particleCounter++}`;
    const graphics = new PIXI.Graphics();
    graphics.name = particleId;
    
    // console.log(`[SparkleGeneration] Creating particle "${particleId}" from generator "${generator.charId}"`);
    
    // パーティクル設定（既存のcreateParticleロジックを使用）
    const particleDuration = params.sparkleDuration || 1500;
    const baseSize = (params.sparkleSize || 20) * 1.2;
    // 解像度スケールファクターを適用（グローバル設定 + パラメータ指定の両方を考慮）
    const paramResolutionScale = params.outputResolutionScale || 1.0;
    const globalResolutionScale = SparkleEffectPrimitive.getGlobalResolutionScale();
    const finalScale = paramResolutionScale * globalResolutionScale;
    const size = baseSize * finalScale;
    const color = SparkleEffectPrimitive.parseColorStatic(params.sparkleColor || '#FFD700');
    
    // 座標の有効性をチェック（先に実行）
    const globalPos = generator.globalPosition;
    if (!globalPos || (globalPos.x === 0 && globalPos.y === 0)) {
      console.error(`[SparkleGeneration] INVALID POSITION for generator "${generator.charId}": globalPosition is ${JSON.stringify(globalPos)}`);
      console.error(`[SparkleGeneration] Skipping particle creation to avoid masking coordinate issues`);
      return;
    }
    
    // 星型形状を描画
    graphics.clear();
    graphics.beginFill(color, 1.0);
    const starSpikes = params.sparkleStarSpikes || 5;
    SparkleEffectPrimitive.drawStarShapeStatic(graphics, 0, 0, size, starSpikes);
    graphics.endFill();
    
    // パーティクルにグローエフェクトを適用
    // 注意: グロー効果はステージレベルで適用されるため、個別パーティクルには適用しない
    
    // ランダム配置
    const radius = params.sparkleRadius || 30;
    
    const seed = SparkleEffectPrimitive.generateSeedStatic(params, particleId);
    const rng = new DeterministicRandom(seed);
    
    const angle = rng.next() * Math.PI * 2;
    const distance = rng.next() * radius;
    const stageX = globalPos.x + Math.cos(angle) * distance;
    const stageY = globalPos.y + Math.sin(angle) * distance;
    
    graphics.position.set(stageX, stageY);
    
    // 回転速度をパラメータから取得
    const baseRotationSpeed = params.sparkleRotationSpeed || 0.3;
    const rotationSpeed = baseRotationSpeed === 0 
      ? 0 // パラメータがゼロの場合は回転なし
      : rng.nextRange(-baseRotationSpeed * 0.01, baseRotationSpeed * 0.01);
    
    // Twinkle初期化用の決定論的RNGを作成（静的メソッド内なので別途作成）
    const twinkleSeed = SparkleEffectPrimitive.generateSeedStatic(params, particleId + "_twinkle");
    const twinkleRng = new DeterministicRandom(twinkleSeed);
    const nextTwinkleTime = SparkleEffectPrimitive.calculateNextTwinkleTimeStatic(currentTime, params, twinkleRng);
    
    // Size Shrink初期化
    const scale = 0.8 + rng.next() * 0.4;
    const shrinkRate = params.sizeShrinkRate || 1.0;
    const shrinkRandomRange = params.sizeShrinkRandomRange || 0.0;
    const shrinkRandomMultiplier = 1.0 + (rng.next() - 0.5) * 2 * shrinkRandomRange;
    
    const particleData: ParticleData = {
      birthTime: currentTime,
      lifeSpan: particleDuration,
      deathTime: currentTime + particleDuration,
      originalAlpha: 0.6 + rng.next() * 0.3,
      stageX: stageX,
      stageY: stageY,
      velocity: {
        x: rng.nextRange(-5, 5),
        y: rng.nextRange(-5, 5)
      },
      rotationSpeed: rotationSpeed,
      // Twinkle関連
      nextTwinkleTime: nextTwinkleTime,
      twinkleEndTime: 0,
      isTwinkling: false,
      twinkleAlphaMultiplier: 0.5, // 初期状態は通常の明るさ（0.5）
      // Size Shrink関連
      initialScale: scale,
      shrinkRate: shrinkRate,
      shrinkRandomMultiplier: shrinkRandomMultiplier
    };
    
    (graphics as any)._sparkleData = particleData;
    graphics.alpha = 0;
    graphics.visible = true;
    
    graphics.scale.set(scale, scale);
    graphics.rotation = rng.next() * Math.PI * 2;
    
    SparkleEffectPrimitive.stageContainer.addChild(graphics);
    SparkleEffectPrimitive.particles.set(particleId, graphics);
    SparkleEffectPrimitive.lastSystemTime = Date.now();
    
    // console.log(`[SparkleGlobalGeneration] Generated particle from generator "${generator.charId}" at (${stageX.toFixed(1)}, ${stageY.toFixed(1)})`);
  }

  /**
   * エンジンの継続的更新を保証（パーティクルまたはジェネレーター存在時）
   */
  private ensureContinuousUpdate(): void {
    const hasActiveContent = SparkleEffectPrimitive.particles.size > 0 || 
                            SparkleEffectPrimitive.activeGenerators.size > 0;
    
    if (hasActiveContent && !SparkleEffectPrimitive.isGlobalUpdateActive) {
      // パーティクルまたはジェネレーターがある場合、独立した更新ループを開始
      this.startIndependentUpdate();
    } else if (!hasActiveContent && SparkleEffectPrimitive.isGlobalUpdateActive) {
      // パーティクルもジェネレーターもない場合、独立更新を停止
      this.stopIndependentUpdate();
    }
  }

  /**
   * 独立した更新システムを開始（エンジンのメインループから独立）
   */
  private startIndependentUpdate(): void {
    if (SparkleEffectPrimitive.updateTimer || SparkleEffectPrimitive.isGlobalUpdateActive) {
      return;
    }
    
    SparkleEffectPrimitive.isGlobalUpdateActive = true;
    // console.log(`[SparkleIndependentUpdate] Starting independent update for particles/generators`);
    
    // エンジンの現在時刻を追跡するためのコールバック登録
    SparkleEffectPrimitive.updateTimer = setInterval(() => {
      this.runIndependentUpdate();
    }, 16); // ~60FPS
  }

  /**
   * 独立更新システムを停止
   */
  private stopIndependentUpdate(): void {
    if (SparkleEffectPrimitive.updateTimer) {
      clearInterval(SparkleEffectPrimitive.updateTimer);
      SparkleEffectPrimitive.updateTimer = null;
    }
    SparkleEffectPrimitive.isGlobalUpdateActive = false;
    // console.log(`[SparkleIndependentUpdate] Stopped independent update`);
  }

  /**
   * 独立更新ループの実行
   */
  private runIndependentUpdate(): void {
    // パーティクルとジェネレーターの両方が存在しない場合は停止
    if (SparkleEffectPrimitive.particles.size === 0 && SparkleEffectPrimitive.activeGenerators.size === 0) {
      this.stopIndependentUpdate();
      return;
    }
    
    // エンジンから現在時刻を取得（エンジンの静的参照が必要）
    const currentTime = this.getCurrentEngineTime();
    if (currentTime === null) {
      // エンジンが利用できない場合は更新をスキップ
      return;
    }
    
    // パーティクルの更新とクリーンアップのみ実行
    // （新しいパーティクル生成は文字アクティブ時のみ）
    this.updateAllParticles(currentTime);
    this.removeExpiredParticles();
    
    // レンダリングを強制実行
    this.forceRender();
  }

  /**
   * エンジンから現在時刻を取得
   */
  private getCurrentEngineTime(): number | null {
    // グローバルにアクセス可能なエンジンインスタンスから時刻を取得
    try {
      // window.engineInstanceなどのグローバル参照、またはstageContainerの親から取得
      if (typeof window !== 'undefined' && (window as any).engineInstance) {
        return (window as any).engineInstance.getCurrentTime();
      }
      
      // fallback: 最新のパーティクルのbirth timeから推定
      let latestTime = 0;
      for (const particle of SparkleEffectPrimitive.particles.values()) {
        const data = (particle as any)._sparkleData;
        if (data && data.birthTime > latestTime) {
          latestTime = data.birthTime;
        }
      }
      
      if (latestTime > 0) {
        // システム時刻の差分から現在時刻を推定
        const systemDelta = Date.now() - SparkleEffectPrimitive.lastSystemTime;
        return latestTime + systemDelta;
      }
      
      return null;
    } catch (error) {
      console.warn(`[SparkleUpdate] Cannot get engine time:`, error);
      return null;
    }
  }

  /**
   * レンダリングを強制実行
   */
  private forceRender(): void {
    try {
      // ステージコンテナの親（app.stage）からrenderを実行
      if (SparkleEffectPrimitive.stageContainer && SparkleEffectPrimitive.stageContainer.parent) {
        const stage = SparkleEffectPrimitive.stageContainer.parent;
        
        // PIXIアプリケーションを遡って取得
        let app = null;
        if ((stage as any).app) {
          app = (stage as any).app;
        } else if (typeof window !== 'undefined' && (window as any).engineInstance) {
          app = (window as any).engineInstance.app;
        }
        
        if (app && app.render) {
          app.render();
        }
      }
    } catch (error) {
      console.warn(`[SparkleUpdate] Cannot force render:`, error);
    }
  }

  /**
   * 【廃止】旧グローバル更新ループ - 完全削除済み
   * 新しい独立更新システム（runIndependentUpdate）に移行
   */

  /**
   * エフェクトの削除
   */
  removeEffect(container: PIXI.Container): void {
    // ステージレベルの管理なので、ここでは何もしない
    // console.log(`[SparkleEffect] removeEffect called (stage-level management)`);
  }

  /**
   * 決定論的シード値を生成（パーティクルインデックスベース）
   */
  private generateDeterministicSeed(params: SparkleEffectParams, particleIndex: number): number {
    const charId = [
      params.phraseId || 'phrase',
      params.wordId || 'word', 
      params.charIndex !== undefined ? params.charIndex.toString() : '0',
      params.text || 'char',
      params.globalPosition ? `${params.globalPosition.x.toFixed(0)}_${params.globalPosition.y.toFixed(0)}` : '0_0',
      particleIndex.toString() // 時間の代わりにパーティクルインデックスを使用
    ].join('_');
    
    const finalSeed = this.hashString(charId);
    return finalSeed;
  }
  
  /**
   * 従来のシード値を生成（後方互換性用）
   */
  private generateSeed(params: SparkleEffectParams, particleId: string): number {
    // より詳細な文字識別情報を使用
    const charId = [
      params.phraseId || 'phrase',
      params.wordId || 'word', 
      params.charIndex !== undefined ? params.charIndex.toString() : '0',
      params.text || 'char',
      params.globalPosition ? `${params.globalPosition.x.toFixed(0)}_${params.globalPosition.y.toFixed(0)}` : '0_0',
      particleId
    ].join('_');
    
    // 時間ベースのシード（より変化を少なく）
    const timeSlice = Math.floor(params.nowMs / 500); // 500msごとに変化
    
    const finalSeed = this.hashString(charId + '_' + timeSlice);
    // console.log(`[SparkleEffect] Generated seed for char "${params.text}" index ${params.charIndex}: ${finalSeed} (${charId})`);
    
    return finalSeed;
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
   * 星型形状を描画（可変角数対応）
   */
  private drawStarShape(
    graphics: PIXI.Graphics,
    x: number,
    y: number,
    size: number,
    spikes: number = 5
  ): void {
    const outerRadius = size;
    const innerRadius = size * 0.4; // 内側の半径
    
    let angle = -Math.PI / 2; // 上から開始
    const angleStep = (Math.PI * 2) / (spikes * 2);
    
    // 最初の点に移動
    const firstX = x + Math.cos(angle) * outerRadius;
    const firstY = y + Math.sin(angle) * outerRadius;
    graphics.moveTo(firstX, firstY);
    
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      graphics.lineTo(px, py);
      angle += angleStep;
    }
    
    graphics.closePath();
  }

  /**
   * カラー文字列をパース
   */
  private parseColor(colorStr: string): number {
    return SparkleEffectPrimitive.parseColorStatic(colorStr);
  }
  
  /**
   * カラー文字列をパース（静的版）
   */
  private static parseColorStatic(colorStr: string): number {
    if (colorStr.startsWith('#')) {
      return parseInt(colorStr.slice(1), 16);
    }
    return 0xFFD700; // デフォルト: ゴールド
  }
  
  /**
   * 星型形状を描画（静的版）
   */
  private static drawStarShapeStatic(graphics: PIXI.Graphics, x: number, y: number, size: number, spikes: number = 5): void {
    const outerRadius = size;
    const innerRadius = size * 0.4;
    
    let angle = -Math.PI / 2;
    const angleStep = (Math.PI * 2) / (spikes * 2);
    
    const firstX = x + Math.cos(angle) * outerRadius;
    const firstY = y + Math.sin(angle) * outerRadius;
    graphics.moveTo(firstX, firstY);
    
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      graphics.lineTo(px, py);
      angle += angleStep;
    }
    
    graphics.closePath();
  }
  
  /**
   * シード生成（静的版）
   */
  private static generateSeedStatic(params: SparkleEffectParams, particleId: string): number {
    const charId = [
      params.phraseId || 'phrase',
      params.wordId || 'word',
      params.charIndex !== undefined ? params.charIndex.toString() : '0',
      params.text || 'char',
      params.globalPosition ? `${params.globalPosition.x.toFixed(0)}_${params.globalPosition.y.toFixed(0)}` : '0_0',
      particleId
    ].join('_');
    
    const timeSlice = Math.floor(params.nowMs / 500);
    return SparkleEffectPrimitive.hashStringStatic(charId + '_' + timeSlice);
  }
  
  /**
   * 次の瞬き時刻を計算（静的版）
   */
  private static calculateNextTwinkleTimeStatic(birthTime: number, params: SparkleEffectParams, rng: DeterministicRandom): number {
    if (!params.enableTwinkle) return Infinity;
    
    const frequency = params.twinkleFrequency || 0.5; // デフォルト0.5回/秒
    const probability = params.twinkleProbability || 0.3; // デフォルト30%の確率
    
    // 確率判定
    if (rng.next() > probability) {
      return Infinity; // このパーティクルは瞬かない
    }
    
    // 頻度に基づいて次の瞬き時刻を計算
    const averageInterval = 1000 / frequency; // ms
    const randomVariation = rng.nextRange(0.5, 2.0); // 0.5〜2.0倍のランダム変動
    const nextInterval = averageInterval * randomVariation;
    
    return birthTime + nextInterval;
  }

  /**
   * 文字列ハッシュ（静的版）
   */
  private static hashStringStatic(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * パーティクルにグローエフェクトを適用
   */
  private applyParticleGlow(graphics: PIXI.Graphics, params: SparkleEffectParams): void {
    if (!params.enableParticleGlow) {
      console.log(`[SparkleGlow] Particle glow disabled (enableParticleGlow: ${params.enableParticleGlow})`);
      return;
    }

    const glowSettings = {
      threshold: params.particleGlowThreshold || 0.1,
      bloomScale: params.particleGlowStrength || 1.2,
      brightness: params.particleGlowBrightness || 1.1,
      blur: params.particleGlowBlur || 4,
      quality: params.particleGlowQuality || 6,
    };

    console.log(`[SparkleGlow] Creating glow filter with settings:`, glowSettings);
    console.log(`[SparkleGlow] Particle color: ${params.sparkleColor}, size: ${params.sparkleSize}`);

    const glowFilter = new AdvancedBloomFilter({
      ...glowSettings,
      kernels: null,
      pixelSize: { x: 1, y: 1 }
    });

    graphics.filters = [glowFilter];
    
    console.log(`[SparkleGlow] Applied glow filter to particle, filters length: ${graphics.filters?.length}`);
  }

  /**
   * パーティクルにグローエフェクトを適用（静的版）
   */
  private static applyParticleGlowStatic(graphics: PIXI.Graphics, params: SparkleEffectParams): void {
    if (!params.enableParticleGlow) {
      console.log(`[SparkleGlowStatic] Particle glow disabled (enableParticleGlow: ${params.enableParticleGlow})`);
      return;
    }

    const glowSettings = {
      threshold: params.particleGlowThreshold || 0.1,
      bloomScale: params.particleGlowStrength || 1.2,
      brightness: params.particleGlowBrightness || 1.1,
      blur: params.particleGlowBlur || 4,
      quality: params.particleGlowQuality || 6,
    };

    const glowFilter = new AdvancedBloomFilter({
      ...glowSettings,
      kernels: null,
      pixelSize: { x: 1, y: 1 }
    });

    graphics.filters = [glowFilter];
    
    console.log(`[SparkleGlowStatic] Applied static glow effect to particle:`, glowSettings);
  }

  /**
   * 全パーティクルのクリーンアップ（デバッグ用）
   */
  static cleanup(): void {
    try {
      // 独立更新システムを停止
      if (SparkleEffectPrimitive.updateTimer) {
        clearInterval(SparkleEffectPrimitive.updateTimer);
        SparkleEffectPrimitive.updateTimer = null;
      }
      SparkleEffectPrimitive.isGlobalUpdateActive = false;
      
      // 発生点をクリア
      if (SparkleEffectPrimitive.activeGenerators) {
        SparkleEffectPrimitive.activeGenerators.clear();
      }
      
      // パーティクルの安全な削除
      if (SparkleEffectPrimitive.stageContainer) {
        if (SparkleEffectPrimitive.particles && SparkleEffectPrimitive.particles.size > 0) {
          const particleArray = Array.from(SparkleEffectPrimitive.particles.values());
          for (const particle of particleArray) {
            try {
              if (particle && particle.parent) {
                particle.parent.removeChild(particle);
              }
              if (particle && typeof particle.destroy === 'function') {
                particle.destroy();
              }
            } catch (particleError) {
              console.warn('[SparkleEffectPrimitive] Error destroying particle:', particleError);
            }
          }
        }
        
        if (SparkleEffectPrimitive.particles) {
          SparkleEffectPrimitive.particles.clear();
        }
        
        // ステージコンテナの安全な削除
        try {
          if (SparkleEffectPrimitive.stageContainer.parent) {
            SparkleEffectPrimitive.stageContainer.parent.removeChild(SparkleEffectPrimitive.stageContainer);
          }
          if (typeof SparkleEffectPrimitive.stageContainer.destroy === 'function') {
            SparkleEffectPrimitive.stageContainer.destroy();
          }
        } catch (containerError) {
          console.warn('[SparkleEffectPrimitive] Error destroying stage container:', containerError);
        } finally {
          SparkleEffectPrimitive.stageContainer = null;
        }
      }
      
      // 状態変数のリセット
      SparkleEffectPrimitive.particleCounter = 0;
      SparkleEffectPrimitive.lastUpdateTime = 0;
      SparkleEffectPrimitive.lastSystemTime = 0;
      
    } catch (error) {
      console.error('[SparkleEffectPrimitive] Critical cleanup error:', error);
      // 強制的に状態をリセット
      try {
        if (SparkleEffectPrimitive.particles) {
          SparkleEffectPrimitive.particles.clear();
        }
        if (SparkleEffectPrimitive.activeGenerators) {
          SparkleEffectPrimitive.activeGenerators.clear();
        }
      } catch (resetError) {
        console.warn('[SparkleEffectPrimitive] Error during forced reset:', resetError);
      }
      
      SparkleEffectPrimitive.stageContainer = null;
      SparkleEffectPrimitive.updateTimer = null;
      SparkleEffectPrimitive.isGlobalUpdateActive = false;
      SparkleEffectPrimitive.particleCounter = 0;
      SparkleEffectPrimitive.lastUpdateTime = 0;
      SparkleEffectPrimitive.lastSystemTime = 0;
    }
    
    // ステージグローフィルターもクリーンアップ
    SparkleEffectPrimitive.stageGlowFilter = null;
    SparkleEffectPrimitive.currentGlowSettings = null;
    
    // 文字別の最終更新時刻もクリア
    for (const key in SparkleEffectPrimitive as any) {
      if (key.startsWith('lastUpdate_') || key.startsWith('lastCall_')) {
        delete (SparkleEffectPrimitive as any)[key];
      }
    }
    
    // console.log(`[SparkleEffect] Cleanup completed`);
  }
}