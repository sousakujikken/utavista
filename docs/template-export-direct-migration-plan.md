# テンプレートエクスポート方式直接移行計画

## 概要

UTAVISTAプロジェクトにおけるテンプレートのエクスポート方式を、互換性レイヤーを用いずに一括でクラスエクスポートへ移行する計画書です。

### 作成日: 2025年8月4日
### バージョン: 2.0（直接移行版）

## 基本方針

**「動かない = 設計に問題がある」を前提とした確実な移行**

1. **互換性レイヤー不使用**: 複雑性を避け、明確な設計で一括移行
2. **完全なテスト駆動**: 移行前後で同一の動作を保証
3. **段階的検証**: 小さな単位で確実に動作確認

## 現状分析

### テンプレート分類（詳細調査結果）

| 分類 | 数 | テンプレート名 | 実装パターン |
|------|----|--------------|-----------| 
| クラス+インスタンス | 2 | BlurFadeTemplate, PhraseBlurFadeTemplate | `new ClassInstance()` |
| オブジェクトリテラル | 10 | WordSlideText, GlitchText等 | `const Template = { ... }` |

### 移行対象の明確化

**すべてのテンプレートを以下の統一形式に変更:**

```typescript
export class TemplateName implements IAnimationTemplate {
  readonly metadata = { /* ... */ };
  
  getParameterConfig(): ParameterConfig[] { /* ... */ }
  animateContainer(/* ... */): boolean { /* ... */ }
  renderPhraseContainer(/* ... */): boolean { /* ... */ }
  renderWordContainer(/* ... */): boolean { /* ... */ }
  renderCharContainer(/* ... */): boolean { /* ... */ }
  removeVisualElements(/* ... */): void { /* ... */ }
}
```

## 移行戦略

### Step 1: 完全設計フェーズ（3日）

#### 1.1 新しいTemplateRegistryの設計

```typescript
// 新設計: templateRegistry.ts
function createTemplateRegistry(): TemplateRegistryEntry[] {
  const entries = config.templates.map(templateConfig => {
    const TemplateClass = (templates as any)[templateConfig.exportName];
    
    // クラスでない場合は即座にエラー
    if (typeof TemplateClass !== 'function') {
      throw new Error(`Template ${templateConfig.id} must be exported as a class, not as ${typeof TemplateClass}`);
    }
    
    // インスタンス作成をここで行う
    const template = new TemplateClass();
    
    // IAnimationTemplateの必須メソッドの存在確認
    if (typeof template.getParameterConfig !== 'function') {
      throw new Error(`Template ${templateConfig.id} must implement getParameterConfig() method`);
    }
    
    return {
      id: templateConfig.id,
      name: templateConfig.name,
      template: template,
      templateClass: TemplateClass
    };
  });
  
  return entries;
}
```

#### 1.2 テンプレート変換ルールの策定

**オブジェクトリテラル → クラス変換ルール:**

```typescript
// Before (オブジェクトリテラル)
export const MyTemplate: IAnimationTemplate = {
  getParameterConfig() { return []; },
  animateContainer() { return true; },
  // ...
};

// After (クラス)
export class MyTemplate implements IAnimationTemplate {
  getParameterConfig(): ParameterConfig[] { return []; }
  animateContainer(): boolean { return true; }
  // ...
}
```

**クラス+インスタンス → クラスのみ変換ルール:**

```typescript
// Before (クラス+インスタンス)
class MyTemplateClass implements IAnimationTemplate { /* ... */ }
export const MyTemplate = new MyTemplateClass();

// After (クラスのみ)
export class MyTemplate implements IAnimationTemplate { /* ... */ }
```

### Step 2: 自動化ツールの作成（2日）

#### 2.1 変換スクリプトの開発

