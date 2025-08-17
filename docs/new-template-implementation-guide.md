# クリーンカット移行実装ガイド v3.0

## 概要

本ガイドは、UTAVISTA v0.5.0 クリーンカット移行における**直接移行方式**でのテンプレート実装方法を説明します。レガシーアダプターを排除し、HierarchicalAnimationTemplate基底クラスへの完全移行により、確実で保守性の高い実装を実現します。

## 移行方針

### クリーンカット移行の利点
- ✅ **複雑性排除**: レガシーアダプター不要
- ✅ **メンテナンス簡素化**: 新旧並行状態を回避  
- ✅ **確実性向上**: 中途半端な移行状態なし
- ✅ **コスト削減**: 互換性維持オーバーヘッド削除

## 基本実装パターン

### 1. HierarchicalAnimationTemplate基底クラスの継承

**新しいテンプレートは必ず`HierarchicalAnimationTemplate`を継承してください**

```typescript
import { HierarchicalAnimationTemplate } from '../base/HierarchicalAnimationTemplate';
import { 
  PhrasePositionPrimitive,
  WordPositionPrimitive, 
  CharacterLayoutPrimitive
} from '../primitives/v2';

class MyNewTemplate extends HierarchicalAnimationTemplate {
  // シングルトンプリミティブの使用 (メモリ効率化)
  protected readonly phrasePositioning = PrimitiveFactory.getPhrasePositionPrimitive();
  protected readonly wordPositioning = PrimitiveFactory.getWordPositionPrimitive();
  protected readonly characterLayout = PrimitiveFactory.getCharacterLayoutPrimitive();
  
  // テンプレート固有の実装のみを記述
  protected customPhraseRendering(...): boolean {
    // フレーズレベルの独自処理
  }
  
  protected customWordRendering(...): boolean {
    // 単語レベルの独自処理
  }
  
  protected customCharRendering(...): boolean {
    // 文字レベルの独自処理
  }
}
```

### 2. 階層別プリミティブ選択

各階層で適切なプリミティブメソッドを選択してください：

```typescript
/**
 * フレーズレベル: 配置戦略の選択
 */
protected calculatePhrasePosition(params, nowMs, startMs, endMs, phase): Position {
  // 静的配置 (フェード・ブラー系)
  return this.phrasePositioning.calculateStatic(params);
  
  // スライド配置 (スライドアニメーション系)  
  // return this.phrasePositioning.calculateSlide(params);
  
  // ランダム配置 (ランダム配置系)
  // return this.phrasePositioning.calculateRandom(params);
}

/**
 * 単語レベル: アニメーション戦略の選択
 */
protected calculateWordPosition(params, nowMs, startMs, endMs, phase): Position {
  // 静的配置 (フェード・ブラー系、フレーズ同期系)
  return this.wordPositioning.calculateStatic(params);
  
  // スライド配置 (単語スライド系)
  // return this.wordPositioning.calculateSlide(params);
  
  // 累積配置 (特殊な累積レイアウト)
  // return this.wordPositioning.calculateCumulative(params);
}
```

## 移行対象テンプレート実装パターン

### パターン1: FadeBlurRandomTextPrimitive (完全移行)

```typescript
/**
 * 静的配置 + フェード・ブラー効果
 * 移行前: 複数プリミティブの混在使用
 * 移行後: 階層分離された新プリミティブ使用
 */
class FadeBlurRandomTextPrimitive extends HierarchicalAnimationTemplate {
  protected readonly phrasePositioning = new PhrasePositionPrimitive();
  protected readonly wordPositioning = new WordPositionPrimitive();
  protected readonly characterLayout = new CharacterLayoutPrimitive();
  
  // フレーズ: ランダム配置
  protected calculatePhrasePosition(params, nowMs, startMs, endMs, phase): Position {
    return this.phrasePositioning.calculateRandom({
      ...params,
      nowMs, startMs, endMs, phase,
      randomPlacement: params.enableRandomPlacement,
      randomSeed: params.randomSeed,
      randomRangeX: params.randomRangeX,
      randomRangeY: params.randomRangeY
    });
  }
  
  // 単語: 静的配置 (改行配置)
  protected calculateWordPosition(params, nowMs, startMs, endMs, phase): Position {
    return this.wordPositioning.calculateStatic({
      ...params,
      wordIndex: params.wordIndex,
      nowMs, startMs, endMs, phase
    });
  }
  
  // 文字レベルの独自処理
  protected customCharRendering(container, text, params, nowMs, startMs, endMs, phase): boolean {
    // フェード効果
    const alpha = this.calculateFadeAlpha(params, nowMs, startMs, endMs);
    
    // ブラー効果
    const blurEffect = new BlurEffectPrimitive();
    blurEffect.apply(textObj, {
      enableBlur: params.enableBlur,
      blurStrength: params.maxBlurStrength * (1 - alpha),
      // ...other blur params
    });
    
    return true;
  }
  
  // 文字レイアウト: 改行モード
  protected performCharacterLayout(container, params): void {
    const charsData = params.chars as FlexibleCharacterData[];
    
    this.characterLayout.layoutNewLine(container, {
      chars: charsData,
      charSpacing: params.charSpacing,
      fontSize: params.fontSize,
      lineHeight: params.lineHeight,
      // ...
    }, (charContainer, charData) => {
      // 文字ごとのアニメーション処理
      this.animateContainer(charContainer, charData.char, params, ...);
    });
  }
}
```

