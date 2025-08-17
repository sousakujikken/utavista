# 階層分離システム実装 開発指示書（最終統合版）

**バージョン**: 2.0 - Final Integrated Version  
**作成日**: 2025-08-07  
**優先度**: 🔴 実装準備完了  
**期間**: 5週間

---

## 📋 ドキュメント体系と参照関係

### 核心設計ドキュメント

| フェーズ | 実装内容 | 主要参照ドキュメント | 詳細設計書 |
|---------|----------|---------------------|-----------|
| **Phase 1** | 核心エンジン | `core-focused-design-revision.md` | `responsibility-separation-detailed-design.md`<br/>`existing-system-integration-design.md` |
| **Phase 2** | プリミティブAPI | `primitive-responsibility-specification.md` | `responsibility-separation-detailed-design.md` |
| **Phase 3** | 統合・検証 | `revised-implementation-plan.md` | `quality-assurance-design.md` |

### ドキュメント参照マップ

```
development-directive-final.md (このファイル)
├── Phase 1: 核心エンジン実装
│   ├── core-focused-design-revision.md#2.1 - CoreSynchronizationEngine設計
│   ├── responsibility-separation-detailed-design.md#2-4 - 責任分離ルール
│   └── existing-system-integration-design.md#2-3 - 統合方法
│
├── Phase 2: プリミティブAPI
│   ├── primitive-responsibility-specification.md - 責任定義
│   └── responsibility-separation-detailed-design.md#5 - 実装時検証
│
└── Phase 3: 統合・検証
    ├── quality-assurance-design.md#3 - 品質ゲート
    └── revised-implementation-plan.md#3 - 成功基準
```

---

## 1. 開発方針と原則

### 1.1 核心価値（変更不可）

**最重要機能**:
1. **音楽同期**: 95%精度（5ms以内） - HTMLAudioElement活用
2. **60FPS安定**: PIXI.js既存システム活用
3. **責任分離**: 100%遵守（テキスト描画はCharacterのみ）

**活用する既存ライブラリ**:
- HTMLAudioElement（音楽再生）
- PIXI.js + PIXI.Ticker（レンダリング・フレーム管理）
- performance.now()（時間管理）

### 1.2 責任分離の絶対ルール

**参照**: `responsibility-separation-detailed-design.md`

```typescript
// 階層別責任（絶対遵守）
interface HierarchyResponsibility {
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

### Week 1: 音楽同期基盤

**参照**: `core-focused-design-revision.md#2.1`, `existing-system-integration-design.md#2.2`

#### Task 1.1: SimplePrecisionTimeManager実装

**実装ファイル**: `src/renderer/engine/SimplePrecisionTimeManager.ts`

```typescript
// 既存のHTMLAudioElement活用（参照: existing-system-integration-design.md#3.1）
export class SimplePrecisionTimeManager {
  private audioElement: HTMLAudioElement;
  
  constructor(audioElement: HTMLAudioElement) {
    this.audioElement = audioElement;
  }
  
  // ミリ秒精度計算（95%精度目標）
  calculateFrameTime(musicTime: number): FrameTime {
    const currentAudioTime = this.audioElement.currentTime * 1000;
    const systemTime = performance.now();
    const syncOffset = systemTime - currentAudioTime;
    
    return {
      musicTime,
      audioTime: currentAudioTime,
      syncOffset,
      isAccurate: Math.abs(syncOffset) < 5.0 // 5ms以内
    };
  }
  
  // 同期精度測定
  measureSyncAccuracy(): SyncAccuracy {
    // 実装詳細は existing-system-integration-design.md#3.1 参照
  }
}
```

#### Task 1.2: CoreSynchronizationEngine実装

**実装ファイル**: `src/renderer/engine/CoreSynchronizationEngine.ts`  
**参照**: `core-focused-design-revision.md#2.1`

