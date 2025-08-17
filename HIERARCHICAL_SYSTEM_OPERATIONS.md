# 階層分離システム運用ガイド

**バージョン**: 1.0.0  
**作成日**: 2025-08-07  
**対象**: 階層分離システム v1.0

## 📋 概要

このドキュメントは、UTAVISTA階層分離システムの本番運用に必要な手順、監視方法、トラブルシューティングを提供します。

## 🏗 システム構成

### 核心コンポーネント

1. **Phase 1: 音楽同期基盤**
   - `SimplePrecisionTimeManager` - 音楽同期（95%精度）
   - `CoreSynchronizationEngine` - 階層処理エンジン
   - `HierarchicalWrapper` - 既存システム統合
   - `SimpleFrameScheduler` - 60FPS保証
   - `RenderingPipeline` - 責任分離レンダリング

2. **Phase 2: プリミティブAPI**
   - `PrimitiveAPIManager` - プリミティブ実行管理
   - `ResponsibilityValidator` - 責任分離検証
   - 階層別プリミティブ（Phrase/Word/Character）

3. **Phase 3: システム統合**
   - `CompatibilityLayer` - 完全互換統合
   - `ComprehensiveQualityAssurance` - 品質保証
   - `ProductionReadinessAssessment` - 本番準備評価

### 責任分離アーキテクチャ

```
Phrase Level    : positioning, fade, group_movement
Word Level      : character_management, spacing, grouping  
Character Level : text_rendering, individual_animation, effects
```

**重要**: この責任分離は100%厳守されており、違反時は自動的に実行が拒否されます。

## 🚀 デプロイメント手順

### 1. デプロイ前チェック

```bash
# 1. ビルド確認
npm run build

# 2. 品質ゲート実行（推奨）
# ComprehensiveQualityAssurance.executeComprehensiveQA() を実行

# 3. 本番準備度確認
# ProductionReadinessAssessment.assessProductionReadiness() を実行
```

### 2. 段階的デプロイメント

```typescript
// Step 1: 階層システムを無効状態でデプロイ
const hierarchicalEnabled = false;

// Step 2: 監視システムで安定性確認後、段階的に有効化
const wrapper = new HierarchicalWrapper(instance, audioElement, {
  enableHierarchical: true,
  fallbackOnError: true,
  maxErrorCount: 3
});

// Step 3: 問題発生時は即座にフォールバック
wrapper.setHierarchicalEnabled(false);
```

### 3. ロールバック手順

```typescript
// 緊急時: 全インスタンスを既存システムに復帰
wrapperInstances.forEach(wrapper => {
  wrapper.restoreOriginal();
});

// または個別復帰
wrapper.setHierarchicalEnabled(false);
```

## 📊 監視・メトリクス

### 1. 重要メトリクス

**音楽同期精度**
```typescript
// 目標: >95%
const syncStats = timeManager.measureSyncAccuracy();
console.log(`Sync accuracy: ${(syncStats.accuracyRate * 100).toFixed(1)}%`);

// アラート条件: < 95%
if (syncStats.accuracyRate < 0.95) {
  alert('CRITICAL: Music sync accuracy below threshold');
}
```

**フレームレート安定性**
```typescript
// 目標: 60FPS (58FPS以上で正常)
const frameStats = frameScheduler.getFrameStats();
console.log(`Average FPS: ${frameStats.averageFPS.toFixed(1)}`);

// アラート条件: < 58FPS
if (frameStats.averageFPS < 58) {
  alert('WARNING: Frame rate below 58 FPS');
}
```

**責任分離遵守率**
```typescript
// 目標: 100%
const validationStats = ResponsibilityValidator.getValidationStats();
const complianceRate = (validationStats.totalValidations - validationStats.totalViolations) / validationStats.totalValidations;

// アラート条件: < 100%
if (complianceRate < 1.0) {
  alert('CRITICAL: Responsibility separation violations detected');
}
```

**メモリ使用量**
```typescript
// メモリリーク監視
const memoryBefore = performance.memory?.usedJSHeapSize || 0;
// ... システム実行 ...
const memoryAfter = performance.memory?.usedJSHeapSize || 0;
const memoryIncrease = memoryAfter - memoryBefore;

// アラート条件: > 50MB増加
if (memoryIncrease > 50 * 1024 * 1024) {
  alert('WARNING: Potential memory leak detected');
}
```

### 2. システム健康度チェック

```typescript
// 定期実行（推奨: 5分間隔）
function systemHealthCheck() {
  const health = {
    syncAccuracy: timeManager.measureSyncAccuracy(),
    frameRate: frameScheduler.getFrameStats(),
    violations: ResponsibilityValidator.getValidationStats(),
    integration: compatibilityLayer.getIntegrationStats()
  };
  
  // 健康度スコア計算
  const healthScore = calculateHealthScore(health);
  
  if (healthScore < 80) {
    console.warn('System health degraded:', health);
  }
  
  return health;
}
```

## 🔧 トラブルシューティング

### 1. 音楽同期問題

**症状**: 音声と映像の同期ズレ

**診断**:
```typescript
const debugInfo = timeManager.getDebugInfo();
console.log('Time manager debug info:', debugInfo);
```

**対処法**:
1. HTMLAudioElement状態確認
2. performance.now()精度確認
3. 必要に応じてフォールバック

### 2. フレームドロップ

**症状**: アニメーションのカクつき

**診断**:
```typescript
const frameQuality = frameScheduler.getFrameQuality();
const budgetViolations = frameScheduler.getDebugInfo().performance.budgetViolationRate;
```

