# パラメータ正規化機能 修正プランドキュメント

## 概要

個別設定パラメータの管理において、パラメータ名の不統一により値の上書きが発生している問題を解決するため、全システムでのパラメータ名統一と正規化機能を導入する。

**修正方針**: レガシー名は許容せず、全ての箇所で統一されたパラメータ名を使用する。

## 問題の詳細

### 現状の問題
- **ParameterManager**: `fill` で色管理
- **テンプレート**: `defaultTextColor`, `activeTextColor`, `completedTextColor` を期待
- **システムデフォルト**: `fill` と `defaultTextColor` が混在
- **保存ファイル**: 複数の色パラメータ名が混在

### 影響範囲
- プロジェクト保存・読み込み時の値の不整合
- 個別設定パラメータがテンプレートで正しく参照されない
- 自動保存からの復元時の値の上書き

## 修正計画

### 第1段階: パラメータスキーマの統一定義

#### 1.1 統一パラメータインターフェースの定義

**ファイル**: `/src/types/StandardParameters.ts` (新規作成)

```typescript
/**
 * 全システムで使用する統一パラメータスキーマ
 * レガシー名は使用禁止
 */
export interface StandardParameters {
  // === 基本テキストパラメータ ===
  fontSize: number;
  fontFamily: string;
  textColor: string;           // 統一色パラメータ（fill, defaultTextColor廃止）
  
  // === テンプレート固有色パラメータ ===
  activeTextColor: string;     // アクティブ時の文字色
  completedTextColor: string;  // 完了時の文字色
  
  // === レイアウトパラメータ ===
  letterSpacing: number;
  lineHeight: number;
  offsetX: number;
  offsetY: number;
  
  // === エフェクトパラメータ ===
  enableGlow: boolean;
  glowStrength: number;
  glowBrightness: number;
  glowBlur: number;
  glowQuality: number;
  glowPadding: number;
  
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowAngle: number;
  shadowDistance: number;
  shadowAlpha: number;
  shadowOnly: boolean;
  
  // === その他 ===
  blendMode: string;
  
  // === テンプレート固有パラメータ ===
  // FlickerFadeTemplate用
  preInDuration?: number;
  flickerMinFrequency?: number;
  flickerMaxFrequency?: number;
  flickerIntensity?: number;
  flickerRandomness?: number;
  frequencyLerpSpeed?: number;
  fadeInVariation?: number;
  fadeOutVariation?: number;
  fadeOutDuration?: number;
  fullDisplayThreshold?: number;
  charSpacing?: number;
  
  // MultiLineText用
  totalLines?: number;
  lineSpacing?: number;
  resetInterval?: number;
  manualLineNumber?: number;
  phraseOverlapThreshold?: number;
  phraseOffsetX?: number;
  phraseOffsetY?: number;
}

/**
 * パラメータのデフォルト値定義
 */
export const DEFAULT_PARAMETERS: StandardParameters = {
  // 基本パラメータ
  fontSize: 120,
  fontFamily: 'Arial',
  textColor: '#FFA500',
  activeTextColor: '#FFFF80',
  completedTextColor: '#FFF7EB',
  
  // レイアウト
  letterSpacing: 0,
  lineHeight: 150,
  offsetX: 0,
  offsetY: 0,
  
  // エフェクト
  enableGlow: true,
  glowStrength: 1.5,
  glowBrightness: 1.2,
  glowBlur: 6,
  glowQuality: 8,
  glowPadding: 50,
  
  enableShadow: false,
  shadowBlur: 6,
  shadowColor: '#000000',
  shadowAngle: 45,
  shadowDistance: 8,
  shadowAlpha: 0.8,
  shadowOnly: false,
  
  blendMode: 'normal',
  
  // テンプレート固有（オプショナル）
  preInDuration: 1500,
  flickerMinFrequency: 2,
  flickerMaxFrequency: 15,
  flickerIntensity: 0.8,
  flickerRandomness: 0.7,
  frequencyLerpSpeed: 0.15,
  fadeInVariation: 500,
  fadeOutVariation: 800,
  fadeOutDuration: 1000,
  fullDisplayThreshold: 0.85,
  charSpacing: 1.0,
  
  totalLines: 4,
  lineSpacing: 150,
  resetInterval: 2000,
  manualLineNumber: -1,
  phraseOverlapThreshold: 1000,
  phraseOffsetX: 0,
  phraseOffsetY: 0
};
```

