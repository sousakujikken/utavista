/**
 * VerticalTextTemplate
 * 縦書きテキストテンプレート
 * 縦書きレイアウト、句読点調整、アルファベット回転機能を実装
 */

import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata, ParameterConfig } from '../types/types';
import { FontService } from '../services/FontService';
import { TextStyleFactory } from '../utils/TextStyleFactory';
import { 
  VerticalLayoutPrimitive,
  type VerticalLayoutParams,
  type TextDirection,
  type VerticalStartPosition,
  type VerticalLineDirection
} from '../primitives/layout/VerticalLayoutPrimitive';
import { 
  SlideAnimationPrimitive,
  GlowEffectPrimitive,
  type FlexibleCharacterData
} from '../primitives';
import { getLogicalStageSize, applyFallbackPosition, logCoordinates } from '../utils/StageUtils';

/**
 * 縦書きテキストテンプレート
 */
export class VerticalTextTemplate implements IAnimationTemplate {
  
  readonly metadata = {
    name: "VerticalTextTemplate",
    version: "1.0.0",
    description: "縦書きテキストテンプレート - 日本語縦書き、句読点調整、アルファベット回転対応",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "UTAVISTA Development Team",
      contribution: "縦書きテキストテンプレート実装",
      date: "2025-08-15"
    },
    contributors: []
  };
  
  /**
   * パラメータ設定
   */
  getParameterConfig(): ParameterConfig[] {
    return [
      // 基本パラメータ
      { name: "fontSize", type: "number", default: 80, min: 12, max: 256, step: 1 },
      { 
        name: "fontFamily", 
        type: "string", 
        default: "Noto Sans JP",
        get options() {
          return FontService.getAvailableFonts();
        }
      },
      
      // 縦書き設定
      { 
        name: "textDirection", 
        type: "string", 
        default: "vertical",
        options: ["horizontal", "vertical"]
      },
      { 
        name: "verticalStartPosition", 
        type: "string", 
        default: "top",
        options: ["top", "center", "bottom"]
      },
      { 
        name: "verticalLineDirection", 
        type: "string", 
        default: "rtl",
        options: ["rtl", "ltr"]
      },
      
      // 文字色設定
      { name: "textColor", type: "color", default: "#FFFFFF" },
      { name: "activeTextColor", type: "color", default: "#FFD700" },
      { name: "completedTextColor", type: "color", default: "#808080" },
      
      // レイアウト設定
      { name: "charSpacing", type: "number", default: 1.2, min: 0.1, max: 3.0, step: 0.1 },
      { name: "lineHeight", type: "number", default: 1.5, min: 0.5, max: 3.0, step: 0.1 },
      { name: "phraseOffsetX", type: "number", default: 0, min: -500, max: 500, step: 10 },
      { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 10 },
      
      // 句読点調整
      { name: "enablePunctuationAdjustment", type: "boolean", default: true },
      { name: "punctuationCharacters", type: "string", default: "、。，．" },
      { name: "punctuationOffsetXRatio", type: "number", default: 0, min: -1.0, max: 1.0, step: 0.01 },
      { name: "punctuationOffsetYRatio", type: "number", default: 0, min: -1.0, max: 1.0, step: 0.01 },
      
      // アルファベット回転
      { name: "enableAlphabetRotation", type: "boolean", default: true },
      { name: "alphabetRotationPattern", type: "string", default: "[a-zA-Z0-9]+" },
      { name: "alphabetCharSpacingRatio", type: "number", default: 0.8, min: 0.1, max: 2.0, step: 0.1 },
      
      // 長音記号回転
      { name: "enableLongVowelRotation", type: "boolean", default: true },
      { name: "longVowelCharacters", type: "string", default: "ー－‐−─━" },
      
      // 小文字調整
      { name: "enableSmallCharAdjustment", type: "boolean", default: true },
      { name: "smallCharacters", type: "string", default: "っゃゅょァィゥェォッャュョヮヵヶ" },
      { name: "smallCharOffsetXRatio", type: "number", default: 0.15, min: -1.0, max: 1.0, step: 0.01 },
      { name: "smallCharOffsetYRatio", type: "number", default: 0.1, min: -1.0, max: 1.0, step: 0.01 },
      
      // アニメーション設定
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "fadeInSpeed", type: "number", default: 0.5, min: 0.1, max: 2.0, step: 0.1 },
      { name: "fadeOutSpeed", type: "number", default: 0.5, min: 0.1, max: 2.0, step: 0.1 },
      
      // グロー効果
      { name: "enableGlow", type: "boolean", default: false },
      { name: "glowStrength", type: "number", default: 1.0, min: 0, max: 5, step: 0.1 },
      { name: "glowBrightness", type: "number", default: 1.5, min: 0.5, max: 3, step: 0.1 },
      { name: "glowBlur", type: "number", default: 5, min: 0.1, max: 20, step: 0.1 },
      { name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1 },
      
      // シャドウ効果
      { name: "enableShadow", type: "boolean", default: true },
      { name: "shadowColor", type: "color", default: "#000000" },
      { name: "shadowDistance", type: "number", default: 3, min: 0, max: 20, step: 1 },
      { name: "shadowAngle", type: "number", default: 45, min: 0, max: 360, step: 15 },
      { name: "shadowAlpha", type: "number", default: 0.5, min: 0, max: 1, step: 0.1 },
      { name: "shadowBlur", type: "number", default: 3, min: 0, max: 20, step: 1 },
      { name: "shadowQuality", type: "number", default: 4, min: 1, max: 10, step: 1 }
    ];
  }
  
  /**
   * 表示要素のみを削除するメソッド
   */
  removeVisualElements(container: PIXI.Container): void {
    const childrenToKeep: PIXI.DisplayObject[] = [];
    const childrenToRemove: PIXI.DisplayObject[] = [];
    
    container.children.forEach(child => {
      if (child instanceof PIXI.Container && 
          (child as any).name && 
          ((child as any).name.includes('phrase_container_') || 
           (child as any).name.includes('word_container_') || 
           (child as any).name.includes('char_container_'))) {
        childrenToKeep.push(child);
      } else {
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
  }
  
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
    const textContent = Array.isArray(text) ? text.join('') : text;
    
    container.visible = true;
    this.removeVisualElements!(container);
    
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
  }
  
  /**
   * フレーズコンテナの描画
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
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      applyFallbackPosition(container);
      return true;
    }
    
    const { width: screenWidth, height: screenHeight } = getLogicalStageSize();
    
    // VerticalTextTemplateは常に縦書きモード
    const verticalLineDirection = params.verticalLineDirection as VerticalLineDirection || 'rtl';
    const phraseOffsetX = params.phraseOffsetX as number || 0;
    const phraseOffsetY = params.phraseOffsetY as number || 0;
    
    let posX = 0;
    let posY = 0;
    
    // 縦書きモード
    if (verticalLineDirection === 'rtl') {
      // 右から左へ
      posX = screenWidth - (params.fontSize as number || 80) * 2 + phraseOffsetX;
    } else {
      // 左から右へ
      posX = (params.fontSize as number || 80) * 2 + phraseOffsetX;
    }
    posY = (params.fontSize as number || 80) + phraseOffsetY;
    
    // フェードイン・フェードアウト制御
    const headTime = params.headTime as number || 500;
    const tailTime = params.tailTime as number || 500;
    const inStartTime = startMs - headTime;
    const outEndTime = endMs + tailTime;
    
    let alpha = 1.0;
    
    if (nowMs < inStartTime) {
      alpha = 0;
    } else if (nowMs < startMs) {
      const progress = (nowMs - inStartTime) / headTime;
      alpha = progress;
    } else if (nowMs <= endMs) {
      alpha = 1.0;
    } else if (nowMs < outEndTime) {
      const exitProgress = (nowMs - endMs) / tailTime;
      alpha = 1.0 - exitProgress;
    } else {
      alpha = 0;
    }
    
    container.position.set(posX, posY);
    container.alpha = alpha;
    container.updateTransform();
    
    // デバッグ用座標ログ
    logCoordinates(
      'VerticalTextTemplate', 
      container.name || 'unnamed_phrase', 
      { x: posX, y: posY },
      { x: phraseOffsetX, y: phraseOffsetY },
      { 
        phase, 
        alpha, 
        verticalLineDirection,
        fontSize: params.fontSize as number || 80,
        screenSize: { width: screenWidth, height: screenHeight }
      }
    );
    
    // フレーズレベルでグロー・シャドウエフェクトを適用
    if (params.enableGlow || params.enableShadow) {
      console.log(`[VerticalTextTemplate] フレーズレベルエフェクト適用: glow=${params.enableGlow}, shadow=${params.enableShadow}`);
      
      const glowPrimitive = new GlowEffectPrimitive();
      
      glowPrimitive.applyEffect(container, {
        enableGlow: params.enableGlow as boolean || false,
        enableShadow: params.enableShadow as boolean || false,
        blendMode: 'normal',
        glow: (params.enableGlow as boolean) ? {
          intensity: 1.0,
          glowStrength: params.glowStrength as number || 1.0,
          glowBrightness: params.glowBrightness as number || 1.5,
          glowBlur: params.glowBlur as number || 5,
          glowQuality: params.glowQuality as number || 8,
          glowPadding: 50,
          threshold: 0.5
        } : undefined,
        shadow: (params.enableShadow as boolean) ? {
          intensity: 1.0,
          shadowBlur: params.shadowBlur as number || 3,
          shadowColor: params.shadowColor as string || '#000000',
          shadowAngle: params.shadowAngle as number || 45,
          shadowDistance: params.shadowDistance as number || 3,
          shadowAlpha: params.shadowAlpha as number || 0.5,
          shadowOnly: false,
          shadowQuality: params.shadowQuality as number || 4
        } : undefined
      });
      
      console.log(`[VerticalTextTemplate] フレーズエフェクト適用完了: container.filters=${container.filters?.length || 0}`);
    }
    
    // 画面サイズ情報を子に渡す
    (params as any).screenWidth = screenWidth;
    (params as any).screenHeight = screenHeight;
    
    return true;
  }
  
  /**
   * 単語コンテナの描画
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
    
    // 単語コンテナは相対座標なので、位置をリセット
    container.position.set(0, 0);
    container.visible = true;
    
    // 単語インデックスから横方向のオフセットを計算（縦書きの場合）
    const wordIndex = (params as any).wordIndex || 0;
    // VerticalTextTemplateは常に縦書きモード
    const textDirection: TextDirection = 'vertical';
    
    // 縦書きの場合、単語ごとに左に移動（行を変える）
    const lineSpacing = (params.fontSize as number || 80) * (params.lineHeight as number || 1.5);
    container.position.x = -wordIndex * lineSpacing; // 右から左へ
    // console.log(`[VerticalTextTemplate] Word ${wordIndex} position.x = ${container.position.x}`);
    
    const charsData = params.chars as FlexibleCharacterData[];
    if (!charsData || !Array.isArray(charsData) || charsData.length === 0) {
      return true;
    }
    
    // VerticalLayoutPrimitive使用
    const layoutPrimitive = new VerticalLayoutPrimitive();
    
    const layoutParams: VerticalLayoutParams = {
      charSpacing: params.charSpacing as number || 1.2,
      fontSize: params.fontSize as number || 80,
      halfWidthSpacingRatio: 0.6,
      alignment: 'left' as const,
      containerSize: { width: 0, height: 0 },
      spacing: params.charSpacing as number || 1.2,
      chars: charsData,
      containerPrefix: 'char_container_',
      wordDisplayMode: 'phrase_cumulative_same_line' as any,
      wordSpacing: 1.0,
      lineHeight: params.lineHeight as number || 1.5,
      textDirection: textDirection,
      verticalStartPosition: params.verticalStartPosition as VerticalStartPosition || 'top',
      verticalLineDirection: params.verticalLineDirection as VerticalLineDirection || 'rtl',
      enablePunctuationAdjustment: params.enablePunctuationAdjustment as boolean,
      punctuationCharacters: params.punctuationCharacters as string,
      punctuationOffsetXRatio: params.punctuationOffsetXRatio as number,
      punctuationOffsetYRatio: params.punctuationOffsetYRatio as number,
      enableAlphabetRotation: params.enableAlphabetRotation as boolean,
      alphabetRotationPattern: params.alphabetRotationPattern as string,
      alphabetCharSpacingRatio: params.alphabetCharSpacingRatio as number,
      enableLongVowelRotation: params.enableLongVowelRotation as boolean,
      longVowelCharacters: params.longVowelCharacters as string,
      enableSmallCharAdjustment: params.enableSmallCharAdjustment as boolean,
      smallCharacters: params.smallCharacters as string,
      smallCharOffsetXRatio: params.smallCharOffsetXRatio as number,
      smallCharOffsetYRatio: params.smallCharOffsetYRatio as number,
      screenWidth: params.screenWidth as number,
      screenHeight: params.screenHeight as number,
      // 縦書きテンプレートでは文字レベルのタイミング制御を使用
      // phraseTimingControlを無効化して発声中フェードアウトを防止
      phraseTimingControl: undefined
    };
    
    layoutPrimitive.manageCharacterContainers(
      container,
      layoutParams,
      (charContainer, charData, position, rotation) => {
        // 文字アニメーションの適用
        this.animateContainer!(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars,
            phrasePhase: phase,
            phraseStartMs: params.phraseStartMs || startMs,
            phraseEndMs: params.phraseEndMs || endMs,
            rotation: rotation
          },
          nowMs,
          charData.start,
          charData.end,
          'char',
          phase
        );
      }
    );
    
    return true;
  }
  
  /**
   * 文字コンテナの描画
   */
  renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    _phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    
    const fontSize = params.fontSize as number || 80;
    const fontFamily = params.fontFamily as string || 'Noto Sans JP';
    // VerticalTextTemplateは常に縦書きモード
    const textDirection: TextDirection = 'vertical';
    
    // 文字レベルの表示状態制御（発声中でフェードアウトしないよう修正）
    if (!container.visible) {
      return true;
    }
    
    // 文字の状態を判定（文字の実際のタイミングを使用）
    const isActive = nowMs >= startMs && nowMs <= endMs;
    const isCompleted = nowMs > endMs;
    
    // 文字の色を状態に応じて決定
    let textColor = params.textColor as string || '#FFFFFF';
    if (isActive) {
      textColor = params.activeTextColor as string || '#FFD700';
    } else if (isCompleted) {
      textColor = params.completedTextColor as string || '#808080';
    }
    
    // 句読点位置調整
    let positionOffset = { x: 0, y: 0 };
    if (textDirection === 'vertical' && params.enablePunctuationAdjustment) {
      const punctuationChars = params.punctuationCharacters as string || '、。，．';
      if (punctuationChars.includes(text)) {
        const baseOffsetXRatio = params.punctuationOffsetXRatio as number || 0;
        const baseOffsetYRatio = params.punctuationOffsetYRatio as number || 0;
        
        // 縦書きモードでの自動調整（比率ベース）
        switch (text) {
          case '、':
          case '，':
            positionOffset = { 
              x: (baseOffsetXRatio + 0.3) * fontSize, 
              y: (baseOffsetYRatio + 0.2) * fontSize 
            };
            break;
          case '。':
          case '．':
            positionOffset = { 
              x: (baseOffsetXRatio + 0.25) * fontSize, 
              y: (baseOffsetYRatio + 0.25) * fontSize 
            };
            break;
          default:
            positionOffset = { 
              x: baseOffsetXRatio * fontSize, 
              y: baseOffsetYRatio * fontSize 
            };
            break;
        }
      }
    }
    
    // まずテキストオブジェクトを作成
    const textObj = TextStyleFactory.createHighDPIText(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor,
      // グロー使用時はピクシ内蔵シャドウを無効化
      dropShadow: params.enableGlow ? false : (params.enableShadow as boolean),
      dropShadowColor: params.shadowColor as string || '#000000',
      dropShadowDistance: params.shadowDistance as number || 3,
      dropShadowAngle: ((params.shadowAngle as number || 45) * Math.PI) / 180,
      dropShadowAlpha: params.shadowAlpha as number || 0.5,
      dropShadowBlur: params.shadowBlur as number || 3
    });
    
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(positionOffset.x, positionOffset.y);
    
    // 既存のテキストオブジェクトをクリア
    if (container.children.length > 0) {
      container.removeChildren();
    }
    
    // 回転を常に0度にリセット後、プリミティブからの回転値を適用
    textObj.rotation = 0;
    if (params.rotation !== undefined) {
      textObj.rotation = (params.rotation as number * Math.PI) / 180;
    }
    
    container.addChild(textObj);
    
    // 文字レベルではエフェクトは適用しない（フレーズレベルで適用済み）
    // テキスト描画のみ行う
    
    return true;
  }
  
  /**
   * 従来のanimateメソッド（互換性のため）
   */
  animate(
    container: PIXI.Container,
    text: string | string[],
    x: number,
    y: number,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number
  ): boolean {
    let hierarchyType: HierarchyType = 'char';
    
    if (params.id) {
      const id = params.id as string;
      if (id.includes('phrase')) {
        hierarchyType = 'phrase';
      } else if (id.includes('word')) {
        hierarchyType = 'word';
      }
    }
    
    let phase: AnimationPhase = 'active';
    if (nowMs < startMs) {
      phase = 'in';
    } else if (nowMs > endMs) {
      phase = 'out';
    }
    
    return this.animateContainer!(
      container,
      text,
      params,
      nowMs,
      startMs,
      endMs,
      hierarchyType,
      phase
    );
  }
}