# 階層分離システム実装 開発指示書

**プロジェクト**: UTAVISTA v0.4.3 階層分離システム  
**基盤コミット**: 5f5c9b5 (安定プリミティブシステム)  
**ブランチ**: dev4  
**期間**: 5.5週間 (Electronネイティブ最適化含む)  
**開始日**: 即日開始可能

---

## 1. 開発方針と最重要原則

### 1.1 核心価値への集中

**最重要機能（この3つのみに集中）**:
1. **音楽との完全同期**: サブミリ秒精度（0.5ms以内）
2. **60FPS確実レンダリング**: フレームドロップ0.1%未満
3. **明確なプリミティブAPI**: 開発者理解度90%以上

**開発しない機能（将来の拡張として保留）**:
- セキュリティ強化機能
- ユーザー習熟度別UI
- 高度な監視・分析機能
- 複雑なフォールバック機構
- リアルタイム最適化機能

### 1.2 Electronネイティブ優先原則

```typescript
// ❌ 使用禁止: ブラウザレガシーコード
new (window.AudioContext || (window as any).webkitAudioContext)();
requestAnimationFrame(callback);
setTimeout/setInterval

// ✅ 使用必須: Electronネイティブ
process.hrtime.bigint();     // ナノ秒精度時間
process.nextTick(callback);   // 最高優先度実行
process.memoryUsage();        // 詳細メモリ情報
global.gc();                  // 手動GC制御
```

### 1.3 責任分離の厳格遵守

```typescript
// 階層別責任（絶対遵守）
interface StrictResponsibility {
  phrase: {
    // フレーズは全体制御のみ（テキスト描画禁止）
    ALLOWED: ['positioning', 'fade', 'group_movement'];
    FORBIDDEN: ['text_rendering', 'character_control'];
  };
  
  word: {
    // ワードは文字管理のみ（テキスト描画禁止）
    ALLOWED: ['character_management', 'spacing', 'grouping'];
    FORBIDDEN: ['text_rendering', 'phrase_control'];
  };
  
  character: {
    // キャラクターのみテキスト描画可能
    ALLOWED: ['text_rendering', 'individual_animation', 'effects'];
    FORBIDDEN: ['word_management', 'phrase_control'];
  };
}
```

---

## 2. Phase 1: 核心エンジン実装（2.5週間）

### Week 1: Electronネイティブ音楽同期基盤

#### 実装タスク

**Task 1.1: ElectronNativePrecisionTimeManager実装**

```typescript
// src/renderer/engine/ElectronNativePrecisionTimeManager.ts
export class ElectronNativePrecisionTimeManager {
  private startTimeNano: bigint;
  private audioStartTime: number;
  private audioElement: HTMLAudioElement;
  
  constructor(audioElement: HTMLAudioElement) {
    this.audioElement = audioElement;
    this.startTimeNano = process.hrtime.bigint();
    this.audioStartTime = audioElement.currentTime;
  }
  
  // ナノ秒精度の時間計算（WebAudio API完全排除）
  calculateFrameTime(musicTime: number): FrameTime {
    const nowNano = process.hrtime.bigint();
    const elapsedNano = nowNano - this.startTimeNano;
    const elapsedMs = Number(elapsedNano) / 1_000_000;
    
    const audioElapsed = this.audioElement.currentTime - this.audioStartTime;
    const syncOffset = elapsedMs - (audioElapsed * 1000);
    
    return {
      musicTime: musicTime,
      systemTime: elapsedMs,
      syncOffset: syncOffset,
      frameNumber: Math.floor(elapsedMs / 16.67),
      precision: 'nanosecond',
      isAccurate: Math.abs(syncOffset) < 0.5 // 0.5ms以内
    };
  }
  
  // 同期精度測定（サブミリ秒精度）
  measureSyncAccuracy(): SyncAccuracy {
    const deviation = this.getCurrentSyncDeviation();
    
    return {
      deviation: deviation,
      accuracy: Math.max(0, 1 - (deviation / 0.5)),
      isAcceptable: deviation < 0.5, // 0.5ms以内
      precision: 'sub_millisecond'
    };
  }
}
```

**Task 1.2: CoreSynchronizationEngine基盤実装**

```typescript
// src/renderer/engine/CoreSynchronizationEngine.ts
export class CoreSynchronizationEngine {
  private timeManager: ElectronNativePrecisionTimeManager;
  private frameScheduler: ElectronNativeFrameScheduler;
  private renderingPipeline: RenderingPipeline;
  
  async executeWithMusicSync(
    instance: AnimationInstance,
    musicTime: number
  ): Promise<SyncResult> {
    // 1. ナノ秒精度時間計算
    const frameTime = this.timeManager.calculateFrameTime(musicTime);
    
    // 2. 同期精度チェック
    if (!frameTime.isAccurate) {
      console.warn('[Sync] Deviation exceeded 0.5ms:', frameTime.syncOffset);
    }
    
    // 3. 階層処理実行
    const hierarchyResult = await this.processHierarchy(instance, frameTime);
    
    // 4. レンダリング実行
    const renderResult = this.renderingPipeline.render(hierarchyResult);
    
    return {
      success: renderResult.success,
      syncAccuracy: this.timeManager.measureSyncAccuracy(),
      frameRate: this.frameScheduler.getCurrentFPS(),
      renderTime: renderResult.executionTime
    };
  }
  
  private async processHierarchy(
    instance: AnimationInstance,
    frameTime: FrameTime
  ): Promise<HierarchyResult> {
    // 厳格な階層順序処理（責任分離）
    const phraseResult = await this.processPhraseLevel(instance, frameTime);
    const wordResults = await this.processWordLevel(instance, frameTime);
    const charResults = await this.processCharLevel(instance, frameTime);
    
    return {
      phrase: phraseResult,
      words: wordResults,
      characters: charResults,
      timestamp: frameTime.systemTime
    };
  }
}
```

