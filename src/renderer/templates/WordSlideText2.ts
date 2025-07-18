import * as PIXI from 'pixi.js';
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import { DropShadowFilter } from 'pixi-filters';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata } from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';

// フレームカウンターとデバッグ用のグローバル変数（無効化）
// let frameCounter = 0;
// let lastLogFrame = 0;
// let templateApplicationCount = 0;

/**
 * イージング関数（ユーティリティ）
 */

/**
 * 三次イージング（アウト）：早い→遅い
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 三次イージング（イン）：遅い→早い
 */
function easeInCubic(t: number): number {
  return t * t * t;
}

/**
 * 速度ベースの距離計算
 * 速度の時間積分により移動距離を算出
 * @param elapsedTime 経過時間（ms）
 * @param duration アニメーション総時間（ms）
 * @param initialSpeed 開始速度（px/ms）
 * @param finalSpeed 終了速度（px/ms）
 * @param easingFn イージング関数（デフォルト: easeOutCubic）
 * @returns 移動距離（px）
 */
function calculateDistanceFromSpeed(
  elapsedTime: number,
  duration: number,
  initialSpeed: number,
  finalSpeed: number,
  easingFn: (t: number) => number = easeOutCubic
): number {
  if (elapsedTime <= 0) return 0;
  if (elapsedTime >= duration) {
    // 完全な積分値を計算（イージング関数により異なる）
    // easeOutCubicの場合：3/4、easeInCubicの場合：1/4
    const integralValue = easingFn === easeOutCubic ? 0.75 : 0.25;
    return duration * (initialSpeed + (finalSpeed - initialSpeed) * integralValue);
  }
  
  // 数値積分（台形公式）で正確な距離を計算
  const steps = Math.min(100, Math.ceil(elapsedTime)); // 最大100ステップ
  const dt = elapsedTime / steps;
  let distance = 0;
  
  for (let i = 0; i < steps; i++) {
    const t1 = i * dt;
    const t2 = (i + 1) * dt;
    const progress1 = t1 / duration;
    const progress2 = t2 / duration;
    const eased1 = easingFn(progress1);
    const eased2 = easingFn(progress2);
    const v1 = initialSpeed + (finalSpeed - initialSpeed) * eased1;
    const v2 = initialSpeed + (finalSpeed - initialSpeed) * eased2;
    distance += (v1 + v2) * dt / 2; // 台形公式
  }
  
  return distance;
}

/**
 * 文字が半角文字かどうかを判定
 * @param char 判定する文字
 * @returns 半角文字の場合true
 */
