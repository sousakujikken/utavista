# テンプレートエクスポート方式直接移行　開始指示書

## 🎯 ミッション概要

UTAVISTAプロジェクトの全テンプレートを、現在の混在するエクスポート方式から統一されたクラスエクスポート方式へ直接移行してください。

**重要**: 互換性レイヤーは使用せず、完全に設計された状態で一括移行を行います。

## 📋 前提条件

- プロジェクトルート: `/Users/hirocat/Library/Mobile Documents/com~apple~CloudDocs/development/visiblyrics`
- 移行計画書: `/docs/template-export-direct-migration-plan.md` を参照
- 現在12個のテンプレートが存在（混在パターン）

## 🚀 実行指示

### Step 1: 完全設計フェーズ（最優先）

1. **現状の詳細分析**
   ```bash
   # 以下のコマンドで全テンプレートの実装パターンを調査
   find src/renderer/templates -name "*.ts" -not -path "*/registry/*" -exec grep -l "export" {} \;
   ```

2. **新しいTemplateRegistryの設計・実装**
   - ファイル: `/src/renderer/templates/registry/templateRegistry.ts`
   - クラス以外のエクスポートでは即座にエラーを発生させる設計
   - 必須メソッドの存在確認機能を追加

3. **変換ルールの確定**
   - オブジェクトリテラル → クラス変換パターン
   - クラス+インスタンス → クラス単体変換パターン

### Step 2: 自動化ツール開発

4. **変換スクリプト作成**
   - ファイル: `/scripts/migrate-templates.ts`
   - 全テンプレートを一括でクラスエクスポート形式に変換
   - AST解析による確実な変換

5. **検証スクリプト作成**
   - ファイル: `/scripts/validate-templates.ts`
   - TypeScript型チェック
   - 必須メソッドの存在確認
   - ランタイム動作確認

### Step 3: 一括変換実行

6. **バックアップ作成**
   ```bash
   git checkout -b template-migration-backup
   git add . && git commit -m "Pre-migration backup"
   git checkout -b template-class-migration
   ```

7. **自動変換実行**
   - 作成したスクリプトで全テンプレートを変換
   - 変換後の型チェック実行

### Step 4: 完全検証

8. **機能テスト実行**
   - 全テンプレートの読み込み確認
   - UI でのテンプレート切り替え動作確認
   - アニメーション動作確認

9. **統合テスト実行**
   - エンジンとの統合動作確認
   - プロジェクト保存・読み込み確認

### Step 5: 最終調整

10. **エラー対応**
    - 発生した問題の原因特定と修正
    - 修正内容の文書化

11. **完了確認**
    - すべてのテンプレートがクラスエクスポート
    - TypeScript コンパイルエラーゼロ
    - 機能の完全互換性確認

## 🎯 成功条件

### 必達条件
- [ ] 全12個のテンプレートがクラスエクスポート形式
- [ ] 既存機能の100%互換性維持
- [ ] TypeScriptコンパイルエラーゼロ
- [ ] ランタイムエラーゼロ

### 品質条件
- [ ] テンプレート切り替えが正常動作
- [ ] アニメーション表示が正常動作
- [ ] パフォーマンス劣化なし

## 🚨 重要な制約

1. **互換性レイヤー禁止**: 複雑性を避けるため、互換性レイヤーは一切使用しない
2. **エラー時の原則**: 動かない場合は設計に問題があると判断し、設計から見直す
3. **一括移行**: 段階的移行ではなく、全テンプレートを一括で変換する
4. **完全テスト**: 移行前後で同一の動作を保証する

## 📂 主要ファイル

### 変更対象
- `/src/renderer/templates/*.ts` (12ファイル)
- `/src/renderer/templates/registry/templateRegistry.ts`
- `/src/renderer/templates/index.ts`

### 作成対象
- `/scripts/migrate-templates.ts`
- `/scripts/validate-templates.ts`

### 参考資料
- `/docs/template-export-direct-migration-plan.md`
- `/docs/template-implementation-guide.md`
- `/CLAUDE.md`

## 🔧 開発環境設定

```bash
# プロジェクトルートに移動
cd "/Users/hirocat/Library/Mobile Documents/com~apple~CloudDocs/development/visiblyrics"

# 依存関係の確認
npm install

# 現在の状態でビルド確認
npm run build
```

## 📝 進捗報告

各ステップ完了時に以下を報告してください：
1. 実施した作業内容
2. 発生した問題と解決方法
3. 次のステップへの準備状況
4. 懸念事項があれば報告

## 🆘 緊急時対応

問題が発生した場合の即座のロールバック：
```bash
git checkout template-migration-backup
git checkout main
git merge template-migration-backup --no-ff
```

## 🎌 開始合図

準備ができましたら、「Step 1: 完全設計フェーズ」から開始してください。

**Let's make it happen! 🚀**

---

作成日: 2025年8月4日  
最終更新: 2025年8月4日