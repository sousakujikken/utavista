# 型システム・検証仕様書 v2.0

## 概要

本仕様書は、階層分離型プリミティブアーキテクチャにおけるTypeScript型制約、実行時検証システム、デバッグ支援ツールの技術仕様を定義します。コンパイル時および実行時の両方で、間違ったプリミティブ使用を防止する堅牢な検証システムを実現します。

## TypeScript型制約システム

### 簡素化された階層制約

```typescript
/**
 * 基本的な階層タイプ定義
 */
type HierarchyType = 'phrase' | 'word' | 'character';

/**
 * プリミティブ基底インターフェース
 */
interface BasePrimitive {
  readonly name: string;
  readonly version: string;
  readonly supportedHierarchy: HierarchyType;
}

/**
 * 階層制約の基本チェック（実行時）
 */
function validateHierarchyUsage(
  primitive: BasePrimitive,
  expectedHierarchy: HierarchyType
): boolean {
  return primitive.supportedHierarchy === expectedHierarchy;
}

// 使用例: 実行時チェック
const phrasePositioning = new PhrasePositionPrimitive();
if (!validateHierarchyUsage(phrasePositioning, 'phrase')) {
  throw new Error('Phrase階層でPhrasePositionPrimitive以外は使用不可');
}
```

### テンプレート実装制約

```typescript
/**
 * HierarchicalAnimationTemplateの型制約
 */
interface PrimitiveConfiguration {
  phraseStrategy: 'static' | 'slide' | 'random';
  wordStrategy: 'static' | 'slide' | 'cumulative';
  characterStrategy: 'individual' | 'cumulative' | 'newline' | 'spacing';
}

/**
 * 有効なプリミティブ組み合わせの型定義
 */
type ValidPrimitiveCombination = 
  | { phraseStrategy: 'static'; wordStrategy: 'static'; characterStrategy: 'individual' }    // フェード・ブラー系
  | { phraseStrategy: 'slide'; wordStrategy: 'slide'; characterStrategy: 'individual' }      // スライド系
  | { phraseStrategy: 'static'; wordStrategy: 'static'; characterStrategy: 'cumulative' }   // フレーズ同期系
  | { phraseStrategy: 'random'; wordStrategy: 'static'; characterStrategy: 'newline' };     // ランダム配置系

/**
 * テンプレート基底クラスの型制約
 */
abstract class TypeSafeHierarchicalTemplate<T extends ValidPrimitiveCombination> 
  extends HierarchicalAnimationTemplate {
  
  protected abstract readonly configuration: T;
  
  // 設定に応じた型安全なプリミティブメソッド選択
  protected calculatePhrasePosition(...): Position {
    switch (this.configuration.phraseStrategy) {
      case 'static':
        return this.phrasePositioning.calculateStatic(...);
      case 'slide':
        return this.phrasePositioning.calculateSlide(...);
      case 'random':
        return this.phrasePositioning.calculateRandom(...);
    }
  }
}

/**
 * 具体的なテンプレート実装例
 */
class FadeBlurTemplate extends TypeSafeHierarchicalTemplate<{
  phraseStrategy: 'random';
  wordStrategy: 'static';
  characterStrategy: 'newline';
}> {
  protected readonly configuration = {
    phraseStrategy: 'random' as const,
    wordStrategy: 'static' as const,
    characterStrategy: 'newline' as const
  };
  
  // 型システムが正しい実装パターンを強制
}
```

### パラメータ型安全性

