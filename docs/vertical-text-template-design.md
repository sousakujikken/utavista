# 縦書きテキストテンプレート設計書

## 概要

UTAVISTA v0.4.3 に縦書きテキスト対応機能を追加するための設計書です。現在の横書き前提の設計を拡張し、縦書きレイアウト、句読点位置調整、アルファベット回転機能を実装します。

## 設計目標

1. **基本縦書き対応**: 文字を縦方向に配置する機能
2. **句読点位置調整**: 指定文字の座標オフセット調整機能
3. **アルファベット回転**: 英文字列の90度回転表示機能
4. **既存システムとの互換性**: 横書きテンプレートへの影響を最小限に抑制

## アーキテクチャ

### 1. 拡張対象コンポーネント

#### 1.1 FlexibleCumulativeLayoutPrimitive
- **現状**: 横書き専用の文字配置プリミティブ
- **拡張**: 縦書きモード対応、座標系変換機能追加

#### 1.2 ParameterRegistry
- **拡張**: 縦書き関連パラメータの追加登録

#### 1.3 新規プリミティブ（検討事項）
- `VerticalLayoutPrimitive`: 縦書き専用レイアウトプリミティブ
- `PunctuationAdjustmentPrimitive`: 句読点調整プリミティブ
- `AlphabetRotationPrimitive`: アルファベット回転プリミティブ

## パラメータ設計

### 2.1 基本縦書きパラメータ

```typescript
interface VerticalTextParameters {
  // 書字方向制御
  textDirection: 'horizontal' | 'vertical';  // デフォルト: 'horizontal'
  
  // 縦書きモード時の開始位置
  verticalStartPosition: 'top' | 'center' | 'bottom';  // デフォルト: 'top'
  
  // 縦書きモード時の行方向（右から左 or 左から右）
  verticalLineDirection: 'rtl' | 'ltr';  // デフォルト: 'rtl'
}
```

### 2.2 句読点位置調整パラメータ

```typescript
interface PunctuationAdjustmentParameters {
  // 句読点調整有効/無効
  enablePunctuationAdjustment: boolean;  // デフォルト: false
  
  // 調整対象文字（カンマ区切り）
  punctuationCharacters: string;  // デフォルト: "、。，．"
  
  // 句読点のX座標オフセット
  punctuationOffsetX: number;  // デフォルト: 0, 範囲: -50 to 50
  
  // 句読点のY座標オフセット
  punctuationOffsetY: number;  // デフォルト: 0, 範囲: -50 to 50
}
```

### 2.3 アルファベット回転パラメータ

```typescript
interface AlphabetRotationParameters {
  // アルファベット回転有効/無効
  enableAlphabetRotation: boolean;  // デフォルト: true
  
  // 回転対象とするアルファベット文字のパターン
  alphabetRotationPattern: string;  // デフォルト: "[a-zA-Z0-9]+"
  
  // 回転時の文字間隔比率（横書き時の文字幅ベース）
  alphabetCharSpacingRatio: number;  // デフォルト: 0.8, 範囲: 0.1 to 2.0
}
```

## 文字配置ロジック設計

### 3.1 座標系変換

#### 横書きモード（現在）
```typescript
position.x = cumulativeXOffset  // 文字の横位置（累積）
position.y = lineY              // 行位置
```

#### 縦書きモード（新規）
```typescript
position.x = lineX              // 行位置（右から左）
position.y = cumulativeYOffset  // 文字の縦位置（累積）
```

### 3.2 文字間隔パラメータの意味変更

| パラメータ | 横書きモード | 縦書きモード |
|-----------|-------------|-------------|
| `charSpacing` | 文字の横方向間隔 | 文字の縦方向間隔 |
| `lineHeight` | 行の縦方向間隔 | 行の横方向間隔 |

### 3.3 レイアウト計算アルゴリズム

```typescript
private calculateVerticalLayout(
  characters: FlexibleCharacterData[], 
  params: VerticalLayoutParams
): LayoutResult[] {
  const results: LayoutResult[] = [];
  let cumulativeYOffset = this.getVerticalStartPosition(params);
  const lineX = this.calculateLinePosition(params);
  
  characters.forEach(charData => {
    // 1. 句読点調整チェック
    const punctuationAdjustment = this.getPunctuationAdjustment(charData.char, params);
    
    // 2. アルファベット回転チェック
    const rotationResult = this.getAlphabetRotation(charData.char, params);
    
    // 3. 文字間隔計算（縦書きモード）
    const spacing = this.calculateVerticalSpacing(charData.char, params, rotationResult);
    
    // 4. 位置計算
    results.push({
      id: charData.id,
      position: { 
        x: lineX + punctuationAdjustment.x, 
        y: cumulativeYOffset + punctuationAdjustment.y 
      },
      rotation: rotationResult.angle,
      spacingMode: rotationResult.spacingMode
    });
    
    cumulativeYOffset += spacing;
  });
  
  return results;
}
```

## 句読点位置調整機能

### 4.1 判定ロジック

