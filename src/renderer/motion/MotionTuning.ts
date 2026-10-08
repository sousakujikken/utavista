/**
 * モーションごとの細かな調整値の定義。
 * パラメータ名は「方向の接頭辞 + key」で作る（例: entranceBounceHeight / exitBounceHeight）。
 * 出現・消失は別々の値を持ち、継続・画面全体は接頭辞なしで1組だけ持つ。
 */

export type MotionTuning = Record<string, number | string>;

export interface MotionTuningSpec {
  key: string;
  label: string;
  default: number | string;
  /** 消失側だけ既定値が異なる場合に指定する。 */
  exitDefault?: number | string;
  /** 片方向でしか使わない項目（未指定なら出現・消失の両方）。 */
  directions?: Array<'entrance' | 'exit'>;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

const directionOptions = ['bottom', 'top', 'left', 'right'];

const travelOptions = ['right', 'left', 'down', 'up'];

/** 出現・消失で共通の動き（値は方向ごとに別々に持つ）。 */
export const transitionTuningSpecs: Record<string, MotionTuningSpec[]> = {
  slam: [
    { key: 'SlamScale', label: '倍率（出現は開始時・消失は終了時）', default: 3.2, min: 0.1, max: 12, step: 0.1 }
  ],
  slide: [
    { key: 'SlideDirection', label: '移動の向き', default: 'right', options: travelOptions },
    { key: 'SlideDistance', label: '移動距離 (px)', default: 280, min: 0, max: 2000, step: 10 },
    { key: 'SlideSkew', label: '傾き', default: 0.18, min: 0, max: 1, step: 0.01 }
  ],
  scale: [
    { key: 'ScaleMin', label: '最小倍率', default: 0.08, min: 0, max: 1, step: 0.01 }
  ],
  collapse: [
    { key: 'CollapseSquash', label: '縦の潰れ（倍率）', default: 0.02, min: 0, max: 1, step: 0.01 },
    { key: 'CollapseStretch', label: '横の伸び（倍率）', default: 1.3, min: 0.2, max: 4, step: 0.05 }
  ],
  fall: [
    { key: 'FallHeight', label: '落下距離 (px)', default: 360, min: 0, max: 2000, step: 10 },
    { key: 'FallRotation', label: '回転量 (rad)', default: 0.35, min: -3.14, max: 3.14, step: 0.01 }
  ],
  shatter: [
    { key: 'ShatterSpread', label: '飛散距離（倍率）', default: 1, min: 0, max: 5, step: 0.05 },
    { key: 'ShatterRotation', label: '回転量（倍率）', default: 1, min: 0, max: 5, step: 0.05 }
  ],
  noise: [
    { key: 'NoiseFlickerMs', label: '明滅の間隔 (ms)', default: 35, min: 10, max: 500, step: 5 }
  ],
  soft: [
    { key: 'SoftDistance', label: '移動量 (px)', default: 24, min: 0, max: 400, step: 1 },
    { key: 'SoftBlur', label: 'ぼかし量 (px)', default: 7, min: 0, max: 40, step: 0.5 }
  ],
  anticipate: [
    { key: 'AnticipateDirection', label: '移動の向き', default: 'right', options: ['right', 'left', 'down', 'up'] },
    { key: 'AnticipateDistance', label: '移動距離 (px)', default: 260, exitDefault: 294, min: 0, max: 1600, step: 2 },
    { key: 'AnticipatePull', label: '溜めの引き幅 (px)', default: 36, min: 0, max: 400, step: 1 },
    { key: 'AnticipateWindUp', label: '溜めの時間比率', default: 0.28, min: 0.05, max: 0.7, step: 0.01 },
    { key: 'AnticipateOvershoot', label: '揺り戻し (px)', default: 14, min: 0, max: 200, step: 1, directions: ['entrance'] }
  ],
  spring: [
    { key: 'SpringDamping', label: '減衰比（小さいほど揺れる）', default: 0.42, min: 0.05, max: 0.99, step: 0.01 },
    { key: 'SpringFrequency', label: '固さ（振動の速さ）', default: 11, min: 2, max: 40, step: 0.5 },
    { key: 'SpringStartScale', label: '開始倍率', default: 0, min: 0, max: 3, step: 0.05 }
  ],
  bounce: [
    { key: 'BounceHeight', label: '落下の高さ (px)', default: 320, min: 0, max: 1600, step: 10 },
    { key: 'BounceRestitution', label: '反発係数', default: 0.62, min: 0, max: 0.95, step: 0.01, directions: ['entrance'] },
    { key: 'BounceCount', label: '弾む回数', default: 3, min: 0, max: 8, step: 1, directions: ['entrance'] },
    { key: 'BounceSquash', label: '潰れ・伸びの量', default: 0.3, min: 0, max: 1, step: 0.01 }
  ],
  turnstile: [
    { key: 'TurnstileAngle', label: '回転角 (°)', default: 80, min: 0, max: 89, step: 1 },
    { key: 'TurnstilePerspective', label: '遠近感（傾き）', default: 0.3, min: 0, max: 1, step: 0.01 }
  ],
  mask: [
    { key: 'MaskDirection', label: '開閉の起点', default: 'bottom', options: directionOptions },
    { key: 'MaskScale', label: '中身の倍率（出現は開始時・消失は終了時）', default: 1.35, exitDefault: 1.12, min: 0.2, max: 3, step: 0.05 },
    { key: 'MaskOffset', label: '中身のずれ量 (px)', default: 24, min: 0, max: 400, step: 1 }
  ],
  genie: [
    { key: 'GenieDirection', label: '吸い込む方向', default: 'bottom', options: directionOptions },
    { key: 'GenieDistance', label: '吸い込み距離 (px)', default: 260, min: 0, max: 1600, step: 10 },
    { key: 'GenieSqueeze', label: '絞り量', default: 0.96, min: 0, max: 1, step: 0.01 }
  ]
};

/** 継続モーションの調整値（接頭辞なし）。 */
export const sustainTuningSpecs: Record<string, MotionTuningSpec[]> = {
  shake: [
    { key: 'shakeAmount', label: '揺れ幅 (px)', default: 3, min: 0, max: 60, step: 0.5 },
    { key: 'shakeSpeed', label: '揺れの速さ（倍率）', default: 1, min: 0.05, max: 10, step: 0.05 },
    { key: 'shakeRotation', label: '回転の揺れ (rad)', default: 0.012, min: 0, max: 0.5, step: 0.002 }
  ],
  pulse: [
    { key: 'pulsePeriodMs', label: '周期 (ms)', default: 700, min: 50, max: 10000, step: 10 },
    { key: 'pulseAmount', label: '拡大量', default: 0.055, min: 0, max: 0.5, step: 0.005 }
  ],
  glitch: [
    { key: 'glitchFrameMs', label: '判定間隔 (ms)', default: 55, min: 16, max: 1000, step: 1 },
    { key: 'glitchFrequency', label: '発生頻度', default: 0.21, min: 0, max: 1, step: 0.01 },
    { key: 'glitchOffset', label: '横ずれ (px)', default: 14, min: 0, max: 200, step: 1 },
    { key: 'glitchSkew', label: '傾き', default: 0.16, min: 0, max: 1, step: 0.01 }
  ],
  compress: [
    { key: 'compressPeriodMs', label: '周期 (ms)', default: 1100, min: 50, max: 10000, step: 10 },
    { key: 'compressAmount', label: '伸縮量', default: 0.1, min: 0, max: 0.8, step: 0.01 }
  ],
  breathe: [
    { key: 'breatheInhaleMs', label: '吸う時間 (ms)', default: 2600, min: 100, max: 10000, step: 50 },
    { key: 'breatheHoldMs', label: '止める時間 (ms)', default: 600, min: 0, max: 10000, step: 50 },
    { key: 'breatheExhaleMs', label: '吐く時間 (ms)', default: 2400, min: 100, max: 10000, step: 50 },
    { key: 'breatheAmount', label: '拡大量', default: 0.08, min: 0, max: 0.5, step: 0.005 }
  ]
};

/** 画面全体モーションの調整値（接頭辞なし）。 */
export const screenTuningSpecs: Record<string, MotionTuningSpec[]> = {
  cameraShake: [
    { key: 'cameraShakeAmount', label: '揺れの強さ（倍率）', default: 1, min: 0, max: 10, step: 0.05 },
    { key: 'cameraShakeDecayMs', label: '衝撃の減衰時間 (ms)', default: 170, min: 10, max: 5000, step: 10 },
    { key: 'cameraShakeBase', label: '残る微振動', default: 0.22, min: 0, max: 3, step: 0.01 }
  ],
  zoom: [
    { key: 'zoomAmount', label: 'ズーム量', default: 0.05, min: 0, max: 1, step: 0.005 },
    { key: 'zoomPeriodMs', label: '周期 (ms)', default: 2400, min: 100, max: 20000, step: 50 }
  ],
  rgbDrift: [
    { key: 'rgbDriftSplit', label: '色ずれの幅（倍率）', default: 1, min: 0, max: 10, step: 0.05 },
    { key: 'rgbDriftSway', label: '画面の揺れ（倍率）', default: 1, min: 0, max: 10, step: 0.05 }
  ],
  afterimage: [
    { key: 'afterimageSpread', label: '残像の広がり（倍率）', default: 1, min: 0, max: 10, step: 0.05 },
    { key: 'afterimageOpacity', label: '残像の濃さ（倍率）', default: 1, min: 0, max: 4, step: 0.05 },
    { key: 'afterimageSway', label: '画面の揺れ（倍率）', default: 1, min: 0, max: 10, step: 0.05 }
  ],
  whipPan: [
    { key: 'whipPanDirection', label: '流れ込む方向（来る側）', default: 'right', options: ['right', 'left', 'top', 'bottom'] },
    { key: 'whipPanDurationMs', label: '流し時間 (ms)', default: 420, min: 50, max: 3000, step: 10 },
    { key: 'whipPanDistance', label: '流し距離 (px)', default: 1100, min: 0, max: 4000, step: 10 },
    { key: 'whipPanBlur', label: 'ぼかし量 (px)', default: 16, min: 0, max: 60, step: 0.5 }
  ],
  zoomDive: [
    { key: 'zoomDiveDurationMs', label: '引きの時間 (ms)', default: 300, min: 50, max: 3000, step: 10 },
    { key: 'zoomDiveStartScale', label: '開始倍率', default: 3.2, min: 1, max: 10, step: 0.1 },
    { key: 'zoomDiveBlur', label: 'ぼかし量 (px)', default: 10, min: 0, max: 60, step: 0.5 }
  ]
};

export type TransitionDirection = 'entrance' | 'exit';

export function transitionParamName(direction: TransitionDirection, key: string): string {
  return `${direction}${key}`;
}

/** パラメータから、指定方向・指定モーションの調整値（key → 値）を取り出す。 */
export function resolveTransitionTuning(
  params: Record<string, unknown>,
  direction: TransitionDirection,
  motionName: string
): MotionTuning {
  const specs = (transitionTuningSpecs[motionName] || []).map(spec => ({
    ...spec,
    default: transitionDefault(spec, direction)
  }));
  return resolveTuning(params, specs, key => transitionParamName(direction, key));
}

export function transitionDefault(spec: MotionTuningSpec, direction: TransitionDirection): number | string {
  return direction === 'exit' && spec.exitDefault !== undefined ? spec.exitDefault : spec.default;
}

export function resolveSustainTuning(params: Record<string, unknown>, motionName: string): MotionTuning {
  return resolveTuning(params, sustainTuningSpecs[motionName] || [], key => key);
}

export function resolveScreenTuning(params: Record<string, unknown>, motionName: string): MotionTuning {
  return resolveTuning(params, screenTuningSpecs[motionName] || [], key => key);
}

function resolveTuning(
  params: Record<string, unknown>,
  specs: MotionTuningSpec[],
  toParamName: (key: string) => string
): MotionTuning {
  const tuning: MotionTuning = {};
  specs.forEach(spec => {
    const value = params[toParamName(spec.key)];
    const valid = typeof spec.default === 'number'
      ? typeof value === 'number' && Number.isFinite(value)
      : typeof value === 'string' && (!spec.options || spec.options.includes(value));
    tuning[spec.key] = valid ? value as number | string : spec.default;
  });
  return tuning;
}

/** 調整値が無い・不正なときは仕様の既定値を使う。 */
export function tuningNumber(tuning: MotionTuning | undefined, key: string, fallback: number): number {
  const value = tuning?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function tuningString(tuning: MotionTuning | undefined, key: string, fallback: string): string {
  const value = tuning?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** 起点となる辺から反対側へ向かう単位ベクトル（画面座標: yは下が正）。 */
export function directionVector(edge: string): { x: number; y: number } {
  switch (edge) {
    case 'top': return { x: 0, y: 1 };
    case 'left': return { x: 1, y: 0 };
    case 'right': return { x: -1, y: 0 };
    case 'bottom':
    default: return { x: 0, y: -1 };
  }
}
