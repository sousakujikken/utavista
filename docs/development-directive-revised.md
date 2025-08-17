# 階層分離システム実装 開発指示書（修正版）

**プロジェクト**: UTAVISTA v0.4.3 階層分離システム  
**基盤コミット**: 5f5c9b5 (安定プリミティブシステム)  
**ブランチ**: dev4  
**期間**: 5週間  
**開始日**: 即日開始可能

---

## 1. 開発方針と最重要原則

### 1.1 核心価値への集中（現実的アプローチ）

**最重要機能（この3つのみに集中）**:
1. **音楽との同期**: ミリ秒精度（5ms以内）※現状のレベルで十分
2. **60FPS安定レンダリング**: 現行のPIXI.js活用
3. **明確なプリミティブAPI**: 開発者理解度90%以上

**開発しない機能**:
- 音楽ライブラリの再実装（既存活用）
- ナノ秒精度の時間管理（過剰）
- セキュリティ強化機能
- ユーザー習熟度別UI
- 高度な監視・分析機能

### 1.2 既存ライブラリ活用原則

```typescript
// ✅ 既存の確実に動作しているものを使う
// HTMLAudioElement + currentTime（現状動作中）
// PIXI.js ticker（現状動作中）
// requestAnimationFrame（Electronでも安定）

// ❌ 不要な最適化を避ける
// process.hrtime.bigint() - 過剰な精度
// 独自音楽同期システム - 不要な複雑化
```

### 1.3 責任分離の厳格遵守（変更なし）

```typescript
// 階層別責任（これは重要なので維持）
interface StrictResponsibility {
  phrase: {
    ALLOWED: ['positioning', 'fade', 'group_movement'];
    FORBIDDEN: ['text_rendering', 'character_control'];
  };
  
  word: {
    ALLOWED: ['character_management', 'spacing', 'grouping'];
    FORBIDDEN: ['text_rendering', 'phrase_control'];
  };
  
  character: {
    ALLOWED: ['text_rendering', 'individual_animation', 'effects'];
    FORBIDDEN: ['word_management', 'phrase_control'];
  };
}
```

---

## 2. Phase 1: 核心エンジン実装（2週間）

### Week 1: 音楽同期基盤（既存活用）

#### 実装タスク

**Task 1.1: SimplePrecisionTimeManager実装**

```typescript
// src/renderer/engine/SimplePrecisionTimeManager.ts
// 既存のHTMLAudioElementを活用したシンプルな実装
export class SimplePrecisionTimeManager {
  private audioElement: HTMLAudioElement;
  private startTime: number;
  
  constructor(audioElement: HTMLAudioElement) {
    this.audioElement = audioElement;
    this.startTime = performance.now();
  }
  
  // ミリ秒精度の時間計算（既存の方法で十分）
  calculateFrameTime(musicTime: number): FrameTime {
    const currentAudioTime = this.audioElement.currentTime * 1000; // ms変換
    const systemTime = performance.now() - this.startTime;
    const syncOffset = systemTime - currentAudioTime;
    
    return {
      musicTime: musicTime,
      audioTime: currentAudioTime,
      systemTime: systemTime,
      syncOffset: syncOffset,
      frameNumber: Math.floor(systemTime / 16.67),
      isAccurate: Math.abs(syncOffset) < 5.0 // 5ms以内で十分
    };
  }
  
  // 同期精度測定（ミリ秒精度）
  measureSyncAccuracy(): SyncAccuracy {
    const currentAudioTime = this.audioElement.currentTime * 1000;
    const systemTime = performance.now() - this.startTime;
    const deviation = Math.abs(systemTime - currentAudioTime);
    
    return {
      deviation: deviation,
      accuracy: Math.max(0, 1 - (deviation / 5.0)), // 5ms基準
      isAcceptable: deviation < 5.0 // 5ms以内
    };
  }
}
```

**Task 1.2: CoreSynchronizationEngine基盤実装**

