# 協調的プリミティブ実装ガイド v2.0

## 概要

LLM自然言語テンプレート生成システム v2.0の核となる協調的プリミティブライブラリの詳細実装ガイド。オリジナルWordSlideTextの成功パターンを継承し、階層間協調を重視した設計による高品質なテンプレート生成を実現する。

## 設計原則

### 1. 協調的階層制御（Cooperative Hierarchical Control）

```typescript
// ❌ v1.0の失敗パターン: 分離・独立型
interface IndependentPrimitive {
  calculatePosition(params: any): Position;
  execute(params: any): Result;
}

// ✅ v2.0の成功パターン: 協調・連携型
interface CooperativePrimitive {
  // 上位層からの制御を受け入れ
  receiveParentContext(parentState: LayerState): void;
  
  // 自分の責任範囲の処理
  executeWithinHierarchy(params: LayerParams): Result;
  
  // 下位層への指示を出力
  generateChildInstructions(): ChildInstruction[];
}
```

### 2. オリジナルロジック継承（Original Logic Inheritance）

```typescript
// オリジナルWordSlideTextから成功パターンを継承
class CumulativeLayoutPrimitive extends OriginalPatternBase {
  protected inheritOriginalCumulativeLogic(): CumulativeCalculator {
    // オリジナルのmanageCharacterContainersロジックを抽出・ラップ
    return this.extractOriginalPattern('manageCharacterContainers');
  }
  
  arrangeCumulative(chars: Character[], params: LayoutParams): Layout {
    // オリジナルの累積オフセット計算を活用
    let cumulativeXOffset = 0;
    return chars.map(char => {
      const layout = this.calculateCharacterLayout(char, cumulativeXOffset, params);
      cumulativeXOffset += layout.advanceWidth;
      return layout;
    });
  }
}
```

### 3. 意図ベース抽象化（Intent-Based Abstraction）

```typescript
// LLMが理解しやすい意図ベースのAPI
interface IntentBasedAPI {
  // 自然言語に近い命名
  slideTextFromLeft(duration: number, physics: PhysicsParams): Animation;
  revealCharactersOneByOne(interval: number): Animation;
  addGlowEffect(intensity: "subtle" | "normal" | "dramatic"): Effect;
  
  // 物理的直感に基づく
  bounceIntoPlace(elasticity: number): Animation;
  fadeGently(duration: number): Animation;
}
```

## プリミティブライブラリ実装

### 1. CumulativeLayoutPrimitive

#### 責任範囲
- 文字を単語内で累積的に配置
- オリジナルの成功パターンを継承
- 半角・全角文字の適切な間隔計算

#### 実装例

```typescript
export class CumulativeLayoutPrimitive implements CooperativePrimitive {
  private originalLogic: OriginalCumulativeLogic;
  
  constructor() {
    // オリジナルのWordSlideTextから累積ロジックを継承
    this.originalLogic = this.extractOriginalPattern();
  }
  
  /**
   * 文字を累積的に配置（オリジナルパターン準拠）
   */
  arrangeCumulative(
    characters: Character[],
    basePosition: Position,
    spacing: SpacingParams
  ): CharacterLayout[] {
    let cumulativeXOffset = 0;
    const layouts: CharacterLayout[] = [];
    
    characters.forEach((char, index) => {
      // オリジナルの半角・全角判定ロジックを使用
      const effectiveSpacing = this.originalLogic.calculateEffectiveSpacing(
        char.content, 
        spacing.charSpacing
      );
      
      const layout: CharacterLayout = {
        character: char,
        position: {
          x: basePosition.x + cumulativeXOffset,
          y: basePosition.y
        },
        metrics: {
          advanceWidth: spacing.fontSize * effectiveSpacing,
          isHalfWidth: this.originalLogic.isHalfWidthChar(char.content)
        }
      };
      
      layouts.push(layout);
      cumulativeXOffset += layout.metrics.advanceWidth;
    });
    
    return layouts;
  }
  
  /**
   * 階層協調: 上位層からのコンテキスト受信
   */
  receiveParentContext(parentState: LayerState): void {
    this.parentWordPosition = parentState.position;
    this.parentSpacing = parentState.spacing;
  }
  
  /**
   * 階層協調: 下位層への指示生成
   */
  generateChildInstructions(): CharacterInstruction[] {
    return this.layouts.map(layout => ({
      characterId: layout.character.id,
      position: layout.position,
      renderingParams: this.generateRenderingParams(layout)
    }));
  }
}
```

### 2. PhysicsBasedAnimationPrimitive

#### 責任範囲
- オリジナルの物理ベース計算を継承
- 滑らかなスライドアニメーション
- 速度とイージングの精密制御

#### 実装例

