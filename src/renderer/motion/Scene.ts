import {
  MotionClip,
  MotionContext,
  MotionState,
  EasingName,
  applyEasing,
  deterministicNoise,
  motion,
  parallel,
  repeat,
  tween
} from './Motion';
import {
  MotionTuning,
  directionVector,
  tuningNumber,
  tuningString
} from './MotionTuning';

export type LayoutName = 'center' | 'random' | 'circle' | 'vertical' | 'fill';
/** 出現・消失の両方向で共通に選べる動き。 */
export type TransitionName =
  | 'slam' | 'slide' | 'scale' | 'collapse' | 'fall' | 'shatter' | 'noise' | 'instant'
  | 'soft' | 'anticipate' | 'spring' | 'bounce' | 'turnstile' | 'mask' | 'genie';
export type EntranceName = TransitionName;
export type ExitName = TransitionName;
export type SustainName = 'still' | 'shake' | 'pulse' | 'breathe' | 'glitch' | 'compress';
export type ScreenMotionName = 'none' | 'cameraShake' | 'zoom' | 'rgbDrift' | 'afterimage' | 'whipPan' | 'zoomDive';
export type EasingSelection = EasingName | 'auto';

const transitionNames: TransitionName[] = [
  'slam', 'slide', 'scale', 'collapse', 'fall', 'shatter', 'noise', 'instant',
  'soft', 'anticipate', 'spring', 'bounce', 'turnstile', 'mask', 'genie'
];

/**
 * 統合・廃止した旧モーション名。保存済みプロジェクトやプリセットの値を読み替える。
 * - characterBreak（出現）と shatter（消失）は同じ飛散の往復なので shatter に統一
 * - hardStop（消失）と instant（出現）は同じ即時切替なので instant に統一
 * - multiply（継続）は pulse とほぼ同じ拡大縮小だったため breathe に置換
 */
const legacyMotionAliases: Record<string, string> = {
  characterBreak: 'shatter',
  hardStop: 'instant',
  multiply: 'breathe'
};

export function normalizeMotionName(name: string): string {
  return legacyMotionAliases[name] ?? name;
}

export interface SceneDefinition {
  layout: LayoutName;
  entrance: EntranceName;
  sustain: SustainName;
  exit: ExitName;
  screen: ScreenMotionName;
}

export interface LayoutContext extends MotionContext {
  width: number;
  height: number;
  fontSize: number;
  spacing: number;
}

export interface LayoutResult {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export const sceneCatalog = {
  layouts: ['center', 'random', 'circle', 'vertical', 'fill'] as LayoutName[],
  entrances: transitionNames,
  sustains: ['still', 'shake', 'pulse', 'breathe', 'glitch', 'compress'] as SustainName[],
  exits: transitionNames,
  screens: ['none', 'cameraShake', 'zoom', 'rgbDrift', 'afterimage', 'whipPan', 'zoomDive'] as ScreenMotionName[],
  easings: [
    'auto', 'linear', 'easeInQuad', 'easeOutQuad', 'easeInCubic', 'easeOutCubic',
    'easeInOutCubic', 'easeInQuart', 'easeOutQuart', 'easeOutQuint',
    'easeInOutSine', 'easeOutExpo', 'easeInBack', 'easeOutBack'
  ] as EasingSelection[]
};

export function calculateLayout(name: LayoutName, context: LayoutContext): LayoutResult {
  const { index, total, fontSize, spacing, width, height, seed } = context;
  const centeredIndex = index - (total - 1) / 2;

  switch (name) {
    case 'random':
      return {
        x: deterministicNoise(seed + index * 17) * width * 0.34,
        y: deterministicNoise(seed + index * 31) * height * 0.28,
        rotation: deterministicNoise(seed + index * 47) * 0.12,
        scale: 0.82 + Math.abs(deterministicNoise(seed + index * 61)) * 0.5
      };
    case 'circle': {
      const angle = -Math.PI / 2 + (index / Math.max(1, total)) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.28;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, rotation: angle + Math.PI / 2, scale: 1 };
    }
    case 'vertical':
      return { x: 0, y: centeredIndex * fontSize * spacing, rotation: 0, scale: 1 };
    case 'fill': {
      const columns = Math.max(1, Math.ceil(Math.sqrt(total * (width / Math.max(height, 1)))));
      const rows = Math.max(1, Math.ceil(total / columns));
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        x: (column - (columns - 1) / 2) * Math.min(fontSize * spacing, width / columns),
        y: (row - (rows - 1) / 2) * Math.min(fontSize * 1.15, height / rows),
        rotation: 0,
        scale: Math.min(1.35, Math.max(0.65, width / columns / Math.max(fontSize, 1) * 0.72))
      };
    }
    case 'center':
    default:
      return { x: centeredIndex * fontSize * spacing, y: 0, rotation: 0, scale: 1 };
  }
}

