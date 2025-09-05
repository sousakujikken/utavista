# タイムスタンプベース状態管理システム - 基本設計書

## 1. 概要

### 1.1 背景と課題

現在のUTAVISTAシステムでは、アニメーション状態の管理が各テンプレートに分散しており、以下の問題が発生している：

- **状態の不整合**: シーク操作時に各テンプレートが異なる方法で状態をリセット
- **メモリリーク**: 状態が適切にクリーンアップされない
- **保守性の低下**: 状態管理ロジックが分散し、デバッグが困難
- **予測不可能な動作**: 同じ時刻でも前の状態に依存して異なる描画結果

### 1.2 解決方針

純粋な時間ベースの状態管理システムを導入し、以下を実現する：

- **状態の一元管理**: StateManagerによる集中管理
- **純粋関数化**: テンプレートを状態を持たない純粋関数として実装
- **決定論的動作**: 任意の時刻において常に同じ状態を再現

## 2. アーキテクチャ設計

### 2.1 システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                          Engine                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  時刻管理 (currentTime)                              │   │
│  │  update(timestamp) → 全体制御                        │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                      StateManager                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  状態計算 (純粋関数)                                 │   │
│  │  - getObjectState(id, timestamp)                    │   │
│  │  - getEffectState(id, type, timestamp)              │   │
│  │  - getAnimationPhase(id, timestamp)                 │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │ RenderState
                ▼
┌─────────────────────────────────────────────────────────────┐
│                    InstanceManager                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  インスタンス管理                                    │   │
│  │  render(objectId, state, timestamp)                 │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                 Stateless Templates                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  純粋な描画関数                                      │   │
│  │  renderAtTime(container, state, params, timestamp)  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 データフロー

```
1. Engine.update(timestamp)
   ↓
2. StateManager.getObjectState(id, timestamp)
   ↓
3. StateCalculator.calculatePhase(timestamp, timeRange)
   ↓
4. RenderState構築
   ↓
5. Template.renderAtTime(container, state, params, timestamp)
   ↓
6. PIXI.Container更新
```

## 3. インターフェイス仕様

### 3.1 IStateManager インターフェイス

```typescript
interface IStateManager {
  // オブジェクトの基本状態を取得
  getObjectState(objectId: string, timestamp: number): ObjectState;
  
  // エフェクトの状態を取得
  getEffectState(
    objectId: string, 
    effectType: EffectType, 
    timestamp: number
  ): EffectState;
  
  // アニメーションフェーズを取得
  getAnimationPhase(objectId: string, timestamp: number): AnimationPhase;
  
  // グラフィック要素の状態を取得
  getGraphicsState(
    graphicsId: string, 
    parentId: string, 
    timestamp: number
  ): GraphicsState;
  
  // オブジェクトの時間範囲を登録
  registerObjectTimeRange(objectId: string, timeRange: TimeRange): void;
}
```

### 3.2 状態オブジェクト定義

```typescript
// オブジェクトの基本状態
interface ObjectState {
  id: string;
  visible: boolean;
  phase: AnimationPhase;
  progress: number;        // 0.0-1.0
  exists: boolean;         // オブジェクトが存在すべきか
  hierarchyType: HierarchyType;
  startMs: number;
  endMs: number;
}

// エフェクトの状態
interface EffectState {
  enabled: boolean;
  progress: number;        // 0.0-1.0
  params: Record<string, any>;
  phase: 'entering' | 'active' | 'exiting' | 'inactive';
}

// グラフィック要素の状態
interface GraphicsState {
  visible: boolean;
  opacity: number;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  mask?: {
    type: 'rectangle' | 'custom';
    progress: number;
    bounds?: { x: number; y: number; width: number; height: number; };
  };
}
```

### 3.3 IStatelessTemplate インターフェイス

```typescript
interface IStatelessTemplate {
  // 指定時刻での描画
  renderAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean;
  
  // ビジュアル要素のクリーンアップ
  cleanup(container: PIXI.Container): void;
  
  // パラメータ設定の取得
  getParameterConfig(): ParameterConfig[];
}
```

