# 責任分離詳細設計書

**バージョン**: 1.0  
**作成日**: 2025-08-07  
**優先度**: 🔴 最重要（実装ブロッカー）

## 1. 責任分離の基本原則

### 1.1 階層構造と責任

```
┌─────────────────────────────────────┐
│ Phrase Container                    │
│ 責任: 全体制御（配置・フェード）      │
│ 禁止: テキスト描画・文字制御         │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ Word Container                      │
│ 責任: 文字管理（配置・間隔）          │
│ 禁止: テキスト描画・フレーズ制御      │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ Character Container                 │
│ 責任: テキスト描画・個別演出         │
│ 禁止: 単語管理・フレーズ制御         │
└─────────────────────────────────────┘
```

### 1.2 重要な原理

**原理1: 下位レベルは上位レベルを制御できない**
- Character は Word を制御できない
- Word は Phrase を制御できない

**原理2: テキスト描画は Character のみ**
- Phrase/Word は絶対にテキストを作成・描画しない
- すべての視覚的テキストは Character レベルで管理

**原理3: コンテナは削除せず再利用**
- パフォーマンスのためコンテナはプール管理
- 子要素のみクリア、コンテナ自体は保持

## 2. フレーズレベル責任定義

### 2.1 許可される操作

```typescript
// ✅ 正しい実装例
class PhraseOperations {
  // 1. 全体位置制御
  setPosition(container: PIXI.Container, x: number, y: number): void {
    container.position.set(x, y);
    container.pivot.set(container.width / 2, container.height / 2);
  }
  
  // 2. フェードイン・アウト
  setFade(container: PIXI.Container, alpha: number): void {
    container.alpha = alpha; // 全体の透明度制御
  }
  
  // 3. グループ移動
  moveGroup(container: PIXI.Container, deltaX: number, deltaY: number): void {
    container.position.x += deltaX;
    container.position.y += deltaY;
  }
  
  // 4. 回転・スケール（全体）
  setTransform(container: PIXI.Container, rotation: number, scale: number): void {
    container.rotation = rotation;
    container.scale.set(scale);
  }
}
```

### 2.2 禁止される操作

```typescript
// ❌ 間違った実装例（絶対禁止）
class PhraseForbiddenOperations {
  // ❌ テキスト作成禁止
  createText(text: string): void {
    const textObj = new PIXI.Text(text); // ❌ 絶対ダメ
    this.container.addChild(textObj);    // ❌ 絶対ダメ
  }
  
  // ❌ 文字の個別制御禁止
  controlCharacter(charIndex: number): void {
    const char = this.container.children[charIndex]; // ❌ 直接アクセス禁止
    char.alpha = 0.5; // ❌ 個別制御禁止
  }
  
  // ❌ ワードレベルの操作禁止
  adjustWordSpacing(wordIndex: number, spacing: number): void {
    // Phraseレベルでワード間隔を制御してはいけない
  }
}
```

### 2.3 実装時チェックリスト

```typescript
// フレーズレベル実装チェックリスト
const phraseCheckList = {
  // 必須確認項目
  noTextCreation: {
    check: "new PIXI.Text() が含まれていないか",
    result: null // true/false
  },
  noChildTextAccess: {
    check: "container.children へのテキストアクセスがないか",
    result: null
  },
  onlyContainerOperations: {
    check: "コンテナ全体の操作のみか",
    result: null
  },
  noIndividualControl: {
    check: "個別要素の制御をしていないか",
    result: null
  }
};
```

## 3. ワードレベル責任定義

### 3.1 許可される操作

```typescript
// ✅ 正しい実装例
class WordOperations {
  // 1. 文字コンテナ配置
  arrangeCharacters(
    wordContainer: PIXI.Container,
    charContainers: PIXI.Container[]
  ): void {
    let currentX = 0;
    charContainers.forEach(charContainer => {
      charContainer.position.x = currentX;
      currentX += this.characterSpacing;
      // 注意: charContainerの中身（テキスト）には触れない
    });
  }
  
  // 2. 単語間隔調整
  setWordSpacing(words: PIXI.Container[], spacing: number): void {
    let currentX = 0;
    words.forEach(word => {
      word.position.x = currentX;
      currentX += word.width + spacing;
    });
  }
  
  // 3. 文字グループ管理
  groupCharacters(
    wordContainer: PIXI.Container,
    startIndex: number,
    endIndex: number
  ): PIXI.Container {
    const group = new PIXI.Container();
    // コンテナの再配置のみ、テキストには触れない
    for (let i = startIndex; i <= endIndex; i++) {
      group.addChild(wordContainer.children[i]);
    }
    return group;
  }
}
```

### 3.2 禁止される操作