export function createEntrance(
  name: EntranceName,
  duration: number,
  easing: EasingSelection = 'auto',
  tuning: MotionTuning = {}
): MotionClip {
  const resolvedEasing: EasingName = easing === 'auto'
    ? autoEntranceEasing(name)
    : easing;
  const sampleProgress = (timeMs: number): number =>
    applyEasing(resolvedEasing, timeMs / Math.max(1, duration));
  switch (normalizeMotionName(name) as EntranceName) {
    case 'soft':
      // SOFT ENTER: 下から短く持ち上がり、ぼけた輪郭が澄む。
      return motion(duration, timeMs => {
        const eased = sampleProgress(timeMs);
        return {
          y: tuningNumber(tuning, 'SoftDistance', 24) * (1 - eased),
          blur: tuningNumber(tuning, 'SoftBlur', 7) * (1 - eased),
          alpha: eased
        };
      });
    case 'anticipate':
      return motion(duration, timeMs => sampleAnticipation(sampleProgress(timeMs), 'in', tuning));
    case 'spring':
      // SPRING / SECOND ORDER: 減衰ばねの応答で、行き過ぎを数回残して静止する。
      return motion(duration, timeMs => {
        const progress = sampleProgress(timeMs);
        const startScale = tuningNumber(tuning, 'SpringStartScale', 0);
        const scale = startScale + (1 - startScale) * sampleDampedSpring(progress, tuning);
        return { scaleX: scale, scaleY: scale, alpha: Math.min(1, progress * 4) };
      });
    case 'bounce':
      return motion(duration, timeMs => sampleBounceIn(sampleProgress(timeMs), tuning));
    case 'turnstile':
      return motion(duration, (timeMs, context) => sampleTurnstile(sampleProgress(timeMs), context, 'in', tuning));
    case 'mask':
      // MASKING: マスクが起点の辺から開き、中身は別の速度で縮んで段差を作る。
      return motion(duration, timeMs => {
        const progress = Math.min(1, timeMs / Math.max(1, duration));
        const content = applyEasing('easeOutCubic', progress);
        const startScale = tuningNumber(tuning, 'MaskScale', 1.35);
        const scale = startScale + (1 - startScale) * content;
        const edge = tuningString(tuning, 'MaskDirection', 'bottom');
        const toward = directionVector(edge);
        const offset = tuningNumber(tuning, 'MaskOffset', 24) * (1 - content);
        return {
          ...clipFromEdge(oppositeEdge(edge), 1 - sampleProgress(timeMs)),
          x: -toward.x * offset,
          y: -toward.y * offset,
          scaleX: scale,
          scaleY: scale
        };
      });
    case 'genie':
      // GENIE の復帰側: 受け口から減速しながら横幅を遅れて広げる。
      return motion(duration, timeMs => {
        const progress = Math.min(1, timeMs / Math.max(1, duration));
        const eased = sampleProgress(timeMs);
        const widthProgress = applyEasing(resolvedEasing, Math.max(0, (progress - 0.12) / 0.88));
        const squeeze = tuningNumber(tuning, 'GenieSqueeze', 0.96);
        const toward = directionVector(tuningString(tuning, 'GenieDirection', 'bottom'));
        const distance = tuningNumber(tuning, 'GenieDistance', 260) * (1 - eased);
        return {
          ...genieShape((1 - squeeze) + squeeze * widthProgress, 0.2 + 0.8 * eased, toward),
          // 吸い込み口の辺から出てくる
          x: -toward.x * distance,
          y: -toward.y * distance,
          alpha: Math.min(1, progress * 5)
        };
      });
    case 'slam': {
      const startScale = tuningNumber(tuning, 'SlamScale', 3.2);
      return parallel(
        tween(duration, { scaleX: startScale, scaleY: startScale }, { scaleX: 1, scaleY: 1 }, resolvedEasing),
        tween(duration * 0.5, { alpha: 0 }, { alpha: 1 }, 'easeOutCubic')
      );
    }
    case 'slide': {
      const travel = travelVector(tuningString(tuning, 'SlideDirection', 'right'));
      const distance = tuningNumber(tuning, 'SlideDistance', 280);
      const skew = tuningNumber(tuning, 'SlideSkew', 0.18);
      return tween(
        duration,
        { x: -travel.x * distance, y: -travel.y * distance, alpha: 0, skewX: -skew * travel.x },
        { x: 0, y: 0, alpha: 1, skewX: 0 },
        resolvedEasing
      );
    }
    case 'scale': {
      const minimum = tuningNumber(tuning, 'ScaleMin', 0.08);
      return tween(duration, { scaleX: minimum, scaleY: minimum, alpha: 0 }, { scaleX: 1, scaleY: 1, alpha: 1 }, resolvedEasing);
    }
    case 'collapse':
      return tween(
        duration,
        { scaleY: tuningNumber(tuning, 'CollapseSquash', 0.02), scaleX: tuningNumber(tuning, 'CollapseStretch', 1.3), alpha: 0 },
        { scaleY: 1, scaleX: 1, alpha: 1 },
        resolvedEasing
      );
    case 'fall':
      return tween(
        duration,
        { y: -tuningNumber(tuning, 'FallHeight', 360), rotation: -tuningNumber(tuning, 'FallRotation', 0.35), alpha: 0 },
        { y: 0, rotation: 0, alpha: 1 },
        resolvedEasing
      );
    case 'noise':
      return motion(duration, (timeMs, context) => ({
        alpha: sampleNoiseFade(timeMs, duration, resolvedEasing, context, 'in', tuningNumber(tuning, 'NoiseFlickerMs', 35))
      }));
    case 'shatter':
      return motion(duration, (timeMs, context) => {
        const progress = Math.min(1, timeMs / Math.max(1, duration));
        const eased = applyEasing(resolvedEasing, progress);
        const spread = tuningNumber(tuning, 'ShatterSpread', 1);
        return {
          x: deterministicNoise(context.seed + context.index * 71) * 360 * spread * (1 - eased),
          y: deterministicNoise(context.seed + context.index * 97) * 240 * spread * (1 - eased),
          rotation: deterministicNoise(context.seed + context.index * 113) * 1.4 * tuningNumber(tuning, 'ShatterRotation', 1) * (1 - eased),
          alpha: eased
        };
      });
    case 'instant':
    default:
      return motion(1, () => ({}));
  }
}