### パターン2: WordSlideTextPrimitive (直接移行)

```typescript
/**
 * スライド配置 + 動的アニメーション
 * 移行前: SlideAnimationPrimitive (複数階層担当)
 * 移行後: 階層別プリミティブに分離
 */
class WordSlideTextPrimitive extends HierarchicalAnimationTemplate {
  protected readonly phrasePositioning = new PhrasePositionPrimitive();
  protected readonly wordPositioning = new WordPositionPrimitive();
  protected readonly characterLayout = new CharacterLayoutPrimitive();
  
  // フレーズ: スライド配置
  protected calculatePhrasePosition(params, nowMs, startMs, endMs, phase): Position {
    return this.phrasePositioning.calculateSlide({
      ...params,
      slideDirection: params.slideDirection,
      slideDistance: params.slideDistance,
      nowMs, startMs, endMs, phase
    });
  }
  
  // 単語: スライドアニメーション
  protected calculateWordPosition(params, nowMs, startMs, endMs, phase): Position {
    return this.wordPositioning.calculateSlide({
      ...params,
      entranceInitialSpeed: params.entranceInitialSpeed,
      activeSpeed: params.activeSpeed,
      rightOffset: params.rightOffset,
      wordIndex: params.wordIndex,
      nowMs, startMs, endMs, phase
    });
  }
  
  // 文字レイアウト: 個別単語モード
  protected performCharacterLayout(container, params): void {
    this.characterLayout.layoutIndividual(container, {
      chars: params.chars,
      charSpacing: params.charSpacing,
      fontSize: params.fontSize,
      // ...
    }, (charContainer, charData) => {
      this.animateContainer(charContainer, charData.char, params, ...);
    });
  }
}
```

### パターン3: GlitchTextPrimitive (エフェクト分離移行)

```typescript
/**
 * 静的配置 + グリッチエフェクト + 累積レイアウト
 * 移行前: FlexibleCumulativeLayoutPrimitive + 内部エフェクト
 * 移行後: レイアウトとエフェクトの完全分離
 */
class GlitchTextPrimitive extends HierarchicalAnimationTemplate {
  protected readonly phrasePositioning = new PhrasePositionPrimitive();
  protected readonly wordPositioning = new WordPositionPrimitive();
  protected readonly characterLayout = new CharacterLayoutPrimitive();
  
  // フレーズ: 静的配置
  protected calculatePhrasePosition(params, nowMs, startMs, endMs, phase): Position {
    return this.phrasePositioning.calculateStatic(params);
  }
  
  // 単語: 静的配置
  protected calculateWordPosition(params, nowMs, startMs, endMs, phase): Position {
    return this.wordPositioning.calculateStatic({
      ...params,
      wordIndex: params.wordIndex,
      nowMs, startMs, endMs, phase
    });
  }
  
  // 文字レイアウト: 累積モード
  protected performCharacterLayout(container, params): void {
    this.characterLayout.layoutCumulative(container, {
      chars: params.chars,
      charSpacing: params.charSpacing,
      fontSize: params.fontSize,
      // ...
    }, (charContainer, charData) => {
      // フレーズ同期の文字アニメーション
      this.animateContainer(charContainer, charData.char, params, ...);
    });
  }
}
```

## パラメータ管理

### 標準パラメータの使用

