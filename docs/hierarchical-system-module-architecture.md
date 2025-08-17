# 階層分離システム モジュールアーキテクチャ設計書

## 1. 設計方針

### 1.1 基本原則
- **安定基盤の保持**: 5f5c9b5の安定したプリミティブシステムを基盤として活用
- **段階的統合**: 既存システムを破壊せず、互換性を保ちながら階層機能を追加
- **責任分離**: 各モジュールが単一の明確な責任を持つ
- **拡張性確保**: 将来的な機能追加に対応できる柔軟な構造

### 1.2 統合戦略
```yaml
Phase 1: 既存システム保持 + 階層コンポーザー追加
Phase 2: テンプレート最適化 + A/B比較機能
Phase 3: 完全統合 + レガシー除去
```

## 2. 全体モジュール構成

### 2.1 アーキテクチャ概要
```
src/renderer/
├── engine/ (既存)
│   ├── Engine.ts
│   ├── InstanceManager.ts
│   ├── AnimationInstance.ts
│   └── [その他既存ファイル]
├── primitives/ (既存 + 拡張)
│   ├── [既存プリミティブ]
│   └── hierarchical/ (新規)
│       ├── core/
│       ├── composition/
│       └── optimization/
├── templates/ (既存 + 階層対応)
│   ├── [既存テンプレート]
│   └── hierarchical/ (新規)
│       ├── adapters/
│       ├── composers/
│       └── validators/
├── compatibility/ (新規)
│   ├── legacy-bridge/
│   ├── fallback-system/
│   └── migration-tools/
└── hierarchical/ (新規)
    ├── core/
    ├── managers/
    ├── validators/
    └── utilities/
```

### 2.2 モジュール分類

#### Core Modules (中核モジュール)
- **HierarchicalEngine**: 階層分離システムの中核エンジン
- **CompositionManager**: プリミティブ組み合わせ管理
- **HierarchyValidator**: 階層制約の検証・強制

#### Integration Modules (統合モジュール)
- **CompatibilityBridge**: 既存システムとの橋渡し
- **FallbackManager**: エラー時の既存システムフォールバック
- **TemplateComposer**: テンプレートの階層的実行管理

#### Support Modules (支援モジュール)
- **MetricsCollector**: パフォーマンス・品質メトリクス収集
- **SafetyValidator**: 実行時安全性検証
- **DevelopmentTools**: 開発・デバッグ支援

## 3. 詳細モジュール設計

### 3.1 Core Modules

#### 3.1.1 HierarchicalEngine
```typescript
/**
 * 階層分離システムの中核エンジン
 * 既存Engineと協調動作し、階層的処理を提供
 */
interface HierarchicalEngine {
  // 基本機能
  initialize(existingEngine: Engine): Promise<void>;
  processHierarchically(instance: AnimationInstance): Promise<HierarchicalResult>;
  
  // 階層別処理
  processPhraseLevel(data: PhraseProcessingData): Promise<PhraseResult>;
  processWordLevel(data: WordProcessingData): Promise<WordResult>;
  processCharacterLevel(data: CharacterProcessingData): Promise<CharacterResult>;
  
  // 統合処理
  composeResults(results: HierarchicalResults): Promise<ComposedResult>;
}
```

**責任範囲**:
- 階層別処理の調整
- プリミティブ組み合わせの最適化
- 結果の統合・合成

**既存システムとの関係**:
- Engine.ts と協調動作（置き換えではない）
- AnimationInstance からの呼び出しを受け取り
- 既存プリミティブを活用

#### 3.1.2 CompositionManager
```typescript
/**
 * プリミティブの階層的組み合わせを管理
 */
interface CompositionManager {
  // 組み合わせ戦略
  composeForTemplate(
    templateType: TemplateType,
    hierarchyLevel: HierarchyLevel
  ): CompositionStrategy;
  
  // 実行管理
  executeComposition(
    strategy: CompositionStrategy,
    data: ProcessingData
  ): Promise<CompositionResult>;
  
  // 最適化
  optimizeComposition(composition: Composition): OptimizedComposition;
}
```

