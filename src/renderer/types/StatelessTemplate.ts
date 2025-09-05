/**
 * IStatelessTemplate - 状態を持たない純粋関数型のテンプレートインターフェイス
 */

import * as PIXI from 'pixi.js';
import type { ParameterConfig } from './types';
import type { RenderState } from '../state/StateManager';

export type TemplateParams = Record<string, any>;

/**
 * ステートレスなテンプレートインターフェイス
 * 状態を持たず、与えられた状態に基づいて描画のみを行う
 */
export interface IStatelessTemplate {
  /**
   * 指定時刻での描画
   * @param container 描画対象コンテナ
   * @param state オブジェクト状態（StateManagerから提供）
   * @param params テンプレートパラメータ
   * @param timestamp 現在時刻
   * @returns 描画成功フラグ
   */
  renderAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean;

  /**
   * ビジュアル要素のクリーンアップ
   * @param container 対象コンテナ
   */
  cleanup(container: PIXI.Container): void;

  /**
   * パラメータ設定の取得
   */
  getParameterConfig(): ParameterConfig[];

  /**
   * テンプレートメタデータ
   */
  readonly metadata?: {
    name: string;
    version: string;
    description: string;
    license?: string;
    licenseUrl?: string;
    originalAuthor?: {
      name: string;
      contribution: string;
      date: string;
    };
  };
}

/**
 * 既存テンプレートのアダプター
 * 段階的移行を可能にする
 */
export interface IAnimationTemplate {
  // 既存のアニメーションテンプレートインターフェイス
  // （実際の定義は types.ts から取得）
  animateContainer?(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: 'phrase' | 'word' | 'char',
    phase: 'in' | 'active' | 'out'
  ): boolean;

  renderPhraseContainer?(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: 'in' | 'active' | 'out',
    hierarchyType: 'phrase' | 'word' | 'char'
  ): boolean;

  renderWordContainer?(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: 'in' | 'active' | 'out',
    hierarchyType: 'phrase' | 'word' | 'char'
  ): boolean;

  renderCharContainer?(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: 'in' | 'active' | 'out',
    hierarchyType: 'phrase' | 'word' | 'char'
  ): boolean;

  removeVisualElements?(container: PIXI.Container): void;
  getParameterConfig(): ParameterConfig[];
}

/**
 * 既存テンプレートのアダプター
 * 段階的移行を可能にする
 */
export class TemplateAdapter implements IStatelessTemplate {
  private legacyTemplate: IAnimationTemplate;
  
  public readonly metadata?: {
    name: string;
    version: string;
    description: string;
    license?: string;
    licenseUrl?: string;
    originalAuthor?: {
      name: string;
      contribution: string;
      date: string;
    };
  };

  constructor(legacyTemplate: IAnimationTemplate) {
    this.legacyTemplate = legacyTemplate;
    
    // メタデータを可能であれば取得
    if ('metadata' in legacyTemplate) {
      this.metadata = (legacyTemplate as any).metadata;
    }
  }

  renderAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean {
    const { object } = state;
    
    // 新形式の状態を旧形式に変換
    const legacyParams = this.convertToLegacyParams(state, params);
    
    // 既存のanimateContainerメソッドを呼び出し
    if (this.legacyTemplate.animateContainer) {
      return this.legacyTemplate.animateContainer(
        container,
        '', // text (通常は空文字列)
        legacyParams,
        timestamp,
        object.startMs,
        object.endMs,
        object.hierarchyType,
        this.convertPhase(object.phase)
      );
    }

    // 階層別のレンダリングメソッドを呼び出し
    switch (object.hierarchyType) {
      case 'phrase':
        return this.legacyTemplate.renderPhraseContainer?.(
          container,
          '',
          legacyParams,
          timestamp,
          object.startMs,
          object.endMs,
          this.convertPhase(object.phase),
          object.hierarchyType
        ) ?? false;
      case 'word':
        return this.legacyTemplate.renderWordContainer?.(
          container,
          '',
          legacyParams,
          timestamp,
          object.startMs,
          object.endMs,
          this.convertPhase(object.phase),
          object.hierarchyType
        ) ?? false;
      case 'char':
        return this.legacyTemplate.renderCharContainer?.(
          container,
          '',
          legacyParams,
          timestamp,
          object.startMs,
          object.endMs,
          this.convertPhase(object.phase),
          object.hierarchyType
        ) ?? false;
    }

    return false;
  }

  cleanup(container: PIXI.Container): void {
    this.legacyTemplate.removeVisualElements?.(container);
  }

  getParameterConfig(): ParameterConfig[] {
    return this.legacyTemplate.getParameterConfig();
  }

  /**
   * 新形式の状態を旧形式のパラメータに変換
   */
  private convertToLegacyParams(state: RenderState, params: TemplateParams): Record<string, any> {
    const { object, effects, graphics } = state;
    
    return {
      ...params,
      // 内部状態を注入
      _stateless: {
        object,
        effects,
        graphics,
        // レガシーテンプレートが必要とする可能性のある情報
        phase: object.phase,
        progress: object.progress,
        visible: object.visible,
        exists: object.exists
      }
    };
  }

  /**
   * 新形式のフェーズを旧形式に変換
   */
  private convertPhase(phase: string): 'in' | 'active' | 'out' {
    switch (phase) {
      case 'in':
        return 'in';
      case 'out':
        return 'out';
      case 'before':
      case 'active':
      case 'after':
      default:
        return 'active';
    }
  }
}