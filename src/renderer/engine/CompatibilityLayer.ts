/**
 * CompatibilityLayer - 既存システムと階層分離システムの完全統合層
 * 非破壊的統合により100%の互換性を維持しながら階層システムを統合
 * 
 * 参照: development-directive-final.md#5.1, existing-system-integration-design.md#4
 */

import AnimationInstance from './AnimationInstance';
import { InstanceManager } from './InstanceManager';
import { Engine } from './Engine';
import { CoreSynchronizationEngine, HierarchyResult } from './CoreSynchronizationEngine';
import { SimplePrecisionTimeManager } from './SimplePrecisionTimeManager';
import { HierarchicalWrapper } from './HierarchicalWrapper';
import { PrimitiveAPIManager } from '../primitives/PrimitiveAPIManager';
import { ResponsibilityValidator } from '../validators/ResponsibilityValidator';
import { HierarchyType } from '../types/types';

export interface HierarchicalData {
  phraseData: PhraseData[];
  wordData: WordData[];
  characterData: CharacterData[];
  metadata: IntegrationMetadata;
}

export interface PhraseData {
  id: string;
  container: import('pixi.js').Container;
  startMs: number;
  endMs: number;
  position: { x: number; y: number };
  alpha: number;
  children: string[]; // word IDs
}

export interface WordData {
  id: string;
  container: import('pixi.js').Container;
  parentPhraseId: string;
  characters: CharacterData[];
  spacing: number;
}

export interface CharacterData {
  id: string;
  container: import('pixi.js').Container;
  parentWordId: string;
  character: string;
  style: any;
  position: { x: number; y: number };
}

export interface IntegrationMetadata {
  conversionTime: number;
  totalElements: number;
  hierarchyDepth: number;
  compatibilityMode: boolean;
  originalSystemActive: boolean;
}

export interface IntegrationStats {
  conversions: number;
  successRate: number;
  averageConversionTime: number;
  fallbackCount: number;
  errorCount: number;
  memoryUsage: number;
}

/**
 * 階層システム統合層
 * existing-system-integration-design.md#4 準拠
 */
export class CompatibilityLayer {
  private coreEngine: CoreSynchronizationEngine;
  private timeManager: SimplePrecisionTimeManager;
  private primitiveManager: PrimitiveAPIManager;
  private wrapperCache: Map<string, HierarchicalWrapper> = new Map();
  private conversionCache: Map<string, HierarchicalData> = new Map();
  private stats: IntegrationStats = {
    conversions: 0,
    successRate: 1.0,
    averageConversionTime: 0,
    fallbackCount: 0,
    errorCount: 0,
    memoryUsage: 0
  };

  constructor(audioElement?: HTMLAudioElement) {
    this.timeManager = new SimplePrecisionTimeManager(audioElement);
    this.coreEngine = new CoreSynchronizationEngine(this.timeManager);
    this.primitiveManager = new PrimitiveAPIManager();
  }

  /**
   * 既存AnimationInstanceを階層データに変換
   * existing-system-integration-design.md#4.1 準拠
   */
  async bridgeToHierarchy(instance: AnimationInstance): Promise<HierarchicalData> {
    const conversionStart = performance.now();
    const instanceId = instance.id;

    try {
      // キャッシュ確認
      if (this.conversionCache.has(instanceId)) {
        return this.conversionCache.get(instanceId)!;
      }

      // 階層構造分析
      const hierarchyStructure = this.analyzeInstanceHierarchy(instance);
      
      // 階層データ変換
      const hierarchicalData = await this.convertToHierarchicalData(instance, hierarchyStructure);

      // 責任分離検証
      const validation = this.validateHierarchicalData(hierarchicalData);
      if (!validation.isValid) {
        console.warn('[CompatibilityLayer] Hierarchy validation warnings:', validation.violations);
      }

      // キャッシュ保存
      this.conversionCache.set(instanceId, hierarchicalData);

      // 統計更新
      this.updateStats(conversionStart, true);

      return hierarchicalData;

    } catch (error) {
      console.error('[CompatibilityLayer] Bridge conversion failed:', error);
      this.updateStats(conversionStart, false);
      
      // フォールバック: 最小限の階層データ生成
      return this.createFallbackHierarchy(instance);
    }
  }

  /**
   * 階層結果を既存システムに適用
   * existing-system-integration-design.md#4.2 準拠
   */
  applyResults(instance: AnimationInstance, results: HierarchyResult): void {
    try {
      // フレーズレベル適用
      if (results.phrase.processed) {
        instance.container.position.set(results.phrase.x, results.phrase.y);
        instance.container.alpha = results.phrase.alpha;
        instance.container.updateTransform();
      }

      // ワードレベル適用
      results.words.forEach((word, wordIndex) => {
        if (word.processed && word.characters.length > 0) {
          word.characters.forEach((charContainer, charIndex) => {
            // 既存の文字コンテナと同期
            if (charContainer && instance.container.children[charIndex]) {
              const existingChar = instance.container.children[charIndex];
              if (existingChar) {
                existingChar.position.x = charContainer.position.x;
                existingChar.position.y = charContainer.position.y;
                existingChar.updateTransform();
              }
            }
          });
        }
      });

      // キャラクターレベル適用
      results.characters.forEach((char, charIndex) => {
        if (char.processed && char.text) {
          // 既存テキストオブジェクトと同期
          const existingContainer = instance.container.children[charIndex];
          if (existingContainer && existingContainer instanceof PIXI.Container) {
            const existingText = existingContainer.children.find(child => 
              child instanceof PIXI.Text
            ) as PIXI.Text;

            if (existingText) {
              existingText.text = char.character;
              existingText.style = char.style;
            } else {
              // 新規テキスト追加
              existingContainer.addChild(char.text);
            }
            existingContainer.updateTransform();
          }
        }
      });

    } catch (error) {
      console.error('[CompatibilityLayer] Apply results failed:', error);
      this.stats.errorCount++;
    }
  }

