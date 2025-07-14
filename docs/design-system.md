# UTAVISTA Design System

## 概要

UTAVISTAアプリケーションのビジュアルデザインシステムと色彩設計のガイドラインです。統一されたダークテーマUIを提供し、プロフェッショナルな動画編集環境を実現します。

## カラーパレット

### ブランドカラー

| 名称 | HEX | 用途 |
|------|-----|------|
| Primary Accent | `#F0059D` | アクティブ状態、再生ボタン、重要なインタラクション |
| Primary Accent Hover | `#d0047d` | ホバー時のアクセントカラー |

### 背景色階層

ダークテーマの奥行きを表現する階層的な背景色設計：

| レベル | HEX | 用途 | 使用箇所 |
|--------|-----|------|----------|
| Level 0 (最暗) | `#1a1a1a` | メインアプリケーション背景 | App全体、アクティブタブコンテンツ |
| Level 1 | `#222222` | セカンダリ背景 | プレビューエリア、タイムライン |
| Level 2 | `#262626` | 特殊エリア背景 | 波形エリア |
| Level 3 | `#2a2a2a` | UI要素背景 | プレイヤーエリア、非アクティブタブ |
| Level 4 | `#2c2c2c` | パネル背景 | サイドパネル |
| Level 5 | `#333333` | 軽い背景要素 | ボタン背景など |
| Level 6 | `#343434` | 強調パネル背景 | ボトムエリア |
| Level 7 | `#3a3a3a` | ホバー・インタラクティブ | ホバー状態、軽いボーダー |
| Level 8 (最明) | `#4a4a4a` | 強調ボーダー | 重要な区切り線 |

### テキストカラー

視認性と階層を考慮したテキスト色設計：

| 名称 | HEX | 用途 |
|------|-----|------|
| Primary Text | `#f0f0f0` | メインテキスト、アクティブ状態 |
| Secondary Text | `#e0e0e0` | サブテキスト |
| Tertiary Text | `#d0d0d0` | 補助テキスト |
| Quaternary Text | `#c0c0c0` | 非アクティブテキスト |
| Muted Text | `#999999` | 無効化・非重要テキスト |
| Disabled Text | `#666666` | 無効状態 |

### ボーダーカラー

| 名称 | HEX | 用途 |
|------|-----|------|
| Subtle Border | `#393939` | 微細な区切り |
| Standard Border | `#3a3a3a` | 標準的な区切り線 |
| Prominent Border | `#4a4a4a` | 強調された区切り線 |

## 主要UIコンポーネントの色設定

### 1. レイアウトエリア

#### プレビューエリア
```css
background-color: #222;
border-right: 1px solid #393939;
```

#### サイドパネルエリア
```css
background-color: #2c2c2c;
/* 推奨: #343434 (ボトムエリアと統一) または #2a2a2a (タブと統一) */
```

#### ボトムエリア
```css
background-color: #343434;
border-top: 1px solid #4a4a4a;
```

#### プレイヤーエリア
```css
background-color: #2a2a2a;
border-bottom: 1px solid #3a3a3a;
```

#### 波形エリア
```css
background-color: #262626;
border-bottom: 1px solid #3a3a3a;
```

#### タイムラインエリア
```css
background-color: #222;
```

### 2. インタラクティブ要素

#### タブ
```css
/* 非アクティブ */
background-color: #2a2a2a;
color: #c0c0c0;

/* ホバー */
background-color: #3a3a3a;

/* アクティブ */
background-color: #1a1a1a;
color: #f0f0f0;
border-bottom: 2px solid #F0059D;
```

#### ボタン
```css
/* 通常 */
background-color: #333;
color: #e0e0e0;

/* ホバー */
background-color: #3a3a3a;

/* プライマリボタン */
background-color: #F0059D;
color: #ffffff;

/* プライマリホバー */
background-color: #d0047d;
```

#### 入力フィールド
```css
background-color: #2a2a2a;
border: 1px solid #3a3a3a;
color: #f0f0f0;

/* フォーカス */
border-color: #F0059D;
```

### 3. スクロールバー
```css
/* トラック */
background-color: #2a2a2a;

/* サム */
background-color: #4a4a4a;

/* サムホバー */
background-color: #F0059D;
```

## 実装ガイドライン

### CSS変数の活用

プロジェクト全体で色の一貫性を保つため、CSS変数の使用を推奨：

