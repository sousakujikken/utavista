# 統合モジュール詳細仕様書

## 1. CompatibilityBridge 仕様

### 1.1 基本設計

```typescript
/**
 * 既存システムと新階層システムの橋渡し
 * AnimationInstanceとHierarchicalEngineの完全互換性を提供
 */
class CompatibilityBridge {
  // データ変換エンジン
  private dataConverter: DataConverter;
  
  // 呼び出し変換エンジン
  private callConverter: CallConverter;
  
  // パラメータマッピング
  private parameterMapper: ParameterMapper;
  
  // 互換性レベル監視
  private compatibilityMonitor: CompatibilityMonitor;
  
  constructor(dependencies: CompatibilityBridgeDependencies) {
    this.dataConverter = new DataConverter();
    this.callConverter = new CallConverter();
    this.parameterMapper = new ParameterMapper();
    this.compatibilityMonitor = new CompatibilityMonitor();
  }
}
```

### 1.2 AnimationInstance統合

```typescript
/**
 * AnimationInstance.update()からの呼び出し橋渡し
 */
async bridgeAnimationInstanceCall(
  instance: AnimationInstance,
  hierarchicalEngine: HierarchicalEngine
): Promise<BridgeResult> {
  
  // 前処理: インスタンス状態の検証
  const validationResult = this.validateInstanceState(instance);
  if (!validationResult.valid) {
    return this.createValidationFailureResult(validationResult);
  }
  
  // データ変換: Legacy → Hierarchical
  const hierarchicalData = await this.convertLegacyToHierarchical({
    instance: instance,
    template: instance.template,
    params: instance.params,
    timing: {
      current: Date.now(),
      start: instance.startMs,
      end: instance.endMs
    }
  });
  
  // 階層システムでの実行
  let hierarchicalResult: HierarchicalResult;
  
  try {
    hierarchicalResult = await hierarchicalEngine.processHierarchically(instance);
    
    // 成功時のメトリクス記録
    this.compatibilityMonitor.recordSuccessfulExecution({
      instance: instance,
      executionTime: hierarchicalResult.metadata.executionTime,
      hierarchyLevelsUsed: hierarchicalResult.metadata.hierarchyLevelsUsed
    });
    
  } catch (error) {
    // 階層システムエラー時の処理
    const fallbackResult = await this.handleHierarchicalFailure(error, instance);
    return fallbackResult;
  }
  
  // データ変換: Hierarchical → Legacy
  const legacyResult = this.convertHierarchicalToLegacy(hierarchicalResult, instance);
  
  // 結果の適用
  const applicationResult = this.applyResultToInstance(legacyResult, instance);
  
  return {
    success: true,
    executionMode: 'hierarchical',
    result: legacyResult,
    metadata: {
      hierarchicalMetadata: hierarchicalResult.metadata,
      bridgeMetadata: {
        conversionTime: this.dataConverter.getLastConversionTime(),
        compatibilityLevel: this.compatibilityMonitor.getCurrentLevel()
      }
    }
  };
}
```

### 1.3 データ変換システム