```typescript
/**
 * プリミティブパラメータの型安全性
 */
interface TypedPrimitiveParams {
  phrase: {
    static: PhrasePositionParams;
    slide: PhrasePositionParams & SlideParams;
    random: PhrasePositionParams & RandomPlacementParams;
  };
  word: {
    static: WordPositionParams;
    slide: WordPositionParams & WordSlideParams;
    cumulative: WordPositionParams & CumulativeParams;
  };
  character: {
    individual: CharacterLayoutParams;
    cumulative: CharacterLayoutParams;
    newline: CharacterLayoutParams & LineLayoutParams;
    spacing: CharacterLayoutParams & SpacingParams;
  };
}

/**
 * 型安全なプリミティブ呼び出し
 */
function callPrimitive<
  H extends HierarchyType,
  S extends keyof TypedPrimitiveParams[H]
>(
  hierarchy: H,
  strategy: S,
  primitive: PrimitiveConstraints<H>[H],
  params: TypedPrimitiveParams[H][S]
): Position | CharacterLayoutResult {
  // TypeScriptが型の整合性を保証
  return (primitive as any)[`calculate${capitalize(strategy as string)}`](params);
}
```

## 実行時検証システム

### アーキテクチャ適合性検証

```typescript
/**
 * 実行時のアーキテクチャ適合性を検証
 */
class ArchitectureValidator {
  /**
   * テンプレートが階層分離原則に従っているかを検証
   */
  validateHierarchicalSeparation(template: IAnimationTemplate): ValidationResult {
    const violations: string[] = [];
    
    // 単一責任原則の検証
    const primitiveUsage = this.analyzePrimitiveUsage(template);
    primitiveUsage.forEach((usage, primitive) => {
      if (usage.hierarchyLevels.length > 1) {
        violations.push(
          `${primitive}が複数階層(${usage.hierarchyLevels.join(', ')})を担当しています`
        );
      }
    });
    
    // 階層制約の検証
    const hierarchyViolations = this.checkHierarchyConstraints(template);
    violations.push(...hierarchyViolations);
    
    return {
      valid: violations.length === 0,
      violations,
      score: this.calculateArchitectureScore(violations)
    };
  }
  
  /**
   * プリミティブ組み合わせの妥当性を検証
   */
  validatePrimitiveCombination(configuration: PrimitiveConfiguration): ValidationResult {
    const validCombinations: ValidPrimitiveCombination[] = [
      { phraseStrategy: 'static', wordStrategy: 'static', characterStrategy: 'individual' },
      { phraseStrategy: 'slide', wordStrategy: 'slide', characterStrategy: 'individual' },
      { phraseStrategy: 'static', wordStrategy: 'static', characterStrategy: 'cumulative' },
      { phraseStrategy: 'random', wordStrategy: 'static', characterStrategy: 'newline' }
    ];
    
    const isValid = validCombinations.some(valid => 
      configuration.phraseStrategy === valid.phraseStrategy &&
      configuration.wordStrategy === valid.wordStrategy &&
      configuration.characterStrategy === valid.characterStrategy
    );
    
    return {
      valid: isValid,
      violations: isValid ? [] : [`無効なプリミティブ組み合わせ: ${JSON.stringify(configuration)}`],
      recommendedCombinations: validCombinations
    };
  }
  
  private analyzePrimitiveUsage(template: IAnimationTemplate): Map<string, PrimitiveUsageInfo> {
    // リフレクションを使用してプリミティブ使用パターンを分析
    const usage = new Map<string, PrimitiveUsageInfo>();
    
    // テンプレートのメソッドを分析
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(template));
    methods.forEach(method => {
      if (method.startsWith('render') && method.includes('Container')) {
        const hierarchyLevel = this.extractHierarchyLevel(method);
        const primitives = this.extractPrimitiveUsage(template, method);
        
        primitives.forEach(primitive => {
          if (!usage.has(primitive)) {
            usage.set(primitive, { hierarchyLevels: [], methods: [] });
          }
          usage.get(primitive)!.hierarchyLevels.push(hierarchyLevel);
          usage.get(primitive)!.methods.push(method);
        });
      }
    });
    
    return usage;
  }
}

interface PrimitiveUsageInfo {
  hierarchyLevels: string[];
  methods: string[];
}

interface ValidationResult {
  valid: boolean;
  violations: string[];
  score?: number;
  recommendedCombinations?: ValidPrimitiveCombination[];
}
```

### パフォーマンス検証

