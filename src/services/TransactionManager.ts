/**
 * トランザクション管理システム
 * 
 * データ復元プロセスでの原子性を保証し、
 * 部分的失敗時のロールバック機能を提供
 */

import { AppError, RestoreError, handleError } from '../types/error-handling';

/**
 * トランザクション状態
 */
export enum TransactionState {
  /** 未開始 */
  IDLE = 'idle',
  /** 実行中 */
  RUNNING = 'running',
  /** コミット中 */
  COMMITTING = 'committing',
  /** ロールバック中 */
  ROLLING_BACK = 'rolling_back',
  /** 完了 */
  COMPLETED = 'completed',
  /** 失敗 */
  FAILED = 'failed'
}

/**
 * トランザクション操作のインターフェース
 */
export interface TransactionOperation {
  /** 操作名 */
  name: string;
  /** 実行関数 */
  execute: () => Promise<void>;
  /** ロールバック関数 */
  rollback: () => Promise<void>;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
}

/**
 * トランザクション設定
 */
export interface TransactionConfig {
  /** トランザクション名 */
  name: string;
  /** グローバルタイムアウト（ミリ秒） */
  timeout?: number;
  /** 進捗コールバック */
  onProgress?: (progress: TransactionProgress) => void;
  /** エラーコールバック */
  onError?: (error: AppError) => void;
}

/**
 * トランザクション進捗情報
 */
export interface TransactionProgress {
  /** トランザクション名 */
  transactionName: string;
  /** 現在の操作名 */
  currentOperation: string;
  /** 完了した操作数 */
  completedOperations: number;
  /** 総操作数 */
  totalOperations: number;
  /** 進捗割合（0-1） */
  progress: number;
  /** 現在の状態 */
  state: TransactionState;
  /** 開始時刻 */
  startTime: Date;
  /** 経過時間（ミリ秒） */
  elapsedTime: number;
}

/**
 * トランザクション管理クラス
 */
export class TransactionManager {
  private state: TransactionState = TransactionState.IDLE;
  private operations: TransactionOperation[] = [];
  private executedOperations: TransactionOperation[] = [];
  private config: TransactionConfig;
  private startTime?: Date;

  constructor(config: TransactionConfig) {
    this.config = config;
  }

  /**
   * 操作を追加
   */
  addOperation(operation: TransactionOperation): void {
    if (this.state !== TransactionState.IDLE) {
      throw new RestoreError(
        'Cannot add operations to active transaction',
        'ADD_OPERATION',
        { currentState: this.state }
      );
    }

    this.operations.push(operation);
  }

  /**
   * 複数の操作を一括追加
   */
  addOperations(operations: TransactionOperation[]): void {
    operations.forEach(op => this.addOperation(op));
  }

  /**
   * トランザクション実行
   */
  async execute(): Promise<void> {
    if (this.state !== TransactionState.IDLE) {
      throw new RestoreError(
        'Transaction is already running or completed',
        'EXECUTE_TRANSACTION',
        { currentState: this.state }
      );
    }

    if (this.operations.length === 0) {
      throw new RestoreError(
        'No operations to execute',
        'EXECUTE_TRANSACTION'
      );
    }

    this.state = TransactionState.RUNNING;
    this.startTime = new Date();
    this.executedOperations = [];

    try {
      // 操作の順次実行
      for (let i = 0; i < this.operations.length; i++) {
        const operation = this.operations[i];
        
        // 進捗レポート
        this.reportProgress(operation.name, i);

        // タイムアウト設定
        const timeout = operation.timeout || this.config.timeout || 30000;
        
        try {
          await this.executeWithTimeout(operation.execute, timeout);
          this.executedOperations.push(operation);
        } catch (error) {
          // 操作失敗時の処理
          const appError = handleError(error, {
            operation: operation.name,
            transactionName: this.config.name,
            completedOperations: this.executedOperations.length
          });

          this.state = TransactionState.FAILED;
          
          // ロールバック実行
          await this.rollback();
          
          throw new RestoreError(
            `Transaction failed during operation: ${operation.name}`,
            'EXECUTE_OPERATION',
            { 
              originalError: appError,
              failedOperation: operation.name,
              completedOperations: this.executedOperations.length
            }
          );
        }
      }

      // 全操作完了 - コミット
      await this.commit();

    } catch (error) {
      this.state = TransactionState.FAILED;
      throw error;
    }
  }