```typescript
/**
 * レガシーデータから階層データへの変換
 */
async convertLegacyToHierarchical(legacyData: LegacyData): Promise<HierarchicalData> {
  
  // テンプレート別変換戦略の選択
  const conversionStrategy = this.selectConversionStrategy(legacyData.template);
  
  // 基本データ構造の変換
  const baseConversion = await this.performBaseConversion(legacyData, conversionStrategy);
  
  // 階層別データの構築
  const hierarchicalStructure = await this.buildHierarchicalStructure(
    baseConversion,
    legacyData
  );
  
  // パラメータの階層別分類
  const hierarchicalParameters = this.classifyParametersHierarchically(
    legacyData.params,
    legacyData.template
  );
  
  // タイミング情報の階層的変換
  const hierarchicalTiming = this.convertTimingToHierarchical(
    legacyData.timing,
    hierarchicalStructure
  );
  
  return {
    phrase: hierarchicalStructure.phrase,
    words: hierarchicalStructure.words,
    characters: hierarchicalStructure.characters,
    parameters: hierarchicalParameters,
    timing: hierarchicalTiming,
    metadata: {
      originalTemplate: legacyData.template.constructor.name,
      conversionStrategy: conversionStrategy.name,
      conversionTime: Date.now()
    }
  };
}

/**
 * WordSlideTextPrimitive用の変換戦略
 */
private createWordSlideConversionStrategy(): ConversionStrategy {
  return {
    name: 'WordSlideTextPrimitive',
    
    // フレーズレベルデータ抽出
    extractPhraseData: (legacyData: LegacyData) => ({
      id: legacyData.instance.id + '_phrase',
      text: legacyData.instance.text,
      position: {
        x: legacyData.instance.x,
        y: legacyData.instance.y,
        anchor: 'center',
        offset: {
          x: legacyData.params.phraseOffsetX || 0,
          y: legacyData.params.phraseOffsetY || 0
        }
      },
      layout: 'single-line',
      effects: {
        fadeIn: legacyData.params.phraseInAnimation !== 'none',
        fadeOut: legacyData.params.phraseOutAnimation !== 'none'
      }
    }),
    
    // 単語レベルデータ抽出
    extractWordData: (legacyData: LegacyData) => {
      const words = this.parseTextIntoWords(legacyData.instance.text);
      return words.map((wordText, index) => ({
        id: `${legacyData.instance.id}_word_${index}`,
        text: wordText,
        wordIndex: index,
        animation: {
          type: 'slide',
          direction: 'left',
          speed: {
            initial: legacyData.params.initialSpeed || 2.0,
            active: legacyData.params.activeSpeed || 0.05,
            final: legacyData.params.finalSpeed || 0.5
          },
          easing: legacyData.params.easingFunction || 'easeOutCubic'
        },
        spacing: this.calculateWordSpacing(wordText, legacyData.params),
        grouping: 'individual'
      }));
    },
    
    // 文字レベルデータ抽出
    extractCharacterData: (legacyData: LegacyData, wordData: WordData[]) => {
      const characters: CharacterData[] = [];
      
      wordData.forEach((word, wordIndex) => {
        const chars = word.text.split('');
        chars.forEach((char, charIndex) => {
          characters.push({
            id: `${legacyData.instance.id}_char_${wordIndex}_${charIndex}`,
            char: char,
            charIndex: charIndex,
            wordIndex: wordIndex,
            style: {
              fontSize: legacyData.params.fontSize || 32,
              fontFamily: legacyData.params.fontFamily || 'Noto Sans JP',
              color: {
                default: legacyData.params.defaultColor || '#808080',
                active: legacyData.params.activeColor || '#FFFF80',
                completed: legacyData.params.completedColor || '#FFF7EB'
              }
            },
            effects: {
              glow: {
                enabled: legacyData.params.enableGlow !== false,
                color: legacyData.params.glowColor || '#FFD700',
                strength: legacyData.params.glowStrength || 10
              },
              colorTransition: {
                enabled: true,
                duration: legacyData.params.colorTransitionDuration || 200
              }
            },
            behavior: 'static'
          });
        });
      });
      
      return characters;
    }
  };
}
```

### 1.4 逆変換システム

