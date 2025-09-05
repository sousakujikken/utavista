/**
 * グリッチエフェクトプリミティブ v2.0
 * 責任範囲: ピクセルブロックベースのグリッチエフェクト適用
 */

import * as PIXI from 'pixi.js';
import { BasePrimitive, GlitchEffectParams, HierarchyType } from '../types';

export class GlitchEffectPrimitive implements BasePrimitive {
  readonly name = 'GlitchEffect';
  readonly version = '2.0.0';
  readonly supportedHierarchy: HierarchyType = 'character';

  /**
   * グリッチエフェクトを適用
   */
  apply(target: PIXI.DisplayObject, params: GlitchEffectParams): void {
    if (!params.enableGlitch) {
      this.remove(target);
      return;
    }

    // ピクセルブロック基準のグリッチ処理
    const glitchFilter = this.createGlitchFilter(params);
    target.filters = [glitchFilter];

    // グリッチエリア設定
    if (target instanceof PIXI.Text) {
      const bounds = target.getBounds();
      const blockPadding = params.glitchBlockSize * 2;
      target.filterArea = new PIXI.Rectangle(
        bounds.x - blockPadding,
        bounds.y - blockPadding,
        bounds.width + blockPadding * 2,
        bounds.height + blockPadding * 2
      );
    }
  }

  /**
   * グリッチエフェクトを除去
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
   * グリッチフィルター作成
   */
  private createGlitchFilter(params: GlitchEffectParams): PIXI.Filter {
    const fragmentShader = this.generateGlitchShader(params);
    
    const filter = new PIXI.Filter(undefined, fragmentShader, {
      glitchIntensity: params.glitchIntensity,
      glitchBlockSize: params.glitchBlockSize,
      glitchThreshold: params.glitchThreshold,
      glitchFrequency: params.glitchFrequency,
      randomSeed: params.randomSeed,
      time: Date.now() * 0.001
    });

    return filter;
  }

  /**
   * グリッチシェーダーコード生成
   */
  private generateGlitchShader(params: GlitchEffectParams): string {
    return `
      precision mediump float;
      
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform float glitchIntensity;
      uniform float glitchBlockSize;
      uniform float glitchThreshold;
      uniform float glitchFrequency;
      uniform float randomSeed;
      uniform float time;
      
      // シード付き乱数関数
      float random(vec2 co) {
        return fract(sin(dot(co.xy + randomSeed, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      // ピクセルブロック座標計算
      vec2 getBlockCoord(vec2 coord) {
        vec2 blockSize = vec2(glitchBlockSize) / vec2(textureSize(uSampler, 0));
        return floor(coord / blockSize) * blockSize;
      }
      
      // グリッチ変位計算
      vec2 calculateGlitchOffset(vec2 blockCoord) {
        float noise = random(blockCoord + time * glitchFrequency);
        
        if (noise < glitchThreshold) {
          return vec2(0.0); // グリッチなし
        }
        
        // ブロック単位での変位
        float offsetX = (random(blockCoord + vec2(1.0, 0.0)) - 0.5) * glitchIntensity * 0.1;
        float offsetY = (random(blockCoord + vec2(0.0, 1.0)) - 0.5) * glitchIntensity * 0.05;
        
        return vec2(offsetX, offsetY);
      }
      
      // RGB分離エフェクト
      vec4 applyRGBSeparation(vec2 coord, vec2 offset) {
        vec4 colorR = texture2D(uSampler, coord + offset * vec2(1.0, 0.0));
        vec4 colorG = texture2D(uSampler, coord);
        vec4 colorB = texture2D(uSampler, coord + offset * vec2(-1.0, 0.0));
        
        return vec4(colorR.r, colorG.g, colorB.b, colorG.a);
      }
      
      void main() {
        vec2 coord = vTextureCoord;
        vec2 blockCoord = getBlockCoord(coord);
        
        // グリッチオフセット計算
        vec2 glitchOffset = calculateGlitchOffset(blockCoord);
        
        // 最終座標
        vec2 finalCoord = coord + glitchOffset;
        
        // RGB分離適用
        vec4 color = applyRGBSeparation(finalCoord, glitchOffset * 2.0);
        
        // ノイズ追加
        float noise = random(blockCoord + time) * 0.1;
        color.rgb += noise * glitchIntensity * 0.1;
        
        gl_FragColor = color;
      }
    `;
  }

