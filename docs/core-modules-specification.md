# 中核モジュール詳細仕様書

## 1. HierarchicalEngine 仕様

### 1.1 基本設計

```typescript
/**
 * 階層分離システムの中核エンジン
 * 既存Engineと協調し、階層的処理を提供
 */
class HierarchicalEngine {
  // 依存関係
  private existingEngine: Engine;
  private compositionManager: CompositionManager;
  private hierarchyValidator: HierarchyValidator;
  
  // 状態管理
  private isInitialized: boolean = false;
  private performanceMetrics: PerformanceTracker;
  private executionCache: Map<string, CachedResult>;
  
  constructor(dependencies: HierarchicalEngineDependencies) {
    this.compositionManager = dependencies.compositionManager;
    this.hierarchyValidator = dependencies.hierarchyValidator;
    this.performanceMetrics = new PerformanceTracker();
    this.executionCache = new Map();
  }
}
```

### 1.2 初期化プロセス

```typescript
/**
 * 既存Engineとの統合初期化
 */
async initialize(existingEngine: Engine): Promise<InitializationResult> {
  const initSteps = [
    this.validateExistingEngine(existingEngine),
    this.initializeCompositionManager(),
    this.setupHierarchyConstraints(),
    this.createExecutionCache(),
    this.establishMetricsCollection()
  ];
  
  try {
    for (const step of initSteps) {
      const result = await step;
      if (!result.success) {
        throw new InitializationError(`Failed at step: ${step.name}`, result.error);
      }
    }
    
    this.existingEngine = existingEngine;
    this.isInitialized = true;
    
    return {
      success: true,
      initializationTime: this.performanceMetrics.getInitTime(),
      capabilities: this.getSystemCapabilities()
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      fallbackAvailable: true
    };
  }
}
```

### 1.3 階層的処理メインループ

```typescript
/**
 * AnimationInstanceの階層的処理
 */
async processHierarchically(
  instance: AnimationInstance
): Promise<HierarchicalResult> {
  
  // 前処理
  const preprocessResult = this.preprocessInstance(instance);
  if (!preprocessResult.canProcess) {
    return this.createFallbackResult(preprocessResult.reason);
  }
  
  // キャッシュチェック
  const cacheKey = this.generateCacheKey(instance);
  const cached = this.executionCache.get(cacheKey);
  if (cached && this.isCacheValid(cached)) {
    return this.createCachedResult(cached);
  }
  
  // 階層的実行
  const hierarchicalData = this.convertToHierarchicalData(instance);
  
  try {
    // Phase 1: フレーズレベル処理
    const phraseResult = await this.processPhraseLevel({
      data: hierarchicalData.phrase,
      container: instance.container,
      timing: hierarchicalData.timing.phrase,
      parameters: hierarchicalData.parameters.phrase
    });
    
    // Phase 2: 単語レベル処理
    const wordResults = await this.processWordLevel({
      data: hierarchicalData.words,
      phraseResult: phraseResult,
      container: instance.container,
      timing: hierarchicalData.timing.words,
      parameters: hierarchicalData.parameters.words
    });
    
    // Phase 3: 文字レベル処理
    const characterResults = await this.processCharacterLevel({
      data: hierarchicalData.characters,
      wordResults: wordResults,
      container: instance.container,
      timing: hierarchicalData.timing.characters,
      parameters: hierarchicalData.parameters.characters
    });
    
    // 結果合成
    const composedResult = await this.composeResults({
      phrase: phraseResult,
      words: wordResults,
      characters: characterResults
    });
    
    // キャッシュ保存
    this.executionCache.set(cacheKey, {
      result: composedResult,
      timestamp: Date.now(),
      metrics: this.performanceMetrics.getCurrentMetrics()
    });
    
    return composedResult;
    
  } catch (error) {
    // エラーログとフォールバック準備
    console.error('HierarchicalEngine processing failed:', error);
    return this.createErrorResult(error, instance);
  }
}
```

### 1.4 フレーズレベル処理