**Task 1.3: ブラウザレガシーコード除去**

```typescript
// 修正対象ファイル一覧
const legacyCodeRemoval = {
  'WaveformPanel.tsx': {
    remove: ['window.AudioContext', 'webkitAudioContext'],
    replace: 'ElectronNativePrecisionTimeManager'
  },
  'Engine.ts': {
    remove: ['requestAnimationFrame', 'setTimeout'],
    replace: 'process.nextTick'
  },
  // その他10+ファイル
};

// 置換例
// Before:
audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

// After:
timeManager = new ElectronNativePrecisionTimeManager(audioElement);
```

#### 成功基準（Week 1）

```typescript
interface Week1SuccessCriteria {
  implementation: {
    timeManager: 'completed';     // ナノ秒精度時間管理
    coreEngine: 'basic_working';  // 基本動作確認
    legacyRemoval: '>50%';        // レガシーコード50%除去
  };
  
  performance: {
    syncAccuracy: '>98%';         // 0.5ms以内同期
    timePrecision: 'nanosecond';  // ナノ秒精度達成
    stabilityTest: 'passed';      // 安定性テスト合格
  };
  
  testing: {
    unitTests: 'all_passing';     // 単体テスト全合格
    integrationTest: 'basic';     // 基本統合テスト
    manualVerification: 'done';   // 手動動作確認
  };
}
```

### Week 2: Electronネイティブレンダリング保証

#### 実装タスク

**Task 2.1: ElectronNativeFrameScheduler実装**

```typescript
// src/renderer/engine/ElectronNativeFrameScheduler.ts
export class ElectronNativeFrameScheduler {
  private readonly FRAME_BUDGET_MS = 14; // 16.67msの85%
  private frameLoop: NodeJS.Immediate | null = null;
  private frameCounter = 0;
  private lastFrameTime: bigint;
  
  startFrameLoop(callback: FrameCallback): void {
    this.lastFrameTime = process.hrtime.bigint();
    
    const executeFrame = () => {
      const currentTime = process.hrtime.bigint();
      const elapsed = Number(currentTime - this.lastFrameTime) / 1_000_000;
      
      // フレーム予算チェック
      if (elapsed >= 16.67) {
        this.frameCounter++;
        
        callback({
          frameNumber: this.frameCounter,
          timestamp: Number(currentTime) / 1_000_000,
          deltaTime: elapsed,
          budget: this.FRAME_BUDGET_MS - elapsed,
          precision: 'nanosecond'
        });
        
        this.lastFrameTime = currentTime;
      }
      
      // 最高優先度で次フレームスケジュール
      process.nextTick(executeFrame);
    };
    
    executeFrame();
  }
  
  // フレーム予算管理
  checkFrameBudget(): FrameBudgetStatus {
    const elapsed = this.getElapsedFrameTime();
    const remaining = this.FRAME_BUDGET_MS - elapsed;
    
    return {
      elapsed: elapsed,
      remaining: remaining,
      canContinue: remaining > 0,
      shouldReduceQuality: remaining < 2
    };
  }
}
```

**Task 2.2: RenderingPipeline実装**

```typescript
// src/renderer/engine/RenderingPipeline.ts
export class RenderingPipeline {
  private frameBuffer: FrameBuffer;
  private scheduler: ElectronNativeFrameScheduler;
  private monitor: ElectronNativePerformanceMonitor;
  
  render(hierarchyResult: HierarchyResult): RenderResult {
    const startNano = process.hrtime.bigint();
    
    try {
      // フレーム予算チェック
      const budget = this.scheduler.checkFrameBudget();
      if (!budget.canContinue) {
        return this.executeReducedQualityRender(hierarchyResult);
      }
      
      // 階層順レンダリング（責任分離厳守）
      this.renderPhraseLevel(hierarchyResult.phrase);    // 配置・フェードのみ
      this.renderWordLevel(hierarchyResult.words);        // 文字管理のみ
      this.renderCharacterLevel(hierarchyResult.characters); // テキスト描画
      
      const endNano = process.hrtime.bigint();
      const executionMs = Number(endNano - startNano) / 1_000_000;
      
      return {
        success: true,
        executionTime: executionMs,
        frameRate: this.monitor.getCurrentFPS(),
        quality: this.assessRenderQuality(hierarchyResult)
      };
      
    } catch (error) {
      return this.handleRenderError(error, startNano);
    }
  }
  
  // 階層別レンダリング（責任分離）
  private renderPhraseLevel(phrase: PhraseResult): void {
    // フレーズ：全体配置とフェードのみ（テキスト描画禁止）
    phrase.container.position.set(phrase.x, phrase.y);
    phrase.container.alpha = phrase.alpha;
    // NG: phrase.container.addChild(text); // 絶対禁止
  }
  
  private renderWordLevel(words: WordResult[]): void {
    // ワード：文字コンテナ管理のみ（テキスト描画禁止）
    words.forEach(word => {
      word.container.position.set(word.relativeX, word.relativeY);
      // NG: word.container.addChild(text); // 絶対禁止
    });
  }
  
  private renderCharacterLevel(characters: CharacterResult[]): void {
    // キャラクター：唯一テキスト描画可能
    characters.forEach(char => {
      if (!char.text) {
        char.text = new PIXI.Text(char.character, char.style);
        char.container.addChild(char.text); // ここだけOK
      }
      char.text.position.set(char.x, char.y);
      char.text.alpha = char.alpha;
    });
  }
}
```

