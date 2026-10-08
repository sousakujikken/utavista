import * as PIXI from 'pixi.js';
import { deterministicNoise } from './Motion';

const EFFECT_PREFIX = 'kinetic-effect-';
const TAU = Math.PI * 2;

export type EmitterStyle = 'particles' | 'bubbles' | 'eyes' | 'noise' | 'speedLines';
export type SurfaceShape = 'ribbon' | 'cylinder' | 'torus';

export interface TypographyEffectParams {
  shuffleEnabled: boolean;
  shuffleCharset: string;
  shuffleRate: number;
  shuffleDuration: number;
  repetitionEnabled: boolean;
  repetitionCount: number;
  repetitionSpread: number;
  repetitionDepth: number;
  organicEnabled: boolean;
  organicAmplitude: number;
  organicFrequency: number;
  organicSpeed: number;
  destructionEnabled: boolean;
  destructionStrength: number;
  destructionSlices: number;
  destructionDuration: number;
  emittersEnabled: boolean;
  emitterStyle: EmitterStyle;
  emitterCount: number;
  emitterRadius: number;
  surfaceEnabled: boolean;
  surfaceShape: SurfaceShape;
  surfaceCurve: number;
  surfaceRepeat: number;
  variableWeightEnabled: boolean;
  variableWeightDuration: number;
  variableWeightSpacing: number;
  kerningMotionEnabled: boolean;
  kerningMotionAmount: number;
  kerningMotionDuration: number;
  baselineWaveEnabled: boolean;
  baselineWaveOffset: number;
  baselineWaveOvershoot: number;
  baselineWaveDuration: number;
  baselineWaveStagger: number;
  impactOutlineEnabled: boolean;
  impactOutlineSpread: number;
  impactOutlineDuration: number;
  impactOutlineThickness: number;
  impactOutlineTrigger: 'word' | 'character';
  emitterLineRate: number;
  emitterLineWidth: number;
  emitterInnerRadius: number;
}

export interface TypographyEffectContext {
  nowMs: number;
  startMs: number;
  phraseStartMs?: number;
  effectStartMs?: number;
  seed: number;
  index: number;
  intensity: number;
  /** 各文字の歌唱開始時刻（文字ごとに発動する効果で使う）。 */
  characterStartsMs?: number[];
}

const fragmentShader = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uTime;
uniform float uOrganicAmplitude;
uniform float uOrganicFrequency;
uniform float uOrganicSpeed;
uniform float uSurfaceCurve;
uniform float uSurfaceMode;
uniform float uSurfaceRepeat;

