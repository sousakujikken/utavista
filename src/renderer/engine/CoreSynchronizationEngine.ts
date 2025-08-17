/**
 * CoreSynchronizationEngine - 階層分離システムの核心エンジン
 * 音楽同期と責任分離を厳格に遵守した階層処理を実行
 * 
 * 参照: development-directive-final.md#2.1, core-focused-design-revision.md#2.1
 */

import * as PIXI from 'pixi.js';
import AnimationInstance from './AnimationInstance';
import { SimplePrecisionTimeManager, FrameTime, SyncAccuracy } from './SimplePrecisionTimeManager';
import { HierarchyType } from '../types/types';

export interface SyncResult {
  success: boolean;
  syncAccuracy: SyncAccuracy;
  frameRate: number;
  errorMessage?: string;
}

export interface HierarchyResult {
  phrase: PhraseResult;
  words: WordResult[];
  characters: CharacterResult[];
}

export interface PhraseResult {
  container: PIXI.Container;
  x: number;
  y: number;
  alpha: number;
  processed: boolean;
}

export interface WordResult {
  container: PIXI.Container;
  characterSpacing: number;
  processed: boolean;
  characters: PIXI.Container[];
}

export interface CharacterResult {
  container: PIXI.Container;
  character: string;
  style: PIXI.TextStyle;
  text?: PIXI.Text;
  processed: boolean;
}

export interface RenderingPipeline {
  render(hierarchyResult: HierarchyResult): RenderResult;
}

export interface RenderResult {
  success: boolean;
  frameRate: number;
  errorMessage?: string;
}

/**
 * 責任分離の絶対ルール（responsibility-separation-detailed-design.md準拠）
 */
const HIERARCHY_RESPONSIBILITIES = {
  phrase: {
    ALLOWED: ['positioning', 'fade', 'group_movement'],
    FORBIDDEN: ['text_rendering', 'character_control']
  },
  word: {
    ALLOWED: ['character_management', 'spacing', 'grouping'],
    FORBIDDEN: ['text_rendering', 'phrase_control']
  },
  character: {
    ALLOWED: ['text_rendering', 'individual_animation', 'effects'],
    FORBIDDEN: ['word_management', 'phrase_control']
  }
} as const;

export class CoreSynchronizationEngine {
  private timeManager: SimplePrecisionTimeManager;
  private renderingPipeline: RenderingPipeline | null = null;
  
  constructor(timeManager: SimplePrecisionTimeManager) {
    this.timeManager = timeManager;
  }
  
  /**
   * レンダリングパイプラインを設定
   */
  setRenderingPipeline(pipeline: RenderingPipeline): void {
    this.renderingPipeline = pipeline;
  }
  
  /**
   * 音楽同期付き階層実行のメインメソッド
   * 既存システムとの互換性を維持しながら階層処理を実行
   */
  async executeWithMusicSync(
    instance: AnimationInstance,
    musicTime: number
  ): Promise<SyncResult> {
    try {
      // 1. 時間計算（既存方式活用）
      const frameTime = this.timeManager.calculateFrameTime(musicTime);
      
      // 2. 階層処理（責任分離厳守）
      const hierarchyResult = await this.processHierarchy(instance, frameTime);
      
      // 3. レンダリング実行
      let renderResult: RenderResult = { success: false, frameRate: 0 };
      if (this.renderingPipeline) {
        renderResult = this.renderingPipeline.render(hierarchyResult);
      } else {
        // フォールバック: 直接レンダリング（互換性のため）
        renderResult = this.directRender(hierarchyResult);
      }
      
      // 4. 結果返却
      return {
        success: renderResult.success,
        syncAccuracy: this.timeManager.measureSyncAccuracy(),
        frameRate: renderResult.frameRate || PIXI.Ticker.shared.FPS,
        errorMessage: renderResult.errorMessage
      };
      
    } catch (error) {
      return {
        success: false,
        syncAccuracy: this.timeManager.measureSyncAccuracy(),
        frameRate: PIXI.Ticker.shared.FPS,
        errorMessage: `CoreSynchronizationEngine error: ${error}`
      };
    }
  }
  
  /**
   * 階層処理（責任分離詳細はresponsibility-separation-detailed-design.md#2-4参照）
   */
  private async processHierarchy(
    instance: AnimationInstance,
    frameTime: FrameTime
  ): Promise<HierarchyResult> {
    
    // フレーズレベル処理（責任: 全体制御のみ）
    const phraseResult = await this.processPhraseLevel(instance, frameTime);
    
    // ワードレベル処理（責任: 文字管理のみ）
    const wordResults = await this.processWordLevel(instance, frameTime);
    
    // キャラクターレベル処理（責任: テキスト描画のみ）
    const charResults = await this.processCharLevel(instance, frameTime);
    
    return {
      phrase: phraseResult,
      words: wordResults,
      characters: charResults
    };
  }
  
