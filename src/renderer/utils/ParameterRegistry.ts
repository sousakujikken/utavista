/**
 * パラメータレジストリ
 * すべてのパラメータの定義と検証を一元管理
 */

import { StandardParameters, DEFAULT_PARAMETERS } from '../../types/StandardParameters';
import { TemplateParameterMap, TemplateId } from '../types/TemplateParameters';

/**
 * パラメータ定義
 */
interface ParameterDefinition {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'select' | 'color';
  category: 'standard' | 'template-specific';
  templateId?: TemplateId;
  defaultValue: any;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }> | string[]; // 選択肢
  description: string;
}

/**
 * パラメータレジストリクラス
 */
export class ParameterRegistry {
  private static instance: ParameterRegistry;
  private parameters: Map<string, ParameterDefinition> = new Map();
  
  private constructor() {
    this.initializeStandardParameters();
    this.initializeTemplateParameters();
  }
  
  static getInstance(): ParameterRegistry {
    if (!this.instance) {
      this.instance = new ParameterRegistry();
    }
    return this.instance;
  }
  
  /**
   * 標準パラメータの初期化
   */
  private initializeStandardParameters(): void {
    // === 基本テキストパラメータ ===
    this.registerParameter({
      name: 'fontSize',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.fontSize,
      min: 12,
      max: 256,
      description: 'フォントサイズ'
    });
    
    this.registerParameter({
      name: 'fontFamily',
      type: 'string',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.fontFamily,
      description: 'フォントファミリー'
    });
    
    // === 色設定 ===
    this.registerParameter({
      name: 'textColor',
      type: 'string',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.textColor,
      description: 'デフォルトテキスト色'
    });
    
    this.registerParameter({
      name: 'activeTextColor',
      type: 'string',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.activeTextColor,
      description: 'アクティブテキスト色'
    });
    
    this.registerParameter({
      name: 'completedTextColor',
      type: 'string',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.completedTextColor,
      description: '完了テキスト色'
    });
    
    // === レイアウトパラメータ ===
    this.registerParameter({
      name: 'letterSpacing',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.letterSpacing,
      min: -10,
      max: 50,
      description: '文字間隔'
    });
    
    this.registerParameter({
      name: 'lineHeight',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.lineHeight,
      min: 0,
      max: 3.0,
      description: '行の高さ（倍率）'
    });
    
    this.registerParameter({
      name: 'offsetX',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.offsetX,
      min: -1000,
      max: 1000,
      description: 'X座標オフセット'
    });
    
    this.registerParameter({
      name: 'offsetY',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.offsetY,
      min: -1000,
      max: 1000,
      description: 'Y座標オフセット'
    });
    
    // === エフェクトパラメータ（グロー） ===
    this.registerParameter({
      name: 'enableGlow',
      type: 'boolean',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.enableGlow,
      description: 'グロー有効'
    });
    
    this.registerParameter({
      name: 'glowStrength',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.glowStrength,
      min: 0,
      max: 5,
      description: 'グロー強度'
    });
    
    this.registerParameter({
      name: 'glowBrightness',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.glowBrightness,
      min: 0.5,
      max: 3,
      description: 'グロー明度'
    });
    
    this.registerParameter({
      name: 'glowBlur',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.glowBlur,
      min: 0.1,
      max: 20,
      description: 'グローぼかし'
    });
    
    this.registerParameter({
      name: 'glowQuality',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.glowQuality,
      min: 0.1,
      max: 20,
      step: 0.1,
      description: 'グロー精細度（高いほど高品質・重い）'
    });
    
    this.registerParameter({
      name: 'glowPadding',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.glowPadding,
      min: 0,
      max: 200,
      description: 'グローパディング(px)'
    });
    
    // === エフェクトパラメータ（シャドウ） ===
    this.registerParameter({
      name: 'enableShadow',
      type: 'boolean',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.enableShadow,
      description: 'シャドウ有効'
    });
    
    this.registerParameter({
      name: 'shadowBlur',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.shadowBlur,
      min: 0,
      max: 50,
      description: 'シャドウぼかし'
    });
    
    this.registerParameter({
      name: 'shadowColor',
      type: 'string',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.shadowColor,
      description: 'シャドウ色'
    });
    
    this.registerParameter({
      name: 'shadowAngle',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.shadowAngle,
      min: 0,
      max: 360,
      description: 'シャドウ角度(度)'
    });
    
    this.registerParameter({
      name: 'shadowDistance',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.shadowDistance,
      min: 0,
      max: 100,
      description: 'シャドウ距離(px)'
    });
    
    this.registerParameter({
      name: 'shadowAlpha',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.shadowAlpha,
      min: 0,
      max: 1,
      description: 'シャドウ透明度'
    });
    
    this.registerParameter({
      name: 'shadowOnly',
      type: 'boolean',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.shadowOnly,
      description: 'シャドウのみ表示'
    });
    
    this.registerParameter({
      name: 'shadowQuality',
      type: 'number',
      category: 'standard',
      defaultValue: 4,
      min: 1,
      max: 10,
      step: 1,
      description: 'シャドウ精細度（高いほど高品質・重い）'
    });
    
    // === スパークルエフェクトパラメータ ===

    // === その他 ===
    this.registerParameter({
      name: 'blendMode',
      type: 'string',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.blendMode,
      description: 'ブレンドモード'
    });
    
    // === WordSlideText/WordSlideText2共通パラメータ（標準化） ===
    this.registerParameter({
      name: 'charSpacing',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.charSpacing || 1.0,
      min: 0.1,
      max: 3.0,
      description: '文字間隔倍率'
    });
    
    this.registerParameter({
      name: 'phraseOffsetX',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.phraseOffsetX || 0,
      min: -1000,
      max: 1000,
      description: '画面中央からのX座標オフセット'
    });
    
    this.registerParameter({
      name: 'phraseOffsetY',
      type: 'number',
      category: 'standard',
      defaultValue: DEFAULT_PARAMETERS.phraseOffsetY || 0,
      min: -500,
      max: 500,
      description: '画面中央からのY座標オフセット'
    });

    // === 単語表示・配置モード（標準化） ===
    this.registerParameter({
      name: 'wordDisplayMode',
      type: 'string',
      category: 'standard',
      defaultValue: 'individual_word_entrance',
      options: [
        'individual_word_entrance',      // 単語ごとに個別入場（従来のWordSlideText）
        'phrase_cumulative_same_line'    // 同じ行に単語を配置
      ],
      description: '単語表示モード'
    });

    this.registerParameter({
      name: 'wordAlignment',
      type: 'string',
      category: 'standard',
      defaultValue: 'trailing_align',
      options: [
        'trailing_align',   // 末尾揃え（従来の動作：各単語の最終位置が異なる）
        'leading_align'     // 先頭揃え（全単語の最終位置X座標を1単語目に合わせる）
      ],
      description: '単語アライメント'
    });

    this.registerParameter({
      name: 'wordSpacing',
      type: 'number',
      category: 'standard',
      defaultValue: 1.0,
      min: 0.1,
      max: 5.0,
      description: '単語間スペース'
    });
    
    // === 縦書きレイアウトパラメータ ===
    this.registerParameter({
      name: 'textDirection',
      type: 'string',
      category: 'standard',
      defaultValue: 'horizontal',
      options: ['horizontal', 'vertical'],
      description: '書字方向'
    });
    
    this.registerParameter({
      name: 'verticalStartPosition',
      type: 'string',
      category: 'standard',
      defaultValue: 'top',
      options: ['top', 'center', 'bottom'],
      description: '縦書き開始位置'
    });
    
    this.registerParameter({
      name: 'verticalLineDirection',
      type: 'string',
      category: 'standard',
      defaultValue: 'rtl',
      options: ['rtl', 'ltr'],
      description: '縦書き行方向'
    });
    
    // === 句読点調整パラメータ ===
    this.registerParameter({
      name: 'enablePunctuationAdjustment',
      type: 'boolean',
      category: 'standard',
      defaultValue: false,
      description: '句読点位置調整有効'
    });
    
    this.registerParameter({
      name: 'punctuationCharacters',
      type: 'string',
      category: 'standard',
      defaultValue: '、。，．',
      description: '調整対象句読点文字'
    });
    
    this.registerParameter({
      name: 'punctuationOffsetXRatio',
      type: 'number',
      category: 'standard',
      defaultValue: 0,
      min: -1.0,
      max: 1.0,
      description: '句読点のX座標オフセット比率（フォントサイズ基準）'
    });
    
    this.registerParameter({
      name: 'punctuationOffsetYRatio',
      type: 'number',
      category: 'standard',
      defaultValue: 0,
      min: -1.0,
      max: 1.0,
      description: '句読点のY座標オフセット比率（フォントサイズ基準）'
    });
    
    // === アルファベット回転パラメータ ===
    this.registerParameter({
      name: 'enableAlphabetRotation',
      type: 'boolean',
      category: 'standard',
      defaultValue: true,
      description: 'アルファベット90度回転有効'
    });
    
    this.registerParameter({
      name: 'alphabetRotationPattern',
      type: 'string',
      category: 'standard',
      defaultValue: '[a-zA-Z0-9]+',
      description: '回転対象文字パターン'
    });
    
    this.registerParameter({
      name: 'alphabetCharSpacingRatio',
      type: 'number',
      category: 'standard',
      defaultValue: 0.8,
      min: 0.1,
      max: 2.0,
      description: '回転時文字間隔比率'
    });
    
    // === 長音記号回転パラメータ ===
    this.registerParameter({
      name: 'enableLongVowelRotation',
      type: 'boolean',
      category: 'standard',
      defaultValue: true,
      description: '長音記号90度回転有効（デフォルトON）'
    });
    
    this.registerParameter({
      name: 'longVowelCharacters',
      type: 'string',
      category: 'standard',
      defaultValue: 'ー－‐−─━',
      description: '回転対象長音記号文字'
    });
    
    // === 小文字調整パラメータ ===
    this.registerParameter({
      name: 'enableSmallCharAdjustment',
      type: 'boolean',
      category: 'standard',
      defaultValue: true,
      description: '小文字（撥音・拗音）位置調整有効'
    });
    
    this.registerParameter({
      name: 'smallCharacters',
      type: 'string',
      category: 'standard',
      defaultValue: 'っゃゅょァィゥェォッャュョヮヵヶ',
      description: '調整対象小文字'
    });
    
    this.registerParameter({
      name: 'smallCharOffsetXRatio',
      type: 'number',
      category: 'standard',
      defaultValue: 0.15,
      min: -1.0,
      max: 1.0,
      description: '小文字X座標オフセット比率（フォントサイズ基準）'
    });
    
    this.registerParameter({
      name: 'smallCharOffsetYRatio',
      type: 'number',
      category: 'standard',
      defaultValue: 0.1,
      min: -1.0,
      max: 1.0,
      description: '小文字Y座標オフセット比率（フォントサイズ基準）'
    });
    
    // === 階層分離システム用パラメータ（v1.0+） ===
    this.registerParameter({
      name: 'enablePerformanceMonitoring',
      type: 'boolean',
      category: 'standard',
      defaultValue: true,
      description: '階層システムパフォーマンス監視'
    });
    
    this.registerParameter({
      name: 'targetFrameRate',
      type: 'number',
      category: 'standard',
      defaultValue: 60,
      min: 30,
      max: 120,
      description: '目標フレームレート'
    });
    
    this.registerParameter({
      name: 'syncAccuracyThreshold',
      type: 'number',
      category: 'standard',
      defaultValue: 0.95,
      min: 0.8,
      max: 1.0,
      description: '音楽同期精度閾値'
    });
  }
  