## 4. 状態計算ロジック

### 4.1 アニメーションフェーズの決定

```typescript
class StateCalculator {
  static calculatePhase(timestamp: number, timeRange: TimeRange): AnimationPhase {
    const { startMs, endMs, headTime, tailTime } = timeRange;
    
    if (timestamp < startMs - headTime) {
      return 'before';  // 表示前
    } else if (timestamp < startMs) {
      return 'in';      // 入場アニメーション中
    } else if (timestamp <= endMs) {
      return 'active';  // アクティブ表示中
    } else if (timestamp <= endMs + tailTime) {
      return 'out';     // 退場アニメーション中
    } else {
      return 'after';   // 表示後
    }
  }
}
```

### 4.2 進行度の計算

```typescript
static calculateProgress(
  timestamp: number,
  startMs: number,
  duration: number
): number {
  if (timestamp < startMs) return 0;
  if (timestamp >= startMs + duration) return 1;
  return (timestamp - startMs) / duration;
}
```

### 4.3 エフェクト状態の計算例

```typescript
static calculateSwipeInState(
  phase: AnimationPhase,
  timestamp: number,
  timeRange: TimeRange
): EffectState {
  if (phase === 'in') {
    const progress = this.calculateProgress(
      timestamp,
      timeRange.startMs - timeRange.headTime,
      timeRange.headTime
    );
    
    return {
      enabled: true,
      progress: progress,
      params: { easedProgress: 1 - Math.pow(1 - progress, 3) },
      phase: 'entering'
    };
  }
  
  return {
    enabled: false,
    progress: 0,
    params: {},
    phase: 'inactive'
  };
}
```

## 5. 実装例

### 5.1 BlackBandMaskTextPrimitive の純粋関数化

```typescript
class BlackBandMaskTextStateless implements IStatelessTemplate {
  renderAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean {
    const { object, effects, graphics } = state;
    
    // フェーズに基づいた処理
    switch (object.phase) {
      case 'before':
        container.visible = false;
        return true;
        
      case 'in':
        // スワイプインアニメーション
        this.renderSwipeIn(container, effects.get('swipeIn'), params);
        break;
        
      case 'active':
        // 通常表示
        this.renderActive(container, params);
        break;
        
      case 'out':
        // スワイプアウトアニメーション
        this.renderSwipeOut(container, effects.get('swipeOut'), params);
        break;
        
      case 'after':
        container.visible = false;
        return true;
    }
    
    return true;
  }
  
  private renderSwipeIn(
    container: PIXI.Container,
    effect: EffectState | undefined,
    params: TemplateParams
  ): void {
    if (!effect || !effect.enabled) return;
    
    // 純粋な描画処理
    const maskWidth = container.width * effect.progress;
    // マスク適用など
  }
}
```

## 6. 移行計画

### 6.1 段階的移行アプローチ

#### Phase 1: 基盤整備（1週間）
- StateManager実装
- StateCalculator実装
- 基本的な単体テスト作成

#### Phase 2: アダプター実装（3日）
- TemplateAdapter実装
- 既存テンプレートの動作確認
- 互換性テスト

#### Phase 3: パイロット実装（1週間）
- BlackBandMaskTextPrimitiveの純粋関数化
- 性能測定と最適化
- バグ修正

#### Phase 4: 全体移行（2週間）
- 残りのテンプレートの移行
- 統合テスト
- ドキュメント更新

### 6.2 互換性維持戦略

