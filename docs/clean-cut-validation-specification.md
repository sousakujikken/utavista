# クリーンカット移行検証仕様書 v3.0

## 概要

本仕様書は、UTAVISTA v0.5.0 クリーンカット移行における検証システムを定義します。レガシーアダプター排除により複雑な互換性検証を削除し、**新システム単体の品質保証**に特化した簡素化された検証を実現します。

## 検証方針

### 従来型検証の排除

**❌ 削除対象 (複雑すぎるため)**:
- 新旧システム並行実行による整合性検証
- レガシーアダプターの動作検証
- 段階的移行の中間状態検証
- 複雑なフォールバック機能テスト

**✅ 採用方針 (簡素で確実)**:
- 新システム単体の動作検証
- 移行対象3テンプレートの品質保証
- 基本的な回帰テスト
- 型安全性による事前エラー防止

## 検証レベル

### Level 1: TypeScript型制約検証 (コンパイル時)

```typescript
/**
 * 基本的な型制約により間違った実装を防止
 */
abstract class HierarchicalAnimationTemplate implements IAnimationTemplate {
  // プリミティブの型安全な使用を強制
  protected abstract readonly phrasePositioning: PhrasePositionPrimitive;
  protected abstract readonly wordPositioning: WordPositionPrimitive;
  protected abstract readonly characterLayout: CharacterLayoutPrimitive;
  
  // 不正な組み合わせはコンパイルエラー
  final renderPhraseContainer(...): boolean {
    // phrasePositioningのみ使用可能
    const position = this.phrasePositioning.calculate(...);
    return this.customPhraseRendering(...);
  }
  
  final renderWordContainer(...): boolean {
    // wordPositioningのみ使用可能
    const position = this.wordPositioning.calculate(...);
    return this.customWordRendering(...);
  }
}

// 間違った実装はコンパイル時に検出
class InvalidTemplate extends HierarchicalAnimationTemplate {
  protected customPhraseRendering(...): boolean {
    // ❌ コンパイルエラー: フレーズレベルでwordPositioningは使用不可
    // this.wordPositioning.calculate(...);
    
    // ✅ 正しい使用
    return this.phrasePositioning.calculateStatic(...);
  }
}
```

### Level 2: 単体テスト (新システム動作確認)

```typescript
/**
 * 移行対象テンプレートの基本動作確認
 */
describe('Clean Cut Migration Validation', () => {
  const MIGRATED_TEMPLATES = [
    { name: 'WordSlideTextPrimitive', class: WordSlideTextPrimitive },
    { name: 'FadeBlurRandomTextPrimitive', class: FadeBlurRandomTextPrimitive },
    { name: 'GlitchTextPrimitive', class: GlitchTextPrimitive }
  ];
  
  MIGRATED_TEMPLATES.forEach(({ name, class: TemplateClass }) => {
    describe(name, () => {
      let template: HierarchicalAnimationTemplate;
      
      beforeEach(() => {
        template = new TemplateClass();
      });
      
      test('HierarchicalAnimationTemplate継承確認', () => {
        expect(template).toBeInstanceOf(HierarchicalAnimationTemplate);
      });
      
      test('必須プリミティブ初期化確認', () => {
        expect(template.phrasePositioning).toBeInstanceOf(PhrasePositionPrimitive);
        expect(template.wordPositioning).toBeInstanceOf(WordPositionPrimitive);
        expect(template.characterLayout).toBeInstanceOf(CharacterLayoutPrimitive);
      });
      
      test('基本レンダリング動作確認', () => {
        const mockContainer = new MockPIXIContainer();
        const testParams = {
          fontSize: 120,
          charSpacing: 1.0,
          wordIndex: 0
        };
        
        const result = template.renderWordContainer(
          mockContainer, 'テスト', testParams, 500, 0, 1000, 'active'
        );
        
        expect(result).toBe(true);
        expect(mockContainer.children.length).toBeGreaterThan(0);
      });
      
      test('単語位置重複防止確認', () => {
        const positions = [0, 1, 2].map(wordIndex => {
          const mockContainer = new MockPIXIContainer();
          template.renderWordContainer(
            mockContainer, 'テスト', { wordIndex, fontSize: 120 }, 
            500, 0, 1000, 'active'
          );
          return mockContainer.position;
        });
        
        // 全て異なる位置に配置されることを確認
        expect(new Set(positions.map(p => `${p.x},${p.y}`)).size).toBe(3);
      });
    });
  });
});
```

### Level 3: 統合テスト (システム全体動作確認)