  /**
   * テンプレート固有パラメータの初期化
   */
  private initializeTemplateParameters(): void {
    
    // === FadeBlurRandomTextPrimitive固有パラメータ ===
    this.registerParameter({
      name: 'enableRandomPlacement',
      type: 'boolean',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: true,
      description: 'ランダム配置有効'
    });
    
    this.registerParameter({
      name: 'wordStaggerDelay',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 200,
      min: 0,
      max: 1000,
      description: '単語ごとの遅延時間(ms)'
    });
    
    this.registerParameter({
      name: 'fadeInDuration',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 500,
      min: 100,
      max: 1500,
      description: 'フェードイン時間(ms)'
    });
    
    this.registerParameter({
      name: 'fadeOutDuration',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 500,
      min: 100,
      max: 1500,
      description: 'フェードアウト時間(ms)'
    });
    
    this.registerParameter({
      name: 'minAlpha',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 0.0,
      min: 0.0,
      max: 0.8,
      description: '最小透明度'
    });
    
    this.registerParameter({
      name: 'enableBlur',
      type: 'boolean',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: true,
      description: 'ブラー効果有効'
    });
    
    this.registerParameter({
      name: 'maxBlurStrength',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 8.0,
      min: 0.0,
      max: 20.0,
      description: '最大ブラー強度'
    });
    
    this.registerParameter({
      name: 'blurFadeType',
      type: 'string',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 'sync_with_alpha',
      description: 'ブラーフェードタイプ (sync_with_alpha|inverse_alpha|independent)'
    });
    
    this.registerParameter({
      name: 'glowColor',
      type: 'string',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: '#FFD700',
      description: 'グロー色'
    });
    
    this.registerParameter({
      name: 'glowDistance',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 5.0,
      min: 0.0,
      max: 20.0,
      description: 'グロー距離'
    });
    
    this.registerParameter({
      name: 'shadowOffsetX',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 3.0,
      min: -20.0,
      max: 20.0,
      description: 'シャドウX座標オフセット'
    });
    
    this.registerParameter({
      name: 'shadowOffsetY',
      type: 'number',
      category: 'template-specific',
      templateId: 'fadeblurandomprimitive',
      defaultValue: 3.0,
      min: -20.0,
      max: 20.0,
      description: 'シャドウY座標オフセット'
    });
    
    // === 階層分離システム準拠テンプレート用パラメータ（v1.0+） ===
    this.registerParameter({
      name: 'headTime',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 500,
      min: 0,
      max: 2000,
      description: 'スライドイン時間(ms)'
    });
    
    this.registerParameter({
      name: 'tailTime',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 500,
      min: 0,
      max: 2000,
      description: 'フェードアウト時間(ms)'
    });
    
    this.registerParameter({
      name: 'entranceInitialSpeed',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 2.0,
      min: 0.1,
      max: 10.0,
      description: '開始速度(px/ms)'
    });
    
    this.registerParameter({
      name: 'activeSpeed',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 0.05,
      min: 0.01,
      max: 1.0,
      description: '終了速度(px/ms)'
    });
    
    this.registerParameter({
      name: 'rightOffset',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 100,
      min: 0,
      max: 500,
      description: '右側初期位置(px)'
    });
    
    // === 階層システム：ランダム配置パラメータ ===
    this.registerParameter({
      name: 'randomPlacement',
      type: 'boolean',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: true,
      description: 'ランダム配置有効'
    });
    
    this.registerParameter({
      name: 'randomSeed',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 0,
      min: 0,
      max: 999999,
      description: 'ランダムシード値'
    });
    
    this.registerParameter({
      name: 'randomRangeX',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 300,
      min: 0,
      max: 1000,
      description: 'ランダム範囲X(px)'
    });
    
    this.registerParameter({
      name: 'randomRangeY',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 200,
      min: 0,
      max: 1000,
      description: 'ランダム範囲Y(px)'
    });
    
    this.registerParameter({
      name: 'minDistanceFromPrevious',
      type: 'number',
      category: 'template-specific',
      templateId: 'hierarchicalwordslidetextprimitive',
      defaultValue: 150,
      min: 0,
      max: 500,
      description: '前フレーズからの最小距離(px)'
    });
    
    // === BlinkFadeTextPrimitive パラメータ ===
    this.registerParameter({
      name: 'flickerThreshold',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      description: '点滅閾値'
    });
    
    this.registerParameter({
      name: 'flickerMinFrequency',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 2,
      min: 0.5,
      max: 10,
      description: '最小点滅周波数'
    });
    
    this.registerParameter({
      name: 'flickerMaxFrequency',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 15,
      min: 5,
      max: 30,
      description: '最大点滅周波数'
    });
    
    this.registerParameter({
      name: 'flickerIntensity',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 0.8,
      min: 0,
      max: 1,
      description: '点滅強度'
    });
    
    this.registerParameter({
      name: 'flickerRandomness',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 0.7,
      min: 0,
      max: 1,
      description: '点滅のランダム性'
    });
    
    this.registerParameter({
      name: 'frequencyLerpSpeed',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 0.15,
      min: 0.01,
      max: 1,
      description: '周波数変化速度'
    });
    
    this.registerParameter({
      name: 'preInDuration',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 1500,
      min: 500,
      max: 5000,
      description: '事前フェードイン時間(ms)'
    });
    
    this.registerParameter({
      name: 'fadeInVariation',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 500,
      min: 0,
      max: 2000,
      description: 'フェードインばらつき(ms)'
    });
    
    this.registerParameter({
      name: 'fadeOutVariation',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 800,
      min: 0,
      max: 2000,
      description: 'フェードアウトばらつき(ms)'
    });
    
    this.registerParameter({
      name: 'fadeOutDuration',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 1000,
      min: 200,
      max: 3000,
      description: 'フェードアウト時間(ms)'
    });
    
    this.registerParameter({
      name: 'fullDisplayThreshold',
      type: 'number',
      category: 'template-specific',
      templateId: 'blinkfadetextprimitive',
      defaultValue: 0.85,
      min: 0.5,
      max: 1,
      description: '完全表示閾値'
    });
    
    // === SparkleEffect パラメータ ===
    this.registerParameter({
      name: 'enableSparkle',
      type: 'boolean',
      category: 'standard',
      defaultValue: true,
      description: 'キラキラエフェクトの有効/無効'
    });
    
    this.registerParameter({
      name: 'sparkleCount',
      type: 'number',
      category: 'standard',
      defaultValue: 4,
      min: 1,
      max: 20,
      description: '同時生成パーティクル数'
    });
    
    this.registerParameter({
      name: 'sparkleSize',
      type: 'number',
      category: 'standard',
      defaultValue: 20,
      min: 4,
      max: 30,
      description: 'パーティクルサイズ(px)'
    });
    
    this.registerParameter({
      name: 'sparkleColor',
      type: 'string',
      category: 'standard',
      defaultValue: '#FFD700',
      description: 'パーティクルカラー'
    });
    
    this.registerParameter({
      name: 'sparkleStarSpikes',
      type: 'number',
      category: 'standard',
      defaultValue: 5,
      min: 3,
      max: 12,
      description: '星型の角数（4角星、5角星、6角星、8角星など）'
    });
    
    this.registerParameter({
      name: 'sparkleScale',
      type: 'number',
      category: 'standard',
      defaultValue: 3.0,
      min: 0.5,
      max: 10.0,
      description: 'スケール倍率'
    });
    
    this.registerParameter({
      name: 'sparkleDuration',
      type: 'number',
      category: 'standard',
      defaultValue: 1000,
      min: 500,
      max: 3000,
      description: 'パーティクル寿命(ms)'
    });
    
    this.registerParameter({
      name: 'sparkleRadius',
      type: 'number',
      category: 'standard',
      defaultValue: 30,
      min: 5,
      max: 100,
      description: '散布半径(px)'
    });
    
    this.registerParameter({
      name: 'sparkleAnimationSpeed',
      type: 'number',
      category: 'standard',
      defaultValue: 1.0,
      min: 0.1,
      max: 3.0,
      description: 'アニメーション速度'
    });
    
    this.registerParameter({
      name: 'sparkleAlphaDecay',
      type: 'number',
      category: 'standard',
      defaultValue: 0.98,
      min: 0.5,
      max: 0.99,
      description: '透明度減衰率'
    });
    
    this.registerParameter({
      name: 'sparkleRotationSpeed',
      type: 'number',
      category: 'standard',
      defaultValue: 0.3,
      min: 0.0,
      max: 2.0,
      description: 'パーティクル回転速度'
    });
    
    this.registerParameter({
      name: 'sparkleGenerationRate',
      type: 'number',
      category: 'standard',
      defaultValue: 2.0,
      min: 0.5,
      max: 10.0,
      description: '1秒間のパーティクル生成数（ベース値）'
    });
    
    this.registerParameter({
      name: 'sparkleVelocityCoefficient',
      type: 'number',
      category: 'standard',
      defaultValue: 1.0,
      min: 0.0,
      max: 3.0,
      description: '移動速度依存の出現頻度係数のn乗（0=速度無依存、1=線形、2=二次、3=三次）'
    });

    // === パーティクルグローエフェクトパラメータ ===
    this.registerParameter({
      name: 'enableParticleGlow',
      type: 'boolean',
      category: 'standard',
      defaultValue: false,
      description: 'パーティクルグロー効果の有効化'
    });

    this.registerParameter({
      name: 'particleGlowStrength',
      type: 'number',
      category: 'standard',
      defaultValue: 1.2,
      min: 0.1,
      max: 5.0,
      description: 'パーティクルグロー強度'
    });

    this.registerParameter({
      name: 'particleGlowBrightness',
      type: 'number',
      category: 'standard',
      defaultValue: 1.1,
      min: 0.5,
      max: 3.0,
      description: 'パーティクルグロー明度'
    });

    this.registerParameter({
      name: 'particleGlowBlur',
      type: 'number',
      category: 'standard',
      defaultValue: 4,
      min: 1,
      max: 20,
      description: 'パーティクルグローブラー量'
    });

    this.registerParameter({
      name: 'particleGlowQuality',
      type: 'number',
      category: 'standard',
      defaultValue: 6,
      min: 2,
      max: 32,
      description: 'パーティクルグロー品質'
    });

    this.registerParameter({
      name: 'particleGlowThreshold',
      type: 'number',
      category: 'standard',
      defaultValue: 0.1,
      min: 0.0,
      max: 1.0,
      description: 'パーティクルグロー閾値'
    });

    // === パーティクル瞬きエフェクトパラメータ ===
    this.registerParameter({
      name: 'enableTwinkle',
      type: 'boolean',
      category: 'standard',
      defaultValue: true,
      description: 'パーティクル瞬き機能の有効/無効'
    });

    this.registerParameter({
      name: 'twinkleFrequency',
      type: 'number',
      category: 'standard',
      defaultValue: 0.5,
      min: 0.1,
      max: 5.0,
      description: '瞬きの頻度（回/秒）'
    });

    this.registerParameter({
      name: 'twinkleBrightness',
      type: 'number',
      category: 'standard',
      defaultValue: 2.5,
      min: 1.0,
      max: 10.0,
      description: '瞬き時の明度倍率'
    });

    this.registerParameter({
      name: 'twinkleDuration',
      type: 'number',
      category: 'standard',
      defaultValue: 100,
      min: 50,
      max: 500,
      description: '瞬きの持続時間（ms）'
    });

    this.registerParameter({
      name: 'twinkleProbability',
      type: 'number',
      category: 'standard',
      defaultValue: 0.8,
      min: 0.0,
      max: 1.0,
      description: '瞬きの確率（0-1）'
    });

    // === パーティクルサイズ縮小エフェクトパラメータ ===
    this.registerParameter({
      name: 'enableSizeShrink',
      type: 'boolean',
      category: 'standard',
      defaultValue: false,
      description: 'パーティクルサイズ縮小機能の有効/無効'
    });

    this.registerParameter({
      name: 'sizeShrinkRate',
      type: 'number',
      category: 'standard',
      defaultValue: 1.0,
      min: 0.0,
      max: 3.0,
      description: 'サイズ縮小速度の指数（0乗=一定、1乗=線形、2乗=二次、3乗=三次）'
    });

    this.registerParameter({
      name: 'sizeShrinkRandomRange',
      type: 'number',
      category: 'standard',
      defaultValue: 0.0,
      min: 0.0,
      max: 1.0,
      description: '縮小速度のランダム範囲（0%から100%）'
    });
    
    // === BlackBandMaskTextPrimitive固有パラメータ ===
    this.registerParameter({
      name: 'maskBlendMode',
      type: 'select',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 'difference',
      options: ['normal', 'multiply', 'difference', 'overlay', 'screen'
      ],
      description: 'マスクの合成モード'
    });

    this.registerParameter({
      name: 'blackBandMarginWidth',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 1.0,
      min: 0.0,
      max: 5.0,
      description: '黒帯の余白幅（文字数ベース、0.1単位で調整可能）'
    });

    // 黒帯テンプレート（横書き）カラー・サイズ・エフェクト系
    this.registerParameter({
      name: 'blackBandColor',
      type: 'color',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: '#000000',
      description: '黒帯の塗り色'
    });
    this.registerParameter({
      name: 'blackBandWidthRatio',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 1.2,
      min: 1.0,
      max: 2.0,
      description: '黒帯の幅倍率（フレーズ幅基準）'
    });
    this.registerParameter({
      name: 'blackBandHeightRatio',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 1.0,
      min: 0.8,
      max: 1.5,
      description: '黒帯の高さ倍率（フォントサイズ基準）'
    });
    this.registerParameter({
      name: 'invertMaskColor',
      type: 'color',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: '#FFFFFF',
      description: '反転マスクの色'
    });
    // 黒帯のグロー/シャドウ（横書き）
    this.registerParameter({
      name: 'enableBandGlow',
      type: 'boolean',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: false,
      description: '黒帯グローの有効/無効'
    });
    this.registerParameter({
      name: 'enableBandShadow',
      type: 'boolean',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: false,
      description: '黒帯シャドウの有効/無効'
    });
    this.registerParameter({
      name: 'bandGlowStrength',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 1.0,
      min: 0.1,
      max: 3.0,
      description: '黒帯グロー強度'
    });
    this.registerParameter({
      name: 'bandGlowBrightness',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 1.0,
      min: 0.1,
      max: 3.0,
      description: '黒帯グロー明度'
    });
    this.registerParameter({
      name: 'bandGlowBlur',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 10,
      min: 1,
      max: 50,
      description: '黒帯グローぼかし'
    });
    this.registerParameter({
      name: 'bandGlowQuality',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 4,
      min: 1,
      max: 10,
      step: 1,
      description: '黒帯グロー品質'
    });
    this.registerParameter({
      name: 'bandShadowBlur',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 10,
      min: 1,
      max: 50,
      description: '黒帯シャドウぼかし'
    });
    this.registerParameter({
      name: 'bandShadowColor',
      type: 'color',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: '#000000',
      description: '黒帯シャドウ色'
    });
    this.registerParameter({
      name: 'bandShadowDistance',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 5,
      min: 0,
      max: 50,
      description: '黒帯シャドウ距離'
    });
    this.registerParameter({
      name: 'bandShadowAngle',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 45,
      min: 0,
      max: 360,
      description: '黒帯シャドウ角度'
    });
    this.registerParameter({
      name: 'bandShadowAlpha',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 0.8,
      min: 0.1,
      max: 1.0,
      description: '黒帯シャドウ透明度'
    });
    this.registerParameter({
      name: 'bandShadowQuality',
      type: 'number',
      category: 'template-specific',
      templateId: 'blackbandmasktextprimitive',
      defaultValue: 4,
      min: 1,
      max: 10,
      step: 1,
      description: '黒帯シャドウ品質'
    });

    // 黒帯テンプレート（縦書き）: 主要カラー/エフェクト
    this.registerParameter({
      name: 'blackBandColor',
      type: 'color',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: '#000000',
      description: '黒帯の塗り色（縦書き）'
    });
    this.registerParameter({
      name: 'blackBandWidthRatio',
      type: 'number',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: 1.2,
      min: 1.0,
      max: 2.0,
      description: '黒帯の幅倍率（縦書き）'
    });
    this.registerParameter({
      name: 'blackBandHeightRatio',
      type: 'number',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: 1.0,
      min: 0.8,
      max: 1.5,
      description: '黒帯の高さ倍率（縦書き）'
    });
    this.registerParameter({
      name: 'invertMaskColor',
      type: 'color',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: '#FFFFFF',
      description: '反転マスクの色（縦書き）'
    });
    this.registerParameter({
      name: 'maskBlendMode',
      type: 'select',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: 'difference',
      options: ['normal', 'multiply', 'difference', 'overlay', 'screen'],
      description: 'マスクの合成モード（縦書き）'
    });
    this.registerParameter({
      name: 'enableBandGlow',
      type: 'boolean',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: false,
      description: '黒帯グローの有効/無効（縦書き）'
    });
    this.registerParameter({
      name: 'enableBandShadow',
      type: 'boolean',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: false,
      description: '黒帯シャドウの有効/無効（縦書き）'
    });
    this.registerParameter({
      name: 'bandShadowColor',
      type: 'color',
      category: 'template-specific',
      templateId: 'verticalblackbandtextprimitive',
      defaultValue: '#000000',
      description: '黒帯シャドウ色（縦書き）'
    });
  }
  
