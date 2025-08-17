# テンプレートエクスポート方式移行計画

## 概要

UTAVISTAプロジェクトにおけるテンプレートのエクスポート方式を、現在のインスタンスエクスポートから標準的なクラスエクスポートへ段階的に移行する計画書です。

### 作成日: 2025年8月4日
### バージョン: 1.0

## 背景

### 現状の問題点

1. **一般的なTypeScript慣習との相違**
   - 通常: `export class MyClass {}`
   - 現状: `export const MyTemplate = new MyTemplateClass()`

2. **開発者の混乱**
   - 新規開発者が慣習的にクラスエクスポートを使用し、エラーが発生
   - 既存のパターンが明文化されていない

3. **技術的制約**
   - テストの記述が困難（モック化しにくい）
   - 状態管理の問題（シングルトンインスタンスの共有）
   - 型情報の損失

## 現状分析

### テンプレート実装パターンの内訳

調査日: 2025年8月4日

| パターン | テンプレート数 | 例 |
|---------|--------------|-----|
| クラス + インスタンスエクスポート | 2 | BlurFadeTemplate, PhraseBlurFadeTemplate |
| オブジェクトリテラル | 10 | WordSlideText, GlitchText, FlickerFadeTemplate等 |
| 合計 | 12 | - |

### 影響を受けるファイル

1. **テンプレートファイル** (12ファイル)
   - `/src/renderer/templates/*.ts`

2. **レジストリ関連** (2ファイル)
   - `/src/renderer/templates/registry/templateRegistry.ts`
   - `/src/renderer/templates/index.ts`

3. **エンジン関連** (複数ファイル)
   - `/src/renderer/engine/TemplateManager.ts`
   - `/src/renderer/engine/InstanceManager.ts`
   - その他のエンジンファイル

## 移行計画

### Phase 1: 互換性レイヤーの実装（1週間）

#### 目標
既存のコードを壊すことなく、両方のエクスポート方式をサポートする

#### 実装内容

1. **templateRegistry.tsの拡張**
```typescript
function createTemplateRegistry(): TemplateRegistryEntry[] {
  const entries = config.templates.map(templateConfig => {
    const exportedValue = (templates as any)[templateConfig.exportName];
    
    let template: IAnimationTemplate;
    let templateConstructor: new() => IAnimationTemplate | undefined;
    
    // クラスかインスタンスかを判定
    if (typeof exportedValue === 'function') {
      // クラスの場合
      templateConstructor = exportedValue;
      template = new exportedValue();
    } else {
      // インスタンスまたはオブジェクトリテラルの場合
      template = exportedValue;
      templateConstructor = undefined;
    }
    
    return {
      id: templateConfig.id,
      name: templateConfig.name,
      template: template,
      templateConstructor: templateConstructor,
      metadata: undefined
    };
  });
  return entries;
}
```

2. **TemplateRegistryEntryの型拡張**
```typescript
export interface TemplateRegistryEntry {
  id: string;
  name: string;
  template: IAnimationTemplate;
  templateConstructor?: new() => IAnimationTemplate;  // 追加
  metadata?: TemplateMetadata;
}
```

#### テスト項目
- [ ] 既存のインスタンスエクスポートが動作すること
- [ ] 新規のクラスエクスポートが動作すること
- [ ] 混在環境で問題が発生しないこと

### Phase 2: 新規テンプレートガイドラインの策定（3日）

#### 実装内容

1. **テンプレート作成ガイドの更新**
   - `/docs/template-implementation-guide.md`に新規セクション追加
   - クラスエクスポートのベストプラクティス

2. **テンプレートのひな形作成**
```typescript
// templates/TemplateBoilerplate.ts
export class MyNewTemplate implements IAnimationTemplate {
  // プロパティはprivate readonly推奨
  private readonly metadata = {
    license: "MIT",
    licenseUrl: "https://opensource.org/licenses/MIT",
    originalAuthor: "UTAVISTA Development Team"
  };

  // ステートレスを維持
  getParameterConfig(): ParameterConfig[] {
    return [
      // パラメータ定義
    ];
  }

  animateContainer(/* ... */): boolean {
    // 実装
  }
  
  // 他の必須メソッド
}
```