```typescript
/**
 * 階層結果をレガシー形式に変換
 */
convertHierarchicalToLegacy(
  hierarchicalResult: HierarchicalResult,
  targetInstance: AnimationInstance
): LegacyResult {
  
  // 結果の統合
  const consolidatedResult = this.consolidateHierarchicalResults(hierarchicalResult);
  
  // レガシーコンテナ形式への適用
  const containerUpdates = this.createContainerUpdates(
    consolidatedResult,
    targetInstance.container
  );
  
  // パフォーマンス情報の変換
  const legacyMetrics = this.convertMetricsToLegacy(hierarchicalResult.metadata);
  
  return {
    success: hierarchicalResult.success,
    containerUpdates: containerUpdates,
    metrics: legacyMetrics,
    
    // デバッグ情報
    debug: {
      hierarchicalLevelsExecuted: hierarchicalResult.metadata.hierarchyLevelsUsed,
      primitivesUsed: hierarchicalResult.metadata.primitivesUsed,
      optimizationsApplied: hierarchicalResult.metadata.optimizationsApplied
    },
    
    // 互換性情報
    compatibility: {
      fullyCompatible: this.assessCompatibility(hierarchicalResult),
      deprecationWarnings: this.generateDeprecationWarnings(hierarchicalResult),
      migrationSuggestions: this.generateMigrationSuggestions(hierarchicalResult)
    }
  };
}

/**
 * コンテナ更新命令の生成
 */
private createContainerUpdates(
  consolidatedResult: ConsolidatedResult,
  targetContainer: PIXI.Container
): ContainerUpdate[] {
  
  const updates: ContainerUpdate[] = [];
  
  // フレーズレベル更新
  if (consolidatedResult.phrase.positionChanged) {
    updates.push({
      type: 'POSITION_UPDATE',
      target: targetContainer,
      position: consolidatedResult.phrase.position,
      priority: 1
    });
  }
  
  if (consolidatedResult.phrase.effectsChanged) {
    updates.push({
      type: 'PHRASE_EFFECTS_UPDATE',
      target: targetContainer,
      effects: consolidatedResult.phrase.effects,
      priority: 2
    });
  }
  
  // 単語レベル更新
  consolidatedResult.words.forEach((wordResult, wordIndex) => {
    if (wordResult.animationChanged) {
      updates.push({
        type: 'WORD_ANIMATION_UPDATE',
        target: this.findWordContainer(targetContainer, wordIndex),
        animation: wordResult.animation,
        priority: 3
      });
    }
  });
  
  // 文字レベル更新
  consolidatedResult.characters.forEach((charResult, charIndex) => {
    if (charResult.styleChanged || charResult.effectsChanged) {
      updates.push({
        type: 'CHARACTER_UPDATE',
        target: this.findCharacterContainer(targetContainer, charIndex),
        style: charResult.style,
        effects: charResult.effects,
        priority: 4
      });
    }
  });
  
  // 優先度順でソート
  return updates.sort((a, b) => a.priority - b.priority);
}
```

### 1.5 パラメータマッピング

```typescript
/**
 * パラメータの双方向マッピング
 */
class ParameterMapper {
  
  // 階層別パラメータ分類マップ
  private hierarchyMapping: Map<string, HierarchyLevel>;
  
  // 変換ルールマップ
  private conversionRules: Map<string, ConversionRule>;
  
  constructor() {
    this.initializeHierarchyMapping();
    this.initializeConversionRules();
  }
  
  /**
   * レガシーパラメータの階層別分類
   */
  classifyParametersHierarchically(
    legacyParams: Record<string, any>,
    templateType: TemplateType
  ): HierarchicalParameters {
    
    const classified: HierarchicalParameters = {
      phrase: {},
      word: {},
      character: {},
      global: {}
    };
    
    Object.entries(legacyParams).forEach(([key, value]) => {
      const hierarchyLevel = this.getParameterHierarchy(key, templateType);
      const convertedValue = this.convertParameterValue(key, value, hierarchyLevel);
      
      classified[hierarchyLevel][key] = convertedValue;
    });
    
    // 階層間依存関係の解決
    this.resolveCrosshierarchyDependencies(classified);
    
    return classified;
  }
  
  /**
   * パラメータの階層判定
   */
  private getParameterHierarchy(
    parameterName: string,
    templateType: TemplateType
  ): HierarchyLevel {
    
    // テンプレート固有ルールの適用
    const templateSpecificRule = this.getTemplateSpecificMapping(parameterName, templateType);
    if (templateSpecificRule) {
      return templateSpecificRule;
    }
    
    // 汎用ルールの適用
    const generalMapping = this.hierarchyMapping.get(parameterName);
    if (generalMapping) {
      return generalMapping;
    }
    
    // パラメータ名による推定
    return this.inferHierarchyFromName(parameterName);
  }
  
  /**
   * 階層間依存関係の解決
   */
  private resolveCrosshierarchyDependencies(
    classified: HierarchicalParameters
  ): void {
    
    // 例: 文字サイズが変更された場合、単語スペーシングも調整
    if (classified.character.fontSize) {
      classified.word.dynamicSpacing = this.calculateDynamicSpacing(
        classified.character.fontSize
      );
    }
    
    // 例: フレーズ位置が変更された場合、単語位置の基準点も更新
    if (classified.phrase.position) {
      classified.word.basePosition = classified.phrase.position;
    }
    
    // 例: グローバルアニメーション速度が設定された場合、各階層に反映
    if (classified.global.animationSpeed) {
      const speed = classified.global.animationSpeed;
      classified.phrase.fadeSpeed = speed;
      classified.word.slideSpeed = speed;
      classified.character.effectSpeed = speed;
    }
  }
}
```

