/**
 * 安全な文字管理システム
 * 文字重複表示不具合を防止する統合インターフェイス
 */

import * as PIXI from 'pixi.js';
import { CumulativeLayoutPrimitive } from '../layout/CumulativeLayoutPrimitive';
import { LayoutResult } from '../types';

/**
 * 文字管理モード
 */
export enum CharacterManagementMode {
  /** プリミティブが自動管理（新規テンプレート用） */
  PRIMITIVE_MANAGED = 'primitive_managed',
  
  /** 既存システムとの協調（LLM版・移行期用） */
  COOPERATIVE = 'cooperative',
  
  /** 完全にマニュアル管理（オリジナル互換） */
  MANUAL = 'manual'
}

/**
 * 文字データ定義
 */
export interface CharacterData {
  id: string;
  char: string;
  charIndex: number;
  totalChars: number;
  start: number;
  end: number;
}

/**
 * 安全な文字管理設定
 */
export interface SafeCharacterConfig {
  mode: CharacterManagementMode;
  containerPrefix: string;
  layoutParams: {
    fontSize: number;
    charSpacing: number;
    halfWidthSpacingRatio: number;
    alignment: 'left' | 'center' | 'right';
  };
  /** 既存コンテナ検索時の安全性チェック */
  enableSafetyChecks: boolean;
  /** 開発時の詳細ログ */
  enableDebugLogs: boolean;
}

/**
 * 文字管理結果
 */
export interface CharacterManagementResult {
  success: boolean;
  containersManaged: number;
  duplicatesDetected: number;
  warnings: string[];
  debugInfo?: Record<string, unknown>;
}

/**
 * 安全な文字管理システム
 * 重複表示を防止し、プリミティブと既存システムの協調を管理
 */
export class SafeCharacterManager {
  private config: SafeCharacterConfig;
  private layoutPrimitive: CumulativeLayoutPrimitive;
  private managedContainers: Map<string, PIXI.Container> = new Map();
  
  constructor(config: SafeCharacterConfig) {
    this.config = config;
    this.layoutPrimitive = new CumulativeLayoutPrimitive();
  }
  
  /**
   * 文字コンテナの安全な管理
   * 重複作成を防止し、単一責任での管理を実現
   */
  manageCharacters(
    wordContainer: PIXI.Container,
    text: string,
    characters: CharacterData[],
    animationCallback?: (
      charContainer: PIXI.Container,
      charData: CharacterData,
      position: { x: number; y: number }
    ) => void
  ): CharacterManagementResult {
    const warnings: string[] = [];
    let duplicatesDetected = 0;
    
    try {
      // 1. 事前安全性チェック
      if (this.config.enableSafetyChecks) {
        const safetyResult = this.performSafetyChecks(wordContainer, characters);
        warnings.push(...safetyResult.warnings);
        duplicatesDetected = safetyResult.duplicatesFound;
      }
      
      // 2. レイアウト計算（プリミティブ使用）
      const layoutResults = this.calculateSafeLayout(text, characters);
      
      // 3. 文字コンテナの安全な管理
      const managementResult = this.manageSafeContainers(
        wordContainer,
        characters,
        layoutResults,
        animationCallback
      );
      
      // 4. 事後検証
      if (this.config.enableSafetyChecks) {
        this.validateResult(wordContainer, characters);
      }
      
      return {
        success: true,
        containersManaged: characters.length,
        duplicatesDetected,
        warnings,
        debugInfo: this.config.enableDebugLogs ? {
          mode: this.config.mode,
          layoutResults,
          managedContainerCount: this.managedContainers.size
        } : undefined
      };
      
    } catch (error) {
      return {
        success: false,
        containersManaged: 0,
        duplicatesDetected,
        warnings: [...warnings, `Error: ${error.message}`]
      };
    }
  }
  
  /**
   * 安全性事前チェック
   */
  private performSafetyChecks(
    wordContainer: PIXI.Container,
    characters: CharacterData[]
  ): { warnings: string[]; duplicatesFound: number } {
    const warnings: string[] = [];
    let duplicatesFound = 0;
    
    // 既存コンテナの重複チェック
    const existingNames = new Set<string>();
    const duplicateNames: string[] = [];
    
    wordContainer.children.forEach(child => {
      if (child instanceof PIXI.Container && (child as any).name) {
        const name = (child as any).name;
        if (existingNames.has(name)) {
          duplicateNames.push(name);
          duplicatesFound++;
        } else {
          existingNames.add(name);
        }
      }
    });
    
    if (duplicateNames.length > 0) {
      warnings.push(`重複コンテナ検出: ${duplicateNames.join(', ')}`);
    }
    
    // 文字データの整合性チェック
    const charIds = characters.map(char => char.id);
    const uniqueIds = new Set(charIds);
    
    if (charIds.length !== uniqueIds.size) {
      warnings.push('文字データにIDの重複があります');
    }
    
    // モード別チェック
    if (this.config.mode === CharacterManagementMode.COOPERATIVE) {
      const hasExistingContainers = wordContainer.children.some(child => 
        child instanceof PIXI.Container && 
        (child as any).name?.startsWith(this.config.containerPrefix)
      );
      
      if (!hasExistingContainers) {
        warnings.push('COOPERATIVE モードですが既存コンテナが見つかりません');
      }
    }
    
    return { warnings, duplicatesFound };
  }
  