### Phase 3: 段階的移行（2-3週間）

#### 優先順位

1. **高優先度**（よく使用される）
   - WordSlideText
   - FlickerFadeTemplate
   - MultiLineText

2. **中優先度**
   - GlitchText
   - WordSlideText2
   - MultiLineStackTemplate

3. **低優先度**（実験的/レガシー）
   - WordSlideTextLLM
   - その他

#### 移行手順（テンプレートごと）

1. **リファクタリング**
   ```typescript
   // Before
   export const TemplateX: IAnimationTemplate = {
     // ...
   };
   
   // After
   export class TemplateX implements IAnimationTemplate {
     // ...
   }
   ```

2. **テスト実施**
   - ユニットテスト作成
   - 統合テスト実施
   - ビジュアルレグレッションテスト

3. **段階的デプロイ**
   - 開発環境でテスト
   - ステージング環境で検証
   - 本番環境へリリース

### Phase 4: 旧コードの削除（1週間）

#### 実施内容

1. **互換性レイヤーの削除**
   - templateRegistry.tsの簡素化
   - 不要な型定義の削除

2. **ドキュメント更新**
   - 移行完了の記録
   - 新しいアーキテクチャの説明

## リスクと対策

### リスク1: 実行時エラー

**対策:**
- 互換性レイヤーによる段階的移行
- 包括的なエラーハンドリング
- ロールバック計画の準備

### リスク2: パフォーマンス低下

**対策:**
- テンプレートインスタンスのキャッシング
- 遅延初期化の実装
- パフォーマンステストの実施

### リスク3: サードパーティ統合への影響

**対策:**
- APIの後方互換性維持
- 十分な移行期間の設定
- 明確なコミュニケーション

## 成功指標

1. **技術的指標**
   - [ ] すべてのテンプレートがクラスエクスポートに移行
   - [ ] テストカバレッジ80%以上
   - [ ] パフォーマンス劣化なし

2. **開発体験指標**
   - [ ] 新規テンプレート作成時間の短縮
   - [ ] エラー発生率の低下
   - [ ] ドキュメントの完備

## スケジュール

| フェーズ | 期間 | 開始予定 | 完了予定 |
|---------|------|---------|---------|
| Phase 1 | 1週間 | 2025年8月5日 | 2025年8月11日 |
| Phase 2 | 3日 | 2025年8月12日 | 2025年8月14日 |
| Phase 3 | 2-3週間 | 2025年8月15日 | 2025年9月4日 |
| Phase 4 | 1週間 | 2025年9月5日 | 2025年9月11日 |

## 承認と責任者

- **計画承認者**: [プロジェクトリード]
- **実施責任者**: [テックリード]
- **レビュー担当**: [シニアエンジニア]

## 付録

### A. 移行チェックリスト

- [ ] 互換性レイヤーの実装完了
- [ ] ガイドライン文書の作成完了
- [ ] 高優先度テンプレートの移行完了
- [ ] 中優先度テンプレートの移行完了
- [ ] 低優先度テンプレートの移行完了
- [ ] 旧コードの削除完了
- [ ] 最終テストの実施完了
- [ ] ドキュメントの更新完了

### B. 関連ドキュメント

- `/docs/template-implementation-guide.md`
- `/docs/parameter-management-guide.md`
- `/src/renderer/types/types.ts`
- `/CLAUDE.md`

### C. コミュニケーション計画

1. **キックオフミーティング**
   - 移行計画の説明
   - 質疑応答

2. **週次進捗報告**
   - Slackでの進捗共有
   - 問題点の早期発見

3. **完了報告**
   - 最終成果の報告
   - 知見の共有

---

最終更新: 2025年8月4日