```typescript
export class CoreSynchronizationEngine {
  private timeManager: SimplePrecisionTimeManager;
  private renderingPipeline: RenderingPipeline;
  
  async executeWithMusicSync(
    instance: AnimationInstance,
    musicTime: number
  ): Promise<SyncResult> {
    // 1. 時間計算（既存方式活用）
    const frameTime = this.timeManager.calculateFrameTime(musicTime);
    
    // 2. 階層処理（責任分離厳守）
    const hierarchyResult = await this.processHierarchy(instance, frameTime);
    
    // 3. レンダリング実行
    const renderResult = this.renderingPipeline.render(hierarchyResult);
    
    return {
      success: renderResult.success,
      syncAccuracy: this.timeManager.measureSyncAccuracy(),
      frameRate: PIXI.Ticker.shared.FPS
    };
  }
  
  private async processHierarchy(
    instance: AnimationInstance,
    frameTime: FrameTime
  ): Promise<HierarchyResult> {
    // 責任分離詳細は responsibility-separation-detailed-design.md#2-4 参照
    const phraseResult = await this.processPhraseLevel(instance, frameTime);
    const wordResults = await this.processWordLevel(instance, frameTime);
    const charResults = await this.processCharLevel(instance, frameTime);
    
    return { phrase: phraseResult, words: wordResults, characters: charResults };
  }
}
```

#### Task 1.3: HierarchicalWrapper実装

**実装ファイル**: `src/renderer/engine/HierarchicalWrapper.ts`  
**参照**: `existing-system-integration-design.md#2.2`

```typescript
// 既存システムとの非破壊的統合
export class HierarchicalWrapper {
  private originalInstance: AnimationInstance;
  private hierarchicalEngine: CoreSynchronizationEngine;
  private enabled: boolean = false;
  
  constructor(instance: AnimationInstance) {
    this.originalInstance = instance;
    this.hierarchicalEngine = new CoreSynchronizationEngine();
    this.preserveOriginalMethods(); // 詳細は設計書参照
  }
  
  // 統合詳細は existing-system-integration-design.md#2.2 参照
}
```

#### Week 1 成功基準

**参照**: `quality-assurance-design.md#3.1`

- [ ] 音楽同期精度 >95%達成
- [ ] 基本階層処理動作
- [ ] 既存システムとの互換性100%
- [ ] ResponsibilitySeparationValidator でチェック通過

### Week 2: レンダリング保証

**参照**: `core-focused-design-revision.md#3.2`

#### Task 2.1: SimpleFrameScheduler実装

**実装ファイル**: `src/renderer/engine/SimpleFrameScheduler.ts`

```typescript
// PIXI.Ticker活用（既存システム最大活用）
export class SimpleFrameScheduler {
  private ticker: PIXI.Ticker;
  private readonly FRAME_BUDGET_MS = 14;
  
  constructor() {
    this.ticker = PIXI.Ticker.shared;
    this.ticker.maxFPS = 60;
  }
  
  startFrameLoop(callback: FrameCallback): void {
    this.ticker.add((delta) => {
      callback({
        frameNumber: ++this.frameCounter,
        deltaTime: delta * (1000 / 60),
        budget: this.checkFrameBudget()
      });
    });
  }
  
  checkFrameBudget(): number {
    return Math.max(0, this.FRAME_BUDGET_MS - this.ticker.elapsedMS);
  }
}
```

#### Task 2.2: RenderingPipeline実装

**実装ファイル**: `src/renderer/engine/RenderingPipeline.ts`  
**参照**: `responsibility-separation-detailed-design.md#2-4`

