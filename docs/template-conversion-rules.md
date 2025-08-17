# Template Conversion Rules - Step 1 Design

## 変換対象の分類と規則

### パターン1: オブジェクトリテラル → クラス変換

**対象テンプレート:** WordSlideText, GlitchText, WordSlideText2, MultiLineText, FlickerFadeTemplate, MultiLineStackTemplate, WordSlideTextLLM など

**変換前:**
```typescript
import { IAnimationTemplate, ParameterConfig } from '../types/types';

export const WordSlideText: IAnimationTemplate = {
  metadata: {
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: "UTAVISTA Team"
  },

  getParameterConfig(): ParameterConfig[] {
    return [
      // パラメータ定義
    ];
  },

  animateContainer(/* ... */): boolean {
    // 実装
    return true;
  },

  renderPhraseContainer(/* ... */): boolean {
    // 実装
    return true;
  },

  // その他のメソッド...
};

export default WordSlideText;
```

**変換後:**
```typescript
import { IAnimationTemplate, ParameterConfig } from '../types/types';

export class WordSlideText implements IAnimationTemplate {
  readonly metadata = {
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: "UTAVISTA Team"
  };

  getParameterConfig(): ParameterConfig[] {
    return [
      // パラメータ定義（同一）
    ];
  }

  animateContainer(/* ... */): boolean {
    // 実装（同一）
    return true;
  }

  renderPhraseContainer(/* ... */): boolean {
    // 実装（同一）
    return true;
  }

  // その他のメソッド...（同一）
}

export default WordSlideText;
```

### パターン2: クラス+インスタンス → クラスのみ変換

**対象テンプレート:** BlurFadeTemplate, PhraseBlurFadeTemplate

**変換前:**
```typescript
import { IAnimationTemplate, ParameterConfig } from '../types/types';

class BlurFadeTemplateClass implements IAnimationTemplate {
  metadata = {
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: "UTAVISTA Team"
  };

  private layoutPrimitive = new EnhancedCumulativeLayoutPrimitive();

  getParameterConfig(): ParameterConfig[] {
    return [
      // パラメータ定義
    ];
  }

  // メソッド実装...
}

// インスタンスをエクスポート
export const BlurFadeTemplate = new BlurFadeTemplateClass();
```

**変換後:**
```typescript
import { IAnimationTemplate, ParameterConfig } from '../types/types';

export class BlurFadeTemplate implements IAnimationTemplate {
  readonly metadata = {
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: "UTAVISTA Team"
  };

  private layoutPrimitive = new EnhancedCumulativeLayoutPrimitive();

  getParameterConfig(): ParameterConfig[] {
    return [
      // パラメータ定義（同一）
    ];
  }

  // メソッド実装...（同一）
}

export default BlurFadeTemplate;
```

## 変換規則の詳細

### 1. クラス名の決定
- オブジェクトリテラル: `export const Name` → `export class Name`
- クラス+インスタンス: `class NameClass` → `export class Name`

### 2. メタデータの扱い
- オブジェクトリテラル: `metadata: { ... }` → `readonly metadata = { ... };`
- クラス+インスタンス: 変更なし

### 3. メソッドの変換
- オブジェクトリテラル: `methodName(params): ReturnType { ... }` → `methodName(params): ReturnType { ... }`
- アロー関数は通常の関数として変換
- `this` バインディングの確認が必要

### 4. プライベートプロパティ
- クラス+インスタンスパターンで既に存在するプライベートプロパティは保持
- オブジェクトリテラルで使用されているクロージャ変数はプライベートプロパティに変換

### 5. デフォルトエクスポート
- 両パターンとも `export default ClassName;` を追加
- 名前付きエクスポートも維持: `export class ClassName`

## 変換時の注意点

### 1. thisコンテキストの確認
オブジェクトリテラルからクラスへの変換時、メソッド内で `this` を使用している箇所を確認:

```typescript
// 変換前 - オブジェクトリテラル
export const Template = {
  someProperty: 'value',
  
  someMethod() {
    // thisは正常に動作
    return this.someProperty;
  }
};

// 変換後 - クラス
export class Template {
  private someProperty = 'value';
  
  someMethod() {
    // thisは正常に動作（変更なし）
    return this.someProperty;
  }
}
```

### 2. アロー関数の処理
```typescript
// 変換前
export const Template = {
  arrowMethod: () => {
    // thisは外側のコンテキストを参照
  }
};

// 変換後
export class Template {
  arrowMethod = () => {
    // thisはクラスインスタンスを参照
  }
  
  // または通常のメソッドに変換
  arrowMethod() {
    // thisはクラスインスタンスを参照
  }
}
```

### 3. プリミティブインスタンスの扱い
クラス+インスタンスパターンでプリミティブをインスタンス変数として保持している場合:

```typescript
// 変換前
class TemplateClass {
  private primitive = new SomePrimitive();
}

// 変換後（同一）
export class Template {
  private primitive = new SomePrimitive();
}
```

## 検証項目

各変換後のテンプレートは以下を満たす必要がある:

1. **TypeScriptコンパイル**: エラーなくコンパイル可能
2. **インターフェース準拠**: `IAnimationTemplate` の完全実装
3. **インスタンス化可能**: `new ClassName()` で正常にインスタンス作成
4. **メソッド実行**: 全ての必須メソッドが正常実行
5. **パラメータ設定**: `getParameterConfig()` の正常動作
6. **ランタイム動作**: 既存の動作と完全一致

## 自動化の可能性

### 完全自動化可能
- オブジェクトリテラルのクラス変換
- export文の書き換え
- メタデータの readonly 変換

### 手動確認必要
- thisコンテキストの使用確認
- アロー関数の適切な変換
- プライベートプロパティの配置
- プリミティブインスタンスの初期化タイミング

## 次のステップ

この変換規則に基づいて、Step 2 で自動変換スクリプトを作成し、Step 3 で一括変換を実行する。