```typescript
/**
 * プリミティブ間の協調動作確認
 */
describe('Primitive Integration Tests', () => {
  test('階層別プリミティブの協調動作', async () => {
    const template = new FadeBlurRandomTextPrimitive();
    const mockApp = new MockPIXIApplication();
    
    // フレーズコンテナ作成・配置
    const phraseContainer = new MockPIXIContainer();
    template.renderPhraseContainer(phraseContainer, 'テスト フレーズ', testParams, 500, 0, 2000, 'active');
    
    // 単語コンテナ作成・配置
    const wordContainer = new MockPIXIContainer();
    template.renderWordContainer(wordContainer, 'テスト', testParams, 500, 0, 1000, 'active');
    
    // 文字コンテナ作成・配置
    const charContainer = new MockPIXIContainer();
    template.renderCharContainer(charContainer, 'テ', testParams, 500, 0, 1000, 'active');
    
    // 階層構造の整合性確認
    expect(phraseContainer.children).toContain(wordContainer);
    expect(wordContainer.children).toContain(charContainer);
    
    // 位置計算の正当性確認
    expect(phraseContainer.position).toBeValidPosition();
    expect(wordContainer.position).toBeValidPosition();
    expect(charContainer.position).toBeValidPosition();
  });
  
  test('エフェクト適用の正当性', () => {
    const template = new FadeBlurRandomTextPrimitive();
    const textObj = new MockPIXIText('テスト');
    
    // ブラーエフェクト適用
    template.customCharRendering(mockContainer, 'テ', {
      enableBlur: true,
      blurStrength: 10.0
    }, 500, 0, 1000, 'active');
    
    // フィルター適用確認
    expect(textObj.filters).toBeTruthy();
    expect(textObj.filters[0]).toBeInstanceOf(PIXI.BlurFilter);
    expect(textObj.filterArea).toBeTruthy();
  });
});
```

### Level 4: 回帰テスト (視覚的品質確認)

```typescript
/**
 * 移行前後の視覚的整合性確認 (必要最小限)
 */
describe('Visual Regression Tests', () => {
  test('基本的な視覚的出力確認', async () => {
    const templates = [
      new WordSlideTextPrimitive(),
      new FadeBlurRandomTextPrimitive(),
      new GlitchTextPrimitive()
    ];
    
    for (const template of templates) {
      const visualOutput = await renderTemplateToImage(template, {
        text: 'テスト サンプル テキスト',
        fontSize: 120,
        duration: 3000
      });
      
      // 基本的な品質チェック
      expect(visualOutput.width).toBeGreaterThan(0);
      expect(visualOutput.height).toBeGreaterThan(0);
      expect(visualOutput.hasVisibleContent).toBe(true);
      
      // 単語が重複していないことを確認
      const wordPositions = extractWordPositions(visualOutput);
      expect(wordPositions).toHaveUniquePositions();
    }
  });
});
```

## 簡素化されたデバッグ支援

### 基本デバッガ

```typescript
/**
 * 必要最小限のデバッグ機能
 */
class SimplePrimitiveDebugger {
  /**
   * テンプレートの基本情報を出力
   */
  inspectTemplate(template: HierarchicalAnimationTemplate): TemplateInfo {
    return {
      name: template.constructor.name,
      primitives: {
        phrase: template.phrasePositioning?.constructor.name,
        word: template.wordPositioning?.constructor.name,
        character: template.characterLayout?.constructor.name
      },
      isValid: this.validateBasicStructure(template)
    };
  }
  
  /**
   * プリミティブ使用の妥当性チェック
   */
  validateBasicStructure(template: HierarchicalAnimationTemplate): boolean {
    return !!(
      template.phrasePositioning instanceof PhrasePositionPrimitive &&
      template.wordPositioning instanceof WordPositionPrimitive &&
      template.characterLayout instanceof CharacterLayoutPrimitive
    );
  }
  
  /**
   * 位置計算結果の基本チェック
   */
  validatePositionCalculation(position: Position): ValidationResult {
    return {
      valid: Number.isFinite(position.x) && Number.isFinite(position.y),
      issues: [
        ...(Number.isFinite(position.x) ? [] : ['x座標が無効']),
        ...(Number.isFinite(position.y) ? [] : ['y座標が無効']),
        ...(position.x < -10000 || position.x > 10000 ? ['x座標が範囲外'] : []),
        ...(position.y < -10000 || position.y > 10000 ? ['y座標が範囲外'] : [])
      ]
    };
  }
}
```

## ESLintルール (簡素版)

```typescript
/**
 * 基本的なプリミティブ使用ルール
 */
const primitiveUsageRule: ESLint.Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '階層分離されたプリミティブの適切な使用を強制',
      category: 'Possible Errors'
    }
  },
  
  create(context) {
    return {
      // HierarchicalAnimationTemplate継承チェック
      ClassDeclaration(node) {
        if (this.isTemplateClass(node) && !this.extendsHierarchicalTemplate(node)) {
          context.report({
            node,
            message: 'テンプレートはHierarchicalAnimationTemplateを継承してください'
          });
        }
      },
      
      // 必須プリミティブ初期化チェック
      PropertyDefinition(node) {
        if (this.isRequiredPrimitive(node) && !this.hasProperInitialization(node)) {
          context.report({
            node,
            message: `${node.key.name}は適切なプリミティブで初期化してください`
          });
        }
      }
    };
  }
};
```

## 品質ゲート

### 移行完了判定基準

**必須要件**:
1. ✅ 全移行対象テンプレートがHierarchicalAnimationTemplate継承
2. ✅ TypeScriptコンパイルエラーゼロ
3. ✅ 全単体テストパス (90%以上のカバレッジ)
4. ✅ 基本的な統合テストパス
5. ✅ レガシーファイル完全削除

**品質要件**:
1. ✅ 単語位置重複ゼロ
2. ✅ エフェクト正常適用
3. ✅ パフォーマンス劣化なし (±10%以内)
4. ✅ メモリリークなし

この簡素化された検証により、複雑な互換性テストを排除しつつ、確実な移行品質を保証します。