#### 1.2 パラメータ検証機能

**ファイル**: `/src/utils/ParameterValidator.ts` (新規作成)

```typescript
import { StandardParameters } from '../types/StandardParameters';

export class ParameterValidator {
  /**
   * パラメータの型と値の妥当性を検証
   */
  static validate(params: Partial<StandardParameters>): {
    isValid: boolean;
    errors: string[];
    sanitized: StandardParameters;
  } {
    const errors: string[] = [];
    const sanitized = { ...DEFAULT_PARAMETERS };
    
    // 各パラメータの検証と正規化
    Object.entries(params).forEach(([key, value]) => {
      if (key in DEFAULT_PARAMETERS) {
        const defaultValue = DEFAULT_PARAMETERS[key as keyof StandardParameters];
        
        if (typeof value === typeof defaultValue) {
          sanitized[key as keyof StandardParameters] = value;
        } else {
          errors.push(`Invalid type for ${key}: expected ${typeof defaultValue}, got ${typeof value}`);
        }
      } else {
        errors.push(`Unknown parameter: ${key}`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitized
    };
  }
  
  /**
   * レガシーパラメータ名の検出
   */
  static detectLegacyParameters(params: Record<string, any>): string[] {
    const legacyParams = ['fill', 'defaultTextColor'];
    return Object.keys(params).filter(key => legacyParams.includes(key));
  }
}
```

### 第2段階: ParameterManager の修正

#### 2.1 システムデフォルト値の統一

**ファイル**: `/src/renderer/engine/ParameterManager.ts`

**修正内容**:
```typescript
// 削除対象
const SYSTEM_DEFAULT_PARAMS = {
  fontSize: 120,
  fontFamily: 'Arial',
  fill: '#FFA500', // ← 削除
  defaultTextColor: '#FFA500', // ← 削除
  activeTextColor: '#FFA500', // ← 削除
  completedTextColor: '#FFA500' // ← 削除
};

// 新規追加
import { StandardParameters, DEFAULT_PARAMETERS } from '../types/StandardParameters';

export class ParameterManager {
  constructor() {
    // 統一デフォルト値を使用
    this.globalParams = { ...DEFAULT_PARAMETERS };
  }
  
  // 全メソッドでStandardParametersを使用
  setTemplateDefaultParams(templateId: string, params: StandardParameters): void
  updateGlobalParams(params: Partial<StandardParameters>): void
  updateObjectParams(objectId: string, params: Partial<StandardParameters>): void
  getEffectiveParams(objectId: string, templateId: string): StandardParameters
  // ...
}
```

#### 2.2 型安全性の向上

**修正箇所**:
- 全てのパラメータ関連メソッドの型を `StandardParameters` に統一
- `Record<string, any>` を `StandardParameters` または `Partial<StandardParameters>` に変更
- 内部処理でのパラメータアクセスを型安全に変更

### 第3段階: テンプレートシステムの修正

#### 3.1 FlickerFadeTemplate の修正

**ファイル**: `/src/renderer/templates/FlickerFadeTemplate.ts`

**修正内容**:
```typescript
// 修正前
const defaultTextColor = params.defaultTextColor as string || '#808080';
const activeTextColor = params.activeTextColor as string || '#FFFF80';
const completedTextColor = params.completedTextColor as string || '#FFF7EB';

// 修正後
const textColor = params.textColor;  // 統一パラメータ名を使用
const activeTextColor = params.activeTextColor;
const completedTextColor = params.completedTextColor;
```

#### 3.2 getParameterConfig の修正

**修正内容**:
```typescript
// 修正前
{ name: "defaultTextColor", type: "color", default: "#808080" },

// 修正後  
{ name: "textColor", type: "color", default: "#808080" },
```

#### 3.3 その他のテンプレートファイル

**対象ファイル**:
- `/src/renderer/templates/*.ts` (全テンプレートファイル)