```typescript
/**
 * プリミティブ使用パターンのパフォーマンス分析
 */
class PerformanceValidator {
  /**
   * プリミティブ呼び出しのパフォーマンスを測定
   */
  measurePrimitivePerformance(
    template: IAnimationTemplate,
    testParams: Record<string, unknown>
  ): PerformanceReport {
    const measurements: Map<string, PerformanceMeasurement> = new Map();
    
    // 各階層の処理時間を測定
    const hierarchyLevels: HierarchyType[] = ['phrase', 'word', 'character'];
    
    hierarchyLevels.forEach(level => {
      const startTime = performance.now();
      
      // テンプレートの該当階層処理を実行
      this.executeHierarchyLevel(template, level, testParams);
      
      const endTime = performance.now();
      
      measurements.set(level, {
        executionTime: endTime - startTime,
        memoryUsage: this.measureMemoryUsage(),
        primitiveCallCount: this.countPrimitiveCalls(level)
      });
    });
    
    return {
      totalExecutionTime: Array.from(measurements.values())
        .reduce((sum, m) => sum + m.executionTime, 0),
      hierarchyMeasurements: measurements,
      bottlenecks: this.identifyBottlenecks(measurements),
      recommendations: this.generateOptimizationRecommendations(measurements)
    };
  }
  
  /**
   * メモリリークの検出
   */
  detectMemoryLeaks(template: IAnimationTemplate): MemoryLeakReport {
    const initialMemory = this.measureMemoryUsage();
    
    // テンプレートを複数回実行
    for (let i = 0; i < 100; i++) {
      this.executeTemplate(template);
    }
    
    // ガベージコレクション実行
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = this.measureMemoryUsage();
    const memoryIncrease = finalMemory - initialMemory;
    
    return {
      initialMemory,
      finalMemory,
      memoryIncrease,
      hasLeak: memoryIncrease > this.MEMORY_LEAK_THRESHOLD,
      suspiciousObjects: this.findSuspiciousObjects()
    };
  }
}

interface PerformanceMeasurement {
  executionTime: number;
  memoryUsage: number;
  primitiveCallCount: number;
}

interface PerformanceReport {
  totalExecutionTime: number;
  hierarchyMeasurements: Map<string, PerformanceMeasurement>;
  bottlenecks: string[];
  recommendations: string[];
}
```

## デバッグ支援システム

### 階層処理可視化

```typescript
/**
 * 階層処理フローを可視化するデバッガ
 */
class HierarchyFlowDebugger {
  /**
   * テンプレートの階層処理フローを可視化
   */
  visualizeHierarchyFlow(template: IAnimationTemplate): HierarchyFlowVisualization {
    const flow: HierarchyFlowNode[] = [];
    
    // 各階層の処理を追跡
    const tracer = new HierarchyTracer();
    
    // フレーズレベル処理の追跡
    const phraseNode = tracer.traceExecution(() => {
      return template.renderPhraseContainer(/* mock params */);
    }, 'phrase');
    
    // 単語レベル処理の追跡
    const wordNode = tracer.traceExecution(() => {
      return template.renderWordContainer(/* mock params */);
    }, 'word');
    
    // 文字レベル処理の追跡
    const charNode = tracer.traceExecution(() => {
      return template.renderCharContainer(/* mock params */);
    }, 'character');
    
    return {
      nodes: [phraseNode, wordNode, charNode],
      dependencies: this.analyzeDependencies([phraseNode, wordNode, charNode]),
      executionOrder: this.determineExecutionOrder([phraseNode, wordNode, charNode]),
      violations: this.detectFlowViolations([phraseNode, wordNode, charNode])
    };
  }
  
  /**
   * プリミティブ間の依存関係を分析
   */
  analyzePrimitiveDependencies(template: IAnimationTemplate): DependencyGraph {
    const dependencies: Map<string, string[]> = new Map();
    
    // プリミティブ使用パターンを解析
    const primitiveUsage = this.extractPrimitiveUsage(template);
    
    primitiveUsage.forEach((usage, primitive) => {
      const deps = this.findDependencies(primitive, usage);
      dependencies.set(primitive, deps);
    });
    
    return {
      nodes: Array.from(dependencies.keys()),
      edges: this.createDependencyEdges(dependencies),
      circularDependencies: this.detectCircularDependencies(dependencies),
      suggestions: this.generateDependencyOptimizations(dependencies)
    };
  }
}

interface HierarchyFlowNode {
  hierarchyLevel: HierarchyType;
  executionTime: number;
  primitivesCalled: string[];
  parameters: Record<string, unknown>;
  result: any;
  childNodes: HierarchyFlowNode[];
}

interface HierarchyFlowVisualization {
  nodes: HierarchyFlowNode[];
  dependencies: string[];
  executionOrder: string[];
  violations: string[];
}
```