```css
:root {
  /* ブランドカラー */
  --color-accent: #F0059D;
  --color-accent-hover: #d0047d;
  
  /* 背景色 */
  --bg-level-0: #1a1a1a;
  --bg-level-1: #222222;
  --bg-level-2: #262626;
  --bg-level-3: #2a2a2a;
  --bg-level-4: #2c2c2c;
  --bg-level-5: #333333;
  --bg-level-6: #343434;
  --bg-level-7: #3a3a3a;
  --bg-level-8: #4a4a4a;
  
  /* テキスト色 */
  --text-primary: #f0f0f0;
  --text-secondary: #e0e0e0;
  --text-tertiary: #d0d0d0;
  --text-quaternary: #c0c0c0;
  --text-muted: #999999;
  --text-disabled: #666666;
  
  /* ボーダー色 */
  --border-subtle: #393939;
  --border-standard: #3a3a3a;
  --border-prominent: #4a4a4a;
}
```

### 色選択の原則

1. **階層性**: 背景色のレベルを使用して視覚的な階層を作成
2. **一貫性**: 同じ機能を持つ要素には同じ色を使用
3. **コントラスト**: テキストの可読性を確保（WCAG AA準拠を目標）
4. **アクセント**: ブランドカラーは重要なインタラクションにのみ使用

### アクセシビリティ

- 最小コントラスト比: 4.5:1（通常テキスト）
- 大きなテキスト: 3:1
- インタラクティブ要素: 明確なホバー状態を提供

## タイポグラフィシステム

### フォントファミリー

| 種別 | フォントスタック | 用途 |
|------|-----------------|------|
| Primary | "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif | 日本語メインテキスト |
| System | -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial | システムUI |
| Monospace | 'SF Mono', 'Monaco', 'Cascadia Code', monospace | 時間表示、コード |

### フォントサイズ

| 名称 | サイズ | 用途 |
|------|--------|------|
| Tiny | 8px - 10px | タイムラインマーカー、極小ラベル |
| Caption | 0.7rem (11px) | キャプション、補助情報 |
| Small | 0.85rem (13px) | 小さなラベル、サブテキスト |
| Body | 0.9rem - 1rem (14-16px) | 標準UIテキスト |
| Subtitle | 1.1rem (17px) | サブタイトル、強調テキスト |
| Title | 1.2rem - 1.5rem (19-24px) | セクションタイトル |

### フォントウェイト

| 名称 | ウェイト | 用途 |
|------|----------|------|
| Regular | 400 | 標準テキスト |
| Medium | 500 | 軽い強調 |
| Bold | 600-700 | 強調、見出し |

### 行間

| 名称 | 値 | 用途 |
|------|-----|------|
| Tight | 1.2 | コンパクトUI |
| Normal | 1.5 | 標準テキスト |
| Relaxed | 1.8 | 読みやすさ重視 |

## スペーシングシステム

### 基本単位

8pxグリッドベースの段階的スペーシング：

| 名称 | サイズ | 用途 |
|------|--------|------|
| xxs | 2px | 極小間隔 |
| xs | 4px | 最小間隔 |
| sm | 8px | 小間隔 |
| md | 16px | 標準間隔 |
| lg | 24px | 大間隔 |
| xl | 32px | 特大間隔 |
| xxl | 40px | セクション間隔 |

### パディング規則

| コンポーネント | パディング | 備考 |
|----------------|------------|------|
| ボタン（小） | 4px 8px | コンパクトボタン |
| ボタン（中） | 8px 16px | 標準ボタン |
| ボタン（大） | 12px 24px | プライマリアクション |
| 入力フィールド | 8px 12px | テキスト入力 |
| カード | 16px | コンテンツカード |
| パネル | 20px | メインパネル |
| ダイアログ | 24px | モーダルウィンドウ |

## 形状とボーダー

### ボーダー半径

| 名称 | 値 | 用途 |
|------|-----|------|
| Sharp | 0px | 角張ったUI |
| Subtle | 2px | 微細な丸み |
| Small | 4px | 標準的な丸み |
| Medium | 6px | カード、パネル |
| Large | 8px | 大きなコンテナ |
| Pill | 24px | トグルスイッチ |
| Circle | 50% | 円形要素 |

### ボーダー幅

| 名称 | 値 | 用途 |
|------|-----|------|
| Thin | 1px | 標準ボーダー |
| Medium | 2px | 選択状態、アクティブ |
| Thick | 3px | 強調ボーダー |

## シャドウシステム

### エレベーション