  /**
   * Engine統合メソッド
   * Engineクラスでの使用を想定
   */
  async integrateWithEngine(
    engine: Engine,
    instances: AnimationInstance[],
    currentTime: number
  ): Promise<boolean> {
    try {
      const integrationPromises = instances.map(async instance => {
        // 既存のラッパーを取得または作成
        let wrapper = this.wrapperCache.get(instance.id);
        if (!wrapper) {
          wrapper = new HierarchicalWrapper(instance, engine.audioPlayer?.nativeAudio);
          this.wrapperCache.set(instance.id, wrapper);
        }

        // 階層システムでの更新実行
        const hierarchicalData = await this.bridgeToHierarchy(instance);
        const syncResult = await this.coreEngine.executeWithMusicSync(instance, currentTime);
        
        if (syncResult.success) {
          // 成功時は結果を適用
          return true;
        } else {
          // 失敗時は既存システムにフォールバック
          this.stats.fallbackCount++;
          return instance.update(currentTime);
        }
      });

      const results = await Promise.all(integrationPromises);
      const successCount = results.filter(r => r === true).length;
      
      // 成功率更新
      this.stats.successRate = successCount / results.length;
      
      return successCount > 0;

    } catch (error) {
      console.error('[CompatibilityLayer] Engine integration failed:', error);
      this.stats.errorCount++;
      return false;
    }
  }

  /**
   * InstanceManager統合メソッド
   */
  async integrateWithInstanceManager(instanceManager: InstanceManager): Promise<void> {
    try {
      // アクティブインスタンスの取得
      const instances = Array.from(instanceManager['instances'].values());
      
      // 各インスタンスをラッパーで包装
      instances.forEach(instance => {
        if (!this.wrapperCache.has(instance.id)) {
          const wrapper = new HierarchicalWrapper(instance);
          this.wrapperCache.set(instance.id, wrapper);
          
          // InstanceManagerの更新メソッドを階層システムに統合
          this.integrateInstanceUpdates(instance, wrapper);
        }
      });

      console.log(`[CompatibilityLayer] Integrated ${instances.length} instances with InstanceManager`);

    } catch (error) {
      console.error('[CompatibilityLayer] InstanceManager integration failed:', error);
    }
  }

  /**
   * インスタンス更新の統合
   */
  private integrateInstanceUpdates(instance: AnimationInstance, wrapper: HierarchicalWrapper): void {
    // 元のupdateメソッドを階層システムと統合済みに変更
    // （HierarchicalWrapperが既に実装済み）
    wrapper.setHierarchicalEnabled(true);
  }

  /**
   * インスタンス階層構造分析
   */
  private analyzeInstanceHierarchy(instance: AnimationInstance): {
    phraseCount: number;
    wordCount: number;
    characterCount: number;
    hierarchyType: HierarchyType;
  } {
    const container = instance.container;
    let characterCount = 0;
    let wordCount = 0;
    let phraseCount = 1; // インスタンス自体がフレーズ

    // コンテナ階層を分析
    if (container.children.length > 0) {
      container.children.forEach(child => {
        if (child instanceof PIXI.Container) {
          wordCount++;
          // 文字コンテナをカウント
          child.children.forEach(grandChild => {
            if (grandChild instanceof PIXI.Container || grandChild instanceof PIXI.Text) {
              characterCount++;
            }
          });
        } else if (child instanceof PIXI.Text) {
          characterCount++;
        }
      });
    }

    // 文字数がない場合はテキストから推測
    if (characterCount === 0 && instance.text) {
      characterCount = instance.text.length;
      wordCount = Math.max(1, wordCount);
    }

    return {
      phraseCount,
      wordCount: Math.max(1, wordCount),
      characterCount: Math.max(1, characterCount),
      hierarchyType: instance.hierarchyType
    };
  }

