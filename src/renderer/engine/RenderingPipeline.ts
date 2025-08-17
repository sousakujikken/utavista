/**
 * RenderingPipeline - 責任分離を厳格遵守したレンダリングシステム
 * 階層別の責任を100%分離し、テキスト描画はCharacterレベルのみで実行
 * 
 * 参照: development-directive-final.md#2.2, responsibility-separation-detailed-design.md#2-4
 */

import * as PIXI from 'pixi.js';
import { 
  HierarchyResult, 
  PhraseResult, 
  WordResult, 
  CharacterResult,
  RenderResult,
  RenderingPipeline as IRenderingPipeline
} from './CoreSynchronizationEngine';

/**
 * 責任分離チェック結果
 */
export interface ResponsibilityValidation {
  isValid: boolean;
  violations: string[];
  level: 'phrase' | 'word' | 'character';
}

/**
 * レンダリング統計
 */
export interface RenderingStats {
  framesRendered: number;
  phraseRenders: number;
  wordRenders: number;
  characterRenders: number;
  violations: number;
  averageFrameTime: number;
  lastFrameTime: number;
}

/**
 * 責任分離の絶対ルール（development-directive-final.md#1.2準拠）
 */
const RESPONSIBILITY_RULES = {
  phrase: {
    ALLOWED: ['positioning', 'fade', 'group_movement'] as const,
    FORBIDDEN: ['text_rendering', 'character_control'] as const
  },
  word: {
    ALLOWED: ['character_management', 'spacing', 'grouping'] as const,
    FORBIDDEN: ['text_rendering', 'phrase_control'] as const
  },
  character: {
    ALLOWED: ['text_rendering', 'individual_animation', 'effects'] as const,
    FORBIDDEN: ['word_management', 'phrase_control'] as const
  }
} as const;

export class RenderingPipeline implements IRenderingPipeline {
  private stats: RenderingStats = {
    framesRendered: 0,
    phraseRenders: 0,
    wordRenders: 0,
    characterRenders: 0,
    violations: 0,
    averageFrameTime: 0,
    lastFrameTime: 0
  };
  
  private frameTimeSamples: number[] = [];
  private readonly MAX_SAMPLES = 60; // 1秒分のサンプル
  private enableValidation: boolean = true;
  
  constructor(enableValidation: boolean = true) {
    this.enableValidation = enableValidation;
  }
  
  /**
   * 階層結果のレンダリング実行
   * 責任分離を厳格に遵守
   */
  render(hierarchyResult: HierarchyResult): RenderResult {
    const renderStart = performance.now();
    
    try {
      // 責任分離事前検証
      if (this.enableValidation) {
        const validation = this.validateResponsibilities(hierarchyResult);
        if (!validation.isValid) {
          this.stats.violations++;
          return {
            success: false,
            frameRate: PIXI.Ticker.shared.FPS,
            errorMessage: `Responsibility violations: ${validation.violations.join(', ')}`
          };
        }
      }
      
      // 階層別レンダリング実行（順序重要）
      this.renderPhraseLevel(hierarchyResult.phrase);
      this.renderWordLevel(hierarchyResult.words);
      this.renderCharacterLevel(hierarchyResult.characters);
      
      // 統計更新
      this.updateStats(renderStart);
      
      return {
        success: true,
        frameRate: PIXI.Ticker.shared.FPS
      };
      
    } catch (error) {
      console.error('[RenderingPipeline] Render error:', error);
      return {
        success: false,
        frameRate: 0,
        errorMessage: `Rendering error: ${error}`
      };
    }
  }
  