```typescript
// src/renderer/engine/CoreSynchronizationEngine.ts
export class CoreSynchronizationEngine {
  private timeManager: SimplePrecisionTimeManager;
  private renderingPipeline: RenderingPipeline;
  
  async executeWithMusicSync(
    instance: AnimationInstance,
    musicTime: number
  ): Promise<SyncResult> {
    // 1. 時間計算（既存方式）
    const frameTime = this.timeManager.calculateFrameTime(musicTime);
    
    // 2. 階層処理実行
    const hierarchyResult = await this.processHierarchy(instance, frameTime);
    
    // 3. レンダリング実行（PIXI.js活用）
    const renderResult = this.renderingPipeline.render(hierarchyResult);
    
    return {
      success: renderResult.success,
      syncAccuracy: this.timeManager.measureSyncAccuracy(),
      frameRate: this.getCurrentFPS(),
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
  
  // シンプルなFPS計測（既存方式）
  private getCurrentFPS(): number {
    // PIXI.Ticker.shared.FPSを使用
    return PIXI.Ticker.shared.FPS;
  }
}
```

**Task 1.3: 既存システムとの互換性確保**

```typescript
// 既存のAnimationInstanceとの統合
export class HierarchicalIntegration {
  // 既存のupdateメソッドをラップ
  wrapAnimationInstance(instance: AnimationInstance): void {
    const originalUpdate = instance.update.bind(instance);
    
    instance.update = async (musicTime: number) => {
      // 階層処理を挿入
      const result = await this.engine.executeWithMusicSync(instance, musicTime);
      
      // 既存処理も実行（互換性維持）
      if (!result.success) {
        return originalUpdate(musicTime);
      }
    };
  }
}
```

#### 成功基準（Week 1）

```typescript
interface Week1SuccessCriteria {
  implementation: {
    timeManager: 'completed';     // ミリ秒精度時間管理
    coreEngine: 'basic_working';  // 基本動作確認
    compatibility: '100%';        // 既存システム互換
  };
  
  performance: {
    syncAccuracy: '>95%';         // 5ms以内同期（現実的）
    frameRate: '60FPS';           // 標準60FPS
    stabilityTest: 'passed';      // 安定性テスト合格
  };
  
  testing: {
    unitTests: 'all_passing';     
    integrationTest: 'basic';     
    manualVerification: 'done';   
  };
}
```

### Week 2: レンダリング保証（PIXI.js活用）

#### 実装タスク

**Task 2.1: SimpleFrameScheduler実装**

```typescript
// src/renderer/engine/SimpleFrameScheduler.ts
// PIXI.jsのTickerを活用したシンプルな実装
export class SimpleFrameScheduler {
  private ticker: PIXI.Ticker;
  private frameCounter = 0;
  private readonly FRAME_BUDGET_MS = 14; // 16.67msの85%
  
  constructor() {
    this.ticker = PIXI.Ticker.shared;
    this.ticker.maxFPS = 60;
  }
  
  // PIXI.Tickerを使った標準的なフレーム管理
  startFrameLoop(callback: FrameCallback): void {
    this.ticker.add((delta) => {
      this.frameCounter++;
      
      callback({
        frameNumber: this.frameCounter,
        deltaTime: delta * (1000 / 60), // deltaをms変換
        timestamp: performance.now(),
        budget: this.checkFrameBudget()
      });
    });
  }
  
  // フレーム予算チェック（シンプル版）
  checkFrameBudget(): number {
    const elapsed = this.ticker.elapsedMS;
    return Math.max(0, this.FRAME_BUDGET_MS - elapsed);
  }
  
  getCurrentFPS(): number {
    return this.ticker.FPS;
  }
}
```

**Task 2.2: RenderingPipeline実装**

