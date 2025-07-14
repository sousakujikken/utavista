# パラメータ管理システム再設計仕様書

## 概要

現在の継承ベースのパラメータ管理システムを、完全初期化ベースのシステムに移行します。これにより、パラメータの不定状態を排除し、予測可能で直感的な動作を実現します。

## 現状の問題点

### 1. 継承チェーンによる不定状態
```
DEFAULT_PARAMETERS → templateDefaults → globalParams → parentParams → objectParams
```
- どの段階で値が決定されるかが実行時まで不明
- 部分更新時に他のパラメータが意図せず変更される

### 2. 具体的な不具合例
- フォントサイズ変更時に文字色がグローバル設定値に上書きされる
- 個別設定のフレーズでパラメータが正しく反映されない
- UI表示値と実際のレンダリング値が一致しない

## 新システム設計

### 基本原則

1. **完全初期化**: すべてのフレーズが完全なパラメータセットを保持
2. **継承排除**: 実行時の継承計算を完全に排除
3. **UI一致性**: 表示されるパラメータと実際の値を完全一致
4. **圧縮保存**: ファイル保存時のみ差分圧縮を実行

### データ構造

```typescript
// 新しいデータ構造
interface CompleteParameters extends StandardParameters {
  // すべてのパラメータが必須（undefined不可）
}

interface ParameterStorage {
  // グローバルデフォルト（UIでのベース値）
  globalDefaults: CompleteParameters;
  
  // 各フレーズの完全パラメータ
  phraseParameters: Map<string, CompleteParameters>;
  
  // 単語・文字レベルは将来拡張用
  wordParameters?: Map<string, CompleteParameters>;
  charParameters?: Map<string, CompleteParameters>;
}
```

## 実装フェーズ

### Phase 1: ParameterManager v2の実装

#### 1.1 新クラスの作成
```typescript
// src/renderer/engine/ParameterManagerV2.ts
export class ParameterManagerV2 {
  private globalDefaults: CompleteParameters;
  private phraseParameters: Map<string, CompleteParameters> = new Map();
  
  constructor() {
    this.globalDefaults = this.createDefaultParameters();
  }
  
  // 完全なデフォルトパラメータセットを生成
  private createDefaultParameters(): CompleteParameters {
    return { ...DEFAULT_PARAMETERS } as CompleteParameters;
  }
  
  // フレーズの初期化（テンプレートとグローバル設定から）
  initializePhrase(
    phraseId: string, 
    templateId: string,
    currentGlobalSettings?: Partial<StandardParameters>
  ): void {
    const params = this.createDefaultParameters();
    
    // テンプレートデフォルトを適用
    const templateDefaults = this.getTemplateDefaults(templateId);
    Object.assign(params, templateDefaults);
    
    // 現在のグローバル設定を適用
    if (currentGlobalSettings) {
      Object.assign(params, currentGlobalSettings);
    }
    
    this.phraseParameters.set(phraseId, params);
  }
  
  // 単一パラメータの更新（他に影響しない）
  updateParameter(
    phraseId: string,
    paramName: keyof StandardParameters,
    value: any
  ): void {
    const params = this.phraseParameters.get(phraseId);
    if (!params) {
      throw new Error(`Phrase ${phraseId} not initialized`);
    }
    
    params[paramName] = value;
    // 即座にレンダリングに反映
    this.notifyParameterChange(phraseId, paramName, value);
  }
  
  // バッチ更新（複数パラメータ）
  updateParameters(
    phraseId: string,
    updates: Partial<StandardParameters>
  ): void {
    const params = this.phraseParameters.get(phraseId);
    if (!params) {
      throw new Error(`Phrase ${phraseId} not initialized`);
    }
    
    Object.assign(params, updates);
    this.notifyParametersChange(phraseId, updates);
  }
  
  // UI表示用パラメータ取得（実際の値と完全一致）
  getParameters(phraseId: string): CompleteParameters {
    const params = this.phraseParameters.get(phraseId);
    if (!params) {
      // 未初期化の場合はデフォルトを返す
      return this.createDefaultParameters();
    }
    return { ...params }; // 深いコピーを返す
  }
}
```

#### 1.2 グローバル設定の扱い

```typescript
// グローバル設定変更時の処理
updateGlobalDefaults(updates: Partial<StandardParameters>): void {
  Object.assign(this.globalDefaults, updates);
  
  // オプション: 既存フレーズに適用するか選択可能
  // this.applyGlobalUpdatesToExistingPhrases(updates);
}

// 新規フレーズ作成時のベース値として使用
getGlobalDefaults(): CompleteParameters {
  return { ...this.globalDefaults };
}
```

### Phase 2: 保存・読み込みシステム

#### 2.1 圧縮保存の実装

```typescript
// 保存用の圧縮フォーマット
interface CompressedProjectData {
  version: "2.0";
  globalDefaults: CompleteParameters;
  phrases: Record<string, CompressedPhrase>;
}

interface CompressedPhrase {
  templateId: string;
  // グローバルデフォルトとの差分のみ
  parameterDiff?: Partial<StandardParameters>;
}

// 圧縮エクスポート
export function exportCompressed(): CompressedProjectData {
  const compressed: Record<string, CompressedPhrase> = {};
  
  for (const [phraseId, params] of this.phraseParameters.entries()) {
    const diff = this.calculateDiff(this.globalDefaults, params);
    
    compressed[phraseId] = {
      templateId: this.getTemplateId(phraseId),
      parameterDiff: Object.keys(diff).length > 0 ? diff : undefined
    };
  }
  
  return {
    version: "2.0",
    globalDefaults: this.globalDefaults,
    phrases: compressed
  };
}

// 差分計算
private calculateDiff(
  base: CompleteParameters,
  target: CompleteParameters
): Partial<StandardParameters> {
  const diff: Partial<StandardParameters> = {};
  
  for (const [key, value] of Object.entries(target)) {
    if (!deepEqual(base[key], value)) {
      diff[key] = value;
    }
  }
  
  return diff;
}
```