## 2. FallbackManager 仕様

### 2.1 基本設計

```typescript
/**
 * エラー時の既存システムフォールバック管理
 */
class FallbackManager {
  // フォールバック戦略
  private fallbackStrategies: Map<ErrorType, FallbackStrategy>;
  
  // 信頼性学習
  private reliabilityLearner: ReliabilityLearner;
  
  // パフォーマンス監視
  private performanceMonitor: PerformanceMonitor;
  
  // エラー分析エンジン
  private errorAnalyzer: ErrorAnalyzer;
  
  constructor(dependencies: FallbackManagerDependencies) {
    this.fallbackStrategies = new Map();
    this.reliabilityLearner = new ReliabilityLearner();
    this.performanceMonitor = new PerformanceMonitor();
    this.errorAnalyzer = new ErrorAnalyzer();
    
    this.initializeFallbackStrategies();
  }
}
```

### 2.2 インテリジェントフォールバック判定

```typescript
/**
 * 階層システムエラー時のフォールバック判定
 */
shouldFallback(error: Error, context: ExecutionContext): boolean {
  
  // エラーの詳細分析
  const errorAnalysis = this.errorAnalyzer.analyze(error, context);
  
  // 修復可能性の評価
  const repairability = this.assessRepairability(errorAnalysis);
  if (repairability.canRepair && repairability.confidenceLevel > 0.8) {
    return false; // 修復を試行
  }
  
  // パフォーマンス影響の評価
  const performanceImpact = this.assessPerformanceImpact(error, context);
  if (performanceImpact.criticalImpact) {
    return true; // 即座にフォールバック
  }
  
  // 信頼性履歴による判定
  const reliabilityScore = this.reliabilityLearner.getReliabilityScore(
    context.templateType,
    context.hierarchyLevel
  );
  
  // 動的閾値による判定
  const fallbackThreshold = this.calculateDynamicThreshold(
    reliabilityScore,
    context.criticality
  );
  
  const errorSeverity = errorAnalysis.severity;
  
  return errorSeverity > fallbackThreshold;
}

/**
 * 動的フォールバック閾値の計算
 */
private calculateDynamicThreshold(
  reliabilityScore: number,
  criticality: CriticalityLevel
): number {
  
  // 基本閾値
  let threshold = 0.5;
  
  // 信頼性による調整
  // 高信頼性 → 高閾値（フォールバック少なく）
  // 低信頼性 → 低閾値（フォールバック多く）
  threshold += (reliabilityScore - 0.5) * 0.3;
  
  // 重要度による調整
  switch (criticality) {
    case 'LOW':
      threshold += 0.2; // より寛容
      break;
    case 'MEDIUM':
      // 基本値のまま
      break;
    case 'HIGH':
      threshold -= 0.1; // やや厳格
      break;
    case 'CRITICAL':
      threshold -= 0.3; // 非常に厳格
      break;
  }
  
  // 閾値の範囲制限
  return Math.max(0.1, Math.min(0.9, threshold));
}
```

### 2.3 段階的フォールバック実行