```typescript
export class PhysicsBasedAnimationPrimitive implements CooperativePrimitive {
  private originalPhysics: OriginalPhysicsCalculator;
  
  constructor() {
    // オリジナルのcalculateDistanceFromSpeedロジックを継承
    this.originalPhysics = this.extractOriginalPhysicsLogic();
  }
  
  /**
   * 左からのスライドアニメーション（オリジナル準拠）
   */
  createSlideFromLeft(
    duration: number,
    physics: PhysicsParams
  ): AnimationSequence {
    const frames: AnimationFrame[] = [];
    const steps = Math.min(60, Math.ceil(duration / 16)); // 60fps上限
    
    for (let i = 0; i <= steps; i++) {
      const elapsedTime = (i / steps) * duration;
      
      // オリジナルの精密な物理計算を使用
      const distance = this.originalPhysics.calculateDistanceFromSpeed(
        elapsedTime,
        duration,
        physics.initialSpeed,
        physics.finalSpeed,
        physics.easingFunction
      );
      
      frames.push({
        time: elapsedTime,
        position: { x: physics.startX - distance, y: physics.startY },
        alpha: this.calculateAlphaForSlide(elapsedTime, duration)
      });
    }
    
    return { frames, duration, type: 'slide-from-left' };
  }
  
  /**
   * オリジナルの数値積分ロジック活用
   */
  private calculateDistanceFromSpeed(
    elapsedTime: number,
    duration: number,
    initialSpeed: number,
    finalSpeed: number,
    easingFn: EasingFunction = this.easeOutCubic
  ): number {
    // オリジナルの台形公式による数値積分
    return this.originalPhysics.integrateVelocity(
      elapsedTime, duration, initialSpeed, finalSpeed, easingFn
    );
  }
}
```

### 3. DirectEffectPrimitive

#### 責任範囲
- PIXIフィルターの直接制御
- オリジナルのシンプルなエフェクト適用
- 複雑な抽象化レイヤーの回避

#### 実装例

```typescript
export class DirectEffectPrimitive implements CooperativePrimitive {
  private originalEffects: OriginalEffectManager;
  
  constructor() {
    // オリジナルのフィルター適用ロジックを継承
    this.originalEffects = this.extractOriginalEffectLogic();
  }
  
  /**
   * グローエフェクト（オリジナルパターン準拠）
   */
  applyGlow(
    container: PIXI.Container,
    intensity: number,
    color: string = "#FFD700"
  ): void {
    // オリジナルのAdvancedBloomFilter設定を使用
    const bloomFilter = new AdvancedBloomFilter({
      threshold: 0.2,
      bloomScale: intensity,
      brightness: 1.2,
      blur: 6,
      quality: 8,
      kernels: null,
      pixelSize: { x: 1, y: 1 }
    });
    
    // オリジナルのフィルター適用方式
    container.filters = container.filters ? 
      [...container.filters, bloomFilter] : 
      [bloomFilter];
    
    // オリジナルのfilterArea設定
    this.originalEffects.setupFilterArea(container, intensity);
  }
  
  /**
   * シャドウエフェクト（オリジナルパターン準拠）
   */
  applyShadow(
    container: PIXI.Container,
    params: ShadowParams
  ): void {
    const shadowFilter = new DropShadowFilter({
      blur: params.blur,
      color: params.color,
      alpha: params.alpha,
      angle: params.angle,
      distance: params.distance,
      quality: 4
    });
    
    // オリジナルのshadowOnly設定
    (shadowFilter as any).shadowOnly = params.shadowOnly;
    
    container.filters = container.filters ? 
      [...container.filters, shadowFilter] : 
      [shadowFilter];
  }
}
```

## Claude Function Calling統合

### 構造化データ定義