```typescript
// ❌ 間違った実装例（絶対禁止）
class WordForbiddenOperations {
  // ❌ テキスト作成禁止
  createWordText(word: string): void {
    const text = new PIXI.Text(word); // ❌ 絶対ダメ
    this.container.addChild(text);    // ❌ 絶対ダメ
  }
  
  // ❌ テキスト内容の変更禁止
  modifyTextContent(charContainer: PIXI.Container, newChar: string): void {
    const text = charContainer.children[0] as PIXI.Text; // ❌ テキストアクセス禁止
    text.text = newChar; // ❌ テキスト変更禁止
  }
  
  // ❌ フレーズレベル操作禁止
  controlPhrasePosition(phraseContainer: PIXI.Container): void {
    phraseContainer.position.x = 100; // ❌ 上位レベル制御禁止
  }
}
```

### 3.3 実装時チェックリスト

```typescript
// ワードレベル実装チェックリスト
const wordCheckList = {
  noTextCreation: {
    check: "new PIXI.Text() が含まれていないか",
    result: null
  },
  noTextModification: {
    check: "text.text = の記述がないか",
    result: null
  },
  onlyContainerManagement: {
    check: "コンテナ配置のみ行っているか",
    result: null
  },
  noPhraseControl: {
    check: "フレーズレベルの操作をしていないか",
    result: null
  }
};
```

## 4. キャラクターレベル責任定義

### 4.1 許可される操作（唯一テキスト描画可能）

```typescript
// ✅ 正しい実装例
class CharacterOperations {
  // 1. テキスト描画（ここだけ許可）
  renderText(
    container: PIXI.Container,
    character: string,
    style: PIXI.TextStyle
  ): PIXI.Text {
    // キャラクターレベルのみテキスト作成可能
    const text = new PIXI.Text(character, style); // ✅ ここだけOK
    container.addChild(text); // ✅ ここだけOK
    return text;
  }
  
  // 2. 個別アニメーション
  animateCharacter(
    container: PIXI.Container,
    animation: CharacterAnimation
  ): void {
    const text = container.children[0] as PIXI.Text;
    // 個別文字のアニメーション
    text.alpha = animation.alpha;
    text.scale.set(animation.scale);
    text.rotation = animation.rotation;
  }
  
  // 3. エフェクト適用
  applyEffect(container: PIXI.Container, effect: CharacterEffect): void {
    const text = container.children[0] as PIXI.Text;
    // 個別文字エフェクト
    text.tint = effect.color;
    text.filters = [effect.filter];
  }
  
  // 4. スタイル変更
  updateStyle(container: PIXI.Container, style: Partial<PIXI.TextStyle>): void {
    const text = container.children[0] as PIXI.Text;
    Object.assign(text.style, style);
  }
}
```

### 4.2 禁止される操作

```typescript
// ❌ 間違った実装例（絶対禁止）
class CharacterForbiddenOperations {
  // ❌ ワード管理禁止
  manageWordLayout(wordContainer: PIXI.Container): void {
    // キャラクターレベルでワード配置を制御してはいけない
    wordContainer.position.x = 100; // ❌ 上位レベル制御禁止
  }
  
  // ❌ フレーズ制御禁止
  controlPhrase(phraseContainer: PIXI.Container): void {
    phraseContainer.alpha = 0.5; // ❌ 上位レベル制御禁止
  }
  
  // ❌ 他の文字への干渉禁止
  controlOtherCharacter(otherCharContainer: PIXI.Container): void {
    // 他の文字コンテナを制御してはいけない
    otherCharContainer.visible = false; // ❌ 他要素制御禁止
  }
}
```

### 4.3 実装時チェックリスト

```typescript
// キャラクターレベル実装チェックリスト
const characterCheckList = {
  textCreationAllowed: {
    check: "new PIXI.Text() はここだけで許可",
    result: null
  },
  onlyOwnContainer: {
    check: "自身のコンテナのみ操作しているか",
    result: null
  },
  noUpperLevelControl: {
    check: "Word/Phraseレベルを制御していないか",
    result: null
  },
  noSiblingControl: {
    check: "他の文字を制御していないか",
    result: null
  }
};
```

## 5. 実装時の検証コード

### 5.1 責任分離バリデーター

```typescript
// src/renderer/validators/ResponsibilitySeparationValidator.ts
export class ResponsibilitySeparationValidator {
  // コンパイル時チェック（TypeScript型システム活用）
  static validatePhraseOperation<T extends PhraseOperation>(
    operation: T
  ): T {
    // PhraseOperationインターフェースを満たさない場合コンパイルエラー
    return operation;
  }
  
  // 実行時チェック
  static validateAtRuntime(
    level: HierarchyLevel,
    operation: string,
    container: PIXI.Container
  ): ValidationResult {
    switch (level) {
      case 'phrase':
        return this.validatePhraseResponsibility(operation, container);
      case 'word':
        return this.validateWordResponsibility(operation, container);
      case 'character':
        return this.validateCharacterResponsibility(operation, container);
    }
  }
  
  private static validatePhraseResponsibility(
    operation: string,
    container: PIXI.Container
  ): ValidationResult {
    // テキスト作成チェック
    const hasText = container.children.some(child => child instanceof PIXI.Text);
    if (hasText) {
      return {
        valid: false,
        error: 'Phrase level cannot contain PIXI.Text directly'
      };
    }
    
    // 許可操作チェック
    const allowedOps = ['setPosition', 'setFade', 'moveGroup', 'setTransform'];
    if (!allowedOps.includes(operation)) {
      return {
        valid: false,
        error: `Operation '${operation}' not allowed at phrase level`
      };
    }
    
    return { valid: true };
  }
}
```

