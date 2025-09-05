/**
 * ShapePrimitive
 * 基本図形の作成とアニメーション機能を提供
 */

import * as PIXI from 'pixi.js';

/**
 * 矩形パラメータ
 */
export interface RectangleParams {
  width: number;
  height: number;
  x?: number;
  y?: number;
  color?: number | string;
  alpha?: number;
  strokeColor?: number | string;
  strokeWidth?: number;
  cornerRadius?: number;
}

/**
 * 円パラメータ
 */
export interface CircleParams {
  radius: number;
  x?: number;
  y?: number;
  color?: number | string;
  alpha?: number;
  strokeColor?: number | string;
  strokeWidth?: number;
}

/**
 * 多角形パラメータ
 */
export interface PolygonParams {
  points: number[];  // [x1, y1, x2, y2, ...]
  color?: number | string;
  alpha?: number;
  strokeColor?: number | string;
  strokeWidth?: number;
  closed?: boolean;
}

/**
 * アニメーション設定
 */
export interface AnimationConfig {
  property: 'x' | 'y' | 'scale' | 'scaleX' | 'scaleY' | 'rotation' | 'alpha' | 'width' | 'height';
  from: number;
  to: number;
  duration: number;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic';
  loop?: boolean;
  yoyo?: boolean;
}

/**
 * シェイププリミティブ
 * 基本図形の作成とアニメーション機能
 */
export class ShapePrimitive {
  // アニメーション管理
  private animations: Map<string, {
    graphics: PIXI.Graphics;
    config: AnimationConfig;
    startTime: number;
    originalValues: Record<string, number>;
  }> = new Map();

  /**
   * 矩形の作成
   */
  createRectangle(params: RectangleParams): PIXI.Graphics {
    const graphics = new PIXI.Graphics();
    
    // ストロークの設定
    if (params.strokeColor !== undefined && params.strokeWidth !== undefined) {
      graphics.lineStyle(
        params.strokeWidth,
        this.parseColor(params.strokeColor),
        params.alpha !== undefined ? params.alpha : 1.0
      );
    }

    // 塗りつぶしの設定
    if (params.color !== undefined) {
      graphics.beginFill(
        this.parseColor(params.color),
        params.alpha !== undefined ? params.alpha : 1.0
      );
    }

    // 矩形の描画
    const x = params.x !== undefined ? params.x : 0;
    const y = params.y !== undefined ? params.y : 0;
    
    if (params.cornerRadius !== undefined && params.cornerRadius > 0) {
      // 角丸矩形
      graphics.drawRoundedRect(x, y, params.width, params.height, params.cornerRadius);
    } else {
      // 通常の矩形
      graphics.drawRect(x, y, params.width, params.height);
    }

    if (params.color !== undefined) {
      graphics.endFill();
    }

    return graphics;
  }

  /**
   * 円の作成
   */
  createCircle(params: CircleParams): PIXI.Graphics {
    const graphics = new PIXI.Graphics();
    
    // ストロークの設定
    if (params.strokeColor !== undefined && params.strokeWidth !== undefined) {
      graphics.lineStyle(
        params.strokeWidth,
        this.parseColor(params.strokeColor),
        params.alpha !== undefined ? params.alpha : 1.0
      );
    }

    // 塗りつぶしの設定
    if (params.color !== undefined) {
      graphics.beginFill(
        this.parseColor(params.color),
        params.alpha !== undefined ? params.alpha : 1.0
      );
    }

    // 円の描画
    const x = params.x !== undefined ? params.x : 0;
    const y = params.y !== undefined ? params.y : 0;
    graphics.drawCircle(x, y, params.radius);

    if (params.color !== undefined) {
      graphics.endFill();
    }

    return graphics;
  }

  /**
   * 多角形の作成
   */
  createPolygon(params: PolygonParams): PIXI.Graphics {
    const graphics = new PIXI.Graphics();
    
    // ストロークの設定
    if (params.strokeColor !== undefined && params.strokeWidth !== undefined) {
      graphics.lineStyle(
        params.strokeWidth,
        this.parseColor(params.strokeColor),
        params.alpha !== undefined ? params.alpha : 1.0
      );
    }

    // 塗りつぶしの設定
    if (params.color !== undefined) {
      graphics.beginFill(
        this.parseColor(params.color),
        params.alpha !== undefined ? params.alpha : 1.0
      );
    }

    // 多角形の描画
    if (params.closed !== false) {
      graphics.drawPolygon(params.points);
    } else {
      // 開いた線として描画
      graphics.moveTo(params.points[0], params.points[1]);
      for (let i = 2; i < params.points.length; i += 2) {
        graphics.lineTo(params.points[i], params.points[i + 1]);
      }
    }

    if (params.color !== undefined && params.closed !== false) {
      graphics.endFill();
    }

    return graphics;
  }

