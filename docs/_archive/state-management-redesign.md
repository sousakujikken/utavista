# 状態管理システム再設計仕様書

## 概要

Visiblyricsの状態管理システムにおける冗長性と不整合を解決するため、データ形式の統一と復元プロセスの再設計を実施します。

## 現状の問題

### 1. 状態管理の重複
- テンプレート状態が4箇所で管理されている
- データ形式が統一されていない
- 復元プロセスが複数存在し、結果に不整合が生じる

### 2. データ形式の分散
```typescript
// 現状の問題例
ProjectFile: { globalTemplateId: string }
AutoSave: { selectedTemplate: string }
ProjectState: { templateAssignments: Record<string, string> }
ObjectParams: { templateId: string }
```

## 新しいアーキテクチャ設計

### 1. 単一責任の原則

#### A. TemplateManager（唯一の真実の源）
```typescript
interface TemplateManager {
  // グローバルテンプレート
  private defaultTemplateId: string;
  
  // オブジェクト別テンプレート割り当て
  private assignments: Map<string, string>;
  
  // 状態のエクスポート・インポート
  exportState(): TemplateState;
  importState(state: TemplateState): void;
}
```

#### B. 統一されたテンプレート状態インターfaces
```typescript
interface TemplateState {
  defaultTemplateId: string;
  assignments: Record<string, string>;
}
```

### 2. 統一データ形式

#### A. 統一プロジェクトデータ構造
```typescript
interface UnifiedProjectData {
  // メタデータ
  version: string;
  metadata: ProjectMetadata;
  
  // コンテンツデータ
  audio: AudioReference;
  lyricsData: PhraseUnit[];
  
  // 状態データ（統一）
  templateState: TemplateState;
  parameterState: ParameterState;
  
  // UI設定
  stageConfig: StageConfig;
  backgroundColor?: string;
  backgroundImage?: string;
  
  // 機能設定
  individualSettingsEnabled?: string[];
}
```

#### B. 自動保存データ構造の簡素化
```typescript
interface AutoSaveData {
  version: string;
  timestamp: number;
  projectData: UnifiedProjectData; // プロジェクトファイルと同一構造
  recentFiles?: RecentFilesData;
}
```

### 3. 統一復元インターface

#### A. 復元インターfaceの設計
```typescript
interface ProjectRestorer {
  // 統一復元メソッド
  restore(data: UnifiedProjectData): Promise<void>;
  
  // バリデーション
  validate(data: unknown): UnifiedProjectData;
  
  // マイグレーション
  migrate(data: unknown, fromVersion: string): UnifiedProjectData;
}
```

#### B. 復元フローの統一
```typescript
class UnifiedProjectRestorer implements ProjectRestorer {
  async restore(data: UnifiedProjectData): Promise<void> {
    // 1. バリデーション
    const validatedData = this.validate(data);
    
    // 2. 状態クリア
    await this.clearCurrentState();
    
    // 3. 順序付き復元
    await this.restoreAudio(validatedData.audio);
    await this.restoreLyrics(validatedData.lyricsData);
    await this.restoreTemplates(validatedData.templateState);
    await this.restoreParameters(validatedData.parameterState);
    await this.restoreStage(validatedData.stageConfig);
    
    // 4. 整合性検証
    await this.validateConsistency();
  }
}
```

## 実装計画

### Phase 1: データ構造の統一

#### 1.1 新しいインターfaceの定義
```typescript
// src/types/unified-project-data.ts
export interface UnifiedProjectData {
  // 統一されたプロジェクトデータ構造
}

export interface TemplateState {
  defaultTemplateId: string;
  assignments: Record<string, string>;
}

export interface ParameterState {
  global: Record<string, any>;
  objects: Record<string, Record<string, any>>;
}
```