**Task 2.3: ElectronNativeMemoryManager実装**

```typescript
// src/renderer/engine/ElectronNativeMemoryManager.ts
export class ElectronNativeMemoryManager {
  private containerPool: PIXI.Container[] = [];
  private textPool: PIXI.Text[] = [];
  private lastGCTime: bigint = process.hrtime.bigint();
  
  constructor() {
    // メモリ圧迫監視（1秒ごと）
    setInterval(() => this.monitorMemoryPressure(), 1000);
  }
  
  private monitorMemoryPressure(): void {
    const memUsage = process.memoryUsage();
    const heapRatio = memUsage.heapUsed / memUsage.heapTotal;
    
    if (heapRatio > 0.8) {
      console.warn('[Memory] High memory pressure:', heapRatio);
      
      // 手動GC実行（Electronネイティブ）
      if (global.gc) {
        global.gc();
        console.log('[Memory] Manual GC executed');
      }
      
      // プール最適化
      this.optimizePools();
    }
  }
  
  // オブジェクトプール管理
  getContainer(): PIXI.Container {
    return this.containerPool.pop() || new PIXI.Container();
  }
  
  releaseContainer(container: PIXI.Container): void {
    container.removeChildren();
    container.position.set(0, 0);
    container.scale.set(1, 1);
    container.alpha = 1;
    this.containerPool.push(container);
  }
  
  // 詳細メモリレポート（Electronネイティブ）
  getDetailedMemoryReport(): DetailedMemoryReport {
    const memUsage = process.memoryUsage();
    
    return {
      heap: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        ratio: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2) + '%'
      },
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      pools: {
        containers: this.containerPool.length,
        texts: this.textPool.length
      },
      timestamp: Date.now()
    };
  }
}
```

#### 成功基準（Week 2）

```typescript
interface Week2SuccessCriteria {
  implementation: {
    frameScheduler: 'completed';   // process.nextTick制御
    renderPipeline: 'completed';   // 階層レンダリング
    memoryManager: 'completed';    // ネイティブメモリ管理
  };
  
  performance: {
    frameRate: '60FPS_sustained';  // 持続60FPS
    frameDrops: '<0.5%';          // フレームドロップ0.5%未満
    renderTime: '<14ms';          // 14ms以内レンダリング
    memoryEfficiency: '+30%';     // メモリ効率30%向上
  };
  
  quality: {
    responsibilityCompliance: '100%'; // 責任分離100%遵守
    visualAccuracy: '100%';           // 視覚的一致性
    stabilityScore: '>99%';           // 安定性スコア
  };
}
```

### Week 2.5: Electronネイティブ最適化完了

#### 実装タスク

**Task 2.5.1: レガシーコード完全除去**

```typescript
// チェックリスト
const legacyCodeCleanup = {
  audioContext: {
    files: ['WaveformPanel.tsx', 'Engine.ts'],
    action: 'Remove all AudioContext references',
    replacement: 'ElectronNativePrecisionTimeManager'
  },
  
  requestAnimationFrame: {
    files: ['Engine.ts', 'TimelinePanel.tsx'],
    action: 'Replace with process.nextTick',
    replacement: 'ElectronNativeFrameScheduler'
  },
  
  setTimeout_setInterval: {
    files: ['All files'],
    action: 'Replace with process.nextTick or setImmediate',
    verification: 'grep -r "setTimeout\\|setInterval" src/'
  }
};
```

**Task 2.5.2: パフォーマンス最適化**

```typescript
// 最終最適化
interface FinalOptimization {
  // CPU優先度設定
  processPriority: {
    action: 'Set high process priority',
    implementation: 'process.platform specific'
  };
  
  // メモリ事前確保
  memoryPreallocation: {
    containers: 1000,  // 事前作成
    texts: 5000,      // 事前作成
    textures: 100     // 事前ロード
  };
  
  // フレーム予測
  framePrediction: {
    enabled: true,
    lookahead: 3,     // 3フレーム先読み
    precompute: true  // 事前計算
  };
}
```

#### 成功基準（Week 2.5）

```typescript
interface Week2_5SuccessCriteria {
  legacyCode: {
    removal: '100%';              // レガシーコード完全除去
    verification: 'all_passed';   // 検証完了
  };
  
  nativeOptimization: {
    syncAccuracy: '>99.9%';       // 0.5ms以内同期
    frameConsistency: '>99.5%';   // フレーム一貫性
    memoryEfficiency: '>30%';     // メモリ効率向上
  };
  
  systemIntegration: {
    compatibility: '100%';         // 既存システム互換
    stability: 'rock_solid';      // 完全安定動作
  };
}
```