```typescript
/**
 * v2.0で標準化されたパラメータを使用
 */
getParameterConfig(): ParameterConfig[] {
  return [
    // 基本パラメータ (必須)
    { name: "fontSize", type: "number", default: 120, min: 12, max: 256 },
    { name: "fontFamily", type: "string", default: "Arial" },
    { name: "textColor", type: "color", default: "#FFFFFF" },
    { name: "activeColor", type: "color", default: "#FFD700" },
    
    // 画面中心からのオフセット (v0.4.3標準)
    { name: "phraseOffsetX", type: "number", default: 0, min: -500, max: 500 },
    { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500 },
    
    // 文字間隔 (v0.4.3: deviceScale削除により1.0が標準)
    { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0 },
    { name: "lineHeight", type: "number", default: 1.2, min: 0.5, max: 3.0 },
    
    // アニメーションタイミング
    { name: "headTime", type: "number", default: 800, min: 200, max: 2000 },
    { name: "tailTime", type: "number", default: 800, min: 200, max: 2000 },
    
    // テンプレート固有パラメータをここに追加
    ...this.getCustomParameters()
  ];
}

/**
 * テンプレート固有パラメータの定義
 */
protected abstract getCustomParameters(): ParameterConfig[];
```

### パラメータ検証

```typescript
/**
 * パラメータの整合性を検証
 */
protected validateParameters(params: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  
  // 必須パラメータの検証
  if (!params.fontSize || params.fontSize <= 0) {
    errors.push('fontSizeは正の数値である必要があります');
  }
  
  // 文字間隔の検証 (v0.4.3基準)
  if (params.charSpacing && params.charSpacing < 0.1) {
    errors.push('charSpacingは0.1以上である必要があります');
  }
  
  // カスタム検証
  errors.push(...this.validateCustomParameters(params));
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## エフェクト適用

### 標準エフェクトプリミティブの使用

```typescript
/**
 * エフェクトプリミティブを組み合わせて効果を実装
 */
protected applyEffects(target: PIXI.DisplayObject, params: Record<string, unknown>): void {
  // ブラー効果
  if (params.enableBlur) {
    const blurEffect = new BlurEffectPrimitive();
    blurEffect.apply(target, {
      enableBlur: true,
      blurStrength: this.calculateBlurStrength(params),
      // ...
    });
  }
  
  // グロー効果
  if (params.enableGlow) {
    const glowEffect = new GlowEffectPrimitive();
    glowEffect.apply(target, {
      enableGlow: true,
      glowColor: params.glowColor,
      glowStrength: params.glowStrength,
      // ...
    });
  }
  
  // シャドウ効果
  if (params.enableShadow) {
    const shadowEffect = new ShadowEffectPrimitive();
    shadowEffect.apply(target, {
      enableShadow: true,
      shadowColor: params.shadowColor,
      shadowOffsetX: params.shadowOffsetX,
      shadowOffsetY: params.shadowOffsetY,
      // ...
    });
  }
}
```

## 移行時のトラブルシューティング

### 移行前後の動作比較

```typescript
/**
 * 移行時の品質保証
 */
class MigrationQualityAssurance {
  /**
   * 移行前後の視覚的出力比較
   */
  compareVisualOutput(
    legacyTemplate: IAnimationTemplate,
    newTemplate: HierarchicalAnimationTemplate,
    testParams: Record<string, unknown>
  ): ComparisonResult {
    const legacyResult = this.renderTemplate(legacyTemplate, testParams);
    const newResult = this.renderTemplate(newTemplate, testParams);
    
    return {
      positionConsistency: this.comparePositions(legacyResult, newResult),
      effectConsistency: this.compareEffects(legacyResult, newResult),
      overallSimilarity: this.calculateSimilarity(legacyResult, newResult)
    };
  }
}
```

### よくある問題と解決方法

**問題1: 全単語が同じ位置に重なる**
```typescript
// ❌ 問題のあるパターン
protected calculateWordPosition(): Position {
  return { x: 0, y: 0, alpha: 1 }; // 全単語が同じ位置
}

// ✅ 正しいパターン  
protected calculateWordPosition(params, nowMs, startMs, endMs, phase): Position {
  return this.wordPositioning.calculateStatic({
    wordIndex: params.wordIndex, // 単語インデックスを必ず使用
    fontSize: params.fontSize,
    lineHeight: params.lineHeight,
    nowMs, startMs, endMs, phase
  });
}
```

**問題2: 文字間隔が不自然**
```typescript
// ❌ 問題のあるパターン (v0.4.2以前)
{ name: "charSpacing", default: 0.5 } // deviceScaleで2倍されるため