```typescript
// src/renderer/engine/RenderingPipeline.ts
export class RenderingPipeline {
  private scheduler: SimpleFrameScheduler;
  
  render(hierarchyResult: HierarchyResult): RenderResult {
    const startTime = performance.now();
    
    try {
      // フレーム予算チェック
      const budget = this.scheduler.checkFrameBudget();
      if (budget <= 0) {
        // 品質を下げて処理継続
        return this.executeReducedQualityRender(hierarchyResult);
      }
      
      // 階層順レンダリング（責任分離厳守）
      this.renderPhraseLevel(hierarchyResult.phrase);
      this.renderWordLevel(hierarchyResult.words);
      this.renderCharacterLevel(hierarchyResult.characters);
      
      const executionTime = performance.now() - startTime;
      
      return {
        success: true,
        executionTime: executionTime,
        frameRate: this.scheduler.getCurrentFPS(),
        quality: 'normal'
      };
      
    } catch (error) {
      console.error('[Render] Error:', error);
      return {
        success: false,
        executionTime: performance.now() - startTime,
        frameRate: 0,
        quality: 'error'
      };
    }
  }
  
  // 階層別レンダリング（責任分離）
  private renderPhraseLevel(phrase: PhraseResult): void {
    // フレーズ：全体配置とフェードのみ
    phrase.container.position.set(phrase.x, phrase.y);
    phrase.container.alpha = phrase.alpha;
  }
  
  private renderWordLevel(words: WordResult[]): void {
    // ワード：文字コンテナ管理のみ
    words.forEach(word => {
      word.container.position.set(word.relativeX, word.relativeY);
    });
  }
  
  private renderCharacterLevel(characters: CharacterResult[]): void {
    // キャラクター：テキスト描画
    characters.forEach(char => {
      if (!char.text) {
        char.text = new PIXI.Text(char.character, char.style);
        char.container.addChild(char.text);
      }
      char.text.position.set(char.x, char.y);
      char.text.alpha = char.alpha;
    });
  }
}
```

**Task 2.3: SimpleMemoryManager実装**

```typescript
// src/renderer/engine/SimpleMemoryManager.ts  
// 基本的なオブジェクトプール管理
export class SimpleMemoryManager {
  private containerPool: PIXI.Container[] = [];
  private textPool: PIXI.Text[] = [];
  private readonly MAX_POOL_SIZE = 1000;
  
  // オブジェクトプール管理（シンプル版）
  getContainer(): PIXI.Container {
    return this.containerPool.pop() || new PIXI.Container();
  }
  
  releaseContainer(container: PIXI.Container): void {
    if (this.containerPool.length >= this.MAX_POOL_SIZE) {
      container.destroy();
      return;
    }
    
    container.removeChildren();
    container.position.set(0, 0);
    container.scale.set(1, 1);
    container.alpha = 1;
    this.containerPool.push(container);
  }
  
  // 定期的なプール最適化
  optimizePools(): void {
    // プールサイズが大きすぎる場合は削減
    if (this.containerPool.length > this.MAX_POOL_SIZE / 2) {
      const excess = this.containerPool.length - this.MAX_POOL_SIZE / 2;
      const removed = this.containerPool.splice(0, excess);
      removed.forEach(c => c.destroy());
    }
  }
  
  getMemoryStats(): MemoryStats {
    return {
      containerPoolSize: this.containerPool.length,
      textPoolSize: this.textPool.length,
      estimatedMemory: (this.containerPool.length + this.textPool.length) * 1000 // 概算
    };
  }
}
```

#### 成功基準（Week 2）

```typescript
interface Week2SuccessCriteria {
  implementation: {
    frameScheduler: 'completed';   // PIXI.Ticker活用
    renderPipeline: 'completed';   // 階層レンダリング
    memoryManager: 'completed';    // 基本プール管理
  };
  
  performance: {
    frameRate: '60FPS_stable';     // 安定60FPS
    frameDrops: '<1%';            // フレームドロップ1%未満
    renderTime: '<14ms';          // 14ms以内レンダリング
  };
  
  quality: {
    responsibilityCompliance: '100%'; // 責任分離遵守
    visualAccuracy: '100%';           // 視覚的一致性
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
  private registry: Map<string, IPrimitive> = new Map();
  private validator: ResponsibilityValidator;
  
  // プリミティブ実行（責任分離検証付き）
  async executePrimitive(
    type: string,
    level: HierarchyLevel,
    data: any
  ): Promise<PrimitiveResult> {
    
    // 責任分離検証
    if (!this.validator.canExecute(type, level)) {
      throw new Error(`${level} cannot execute ${type}`);
    }
    
    const primitive = this.registry.get(type);
    if (!primitive) {
      throw new Error(`Primitive ${type} not found`);
    }
    
    return primitive.execute(data);
  }
  
  // プリミティブ登録
  registerPrimitive(name: string, primitive: IPrimitive): void {
    this.registry.set(name, primitive);
  }
}
```