export function createSustain(name: SustainName, tuning: MotionTuning = {}): MotionClip {
  switch (name) {
    case 'shake':
      return motion(Number.POSITIVE_INFINITY, (timeMs, context) => {
        const amount = tuningNumber(tuning, 'shakeAmount', 3);
        const time = timeMs * tuningNumber(tuning, 'shakeSpeed', 1);
        return {
          x: Math.sin(time * 0.045 + context.index * 1.7) * amount * context.intensity,
          y: Math.cos(time * 0.057 + context.index * 2.1) * amount * (2 / 3) * context.intensity,
          rotation: Math.sin(time * 0.031 + context.index) * tuningNumber(tuning, 'shakeRotation', 0.012) * context.intensity
        };
      });
    case 'pulse':
      return motion(Number.POSITIVE_INFINITY, (timeMs, context) => {
        const period = Math.max(1, tuningNumber(tuning, 'pulsePeriodMs', 700));
        const scale = 1 + Math.sin(timeMs * Math.PI * 2 / period) * tuningNumber(tuning, 'pulseAmount', 0.055) * context.intensity;
        return { scaleX: scale, scaleY: scale };
      });
    case 'glitch':
      return motion(Number.POSITIVE_INFINITY, (timeMs, context) => {
        const frame = Math.floor(timeMs / Math.max(1, tuningNumber(tuning, 'glitchFrameMs', 55)));
        // ノイズは -1〜1 の一様分布なので、発生頻度 f のしきい値は 1 - 2f（既定 0.21 → 0.58）。
        const threshold = 1 - 2 * tuningNumber(tuning, 'glitchFrequency', 0.21);
        const active = deterministicNoise(context.seed + frame * 19 + context.index * 7) > threshold;
        return active ? {
          x: deterministicNoise(context.seed + frame * 23) * tuningNumber(tuning, 'glitchOffset', 14) * context.intensity,
          skewX: deterministicNoise(context.seed + frame * 29) * tuningNumber(tuning, 'glitchSkew', 0.16) * context.intensity,
          alpha: 0.72 + Math.abs(deterministicNoise(context.seed + frame * 31)) * 0.28
        } : {};
      });
    case 'breathe':
      // BREATHE: 既定は吸う2.6s・止める0.6s・吐く2.4sの非対称な周期で、pulseより遅く大きく呼吸する。
      return motion(Number.POSITIVE_INFINITY, (timeMs, context) => {
        const inhaleMs = Math.max(1, tuningNumber(tuning, 'breatheInhaleMs', 2600));
        const holdMs = Math.max(0, tuningNumber(tuning, 'breatheHoldMs', 600));
        const exhaleMs = Math.max(1, tuningNumber(tuning, 'breatheExhaleMs', 2400));
        const phase = timeMs % (inhaleMs + holdMs + exhaleMs);
        const inhale = phase < inhaleMs
          ? applyEasing('easeInOutSine', phase / inhaleMs)
          : phase < inhaleMs + holdMs
            ? 1
            : 1 - applyEasing('easeInOutSine', (phase - inhaleMs - holdMs) / exhaleMs);
        const scale = 1 + inhale * tuningNumber(tuning, 'breatheAmount', 0.08) * context.intensity;
        return { scaleX: scale, scaleY: scale, alpha: 0.86 + inhale * 0.14 };
      });
    case 'compress':
      return motion(Number.POSITIVE_INFINITY, (timeMs, context) => {
        const period = Math.max(1, tuningNumber(tuning, 'compressPeriodMs', 1100));
        const wave = Math.sin(timeMs * Math.PI * 2 / period) * tuningNumber(tuning, 'compressAmount', 0.1) * context.intensity;
        return { scaleX: 1 + wave, scaleY: 1 - wave };
      });
    case 'still':
    default:
      return repeat(motion(1000, () => ({})));
  }
}

