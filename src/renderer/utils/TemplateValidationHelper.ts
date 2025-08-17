/**
 * テンプレート実装検証ヘルパー
 * 開発時に文字表示継続性などの重要な原則をチェック
 */

import * as PIXI from 'pixi.js';

export class TemplateValidationHelper {
  private static warnings: Set<string> = new Set();
  
  /**
   * 文字表示継続性の検証
   * WordSlideTextPrimitive互換の実装をチェック
   */
  static validateCharacterContinuity(
    textObj: PIXI.Text, 
    templateName: string,
    context: 'renderCharContainer' | 'animateContainer' = 'renderCharContainer'
  ): void {
    const warningKey = `${templateName}_${context}_continuity`;
    
    // 既に警告済みの場合はスキップ
    if (this.warnings.has(warningKey)) return;
    
    let hasIssues = false;
    const issues: string[] = [];
    
    // アルファ値チェック
    if (textObj.alpha < 1.0) {
      hasIssues = true;
      issues.push(`textObj.alpha = ${textObj.alpha} (should be 1.0)`);
    }
    
    // 可視性チェック
    if (!textObj.visible) {
      hasIssues = true;
      issues.push(`textObj.visible = ${textObj.visible} (should be true)`);
    }
    
    if (hasIssues) {
      console.warn(
        `🚨 [${templateName}] 文字表示継続性違反が検出されました:\n` +
        `問題: ${issues.join(', ')}\n` +
        `解決策: WordSlideTextPrimitive (lines 598-599) を参考に修正してください\n` +
        `参考: /docs/template-quick-start-guide.md#カラオケ風テンプレート`
      );
      
      this.warnings.add(warningKey);
    }
  }
  
  /**
   * フェード効果実装の検証
   * 正しいフェード実装方法をチェック
   */
  static validateFadeImplementation(
    textObj: PIXI.Text,
    fadeAlpha: number,
    templateName: string
  ): void {
    const warningKey = `${templateName}_fade_implementation`;
    
    if (this.warnings.has(warningKey)) return;
    
    // フェード効果が textObj.alpha で実装されている場合
    if (textObj.alpha !== 1.0 && fadeAlpha !== undefined) {
      console.warn(
        `⚠️ [${templateName}] フェード効果の実装方法に問題があります:\n` +
        `現在: textObj.alpha = ${textObj.alpha} で制御\n` +
        `推奨: applyAlphaToColor() を使用して色のアルファ値で制御\n` +
        `参考: FadeBlurRandomTextPrimitive v2.0 の実装\n` +
        `ガイド: /docs/template-quick-start-guide.md#フェード効果テンプレート`
      );
      
      this.warnings.add(warningKey);
    }
  }
  
  /**
   * 実装方式の検証
   * v2.0 HierarchicalAnimationTemplate の誤用をチェック
   */
  static validateImplementationApproach(
    templateClass: any,
    templateName: string
  ): void {
    const warningKey = `${templateName}_implementation_approach`;
    
    if (this.warnings.has(warningKey)) return;
    
    // HierarchicalAnimationTemplate の使用チェック
    const isHierarchical = templateClass.prototype?.customPhraseRendering !== undefined;
    
    if (isHierarchical) {
      console.warn(
        `⚠️ [${templateName}] 実装方式について:\n` +
        `現在: HierarchicalAnimationTemplate (v2.0) を使用\n` +
        `推奨: IAnimationTemplate (WordSlideTextPrimitive互換) を使用\n` +
        `理由: 実装が複雑で、文字表示継続性の問題が発生しやすい\n` +
        `参考: WordSlideTextPrimitive の実装方式\n` +
        `ガイド: /docs/template-quick-start-guide.md#実装方式の選択`
      );
      
      this.warnings.add(warningKey);
    }
  }
  
  /**
   * リファレンス実装との比較推奨
   */
  static recommendReferenceComparison(templateName: string): void {
    const warningKey = `${templateName}_reference_comparison`;
    
    if (this.warnings.has(warningKey)) return;
    
    console.info(
      `💡 [${templateName}] 実装チェックポイント:\n` +
      `1. WordSlideTextPrimitive (lines 598-599) と比較してください\n` +
      `2. 文字表示が全期間で継続することを確認してください\n` +
      `3. 問題があれば /docs/template-quick-start-guide.md を参照してください`
    );
    
    this.warnings.add(warningKey);
  }
  
  /**
   * 警告履歴のクリア（開発時のリロード用）
   */
  static clearWarnings(): void {
    this.warnings.clear();
  }
  
  /**
   * デバッグ情報の出力
   */
  static debugCharacterState(
    textObj: PIXI.Text,
    templateName: string,
    additionalInfo?: Record<string, any>
  ): void {
    console.log(`🔍 [${templateName}] Character Debug Info:`, {
      visible: textObj.visible,
      alpha: textObj.alpha,
      fill: textObj.style.fill,
      text: textObj.text,
      position: { x: textObj.x, y: textObj.y },
      ...additionalInfo
    });
  }
}

/**
 * 開発環境でのみ動作する検証ヘルパー関数
 */
export function validateInDevelopment<T>(
  validationFn: () => T,
  fallback?: T
): T | undefined {
  if (process.env.NODE_ENV === 'development') {
    try {
      return validationFn();
    } catch (error) {
      console.error('Validation error:', error);
      return fallback;
    }
  }
  return fallback;
}