  /**
   * トランザクションコミット
   */
  private async commit(): Promise<void> {
    this.state = TransactionState.COMMITTING;
    
    try {
      // コミット処理（現在は状態変更のみ）
      this.state = TransactionState.COMPLETED;
      
      // 最終進捗レポート
      this.reportProgress('Transaction completed', this.operations.length);
      
    } catch (error) {
      this.state = TransactionState.FAILED;
      throw new RestoreError(
        'Failed to commit transaction',
        'COMMIT_TRANSACTION',
        { originalError: error }
      );
    }
  }

  /**
   * トランザクションロールバック
   */
  private async rollback(): Promise<void> {
    this.state = TransactionState.ROLLING_BACK;

    const rollbackErrors: AppError[] = [];

    // 実行済み操作を逆順でロールバック
    for (let i = this.executedOperations.length - 1; i >= 0; i--) {
      const operation = this.executedOperations[i];
      
      try {
        await operation.rollback();
      } catch (error) {
        const rollbackError = handleError(error, {
          operation: operation.name,
          phase: 'rollback'
        });
        rollbackErrors.push(rollbackError);
      }
    }

    this.state = TransactionState.FAILED;

    // ロールバックエラーがある場合は警告
    if (rollbackErrors.length > 0) {
      console.warn('Rollback errors occurred:', rollbackErrors);
    }
  }

  /**
   * タイムアウト付き実行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RestoreError(
          `Operation timed out after ${timeoutMs}ms`,
          'OPERATION_TIMEOUT'
        ));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 進捗レポート
   */
  private reportProgress(currentOperation: string, completedCount: number): void {
    if (!this.config.onProgress || !this.startTime) return;

    const now = new Date();
    const progress: TransactionProgress = {
      transactionName: this.config.name,
      currentOperation,
      completedOperations: completedCount,
      totalOperations: this.operations.length,
      progress: completedCount / this.operations.length,
      state: this.state,
      startTime: this.startTime,
      elapsedTime: now.getTime() - this.startTime.getTime()
    };

    this.config.onProgress(progress);
  }

  /**
   * 現在の状態を取得
   */
  getState(): TransactionState {
    return this.state;
  }

  /**
   * 進捗情報を取得
   */
  getProgress(): TransactionProgress | null {
    if (!this.startTime) return null;

    const now = new Date();
    return {
      transactionName: this.config.name,
      currentOperation: this.executedOperations.length < this.operations.length 
        ? this.operations[this.executedOperations.length].name 
        : 'Completed',
      completedOperations: this.executedOperations.length,
      totalOperations: this.operations.length,
      progress: this.executedOperations.length / this.operations.length,
      state: this.state,
      startTime: this.startTime,
      elapsedTime: now.getTime() - this.startTime.getTime()
    };
  }

  /**
   * トランザクションリセット
   */
  reset(): void {
    if (this.state === TransactionState.RUNNING || 
        this.state === TransactionState.COMMITTING || 
        this.state === TransactionState.ROLLING_BACK) {
      throw new RestoreError(
        'Cannot reset active transaction',
        'RESET_TRANSACTION',
        { currentState: this.state }
      );
    }

    this.state = TransactionState.IDLE;
    this.operations = [];
    this.executedOperations = [];
    this.startTime = undefined;
  }
}

/**
 * トランザクションビルダー
 */
export class TransactionBuilder {
  private operations: TransactionOperation[] = [];
  private config: Partial<TransactionConfig> = {};

  /**
   * トランザクション名を設定
   */
  name(name: string): TransactionBuilder {
    this.config.name = name;
    return this;
  }

  /**
   * タイムアウトを設定
   */
  timeout(timeoutMs: number): TransactionBuilder {
    this.config.timeout = timeoutMs;
    return this;
  }

  /**
   * 進捗コールバックを設定
   */
  onProgress(callback: (progress: TransactionProgress) => void): TransactionBuilder {
    this.config.onProgress = callback;
    return this;
  }

  /**
   * エラーコールバックを設定
   */
  onError(callback: (error: AppError) => void): TransactionBuilder {
    this.config.onError = callback;
    return this;
  }

  /**
   * 操作を追加
   */
  addOperation(
    name: string,
    execute: () => Promise<void>,
    rollback: () => Promise<void>,
    timeout?: number
  ): TransactionBuilder {
    this.operations.push({ name, execute, rollback, timeout });
    return this;
  }

  /**
   * トランザクションを構築
   */
  build(): TransactionManager {
    if (!this.config.name) {
      throw new RestoreError(
        'Transaction name is required',
        'BUILD_TRANSACTION'
      );
    }

    const manager = new TransactionManager(this.config as TransactionConfig);
    manager.addOperations(this.operations);
    return manager;
  }
}