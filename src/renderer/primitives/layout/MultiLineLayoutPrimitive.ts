/**
 * MultiLineLayoutPrimitive
 * フレーズの多行配置を管理する再利用可能なプリミティブ
 * 時間的に重複するフレーズを異なる行に配置し、視覚的な重複を回避
 * 
 * @version 1.0.0
 * @since 2025-01-27
 */

export interface LineAssignment {
  phraseId: string;
  lineIndex: number;
  startMs: number;
  endMs: number;
  assignedAt: number; // タイムスタンプ
}

export interface MultiLinePhraseParams {
  phraseId: string;
  startMs: number;
  endMs: number;
  nowMs: number;
  maxLines: number;
  lineSpacing: number;
  overlapThreshold: number;
  fontSize: number;
  baseY?: number;
  baseX?: number;
  resetInterval?: number;
  textDirection?: 'horizontal' | 'vertical';
}

export interface MultiLineResult {
  lineIndex: number;
  yOffset: number;
  absoluteY: number;
  xOffset: number;
  absoluteX: number;
  totalLines: number;
  conflictingPhrases: string[];
}

/**
 * 多行レイアウト管理プリミティブ
 * Singletonパターンで実装し、全テンプレート間で状態を共有
 */
export class MultiLineLayoutPrimitive {
  private static instance: MultiLineLayoutPrimitive;
  private phraseLineAssignments = new Map<string, LineAssignment>();
  private lastResetTime = 0;
  private debugMode = true;
  
  /**
   * Singletonインスタンス取得
   */
  public static getInstance(): MultiLineLayoutPrimitive {
    if (!this.instance) {
      this.instance = new MultiLineLayoutPrimitive();
      console.log('[MultiLineLayoutPrimitive] Instance created');
    }
    return this.instance;
  }
  
  private constructor() {
    // Private constructor for Singleton
  }
  
  /**
   * フレーズの行位置を計算
   * 時間的重複を検出し、利用可能な行に割り当て
   */
  public calculatePhrasePosition(params: MultiLinePhraseParams): MultiLineResult {
    const {
      phraseId,
      startMs,
      endMs,
      nowMs,
      maxLines,
      lineSpacing,
      overlapThreshold,
      fontSize,
      baseY = 0,
      baseX = 0,
      resetInterval = 0,
      textDirection = 'horizontal'
    } = params;
    
    // 不要なログを抑制
    
    // リセット間隔が設定されている場合の自動リセット
    if (resetInterval > 0 && (nowMs - this.lastResetTime) > resetInterval) {
      this.resetAllAssignments();
      this.lastResetTime = nowMs;
    }
    
    // 期限切れの割り当てをクリーンアップ
    this.cleanupExpiredAssignments(nowMs, overlapThreshold);
    
    // 既存の割り当てがあるかチェック
    const existingAssignment = this.phraseLineAssignments.get(phraseId);
    if (existingAssignment) {
      return this.createResult(existingAssignment.lineIndex, lineSpacing, fontSize, baseY, maxLines, baseX, textDirection);
    }
    
    // 新規割り当て：競合するフレーズを特定
    const conflictingPhrases = this.findConflictingPhrases(startMs, endMs, overlapThreshold);
    
    // 利用可能な行を検索
    const lineIndex = this.findAvailableLine(conflictingPhrases, maxLines);
    
    // 割り当てを記録
    const assignment: LineAssignment = {
      phraseId,
      lineIndex,
      startMs,
      endMs,
      assignedAt: Date.now()
    };
    this.phraseLineAssignments.set(phraseId, assignment);
    
    // if (this.debugMode) {
    //   console.log(`[MultiLineLayoutPrimitive] Assigned phrase "${phraseId}" to line ${lineIndex}`);
    //   console.log(`[MultiLineLayoutPrimitive] Active assignments: ${this.phraseLineAssignments.size}`);
    //   console.log(`[MultiLineLayoutPrimitive] Conflicting phrases: ${conflictingPhrases.map(p => p.phraseId).join(', ')}`);
    // }
    
    const result = this.createResult(lineIndex, lineSpacing, fontSize, baseY, maxLines, baseX, textDirection);
    result.conflictingPhrases = conflictingPhrases.map(p => p.phraseId);
    return result;
  }
  