---

## 3. Phase 2: プリミティブAPI完成（2週間）

### Week 3: 責任分離API設計

#### 実装タスク

**Task 3.1: PrimitiveAPIManager実装**

```typescript
// src/renderer/primitives/PrimitiveAPIManager.ts
export class PrimitiveAPIManager {
  private registry: PrimitiveRegistry;
  private validator: ResponsibilityValidator;
  
  // プリミティブ実行（責任分離検証付き）
  async executePrimitive<T extends PrimitiveType>(
    type: T,
    level: HierarchyLevel,
    data: PrimitiveData<T>
  ): Promise<PrimitiveResult<T>> {
    
    // 責任分離違反チェック
    const validation = this.validator.validateResponsibility(type, level);
    if (!validation.isValid) {
      throw new ResponsibilityViolationError(
        `${level} level cannot execute ${type}: ${validation.reason}`
      );
    }
    
    // レベル別実行
    switch (level) {
      case 'phrase':
        return this.executePhraseLevel(type, data);
      case 'word':
        return this.executeWordLevel(type, data);
      case 'character':
        return this.executeCharacterLevel(type, data);
    }
  }
  
  // 開発者向け: プリミティブ登録
  registerPrimitive<T extends PrimitiveType>(
    definition: PrimitiveDefinition<T>
  ): void {
    // 責任境界検証
    this.validator.validateBoundaries(definition);
    
    // API一貫性検証
    this.validator.validateAPIConsistency(definition);
    
    // 登録
    this.registry.register(definition);
  }
}
```

**Task 3.2: ResponsibilityValidator実装**

```typescript
// src/renderer/primitives/ResponsibilityValidator.ts
export class ResponsibilityValidator {
  private readonly rules: ResponsibilityRules = {
    phrase: {
      allowed: [
        'OVERALL_POSITIONING',
        'FADE_IN_OUT',
        'GROUP_MOVEMENT',
        'PHRASE_EFFECTS'
      ],
      forbidden: [
        'TEXT_RENDERING',        // 絶対禁止
        'CHARACTER_ANIMATION',   // 絶対禁止
        'INDIVIDUAL_WORD_CONTROL'
      ]
    },
    word: {
      allowed: [
        'WORD_POSITIONING',
        'CHARACTER_MANAGEMENT',
        'WORD_SPACING',
        'WORD_GROUPING'
      ],
      forbidden: [
        'TEXT_RENDERING',        // 絶対禁止
        'PHRASE_LAYOUT',
        'CHARACTER_STYLING'
      ]
    },
    character: {
      allowed: [
        'TEXT_RENDERING',        // ここだけ許可
        'INDIVIDUAL_ANIMATION',
        'CHARACTER_EFFECTS',
        'VISUAL_STYLING'
      ],
      forbidden: [
        'WORD_MANAGEMENT',
        'PHRASE_CONTROL',
        'GLOBAL_POSITIONING'
      ]
    }
  };
  
  validateResponsibility(
    operation: string,
    level: HierarchyLevel
  ): ValidationResult {
    const rules = this.rules[level];
    
    if (rules.forbidden.includes(operation)) {
      return {
        isValid: false,
        reason: `Operation '${operation}' is forbidden at ${level} level`
      };
    }
    
    if (!rules.allowed.includes(operation)) {
      return {
        isValid: false,
        reason: `Operation '${operation}' is not allowed at ${level} level`
      };
    }
    
    return { isValid: true };
  }
}
```

**Task 3.3: 開発者向けヘルパー実装**

```typescript
// src/renderer/primitives/DeveloperHelpers.ts
export class PrimitiveDiscovery {
  // 利用可能なプリミティブ発見
  getAvailablePrimitives(level: HierarchyLevel): PrimitiveInfo[] {
    return this.registry.getPrimitivesForLevel(level).map(p => ({
      name: p.name,
      description: p.description,
      parameters: p.parameters,
      example: p.exampleCode,
      level: level
    }));
  }
  
  // 使用例取得
  getUsageExample(primitiveType: string): string {
    return `
// ${primitiveType} Usage Example
const primitive = primitives.get('${primitiveType}');

// Configure
primitive.configure({
  // parameters here
});

// Execute
const result = await primitive.execute(data, time);

// Cleanup
primitive.cleanup();
    `;
  }
  
  // 責任分離ガイド表示
  showResponsibilityGuide(): void {
    console.log(`
=== Hierarchy Responsibility Guide ===

PHRASE Level (Container Control):
  ✅ Overall positioning
  ✅ Fade in/out
  ✅ Group movement
  ❌ Text rendering (FORBIDDEN)
  ❌ Character animation (FORBIDDEN)

WORD Level (Character Management):
  ✅ Word positioning
  ✅ Character container management
  ✅ Word spacing
  ❌ Text rendering (FORBIDDEN)
  ❌ Phrase control (FORBIDDEN)

