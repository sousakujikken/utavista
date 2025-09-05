/**
 * LLMテンプレートサービス
 * エンドツーエンドのMVPプロトタイプ統合マネージャー
 */

import { ClaudeAPIClient, ClaudeAPIConfig, ClaudeAPIError } from './ClaudeAPIClient';
import { TemplateGenerator, TemplateGenerationResult, GeneratedTemplateConfig } from './TemplateGenerator';
import { IAnimationTemplate } from '../types/types';
import { GenerateLyricTemplateResult } from './claudeFunctionSchemas';

/**
 * LLMサービスの設定
 */
export interface LLMServiceConfig {
  claude: ClaudeAPIConfig;
  enableCache: boolean;
  maxRetries: number;
  timeoutMs: number;
}

/**
 * テンプレート生成リクエスト
 */
export interface GenerateTemplateRequest {
  description: string;
  context?: {
    existingTemplates?: string[];
    targetStyle?: string;
    performance?: 'fast' | 'balanced' | 'quality';
  };
  options?: {
    generateCode?: boolean;
    validateResult?: boolean;
    saveToRegistry?: boolean;
  };
}

/**
 * テンプレート生成レスポンス
 */
export interface GenerateTemplateResponse {
  success: boolean;
  template?: IAnimationTemplate;
  templateCode?: string;
  templateData?: GenerateLyricTemplateResult;
  metadata?: {
    generatedAt: Date;
    processingTimeMs: number;
    tokensUsed?: number;
  };
  error?: string;
  warnings?: string[];
}

/**
 * 生成履歴エントリ
 */
export interface GenerationHistoryEntry {
  id: string;
  timestamp: Date;
  request: GenerateTemplateRequest;
  response: GenerateTemplateResponse;
  success: boolean;
}

/**
 * LLMテンプレートサービスのメイン実装
 * Claude API + Template Generator の統合制御
 */
export class LLMTemplateService {
  private claudeClient: ClaudeAPIClient;
  private templateGenerator: TemplateGenerator;
  private config: LLMServiceConfig;
  private generationHistory: GenerationHistoryEntry[] = [];
  private cache: Map<string, GenerateTemplateResponse> = new Map();
  
  constructor(config: LLMServiceConfig) {
    this.config = config;
    this.claudeClient = new ClaudeAPIClient(config.claude);
    this.templateGenerator = new TemplateGenerator();
  }
  
