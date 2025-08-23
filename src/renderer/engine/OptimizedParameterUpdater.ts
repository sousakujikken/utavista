import { StandardParameters } from '../types/types';

/**
 * パラメータ更新の最適化を管理するクラス
 * 表示範囲内は同期的に、範囲外は非同期的に更新します
 */
export class OptimizedParameterUpdater {
  private updateQueue: Map<string, UpdateTask> = new Map();
  private isProcessing = false;
  private currentTimeMs = 0;
  private viewportBufferMs = 2000; // ビューポートの前後バッファ（ミリ秒）
  private rafId: number | null = null;
  private abortController: AbortController | null = null;

  /**
   * 現在の時間を更新
   */
  public setCurrentTime(timeMs: number): void {
    this.currentTimeMs = timeMs;
  }

  /**
   * ビューポートバッファを設定
   */
  public setViewportBuffer(bufferMs: number): void {
    this.viewportBufferMs = bufferMs;
  }

  /**
   * フレーズが現在表示範囲内にあるかチェック
   */
  private isInViewport(startMs: number, endMs: number): boolean {
    // 現在時刻が0の場合は、最初の数秒間のフレーズのみを表示範囲とする
    if (this.currentTimeMs === 0) {
      return startMs <= 5000; // 最初の5秒間のみ
    }
    
    const viewportStart = this.currentTimeMs - this.viewportBufferMs;
    const viewportEnd = this.currentTimeMs + this.viewportBufferMs;
    
    // フレーズが表示範囲と重なっているかチェック
    return !(endMs < viewportStart || startMs > viewportEnd);
  }

  /**
   * グローバルパラメータの最適化更新
   */
  public async updateGlobalParametersOptimized(
    phrases: Array<{ id: string; startMs: number; endMs: number }>,
    params: Partial<StandardParameters>,
    callbacks: {
      updatePhrase: (phraseId: string, params: Partial<StandardParameters>) => void;
      onSyncComplete?: (visiblePhraseIds: string[]) => void;
      onBatchComplete?: (phraseIds: string[]) => void;
      onAllComplete?: () => void;
    }
  ): Promise<void> {
    // 前回の更新をキャンセル
    this.cancelPendingUpdates();

    // フレーズを表示範囲内外で分類
    const visiblePhrases: typeof phrases = [];
    const hiddenPhrases: typeof phrases = [];

    for (const phrase of phrases) {
      if (this.isInViewport(phrase.startMs, phrase.endMs)) {
        visiblePhrases.push(phrase);
      } else {
        hiddenPhrases.push(phrase);
      }
    }

    console.log(`OptimizedParameterUpdater: 表示範囲内: ${visiblePhrases.length}個, 範囲外: ${hiddenPhrases.length}個`);
    console.log(`OptimizedParameterUpdater: 現在時刻: ${this.currentTimeMs}ms, バッファ: ${this.viewportBufferMs}ms`);
    
    // デバッグ: 最初の数個のフレーズの時間範囲を表示
    if (phrases.length > 0) {
      const samplePhrases = phrases.slice(0, 3).map(p => `${p.id}: ${p.startMs}-${p.endMs}ms`);
      console.log(`OptimizedParameterUpdater: サンプルフレーズ時間:`, samplePhrases);
    }

    // Step 1: 表示範囲内のフレーズを同期的に更新
    console.log(`OptimizedParameterUpdater: 表示範囲内フレーズを更新:`, visiblePhrases.map(p => p.id));
    for (const phrase of visiblePhrases) {
      callbacks.updatePhrase(phrase.id, params);
    }

    // 同期更新完了を通知（表示範囲内のフレーズIDを渡す）
    console.log(`OptimizedParameterUpdater: 同期更新完了`);
    if (callbacks.onSyncComplete) {
      callbacks.onSyncComplete(visiblePhrases.map(p => p.id));
    }

    // Step 2: 表示範囲外のフレーズを非同期で更新
    if (hiddenPhrases.length > 0) {
      console.log(`OptimizedParameterUpdater: 非同期更新開始:`, hiddenPhrases.map(p => p.id));
      this.scheduleAsyncUpdates(hiddenPhrases, params, {
        updatePhrase: callbacks.updatePhrase,
        onBatchComplete: callbacks.onBatchComplete,
        onAllComplete: callbacks.onAllComplete
      });
    } else {
      console.log(`OptimizedParameterUpdater: 非表示フレーズなし、全完了`);
      if (callbacks.onAllComplete) {
        callbacks.onAllComplete();
      }
    }
  }