**対処法**:
1. フレーム予算調整
2. プリミティブ処理最適化
3. レンダリング負荷軽減

### 3. 責任分離違反

**症状**: ResponsibilityViolationError発生

**診断**:
```typescript
const violations = ResponsibilityValidator.getValidationStats();
console.log('Recent violations:', ResponsibilityValidator.getDebugInfo());
```

**対処法**:
1. 違反箇所特定
2. プリミティブ実装修正
3. システム整合性確認

### 4. メモリリーク

**症状**: メモリ使用量継続増加

**診断**:
```typescript
// メモリ使用量トラッキング
const memoryTracking = {
  initial: performance.memory?.usedJSHeapSize || 0,
  current: performance.memory?.usedJSHeapSize || 0,
  increase: 0
};

setInterval(() => {
  memoryTracking.current = performance.memory?.usedJSHeapSize || 0;
  memoryTracking.increase = memoryTracking.current - memoryTracking.initial;
  
  if (memoryTracking.increase > 100 * 1024 * 1024) { // 100MB
    console.warn('Memory leak suspected:', memoryTracking);
  }
}, 60000); // 1分間隔
```

**対処法**:
1. キャッシュクリア: `compatibilityLayer.clearCache()`
2. インスタンス解放確認
3. ガベージコレクション強制実行

### 5. 統合エラー

**症状**: 既存システムとの統合失敗

**診断**:
```typescript
const integrationStats = compatibilityLayer.getIntegrationStats();
const wrapperStats = wrapper.getStats();
```

**対処法**:
1. 互換性レイヤー状態確認
2. 既存システム復帰: `wrapper.restoreOriginal()`
3. 段階的統合再試行

## ⚠️ 緊急時対応

### システム全体停止

```typescript
// 緊急停止手順
function emergencyShutdown() {
  // 1. 階層システム無効化
  allWrappers.forEach(wrapper => wrapper.setHierarchicalEnabled(false));
  
  // 2. キャッシュクリア
  compatibilityLayer.clearCache();
  
  // 3. 既存システム完全復帰
  allWrappers.forEach(wrapper => wrapper.restoreOriginal());
  
  console.log('Emergency shutdown completed');
}
```

### データ保護

```typescript
// 重要データの緊急保存
function emergencyDataSave() {
  const criticalData = {
    syncStats: timeManager.measureSyncAccuracy(),
    frameStats: frameScheduler.getFrameStats(),
    violations: ResponsibilityValidator.getValidationStats(),
    integrationStats: compatibilityLayer.getIntegrationStats()
  };
  
  localStorage.setItem('emergency_system_state', JSON.stringify(criticalData));
  console.log('Critical system state saved');
}
```

## 📈 パフォーマンス最適化

### 1. プリミティブ最適化

```typescript
// プリミティブ実行統計分析
const primitiveStats = primitiveManager.getExecutionStats();

// 遅いプリミティブの特定
if (primitiveStats.averageExecutionTime > 50) { // 50ms
  console.warn('Slow primitive detected, consider optimization');
}
```

### 2. メモリ最適化

```typescript
// 定期的なメモリクリーンアップ
setInterval(() => {
  compatibilityLayer.clearCache();
  
  if (typeof window !== 'undefined' && window.gc) {
    window.gc(); // 開発環境でのガベージコレクション
  }
}, 300000); // 5分間隔
```

## 🔍 ログ・デバッグ

### 推奨ログレベル

```typescript
// 本番環境
console.log('INFO: System health check passed');
console.warn('WARNING: Performance degradation detected');
console.error('ERROR: Critical system failure');

// 開発環境
console.debug('DEBUG: Primitive execution details');
```

### デバッグ情報収集

```typescript
function collectDebugInfo() {
  return {
    timestamp: new Date().toISOString(),
    timeManager: timeManager.getDebugInfo(),
    frameScheduler: frameScheduler.getDebugInfo(),
    validator: ResponsibilityValidator.getDebugInfo(),
    primitiveManager: primitiveManager.getDebugInfo(),
    compatibilityLayer: compatibilityLayer.getDebugInfo()
  };
}
```

## 📞 サポート・エスカレーション

### エラー報告フォーマット

```
件名: [HIERARCHICAL_SYSTEM] 緊急度 - 問題概要

環境:
- システムバージョン: 
- ブラウザ: 
- OS: 

問題:
- 発生時刻: 
- 症状: 
- 再現手順: 

デバッグ情報:
- システム健康度: 
- エラーログ: 
- メトリクス: 
```

### 対応レベル

- **レベル1**: フォールバック実行可能 → 監視継続
- **レベル2**: 部分機能停止 → 1時間以内対応
- **レベル3**: システム全体影響 → 緊急対応

---

## 📚 関連ドキュメント

- `development-directive-final.md` - 開発指示書
- `responsibility-separation-detailed-design.md` - 責任分離設計
- `quality-assurance-design.md` - 品質保証設計

## 🔄 定期保守

### 週次タスク
- [ ] システム健康度レポート確認
- [ ] パフォーマンスメトリクス分析
- [ ] エラーログレビュー

### 月次タスク
- [ ] 包括的品質保証実行
- [ ] メモリ使用量トレンド分析
- [ ] 本番準備度再評価

---

**重要**: このシステムは100%の責任分離を保証し、違反時は自動的にフォールバックします。安全性とパフォーマンスの両立を実現した設計です。