```typescript
class PunctuationAdjustmentUtil {
  static isPunctuation(char: string, punctuationList: string): boolean {
    return punctuationList.includes(char);
  }
  
  static getPunctuationOffset(
    char: string, 
    params: PunctuationAdjustmentParameters
  ): { x: number; y: number } {
    if (!params.enablePunctuationAdjustment || 
        !this.isPunctuation(char, params.punctuationCharacters)) {
      return { x: 0, y: 0 };
    }
    
    return {
      x: params.punctuationOffsetX || 0,
      y: params.punctuationOffsetY || 0
    };
  }
}
```

### 4.2 縦書きモード固有の調整

縦書きモードでは、句読点を文字の右下に配置するのが一般的です：

```typescript
private getVerticalPunctuationAdjustment(
  char: string, 
  params: VerticalLayoutParams
): { x: number; y: number } {
  const baseOffset = PunctuationAdjustmentUtil.getPunctuationOffset(char, params);
  
  if (params.textDirection === 'vertical') {
    switch (char) {
      case '、':
      case '，':
        return { 
          x: baseOffset.x + (params.fontSize * 0.3), 
          y: baseOffset.y + (params.fontSize * 0.2) 
        };
      case '。':
      case '．':
        return { 
          x: baseOffset.x + (params.fontSize * 0.25), 
          y: baseOffset.y + (params.fontSize * 0.25) 
        };
      default:
        return baseOffset;
    }
  }
  
  return baseOffset;
}
```

## アルファベット回転機能

### 5.1 アルファベット判定

```typescript
class AlphabetRotationUtil {
  static isAlphabet(char: string, pattern: string = "[a-zA-Z0-9]+"): boolean {
    const regex = new RegExp(pattern);
    return regex.test(char);
  }
  
  static findAlphabetSequences(text: string, pattern: string): Array<{
    start: number;
    end: number;
    content: string;
  }> {
    const regex = new RegExp(pattern, 'g');
    const sequences = [];
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      sequences.push({
        start: match.index,
        end: match.index + match[0].length - 1,
        content: match[0]
      });
    }
    
    return sequences;
  }
}
```

### 5.2 回転時の文字間隔計算

```typescript
private calculateRotatedAlphabetSpacing(
  char: string, 
  params: AlphabetRotationParameters,
  fontSize: number
): number {
  if (!params.enableAlphabetRotation || 
      !AlphabetRotationUtil.isAlphabet(char, params.alphabetRotationPattern)) {
    // 通常の縦書き間隔（文字高さベース）
    return fontSize * params.charSpacing;
  }
  
  // 回転時は横書き間隔（文字幅ベース）
  const estimatedCharWidth = fontSize * 0.6; // 一般的な文字幅比率
  return estimatedCharWidth * params.alphabetCharSpacingRatio;
}
```

### 5.3 PIXI.jsでの回転適用

```typescript
private applyCharacterRotation(
  charContainer: PIXI.Container,
  rotationResult: RotationResult,
  fontSize: number
): void {
  if (rotationResult.isRotated) {
    charContainer.rotation = (rotationResult.angle * Math.PI) / 180;
    
    // 回転後の位置調整（文字の中心を基準に回転）
    const offsetY = fontSize * 0.1; // 微調整値
    charContainer.position.y += offsetY;
  }
}
```

## 実装計画

### Phase 1: FlexibleCumulativeLayoutPrimitive拡張
1. `textDirection`パラメータ対応
2. 縦書きレイアウト計算ロジック追加
3. 座標系変換機能実装

### Phase 2: 句読点位置調整機能
1. `PunctuationAdjustmentUtil`クラス実装
2. パラメータ統合
3. 縦書きモード固有調整実装

### Phase 3: アルファベット回転機能
1. `AlphabetRotationUtil`クラス実装
2. 回転判定・間隔計算ロジック実装
3. PIXI.js回転適用機能実装

### Phase 4: パラメータ登録とテンプレート作成
1. `ParameterRegistry`への新規パラメータ登録
2. 縦書き対応テンプレート作成
3. テストケース作成

### Phase 5: 検証とドキュメント
1. 各機能の単体テスト
2. 統合テスト
3. ユーザーガイド作成

## 技術的考慮事項

### 互換性の確保
- 既存の横書きテンプレートに影響を与えない設計
- `textDirection: 'horizontal'`をデフォルト値として後方互換性を維持

### パフォーマンス
- 縦書き判定処理の最適化
- 文字回転処理のキャッシュ機能検討

### UI/UX
- パラメータエディタでの縦書き設定UI
- リアルタイムプレビュー対応

## 制約事項

1. **フォント制約**: 縦書きに適したフォントの使用を推奨
2. **文字種制約**: 一部の特殊文字は手動調整が必要な場合がある
3. **パフォーマンス制約**: 大量の文字処理時にパフォーマンス低下の可能性

## 今後の拡張可能性

1. **ルビ（振り仮名）対応**
2. **縦中横（数字の横書き）対応**
3. **文字装飾（傍点、圏点）対応**
4. **行間・文字間の詳細調整機能**

---

**作成日**: 2025-08-15  
**作成者**: Claude Code (UTAVISTA開発チーム)  
**バージョン**: 1.0.0