/**
 * 位置を動かさず、透明度だけをフレーム単位でランダムに点滅させながらフェードする。
 * 進行度が上がるほど表示（in）／非表示（out）のフレームが増え、最後は完全表示／非表示で終わる。
 */
function sampleNoiseFade(
  timeMs: number,
  duration: number,
  easing: EasingName,
  context: MotionContext,
  direction: 'in' | 'out',
  flickerMs = 35
): number {
  const progress = Math.min(1, Math.max(0, timeMs / Math.max(1, duration)));
  if (progress >= 1) return direction === 'in' ? 1 : 0;
  const eased = applyEasing(easing, progress);
  const visibility = direction === 'in' ? eased : 1 - eased;
  const frame = Math.floor(timeMs / Math.max(1, flickerMs));
  const threshold = (deterministicNoise(context.seed + frame * 173 + context.index * 29) + 1) / 2;
  const level = (deterministicNoise(context.seed + frame * 181 + context.index * 37) + 1) / 2;
  return threshold < visibility
    ? 0.55 + level * 0.45
    : level * 0.12 * visibility;
}

export function createExit(
  name: ExitName,
  duration: number,
  easing: EasingSelection = 'auto',
  tuning: MotionTuning = {}
): MotionClip {
  const resolvedEasing: EasingName = easing === 'auto'
    ? autoExitEasing(name)
    : easing;
  const sampleProgress = (timeMs: number): number =>
    applyEasing(resolvedEasing, timeMs / Math.max(1, duration));
  switch (normalizeMotionName(name) as ExitName) {
    case 'soft':
      // SOFT ENTER の逆: 上へ抜けながら輪郭をぼかして薄れる。
      return motion(duration, timeMs => {
        const eased = sampleProgress(timeMs);
        return {
          y: -tuningNumber(tuning, 'SoftDistance', 24) * eased,
          blur: tuningNumber(tuning, 'SoftBlur', 7) * eased,
          alpha: 1 - eased
        };
      });
    case 'anticipate':
      return motion(duration, timeMs => sampleAnticipation(sampleProgress(timeMs), 'out', tuning));
    case 'spring':
      // 入りのばね応答を時間反転し、揺れてから一気に縮む。
      return motion(duration, timeMs => {
        const progress = sampleProgress(timeMs);
        const endScale = tuningNumber(tuning, 'SpringStartScale', 0);
        const scale = endScale + (1 - endScale) * sampleDampedSpring(1 - progress, tuning);
        return { scaleX: scale, scaleY: scale, alpha: Math.min(1, (1 - progress) * 4) };
      });
    case 'bounce':
      return motion(duration, timeMs => sampleBounceOut(sampleProgress(timeMs), tuning));
    case 'turnstile':
      return motion(duration, (timeMs, context) => sampleTurnstile(sampleProgress(timeMs), context, 'out', tuning));
    case 'mask':
      // マスクが起点の辺から閉じ、残った側が反対方向へ抜けて消える。
      return motion(duration, timeMs => {
        const eased = sampleProgress(timeMs);
        const scale = 1 + (tuningNumber(tuning, 'MaskScale', 1.12) - 1) * eased;
        const edge = tuningString(tuning, 'MaskDirection', 'bottom');
        const toward = directionVector(edge);
        const offset = tuningNumber(tuning, 'MaskOffset', 24) * eased;
        return { ...clipFromEdge(edge, eased), x: toward.x * offset, y: toward.y * offset, scaleX: scale, scaleY: scale };
      });
    case 'genie':
      // GENIE: 横幅を先に絞り、加速しながら受け口へ吸い込まれる。
      return motion(duration, timeMs => {
        const progress = Math.min(1, timeMs / Math.max(1, duration));
        const eased = sampleProgress(timeMs);
        const funnel = applyEasing('easeInQuad', Math.min(1, progress * 1.25));
        const toward = directionVector(tuningString(tuning, 'GenieDirection', 'bottom'));
        const distance = tuningNumber(tuning, 'GenieDistance', 260) * eased;
        return {
          ...genieShape(1 - tuningNumber(tuning, 'GenieSqueeze', 0.96) * funnel, 1 - 0.8 * eased, toward),
          x: -toward.x * distance,
          y: -toward.y * distance,
          alpha: progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2
        };
      });
    case 'slam': {
      const endScale = tuningNumber(tuning, 'SlamScale', 3.2);
      return parallel(
        tween(duration, {}, { scaleX: endScale, scaleY: endScale }, resolvedEasing),
        tween(duration, { alpha: 1 }, { alpha: 0 }, 'easeInCubic')
      );
    }
    case 'slide': {
      const travel = travelVector(tuningString(tuning, 'SlideDirection', 'right'));
      const distance = tuningNumber(tuning, 'SlideDistance', 280);
      const skew = tuningNumber(tuning, 'SlideSkew', 0.18);
      return tween(
        duration,
        {},
        { x: travel.x * distance, y: travel.y * distance, alpha: 0, skewX: skew * travel.x },
        resolvedEasing
      );
    }
    case 'scale': {
      const minimum = tuningNumber(tuning, 'ScaleMin', 0.08);
      return tween(duration, {}, { scaleX: minimum, scaleY: minimum, alpha: 0 }, resolvedEasing);
    }
    case 'collapse':
      return tween(
        duration,
        {},
        { scaleY: tuningNumber(tuning, 'CollapseSquash', 0.02), scaleX: tuningNumber(tuning, 'CollapseStretch', 1.3), alpha: 0 },
        resolvedEasing
      );
    case 'fall':
      return tween(
        duration,
        {},
        { y: tuningNumber(tuning, 'FallHeight', 360), rotation: tuningNumber(tuning, 'FallRotation', 0.35), alpha: 0 },
        resolvedEasing
      );
    case 'shatter':
      return motion(duration, (timeMs, context) => {
        const progress = Math.min(1, timeMs / Math.max(1, duration));
        const eased = applyEasing(resolvedEasing, progress);
        const spread = tuningNumber(tuning, 'ShatterSpread', 1);
        return {
          x: deterministicNoise(context.seed + context.index * 131) * 420 * spread * eased,
          y: (80 + Math.abs(deterministicNoise(context.seed + context.index * 149)) * 380) * spread * eased,
          rotation: deterministicNoise(context.seed + context.index * 167) * 2.4 * tuningNumber(tuning, 'ShatterRotation', 1) * eased,
          alpha: Math.max(0, 1 - applyEasing('easeInQuad', progress))
        };
      });
    case 'noise':
      return motion(duration, (timeMs, context) => ({
        alpha: sampleNoiseFade(timeMs, duration, resolvedEasing, context, 'out', tuningNumber(tuning, 'NoiseFlickerMs', 35))
      }));
    case 'instant':
    default:
      return tween(Math.min(45, duration), { alpha: 1 }, { alpha: 0 }, 'linear');
  }
}

