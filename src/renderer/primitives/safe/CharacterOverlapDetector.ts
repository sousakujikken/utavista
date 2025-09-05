/**
 * 文字重複検出システム
 * 開発時の自動検証とデバッグ支援
 */

import * as PIXI from 'pixi.js';

/**
 * 重複検出結果
 */
export interface OverlapDetectionResult {
  hasDuplicates: boolean;
  duplicateContainers: string[];
  positionOverlaps: Array<{
    container1: string;
    container2: string;
    position: { x: number; y: number };
  }>;
  warnings: string[];
  recommendations: string[];
}

/**
 * 検出設定
 */
export interface DetectionConfig {
  /** 開発時のみ有効 */
  enableInDevelopment: boolean;
  /** 位置重複の許容誤差（ピクセル） */
  positionTolerance: number;
  /** 例外をスローするか */
  throwOnDuplicate: boolean;
  /** 詳細ログを出力するか */
  verboseLogging: boolean;
}

/**
 * 文字重複検出器
 */
export class CharacterOverlapDetector {
  private static readonly DEFAULT_CONFIG: DetectionConfig = {
    enableInDevelopment: process.env.NODE_ENV === 'development',
    positionTolerance: 1.0,
    throwOnDuplicate: true,
    verboseLogging: true
  };
  
