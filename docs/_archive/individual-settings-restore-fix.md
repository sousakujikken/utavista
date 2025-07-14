# 個別設定復元問題の修正実装計画

## 概要

フレーズ個別テンプレートパラメータ設定において、保存プロジェクトファイルの読み込み時は正しく復元されるが、自動保存からの復元時にデフォルトテンプレートパラメータが適用されてしまう問題の修正計画です。

## 問題の詳細

### 症状
- **ファイル読み込み時**: 個別設定が正しく復元される
- **自動保存復元時**: 個別設定が失われ、デフォルトテンプレートパラメータが適用される

### 根本原因

1. **個別設定適用処理の欠如**
   - ファイル読み込み: `applyIndividualSettingsToAnimation()`が呼ばれる
   - 自動保存復元: この処理が完全に欠如

2. **復元順序の問題**
   ```
   自動保存復元の問題順序:
   1. ParameterManager.importParameters() ← 個別設定は正常に復元
   2. restoreTemplatePreservingIndividualSettings() ← ここで個別設定が上書き
   3. InstanceManager.updateTemplate() ← デフォルトテンプレートで再構築
   ```

3. **遅延処理の有無**
   - ファイル読み込み: 150ms + 300msの遅延でPIXI初期化完了を待機
   - 自動保存復元: 即座に実行され、初期化完了前に処理

4. **パラメータ管理の二重管理**
   - ParameterManager（新方式）+ ParamService（レガシー）+ ProjectStateManager（履歴）
   - 同一パラメータが3つのシステムで管理される

## 実装計画

### Phase 1: 緊急修正（優先度：高）

**目標**: 自動保存復元時の個別設定問題を即座に解決  
**工数**: 0.5日  
**実装期限**: 即座

#### 1.1 自動保存復元での個別設定適用追加

**ファイル**: `src/renderer/engine/Engine.ts`  
**メソッド**: `loadFromLocalStorage()`

```typescript
// Engine.loadFromLocalStorage() 内の最後に追加
if (projectState.individualSettingsEnabled?.length > 0) {
  // ファイル読み込みと同じ遅延タイミングで個別設定を適用
  setTimeout(() => {
    this.applyIndividualSettingsFromData(projectState.individualSettingsEnabled);
  }, 450);
}

// 新規メソッド作成
private applyIndividualSettingsFromData(individualSettingsEnabled: string[]): void {
  individualSettingsEnabled.forEach(objectId => {
    // 個別設定の有効化
    this.parameterManager.enableIndividualSetting(objectId);
    
    // パラメータの再適用
    const objectParams = this.parameterManager.getObjectParams(objectId);
    if (objectParams) {
      this.updateObjectInstance(objectId);
    }
  });
  
  // インスタンス全体の更新
  this.instanceManager.updateExistingInstances();
  this.instanceManager.update(this.currentTime);
}
```

#### 1.2 テンプレート復元時の個別設定保護強化

**ファイル**: `src/renderer/engine/Engine.ts`  
**メソッド**: `restoreTemplatePreservingIndividualSettings()`

```typescript
private async restoreTemplatePreservingIndividualSettings(
  template: IAnimationTemplate,
  selectedTemplate: string,
  templateParams: any
): Promise<void> {
  // 個別設定の保護
  const preservedSettings = this.parameterManager.getIndividualSettingEnabledObjects();
  const preservedParams = new Map<string, StandardParameters>();
  
  preservedSettings.forEach(objectId => {
    const params = this.parameterManager.getObjectParams(objectId);
    if (params) {
      preservedParams.set(objectId, JSON.parse(JSON.stringify(params)));
    }
  });

  // 既存のテンプレート復元処理
  const mergedParams = { ...this.parameterManager.getGlobalParams(), ...templateParams };
  this.parameterManager.updateGlobalParams(mergedParams);

  if (this.instanceManager) {
    this.instanceManager.updateTemplate(template, mergedParams);
    this.instanceManager.update(this.currentTime);
  }

  // 個別設定の復元
  preservedParams.forEach((params, objectId) => {
    this.parameterManager.updateObjectParams(objectId, params);
    this.updateObjectInstance(objectId);
  });
}
```

### Phase 2: 構造改善（優先度：中）

**目標**: 復元処理の統一とアーキテクチャ改善  
**工数**: 1週間  
**実装期限**: 1ヶ月以内

#### 2.1 統一復元マネージャーの実装

**新規ファイル**: `src/renderer/engine/UnifiedRestoreManager.ts`

```typescript
export class UnifiedRestoreManager {
  constructor(
    private engine: Engine,
    private parameterManager: ParameterManager,
    private projectStateManager: ProjectStateManager
  ) {}

  async restoreFromFile(data: ProjectFileData): Promise<void> {
    await this.restoreCore(this.normalizeFileData(data));
  }

  async restoreFromAutoSave(data: AutoSaveData): Promise<void> {
    await this.restoreCore(this.normalizeAutoSaveData(data));
  }

  private async restoreCore(normalizedData: NormalizedProjectData): Promise<void> {
    // 1. パラメータ復元
    this.parameterManager.importParameters({
      global: normalizedData.globalParams,
      objects: normalizedData.objectParams,
      individualSettingsEnabled: normalizedData.individualSettingsEnabled
    });

    // 2. テンプレート復元（個別設定保護付き）
    await this.restoreTemplateWithProtection(
      normalizedData.templateId,
      normalizedData.templateParams
    );

    // 3. 個別設定適用（遅延処理）
    if (normalizedData.individualSettingsEnabled.length > 0) {
      setTimeout(() => {
        this.applyIndividualSettings(normalizedData.individualSettingsEnabled);
      }, 450);
    }
  }
}
```