```typescript
/**
 * フレーズレベルの処理実行
 */
async processPhraseLevel(data: PhraseProcessingData): Promise<PhraseResult> {
  // 責任検証
  const validationResult = this.hierarchyValidator.validatePhraseLevel(data);
  if (!validationResult.valid) {
    throw new HierarchyViolationError('Phrase level validation failed', validationResult.violations);
  }
  
  // プリミティブ組み合わせの決定
  const compositionStrategy = this.compositionManager.composeForPhraseLevel(
    data.parameters.templateType,
    data.data
  );
  
  // 処理実行
  const executionContext = {
    strategy: compositionStrategy,
    data: data.data,
    container: data.container,
    timing: data.timing,
    parameters: data.parameters
  };
  
  // 実際の処理実行
  const result = await this.executePhraseLevelProcessing(executionContext);
  
  // 結果検証
  const resultValidation = this.hierarchyValidator.validatePhraseResult(result);
  if (!resultValidation.valid) {
    console.warn('Phrase result validation warnings:', resultValidation.warnings);
  }
  
  return {
    success: true,
    position: result.position,
    layout: result.layout,
    effects: result.effects,
    metadata: {
      executionTime: result.executionTime,
      primitivesUsed: result.primitivesUsed,
      validationWarnings: resultValidation.warnings
    }
  };
}
```

### 1.5 エラーハンドリングと回復

```typescript
/**
 * エラー時の安全な回復処理
 */
private createErrorResult(error: Error, instance: AnimationInstance): HierarchicalResult {
  // エラー分類
  const errorType = this.classifyError(error);
  
  switch (errorType) {
    case 'CONSTRAINT_VIOLATION':
      // 制約違反: 修正可能な場合は自動修正
      return this.attemptConstraintCorrection(error, instance);
      
    case 'PRIMITIVE_ERROR':
      // プリミティブエラー: フォールバックプリミティブで再試行
      return this.attemptPrimitiveFallback(error, instance);
      
    case 'SYSTEM_ERROR':
      // システムエラー: 完全フォールバックが必要
      return this.createFallbackResult('System error occurred');
      
    default:
      // 未知のエラー: 安全な状態で停止
      return this.createSafeFailureResult(error);
  }
}

/**
 * 制約違反の自動修正試行
 */
private attemptConstraintCorrection(
  error: ConstraintViolationError, 
  instance: AnimationInstance
): HierarchicalResult {
  
  const correctionStrategies = [
    this.correctResponsibilityViolation.bind(this),
    this.correctTimingViolation.bind(this),
    this.correctParameterViolation.bind(this)
  ];
  
  for (const strategy of correctionStrategies) {
    try {
      const correctedResult = strategy(error, instance);
      if (correctedResult.success) {
        console.warn(`Auto-corrected constraint violation: ${error.message}`);
        return correctedResult;
      }
    } catch (correctionError) {
      // 修正失敗は続行
      console.warn(`Correction strategy failed: ${correctionError.message}`);
    }
  }
  
  // 全修正戦略が失敗
  return this.createFallbackResult('Constraint correction failed');
}
```

## 2. CompositionManager 仕様

### 2.1 基本設計

```typescript
/**
 * プリミティブ組み合わせ管理システム
 */
class CompositionManager {
  // プリミティブレジストリ
  private primitiveRegistry: PrimitiveRegistry;
  
  // 組み合わせ戦略
  private compositionStrategies: Map<string, CompositionStrategy>;
  
  // パフォーマンス最適化
  private optimizationCache: Map<string, OptimizedComposition>;
  
  // 学習機能
  private performanceLearner: PerformanceLearner;
  
  constructor(dependencies: CompositionManagerDependencies) {
    this.primitiveRegistry = dependencies.primitiveRegistry;
    this.compositionStrategies = new Map();
    this.optimizationCache = new Map();
    this.performanceLearner = new PerformanceLearner();
    
    this.initializeStrategies();
  }
}
```

### 2.2 テンプレート別組み合わせ戦略