```typescript
// Claude APIに最適化された関数定義
export const claudeFunctionDefinitions = {
  name: "generate_lyric_template",
  description: "Generate a lyric animation template based on natural language description",
  parameters: {
    type: "object",
    properties: {
      entryAnimation: {
        type: "object",
        properties: {
          type: { 
            type: "string", 
            enum: ["slide", "fade", "reveal", "bounce"],
            description: "Type of entrance animation"
          },
          direction: { 
            type: "string", 
            enum: ["left", "right", "top", "bottom"],
            description: "Direction of movement"
          },
          sequencing: { 
            type: "string", 
            enum: ["simultaneous", "sequential", "random"],
            description: "How characters appear relative to each other"
          },
          duration: { 
            type: "number", 
            minimum: 100, 
            maximum: 5000,
            description: "Duration in milliseconds"
          }
        },
        required: ["type", "direction", "duration"]
      },
      layoutPattern: {
        type: "object", 
        properties: {
          arrangement: { 
            type: "string", 
            enum: ["cumulative", "grid", "circular", "scattered"],
            description: "How characters are positioned relative to each other"
          },
          spacing: { 
            type: "number", 
            minimum: 0.1, 
            maximum: 3.0,
            description: "Spacing multiplier between characters"
          },
          alignment: { 
            type: "string", 
            enum: ["left", "center", "right"],
            description: "Text alignment within the phrase"
          }
        },
        required: ["arrangement", "spacing"]
      },
      effects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { 
              type: "string", 
              enum: ["glow", "shadow", "blur", "distortion"],
              description: "Type of visual effect"
            },
            intensity: { 
              type: "number", 
              minimum: 0, 
              maximum: 1,
              description: "Effect intensity (0 = subtle, 1 = dramatic)"
            },
            color: { 
              type: "string", 
              pattern: "^#[0-9A-Fa-f]{6}$",
              description: "Effect color in hex format"
            }
          },
          required: ["type", "intensity"]
        },
        description: "Visual effects to apply"
      },
      exitAnimation: {
        type: "object",
        properties: {
          type: { 
            type: "string", 
            enum: ["fade", "slide", "shrink", "explode"],
            description: "Type of exit animation"
          },
          direction: { 
            type: "string", 
            enum: ["left", "right", "top", "bottom"],
            description: "Direction of exit movement"
          },
          duration: { 
            type: "number", 
            minimum: 100, 
            maximum: 5000,
            description: "Duration in milliseconds"
          }
        },
        required: ["type", "duration"]
      }
    },
    required: ["entryAnimation", "layoutPattern"]
  }
};
```

## テンプレート生成エンジン

### 協調的階層コード生成

```typescript
export class CooperativeTemplateGenerator {
  private primitiveLibrary: PrimitiveLibrary;
  private originalPatterns: OriginalPatternExtractor;
  
  constructor() {
    this.primitiveLibrary = new PrimitiveLibrary();
    this.originalPatterns = new OriginalPatternExtractor();
  }
  
  /**
   * Claude出力から完全なテンプレートを生成
   */
  generateTemplate(spec: ClaudeTemplateSpec): IAnimationTemplate {
    // プリミティブの組み合わせを決定
    const primitiveComposition = this.composePrimitives(spec);
    
    // 協調的階層構造でテンプレートを生成
    return {
      metadata: this.generateMetadata(spec),
      getParameterConfig: this.generateParameterConfig(primitiveComposition),
      
      // オリジナルの重要メソッドを継承
      removeVisualElements: this.originalPatterns.getRemoveVisualElements(),
      animateContainer: this.originalPatterns.getAnimateContainer(),
      
      // 新しい協調的実装
      renderPhraseContainer: this.generatePhraseRenderer(primitiveComposition),
      renderWordContainer: this.generateWordRenderer(primitiveComposition),
      renderCharContainer: this.generateCharRenderer(primitiveComposition)
    };
  }
  
  /**
   * フレーズレベルレンダラー生成
   */
  private generatePhraseRenderer(composition: PrimitiveComposition): Function {
    return (container, text, params, nowMs, startMs, endMs, phase) => {
      try {
        // 1. グローバル状態の計算
        const globalState = this.calculateGlobalState(params, nowMs, composition);
        
        // 2. エフェクトの適用（オリジナルパターン）
        composition.effects.forEach(effect => 
          effect.apply(container, globalState.effectParams)
        );
        
        // 3. 退場アニメーションの制御（オリジナルロジック継承）
        const exitState = composition.exitAnimation.calculateState(
          nowMs, endMs, params
        );
        container.alpha = exitState.alpha;
        container.visible = exitState.visible;
        
        // 4. フレーズ位置の設定（オリジナルのランダム配置等を継承）
        this.originalPatterns.setPhrasePosition(
          container, params, nowMs, startMs, endMs
        );
        
        return true;
      } catch (error) {
        console.error('Failed to render phrase container:', error);
        return false;
      }
    };
  }
  
  /**
   * 単語レベルレンダラー生成
   */
  private generateWordRenderer(composition: PrimitiveComposition): Function {
    return (container, text, params, nowMs, startMs, endMs, phase) => {
      try {
        // 1. 入場アニメーションの実行（オリジナル物理計算）
        const entryAnimation = composition.entryAnimation.calculate(
          params, nowMs, startMs
        );
        container.position.set(entryAnimation.x, entryAnimation.y);
        container.alpha = entryAnimation.alpha;
        
        // 2. 累積文字配置の管理（オリジナルパターン継承）
        const characterLayouts = composition.layout.arrangeCumulative(
          params.chars, container.position, params
        );
        
        this.originalPatterns.manageCharacterContainers(
          container, characterLayouts, params, nowMs, phase
        );
        
        // 3. 単語の表示制御（オリジナルと同じ）
        container.visible = true;
        container.updateTransform();
        
        return true;
      } catch (error) {
        console.error('Failed to render word container:', error);
        return false;
      }
    };
  }
  
  /**
   * 文字レベルレンダラー生成
   */
  private generateCharRenderer(composition: PrimitiveComposition): Function {
    return (container, text, params, nowMs, startMs, endMs, phase) => {
      try {
        // 文字の描画のみ（位置は上位層が制御）
        // オリジナルのrenderCharContainerロジックを継承
        return this.originalPatterns.renderCharacterText(
          container, text, params, nowMs, startMs, endMs, phase
        );
      } catch (error) {
        console.error('Failed to render character container:', error);
        return false;
      }
    };
  }
}
```