```typescript
export class RenderingPipeline {
  render(hierarchyResult: HierarchyResult): RenderResult {
    try {
      // 責任分離を厳格に遵守したレンダリング
      this.renderPhraseLevel(hierarchyResult.phrase);    // 配置・フェードのみ
      this.renderWordLevel(hierarchyResult.words);        // 文字管理のみ  
      this.renderCharacterLevel(hierarchyResult.characters); // テキスト描画のみ
      
      return { success: true, frameRate: PIXI.Ticker.shared.FPS };
    } catch (error) {
      return this.handleRenderError(error);
    }
  }
  
  private renderPhraseLevel(phrase: PhraseResult): void {
    // ✅ フレーズ：全体制御のみ（responsibility-separation-detailed-design.md#2.1参照）
    phrase.container.position.set(phrase.x, phrase.y);
    phrase.container.alpha = phrase.alpha;
    // ❌ 禁止: phrase.container.addChild(new PIXI.Text(...))
  }
  
  private renderCharacterLevel(characters: CharacterResult[]): void {
    // ✅ キャラクター：唯一テキスト描画可能（responsibility-separation-detailed-design.md#4.1参照）
    characters.forEach(char => {
      if (!char.text) {
        char.text = new PIXI.Text(char.character, char.style); // ここだけOK
        char.container.addChild(char.text);
      }
    });
  }
}
```

#### Week 2 成功基準

**参照**: `quality-assurance-design.md#3.1`

- [ ] 60FPS安定達成
- [ ] フレーム予算管理動作
- [ ] 責任分離100%遵守確認
- [ ] ResponsibilityDebugger で違反なし

---

## 3. Phase 2: プリミティブAPI完成（2週間）

### Week 3: 責任分離API設計

**参照**: `primitive-responsibility-specification.md`, `responsibility-separation-detailed-design.md#5`

#### Task 3.1: PrimitiveAPIManager実装

**実装ファイル**: `src/renderer/primitives/PrimitiveAPIManager.ts`

```typescript
export class PrimitiveAPIManager {
  private registry: Map<string, IPrimitive> = new Map();
  private validator: ResponsibilityValidator;
  
  // 責任分離検証付き実行
  async executePrimitive(
    type: string,
    level: HierarchyLevel,
    data: any
  ): Promise<PrimitiveResult> {
    
    // 責任分離違反チェック（詳細: responsibility-separation-detailed-design.md#5.1）
    const validation = this.validator.validateResponsibility(type, level);
    if (!validation.isValid) {
      throw new ResponsibilityViolationError(validation.reason);
    }
    
    const primitive = this.registry.get(type);
    return primitive.execute(data);
  }
}
```

#### Task 3.2: ResponsibilityValidator実装

**実装ファイル**: `src/renderer/validators/ResponsibilityValidator.ts`  
**参照**: `responsibility-separation-detailed-design.md#5.1`

```typescript
export class ResponsibilityValidator {
  // 実装時検証（詳細設計書の実装そのまま使用）
  static validateImplementation(
    implementation: any,
    level: HierarchyLevel
  ): ValidationResult {
    // responsibility-separation-detailed-design.md#5.1 の実装を使用
  }
  
  static validateAtRuntime(
    container: PIXI.Container,
    level: HierarchyLevel  
  ): RuntimeValidationResult {
    // responsibility-separation-detailed-design.md#5.1 の実装を使用
  }
}
```

#### Week 3 成功基準

**参照**: `quality-assurance-design.md#3.2`

- [ ] 責任分離100%強制
- [ ] API一貫性100%達成
- [ ] ResponsibilityValidator 完全動作

### Week 4: 基本プリミティブセット実装

#### Task 4.1: 階層別プリミティブ実装

**実装ファイル**: `src/renderer/primitives/[level]/`各プリミティブ  
**参照**: `responsibility-separation-detailed-design.md#2-4`

