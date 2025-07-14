# 階層的アニメーションモデル

## 概要

UTAVISTAの3階層アニメーションモデルは、歌詞アニメーションの複雑な要求に対応するため設計された独特なシステムです。一般的なアニメーションライブラリの平面的なアプローチとは異なり、フレーズ→単語→文字の階層構造で責任を分離し、各レベルで異なる種類のアニメーション処理を実行します。

## なぜ3階層なのか

### 歌詞アニメーションの要求分析

**フレーズレベルの要求**:
- 全体的な入場・退場アニメーション
- 段落配置とレイアウト管理
- フレーズ全体に対するフィルター効果

**単語レベルの要求**:
- 単語間の連続性とタイミング調整
- 文字配置の精密な制御
- 単語境界での特殊効果

**文字レベルの要求**:
- 個別文字のアニメーション（点滅・色変化）
- テキストの実際の描画処理
- 文字固有のタイミング制御

### 設計判断の理由

**1. 責任の分離**
各階層が独立した責任を持つことで、アニメーション効果の組み合わせが可能になります。

**2. パフォーマンスの最適化**  
階層別の更新制御により、不要な再計算を避けることができます。

**3. 拡張性の確保**
新しいアニメーション効果を特定の階層のみに追加できます。

## InstanceManager による階層管理

### 階層インスタンスの構造

```typescript
interface HierarchyMap {
  [phraseId: string]: {
    [wordId: string]: string[];  // character IDs
  };
}

// 実際の構造例
{
  "phrase_0": {
    "phrase_0_word_0": ["phrase_0_word_0_char_0", "phrase_0_word_0_char_1"],
    "phrase_0_word_1": ["phrase_0_word_1_char_0", "phrase_0_word_1_char_1"]
  }
}
```

**独特な管理方式**:
- 階層関係を明示的にマップで管理
- ID命名規則による親子関係の表現
- 階層横断でのインスタンス検索が高速

### インスタンス作成の階層制御

```typescript
// フレーズインスタンス作成
createPhraseInstance(phrase: PhraseUnit, template: IAnimationTemplate): void {
  const phraseContainer = new PIXI.Container();
  phraseContainer.name = `phrase_container_${phrase.id}`;
  
  // 単語インスタンスを子として作成
  phrase.words.forEach(word => {
    this.createWordInstance(word, phraseContainer, template, params);
  });
}

// 単語インスタンス作成  
createWordInstance(word: WordUnit, parentContainer: PIXI.Container, ...): void {
  const wordContainer = new PIXI.Container();
  wordContainer.name = `word_container_${word.id}`;
  parentContainer.addChild(wordContainer);
  
  // 文字インスタンスを子として作成
  word.chars.forEach(char => {
    this.createCharInstance(char, wordContainer, template, params);
  });
}
```

**階層制御の特徴**:
1. **トップダウン作成**: フレーズ→単語→文字の順序で作成
2. **親子関係の自動設定**: PIXI.Containerの親子関係で階層を表現
3. **命名規則の統一**: `{type}_container_{id}` の形式

## charIndex による文字配置計算

### charIndex の設計思想

**なぜ charIndex が必要なのか**:
- 単語境界を跨いだ連続的な文字配置
- 文字間隔の統一的な計算
- アニメーション効果での文字順序制御

### 計算アルゴリズム

```typescript
function calculateCharIndex(phrases: PhraseUnit[]): void {
  let globalCharIndex = 0;
  
  phrases.forEach(phrase => {
    phrase.words.forEach(word => {
      word.chars.forEach(char => {
        char.charIndex = globalCharIndex++;
      });
    });
  });
}
```

**独特な点**:
1. **グローバル連番**: フレーズ・単語境界を無視した連続番号
2. **配置基準**: 単語内の相対位置ではなく、全体での絶対位置
3. **アニメーション制御**: charIndex を基準としたタイミング計算

### 文字配置での活用例

```typescript
// WordSlideTemplate での charIndex 使用例
const baseX = char.charIndex * (fontSize * charSpacing);
const offsetX = this.calculateRandomOffset(char.charIndex);
charContainer.position.set(baseX + offsetX, baseY);
```

## 階層間のパラメータ継承

### 継承ルールの設計

```typescript
// 階層別パラメータ取得
const phraseParams = this.parameterManager.getParameters(phrase.id);
const wordParams = { ...phraseParams, ...(word.params || {}) };
const charParams = { ...wordParams, ...(char.params || {}) };
```

**継承の原則**:
1. **下位優先**: 子階層のパラメータが親を上書き
2. **完全継承**: すべてのパラメータが下位に伝播
3. **選択的上書き**: 必要な部分のみを子階層で変更