// ✅ 正しいパターン (v0.4.3以降)
{ name: "charSpacing", default: 1.0 } // deviceScale削除により1.0が標準
```

**問題3: エフェクトが表示されない**
```typescript
// ❌ 問題のあるパターン
container.filters = [blurFilter]; // コンテナが空でエフェクトが見えない

// ✅ 正しいパターン
textObj.filters = [blurFilter]; // テキストオブジェクトに直接適用
textObj.filterArea = this.calculateFilterArea(textObj, blurStrength);
```

## テスト実装

### 単体テスト

```typescript
describe('MyNewTemplate', () => {
  let template: MyNewTemplate;
  
  beforeEach(() => {
    template = new MyNewTemplate();
  });
  
  test('階層別プリミティブが正しく設定されている', () => {
    expect(template.phrasePositioning).toBeInstanceOf(PhrasePositionPrimitive);
    expect(template.wordPositioning).toBeInstanceOf(WordPositionPrimitive);
    expect(template.characterLayout).toBeInstanceOf(CharacterLayoutPrimitive);
  });
  
  test('単語位置が重複しない', () => {
    const testParams = {
      wordIndex: [0, 1, 2],
      fontSize: 120,
      lineHeight: 1.2
    };
    
    const positions = testParams.wordIndex.map(index => 
      template.calculateWordPosition({ ...testParams, wordIndex: index }, 0, 0, 1000, 'active')
    );
    
    // Y座標が異なることを検証 (改行配置の場合)
    expect(positions[0].y).not.toBe(positions[1].y);
    expect(positions[1].y).not.toBe(positions[2].y);
  });
});
```

### 統合テスト

```typescript
describe('Template Integration', () => {
  test('テンプレートが期待される視覚的出力を生成', async () => {
    const template = new MyNewTemplate();
    const mockContainer = new MockPIXIContainer();
    
    const result = template.renderWordContainer(
      mockContainer,
      'テスト テキスト',
      { fontSize: 120, charSpacing: 1.0 },
      500, 0, 1000, 'active'
    );
    
    expect(result).toBe(true);
    expect(mockContainer.children.length).toBeGreaterThan(0);
    
    // 文字コンテナが適切に配置されていることを検証
    const charContainers = mockContainer.children.filter(child => 
      child.name.includes('char_container_')
    );
    expect(charContainers).toHaveUniquePositions();
  });
});
```

## ベストプラクティス

### 1. プリミティブの適切な選択

```typescript
/**
 * テンプレートの特性に応じたプリミティブ選択
 */

// 静的表示系 (フェード、ブラー等)
// → 全階層で Static 系メソッドを使用

// 動的アニメーション系 (スライド等)  
// → Slide 系メソッドを使用

// 特殊レイアウト系 (グリッチ等)
// → Cumulative 系メソッドを使用
```

### 2. パフォーマンス考慮

```typescript
/**
 * プリミティブインスタンスの効率的な管理
 */
class OptimizedTemplate extends HierarchicalAnimationTemplate {
  // インスタンスをstaticで共有してメモリ効率化
  protected static readonly sharedPhrasePositioning = new PhrasePositionPrimitive();
  protected static readonly sharedWordPositioning = new WordPositionPrimitive();
  protected static readonly sharedCharacterLayout = new CharacterLayoutPrimitive();
  
  protected get phrasePositioning() { return OptimizedTemplate.sharedPhrasePositioning; }
  protected get wordPositioning() { return OptimizedTemplate.sharedWordPositioning; }
  protected get characterLayout() { return OptimizedTemplate.sharedCharacterLayout; }
}
```

### 3. エラーハンドリング

```typescript
/**
 * 堅牢なエラーハンドリング
 */
protected customCharRendering(...): boolean {
  try {
    // メイン処理
    this.applyEffects(textObj, params);
    return true;
  } catch (error) {
    console.error(`文字レンダリングエラー (${this.constructor.name}):`, error);
    
    // フォールバック処理
    return this.renderFallbackChar(container, text, params);
  }
}
```

この実装ガイドに従うことで、階層分離原則に基づいた高品質なテンプレートを効率的に開発できます。