function autoEntranceEasing(name: EntranceName): EasingName {
  switch (normalizeMotionName(name)) {
    case 'slam':
    case 'scale':
      return 'easeOutBack';
    // 物理モデル系は時間を等速で進め、曲線はモデル側で作る。
    case 'spring':
    case 'bounce':
    case 'anticipate':
      return 'linear';
    case 'turnstile':
    case 'mask':
      return 'easeOutQuart';
    default:
      return 'easeOutCubic';
  }
}

function autoExitEasing(name: ExitName): EasingName {
  switch (normalizeMotionName(name)) {
    case 'fall':
    case 'soft':
      return 'easeInQuad';
    case 'spring':
    case 'bounce':
    case 'anticipate':
      return 'linear';
    default:
      return 'easeInCubic';
  }
}

/**
 * 2次系（減衰ばね）のステップ応答。既定は減衰比0.42・固有角周波数11。
 * p=1で1に一致するよう残差を補正する。
 */
function sampleDampedSpring(progress: number, tuning?: MotionTuning): number {
  const damping = Math.min(0.99, Math.max(0.05, tuningNumber(tuning, 'SpringDamping', 0.42)));
  const omega = Math.max(0.5, tuningNumber(tuning, 'SpringFrequency', 11));
  const dampedOmega = omega * Math.sqrt(1 - damping * damping);
  const response = (value: number): number => 1 - Math.exp(-damping * omega * value) * (
    Math.cos(dampedOmega * value) + (damping / Math.sqrt(1 - damping * damping)) * Math.sin(dampedOmega * value)
  );
  const clamped = Math.min(1, Math.max(0, progress));
  return response(clamped) + (1 - response(1)) * clamped;
}