### パラメータの階層別活用

**フレーズレベル**: グローバル設定、フィルター設定
**単語レベル**: 配置設定、間隔設定  
**文字レベル**: 色設定、サイズ設定、個別アニメーション設定

## 時間同期における階層別処理

### 統一時間基準

**基準時刻**: 音声再生時刻（`nowMs`）
- すべての階層が同じ時間基準で動作
- 階層間での時間のズレを防止

### 階層別の時間処理

```typescript
// 各階層で同じ時間パラメータを受け取る
animateContainer(
  container: PIXI.Container,
  hierarchyType: HierarchyType,
  nowMs: number,        // 現在時刻（音声基準）
  startMs: number,      // 開始時刻
  endMs: number,        // 終了時刻
  // ...
): void
```

**時間連動の特徴**:
1. **同期実行**: 3階層が同じフレームで更新
2. **独立計算**: 各階層が独自の時間進行度を計算
3. **フェーズ共有**: AnimationPhase（in/active/out）は全階層で共通

### 階層別のタイミング制御例

```typescript
// FlickerFadeTemplate の時間処理
renderPhraseContainer(container, nowMs, startMs, endMs, ...): void {
  const phraseProgress = (nowMs - startMs) / (endMs - startMs);
  // フレーズ全体のフェード制御
}

renderWordContainer(container, nowMs, startMs, endMs, ...): void {
  const wordProgress = (nowMs - startMs) / (endMs - startMs);
  // 単語レベルの配置制御
}

renderCharContainer(container, nowMs, startMs, endMs, ...): void {
  const charProgress = (nowMs - startMs) / (endMs - startMs);
  // 文字個別の点滅制御
}
```

## パフォーマンス最適化

### 時間範囲による表示制御

```typescript
function isInstanceInTimeRange(nowMs: number, startMs: number, endMs: number): boolean {
  const buffer = 1000; // 1秒のバッファ
  return nowMs >= (startMs - buffer) && nowMs <= (endMs + buffer);
}
```

**最適化の効果**:
- 表示範囲外のインスタンスは処理をスキップ
- メモリ使用量の削減
- CPU負荷の軽減

### 階層別更新の最適化

```typescript
updateExistingInstances(): void {
  // フレーズ → 単語 → 文字の順序で更新
  this.phraseInstances.forEach(phraseInstance => {
    this.updatePhraseInstance(phraseInstance);
    
    phraseInstance.words.forEach(wordInstance => {
      this.updateWordInstance(wordInstance);
      
      wordInstance.chars.forEach(charInstance => {
        this.updateCharInstance(charInstance);
      });
    });
  });
}
```

**更新順序の重要性**:
1. **依存関係**: 子は親の状態に依存
2. **位置計算**: 親の位置変更が子に影響
3. **フィルター適用**: 親のフィルターが子にも適用

## エラーハンドリングと耐性

### 階層構造の保護

```typescript
removeVisualElements(container: PIXI.Container): void {
  // 視覚要素のみ削除、コンテナ構造は保持
  container.children.forEach(child => {
    if (child instanceof PIXI.Text) {
      container.removeChild(child);
    }
    // PIXI.Container（階層構造）は保持
  });
}
```

**保護の目的**:
- 階層関係の破綻を防止
- テンプレート変更時の安全性確保
- デバッグ時の状態保持

### フォールバック機能

```typescript
// AnimationInstance でのエラーハンドリング
animate(nowMs: number): void {
  try {
    this.template.animateContainer(this.container, this.hierarchyType, nowMs, ...);
  } catch (error) {
    console.error(`Animation error in ${this.hierarchyType}:`, error);
    // フォールバック: 基本的な表示のみ継続
    this.container.visible = true;
    this.container.alpha = 1.0;
  }
}
```

## まとめ

UTAVISTAの階層的アニメーションモデルは、歌詞アニメーションの複雑な要求に対応するため、以下の独特な設計を採用しています：

1. **3階層責任分離**: フレーズ・単語・文字の明確な役割分担
2. **charIndex配置システム**: 階層横断の連続的文字配置  
3. **統一時間基準**: 音声時刻を基準とした階層同期
4. **階層マップ管理**: 明示的な親子関係管理
5. **パフォーマンス最適化**: 時間範囲制御と階層別更新
6. **エラー耐性**: 階層構造の保護とフォールバック

この設計により、複雑な歌詞アニメーション処理を効率的かつ安全に実行し、様々なアニメーション効果の組み合わせを可能にしています。