### インタラクティブデバッガ

```typescript
/**
 * インタラクティブなプリミティブデバッガ
 */
class InteractivePrimitiveDebugger {
  private breakpoints: Map<string, BreakpointConfig> = new Map();
  private watchedParameters: Set<string> = new Set();
  
  /**
   * プリミティブ実行にブレークポイントを設定
   */
  setBreakpoint(
    primitiveType: string,
    method: string,
    condition?: (params: any) => boolean
  ): void {
    this.breakpoints.set(`${primitiveType}.${method}`, {
      primitiveType,
      method,
      condition: condition || (() => true),
      hitCount: 0,
      enabled: true
    });
  }
  
  /**
   * パラメータ変更を監視
   */
  watchParameter(parameterName: string): void {
    this.watchedParameters.add(parameterName);
  }
  
  /**
   * プリミティブ実行の詳細ログ
   */
  logPrimitiveExecution(
    primitive: string,
    method: string,
    params: any,
    result: any,
    executionTime: number
  ): void {
    const logEntry: PrimitiveExecutionLog = {
      timestamp: Date.now(),
      primitive,
      method,
      parameters: this.sanitizeParameters(params),
      result: this.sanitizeResult(result),
      executionTime,
      memoryUsage: this.measureMemoryUsage(),
      stackTrace: this.captureStackTrace()
    };
    
    // ブレークポイントチェック
    const breakpointKey = `${primitive}.${method}`;
    if (this.breakpoints.has(breakpointKey)) {
      const bp = this.breakpoints.get(breakpointKey)!;
      if (bp.enabled && bp.condition(params)) {
        bp.hitCount++;
        this.triggerBreakpoint(logEntry, bp);
      }
    }
    
    // 監視パラメータのチェック
    this.checkWatchedParameters(params, logEntry);
    
    this.writeLog(logEntry);
  }
  
  private triggerBreakpoint(log: PrimitiveExecutionLog, bp: BreakpointConfig): void {
    console.group(`🔴 ブレークポイント: ${bp.primitiveType}.${bp.method}`);
    console.log('実行時間:', log.executionTime + 'ms');
    console.log('パラメータ:', log.parameters);
    console.log('結果:', log.result);
    console.log('ヒット回数:', bp.hitCount);
    console.groupEnd();
    
    // デバッガUIがある場合は表示
    if (this.hasDebuggerUI()) {
      this.showDebuggerUI(log, bp);
    }
  }
}

interface BreakpointConfig {
  primitiveType: string;
  method: string;
  condition: (params: any) => boolean;
  hitCount: number;
  enabled: boolean;
}

interface PrimitiveExecutionLog {
  timestamp: number;
  primitive: string;
  method: string;
  parameters: any;
  result: any;
  executionTime: number;
  memoryUsage: number;
  stackTrace: string[];
}
```

### 自動修正提案システム

