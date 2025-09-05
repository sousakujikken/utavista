/**
 * Claude API クライアント
 * Function Calling統合システム
 */

import { 
  claudeFunctionSchemas, 
  GenerateLyricTemplateResult,
  ImproveTemplateResult,
  AnalyzeAnimationResult,
  SelectPrimitivesResult
} from './claudeFunctionSchemas';

/**
 * Claude API 設定
 */
export interface ClaudeAPIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

/**
 * Claude API レスポンス型
 */
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
}

interface ClaudeAPIResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude API エラー型
 */
export class ClaudeAPIError extends Error {
  public statusCode?: number;
  public response?: any;
  
  constructor(message: string, statusCode?: number, response?: any) {
    super(message);
    this.name = 'ClaudeAPIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Claude API クライアント実装
 */
export class ClaudeAPIClient {
  private config: ClaudeAPIConfig;
  private baseURL = 'https://api.anthropic.com/v1/messages';
  
  constructor(config: ClaudeAPIConfig) {
    this.config = config;
  }
  
  /**
   * テンプレート生成リクエスト
   */
  async generateLyricTemplate(
    naturalLanguageDescription: string,
    context?: {
      existingTemplates?: string[];
      targetStyle?: string;
      performance?: 'fast' | 'balanced' | 'quality';
    }
  ): Promise<GenerateLyricTemplateResult> {
    const systemPrompt = this.buildSystemPrompt('generate');
    const userPrompt = this.buildGenerateTemplatePrompt(naturalLanguageDescription, context);
    
    const response = await this.makeAPICall([
      { role: 'user', content: userPrompt }
    ], [claudeFunctionSchemas.generateLyricTemplate], systemPrompt);
    
    const toolUse = this.extractToolUse(response, 'generate_lyric_template');
    return toolUse.input as GenerateLyricTemplateResult;
  }
  
  /**
   * テンプレート改善リクエスト
   */
  async improveTemplate(
    templateName: string,
    userFeedback: string,
    improvementAreas?: string[]
  ): Promise<ImproveTemplateResult> {
    const systemPrompt = this.buildSystemPrompt('improve');
    const userPrompt = this.buildImproveTemplatePrompt(templateName, userFeedback, improvementAreas);
    
    const response = await this.makeAPICall([
      { role: 'user', content: userPrompt }
    ], [claudeFunctionSchemas.improveTemplate], systemPrompt);
    
    const toolUse = this.extractToolUse(response, 'improve_template');
    return toolUse.input as ImproveTemplateResult;
  }
  
  /**
   * アニメーション分析リクエスト
   */
  async analyzeAnimation(
    templateName: string,
    analysisType: 'structure' | 'parameters' | 'performance' | 'visual-effects' | 'timing',
    detailLevel: 'summary' | 'detailed' | 'technical' = 'detailed'
  ): Promise<AnalyzeAnimationResult> {
    const systemPrompt = this.buildSystemPrompt('analyze');
    const userPrompt = this.buildAnalyzeAnimationPrompt(templateName, analysisType, detailLevel);
    
    const response = await this.makeAPICall([
      { role: 'user', content: userPrompt }
    ], [claudeFunctionSchemas.analyzeAnimation], systemPrompt);
    
    const toolUse = this.extractToolUse(response, 'analyze_animation');
    return toolUse.input as AnalyzeAnimationResult;
  }
  
  /**
   * プリミティブ選択リクエスト
   */
  async selectPrimitives(description: string): Promise<SelectPrimitivesResult> {
    const systemPrompt = this.buildSystemPrompt('select');
    const userPrompt = this.buildSelectPrimitivesPrompt(description);
    
    const response = await this.makeAPICall([
      { role: 'user', content: userPrompt }
    ], [claudeFunctionSchemas.selectPrimitives], systemPrompt);
    
    const toolUse = this.extractToolUse(response, 'select_primitives');
    return toolUse.input as SelectPrimitivesResult;
  }
  
  /**
   * Claude API への HTTP リクエスト
   */
  private async makeAPICall(
    messages: ClaudeMessage[],
    tools: any[],
    systemPrompt: string
  ): Promise<ClaudeAPIResponse> {
    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: systemPrompt,
          messages: messages,
          tools: tools
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ClaudeAPIError(
          `Claude API request failed: ${response.status} ${response.statusText}`,
          response.status,
          errorData
        );
      }
      
      const data = await response.json();
      return data as ClaudeAPIResponse;
      
    } catch (error) {
      if (error instanceof ClaudeAPIError) {
        throw error;
      }
      throw new ClaudeAPIError(`Network error: ${error.message}`);
    }
  }
  
