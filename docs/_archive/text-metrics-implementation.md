# Text Metrics Cache Implementation Guide

## Overview

新しく実装された `TextMetricsCache` システムは、文字レンダリングの精度と性能を向上させます。従来の固定幅ベースのアプローチから、実際の文字サイズに基づく動的な配置システムに移行できます。

## TextMetricsCache の特徴

### 1. フォントサイズに依存しない正規化
- 基準サイズ（100px）で一度測定し、任意のサイズにスケーリング
- フォントサイズ変更時の再計算不要

### 2. 文字クラス別の最適化
- 文字種別（英数字、ひらがな、漢字など）ごとの代表値キャッシュ
- 大幅な測定回数削減とメモリ使用量削減

### 3. フォント別調整係数
- フォント固有の問題（グリフの境界外描画など）に対応
- カスタム調整による文字欠損の防止

## 使用方法

### 基本的な使用例

```typescript
import { textMetricsCache } from '../utils/TextMetricsCache';

// 正確なメトリクス取得
const metrics = textMetricsCache.getMetrics(
  'A',              // 文字
  'Arial',          // フォントファミリー
  24,               // フォントサイズ
  'normal',         // フォントウェイト
  'normal'          // フォントスタイル
);

// 結果: { width: 13.2, height: 18.6, baselineOffset: 0 }
```

### 高速推定モード

```typescript
// 文字クラスベースの推定（高速）
const estimatedMetrics = textMetricsCache.getEstimatedMetrics(
  'あ',             // 文字
  'ヒラギノ角ゴシック', // フォントファミリー
  24                // フォントサイズ
);
```

## テンプレートでの実装

### WordSlideText での実装例

```typescript
// パラメータで実測値モードを選択可能
const useMetrics = params.useMetrics as boolean || false;

if (useMetrics) {
  // 実測値を使用した正確な配置
  const metrics = textMetricsCache.getMetrics(
    char,
    fontFamily,
    fontSize,
    'normal',
    'normal'
  );
  
  // 文字の中央を基準に配置
  charContainer.position.set(
    cumulativeXOffset + metrics.width / 2, 
    metrics.baselineOffset
  );
  
  // 次の文字の位置を更新
  const letterSpacingRatio = params.letterSpacingRatio as number || 0.1;
  cumulativeXOffset += metrics.width + (fontSize * letterSpacingRatio);
} else {
  // 従来の固定幅方式（後方互換性）
  // ...
}
```

### パラメータ設定

新しいパラメータを追加：

```typescript
// テンプレートパラメータ定義
{ name: "useMetrics", type: "boolean", default: false, description: "文字幅の実測値を使用" },
{ name: "letterSpacingRatio", type: "number", default: 0.1, min: 0, max: 1.0, step: 0.05, description: "文字間隔の比率（実測値モード時）" },
{ name: "textPadding", type: "number", default: 3, min: 0, max: 10, step: 1, description: "文字欠損防止のためのパディング" }
```

## パフォーマンス最適化

### キャッシュ管理

```typescript
// フォント変更時のキャッシュ無効化
textMetricsCache.invalidateFont('Arial');

// 全キャッシュクリア
textMetricsCache.clearCache();

// デバッグ情報表示
textMetricsCache.debug();
```

### メモリ使用量の制御

- 最大キャッシュサイズ: 10,000エントリ
- TTL: 1時間
- 自動的な古いエントリの削除

## 効果的な使用パターン

### 1. プロポーショナルフォント対応
英語フォントや日本語プロポーショナルフォントで文字幅がばらつく場合

### 2. 多言語対応
異なる文字体系が混在するテキストでの正確な配置

### 3. 大きなフォントサイズ
装飾的なフォントや大きなサイズで文字欠損が発生しやすい場合

### 4. 高精度レイアウト
正確な文字配置が要求されるデザイン

## 移行ガイド

### 既存テンプレートの更新

1. **import文を追加**
   ```typescript
   import { textMetricsCache } from '../utils/TextMetricsCache';
   ```

2. **パラメータを追加**
   ```typescript
   { name: "useMetrics", type: "boolean", default: false }
   ```

3. **文字配置ロジックを更新**
   - 実測値モードと従来モードの両方に対応
   - 後方互換性を維持

4. **テストとデバッグ**
   - 既存プロジェクトでの動作確認
   - パフォーマンス影響の測定

## トラブルシューティング

### よくある問題

1. **文字の重なり**
   - `letterSpacingRatio` を増加
   - フォント調整係数の確認

2. **文字の欠損**
   - `textPadding` を増加
   - フォント固有の調整係数を追加

3. **パフォーマンスの低下**
   - 推定モード (`getEstimatedMetrics`) の使用を検討
   - キャッシュサイズの確認

### デバッグ方法

```typescript
// メトリクス情報の確認
console.log(textMetricsCache.getFontAdjustment('Arial'));

// キャッシュ状態の確認
textMetricsCache.debug();
```

## まとめ

`TextMetricsCache` システムにより：

- 文字の欠損問題を根本的に解決
- フォントに依存しない堅牢なレンダリング
- 後方互換性を維持しつつ段階的な移行が可能
- パフォーマンスの最適化