# フレーズ単位入場テンプレート設計ガイド

## 概要

UTAVISTA v0.4.3では、`wordDisplayMode`パラメーターからフレーズ単位入場のオプション（`phrase_cumulative_same_line`、`phrase_cumulative_new_line`）が削除されました。これは、エンジン側で単語の個別タイミングを使った入場システムが実装されているため、パラメーター設定だけではフレーズ単位入場が適切に動作しないためです。

フレーズ単位で入場するアニメーションを実装したい場合は、**テンプレート側でカスタム設計を行う**必要があります。

## フレーズ単位入場の実装アプローチ

### 1. GlitchTextPrimitiveを参考にした実装

`GlitchTextPrimitive`は、フレーズ全体を一括で表示するテンプレートの良い例です。

#### 主な特徴：
- フレーズ内のすべての単語が**同じタイミング**で表示される
- 単語間の配置は`FlexibleCumulativeLayoutPrimitive`を使用して管理
- エンジンの単語個別タイミングを無視し、フレーズタイミングのみを使用

#### 実装のポイント：
```typescript
// フレーズ全体のタイミングのみを使用
const phraseStartTime = /* フレーズ開始時間 */;
const phraseEndTime = /* フレーズ終了時間 */;

// 個別の単語タイミングは使用しない
// すべての単語をフレーズタイミングで制御
```

### 2. カスタムタイミング制御の実装

フレーズ単位入場を実装する場合の一般的な手順：

#### Step 1: フレーズレベルでのタイミング管理
```typescript
renderPhraseContainer(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  nowMs: number,
  startMs: number,  // フレーズ開始時間
  endMs: number,    // フレーズ終了時間
  phase: AnimationPhase,
  hierarchyType: HierarchyType
): boolean {
  // フレーズ全体のアニメーション制御
  // 個別の単語タイミングは無視
}
```

#### Step 2: 単語コンテナの統一制御
```typescript
renderWordContainer(
  container: PIXI.Container,
  text: string,
  params: Record<string, unknown>,
  nowMs: number,
  startMs: number,  // フレーズ開始時間を使用（単語個別タイミングを無視）
  endMs: number,    // フレーズ終了時間を使用
  phase: AnimationPhase,
  hierarchyType: HierarchyType
): boolean {
  // すべての単語を同じタイミングで制御
  // wordIndexに基づく位置調整のみ実装
}
```

#### Step 3: レイアウトプリミティブの活用
```typescript
// FlexibleCumulativeLayoutPrimitiveを使用
const layoutParams = {
  wordDisplayMode: WordDisplayMode.SIMULTANEOUS_WITH_SPACING, // または適切なモード
  charSpacing: params.charSpacing as number,
  wordSpacing: params.wordSpacing as number,
  // ... その他のパラメーター
};
```

### 3. 改行スタイルの実装

単語ごとに改行するフレーズ入場を実装する場合：

#### Y座標の管理
```typescript
// 単語のY座標を動的に計算
const wordY = wordIndex * fontSize * lineHeight;
container.position.set(containerX, wordY);
```

#### タイミング調整
```typescript
// フレーズ全体のタイミング内で単語ごとに若干の遅延を追加
const wordDelay = wordIndex * 100; // 100msずつ遅延
const effectiveStartTime = startMs + wordDelay;
```

## 実装時の注意点

### 1. エンジンタイミングとの協調
- エンジンは単語個別タイミングを提供するため、フレーズ入場テンプレートでは**意図的にこれを無視**する必要があります
- `startMs`、`endMs`はフレーズ全体のタイミングとして扱います

### 2. パフォーマンス考慮
```typescript
// 不要な再計算を避ける
if (phase !== AnimationPhase.ACTIVE) {
  // 非アクティブ時は最小限の処理のみ
}
```

### 3. パラメーター設計
```typescript
static getParameterDefinitions(): ParameterDefinition[] {
  return [
    // フレーズ単位入場専用のパラメーター
    { name: "phraseEntranceDuration", type: "number", default: 1000 },
    { name: "wordStaggerDelay", type: "number", default: 100 },
    { name: "enableNewLinePerWord", type: "boolean", default: false },
    // ... 標準パラメーターも含める
  ];
}
```

## 参考実装例

### GlitchTextPrimitiveの活用箇所
1. **ファイル**: `/src/renderer/templates/GlitchTextPrimitive.ts`
2. **特に参考になる部分**:
   - `renderPhraseContainer`メソッド：フレーズレベルでのタイミング制御
   - `renderWordContainer`メソッド：全単語の統一制御
   - FlexibleCumulativeLayoutPrimitiveの活用方法

### MultiLineLayoutPrimitiveの活用
複数行レイアウトが必要な場合は、`MultiLineLayoutPrimitive`も参考にしてください：
- **ファイル**: `/src/renderer/primitives/layout/MultiLineLayoutPrimitive.ts`

## 推奨ワークフロー

1. **要件定義**: フレーズ入場の具体的な動作を定義
2. **GlitchTextPrimitiveの研究**: 既存の実装パターンを理解
3. **プロトタイプ作成**: 最小限の機能でテスト実装
4. **パラメーター設計**: カスタムパラメーターの定義と登録
5. **最適化**: パフォーマンスと視覚効果の調整

## まとめ

フレーズ単位入場は`wordDisplayMode`パラメーターでは実現できませんが、テンプレート側でのカスタム実装により柔軟な制御が可能です。GlitchTextPrimitiveを参考に、プロジェクトの要件に合わせた独自のフレーズ入場テンプレートを作成してください。