  /**
   * フレーズレベル処理
   * ✅ 許可: positioning, fade, group_movement
   * ❌ 禁止: text_rendering, character_control
   */
  private async processPhraseLevel(
    instance: AnimationInstance,
    frameTime: FrameTime
  ): Promise<PhraseResult> {
    
    // デフォルト画面中央配置（UTAVISTA v0.4.3 標準仕様）
    const screenWidth = instance.container.parent?.getBounds?.()?.width || 1920;
    const screenHeight = instance.container.parent?.getBounds?.()?.height || 1080;
    const centerX = screenWidth / 2 + (instance.params.phraseOffsetX as number || 0);
    const centerY = screenHeight / 2 + (instance.params.phraseOffsetY as number || 0);
    
    // フェードイン/アウト計算
    const alpha = this.calculatePhraseAlpha(instance, frameTime.musicTime);
    
    return {
      container: instance.container,
      x: centerX,
      y: centerY,
      alpha,
      processed: true
    };
  }
  
  /**
   * ワードレベル処理
   * ✅ 許可: character_management, spacing, grouping
   * ❌ 禁止: text_rendering, phrase_control
   */
  private async processWordLevel(
    instance: AnimationInstance,
    frameTime: FrameTime
  ): Promise<WordResult[]> {
    
    // 既存のコンテナから子コンテナ（文字コンテナ）を取得
    const characters = instance.container.children
      .filter(child => child instanceof PIXI.Container) as PIXI.Container[];
    
    // 文字間隔計算
    const spacing = instance.params.letterSpacing as number || 0;
    
    return [{
      container: instance.container,
      characterSpacing: spacing,
      characters,
      processed: true
    }];
  }
  
  /**
   * キャラクターレベル処理
   * ✅ 許可: text_rendering, individual_animation, effects
   * ❌ 禁止: word_management, phrase_control
   */
  private async processCharLevel(
    instance: AnimationInstance,
    frameTime: FrameTime
  ): Promise<CharacterResult[]> {
    
    const characters = instance.container.children
      .filter(child => child instanceof PIXI.Container) as PIXI.Container[];
    
    return characters.map((charContainer, index) => {
      // テキストスタイル生成
      const style = new PIXI.TextStyle({
        fontSize: instance.params.fontSize as number || 48,
        fontFamily: instance.params.fontFamily as string || 'Arial',
        fill: instance.params.fill || '#ffffff'
      });
      
      // 文字を取得（既存システムとの互換性）
      const character = instance.text.charAt(index) || '';
      
      return {
        container: charContainer,
        character,
        style,
        processed: true
      };
    });
  }
  
  /**
   * フレーズ透明度計算
   */
  private calculatePhraseAlpha(instance: AnimationInstance, musicTime: number): number {
    const progress = (musicTime - instance.startMs) / (instance.endMs - instance.startMs);
    
    if (progress < 0) return 0;
    if (progress > 1) return 0;
    
    // フェードイン・アウト処理
    const fadeInTime = instance.params.inDuration as number || 200;
    const fadeOutTime = instance.params.outDuration as number || 200;
    const duration = instance.endMs - instance.startMs;
    
    if (musicTime < instance.startMs + fadeInTime) {
      return (musicTime - instance.startMs) / fadeInTime;
    }
    
    if (musicTime > instance.endMs - fadeOutTime) {
      return (instance.endMs - musicTime) / fadeOutTime;
    }
    
    return 1.0;
  }
  
  /**
   * 直接レンダリング（フォールバック用）
   */
  private directRender(hierarchyResult: HierarchyResult): RenderResult {
    try {
      // フレーズレベル適用
      const { phrase } = hierarchyResult;
      phrase.container.position.set(phrase.x, phrase.y);
      phrase.container.alpha = phrase.alpha;
      
      // キャラクターレベル適用（テキスト描画）
      hierarchyResult.characters.forEach(char => {
        if (!char.text && char.character) {
          char.text = new PIXI.Text(char.character, char.style);
          char.container.addChild(char.text);
        }
      });
      
      return {
        success: true,
        frameRate: PIXI.Ticker.shared.FPS
      };
      
    } catch (error) {
      return {
        success: false,
        frameRate: 0,
        errorMessage: `Direct render error: ${error}`
      };
    }
  }
  
  /**
   * デバッグ用情報取得
   */
  getDebugInfo(): Record<string, any> {
    return {
      timeManager: this.timeManager.getDebugInfo(),
      renderingPipeline: this.renderingPipeline ? 'active' : 'fallback',
      responsibilities: HIERARCHY_RESPONSIBILITIES
    };
  }
}