#### 2.2 データ構造の正規化

**新規ファイル**: `src/types/UnifiedProjectData.ts`

```typescript
interface NormalizedProjectData {
  version: string;
  lyricsData: PhraseUnit[];
  globalParams: StandardParameters;
  objectParams: Record<string, StandardParameters>;
  individualSettingsEnabled: string[];
  templateId: string;
  templateParams: StandardParameters;
  templateAssignments: Record<string, string>;
  stageConfig: StageConfig;
  backgroundConfig: BackgroundConfig;
  audioInfo: AudioReference;
}

export class ProjectDataNormalizer {
  static fromFileData(data: ProjectFileData): NormalizedProjectData { }
  static fromAutoSaveData(data: AutoSaveData): NormalizedProjectData { }
  static toFileData(data: NormalizedProjectData): ProjectFileData { }
  static toAutoSaveData(data: NormalizedProjectData): AutoSaveData { }
}
```

### Phase 3: 長期改善（優先度：低）

**目標**: システム全体のアーキテクチャ改善  
**工数**: 2週間  
**実装期限**: 3ヶ月以内

#### 3.1 パラメータ管理の一元化

**目標**: ParameterManagerへの完全統一、ParamServiceの段階的廃止

```typescript
// ParamServiceの機能をParameterManagerに統合
class ParameterManager {
  // 既存機能 + ParamServiceから移行
  updateLyricsDataParams(phrases: PhraseUnit[]): void {
    // 歌詞データ内のパラメータをParameterManagerで管理
  }
  
  exportToLyricsData(): PhraseUnit[] {
    // 必要に応じて歌詞データにパラメータを埋め込み
  }
}
```

#### 3.2 レガシーメソッドの削除

**目標**: Phase 2で分離したレガシーメソッドの削除

**削除対象**:
- `Engine.loadProjectLegacy()` メソッド
- `Engine.loadFromLocalStorageLegacy()` メソッド
- `Engine.restoreTemplatePreservingIndividualSettings()` メソッド（統一復元マネージャーに統合済み）
- `Engine.applyIndividualSettingsFromData()` メソッド（統一復元マネージャーに統合済み）

**削除手順**:
1. 統一復元マネージャーの安定稼働を3ヶ月間確認
2. レガシーメソッドの使用状況をログで監視
3. 使用されていないことを確認後、段階的に削除
4. コード重複の完全な排除

```typescript
// 削除予定のメソッド一覧
class Engine {
  // ❌ 削除予定: loadProjectLegacy(config: any): boolean
  // ❌ 削除予定: loadFromLocalStorageLegacy(): Promise<boolean>
  // ❌ 削除予定: restoreTemplatePreservingIndividualSettings()
  // ❌ 削除予定: applyIndividualSettingsFromData()
}
```

#### 3.3 統合状態管理システム

**新規ファイル**: `src/renderer/engine/IntegratedStateManager.ts`

```typescript
export class IntegratedStateManager {
  private parameterManager: ParameterManager;
  private projectHistory: ProjectState[];
  
  saveCurrentState(label?: string): void {
    // 統一された状態保存
  }
  
  restoreState(data: UnifiedProjectData): Promise<void> {
    // 統一された状態復元
  }
  
  undo(): void { }
  redo(): void { }
}
```

## テスト計画

### Phase 1 テスト
- [ ] 自動保存データから復元時の個別設定適用確認
- [ ] ファイル読み込み時の既存動作が影響を受けないことの確認
- [ ] 複数フレーズの個別設定が正しく復元されることの確認
- [ ] テンプレート変更時の個別設定保護確認

### Phase 2 テスト
- [ ] 統一復元マネージャーでのファイル読み込み/自動保存復元の動作確認
- [ ] データ正規化処理の正確性確認
- [ ] 既存機能への影響がないことの確認

### Phase 3 テスト
- [ ] パラメータ管理一元化後の全機能テスト
- [ ] レガシーメソッド削除後の安定性テスト
- [ ] パフォーマンステスト
- [ ] 統合テスト

## リスク分析

### 高リスク
- **Phase 1**: 遅延処理のタイミング調整により他機能への影響
- **Phase 2**: 復元処理の変更による既存データの互換性問題

### 中リスク
- **Phase 3**: 大規模リファクタリングによる予期しない副作用

### 低リスク
- 新機能追加による既存機能への影響は限定的

## 実装スケジュール

```
Week 1: Phase 1 実装・テスト
├── Day 1-2: 緊急修正実装
├── Day 3-4: テスト・デバッグ
└── Day 5: リリース準備

Week 2-5: Phase 2 実装・テスト
├── Week 2: UnifiedRestoreManager実装
├── Week 3: データ正規化実装
├── Week 4: 統合テスト
└── Week 5: リリース準備

Week 6-13: Phase 3 実装・テスト（長期）
├── Week 6-9: パラメータ管理一元化
├── Week 10-11: レガシーメソッド削除
├── Week 12: 統合状態管理システム
└── Week 13: 最終テスト・リリース
```

## 成功指標

- [ ] 自動保存復元時の個別設定が100%正しく復元される
- [ ] ファイル読み込み時の既存動作が維持される
- [ ] コードの重複が70%以上削減される（レガシーメソッド削除により）
- [ ] パラメータ管理の一元化が完了する
- [ ] レガシーメソッドが完全に削除される
- [ ] システム全体の型安全性が向上する

## 関連ドキュメント

- [Template Implementation Guide](./template-implementation-guide.md)
- [Parameter Management Architecture](./parameter-management-architecture.md)
- [Project State Management](./project-state-management.md)

---

**作成日**: 2025-01-01  
**最終更新**: 2025-01-01  
**担当者**: 開発チーム  
**承認者**: アーキテクト  