  /**
   * システムプロンプトの構築
   */
  private buildSystemPrompt(mode: 'generate' | 'improve' | 'analyze' | 'select'): string {
    const basePrompt = `You are an expert in lyric animation template generation for UTAVISTA v0.4.3. You understand the cooperative hierarchy control system where:

- Phrase containers handle overall positioning, effects, and filters
- Word containers manage character layout using cumulative positioning  
- Character containers render actual text

Key principles:
1. Use cooperative primitives that inherit from WordSlideText success patterns
2. Ensure stable character positioning with cumulative offsets
3. Apply physics-based animations with proper speed calculations
4. Manage PIXI.js filters efficiently with proper filter areas
5. Follow the three-level hierarchy strictly`;

    switch (mode) {
      case 'generate':
        return `${basePrompt}

Your task is to generate complete animation templates based on natural language descriptions. Use the generate_lyric_template function to create structured data that will be used to generate actual IAnimationTemplate code.

Focus on:
- Translating creative descriptions into technical parameters
- Selecting appropriate primitive combinations
- Ensuring performance and visual quality
- Following UTAVISTA's parameter conventions`;

      case 'improve':
        return `${basePrompt}

Your task is to improve existing templates based on user feedback. Use the improve_template function to specify modifications that enhance the animation while maintaining stability.

Focus on:
- Understanding user intent from feedback
- Identifying specific areas for improvement
- Suggesting targeted parameter adjustments
- Maintaining template performance`;

      case 'analyze':
        return `${basePrompt}

Your task is to analyze existing animation templates and explain their structure, behavior, and characteristics. Use the analyze_animation function to provide insights.

Focus on:
- Breaking down template complexity
- Explaining animation mechanics
- Identifying optimization opportunities
- Providing educational explanations`;

      case 'select':
        return `${basePrompt}

Your task is to select appropriate primitives for animation descriptions. Use the select_primitives function to map natural language to primitive combinations.

Focus on:
- Understanding animation intent
- Mapping to available primitives
- Estimating implementation complexity
- Providing confidence assessments`;

      default:
        return basePrompt;
    }
  }
  
  /**
   * テンプレート生成プロンプトの構築
   */
  private buildGenerateTemplatePrompt(
    description: string,
    context?: {
      existingTemplates?: string[];
      targetStyle?: string;
      performance?: 'fast' | 'balanced' | 'quality';
    }
  ): string {
    let prompt = `Generate a lyric animation template based on this description:

"${description}"`;

    if (context) {
      if (context.existingTemplates?.length) {
        prompt += `\n\nExisting templates to consider: ${context.existingTemplates.join(', ')}`;
      }
      if (context.targetStyle) {
        prompt += `\nDesired style: ${context.targetStyle}`;
      }
      if (context.performance) {
        prompt += `\nPerformance target: ${context.performance}`;
      }
    }

    prompt += `\n\nCreate a template that:
1. Uses cooperative hierarchy control
2. Implements smooth, physics-based animations
3. Applies visual effects appropriately
4. Maintains good performance
5. Follows UTAVISTA conventions

Use the generate_lyric_template function to provide the structured specification.`;

    return prompt;
  }
  
  /**
   * テンプレート改善プロンプトの構築
   */
  private buildImproveTemplatePrompt(
    templateName: string,
    userFeedback: string,
    improvementAreas?: string[]
  ): string {
    let prompt = `Improve the "${templateName}" template based on this feedback:

"${userFeedback}"`;

    if (improvementAreas?.length) {
      prompt += `\n\nFocus on these areas: ${improvementAreas.join(', ')}`;
    }

    prompt += `\n\nAnalyze the feedback and provide specific improvements using the improve_template function.`;

    return prompt;
  }
  
  /**
   * アニメーション分析プロンプトの構築
   */
  private buildAnalyzeAnimationPrompt(
    templateName: string,
    analysisType: string,
    detailLevel: string
  ): string {
    return `Analyze the "${templateName}" template with focus on ${analysisType}.

Provide a ${detailLevel} analysis covering:
- How the animation works
- Key parameters and their effects
- Performance characteristics
- Potential improvements

Use the analyze_animation function to structure your analysis.`;
  }
  
  /**
   * プリミティブ選択プロンプトの構築
   */
  private buildSelectPrimitivesPrompt(description: string): string {
    return `Select appropriate primitives for this animation description:

"${description}"

Available primitives:
- Layout: cumulative (character positioning), grid, circular
- Animation: slide (physics-based), fade, reveal, bounce  
- Effects: glow (AdvancedBloom), shadow, blur

Use the select_primitives function to map the description to primitive combinations with confidence assessment.`;
  }
  
  /**
   * Tool Use結果の抽出
   */
  private extractToolUse(response: ClaudeAPIResponse, expectedToolName: string): any {
    const toolUse = response.content.find(
      item => item.type === 'tool_use' && item.name === expectedToolName
    );
    
    if (!toolUse) {
      throw new ClaudeAPIError(`Expected tool use '${expectedToolName}' not found in response`);
    }
    
    return toolUse;
  }
  
  /**
   * 設定の更新
   */
  updateConfig(newConfig: Partial<ClaudeAPIConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.selectPrimitives('simple test');
      return true;
    } catch {
      return false;
    }
  }
}