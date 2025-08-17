# 文字重複表示不具合防止ガイド

## 概要

WordSlideTextLLM実装で発生した文字重複表示不具合の分析と、今後同様の問題を防止するための実装ガイド・インターフェイス仕様改善を提案する。

## 不具合の根本原因分析

### 発生した問題
- **症状**: 単語内の文字が最初の位置と正しい位置の両方に表示される
- **原因**: 二重の文字コンテナ作成メカニズム

### 技術的な原因

#### 1. プリミティブによる自動文字コンテナ作成
```typescript
// 問題のあったコード
layoutPrimitive.manageCharacterContainers(
  container,
  text,  // "こんにちは" → char_0, char_1, char_2, char_3, char_4
  params,
  callback
);
```

#### 2. 既存システムによる文字コンテナ作成
```typescript
// 同時に実行されていたコード
(params.chars as any[]).forEach((charData, index) => {
  // char_container_${charData.id} → 別のIDスキーム
  const charContainer = new PIXI.Container();
  charContainer.name = `char_container_${charData.id}`;
});
```

### 階層責任分担の曖昧性

| 階層 | 本来の責任 | 問題の実装 | 正しい実装 |
|------|------------|------------|------------|
| フレーズ | エフェクト・位置制御 | ✅ 正常 | ✅ 正常 |
| 単語 | 文字配置・スライド制御 | ❌ 二重作成 | ✅ 単一管理 |
| 文字 | テキスト描画 | ✅ 正常 | ✅ 正常 |

## 防止策の提案

### 1. インターフェイス仕様の改善

#### A. 文字コンテナ管理の明確化

```typescript
/**
 * 改善されたCumulativeLayoutPrimitive
 * 文字コンテナの重複作成を防止
 */
export interface ImprovedCumulativeLayoutPrimitive {
  /**
   * レイアウト計算のみ実行（コンテナ作成はしない）
   * @param items レイアウト対象アイテム
   * @param params レイアウトパラメータ
   * @returns 位置情報のみ
   */
  calculateLayoutOnly(
    items: LayoutItem[],
    params: CumulativeLayoutParams
  ): LayoutResult[];
  
  /**
   * 既存コンテナにレイアウトを適用
   * @param existingContainers 既存の文字コンテナ配列
   * @param layoutResults 計算済みレイアウト結果
   */
  applyLayoutToExistingContainers(
    existingContainers: PIXI.Container[],
    layoutResults: LayoutResult[]
  ): void;
  
  /**
   * ⚠️ 非推奨: 自動コンテナ作成は使用禁止
   * @deprecated 文字コンテナの重複作成を防ぐため使用禁止
   */
  manageCharacterContainers?: never;
}
```

#### B. 文字管理モードの分離

```typescript
export enum CharacterManagementMode {
  /** プリミティブが自動管理（新規テンプレート用） */
  PRIMITIVE_MANAGED = 'primitive_managed',
  
  /** 既存システムとの協調（LLM版・移行期用） */
  COOPERATIVE = 'cooperative',
  
  /** 完全にマニュアル管理（オリジナル互換） */
  MANUAL = 'manual'
}

export interface CharacterManagementConfig {
  mode: CharacterManagementMode;
  existingContainerPrefix?: string;  // 'char_container_'
  containerNamingScheme?: (id: string) => string;
}
```

### 2. 実装ガイドラインの策定

#### A. 文字コンテナ管理のベストプラクティス

```typescript
/**
 * ✅ 推奨: 単一責任による文字管理
 */
class SafeWordContainer {
  private characterContainers: Map<string, PIXI.Container> = new Map();
  
  manageCharacters(params: {
    chars: CharacterData[];
    layoutParams: LayoutParams;
    primitives: {
      layout: CumulativeLayoutPrimitive;
    };
  }): void {
    // 1. レイアウト計算のみプリミティブ使用
    const layoutResults = params.primitives.layout.calculateLayoutOnly(
      params.chars.map(char => ({
        id: char.id,
        content: char.char,
        size: { width: char.fontSize, height: char.fontSize }
      })),
      params.layoutParams
    );
    
    // 2. 既存コンテナベースで単一管理
    params.chars.forEach((charData, index) => {
      const containerId = charData.id;
      
      // 既存コンテナ検索
      let container = this.characterContainers.get(containerId);
      
      // 新規作成（必要時のみ）
      if (!container) {
        container = this.createCharacterContainer(containerId);
        this.characterContainers.set(containerId, container);
      }
      
      // レイアウト適用
      const layout = layoutResults[index];
      container.position.set(layout.position.x, layout.position.y);
    });
  }
  
  private createCharacterContainer(id: string): PIXI.Container {
    const container = new PIXI.Container();
    container.name = `char_container_${id}`;
    this.wordContainer.addChild(container);
    return container;
  }
}
```

#### B. プリミティブ使用の安全ガイド

```typescript
/**
 * プリミティブ使用安全チェックリスト
 */
export class PrimitiveSafetyChecker {
  static validateCharacterManagement(
    template: IAnimationTemplate,
    primitiveUsage: PrimitiveUsageMap
  ): SafetyReport {
    const issues: string[] = [];
    
    // 1. 文字コンテナ重複作成チェック
    if (primitiveUsage.hasCharacterContainerCreation && 
        template.hasExistingCharacterManagement) {
      issues.push('文字コンテナの重複作成リスク');
    }
    
    // 2. 命名規則衝突チェック
    const primitiveNaming = primitiveUsage.containerNamingPatterns;
    const templateNaming = template.containerNamingPatterns;
    
    if (hasNamingConflict(primitiveNaming, templateNaming)) {
      issues.push('コンテナ命名規則の衝突');
    }
    
    // 3. 階層責任分担チェック
    if (primitiveUsage.hierarchyLevels.includes('char') &&
        template.hierarchyLevels.includes('char')) {
      issues.push('文字レベル処理の重複');
    }
    
    return {
      safe: issues.length === 0,
      issues,
      recommendations: this.generateRecommendations(issues)
    };
  }
}
```