  /**
   * メインのテンプレート生成メソッド
   * 自然言語 → 構造化データ → IAnimationTemplate
   */
  async generateTemplate(request: GenerateTemplateRequest): Promise<GenerateTemplateResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      // キャッシュチェック
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(request);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          this.addToHistory(requestId, request, { ...cached, metadata: { ...cached.metadata!, generatedAt: new Date() } });
          return cached;
        }
      }
      
      console.log(`[LLMTemplateService] Starting template generation for: "${request.description}"`);
      
      // Claude APIでの構造化データ生成
      const claudeResult = await this.callClaudeWithRetry(request);
      
      // テンプレート生成エンジンでの変換
      const generationConfig: GeneratedTemplateConfig = {
        templateData: claudeResult,
        metadata: {
          generatedAt: new Date(),
          generatedBy: 'LLM-Claude',
          version: '2.0.0',
          sourceDescription: request.description
        }
      };
      
      const templateResult = this.templateGenerator.generateTemplate(generationConfig);
      
      if (!templateResult.success) {
        throw new Error(templateResult.error || 'Template generation failed');
      }
      
      const processingTime = Date.now() - startTime;
      
      const response: GenerateTemplateResponse = {
        success: true,
        template: templateResult.template,
        templateCode: request.options?.generateCode ? templateResult.templateCode : undefined,
        templateData: claudeResult,
        metadata: {
          generatedAt: new Date(),
          processingTimeMs: processingTime
        },
        warnings: templateResult.warnings
      };
      
      // キャッシュ保存
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(request);
        this.cache.set(cacheKey, response);
      }
      
      // 履歴保存
      this.addToHistory(requestId, request, response);
      
      console.log(`[LLMTemplateService] Template generation completed in ${processingTime}ms`);
      
      return response;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      const errorResponse: GenerateTemplateResponse = {
        success: false,
        error: error instanceof ClaudeAPIError 
          ? `Claude API Error: ${error.message}`
          : `Generation Error: ${error.message}`,
        metadata: {
          generatedAt: new Date(),
          processingTimeMs: processingTime
        }
      };
      
      this.addToHistory(requestId, request, errorResponse);
      
      console.error(`[LLMTemplateService] Template generation failed:`, error);
      
      return errorResponse;
    }
  }
  
  /**
   * テンプレート改善
   * 既存テンプレートの修正・改善
   */
  async improveTemplate(
    templateName: string,
    userFeedback: string,
    improvementAreas?: string[]
  ): Promise<GenerateTemplateResponse> {
    try {
      const improveResult = await this.claudeClient.improveTemplate(
        templateName,
        userFeedback,
        improvementAreas
      );
      
      // 改善内容を新しいテンプレート生成リクエストに変換
      const improvedDescription = this.buildImprovedDescription(
        templateName,
        userFeedback,
        improveResult
      );
      
      return await this.generateTemplate({
        description: improvedDescription,
        context: {
          existingTemplates: [templateName],
          targetStyle: 'improved'
        },
        options: {
          generateCode: true,
          validateResult: true
        }
      });
      
    } catch (error) {
      return {
        success: false,
        error: `Template improvement failed: ${error.message}`,
        metadata: {
          generatedAt: new Date(),
          processingTimeMs: 0
        }
      };
    }
  }
  
  /**
   * バッチテンプレート生成
   * 複数の説明を一度に処理
   */
  async generateMultipleTemplates(
    descriptions: string[]
  ): Promise<GenerateTemplateResponse[]> {
    const results: GenerateTemplateResponse[] = [];
    
    for (const description of descriptions) {
      const result = await this.generateTemplate({
        description,
        options: {
          generateCode: false,
          validateResult: true
        }
      });
      results.push(result);
      
      // レート制限対応
      await this.delay(1000);
    }
    
    return results;
  }
  
  /**
   * Claude APIのリトライ付き呼び出し
   */
  private async callClaudeWithRetry(
    request: GenerateTemplateRequest
  ): Promise<GenerateLyricTemplateResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          this.claudeClient.generateLyricTemplate(request.description, request.context),
          this.createTimeoutPromise(this.config.timeoutMs)
        ]);
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
          console.log(`[LLMTemplateService] Retry ${attempt} after ${delay}ms delay`);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError || new Error('All retry attempts failed');
  }
  
  /**
   * テンプレートのプレビュー生成
   * 軽量な検証用
   */
  async generatePreview(description: string): Promise<{
    success: boolean;
    preview?: {
      templateName: string;
      animationType: string;
      effects: string[];
      complexity: 'simple' | 'moderate' | 'complex';
    };
    error?: string;
  }> {
    try {
      const primitiveResult = await this.claudeClient.selectPrimitives(description);
      
      const complexity = this.assessComplexity(primitiveResult);
      
      return {
        success: true,
        preview: {
          templateName: `Preview_${Date.now()}`,
          animationType: primitiveResult.primitiveSelection.animation?.type || 'unknown',
          effects: primitiveResult.primitiveSelection.effects?.map(e => e.type) || [],
          complexity
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 生成履歴の取得
   */
  getGenerationHistory(): GenerationHistoryEntry[] {
    return [...this.generationHistory].reverse(); // 最新順
  }
  
  /**
   * 統計情報の取得
   */
  getStatistics(): {
    totalGenerations: number;
    successRate: number;
    averageProcessingTime: number;
    topDescriptions: Array<{ description: string; count: number }>;
  } {
    const total = this.generationHistory.length;
    const successful = this.generationHistory.filter(h => h.success).length;
    const avgTime = this.generationHistory.reduce(
      (sum, h) => sum + (h.response.metadata?.processingTimeMs || 0), 0
    ) / total;
    
    // 説明の頻度分析
    const descriptionCounts = new Map<string, number>();
    this.generationHistory.forEach(h => {
      const desc = h.request.description.toLowerCase();
      descriptionCounts.set(desc, (descriptionCounts.get(desc) || 0) + 1);
    });
    
    const topDescriptions = Array.from(descriptionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([description, count]) => ({ description, count }));
    
    return {
      totalGenerations: total,
      successRate: total > 0 ? successful / total : 0,
      averageProcessingTime: avgTime,
      topDescriptions
    };
  }
  
  /**
   * サービスのヘルスチェック
   */
  async healthCheck(): Promise<{
    claudeAPI: boolean;
    templateGenerator: boolean;
    overall: boolean;
  }> {
    const claudeStatus = await this.claudeClient.healthCheck();
    const generatorStatus = true; // Template generator is always ready
    
    return {
      claudeAPI: claudeStatus,
      templateGenerator: generatorStatus,
      overall: claudeStatus && generatorStatus
    };
  }
  
  /**
   * 設定の更新
   */
  updateConfig(newConfig: Partial<LLMServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.claude) {
      this.claudeClient.updateConfig(newConfig.claude);
    }
  }
  
  /**
   * キャッシュのクリア
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  // Private utility methods
  
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateCacheKey(request: GenerateTemplateRequest): string {
    return `${request.description}_${JSON.stringify(request.context)}_${JSON.stringify(request.options)}`;
  }
  
  private addToHistory(
    id: string,
    request: GenerateTemplateRequest,
    response: GenerateTemplateResponse
  ): void {
    this.generationHistory.push({
      id,
      timestamp: new Date(),
      request,
      response,
      success: response.success
    });
    
    // 履歴の制限（最新100件のみ保持）
    if (this.generationHistory.length > 100) {
      this.generationHistory = this.generationHistory.slice(-100);
    }
  }
  
  private buildImprovedDescription(
    templateName: string,
    userFeedback: string,
    improveResult: any
  ): string {
    return `Improve the "${templateName}" template based on: ${userFeedback}. Focus on: ${improveResult.improvementAreas?.join(', ') || 'general improvements'}`;
  }
  
  private assessComplexity(primitiveResult: any): 'simple' | 'moderate' | 'complex' {
    const effectCount = primitiveResult.primitiveSelection.effects?.length || 0;
    const hasLayout = !!primitiveResult.primitiveSelection.layout;
    const hasAnimation = !!primitiveResult.primitiveSelection.animation;
    
    if (effectCount === 0 && (!hasLayout || !hasAnimation)) {
      return 'simple';
    } else if (effectCount <= 2 && hasLayout && hasAnimation) {
      return 'moderate';
    } else {
      return 'complex';
    }
  }
  
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    });
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}