```typescript
// フレーズレベル（参照: responsibility-separation-detailed-design.md#2.1）
export class PhrasePositioningPrimitive implements IPrimitive {
  execute(data: PhrasePositionData): PrimitiveResult {
    // ✅ 許可: 全体配置のみ
    data.container.position.set(data.x, data.y);
    // ❌ 禁止: テキスト作成・個別文字制御
    return { success: true, level: 'phrase' };
  }
}

// ワードレベル（参照: responsibility-separation-detailed-design.md#3.1）  
export class WordLayoutPrimitive implements IPrimitive {
  execute(data: WordLayoutData): PrimitiveResult {
    // ✅ 許可: 文字コンテナ配置のみ
    let x = 0;
    data.characters.forEach(charContainer => {
      charContainer.position.x = x;
      x += data.spacing;
    });
    // ❌ 禁止: テキスト作成・内容変更
    return { success: true, level: 'word' };
  }
}

// キャラクターレベル（参照: responsibility-separation-detailed-design.md#4.1）
export class CharacterRenderingPrimitive implements IPrimitive {
  execute(data: CharacterRenderData): PrimitiveResult {
    // ✅ 許可: テキスト描画（ここだけ）
    if (!data.container.children.length) {
      const text = new PIXI.Text(data.character, data.style);
      data.container.addChild(text); // ここだけOK
    }
    return { success: true, level: 'character' };
  }
}
```

#### Week 4 成功基準

**参照**: `quality-assurance-design.md#3.2`

- [ ] 基本プリミティブセット完成
- [ ] 責任分離100%遵守
- [ ] コード削減 >50%達成

---

## 4. Phase 3: 統合・検証（1週間）

### Week 5: システム統合と品質保証

**参照**: `quality-assurance-design.md#3.3`, `revised-implementation-plan.md`

#### Task 5.1: 最終統合

**実装ファイル**: `src/renderer/engine/CompatibilityLayer.ts`  
**参照**: `existing-system-integration-design.md#4`

```typescript
export class CompatibilityLayer {
  async bridgeToHierarchy(instance: AnimationInstance): Promise<HierarchicalData> {
    // 統合詳細は existing-system-integration-design.md#4 参照
    return this.converter.convert(instance);
  }
  
  applyResults(instance: AnimationInstance, results: HierarchyResult): void {
    // 結果適用詳細は設計書参照
  }
}
```

#### Task 5.2: 品質保証

**参照**: `quality-assurance-design.md#4-5`

```typescript
// 最終品質チェック実行
const qualityTests = [
  // 音楽同期テスト
  'MusicSyncMeasurement.measureAccuracy() > 95%',
  
  // フレームレートテスト
  'FrameRateMeasurement.measureStability() = 60FPS',
  
  // 責任分離テスト
  'ResponsibilityValidator.validateAll() = 100% compliant',
  
  // 統合テスト
  'IntegrationTest.verifyExisting() = 100% compatibility'
];
```

#### Week 5 成功基準

**参照**: `quality-assurance-design.md#3.3`

- [ ] 全品質ゲート通過
- [ ] 1時間安定動作確認
- [ ] 本番準備度100%

---

## 5. 品質ゲート・検証ポイント

### 5.1 継続的品質チェック

**参照**: `quality-assurance-design.md#5.1`

```bash
# 毎日実行する品質チェック
npm run test                    # 単体テスト
npm run test:integration        # 統合テスト
npm run validate:responsibility # 責任分離チェック
npm run measure:performance     # パフォーマンス測定
```

### 5.2 Phase別品質ゲート

| Phase | 必須条件 | 測定方法 | ブロッカー |
|-------|----------|----------|-----------|
| 1 | 音楽同期 >95%, 60FPS | `MusicSyncTest`, `PerformanceTest` | Yes |
| 2 | 責任分離100%, API一貫性100% | `ResponsibilityValidator`, `APITest` | Yes |
| 3 | 全品質基準達成, 安定性確認 | 包括的テストスイート | Yes |

---

## 6. エラーハンドリング・フォールバック

### 6.1 段階的フォールバック

**参照**: `existing-system-integration-design.md#6.1`

```typescript
// エラー時の自動フォールバック
try {
  // 階層システムで実行
  result = await hierarchicalEngine.execute(instance, musicTime);
} catch (error) {
  console.warn('[Fallback] Using original system:', error);
  // 既存システムで実行
  result = originalInstance.update(musicTime);
}
```

---

## 7. 開発開始アクション