```typescript
// scripts/migrate-templates.ts
interface TemplateInfo {
  filePath: string;
  currentPattern: 'object' | 'class-instance';
  className: string;
  exportName: string;
}

async function migrateTemplate(info: TemplateInfo): Promise<void> {
  const content = await fs.readFile(info.filePath, 'utf-8');
  
  let newContent: string;
  
  switch (info.currentPattern) {
    case 'object':
      newContent = convertObjectToClass(content, info);
      break;
    case 'class-instance':
      newContent = convertInstanceToClass(content, info);
      break;
  }
  
  await fs.writeFile(info.filePath, newContent);
}
```

#### 2.2 検証スクリプトの開発

```typescript
// scripts/validate-templates.ts
async function validateAllTemplates(): Promise<void> {
  for (const template of getAllTemplateFiles()) {
    // 1. TypeScriptコンパイルチェック
    await validateTypeScript(template.filePath);
    
    // 2. 必須メソッドの存在確認
    await validateRequiredMethods(template);
    
    // 3. パラメータ設定の検証
    await validateParameterConfig(template);
    
    // 4. ランタイム動作確認
    await validateRuntimeBehavior(template);
  }
}
```

### Step 3: テンプレート一括変換（1日）

#### 実行手順

1. **バックアップ作成**
   ```bash
   git checkout -b template-migration-backup
   git add . && git commit -m "Pre-migration backup"
   ```

2. **自動変換実行**
   ```bash
   npm run migrate:templates
   ```

3. **型チェック実行**
   ```bash
   npm run validate:templates
   npx tsc --noEmit
   ```

4. **ランタイムテスト実行**
   ```bash
   npm run test:templates
   ```

### Step 4: 完全検証（2日）

#### 4.1 機能テスト

- [ ] 全テンプレートの読み込み確認
- [ ] パラメータ設定の表示確認
- [ ] アニメーション動作確認
- [ ] パフォーマンステスト

#### 4.2 統合テスト

- [ ] エンジンとの統合確認
- [ ] UIでのテンプレート切り替え確認
- [ ] プロジェクト保存・読み込み確認

### Step 5: 最終調整（1日）

#### エラー対応方針

**エラーが発生した場合:**
1. **即座に原因特定**: 変換ツールまたは設計の問題を明確化
2. **修正実施**: 自動変換ツールの修正または手動修正
3. **再検証**: 修正後の完全テスト実行
4. **文書化**: 発生した問題と解決策を記録

## スケジュール（合計9日）

| ステップ | 期間 | 内容 |
|---------|------|------|
| Step 1 | 3日 | 完全設計・ルール策定 |
| Step 2 | 2日 | 自動化ツール開発 |
| Step 3 | 1日 | 一括変換実行 |
| Step 4 | 2日 | 完全検証 |
| Step 5 | 1日 | 最終調整・文書化 |

## 成功条件

### 必達条件

1. **すべてのテンプレートがクラスエクスポート形式**
2. **既存機能の100%互換性維持**
3. **TypeScriptコンパイルエラーゼロ**
4. **ランタイムエラーゼロ**

### 品質条件

1. **テストカバレッジ90%以上**
2. **パフォーマンス劣化なし**
3. **メモリリーク発生なし**

## リスク管理

### 主要リスク

1. **自動変換の失敗**
   - **対策**: 段階的変換、手動レビュー必須

2. **複雑なテンプレートでの変換エラー**
   - **対策**: 事前の複雑度分析、手動変換準備

3. **実行時の予期しない動作**
   - **対策**: 包括的なランタイムテスト

### 緊急時対応

**即座のロールバック手順:**
```bash
git checkout template-migration-backup
git checkout main
git merge template-migration-backup
```

## メリット

1. **シンプルな設計**: 複雑性の排除
2. **明確なエラー原因**: 問題箇所の特定が容易
3. **保守性向上**: 統一されたパターン
4. **テスト容易性**: モック作成が簡単
5. **将来性**: TypeScriptのベストプラクティスに準拠

## 結論

互換性レイヤーを用いない直接移行により、技術的負債を増やすことなく、確実で保守性の高いアーキテクチャへの移行を実現します。

「動かない場合は設計に問題がある」という原則に基づき、問題を先送りせず、根本的な解決を図ります。

---

最終更新: 2025年8月4日