  /**
   * フレーズレベルレンダリング
   * ✅ 許可: positioning, fade, group_movement
   * ❌ 禁止: text_rendering, character_control
   */
  private renderPhraseLevel(phrase: PhraseResult): void {
    if (!phrase.processed) return;
    
    try {
      // ✅ 許可された操作のみ実行
      
      // 配置制御（positioning）
      phrase.container.position.set(phrase.x, phrase.y);
      
      // フェード制御（fade）
      phrase.container.alpha = Math.max(0, Math.min(1, phrase.alpha));
      
      // グループ移動制御（group_movement）
      // 全体的なトランスフォーム適用
      phrase.container.updateTransform();
      
      // ❌ 以下は絶対禁止
      // - new PIXI.Text(...) の作成
      // - phrase.container.addChild(textObject)
      // - 個別文字の直接制御
      
      this.stats.phraseRenders++;
      
    } catch (error) {
      console.error('[RenderingPipeline] Phrase render error:', error);
      throw error;
    }
  }
  
  /**
   * ワードレベルレンダリング
   * ✅ 許可: character_management, spacing, grouping
   * ❌ 禁止: text_rendering, phrase_control
   */
  private renderWordLevel(words: WordResult[]): void {
    words.forEach((word, wordIndex) => {
      if (!word.processed) return;
      
      try {
        // ✅ 許可された操作のみ実行
        
        // 文字管理（character_management）
        // 文字コンテナの配置管理のみ
        let x = 0;
        word.characters.forEach((charContainer, charIndex) => {
          // 間隔制御（spacing）
          charContainer.position.x = x;
          x += word.characterSpacing;
          
          // グループ化（grouping）
          // 文字コンテナの論理的グループ管理
          (charContainer as any).wordIndex = wordIndex;
          (charContainer as any).charIndex = charIndex;
        });
        
        // ワードコンテナの更新
        word.container.updateTransform();
        
        // ❌ 以下は絶対禁止
        // - new PIXI.Text(...) の作成
        // - テキスト内容の変更
        // - フレーズレベルの制御
        
        this.stats.wordRenders++;
        
      } catch (error) {
        console.error('[RenderingPipeline] Word render error:', error);
        throw error;
      }
    });
  }
  
  /**
   * キャラクターレベルレンダリング
   * ✅ 許可: text_rendering, individual_animation, effects（唯一のテキスト描画許可階層）
   * ❌ 禁止: word_management, phrase_control
   */
  private renderCharacterLevel(characters: CharacterResult[]): void {
    characters.forEach(char => {
      if (!char.processed) return;
      
      try {
        // ✅ テキスト描画（ここだけOK！）
        if (!char.text && char.character) {
          // 唯一テキスト作成が許可された場所
          char.text = new PIXI.Text(char.character, char.style);
          char.container.addChild(char.text);
        }
        
        // ✅ 個別アニメーション（individual_animation）
        if (char.text) {
          // テキストオブジェクトの個別制御
          char.text.anchor.set(0.5, 0.5);
          
          // エフェクト（effects）
          // 個別文字レベルのエフェクト適用可能
          // 例：回転、スケール、色変更など
        }
        
        // コンテナの更新
        char.container.updateTransform();
        
        // ❌ 以下は絶対禁止
        // - 他の文字コンテナの直接制御
        // - ワードレベルの配置変更
        // - フレーズレベルの制御
        
        this.stats.characterRenders++;
        
      } catch (error) {
        console.error('[RenderingPipeline] Character render error:', error);
        throw error;
      }
    });
  }
  
  /**
   * 責任分離の事前検証
   */
  private validateResponsibilities(hierarchyResult: HierarchyResult): ResponsibilityValidation {
    const violations: string[] = [];
    
    // フレーズレベルの検証
    const phraseValidation = this.validatePhraseLevel(hierarchyResult.phrase);
    violations.push(...phraseValidation.violations);
    
    // ワードレベルの検証
    hierarchyResult.words.forEach(word => {
      const wordValidation = this.validateWordLevel(word);
      violations.push(...wordValidation.violations);
    });
    
    // キャラクターレベルの検証
    hierarchyResult.characters.forEach(char => {
      const charValidation = this.validateCharacterLevel(char);
      violations.push(...charValidation.violations);
    });
    
    return {
      isValid: violations.length === 0,
      violations,
      level: 'character' // 最も制限の厳しいレベル
    };
  }
  
