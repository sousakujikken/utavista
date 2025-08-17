/**
 * ブラーエフェクトプリミティブ v2.0
 * 責任範囲: ブラーフィルターの適用と管理
 */

import * as PIXI from 'pixi.js';
import { BasePrimitive, BlurEffectParams, HierarchyType } from '../types';

export class BlurEffectPrimitive implements BasePrimitive {
  readonly name = 'BlurEffect';
  readonly version = '2.0.0';
  readonly supportedHierarchy: HierarchyType = 'character';

  /**
   * ブラーエフェクトを適用
   */
  apply(target: PIXI.DisplayObject, params: BlurEffectParams): void {
    if (!params.enableBlur) {
      this.remove(target);
      return;
    }

    const blurStrength = this.calculateBlurStrength(params);

    if (blurStrength > 0.1) {
      const blurFilter = new PIXI.BlurFilter();
      blurFilter.blur = blurStrength;

      target.filters = [blurFilter];

      // 適切なフィルターエリアを設定
      if (target instanceof PIXI.Text) {
        const bounds = target.getBounds();
        const padding = Math.ceil(blurStrength * 2);
        target.filterArea = new PIXI.Rectangle(
          bounds.x - padding,
          bounds.y - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2
        );
      }
    } else {
      this.remove(target);
    }
  }

  /**
   * ブラーエフェクトを除去
   */
  remove(target: PIXI.DisplayObject): void {
    if (target.filters) {
      target.filters.forEach(filter => {
        if (filter && typeof filter.destroy === 'function') {
          filter.destroy();
        }
      });
    }
    target.filters = null;
    target.filterArea = null;
  }

  /**
   * 動的ブラー強度計算
   */
  private calculateBlurStrength(params: BlurEffectParams): number {
    const baseStrength = params.blurStrength;

    switch (params.blurFadeType) {
      case 'sync_with_alpha':
        // アルファ値と同期してブラー
        return baseStrength * (1 - params.currentAlpha);

      case 'inverse_alpha':
        // アルファ値と逆相関でブラー
        return baseStrength * params.currentAlpha;

      case 'independent':
        // アルファ値に依存しない独立したブラー
        return this.calculateTimeBasedBlur(params);

      default:
        return baseStrength;
    }
  }

  /**
   * 時間ベースのブラー計算
   */
  private calculateTimeBasedBlur(params: BlurEffectParams): number {
    const fadeInEndTime = params.startMs + params.fadeInDuration;
    const fadeOutStartTime = params.endMs - params.fadeOutDuration;

    // フェードイン期間
    if (params.nowMs < fadeInEndTime) {
      const progress = (params.nowMs - params.startMs) / params.fadeInDuration;
      const easedProgress = this.easeOutQuad(Math.max(0, progress));
      return params.blurStrength * (1 - easedProgress);
    }

    // アクティブ期間
    if (params.nowMs < fadeOutStartTime) {
      return 0; // ブラーなし
    }

    // フェードアウト期間
    const progress = (params.nowMs - fadeOutStartTime) / params.fadeOutDuration;
    const easedProgress = this.easeInQuad(Math.min(1, progress));
    return params.blurStrength * easedProgress;
  }

  /**
   * アニメーション強度の調整
   */
  private calculateAnimatedBlurStrength(params: BlurEffectParams): number {
    const time = params.nowMs * 0.001; // 秒に変換
    const baseStrength = params.blurStrength;

    // 時間ベースの微細な変動
    const oscillation = Math.sin(time * 2 * Math.PI) * 0.1;
    
    return Math.max(0, baseStrength + (baseStrength * oscillation));
  }

  /**
   * ブラー品質の動的調整
   */
  private adjustBlurQuality(filter: PIXI.BlurFilter, strength: number): void {
    // 強度に応じて品質を調整
    if (strength > 10) {
      filter.quality = 1; // 高品質
    } else if (strength > 5) {
      filter.quality = 2; // 中品質
    } else {
      filter.quality = 4; // 低品質（高速）
    }
  }

  /**
   * フィルターエリア最適化
   */
  private optimizeFilterArea(target: PIXI.DisplayObject, blurStrength: number): PIXI.Rectangle | null {
    if (!(target instanceof PIXI.Text)) {
      return null;
    }

    const bounds = target.getBounds();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }

    // ブラー強度に応じたパディング計算
    const padding = Math.ceil(blurStrength * 2.5);

    return new PIXI.Rectangle(
      bounds.x - padding,
      bounds.y - padding,
      bounds.width + padding * 2,
      bounds.height + padding * 2
    );
  }

  /**
   * イージング関数: EaseOutQuad
   */
  private easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  /**
   * イージング関数: EaseInQuad
   */
  private easeInQuad(t: number): number {
    return t * t;
  }

  /**
   * ブラーエフェクトの診断情報
   */
  getDiagnostics(target: PIXI.DisplayObject): BlurDiagnostics {
    const hasFilters = !!(target.filters && target.filters.length > 0);
    const hasBlurFilter = hasFilters && target.filters!.some(filter => filter instanceof PIXI.BlurFilter);
    
    let blurStrength = 0;
    if (hasBlurFilter) {
      const blurFilter = target.filters!.find(filter => filter instanceof PIXI.BlurFilter) as PIXI.BlurFilter;
      blurStrength = blurFilter.blur;
    }

    return {
      hasBlurFilter,
      blurStrength,
      hasFilterArea: !!target.filterArea,
      filterAreaSize: target.filterArea ? {
        width: target.filterArea.width,
        height: target.filterArea.height
      } : null
    };
  }
}

export interface BlurDiagnostics {
  hasBlurFilter: boolean;
  blurStrength: number;
  hasFilterArea: boolean;
  filterAreaSize: { width: number; height: number } | null;
}