**Task 3.2: ResponsibilityValidator実装**

```typescript
// src/renderer/primitives/ResponsibilityValidator.ts
export class ResponsibilityValidator {
  private rules = {
    phrase: {
      allowed: ['positioning', 'fade', 'movement'],
      forbidden: ['text_rendering', 'character_control']
    },
    word: {
      allowed: ['layout', 'spacing', 'grouping'],
      forbidden: ['text_rendering', 'phrase_control']
    },
    character: {
      allowed: ['rendering', 'animation', 'effects'],
      forbidden: ['word_management', 'phrase_control']
    }
  };
  
  canExecute(operation: string, level: HierarchyLevel): boolean {
    const levelRules = this.rules[level];
    
    // 禁止操作チェック
    for (const forbidden of levelRules.forbidden) {
      if (operation.includes(forbidden)) {
        return false;
      }
    }
    
    // 許可操作チェック
    for (const allowed of levelRules.allowed) {
      if (operation.includes(allowed)) {
        return true;
      }
    }
    
    return false;
  }
}
```

#### 成功基準（Week 3）

```typescript
interface Week3SuccessCriteria {
  api: {
    design: 'completed';
    responsibility: '100%_clear';
    consistency: '100%';
  };
  
  developer: {
    understanding: '>90%';
    documentation: 'complete';
  };
}
```

### Week 4: 基本プリミティブセット実装

#### 実装タスク

**Task 4.1: 基本プリミティブ実装**

```typescript
// フレーズレベル
export class PhrasePositioningPrimitive implements IPrimitive {
  execute(data: any): PrimitiveResult {
    const container = data.container;
    container.position.set(data.x, data.y);
    return { success: true };
  }
}

// ワードレベル
export class WordLayoutPrimitive implements IPrimitive {
  execute(data: any): PrimitiveResult {
    // 文字コンテナ配置のみ（テキスト描画しない）
    let x = 0;
    data.characters.forEach(charContainer => {
      charContainer.position.x = x;
      x += data.spacing;
    });
    return { success: true };
  }
}

// キャラクターレベル
export class CharacterRenderingPrimitive implements IPrimitive {
  execute(data: any): PrimitiveResult {
    const container = data.container;
    // ここだけテキスト描画可能
    if (!container.children.length) {
      const text = new PIXI.Text(data.character, data.style);
      container.addChild(text);
    }
    return { success: true };
  }
}
```

#### 成功基準（Week 4）

```typescript
interface Week4SuccessCriteria {
  primitives: {
    basic_set: 'completed';
    responsibility: '100%_compliant';
  };
  
  performance: {
    reusability: '>80%';
    codeReduction: '>50%';
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
  // 既存システムとの橋渡し（最小限）
  async bridgeToHierarchy(instance: AnimationInstance): Promise<HierarchicalData> {
    return {
      phrase: this.extractPhraseData(instance),
      words: this.extractWordData(instance),
      characters: this.extractCharacterData(instance)
    };
  }
  
  applyResults(instance: AnimationInstance, results: HierarchyResult): void {
    // 結果を既存構造に適用
    this.applyToContainers(instance, results);
  }
}
```

**Task 5.2: 統合テスト**

```typescript
// 最終品質確認
const qualityChecklist = {
  musicSync: {
    target: '>95% (5ms以内)',
    method: 'HTMLAudioElement.currentTime'
  },
  frameRate: {
    target: '60FPS stable',
    method: 'PIXI.Ticker'
  },
  responsibility: {
    target: '100% separation',
    verification: 'Manual review'
  }
};
```

#### 成功基準（Week 5）

