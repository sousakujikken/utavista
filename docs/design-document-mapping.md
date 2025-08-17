# 設計ドキュメントマッピングと整合性確認

## 1. ドキュメント体系の現状分析

### 1.1 核心設計ドキュメント（最新・有効）

| ドキュメント | 内容 | ステータス | 開発指示書での参照 |
|------------|------|-----------|------------------|
| **core-focused-design-revision.md** | 核心機能重視設計（音楽同期・API） | ✅ 最新 | Phase 1-3全体 |
| **development-directive-revised.md** | 開発指示書（現実的版） | ✅ 最新 | 実装全体 |
| **focused-engineering-review.md** | エンジニアレビュー結果 | ✅ 最新 | 品質基準 |
| **revised-implementation-plan.md** | 実装計画書 | ✅ 最新 | スケジュール |

### 1.2 階層分離システム設計（要確認）

| ドキュメント | 内容 | ステータス | 問題点 |
|------------|------|-----------|--------|
| hierarchical-animation-model.md | 階層アニメーションモデル | ⚠️ 要確認 | 責任分離の詳細不足 |
| hierarchical-system-module-architecture.md | モジュールアーキテクチャ | ❌ 過剰設計 | 9モジュール→3モジュールに修正必要 |
| comprehensive-module-specifications.md | 包括的モジュール仕様 | ❌ 過剰設計 | 簡素化必要 |

### 1.3 プリミティブ設計（部分的有効）

| ドキュメント | 内容 | ステータス | 問題点 |
|------------|------|-----------|--------|
| primitive-api-specification.md | プリミティブAPI仕様 | ⚠️ 部分有効 | 責任分離更新必要 |
| primitive-responsibility-specification.md | 責任分離仕様 | ✅ 有効 | Phase 2で参照 |
| primitive-architecture-design.md | アーキテクチャ設計 | ⚠️ 要更新 | 簡素化必要 |

## 2. 設計の不整合点

### 2.1 🔴 重大な不整合

**問題1: モジュール数の不一致**
```
development-directive-revised.md: 3モジュール（SimplePrecisionTimeManager等）
hierarchical-system-module-architecture.md: 9モジュール（過剰）
→ 3モジュール設計に統一必要
```

**問題2: 音楽同期精度の不一致**
```
development-directive.md: 99.9%精度（0.5ms以内）- 過剰
development-directive-revised.md: 95%精度（5ms以内）- 現実的
→ 95%精度（5ms以内）に統一
```

**問題3: Electronネイティブ最適化の扱い**
```
electron-native-optimization-analysis.md: ナノ秒精度追求
development-directive-revised.md: 既存ライブラリ活用
→ 既存ライブラリ活用に統一
```

### 2.2 ⚠️ 中程度の不整合

**問題4: プリミティブAPIの詳細度**
```
primitive-api-specification.md: 詳細な型定義
development-directive-revised.md: シンプルな実装
→ 必要最小限の型定義に調整
```

**問題5: テンプレート実装ガイドの複数存在**
```
template-implementation-guide.md
new-template-implementation-guide.md
template-quick-start-guide.md
→ 統合・整理必要
```

## 3. 必要な詳細設計ドキュメント（新規作成）

### 3.1 責任分離詳細設計書

**ファイル名**: `responsibility-separation-detailed-design.md`

**内容**:
- 階層別責任の完全定義
- 禁止操作の明確化
- 実装時のチェックポイント
- コード例（正しい例・間違い例）

### 3.2 既存システム統合設計書

**ファイル名**: `existing-system-integration-design.md`

**内容**:
- AnimationInstanceとの統合方法
- データ変換仕様
- 互換性維持戦略
- 移行手順

### 3.3 品質保証設計書

**ファイル名**: `quality-assurance-design.md`

**内容**:
- テスト戦略
- 品質ゲート定義
- 測定方法
- 成功基準

## 4. 整合性修正アクションプラン

### 4.1 即座修正必要（Phase 1開始前）

1. **モジュール設計の統一**
   - 3モジュール構成に全ドキュメント統一
   - 不要な複雑性を削除

2. **音楽同期仕様の統一**
   - 95%精度（5ms以内）に統一
   - HTMLAudioElement活用明記

3. **責任分離詳細設計書作成**
   - Phase 1実装前に必須

### 4.2 段階的修正（開発並行）

1. **プリミティブAPI仕様の簡素化**
   - Phase 2開始前に完了

2. **テンプレートガイド統合**
   - Phase 3までに完了

## 5. ドキュメント参照マップ

### Phase 1: 核心エンジン実装（Week 1-2）

**主要参照ドキュメント**:
1. `core-focused-design-revision.md` - 設計思想
2. `responsibility-separation-detailed-design.md` - 責任分離ルール（要作成）
3. `existing-system-integration-design.md` - 統合方法（要作成）

**実装ファイル** → **参照セクション**:
- `SimplePrecisionTimeManager.ts` → core-focused-design-revision.md#3.1
- `CoreSynchronizationEngine.ts` → core-focused-design-revision.md#2.1
- `RenderingPipeline.ts` → core-focused-design-revision.md#3.2

### Phase 2: プリミティブAPI（Week 3-4）

**主要参照ドキュメント**:
1. `primitive-responsibility-specification.md` - 責任定義
2. `primitive-api-specification.md` - API仕様（簡素化版）

**実装ファイル** → **参照セクション**:
- `PrimitiveAPIManager.ts` → primitive-responsibility-specification.md#2
- `ResponsibilityValidator.ts` → responsibility-separation-detailed-design.md#3
- 各プリミティブ実装 → primitive-api-specification.md#4

### Phase 3: 統合・検証（Week 5）

**主要参照ドキュメント**:
1. `quality-assurance-design.md` - 品質保証（要作成）
2. `revised-implementation-plan.md` - 成功基準

**実装タスク** → **参照セクション**:
- 統合テスト → quality-assurance-design.md#2
- 品質ゲート → revised-implementation-plan.md#3

## 6. 不整合解決の優先順位

### 🔴 最優先（即座対応）

1. **責任分離詳細設計書の作成**
   - Phase 1実装のブロッカー
   - 1日以内に作成必要

2. **モジュール数の統一**
   - 全ドキュメントで3モジュールに統一
   - 混乱防止のため即座修正

### ⚠️ 高優先（Week 1中）

3. **既存システム統合設計書の作成**
   - Week 1後半で必要
   - AnimationInstance統合方法明確化

4. **音楽同期仕様の統一**
   - 95%精度（5ms以内）で統一
   - 過剰な精度追求を排除

### 📋 中優先（Phase 2前）

5. **プリミティブAPI仕様の簡素化**
   - Week 3開始前に完了
   - 実装に必要な最小限に

6. **品質保証設計書の作成**
   - Week 5前に必要
   - テスト戦略明確化

## 7. 次のアクション

### 即座実行

1. `responsibility-separation-detailed-design.md` 作成
2. 既存ドキュメントの不整合箇所修正
3. 開発者向け参照ガイド作成

### 確認事項

- [ ] 責任分離ルールが全ドキュメントで一致
- [ ] モジュール数が3つで統一
- [ ] 音楽同期精度が95%（5ms）で統一
- [ ] 既存ライブラリ活用方針が明確
- [ ] 各Phaseの参照ドキュメントが明確

この整合性確認により、以下の問題を発見しました：
1. モジュール設計の不一致（9個→3個）
2. 音楽同期精度の不一致（99.9%→95%）
3. 必須設計書の不足（責任分離詳細、統合設計、品質保証）

これらを修正してから実装を開始すべきです。