```typescript
/**
 * 段階的フォールバック実行
 */
async executeFallback(
  instance: AnimationInstance,
  originalError: Error
): Promise<FallbackResult> {
  
  const fallbackPlan = this.createFallbackPlan(instance, originalError);
  
  // Stage 1: 部分修復試行
  if (fallbackPlan.includePartialRepair) {
    const partialRepairResult = await this.attemptPartialRepair(instance, originalError);
    if (partialRepairResult.success) {
      return {
        success: true,
        mode: 'PARTIAL_REPAIR',
        result: partialRepairResult,
        performance: partialRepairResult.performance
      };
    }
  }
  
  // Stage 2: 代替階層システム実行
  if (fallbackPlan.includeAlternativeHierarchy) {
    const alternativeResult = await this.executeAlternativeHierarchy(instance);
    if (alternativeResult.success) {
      return {
        success: true,
        mode: 'ALTERNATIVE_HIERARCHY',
        result: alternativeResult,
        performance: alternativeResult.performance
      };
    }
  }
  
  // Stage 3: 既存システム実行
  const legacyResult = await this.executeLegacySystem(instance);
  
  // フォールバック学習
  this.learnFromFallback({
    originalError: originalError,
    fallbackMode: 'LEGACY_SYSTEM',
    success: legacyResult.success,
    performance: legacyResult.performance,
    context: {
      templateType: instance.template.constructor.name,
      instanceId: instance.id
    }
  });
  
  return {
    success: legacyResult.success,
    mode: 'LEGACY_SYSTEM',
    result: legacyResult,
    performance: legacyResult.performance
  };
}

/**
 * 既存システムでの安全実行
 */
private async executeLegacySystem(
  instance: AnimationInstance
): Promise<LegacyExecutionResult> {
  
  const startTime = performance.now();
  
  try {
    // 既存のanimateメソッドを直接呼び出し
    if (typeof instance.template.animate === 'function') {
      instance.template.animate(
        instance.container,
        instance.text,
        instance.x,
        instance.y,
        instance.params,
        Date.now(),
        instance.startMs,
        instance.endMs
      );
      
      // updateTransformも実行
      instance.container.updateTransform();
      
      const executionTime = performance.now() - startTime;
      
      return {
        success: true,
        executionTime: executionTime,
        method: 'legacy_animate',
        performance: {
          executionTime: executionTime,
          memoryUsage: this.measureMemoryUsage(),
          renderingCalls: this.countRenderingCalls()
        }
      };
      
    } else if (typeof instance.template.animateContainer === 'function') {
      // 新しいanimateContainerメソッドを使用
      instance.template.animateContainer(
        instance.container,
        instance.text,
        instance.params,
        Date.now(),
        instance.startMs,
        instance.endMs,
        instance.hierarchyType,
        this.determineAnimationPhase(Date.now(), instance.startMs, instance.endMs)
      );
      
      instance.container.updateTransform();
      
      const executionTime = performance.now() - startTime;
      
      return {
        success: true,
        executionTime: executionTime,
        method: 'legacy_animateContainer',
        performance: {
          executionTime: executionTime,
          memoryUsage: this.measureMemoryUsage(),
          renderingCalls: this.countRenderingCalls()
        }
      };
      
    } else {
      throw new Error('No executable animation method found');
    }
    
  } catch (legacyError) {
    // 既存システムでもエラーが発生
    console.error('Legacy system execution failed:', legacyError);
    
    // 最小限の安全実行
    return this.executeMinimalSafeMode(instance, legacyError);
  }
}
```

### 2.4 学習機能

```typescript
/**
 * 失敗からの学習機能
 */
learnFromFailure(failure: FailureContext): void {
  
  // 失敗パターンの記録
  this.reliabilityLearner.recordFailure({
    templateType: failure.templateType,
    hierarchyLevel: failure.hierarchyLevel,
    errorType: failure.errorType,
    context: failure.context,
    timestamp: Date.now()
  });
  
  // パターン分析の更新
  this.updateFailurePatterns(failure);
  
  // 信頼性スコアの調整
  this.adjustReliabilityScores(failure);
  
  // 予測モデルの更新
  this.updatePredictiveModel(failure);
}

/**
 * 信頼性スコアの調整
 */
private adjustReliabilityScores(failure: FailureContext): void {
  
  const currentScore = this.reliabilityLearner.getReliabilityScore(
    failure.templateType,
    failure.hierarchyLevel
  );
  
  // 失敗の重要度による調整量決定
  const adjustmentAmount = this.calculateAdjustmentAmount(failure);
  
  // 新しいスコア計算（指数移動平均を使用）
  const newScore = currentScore * 0.9 - adjustmentAmount * 0.1;
  
  // スコアの更新
  this.reliabilityLearner.updateReliabilityScore(
    failure.templateType,
    failure.hierarchyLevel,
    Math.max(0.0, Math.min(1.0, newScore))
  );
  
  // スコア変更のログ
  console.log(`Reliability score updated: ${failure.templateType}:${failure.hierarchyLevel} ${currentScore} -> ${newScore}`);
}

/**
 * 予測的フォールバック
 */
predictivelyAssess(context: ExecutionContext): PredictiveAssessment {
  
  const historicalData = this.reliabilityLearner.getHistoricalData(
    context.templateType,
    context.hierarchyLevel
  );
  
  // 現在の条件と類似した過去の実行を検索
  const similarExecutions = this.findSimilarExecutions(context, historicalData);
  
  // 成功確率の計算
  const successProbability = this.calculateSuccessProbability(similarExecutions);
  
  // リスク評価
  const riskAssessment = this.assessRisk(context, successProbability);
  
  return {
    successProbability: successProbability,
    riskLevel: riskAssessment.level,
    recommendedAction: this.determineRecommendedAction(riskAssessment),
    confidence: riskAssessment.confidence
  };
}
```