**責任範囲**:
- 既存プリミティブの階層的組み合わせ
- テンプレート別最適化戦略の選択
- 実行効率の最適化

#### 3.1.3 HierarchyValidator
```typescript
/**
 * 階層制約の検証・強制
 */
interface HierarchyValidator {
  // 制約検証
  validateHierarchy(data: HierarchicalData): ValidationResult;
  validateResponsibility(level: HierarchyLevel, operation: Operation): ValidationResult;
  
  // 制約強制
  enforceConstraints(violation: ConstraintViolation): EnforcementResult;
  
  // 開発支援
  generateViolationReport(context: ValidationContext): ViolationReport;
}
```

**責任範囲**:
- Character/Word/Phrase の責任境界チェック
- 違反の検出・警告・修正
- 開発時のガイダンス提供

### 3.2 Integration Modules

#### 3.2.1 CompatibilityBridge
```typescript
/**
 * 既存システムと新階層システムの橋渡し
 */
interface CompatibilityBridge {
  // データ変換
  convertLegacyToHierarchical(legacyData: LegacyData): HierarchicalData;
  convertHierarchicalToLegacy(hierarchicalData: HierarchicalData): LegacyData;
  
  // 呼び出し変換
  bridgeAnimationInstanceCall(
    instance: AnimationInstance,
    hierarchicalEngine: HierarchicalEngine
  ): Promise<BridgeResult>;
  
  // パラメータ変換
  bridgeParameters(params: LegacyParams): HierarchicalParams;
}
```

**責任範囲**:
- AnimationInstance.update() からの呼び出し対応
- パラメータ形式の相互変換
- 既存インターフェースの保持

#### 3.2.2 FallbackManager
```typescript
/**
 * エラー時の既存システムフォールバック管理
 */
interface FallbackManager {
  // フォールバック判定
  shouldFallback(error: Error, context: ExecutionContext): boolean;
  
  // フォールバック実行
  executeFallback(
    instance: AnimationInstance,
    originalError: Error
  ): Promise<FallbackResult>;
  
  // 学習機能
  learnFromFailure(failure: FailureContext): void;
  
  // 監視機能
  getReliabilityMetrics(): ReliabilityMetrics;
}
```

**責任範囲**:
- 新システムエラー時の安全な復旧
- フォールバック判定の最適化
- 信頼性メトリクスの収集

#### 3.2.3 TemplateComposer
```typescript
/**
 * テンプレートの階層的実行管理
 */
interface TemplateComposer {
  // テンプレート分析
  analyzeTemplate(template: IAnimationTemplate): TemplateAnalysis;
  
  // 階層実行計画作成
  createExecutionPlan(
    template: IAnimationTemplate,
    instance: AnimationInstance
  ): HierarchicalExecutionPlan;
  
  // 実行管理
  executeHierarchically(
    plan: HierarchicalExecutionPlan
  ): Promise<HierarchicalExecutionResult>;
}
```

**責任範囲**:
- 既存テンプレートの階層的実行
- 実行計画の最適化
- 複数階層の協調制御

### 3.3 Support Modules

#### 3.3.1 MetricsCollector
```typescript
/**
 * パフォーマンス・品質メトリクス収集
 */
interface MetricsCollector {
  // パフォーマンスメトリクス
  collectPerformanceMetrics(execution: ExecutionContext): PerformanceMetrics;
  
  // 品質メトリクス
  collectQualityMetrics(result: ExecutionResult): QualityMetrics;
  
  // 比較分析
  compareWithLegacy(
    hierarchicalMetrics: Metrics,
    legacyMetrics: Metrics
  ): ComparisonReport;
  
  // レポート生成
  generateMetricsReport(): MetricsReport;
}
```

**責任範囲**:
- 実行時パフォーマンスの測定
- 新旧システムの比較分析
- 改善点の特定・提案

