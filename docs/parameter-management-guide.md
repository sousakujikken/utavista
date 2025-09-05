# パラメータ管理ガイドライン

## 概要

UTAVISTA v0.4.3のパラメータ管理システムは、すべてのアニメーションパラメータを一元管理します。
新機能開発時にパラメータの乱造を防ぐため、以下のガイドラインに従ってください。

## パラメータ追加時の必須手順

### 🚨 CRITICAL: v0.5.1+ 拡張ID対応パラメータ

ALL templates using FlexibleCumulativeLayoutPrimitive with same_line modes MUST include:

- **`wordSpacing`**: 単語間隔制御（必須）
- **拡張IDサポート**: `allWordExtendedIds`パラメータを必ず含める
- **正確な位置計算**: 二重処理を避けるため、SlideAnimationPrimitiveでの位置計算を無効化

```typescript
// Template parameter configuration MUST include:
{ name: "wordSpacing", type: "number", default: 1.0, min: 0.1, max: 5.0, step: 0.1 }

// Layout params MUST include:
const layoutParams = {
  // ... other parameters
  wordSpacing: params.wordSpacing as number || 1.0,
  allWordExtendedIds: this.generateAllWordExtendedIds(params.words, phraseId)
};
```

### 1. パラメータタイプの判定

新しいパラメータを追加する前に、以下を検討してください：

- **共通パラメータ**: 複数のテンプレートで使用される可能性がある
- **テンプレート固有パラメータ**: 特定のテンプレートでのみ使用される

### 2. 既存パラメータの確認

`/src/types/StandardParameters.ts`を確認し、類似の機能を持つパラメータが存在しないか確認します。

### 3. パラメータ追加手順

#### 手順1: StandardParameters.tsへの追加

```typescript
export interface StandardParameters {
  // ... existing parameters ...
  
  // === [テンプレート名]用パラメータ ===
  // [パラメータの用途説明]
  yourParameterName?: number;  // テンプレート固有の場合はオプショナル
}
```

#### 手順2: DEFAULT_PARAMETERSへのデフォルト値追加

```typescript
export const DEFAULT_PARAMETERS: StandardParameters = {
  // ... existing defaults ...
  
  // [テンプレート名]用デフォルト値
  yourParameterName: 100,  // 適切なデフォルト値
};
```

#### 手順3: パラメータバリデーションの確認

新しいパラメータが`ParameterValidator`で正しく検証されることを確認します。

### 4. ドキュメント化

各パラメータには必ず以下を記載：
- パラメータの用途
- 値の範囲（最小値、最大値）
- デフォルト値とその理由
- 使用するテンプレート名

## パラメータ命名規則

### 基本ルール

1. **camelCase**を使用
2. **明確で説明的な名前**を付ける
3. **既存の命名パターン**に従う

### 命名パターン

- `enable[Feature]`: ブール値のオン/オフフラグ
- `[feature]Color`: 色関連
- `[feature]Size`: サイズ関連
- `[feature]Speed`: 速度関連
- `[feature]Duration`: 持続時間関連
- `[feature]Offset[X/Y]`: 位置オフセット
- `[feature]Count`: 数量関連

### 避けるべき命名

- 曖昧な名前（`data`, `value`, `param`）
- 省略形（`btn`, `clr`, `sz`）
- テンプレート名を含む（`wordSlideSpeed` → `slideSpeed`）

## テンプレート固有パラメータの管理

### 1. グループ化

テンプレート固有パラメータは、StandardParameters内でコメントで明確にグループ化：

```typescript
// === WordSlideText用 ===
headTime?: number;
tailTime?: number;
entranceInitialSpeed?: number;
```

### 2. オプショナル指定

テンプレート固有パラメータは必ず`?`を付けてオプショナルにします。

### 3. プレフィックスの使用

必要に応じて、機能グループごとにプレフィックスを使用：

```typescript
// グリッチエフェクト関連
glitchBlockSize?: number;
glitchBlockCount?: number;
glitchIntensity?: number;
```

## FlexibleCumulativeLayoutPrimitive 関連パラメータ（v0.4.3新機能）

### 単語表示モード制御パラメータ

FlexibleCumulativeLayoutPrimitiveで導入された柔軟な単語配置システムでは、以下のパラメータが新たに追加されました。

#### wordDisplayMode

単語の表示モードを制御するパラメータです。

```typescript
wordDisplayMode?: 'individual_word_entrance' | 'phrase_cumulative_same_line' | 
                  'phrase_cumulative_new_line' | 'simultaneous_with_spacing';
```

**用途別デフォルト値:**
- **WordSlideTextPrimitive**: `'individual_word_entrance'` （従来動作）
- **GlitchTextPrimitive**: `'phrase_cumulative_same_line'` （フレーズ一括表示）