### 2.5 信頼性メトリクス

```typescript
/**
 * システム信頼性メトリクスの収集・分析
 */
getReliabilityMetrics(): ReliabilityMetrics {
  
  const overallMetrics = this.calculateOverallMetrics();
  const templateMetrics = this.calculateTemplateSpecificMetrics();
  const hierarchyMetrics = this.calculateHierarchySpecificMetrics();
  const trendMetrics = this.calculateTrendMetrics();
  
  return {
    // 全体的な信頼性
    overall: {
      successRate: overallMetrics.successRate,
      averageExecutionTime: overallMetrics.averageExecutionTime,
      fallbackRate: overallMetrics.fallbackRate,
      errorRate: overallMetrics.errorRate
    },
    
    // テンプレート別信頼性
    byTemplate: templateMetrics,
    
    // 階層別信頼性
    byHierarchy: hierarchyMetrics,
    
    // 時系列トレンド
    trends: {
      successRateTrend: trendMetrics.successRateTrend,
      performanceTrend: trendMetrics.performanceTrend,
      errorTrend: trendMetrics.errorTrend
    },
    
    // 予測情報
    predictions: {
      nextHourSuccessRate: this.predictSuccessRate('1h'),
      nextDaySuccessRate: this.predictSuccessRate('24h'),
      riskAreas: this.identifyRiskAreas()
    },
    
    // 改善提案
    recommendations: this.generateImprovementRecommendations()
  };
}
```

## 3. TemplateComposer 仕様

### 3.1 基本設計

```typescript
/**
 * テンプレートの階層的実行管理
 */
class TemplateComposer {
  // テンプレート分析エンジン
  private templateAnalyzer: TemplateAnalyzer;
  
  // 実行計画作成エンジン
  private executionPlanner: ExecutionPlanner;
  
  // 階層実行管理
  private hierarchyExecutor: HierarchyExecutor;
  
  // パフォーマンス最適化
  private performanceOptimizer: PerformanceOptimizer;
  
  constructor(dependencies: TemplateComposerDependencies) {
    this.templateAnalyzer = new TemplateAnalyzer();
    this.executionPlanner = new ExecutionPlanner();
    this.hierarchyExecutor = new HierarchyExecutor();
    this.performanceOptimizer = new PerformanceOptimizer();
  }
}
```

### 3.2 テンプレート分析

```typescript
/**
 * テンプレートの階層的分析
 */
analyzeTemplate(template: IAnimationTemplate): TemplateAnalysis {
  
  // テンプレートタイプの判定
  const templateType = this.identifyTemplateType(template);
  
  // 階層利用パターンの分析
  const hierarchyUsage = this.analyzeHierarchyUsage(template);
  
  // プリミティブ依存関係の分析
  const primitiveDependencies = this.analyzePrimitiveDependencies(template);
  
  // パフォーマンス特性の分析
  const performanceCharacteristics = this.analyzePerformanceCharacteristics(template);
  
  // 最適化機会の特定
  const optimizationOpportunities = this.identifyOptimizationOpportunities(template);
  
  return {
    templateType: templateType,
    hierarchyUsage: hierarchyUsage,
    primitiveDependencies: primitiveDependencies,
    performanceCharacteristics: performanceCharacteristics,
    optimizationOpportunities: optimizationOpportunities,
    
    // 互換性情報
    compatibility: {
      hierarchicalCompatible: this.assessHierarchicalCompatibility(template),
      migrationRequirement: this.assessMigrationRequirement(template),
      riskLevel: this.assessMigrationRisk(template)
    },
    
    // 推奨事項
    recommendations: this.generateTemplateRecommendations(template)
  };
}

/**
 * 階層利用パターンの詳細分析
 */
private analyzeHierarchyUsage(template: IAnimationTemplate): HierarchyUsageAnalysis {
  
  const analysis: HierarchyUsageAnalysis = {
    phrase: { used: false, operations: [], complexity: 'LOW' },
    word: { used: false, operations: [], complexity: 'LOW' },
    character: { used: false, operations: [], complexity: 'LOW' }
  };
  
  // テンプレートのメソッド分析
  const methods = this.extractTemplateMethods(template);
  
  methods.forEach(method => {
    const hierarchyOperations = this.identifyHierarchyOperations(method);
    
    hierarchyOperations.forEach(operation => {
      const level = operation.hierarchyLevel;
      analysis[level].used = true;
      analysis[level].operations.push(operation);
      
      // 複雑性の評価
      if (operation.complexity > analysis[level].complexity) {
        analysis[level].complexity = operation.complexity;
      }
    });
  });
  
  // 階層間関係の分析
  analysis.crossHierarchyDependencies = this.analyzeCrossHierarchyDependencies(analysis);
  
  return analysis;
}
```

