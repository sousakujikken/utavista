/**
 * LLMテンプレート生成システム v2.0
 * エンドツーエンドMVPプロトタイプ
 */

// Core LLM Service
export { 
  LLMTemplateService,
  type LLMServiceConfig,
  type GenerateTemplateRequest,
  type GenerateTemplateResponse,
  type GenerationHistoryEntry
} from './LLMTemplateService';

// Claude API Integration
export {
  ClaudeAPIClient,
  ClaudeAPIError,
  type ClaudeAPIConfig
} from './ClaudeAPIClient';

// Template Generation Engine
export {
  TemplateGenerator,
  type GeneratedTemplateConfig,
  type TemplateGenerationResult
} from './TemplateGenerator';

// Function Schemas
export {
  claudeFunctionSchemas,
  type GenerateLyricTemplateResult,
  type ImproveTemplateResult,
  type AnalyzeAnimationResult,
  type SelectPrimitivesResult
} from './claudeFunctionSchemas';

// Utility Functions and Constants
export const LLM_SYSTEM_VERSION = '2.0.0';
export const SUPPORTED_CLAUDE_MODELS = [
  'claude-3-sonnet-20240229',
  'claude-3-opus-20240229', 
  'claude-3-haiku-20240307'
] as const;

/**
 * デフォルト設定
 */
export const DEFAULT_LLM_CONFIG: LLMServiceConfig = {
  claude: {
    apiKey: '', // 実際の使用時に設定
    model: 'claude-3-sonnet-20240229',
    maxTokens: 4096,
    temperature: 0.7
  },
  enableCache: true,
  maxRetries: 3,
  timeoutMs: 30000
};

/**
 * MVPプロトタイプのクイックスタート関数
 * 最小限の設定で即座にテスト可能
 */
export function createMVPService(apiKey: string): LLMTemplateService {
  const config: LLMServiceConfig = {
    ...DEFAULT_LLM_CONFIG,
    claude: {
      ...DEFAULT_LLM_CONFIG.claude,
      apiKey
    }
  };
  
  return new LLMTemplateService(config);
}

/**
 * サンプル使用例
 */
export const SAMPLE_DESCRIPTIONS = [
  "文字が左からスライドインして光る",
  "文字が弾んで現れて、順番に色が変わる", 
  "文字がフェードインしながら上から落ちてくる",
  "文字が回転しながら中央に集まって光る",
  "文字が波のように動いて消えていく"
] as const;

/**
 * テスト用のモック設定
 */
export const MOCK_LLM_CONFIG: LLMServiceConfig = {
  claude: {
    apiKey: 'mock-api-key',
    model: 'claude-3-sonnet-20240229',
    maxTokens: 2048,
    temperature: 0.5
  },
  enableCache: false,
  maxRetries: 1,
  timeoutMs: 5000
};

/**
 * LLMサービスの初期化ヘルパー
 */
export async function initializeLLMService(
  apiKey: string,
  options?: {
    model?: string;
    enableCache?: boolean;
    timeout?: number;
  }
): Promise<{
  service: LLMTemplateService;
  healthy: boolean;
  error?: string;
}> {
  try {
    const config: LLMServiceConfig = {
      claude: {
        apiKey,
        model: options?.model || 'claude-3-sonnet-20240229',
        maxTokens: 4096,
        temperature: 0.7
      },
      enableCache: options?.enableCache ?? true,
      maxRetries: 3,
      timeoutMs: options?.timeout || 30000
    };
    
    const service = new LLMTemplateService(config);
    const healthCheck = await service.healthCheck();
    
    return {
      service,
      healthy: healthCheck.overall,
      error: healthCheck.overall ? undefined : 'Service health check failed'
    };
    
  } catch (error) {
    return {
      service: new LLMTemplateService(MOCK_LLM_CONFIG), // フォールバック
      healthy: false,
      error: error.message
    };
  }
}

/**
 * デバッグ用のログ設定
 */
export function enableLLMDebugLogging(): void {
  if (typeof window !== 'undefined') {
    (window as any).__LLM_DEBUG__ = true;
  }
}

export function disableLLMDebugLogging(): void {
  if (typeof window !== 'undefined') {
    (window as any).__LLM_DEBUG__ = false;
  }
}

/**
 * LLMシステムの機能概要
 */
export const LLM_SYSTEM_FEATURES = {
  naturalLanguageInput: 'Claude APIによる自然言語理解',
  structuredOutput: 'Function Callingによる構造化データ出力',
  cooperativePrimitives: 'WordSlideText成功パターンを継承した協調的プリミティブ',
  templateGeneration: '動的IAnimationTemplate生成',
  codeGeneration: 'TypeScriptテンプレートコード生成',
  errorHandling: '包括的エラーハンドリングとリトライ機構',
  caching: 'インテリジェントキャッシュシステム',
  history: '生成履歴と統計分析',
  mvpReady: '3週間以内MVP実装完了'
} as const;

/**
 * システム状態の取得
 */
export function getLLMSystemInfo(): {
  version: string;
  features: typeof LLM_SYSTEM_FEATURES;
  supportedModels: typeof SUPPORTED_CLAUDE_MODELS;
  sampleDescriptions: typeof SAMPLE_DESCRIPTIONS;
} {
  return {
    version: LLM_SYSTEM_VERSION,
    features: LLM_SYSTEM_FEATURES,
    supportedModels: SUPPORTED_CLAUDE_MODELS,
    sampleDescriptions: SAMPLE_DESCRIPTIONS
  };
}