**パラメータ設定例:**
```typescript
{ 
  name: "wordDisplayMode", 
  type: "string", 
  default: "phrase_cumulative_same_line",
  options: [
    "individual_word_entrance",      // 単語ごとに個別入場
    "phrase_cumulative_same_line",   // フレーズ一括入場、同一行累積配置
    "phrase_cumulative_new_line",    // フレーズ一括入場、単語ごとに改行
    "simultaneous_with_spacing"      // 同時表示、単語間スペースあり
  ]
}
```

#### wordSpacing

単語間のスペース量を制御するパラメータです。

```typescript
wordSpacing?: number;  // デフォルト: 1.0
```

**用途:**
- `SIMULTANEOUS_WITH_SPACING`モードで単語間のスペース量を調整
- 文字数換算での単語間隔を指定

**パラメータ設定例:**
```typescript
{ name: "wordSpacing", type: "number", default: 1.0, min: 0.0, max: 5.0, step: 0.1 }
```

#### lineHeight（拡張）

行の高さを制御するパラメータです。従来から存在していましたが、FlexibleCumulativeLayoutPrimitiveで重要性が増しました。

```typescript
lineHeight?: number;  // デフォルト: 1.2
```

**用途:**
- `PHRASE_CUMULATIVE_NEW_LINE`モードで単語間の行間隔を調整
- 縦書きレイアウトでの行間制御

**パラメータ設定例:**
```typescript
{ name: "lineHeight", type: "number", default: 1.2, min: 0.5, max: 3.0, step: 0.1 }
```

### GlitchEffectPrimitive 関連パラメータ

グリッチ効果制御のための新しいパラメータです。

#### グリッチ動的制御パラメータ

```typescript
// グリッチ発生制御
glitchThreshold?: number;      // 発生閾値（0-1）
glitchWaveSpeed?: number;      // 波動速度
glitchRandomness?: number;     // ランダム性（0-1）

// グリッチ視覚効果
glitchBlockSize?: number;      // ピクセルブロックサイズ
glitchBlockCount?: number;     // ブロック数
glitchUpdateInterval?: number; // 更新間隔（ms）
glitchIntensity?: number;      // 強度（0-1）
```

**パラメータ設定例:**
```typescript
{ name: "glitchThreshold", type: "number", default: 0.3, min: 0.0, max: 1.0, step: 0.1 },
{ name: "glitchWaveSpeed", type: "number", default: 2.0, min: 0.1, max: 10.0, step: 0.1 },
{ name: "glitchRandomness", type: "number", default: 0.5, min: 0.0, max: 1.0, step: 0.1 }
```

### MultiLineLayoutPrimitive 関連パラメータ

段組み配置のための新しいパラメータです。

#### 段組み制御パラメータ

```typescript
// 段組み基本設定
totalLines?: number;        // 総段数
lineHeight?: number;        // 行の高さ（倍率）
resetInterval?: number;     // 段リセット間隔（ms）
manualLineNumber?: number;  // 手動段番号指定（-1で自動）
```

**パラメータ設定例:**
```typescript
{ name: "totalLines", type: "number", default: 4, min: 2, max: 8, step: 1 },
{ name: "lineHeight", type: "number", default: 1.2, min: 0.5, max: 3.0, step: 0.1 },
{ name: "resetInterval", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
{ name: "manualLineNumber", type: "number", default: -1, min: -1, max: 7, step: 1 }
```

### GlowEffectPrimitive 精細度パラメータ（v0.4.3 新標準）

グロー・シャドウエフェクトの品質制御のための標準パラメータです。

#### エフェクト精細度制御パラメータ

```typescript
// グロー精細度制御
glowQuality?: number;    // グロー精細度（高いほど高品質・重い）
shadowQuality?: number;  // シャドウ精細度（高いほど高品質・重い）
```

**パラメータ設定例:**
```typescript
{ name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1 },
{ name: "shadowQuality", type: "number", default: 4, min: 1, max: 10, step: 1 }
```

**重要な仕様**:
- これらのパラメータは**全テンプレートで標準公開が必須**です
- ユーザーが品質とパフォーマンスのバランスを調整できるようにするためです
- 高い値にするほど高品質になりますが、処理負荷が重くなります

### パラメータ継承関係

新しいプリミティブシステムでは、パラメータの階層的継承が重要です：

```
フレーズレベル: totalLines, lineSpacing, resetInterval
    ↓
単語レベル: wordDisplayMode, wordSpacing, lineHeight
    ↓  
文字レベル: charSpacing, fontSize, 各種エフェクトパラメータ
```

## アンチパターン

### ❌ 避けるべきこと

1. **StandardParametersを介さないパラメータ追加**
   ```typescript
   // 悪い例：テンプレート内で独自にパラメータを定義
   class MyTemplate {
     private myCustomParam = 100; // NG
   }
   ```