  /**
   * パラメータの登録
   */
  registerParameter(definition: ParameterDefinition): void {
    // テンプレート固有パラメータの場合は templateId を含むキーを作成
    const key = definition.category === 'template-specific' && definition.templateId
      ? `${definition.name}_${definition.templateId}`
      : definition.name;

    if (this.parameters.has(key)) {
      console.warn(`Parameter ${definition.name}${definition.templateId ? ` (templateId: ${definition.templateId})` : ''} is already registered`);
      return;
    }
    this.parameters.set(key, definition);
  }
  
  /**
   * パラメータが登録されているか確認
   */
  isRegistered(name: string, templateId?: TemplateId): boolean {
    const key = templateId ? `${name}_${templateId}` : name;
    return this.parameters.has(key) || this.parameters.has(name);
  }

  /**
   * パラメータキーの作成（内部ヘルパーメソッド）
   */
  private getParameterKey(name: string, templateId?: TemplateId): string {
    // テンプレート固有パラメータを優先的にチェック
    if (templateId) {
      const templateSpecificKey = `${name}_${templateId}`;
      if (this.parameters.has(templateSpecificKey)) {
        return templateSpecificKey;
      }
    }
    // 標準パラメータにフォールバック
    return name;
  }
  
  /**
   * すべてのパラメータ定義を取得
   */
  getAllParameters(): Map<string, ParameterDefinition> {
    return new Map(this.parameters);
  }
  