```typescript
/**
 * テンプレートタイプに応じた組み合わせ戦略選択
 */
composeForTemplate(
  templateType: TemplateType,
  hierarchyLevel: HierarchyLevel
): CompositionStrategy {
  
  const strategyKey = `${templateType}-${hierarchyLevel}`;
  
  // キャッシュされた戦略があるかチェック
  let strategy = this.compositionStrategies.get(strategyKey);
  
  if (!strategy) {
    // 戦略を動的生成
    strategy = this.generateCompositionStrategy(templateType, hierarchyLevel);
    this.compositionStrategies.set(strategyKey, strategy);
  }
  
  // パフォーマンス学習による最適化
  const optimizedStrategy = this.performanceLearner.optimizeStrategy(strategy);
  
  return optimizedStrategy;
}

/**
 * 組み合わせ戦略の動的生成
 */
private generateCompositionStrategy(
  templateType: TemplateType,
  hierarchyLevel: HierarchyLevel
): CompositionStrategy {
  
  switch (templateType) {
    case 'WordSlideTextPrimitive':
      return this.createWordSlideStrategy(hierarchyLevel);
      
    case 'GlitchTextPrimitive':
      return this.createGlitchStrategy(hierarchyLevel);
      
    case 'FlickerFadeTextPrimitive':
      return this.createFlickerFadeStrategy(hierarchyLevel);
      
    case 'FadeBlurRandomTextPrimitive':
      return this.createFadeBlurRandomStrategy(hierarchyLevel);
      
    default:
      return this.createGenericStrategy(hierarchyLevel);
  }
}

/**
 * WordSlideTextPrimitive用戦略
 */
private createWordSlideStrategy(hierarchyLevel: HierarchyLevel): CompositionStrategy {
  switch (hierarchyLevel) {
    case 'phrase':
      return {
        primitives: [
          { type: 'SingleLinePhraseLayoutPrimitive', priority: 1 },
          { type: 'PhrasePositionPrimitive', priority: 2 }
        ],
        execution: 'sequential',
        optimization: 'position-caching'
      };
      
    case 'word':
      return {
        primitives: [
          { type: 'SlideAnimationPrimitive', priority: 1 },
          { type: 'WordSpacingPrimitive', priority: 2 }
        ],
        execution: 'parallel',
        optimization: 'batch-processing'
      };
      
    case 'character':
      return {
        primitives: [
          { type: 'BaseCharacterRenderingPrimitive', priority: 1 },
          { type: 'GlowEffectPrimitive', priority: 2 },
          { type: 'ColorTransitionPrimitive', priority: 3 }
        ],
        execution: 'pipeline',
        optimization: 'object-pooling'
      };
  }
}
```

### 2.3 実行最適化

```typescript
/**
 * 組み合わせ実行の最適化
 */
async executeComposition(
  strategy: CompositionStrategy,
  data: ProcessingData
): Promise<CompositionResult> {
  
  // 最適化されたキャッシュをチェック
  const cacheKey = this.generateOptimizationKey(strategy, data);
  const cached = this.optimizationCache.get(cacheKey);
  
  if (cached && this.isCacheValid(cached)) {
    return this.applyCachedComposition(cached, data);
  }
  
  // 実行戦略に応じた処理
  let result: CompositionResult;
  
  switch (strategy.execution) {
    case 'sequential':
      result = await this.executeSequential(strategy, data);
      break;
      
    case 'parallel':
      result = await this.executeParallel(strategy, data);
      break;
      
    case 'pipeline':
      result = await this.executePipeline(strategy, data);
      break;
      
    default:
      throw new CompositionError(`Unknown execution type: ${strategy.execution}`);
  }
  
  // 最適化情報をキャッシュ
  this.optimizationCache.set(cacheKey, {
    result: result,
    timestamp: Date.now(),
    metrics: result.metrics
  });
  
  // パフォーマンス学習
  this.performanceLearner.recordExecution(strategy, result.metrics);
  
  return result;
}

/**
 * 並列実行最適化
 */
private async executeParallel(
  strategy: CompositionStrategy,
  data: ProcessingData
): Promise<CompositionResult> {
  
  // 並列実行可能なプリミティブをグループ化
  const parallelGroups = this.groupForParallelExecution(strategy.primitives);
  
  const results = [];
  
  for (const group of parallelGroups) {
    // グループ内は並列実行
    const groupPromises = group.map(primitive => 
      this.executeSinglePrimitive(primitive, data)
    );
    
    const groupResults = await Promise.all(groupPromises);
    results.push(...groupResults);
  }
  
  // 結果を組み合わせ
  return this.combineResults(results, strategy);
}
```

## 3. HierarchyValidator 仕様

### 3.1 基本設計

```typescript
/**
 * 階層制約の検証・強制システム
 */
class HierarchyValidator {
  // 制約定義
  private constraintRules: HierarchyConstraintRules;
  
  // 違反検出
  private violationDetector: ViolationDetector;
  
  // 自動修正
  private autoCorrector: AutoCorrector;
  
  // 開発支援
  private developmentHelper: DevelopmentHelper;
  
  constructor(dependencies: HierarchyValidatorDependencies) {
    this.constraintRules = dependencies.constraintRules;
    this.violationDetector = new ViolationDetector(this.constraintRules);
    this.autoCorrector = new AutoCorrector();
    this.developmentHelper = new DevelopmentHelper();
  }
}
```

### 3.2 階層制約定義

