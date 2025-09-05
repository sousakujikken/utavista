/**
 * テンプレート生成エンジン
 * Claude Function Calling結果を実際のIAnimationTemplateに変換
 */

import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata } from '../types/types';
import { GenerateLyricTemplateResult } from './claudeFunctionSchemas';
import { PrimitiveLibrary, IntentBasedAPI } from '../primitives';
import * as PIXI from 'pixi.js';

/**
 * 生成されたテンプレートの設定
 */
export interface GeneratedTemplateConfig {
  templateData: GenerateLyricTemplateResult;
  metadata: {
    generatedAt: Date;
    generatedBy: 'LLM-Claude';
    version: string;
    sourceDescription: string;
  };
}

/**
 * テンプレート生成結果
 */
export interface TemplateGenerationResult {
  success: boolean;
  template?: IAnimationTemplate;
  templateCode?: string;
  error?: string;
  warnings?: string[];
}

/**
 * テンプレート生成エンジンの実装
 * オリジナルWordSlideTextの協調的階層制御パターンを継承
 */
export class TemplateGenerator {
  private intentAPI: IntentBasedAPI;
  
  constructor() {
    this.intentAPI = new IntentBasedAPI();
  }
  
  /**
   * Claude APIの結果からIAnimationTemplateを生成
   */
  generateTemplate(config: GeneratedTemplateConfig): TemplateGenerationResult {
    try {
      const { templateData, metadata } = config;
      
      // パラメータ設定の生成
      const parameterConfig = this.generateParameterConfig(templateData);
      
      // テンプレートメタデータの生成
      const templateMetadata = this.generateTemplateMetadata(templateData, metadata);
      
      // 動的テンプレートの生成
      const template = this.createDynamicTemplate(templateData, parameterConfig, templateMetadata);
      
      // テンプレートコードの生成
      const templateCode = this.generateTemplateCode(templateData, parameterConfig);
      
      return {
        success: true,
        template,
        templateCode,
        warnings: this.validateTemplate(templateData)
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Template generation failed: ${error.message}`,
        warnings: []
      };
    }
  }
  
  /**
   * 動的テンプレートインスタンスの作成
   * オリジナルWordSlideTextの構造を継承
   */
  private createDynamicTemplate(
    data: GenerateLyricTemplateResult,
    paramConfig: any[],
    metadata: TemplateMetadata
  ): IAnimationTemplate {
    const templateName = data.templateName || 'GeneratedTemplate';
    
    return {
      _debugTemplateName: templateName,
      metadata,
      
      getParameterConfig(): any[] {
        return paramConfig;
      },
      
      removeVisualElements(container: PIXI.Container): void {
        // WordSlideTextのremoveVisualElementsロジックを継承
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
      },
      
      animateContainer: (
        container: PIXI.Container,
        text: string | string[],
        params: Record<string, unknown>,
        nowMs: number,
        startMs: number,
        endMs: number,
        hierarchyType: HierarchyType,
        phase: AnimationPhase
      ): boolean => {
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
      },
      
      renderPhraseContainer: (
        container: PIXI.Container,
        text: string,
        params: Record<string, unknown>,
        nowMs: number,
        startMs: number,
        endMs: number,
        phase: AnimationPhase,
        hierarchyType: HierarchyType
      ): boolean => {
        return this.executeGeneratedPhraseLogic(container, text, params, nowMs, startMs, endMs, data);
      },
      
      renderWordContainer: (
        container: PIXI.Container,
        text: string,
        params: Record<string, unknown>,
        nowMs: number,
        startMs: number,
        endMs: number,
        phase: AnimationPhase,
        hierarchyType: HierarchyType
      ): boolean => {
        return this.executeGeneratedWordLogic(container, text, params, nowMs, startMs, endMs, data);
      },
      
      renderCharContainer: (
        container: PIXI.Container,
        text: string,
        params: Record<string, unknown>,
        nowMs: number,
        startMs: number,
        endMs: number,
        phase: AnimationPhase,
        hierarchyType: HierarchyType
      ): boolean => {
        return this.executeGeneratedCharLogic(container, text, params, nowMs, startMs, endMs, data);
      }
    };
  }
  
  /**
   * 生成されたフレーズロジックの実行
   * エフェクトとグローバルアニメーションを担当
   */
  private executeGeneratedPhraseLogic(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    data: GenerateLyricTemplateResult
  ): boolean {
    // エフェクトの適用
    if (data.effects && data.effects.length > 0) {
      data.effects.forEach(effect => {
        switch (effect.type) {
          case 'glow':
            this.intentAPI.applyGlowEffect(container, effect.intensity as any, effect.color);
            break;
          case 'shadow':
            // シャドウ効果の実装
            break;
        }
      });
    }
    
    // フレーズレベルの位置制御
    const positioning = data.layoutPattern.positioning;
    if (positioning) {
      let centerX = 0;
      let centerY = 0;
      
      // 画面サイズの取得
      const app = (window as any).__PIXI_APP__;
      if (app && app.renderer) {
        centerX = app.renderer.width / 2;
        centerY = app.renderer.height / 2;
      }
      
      // オフセットの適用
      if (positioning.offsetX) centerX += positioning.offsetX;
      if (positioning.offsetY) centerY += positioning.offsetY;
      
      // ランダム配置の処理
      if (positioning.randomPlacement && positioning.randomRange) {
        // 簡易的なランダム配置（WordSlideTextのロジックを簡略化）
        const hash = this.generateHash(text + startMs);
        const randomX = (hash % 200) - 100; // -100 to 100
        const randomY = (hash % 150) - 75; // -75 to 75
        centerX += randomX;
        centerY += randomY;
      }
      
      container.position.set(centerX, centerY);
    }
    
    // 退場アニメーション
    if (data.exitAnimation && nowMs > endMs) {
      const exitDuration = data.exitAnimation.duration || 500;
      const exitProgress = Math.min((nowMs - endMs) / exitDuration, 1.0);
      
      switch (data.exitAnimation.type) {
        case 'fade':
          container.alpha = 1.0 - exitProgress;
          break;
        case 'slide':
          const direction = data.exitAnimation.direction || 'left';
          const slideDistance = 200;
          const offset = slideDistance * exitProgress;
          
          switch (direction) {
            case 'left':
              container.position.x -= offset;
              break;
            case 'right':
              container.position.x += offset;
              break;
            case 'top':
              container.position.y -= offset;
              break;
            case 'bottom':
              container.position.y += offset;
              break;
          }
          break;
      }
    }
    
    container.updateTransform();
    return true;
  }
  
  /**
   * 生成された単語ロジックの実行
   * レイアウトとエントランスアニメーションを担当
   */
  private executeGeneratedWordLogic(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    data: GenerateLyricTemplateResult
  ): boolean {
    // エントランスアニメーション
    const entryAnimation = data.entryAnimation;
    const duration = entryAnimation.duration || 500;
    const headTime = data.timing?.headTime || 500;
    
    let animationResult = { position: { x: 0, y: 0 }, alpha: 1, visible: true };
    
    switch (entryAnimation.type) {
      case 'slide':
        animationResult = this.intentAPI.slideTextFromDirection(
          container,
          entryAnimation.direction as any || 'left',
          {
            nowMs,
            startMs,
            speed: entryAnimation.speed as any || 'normal',
            distance: entryAnimation.physics?.initialSpeed ? entryAnimation.physics.initialSpeed * 25 : 100
          }
        );
        break;
        
      case 'fade':
        const fadeProgress = Math.min(Math.max((nowMs - (startMs - headTime)) / duration, 0), 1);
        container.alpha = fadeProgress;
        container.visible = fadeProgress > 0;
        break;
        
      case 'bounce':
        animationResult = this.intentAPI.bounceIn(
          container,
          entryAnimation.physics?.elasticity || 0.8,
          { nowMs, startMs, duration }
        );
        break;
    }
    
    // 文字レイアウト管理
    if (params.chars && Array.isArray(params.chars)) {
      const layoutResult = this.intentAPI.revealCharactersSequentially(
        container,
        text,
        entryAnimation.sequencing as any || 'left-to-right',
        {
          fontSize: params.fontSize as number || 32,
          charSpacing: data.layoutPattern.spacing || 1.0,
          alignment: data.layoutPattern.alignment as any || 'left'
        }
      );
      
      // 文字コンテナの管理（WordSlideTextパターンを継承）
      (params.chars as any[]).forEach((charData: any, index: number) => {
        let charContainer: PIXI.Container | null = null;
        
        container.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && 
              child.name === `char_container_${charData.id}`) {
            charContainer = child as PIXI.Container;
          }
        });
        
        if (!charContainer) {
          charContainer = new PIXI.Container();
          (charContainer as any).name = `char_container_${charData.id}`;
          container.addChild(charContainer);
        }
        
        // 位置設定
        const charPos = layoutResult.characterPositions[index];
        if (charPos) {
          charContainer.position.set(charPos.x, charPos.y);
        }
        
        // 文字アニメーションの適用
        this.animateContainer!(
          charContainer,
          charData.char,
          { ...params, id: charData.id },
          nowMs,
          charData.start,
          charData.end,
          'char',
          'active'
        );
      });
    }
    
    container.updateTransform();
    return true;
  }
  
  /**
   * 生成された文字ロジックの実行
   * 実際のテキスト描画を担当
   */
  private executeGeneratedCharLogic(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    data: GenerateLyricTemplateResult
  ): boolean {
    // フォント設定
    const fontSize = data.styling?.fontSize || params.fontSize as number || 32;
    const fontFamily = data.styling?.fontFamily || params.fontFamily as string || 'Arial';
    
    // 色の状態管理
    let textColor = data.styling?.colors?.default || '#808080';
    
    if (nowMs < startMs) {
      textColor = data.styling?.colors?.default || '#808080';
    } else if (nowMs <= endMs) {
      textColor = data.styling?.colors?.active || '#FFFF80';
    } else {
      textColor = data.styling?.colors?.completed || '#FFF7EB';
    }
    
    // テキスト描画（WordSlideTextのパターンを継承）
    const textObj = new PIXI.Text(text, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor
    });
    
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    
    // ブレンドモードの適用
    if (data.styling?.blendMode) {
      const blendModeMap: Record<string, PIXI.BLEND_MODES> = {
        'normal': PIXI.BLEND_MODES.NORMAL,
        'add': PIXI.BLEND_MODES.ADD,
        'multiply': PIXI.BLEND_MODES.MULTIPLY,
        'screen': PIXI.BLEND_MODES.SCREEN
      };
      textObj.blendMode = blendModeMap[data.styling.blendMode] || PIXI.BLEND_MODES.NORMAL;
    }
    
    container.addChild(textObj);
    container.visible = true;
    
    return true;
  }
  
  /**
   * パラメータ設定の生成
   */
  private generateParameterConfig(data: GenerateLyricTemplateResult): any[] {
    const baseParams = [
      { name: "fontSize", type: "number", default: data.styling?.fontSize || 120, min: 12, max: 256, step: 1 },
      { name: "fontFamily", type: "string", default: data.styling?.fontFamily || "Arial" },
      { name: "textColor", type: "color", default: data.styling?.colors?.default || "#808080" },
      { name: "activeTextColor", type: "color", default: data.styling?.colors?.active || "#FFFF80" },
      { name: "completedTextColor", type: "color", default: data.styling?.colors?.completed || "#FFF7EB" },
      { name: "headTime", type: "number", default: data.timing?.headTime || 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: data.timing?.tailTime || 500, min: 0, max: 2000, step: 50 },
      { name: "charSpacing", type: "number", default: data.layoutPattern.spacing || 1.0, min: 0.1, max: 3.0, step: 0.1 }
    ];
    
    // アニメーション固有パラメータ
    if (data.entryAnimation.type === 'slide') {
      baseParams.push(
        { name: "entranceInitialSpeed", type: "number", default: data.entryAnimation.physics?.initialSpeed || 4.0, min: 0.1, max: 20.0, step: 0.1 },
        { name: "activeSpeed", type: "number", default: data.entryAnimation.physics?.finalSpeed || 0.1, min: 0.01, max: 2.0, step: 0.01 }
      );
    }
    
    // エフェクト固有パラメータ
    if (data.effects?.some(e => e.type === 'glow')) {
      baseParams.push(
        { name: "enableGlow", type: "boolean", default: true },
        { name: "glowStrength", type: "number", default: 1.5, min: 0, max: 5, step: 0.1 },
        { name: "glowBrightness", type: "number", default: 1.2, min: 0.5, max: 3, step: 0.1 }
      );
    }
    
    return baseParams;
  }
  
  /**
   * テンプレートメタデータの生成
   */
  private generateTemplateMetadata(
    data: GenerateLyricTemplateResult,
    metadata: GeneratedTemplateConfig['metadata']
  ): TemplateMetadata {
    return {
      name: data.templateName,
      version: "1.0.0",
      description: `LLM生成テンプレート: ${metadata.sourceDescription}`,
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      originalAuthor: {
        name: "Claude LLM",
        contribution: "自動生成テンプレート",
        date: new Date().toISOString().split('T')[0]
      },
      contributors: []
    };
  }
  
  /**
   * テンプレートコードの生成
   */
  private generateTemplateCode(data: GenerateLyricTemplateResult, paramConfig: any[]): string {
    return `// Generated Template: ${data.templateName}
// Auto-generated by LLM Template Generation System v2.0
// Created: ${new Date().toISOString()}

import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata } from '../types/types';
import { PrimitiveLibrary, IntentBasedAPI } from '../primitives';

export const ${data.templateName}: IAnimationTemplate = {
  _debugTemplateName: '${data.templateName}',
  
  metadata: {
    name: "${data.templateName}",
    version: "1.0.0",
    description: "LLM Generated Template",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Claude LLM",
      contribution: "Auto-generated template",
      date: "${new Date().toISOString().split('T')[0]}"
    },
    contributors: []
  },
  
  getParameterConfig(): any[] {
    return ${JSON.stringify(paramConfig, null, 4)};
  },
  
  // Implementation follows WordSlideText cooperative hierarchy pattern
  // Generated based on: ${JSON.stringify(data, null, 2)}
  
  // ... (rest of implementation)
};`;
  }
  
  /**
   * テンプレートの検証
   */
  private validateTemplate(data: GenerateLyricTemplateResult): string[] {
    const warnings: string[] = [];
    
    // 必須フィールドの確認
    if (!data.templateName || data.templateName.trim() === '') {
      warnings.push('Template name is empty or invalid');
    }
    
    if (!data.entryAnimation || !data.entryAnimation.type) {
      warnings.push('Entry animation type is not specified');
    }
    
    if (!data.layoutPattern || !data.layoutPattern.arrangement) {
      warnings.push('Layout arrangement is not specified');
    }
    
    // パフォーマンス警告
    if (data.entryAnimation.duration && data.entryAnimation.duration > 2000) {
      warnings.push('Entry animation duration is very long (>2s), may impact performance');
    }
    
    if (data.effects && data.effects.length > 3) {
      warnings.push('Many effects applied, may impact performance');
    }
    
    return warnings;
  }
  
  /**
   * 文字列からハッシュ値を生成
   */
  private generateHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}