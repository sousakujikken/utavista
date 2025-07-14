# マーカー移動時の個別設定値上書き問題修正メモ（V2完全移行済み）

## 問題の概要

マーカー移動時に、個別設定が有効な特定フレーズ（例：`phrase_1751341417869_k7b01lewz`）のフォントや色などの個別設定値がグローバルデフォルト値に上書きされる問題。

**最終的解決**: V2パラメータ管理システムへの完全移行により根本的に解決。

## 不整合の根本原因

### 1. **既存フレーズの不適切な再初期化**
- **場所**: `ParameterManagerV2.initializePhrase`
- **問題**: マーカー移動時に`Engine.updateLyricsData`→`initializePhrase`が呼ばれ、既存の個別設定フレーズも強制的にデフォルト値で再初期化
- **影響**: 復元済みの個別設定値（フォント、色など）が失われる

### 2. **レンダリングシステムでの古いパラメータ参照**
- **場所**: `InstanceManager.createCharInstance`, `createWordInstance`
- **問題**: `char.params`や`word.params`の古い値を優先使用し、ParameterManagerV2の正しい値を無視
- **影響**: 実際のレンダリングでグローバルデフォルト値が表示される

### 3. **状態管理の階層間不整合**
- **場所**: `Engine.phrases[].chars[].params`（engineState）
- **問題**: ParameterManagerV2は正しく復元されるが、歌詞データの文字レベルparamsは古いファイルデータのまま
- **影響**: 自動保存データで不整合が永続化される

## 実装した修正

### 修正1: ParameterManagerV2での既存フレーズ保護
**ファイル**: `src/renderer/engine/ParameterManagerV2.ts`
**メソッド**: `initializePhrase`

```typescript
// 既存フレーズかどうかを判定
const existingParams = this.phraseParameters.get(phraseId);
const isExistingPhrase = existingParams !== undefined;
const isIndividualSettingEnabled = this.phraseIndividualSettings.get(phraseId) || false;

if (isExistingPhrase && isIndividualSettingEnabled) {
  // 既存の個別設定フレーズの場合：個別設定値を保護
  params = { ...this.globalDefaults };
  if (currentGlobalSettings) {
    Object.assign(params, validation.sanitized);
  }
  // 既存の個別設定値を復元（最優先で適用）
  Object.assign(params, existingParams);
} else {
  // 新規フレーズまたは個別設定無効フレーズの場合：通常の初期化
  // （従来の処理）
}
```

### 修正2: InstanceManagerでの正しいパラメータ参照
**ファイル**: `src/renderer/engine/InstanceManager.ts`
**メソッド**: `createCharInstance`, `createWordInstance`

```typescript
// 修正前（問題のあるコード）
const charParams = {
  ...this.defaultParams,
  ...(char.params || {}), // 古い値を優先使用
  id: char.id,
  // ...
};

// 修正後
const charParams = {
  ...params, // ParameterManagerV2から取得した正しいパラメータを使用
  ...(char.params || {}), // 文字固有のパラメータがあれば上書き（後方互換性のため）
  id: char.id,
  // ...
};
```

### 修正3: 歌詞データパラメータの同期処理追加
**ファイル**: `src/renderer/engine/Engine.ts`

#### 3-1: syncLyricsDataParamsメソッド追加
```typescript
/**
 * 歌詞データの文字レベルparams同期
 * ParameterManagerV2の最新値でengineStateの整合性を確保
 */
private syncLyricsDataParams(): void {
  try {
    this.phrases.forEach(phrase => {
      phrase.words.forEach(word => {
        word.chars.forEach(char => {
          // ParameterManagerV2から最新のパラメータを取得
          const latestParams = this.parameterManager.getParameters(char.id);
          
          if (!char.params) {
            char.params = {};
          }
          
          // 重要なレンダリングパラメータのみ同期
          const syncParams = ['fontSize', 'fontFamily', 'textColor', 'activeTextColor', 'completedTextColor'];
          syncParams.forEach(paramKey => {
            if (latestParams[paramKey] !== undefined) {
              char.params[paramKey] = latestParams[paramKey];
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Engine: 歌詞データparams同期エラー:', error);
  }
}
```