```typescript
/**
 * 階層制約ルールの定義
 */
interface HierarchyConstraintRules {
  // Character Level制約
  character: {
    // 許可された操作
    allowedOperations: ['render', 'applyEffects', 'updateStyle'];
    
    // 禁止された操作
    forbiddenOperations: ['position', 'layout', 'hierarchyManagement'];
    
    // 必須責任
    requiredResponsibilities: ['textRendering'];
    
    // データアクセス制限
    accessRestrictions: {
      canRead: ['characterData', 'styleData', 'effectData'];
      cannotRead: ['wordLayoutData', 'phrasePositionData'];
      canWrite: ['renderState', 'effectState'];
      cannotWrite: ['position', 'hierarchy'];
    };
  };
  
  // Word Level制約
  word: {
    allowedOperations: ['layout', 'spacing', 'grouping', 'animation'];
    forbiddenOperations: ['render', 'textDrawing', 'phrasePosition'];
    requiredResponsibilities: ['characterGrouping', 'wordSpacing'];
    accessRestrictions: {
      canRead: ['wordData', 'characterData', 'animationData'];
      cannotRead: ['renderingDetails', 'effectImplementation'];
      canWrite: ['characterPositions', 'animationState'];
      cannotWrite: ['textContent', 'renderingState'];
    };
  };
  
  // Phrase Level制約
  phrase: {
    allowedOperations: ['position', 'globalLayout', 'phraseEffects'];
    forbiddenOperations: ['characterRender', 'textDrawing', 'wordDetails'];
    requiredResponsibilities: ['screenPositioning', 'globalEffects'];
    accessRestrictions: {
      canRead: ['phraseData', 'screenData', 'globalParams'];
      cannotRead: ['characterDetails', 'wordInternals'];
      canWrite: ['phrasePosition', 'globalState'];
      cannotWrite: ['characterState', 'wordState'];
    };
  };
}
```

### 3.3 違反検出システム

```typescript
/**
 * 制約違反の検出
 */
validateHierarchy(data: HierarchicalData): ValidationResult {
  const violations: ConstraintViolation[] = [];
  
  // Character Level違反検出
  const characterViolations = this.validateCharacterLevel(data.characters);
  violations.push(...characterViolations);
  
  // Word Level違反検出  
  const wordViolations = this.validateWordLevel(data.words);
  violations.push(...wordViolations);
  
  // Phrase Level違反検出
  const phraseViolations = this.validatePhraseLevel(data.phrase);
  violations.push(...phraseViolations);
  
  // 階層間関係違反検出
  const relationViolations = this.validateHierarchyRelations(data);
  violations.push(...relationViolations);
  
  return {
    valid: violations.length === 0,
    violations: violations,
    severity: this.calculateViolationSeverity(violations),
    autoCorrectible: violations.filter(v => v.autoCorrectible).length,
    recommendations: this.generateRecommendations(violations)
  };
}

/**
 * 責任境界違反の検出
 */
validateResponsibility(
  level: HierarchyLevel,
  operation: Operation
): ValidationResult {
  
  const rules = this.constraintRules[level];
  const violations: ResponsibilityViolation[] = [];
  
  // 禁止操作チェック
  if (rules.forbiddenOperations.includes(operation.type)) {
    violations.push({
      type: 'FORBIDDEN_OPERATION',
      level: level,
      operation: operation.type,
      severity: 'HIGH',
      message: `${level} level should not perform ${operation.type}`,
      autoCorrectible: this.canAutoCorrect(level, operation),
      suggestion: this.generateSuggestion(level, operation)
    });
  }
  
  // データアクセス違反チェック
  const dataViolations = this.validateDataAccess(level, operation.dataAccess);
  violations.push(...dataViolations);
  
  // 必須責任チェック
  const responsibilityViolations = this.validateRequiredResponsibilities(level, operation);
  violations.push(...responsibilityViolations);
  
  return {
    valid: violations.length === 0,
    violations: violations,
    severity: this.calculateSeverity(violations)
  };
}
```

### 3.4 自動修正機能