  private config: DetectionConfig;
  
  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...CharacterOverlapDetector.DEFAULT_CONFIG, ...config };
  }
  
  /**
   * コンテナの重複検出
   */
  detectDuplicates(wordContainer: PIXI.Container): OverlapDetectionResult {
    if (!this.config.enableInDevelopment) {
      return this.createEmptyResult();
    }
    
    const result: OverlapDetectionResult = {
      hasDuplicates: false,
      duplicateContainers: [],
      positionOverlaps: [],
      warnings: [],
      recommendations: []
    };
    
    // 1. コンテナ名の重複検出
    this.detectNameDuplicates(wordContainer, result);
    
    // 2. 位置の重複検出
    this.detectPositionOverlaps(wordContainer, result);
    
    // 3. 警告とレコメンデーション生成
    this.generateWarningsAndRecommendations(result);
    
    // 4. ログ出力
    if (this.config.verboseLogging) {
      this.logResults(result);
    }
    
    // 5. 例外スロー（設定に応じて）
    if (result.hasDuplicates && this.config.throwOnDuplicate) {
      this.throwDuplicateError(result);
    }
    
    return result;
  }
  
  /**
   * コンテナ名の重複検出
   */
  private detectNameDuplicates(
    wordContainer: PIXI.Container,
    result: OverlapDetectionResult
  ): void {
    const containerNames = new Map<string, number>();
    
    wordContainer.children.forEach(child => {
      if (child instanceof PIXI.Container && (child as any).name) {
        const name = (child as any).name;
        const count = containerNames.get(name) || 0;
        containerNames.set(name, count + 1);
      }
    });
    
    containerNames.forEach((count, name) => {
      if (count > 1) {
        result.hasDuplicates = true;
        result.duplicateContainers.push(name);
      }
    });
  }
  
  /**
   * 位置の重複検出
   */
  private detectPositionOverlaps(
    wordContainer: PIXI.Container,
    result: OverlapDetectionResult
  ): void {
    const containers = wordContainer.children.filter(child =>
      child instanceof PIXI.Container && (child as any).name
    ) as PIXI.Container[];
    
    for (let i = 0; i < containers.length; i++) {
      for (let j = i + 1; j < containers.length; j++) {
        const container1 = containers[i];
        const container2 = containers[j];
        
        const pos1 = container1.position;
        const pos2 = container2.position;
        
        const distance = Math.sqrt(
          Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
        );
        
        if (distance < this.config.positionTolerance) {
          result.positionOverlaps.push({
            container1: (container1 as any).name,
            container2: (container2 as any).name,
            position: { x: pos1.x, y: pos1.y }
          });
        }
      }
    }
  }
  
  /**
   * 警告とレコメンデーション生成
   */
  private generateWarningsAndRecommendations(result: OverlapDetectionResult): void {
    if (result.duplicateContainers.length > 0) {
      result.warnings.push(
        `重複コンテナ名: ${result.duplicateContainers.join(', ')}`
      );
      result.recommendations.push(
        '文字コンテナの作成方法を見直してください。' +
        'プリミティブと既存システムの両方でコンテナを作成している可能性があります。'
      );
      result.recommendations.push(
        'SafeCharacterManager の使用を検討してください。'
      );
    }
    
    if (result.positionOverlaps.length > 0) {
      result.warnings.push(
        `位置重複: ${result.positionOverlaps.length} 箇所`
      );
      result.recommendations.push(
        '文字のレイアウト計算に問題がある可能性があります。' +
        '累積オフセット計算を確認してください。'
      );
    }
    
    // 特定パターンの検出
    const charContainerNames = result.duplicateContainers.filter(name =>
      name.includes('char_container_') || name.includes('char_')
    );
    
    if (charContainerNames.length > 0) {
      result.recommendations.push(
        '文字コンテナの重複検出: WordSlideTextLLM の修正パターンを参照してください。' +
        'docs/character-overlap-prevention-guide.md'
      );
    }
  }
  
  /**
   * 結果のログ出力
   */
  private logResults(result: OverlapDetectionResult): void {
    if (!result.hasDuplicates && result.positionOverlaps.length === 0) {
      console.log('✅ [CharacterOverlapDetector] 重複検出なし');
      return;
    }
    
    console.group('🚨 [CharacterOverlapDetector] 重複検出結果');
    
    if (result.duplicateContainers.length > 0) {
      console.error('重複コンテナ:', result.duplicateContainers);
    }
    
    if (result.positionOverlaps.length > 0) {
      console.warn('位置重複:');
      result.positionOverlaps.forEach(overlap => {
        console.warn(`  ${overlap.container1} ↔ ${overlap.container2} at (${overlap.position.x}, ${overlap.position.y})`);
      });
    }
    
    if (result.warnings.length > 0) {
      console.warn('警告:');
      result.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    if (result.recommendations.length > 0) {
      console.info('推奨対策:');
      result.recommendations.forEach(rec => console.info(`  💡 ${rec}`));
    }
    
    console.groupEnd();
  }
  
  /**
   * 重複エラーのスロー
   */
  private throwDuplicateError(result: OverlapDetectionResult): void {
    const errorMessage = [
      '文字コンテナの重複が検出されました:',
      `- 重複コンテナ: ${result.duplicateContainers.join(', ')}`,
      `- 位置重複: ${result.positionOverlaps.length} 箇所`,
      '',
      '修正方法:',
      ...result.recommendations.map(rec => `  - ${rec}`)
    ].join('\n');
    
    throw new Error(errorMessage);
  }
  
  /**
   * 空の結果作成
   */
  private createEmptyResult(): OverlapDetectionResult {
    return {
      hasDuplicates: false,
      duplicateContainers: [],
      positionOverlaps: [],
      warnings: [],
      recommendations: []
    };
  }
  
  /**
   * 静的メソッド: 簡易検出
   */
  static quickCheck(
    wordContainer: PIXI.Container,
    throwOnError: boolean = true
  ): boolean {
    const detector = new CharacterOverlapDetector({
      throwOnDuplicate: throwOnError,
      verboseLogging: false
    });
    
    const result = detector.detectDuplicates(wordContainer);
    return !result.hasDuplicates;
  }
  
  /**
   * 静的メソッド: 開発時自動チェック
   */
  static autoCheck(wordContainer: PIXI.Container): void {
    if (process.env.NODE_ENV !== 'development') return;
    
    const detector = new CharacterOverlapDetector({
      throwOnDuplicate: true,
      verboseLogging: true
    });
    
    detector.detectDuplicates(wordContainer);
  }
  
  /**
   * パフォーマンス測定付きチェック
   */
  detectWithPerformance(wordContainer: PIXI.Container): {
    result: OverlapDetectionResult;
    performanceMs: number;
  } {
    const startTime = performance.now();
    const result = this.detectDuplicates(wordContainer);
    const performanceMs = performance.now() - startTime;
    
    if (this.config.verboseLogging) {
      console.log(`[CharacterOverlapDetector] 検出時間: ${performanceMs.toFixed(2)}ms`);
    }
    
    return { result, performanceMs };
  }
}