```typescript
class TemplateAdapter implements IStatelessTemplate {
  private legacyTemplate: IAnimationTemplate;
  
  constructor(legacyTemplate: IAnimationTemplate) {
    this.legacyTemplate = legacyTemplate;
  }
  
  renderAtTime(
    container: PIXI.Container,
    state: RenderState,
    params: TemplateParams,
    timestamp: number
  ): boolean {
    // 新形式の状態を旧形式に変換
    const legacyParams = this.convertToLegacyParams(state, params);
    
    // 既存メソッドを呼び出し
    return this.legacyTemplate.animateContainer?.(
      container,
      '',
      legacyParams,
      timestamp,
      state.object.startMs,
      state.object.endMs,
      state.object.hierarchyType,
      state.object.phase
    ) ?? false;
  }
}
```

## 7. パフォーマンス考慮事項

### 7.1 状態計算の最適化

- **キャッシュ戦略**: 同一フレーム内の重複計算を避ける
- **遅延評価**: 必要になるまで状態を計算しない
- **バッチ処理**: 複数オブジェクトの状態をまとめて計算

### 7.2 メモリ管理

- **状態の自動破棄**: 表示範囲外のオブジェクトの状態を破棄
- **WeakMap使用**: 参照が切れた際の自動クリーンアップ
- **オブジェクトプール**: 頻繁に生成・破棄される状態オブジェクトの再利用

## 8. テスト戦略

### 8.1 単体テスト

```typescript
describe('StateCalculator', () => {
  it('should calculate correct phase for given timestamp', () => {
    const timeRange = {
      startMs: 1000,
      endMs: 2000,
      headTime: 200,
      tailTime: 300
    };
    
    expect(StateCalculator.calculatePhase(500, timeRange)).toBe('before');
    expect(StateCalculator.calculatePhase(900, timeRange)).toBe('in');
    expect(StateCalculator.calculatePhase(1500, timeRange)).toBe('active');
    expect(StateCalculator.calculatePhase(2100, timeRange)).toBe('out');
    expect(StateCalculator.calculatePhase(2500, timeRange)).toBe('after');
  });
});
```

### 8.2 統合テスト

- シーク操作時の状態一貫性テスト
- 複数オブジェクトの同期テスト
- パフォーマンステスト（1000オブジェクト同時更新）

## 9. リスクと対策

### 9.1 リスク分析

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|----------|------|
| 既存テンプレートの動作不良 | 高 | 中 | TemplateAdapterによる互換性維持 |
| パフォーマンス劣化 | 高 | 低 | キャッシュとバッチ処理の実装 |
| 移行期間の長期化 | 中 | 中 | 段階的移行と並行運用 |

### 9.2 ロールバック計画

- Gitブランチによるバージョン管理
- フィーチャーフラグによる新旧システムの切り替え
- 問題発生時の即座のロールバック手順書作成

## 10. 成功指標

### 10.1 定量的指標

- **シーク応答時間**: 100ms以内
- **メモリ使用量**: 既存システム比20%削減
- **描画FPS**: 60FPS維持（1000オブジェクト表示時）

### 10.2 定性的指標

- シーク時の視覚的な不整合の解消
- デバッグ時間の50%削減
- 新機能追加時の開発時間30%削減

## 11. 今後の拡張性

### 11.1 将来的な機能追加

- **リアルタイムコラボレーション**: 状態同期の容易化
- **アンドゥ/リドゥ**: 任意時点の状態再現
- **パフォーマンスプロファイリング**: 状態計算のボトルネック分析

### 11.2 他システムとの連携

- **エクスポート機能**: 決定論的な状態により一貫した出力
- **プラグインシステム**: 標準化された状態インターフェイス
- **WebWorker対応**: 状態計算の並列化

## 12. 用語集

| 用語 | 定義 |
|------|------|
| StateManager | オブジェクトの状態を一元管理するコンポーネント |
| RenderState | 描画に必要な全状態を含む統合オブジェクト |
| AnimationPhase | アニメーションの段階（before/in/active/out/after） |
| Stateless Template | 状態を持たない純粋関数型のテンプレート |
| TimeRange | オブジェクトの表示時間範囲とアニメーション時間 |

## 改訂履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|------------|------|----------|--------|
| 1.0.0 | 2025-01-28 | 初版作成 | Claude/User |