**修正方針**:
- `defaultTextColor` → `textColor` に統一
- `fill` パラメータの参照を全て `textColor` に変更
- テンプレートの `getParameterConfig()` も統一名に修正

### 第4段階: プロジェクトファイル管理の修正

#### 4.1 ProjectFileManager の修正

**ファイル**: `/src/renderer/services/ProjectFileManager.ts`

**修正内容**:
```typescript
// インポート・エクスポート時のパラメータ正規化
import { StandardParameters, DEFAULT_PARAMETERS } from '../types/StandardParameters';
import { ParameterValidator } from '../utils/ParameterValidator';

class ProjectFileManager {
  // 保存時のパラメータ正規化
  private buildProjectData(projectName: string): ProjectFileData {
    const state = this.engine.getStateManager().exportFullState();
    
    // パラメータを正規化してから保存
    const normalizedGlobalParams = this.normalizeParameters(state.globalParams);
    const normalizedObjectParams: Record<string, StandardParameters> = {};
    
    Object.entries(state.objectParams).forEach(([id, params]) => {
      normalizedObjectParams[id] = this.normalizeParameters(params);
    });
    
    return {
      // ...
      globalParams: normalizedGlobalParams,
      objectParams: normalizedObjectParams,
      // ...
    };
  }
  
  // 読み込み時のパラメータ検証
  async loadProjectData(projectData: ProjectFileData): Promise<void> {
    // レガシーパラメータの検出と警告
    const legacyGlobal = ParameterValidator.detectLegacyParameters(projectData.globalParams);
    const legacyObjects = Object.entries(projectData.objectParams)
      .map(([id, params]) => ({ id, legacy: ParameterValidator.detectLegacyParameters(params) }))
      .filter(item => item.legacy.length > 0);
    
    if (legacyGlobal.length > 0 || legacyObjects.length > 0) {
      throw new Error(`レガシーパラメータが検出されました。プロジェクトファイルの更新が必要です。`);
    }
    
    // 正規化されたパラメータでインポート
    // ...
  }
  
  private normalizeParameters(params: any): StandardParameters {
    const validation = ParameterValidator.validate(params);
    if (!validation.isValid) {
      console.warn('Parameter validation errors:', validation.errors);
    }
    return validation.sanitized;
  }
}
```

#### 4.2 ProjectFileData インターフェースの修正

**ファイル**: `/src/renderer/services/ProjectFileManager.ts`

```typescript
export interface ProjectFileData {
  version: string;
  metadata: ProjectMetadata;
  audio: AudioReference;
  lyricsData: PhraseUnit[];
  globalTemplateId: string;
  globalParams: StandardParameters;  // 型を統一
  objectParams: Record<string, StandardParameters>;  // 型を統一
  backgroundColor?: string;
  individualSettingsEnabled?: string[];
  // 後方互換性フィールドは削除
  // defaultTemplateId?: string;
  // templateAssignments?: Record<string, string>;
}
```

### 第5段階: UI層の修正

#### 5.1 TemplateTab の修正

**ファイル**: `/src/renderer/components/layout/TemplateTab.tsx`

**修正内容**:
- パラメータ表示・編集時の統一名使用
- `fill` や `defaultTextColor` の参照を `textColor` に変更

#### 5.2 パラメータエディターの修正

**対象ファイル**:
- パラメータ編集に関わる全UIコンポーネント

**修正方針**:
- 色パラメータの表示名を「テキスト色」に統一
- 内部的な値の参照を `textColor` に統一

### 第6段階: サービス層の修正

#### 6.1 ParamService の修正

**ファイル**: `/src/renderer/services/ParamService.ts`

**修正内容**:
- 統一パラメータスキーマの使用
- レガシー名の完全削除

#### 6.2 Engine の修正

**ファイル**: `/src/renderer/engine/Engine.ts`

**修正内容**:
- パラメータ関連メソッドの型をStandardParametersに統一
- テンプレート変更時のパラメータ処理を統一名で実行

### 第7段階: 自動保存・復元の修正

#### 7.1 PersistenceService の修正

**ファイル**: `/src/renderer/services/PersistenceService.ts`