### 3. 開発時の検証メカニズム

#### A. 実行時警告システム

```typescript
/**
 * 開発時の文字重複検出
 */
export class CharacterOverlapDetector {
  private static enabledInDevelopment = process.env.NODE_ENV === 'development';
  
  static detectDuplicateContainers(wordContainer: PIXI.Container): void {
    if (!this.enabledInDevelopment) return;
    
    const containerNames = new Set<string>();
    const duplicates: string[] = [];
    
    wordContainer.children.forEach(child => {
      if (child instanceof PIXI.Container && (child as any).name) {
        const name = (child as any).name;
        
        if (containerNames.has(name)) {
          duplicates.push(name);
        } else {
          containerNames.add(name);
        }
      }
    });
    
    if (duplicates.length > 0) {
      console.error('🚨 文字コンテナ重複検出:', duplicates);
      console.warn('💡 修正方法: docs/character-overlap-prevention-guide.md を参照');
      
      // 開発時のみ例外をスロー
      throw new Error(`文字コンテナ重複: ${duplicates.join(', ')}`);
    }
  }
  
  static validateCharacterPositions(
    containers: PIXI.Container[],
    expectedPositions: Array<{x: number, y: number}>
  ): void {
    if (!this.enabledInDevelopment) return;
    
    const positionOverlaps: Array<{container1: string, container2: string}> = [];
    
    for (let i = 0; i < containers.length; i++) {
      for (let j = i + 1; j < containers.length; j++) {
        const pos1 = containers[i].position;
        const pos2 = containers[j].position;
        
        if (Math.abs(pos1.x - pos2.x) < 1 && Math.abs(pos1.y - pos2.y) < 1) {
          positionOverlaps.push({
            container1: (containers[i] as any).name,
            container2: (containers[j] as any).name
          });
        }
      }
    }
    
    if (positionOverlaps.length > 0) {
      console.warn('⚠️ 文字位置重複検出:', positionOverlaps);
    }
  }
}
```

#### B. TypeScript型安全性強化

```typescript
/**
 * 型レベルでの安全性確保
 */
export type SafeCharacterManagement<T extends 'primitive' | 'manual'> = 
  T extends 'primitive' 
    ? {
        mode: 'primitive';
        primitiveConfig: PrimitiveCharacterConfig;
        manualContainerManagement?: never;
      }
    : {
        mode: 'manual';
        manualContainerManagement: ManualCharacterConfig;
        primitiveConfig?: never;
      };

export interface PrimitiveCharacterConfig {
  allowContainerCreation: true;
  layoutPrimitive: CumulativeLayoutPrimitive;
  namingScheme: 'auto_generated';
}

export interface ManualCharacterConfig {
  existingContainerSource: 'params.chars';
  layoutCalculation: 'primitive' | 'manual';
  containerCreation: 'manual_only';
}
```

### 4. 段階的移行戦略

#### Phase 1: 安全性確保（現在）
```typescript
// ✅ LLM版の現在の実装（安全）
renderWordContainer() {
  // プリミティブは計算のみ使用
  const layoutCalc = new CumulativeLayoutPrimitive();
  
  // 既存システムで文字管理
  params.chars.forEach(charData => {
    // 単一責任での文字コンテナ管理
  });
}
```

#### Phase 2: 部分プリミティブ化
```typescript
// 🔄 将来の部分プリミティブ実装
renderWordContainer() {
  // 計算はプリミティブ
  const positions = layoutPrimitive.calculateLayoutOnly(items, params);
  
  // 管理は既存システム（安全性保持）
  this.applyPositionsToExistingContainers(positions);
}
```

#### Phase 3: 完全プリミティブ化
```typescript
// 🚀 最終的な完全プリミティブ実装
renderWordContainer() {
  // 完全にプリミティブベース（新規テンプレート用）
  const charManager = new SafeCharacterManager({
    mode: 'primitive',
    primitiveConfig: { /* 設定 */ }
  });
  
  charManager.manage(text, params);
}
```

## 実装チェックリスト

### テンプレート作成時
- [ ] 文字コンテナの作成方法を明確に決定
- [ ] プリミティブと既存システムの責任分担を明確化
- [ ] 開発時検証を有効化
- [ ] 命名規則の一貫性確保

### プリミティブ使用時
- [ ] 計算専用 vs コンテナ管理の区別
- [ ] 既存システムとの協調点の明確化
- [ ] 重複作成の可能性チェック
- [ ] 段階的導入の計画

### コードレビュー時
- [ ] 文字コンテナ作成箇所の特定
- [ ] プリミティブ使用パターンの確認
- [ ] 開発時警告の確認
- [ ] ドキュメント更新の確認

## まとめ

文字重複表示不具合は、プリミティブシステムと既存システムの責任分担が曖昧だったことが原因。以下の改善により防止可能：

1. **インターフェイス改善**: 計算専用メソッドの提供
2. **実装ガイド**: 安全な使用パターンの明示
3. **検証メカニズム**: 開発時の自動検出
4. **段階的移行**: リスクを最小化した導入戦略

これらの改善により、新方式の利点を活かしながら安全性を確保できる。