### 3.3 実行計画作成

```typescript
/**
 * 階層的実行計画の作成
 */
createExecutionPlan(
  template: IAnimationTemplate,
  instance: AnimationInstance
): HierarchicalExecutionPlan {
  
  // テンプレート分析結果の取得
  const templateAnalysis = this.analyzeTemplate(template);
  
  // 実行環境の分析
  const executionContext = this.analyzeExecutionContext(instance);
  
  // 階層別実行ステップの構築
  const executionSteps = this.buildHierarchicalExecutionSteps(
    templateAnalysis,
    executionContext
  );
  
  // 依存関係の解析
  const dependencies = this.resolveDependencies(executionSteps);
  
  // パフォーマンス最適化の適用
  const optimizedSteps = this.performanceOptimizer.optimizeExecutionSteps(
    executionSteps,
    dependencies
  );
  
  // 実行計画の検証
  const validationResult = this.validateExecutionPlan(optimizedSteps);
  if (!validationResult.valid) {
    throw new ExecutionPlanError(
      'Invalid execution plan',
      validationResult.issues
    );
  }
  
  return {
    templateType: templateAnalysis.templateType,
    executionSteps: optimizedSteps,
    dependencies: dependencies,
    
    // 実行制御
    execution: {
      mode: this.determineExecutionMode(templateAnalysis),
      parallelization: this.identifyParallelizationOpportunities(optimizedSteps),
      fallbackPlan: this.createFallbackPlan(optimizedSteps)
    },
    
    // パフォーマンス予測
    performance: {
      estimatedExecutionTime: this.estimateExecutionTime(optimizedSteps),
      memoryUsagePrediction: this.predictMemoryUsage(optimizedSteps),
      bottleneckAnalysis: this.identifyBottlenecks(optimizedSteps)
    },
    
    // 品質保証
    qualityAssurance: {
      validationChecks: this.defineValidationChecks(optimizedSteps),
      rollbackPlan: this.createRollbackPlan(optimizedSteps),
      monitoringPoints: this.defineMonitoringPoints(optimizedSteps)
    }
  };
}

/**
 * 階層別実行ステップの構築
 */
private buildHierarchicalExecutionSteps(
  templateAnalysis: TemplateAnalysis,
  executionContext: ExecutionContext
): HierarchicalExecutionStep[] {
  
  const steps: HierarchicalExecutionStep[] = [];
  
  // フレーズレベルステップ
  if (templateAnalysis.hierarchyUsage.phrase.used) {
    steps.push({
      id: 'phrase_processing',
      hierarchyLevel: 'phrase',
      operations: templateAnalysis.hierarchyUsage.phrase.operations,
      dependencies: [],
      estimated: {
        executionTime: this.estimatePhraseLevelTime(templateAnalysis),
        memoryUsage: this.estimatePhraseLevelMemory(templateAnalysis)
      }
    });
  }
  
  // 単語レベルステップ
  if (templateAnalysis.hierarchyUsage.word.used) {
    const wordStep: HierarchicalExecutionStep = {
      id: 'word_processing',
      hierarchyLevel: 'word',
      operations: templateAnalysis.hierarchyUsage.word.operations,
      dependencies: templateAnalysis.hierarchyUsage.phrase.used ? ['phrase_processing'] : [],
      estimated: {
        executionTime: this.estimateWordLevelTime(templateAnalysis, executionContext),
        memoryUsage: this.estimateWordLevelMemory(templateAnalysis, executionContext)
      }
    };
    
    steps.push(wordStep);
  }
  
  // 文字レベルステップ
  if (templateAnalysis.hierarchyUsage.character.used) {
    const characterStep: HierarchicalExecutionStep = {
      id: 'character_processing',
      hierarchyLevel: 'character',
      operations: templateAnalysis.hierarchyUsage.character.operations,
      dependencies: this.determineDependenciesForCharacterLevel(templateAnalysis),
      estimated: {
        executionTime: this.estimateCharacterLevelTime(templateAnalysis, executionContext),
        memoryUsage: this.estimateCharacterLevelMemory(templateAnalysis, executionContext)
      }
    };
    
    steps.push(characterStep);
  }
  
  // 統合ステップ
  steps.push({
    id: 'result_integration',
    hierarchyLevel: 'integration',
    operations: [{ type: 'INTEGRATE_RESULTS', complexity: 'MEDIUM' }],
    dependencies: steps.map(s => s.id),
    estimated: {
      executionTime: this.estimateIntegrationTime(steps),
      memoryUsage: this.estimateIntegrationMemory(steps)
    }
  });
  
  return steps;
}
```

