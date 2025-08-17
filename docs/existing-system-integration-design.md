# 既存システム統合設計書

**バージョン**: 1.0  
**作成日**: 2025-08-07  
**優先度**: 🔴 重要（Week 1後半で必要）

## 1. 統合方針

### 1.1 基本戦略

**段階的統合アプローチ**:
- 既存のAnimationInstanceを維持
- 階層システムを追加レイヤーとして実装
- 破壊的変更を避ける
- 段階的な移行を可能にする

```typescript
// 統合の基本構造
interface IntegrationArchitecture {
  existing: {
    AnimationInstance,    // 既存のコア
    PIXI.Container,      // 既存のレンダリング
    HTMLAudioElement     // 既存の音楽再生
  };
  
  new: {
    CoreSynchronizationEngine,  // 新規追加
    PrimitiveAPIManager,       // 新規追加
    CompatibilityLayer         // 橋渡し役
  };
}
```

### 1.2 非破壊的統合の原則

1. **既存APIの維持**: 現在動作しているコードは変更しない
2. **オプトイン方式**: 新システムは明示的に有効化
3. **フォールバック保証**: エラー時は既存システムで動作継続
4. **データ互換性**: 既存データ構造をそのまま活用

## 2. AnimationInstanceとの統合

### 2.1 現在のAnimationInstance構造

```typescript
// 既存のAnimationInstance（変更しない）
interface ExistingAnimationInstance {
  // コンテナ階層（既存）
  phraseContainer: PIXI.Container;
  wordContainers: PIXI.Container[];
  charContainers: PIXI.Container[];
  
  // メソッド（既存）
  update(musicTime: number): void;
  render(): void;
  
  // パラメータ（既存）
  parameters: TemplateParameters;
  timing: AnimationTiming;
}
```

### 2.2 統合方法（ラッパー方式）

```typescript
// src/renderer/engine/HierarchicalWrapper.ts
export class HierarchicalWrapper {
  private originalInstance: AnimationInstance;
  private hierarchicalEngine: CoreSynchronizationEngine;
  private enabled: boolean = false;
  
  constructor(instance: AnimationInstance) {
    this.originalInstance = instance;
    this.hierarchicalEngine = new CoreSynchronizationEngine();
    
    // 既存メソッドを保存
    this.preserveOriginalMethods();
  }
  
  // 非破壊的な統合
  private preserveOriginalMethods(): void {
    const originalUpdate = this.originalInstance.update.bind(this.originalInstance);
    
    // updateメソッドをラップ
    this.originalInstance.update = async (musicTime: number) => {
      if (this.enabled) {
        try {
          // 新システムで処理
          const result = await this.hierarchicalEngine.executeWithMusicSync(
            this.originalInstance,
            musicTime
          );
          
          if (!result.success) {
            // 失敗時は既存システムにフォールバック
            return originalUpdate(musicTime);
          }
        } catch (error) {
          console.warn('[Integration] Falling back to original:', error);
          return originalUpdate(musicTime);
        }
      } else {
        // 無効時は既存システムを使用
        return originalUpdate(musicTime);
      }
    };
  }
  
  // 階層システムの有効化/無効化
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[Integration] Hierarchical system: ${enabled ? 'enabled' : 'disabled'}`);
  }
}
```

### 2.3 データアクセスパターン

```typescript
// src/renderer/engine/DataAccessLayer.ts
export class DataAccessLayer {
  // 既存データを階層データに変換（読み取り専用）
  static extractHierarchicalData(instance: AnimationInstance): HierarchicalData {
    return {
      phrase: {
        container: instance.phraseContainer,
        position: {
          x: instance.phraseContainer.position.x,
          y: instance.phraseContainer.position.y
        },
        alpha: instance.phraseContainer.alpha
      },
      
      words: instance.wordContainers.map((container, index) => ({
        container: container,
        index: index,
        position: {
          x: container.position.x,
          y: container.position.y
        }
      })),
      
      characters: instance.charContainers.map((container, index) => ({
        container: container,
        index: index,
        character: this.extractCharacter(container)
      }))
    };
  }
  