```typescript
interface Week5SuccessCriteria {
  integration: {
    compatibility: '100%';
    stability: 'production_ready';
  };
  
  quality: {
    all_targets_met: true;
    documentation: 'complete';
  };
}
```

---

## 5. 修正された成功基準

### 5.1 現実的な目標

```typescript
interface RealisticSuccessCriteria {
  // 必須達成項目
  mandatory: {
    musicSyncAccuracy: '>95%',        // 5ms以内（現実的）
    frameRate: '60FPS',               // 標準60FPS
    responsibilitySeparation: '100%', // 責任分離
    visualAccuracy: '100%',           // 視覚一致
    systemStability: '0 crashes'      // 安定性
  };
  
  // 目標項目
  targets: {
    developerUnderstanding: '>90%',
    codeReduction: '>50%',           // 現実的な削減率
    implementationSpeed: '1.5x',      // 現実的な改善
    testCoverage: '>80%'              // 現実的なカバレッジ
  };
}
```

### 5.2 使用する既存ライブラリ

```typescript
// 確実に動作している既存ライブラリを活用
const existingLibraries = {
  audio: 'HTMLAudioElement',        // 既存の音楽再生
  timing: 'performance.now()',      // 標準的な時間管理
  rendering: 'PIXI.js',            // 既存のレンダリング
  animation: 'PIXI.Ticker'         // 既存のフレーム管理
};

// 新規開発を避ける
const avoidNewDevelopment = [
  'Custom audio library',
  'Nanosecond precision timing',
  'Custom rendering engine',
  'Complex optimization'
];
```

---

## 6. リスク管理（簡素化）

### 6.1 シンプルなリスク対処

```typescript
interface SimplifiedRiskManagement {
  syncIssue: {
    detection: 'Deviation > 10ms',
    action: 'Check HTMLAudioElement.currentTime'
  };
  
  frameDrops: {
    detection: 'FPS < 55',
    action: 'Reduce rendering quality temporarily'
  };
  
  memoryLeak: {
    detection: 'Pool size > 2000',
    action: 'Clear excess objects'
  };
}
```

---

## 7. 開発開始アクション（簡素化）

### 7.1 即座実行（Day 1）

```bash
# 1. ブランチ確認
git checkout dev4

# 2. 必要最小限のファイル作成
mkdir -p src/renderer/engine
touch src/renderer/engine/SimplePrecisionTimeManager.ts
touch src/renderer/engine/CoreSynchronizationEngine.ts
touch src/renderer/engine/RenderingPipeline.ts

# 3. 既存システムの動作確認
npm run dev
```

### 7.2 Week 1 タスク

```typescript
// シンプルな実装から開始
// Day 1-2: SimplePrecisionTimeManager（既存活用）
// Day 3-4: CoreSynchronizationEngine基盤
// Day 5-7: 統合テスト

// 複雑化を避ける
const avoidComplexity = [
  'Over-optimization',
  'Custom libraries',
  'Excessive precision',
  'Feature creep'
];
```

---

## 8. 注意事項（修正版）

### 8.1 推奨事項

```typescript
// ✅ 推奨
const RECOMMENDED = {
  'Use existing libraries': 'HTMLAudioElement, PIXI.js',
  'Keep it simple': 'Avoid over-engineering',
  'Focus on core': 'Sync + FPS + API clarity',
  'Test with real scenarios': 'Not synthetic benchmarks'
};
```

### 8.2 避けるべきこと

```typescript
// ❌ 避ける
const AVOID = {
  'Custom audio library': 'Use HTMLAudioElement',
  'Nanosecond precision': 'Millisecond is enough',
  'Complex optimization': 'Profile first',
  'Feature creep': 'Stick to core features'
};
```

---

この修正版開発指示書により、**現実的で実装可能な**階層分離システムを構築します。

**キーポイント**:
1. **既存ライブラリ活用**（HTMLAudioElement、PIXI.js）
2. **ミリ秒精度で十分**（5ms以内同期）
3. **責任分離に集中**（これが最重要）
4. **シンプルさ優先**（過度な最適化を避ける）

質問や不明点があれば、お知らせください。