### 3.4 階層的実行管理

```typescript
/**
 * 階層実行計画の実行
 */
async executeHierarchically(
  plan: HierarchicalExecutionPlan
): Promise<HierarchicalExecutionResult> {
  
  const executionId = this.generateExecutionId();
  const startTime = performance.now();
  
  // 実行監視の開始
  const monitor = this.startExecutionMonitoring(executionId, plan);
  
  try {
    // 実行ステップの準備
    const preparedSteps = await this.prepareExecutionSteps(plan.executionSteps);
    
    // 段階的実行
    const stepResults: StepResult[] = [];
    
    for (const step of preparedSteps) {
      // 依存関係チェック
      const dependenciesReady = this.checkDependencies(step, stepResults);
      if (!dependenciesReady.ready) {
        throw new DependencyError(
          `Dependencies not ready for step ${step.id}`,
          dependenciesReady.missingDependencies
        );
      }
      
      // ステップ実行
      const stepResult = await this.executeStep(step, stepResults);
      stepResults.push(stepResult);
      
      // 進捗更新
      monitor.updateProgress(step.id, stepResult);
      
      // エラーチェック
      if (!stepResult.success) {
        throw new StepExecutionError(
          `Step ${step.id} failed`,
          stepResult.error
        );
      }
    }
    
    // 結果統合
    const integratedResult = this.integrateStepResults(stepResults);
    
    // 実行完了
    const totalExecutionTime = performance.now() - startTime;
    monitor.complete(integratedResult, totalExecutionTime);
    
    return {
      success: true,
      executionId: executionId,
      executionTime: totalExecutionTime,
      stepResults: stepResults,
      integratedResult: integratedResult,
      
      // パフォーマンス情報
      performance: {
        totalTime: totalExecutionTime,
        stepBreakdown: stepResults.map(r => ({
          stepId: r.stepId,
          executionTime: r.executionTime
        })),
        memoryPeak: monitor.getMemoryPeak(),
        optimizationsApplied: monitor.getOptimizationsApplied()
      },
      
      // 品質情報
      quality: {
        validationsPassed: monitor.getValidationResults(),
        warningsGenerated: monitor.getWarnings(),
        metricsCollected: monitor.getMetrics()
      }
    };
    
  } catch (error) {
    // エラー時の処理
    const executionTime = performance.now() - startTime;
    monitor.error(error, executionTime);
    
    return {
      success: false,
      executionId: executionId,
      executionTime: executionTime,
      error: error.message,
      
      // 部分実行結果（可能な場合）
      partialResults: monitor.getPartialResults(),
      
      // エラー分析
      errorAnalysis: {
        errorType: error.constructor.name,
        failedStep: monitor.getCurrentStep(),
        rootCause: this.analyzeRootCause(error, plan),
        recoveryOptions: this.identifyRecoveryOptions(error, plan)
      }
    };
    
  } finally {
    // 実行監視の終了
    monitor.cleanup();
  }
}
```

この統合モジュール設計により、既存システムとの完全な互換性を保ちながら、段階的に階層分離システムを導入できます。フォールバック機能により安全性を確保し、学習機能により継続的に品質向上を図ります。