CHARACTER Level (Visual Rendering):
  ✅ Text rendering (ONLY HERE)
  ✅ Individual animation
  ✅ Visual effects
  ❌ Word management (FORBIDDEN)
  ❌ Phrase control (FORBIDDEN)
    `);
  }
}
```

#### 成功基準（Week 3）

```typescript
interface Week3SuccessCriteria {
  api: {
    design: 'completed';          // API設計完了
    responsibility: '100%_clear'; // 責任分離100%明確
    consistency: '100%';          // API一貫性100%
  };
  
  developer: {
    understanding: '>90%';        // 理解度90%以上
    documentation: 'complete';    // ドキュメント完成
    examples: 'comprehensive';    // 包括的例
  };
  
  validation: {
    boundaryEnforcement: '100%';  // 境界強制100%
    errorMessages: 'clear';       // エラー明確
    guidance: 'helpful';          // ガイド有用
  };
}
```

### Week 4: 基本プリミティブセット実装

#### 実装タスク

**Task 4.1: フレーズレベルプリミティブ**

```typescript
// src/renderer/primitives/phrase/PhrasePositioningPrimitive.ts
export class PhrasePositioningPrimitive implements IPrimitive {
  execute(data: PhrasePositionData, time: number): PrimitiveResult {
    const container = data.container;
    
    // フレーズ全体の配置（責任：全体制御のみ）
    container.position.set(data.centerX, data.centerY);
    container.pivot.set(
      container.width / 2,
      container.height / 2
    );
    
    // NG例（絶対禁止）:
    // const text = new PIXI.Text(...); // ❌ テキスト作成禁止
    // container.addChild(text);        // ❌ テキスト追加禁止
    
    return { success: true, level: 'phrase' };
  }
}

// src/renderer/primitives/phrase/PhraseFadePrimitive.ts
export class PhraseFadePrimitive implements IPrimitive {
  execute(data: PhraseFadeData, time: number): PrimitiveResult {
    const container = data.container;
    const phase = data.phase;
    
    // フェードイン・アウト（責任：全体エフェクトのみ）
    if (phase === 'in') {
      container.alpha = Math.min(1, (time - data.startTime) / data.duration);
    } else if (phase === 'out') {
      container.alpha = Math.max(0, 1 - ((time - data.startTime) / data.duration));
    }
    
    return { success: true, level: 'phrase' };
  }
}
```

**Task 4.2: ワードレベルプリミティブ**

```typescript
// src/renderer/primitives/word/WordLayoutPrimitive.ts
export class WordLayoutPrimitive implements IPrimitive {
  execute(data: WordLayoutData, time: number): PrimitiveResult {
    const wordContainer = data.container;
    const characters = data.characters;
    
    // 文字コンテナの配置管理（責任：コンテナ管理のみ）
    let currentX = 0;
    characters.forEach((charContainer, index) => {
      charContainer.position.x = currentX;
      currentX += data.characterSpacing;
      
      // NG例（絶対禁止）:
      // const text = new PIXI.Text(char); // ❌ テキスト作成禁止
      // charContainer.addChild(text);     // ❌ テキスト追加禁止
    });
    
    return { success: true, level: 'word' };
  }
}

// src/renderer/primitives/word/WordSpacingPrimitive.ts
export class WordSpacingPrimitive implements IPrimitive {
  execute(data: WordSpacingData, time: number): PrimitiveResult {
    const words = data.words;
    
    // 単語間隔調整（責任：単語配置のみ）
    let currentX = 0;
    words.forEach(wordContainer => {
      wordContainer.position.x = currentX;
      currentX += wordContainer.width + data.spacing;
    });
    
    return { success: true, level: 'word' };
  }
}
```

**Task 4.3: キャラクターレベルプリミティブ**

```typescript
// src/renderer/primitives/character/CharacterRenderingPrimitive.ts
export class CharacterRenderingPrimitive implements IPrimitive {
  execute(data: CharacterRenderData, time: number): PrimitiveResult {
    const container = data.container;
    
    // テキスト描画（責任：唯一テキスト描画可能）
    if (!container.children.length) {
      const text = new PIXI.Text(data.character, {
        fontFamily: data.fontFamily,
        fontSize: data.fontSize,
        fill: data.color
      });
      container.addChild(text); // ✅ ここだけテキスト追加OK
    }
    
    const text = container.children[0] as PIXI.Text;
    text.text = data.character;
    text.style.fill = data.color;
    
    return { success: true, level: 'character' };
  }
}

// src/renderer/primitives/character/CharacterAnimationPrimitive.ts
export class CharacterAnimationPrimitive implements IPrimitive {
  execute(data: CharacterAnimationData, time: number): PrimitiveResult {
    const container = data.container;
    const progress = (time - data.startTime) / data.duration;
    
    // 個別文字アニメーション（責任：個別演出）
    switch (data.animationType) {
      case 'slideIn':
        container.position.y = data.startY + (data.endY - data.startY) * progress;
        container.alpha = progress;
        break;
        
      case 'fadeIn':
        container.alpha = progress;
        break;
        
      case 'scaleIn':
        container.scale.set(progress);
        break;
    }
    
    return { success: true, level: 'character' };
  }
}
```

#### 成功基準（Week 4）