  /**
   * ブロックベースグリッチ（CPUベース代替実装）
   */
  private applyBlockGlitch(target: PIXI.DisplayObject, params: GlitchEffectParams): void {
    if (!(target instanceof PIXI.Text)) return;

    const random = this.createSeededRandom(params.randomSeed);
    
    // ブロック単位での位置変更
    if (random.next() < params.glitchThreshold) {
      const offsetX = (random.next() - 0.5) * params.glitchIntensity * params.glitchBlockSize;
      const offsetY = (random.next() - 0.5) * params.glitchIntensity * params.glitchBlockSize * 0.5;
      
      target.position.x += offsetX;
      target.position.y += offsetY;
    }

    // 色相変更
    if (random.next() < params.glitchThreshold * 0.3) {
      const colorMatrix = new PIXI.ColorMatrixFilter();
      colorMatrix.hue(random.next() * 360, false);
      
      const existingFilters = target.filters || [];
      target.filters = [...existingFilters, colorMatrix];
    }
  }

  /**
   * デジタルノイズ生成
   */
  private generateDigitalNoise(params: GlitchEffectParams): PIXI.Filter {
    const noiseShader = `
      precision mediump float;
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform float intensity;
      uniform float time;
      
      float random(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      void main() {
        vec4 color = texture2D(uSampler, vTextureCoord);
        float noise = random(vTextureCoord + time) * intensity;
        color.rgb += noise;
        gl_FragColor = color;
      }
    `;

    return new PIXI.Filter(undefined, noiseShader, {
      intensity: params.glitchIntensity * 0.1,
      time: Date.now() * 0.001
    });
  }

  /**
   * グリッチアニメーション更新
   */
  updateGlitchAnimation(target: PIXI.DisplayObject, params: GlitchEffectParams): void {
    if (!target.filters) return;

    const glitchFilters = target.filters.filter(filter => 
      filter instanceof PIXI.Filter && filter.uniforms.glitchIntensity !== undefined
    ) as PIXI.Filter[];

    glitchFilters.forEach(filter => {
      filter.uniforms.time = Date.now() * 0.001;
      filter.uniforms.randomSeed = params.randomSeed + Math.floor(Date.now() / 100);
    });
  }

  /**
   * シード付き乱数生成器
   */
  private createSeededRandom(seed: number) {
    let current = seed;
    return {
      next: () => {
        current = (current * 9301 + 49297) % 233280;
        return current / 233280;
      }
    };
  }

  /**
   * グリッチエフェクトの診断情報
   */
  getDiagnostics(target: PIXI.DisplayObject): GlitchDiagnostics {
    const hasFilters = !!(target.filters && target.filters.length > 0);
    const hasGlitchFilter = hasFilters && target.filters!.some(filter => 
      filter instanceof PIXI.Filter && filter.uniforms.glitchIntensity !== undefined
    );

    let glitchIntensity = 0;
    if (hasGlitchFilter) {
      const filter = target.filters!.find(f => 
        f instanceof PIXI.Filter && f.uniforms.glitchIntensity !== undefined
      ) as PIXI.Filter;
      glitchIntensity = filter.uniforms.glitchIntensity;
    }

    return {
      hasGlitchFilter,
      glitchIntensity,
      hasFilterArea: !!target.filterArea,
      activeFiltersCount: target.filters?.length || 0
    };
  }
}

export interface GlitchDiagnostics {
  hasGlitchFilter: boolean;
  glitchIntensity: number;
  hasFilterArea: boolean;
  activeFiltersCount: number;
}