#### 1.2 TemplateManagerの拡張
```typescript
// src/renderer/engine/TemplateManager.ts
class TemplateManager {
  // 状態のエクスポート
  exportState(): TemplateState {
    return {
      defaultTemplateId: this.defaultTemplateId,
      assignments: Object.fromEntries(this.assignments)
    };
  }
  
  // 状態のインポート
  importState(state: TemplateState): void {
    this.defaultTemplateId = state.defaultTemplateId;
    this.assignments = new Map(Object.entries(state.assignments));
    this.notifyStateChange();
  }
}
```

### Phase 2: 統一復元システム

#### 2.1 ProjectRestorerの実装
```typescript
// src/renderer/services/ProjectRestorer.ts
export class ProjectRestorer {
  constructor(
    private engine: Engine,
    private templateManager: TemplateManager,
    private parameterManager: ParameterManager,
    private projectStateManager: ProjectStateManager
  ) {}
  
  async restore(data: UnifiedProjectData): Promise<void> {
    // 統一復元ロジック
  }
  
  validate(data: unknown): UnifiedProjectData {
    // バリデーションロジック
  }
  
  migrate(data: unknown, fromVersion: string): UnifiedProjectData {
    // マイグレーションロジック
  }
}
```

#### 2.2 マイグレーション機能
```typescript
interface DataMigrator {
  // 旧プロジェクトファイル形式からの移行
  migrateFromProjectFile(data: ProjectFileData): UnifiedProjectData;
  
  // 旧自動保存形式からの移行
  migrateFromAutoSave(data: OldAutoSaveData): UnifiedProjectData;
  
  // バージョン間移行
  migrateVersion(data: any, fromVersion: string, toVersion: string): UnifiedProjectData;
}
```

### Phase 3: 統合と最適化

#### 3.1 既存システムの統合
- ProjectFileManagerの更新
- PersistenceServiceの簡素化
- Engineの復元ロジック統一

#### 3.2 後方互換性の確保
```typescript
// 旧形式のサポート
const SUPPORTED_LEGACY_VERSIONS = [
  '0.0.1', '0.0.2', '0.0.3', '0.1.0'
];

function detectDataFormat(data: unknown): 'unified' | 'legacy-project' | 'legacy-autosave' {
  // 形式判定ロジック
}
```

## 移行手順

### 1. 段階的移行
1. **Phase 1**: 新しいデータ構造の並行実装
2. **Phase 2**: 統一復元システムの導入
3. **Phase 3**: 旧システムの段階的廃止

### 2. テスト戦略
```typescript
// テストケース
describe('UnifiedProjectRestorer', () => {
  it('should restore from unified format', async () => {
    // 統一形式からの復元テスト
  });
  
  it('should migrate from legacy project file', async () => {
    // 旧プロジェクトファイルからの移行テスト
  });
  
  it('should migrate from legacy auto-save', async () => {
    // 旧自動保存からの移行テスト
  });
  
  it('should maintain state consistency', async () => {
    // 状態整合性テスト
  });
});
```

### 3. リスク軽減
- **データ損失防止**: 移行前のバックアップ作成
- **段階的導入**: フィーچャーフラグによる制御
- **ロールバック**: 旧システムとの並行運用期間

## 期待される効果

### 1. 品質向上
- データ不整合の解消
- 復元エラーの減少
- 状態管理の透明性向上

### 2. 保守性向上
- コードの重複削除
- 責任の明確化
- テスタビリティの向上

### 3. 拡張性向上
- 新機能追加の容易さ
- データ形式の柔軟性
- パフォーマンスの最適化

## 実装タイムライン

| Phase | 期間 | 主な作業 |
|-------|------|----------|
| Phase 1 | 2週間 | データ構造統一、インターface定義 |
| Phase 2 | 3週間 | 統一復元システム実装 |
| Phase 3 | 2週間 | 統合、テスト、最適化 |
| 総期間 | 7週間 | 完全移行完了 |

## 結論

この再設計により、Visiblyricsの状態管理システムは一貫性があり、保守しやすく、拡張可能なアーキテクチャへと進化します。段階的な実装により、既存機能への影響を最小限に抑えながら、根本的な問題を解決できます。