```typescript
interface Week4SuccessCriteria {
  primitives: {
    phrase: ['positioning', 'fade', 'movement'];      // 完成
    word: ['layout', 'spacing', 'grouping'];         // 完成
    character: ['rendering', 'animation', 'effects']; // 完成
  };
  
  performance: {
    executionTime: '<0.1ms';      // 各プリミティブ0.1ms以内
    reusability: '>80%';          // 再利用性80%以上
    codeReduction: '>60%';        // コード量60%削減
  };
  
  quality: {
    responsibilityCompliance: '100%'; // 責任分離100%遵守
    bugRate: '<1%';                  // バグ率1%未満
    testCoverage: '>90%';            // テストカバレッジ90%
  };
}
```

---

## 4. Phase 3: 統合・検証（1週間）

### Week 5: システム統合と品質保証

#### 実装タスク

**Task 5.1: CompatibilityLayer実装**

```typescript
// src/renderer/engine/CompatibilityLayer.ts
export class CompatibilityLayer {
  private converter: HierarchicalDataConverter;
  private validator: IntegrationValidator;
  
  // 既存システムとの橋渡し（最小限）
  async bridgeToHierarchy(instance: AnimationInstance): Promise<HierarchicalData> {
    // データ変換
    const hierarchicalData = this.converter.convert(instance);
    
    // 変換品質検証
    const validation = this.validator.validate(hierarchicalData);
    if (!validation.isValid) {
      throw new ConversionError(validation.errors);
    }
    
    return hierarchicalData;
  }
  
  // 結果適用
  applyResults(instance: AnimationInstance, results: HierarchyResult): void {
    // フレーズ結果適用
    this.applyPhraseResults(instance.phraseContainer, results.phrase);
    
    // ワード結果適用
    results.words.forEach((wordResult, index) => {
      this.applyWordResults(instance.wordContainers[index], wordResult);
    });
    
    // キャラクター結果適用
    results.characters.forEach((charResult, index) => {
      this.applyCharacterResults(instance.charContainers[index], charResult);
    });
  }
}
```

**Task 5.2: 統合テスト実装**

```typescript
// src/test/integration/HierarchicalSystemIntegrationTest.ts
export class IntegrationTest {
  async testMusicSyncAccuracy(): Promise<TestResult> {
    // サブミリ秒同期精度テスト
    const results = [];
    for (let i = 0; i < 1000; i++) {
      const sync = await this.engine.executeWithMusicSync(instance, i * 16.67);
      results.push(sync.syncAccuracy);
    }
    
    const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
    
    return {
      passed: avgAccuracy > 0.999, // 99.9%以上
      accuracy: avgAccuracy,
      details: 'Sub-millisecond sync achieved'
    };
  }
  
  async testFrameRateConsistency(): Promise<TestResult> {
    // 60FPS持続性テスト
    const frameRates = [];
    const startTime = process.hrtime.bigint();
    
    while (Number(process.hrtime.bigint() - startTime) / 1_000_000 < 10000) { // 10秒間
      const fps = this.scheduler.getCurrentFPS();
      frameRates.push(fps);
      await new Promise(resolve => process.nextTick(resolve));
    }
    
    const consistency = frameRates.filter(fps => fps >= 59.5).length / frameRates.length;
    
    return {
      passed: consistency > 0.995, // 99.5%以上
      consistency: consistency,
      details: 'Frame rate consistency verified'
    };
  }
  
  async testResponsibilitySeparation(): Promise<TestResult> {
    // 責任分離違反検出テスト
    const violations = [];
    
    // フレーズレベルでテキスト描画を試みる（違反）
    try {
      await this.primitives.phrase.rendering.execute(data, 0);
      violations.push('Phrase allowed text rendering');
    } catch (e) {
      // 正常（エラーが出るべき）
    }
    
    // ワードレベルでテキスト描画を試みる（違反）
    try {
      await this.primitives.word.rendering.execute(data, 0);
      violations.push('Word allowed text rendering');
    } catch (e) {
      // 正常（エラーが出るべき）
    }
    
    return {
      passed: violations.length === 0,
      violations: violations,
      details: 'Responsibility boundaries enforced'
    };
  }
}
```

**Task 5.3: 最終品質保証**

```typescript
// 品質保証チェックリスト
const finalQualityChecklist = {
  performance: {
    musicSyncAccuracy: {
      target: '>99.9%',
      measurement: 'IntegrationTest.testMusicSyncAccuracy()',
      result: null // 記録する
    },
    
    frameRateConsistency: {
      target: '>99.5%',
      measurement: 'IntegrationTest.testFrameRateConsistency()',
      result: null // 記録する
    },
    
    memoryEfficiency: {
      target: '+30%',
      measurement: 'MemoryManager.getDetailedMemoryReport()',
      result: null // 記録する
    }
  },
  
  quality: {
    visualAccuracy: {
      target: '100%',
      measurement: 'A/B visual comparison',
      result: null // 記録する
    },
    
    responsibilityCompliance: {
      target: '100%',
      measurement: 'IntegrationTest.testResponsibilitySeparation()',
      result: null // 記録する
    },
    
    stabilityScore: {
      target: '>99%',
      measurement: '1時間連続動作テスト',
      result: null // 記録する
    }
  },
  
  developer: {
    apiClarity: {
      target: '>90%',
      measurement: 'Developer survey',
      result: null // 記録する
    },
    
    codeReduction: {
      target: '>60%',
      measurement: 'Lines of code comparison',
      result: null // 記録する
    },
    
    implementationTime: {
      target: '<50%',
      measurement: 'Template implementation timing',
      result: null // 記録する
    }
  }
};
```

