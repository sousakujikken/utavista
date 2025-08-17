# UTAVISTA v0.4.3 パラメータ標準仕様

## 概要

このドキュメントはUTAVISTA v0.4.3で使用される全パラメータの標準仕様を定義します。開発時の参考として、パラメータの一元管理と統一性を保つためのガイドラインとして使用してください。

## 標準パラメータ（複数テンプレートで共通使用）

### 基本テキストパラメータ

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| fontSize | fontSize | フォントサイズ | number | 12 | 256 | 120 | 1 | 公開 |
| fontFamily | fontFamily | フォントファミリー | string | - | - | 'Arial' | - | 公開 |
| textColor | textColor | デフォルトテキスト色 | string | - | - | '#FFA500' | - | 公開 |
| activeTextColor | activeTextColor | アクティブテキスト色 | string | - | - | '#FFFF80' | - | 公開 |
| completedTextColor | completedTextColor | 完了テキスト色 | string | - | - | '#FFF7EB' | - | 公開 |

### レイアウトパラメータ

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| letterSpacing | letterSpacing | 文字間隔 | number | -10 | 50 | 0 | 1 | 公開 |
| **lineHeight** | **lineHeight** | **行の高さ（倍率）** | **number** | **0.5** | **3.0** | **1.2** | **0.1** | **公開** |
| offsetX | offsetX | X座標オフセット | number | -1000 | 1000 | 0 | 10 | 公開 |
| offsetY | offsetY | Y座標オフセット | number | -1000 | 1000 | 0 | 10 | 公開 |
| **phraseOffsetX** | **phraseOffsetX** | **画面中央からのX座標オフセット** | **number** | **-500** | **500** | **0** | **10** | **公開** |
| **phraseOffsetY** | **phraseOffsetY** | **画面中央からのY座標オフセット** | **number** | **-500** | **500** | **0** | **10** | **公開** |
| charSpacing | charSpacing | 文字間隔倍率 | number | 0.1 | 3.0 | 1.0 | 0.1 | 公開 |
| wordSpacing | wordSpacing | 単語間スペース | number | 0.1 | 5.0 | 1.0 | 0.1 | 公開 |

### エフェクトパラメータ（グロー）

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| enableGlow | enableGlow | グロー有効 | boolean | - | - | true | - | 公開 |
| glowStrength | glowStrength | グロー強度 | number | 0 | 5 | 1.5 | 0.1 | 公開 |
| glowBrightness | glowBrightness | グロー明度 | number | 0.5 | 3 | 1.2 | 0.1 | 公開 |
| **glowBlur** | **glowBlur** | **グローぼかし半径** | **number** | **0.1** | **20** | **6** | **0.1** | **公開** |
| glowQuality | glowQuality | グロー品質 | number | 0.1 | 20 | 8 | 0.1 | 公開 |
| glowPadding | glowPadding | グローパディング(px) | number | 0 | 200 | 50 | 5 | 公開 |

### エフェクトパラメータ（シャドウ）

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| enableShadow | enableShadow | シャドウ有効 | boolean | - | - | false | - | 公開 |
| **shadowBlur** | **shadowBlur** | **シャドウぼかし半径** | **number** | **0** | **50** | **6** | **0.5** | **公開** |
| shadowColor | shadowColor | シャドウ色 | string | - | - | '#000000' | - | 公開 |
| shadowAngle | shadowAngle | シャドウ角度(度) | number | 0 | 360 | 45 | 15 | 公開 |
| shadowDistance | shadowDistance | シャドウ距離(px) | number | 0 | 100 | 8 | 1 | 公開 |
| shadowAlpha | shadowAlpha | シャドウ透明度 | number | 0 | 1 | 0.8 | 0.1 | 公開 |
| shadowOnly | shadowOnly | シャドウのみ表示 | boolean | - | - | false | - | 公開 |

### 単語表示・配置モード

| パラメータ名 | パラメータID | 概要 | 型 | 選択肢 | デフォルト値 | 公開有無 |
|-------------|-------------|------|-----|--------|-------------|----------|
| wordDisplayMode | wordDisplayMode | 単語表示モード | string | individual_word_entrance, phrase_cumulative_same_line | 'individual_word_entrance' | 公開 |
| wordAlignment | wordAlignment | 単語アライメント | string | trailing_align, leading_align | 'trailing_align' | 公開 |

### その他

| パラメータ名 | パラメータID | 概要 | 型 | 選択肢 | デフォルト値 | 公開有無 |
|-------------|-------------|------|-----|--------|-------------|----------|
| blendMode | blendMode | ブレンドモード | string | normal, add, multiply, screen, overlay | 'normal' | 公開 |