2. **汎用的すぎる名前**
   ```typescript
   // 悪い例
   parameter1?: number;
   customValue?: number;
   ```

3. **型定義のない動的パラメータ**
   ```typescript
   // 悪い例
   params[dynamicKey] = value; // 型安全性が失われる
   ```

### ✅ 推奨される方法

1. **必ずStandardParametersに追加**
2. **明確な命名と型定義**
3. **適切なデフォルト値の設定**

## パラメータ削除・非推奨化

### 非推奨化手順

1. JSDocで`@deprecated`を追加
2. 代替パラメータを明記
3. 移行期間を設定（最低2バージョン）

```typescript
/**
 * @deprecated v0.5.0で削除予定。代わりに`entranceInitialSpeed`を使用してください
 */
initialSpeed?: number;
```

## チェックリスト

新しいパラメータを追加する前に：

- [ ] 既存パラメータで代用できないか確認した
- [ ] StandardParameters.tsに追加した
- [ ] DEFAULT_PARAMETERSにデフォルト値を追加した
- [ ] 適切な命名規則に従った
- [ ] JSDocコメントを追加した
- [ ] テンプレートのgetParameterConfig()に追加した
- [ ] パラメータエディタUIで表示されることを確認した

## トラブルシューティング

### "Unknown parameter"エラーが出る場合

1. StandardParameters.tsに定義があるか確認
2. DEFAULT_PARAMETERSにデフォルト値があるか確認
3. パラメータ名のスペルミスがないか確認

### パラメータが反映されない場合

1. テンプレートのgetParameterConfig()に含まれているか確認
2. パラメータマネージャーで正しく処理されているか確認

## パフォーマンス最適化機能（v0.5.0新機能）

### ビューポート最適化システム

UTAVISTA v0.5.0では、パラメータ更新時のUI応答性を向上させる最適化機能が追加されました。

#### 1. 最適化メソッドの使い分け

```typescript
// 通常のパラメータ更新（全インスタンス更新 + 通知）
parameterManager.updateGlobalDefaults(params);

// 最適化されたパラメータ更新（通知無効化 + ビューポート最適化）
parameterManager.updateGlobalDefaultsSilent(params);
```

#### 2. エンジンレベルでの最適化フロー

```typescript
// Engine.ts での最適化実装
public updateGlobalParameters(params: Partial<StandardParameters>): void {
  // 1. グローバルデフォルトを更新（通知無効化）
  this.parameterManager.updateGlobalDefaultsSilent(params);
  
  // 2. 最適化されたパラメータ更新を使用
  this.optimizedUpdater.updateGlobalParametersOptimized(
    phrasesToUpdate,
    params,
    {
      updatePhrase: (phraseId, updateParams) => {
        this.parameterManager.updateParameters(phraseId, updateParams);
      },
      onSyncComplete: (visiblePhraseIds) => {
        // 表示範囲内のインスタンスのみ更新
        this.instanceManager.updateExistingInstances(visiblePhraseIds);
      },
      onBatchComplete: (phraseIds) => {
        // 非同期バッチ処理完了後の処理
      }
    }
  );
}
```

#### 3. 最適化のメカニズム

- **表示範囲判定**: 現在時刻±2秒のフレーズのみ同期更新
- **通知制御**: `updateGlobalDefaultsSilent`で無駄な全インスタンス更新を回避
- **段階的更新**: 可視フレーズ→非可視フレーズの順で処理

#### 4. 開発者への影響

通常のテンプレート開発では、この最適化は透明的に動作します：

- **テンプレート側**: 従来通りの実装で自動的に最適化の恩恵を受ける
- **エンジン側**: `OptimizedParameterUpdater`が自動的にパフォーマンス管理
- **UI側**: パラメータ変更時の固まりが大幅軽減

### 新しいParameterManagerV2メソッド

#### updateGlobalDefaultsSilent

```typescript
/**
 * グローバルデフォルトの更新（通知無効化版）
 * 最適化システムで使用され、不要なインスタンス更新を防ぐ
 */
updateGlobalDefaultsSilent(updates: Partial<StandardParameters>): void
```

#### propagateGlobalChangesToNormalPhrases

```typescript
/**
 * グローバル変更を通常フレーズに伝播
 * enableNotifications パラメータで通知制御
 */
private propagateGlobalChangesToNormalPhrases(
  updates: Partial<StandardParameters>, 
  enableNotifications: boolean = true
): void
```

### パフォーマンス測定

最適化効果の確認方法：

```javascript
// ブラウザコンソールで確認可能なログ
// ✅ 最適化成功時
"OptimizedParameterUpdater: 表示範囲内: 3個, 範囲外: 59個"
"InstanceManager: 最適化により0個のインスタンスを更新" // 範囲外時

// ❌ 最適化前
"InstanceManager: 873個のインスタンスを更新" // 全インスタンス更新
```