  /**
   * レイアウト計算（プリミティブ使用）
   */
  private calculateSafeLayout(
    text: string,
    characters: CharacterData[]
  ): LayoutResult[] {
    const items = characters.map(char => ({
      id: char.id,
      content: char.char,
      size: { 
        width: this.config.layoutParams.fontSize * this.config.layoutParams.charSpacing,
        height: this.config.layoutParams.fontSize
      }
    }));
    
    const layoutParams = {
      spacing: this.config.layoutParams.charSpacing,
      alignment: this.config.layoutParams.alignment,
      containerSize: { width: 0, height: 0 },
      charSpacing: this.config.layoutParams.charSpacing,
      fontSize: this.config.layoutParams.fontSize,
      halfWidthSpacingRatio: this.config.layoutParams.halfWidthSpacingRatio
    };
    
    // ⚠️ 重要: calculateLayoutのみ使用（コンテナ作成はしない）
    return this.layoutPrimitive.calculateLayout(items, layoutParams);
  }
  
  /**
   * 文字コンテナの安全な管理
   */
  private manageSafeContainers(
    wordContainer: PIXI.Container,
    characters: CharacterData[],
    layoutResults: LayoutResult[],
    animationCallback?: (
      charContainer: PIXI.Container,
      charData: CharacterData,
      position: { x: number; y: number }
    ) => void
  ): void {
    characters.forEach((charData, index) => {
      const layoutResult = layoutResults[index];
      const containerName = `${this.config.containerPrefix}${charData.id}`;
      
      // 既存コンテナ検索（安全な検索）
      let charContainer = this.findExistingContainer(wordContainer, containerName);
      
      // 新規作成（必要時のみ）
      if (!charContainer) {
        charContainer = this.createSafeContainer(wordContainer, containerName);
      }
      
      // 位置設定
      charContainer.position.set(layoutResult.position.x, layoutResult.position.y);
      
      // 管理対象として記録
      this.managedContainers.set(charData.id, charContainer);
      
      // アニメーションコールバック実行
      if (animationCallback) {
        animationCallback(charContainer, charData, layoutResult.position);
      }
      
      // デバッグログ
      if (this.config.enableDebugLogs) {
        console.log(`[SafeCharacterManager] Managed "${charData.char}":`, {
          id: charData.id,
          containerName,
          position: layoutResult.position,
          mode: this.config.mode
        });
      }
    });
  }
  
  /**
   * 既存コンテナの安全な検索
   */
  private findExistingContainer(
    wordContainer: PIXI.Container,
    containerName: string
  ): PIXI.Container | null {
    for (const child of wordContainer.children) {
      if (child instanceof PIXI.Container && (child as any).name === containerName) {
        return child as PIXI.Container;
      }
    }
    return null;
  }
  
  /**
   * 安全なコンテナ作成
   */
  private createSafeContainer(
    wordContainer: PIXI.Container,
    containerName: string
  ): PIXI.Container {
    // 二重作成防止チェック
    const existing = this.findExistingContainer(wordContainer, containerName);
    if (existing) {
      if (this.config.enableDebugLogs) {
        console.warn(`[SafeCharacterManager] Container already exists: ${containerName}`);
      }
      return existing;
    }
    
    const container = new PIXI.Container();
    (container as any).name = containerName;
    wordContainer.addChild(container);
    
    if (this.config.enableDebugLogs) {
      console.log(`[SafeCharacterManager] Created container: ${containerName}`);
    }
    
    return container;
  }
  
  /**
   * 結果の検証
   */
  private validateResult(
    wordContainer: PIXI.Container,
    characters: CharacterData[]
  ): void {
    const expectedContainerCount = characters.length;
    const actualContainerCount = wordContainer.children.filter(child =>
      child instanceof PIXI.Container &&
      (child as any).name?.startsWith(this.config.containerPrefix)
    ).length;
    
    if (actualContainerCount > expectedContainerCount) {
      console.warn(
        `[SafeCharacterManager] コンテナ数が予想より多い: ` +
        `expected=${expectedContainerCount}, actual=${actualContainerCount}`
      );
    }
    
    // 位置重複チェック
    const positions = new Map<string, { x: number; y: number }>();
    wordContainer.children.forEach(child => {
      if (child instanceof PIXI.Container && (child as any).name?.startsWith(this.config.containerPrefix)) {
        const pos = { x: child.position.x, y: child.position.y };
        const posKey = `${pos.x.toFixed(1)},${pos.y.toFixed(1)}`;
        
        if (positions.has(posKey)) {
          console.warn(`[SafeCharacterManager] 位置重複検出: ${posKey}`);
        } else {
          positions.set(posKey, pos);
        }
      }
    });
  }
  
  /**
   * 管理状態のクリア
   */
  clearManagedContainers(): void {
    this.managedContainers.clear();
  }
  
  /**
   * 管理されているコンテナの取得
   */
  getManagedContainers(): ReadonlyMap<string, PIXI.Container> {
    return this.managedContainers;
  }
  
  /**
   * デバッグ情報の取得
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      mode: this.config.mode,
      managedContainerCount: this.managedContainers.size,
      containerPrefix: this.config.containerPrefix,
      layoutParams: this.config.layoutParams,
      safetyChecksEnabled: this.config.enableSafetyChecks
    };
  }
}