/** 移動の向き（right/left/down/up）を単位ベクトルにする。 */
function travelVector(direction: string): { x: number; y: number } {
  switch (direction) {
    case 'left': return { x: -1, y: 0 };
    case 'down': return { x: 0, y: 1 };
    case 'up': return { x: 0, y: -1 };
    case 'right':
    default: return { x: 1, y: 0 };
  }
}

/**
 * ANTICIPATION: 本動作の一部（既定28%）を逆方向への溜めに使い、
 * 本動作後は減衰正弦で行き過ぎを戻す。
 */
function sampleAnticipation(progress: number, direction: 'in' | 'out', tuning?: MotionTuning): Partial<MotionState> {
  const windUp = Math.min(0.9, Math.max(0.01, tuningNumber(tuning, 'AnticipateWindUp', 0.28)));
  const pull = tuningNumber(tuning, 'AnticipatePull', 36);
  const travel = travelVector(tuningString(tuning, 'AnticipateDirection', 'right'));
  const along = (offset: number) => ({ x: travel.x * offset, y: travel.y * offset });
  // 横移動のときだけ進行方向へ傾ける。
  const lean = (amount: number) => ({ skewX: amount * travel.x });
  if (direction === 'in') {
    const distance = tuningNumber(tuning, 'AnticipateDistance', 260);
    const overshoot = tuningNumber(tuning, 'AnticipateOvershoot', 14);
    if (progress < windUp) {
      const local = progress / windUp;
      return { ...along(-distance - pull * applyEasing('easeOutQuad', local)), ...lean(0.06 * local), alpha: 0.45 * local };
    }
    const local = (progress - windUp) / (1 - windUp);
    const main = applyEasing('easeOutCubic', Math.min(1, local / 0.55));
    let offset = -(distance + pull) * (1 - main);
    if (local > 0.55) {
      const settle = (local - 0.55) / 0.45;
      offset += overshoot * Math.sin(settle * Math.PI * 2) * (1 - settle) * (1 - settle);
    }
    return { ...along(offset), ...lean(-0.16 * (1 - main)), alpha: 0.45 + 0.55 * Math.min(1, local * 3) };
  }

  const distance = tuningNumber(tuning, 'AnticipateDistance', 294);
  if (progress < windUp) {
    const local = progress / windUp;
    return { ...along(-pull * applyEasing('easeOutQuad', local)), ...lean(-0.05 * local) };
  }
  const local = (progress - windUp) / (1 - windUp);
  return {
    ...along(-pull + (distance + pull) * applyEasing('easeInCubic', local)),
    ...lean(0.16 * local),
    alpha: 1 - applyEasing('easeInQuad', local)
  };
}

/**
 * SQUASH & STRETCH: 既定は反発係数0.62で3回弾む落下を解析解で評価する。
 * 速度に比例して縦へ伸ばし、接地の瞬間だけ潰す。面積は scaleX = 1 / scaleY で保つ。
 */
function sampleBounceIn(progress: number, tuning?: MotionTuning): Partial<MotionState> {
  const height = tuningNumber(tuning, 'BounceHeight', 320);
  const restitution = Math.min(0.95, Math.max(0, tuningNumber(tuning, 'BounceRestitution', 0.62)));
  const bounces = Math.max(0, Math.round(tuningNumber(tuning, 'BounceCount', 3)));
  const deform = Math.max(0, tuningNumber(tuning, 'BounceSquash', 0.3));
  let total = 1;
  for (let bounce = 1; bounce <= bounces; bounce += 1) total += 2 * Math.pow(restitution, bounce);
  const fallTime = 1 / total;
  const gravity = 2 * height / (fallTime * fallTime);
  const maxSpeed = gravity * fallTime;
  // 最後の8%は着地後の潰れを戻す静止区間として残す。
  const time = Math.min(1, Math.max(0, progress)) / 0.92;

  let y = 0;
  let velocity = 0;
  let impactDistance = Number.POSITIVE_INFINITY;
  let impactStrength = 0;
  if (time < fallTime) {
    y = -height + gravity * time * time / 2;
    velocity = gravity * time;
    impactDistance = fallTime - time;
    impactStrength = 1;
  } else {
    let start = fallTime;
    impactDistance = time - fallTime;
    impactStrength = 1;
    for (let bounce = 1; bounce <= bounces; bounce += 1) {
      const launch = maxSpeed * Math.pow(restitution, bounce);
      const airTime = 2 * fallTime * Math.pow(restitution, bounce);
      if (time < start + airTime) {
        const local = time - start;
        y = -(launch * local - gravity * local * local / 2);
        velocity = -launch + gravity * local;
        const toNext = start + airTime - time;
        if (toNext < impactDistance) {
          impactDistance = toNext;
          impactStrength = Math.pow(restitution, bounce);
        }
        break;
      }
      start += airTime;
      impactDistance = time - start;
      impactStrength = Math.pow(restitution, bounce);
    }
  }

  const stretch = 1 + deform * (maxSpeed > 0 ? Math.abs(velocity) / maxSpeed : 0);
  const squash = Math.min(0.9, deform * impactStrength * Math.max(0, 1 - impactDistance / 0.025));
  const scaleY = stretch * (1 - squash);
  return { y, scaleY, scaleX: 1 / scaleY, alpha: Math.min(1, progress / 0.08) };
}