void main(void) {
  vec2 uv = vTextureCoord;
  float wave = sin((uv.y * uOrganicFrequency + uTime * uOrganicSpeed) * 6.28318530718);
  uv.x += wave * uOrganicAmplitude * sin(uv.y * 3.14159265359);

  float centeredX = uv.x - 0.5;
  if (uSurfaceMode > 0.5 && uSurfaceMode < 1.5) {
    uv.y += centeredX * centeredX * uSurfaceCurve;
  } else if (uSurfaceMode >= 1.5 && uSurfaceMode < 2.5) {
    uv.x = 0.5 + sin(centeredX * 3.14159265359) * 0.5;
    uv.y += abs(centeredX) * uSurfaceCurve;
  } else if (uSurfaceMode >= 2.5) {
    float angle = centeredX * 6.28318530718;
    uv.x = 0.5 + sin(angle) * 0.48;
    uv.y += (1.0 - cos(angle)) * uSurfaceCurve * 0.5;
  }

  if (uSurfaceRepeat > 1.0) {
    uv.x = fract(uv.x * uSurfaceRepeat);
  }

  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  gl_FragColor = texture2D(uSampler, clamp(uv, 0.0, 1.0)) * inside;
}
`;

interface EffectContainer extends PIXI.Container {
  __kineticEffectFilter?: PIXI.Filter;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

/** 参照モーションの細→太→細→中太という1周期を、絶対時刻から評価する。 */
export function sampleVariableWeightPulse(timeMs: number, durationMs: number): number {
  const cycle = Math.max(1, durationMs);
  const progress = ((Math.max(0, timeMs) % cycle) / cycle + 1) % 1;
  if (progress < 0.3) return progress / 0.3;
  if (progress < 0.6) return 1 - (progress - 0.3) / 0.3;
  if (progress < 0.82) return ((progress - 0.6) / 0.22) * 0.65;
  return 0.65;
}

function destroyDisplayObject(displayObject: PIXI.DisplayObject): void {
  if (displayObject.parent) displayObject.parent.removeChild(displayObject);
  displayObject.destroy({ children: true });
}

function clearByPrefix(container: PIXI.Container, prefix: string): void {
  container.children
    .filter(child => child.name?.startsWith(`${EFFECT_PREFIX}${prefix}`))
    .forEach(destroyDisplayObject);
}

/**
 * 文字グループ（文字単位のText）を、位置・拡大率・回転などの現在値ごと複製先へ写す。
 * カーニングやベースラインウェーブなど文字単位の動きを反映した見た目を複製できる。
 */
export function syncTextGroup(target: PIXI.Container, source: PIXI.Container): void {
  const sourceTexts = source.children.filter((child): child is PIXI.Text => child instanceof PIXI.Text);

  sourceTexts.forEach((sourceText, index) => {
    let clone = target.children[index] as PIXI.Text | undefined;
    if (!(clone instanceof PIXI.Text)) {
      if (clone) destroyDisplayObject(clone);
      clone = new PIXI.Text(sourceText.text, sourceText.style);
      clone.anchor.set(sourceText.anchor.x, sourceText.anchor.y);
      target.addChildAt(clone, Math.min(index, target.children.length));
    }

    clone.text = sourceText.text;
    clone.style = sourceText.style;
    clone.tint = sourceText.tint;
    clone.position.set(sourceText.x, sourceText.y);
    clone.scale.set(sourceText.scale.x, sourceText.scale.y);
    clone.skew.set(sourceText.skew.x, sourceText.skew.y);
    clone.rotation = sourceText.rotation;
    clone.alpha = sourceText.alpha;
    clone.visible = sourceText.visible;
    clone.renderable = sourceText.renderable;
  });

  target.children.slice(sourceTexts.length).forEach(destroyDisplayObject);
}

function ensureGroupClone(container: PIXI.Container, source: PIXI.Container, name: string): PIXI.Container {
  let clone = container.children.find(child => child.name === name) as PIXI.Container | undefined;
  if (!clone || clone instanceof PIXI.Text) {
    if (clone) destroyDisplayObject(clone);
    clone = new PIXI.Container();
    clone.name = name;
    container.addChildAt(clone, Math.max(0, container.getChildIndex(source)));
  }
  syncTextGroup(clone, source);
  return clone;
}

/** 指定時刻・seed・文字位置だけで置換結果を決める。 */
export function createShuffledText(
  text: string,
  progress: number,
  timeMs: number,
  rateMs: number,
  charset: string,
  seed: number
): string {
  const source = [...text];
  const symbols = [...charset];
  if (symbols.length === 0 || progress >= 1) return text;
  const frame = Math.floor(Math.max(0, timeMs) / Math.max(16, rateMs));
  const revealed = Math.floor(clamp01(progress) * source.length);
  return source.map((character, characterIndex) => {
    if (/\s/u.test(character) || characterIndex < revealed) return character;
    const noise = deterministicNoise(seed + frame * 131 + characterIndex * 47);
    return symbols[Math.floor(((noise + 1) * 0.5) * symbols.length) % symbols.length];
  }).join('');
}

/** 0→1→0 の衝撃波。シーク順序に依存しない。 */
export function destructionEnvelope(timeMs: number, duration: number): number {
  if (timeMs < 0 || timeMs > duration || duration <= 0) return 0;
  return Math.sin(clamp01(timeMs / duration) * Math.PI);
}

export class TypographyEffects {
  prepareSource(
    source: PIXI.Text,
    originalText: string,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    this.updateShuffle(source, originalText, params, context);
  }

  update(
    container: PIXI.Container,
    source: PIXI.Text,
    visualSource: PIXI.Container,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    this.updateCharacterMotion(visualSource, params, context);
    this.updateWarpFilter(visualSource, params, context);
    this.updateRepetition(container, visualSource, params, context);
    this.updateDestruction(container, source, visualSource, params, context);
    // 放出・曲面は、文字単位の動き（カーニング等）を反映した文字グループの現在の範囲を基準にする。
    const visualBounds = visualSource.getLocalBounds();
    this.updateEmitters(container, visualBounds, params, context);
    this.updateSurfaceCopies(container, visualSource, visualBounds, params, context);
    this.updateImpactOutline(container, visualSource, params, context);
  }

  /**
   * 文字単位の変形を共通の基準座標へ加算する。
   * updateCharacterText が毎フレーム基準座標へ戻すため、シーク順序やfpsに依存しない。
   */
  private updateCharacterMotion(
    source: PIXI.Container,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    const characters = source.children.filter((child): child is PIXI.Text => child instanceof PIXI.Text);
    const effectStartMs = context.effectStartMs ?? context.startMs;
    const elapsedMs = context.nowMs - effectStartMs;
    const centerIndex = (characters.length - 1) / 2;

    let weightSpacing = 0;
    if (params.variableWeightEnabled) {
      const pulse = sampleVariableWeightPulse(elapsedMs, params.variableWeightDuration);
      weightSpacing = params.variableWeightSpacing * (1 - pulse * 1.25) * context.intensity;
    }

    characters.forEach((character, characterIndex) => {
      if (params.variableWeightEnabled) {
        character.x += (characterIndex - centerIndex) * weightSpacing;
      }

      if (params.kerningMotionEnabled) {
        const progress = smoothstep(elapsedMs / Math.max(1, params.kerningMotionDuration));
        character.x += (characterIndex - centerIndex)
          * params.kerningMotionAmount
          * (1 - progress)
          * context.intensity;
      }

      if (params.baselineWaveEnabled) {
        const localElapsed = elapsedMs - characterIndex * params.baselineWaveStagger;
        const progress = clamp01(localElapsed / Math.max(1, params.baselineWaveDuration));
        let y = params.baselineWaveOffset;
        if (progress >= 0.62) {
          const settle = smoothstep((progress - 0.62) / 0.38);
          y = -params.baselineWaveOvershoot * (1 - settle);
        } else if (progress > 0) {
          const rise = smoothstep(progress / 0.62);
          y = params.baselineWaveOffset
            + (-params.baselineWaveOvershoot - params.baselineWaveOffset) * rise;
        }
        character.y += y * context.intensity;
      }
    });
  }

  cleanup(container: PIXI.Container): void {
    clearByPrefix(container, '');
    const source = container.children.find(child => child.name === 'kinetic-scene-text') as EffectContainer | undefined;
    this.removeWarpFilter(source);
    if (source) source.alpha = 1;
    const characterGroup = container.children.find(
      child => child.name === 'kinetic-scene-char-group'
    ) as EffectContainer | undefined;
    this.removeWarpFilter(characterGroup);
    if (characterGroup) characterGroup.alpha = 1;
  }

  private updateShuffle(
    source: PIXI.Text,
    originalText: string,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    if (!params.shuffleEnabled) {
      source.text = originalText;
      return;
    }
    // フレーズ開始前のコンテナはテンプレート側で非表示にする。
    // ここでも空文字へ退避し、置換文字や原文が漏れないようにする。
    if (context.nowMs < (context.phraseStartMs ?? context.startMs)) {
      source.text = '';
      return;
    }
    // 歌唱前は全文字をシャッフルし、歌唱開始を0msとして原文へ収束させる。
    // 結果は絶対時刻とseedだけで決まり、シーク順序には依存しない。
    const convergenceElapsed = context.nowMs - context.startMs;
    const progress = smoothstep(convergenceElapsed / Math.max(1, params.shuffleDuration));
    source.text = createShuffledText(
      originalText,
      progress,
      context.nowMs,
      params.shuffleRate,
      params.shuffleCharset,
      context.seed + context.index * 1009
    );
  }

  private updateWarpFilter(
    source: EffectContainer,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    const enabled = params.organicEnabled || params.surfaceEnabled;
    if (!enabled) {
      this.removeWarpFilter(source);
      return;
    }

    if (!source.__kineticEffectFilter) {
      source.__kineticEffectFilter = new PIXI.Filter(undefined, fragmentShader, {
        uTime: 0,
        uOrganicAmplitude: 0,
        uOrganicFrequency: 1,
        uOrganicSpeed: 1,
        uSurfaceCurve: 0,
        uSurfaceMode: 0,
        uSurfaceRepeat: 1
      });
      source.__kineticEffectFilter.padding = Math.max(40, source.height * 0.4);
      source.filters = [...(source.filters || []), source.__kineticEffectFilter];
    }

    const filter = source.__kineticEffectFilter;
    filter.padding = Math.max(40, source.height * 0.4);
    filter.uniforms.uTime = context.nowMs / 1000;
    filter.uniforms.uOrganicAmplitude = params.organicEnabled
      ? params.organicAmplitude * context.intensity
      : 0;
    filter.uniforms.uOrganicFrequency = params.organicFrequency;
    filter.uniforms.uOrganicSpeed = params.organicSpeed;
    filter.uniforms.uSurfaceCurve = params.surfaceEnabled
      ? params.surfaceCurve * context.intensity
      : 0;
    filter.uniforms.uSurfaceMode = params.surfaceEnabled
      ? ({ ribbon: 1, cylinder: 2, torus: 3 } as const)[params.surfaceShape]
      : 0;
    filter.uniforms.uSurfaceRepeat = params.surfaceEnabled ? params.surfaceRepeat : 1;
  }

  private removeWarpFilter(source?: EffectContainer): void {
    if (!source?.__kineticEffectFilter) return;
    source.filters = (source.filters || []).filter(filter => filter !== source.__kineticEffectFilter);
    source.__kineticEffectFilter.destroy();
    delete source.__kineticEffectFilter;
  }

  private updateRepetition(
    container: PIXI.Container,
    visualSource: PIXI.Container,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    if (!params.repetitionEnabled) {
      clearByPrefix(container, 'repeat-');
      return;
    }
    const count = Math.max(1, Math.round(params.repetitionCount));
    for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
      const clone = ensureGroupClone(container, visualSource, `${EFFECT_PREFIX}repeat-${copyIndex}`);
      const depth = (copyIndex + 1) / count;
      const phase = context.nowMs * 0.0018 + copyIndex * 0.38 + context.index;
      const direction = copyIndex % 2 === 0 ? 1 : -1;
      clone.position.set(
        direction * params.repetitionSpread * (copyIndex + 1) + Math.sin(phase) * 5 * context.intensity,
        -params.repetitionSpread * 0.32 * (copyIndex + 1)
      );
      const scale = Math.max(0.18, 1 - depth * params.repetitionDepth);
      clone.scale.set(scale);
      clone.alpha = Math.max(0.04, 0.52 * (1 - depth * 0.82));
      clone.blendMode = PIXI.BLEND_MODES.SCREEN;
    }
    container.children
      .filter(child => child.name?.startsWith(`${EFFECT_PREFIX}repeat-`))
      .slice(count)
      .forEach(destroyDisplayObject);
  }

  private updateDestruction(
    container: PIXI.Container,
    source: PIXI.Text,
    visualSource: PIXI.Container,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    const amount = params.destructionEnabled
      ? destructionEnvelope(context.nowMs - context.startMs, params.destructionDuration) * params.destructionStrength * context.intensity
      : 0;
    if (amount <= 0.001) {
      clearByPrefix(container, 'destroy-');
      source.alpha = 1;
      visualSource.alpha = 1;
      return;
    }

    const count = Math.max(2, Math.round(params.destructionSlices));
    source.alpha = Math.max(0.05, 1 - amount * 0.92);
    visualSource.alpha = source.alpha;
    for (let sliceIndex = 0; sliceIndex < count; sliceIndex += 1) {
      const name = `${EFFECT_PREFIX}destroy-${sliceIndex}`;
      let fragment = container.children.find(child => child.name === name) as PIXI.Container | undefined;
      let fragmentText: PIXI.Container;
      let mask: PIXI.Graphics;
      if (!fragment) {
        fragment = new PIXI.Container();
        fragment.name = name;
        fragmentText = new PIXI.Container();
        syncTextGroup(fragmentText, visualSource);
        mask = new PIXI.Graphics();
        fragment.addChild(fragmentText, mask);
        fragmentText.mask = mask;
        container.addChild(fragment);
      } else {
        fragmentText = fragment.children[0] as PIXI.Container;
        mask = fragment.children[1] as PIXI.Graphics;
      }
      syncTextGroup(fragmentText, visualSource);
      const sliceHeight = Math.max(1, visualSource.height / count);
      mask.clear();
      mask.beginFill(0xffffff);
      mask.drawRect(
        -visualSource.width / 2 - 4,
        -visualSource.height / 2 + sliceHeight * sliceIndex,
        visualSource.width + 8,
        sliceHeight + 1
      );
      mask.endFill();
      const noiseX = deterministicNoise(context.seed + context.index * 211 + sliceIndex * 43);
      const noiseY = deterministicNoise(context.seed + context.index * 223 + sliceIndex * 59);
      fragment.position.set(noiseX * 52 * amount, noiseY * 24 * amount + Math.abs(noiseX) * 20 * amount);
      fragment.rotation = noiseX * 0.16 * amount;
      fragment.alpha = Math.max(0, 1 - amount * 0.35);
    }
    container.children
      .filter(child => child.name?.startsWith(`${EFFECT_PREFIX}destroy-`))
      .slice(count)
      .forEach(destroyDisplayObject);
  }

  private updateEmitters(
    container: PIXI.Container,
    bounds: PIXI.Rectangle,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    if (!params.emittersEnabled || context.nowMs < context.startMs) {
      clearByPrefix(container, 'emitter-');
      return;
    }
    const count = Math.max(1, Math.round(params.emitterCount));
    const elapsed = Math.max(0, context.nowMs - context.startMs);
    for (let particleIndex = 0; particleIndex < count; particleIndex += 1) {
      const name = `${EFFECT_PREFIX}emitter-${particleIndex}`;
      let graphic = container.children.find(child => child.name === name) as PIXI.Graphics | undefined;
      if (!graphic) {
        graphic = new PIXI.Graphics();
        graphic.name = name;
        container.addChild(graphic);
      }
      if (params.emitterStyle === 'speedLines') {
        graphic.clear();
        this.drawSpeedLine(graphic, bounds, params, context, particleIndex, count, elapsed);
        continue;
      }
      const base = context.seed + context.index * 997 + particleIndex * 73;
      const cycle = (elapsed / (900 + Math.abs(deterministicNoise(base)) * 1100) + particleIndex / count) % 1;
      const angle = deterministicNoise(base + 17) * Math.PI + cycle * TAU * 0.16;
      const radius = params.emitterRadius * (0.18 + cycle * 0.82) * context.intensity;
      const x = bounds.x + bounds.width / 2 + Math.cos(angle) * radius + deterministicNoise(base + 29) * bounds.width * 0.36;
      const y = bounds.y + bounds.height / 2 + Math.sin(angle) * radius + deterministicNoise(base + 37) * bounds.height * 0.45;
      const size = 2 + Math.abs(deterministicNoise(base + 41)) * 8;
      graphic.clear();
      this.drawEmitter(graphic, params.emitterStyle, size, base);
      graphic.position.set(x, y);
      graphic.alpha = Math.sin(cycle * Math.PI) * 0.82;
      graphic.rotation = angle + cycle * TAU;
    }
    container.children
      .filter(child => child.name?.startsWith(`${EFFECT_PREFIX}emitter-`))
      .slice(count)
      .forEach(destroyDisplayObject);
  }

  private drawEmitter(graphic: PIXI.Graphics, style: EmitterStyle, size: number, seed: number): void {
    if (style === 'eyes') {
      graphic.beginFill(0xf3f0e8, 0.95);
      graphic.drawEllipse(0, 0, size * 1.6, size);
      graphic.endFill();
      graphic.beginFill(0x151515, 1);
      graphic.drawCircle(deterministicNoise(seed + 7) * size * 0.35, 0, size * 0.42);
      graphic.endFill();
      return;
    }
    if (style === 'bubbles') {
      graphic.lineStyle(1.5, 0xffffff, 0.82);
      graphic.drawCircle(0, 0, size);
      return;
    }
    if (style === 'noise') {
      graphic.beginFill(deterministicNoise(seed + 3) > 0 ? 0xff245f : 0x20e3ff, 0.9);
      graphic.drawRect(-size, -size * 0.35, size * 2, size * 0.7);
      graphic.endFill();
      return;
    }
    graphic.beginFill(0xffffff, 0.9);
    graphic.drawPolygon([0, -size, size * 0.7, size, 0, size * 0.45, -size * 0.7, size]);
    graphic.endFill();
  }

  /**
   * DOUBLE OUTLINE: 歌唱開始の瞬間、本体と同色の輪郭だけを外側へ拡散させて打撃感を出す。
   * 輪郭は 2px から spread px まで広がり、α 0.8 から急速に消える。
   */
  private updateImpactOutline(
    container: PIXI.Container,
    visualSource: PIXI.Container,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    const duration = Math.max(1, params.impactOutlineDuration);
    if (!params.impactOutlineEnabled) {
      clearByPrefix(container, 'outline-');
      return;
    }
    if (params.impactOutlineTrigger === 'character') {
      clearByPrefix(container, 'outline-0');
      this.updateCharacterOutlines(container, visualSource, params, context, duration);
      return;
    }
    clearByPrefix(container, 'outline-chars');

    const elapsed = context.nowMs - context.startMs;
    if (elapsed < 0 || elapsed > duration) {
      clearByPrefix(container, 'outline-0');
      return;
    }
    const progress = elapsed / duration;
    const clone = ensureGroupClone(container, visualSource, `${EFFECT_PREFIX}outline-0`);
    clone.children.forEach(child => {
      if (child instanceof PIXI.Text) child.style = this.getOutlineStyle(child.style as PIXI.TextStyle, params.impactOutlineThickness);
    });
    const offset = 2 + (params.impactOutlineSpread - 2) * smoothstep(Math.min(1, progress * 1.6)) * context.intensity;
    const halfHeight = Math.max(1, visualSource.height / 2);
    clone.scale.set(1 + offset / halfHeight);
    clone.alpha = 0.8 * Math.pow(1 - progress, 2);
  }

  /** 文字ごとの歌唱開始時刻で、その文字だけの輪郭を拡散させる。 */
  private updateCharacterOutlines(
    container: PIXI.Container,
    visualSource: PIXI.Container,
    params: TypographyEffectParams,
    context: TypographyEffectContext,
    duration: number
  ): void {
    const characters = visualSource.children.filter((child): child is PIXI.Text => child instanceof PIXI.Text);
    const starts = context.characterStartsMs || [];
    const active = characters
      .map((character, characterIndex) => ({ character, elapsed: context.nowMs - (starts[characterIndex] ?? context.startMs) }))
      .filter(entry => entry.elapsed >= 0 && entry.elapsed <= duration);
    if (active.length === 0) {
      clearByPrefix(container, 'outline-chars');
      return;
    }

    const name = `${EFFECT_PREFIX}outline-chars`;
    let group = container.children.find(child => child.name === name) as PIXI.Container | undefined;
    if (!group) {
      group = new PIXI.Container();
      group.name = name;
      container.addChildAt(group, Math.max(0, container.getChildIndex(visualSource)));
    }
    active.forEach(({ character, elapsed }, slot) => {
      let outline = group!.children[slot] as PIXI.Text | undefined;
      if (!outline) {
        outline = new PIXI.Text(character.text);
        outline.anchor.set(character.anchor.x, character.anchor.y);
        group!.addChild(outline);
      }
      outline.text = character.text;
      outline.style = this.getOutlineStyle(character.style as PIXI.TextStyle, params.impactOutlineThickness);
      const progress = elapsed / duration;
      const offset = 2 + (params.impactOutlineSpread - 2) * smoothstep(Math.min(1, progress * 1.6)) * context.intensity;
      const halfHeight = Math.max(1, character.height / 2);
      outline.position.set(character.x, character.y);
      outline.rotation = character.rotation;
      outline.scale.set(character.scale.x * (1 + offset / halfHeight), character.scale.y * (1 + offset / halfHeight));
      outline.alpha = 0.8 * Math.pow(1 - progress, 2);
    });
    group.children.slice(active.length).forEach(destroyDisplayObject);
  }

  private readonly outlineStyles = new WeakMap<PIXI.TextStyle, Map<number, PIXI.TextStyle>>();

  /** 塗りを抜いて本体色の線だけにした文字スタイル。元スタイルと太さ単位でキャッシュする。 */
  private getOutlineStyle(style: PIXI.TextStyle, thickness: number): PIXI.TextStyle {
    let byThickness = this.outlineStyles.get(style);
    if (!byThickness) {
      byThickness = new Map();
      this.outlineStyles.set(style, byThickness);
    }
    const cached = byThickness.get(thickness);
    if (cached) return cached;
    const outline = style.clone();
    outline.stroke = Array.isArray(style.fill) ? String(style.fill[0]) : String(style.fill);
    outline.strokeThickness = Math.max(0.5, thickness);
    outline.fill = 'rgba(0,0,0,0)';
    outline.dropShadow = false;
    byThickness.set(thickness, outline);
    return outline;
  }

  /**
   * SPEED LINES: 語を中心にした放射状の集中線。既定12fpsで線の位置と長さを引き直し、
   * 滑らかに補間しないことで打撃的な速度感を出す。
   */
  private drawSpeedLine(
    graphic: PIXI.Graphics,
    bounds: PIXI.Rectangle,
    params: TypographyEffectParams,
    context: TypographyEffectContext,
    lineIndex: number,
    count: number,
    elapsed: number
  ): void {
    const frame = Math.floor(elapsed / (1000 / Math.max(1, params.emitterLineRate)));
    const base = context.seed + context.index * 997 + lineIndex * 73 + frame * 389;
    const angle = (lineIndex / count) * TAU + deterministicNoise(base) * (Math.PI / count);
    const inner = Math.max(bounds.width, bounds.height) * params.emitterInnerRadius
      + Math.abs(deterministicNoise(base + 11)) * 24;
    const length = params.emitterRadius * (0.4 + 0.6 * Math.abs(deterministicNoise(base + 13))) * context.intensity;
    const thickness = params.emitterLineWidth * (0.3 + 0.7 * Math.abs(deterministicNoise(base + 17)));
    graphic.beginFill(0xffffff, 0.85);
    graphic.drawPolygon([inner, -thickness / 2, inner + length, 0, inner, thickness / 2]);
    graphic.endFill();
    graphic.position.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    graphic.rotation = angle;
    graphic.alpha = deterministicNoise(base + 19) > -0.45 ? 0.75 : 0;
  }

  private updateSurfaceCopies(
    container: PIXI.Container,
    visualSource: PIXI.Container,
    bounds: PIXI.Rectangle,
    params: TypographyEffectParams,
    context: TypographyEffectContext
  ): void {
    if (!params.surfaceEnabled) {
      clearByPrefix(container, 'surface-');
      return;
    }
    const count = Math.max(2, Math.min(12, Math.round(params.surfaceRepeat * 2)));
    for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
      // 文字グループを写し、カーニングやベースラインウェーブ後の見た目を曲面に並べる。
      const clone = ensureGroupClone(container, visualSource, `${EFFECT_PREFIX}surface-${copyIndex}`);
      const unit = copyIndex / Math.max(1, count - 1);
      const angle = unit * TAU + context.nowMs * 0.00035;
      if (params.surfaceShape === 'torus') {
        clone.position.set(Math.sin(angle) * bounds.width * 0.42, Math.cos(angle) * bounds.height * 0.72);
        clone.scale.set(0.28 + (Math.cos(angle) + 1) * 0.18);
        clone.rotation = Math.sin(angle) * 0.22;
      } else if (params.surfaceShape === 'cylinder') {
        clone.position.set(Math.sin(angle) * bounds.width * 0.38, (unit - 0.5) * bounds.height * 1.2);
        clone.scale.set(0.25 + Math.abs(Math.cos(angle)) * 0.38, 0.5);
        clone.rotation = 0;
      } else {
        clone.position.set((unit - 0.5) * bounds.width * 1.4, Math.sin(angle) * bounds.height * 0.5);
        clone.scale.set(0.34);
        clone.rotation = Math.cos(angle) * 0.12;
      }
      clone.alpha = 0.08 + Math.max(0, Math.cos(angle)) * 0.24;
      // Container は blendMode を持たないため、各文字へ設定する。
      clone.children.forEach(child => {
        if (child instanceof PIXI.Text) child.blendMode = PIXI.BLEND_MODES.SCREEN;
      });
    }
    container.children
      .filter(child => child.name?.startsWith(`${EFFECT_PREFIX}surface-`))
      .slice(count)
      .forEach(destroyDisplayObject);
  }
}
