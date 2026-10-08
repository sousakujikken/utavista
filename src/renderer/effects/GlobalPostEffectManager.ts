import * as PIXI from 'pixi.js';

export interface GlobalPostEffectConfig {
  enabled: boolean;
  masterIntensity: number;
  shake: number;
  zoom: number;
  tilt: number;
  glitch: number;
  horizontalWarp: number;
  hueShift: number;
  chromaticAberration: number;
  vignette: number;
  filmGrain: number;
  scanlines: number;
  saturation: number;
  contrast: number;
}

export const DEFAULT_POST_EFFECT_CONFIG: GlobalPostEffectConfig = {
  enabled: false,
  masterIntensity: 1,
  shake: 0,
  zoom: 0,
  tilt: 0,
  glitch: 0,
  horizontalWarp: 0,
  hueShift: 0,
  chromaticAberration: 0,
  vignette: 0,
  filmGrain: 0,
  scanlines: 0,
  saturation: 1,
  contrast: 1
};

const fragmentShader = `precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform float uGlitchSeed;
uniform float uMaster;
uniform float uShake;
uniform float uZoom;
uniform float uTilt;
uniform float uGlitch;
uniform float uHorizontalWarp;
uniform float uHue;
uniform float uChromatic;
uniform float uVignette;
uniform float uGrain;
uniform float uScanlines;
uniform float uSaturation;
uniform float uContrast;

float hash(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

float hash3(vec3 value) {
  value = fract(value * vec3(0.1031, 0.1030, 0.0973));
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

vec3 hueRotate(vec3 color, float angle) {
  const mat3 toYiq = mat3(
    0.299, 0.596, 0.211,
    0.587, -0.274, -0.523,
    0.114, -0.322, 0.312
  );
  const mat3 toRgb = mat3(
    1.0, 1.0, 1.0,
    0.956, -0.272, -1.106,
    0.621, -0.647, 1.703
  );
  vec3 yiq = toYiq * color;
  float hue = atan(yiq.z, yiq.y) + angle;
  float chroma = length(yiq.yz);
  return clamp(toRgb * vec3(yiq.x, chroma * cos(hue), chroma * sin(hue)), 0.0, 1.0);
}

void main(void) {
  vec2 uv = vTextureCoord;
  float master = uMaster;
  float angle = uTilt * master;
  float cosine = cos(angle);
  float sine = sin(angle);
  vec2 centered = uv - 0.5;
  centered = mat2(cosine, -sine, sine, cosine) * centered;
  centered /= max(0.6, 1.0 + uZoom * master);
  uv = centered + 0.5;

  vec2 shakeOffset = vec2(
    sin(uTime * 19.7) + sin(uTime * 43.1) * 0.45,
    cos(uTime * 23.3) + cos(uTime * 37.9) * 0.4
  ) * uShake * master * 0.004;
  uv += shakeOffset;

  float glitchStrength = max(0.0, uGlitch * master);
  float horizontalWarpStrength = max(0.0, uHorizontalWarp * master);
  float bandCount = floor(28.0 + uGlitch * 70.0);
  float band = floor(uv.y * bandCount);
  float frame = floor(uTime * 18.0);
  // フレーム番号はTypeScript側で整数ハッシュ化し、精度の安全な範囲で受け取る。
  float frameSeed = uGlitchSeed;
  float bandNoise = hash3(vec3(
    band + frameSeed * 97.1,
    19.19 + frameSeed * 37.0,
    band * 0.17 + frameSeed * 79.19
  ));

  // デジタルグリッチは、フレームごとにランダム選択した水平スライスだけをずらす。
  float glitchProbability = step(0.000001, glitchStrength)
    * (0.12 + sqrt(min(glitchStrength, 1.0)) * 0.38);
  float glitchBand = step(1.0 - glitchProbability, bandNoise);
  float displacementNoise = hash3(vec3(
    band + frameSeed * 31.3,
    73.7 + frameSeed * 43.0,
    band * 0.29 + frameSeed * 35.71
  ));
  float displacementDirection = displacementNoise < 0.5 ? -1.0 : 1.0;
  float glitchMagnitude = mix(0.45, 1.0, abs(displacementNoise * 2.0 - 1.0));
  uv.x += displacementDirection * glitchMagnitude * glitchStrength * 0.075 * glitchBand;

  // これまでの全帯が連続して揺れる表現は、独立した「水平うねり」として残す。
  float warpBandCount = floor(28.0 + uHorizontalWarp * 70.0);
  float warpBand = floor(uv.y * warpBandCount);
  float warpNoise = hash3(vec3(
    warpBand + frameSeed * 97.1,
    19.19 + frameSeed * 37.0,
    warpBand * 0.17 + frameSeed * 79.19
  ));
  float warpDirectionNoise = hash3(vec3(
    warpBand + frameSeed * 31.3,
    73.7 + frameSeed * 43.0,
    warpBand * 0.29 + frameSeed * 35.71
  ));
  float warpDirection = warpDirectionNoise < 0.5 ? -1.0 : 1.0;
  float warpMagnitude = mix(0.35, 1.0, warpNoise);
  uv.x += warpDirection * warpMagnitude * horizontalWarpStrength * 0.0325;

  float rgbOffset = (uChromatic + uGlitch * 0.35) * master * 0.012;
  // 入力はプリマルチプライ済み。透過背景でも色調整が透明部分へ色を足さないよう、
  // 非プリマルチプライに戻して処理し、最後にalphaを掛け直す（不透明背景ではalpha=1で従来と同じ）。
  vec4 redSample = texture2D(uSampler, uv + vec2(rgbOffset, 0.0));
  vec4 centerColor = texture2D(uSampler, uv);
  vec4 blueSample = texture2D(uSampler, uv - vec2(rgbOffset, 0.0));
  float alpha = max(centerColor.a, max(redSample.a, blueSample.a));
  vec3 color = vec3(
    redSample.a > 0.0 ? redSample.r / redSample.a : 0.0,
    centerColor.a > 0.0 ? centerColor.g / centerColor.a : 0.0,
    blueSample.a > 0.0 ? blueSample.b / blueSample.a : 0.0
  );

  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luminance), color, uSaturation);
  color = (color - 0.5) * uContrast + 0.5;
  color = hueRotate(color, uHue);

  float grain = hash(uv * vec2(1920.0, 1080.0) + frame * 13.17) - 0.5;
  color += grain * uGrain * master * 0.24;
  float scan = sin(uv.y * 1080.0 * 3.14159265);
  color *= 1.0 - (0.5 + 0.5 * scan) * uScanlines * master * 0.18;

  float edge = smoothstep(0.34, 0.82, length((vTextureCoord - 0.5) * vec2(1.0, 0.78)));
  color *= 1.0 - edge * uVignette * master * 0.86;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha * inside);
}
`;

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 論理フレーム番号を、シェーダーへ安全に渡せる決定論的な0〜1の値へ変換する。 */
function frameSeedFromTime(timeMs: number): number {
  const frame = Math.floor(Math.max(0, timeMs) * 60 / 1000) >>> 0;
  let value = frame;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

function normalizeConfig(value: Partial<GlobalPostEffectConfig>): GlobalPostEffectConfig {
  return {
    enabled: value.enabled === true,
    masterIntensity: numberValue(value.masterIntensity, 1),
    shake: numberValue(value.shake, 0),
    zoom: numberValue(value.zoom, 0),
    tilt: numberValue(value.tilt, 0),
    glitch: numberValue(value.glitch, 0),
    horizontalWarp: numberValue(value.horizontalWarp, 0),
    hueShift: numberValue(value.hueShift, 0),
    chromaticAberration: numberValue(value.chromaticAberration, 0),
    vignette: numberValue(value.vignette, 0),
    filmGrain: numberValue(value.filmGrain, 0),
    scanlines: numberValue(value.scanlines, 0),
    saturation: numberValue(value.saturation, 1),
    contrast: numberValue(value.contrast, 1)
  };
}

/** 全シーンの合成後に一度だけ適用する、決定論的な共通ポストエフェクト。 */
export class GlobalPostEffectManager {
  private readonly target: PIXI.Container;
  private readonly filter: PIXI.Filter;
  private config: GlobalPostEffectConfig;

  constructor(target: PIXI.Container) {
    this.target = target;
    this.config = { ...DEFAULT_POST_EFFECT_CONFIG };
    this.filter = new PIXI.Filter(undefined, fragmentShader, {
      uTime: 0,
      uGlitchSeed: 0,
      uMaster: 1,
      uShake: 0,
      uZoom: 0,
      uTilt: 0,
      uGlitch: 0,
      uHorizontalWarp: 0,
      uHue: 0,
      uChromatic: 0,
      uVignette: 0,
      uGrain: 0,
      uScanlines: 0,
      uSaturation: 1,
      uContrast: 1
    });
    this.syncFilterAttachment();
    this.update(0);
  }

  getConfig(): GlobalPostEffectConfig {
    return { ...this.config };
  }

  setConfig(updates: Partial<GlobalPostEffectConfig>): void {
    this.config = normalizeConfig({ ...this.config, ...updates });
    this.syncFilterAttachment();
    this.update(Number(this.filter.uniforms.uTime || 0) * 1000);
  }

  update(timeMs: number): void {
    // GPUコンテキスト復帰や他エフェクトのfilters更新で外れた場合も、描画前に自己修復する。
    this.syncFilterAttachment();

    const uniforms = this.filter.uniforms;
    uniforms.uTime = Math.max(0, timeMs) / 1000;
    uniforms.uGlitchSeed = frameSeedFromTime(timeMs);
    uniforms.uMaster = this.config.masterIntensity;
    uniforms.uShake = this.config.shake;
    uniforms.uZoom = this.config.zoom;
    uniforms.uTilt = this.config.tilt;
    uniforms.uGlitch = this.config.glitch;
    uniforms.uHorizontalWarp = this.config.horizontalWarp;
    uniforms.uHue = this.config.hueShift * Math.PI / 180;
    uniforms.uChromatic = this.config.chromaticAberration;
    uniforms.uVignette = this.config.vignette;
    uniforms.uGrain = this.config.filmGrain;
    uniforms.uScanlines = this.config.scanlines;
    uniforms.uSaturation = this.config.saturation;
    uniforms.uContrast = this.config.contrast;
  }

  resize(filterArea: PIXI.Rectangle): void {
    this.target.filterArea = filterArea;
  }

  destroy(): void {
    this.target.filters = (this.target.filters || []).filter(filter => filter !== this.filter);
    this.filter.destroy();
  }

  private syncFilterAttachment(): void {
    const filters = this.target.filters || [];
    const containsFilter = filters.includes(this.filter);
    if (this.config.enabled && !containsFilter) {
      this.target.filters = [...filters, this.filter];
    }
    if (!this.config.enabled && containsFilter) this.target.filters = filters.filter(filter => filter !== this.filter);
  }

}