```typescript
/**
 * よくある問題を自動検出して修正案を提案
 */
class AutoFixSuggester {
  /**
   * よくある問題パターンを検出
   */
  detectCommonIssues(template: IAnimationTemplate): Issue[] {
    const issues: Issue[] = [];
    
    // 問題1: 全単語が同じ位置に重なる
    if (this.detectWordOverlap(template)) {
      issues.push({
        type: 'word-overlap',
        severity: 'error',
        message: '全単語が同じ位置に配置されています',
        suggestion: 'wordPositioning.calculateStatic()でwordIndexパラメータを使用してください',
        autoFix: this.generateWordOverlapFix(template)
      });
    }
    
    // 問題2: deviceScale使用
    if (this.detectDeviceScaleUsage(template)) {
      issues.push({
        type: 'device-scale-usage',
        severity: 'warning',
        message: '非推奨のdeviceScale計算が検出されました',
        suggestion: 'v0.4.3以降ではdeviceScaleを使用せず、charSpacing=1.0を標準としてください',
        autoFix: this.generateDeviceScaleFix(template)
      });
    }
    
    // 問題3: 不適切なプリミティブ組み合わせ
    const combinationIssue = this.detectInvalidPrimitiveCombination(template);
    if (combinationIssue) {
      issues.push(combinationIssue);
    }
    
    return issues;
  }
  
  /**
   * 自動修正コードを生成
   */
  generateAutoFix(issue: Issue): AutoFixResult {
    switch (issue.type) {
      case 'word-overlap':
        return this.generateWordOverlapFix(issue.template);
      case 'device-scale-usage':
        return this.generateDeviceScaleFix(issue.template);
      case 'invalid-primitive-combination':
        return this.generatePrimitiveCombinationFix(issue.template);
      default:
        return { success: false, message: '未対応の問題タイプです' };
    }
  }
  
  private generateWordOverlapFix(template: IAnimationTemplate): AutoFixResult {
    const sourceCode = this.getTemplateSourceCode(template);
    
    // パターンマッチングで問題箇所を特定
    const problemPattern = /container\.position\.set\(0,\s*0\)/g;
    
    // 修正コードを生成
    const fixedCode = sourceCode.replace(
      problemPattern,
      `
      // 修正: wordIndexを使用した位置計算
      const position = this.wordPositioning.calculateStatic({
        wordIndex: params.wordIndex,
        fontSize: params.fontSize,
        lineHeight: params.lineHeight,
        nowMs, startMs, endMs, phase
      });
      container.position.set(position.x, position.y);
      `
    );
    
    return {
      success: true,
      originalCode: sourceCode,
      fixedCode: fixedCode,
      changes: this.highlightChanges(sourceCode, fixedCode)
    };
  }
}

interface Issue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
  autoFix?: AutoFixResult;
  template?: IAnimationTemplate;
}

interface AutoFixResult {
  success: boolean;
  originalCode?: string;
  fixedCode?: string;
  changes?: string[];
  message?: string;
}
```

## 開発ツール統合

### VSCode拡張機能

```typescript
/**
 * VSCode拡張機能でのプリミティブ支援
 */
interface VSCodePrimitiveExtension {
  /**
   * プリミティブ使用パターンのハイライト
   */
  highlightPrimitiveUsage(document: vscode.TextDocument): vscode.DecorationOptions[];
  
  /**
   * 不適切なプリミティブ組み合わせの警告
   */
  provideDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[];
  
  /**
   * プリミティブ選択の補完機能
   */
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[];
  
  /**
   * 自動修正のクイックフィックス
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[];
}
```

### ESLintルール

```typescript
/**
 * プリミティブ使用パターンを検証するESLintルール
 */
const primitiveUsageRule: ESLint.Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'プリミティブの適切な使用を強制',
      category: 'Possible Errors'
    },
    schema: []
  },
  
  create(context) {
    return {
      // 階層違反の検出
      CallExpression(node) {
        if (this.isInvalidPrimitiveCall(node)) {
          context.report({
            node,
            message: '不適切な階層でプリミティブが使用されています',
            fix: this.generateFix(node)
          });
        }
      },
      
      // 非推奨パターンの検出
      MemberExpression(node) {
        if (this.isDeprecatedPattern(node)) {
          context.report({
            node,
            message: '非推奨のパターンが使用されています',
            suggest: this.getSuggestions(node)
          });
        }
      }
    };
  }
};
```

この型システム・検証仕様により、開発者が間違ったプリミティブ使用をコンパイル時および実行時の両方で防止し、高品質なテンプレート実装を支援します。