#### 2.2 読み込み時の展開

```typescript
// 圧縮データからの復元
export function importCompressed(data: CompressedProjectData): void {
  // グローバルデフォルトを設定
  this.globalDefaults = data.globalDefaults;
  
  // 各フレーズを復元
  this.phraseParameters.clear();
  
  for (const [phraseId, compressedPhrase] of Object.entries(data.phrases)) {
    // ベースパラメータを作成
    const params = { ...this.globalDefaults };
    
    // テンプレートデフォルトを適用
    const templateDefaults = this.getTemplateDefaults(compressedPhrase.templateId);
    Object.assign(params, templateDefaults);
    
    // 差分を適用
    if (compressedPhrase.parameterDiff) {
      Object.assign(params, compressedPhrase.parameterDiff);
    }
    
    this.phraseParameters.set(phraseId, params);
  }
}
```

### Phase 3: UI統合

#### 3.1 TemplateTab.tsxの修正

```typescript
// 個別設定モードの簡素化
const handleParameterChange = (paramName: string, value: any) => {
  if (!selectedPhraseId) return;
  
  // 直接更新（継承計算なし）
  engine.parameterManagerV2.updateParameter(selectedPhraseId, paramName, value);
  
  // UIを即座に更新
  const updatedParams = engine.parameterManagerV2.getParameters(selectedPhraseId);
  setDisplayedParameters(updatedParams);
};

// 表示パラメータの取得（常に完全な値）
const getDisplayParameters = (phraseId: string): CompleteParameters => {
  return engine.parameterManagerV2.getParameters(phraseId);
};
```

#### 3.2 個別設定フラグの廃止

現在の`individualSettingsEnabled`フラグは不要になります：
- すべてのフレーズが完全パラメータを持つ
- グローバル設定との差分は保存時に自動計算
- UI表示は常に実際の値を表示

### Phase 4: マイグレーション

#### 4.1 既存データの変換

```typescript
// 旧形式から新形式への変換
export function migrateFromV1(v1Data: any): CompressedProjectData {
  const v2Data: CompressedProjectData = {
    version: "2.0",
    globalDefaults: v1Data.globalParams || DEFAULT_PARAMETERS,
    phrases: {}
  };
  
  // 各フレーズのパラメータを計算
  for (const phrase of v1Data.lyrics || []) {
    const phraseId = phrase.id;
    
    // V1での有効パラメータを計算（継承チェーン適用）
    const effectiveParams = calculateV1EffectiveParams(
      phraseId,
      v1Data.templateId,
      v1Data.globalParams,
      v1Data.objectParams?.[phraseId]
    );
    
    // 差分を計算して保存
    const diff = calculateDiff(v2Data.globalDefaults, effectiveParams);
    
    v2Data.phrases[phraseId] = {
      templateId: v1Data.templateAssignments?.[phraseId] || v1Data.templateId,
      parameterDiff: Object.keys(diff).length > 0 ? diff : undefined
    };
  }
  
  return v2Data;
}
```

## 移行計画

### ステップ1: 並行実装（1週間）
- ParameterManagerV2を新規実装
- 既存のParameterManagerと並行稼働

### ステップ2: UI統合（3日）
- TemplateTab.tsxをV2対応に修正
- パラメータ編集の動作確認

### ステップ3: エンジン統合（3日）
- Engine.tsをV2対応に修正
- レンダリングパイプラインの更新

### ステップ4: データ移行（2日）
- 既存プロジェクトの自動変換
- バックアップとロールバック機能

### ステップ5: 旧システム削除（1日）
- ParameterManager（V1）の削除
- 関連する継承ロジックの削除

## テスト計画

### 単体テスト
```typescript
describe('ParameterManagerV2', () => {
  it('フレーズ初期化時に完全パラメータを生成', () => {
    const pm = new ParameterManagerV2();
    pm.initializePhrase('phrase_1', 'template_1');
    
    const params = pm.getParameters('phrase_1');
    expect(params.fontSize).toBeDefined();
    expect(params.fontFamily).toBeDefined();
    // すべてのパラメータが定義されていることを確認
  });
  
  it('単一パラメータ更新が他に影響しない', () => {
    const pm = new ParameterManagerV2();
    pm.initializePhrase('phrase_1', 'template_1');
    
    const before = pm.getParameters('phrase_1');
    pm.updateParameter('phrase_1', 'fontSize', 100);
    const after = pm.getParameters('phrase_1');
    
    expect(after.fontSize).toBe(100);
    expect(after.textColor).toBe(before.textColor); // 他は変わらない
  });
});
```

### 統合テスト
- V1データの移行が正しく動作すること
- UI操作が期待通り動作すること
- 保存・読み込みが正しく動作すること

## メリット

1. **予測可能性**: パラメータ変更の結果が明確
2. **パフォーマンス**: 継承計算が不要
3. **デバッグ性**: 値の出所が明確
4. **保守性**: シンプルな実装

## 注意事項

1. **メモリ使用量**: 完全パラメータ保存により増加（許容範囲内）
2. **初期化処理**: フレーズ作成時の処理が若干増加
3. **後方互換性**: V1データの自動変換で対応

## まとめ

この再設計により、現在のパラメータ管理の問題を根本的に解決し、より直感的で予測可能なシステムを実現します。特に「フォントサイズ変更時に文字色が変わる」といった不具合は完全に解消されます。