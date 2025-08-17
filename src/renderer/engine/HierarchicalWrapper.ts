/**
 * HierarchicalWrapper - 既存システムとの非破壊的統合層
 * 既存のAnimationInstanceを拡張せず、ラッパーパターンで階層システムを統合
 * 
 * 参照: development-directive-final.md#2.1, existing-system-integration-design.md#2.2
 */

import AnimationInstance from './AnimationInstance';
import { CoreSynchronizationEngine, SyncResult } from './CoreSynchronizationEngine';
import { SimplePrecisionTimeManager } from './SimplePrecisionTimeManager';

export interface HierarchicalData {
  originalInstance: AnimationInstance;
  hierarchicalEnabled: boolean;
  lastSyncResult?: SyncResult;
  fallbackCount: number;
  errorHistory: string[];
}

export interface IntegrationConfig {
  enableHierarchical: boolean;
  fallbackOnError: boolean;
  maxErrorCount: number;
  debugMode: boolean;
}

/**
 * 既存システムとの互換性を100%維持しながら階層システムを統合
 */
export class HierarchicalWrapper {
  private originalInstance: AnimationInstance;
  private hierarchicalEngine: CoreSynchronizationEngine;
  private timeManager: SimplePrecisionTimeManager;
  private data: HierarchicalData;
  private config: IntegrationConfig;
  
  // 既存メソッドの保存（非破壊的統合）
  private originalUpdate: (nowMs: number) => boolean | void;
  private originalMethods: Map<string, Function> = new Map();
  
  constructor(
    instance: AnimationInstance,
    audioElement?: HTMLAudioElement,
    config: Partial<IntegrationConfig> = {}
  ) {
    this.originalInstance = instance;
    
    // 設定の初期化
    this.config = {
      enableHierarchical: true,
      fallbackOnError: true,
      maxErrorCount: 3,
      debugMode: false,
      ...config
    };
    
    // 時間管理システムの初期化
    this.timeManager = new SimplePrecisionTimeManager(audioElement);
    
    // 核心エンジンの初期化
    this.hierarchicalEngine = new CoreSynchronizationEngine(this.timeManager);
    
    // データ構造の初期化
    this.data = {
      originalInstance: instance,
      hierarchicalEnabled: this.config.enableHierarchical,
      fallbackCount: 0,
      errorHistory: []
    };
    
    // 既存メソッドの保存
    this.preserveOriginalMethods();
    
    // 統合層の有効化
    if (this.config.enableHierarchical) {
      this.enableHierarchicalIntegration();
    }
  }
  
  /**
   * 既存メソッドの保存（非破壊的統合の核心）
   * existing-system-integration-design.md#2.2参照
   */
  private preserveOriginalMethods(): void {
    // updateメソッドの保存
    this.originalUpdate = this.originalInstance.update.bind(this.originalInstance);
    this.originalMethods.set('update', this.originalUpdate);
    
    // その他の重要メソッドも保存（必要に応じて拡張可能）
    const methodNames = ['update'];
    methodNames.forEach(methodName => {
      if (this.originalInstance[methodName as keyof AnimationInstance]) {
        this.originalMethods.set(
          methodName,
          (this.originalInstance[methodName as keyof AnimationInstance] as Function).bind(this.originalInstance)
        );
      }
    });
  }
  
  /**
   * 階層統合の有効化
   */
  private enableHierarchicalIntegration(): void {
    // updateメソッドをオーバーライド
    this.originalInstance.update = (nowMs: number) => {
      return this.hybridUpdate(nowMs);
    };
  }
  
  /**
   * ハイブリッド更新メソッド
   * 階層システムを試行し、エラー時は既存システムにフォールバック
   */
  private hybridUpdate(nowMs: number): boolean | void {
    if (!this.data.hierarchicalEnabled) {
      return this.originalUpdate(nowMs);
    }
    
    try {
      // 階層システムで実行
      return this.executeHierarchical(nowMs);
      
    } catch (error) {
      console.warn(`[HierarchicalWrapper] Falling back to original system:`, error);
      
      // エラー履歴に記録
      this.data.errorHistory.push(`${new Date().toISOString()}: ${error}`);
      this.data.fallbackCount++;
      
      // 最大エラー数を超えた場合は階層システムを無効化
      if (this.data.fallbackCount >= this.config.maxErrorCount) {
        console.warn(`[HierarchicalWrapper] Disabling hierarchical system after ${this.config.maxErrorCount} errors`);
        this.data.hierarchicalEnabled = false;
      }
      
      // 既存システムで実行
      return this.originalUpdate(nowMs);
    }
  }
  
  /**
   * 階層システムでの実行
   */
  private async executeHierarchical(nowMs: number): Promise<boolean | void> {
    // 階層エンジンで実行
    const syncResult = await this.hierarchicalEngine.executeWithMusicSync(
      this.originalInstance,
      nowMs
    );
    
    // 結果を保存
    this.data.lastSyncResult = syncResult;
    
    // デバッグモードでの情報出力
    if (this.config.debugMode) {
      this.logDebugInfo(syncResult);
    }
    
    return syncResult.success;
  }
  
  /**
   * 音声要素の更新
   */
  setAudioElement(audioElement: HTMLAudioElement): void {
    this.timeManager.setAudioElement(audioElement);
  }
  
  /**
   * 階層システムの有効/無効切り替え
   */
  setHierarchicalEnabled(enabled: boolean): void {
    this.data.hierarchicalEnabled = enabled;
    
    if (!enabled) {
      // 無効化時は既存システムに完全復帰
      this.originalInstance.update = this.originalUpdate;
    } else {
      // 有効化時は統合層を再度有効化
      this.enableHierarchicalIntegration();
    }
  }
  
  /**
   * 統計情報取得
   */
  getStats(): Record<string, any> {
    return {
      hierarchicalEnabled: this.data.hierarchicalEnabled,
      fallbackCount: this.data.fallbackCount,
      errorCount: this.data.errorHistory.length,
      lastSyncResult: this.data.lastSyncResult,
      timeManagerStats: this.timeManager.getDebugInfo(),
      originalInstance: {
        id: this.originalInstance.id,
        isActive: this.originalInstance.isActive,
        hierarchyType: this.originalInstance.hierarchyType
      }
    };
  }
  
  /**
   * 既存システムへの完全復帰
   * 統合層を完全に除去し、元の状態に戻す
   */
  restoreOriginal(): void {
    // 全ての既存メソッドを復元
    this.originalMethods.forEach((method, methodName) => {
      (this.originalInstance as any)[methodName] = method;
    });
    
    // データのリセット
    this.data.hierarchicalEnabled = false;
    this.data.fallbackCount = 0;
    this.data.errorHistory = [];
    
    console.log(`[HierarchicalWrapper] Restored original system for instance: ${this.originalInstance.id}`);
  }
  
  /**
   * デバッグ情報のログ出力
   */
  private logDebugInfo(syncResult: SyncResult): void {
    const stats = this.getStats();
    console.log(`[HierarchicalWrapper Debug] Instance: ${this.originalInstance.id}`, {
      syncAccuracy: `${(syncResult.syncAccuracy.accuracyRate * 100).toFixed(1)}%`,
      frameRate: `${syncResult.frameRate.toFixed(1)}FPS`,
      hierarchicalEnabled: stats.hierarchicalEnabled,
      fallbackCount: stats.fallbackCount
    });
  }
  
  /**
   * エラー履歴のクリア
   */
  clearErrorHistory(): void {
    this.data.errorHistory = [];
    this.data.fallbackCount = 0;
  }
  
  /**
   * 設定の更新
   */
  updateConfig(newConfig: Partial<IntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}