  // 結果を既存構造に適用（非破壊的）
  static applyHierarchicalResults(
    instance: AnimationInstance,
    results: HierarchicalResult
  ): void {
    // Phraseレベル適用
    if (results.phrase) {
      instance.phraseContainer.position.set(
        results.phrase.x,
        results.phrase.y
      );
      instance.phraseContainer.alpha = results.phrase.alpha;
    }
    
    // Wordレベル適用
    results.words?.forEach((wordResult, index) => {
      if (instance.wordContainers[index]) {
        instance.wordContainers[index].position.set(
          wordResult.x,
          wordResult.y
        );
      }
    });
    
    // Characterレベル適用
    results.characters?.forEach((charResult, index) => {
      if (instance.charContainers[index]) {
        // Characterのみテキスト操作可能
        this.updateCharacterText(
          instance.charContainers[index],
          charResult
        );
      }
    });
  }
}
```

## 3. データ変換仕様

### 3.1 既存→階層データ変換

```typescript
// src/renderer/converters/LegacyToHierarchical.ts
export class LegacyToHierarchicalConverter {
  // 既存パラメータを階層パラメータに変換
  static convertParameters(
    legacyParams: TemplateParameters
  ): HierarchicalParameters {
    return {
      // Phraseレベルパラメータ
      phrase: {
        centerX: legacyParams.phraseOffsetX || 0,
        centerY: legacyParams.phraseOffsetY || 0,
        fadeInDuration: legacyParams.fadeInDuration || 500,
        fadeOutDuration: legacyParams.fadeOutDuration || 500
      },
      
      // Wordレベルパラメータ
      word: {
        spacing: legacyParams.wordSpacing || 20,
        displayMode: this.inferDisplayMode(legacyParams)
      },
      
      // Characterレベルパラメータ
      character: {
        fontSize: legacyParams.fontSize || 48,
        fontFamily: legacyParams.fontFamily || 'Arial',
        textColor: legacyParams.textColor || 0xFFFFFF,
        animationType: legacyParams.animationType || 'none'
      }
    };
  }
  
  // タイミング情報変換
  static convertTiming(
    legacyTiming: AnimationTiming
  ): HierarchicalTiming {
    return {
      musicTime: legacyTiming.currentTime,
      phase: legacyTiming.phase,
      progress: legacyTiming.progress,
      frameTime: performance.now()
    };
  }
  
  // 表示モード推測
  private static inferDisplayMode(params: TemplateParameters): WordDisplayMode {
    // 既存パラメータから表示モードを推測
    if (params.wordDisplayMode) {
      return params.wordDisplayMode;
    }
    
    // デフォルト
    return 'individual_word_entrance';
  }
}
```

### 3.2 階層→既存データ変換

```typescript
// src/renderer/converters/HierarchicalToLegacy.ts
export class HierarchicalToLegacyConverter {
  // 階層結果を既存形式に変換
  static convertResults(
    hierarchicalResult: HierarchicalResult
  ): LegacyUpdateResult {
    return {
      // コンテナ更新情報
      containerUpdates: [
        {
          target: 'phrase',
          position: hierarchicalResult.phrase.position,
          alpha: hierarchicalResult.phrase.alpha
        },
        ...hierarchicalResult.words.map(w => ({
          target: 'word',
          index: w.index,
          position: w.position
        })),
        ...hierarchicalResult.characters.map(c => ({
          target: 'character',
          index: c.index,
          updates: c.updates
        }))
      ],
      
      // パフォーマンス情報
      performance: {
        frameTime: hierarchicalResult.executionTime,
        syncAccuracy: hierarchicalResult.syncAccuracy
      }
    };
  }
}
```

## 4. 互換性維持戦略

### 4.1 バージョン管理

```typescript
// src/renderer/compatibility/VersionManager.ts
export class VersionManager {
  static readonly COMPATIBILITY_VERSION = '1.0.0';
  
  // 互換性チェック
  static checkCompatibility(instance: AnimationInstance): CompatibilityStatus {
    const version = this.detectVersion(instance);
    
    return {
      compatible: this.isCompatible(version),
      version: version,
      features: this.getAvailableFeatures(version)
    };
  }
  
  private static detectVersion(instance: AnimationInstance): string {
    // バージョン検出ロジック
    if ('hierarchicalVersion' in instance) {
      return instance.hierarchicalVersion;
    }
    
    // レガシー
    return 'legacy';
  }
  
  private static isCompatible(version: string): boolean {
    // 互換性マトリックス
    const compatibleVersions = ['legacy', '1.0.0', '1.0.1'];
    return compatibleVersions.includes(version);
  }
}
```

### 4.2 機能フラグ

```typescript
// src/renderer/compatibility/FeatureFlags.ts
export class FeatureFlags {
  private static flags = {
    USE_HIERARCHICAL_ENGINE: false,
    USE_PRIMITIVE_API: false,
    ENABLE_RESPONSIBILITY_VALIDATION: true,
    LEGACY_FALLBACK: true
  };
  
  static isEnabled(feature: keyof typeof FeatureFlags.flags): boolean {
    return this.flags[feature];
  }
  
  static enable(feature: keyof typeof FeatureFlags.flags): void {
    this.flags[feature] = true;
    console.log(`[FeatureFlags] Enabled: ${feature}`);
  }
  
  static disable(feature: keyof typeof FeatureFlags.flags): void {
    this.flags[feature] = false;
    console.log(`[FeatureFlags] Disabled: ${feature}`);
  }
}
```

## 5. 移行手順

### 5.1 段階的移行計画

**Phase 1: 並行実行（Week 1-2）**
```typescript
// 既存と新システムを並行実行
const wrapper = new HierarchicalWrapper(animationInstance);
wrapper.setEnabled(false); // 初期は無効