## 品質保証システム

### テンプレート検証

```typescript
export class TemplateValidator {
  private originalReference: WordSlideTextReference;
  
  /**
   * 生成されたテンプレートの品質を検証
   */
  validateTemplate(template: IAnimationTemplate): ValidationResult {
    const result = new ValidationResult();
    
    // 1. 協調的階層制御の検証
    this.validateHierarchicalCooperation(template, result);
    
    // 2. オリジナルパターンとの整合性
    this.validateOriginalPatternCompliance(template, result);
    
    // 3. パフォーマンス評価
    this.validatePerformance(template, result);
    
    // 4. 視覚的品質評価
    this.validateVisualQuality(template, result);
    
    return result;
  }
  
  /**
   * 協調的階層制御の検証
   */
  private validateHierarchicalCooperation(
    template: IAnimationTemplate, 
    result: ValidationResult
  ): void {
    // フレーズ→単語→文字の責任分担が正しく実装されているか
    const hierarchyCheck = this.checkHierarchyResponsibilities(template);
    
    if (hierarchyCheck.hasDoublePositioning) {
      result.addError('Multiple layers are calculating character positions');
    }
    
    if (hierarchyCheck.hasOrphanedLogic) {
      result.addError('Some logic is not properly delegated to appropriate layer');
    }
    
    if (hierarchyCheck.cooperationScore > 0.8) {
      result.addSuccess('Hierarchical cooperation is properly implemented');
    }
  }
  
  /**
   * オリジナルパターンとの整合性検証
   */
  private validateOriginalPatternCompliance(
    template: IAnimationTemplate,
    result: ValidationResult
  ): void {
    // removeVisualElementsが正しく継承されているか
    if (this.compareMethod(template.removeVisualElements, this.originalReference.removeVisualElements)) {
      result.addSuccess('removeVisualElements properly inherited');
    } else {
      result.addWarning('removeVisualElements differs from original pattern');
    }
    
    // 累積オフセット計算が正しく実装されているか
    const layoutTest = this.testCumulativeLayout(template);
    if (layoutTest.positionsCorrect) {
      result.addSuccess('Cumulative layout correctly implemented');
    } else {
      result.addError('Character positioning issues detected');
    }
  }
}
```

## 実装チェックリスト

### Phase 1: プリミティブライブラリ構築

- [ ] **CumulativeLayoutPrimitive**
  - [ ] オリジナルのmanageCharacterContainersロジック抽出
  - [ ] 半角・全角文字の適切な間隔計算
  - [ ] 累積オフセット方式の正確な実装
  - [ ] 単体テストの作成

- [ ] **PhysicsBasedAnimationPrimitive**
  - [ ] オリジナルのcalculateDistanceFromSpeedロジック継承
  - [ ] 数値積分による精密な移動計算
  - [ ] イージング関数の正確な実装
  - [ ] アニメーション品質テスト

- [ ] **DirectEffectPrimitive**
  - [ ] AdvancedBloomFilterの直接制御
  - [ ] DropShadowFilterの適用
  - [ ] filterAreaの適切な設定
  - [ ] エフェクト品質テスト

### Phase 2: Claude統合

- [ ] **Function Calling定義**
  - [ ] 構造化スキーマの設計
  - [ ] バリデーション規則の定義
  - [ ] エラーハンドリングの実装

- [ ] **API統合**
  - [ ] Claude APIクライアントの実装
  - [ ] レスポンス解析・検証
  - [ ] エラー処理・リトライ機構

### Phase 3: テンプレート生成

- [ ] **協調的階層コード生成**
  - [ ] オリジナルパターン継承の実装
  - [ ] プリミティブ組み合わせロジック
  - [ ] 品質検証システム

- [ ] **統合テスト**
  - [ ] エンドツーエンドテスト
  - [ ] パフォーマンステスト
  - [ ] 視覚的品質テスト

## まとめ

この協調的プリミティブ実装ガイドにより、LLM自然言語テンプレート生成システム v2.0の確実な実装が可能となる。オリジナルWordSlideTextの成功パターンを継承し、階層間協調を重視した設計により、高品質で安定したテンプレート生成を実現する。

重要なのは、v1.0の失敗を教訓として、分離・独立型から協調・連携型への根本的な設計転換を行うことである。外部LLMサービスの活用と段階的実装により、技術的リスクを最小化しながら革新的な機能を実現する。