  /**
   * 階層データ変換
   */
  private async convertToHierarchicalData(
    instance: AnimationInstance,
    structure: any
  ): Promise<HierarchicalData> {
    const phraseData: PhraseData[] = [];
    const wordData: WordData[] = [];
    const characterData: CharacterData[] = [];

    // フレーズデータ生成
    const phraseId = `phrase_${instance.id}`;
    const phrase: PhraseData = {
      id: phraseId,
      container: instance.container,
      startMs: instance.startMs,
      endMs: instance.endMs,
      position: { x: instance.x, y: instance.y },
      alpha: instance.container.alpha,
      children: []
    };
    phraseData.push(phrase);

    // ワード・文字データ生成
    const text = instance.text || '';
    const words = text.split(/\s+/).filter(word => word.length > 0);
    
    words.forEach((word, wordIndex) => {
      const wordId = `word_${instance.id}_${wordIndex}`;
      const wordContainer = instance.container.children[wordIndex] as PIXI.Container || 
                           new PIXI.Container();

      const wordDataItem: WordData = {
        id: wordId,
        container: wordContainer,
        parentPhraseId: phraseId,
        characters: [],
        spacing: instance.params.letterSpacing as number || 0
      };

      // 文字データ生成
      Array.from(word).forEach((char, charIndex) => {
        const charId = `char_${instance.id}_${wordIndex}_${charIndex}`;
        const charContainer = wordContainer.children[charIndex] as PIXI.Container || 
                             new PIXI.Container();

        const charData: CharacterData = {
          id: charId,
          container: charContainer,
          parentWordId: wordId,
          character: char,
          style: instance.params,
          position: { x: charIndex * (wordDataItem.spacing + 10), y: 0 }
        };

        characterData.push(charData);
        wordDataItem.characters.push(charData);
      });

      wordData.push(wordDataItem);
      phrase.children.push(wordId);
    });

    const metadata: IntegrationMetadata = {
      conversionTime: performance.now(),
      totalElements: phraseData.length + wordData.length + characterData.length,
      hierarchyDepth: 3,
      compatibilityMode: true,
      originalSystemActive: true
    };

    return {
      phraseData,
      wordData,
      characterData,
      metadata
    };
  }

  /**
   * 階層データ検証
   */
  private validateHierarchicalData(data: HierarchicalData): { isValid: boolean; violations: any[] } {
    const violations: any[] = [];

    // 基本構造検証
    if (data.phraseData.length === 0) {
      violations.push({ rule: 'no_phrases', description: 'At least one phrase required' });
    }

    // 階層関係検証
    data.wordData.forEach(word => {
      const parentExists = data.phraseData.some(phrase => phrase.id === word.parentPhraseId);
      if (!parentExists) {
        violations.push({ 
          rule: 'orphan_word', 
          description: `Word ${word.id} has no parent phrase` 
        });
      }
    });

    data.characterData.forEach(char => {
      const parentExists = data.wordData.some(word => word.id === char.parentWordId);
      if (!parentExists) {
        violations.push({ 
          rule: 'orphan_character', 
          description: `Character ${char.id} has no parent word` 
        });
      }
    });

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  /**
   * フォールバック階層生成
   */
  private createFallbackHierarchy(instance: AnimationInstance): HierarchicalData {
    const phraseData: PhraseData[] = [{
      id: `fallback_phrase_${instance.id}`,
      container: instance.container,
      startMs: instance.startMs,
      endMs: instance.endMs,
      position: { x: instance.x, y: instance.y },
      alpha: 1.0,
      children: []
    }];

    return {
      phraseData,
      wordData: [],
      characterData: [],
      metadata: {
        conversionTime: performance.now(),
        totalElements: 1,
        hierarchyDepth: 1,
        compatibilityMode: true,
        originalSystemActive: true
      }
    };
  }

  /**
   * 統計更新
   */
  private updateStats(startTime: number, success: boolean): void {
    this.stats.conversions++;
    const conversionTime = performance.now() - startTime;
    
    // 移動平均で平均変換時間を更新
    this.stats.averageConversionTime = 
      (this.stats.averageConversionTime * (this.stats.conversions - 1) + conversionTime) / 
      this.stats.conversions;

    if (!success) {
      this.stats.errorCount++;
    }

    // 成功率更新
    this.stats.successRate = (this.stats.conversions - this.stats.errorCount) / this.stats.conversions;

    // メモリ使用量更新
    if (typeof (performance as any).memory !== 'undefined') {
      this.stats.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }
  }

  /**
   * 統計取得
   */
  getIntegrationStats(): IntegrationStats {
    return { ...this.stats };
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.conversionCache.clear();
    this.wrapperCache.forEach(wrapper => wrapper.restoreOriginal());
    this.wrapperCache.clear();
    console.log('[CompatibilityLayer] Cache cleared');
  }

  /**
   * 音声要素更新
   */
  setAudioElement(audioElement: HTMLAudioElement): void {
    this.timeManager.setAudioElement(audioElement);
    
    // 既存ラッパーにも反映
    this.wrapperCache.forEach(wrapper => {
      wrapper.setAudioElement(audioElement);
    });
  }

  /**
   * デバッグ情報取得
   */
  getDebugInfo(): Record<string, any> {
    return {
      stats: this.stats,
      cacheSize: {
        conversions: this.conversionCache.size,
        wrappers: this.wrapperCache.size
      },
      timeManager: this.timeManager.getDebugInfo(),
      coreEngine: this.coreEngine.getDebugInfo(),
      primitiveManager: this.primitiveManager.getDebugInfo()
    };
  }
}