```typescript
/**
 * 制約違反の自動修正
 */
enforceConstraints(violation: ConstraintViolation): EnforcementResult {
  if (!violation.autoCorrectible) {
    return {
      success: false,
      reason: 'Violation cannot be auto-corrected',
      manualAction: violation.suggestion
    };
  }
  
  switch (violation.type) {
    case 'RESPONSIBILITY_VIOLATION':
      return this.correctResponsibilityViolation(violation);
      
    case 'DATA_ACCESS_VIOLATION':
      return this.correctDataAccessViolation(violation);
      
    case 'OPERATION_VIOLATION':
      return this.correctOperationViolation(violation);
      
    default:
      return this.attemptGenericCorrection(violation);
  }
}

/**
 * 責任違反の修正
 */
private correctResponsibilityViolation(
  violation: ResponsibilityViolation
): EnforcementResult {
  
  // 操作を適切な階層にリダイレクト
  const correctLevel = this.findCorrectLevel(violation.operation);
  
  if (correctLevel) {
    return {
      success: true,
      correction: 'REDIRECT_TO_CORRECT_LEVEL',
      details: {
        from: violation.level,
        to: correctLevel,
        operation: violation.operation
      },
      impact: 'LOW' // 透明な修正
    };
  }
  
  // 操作の分解が必要
  const decomposition = this.decomposeOperation(violation.operation);
  
  if (decomposition.possible) {
    return {
      success: true,
      correction: 'DECOMPOSE_OPERATION',
      details: decomposition.plan,
      impact: 'MEDIUM' // 処理の変更
    };
  }
  
  // 修正不可能
  return {
    success: false,
    reason: 'Operation cannot be corrected automatically',
    manualAction: 'Redesign the operation to respect hierarchy boundaries'
  };
}
```

### 3.5 開発支援機能

```typescript
/**
 * 開発者向け違反レポート生成
 */
generateViolationReport(context: ValidationContext): ViolationReport {
  const violations = this.detectAllViolations(context);
  
  return {
    summary: {
      totalViolations: violations.length,
      highSeverity: violations.filter(v => v.severity === 'HIGH').length,
      autoCorrectible: violations.filter(v => v.autoCorrectible).length
    },
    
    violationsByType: this.groupViolationsByType(violations),
    
    violationsByLevel: {
      character: violations.filter(v => v.level === 'character'),
      word: violations.filter(v => v.level === 'word'),
      phrase: violations.filter(v => v.level === 'phrase')
    },
    
    recommendations: this.generateDetailedRecommendations(violations),
    
    codeExamples: this.generateCorrectionExamples(violations),
    
    learnMore: {
      documentationLinks: this.getRelevantDocumentation(violations),
      bestPractices: this.getBestPractices(violations)
    }
  };
}

/**
 * インタラクティブなガイダンス
 */
provideInteractiveGuidance(violation: ConstraintViolation): InteractiveGuidance {
  return {
    explanation: this.explainViolation(violation),
    
    visualDiagram: this.createHierarchyDiagram(violation),
    
    stepByStepFix: [
      {
        step: 1,
        description: 'Identify the correct hierarchy level',
        code: this.generateStepCode(violation, 1),
        explanation: 'This operation belongs to...'
      },
      {
        step: 2,
        description: 'Move the operation to the correct level',
        code: this.generateStepCode(violation, 2),
        explanation: 'Refactor the code to...'
      }
    ],
    
    interactiveTools: {
      hierarchyVisualizer: true,
      codeChecker: true,
      autoFixer: violation.autoCorrectible
    }
  };
}
```

## 4. モジュール間連携詳細

### 4.1 データ交換インターフェース

```typescript
/**
 * モジュール間データ交換の標準インターフェース
 */
interface InterModuleData {
  // データペイロード
  payload: any;
  
  // メタデータ
  metadata: {
    sourceModule: string;
    targetModule: string;
    timestamp: number;
    version: string;
  };
  
  // 検証情報
  validation: {
    checksum: string;
    schema: string;
    validated: boolean;
  };
  
  // 処理情報
  processing: {
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    timeout: number;
    retryPolicy: RetryPolicy;
  };
}
```

### 4.2 エラー伝播機構

```typescript
/**
 * モジュール間エラー伝播の管理
 */
class InterModuleErrorHandler {
  
  /**
   * エラーの階層的伝播
   */
  propagateError(
    error: ModuleError,
    sourceModule: string,
    targetModules: string[]
  ): ErrorPropagationResult {
    
    const propagationPlan = this.createPropagationPlan(error, targetModules);
    
    const results = targetModules.map(target => {
      const adaptedError = this.adaptErrorForTarget(error, target);
      return this.sendErrorToModule(adaptedError, target);
    });
    
    return {
      success: results.every(r => r.success),
      results: results,
      fallbackRequired: results.some(r => r.requiresFallback)
    };
  }
}
```

この中核モジュール設計により、既存システムとの協調を保ちながら、段階的に階層分離機能を統合できます。