## テンプレート固有パラメータ

### WordSlideTextテンプレート用

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| headTime | headTime | スライドイン時間(ms) | number | 0 | 2000 | 500 | 100 | 公開 |
| tailTime | tailTime | フェードアウト時間(ms) | number | 0 | 2000 | 500 | 100 | 公開 |
| entranceInitialSpeed | entranceInitialSpeed | 開始速度(px/ms) | number | 0.1 | 20.0 | 4.0 | 0.1 | 公開 |
| activeSpeed | activeSpeed | 終了速度(px/ms) | number | 0.01 | 2.0 | 0.10 | 0.01 | 公開 |
| rightOffset | rightOffset | 右側初期位置(px) | number | 0 | 500 | 100 | 10 | 公開 |
| randomPlacement | randomPlacement | ランダム配置有効 | boolean | - | - | true | - | 公開 |
| randomSeed | randomSeed | ランダムシード値 | number | 0 | 9999 | 0 | 1 | 公開 |
| randomRangeX | randomRangeX | ランダム範囲X(px) | number | 0 | 800 | 200 | 10 | 公開 |
| randomRangeY | randomRangeY | ランダム範囲Y(px) | number | 0 | 600 | 150 | 10 | 公開 |
| minDistanceFromPrevious | minDistanceFromPrevious | 最小間隔(px) | number | 50 | 500 | 150 | 10 | 公開 |

### BlinkFadeTextPrimitive用

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| flickerThreshold | flickerThreshold | 点滅閾値 | number | 0 | 1 | 0.5 | 0.1 | 公開 |
| flickerMinFrequency | flickerMinFrequency | 最小点滅周波数 | number | 0.5 | 10 | 2 | 0.5 | 公開 |
| flickerMaxFrequency | flickerMaxFrequency | 最大点滅周波数 | number | 5 | 30 | 15 | 1 | 公開 |
| flickerIntensity | flickerIntensity | 点滅強度 | number | 0 | 1 | 0.8 | 0.1 | 公開 |
| flickerRandomness | flickerRandomness | 点滅のランダム性 | number | 0 | 1 | 0.7 | 0.1 | 公開 |
| frequencyLerpSpeed | frequencyLerpSpeed | 周波数変化速度 | number | 0.01 | 1 | 0.15 | 0.01 | 公開 |
| preInDuration | preInDuration | 事前フェードイン時間(ms) | number | 500 | 5000 | 1500 | 100 | 公開 |
| fadeInVariation | fadeInVariation | フェードインばらつき(ms) | number | 0 | 2000 | 500 | 50 | 公開 |
| fadeOutVariation | fadeOutVariation | フェードアウトばらつき(ms) | number | 0 | 2000 | 800 | 50 | 公開 |
| fadeOutDuration | fadeOutDuration | フェードアウト時間(ms) | number | 200 | 3000 | 1000 | 100 | 公開 |
| fullDisplayThreshold | fullDisplayThreshold | 完全表示閾値 | number | 0.5 | 1 | 0.85 | 0.05 | 公開 |

### GlitchTextPrimitive用

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| totalLines | totalLines | 段構成設定 | number | 2 | 8 | 4 | 1 | 公開 |
| resetInterval | resetInterval | リセット間隔(ms) | number | 500 | 5000 | 2000 | 100 | 公開 |
| manualLineNumber | manualLineNumber | 手動段番号 | number | -1 | 7 | -1 | 1 | 公開 |
| enableGlitch | enableGlitch | グリッチ効果有効 | boolean | - | - | true | - | 公開 |
| glitchBlockSize | glitchBlockSize | グリッチブロックサイズ | number | 2 | 32 | 8 | 1 | 公開 |
| glitchBlockCount | glitchBlockCount | グリッチブロック数 | number | 1 | 50 | 10 | 1 | 公開 |
| glitchUpdateInterval | glitchUpdateInterval | グリッチ更新間隔 | number | 50 | 1000 | 100 | 50 | 公開 |
| glitchIntensity | glitchIntensity | グリッチ強度 | number | 0.0 | 1.0 | 0.5 | 0.1 | 公開 |
| glitchColorShift | glitchColorShift | グリッチ色シフト | boolean | - | - | true | - | 公開 |
| glitchThreshold | glitchThreshold | グリッチ閾値 | number | 0.0 | 1.0 | 0.3 | 0.1 | 公開 |
| glitchWaveSpeed | glitchWaveSpeed | グリッチ波速度 | number | 0.1 | 10.0 | 2.0 | 0.1 | 公開 |
| glitchRandomness | glitchRandomness | グリッチランダム性 | number | 0.0 | 1.0 | 0.5 | 0.1 | 公開 |