#### 成功基準（Week 5）

```typescript
interface Week5SuccessCriteria {
  integration: {
    compatibility: '100%';         // 完全互換
    dataConversion: 'lossless';   // ロスレス変換
    systemStability: 'rock_solid'; // 完全安定
  };
  
  testing: {
    unitTests: '100%_passing';     // 単体テスト全合格
    integrationTests: '100%_passing'; // 統合テスト全合格
    performanceTests: 'all_targets_met'; // 性能目標達成
  };
  
  production: {
    readiness: '100%';            // 本番準備完了
    documentation: 'complete';    // ドキュメント完成
    deployment: 'ready';          // デプロイ準備完了
  };
}
```

---

## 5. 品質ゲートと検証ポイント

### 5.1 デイリーチェック（毎日実施）

```typescript
// 毎日実行するチェック
async function dailyQualityCheck(): Promise<DailyReport> {
  const report = {
    date: new Date().toISOString(),
    checks: {
      // ビルドチェック
      build: await runCommand('npm run build'),
      
      // 型チェック
      typeCheck: await runCommand('npm run typecheck'),
      
      // テスト実行
      tests: await runCommand('npm test'),
      
      // メモリリーク検査
      memoryLeaks: await checkMemoryLeaks(),
      
      // 同期精度測定
      syncAccuracy: await measureSyncAccuracy()
    }
  };
  
  // レポート保存
  saveReport(report);
  
  // 問題があれば即座に対処
  if (report.checks.build.failed || report.checks.tests.failed) {
    throw new Error('Daily check failed - immediate action required');
  }
  
  return report;
}
```

### 5.2 フェーズ完了ゲート

```typescript
// 各フェーズ完了時の品質ゲート
interface PhaseGate {
  phase1: {
    requiredTests: [
      'ElectronNativeTimeManager works',
      'Sync accuracy > 99%',
      'Frame rate >= 60 FPS',
      'Memory efficiency improved'
    ],
    blockingIssues: 'none',
    approval: 'required'
  };
  
  phase2: {
    requiredTests: [
      'All primitives implemented',
      'Responsibility separation 100%',
      'API consistency verified',
      'Developer understanding > 90%'
    ],
    blockingIssues: 'none',
    approval: 'required'
  };
  
  phase3: {
    requiredTests: [
      'Full integration working',
      'All quality targets met',
      'Production readiness confirmed',
      'Documentation complete'
    ],
    blockingIssues: 'none',
    approval: 'required'
  };
}
```

---

## 6. リスク管理と対処法

### 6.1 技術リスク対処

```typescript
interface RiskMitigation {
  syncAccuracyRisk: {
    detection: 'Continuous sync monitoring',
    threshold: 'Deviation > 1ms',
    action: `
      1. Check ElectronNativeTimeManager
      2. Verify process.hrtime.bigint() usage
      3. Ensure no setTimeout/setInterval
      4. Check CPU priority settings
    `
  };
  
  frameRateRisk: {
    detection: 'FPS drops below 55',
    threshold: 'Consistency < 95%',
    action: `
      1. Enable frame budget management
      2. Reduce render quality temporarily
      3. Check for memory leaks
      4. Profile with Chrome DevTools
    `
  };
  
  memoryLeakRisk: {
    detection: 'Heap usage > 80%',
    threshold: 'Growth > 10MB/min',
    action: `
      1. Force manual GC
      2. Check object pools
      3. Review container lifecycle
      4. Use heap snapshots
    `
  };
}
```

### 6.2 開発プロセスリスク対処

```typescript
interface ProcessRiskMitigation {
  scheduleDelay: {
    earlyWarning: 'Daily progress < 80% target',
    action: `
      1. Focus on MVP features only
      2. Defer non-critical optimizations
      3. Request additional resources
      4. Adjust scope if necessary
    `
  };
  
  qualityIssue: {
    earlyWarning: 'Test failures > 5%',
    action: `
      1. Stop new development
      2. Focus on fixing issues
      3. Add more test coverage
      4. Review with senior engineer
    `
  };
}
```

---

## 7. 成功確認基準

### 7.1 最終成功基準

```typescript
interface FinalSuccessCriteria {
  // 必須達成項目（すべて必須）
  mandatory: {
    musicSyncAccuracy: '>99.9%',      // サブミリ秒精度
    frameRateConsistency: '>99.5%',   // 60FPS維持
    responsibilitySeparation: '100%',  // 完全分離
    visualAccuracy: '100%',            // 視覚一致
    systemStability: '0 crashes',      // クラッシュゼロ
    memoryEfficiency: '+30%'          // 効率向上
  };
  
  // 目標達成項目（80%以上達成）
  targets: {
    developerUnderstanding: '>90%',   // 理解度
    codeReduction: '>60%',           // コード削減
    implementationSpeed: '2x faster',  // 実装速度
    testCoverage: '>90%',             // テスト網羅
    documentation: '>95% complete'     // ドキュメント
  };
  
  // ボーナス項目（あれば良い）
  bonus: {
    syncAccuracy: '>99.95%',          // 超高精度
    frameRate: 'consistent 120FPS',   // 120FPS対応
    memoryUsage: '<50% baseline'      // メモリ半減
  };
}
```

