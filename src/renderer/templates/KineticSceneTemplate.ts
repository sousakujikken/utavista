import * as PIXI from 'pixi.js';
import type {
  AnimationPhase,
  CharUnit,
  HierarchyType,
  IAnimationTemplate,
  ParameterConfig,
  TemplateMetadata
} from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { getLogicalStageSize } from '../utils/StageUtils';
import {
  EntranceName,
  EasingSelection,
  ExitName,
  LayoutName,
  MotionContext,
  SceneDefinition,
  ScreenMotionName,
  SustainName,
  calculateLayout,
  combineMotionStates,
  createEntrance,
  createExit,
  createScreenMotion,
  createSustain,
  MotionState,
  MotionTuningSpec,
  normalizeMotionName,
  resolveScreenTuning,
  resolveSustainTuning,
  resolveTransitionTuning,
  screenTuningSpecs,
  sustainTuningSpecs,
  transitionDefault,
  transitionParamName,
  transitionTuningSpecs,
  sampleClip,
  sceneCatalog,
  sampleVariableWeightPulse,
  TypographyEffects,
  TypographyEffectParams,
  syncTextGroup
} from '../motion';

const TEXT_NAME = 'kinetic-scene-text';
const CHAR_GROUP_NAME = 'kinetic-scene-char-group';
const CHAR_NAME_PREFIX = 'kinetic-scene-char-';
const CLIP_MASK_NAME = 'kinetic-scene-clip';
const KARAOKE_FILL_NAME = 'kinetic-karaoke-fill';
const KARAOKE_MASK_NAME = 'kinetic-karaoke-mask';
/** 半角・全角スペースなど、改行候補・行端で詰める対象とする空白文字。 */
const WHITESPACE_PATTERN = /\s/u;
/** 行頭禁則: 閉じ括弧・句読点・中点・感嘆符／疑問符・長音・繰り返し記号・小書きの仮名・三点リーダーなど。 */
const LINE_START_PROHIBITED_PATTERN = /^[、。，．,.・：；:;？！?!‼⁇⁈⁉ー‐゠–〜～）)］\]｝}」』】〉》〕〙〗〟’”»ゝゞヽヾ々〻ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰ-ㇿ…‥]$/u;
/** 行末禁則: 開き括弧・開き引用符など。 */
const LINE_END_PROHIBITED_PATTERN = /^[（(［[｛{「『【〈《〔〘〖〝‘“«]$/u;

/** スペースで区切られた文字のまとまり。separation は直前のトークンとの間隔（スペース＋単語間隔）。 */
interface PhraseFlowToken {
  word: number;
  chars: number[];
  charWidths: number[];
  width: number;
  separation: number;
  /** このトークンの手前で改行できるか（禁則処理済み）。 */
  breakable: boolean;
  spaceBefore: boolean;
  /** 表示される文字列（スペースを除く）。禁則処理の判定に使う。 */
  text: string;
}

interface PhraseFlowPlacement {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  /** 表示される文字の幅（拡大前）。複数行にまたがる単語は全体の範囲。 */
  width: number;
  /** 単語内の各文字の中心座標（拡大前・単語の基準点から）。省略時は1行に並べる。 */
  charOffsets?: Array<{ x: number; y: number }>;
}

function numberParam(params: Record<string, unknown>, name: string, fallback: number): number {
  const value = params[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringParam(params: Record<string, unknown>, name: string, fallback: string): string {
  const value = params[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** 現在の値で選ばれているモーション名（旧名は新名へ読み替える）。 */
function selectedMotion(values: Record<string, unknown>, name: string, fallback: string): string {
  return normalizeMotionName(typeof values[name] === 'string' ? values[name] as string : fallback);
}

/** 出現・消失・継続・画面全体の各モーション固有の調整値を、選択中のときだけ表示する項目として作る。 */
function buildMotionTuningParams(): Record<'entrance' | 'exit' | 'sustain' | 'screen', ParameterConfig[]> {
  const toConfig = (spec: MotionTuningSpec, name: string, label: string, defaultValue: number | string,
    visibleWhen: (values: Record<string, unknown>) => boolean): ParameterConfig => ({
    name,
    type: typeof defaultValue === 'number' ? 'number' : 'string',
    default: defaultValue,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    options: spec.options,
    label,
    visibleWhen
  });

  const groups: Record<'entrance' | 'exit' | 'sustain' | 'screen', ParameterConfig[]> = {
    entrance: [], exit: [], sustain: [], screen: []
  };
  (['entrance', 'exit'] as const).forEach(direction => {
    const motionParam = direction === 'entrance' ? 'entranceMotion' : 'exitMotion';
    const fallback = direction === 'entrance' ? 'slam' : 'collapse';
    const prefix = direction === 'entrance' ? '出現' : '消失';
    Object.entries(transitionTuningSpecs).forEach(([motionName, specs]) => {
      specs
        .filter(spec => !spec.directions || spec.directions.includes(direction))
        .forEach(spec => groups[direction].push(toConfig(
          spec,
          transitionParamName(direction, spec.key),
          `${prefix}（${motionName}）: ${spec.label}`,
          transitionDefault(spec, direction),
          values => selectedMotion(values, motionParam, fallback) === motionName
        )));
    });
  });
  Object.entries(sustainTuningSpecs).forEach(([motionName, specs]) => specs.forEach(spec => groups.sustain.push(toConfig(
    spec, spec.key, `継続（${motionName}）: ${spec.label}`, spec.default,
    values => selectedMotion(values, 'sustainMotion', 'pulse') === motionName
  ))));
  Object.entries(screenTuningSpecs).forEach(([motionName, specs]) => specs.forEach(spec => groups.screen.push(toConfig(
    spec, spec.key, `画面全体（${motionName}）: ${spec.label}`, spec.default,
    values => values.screenMotion === motionName
  ))));
  return groups;
}

/** 各モーションの調整項目を、対応する選択欄（または時間・イージング）の直後へ差し込む。 */
function placeMotionTuningParams(configs: ParameterConfig[]): ParameterConfig[] {
  const groups = buildMotionTuningParams();
  const anchors: Array<[string, ParameterConfig[]]> = [
    ['sustainMotion', groups.sustain],
    ['screenMotion', groups.screen],
    ['entranceEasing', groups.entrance],
    ['exitEasing', groups.exit]
  ];
  return configs.flatMap(config => {
    const anchor = anchors.find(([name]) => name === config.name);
    return anchor ? [config, ...anchor[1]] : [config];
  });
}

/** タイポグラフィエフェクトの詳細項目は、そのエフェクトがONのときだけ表示する。 */
const effectDetailRules: Array<{ prefix: string; enabled: string; extra?: (values: Record<string, unknown>) => boolean }> = [
  { prefix: 'shuffle', enabled: 'shuffleEnabled' },
  { prefix: 'repetition', enabled: 'repetitionEnabled' },
  { prefix: 'organic', enabled: 'organicEnabled' },
  { prefix: 'destruction', enabled: 'destructionEnabled' },
  { prefix: 'emitterLine', enabled: 'emittersEnabled', extra: values => values.emitterStyle === 'speedLines' },
  { prefix: 'emitterInnerRadius', enabled: 'emittersEnabled', extra: values => values.emitterStyle === 'speedLines' },
  { prefix: 'emitter', enabled: 'emittersEnabled' },
  { prefix: 'surface', enabled: 'surfaceEnabled' },
  { prefix: 'variableWeight', enabled: 'variableWeightEnabled' },
  { prefix: 'kerningMotion', enabled: 'kerningMotionEnabled' },
  { prefix: 'baselineWave', enabled: 'baselineWaveEnabled' },
  { prefix: 'karaokeFillColor', enabled: 'karaokeFillEnabled', extra: values => values.karaokeFillUseCustomColor === true },
  { prefix: 'karaokeFill', enabled: 'karaokeFillEnabled' },
  { prefix: 'impactOutline', enabled: 'impactOutlineEnabled' }
];

function withVisibilityRules(configs: ParameterConfig[]): ParameterConfig[] {
  return configs.map(config => {
    if (config.visibleWhen) return config;
    const rule = effectDetailRules.find(candidate =>
      config.name !== candidate.enabled && config.name.startsWith(candidate.prefix)
    );
    if (!rule) return config;
    return {
      ...config,
      visibleWhen: values => values[rule.enabled] === true && (!rule.extra || rule.extra(values))
    };
  });
}

/**
 * 小さなモーションをデータで組み合わせる、単語・場面ベースのキネティック・タイポグラフィ。
 * すべての状態は nowMs と seed から直接評価され、フレーム履歴を持たない。
 */
export class KineticSceneTemplate implements IAnimationTemplate {
  private readonly typographyEffects = new TypographyEffects();
  private readonly textWidthCache = new Map<string, number>();
  private readonly phraseLayoutCache = new Map<string, PhraseFlowPlacement[]>();

  readonly metadata: TemplateMetadata = {
    name: 'KineticSceneTemplate',
    version: '1.3.0',
    description: 'レイアウト・基本モーション・11系統のタイポグラフィエフェクトを自由に合成するシーンテンプレート',
    license: 'GPL-3.0',
    originalAuthor: {
      name: 'UTAVISTA Development Team',
      contribution: '決定論的モーション合成基盤とシーンテンプレート',
      date: '2026-09-16'
    }
  };

  getParameterConfig(): ParameterConfig[] {
    return withVisibilityRules(placeMotionTuningParams([
      { name: 'fontSize', type: 'number', default: 112, min: 20, max: 300, step: 1, label: '文字サイズ' },
      {
        name: 'fontFamily',
        type: 'font',
        default: 'Arial',
        get options() { return FontService.getFontFamilies(); },
        label: 'フォント'
      },
      { name: 'fontWeight', type: 'string', default: '700', label: '書体' },
      { name: 'textColor', type: 'color', default: '#F3F0E8', label: '待機色' },
      { name: 'activeTextColor', type: 'color', default: '#FFFFFF', label: '発声中色' },
      { name: 'completedTextColor', type: 'color', default: '#A8FF60', label: '発声後色' },
      { name: 'headTime', type: 'number', default: 700, min: 0, max: 3000, step: 50, label: '先行表示時間' },
      { name: 'phraseOffsetX', type: 'number', default: 0, min: -900, max: 900, step: 5, label: '場面X位置' },
      { name: 'phraseOffsetY', type: 'number', default: 0, min: -500, max: 500, step: 5, label: '場面Y位置' },
      { name: 'charSpacing', type: 'number', default: 0.9, min: 0.35, max: 3, step: 0.05, label: '単語間隔' },
      { name: 'motionLayout', type: 'string', default: 'center', options: sceneCatalog.layouts, label: 'レイアウト' },
      { name: 'entranceMotion', type: 'string', default: 'slam', options: sceneCatalog.entrances, label: '出現' },
      { name: 'sustainMotion', type: 'string', default: 'pulse', options: sceneCatalog.sustains, label: '継続' },
      { name: 'exitMotion', type: 'string', default: 'collapse', options: sceneCatalog.exits, label: '消失' },
      { name: 'screenMotion', type: 'string', default: 'zoom', options: sceneCatalog.screens, label: '画面全体' },
      { name: 'motionIntensity', type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'モーション強度' },
      { name: 'motionSeed', type: 'number', default: 2026, min: 0, max: 99999, step: 1, label: 'ランダムシード' },
      { name: 'entranceDuration', type: 'number', default: 520, min: 0, max: 2500, step: 20, label: '出現時間' },
      { name: 'entranceEasing', type: 'string', default: 'auto', options: sceneCatalog.easings, label: '出現イージング' },
      { name: 'exitDuration', type: 'number', default: 520, min: 1, max: 2500, step: 20, label: '消失時間' },
      { name: 'exitEasing', type: 'string', default: 'auto', options: sceneCatalog.easings, label: '消失イージング' },
      { name: 'shuffleEnabled', type: 'boolean', default: false, label: '文字シャッフル' },
      { name: 'shuffleCharset', type: 'string', default: '01#%&<>アイウエオXYZ', label: '置換文字セット' },
      { name: 'shuffleRate', type: 'number', default: 50, min: 16, max: 400, step: 1, label: '置換間隔 (ms)' },
      { name: 'shuffleDuration', type: 'number', default: 720, min: 50, max: 3000, step: 10, label: '収束時間 (ms)' },
      { name: 'repetitionEnabled', type: 'boolean', default: false, label: '反復複製' },
      { name: 'repetitionCount', type: 'number', default: 8, min: 1, max: 24, step: 1, label: '複製数' },
      { name: 'repetitionSpread', type: 'number', default: 14, min: 0, max: 100, step: 1, label: '複製間隔' },
      { name: 'repetitionDepth', type: 'number', default: 0.65, min: 0, max: 1, step: 0.05, label: '遠近減衰' },
      { name: 'organicEnabled', type: 'boolean', default: false, label: '有機ディストーション' },
      { name: 'organicAmplitude', type: 'number', default: 0.04, min: 0, max: 0.2, step: 0.005, label: '波形振幅' },
      { name: 'organicFrequency', type: 'number', default: 3, min: 0.2, max: 12, step: 0.1, label: '波形周波数' },
      { name: 'organicSpeed', type: 'number', default: 1, min: -5, max: 5, step: 0.1, label: '波形速度' },
      { name: 'destructionEnabled', type: 'boolean', default: false, label: '弾性破壊' },
      { name: 'destructionStrength', type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: '破壊強度' },
      { name: 'destructionSlices', type: 'number', default: 9, min: 2, max: 24, step: 1, label: '破壊スライス数' },
      { name: 'destructionDuration', type: 'number', default: 900, min: 100, max: 4000, step: 20, label: '破壊・復元時間 (ms)' },
      { name: 'emittersEnabled', type: 'boolean', default: false, label: '文字オブジェクト放出' },
      { name: 'emitterStyle', type: 'string', default: 'particles', options: ['particles', 'bubbles', 'eyes', 'noise', 'speedLines'], label: '放出スタイル' },
      { name: 'emitterCount', type: 'number', default: 16, min: 1, max: 48, step: 1, label: '放出数' },
      { name: 'emitterRadius', type: 'number', default: 130, min: 10, max: 500, step: 5, label: '放出半径' },
      { name: 'surfaceEnabled', type: 'boolean', default: false, label: '文字曲面' },
      { name: 'surfaceShape', type: 'string', default: 'ribbon', options: ['ribbon', 'cylinder', 'torus'], label: '曲面形状' },
      { name: 'surfaceCurve', type: 'number', default: 0.14, min: -0.5, max: 0.5, step: 0.01, label: '曲率' },
      { name: 'surfaceRepeat', type: 'number', default: 2, min: 1, max: 6, step: 1, label: 'UV反復数' },
      { name: 'variableWeightEnabled', type: 'boolean', default: false, label: '可変ウェイトパルス' },
      { name: 'variableWeightMin', type: 'number', default: 200, min: 100, max: 900, step: 10, label: '最小ウェイト' },
      { name: 'variableWeightMax', type: 'number', default: 900, min: 100, max: 900, step: 10, label: '最大ウェイト' },
      { name: 'variableWeightDuration', type: 'number', default: 4200, min: 300, max: 10000, step: 50, label: 'ウェイト周期 (ms)' },
      { name: 'variableWeightSpacing', type: 'number', default: 4, min: 0, max: 30, step: 0.5, label: 'ウェイト字間補正' },
      { name: 'kerningMotionEnabled', type: 'boolean', default: false, label: 'キネティックカーニング' },
      { name: 'kerningMotionAmount', type: 'number', default: 14, min: -40, max: 80, step: 1, label: 'カーニング展開幅' },
      { name: 'kerningMotionDuration', type: 'number', default: 620, min: 50, max: 4000, step: 10, label: 'カーニング収束時間 (ms)' },
      { name: 'baselineWaveEnabled', type: 'boolean', default: false, label: 'ベースラインウェーブ出現' },
      { name: 'baselineWaveOffset', type: 'number', default: 44, min: -150, max: 150, step: 1, label: '基線開始オフセット' },
      { name: 'baselineWaveOvershoot', type: 'number', default: 7, min: 0, max: 50, step: 1, label: '基線オーバーシュート' },
      { name: 'baselineWaveDuration', type: 'number', default: 840, min: 100, max: 4000, step: 10, label: '基線移動時間 (ms)' },
      { name: 'baselineWaveStagger', type: 'number', default: 55, min: 0, max: 300, step: 5, label: '文字遅延 (ms)' },
      { name: 'karaokeFillEnabled', type: 'boolean', default: false, label: 'カラオケ塗り' },
      { name: 'impactOutlineEnabled', type: 'boolean', default: false, label: '二重輪郭インパクト' },
      { name: 'impactOutlineSpread', type: 'number', default: 14, min: 2, max: 60, step: 1, label: '輪郭拡散幅 (px)' },
      { name: 'impactOutlineDuration', type: 'number', default: 220, min: 60, max: 1200, step: 10, label: '輪郭拡散時間 (ms)' },
      { name: 'impactOutlineThickness', type: 'number', default: 3.4, min: 0.5, max: 30, step: 0.5, label: '輪郭の太さ (px)' },
      { name: 'impactOutlineTrigger', type: 'string', default: 'word', options: ['word', 'character'], label: '輪郭の発動（word: 単語の開始 / character: 文字ごと）' },
      { name: 'karaokeFillDirection', type: 'string', default: 'leftToRight', options: ['leftToRight', 'rightToLeft', 'topToBottom', 'bottomToTop'], label: '塗る方向' },
      { name: 'karaokeFillUseCustomColor', type: 'boolean', default: false, label: '塗りの色を個別に指定' },
      { name: 'karaokeFillColor', type: 'color', default: '#FF5C8A', label: '塗りの色' },
      { name: 'emitterLineRate', type: 'number', default: 12, min: 1, max: 60, step: 1, label: '集中線の更新レート (fps)' },
      { name: 'emitterLineWidth', type: 'number', default: 5, min: 0.5, max: 40, step: 0.5, label: '集中線の最大太さ (px)' },
      { name: 'emitterInnerRadius', type: 'number', default: 0.55, min: 0, max: 3, step: 0.05, label: '集中線の内側半径（語の大きさ比）' }
    ]));
  }

  animateContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,
    _phase: AnimationPhase
  ): boolean {
    const content = Array.isArray(text) ? text.join('') : text;
    container.visible = true;

    if (hierarchyType === 'phrase') {
      return this.renderPhrase(container, params, nowMs, startMs);
    }
    if (hierarchyType === 'word') {
      return this.renderWord(container, content, params, nowMs, startMs, endMs);
    }
    // このテンプレートは単語タイミングを描画単位とし、文字コンテナは重複表示しない。
    container.visible = false;
    return true;
  }

  removeVisualElements(container: PIXI.Container): void {
    this.typographyEffects.cleanup(container);
    this.applyBlur(container, 0);
    this.applyClip(container, { clipTop: 0, clipBottom: 0, clipLeft: 0, clipRight: 0 }, 0, 0, 0);
    container.position.set(0, 0);
    container.scale.set(1, 1);
    container.skew.set(0, 0);
    container.rotation = 0;
    container.alpha = 1;
  }

  private renderPhrase(
    container: PIXI.Container,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number
  ): boolean {
    const { width, height } = getLogicalStageSize();
    const intensity = numberParam(params, 'motionIntensity', 1);
    const context: MotionContext = {
      seed: numberParam(params, 'motionSeed', 2026),
      index: 0,
      total: 1,
      intensity
    };
    const scene = this.resolveScene(params);
    const screenState = sampleClip(createScreenMotion(scene.screen, resolveScreenTuning(params, scene.screen)), nowMs - startMs, context);

    container.position.set(
      width / 2 + numberParam(params, 'phraseOffsetX', 0) + screenState.x,
      height / 2 + numberParam(params, 'phraseOffsetY', 0) + screenState.y
    );
    container.scale.set(screenState.scaleX, screenState.scaleY);
    container.skew.set(screenState.skewX, screenState.skewY);
    container.rotation = screenState.rotation;
    container.alpha = screenState.alpha;
    this.applyBlur(container, screenState.blur);
    return true;
  }

  private renderWord(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number
  ): boolean {
    const { width, height } = getLogicalStageSize();
    const index = Math.max(0, numberParam(params, 'wordIndex', 0));
    const total = Math.max(1, numberParam(params, 'totalWords', 1));
    const fontSize = numberParam(params, 'fontSize', 112);
    const intensity = numberParam(params, 'motionIntensity', 1);
    const seed = numberParam(params, 'motionSeed', 2026);
    const phraseStartMs = numberParam(params, 'phraseStartMs', startMs);
    const phraseEndMs = numberParam(params, 'phraseEndMs', endMs);
    const scene = this.resolveScene(params);

    if (nowMs < phraseStartMs) {
      container.visible = false;
      return true;
    }

    const spacing = numberParam(params, 'charSpacing', 0.9);
    const layoutContext: MotionContext = { seed, index, total, intensity };
    const layout: { x: number; y: number; rotation: number; scale: number; width?: number; charOffsets?: Array<{ x: number; y: number }> } =
      scene.layout === 'center' || scene.layout === 'fill' || scene.layout === 'vertical'
        ? this.calculatePhraseFlowLayout(scene.layout, params, index, total, text, fontSize, spacing, width, height)
        : calculateLayout(scene.layout, { ...layoutContext, width, height, fontSize, spacing: spacing * 2.2 });
    const wordWidth = layout.width ?? this.measureWordWidth(text.trim(), params, fontSize);
    const context: MotionContext = { ...layoutContext, width: wordWidth * layout.scale };

    const entranceDuration = numberParam(params, 'entranceDuration', 520);
    const headTime = numberParam(params, 'headTime', 700);
    const entranceStartMs = Math.max(phraseStartMs, startMs - headTime);
    const exitDuration = numberParam(params, 'exitDuration', 520);
    const entrance = createEntrance(
      scene.entrance,
      entranceDuration,
      stringParam(params, 'entranceEasing', 'auto') as EasingSelection,
      resolveTransitionTuning(params, 'entrance', scene.entrance)
    );
    const sustain = createSustain(scene.sustain, resolveSustainTuning(params, scene.sustain));
    const exit = createExit(
      scene.exit,
      exitDuration,
      stringParam(params, 'exitEasing', 'auto') as EasingSelection,
      resolveTransitionTuning(params, 'exit', scene.exit)
    );

    let phaseState;
    if (nowMs > phraseEndMs) {
      phaseState = sampleClip(exit, nowMs - phraseEndMs, context);
    } else if (nowMs < entranceStartMs + entranceDuration) {
      phaseState = sampleClip(entrance, nowMs - entranceStartMs, context);
    } else {
      phaseState = sampleClip(entrance, entrance.duration, context);
    }

    // 継続モーションは表示開始から消失完了まで位相を維持する。
    // 座標・回転は加算、スケール・透明度は乗算されるため、出現／消失の
    // フェードや変形を上書きせずに合成できる。
    const sustainState = sampleClip(sustain, nowMs - entranceStartMs, context);
    const motionState = combineMotionStates(phaseState, sustainState);

    container.position.set(layout.x + motionState.x, layout.y + motionState.y);
    container.scale.set(layout.scale * motionState.scaleX, layout.scale * motionState.scaleY);
    container.skew.set(motionState.skewX, motionState.skewY);
    container.rotation = layout.rotation + motionState.rotation;
    container.alpha = Math.max(0, Math.min(1, motionState.alpha));
    this.applyBlur(container, motionState.blur);

    const color = nowMs < startMs
      ? stringParam(params, 'textColor', '#F3F0E8')
      : nowMs <= endMs
        ? stringParam(params, 'activeTextColor', '#FFFFFF')
        : stringParam(params, 'completedTextColor', '#A8FF60');
    const typographyParams = this.resolveTypographyEffects(params);
    const animatedFontWeight = this.resolveAnimatedFontWeight(params, nowMs, entranceStartMs);
    const textObject = this.ensureText(container, text, params, fontSize, color, animatedFontWeight);
    const typographyContext = {
      nowMs,
      startMs,
      phraseStartMs: numberParam(params, 'phraseStartMs', startMs),
      effectStartMs: entranceStartMs,
      seed,
      index,
      intensity,
      characterStartsMs: this.resolveCharacterStarts(text, params, startMs, endMs)
    };
    this.typographyEffects.prepareSource(textObject, text, typographyParams, typographyContext);
    this.updateCharacterText(
      container,
      text,
      textObject.text,
      params,
      fontSize,
      nowMs,
      startMs,
      endMs,
      animatedFontWeight,
      layout.charOffsets
    );
    const characterGroup = container.children.find(child => child.name === CHAR_GROUP_NAME) as PIXI.Container;
    this.typographyEffects.update(
      container,
      textObject,
      characterGroup,
      typographyParams,
      typographyContext
    );
    // 本文は文字単位のTextで描画する。単語Textは複製・破壊などの効果生成源としてのみ保持する。
    textObject.renderable = false;
    this.updateEchoes(container, characterGroup, params, nowMs, intensity);
    // マスクは文字単位の動き（カーニング・ベースラインウェーブ等）を反映した後の範囲で開閉する。
    const groupBounds = characterGroup.getLocalBounds();
    const textHalfWidth = Math.max(wordWidth / 2, Math.abs(groupBounds.left), Math.abs(groupBounds.right)) + fontSize * 0.1;
    const textHalfHeight = Math.max(fontSize * 0.75, Math.abs(groupBounds.top), Math.abs(groupBounds.bottom));
    this.applyClip(container, motionState, textHalfWidth, textHalfHeight, textHalfWidth + fontSize * 2);
    return true;
  }

  /**
   * フレーズ内の文字を「スペースで区切られたまとまり（トークン）」に分ける。
   * 全角・半角スペースはトークン間の余白として扱い、行頭・行末に来た場合は詰める。
   * 単語の境界とスペースの位置だけを改行候補にし、単語内の連続した文字は分割しない。
   */
  private buildPhraseTokens(
    params: Record<string, unknown>,
    total: number,
    currentIndex: number,
    currentText: string,
    fontSize: number,
    gap: number
  ): PhraseFlowToken[] {
    const words = Array.isArray(params.words) ? params.words as Array<{ word?: string }> : [];
    const fontFamily = FontService.normalizeFontFamily(stringParam(params, 'fontFamily', 'Arial'));
    const fontWeight = params.variableWeightEnabled === true
      ? String(numberParam(params, 'variableWeightMax', 900))
      : stringParam(params, 'fontWeight', '700');
    const tokens: PhraseFlowToken[] = [];
    // スペースは実際の文字幅（全角は約1文字分、半角はその約1/4）を単語間隔に加えた区切り幅にする。
    let pendingSpace = 0;
    for (let wordIndex = 0; wordIndex < total; wordIndex += 1) {
      const wordText = words[wordIndex]?.word ?? (wordIndex === currentIndex ? currentText : undefined);
      if (wordText === undefined) {
        // 単語データが無い場合は 1 文字分の仮トークンで位置だけ確保する。
        tokens.push({ word: wordIndex, chars: [], charWidths: [], width: fontSize, separation: tokens.length > 0 ? gap + pendingSpace : 0, breakable: tokens.length > 0, spaceBefore: pendingSpace > 0, text: '' });
        pendingSpace = 0;
        continue;
      }
      let current: PhraseFlowToken | null = null;
      let firstInWord = true;
      Array.from(wordText).forEach((character, characterIndex) => {
        if (WHITESPACE_PATTERN.test(character)) {
          pendingSpace += this.measureTextWidth(character, fontFamily, fontSize, fontWeight);
          current = null;
          return;
        }
        if (!current) {
          const wordBoundary = firstInWord && tokens.length > 0;
          current = {
            word: wordIndex,
            chars: [],
            charWidths: [],
            width: 0,
            separation: tokens.length > 0 ? (pendingSpace > 0 ? gap + pendingSpace : wordBoundary ? gap : 0) : 0,
            breakable: tokens.length > 0,
            spaceBefore: pendingSpace > 0,
            text: ''
          };
          tokens.push(current);
          pendingSpace = 0;
          firstInWord = false;
        }
        const characterWidth = this.measureTextWidth(character, fontFamily, fontSize, fontWeight);
        current.chars.push(characterIndex);
        current.charWidths.push(characterWidth);
        current.width += characterWidth;
        current.text += character;
      });
    }

    // 禁則処理: 行頭に置けない約物で始まるトークンの手前、行末に置けない約物で終わるトークンの直後では改行しない。
    // 禁則を守ると改行できる位置が一つも無くなる場合は、禁則を無視して従来どおり改行を許可する。
    const allowedByKinsoku = (tokenIndex: number) => {
      const head = Array.from(tokens[tokenIndex].text)[0] ?? '';
      const tail = Array.from(tokens[tokenIndex - 1].text).pop() ?? '';
      return !LINE_START_PROHIBITED_PATTERN.test(head) && !LINE_END_PROHIBITED_PATTERN.test(tail);
    };
    const kinsokuBreaks = tokens.map((_, tokenIndex) => tokenIndex > 0 && allowedByKinsoku(tokenIndex));
    if (kinsokuBreaks.some(Boolean)) {
      tokens.forEach((token, tokenIndex) => {
        token.breakable = kinsokuBreaks[tokenIndex];
      });
    }
    return tokens;
  }

  /**
   * トークン列を指定の改行候補で行に分ける。行幅の最大値が最小になる分割を行数ごとに求め、
   * 文字が最も大きく表示できる行数を選ぶ（ほぼ同じ大きさなら行数の少ない方）。
   */
  private breakPhraseTokens(
    tokens: PhraseFlowToken[],
    canBreakBefore: (tokenIndex: number) => boolean,
    scaleFor: (widest: number, lines: number) => number,
    maxLines: number
  ): { scale: number; breaks: number[] } {
    const count = tokens.length;
    const prefix = [0];
    tokens.forEach((token, tokenIndex) => prefix.push(prefix[tokenIndex] + token.width + (tokenIndex > 0 ? token.separation : 0)));
    // 行頭トークンの手前の余白（スペース・単語間隔）は行幅に含めない。
    const lineWidth = (from: number, to: number) => prefix[to] - prefix[from] - (from > 0 ? tokens[from].separation : 0);
    const candidates = [0];
    for (let tokenIndex = 1; tokenIndex < count; tokenIndex += 1) {
      if (canBreakBefore(tokenIndex)) candidates.push(tokenIndex);
    }
    candidates.push(count);

    let best: { scale: number; breaks: number[] } = { scale: scaleFor(lineWidth(0, count), 1), breaks: [0] };
    const segments = candidates.length - 1;
    // cost[k][c]: 先頭から候補 c までを k 行に分けたときの最大行幅
    const cost: number[][] = [new Array(candidates.length).fill(Infinity)];
    const split: number[][] = [new Array(candidates.length).fill(0)];
    cost[0][0] = 0;
    for (let lines = 1; lines <= Math.min(maxLines, segments); lines += 1) {
      cost.push(new Array(candidates.length).fill(Infinity));
      split.push(new Array(candidates.length).fill(0));
      for (let end = lines; end < candidates.length; end += 1) {
        for (let start = lines - 1; start < end; start += 1) {
          const value = Math.max(cost[lines - 1][start], lineWidth(candidates[start], candidates[end]));
          if (value < cost[lines][end]) {
            cost[lines][end] = value;
            split[lines][end] = start;
          }
        }
      }
      const scale = scaleFor(cost[lines][segments], lines);
      if (lines > 1 && scale > best.scale * 1.02) {
        const breaks: number[] = [];
        let end = segments;
        for (let k = lines; k >= 1; k -= 1) {
          breaks.unshift(candidates[split[k][end]]);
          end = split[k][end];
        }
        best = { scale, breaks };
      }
    }
    return best;
  }

  /**
   * 中央・画面充填・縦積みレイアウト。スペースを改行候補として扱い、
   * 行頭・行末のスペースを詰めたうえで各行を中央揃えにする。
   * 単語がスペースを挟んで複数行にまたがる場合は、文字ごとの配置（charOffsets）も返す。
   */
  private calculatePhraseFlowLayout(
    mode: 'center' | 'fill' | 'vertical',
    params: Record<string, unknown>,
    index: number,
    total: number,
    text: string,
    fontSize: number,
    spacing: number,
    stageWidth: number,
    stageHeight: number
  ): PhraseFlowPlacement {
    const words = Array.isArray(params.words) ? params.words as Array<{ word?: string }> : [];
    const cacheKey = [
      mode, total, index >= words.length ? text : '', fontSize, spacing, stageWidth, stageHeight,
      stringParam(params, 'fontFamily', 'Arial'), stringParam(params, 'fontWeight', '700'),
      params.variableWeightEnabled === true ? numberParam(params, 'variableWeightMax', 900) : '',
      ...words.map(word => word?.word ?? '')
    ].join('\u0001');
    let placements = this.phraseLayoutCache.get(cacheKey);
    if (!placements) {
      placements = this.computePhraseFlowPlacements(mode, params, index, total, text, fontSize, spacing, stageWidth, stageHeight);
      if (this.phraseLayoutCache.size > 64) this.phraseLayoutCache.clear();
      this.phraseLayoutCache.set(cacheKey, placements);
    }
    return placements[index] ?? { x: 0, y: 0, rotation: 0, scale: 1, width: fontSize };
  }

  private computePhraseFlowPlacements(
    mode: 'center' | 'fill' | 'vertical',
    params: Record<string, unknown>,
    index: number,
    total: number,
    text: string,
    fontSize: number,
    spacing: number,
    stageWidth: number,
    stageHeight: number
  ): PhraseFlowPlacement[] {
    const gap = mode === 'center'
      ? fontSize * 0.38 * spacing
      : fontSize * 0.3 * Math.max(0.35, spacing);
    const lineHeight = mode === 'vertical'
      ? fontSize * (1.1 + 0.35 * Math.max(0.35, spacing))
      : fontSize * (1.2 + 0.15 * Math.max(0.35, spacing));
    const words = Array.isArray(params.words) ? params.words as Array<{ word?: string }> : [];
    const tokens = this.buildPhraseTokens(params, total, index, text, fontSize, gap);
    if (tokens.length === 0) {
      return Array.from({ length: total }, () => ({ x: 0, y: 0, rotation: 0, scale: 1, width: 0 }));
    }

    let breaks: number[];
    let scale: number;
    if (mode === 'center') {
      const plan = this.breakPhraseTokens(tokens, () => false, widest => Math.min(1, stageWidth * 0.88 / Math.max(1, widest)), 1);
      breaks = plan.breaks;
      scale = plan.scale;
    } else if (mode === 'vertical') {
      // 縦積みは改行候補ごとに 1 行。列には折り返さない。
      breaks = tokens.map((token, tokenIndex) => tokenIndex).filter(tokenIndex => tokenIndex === 0 || tokens[tokenIndex].breakable);
      const widest = Math.max(fontSize * 0.5, ...breaks.map((start, row) => {
        const end = breaks[row + 1] ?? tokens.length;
        return tokens.slice(start, end).reduce((sum, token, offset) => sum + token.width + (offset > 0 ? token.separation : 0), 0);
      }));
      scale = Math.min(1.15, stageWidth * 0.88 / widest, stageHeight * 0.86 / (breaks.length * lineHeight));
    } else {
      const scaleFor = (widest: number, lines: number) => Math.min(
        1.15,
        stageWidth * 0.86 / Math.max(1, widest),
        stageHeight * 0.72 / (lines * lineHeight)
      );
      // スペースがある場合はスペース位置での改行を優先し、それより大幅に大きく表示できるときだけ単語境界でも改行する。
      const anyBoundary = this.breakPhraseTokens(tokens, tokenIndex => tokens[tokenIndex].breakable, scaleFor, tokens.length);
      const hasSpaces = tokens.some((token, tokenIndex) => tokenIndex > 0 && token.spaceBefore && token.breakable);
      const atSpaces = hasSpaces
        ? this.breakPhraseTokens(tokens, tokenIndex => tokens[tokenIndex].spaceBefore && tokens[tokenIndex].breakable, scaleFor, tokens.length)
        : anyBoundary;
      const plan = anyBoundary.scale > atSpaces.scale * 1.15 ? anyBoundary : atSpaces;
      breaks = plan.breaks;
      scale = plan.scale;
    }
    scale = Math.max(0.2, scale);

    // 各トークンの中心座標（拡大前の単位）を求める。
    const centers: Array<{ x: number; y: number }> = [];
    breaks.forEach((start, row) => {
      const end = breaks[row + 1] ?? tokens.length;
      const rowWidth = tokens.slice(start, end).reduce((sum, token, offset) => sum + token.width + (offset > 0 ? token.separation : 0), 0);
      let cursor = -rowWidth / 2;
      for (let tokenIndex = start; tokenIndex < end; tokenIndex += 1) {
        if (tokenIndex > start) cursor += tokens[tokenIndex].separation;
        centers[tokenIndex] = { x: cursor + tokens[tokenIndex].width / 2, y: (row - (breaks.length - 1) / 2) * lineHeight };
        cursor += tokens[tokenIndex].width;
      }
    });

    let previous: PhraseFlowPlacement = { x: 0, y: 0, rotation: 0, scale, width: 0 };
    return Array.from({ length: total }, (_, wordIndex) => {
      const wordTokens = tokens
        .map((token, tokenIndex) => ({ token, center: centers[tokenIndex] }))
        .filter(entry => entry.token.word === wordIndex);
      if (wordTokens.length === 0) {
        // スペースだけの単語は表示する文字が無いので、直前の単語の位置に置く。
        previous = { ...previous, width: 0, charOffsets: undefined };
        return previous;
      }
      const left = Math.min(...wordTokens.map(entry => entry.center.x - entry.token.width / 2));
      const right = Math.max(...wordTokens.map(entry => entry.center.x + entry.token.width / 2));
      const top = Math.min(...wordTokens.map(entry => entry.center.y));
      const bottom = Math.max(...wordTokens.map(entry => entry.center.y));
      const anchor = { x: (left + right) / 2, y: (top + bottom) / 2 };
      // 文字ごとの配置。スペース文字は直前の文字の右隣（非表示）に置く。
      const characters = Array.from(words[wordIndex]?.word ?? (wordIndex === index ? text : ''));
      const charOffsets: Array<{ x: number; y: number }> = [];
      wordTokens.forEach(({ token, center }) => {
        let cursor = center.x - token.width / 2 - anchor.x;
        token.chars.forEach((characterIndex, offset) => {
          charOffsets[characterIndex] = { x: cursor + token.charWidths[offset] / 2, y: center.y - anchor.y };
          cursor += token.charWidths[offset];
        });
      });
      let last = { x: wordTokens[0].center.x - wordTokens[0].token.width / 2 - anchor.x, y: wordTokens[0].center.y - anchor.y };
      characters.forEach((_, characterIndex) => {
        if (charOffsets[characterIndex]) {
          last = charOffsets[characterIndex];
        } else {
          charOffsets[characterIndex] = { ...last };
        }
      });
      previous = {
        x: anchor.x * scale,
        y: anchor.y * scale,
        rotation: 0,
        scale,
        width: right - left,
        charOffsets: characters.length > 0 ? charOffsets : undefined
      };
      return previous;
    });
  }

  private updateCharacterText(
    container: PIXI.Container,
    originalText: string,
    displayText: string,
    params: Record<string, unknown>,
    fontSize: number,
    nowMs: number,
    wordStartMs: number,
    wordEndMs: number,
    fontWeightOverride?: string,
    charOffsets?: Array<{ x: number; y: number }>
  ): void {
    let group = container.children.find(child => child.name === CHAR_GROUP_NAME) as PIXI.Container | undefined;
    if (!group) {
      group = new PIXI.Container();
      group.name = CHAR_GROUP_NAME;
      container.addChild(group);
    }

    const originalCharacters = Array.from(originalText);
    const displayCharacters = Array.from(displayText);
    const characterTimings = Array.isArray(params.chars) ? params.chars as CharUnit[] : [];
    const fontFamily = FontService.normalizeFontFamily(stringParam(params, 'fontFamily', 'Arial'));
    const fontWeight = fontWeightOverride ?? stringParam(params, 'fontWeight', '700');
    const waitingColor = stringParam(params, 'textColor', '#F3F0E8');
    const activeColor = stringParam(params, 'activeTextColor', '#FFFFFF');
    const completedColor = stringParam(params, 'completedTextColor', '#A8FF60');
    const fillDirection = stringParam(params, 'karaokeFillDirection', 'leftToRight');
    const characterCount = Math.max(1, originalCharacters.length);
    const fallbackDuration = Math.max(1, wordEndMs - wordStartMs) / characterCount;
    const widths: number[] = [];

    originalCharacters.forEach((character, characterIndex) => {
      const timing = characterTimings[characterIndex];
      const charStartMs = typeof timing?.start === 'number'
        ? timing.start
        : wordStartMs + fallbackDuration * characterIndex;
      const charEndMs = typeof timing?.end === 'number'
        ? timing.end
        : wordStartMs + fallbackDuration * (characterIndex + 1);
      const color = nowMs < charStartMs
        ? waitingColor
        : nowMs <= charEndMs
          ? activeColor
          : completedColor;
      const visibleCharacter = displayCharacters[characterIndex] ?? character;
      const signature = `${visibleCharacter}|${fontFamily}|${fontSize}|${fontWeight}|${color}`;
      let characterText = group!.children.find(
        child => child.name === `${CHAR_NAME_PREFIX}${characterIndex}`
      ) as PIXI.Text | undefined;

      if (!characterText) {
        const style = this.createCharacterStyle(fontFamily, fontSize, fontWeight, color);
        characterText = new PIXI.Text(visibleCharacter, style);
        characterText.name = `${CHAR_NAME_PREFIX}${characterIndex}`;
        characterText.anchor.set(0.5);
        (characterText as PIXI.Text & { __kineticSignature?: string }).__kineticSignature = signature;
        group!.addChild(characterText);
      } else if ((characterText as PIXI.Text & { __kineticSignature?: string }).__kineticSignature !== signature) {
        characterText.text = visibleCharacter;
        characterText.style = this.createCharacterStyle(fontFamily, fontSize, fontWeight, color);
        (characterText as PIXI.Text & { __kineticSignature?: string }).__kineticSignature = signature;
      }

      const characterWidth = this.measureTextWidth(character, fontFamily, fontSize, fontWeight);
      const fillColor = params.karaokeFillUseCustomColor === true
        ? stringParam(params, 'karaokeFillColor', completedColor)
        : completedColor;
      const fillProgress = params.karaokeFillEnabled === true && nowMs >= charStartMs && nowMs <= charEndMs
        ? (nowMs - charStartMs) / Math.max(1, charEndMs - charStartMs)
        : null;
      this.updateKaraokeFill(
        characterText,
        fillProgress,
        visibleCharacter,
        () => this.createCharacterStyle(fontFamily, fontSize, fontWeight, fillColor),
        `${visibleCharacter}|${fontFamily}|${fontSize}|${fontWeight}|${fillColor}`,
        characterWidth,
        fontSize,
        fillDirection
      );
      widths.push(characterWidth);
    });

    group.children
      .filter(child => child.name?.startsWith(CHAR_NAME_PREFIX))
      .slice(originalCharacters.length)
      .forEach(child => {
        group!.removeChild(child);
        child.destroy();
      });

    // 先頭・末尾のスペースを除いた表示部分が単語の中心に来るよう並べる。
    const isSpace = (characterIndex: number) => WHITESPACE_PATTERN.test(originalCharacters[characterIndex]);
    const totalWidth = widths.reduce((sum, characterWidth) => sum + characterWidth, 0);
    let leadingSpace = 0;
    for (let characterIndex = 0; characterIndex < widths.length && isSpace(characterIndex); characterIndex += 1) {
      leadingSpace += widths[characterIndex];
    }
    let trailingSpace = 0;
    for (let characterIndex = widths.length - 1; characterIndex >= 0 && isSpace(characterIndex) && leadingSpace < totalWidth; characterIndex -= 1) {
      trailingSpace += widths[characterIndex];
    }
    let cursorX = -totalWidth / 2 + (trailingSpace - leadingSpace) / 2;
    widths.forEach((characterWidth, characterIndex) => {
      const characterText = group!.children.find(
        child => child.name === `${CHAR_NAME_PREFIX}${characterIndex}`
      ) as PIXI.Text | undefined;
      if (characterText) {
        const offset = charOffsets?.[characterIndex];
        characterText.position.set(offset ? offset.x : cursorX + characterWidth / 2, offset ? offset.y : 0);
        // スペースは描画しない（範囲計算やマスクに余白が含まれないようにする）。
        characterText.visible = !isSpace(characterIndex);
        characterText.scale.set(1);
        characterText.skew.set(0);
        characterText.rotation = 0;
        characterText.alpha = 1;
      }
      cursorX += characterWidth;
    });
  }

  /**
   * KARAOKE FILL: 発声中の文字に発声後色の複製を重ね、左→右に開くマスクで塗り進める。
   * 文字Textの子として持つため、文字単位の移動・変形に追従する。
   */
  private updateKaraokeFill(
    characterText: PIXI.Text,
    progress: number | null,
    visibleCharacter: string,
    createFillStyle: () => PIXI.TextStyle,
    signature: string,
    characterWidth: number,
    fontSize: number,
    direction: string
  ): void {
    let fill = characterText.children.find(child => child.name === KARAOKE_FILL_NAME) as
      (PIXI.Text & { __kineticSignature?: string }) | undefined;
    let mask = characterText.children.find(child => child.name === KARAOKE_MASK_NAME) as PIXI.Graphics | undefined;
    if (progress === null) {
      [fill, mask].forEach(child => {
        if (!child) return;
        characterText.removeChild(child);
        child.destroy();
      });
      return;
    }

    if (!fill) {
      fill = new PIXI.Text(visibleCharacter, createFillStyle());
      fill.name = KARAOKE_FILL_NAME;
      fill.anchor.set(0.5);
      characterText.addChild(fill);
    } else if (fill.__kineticSignature !== signature) {
      fill.text = visibleCharacter;
      fill.style = createFillStyle();
    }
    fill.__kineticSignature = signature;
    if (!mask) {
      mask = new PIXI.Graphics();
      mask.name = KARAOKE_MASK_NAME;
      characterText.addChild(mask);
      fill.mask = mask;
    }
    mask.clear();
    mask.beginFill(0xffffff);
    const amount = Math.min(1, Math.max(0, progress));
    const width = characterWidth + 4;
    const height = fontSize * 2;
    const left = -width / 2;
    const top = -fontSize;
    if (direction === 'rightToLeft') {
      mask.drawRect(left + width * (1 - amount), top, width * amount, height);
    } else if (direction === 'topToBottom' || direction === 'bottomToTop') {
      // 縦方向は字面の高さを基準にし、塗り始め・終わりが余白で止まって見えないようにする。
      const glyphHeight = fontSize * 1.1;
      const filled = glyphHeight * amount;
      // 塗り終わっていない側は字面の外まで含めないよう、塗った部分＋外側の余白だけを開く。
      if (direction === 'topToBottom') {
        mask.drawRect(left, top, width, fontSize - glyphHeight / 2 + filled);
      } else {
        mask.drawRect(left, glyphHeight / 2 - filled, width, fontSize - glyphHeight / 2 + filled);
      }
    } else {
      mask.drawRect(left, top, width * amount, height);
    }
    mask.endFill();
  }

  private createCharacterStyle(fontFamily: string, fontSize: number, fontWeight: string, color: string): PIXI.TextStyle {
    return TextStyleFactory.createTextStyle({
      fontFamily,
      fontSize,
      fill: color,
      align: 'center',
      fontWeight,
      paddingMultiplier: 0.2,
      minPadding: 10
    });
  }

  private measureTextWidth(text: string, fontFamily: string, fontSize: number, fontWeight: string): number {
    const key = `${fontFamily}|${fontSize}|${fontWeight}|${text}`;
    const cached = this.textWidthCache.get(key);
    if (cached !== undefined) return cached;
    const style = TextStyleFactory.createTextStyle({
      fontFamily,
      fontSize,
      fill: '#FFFFFF',
      fontWeight,
      paddingMultiplier: 0,
      minPadding: 0
    });
    const width = Math.max(0, PIXI.TextMetrics.measureText(text, style).width);
    this.textWidthCache.set(key, width);
    return width;
  }

  /** 文字ごとの歌唱開始時刻。文字タイミングが無い場合は単語の長さを均等割りする。 */
  private resolveCharacterStarts(text: string, params: Record<string, unknown>, wordStartMs: number, wordEndMs: number): number[] {
    const characters = Array.from(text);
    const timings = Array.isArray(params.chars) ? params.chars as CharUnit[] : [];
    const fallbackDuration = Math.max(1, wordEndMs - wordStartMs) / Math.max(1, characters.length);
    return characters.map((_, characterIndex) => {
      const start = timings[characterIndex]?.start;
      return typeof start === 'number' ? start : wordStartMs + fallbackDuration * characterIndex;
    });
  }

  private measureWordWidth(text: string, params: Record<string, unknown>, fontSize: number): number {
    const fontFamily = FontService.normalizeFontFamily(stringParam(params, 'fontFamily', 'Arial'));
    const fontWeight = stringParam(params, 'fontWeight', '700');
    return Array.from(text).reduce(
      (sum, character) => sum + this.measureTextWidth(character, fontFamily, fontSize, fontWeight),
      0
    );
  }

  /** ぼかし量が1px未満なら通常描画へ戻し、フィルターを残さない。 */
  private applyBlur(container: PIXI.Container, amount: number): void {
    const holder = container as PIXI.Container & { __kineticBlur?: PIXI.BlurFilter };
    if (!(amount >= 1)) {
      if (holder.__kineticBlur) {
        container.filters = (container.filters || []).filter(filter => filter !== holder.__kineticBlur);
        if (container.filters.length === 0) container.filters = null;
        holder.__kineticBlur.destroy();
        delete holder.__kineticBlur;
      }
      return;
    }
    if (!holder.__kineticBlur) {
      holder.__kineticBlur = new PIXI.BlurFilter(amount, 3);
      container.filters = [...(container.filters || []), holder.__kineticBlur];
    }
    holder.__kineticBlur.blur = amount;
  }

  /** clipTop/Bottom/Left/Right の割合だけ各辺を隠す矩形マスク。すべて0ならマスクを外す。 */
  private applyClip(
    container: PIXI.Container,
    state: Pick<MotionState, 'clipTop' | 'clipBottom' | 'clipLeft' | 'clipRight'>,
    textHalfWidth: number,
    halfHeight: number,
    paddedHalfWidth: number
  ): void {
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const top = clamp(state.clipTop);
    const bottom = clamp(state.clipBottom);
    const left = clamp(state.clipLeft);
    const right = clamp(state.clipRight);
    let mask = container.children.find(child => child.name === CLIP_MASK_NAME) as PIXI.Graphics | undefined;
    if (top <= 0.001 && bottom <= 0.001 && left <= 0.001 && right <= 0.001) {
      if (mask) {
        if (container.mask === mask) container.mask = null;
        container.removeChild(mask);
        mask.destroy();
      }
      return;
    }
    if (!mask) {
      mask = new PIXI.Graphics();
      mask.name = CLIP_MASK_NAME;
      container.addChild(mask);
    }
    const fullHeight = halfHeight * 2;
    const visibleTop = -halfHeight + fullHeight * top;
    const visibleHeight = Math.max(0, fullHeight * (1 - top - bottom));
    // 左右の開閉は文字幅を基準にし、閉じていない側は装飾が切れないよう余白まで広げる。
    const fullWidth = textHalfWidth * 2;
    const visibleLeft = left > 0.001 ? -textHalfWidth + fullWidth * left : -paddedHalfWidth;
    const visibleRight = right > 0.001 ? textHalfWidth - fullWidth * right : paddedHalfWidth;
    mask.clear();
    mask.beginFill(0xffffff);
    mask.drawRect(visibleLeft, visibleTop, Math.max(0, visibleRight - visibleLeft), visibleHeight);
    mask.endFill();
    container.mask = mask;
  }

  private ensureText(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    fontSize: number,
    color: string,
    fontWeightOverride?: string
  ): PIXI.Text {
    let textObject = container.children.find(child => child.name === TEXT_NAME) as PIXI.Text | undefined;
    const fontFamily = FontService.normalizeFontFamily(stringParam(params, 'fontFamily', 'Arial'));
    const fontWeight = fontWeightOverride ?? stringParam(params, 'fontWeight', '700');
    const signature = `${text}|${fontFamily}|${fontSize}|${fontWeight}|${color}`;

    if (!textObject) {
      textObject = TextStyleFactory.createHighDPIText(text, {
        fontFamily,
        fontSize,
        fill: color,
        align: 'center',
        fontWeight
      });
      textObject.name = TEXT_NAME;
      textObject.anchor.set(0.5);
      container.addChild(textObject);
    }

    if ((textObject as PIXI.Text & { __kineticSignature?: string }).__kineticSignature !== signature) {
      textObject.text = text;
      textObject.style = TextStyleFactory.createTextStyle({
        fontFamily,
        fontSize,
        fill: color,
        align: 'center',
        fontWeight
      });
      (textObject as PIXI.Text & { __kineticSignature?: string }).__kineticSignature = signature;
    }
    return textObject;
  }

  /**
   * RGB Drift / 残像のエコー。単語Textではなく、表示中の文字グループを写すことで、
   * カーニングやベースラインウェーブなど文字単位の動きを反映した位置に重ねる。
   */
  private updateEchoes(
    container: PIXI.Container,
    source: PIXI.Container,
    params: Record<string, unknown>,
    nowMs: number,
    intensity: number
  ): void {
    const { screen: screenMotion } = this.resolveScene(params);
    const mode = screenMotion === 'rgbDrift'
      ? 'rgb'
      : screenMotion === 'afterimage'
        ? 'echo'
        : 'none';
    const echoNames = ['kinetic-echo-a', 'kinetic-echo-b'];

    if (mode === 'none') {
      echoNames.forEach(name => {
        const echo = container.children.find(child => child.name === name);
        if (echo) {
          container.removeChild(echo);
          echo.destroy();
        }
      });
      return;
    }

    echoNames.forEach((name, echoIndex) => {
      let echo = container.children.find(child => child.name === name) as PIXI.Container | undefined;
      if (echo && echo instanceof PIXI.Text) {
        // 旧形式（単語Text）のエコーが残っていれば作り直す。
        container.removeChild(echo);
        echo.destroy();
        echo = undefined;
      }
      if (!echo) {
        echo = new PIXI.Container();
        echo.name = name;
        container.addChildAt(echo, 0);
      }
      syncTextGroup(echo, source);

      const direction = echoIndex === 0 ? -1 : 1;
      const wave = Math.sin(nowMs * 0.025 + echoIndex * Math.PI);
      let tint: number;
      let blendMode: PIXI.BLEND_MODES;

      if (mode === 'rgb') {
        const split = numberParam(params, 'rgbDriftSplit', 1);
        tint = echoIndex === 0 ? 0xff245f : 0x20e3ff;
        blendMode = PIXI.BLEND_MODES.ADD;
        echo.alpha = 0.42;
        echo.position.set(direction * (4 + Math.abs(wave) * 5) * intensity * split, wave * 2 * intensity * split);
        echo.scale.set(1, 1);
      } else {
        const spread = numberParam(params, 'afterimageSpread', 1);
        tint = 0xffffff;
        blendMode = PIXI.BLEND_MODES.SCREEN;
        echo.alpha = Math.min(1, Math.max(0.08, 0.22 - echoIndex * 0.06) * numberParam(params, 'afterimageOpacity', 1));
        echo.position.set(direction * (8 + echoIndex * 7) * intensity * spread, direction * 3 * intensity * spread);
        const echoScale = 1 + (echoIndex + 1) * 0.045 * intensity * spread;
        echo.scale.set(echoScale);
      }
      // Container は tint / blendMode を持たないため、各文字へ設定する。
      echo.children.forEach(child => {
        if (child instanceof PIXI.Text) {
          child.tint = tint;
          child.blendMode = blendMode;
        }
      });
    });
  }

  private resolveScene(params: Record<string, unknown>): SceneDefinition {
    return {
      layout: stringParam(params, 'motionLayout', 'center') as LayoutName,
      entrance: normalizeMotionName(stringParam(params, 'entranceMotion', 'slam')) as EntranceName,
      sustain: normalizeMotionName(stringParam(params, 'sustainMotion', 'pulse')) as SustainName,
      exit: normalizeMotionName(stringParam(params, 'exitMotion', 'collapse')) as ExitName,
      screen: stringParam(params, 'screenMotion', 'zoom') as ScreenMotionName
    };
  }

  private resolveAnimatedFontWeight(
    params: Record<string, unknown>,
    nowMs: number,
    effectStartMs: number
  ): string {
    const baseWeight = stringParam(params, 'fontWeight', '700');
    if (params.variableWeightEnabled !== true) return baseWeight;

    const minimum = Math.max(1, numberParam(params, 'variableWeightMin', 200));
    const maximum = Math.max(minimum, numberParam(params, 'variableWeightMax', 900));
    const pulse = sampleVariableWeightPulse(
      nowMs - effectStartMs,
      numberParam(params, 'variableWeightDuration', 4200)
    );
    // 小刻みな値のままだと毎フレームTextStyleを生成するため、視覚差が出にくい10刻みに丸める。
    return String(Math.round((minimum + (maximum - minimum) * pulse) / 10) * 10);
  }

  private resolveTypographyEffects(params: Record<string, unknown>): TypographyEffectParams {
    return {
      shuffleEnabled: params.shuffleEnabled === true,
      shuffleCharset: stringParam(params, 'shuffleCharset', '01#%&<>アイウエオXYZ'),
      shuffleRate: numberParam(params, 'shuffleRate', 50),
      shuffleDuration: numberParam(params, 'shuffleDuration', 720),
      repetitionEnabled: params.repetitionEnabled === true,
      repetitionCount: numberParam(params, 'repetitionCount', 8),
      repetitionSpread: numberParam(params, 'repetitionSpread', 14),
      repetitionDepth: numberParam(params, 'repetitionDepth', 0.65),
      organicEnabled: params.organicEnabled === true,
      organicAmplitude: numberParam(params, 'organicAmplitude', 0.04),
      organicFrequency: numberParam(params, 'organicFrequency', 3),
      organicSpeed: numberParam(params, 'organicSpeed', 1),
      destructionEnabled: params.destructionEnabled === true,
      destructionStrength: numberParam(params, 'destructionStrength', 1),
      destructionSlices: numberParam(params, 'destructionSlices', 9),
      destructionDuration: numberParam(params, 'destructionDuration', 900),
      emittersEnabled: params.emittersEnabled === true,
      emitterStyle: stringParam(params, 'emitterStyle', 'particles') as TypographyEffectParams['emitterStyle'],
      emitterCount: numberParam(params, 'emitterCount', 16),
      emitterRadius: numberParam(params, 'emitterRadius', 130),
      surfaceEnabled: params.surfaceEnabled === true,
      surfaceShape: stringParam(params, 'surfaceShape', 'ribbon') as TypographyEffectParams['surfaceShape'],
      surfaceCurve: numberParam(params, 'surfaceCurve', 0.14),
      surfaceRepeat: numberParam(params, 'surfaceRepeat', 2),
      variableWeightEnabled: params.variableWeightEnabled === true,
      variableWeightDuration: numberParam(params, 'variableWeightDuration', 4200),
      variableWeightSpacing: numberParam(params, 'variableWeightSpacing', 4),
      kerningMotionEnabled: params.kerningMotionEnabled === true,
      kerningMotionAmount: numberParam(params, 'kerningMotionAmount', 14),
      kerningMotionDuration: numberParam(params, 'kerningMotionDuration', 620),
      baselineWaveEnabled: params.baselineWaveEnabled === true,
      baselineWaveOffset: numberParam(params, 'baselineWaveOffset', 44),
      baselineWaveOvershoot: numberParam(params, 'baselineWaveOvershoot', 7),
      baselineWaveDuration: numberParam(params, 'baselineWaveDuration', 840),
      baselineWaveStagger: numberParam(params, 'baselineWaveStagger', 55),
      impactOutlineEnabled: params.impactOutlineEnabled === true,
      impactOutlineSpread: numberParam(params, 'impactOutlineSpread', 14),
      impactOutlineDuration: numberParam(params, 'impactOutlineDuration', 220),
      impactOutlineThickness: numberParam(params, 'impactOutlineThickness', 3.4),
      impactOutlineTrigger: params.impactOutlineTrigger === 'character' ? 'character' : 'word',
      emitterLineRate: numberParam(params, 'emitterLineRate', 12),
      emitterLineWidth: numberParam(params, 'emitterLineWidth', 5),
      emitterInnerRadius: numberParam(params, 'emitterInnerRadius', 0.55)
    };
  }
}

export default KineticSceneTemplate;