**修正内容**:
- 自動保存データの正規化
- 復元時のパラメータ検証

#### 7.2 Engine の自動保存関連メソッド修正

**修正内容**:
- 自動保存データに統一パラメータを使用
- 復元時のレガシーパラメータチェック

### 第8段階: テストとバリデーション

#### 8.1 パラメータ変換テストの追加

**ファイル**: `/src/tests/ParameterValidator.test.ts` (新規作成)

```typescript
import { ParameterValidator } from '../utils/ParameterValidator';

describe('ParameterValidator', () => {
  test('should detect legacy parameters', () => {
    const legacyParams = {
      fill: '#FF0000',
      defaultTextColor: '#00FF00',
      fontSize: 120
    };
    
    const detected = ParameterValidator.detectLegacyParameters(legacyParams);
    expect(detected).toContain('fill');
    expect(detected).toContain('defaultTextColor');
  });
  
  test('should validate and sanitize parameters', () => {
    const params = {
      textColor: '#FF0000',
      fontSize: 120,
      invalidParam: 'should be removed'
    };
    
    const result = ParameterValidator.validate(params);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Unknown parameter: invalidParam');
    expect(result.sanitized.textColor).toBe('#FF0000');
  });
});
```

#### 8.2 統合テストの実行

**テスト項目**:
- [ ] プロジェクト保存・読み込みでパラメータが正しく保持される
- [ ] 個別設定が正しく適用される
- [ ] テンプレート変更時にパラメータが正しく変換される
- [ ] 自動保存・復元で値が保持される
- [ ] レガシーパラメータでエラーが発生する

## 実装優先順位と手順

### Phase 1: 基盤整備
1. **StandardParameters.ts** の作成
2. **ParameterValidator.ts** の作成
3. 基本的なテストの作成

### Phase 2: コア修正
4. **ParameterManager.ts** の修正
5. **Engine.ts** のパラメータ関連修正
6. **ProjectFileManager.ts** の修正

### Phase 3: テンプレート修正
7. **FlickerFadeTemplate.ts** の修正
8. 他のテンプレートファイルの修正
9. テンプレートのパラメータ定義統一

### Phase 4: UI・サービス修正
10. **TemplateTab.tsx** の修正
11. **ParamService.ts** の修正
12. **PersistenceService.ts** の修正

### Phase 5: 検証・テスト
13. 統合テストの実行
14. レガシーパラメータ検出の確認
15. 全機能の動作確認

## 破壊的変更の対応

### プロジェクトファイルの互換性
- レガシーパラメータを含むプロジェクトファイルは読み込み時にエラー
- ユーザーには明確なエラーメッセージと対処法を提示
- 必要に応じてマイグレーションツールの提供を検討

### 開発者への影響
- テンプレート開発者はパラメータ名の変更が必要
- 既存のカスタムテンプレートは修正が必要
- パラメータ参照部分の全面的な見直しが必要

## 期待される効果

1. **個別設定問題の完全解決**: パラメータ名の統一により値の上書きが解消
2. **型安全性の向上**: TypeScriptの型チェックが効果的に機能
3. **保守性の向上**: 統一されたパラメータ管理により、将来の機能追加が容易
4. **バグの減少**: パラメータ関連のバグの根本的な排除
5. **開発効率の向上**: 明確なパラメータスキーマによる開発速度向上

## リスクと対策

### リスク
- 大規模な修正による新たなバグの混入
- 既存プロジェクトファイルとの非互換性
- テンプレート開発者への影響

### 対策
- 段階的な実装とテスト
- 包括的なテストスイートの作成
- 明確なエラーメッセージとドキュメント整備
- 必要に応じたマイグレーション支援

## 完了基準

- [ ] 全ての `fill` と `defaultTextColor` の参照が `textColor` に変更完了
- [ ] 全てのパラメータ関連処理が `StandardParameters` 型を使用
- [ ] レガシーパラメータを含むプロジェクトで適切なエラーが発生
- [ ] 個別設定が全てのテンプレートで正しく動作
- [ ] 自動保存・復元が正しく動作
- [ ] 全ての統合テストが成功