### 5.2 開発時デバッグヘルパー

```typescript
// src/renderer/debug/ResponsibilityDebugger.ts
export class ResponsibilityDebugger {
  static checkViolations(container: PIXI.Container, level: HierarchyLevel): void {
    if (process.env.NODE_ENV !== 'development') return;
    
    console.group(`[Responsibility Check] ${level}`);
    
    // 階層別チェック
    switch (level) {
      case 'phrase':
        this.checkPhraseViolations(container);
        break;
      case 'word':
        this.checkWordViolations(container);
        break;
      case 'character':
        this.checkCharacterViolations(container);
        break;
    }
    
    console.groupEnd();
  }
  
  private static checkPhraseViolations(container: PIXI.Container): void {
    // テキスト直接保持チェック
    const texts = container.children.filter(c => c instanceof PIXI.Text);
    if (texts.length > 0) {
      console.error('❌ VIOLATION: Phrase contains PIXI.Text directly!');
      console.error('Found texts:', texts);
    } else {
      console.log('✅ No text violation');
    }
    
    // 子要素の個別制御チェック（警告）
    const modifiedChildren = container.children.filter(c => 
      c.alpha !== 1 || c.scale.x !== 1 || c.rotation !== 0
    );
    if (modifiedChildren.length > 0) {
      console.warn('⚠️ WARNING: Individual child control detected');
    }
  }
}
```

## 6. コードレビューチェックリスト

### 6.1 PR提出前チェック

```markdown
## 責任分離チェックリスト

### Phrase Level
- [ ] `new PIXI.Text()` を使用していない
- [ ] テキスト関連の操作をしていない
- [ ] コンテナ全体の操作のみ行っている
- [ ] 個別要素を直接制御していない

### Word Level
- [ ] `new PIXI.Text()` を使用していない
- [ ] テキスト内容を変更していない
- [ ] コンテナ配置のみ行っている
- [ ] フレーズレベルを制御していない

### Character Level
- [ ] テキスト作成は適切に行っている
- [ ] 自身のコンテナのみ操作している
- [ ] 上位レベルを制御していない
- [ ] 他の文字を制御していない

### 全体
- [ ] ResponsibilitySeparationValidator でチェック済み
- [ ] ResponsibilityDebugger で違反がない
- [ ] 単体テストで責任分離を検証済み
```

## 7. よくある間違いと対処法

### 7.1 間違い例1: Phraseでテキスト作成

```typescript
// ❌ 間違い
class WrongPhraseImplementation {
  renderPhrase(text: string): void {
    const textObj = new PIXI.Text(text); // ❌
    this.container.addChild(textObj);
  }
}

// ✅ 正しい実装
class CorrectPhraseImplementation {
  positionPhrase(x: number, y: number): void {
    this.container.position.set(x, y); // ✅ 位置のみ
  }
}
```

### 7.2 間違い例2: Wordでテキスト変更

```typescript
// ❌ 間違い
class WrongWordImplementation {
  updateCharacter(index: number, newChar: string): void {
    const text = this.container.children[index].children[0] as PIXI.Text;
    text.text = newChar; // ❌ テキスト変更禁止
  }
}

// ✅ 正しい実装
class CorrectWordImplementation {
  arrangeCharacters(spacing: number): void {
    let x = 0;
    this.container.children.forEach(child => {
      child.position.x = x; // ✅ 位置のみ
      x += spacing;
    });
  }
}
```

## 8. 移行ガイド

### 8.1 既存コードの修正手順

1. **違反箇所の特定**
   ```bash
   # Phraseレベルでのテキスト作成を検索
   grep -r "new PIXI.Text" src/renderer/templates/ | grep -i phrase
   
   # Wordレベルでのテキスト操作を検索
   grep -r "\.text =" src/renderer/templates/ | grep -i word
   ```

2. **段階的修正**
   - Phase 1: 明らかな違反を修正
   - Phase 2: 境界ケースを精査
   - Phase 3: テスト追加

3. **検証**
   - ResponsibilitySeparationValidator実行
   - 視覚的確認
   - パフォーマンステスト

## 9. まとめ

### 核心原則の再確認

1. **テキスト描画は Character のみ**
2. **上位レベルを下位レベルが制御しない**
3. **コンテナ操作とコンテンツ操作を分離**

この設計により：
- コードの明確性向上
- バグの削減
- 再利用性の向上
- パフォーマンスの最適化

が実現されます。