// テスト時のみ有効化
if (isTestEnvironment) {
  wrapper.setEnabled(true);
}
```

**Phase 2: 選択的有効化（Week 3-4）**
```typescript
// 特定テンプレートで有効化
if (templateName === 'WordSlideTextPrimitive') {
  wrapper.setEnabled(true);
}
```

**Phase 3: デフォルト有効化（Week 5）**
```typescript
// デフォルトで有効、問題時は無効化可能
wrapper.setEnabled(true);

// エラー時の自動フォールバック
wrapper.onError(() => {
  wrapper.setEnabled(false);
});
```

### 5.2 移行チェックリスト

```markdown
## 移行チェックリスト

### 準備段階
- [ ] 既存コードのバックアップ
- [ ] テスト環境の準備
- [ ] ロールバック手順の確認

### 実装段階
- [ ] HierarchicalWrapper実装
- [ ] DataAccessLayer実装
- [ ] Converter実装
- [ ] FeatureFlags設定

### テスト段階
- [ ] 既存機能の動作確認
- [ ] 新機能の動作確認
- [ ] パフォーマンステスト
- [ ] 互換性テスト

### 本番移行
- [ ] 段階的有効化
- [ ] モニタリング設定
- [ ] フォールバック確認
- [ ] 完全移行
```

## 6. エラーハンドリング

### 6.1 エラー時のフォールバック

```typescript
// src/renderer/compatibility/FallbackManager.ts
export class FallbackManager {
  private static errorCount = 0;
  private static readonly MAX_ERRORS = 3;
  
  static handleError(
    error: Error,
    instance: AnimationInstance,
    wrapper: HierarchicalWrapper
  ): void {
    console.error('[FallbackManager] Error detected:', error);
    
    this.errorCount++;
    
    if (this.errorCount >= this.MAX_ERRORS) {
      // 自動的に階層システムを無効化
      console.warn('[FallbackManager] Disabling hierarchical system');
      wrapper.setEnabled(false);
      
      // エラーカウントリセット
      setTimeout(() => {
        this.errorCount = 0;
      }, 60000); // 1分後にリセット
    }
  }
  
  static reset(): void {
    this.errorCount = 0;
  }
}
```

### 6.2 診断ツール

```typescript
// src/renderer/debug/IntegrationDiagnostics.ts
export class IntegrationDiagnostics {
  static diagnose(instance: AnimationInstance): DiagnosticReport {
    return {
      // 構造チェック
      structure: {
        hasPhraseContainer: !!instance.phraseContainer,
        wordContainerCount: instance.wordContainers?.length || 0,
        charContainerCount: instance.charContainers?.length || 0
      },
      
      // 互換性チェック
      compatibility: {
        version: VersionManager.checkCompatibility(instance),
        features: FeatureFlags.getEnabledFeatures()
      },
      
      // パフォーマンス
      performance: {
        memoryUsage: this.getMemoryUsage(),
        frameRate: PIXI.Ticker.shared.FPS
      },
      
      // 推奨事項
      recommendations: this.generateRecommendations(instance)
    };
  }
  
  private static generateRecommendations(
    instance: AnimationInstance
  ): string[] {
    const recommendations = [];
    
    // メモリ使用量チェック
    if (this.getMemoryUsage() > 100 * 1024 * 1024) { // 100MB
      recommendations.push('Consider enabling object pooling');
    }
    
    // FPSチェック
    if (PIXI.Ticker.shared.FPS < 55) {
      recommendations.push('Performance issue detected, consider disabling hierarchical system');
    }
    
    return recommendations;
  }
}
```

## 7. テスト戦略

### 7.1 統合テスト

```typescript
// src/test/integration/SystemIntegrationTest.ts
describe('System Integration', () => {
  let instance: AnimationInstance;
  let wrapper: HierarchicalWrapper;
  
  beforeEach(() => {
    instance = createTestInstance();
    wrapper = new HierarchicalWrapper(instance);
  });
  
  test('既存システムが変更されていない', () => {
    wrapper.setEnabled(false);
    const before = captureState(instance);
    
    instance.update(1000);
    
    const after = captureState(instance);
    expect(after).toMatchSnapshot(before);
  });
  
  test('階層システム有効時も既存データが保持される', () => {
    wrapper.setEnabled(true);
    const before = instance.parameters;
    
    instance.update(1000);
    
    const after = instance.parameters;
    expect(after).toEqual(before);
  });
  
  test('エラー時に自動フォールバック', () => {
    wrapper.setEnabled(true);
    
    // エラーを発生させる
    jest.spyOn(hierarchicalEngine, 'executeWithMusicSync')
      .mockRejectedValue(new Error('Test error'));
    
    instance.update(1000);
    
    // フォールバックが動作
    expect(wrapper.isEnabled()).toBe(false);
  });
});
```

## 8. まとめ

### 統合の重要ポイント

1. **非破壊的統合**: 既存システムを変更しない
2. **段階的移行**: 徐々に新システムに移行
3. **フォールバック**: エラー時は既存システムで継続
4. **互換性維持**: データ構造の互換性を保つ

この設計により、リスクを最小限に抑えながら新システムへの移行が可能になります。