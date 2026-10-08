export type EasingName =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeOutQuint'
  | 'easeInOutSine'
  | 'easeOutExpo'
  | 'easeInBack'
  | 'easeOutBack';

export interface MotionState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  skewX: number;
  skewY: number;
  /** ガウスぼかし半径(px)。合成時は加算。 */
  blur: number;
  /** 各辺から隠す割合(0〜1)。マスク開閉に使い、合成時は加算。 */
  clipTop: number;
  clipBottom: number;
  clipLeft: number;
  clipRight: number;
}

export interface MotionContext {
  seed: number;
  index: number;
  total: number;
  intensity: number;
  /** 動かす要素のおおよその幅(px)。端を回転軸にする動きなどで使う。 */
  width?: number;
}

export interface MotionClip {
  readonly duration: number;
  sample(timeMs: number, context: MotionContext): MotionState;
}

export const IDENTITY_MOTION: MotionState = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  alpha: 1,
  skewX: 0,
  skewY: 0,
  blur: 0,
  clipTop: 0,
  clipBottom: 0,
  clipLeft: 0,
  clipRight: 0
};

const easingFunctions: Record<EasingName, (value: number) => number> = {
  linear: value => value,
  easeInQuad: value => value * value,
  easeOutQuad: value => 1 - (1 - value) * (1 - value),
  easeInCubic: value => value * value * value,
  easeOutCubic: value => 1 - Math.pow(1 - value, 3),
  easeInOutCubic: value => value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2,
  easeInQuart: value => value * value * value * value,
  easeOutQuart: value => 1 - Math.pow(1 - value, 4),
  easeOutQuint: value => 1 - Math.pow(1 - value, 5),
  easeInOutSine: value => -(Math.cos(Math.PI * value) - 1) / 2,
  easeOutExpo: value => value === 1 ? 1 : 1 - Math.pow(2, -10 * value),
  easeInBack: value => {
    const overshoot = 1.70158;
    return (overshoot + 1) * value * value * value - overshoot * value * value;
  },
  easeOutBack: value => {
    const overshoot = 1.70158;
    return 1 + (overshoot + 1) * Math.pow(value - 1, 3) + overshoot * Math.pow(value - 1, 2);
  }
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function applyEasing(name: EasingName, value: number): number {
  return easingFunctions[name](clamp01(value));
}

function stateWith(values: Partial<MotionState>): MotionState {
  return { ...IDENTITY_MOTION, ...values };
}

export function combineMotionStates(...states: MotionState[]): MotionState {
  return states.reduce<MotionState>((combined, state) => ({
    x: combined.x + state.x,
    y: combined.y + state.y,
    scaleX: combined.scaleX * state.scaleX,
    scaleY: combined.scaleY * state.scaleY,
    rotation: combined.rotation + state.rotation,
    alpha: combined.alpha * state.alpha,
    skewX: combined.skewX + state.skewX,
    skewY: combined.skewY + state.skewY,
    blur: combined.blur + state.blur,
    clipTop: combined.clipTop + state.clipTop,
    clipBottom: combined.clipBottom + state.clipBottom,
    clipLeft: combined.clipLeft + state.clipLeft,
    clipRight: combined.clipRight + state.clipRight
  }), { ...IDENTITY_MOTION });
}

export function motion(
  duration: number,
  sampler: (timeMs: number, context: MotionContext) => Partial<MotionState>
): MotionClip {
  return {
    duration,
    sample(timeMs, context) {
      const clampedTime = Number.isFinite(duration)
        ? Math.min(Math.max(timeMs, 0), duration)
        : Math.max(timeMs, 0);
      return stateWith(sampler(clampedTime, context));
    }
  };
}

export function tween(
  duration: number,
  from: Partial<MotionState>,
  to: Partial<MotionState>,
  easing: EasingName = 'easeOutCubic'
): MotionClip {
  const keys = Array.from(new Set([...Object.keys(from), ...Object.keys(to)])) as Array<keyof MotionState>;
  return motion(duration, timeMs => {
    const progress = applyEasing(easing, duration <= 0 ? 1 : timeMs / duration);
    const result: Partial<MotionState> = {};
    keys.forEach(key => {
      const start = from[key] ?? IDENTITY_MOTION[key];
      const end = to[key] ?? IDENTITY_MOTION[key];
      result[key] = start + (end - start) * progress;
    });
    return result;
  });
}

export function parallel(...clips: MotionClip[]): MotionClip {
  const duration = clips.reduce((maximum, clip) => Math.max(maximum, clip.duration), 0);
  return motion(duration, (timeMs, context) =>
    combineMotionStates(...clips.map(clip => clip.sample(timeMs, context)))
  );
}

export function sequence(...clips: MotionClip[]): MotionClip {
  const duration = clips.reduce((total, clip) => total + clip.duration, 0);
  return motion(duration, (timeMs, context) => {
    const states: MotionState[] = [];
    let cursor = 0;

    for (const clip of clips) {
      if (timeMs >= cursor + clip.duration) {
        states.push(clip.sample(clip.duration, context));
        cursor += clip.duration;
        continue;
      }
      states.push(clip.sample(timeMs - cursor, context));
      break;
    }

    return combineMotionStates(...states);
  });
}

export function delay(delayMs: number, clip: MotionClip): MotionClip {
  return motion(delayMs + clip.duration, (timeMs, context) =>
    clip.sample(Math.max(0, timeMs - delayMs), context)
  );
}

export function repeat(clip: MotionClip, count = Number.POSITIVE_INFINITY): MotionClip {
  const duration = Number.isFinite(count) ? clip.duration * Math.max(0, count) : Number.POSITIVE_INFINITY;
  return motion(duration, (timeMs, context) => {
    if (clip.duration <= 0) return clip.sample(0, context);
    if (Number.isFinite(duration) && timeMs >= duration) return clip.sample(clip.duration, context);
    return clip.sample(timeMs % clip.duration, context);
  });
}

/** 時刻とseedだけから値を生成するため、フレーム順序やシーク方向に依存しない。 */
export function deterministicNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