  /**
   * パラメータ定義の取得
   */
  getDefinition(name: string, templateId?: TemplateId): ParameterDefinition | undefined {
    const key = this.getParameterKey(name, templateId);
    return this.parameters.get(key);
  }

  /**
   * パラメータの選択肢を取得
   */
  getParameterOptions(name: string, templateId?: TemplateId): Array<{ value: string; label: string }> | string[] | undefined {
    const definition = this.getDefinition(name, templateId);
    return definition?.options;
  }
  
  /**
   * テンプレート用パラメータの取得
   */
  getTemplateParameters(templateId: TemplateId): ParameterDefinition[] {
    return Array.from(this.parameters.values()).filter(
      def => def.templateId === templateId
    );
  }
  
  /**
   * パラメータの検証
   */
  validateParameter(name: string, value: any, templateId?: TemplateId): { valid: boolean; error?: string } {
    const definition = this.getDefinition(name, templateId);
    if (!definition) {
      return { valid: false, error: `Unknown parameter: ${name}` };
    }
    
    // 型チェック
    // selectとcolorタイプは実際にはstringである
    const expectedType = (definition.type === 'select' || definition.type === 'color') ? 'string' : definition.type;
    if (typeof value !== expectedType) {
      return { 
        valid: false, 
        error: `Invalid type for ${name}: expected ${expectedType}, got ${typeof value}` 
      };
    }
    
    // selectタイプの値検証
    if (definition.type === 'select' && definition.options) {
      const validValues = Array.isArray(definition.options[0]) && typeof definition.options[0] === 'object' 
        ? (definition.options as Array<{ value: string; label: string }>).map(opt => opt.value)
        : definition.options as string[];
      if (!validValues.includes(value)) {
        return {
          valid: false,
          error: `Invalid value for ${name}: ${value} is not in valid options [${validValues.join(', ')}]`
        };
      }
    }
    
    // 数値の範囲チェック
    if (definition.type === 'number' && (definition.min !== undefined || definition.max !== undefined)) {
      if (definition.min !== undefined && value < definition.min) {
        return { 
          valid: false, 
          error: `Value for ${name} is below minimum: ${value} < ${definition.min}` 
        };
      }
      if (definition.max !== undefined && value > definition.max) {
        return { 
          valid: false, 
          error: `Value for ${name} is above maximum: ${value} > ${definition.max}` 
        };
      }
    }
    
    return { valid: true };
  }
  
  /**
   * 一括検証
   */
  validateParameters(params: Record<string, any>): {
    valid: boolean;
    errors: string[];
    sanitized: Record<string, any>;
  } {
    const errors: string[] = [];
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      const validation = this.validateParameter(key, value);
      if (validation.valid) {
        sanitized[key] = value;
      } else {
        errors.push(validation.error!);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      sanitized
    };
  }
  
  /**
   * パラメータリストの生成（デバッグ用）
   */
  generateParameterList(): string {
    const standardParams: string[] = [];
    const templateParams: Map<TemplateId, string[]> = new Map();
    
    this.parameters.forEach((def, name) => {
      if (def.category === 'standard') {
        standardParams.push(name);
      } else if (def.templateId) {
        if (!templateParams.has(def.templateId)) {
          templateParams.set(def.templateId, []);
        }
        templateParams.get(def.templateId)!.push(name);
      }
    });
    
    let output = '=== Standard Parameters ===\n';
    output += standardParams.join('\n') + '\n\n';
    
    templateParams.forEach((params, templateId) => {
      output += `=== ${templateId} Parameters ===\n`;
      output += params.join('\n') + '\n\n';
    });
    
    return output;
  }
}