#### 3.3.2 SafetyValidator
```typescript
/**
 * 実行時安全性検証
 */
interface SafetyValidator {
  // 安全性チェック
  validateSafety(operation: Operation, context: Context): SafetyResult;
  
  // メモリ安全性
  validateMemoryUsage(state: SystemState): MemorySafetyResult;
  
  // 実行安全性
  validateExecution(executionPlan: ExecutionPlan): ExecutionSafetyResult;
  
  // 緊急停止
  emergencyStop(reason: EmergencyReason): void;
}
```

**責任範囲**:
- 実行時安全性の保証
- メモリリーク・過使用の防止
- 異常状態からの安全な回復

#### 3.3.3 DevelopmentTools
```typescript
/**
 * 開発・デバッグ支援
 */
interface DevelopmentTools {
  // 階層可視化
  visualizeHierarchy(data: HierarchicalData): HierarchyVisualization;
  
  // 実行トレース
  traceExecution(execution: ExecutionContext): ExecutionTrace;
  
  // A/B比較
  runABComparison(
    template: IAnimationTemplate,
    instance: AnimationInstance
  ): ABComparisonResult;
  
  // デバッグダッシュボード
  createDebugDashboard(): DebugDashboard;
}
```

**責任範囲**:
- 階層構造の可視化
- 実行過程のトレーシング
- A/B比較による検証支援

## 4. モジュール間連携

### 4.1 データフロー
```
AnimationInstance.update()
    ↓
CompatibilityBridge.bridgeAnimationInstanceCall()
    ↓
HierarchicalEngine.processHierarchically()
    ↓
CompositionManager.composeForTemplate()
    ↓
[Phrase/Word/Character処理]
    ↓
HierarchicalEngine.composeResults()
    ↓
CompatibilityBridge.convertHierarchicalToLegacy()
    ↓
AnimationInstance (結果適用)
```

### 4.2 エラーハンドリングフロー
```
任意のモジュールでエラー発生
    ↓
SafetyValidator.validateSafety()
    ↓
FallbackManager.shouldFallback()
    ↓ (Yes)
FallbackManager.executeFallback()
    ↓
既存システムでの安全な実行
```

### 4.3 メトリクス収集フロー
```
全モジュールの実行
    ↓ (並行)
MetricsCollector.collectPerformanceMetrics()
MetricsCollector.collectQualityMetrics()
    ↓
DevelopmentTools.createDebugDashboard()
    ↓
開発者への可視化提供
```

## 5. 実装優先度

### 5.1 Phase 1 (Week 1)
**必須モジュール**:
1. CompatibilityBridge (基本機能)
2. FallbackManager (安全機能)
3. CompositionManager (基本組み合わせ)

**目標**: 既存システムを破壊せずに階層機能の基礎を構築

### 5.2 Phase 2 (Week 2)  
**追加モジュール**:
1. HierarchicalEngine (完全版)
2. TemplateComposer (テンプレート対応)
3. SafetyValidator (安全性強化)

**目標**: 単一テンプレートの完全階層化

### 5.3 Phase 3 (Week 3)
**支援モジュール**:
1. MetricsCollector (測定機能)
2. DevelopmentTools (開発支援)
3. HierarchyValidator (制約強化)

**目標**: 全テンプレートの統合と品質保証

## 6. 品質保証

### 6.1 テスト戦略
- **単体テスト**: 各モジュールの独立テスト
- **統合テスト**: モジュール間連携のテスト
- **回帰テスト**: 既存機能の保持確認
- **パフォーマンステスト**: 新旧システムの比較

### 6.2 検証基準
- **機能完全性**: 既存機能の100%保持
- **視覚一致性**: ピクセルレベルでの一致
- **パフォーマンス**: 既存比95%以上維持
- **安定性**: エラー率1%未満

## 7. リスク管理

### 7.1 技術リスク
- **モジュール複雑性**: 段階的実装による管理
- **統合不具合**: 互換性レイヤーでの緩衝
- **パフォーマンス劣化**: 継続監視による早期発見

### 7.2 対策
- **フォールバック機能**: 全モジュールに安全機構
- **段階的有効化**: フィーチャーフラグによる制御
- **継続的監視**: リアルタイムメトリクス収集

この設計により、安定性・拡張性・保守性を兼ね備えた階層分離システムを実現します。