/** 一度潰れて溜め、跳び上がってから重力で画面下へ落ちる。高さは落下距離の基準（既定320px）。 */
function sampleBounceOut(progress: number, tuning?: MotionTuning): Partial<MotionState> {
  const scale = tuningNumber(tuning, 'BounceHeight', 320) / 320;
  const deform = Math.max(0, tuningNumber(tuning, 'BounceSquash', 0.3));
  const windUp = 0.18;
  if (progress < windUp) {
    const scaleY = 1 - Math.min(0.9, deform * (0.22 / 0.3)) * Math.sin((progress / windUp) * Math.PI / 2);
    return { scaleY, scaleX: 1 / scaleY };
  }
  // y(q) = 980q² - 560q: q≈0.29 で80px上の頂点、q=1 で420px下へ抜ける放物線（高さで拡縮）。
  const local = (progress - windUp) / (1 - windUp);
  const velocity = 1960 * local - 560;
  const stretch = 1 + deform * Math.abs(velocity) / 1400;
  return {
    y: (980 * local * local - 560 * local) * scale,
    scaleY: stretch,
    scaleX: 1 / stretch,
    alpha: 1 - applyEasing('easeInQuad', Math.max(0, (local - 0.55) / 0.45))
  };
}

/**
 * TURNSTILE: 入りは左端、出は右端を軸に90°未満で回る回転ドア。
 * Y軸回転を横幅の余弦と縦方向のスキューで近似する。
 */
function sampleTurnstile(
  progress: number,
  context: MotionContext,
  direction: 'in' | 'out',
  tuning?: MotionTuning
): Partial<MotionState> {
  const maxAngle = Math.min(89, Math.max(0, tuningNumber(tuning, 'TurnstileAngle', 80))) * Math.PI / 180;
  const perspective = tuningNumber(tuning, 'TurnstilePerspective', 0.3);
  const halfWidth = (context.width ?? 240) / 2;
  const angle = maxAngle * (direction === 'in' ? 1 - progress : progress);
  const hingeShift = halfWidth * (1 - Math.cos(angle));
  return direction === 'in'
    ? { x: -hingeShift, scaleX: Math.cos(angle), skewY: -Math.sin(angle) * perspective, alpha: Math.min(1, progress * 2.5) }
    : { x: hingeShift, scaleX: Math.cos(angle), skewY: Math.sin(angle) * perspective, alpha: 1 - applyEasing('easeInQuad', progress) };
}

function oppositeEdge(edge: string): string {
  return ({ bottom: 'top', top: 'bottom', left: 'right', right: 'left' } as Record<string, string>)[edge] || 'top';
}

/** 指定した辺から amount（0〜1）の割合を隠すクリップ。 */
function clipFromEdge(edge: string, amount: number): Partial<MotionState> {
  switch (edge) {
    case 'top': return { clipTop: amount };
    case 'left': return { clipLeft: amount };
    case 'right': return { clipRight: amount };
    case 'bottom':
    default: return { clipBottom: amount };
  }
}

/** GENIE の変形。吸い込み方向と直交する幅（across）と、進行方向の長さ（along）を割り当てる。 */
function genieShape(across: number, along: number, toward: { x: number; y: number }): Partial<MotionState> {
  return toward.y !== 0
    ? { scaleX: across, scaleY: along }
    : { scaleX: along, scaleY: across };
}