### FadeBlurRandomTextPrimitive用

| パラメータ名 | パラメータID | 概要 | 型 | 最小値 | 最大値 | デフォルト値 | 設定ステップ | 公開有無 |
|-------------|-------------|------|-----|--------|--------|-------------|------------|----------|
| enableRandomPlacement | enableRandomPlacement | ランダム配置有効 | boolean | - | - | true | - | 公開 |
| wordStaggerDelay | wordStaggerDelay | 単語ごとの遅延時間(ms) | number | 0 | 1000 | 200 | 50 | 公開 |
| fadeInDuration | fadeInDuration | フェードイン時間(ms) | number | 100 | 1500 | 500 | 100 | 公開 |
| fadeOutDuration | fadeOutDuration | フェードアウト時間(ms) | number | 100 | 1500 | 500 | 100 | 公開 |
| minAlpha | minAlpha | 最小透明度 | number | 0.0 | 0.8 | 0.0 | 0.1 | 公開 |
| enableBlur | enableBlur | ブラー効果有効 | boolean | - | - | true | - | 公開 |
| maxBlurStrength | maxBlurStrength | 最大ブラー強度 | number | 0.0 | 20.0 | 8.0 | 0.5 | 公開 |
| blurFadeType | blurFadeType | ブラーフェードタイプ | string | - | - | 'sync_with_alpha' | - | 公開 |
| glowColor | glowColor | グロー色 | string | - | - | '#FFD700' | - | 公開 |
| glowDistance | glowDistance | グロー距離 | number | 0.0 | 20.0 | 5.0 | 0.5 | 公開 |
| shadowOffsetX | shadowOffsetX | シャドウX座標オフセット | number | -20.0 | 20.0 | 3.0 | 1.0 | 公開 |
| shadowOffsetY | shadowOffsetY | シャドウY座標オフセット | number | -20.0 | 20.0 | 3.0 | 1.0 | 公開 |

## 重要な標準化事項

### 行間隔関連パラメータの統一仕様

#### lineHeight（推奨）
- **用途**: 行の高さを倍率で指定
- **型**: number
- **範囲**: 0.5 - 3.0
- **デフォルト値**: 1.2
- **設定ステップ**: 0.1
- **使用テンプレート**: 全テンプレート共通

#### lineSpacing（特殊用途）
- **用途**: 段組み時の段間隔をピクセル値で指定
- **型**: number
- **範囲**: 20 - 100
- **デフォルト値**: 50
- **設定ステップ**: 5
- **使用テンプレート**: GlitchTextPrimitive（MultiLineLayoutPrimitive使用時）

**推奨**: 一般的な行間隔制御には`lineHeight`を使用し、段組み専用の物理的間隔指定には`lineSpacing`を使用すること。

### v0.4.3共通仕様（画面中心基準配置）

すべてのテンプレートで画面中央を基準とした配置を標準とする：

- **phraseOffsetX**: 画面中央からのX座標オフセット（-500〜500px）
- **phraseOffsetY**: 画面中央からのY座標オフセット（-500〜500px）

### ぼかし半径の標準化（v0.4.3仕様）

- **glowBlur**: グローぼかし半径（0.1〜20、デフォルト6）
- **shadowBlur**: シャドウぼかし半径（0〜50、デフォルト6）

## カテゴリ別パラメータ統計

- **標準パラメータ**: 27個
- **テンプレート固有パラメータ（ParameterRegistry登録）**: 35個
- **テンプレート独自パラメータ**: 約20個
- **総計**: 約82個

## 開発ガイドライン

1. **新規パラメータ追加時**: 必ずParameterRegistry経由で登録
2. **命名規則**: camelCase、明確で説明的な名前を使用
3. **行間隔制御**: `lineHeight`（倍率）を優先、特殊用途のみ`lineSpacing`（ピクセル）
4. **画面配置**: 画面中央基準の`phraseOffsetX`/`phraseOffsetY`を標準使用
5. **ぼかし効果**: v0.4.3共通仕様に準拠した半径パラメータを使用

## 更新履歴

- v0.4.3: 初版作成、行間隔パラメータの標準化実施
- v0.4.3: ぼかし半径パラメータの統一仕様策定
- v0.4.3: 画面中心基準配置の標準化