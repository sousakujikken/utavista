/**
 * MultiLineLayoutPrimitive
 * 複数フレーズの段組み配置を管理するプリミティブ
 * GlitchTextテンプレートの段組み機能をプリミティブ化
 */

import * as PIXI from 'pixi.js';
import { LayoutPrimitive, LayoutItem, LayoutParams, LayoutResult } from '../types';

/**
 * 段組み配置パラメータ
 */
export interface MultiLineLayoutParams extends LayoutParams {
  /** 総段数 */
  totalLines: number;
  /** 段間隔（ピクセル） */
  lineSpacing: number;
  /** 段リセット間隔（ms） */
  resetInterval: number;
  /** 手動段番号指定（-1で自動） */
  manualLineNumber: number;
  /** フレーズID */
  phraseId: string;
  /** フレーズ開始時刻 */
  startMs: number;
  /** フレーズ終了時刻 */
  endMs: number;
  /** 現在時刻 */
  nowMs: number;
  /** テキスト内容 */
  text: string;
}

/**
 * 段履歴情報
 */
interface LineHistory {
  phraseId: string;
  startMs: number;
  endMs: number;
  lineNumber: number;
  text: string;
}

/**
 * グローバル段管理状態
 */
interface GlobalLineState {
  lastPhraseEndMs: number;
  currentLine: number;
  phraseLineMap: Map<string, number>;
  lineHistory: LineHistory[];
}

/**
 * 段組み配置結果
 */
export interface MultiLineLayoutResult extends LayoutResult {
  /** 割り当てられた段番号 */
  lineNumber: number;
  /** Y座標 */
  y: number;
}

/**
 * 複数フレーズの段組み配置を管理するプリミティブ
 */
export class MultiLineLayoutPrimitive implements LayoutPrimitive {
  name = 'MultiLineLayoutPrimitive';
  
  /**
   * 親階層からの制御を受け入れ
   */
  receiveParentContext(): void {
    // レイアウトプリミティブは親階層の状態に依存しない
  }
  
  /**
   * 自分の責任範囲の処理を実行
   */
  executeWithinHierarchy(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>
  ) {
    // レイアウトプリミティブのため、calculateLayoutを使用
    return {
      success: true,
      childInstructions: []
    };
  }
  
  /**
   * 下位層への指示を生成
   */
  generateChildInstructions() {
    // レイアウトプリミティブは子階層を持たない
    return [];
  }
  
  /**
   * 要素の配置計算
   */
  calculateLayout(
    items: LayoutItem[],
    params: MultiLineLayoutParams
  ): MultiLineLayoutResult[] {
    // 単一フレーズの段番号を計算
    const lineNumber = this.getOrCalculateLineNumber(params);
    
    // 画面サイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      return [{
        id: params.phraseId,
        position: { x: 0, y: 0 },
        lineNumber: lineNumber,
        y: 0
      }];
    }
    
    const screenHeight = app.renderer.height;
    
    // Y座標の計算（画面中央から上下に段を配置）
    const centerY = screenHeight / 2;
    const totalHeight = (params.totalLines - 1) * params.lineSpacing;
    const firstLineY = centerY - totalHeight / 2;
    const targetY = firstLineY + lineNumber * params.lineSpacing;
    
    return [{
      id: params.phraseId,
      position: { x: 0, y: targetY },
      lineNumber: lineNumber,
      y: targetY
    }];
  }
  
  /**
   * フレーズの段番号を取得または計算
   */
  public getOrCalculateLineNumber(params: MultiLineLayoutParams): number {
    // グローバルな段管理システム
    const global = (window as any);
    if (!global.__MULTI_LINE_LAYOUT_STATE__) {
      global.__MULTI_LINE_LAYOUT_STATE__ = {
        lastPhraseEndMs: -1,
        currentLine: 0,
        phraseLineMap: new Map(),
        lineHistory: []
      } as GlobalLineState;
    }
    
    const state: GlobalLineState = global.__MULTI_LINE_LAYOUT_STATE__;
    
    // 既にこのフレーズの段番号が決まっている場合はそれを返す
    if (state.phraseLineMap.has(params.phraseId)) {
      return state.phraseLineMap.get(params.phraseId)!;
    }
    
    // 手動指定がある場合はそれを使用
    if (params.manualLineNumber >= 0 && params.manualLineNumber < params.totalLines) {
      state.phraseLineMap.set(params.phraseId, params.manualLineNumber);
      return params.manualLineNumber;
    }
    
    // 前のフレーズとの間隔をチェック
    if (state.lastPhraseEndMs !== -1 && 
        params.startMs - state.lastPhraseEndMs > params.resetInterval) {
      state.currentLine = 0;
    }
    
    const lineNumber = state.currentLine % params.totalLines;
    
    // 段番号をキャッシュ
    state.phraseLineMap.set(params.phraseId, lineNumber);
    
    // 状態更新
    state.lastPhraseEndMs = params.endMs;
    state.currentLine += 1;
    state.lineHistory.push({
      phraseId: params.phraseId,
      startMs: params.startMs,
      endMs: params.endMs,
      lineNumber: lineNumber,
      text: params.text || ''
    });
    
    return lineNumber;
  }
  
  /**
   * フレーズ位置計算（スライドアニメーション用）
   */
  public calculatePhrasePosition(params: {
    phraseId: string;
    startMs: number;
    endMs: number;
    nowMs: number;
    text: string;
    totalLines: number;
    lineSpacing: number;
    resetInterval: number;
    manualLineNumber: number;
  }): { lineNumber: number; y: number } {
    
    const layoutParams: MultiLineLayoutParams = {
      ...params,
      spacing: 0,
      alignment: 'left' as const,
      containerSize: { width: 0, height: 0 }
    };
    
    const results = this.calculateLayout([], layoutParams);
    
    if (results.length > 0) {
      return {
        lineNumber: results[0].lineNumber,
        y: results[0].y
      };
    }
    
    return { lineNumber: 0, y: 0 };
  }
  
  /**
   * 段組み状態のリセット（テスト用）
   */
  public resetState(): void {
    const global = (window as any);
    if (global.__MULTI_LINE_LAYOUT_STATE__) {
      delete global.__MULTI_LINE_LAYOUT_STATE__;
    }
  }
  
  /**
   * 現在の段組み状態を取得（デバッグ用）
   */
  public getState(): GlobalLineState | null {
    const global = (window as any);
    return global.__MULTI_LINE_LAYOUT_STATE__ || null;
  }
}