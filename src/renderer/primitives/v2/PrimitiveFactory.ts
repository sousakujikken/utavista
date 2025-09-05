/**
 * プリミティブファクトリー v2.0
 * メモリ効率化のためのシングルトンインスタンス管理
 */

import { PhrasePositionPrimitive } from './position/PhrasePositionPrimitive';
import { WordPositionPrimitive } from './position/WordPositionPrimitive';
import { CharacterLayoutPrimitive } from './layout/CharacterLayoutPrimitive';
import { BlurEffectPrimitive } from './effects/BlurEffectPrimitive';
import { GlitchEffectPrimitive } from './effects/GlitchEffectPrimitive';

export class PrimitiveFactory {
  private static phrasePositionInstance: PhrasePositionPrimitive;
  private static wordPositionInstance: WordPositionPrimitive;
  private static characterLayoutInstance: CharacterLayoutPrimitive;
  private static blurEffectInstance: BlurEffectPrimitive;
  private static glitchEffectInstance: GlitchEffectPrimitive;

  /**
   * フレーズ位置計算プリミティブのシングルトンインスタンスを取得
   */
  static getPhrasePositionPrimitive(): PhrasePositionPrimitive {
    if (!this.phrasePositionInstance) {
      this.phrasePositionInstance = new PhrasePositionPrimitive();
    }
    return this.phrasePositionInstance;
  }

  /**
   * 単語位置計算プリミティブのシングルトンインスタンスを取得
   */
  static getWordPositionPrimitive(): WordPositionPrimitive {
    if (!this.wordPositionInstance) {
      this.wordPositionInstance = new WordPositionPrimitive();
    }
    return this.wordPositionInstance;
  }

  /**
   * 文字レイアウトプリミティブのシングルトンインスタンスを取得
   */
  static getCharacterLayoutPrimitive(): CharacterLayoutPrimitive {
    if (!this.characterLayoutInstance) {
      this.characterLayoutInstance = new CharacterLayoutPrimitive();
    }
    return this.characterLayoutInstance;
  }

  /**
   * ブラーエフェクトプリミティブのシングルトンインスタンスを取得
   */
  static getBlurEffectPrimitive(): BlurEffectPrimitive {
    if (!this.blurEffectInstance) {
      this.blurEffectInstance = new BlurEffectPrimitive();
    }
    return this.blurEffectInstance;
  }

  /**
   * グリッチエフェクトプリミティブのシングルトンインスタンスを取得
   */
  static getGlitchEffectPrimitive(): GlitchEffectPrimitive {
    if (!this.glitchEffectInstance) {
      this.glitchEffectInstance = new GlitchEffectPrimitive();
    }
    return this.glitchEffectInstance;
  }

  /**
   * 全インスタンスを強制リセット（テスト用）
   */
  static resetAllInstances(): void {
    this.phrasePositionInstance = null as any;
    this.wordPositionInstance = null as any;
    this.characterLayoutInstance = null as any;
    this.blurEffectInstance = null as any;
    this.glitchEffectInstance = null as any;
  }

  /**
   * メモリ使用状況の診断情報を取得
   */
  static getDiagnostics(): PrimitiveFactoryDiagnostics {
    return {
      phrasePositionInitialized: !!this.phrasePositionInstance,
      wordPositionInitialized: !!this.wordPositionInstance,
      characterLayoutInitialized: !!this.characterLayoutInstance,
      blurEffectInitialized: !!this.blurEffectInstance,
      glitchEffectInitialized: !!this.glitchEffectInstance,
      totalInitializedPrimitives: [
        this.phrasePositionInstance,
        this.wordPositionInstance,
        this.characterLayoutInstance,
        this.blurEffectInstance,
        this.glitchEffectInstance
      ].filter(Boolean).length
    };
  }
}

export interface PrimitiveFactoryDiagnostics {
  phrasePositionInitialized: boolean;
  wordPositionInitialized: boolean;
  characterLayoutInitialized: boolean;
  blurEffectInitialized: boolean;
  glitchEffectInitialized: boolean;
  totalInitializedPrimitives: number;
}