  /**
   * 競合するフレーズを検出
   * 時間的オーバーラップとしきい値を考慮
   */
  private findConflictingPhrases(startMs: number, endMs: number, threshold: number): LineAssignment[] {
    const conflicting: LineAssignment[] = [];
    
    this.phraseLineAssignments.forEach(assignment => {
      // 時間的オーバーラップの検出
      const hasOverlap = 
        // 新フレーズが既存フレーズ内に開始
        (startMs >= assignment.startMs && startMs <= assignment.endMs) ||
        // 既存フレーズが新フレーズ内に開始
        (assignment.startMs >= startMs && assignment.startMs <= endMs) ||
        // しきい値内での近接チェック
        (Math.abs(startMs - assignment.endMs) <= threshold) ||
        (Math.abs(assignment.startMs - endMs) <= threshold);
      
      if (hasOverlap) {
        conflicting.push(assignment);
      }
    });
    
    return conflicting;
  }
  
  /**
   * 利用可能な行を検索
   * 競合がない最小の行番号を返す
   */
  private findAvailableLine(conflictingPhrases: LineAssignment[], maxLines: number): number {
    // 使用中の行番号を収集
    const occupiedLines = new Set(conflictingPhrases.map(p => p.lineIndex));
    
    // 空いている最小の行を検索
    for (let line = 0; line < maxLines; line++) {
      if (!occupiedLines.has(line)) {
        return line;
      }
    }
    
    // 全行が占有されている場合：最も古い割り当ての行を再利用
    if (conflictingPhrases.length > 0) {
      const oldestPhrase = conflictingPhrases.reduce((oldest, current) => 
        current.assignedAt < oldest.assignedAt ? current : oldest
      );
      return oldestPhrase.lineIndex;
    }
    
    // デフォルトは行0
    return 0;
  }
  
  /**
   * 結果オブジェクトを生成
   */
  private createResult(
    lineIndex: number,
    lineSpacing: number,
    fontSize: number,
    baseY: number,
    maxLines: number,
    baseX: number = 0,
    textDirection: 'horizontal' | 'vertical' = 'horizontal'
  ): MultiLineResult {
    // 縦書きの場合はX方向にオフセット（左側へ）、横書きの場合はY方向にオフセット
    if (textDirection === 'vertical') {
      const xOffset = -lineIndex * lineSpacing * fontSize; // 負の値で左側にオフセット
      const absoluteX = baseX + xOffset;
      
      return {
        lineIndex,
        yOffset: 0,
        absoluteY: baseY,
        xOffset,
        absoluteX,
        totalLines: maxLines,
        conflictingPhrases: []
      };
    } else {
      const yOffset = lineIndex * lineSpacing * fontSize;
      const absoluteY = baseY + yOffset;
      
      return {
        lineIndex,
        yOffset,
        absoluteY,
        xOffset: 0,
        absoluteX: baseX,
        totalLines: maxLines,
        conflictingPhrases: []
      };
    }
  }
  
  /**
   * 期限切れの割り当てをクリーンアップ
   */
  private cleanupExpiredAssignments(nowMs: number, threshold: number): void {
    const toDelete: string[] = [];
    
    this.phraseLineAssignments.forEach((assignment, phraseId) => {
      // 終了時刻からしきい値以上経過した割り当てを削除
      if (nowMs > assignment.endMs + threshold) {
        toDelete.push(phraseId);
      }
    });
    
    toDelete.forEach(phraseId => {
      this.phraseLineAssignments.delete(phraseId);
      if (this.debugMode) {
        console.log(`[MultiLineLayoutPrimitive] Cleaned up expired assignment: ${phraseId}`);
      }
    });
  }
  
  /**
   * フレーズを行から解放
   * フレーズ終了時に明示的に呼び出し可能
   */
  public releasePhraseFromLine(phraseId: string): void {
    if (this.phraseLineAssignments.delete(phraseId)) {
      if (this.debugMode) {
        console.log(`[MultiLineLayoutPrimitive] Released phrase "${phraseId}" from line`);
      }
    }
  }
  
  /**
   * 全割り当てをリセット
   */
  public resetAllAssignments(): void {
    this.phraseLineAssignments.clear();
    this.lastResetTime = Date.now();
    // if (this.debugMode) {
    //   console.log('[MultiLineLayoutPrimitive] All assignments reset');
    // }
  }
  
  /**
   * デバッグモードの切り替え
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }
  
  /**
   * 現在の割り当て状況を取得（デバッグ用）
   */
  public getCurrentAssignments(): Map<string, LineAssignment> {
    return new Map(this.phraseLineAssignments);
  }
}

export default MultiLineLayoutPrimitive;