### 7.2 本番展開チェックリスト

```typescript
// 本番展開前の最終チェック
const productionReadinessChecklist = {
  code: {
    legacyCodeRemoved: true,         // レガシー完全除去
    electronNativeOnly: true,        // ネイティブのみ
    responsibilitySeparated: true,   // 責任分離完了
    allTestsPassing: true            // テスト全合格
  },
  
  performance: {
    musicSyncVerified: true,         // 同期検証済み
    frameRateStable: true,          // FPS安定
    memoryOptimized: true,          // メモリ最適化
    cpuEfficient: true              // CPU効率的
  },
  
  quality: {
    visuallyAccurate: true,         // 視覚的正確
    functionallyComplete: true,     // 機能完全
    bugFree: true,                  // バグなし
    documented: true                 // 文書化完了
  },
  
  deployment: {
    buildSuccessful: true,          // ビルド成功
    packagingComplete: true,        // パッケージ完了
    installationTested: true,       // インストールテスト
    rollbackPlanReady: true         // ロールバック準備
  }
};
```

---

## 8. 開発開始アクション

### 8.1 即座実行（Day 1）

```bash
# 1. dev4ブランチ確認
git checkout dev4
git pull origin dev4

# 2. 依存関係更新
npm install

# 3. 開発環境確認
npm run dev # 動作確認

# 4. Electronネイティブ環境確認
node -e "console.log(process.hrtime.bigint())" # ナノ秒精度確認

# 5. 初期ファイル作成
mkdir -p src/renderer/engine/native
touch src/renderer/engine/native/ElectronNativePrecisionTimeManager.ts
touch src/renderer/engine/native/ElectronNativeFrameScheduler.ts
touch src/renderer/engine/native/ElectronNativeMemoryManager.ts
```

### 8.2 Week 1 開始タスク

```typescript
// Day 1-2: ElectronNativePrecisionTimeManager実装
// Day 3-4: CoreSynchronizationEngine基盤実装
// Day 5: レガシーコード除去開始
// Day 6-7: 統合テスト・調整

// 必須成果物（Week 1終了時）
const week1Deliverables = [
  'ElectronNativePrecisionTimeManager.ts',
  'CoreSynchronizationEngine.ts',
  'Legacy code removal > 50%',
  'Sync accuracy test passing',
  'Basic integration working'
];
```

---

## 9. 注意事項と禁止事項

### 9.1 絶対禁止事項

```typescript
// ❌ 絶対に行ってはいけないこと
const FORBIDDEN = {
  // 1. ブラウザAPIの使用
  'window.AudioContext': 'Use ElectronNative instead',
  'requestAnimationFrame': 'Use process.nextTick',
  'setTimeout/setInterval': 'Use process.nextTick',
  
  // 2. 責任分離違反
  'Phrase rendering text': 'Only Character can render',
  'Word rendering text': 'Only Character can render',
  'Character managing words': 'Only Word can manage',
  
  // 3. 複雑化
  'Adding security features': 'Not in scope',
  'Complex monitoring': 'Keep it simple',
  'Over-engineering': 'Focus on core value'
};
```

### 9.2 推奨事項

```typescript
// ✅ 常に心がけること
const RECOMMENDED = {
  // 1. シンプルさ優先
  'Keep it simple': 'Complexity is the enemy',
  'Focus on core': 'Music sync + 60FPS + Clear API',
  'Avoid premature optimization': 'Profile first',
  
  // 2. 品質重視
  'Test continuously': 'Daily quality checks',
  'Measure everything': 'Data-driven decisions',
  'Document clearly': 'Future self will thank you',
  
  // 3. Electronネイティブ活用
  'Use process.hrtime.bigint()': 'Nanosecond precision',
  'Use process.nextTick()': 'Maximum priority',
  'Use process.memoryUsage()': 'Detailed metrics'
};
```

---

## 10. 連絡・エスカレーション

### 10.1 進捗報告

```typescript
// 日次報告フォーマット
interface DailyReport {
  date: string;
  completedTasks: string[];
  blockers: string[];
  nextDayPlan: string[];
  metrics: {
    syncAccuracy: number;
    frameRate: number;
    testsPass: boolean;
  };
}
```

### 10.2 問題エスカレーション

```typescript
// エスカレーション基準
interface EscalationCriteria {
  immediate: [
    'Sync accuracy < 95%',
    'Frame rate < 50 FPS',
    'Memory leak detected',
    'Build broken > 2 hours'
  ];
  
  endOfDay: [
    'Daily target not met',
    'Test failures > 10%',
    'Design questions'
  ];
  
  weekly: [
    'Schedule risk identified',
    'Scope change needed',
    'Resource issues'
  ];
}
```

---

この開発指示書に従い、核心価値に集中した効率的な開発を進めてください。

**成功の鍵**:
1. **Electronネイティブ機能を最大活用**
2. **責任分離を厳格に遵守**
3. **シンプルさを保つ**

質問や不明点があれば、即座にエスカレーションしてください。