| レベル | 値 | 用途 |
|--------|-----|------|
| Elevation 1 | 0 1px 3px rgba(0, 0, 0, 0.2) | 軽い浮き上がり |
| Elevation 2 | 0 2px 4px rgba(0, 0, 0, 0.15) | カード、パネル |
| Elevation 3 | 0 4px 8px rgba(0, 0, 0, 0.2) | ドロップダウン |
| Elevation 4 | 0 8px 16px rgba(0, 0, 0, 0.25) | モーダル |
| Elevation 5 | 0 12px 24px rgba(0, 0, 0, 0.3) | 最上位要素 |

### 特殊効果

| 名称 | 値 | 用途 |
|------|-----|------|
| Focus Ring | 0 0 0 2px rgba(240, 5, 157, 0.2) | フォーカス状態 |
| Glow | 0 0 10px rgba(240, 5, 157, 0.5) | 発光効果 |
| Inner Shadow | inset 0 1px 2px rgba(0, 0, 0, 0.1) | 凹み効果 |

## アニメーションシステム

### トランジション時間

| 名称 | 時間 | 用途 |
|------|------|------|
| Instant | 0ms | 即座の変化 |
| Fast | 150ms | マイクロインタラクション |
| Normal | 200ms | 標準的な遷移 |
| Slow | 300ms | 複雑な遷移 |
| Slower | 400ms | パネル展開など |

### イージング関数

| 名称 | 値 | 用途 |
|------|-----|------|
| Linear | linear | 一定速度 |
| Ease | ease | 標準的な動き |
| Ease In | ease-in | 加速開始 |
| Ease Out | ease-out | 減速終了 |
| Ease In Out | ease-in-out | 加速・減速 |
| Spring | cubic-bezier(0.68, -0.55, 0.265, 1.55) | バウンス効果 |

## レイアウトシステム

### 主要寸法

| エリア | 幅/高さ | 備考 |
|--------|---------|------|
| サイドパネル | 400px | 固定幅 |
| ボトムパネル | 230px | 固定高さ |
| プレイヤーバー | 50px | 固定高さ |
| 波形エリア | 30-60px | 可変高さ |
| タイムラインラベル | 80px | 固定幅 |
| 最小ボタン幅 | 80px | - |
| 最小入力幅 | 120px | - |

### Z-indexレイヤー

| レイヤー | 値 | 用途 |
|----------|-----|------|
| Base | 0 | デフォルト |
| Raised | 1-5 | 階層マーカー |
| Overlay | 10-20 | UI要素 |
| Sticky | 25 | 固定要素 |
| Modal | 100 | モーダル背景 |
| Modal Content | 1000 | モーダル本体 |
| Toast | 2000 | 通知 |
| Tooltip | 3000 | ツールチップ |

## アイコンシステム

### サイズ規格

| 名称 | サイズ | 用途 |
|------|--------|------|
| Tiny | 12px | インラインアイコン |
| Small | 16px | 小ボタン内 |
| Regular | 20px | 標準アイコン |
| Medium | 24px | ツールバー |
| Large | 32px | メインアクション |
| XLarge | 48px | 特大表示 |

## 実装ガイドライン

### CSS変数の拡張

```css
:root {
  /* タイポグラフィ */
  --font-primary: "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
  --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
  
  /* フォントサイズ */
  --text-tiny: 0.625rem;
  --text-caption: 0.7rem;
  --text-small: 0.85rem;
  --text-body: 0.9rem;
  --text-subtitle: 1.1rem;
  --text-title: 1.2rem;
  
  /* スペーシング */
  --space-xxs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-xxl: 40px;
  
  /* ボーダー半径 */
  --radius-subtle: 2px;
  --radius-small: 4px;
  --radius-medium: 6px;
  --radius-large: 8px;
  --radius-pill: 24px;
  
  /* シャドウ */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.2);
  --shadow-xl: 0 8px 16px rgba(0, 0, 0, 0.25);
  
  /* トランジション */
  --transition-fast: 150ms ease-out;
  --transition-normal: 200ms ease-out;
  --transition-slow: 300ms ease-out;
}
```

### レスポンシブ対応

ビデオ編集アプリケーションの特性上、最小幅1280pxを想定：

```css
@media (max-width: 1440px) {
  /* コンパクトモード */
  --space-md: 12px;
  --space-lg: 20px;
}
```

### アクセシビリティ拡張

- フォーカス可視性: すべてのインタラクティブ要素に明確なフォーカスリング
- キーボードナビゲーション: Tab順序の論理的な設計
- スクリーンリーダー対応: 適切なARIAラベル
- カラーコントラスト: WCAG AA準拠（最小4.5:1）
- モーション設定: `prefers-reduced-motion`への対応

## 更新履歴

- 2025-07-13: 初版作成
- 2025-07-13: タイポグラフィ、スペーシング、形状、アニメーション追加