### 7.1 即座実行（Day 1）

```bash
# 1. ブランチ確認・準備
git checkout dev4
npm install

# 2. 必要ファイル作成
mkdir -p src/renderer/engine src/renderer/primitives src/renderer/validators
touch src/renderer/engine/SimplePrecisionTimeManager.ts
touch src/renderer/engine/CoreSynchronizationEngine.ts
touch src/renderer/engine/HierarchicalWrapper.ts

# 3. 責任分離チェックツール準備
touch src/renderer/validators/ResponsibilityValidator.ts
```

### 7.2 Week 1-5 実装順序

```typescript
// Week 1: 音楽同期基盤
Day 1-2: SimplePrecisionTimeManager
Day 3-4: CoreSynchronizationEngine  
Day 5-7: HierarchicalWrapper + テスト

// Week 2: レンダリング
Day 8-9: SimpleFrameScheduler
Day 10-12: RenderingPipeline
Day 13-14: 統合テスト

// Week 3: API設計
Day 15-17: PrimitiveAPIManager
Day 18-21: ResponsibilityValidator

// Week 4: プリミティブ実装
Day 22-28: 基本プリミティブセット

// Week 5: 最終統合
Day 29-35: 品質保証・統合テスト
```

---

## 8. 注意事項・禁止事項

### 8.1 絶対禁止

```typescript
// ❌ 絶対にやってはいけないこと
const FORBIDDEN = {
  // 責任分離違反
  'Phrase/Word でテキスト描画': 'Only Character can render text',
  'Character で上位レベル制御': 'No upward control allowed',
  
  // 既存システム破壊
  'AnimationInstance 直接変更': 'Use wrapper pattern',
  'PIXI.js API 変更': 'Use existing APIs',
  
  // 過剰最適化
  'ナノ秒精度追求': 'ミリ秒で十分',
  '独自音楽ライブラリ': 'HTMLAudioElement使用'
};
```

### 8.2 推奨事項

```typescript
// ✅ 常に心がけること
const RECOMMENDED = {
  // 設計書参照
  '実装前に設計書確認': '必ず対応する設計書を参照',
  'ResponsibilityValidator使用': '責任分離チェック必須',
  
  // 品質重視  
  '継続的テスト実行': '品質劣化の早期発見',
  '既存機能確認': '互換性維持確認',
  
  // シンプル重視
  '既存ライブラリ活用': '車輪の再発明を避ける',
  'ミリ秒精度で十分': '過度な最適化を避ける'
};
```

---

## 9. 最終成功基準

### 9.1 必須達成項目

**参照**: `quality-assurance-design.md#8.1`

```typescript
interface FinalSuccessCriteria {
  mandatory: {
    musicSyncAccuracy: '>95%';        // 5ms以内同期
    frameRateStability: '60FPS';      // 安定動作
    responsibilitySeparation: '100%'; // 完全分離
    visualAccuracy: '100%';           // 視覚一致
    systemStability: '0 crashes';     // 安定性
    existingCompatibility: '100%';    // 互換性
  };
}
```

### 9.2 本番準備チェックリスト

```markdown
## 本番展開前 最終確認

### コード品質
- [ ] 全テスト合格
- [ ] 責任分離100%遵守
- [ ] エラーハンドリング完備
- [ ] フォールバック動作確認

### パフォーマンス
- [ ] 音楽同期 >95%
- [ ] 60FPS安定動作
- [ ] メモリリークなし
- [ ] 1時間安定動作

### 統合品質
- [ ] 既存機能100%互換
- [ ] 新機能仕様通り動作
- [ ] ドキュメント完成
- [ ] 運用手順確立
```

---

この開発指示書は、すべての詳細設計書と整合性を保ち、確実な実装を可能にします。

**成功の鍵**:
1. **設計書の厳格な遵守**
2. **責任分離の100%徹底**  
3. **既存システムとの完全互換**
4. **継続的な品質確認**

設計の不整合は解消され、実装準備が完了しました。