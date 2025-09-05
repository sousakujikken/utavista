# テンプレートシステム設計

## 概要

UTAVISTAのテンプレートシステムは、階層的アニメーション処理とJSON駆動の動的登録を特徴とする独特な設計です。一般的なアニメーションライブラリとは異なり、歌詞アニメーションに特化した3階層責任分離モデルを採用しています。

## 設計思想

### なぜこの設計なのか

**1. 歌詞アニメーションの特性**
- フレーズ全体の動き（入場・退場）
- 単語間の連続性（流れるような表示）  
- 文字個別の表現（点滅・色変化）

これらの異なるアニメーション責任を分離するため、3階層モデルを採用しました。

**2. 拡張性の要求**
- 新しいアニメーション効果の追加が容易
- 既存テンプレートに影響しない独立性
- パラメータ設定の動的生成

## 階層責任分離モデル

### 3階層の責任分担

```typescript
interface IAnimationTemplate {
  // 階層別の専用メソッド
  renderPhraseContainer(container: PIXI.Container, ...): void    // フレーズレベル
  renderWordContainer(container: PIXI.Container, ...): void     // 単語レベル  
  renderCharContainer(container: PIXI.Container, ...): void     // 文字レベル
}
```

#### Phrase Container（フレーズコンテナ）
**責任**: フレーズ全体の配置・移動・フィルター適用
- 段配置の管理（MultiLineTextベース）
- フレーズ全体のフェードイン・アウト
- グローバルフィルター（Glow、Shadow）の適用
- **重要**: テキストレンダリングは行わない

#### Word Container（単語コンテナ）  
**責任**: 文字配置の管理・単語間の連続性
- `charIndex`による正確な文字位置計算
- 文字間隔（letterSpacing）の管理
- 単語境界の処理
- **重要**: テキストレンダリングは行わない

#### Character Container（文字コンテナ）
**責任**: 実際のテキスト描画・個別アニメーション
- PIXI.Textオブジェクトの作成・更新
- 文字固有のアニメーション（点滅・色変化・回転）
- テキストスタイルの適用

### なぜ親コンテナはテキストレンダリングしないのか

**設計原則**: 「責任の単一性」
- 複数階層でテキストを描画すると重複・競合が発生
- アニメーション効果の組み合わせが困難
- デバッグ時の問題特定が複雑化

**実装上の利点**:
- 各階層のアニメーション効果が独立
- パフォーマンスの最適化が容易
- 階層構造の変更に対する耐性

## JSON駆動の動的登録システム

### 登録システムの独特な設計

```typescript
// templates.json での設定
{
  "FlickerFade": {
    "displayName": "Flicker Fade",
    "exportName": "FlickerFadeTemplate",
    "category": "カラオケ",
    "description": "点滅しながらフェードイン・アウト"
  }
}
```

**なぜJSON駆動なのか**:
1. **動的性**: コンパイル時にテンプレート一覧が決まらない
2. **拡張性**: プラグイン的なテンプレート追加が可能
3. **メタデータ管理**: 表示名・カテゴリ・説明の一元管理

### 動的インポート解決

```typescript
const createTemplateRegistry = (): TemplateRegistry => {
  const registry: TemplateRegistry = {};
  
  Object.entries(templateConfigs).forEach(([id, config]) => {
    registry[id] = {
      create: () => new templates[config.exportName](),
      metadata: { ...defaultMetadata, ...config }
    };
  });
  
  return registry;
};
```

**独特な点**:
- `exportName`による間接参照でモジュール解決
- メタデータの階層的継承（テンプレート固有 → デフォルト）
- 短縮IDとフルIDの両方対応

## animateContainer() ルーティング方式

### 中央集権的な処理振り分け

```typescript
animateContainer(
  container: PIXI.Container,
  hierarchyType: HierarchyType,  // 'phrase' | 'word' | 'char'
  // ... その他パラメータ
): void {
  switch (hierarchyType) {
    case 'phrase':
      this.renderPhraseContainer(container, ...);
      break;
    case 'word':  
      this.renderWordContainer(container, ...);
      break;
    case 'char':
      this.renderCharContainer(container, ...);
      break;
  }
}
```

**なぜこの方式なのか**:
1. **統一インターフェース**: InstanceManagerから見た呼び出しが統一
2. **型安全性**: TypeScriptの型チェックが効果的に機能
3. **デバッグ性**: 階層別の処理が明確に分離