export function createScreenMotion(name: ScreenMotionName, tuning: MotionTuning = {}): MotionClip {
  switch (name) {
    case 'cameraShake':
      return motion(Number.POSITIVE_INFINITY, (timeMs, context) => {
        // 衝撃直後を強くし、既定では約450msで微振動へ収束させる。
        const impact = Math.exp(-Math.max(0, timeMs) / Math.max(1, tuningNumber(tuning, 'cameraShakeDecayMs', 170)));
        const amplitude = (tuningNumber(tuning, 'cameraShakeBase', 0.22) + impact * 1.9)
          * tuningNumber(tuning, 'cameraShakeAmount', 1) * context.intensity;
        return {
          x: (Math.sin(timeMs * 0.071) + Math.sin(timeMs * 0.113) * 0.45) * 4 * amplitude,
          y: (Math.cos(timeMs * 0.083) + Math.sin(timeMs * 0.137) * 0.35) * 3 * amplitude,
          rotation: Math.sin(timeMs * 0.047) * 0.005 * amplitude
        };
      });
    case 'zoom':
      return motion(Number.POSITIVE_INFINITY, timeMs => {
        const period = Math.max(1, tuningNumber(tuning, 'zoomPeriodMs', 2400));
        // ズーム量は最大拡大分。(1 - cos) が 0〜2 なので半分を掛ける。
        const scale = 1 + (1 - Math.cos(timeMs * Math.PI * 2 / period)) * tuningNumber(tuning, 'zoomAmount', 0.05) / 2;
        return { scaleX: scale, scaleY: scale };
      });
    case 'rgbDrift':
      // 色ずれ（RGBの残像）の幅はテンプレート側の rgbDriftSplit で調整する。
      return motion(Number.POSITIVE_INFINITY, timeMs => {
        const sway = tuningNumber(tuning, 'rgbDriftSway', 1);
        return {
          skewX: Math.sin(timeMs * Math.PI * 2 / 1500) * 0.018 * sway,
          x: Math.sin(timeMs * Math.PI * 2 / 900) * 2 * sway
        };
      });
    case 'afterimage':
      // 残像の広がり・濃さはテンプレート側の afterimageSpread / afterimageOpacity で調整する。
      return motion(Number.POSITIVE_INFINITY, timeMs => {
        const sway = tuningNumber(tuning, 'afterimageSway', 1);
        return {
          rotation: Math.sin(timeMs * Math.PI * 2 / 3200) * 0.008 * sway,
          scaleX: 1 + Math.sin(timeMs * Math.PI * 2 / 1800) * 0.012 * sway,
          scaleY: 1 + Math.sin(timeMs * Math.PI * 2 / 1800) * 0.012 * sway
        };
      });
    case 'whipPan':
      // WHIP PAN: フレーズ冒頭（既定420ms）で流れ込み、ぼけと傾きを残して減速着地する。
      return motion(Number.POSITIVE_INFINITY, (timeMs, context) => {
        const progress = Math.min(1, timeMs / Math.max(1, tuningNumber(tuning, 'whipPanDurationMs', 420)));
        if (progress >= 1) return {};
        const remaining = 1 - applyEasing('easeOutQuart', progress);
        // 来る側の辺から反対方向へ流れ込む。
        const from = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } }[
          tuningString(tuning, 'whipPanDirection', 'right') as 'right' | 'left' | 'top' | 'bottom'
        ] || { x: 1, y: 0 };
        const offset = tuningNumber(tuning, 'whipPanDistance', 1100) * remaining * Math.min(1, context.intensity);
        const smear = remaining * remaining;
        return {
          x: from.x * offset,
          y: from.y * offset,
          skewX: from.x !== 0 ? -0.22 * from.x * smear : 0,
          skewY: from.y !== 0 ? -0.22 * from.y * smear : 0,
          blur: tuningNumber(tuning, 'whipPanBlur', 16) * smear
        };
      });
    case 'zoomDive':
      // ZOOM DIVE: 既定は3.2倍から指数的に引いて着地し、冒頭だけ暗転から立ち上がる。
      return motion(Number.POSITIVE_INFINITY, timeMs => {
        const progress = Math.min(1, timeMs / Math.max(1, tuningNumber(tuning, 'zoomDiveDurationMs', 300)));
        if (progress >= 1) return {};
        const scale = Math.pow(Math.max(1, tuningNumber(tuning, 'zoomDiveStartScale', 3.2)), 1 - applyEasing('easeOutCubic', progress));
        return {
          scaleX: scale,
          scaleY: scale,
          alpha: Math.min(1, timeMs / 60),
          blur: tuningNumber(tuning, 'zoomDiveBlur', 10) * (1 - progress) * (1 - progress)
        };
      });
    case 'none':
    default:
      return motion(Number.POSITIVE_INFINITY, () => ({}));
  }
}

export function sampleClip(clip: MotionClip, timeMs: number, context: MotionContext): MotionState {
  return clip.sample(Math.max(0, timeMs), context);
}