  /**
   * 星形の作成
   */
  createStar(
    points: number,
    outerRadius: number,
    innerRadius: number,
    params: Omit<PolygonParams, 'points'>
  ): PIXI.Graphics {
    const starPoints: number[] = [];
    const angleStep = (Math.PI * 2) / (points * 2);
    
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = i * angleStep - Math.PI / 2; // 上から始める
      starPoints.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
      );
    }

    return this.createPolygon({
      ...params,
      points: starPoints,
      closed: true
    });
  }

  /**
   * アニメーションの開始
   */
  startAnimation(
    animationId: string,
    graphics: PIXI.Graphics,
    config: AnimationConfig,
    startTime: number
  ): void {
    // 元の値を保存
    const originalValues: Record<string, number> = {};
    
    switch (config.property) {
      case 'x':
      case 'y':
        originalValues[config.property] = graphics.position[config.property];
        break;
      case 'scale':
        originalValues.scaleX = graphics.scale.x;
        originalValues.scaleY = graphics.scale.y;
        break;
      case 'scaleX':
      case 'scaleY':
        const scaleAxis = config.property === 'scaleX' ? 'x' : 'y';
        originalValues[config.property] = graphics.scale[scaleAxis];
        break;
      case 'rotation':
      case 'alpha':
        originalValues[config.property] = graphics[config.property];
        break;
      case 'width':
      case 'height':
        originalValues[config.property] = graphics[config.property];
        break;
    }

    this.animations.set(animationId, {
      graphics,
      config,
      startTime,
      originalValues
    });
  }

  /**
   * アニメーションの更新
   */
  updateAnimation(animationId: string, currentTime: number): void {
    const animation = this.animations.get(animationId);
    if (!animation) {
      return;
    }

    const { graphics, config, startTime } = animation;
    let progress = (currentTime - startTime) / config.duration;

    // ループ処理
    if (config.loop) {
      progress = progress % 1;
    } else if (progress > 1) {
      progress = 1;
    }

    // ヨーヨー処理
    if (config.yoyo && Math.floor((currentTime - startTime) / config.duration) % 2 === 1) {
      progress = 1 - progress;
    }

    // イージング適用
    const easedProgress = this.applyEasing(progress, config.easing || 'linear');
    
    // 値の計算と適用
    const value = config.from + (config.to - config.from) * easedProgress;
    
    switch (config.property) {
      case 'x':
      case 'y':
        graphics.position[config.property] = value;
        break;
      case 'scale':
        graphics.scale.set(value, value);
        break;
      case 'scaleX':
        graphics.scale.x = value;
        break;
      case 'scaleY':
        graphics.scale.y = value;
        break;
      case 'rotation':
      case 'alpha':
        graphics[config.property] = value;
        break;
      case 'width':
      case 'height':
        // Graphicsの再描画が必要
        this.resizeGraphics(graphics, config.property, value);
        break;
    }

    // アニメーション完了チェック
    if (!config.loop && progress >= 1) {
      this.animations.delete(animationId);
    }
  }

  /**
   * グラフィックスのリサイズ
   */
  private resizeGraphics(graphics: PIXI.Graphics, property: 'width' | 'height', value: number): void {
    // 現在のスケールを保存してリセット
    const currentScaleX = graphics.scale.x;
    const currentScaleY = graphics.scale.y;
    
    if (property === 'width') {
      graphics.scale.x = value / graphics.width * currentScaleX;
    } else {
      graphics.scale.y = value / graphics.height * currentScaleY;
    }
  }

  /**
   * イージング関数の適用
   */
  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'easeIn':
        return t * t;
      case 'easeOut':
        return t * (2 - t);
      case 'easeInOut':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'easeInCubic':
        return t * t * t;
      case 'easeOutCubic':
        return 1 - Math.pow(1 - t, 3);
      case 'easeInOutCubic':
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      default:
        return t;
    }
  }

  /**
   * アニメーションの停止
   */
  stopAnimation(animationId: string): void {
    this.animations.delete(animationId);
  }

  /**
   * すべてのアニメーションの停止
   */
  stopAllAnimations(): void {
    this.animations.clear();
  }

  /**
   * 色のパース
   */
  private parseColor(color: number | string): number {
    if (typeof color === 'number') {
      return color;
    }
    
    // HEXカラーコードをnumberに変換
    if (typeof color === 'string' && color.startsWith('#')) {
      return parseInt(color.replace('#', '0x'), 16);
    }
    
    return 0xFFFFFF; // デフォルト白
  }
}