**従来方式との違い**:
- 階層別メソッドを直接呼ぶのではなく、統一エントリーポイント経由
- パラメータ検証・前処理の統一化
- エラーハンドリングの一元化

## removeVisualElements() によるコンテナ保持設計

### 視覚要素のみ削除する設計

```typescript
removeVisualElements(container: PIXI.Container): void {
  // 子コンテナは保持、視覚要素（PIXI.Text等）のみ削除
  container.children.forEach(child => {
    if (child instanceof PIXI.Text) {
      container.removeChild(child);
    }
    // PIXI.Container は保持（階層構造を維持）
  });
}
```

**なぜコンテナを保持するのか**:
1. **パフォーマンス**: コンテナ再作成のコストを削減
2. **階層維持**: 親子関係の再構築を回避
3. **位置情報保持**: 座標・スケール等の状態を維持

**一般的な破棄方式との違い**:
- 全削除ではなく選択的削除
- 階層構造の永続化
- 状態の部分的保持

## テンプレートパラメータの動的UI生成

### パラメータ管理システム（v0.4.3で大幅刷新）

**従来の方式（v0.4.2以前）**:
```typescript
// ❌ 非推奨: 各テンプレートで個別にパラメータを定義
getParameterConfig(): ParameterConfig[] {
  return [
    {
      name: "flickerIntensity",
      type: "number",
      default: 0.8,
      min: 0,
      max: 1,
      step: 0.1,
      description: "点滅の強度"
    }
  ];
}
```

**新しい方式（v0.4.3以降）**:
```typescript
// ✅ 推奨: ParameterRegistryで事前登録
// /src/renderer/utils/ParameterRegistry.ts で一元管理
this.registerParameter({
  name: 'flickerIntensity',
  type: 'number',
  category: 'template-specific',
  templateId: 'flickerfadetemplate',
  defaultValue: 0.8,
  min: 0,
  max: 1,
  description: '点滅の強度'
});
```

**新システムの利点**:
1. **パラメータ乱造の防止**: 登録されていないパラメータは使用不可
2. **一元管理**: すべてのパラメータが単一の場所で定義・管理
3. **型安全性の強化**: コンパイル時＋実行時の二重チェック
4. **開発効率の向上**: 自動検証ツールによる整合性チェック
5. **バリデーション**: min/max/step による入力制限と値範囲チェック
- パラメータの意味・制約をテンプレート側で定義
- UIコンポーネントの自動生成

## 時間同期における基準と連動要素

### 時間同期の基準

**基準時刻**: `nowMs` (ミリ秒)
- 音声再生時刻が絶対的な基準
- すべてのアニメーション計算はこの時刻を基準に実行

### 階層別の時間連動

```typescript
// 各階層が同じ時間基準で独立して動作
renderPhraseContainer(container, nowMs, startMs, endMs, ...): void
renderWordContainer(container, nowMs, startMs, endMs, ...): void  
renderCharContainer(container, nowMs, startMs, endMs, ...): void
```

**連動要素**:
1. **フェーズ判定**: 共通のAnimationPhase（in/active/out）
2. **相対時間計算**: `(nowMs - startMs) / (endMs - startMs)`で正規化
3. **階層間の時間オフセット**: 親の時間範囲内で子の時間を計算

### テンプレート実装での時間処理例

```typescript
// FlickerFadeTemplate での時間同期実装
const progress = Math.max(0, Math.min(1, (nowMs - startMs) / duration));
const flickerFreq = this.calculateFlickerFrequency(progress);
const alpha = this.calculateAlpha(progress, phase);
```

**独特な点**:
- 絶対時間ではなく相対進行度（progress）ベースの計算
- 階層を跨いだ時間の一貫性保証
- フェーズ別の時間処理分岐

## まとめ

UTAVISTAのテンプレートシステムは、歌詞アニメーションの特性に特化した独特な設計を採用しています：

1. **3階層責任分離**: フレーズ・単語・文字の明確な役割分担
2. **JSON駆動登録**: 動的で拡張性の高いテンプレート管理
3. **統一ルーティング**: animateContainer()による中央集権的処理
4. **コンテナ保持**: パフォーマンスと状態保持を両立
5. **動的UI生成**: テンプレート固有のパラメータ設定UI
6. **統一時間基準**: 音声時刻を基準とした階層横断の同期

この設計により、複雑な歌詞アニメーション処理を、保守しやすく拡張可能な形で実現しています。