function isHalfWidthChar(char: string): boolean {
  // 半角文字の範囲をチェック
  // ASCII文字（0x0020-0x007E）
  // 半角カナ（0xFF61-0xFF9F）
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 固定オフセット値リストを生成
 * @param seed シード値
 * @param rangeX X方向の範囲
 * @param rangeY Y方向の範囲
 * @param minDistance 最小距離
 * @returns オフセット値の配列
 */
function generateOffsetList(seed: number, rangeX: number, rangeY: number, minDistance: number): Array<{ x: number; y: number }> {
  const offsets: Array<{ x: number; y: number }> = [];
  const targetCount = 100; // 100個のオフセットを生成
  
  // シード値から擬似ランダム生成器を初期化
  let rng = seed + 1; // 0を避けるため+1
  const nextRandom = () => {
    rng = ((rng * 1103515245) + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  
  let attempts = 0;
  const maxAttempts = 10000;
  
  while (offsets.length < targetCount && attempts < maxAttempts) {
    attempts++;
    
    // ランダムな位置を生成
    const x = (nextRandom() - 0.5) * rangeX;
    const y = (nextRandom() - 0.5) * rangeY;
    
    // 既存のオフセットとの距離をチェック
    let valid = true;
    for (const existing of offsets) {
      const distance = Math.sqrt(Math.pow(x - existing.x, 2) + Math.pow(y - existing.y, 2));
      if (distance < minDistance) {
        valid = false;
        break;
      }
    }
    
    if (valid) {
      offsets.push({ x, y });
    }
  }
  
  return offsets;
}

/**
 * キャッシュされたオフセットリストを取得または生成
 */
function getOrCreateOffsetList(seed: number, rangeX: number, rangeY: number, minDistance: number): OffsetList {
  // パラメータが変更されていたら再生成
  if (!cachedOffsetList || 
      cachedOffsetList.seed !== seed ||
      cachedOffsetList.rangeX !== rangeX ||
      cachedOffsetList.rangeY !== rangeY ||
      cachedOffsetList.minDistance !== minDistance) {
    
    cachedOffsetList = {
      seed,
      rangeX,
      rangeY,
      minDistance,
      offsets: generateOffsetList(seed, rangeX, rangeY, minDistance)
    };
  }
  
  return cachedOffsetList;
}

/**
 * 文字固有のランダムオフセットを生成
 * @param charId 文字の一意ID
 * @param seed シード値
 * @param rangeX X方向の範囲
 * @param rangeY Y方向の範囲
 * @returns ランダムオフセット
 */
function generateCharacterOffset(charId: string, seed: number, rangeX: number, rangeY: number): { x: number; y: number } {
  // 文字IDとシードから一意のハッシュを生成
  let hash = seed;
  for (let i = 0; i < charId.length; i++) {
    const char = charId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // ハッシュから擬似ランダム生成器を初期化
  let rng = Math.abs(hash) + 1; // 0を避けるため+1
  const nextRandom = () => {
    rng = ((rng * 1103515245) + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  
  // ランダムなオフセットを生成（-range/2 から +range/2）
  const x = (nextRandom() - 0.5) * rangeX;
  const y = (nextRandom() - 0.5) * rangeY;
  
  return { x, y };
}

/**
 * コピー固有のランダム位置を生成
 * @param charId 文字の一意ID
 * @param copyIndex コピーのインデックス
 * @param seed シード値
 * @param range 出現位置の範囲
 * @returns ランダム位置オフセット
 */
function generateCopyPosition(charId: string, copyIndex: number, seed: number, range: number): { x: number; y: number } {
  // 文字IDとコピーインデックス、シードから一意のハッシュを生成
  let hash = seed;
  const combinedId = `${charId}_copy_${copyIndex}`;
  for (let i = 0; i < combinedId.length; i++) {
    const char = combinedId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // ハッシュから擬似ランダム生成器を初期化
  let rng = Math.abs(hash) + 1; // 0を避けるため+1
  const nextRandom = () => {
    rng = ((rng * 1103515245) + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  
  // 円形範囲内のランダムな位置を生成
  const angle = nextRandom() * 2 * Math.PI; // 0から2πまでの角度
  const distance = nextRandom() * range; // 0から指定範囲までの距離
  
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  
  return { x, y };
}

/**
 * WordSlideText2 テンプレート
 * 単語が段階的にスライドインする歌詞表示テンプレート
 */
// 固定オフセット値リストを管理
interface OffsetList {
  seed: number;
  rangeX: number;
  rangeY: number;
  minDistance: number;
  offsets: Array<{ x: number; y: number }>;
}
let cachedOffsetList: OffsetList | null = null;

export const WordSlideText2: IAnimationTemplate = {
  // デバッグ用: テンプレート名
  _debugTemplateName: 'WordSlideText2',
  
  // フレーム管理とデバッグ用メソッド（無効化）
  _logFrameInfo(hierarchyType: HierarchyType, text: string, params: Record<string, unknown>, nowMs: number, startMs: number, endMs: number, phase: AnimationPhase) {
    // デバッグログ出力を無効化
    // frameCounter++;
    // 
    // // 10フレームごとに詳細ログを出力
    // if (frameCounter - lastLogFrame >= 10) {
    //   lastLogFrame = frameCounter;
    //   
    //   console.log(`\n=== [WordSlideText2] フレーム ${frameCounter} ===`);
    //   console.log(`テンプレート適用回数: ${templateApplicationCount}`);
    //   console.log(`階層タイプ: ${hierarchyType}`);
    //   console.log(`文字: "${text}"`);
    //   console.log(`現在時刻: ${nowMs}ms, 開始: ${startMs}ms, 終了: ${endMs}ms`);
    //   console.log(`フェーズ: ${phase}`);
    //   
    //   // パラメータの主要設定を出力
    //   console.log(`設定フォントサイズ: ${params.fontSize}px`);
    //   console.log(`文字拡大機能: ${params.enableCharScaling ? 'ON' : 'OFF'}`);
    //   if (params.enableCharScaling) {
    //     console.log(`  拡大倍率: ${params.charScaleMultiplier}倍`);
    //     console.log(`  X座標オフセット範囲: ±${params.charPositionOffsetX}px`);
    //     console.log(`  Y座標オフセット範囲: ±${params.charPositionOffsetY}px`);
    //     console.log(`  ランダムシード: ${params.charScalingSeed}`);
    //   }
    // }
  },

  // テンプレートメタデータ
  metadata: {
    name: "WordSlideText2",
    version: "1.2.0",
    description: "単語が段階的にスライドインする歌詞表示テンプレート。発声中の文字拡大とランダム位置オフセット、複数コピーによる退場アニメーション機能付き。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Claude",
      contribution: "テンプレートの作成",
      date: "2025-07-18"
    },
    contributors: []
  } as TemplateMetadata,
  
  // 動的パラメータ取得メソッド
  getParameterConfig(): any[] {
    return [
      // 基本パラメータ
      { name: "fontSize", type: "number", default: 120, min: 12, max: 256, step: 1, description: "フォントサイズ" },
      { 
        name: "fontFamily", 
        type: "string", 
        default: "Arial",
        get options() {
          return FontService.getAvailableFonts();
        },
        description: "フォントファミリー"
      },
      
      // 色設定
      { name: "textColor", type: "color", default: "#808080", description: "デフォルトテキスト色" },
      { name: "activeTextColor", type: "color", default: "#FFFF80", description: "アクティブテキスト色" },
      { name: "completedTextColor", type: "color", default: "#FFF7EB", description: "完了テキスト色" },
      
      // アニメーション速度とタイミング
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50, description: "スライドイン時間(ms)" },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50, description: "フェードアウト時間(ms)" },
      { name: "entranceInitialSpeed", type: "number", default: 4.0, min: 0.1, max: 20.0, step: 0.1, description: "開始速度(px/ms)" },
      { name: "activeSpeed", type: "number", default: 0.10, min: 0.01, max: 2.0, step: 0.01, description: "終了速度(px/ms)" },
      
      // 文字設定
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1, description: "文字間隔倍率" },
      { name: "rightOffset", type: "number", default: 100, min: 0, max: 500, step: 10, description: "右側初期位置(px)" },
      
      // フレーズ位置調整
      { name: "phraseOffsetX", type: "number", default: 100, min: -500, max: 500, step: 10, description: "画面中央からのX座標オフセット" },
      { name: "phraseOffsetY", type: "number", default: 60, min: -500, max: 500, step: 10, description: "画面中央からのY座標オフセット" },
      
      // ランダム配置設定
      { name: "randomPlacement", type: "boolean", default: true, description: "ランダム配置有効" },
      { name: "randomSeed", type: "number", default: 0, min: 0, max: 9999, step: 1, description: "ランダムシード値" },
      { name: "randomRangeX", type: "number", default: 200, min: 0, max: 800, step: 50, description: "ランダム範囲X(px)" },
      { name: "randomRangeY", type: "number", default: 150, min: 0, max: 600, step: 50, description: "ランダム範囲Y(px)" },
      { name: "minDistanceFromPrevious", type: "number", default: 150, min: 50, max: 500, step: 50, description: "最小間隔(px)" },
      
      // グロー効果設定
      { name: "enableGlow", type: "boolean", default: true, description: "グロー有効" },
      { name: "glowStrength", type: "number", default: 1.5, min: 0, max: 5, step: 0.1, description: "グロー強度" },
      { name: "glowBrightness", type: "number", default: 1.2, min: 0.5, max: 3, step: 0.1, description: "グロー明度" },
      { name: "glowBlur", type: "number", default: 6, min: 0.1, max: 20, step: 0.1, description: "グローぼかし" },
      { name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1, description: "グロー品質" },
      { name: "glowPadding", type: "number", default: 50, min: 0, max: 200, step: 10, description: "グローパディング(px)" },
      
      // Shadow効果設定
      { name: "enableShadow", type: "boolean", default: false, description: "シャドウ有効" },
      { name: "shadowBlur", type: "number", default: 6, min: 0, max: 50, step: 0.5, description: "シャドウぼかし" },
      { name: "shadowColor", type: "color", default: "#000000", description: "シャドウ色" },
      { name: "shadowAngle", type: "number", default: 45, min: 0, max: 360, step: 15, description: "シャドウ角度(度)" },
      { name: "shadowDistance", type: "number", default: 8, min: 0, max: 100, step: 1, description: "シャドウ距離(px)" },
      { name: "shadowAlpha", type: "number", default: 0.8, min: 0, max: 1, step: 0.1, description: "シャドウ透明度" },
      { name: "shadowOnly", type: "boolean", default: false, description: "シャドウのみ表示" },
      
      // 合成モード設定
      { name: "blendMode", type: "string", default: "normal",
        options: ["normal", "add", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"],
        description: "合成モード" },
      
      // 文字スケーリング設定
      { name: "enableCharScaling", type: "boolean", default: true, description: "文字拡大エフェクト有効" },
      { name: "charScaleMultiplier", type: "number", default: 8.0, min: 1.0, max: 20.0, step: 0.5, description: "拡大倍率" },
      { name: "charPositionOffsetX", type: "number", default: 20, min: 0, max: 100, step: 5, description: "X座標ランダム範囲(px)" },
      { name: "charPositionOffsetY", type: "number", default: 100, min: 0, max: 200, step: 10, description: "Y座標ランダム範囲(px)" },
      { name: "charScalingSeed", type: "number", default: 12345, min: 0, max: 99999, step: 1, description: "ランダムシード値" },
      
      // 退場アニメーション設定
      { name: "enableExitAnimation", type: "boolean", default: true, description: "退場アニメーション有効" },
      { name: "exitCopyCount", type: "number", default: 3, min: 1, max: 10, step: 1, description: "コピー数" },
      { name: "exitFrameDelay", type: "number", default: 3, min: 1, max: 10, step: 1, description: "フレーム遅延" },
      { name: "exitCopyScale", type: "number", default: 2.0, min: 0.5, max: 5.0, step: 0.1, description: "コピー拡大倍率" },
      { name: "exitCopyColor", type: "color", default: "#FFFFFF", description: "コピー文字色" },
      { name: "exitAnimationDuration", type: "number", default: 10, min: 5, max: 30, step: 1, description: "アニメーション期間(フレーム)" },
      
      // コピー出現位置設定
      { name: "copyPositionRandomRange", type: "number", default: 50, min: 0, max: 200, step: 10, description: "コピー出現位置範囲(px)" },
      { name: "copyPositionSeed", type: "number", default: 54321, min: 0, max: 99999, step: 1, description: "コピー位置ランダムシード" }
    ];
  },
  
  /**
   * 表示要素のみを削除するメソッド
   * 子コンテナは維持しながら、GraphicsやTextなどの表示要素のみを削除
   * 文字コンテナ内のPIXI.Textオブジェクトは保護する
   */
  removeVisualElements(container: PIXI.Container): void {
    const childrenToKeep: PIXI.DisplayObject[] = [];
    const childrenToRemove: PIXI.DisplayObject[] = [];
    
    // デバッグログ：削除処理の詳細（無効化）
    // if (frameCounter % 10 === 0) {
    //   console.log(`[WordSlideText2] removeVisualElements called on container: ${(container as any).name || 'unknown'}`);
    //   console.log(`  子要素数: ${container.children.length}`);
    // }
    
    container.children.forEach(child => {
      if (child instanceof PIXI.Container && 
          (child as any).name && 
          ((child as any).name.includes('phrase_container_') || 
           (child as any).name.includes('word_container_') || 
           (child as any).name.includes('char_container_'))) {
        // 階層コンテナは保持
        childrenToKeep.push(child);
      } else if (child instanceof PIXI.Text && (child as any).name === 'text') {
        // 文字コンテナ内のテキストオブジェクトは保護
        childrenToKeep.push(child);
      } else if (child instanceof PIXI.Text && (child as any).name && 
                 ((child as any).name.startsWith('start_copy_') || (child as any).name === 'original_text')) {
        // 開始時アニメーション中のコピーと元の文字は保護
        childrenToKeep.push(child);
      } else {
        // その他の視覚要素は削除
        childrenToRemove.push(child);
      }
    });
    
    childrenToRemove.forEach(child => {
      container.removeChild(child);
      if (child instanceof PIXI.Container) {
        child.destroy({ children: true });
      } else {
        child.destroy();
      }
    });
  },
  
  /**
   * 階層対応のアニメーションメソッド
   */
  animateContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,
    phase: AnimationPhase
  ): boolean {
    // templateApplicationCount++;
    const textContent = Array.isArray(text) ? text.join('') : text;
    
    // フレーム情報とデバッグログを出力（無効化）
    // this._logFrameInfo!(hierarchyType, textContent, params, nowMs, startMs, endMs, phase);
    
    container.visible = true;
    
    // 文字レベル以外でのみ視覚要素をクリア（文字レベルでは既存のPIXI.Textを再利用）
    if (hierarchyType !== 'char') {
      this.removeVisualElements!(container);
    }
    
    let rendered = false;
    switch (hierarchyType) {
      case 'phrase':
        rendered = this.renderPhraseContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'word':
        rendered = this.renderWordContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'char':
        rendered = this.renderCharContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
    }
    
    return rendered;
  },
  
  /**
   * フレーズコンテナの描画
   * 画面中央に配置し、フェードアウト時は左へスライドしながら消える
   */
  renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    // フレーズレベルのデバッグログ（無効化）
    // if (frameCounter % 10 === 0) {
    //   console.log(`\n=== [WordSlideText2] フレーズコンテナ処理 ===`);
    //   console.log(`フレーズテキスト: "${text}"`);
    //   console.log(`コンテナ名: ${(container as any).name || 'unknown'}`);
    //   console.log(`フェーズ: ${phase}, 時刻: ${nowMs}ms`);
    //   console.log(`子コンテナ数: ${container.children.length}`);
    //   console.log(`アルファ値: ${container.alpha}`);
    //   console.log(`位置: (${container.position.x}, ${container.position.y})`);
    // }
    // グロー効果の設定
    const enableGlow = params.enableGlow as boolean ?? true;
    const glowStrength = params.glowStrength as number || 1.5;
    const glowBrightness = params.glowBrightness as number || 1.2;
    const glowBlur = params.glowBlur as number || 6;
    const glowQuality = params.glowQuality as number || 8;
    const glowPadding = params.glowPadding as number || 50;
    
    // Shadow効果の設定
    const enableShadow = params.enableShadow as boolean ?? false;
    const shadowBlur = params.shadowBlur as number || 6;
    const shadowColor = params.shadowColor as string || '#000000';
    const shadowAngle = params.shadowAngle as number || 45;
    const shadowDistance = params.shadowDistance as number || 8;
    const shadowAlpha = params.shadowAlpha as number || 0.8;
    const shadowOnly = params.shadowOnly as boolean ?? false;
    
    const blendMode = params.blendMode as string || 'normal';
    
    // フィルターエリアの設定
    const needsPadding = enableGlow || enableShadow;
    const maxPadding = Math.max(glowPadding, shadowDistance + shadowBlur);
    
    if (needsPadding) {
      const app = (window as any).__PIXI_APP__;
      if (app && app.renderer) {
        const screenWidth = app.renderer.width;
        const screenHeight = app.renderer.height;
        
        container.filterArea = new PIXI.Rectangle(
          -maxPadding,
          -maxPadding,
          screenWidth + maxPadding * 2,
          screenHeight + maxPadding * 2
        );
      }
    } else {
      container.filterArea = null;
    }
    
    // フィルター配列の初期化
    const filters: PIXI.Filter[] = [];
    
    // Shadow効果の適用
    if (enableShadow) {
      const shadowFilter = new DropShadowFilter({
        blur: shadowBlur,
        color: shadowColor,
        alpha: shadowAlpha,
        angle: shadowAngle,
        distance: shadowDistance,
        quality: 4
      });
      (shadowFilter as any).shadowOnly = shadowOnly;
      filters.push(shadowFilter);
    }
    
    // Glow効果の適用
    if (enableGlow) {
      const bloomFilter = new AdvancedBloomFilter({
        threshold: 0.2,
        bloomScale: glowStrength,
        brightness: glowBrightness,
        blur: glowBlur,
        quality: glowQuality,
        kernels: null,
        pixelSize: { x: 1, y: 1 }
      });
      filters.push(bloomFilter);
    }
    
    container.filters = filters.length > 0 ? filters : null;
    
    // パラメータの取得
    const phraseOffsetX = params.phraseOffsetX as number || 100;
    const phraseOffsetY = params.phraseOffsetY as number || 60;
    const randomPlacement = params.randomPlacement as boolean ?? true;
    const randomSeed = params.randomSeed as number || 0;
    const randomRangeX = params.randomRangeX as number || 200;
    const randomRangeY = params.randomRangeY as number || 150;
    const minDistanceFromPrevious = params.minDistanceFromPrevious as number || 150;
    const tailTime = params.tailTime as number || 500;
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      container.position.set(0, 0);
      return true;
    }
    
    const screenWidth = app.renderer.width;
    const screenHeight = app.renderer.height;
    
    // フレーズIDの取得
    const phraseText = Array.isArray(text) ? text.join('') : text;
    const phraseId = params.phraseId as string || params.id as string || `phrase_${startMs}_${phraseText.substring(0, 10)}`;
    
    // 基準位置の計算
    let centerX = screenWidth / 2 + phraseOffsetX;
    let centerY = screenHeight / 2 + phraseOffsetY;
    
    // ランダム配置が有効な場合
    if (randomPlacement) {
      const offsetList = getOrCreateOffsetList(randomSeed, randomRangeX, randomRangeY, minDistanceFromPrevious);
      
      // フレーズIDからインデックスを決定論的に計算
      let hash = 0;
      for (let i = 0; i < phraseId.length; i++) {
        const char = phraseId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      
      const offsetIndex = Math.abs(hash) % offsetList.offsets.length;
      const offset = offsetList.offsets[offsetIndex];
      
      if (offset) {
        centerX += offset.x;
        centerY += offset.y;
      }
    }
    
    // フレーズのアウトアニメーション
    let alpha = 1.0;
    let xOffset = 0;
    
    if (nowMs > endMs) {
      // フェードアウト期間中
      const fadeProgress = Math.min((nowMs - endMs) / tailTime, 1.0);
      alpha = 1.0 - fadeProgress;
      // 左方向へのスライド（イージング適用）
      const slideDistance = 200;
      xOffset = -slideDistance * easeInCubic(fadeProgress);
    }
    
    // 合成モードの適用
    const blendModeMap: Record<string, PIXI.BLEND_MODES> = {
      'normal': PIXI.BLEND_MODES.NORMAL,
      'add': PIXI.BLEND_MODES.ADD,
      'multiply': PIXI.BLEND_MODES.MULTIPLY,
      'screen': PIXI.BLEND_MODES.SCREEN,
      'overlay': PIXI.BLEND_MODES.OVERLAY,
      'darken': PIXI.BLEND_MODES.DARKEN,
      'lighten': PIXI.BLEND_MODES.LIGHTEN,
      'color-dodge': PIXI.BLEND_MODES.COLOR_DODGE,
      'color-burn': PIXI.BLEND_MODES.COLOR_BURN,
      'hard-light': PIXI.BLEND_MODES.HARD_LIGHT,
      'soft-light': PIXI.BLEND_MODES.SOFT_LIGHT,
      'difference': PIXI.BLEND_MODES.DIFFERENCE,
      'exclusion': PIXI.BLEND_MODES.EXCLUSION
    };
    
    container.blendMode = blendModeMap[blendMode] || PIXI.BLEND_MODES.NORMAL;
    
    // フレーズコンテナを配置
    container.position.set(centerX + xOffset, centerY);
    container.alpha = alpha;
    container.visible = alpha > 0;
    container.updateTransform();
    
    return true;
  },
  
  /**
   * 単語コンテナの描画
   * 右側から左へスライドイン、単語ごとに異なるY座標（段組み表示）
   */
  renderWordContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    const fontSize = params.fontSize as number || 120;
    const headTime = params.headTime as number || 500;
    const entranceInitialSpeed = params.entranceInitialSpeed as number || 4.0;
    const activeSpeed = params.activeSpeed as number || 0.10;
    const rightOffset = params.rightOffset as number || 100;
    const charSpacing = params.charSpacing as number || 1.0;
    const enableGlow = params.enableGlow as boolean ?? true;
    const glowPadding = params.glowPadding as number || 50;
    
    // 単語のインデックスを取得
    const wordIndex = params.wordIndex as number || 0;
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      container.position.set(0, 0);
      return true;
    }
    
    // 単語の初期位置は右オフセット
    const startPositionX = rightOffset;
    
    // Y座標の計算（単語ごとに段を変える）
    const yOffset = wordIndex * fontSize;
    
    // 時間計算
    const inStartTime = startMs - headTime;
    
    let posX = startPositionX;
    let alpha = 1.0;
    
    // スライドインアニメーション
    if (nowMs < inStartTime) {
      // 入場前：初期位置で非表示
      posX = startPositionX;
      alpha = 0;
    } else if (nowMs < startMs) {
      // 入場アニメーション期間：速度ベースの移動
      const elapsedTime = nowMs - inStartTime;
      const distance = calculateDistanceFromSpeed(
        elapsedTime,
        headTime,
        entranceInitialSpeed,
        activeSpeed
      );
      posX = startPositionX - distance;
      alpha = elapsedTime / headTime;
    } else {
      // アクティブ時以降：スライドインが完了した位置で停止
      const entranceEndDistance = calculateDistanceFromSpeed(
        headTime,
        headTime,
        entranceInitialSpeed,
        activeSpeed
      );
      posX = startPositionX - entranceEndDistance;
      alpha = 1.0;
    }
    
    // 単語コンテナの位置設定
    container.position.set(posX, yOffset);
    container.alpha = alpha;
    container.visible = true;
    
    // グロー効果が有効な場合、単語コンテナにもフィルターエリアを設定
    if (enableGlow) {
      let totalWidth = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
        totalWidth += fontSize * effectiveSpacing;
      }
      const wordWidth = totalWidth + glowPadding * 2;
      const wordHeight = fontSize + glowPadding * 2;
      
      container.filterArea = new PIXI.Rectangle(
        -glowPadding,
        -glowPadding,
        wordWidth,
        wordHeight
      );
    } else {
      container.filterArea = null;
    }
    
    container.updateTransform();
    
    // 文字コンテナの管理
    if (params.chars && Array.isArray(params.chars)) {
      let cumulativeXOffset = 0;
      
      (params.chars as any[]).forEach((charData: any, index: number) => {
        let charContainer: PIXI.Container | null = null;
        
        container.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && 
              (child as any).name === `char_container_${charData.id}`) {
            charContainer = child as PIXI.Container;
          }
        });
        
        if (!charContainer) {
          charContainer = new PIXI.Container();
          (charContainer as any).name = `char_container_${charData.id}`;
          container.addChild(charContainer);
        }
        
        // 文字コンテナの位置設定（半角文字は間隔を0.6倍に）
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
        
        charContainer.position.set(cumulativeXOffset, 0);
        cumulativeXOffset += fontSize * effectiveSpacing;
        
        // 文字アニメーションの適用
        this.animateContainer!(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars,
            wordIndex: wordIndex,
            totalWords: params.totalWords
          },
          nowMs,
          charData.start,
          charData.end,
          'char',
          phase
        );
      });
    }
    
    return true;
  },
  
  /**
   * 文字コンテナの描画
   * 3段階の色変化と拡大・ランダム位置オフセット、サイズ復元、退場アニメーションを実装
   */
  renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    // 詳細ログ：文字レベルでの処理状況を常に記録（無効化）
    // const containerId = (container as any).name || 'unknown';
    // const charId = params.id as string || `char_${startMs}_${text}`;
    // 
    // // キャラクターレンダリング詳細ログ
    // if (frameCounter % 10 === 0) { // 10フレームごとに出力
    //   console.log(`\n--- [WordSlideText2] 文字レンダリング詳細 ---`);
    //   console.log(`文字: "${text}", ID: ${charId}, Container: ${containerId}`);
    //   console.log(`フェーズ: ${phase}, 時刻: ${nowMs}ms (${startMs}ms-${endMs}ms)`);
    //   console.log(`スケーリング設定:`, {
    //     enableCharScaling: params.enableCharScaling,
    //     charScaleMultiplier: params.charScaleMultiplier,
    //     charPositionOffsetX: params.charPositionOffsetX,
    //     charPositionOffsetY: params.charPositionOffsetY,
    //     charScalingSeed: params.charScalingSeed
    //   });
    // }
    
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string;
    if (!fontFamily) {
      console.error('[WordSlideText2] fontFamilyパラメータが指定されていません');
      return false;
    }
    const defaultTextColor = params.textColor as string || '#808080';
    const activeTextColor = params.activeTextColor as string || '#FFFF80';
    const completedTextColor = params.completedTextColor as string || '#FFF7EB';
    
    // 文字スケーリング設定
    const enableCharScaling = params.enableCharScaling as boolean ?? true;
    const charScaleMultiplier = params.charScaleMultiplier as number || 8.0;
    const charPositionOffsetX = params.charPositionOffsetX as number || 20;
    const charPositionOffsetY = params.charPositionOffsetY as number || 100;
    const charScalingSeed = params.charScalingSeed as number || 12345;
    
    container.visible = true;
    
    // 時間計算
    const headTime = params.headTime as number || 500;
    const inStartTime = startMs - headTime;
    const tailTime = params.tailTime as number || 500;
    const outEndTime = endMs + tailTime;
    
    // 文字の状態を判定
    let textColor = defaultTextColor;
    let scale = 1.0;
    let positionOffset = { x: 0, y: 0 };
    let alpha = 1.0;
    
    if (nowMs < inStartTime) {
      // headtime前：非表示
      textColor = defaultTextColor;
      scale = 1.0;
      alpha = 0;
    } else if (nowMs < startMs) {
      // headtime期間：3次イージングで拡大
      textColor = defaultTextColor;
      
      if (enableCharScaling) {
        const elapsedInHead = nowMs - inStartTime;
        const progress = Math.min(elapsedInHead / headTime, 1.0);
        
        // 3次イージング（キュービックイン）：ゆっくり開始、徐々に加速
        const easedProgress = easeInCubic(progress);
        
        // 1.0から拡大サイズまで
        scale = 1.0 + (charScaleMultiplier - 1.0) * easedProgress;
        
        // 文字IDを取得
        const charId = params.id as string || `char_${startMs}_${text}`;
        
        // この文字固有のランダムオフセットを生成
        const targetOffset = generateCharacterOffset(
          charId, 
          charScalingSeed, 
          charPositionOffsetX * 2,
          charPositionOffsetY * 2
        );
        
        // 位置オフセットも徐々に適用
        positionOffset = {
          x: targetOffset.x * easedProgress,
          y: targetOffset.y * easedProgress
        };
        
        alpha = Math.min(progress * 2, 1.0); // 拡大と同時にフェードイン
        
        // デバッグログ（無効化）
        // if (frameCounter % 10 === 0) {
        //   console.log(`[WordSlideText2 EXPANDING] char="${text}" progress=${progress.toFixed(3)}, scale=${scale.toFixed(3)}`);
        // }
      } else {
        alpha = Math.min((nowMs - inStartTime) / headTime, 1.0);
      }
    } else if (nowMs <= endMs) {
      // アクティブ期間：5%縮小アニメーション + 3次イージングフェードアウト
      textColor = activeTextColor;
      
      if (enableCharScaling) {
        const activeDuration = endMs - startMs;
        const elapsed = nowMs - startMs;
        const progress = Math.min(elapsed / activeDuration, 1.0);
        
        // 拡大サイズから5%縮小
        const shrinkAmount = charScaleMultiplier * 0.05;
        scale = charScaleMultiplier - shrinkAmount * progress;
        
        // 文字IDを取得
        const charId = params.id as string || `char_${startMs}_${text}`;
        
        // この文字固有のランダムオフセットを維持
        const targetOffset = generateCharacterOffset(
          charId, 
          charScalingSeed, 
          charPositionOffsetX * 2,
          charPositionOffsetY * 2
        );
        
        positionOffset = {
          x: targetOffset.x,
          y: targetOffset.y
        };
        
        // 3次イージングでフェードアウト（最初はゆっくり、徐々に加速）
        const fadeProgress = easeInCubic(progress);
        alpha = 1.0 - fadeProgress;
        
        // デバッグログ（無効化）
        // if (frameCounter % 10 === 0) {
        //   console.log(`[WordSlideText2 ACTIVE] char="${text}" progress=${progress.toFixed(3)}, scale=${scale.toFixed(3)}, alpha=${alpha.toFixed(3)}`);
        // }
      } else {
        alpha = 1.0;
      }
    } else {
      // アウト期間：非表示
      textColor = completedTextColor;
      scale = 1.0;
      alpha = 0;
    }
    
    // 既存のテキストオブジェクトを取得または新規作成
    let textObj = container.getChildByName('text') as PIXI.Text;
    if (!textObj) {
      // デバッグ：devicePixelRatioの確認（無効化）
      // const devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      // if (frameCounter % 10 === 0) {
      //   console.log(`[WordSlideText2] devicePixelRatio: ${devicePixelRatio}`);
      //   console.log(`[WordSlideText2] 設定フォントサイズ: ${fontSize}px`);
      //   console.log(`[WordSlideText2] 高DPI処理後の予想フォントサイズ: ${fontSize * devicePixelRatio}px`);
      //   console.log(`[WordSlideText2] 高DPI処理後の予想スケール: ${1 / devicePixelRatio}`);
      // }
      
      // 新規作成（高DPI処理を無効化して正確なサイズ制御）
      textObj = TextStyleFactory.createText(text, {
        fontFamily: fontFamily,
        fontSize: fontSize,
        fill: textColor
      });
      textObj.name = 'text';
      textObj.anchor.set(0.5, 0.5);
      container.addChild(textObj);
    } else {
      // 既存オブジェクトのスタイル更新（高DPI処理を無効化）
      textObj.style = TextStyleFactory.createText(text, {
        fontFamily: fontFamily,
        fontSize: fontSize,
        fill: textColor
      }).style;
      textObj.text = text;
    }
    
    // スケール、ポジションオフセット、アルファを適用
    textObj.scale.set(scale, scale);
    textObj.position.set(positionOffset.x, positionOffset.y);
    textObj.alpha = alpha;
    
    // 開始時刻でのコピー拡大フェードアウトアニメーション
    const enableExitAnimation = params.enableExitAnimation as boolean ?? true;
    const exitCopyCount = params.exitCopyCount as number || 3;
    const exitFrameDelay = params.exitFrameDelay as number || 3;
    const exitCopyScale = params.exitCopyScale as number || 2.0;
    const exitCopyColor = params.exitCopyColor as string || '#FFFFFF';
    const exitAnimationDuration = params.exitAnimationDuration as number || 10;
    const copyPositionRandomRange = params.copyPositionRandomRange as number || 50;
    const copyPositionSeed = params.copyPositionSeed as number || 54321;
    
    if (nowMs >= startMs && enableCharScaling && enableExitAnimation) {
      const exitAnimationDurationMs = exitAnimationDuration * (1000 / 60);
      const elapsedSinceStart = nowMs - startMs;
      const maxTotalDuration = (exitCopyCount - 1) * exitFrameDelay * (1000 / 60) + exitAnimationDurationMs;
      
      // 開始時刻から一定時間のみ処理
      if (elapsedSinceStart <= maxTotalDuration) {
        // 各コピーを処理
        for (let copyIndex = 0; copyIndex < exitCopyCount; copyIndex++) {
          const copyDelayMs = copyIndex * exitFrameDelay * (1000 / 60);
          const copyStartTime = elapsedSinceStart - copyDelayMs;
          const copyName = `start_copy_${copyIndex}`;
          
          if (copyStartTime > 0 && copyStartTime <= exitAnimationDurationMs) {
            // このコピーのアニメーション期間中
            const copyProgress = copyStartTime / exitAnimationDurationMs;
            
            // 文字コピーを取得または作成
            let startCopyObj = container.getChildByName(copyName) as PIXI.Text;
            if (!startCopyObj) {
              startCopyObj = TextStyleFactory.createText(text, {
                fontFamily: fontFamily,
                fontSize: fontSize,
                fill: exitCopyColor
              });
              startCopyObj.name = copyName;
              startCopyObj.anchor.set(0.5, 0.5);
              container.addChild(startCopyObj);
              
              // デバッグログ：コピー作成（無効化）
              // if (frameCounter % 5 === 0) {
              //   console.log(`[WordSlideText2 START_COPY] char="${text}" copy=${copyIndex} CREATED`);
              // }
            }
            
            // 文字コピーのアニメーション（拡大・フェードアウト）
            const startScale = charScaleMultiplier + (exitCopyScale - charScaleMultiplier) * copyProgress;
            startCopyObj.scale.set(startScale, startScale);
            startCopyObj.alpha = 1.0 - copyProgress;
            
            // 文字IDを取得
            const charId = params.id as string || `char_${startMs}_${text}`;
            
            // オリジナル文字の位置を取得
            const originalOffset = generateCharacterOffset(
              charId, 
              charScalingSeed, 
              charPositionOffsetX * 2,
              charPositionOffsetY * 2
            );
            
            // このコピー固有のランダム位置を生成
            const copyRandomOffset = generateCopyPosition(
              charId,
              copyIndex,
              copyPositionSeed,
              copyPositionRandomRange
            );
            
            // オリジナル位置 + ランダムオフセット
            const finalPosition = {
              x: originalOffset.x + copyRandomOffset.x,
              y: originalOffset.y + copyRandomOffset.y
            };
            
            startCopyObj.position.set(finalPosition.x, finalPosition.y);
            
            // デバッグログ：開始時コピーアニメーション状況（無効化）
            // if (frameCounter % 5 === 0) {
            //   console.log(`[WordSlideText2 START_COPY] char="${text}" copy=${copyIndex}, progress=${copyProgress.toFixed(3)}, scale=${startScale.toFixed(3)}, alpha=${startCopyObj.alpha.toFixed(3)}`);
            //   console.log(`[WordSlideText2 START_COPY] position: original(${originalOffset.x.toFixed(1)}, ${originalOffset.y.toFixed(1)}) + random(${copyRandomOffset.x.toFixed(1)}, ${copyRandomOffset.y.toFixed(1)}) = final(${finalPosition.x.toFixed(1)}, ${finalPosition.y.toFixed(1)})`);
            // }
          } else if (copyStartTime > exitAnimationDurationMs) {
            // このコピーのアニメーション完了後、コピーを削除
            const startCopyObj = container.getChildByName(copyName) as PIXI.Text;
            if (startCopyObj) {
              container.removeChild(startCopyObj);
              startCopyObj.destroy();
              
              // デバッグログ：コピー削除（無効化）
              // if (frameCounter % 5 === 0) {
              //   console.log(`[WordSlideText2 START_COPY] char="${text}" copy=${copyIndex} DESTROYED`);
              // }
            }
          }
        }
      } else {
        // 全てのアニメーションが完了した場合、残っているコピーを全て削除
        for (let copyIndex = 0; copyIndex < exitCopyCount; copyIndex++) {
          const copyName = `start_copy_${copyIndex}`;
          const startCopyObj = container.getChildByName(copyName) as PIXI.Text;
          if (startCopyObj) {
            container.removeChild(startCopyObj);
            startCopyObj.destroy();
          }
        }
      }
    }
    
    // 終了時刻以降：元の位置に文字をフェードイン
    if (nowMs > endMs) {
      // 元の位置に文字をフェードイン
      let originalTextObj = container.getChildByName('original_text') as PIXI.Text;
      if (!originalTextObj) {
        originalTextObj = TextStyleFactory.createText(text, {
          fontFamily: fontFamily,
          fontSize: fontSize,
          fill: completedTextColor
        });
        originalTextObj.name = 'original_text';
        originalTextObj.anchor.set(0.5, 0.5);
        originalTextObj.position.set(0, 0); // 元の位置
        originalTextObj.scale.set(1.0, 1.0); // 元のサイズ
        container.addChild(originalTextObj);
      }
      
      // フェードインは瞬時に完了
      originalTextObj.alpha = 1.0;
      
      // デバッグログ（無効化）
      // if (frameCounter % 10 === 0) {
      //   console.log(`[WordSlideText2 ORIGINAL_FADEIN] char="${text}" alpha=${originalTextObj.alpha.toFixed(3)}`);
      // }
    }
    
    // デバッグログ：PIXI.Text適用確認（無効化）
    // if (frameCounter % 10 === 0) {
    //   const devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    //   const actualTextStyle = textObj.style;
    //   
    //   console.log(`[WordSlideText2 PIXI] char="${text}" 最終適用状況:`);
    //   console.log(`  設定フォントサイズ: ${fontSize}px`);
    //   console.log(`  devicePixelRatio: ${devicePixelRatio}`);
    //   console.log(`  PIXI.TextStyleのfontSize: ${actualTextStyle.fontSize}px`);
    //   console.log(`  実際のテキスト: "${textObj.text}"`);
    //   console.log(`  計算されたスケール: ${scale} → 実際のスケール: (${textObj.scale.x}, ${textObj.scale.y})`);
    //   console.log(`  最終的な表示サイズ: ${actualTextStyle.fontSize * textObj.scale.x}px`);
    //   console.log(`  計算されたオフセット: (${positionOffset.x.toFixed(2)}, ${positionOffset.y.toFixed(2)}) → 実際の位置: (${textObj.position.x.toFixed(2)}, ${textObj.position.y.toFixed(2)})`);
    //   console.log(`  色: ${textColor}`);
    //   console.log(`  コンテナ可視性: ${container.visible}`);
    //   console.log(`  テキストオブジェクト情報: 幅=${textObj.width.toFixed(2)}, 高さ=${textObj.height.toFixed(2)}`);
    //   console.log(`  実際の表示幅: ${(textObj.width * textObj.scale.x).toFixed(2)}px`);
    //   
    //   if (scale !== 1.0 || positionOffset.x !== 0 || positionOffset.y !== 0) {
    //     console.log(`  ⚠️ スケーリング/オフセット効果が適用されました！`);
    //   } else {
    //     console.log(`  ⚠️ スケーリング/オフセット効果が適用されていません`);
    //   }
    // }
    
    return true;
  }
};

export default WordSlideText2;