  /**
   * フレーズレベル責任検証
   */
  private validatePhraseLevel(phrase: PhraseResult): ResponsibilityValidation {
    const violations: string[] = [];
    
    // テキスト作成の検出（禁止）
    if (phrase.container.children.some(child => child instanceof PIXI.Text)) {
      violations.push('Phrase level cannot create Text objects');
    }
    
    return {
      isValid: violations.length === 0,
      violations,
      level: 'phrase'
    };
  }
  
  /**
   * ワードレベル責任検証
   */
  private validateWordLevel(word: WordResult): ResponsibilityValidation {
    const violations: string[] = [];
    
    // テキスト作成の検出（禁止）
    if (word.container.children.some(child => child instanceof PIXI.Text)) {
      violations.push('Word level cannot create Text objects');
    }
    
    return {
      isValid: violations.length === 0,
      violations,
      level: 'word'
    };
  }
  
  /**
   * キャラクターレベル責任検証
   */
  private validateCharacterLevel(char: CharacterResult): ResponsibilityValidation {
    const violations: string[] = [];
    
    // キャラクターレベルは最も自由度が高いため、基本的な検証のみ
    if (!char.container) {
      violations.push('Character must have a valid container');
    }
    
    return {
      isValid: violations.length === 0,
      violations,
      level: 'character'
    };
  }
  
  /**
   * 統計更新
   */
  private updateStats(renderStart: number): void {
    const frameTime = performance.now() - renderStart;
    this.stats.lastFrameTime = frameTime;
    this.stats.framesRendered++;
    
    // フレーム時間サンプリング
    this.frameTimeSamples.push(frameTime);
    if (this.frameTimeSamples.length > this.MAX_SAMPLES) {
      this.frameTimeSamples.shift();
    }
    
    // 平均フレーム時間計算
    this.stats.averageFrameTime = this.frameTimeSamples.reduce((a, b) => a + b, 0) / this.frameTimeSamples.length;
  }
  
  /**
   * レンダリング統計取得
   */
  getStats(): RenderingStats {
    return { ...this.stats };
  }
  
  /**
   * 統計リセット
   */
  resetStats(): void {
    this.stats = {
      framesRendered: 0,
      phraseRenders: 0,
      wordRenders: 0,
      characterRenders: 0,
      violations: 0,
      averageFrameTime: 0,
      lastFrameTime: 0
    };
    this.frameTimeSamples = [];
  }
  
  /**
   * 責任分離検証の有効/無効切り替え
   */
  setValidationEnabled(enabled: boolean): void {
    this.enableValidation = enabled;
  }
  
  /**
   * デバッグ情報取得
   */
  getDebugInfo(): Record<string, any> {
    const stats = this.getStats();
    
    return {
      stats,
      validation: {
        enabled: this.enableValidation,
        violationRate: stats.framesRendered > 0 
          ? `${(stats.violations / stats.framesRendered * 100).toFixed(2)}%`
          : '0%'
      },
      performance: {
        averageFrameTime: `${stats.averageFrameTime.toFixed(2)}ms`,
        lastFrameTime: `${stats.lastFrameTime.toFixed(2)}ms`,
        samplesCollected: this.frameTimeSamples.length
      },
      responsibilities: RESPONSIBILITY_RULES
    };
  }
  
  /**
   * レンダリング品質評価
   */
  getRenderingQuality(): 'excellent' | 'good' | 'fair' | 'poor' {
    const stats = this.getStats();
    
    if (stats.violations === 0 && stats.averageFrameTime < 10) {
      return 'excellent';
    } else if (stats.violations === 0 && stats.averageFrameTime < 14) {
      return 'good';
    } else if (stats.violations < stats.framesRendered * 0.01 && stats.averageFrameTime < 20) {
      return 'fair';
    } else {
      return 'poor';
    }
  }
}