#### 3-2: パラメータ変更時の同期実行
**メソッド**: `updateObjectParams`
```typescript
// リアルタイム反映のため強制レンダリング
if (this.instanceManager) {
  this.instanceManager.updateExistingInstances();
  this.instanceManager.update(this.currentTime);
}

// 歌詞データの文字レベルparams同期（engineState整合性確保）
this.syncLyricsDataParams();

// タイムライン更新イベント発火
this.dispatchTimelineUpdatedEvent();
```

#### 3-3: マーカー移動時の同期実行
**メソッド**: `updateLyricsData`
```typescript
// 新しい歌詞データをProjectStateManagerの現在状態に反映
const paramExport = this.parameterManager.exportCompressed();
this.projectStateManager.updateCurrentState({
  lyricsData: JSON.parse(JSON.stringify(this.phrases)),
  individualSettingsEnabled: paramExport.individualSettingsEnabled || []
});

// 歌詞データパラメータの状態整合性を確保
this.syncLyricsDataParams();

return this.phrases;
```

### 修正4: ファイル復元時の状態整合
**ファイル**: `src/renderer/engine/UnifiedRestoreManager.ts`
**メソッド**: `restoreCore`

```typescript
// 歌詞データパラメータの状態整合性を確保
if (this.engine && typeof (this.engine as any).syncLyricsDataParams === 'function') {
  (this.engine as any).syncLyricsDataParams();
  console.log('UnifiedRestoreManager: 歌詞データparams同期完了');
}

console.log('UnifiedRestoreManager: 統一復元処理完了');
```

## 修正の効果

### 修正前の状態不整合
- **ParameterManagerV2**: 個別設定値（`fontSize: 110, fontFamily: "RocknRollOne-Regular"`）
- **実行時レンダリング**: グローバルデフォルト値（`fontSize: 89, fontFamily: "花鳥風月B"`）
- **engineState**: 古いファイルデータ（`fontSize: 89, fontFamily: "花鳥風月B"`）

### 修正後の完全状態整合
- **ParameterManagerV2**: 個別設定値（`fontSize: 110, fontFamily: "RocknRollOne-Regular"`）✅
- **実行時レンダリング**: 個別設定値（`fontSize: 110, fontFamily: "RocknRollOne-Regular"`）✅
- **engineState**: 個別設定値（`fontSize: 110, fontFamily: "RocknRollOne-Regular"`）✅

## 対象となるシナリオ

1. **ファイル復元 → マーカー移動**: 個別設定値が保護される
2. **ファイル復元 → パラメータ変更**: 全階層で一貫した値が維持される
3. **新規フレーズ作成**: 従来通りの初期化処理（影響なし）
4. **個別設定無効フレーズ**: 従来通りの処理（影響なし）

## 重要な設計原則

1. **段階的修正**: 既存の動作を破壊せず、問題のある箇所のみ修正
2. **後方互換性**: 古いデータ形式やレガシー処理との互換性を維持
3. **状態整合性**: 全ての状態管理システム間でパラメータの一貫性を確保
4. **最小限の変更**: 必要最小限の修正で最大の効果を実現

## V2完全移行による最終的解決（2025-01-07）

### 実行した移行作業

1. **レガシーパラメータシステムの完全削除**
   - `char.params`, `word.params`, `phrase.params`プロパティを型定義から削除
   - `syncLyricsDataParams`メソッドとその呼び出しを削除
   - engineStateから`selectedTemplate`と`templateParams`を削除

2. **V2専用保存フォーマット**
   - autoSaveでV2データのみ保存
   - レガシー互換性コードの削除

3. **状態管理の統一**
   - ParameterManagerV2のみでパラメータ管理
   - 複数の状態管理システム間の不整合を根本的に解決

### 修正効果

- **問題の根本原因を排除**: レガシーパラメータとV2パラメータの競合状態が完全に解消
- **状態管理の簡素化**: 単一の状態管理システム（V2）による明確な管理
- **保守性の向上**: 複雑な同期ロジックが不要になり、コードが簡潔に

## 今後の注意点

1. **文字配置計算**: 一部の文字配置計算で`char.params`参照が残存（低優先度での更新予定）
2. **V1データ非対応**: 古いプロジェクトファイルは読み込み不可（V2形式での再保存が必要）
3. **新機能追加時**: V2パラメータ管理システムのみを使用すること

---

**修正日**: 2025-01-07  
**対象バージョン**: v0.1.0  
**関連Issue**: マーカー移動時の個別設定値上書き問題  
**最終更新**: V2完全移行による根本的解決完了