  /**
   * 非同期更新をスケジュール
   */
  private scheduleAsyncUpdates(
    phrases: Array<{ id: string; startMs: number; endMs: number }>,
    params: Partial<StandardParameters>,
    callbacks: {
      updatePhrase: (phraseId: string, params: Partial<StandardParameters>) => void;
      onBatchComplete?: (phraseIds: string[]) => void;
      onAllComplete?: () => void;
    }
  ): void {
    // 現在時刻からの距離でソート（近い順）
    const sortedPhrases = [...phrases].sort((a, b) => {
      const distA = Math.min(
        Math.abs(a.startMs - this.currentTimeMs),
        Math.abs(a.endMs - this.currentTimeMs)
      );
      const distB = Math.min(
        Math.abs(b.startMs - this.currentTimeMs),
        Math.abs(b.endMs - this.currentTimeMs)
      );
      return distA - distB;
    });

    // 更新タスクをキューに追加
    sortedPhrases.forEach((phrase, index) => {
      this.updateQueue.set(phrase.id, {
        phraseId: phrase.id,
        params,
        priority: index,
        callback: callbacks.updatePhrase
      });
    });

    // 非同期処理を開始
    this.processUpdateQueue(callbacks, callbacks.onAllComplete);
  }

  /**
   * 更新キューを処理
   */
  private processUpdateQueue(
    callbacks: {
      onBatchComplete?: (phraseIds: string[]) => void;
    },
    onComplete?: () => void
  ): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.abortController = new AbortController();
    
    const batchSize = 5; // 一度に処理するフレーズ数
    let processedCount = 0;

    const processBatch = () => {
      // キャンセルされた場合は終了
      if (this.abortController?.signal.aborted) {
        this.isProcessing = false;
        return;
      }

      const batch: UpdateTask[] = [];
      const iterator = this.updateQueue.entries();
      
      // バッチサイズ分のタスクを取得
      for (let i = 0; i < batchSize; i++) {
        const result = iterator.next();
        if (result.done) break;
        
        const [phraseId, task] = result.value;
        batch.push(task);
        this.updateQueue.delete(phraseId);
      }

      // バッチを処理
      if (batch.length > 0) {
        const batchPhraseIds: string[] = [];
        for (const task of batch) {
          task.callback(task.phraseId, task.params);
          batchPhraseIds.push(task.phraseId);
          processedCount++;
        }
        
        // バッチ完了コールバックを呼び出す
        console.log(`OptimizedParameterUpdater: バッチ完了:`, batchPhraseIds);
        if (callbacks.onBatchComplete) {
          callbacks.onBatchComplete(batchPhraseIds);
        }

        // 次のバッチをスケジュール（requestIdleCallbackまたはsetTimeout）
        if (this.updateQueue.size > 0) {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(
              () => processBatch(),
              { timeout: 100 } // 最大100ms待機
            );
          } else {
            setTimeout(() => processBatch(), 16); // 約60fps
          }
        } else {
          // すべて完了
          this.isProcessing = false;
          console.log(`OptimizedParameterUpdater: すべての非同期更新完了 (${processedCount}個のフレーズ)`);
          if (onComplete) {
            onComplete();
          }
        }
      } else {
        this.isProcessing = false;
        if (onComplete) {
          onComplete();
        }
      }
    };

    // 最初のバッチを処理
    this.rafId = requestAnimationFrame(() => processBatch());
  }

  /**
   * 保留中の更新をキャンセル
   */
  public cancelPendingUpdates(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    this.updateQueue.clear();
    this.isProcessing = false;
  }

  /**
   * 特定のフレーズの更新優先度を上げる
   */
  public prioritizePhrase(phraseId: string): void {
    const task = this.updateQueue.get(phraseId);
    if (task) {
      task.priority = -1; // 最高優先度
      // キューを優先度順に再ソート
      const entries = Array.from(this.updateQueue.entries());
      entries.sort((a, b) => a[1].priority - b[1].priority);
      this.updateQueue = new Map(entries);
    }
  }

  /**
   * クリーンアップ
   */
  public dispose(): void {
    this.cancelPendingUpdates();
  }
}

interface UpdateTask {
  phraseId: string;
  params: Partial<StandardParameters>;
  priority: number;
  callback: (phraseId: string, params: Partial<StandardParameters>) => void;
}