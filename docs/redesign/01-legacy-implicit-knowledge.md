# 01. 既存実装に埋もれた暗黙知の抽出（Phase 0 第1版）

## 目的

[00-goal-vision.md](./00-goal-vision.md) で合意した通り、UTAVISTA は再設計を予定している。本ドキュメントは「現実装で対症療法的に対処してきた泥臭い知見」を **再設計後の入力要件** に翻訳できる粒度で抽出するための作業ドキュメントである。

抽出した各項目は最終的に下記いずれかへ翻訳される:
- IR 仕様（Atom/Composite/Template の必須メタデータや契約）
- エンジン契約（`render*Container` のコンテキスト引数、評価モデル）
- SpriteAllocator 規約（余白計算ルール）
- 状態管理規約（差分主義の継承モデル）
- バリデーション規約（IR Validator の検出ルール）

## 抽出方法

- ソース横断（grep / 関数シグネチャ／コメント／コミットメッセージ）
- 代表的5テンプレ・主要 Engine 系・Primitive・LLM 試作の読解
- [known-issues.md](../known-issues.md) と既存 docs の精査
- 第1版は3観点（描画/タイミング/状態）でカバー。第2版以降で追加抽出予定の領域は §9 に記す

---

## A. テキストレンダリングとスプライト余白

### A-1. 動的パディング算出（フォントメトリクス）

- 場所: [TextMetricsCache.ts](../../src/renderer/utils/TextMetricsCache.ts:131-155)
- 現状: `padding = max(3, ceil(fontSize * 0.15))` を採用。さらに `getLocalBounds()` / `getBounds()` / `texture.width` / `fontSize * 0.8` の最大値で safeWidth を確定。
- 動機（推察）: 装飾系フォント・ストローク付きフォントでバウンディング測定が一致しない。1経路の測定では切れる事故が発生する。
- 翻訳先: **SpriteAllocator 規約**
  - 「フォント＋fontSize に対する最小padding」と「複数測定の最大値採用」を Allocator API の既定戦略に組み込む
  - フォント単位で実測メトリクスをキャッシュ（ascent/descent/sideBearing）

### A-2. TextStyleFactory のパディング/レゾリューション

- 場所: [TextStyleFactory.ts](../../src/renderer/utils/TextStyleFactory.ts:30-103)
- 現状:
  - `BASE_RESOLUTION_WIDTH=1920`, `BASE_RESOLUTION_HEIGHT=1080` を基準
  - `paddingMultiplier=0.20`（デフォルト）
  - `resolutionScale = max(scaleX, scaleY)` で「より大きい次元」を採用
  - エクスポート時に `textObj.scale.set(1 / resolutionScale)` で逆スケール
- 動機（推察）: 高DPI環境とエクスポート解像度のズレを「テクスチャは大きく作り、表示時に縮小」で吸収。
- 翻訳先: **エンジン契約 + SpriteAllocator**
  - render コンテキストに `screenScale`（CSS 表示倍率）を渡す（[known-issues.md LINE-HEIGHT-001](../known-issues.md) の根治に直結）
  - paddingMultiplier はテンプレIRの `paddingDefaults` のフィールドとして公開

### A-3. RenderTexturePool が `resolution: 1` 固定

- 場所: [RenderTexturePool.ts](../../src/renderer/utils/RenderTexturePool.ts:31-60)
- 現状: 常に resolution:1 でテクスチャを作成。
- 動機（推察）: プール再利用時に解像度を変更できない／DPI 混在でスケーリングずれが起きる。「常に1で作って外部で拡縮」する一元方針。
- 翻訳先: **レンダリングコア温存方針の根拠**。新方式でも resolution:1 + 外部スケールの方針を継承する。

---

## B. PIXI フィルタ・エフェクトの padding 規約

### B-1. エフェクト強度別の padding テーブル

- 場所: [IntentBasedAPI.ts:173-175](../../src/renderer/primitives/api/IntentBasedAPI.ts:173)
- 現状:
  ```ts
  'subtle':   { strength: 0.8, brightness: 1.0, blur:  4, padding: 30 }
  'normal':   { strength: 1.5, brightness: 1.2, blur:  6, padding: 50 }
  'dramatic': { strength: 2.5, brightness: 1.5, blur: 10, padding: 80 }
  ```
- 動機（推察）: ブラーが画面端を超えて切られないように経験値で確保。
- 翻訳先: **Atom IR `screenFilterStack` のパラメータ既定値**として規約化。AIにはこの3段階を「intensity プリセット」として渡す。

### B-2. GlowEffectPrimitive の `configureFilterArea`

- 場所: [GlowEffectPrimitive.ts:113-326](../../src/renderer/primitives/effects/GlowEffectPrimitive.ts:113)
- 現状: コンテナ単位で filterArea を設定し、screen size + padding に拡張。`disposalQueue` + `PIXI.Ticker.shared.addOnce()` で遅延破棄。
- 動機（コメント由来）: 「レンダー終了後に破棄」（[L81 付近](../../src/renderer/primitives/effects/GlowEffectPrimitive.ts:81)）。レンダーパス中の破棄で GPU エラー。
- 翻訳先: **エンジン契約**
  - フィルタ／レンダーテクスチャの破棄は **「次フレーム頭」まで遅延する規約** を Engine 内ユーティリティに集約
  - エフェクトを階層別に当てる現実装は §1.2 のスクリーンスペース規約と矛盾するため、新方式では **`screenFilterStack` 一本に統一**（既存コード非互換は承知の上）

### B-3. エフェクトの階層別適用 vs スクリーンスペース

- 場所: `container.filters = filters` が複数テンプレで使われている
- 動機: 個別エフェクト表現の自由度を優先した結果、階層別フィルタが常態化
- 翻訳先: **新方式では階層別個別フィルタを禁止**、screenFilterStack 経由で `app.stage` 一括適用。理由はゴール §1.2。

---

## C. マスク処理の直書き

### C-1. BlackBandMaskTextPrimitive の二層コンテナ方式

- 場所: [BlackBandMaskTextPrimitive.ts:49-79, 225-231, 625+](../../src/renderer/templates/BlackBandMaskTextPrimitive.ts)
- 現状: `blackBandContainer`／`invertMaskContainer` を分離保持し、Graphics 重ね合わせでマスク表現。`container.mask = ...` ネイティブマスクは使っていない。
- 動機（コメント由来）: 「スワイプアウト完了後に真のクリーンアップ」。ネイティブマスクの破棄タイミングが難しい／stencil 制約。
- 翻訳先: **Mask IR 設計の出発点**
  - 「PIXI ネイティブマスク」と「Graphics 重ね合わせ」を IR で抽象化し、両方の実装を選べる Atom にする
  - 破棄は B-2 と同じ「次フレーム頭」遅延規約に統一

---

## D. 解像度・スケーリング・アスペクト整合

### D-1. CSS スケーリングと PIXI resolution の分離

- 場所: Engine.ts の `applyCSSScaling()`、RenderTexturePool resolution:1、TextStyleFactory の resolutionScale
- 現状: PIXI は常に論理 1920×1080、CSS 側で表示サイズ調整。
- 動機（推察）: DPR ばらつき・エクスポート解像度との整合を CSS スケールで吸収。
- 既知問題: [LINE-HEIGHT-001](../known-issues.md) は `FlexibleCumulativeLayoutPrimitive.ts:548/598` の `lineY = wordIndex * fontSize * lineHeight` がスケール非考慮なため、視覚 0.5 が実視覚 1.0 になっていた。
- 翻訳先: **エンジン契約**
  - レンダーコンテキストに `screenScale` を明示的に渡し、`lineY` 計算など長さ系演算が一律「スケール認識」で行えるユーティリティを Atom IR に置く

### D-2. ResolutionManager のアスペクト比プリセット

- 場所: [ResolutionManager.ts:26-69, 225-245](../../src/renderer/utils/ResolutionManager.ts)
- 現状: 16:9 / 9:16 / 4:5 / 1:1 など複数プリセット、`calculateMaintainedAspectRatio()` で AR 保持。
- 動機: 過去に固定 AR で問題が起きた → プリセット化＋検証強化（v0.7.0）。
- 翻訳先: **プロジェクトデータモデル**
  - `.uta` の `stage` フィールドに AR を保存。
  - Engine 起動時にプリセット検証ロジックを通す。

### D-3. 背景動画と前景の AR 整合検証

- 場所: v0.7.0 で導入された「解像度／AR 検証ログ」（VideoExporter 周辺）
- 翻訳先: **エクスポートパイプライン契約**（新方式でも同等の検証を保持）

---

## E. タイミング・シーク・再生制御

### E-1. phase 判定の散在と条件分岐の不統一

- 場所: 主要5テンプレすべてに同等の `if (nowMs < startMs) ... else if (nowMs <= endMs) ...` パターンが分散
  - [PurePrimitiveWordSlideText.ts:356-426](../../src/renderer/templates/PurePrimitiveWordSlideText.ts:356)（phrase/word/char で3箇所）
  - [VerticalTextTemplate.ts](../../src/renderer/templates/VerticalTextTemplate.ts)（2箇所）
  - [VerticalBlackBandTextPrimitive.ts:95-102](../../src/renderer/templates/VerticalBlackBandTextPrimitive.ts:95)（`lastTimeMap` / `lastPhaseMap` / `paramSignatureMap` を用いた状態遷移検出）
  - [BlinkFadeTextPrimitive_v2.ts](../../src/renderer/templates/BlinkFadeTextPrimitive_v2.ts)（`>= && <=` パターン）
- 問題: テンプレ間で `<` / `<=` / `>=` の境界判定が**不統一**。境界フレームの挙動が一致しない可能性。
- 翻訳先: **エンジン契約のユーティリティ**
  - `phaseProgress(nowMs, startMs, endMs): { phase, progress }` を Atom IR の一級関数として固定（半開区間 `[startMs, endMs)` を規約化）
  - テンプレ／IR 側はこの結果を受け取るだけにする

### E-2. シーク状態の表現とテンプレ側自前トラッキング

- 場所: VerticalBlackBandTextPrimitive 内の `lastTimeMap` 等
- 現状: Engine が「シーク中」「再生中」「逆再生」を渡してくれないため、テンプレが直前フレームと比較して自前判定。
- 翻訳先: **エンジン契約のコンテキスト引数**に `playbackState: 'playing' | 'paused' | 'seeking' | 'reverse'` と `direction: 1 | -1` を追加。

### E-3. 音声と映像の同期

- 場所: [Engine.ts:830-984, 939-984](../../src/renderer/engine/Engine.ts)
- 現状:
  - Howler `audioPlayer.seek(adjustedTime)` で音声時刻設定
  - `audioOffset`（ms 単位）を ProjectStateManager に保持し、play/seek/reset 時に `(timeMs + audioOffset) / 1000` で秒変換
  - ドリフト補正は無し。タイマー値 `lastUpdateTime` で elapsed delta フォールバック
- 翻訳先: **エンジン契約 + プロジェクトデータ**
  - `audioOffset` は `.uta` の `audio` フィールドに保持
  - Engine 内に「音声時刻 ⇄ プロジェクト時刻」変換を集約
  - ドリフト補正は今後の検討課題（§9）

### E-4. 背景動画のフリーズシーケンス

- 場所: [Engine.ts:987-1029](../../src/renderer/engine/Engine.ts:987)
- 現状: `freezeBackgroundVideoAt(timeMs)` = `pause()` → `currentTime` 設定 → `requestVideoFrameCallback` または `seeked` イベント待機 → `app.render()`。VideoExporter で各フレームで呼び出し。
- ループ計算: `loopedTime = videoTimeSeconds % videoDuration`
- 翻訳先: **エクスポートパイプライン契約**
  - 「t → looped_t」変換を Engine 側に集約
  - テンプレ／IR は looped 後の時刻だけ受け取る

### E-5. システムスリープ対応

- 場所: [Engine.ts:890-924](../../src/renderer/engine/Engine.ts:890)
- 現状: `visibilitychange` イベントで `lastUpdateTime` をリセットし、復帰時の elapsed が異常値にならないようにする
- 翻訳先: **エンジン契約**（同等の対応を新方式でも保持）

---

## F. エクスポート決定論

### F-1. ロックステップ・フレーム生成

- 場所: [VideoExporter.ts:85-323](../../src/renderer/export/VideoExporter.ts)
- 現状:
  - `BATCH_SIZE = 150`（30fps×5秒）
  - `FrameProcessingSemaphore(1)` で順序保証
  - 各フレーム時刻: `timeMs = startTime + (frame / fps) * 1000`
  - Engine.seek(timeMs) → 背景動画 freeze → キャンバス→PNG → FFmpeg バッチ
- 翻訳先: **エンジン契約**
  - `seek(t)` は「t に対して画面状態を確定」させる純粋関数として規約化
  - キャプチャ APIも新方式に継承

### F-2. キャンセル検査ポイント

- 場所: VideoExporter 内 11箇所の `if (!this.isExporting || this.isCancelled)` チェック
- 翻訳先: 新方式でも同等のキャンセルポイントを設計時に組み込む

---

## G. 状態管理とパラメータ

### G-1. 個別アクティベーション機構

- 場所: [ParameterManagerV2.ts:41-42, 138, 274-286, 857-891](../../src/renderer/engine/ParameterManagerV2.ts)
- 現状: `phraseIndividualSettings: Map<string, boolean>` で管理。`enableIndividualSetting` / `disableIndividualSetting` / `isIndividualSettingEnabled` の3API。緑マーカー表示は [MarkerStyles.ts:41,77](../../src/renderer/styles/MarkerStyles.ts) で `rgba(34, 197, 94, ...)`。
- 痕跡: [L274-286](../../src/renderer/engine/ParameterManagerV2.ts:274) に「自動個別設定有効化」のコメントアウト残置 → パーティクル副作用で意図せぬアクティベートが発生したため削除されたと推察
- 翻訳先: **置換**
  - 新方式では §1.7 の **A+C ハイブリッド**（階層的継承＋タグ）に置換し、`Map<phraseId, boolean>` のフラグ管理は廃止
  - 「個別設定の値は解除しても保持」は新方式では「override を外す＝差分を消す」になるため概念ごと再設計

### G-2. 拡張ID形式（v0.6.0+）

- 場所: [ParameterManagerV2.ts:322-352](../../src/renderer/engine/ParameterManagerV2.ts:322)
- 現状: `phrase_X_word_Y_hZfW_char_N` 形式。`hZfW` は「高さ＋フォント幅署名」のハッシュ。
- 問題: パラメータレベルでは Word/Char サポート、しかしテンプレ割り当てレベルでは [TemplateManager.ts:66-69](../../src/renderer/engine/TemplateManager.ts:66) で「フェーズ1ではフレーズレベルのみ」と意図的に制限。
- 翻訳先: **新規 ID 体系の検討**
  - 新方式では `hZfW` のような「描画属性由来 ID」をやめ、安定 ID（UUIDなど）に統一を検討
  - Word/Char 割り当て・パラメータは新方式で正式サポート

### G-3. ParameterManagerV2 の変更通知デバウンス

- 場所: [Engine.ts:218-228](../../src/renderer/engine/Engine.ts:218)
- 現状: `addChangeListener('engine', ...)` で 100ms デバウンス。UIスライダーのドラッグ操作のスループット対策。
- 翻訳先: **状態管理規約**
  - 新方式でも UI からの高頻度更新は同様のデバウンスを適用
  - 思想だけ継承し、実装は Zustand 等の選択時に再構築

### G-4. StandardParameters 154 個

- 場所: [StandardParameters.ts:5-157](../../src/types/StandardParameters.ts:5)
- 現状: 154 個のパラメータが統一スキーマで列挙。テンプレ固有はオプショナル化。
- 翻訳先: **新方式では削減対象**
  - 全テンプレ共通の「真の標準」と、テンプレ固有を明確に分離
  - IR テンプレが宣言した `parameters[]` だけで自動UI生成（StandardParameters を中央集約しない）

### G-5. パラメータ検証スクリプト

- 場所: [scripts/validate-parameters.js:87-100](../../scripts/validate-parameters.js:87)
- 現状: StandardParameters と DEFAULT_PARAMETERS の整合性チェック、デフォルト値の完全性
- 翻訳先: **IR Validator の参考**
  - 新方式では「テンプレIR の宣言と、内部で参照しているパラメータ名が一致するか」を検証する Validator が必要

---

## H. フォント管理

### H-1. FontService の初期化と永続化

- 場所: [FontService.ts:52-156, 301-345](../../src/renderer/services/FontService.ts)
- 現状:
  - `initialize()` で Electron API の `getSystemFonts()` 経由でシステムフォント一覧取得
  - FontLoader で @font-face 登録時の検証
  - 選択状態は localStorage の `fontPickupSettings` に永続化

### H-2. 選択反映の不自然挙動（推察される原因）

- 場所: [FontService.ts:148-156](../../src/renderer/services/FontService.ts:148)
- 仮説: モーダル確定 → `updatePickedFonts()` 呼び出し → localStorage 同期保存、しかし `FontService.reloadFontSettings()` が呼ばれず **古い pickedFonts が後続描画で使われる**
- 再現条件（仮説）: フォント選択確定 → 直後に新フレーズ追加 → フォント一覧が更新されない
- 翻訳先: **新方式での要件**
  - フォント選択UI から fontFamily パラメータの選択肢への反映は **シングルソース（Zustand store 等）** にし、reload を明示的に経由しない設計に
  - 実測メトリクスの取得経路（A-1 と連動）もここで一元化

---

## I. プロジェクト保存・復元

### I-1. .uta 自動保存

- 場所: [ProjectFileManager.ts:66-150](../../src/renderer/services/ProjectFileManager.ts)
- 現状:
  - パラメータ変更 → addChangeListener → 100ms デバウンス → localStorage に圧縮形式 (V2) で自動保存
  - 30秒ごとに整理（AUTO_SAVE_INTERVAL）
  - V1 形式は明示的に拒否
- 翻訳先: **新方式では .uta 互換不要**
  - V1/V2 概念は廃止。新方式のフォーマットだけサポート
  - 自動保存のデバウンス・インターバル戦略は継承

### I-2. UnifiedRestoreManager

- 場所: [Engine.ts:100-104](../../src/renderer/engine/Engine.ts:100), `src/renderer/engine/UnifiedRestoreManager.ts`
- 現状: 起動時に localStorage から前回状態を復元
- 翻訳先: 新方式でも同等の起動時復元を実装。実装は新規。

---

## J. テンプレート登録・解決

### J-1. registerTemplate と templates.json

- 場所: [TemplateManager.ts:26-39](../../src/renderer/engine/TemplateManager.ts:26), [templates.json](../../src/renderer/templates/registry/templates.json)
- 現状: 5テンプレを宣言的に登録
- 翻訳先: 新方式では IR テンプレもこの仕組みに統合（同じレジストリで、ビルトイン IR と手書きTSテンプレを共存）

### J-2. テンプレID の sanitize

- 場所: [ParameterManagerV2.ts:78-92](../../src/renderer/engine/ParameterManagerV2.ts:78)
- 現状: 無効な templateId を空文字に正規化、デフォルトテンプレートにフォールバック（v0.5.0「未登録テンプレートのフォールバック機能」）
- 翻訳先: **新方式の解決順序**
  - 「ビルトイン → ユーザーライブラリ → プロジェクト埋め込み → フォールバック」の順
  - 解決失敗時は **黙ってフォールバックせずユーザーに通知** する（現状の暗黙フォールバックはデバッグが困難）

---

## K. 決定論性違反候補

新方式の「Atom IR は副作用無し・seed 注入で乱数化・t→state 純関数」契約に対する**現実装での違反候補**:

### K-1. `Math.random()` 直接呼び出し

- 場所: `BeatSyncEffectPrimitive.ts` 内に複数（デバッグ用と charId 生成）
  - `if (Math.random() < 0.05)`（デバッグ出力）
  - `charId = ... + Math.random().toFixed(6)`（**動的 ID 生成**）
  - `if (Math.random() < 0.001 && timeDiff <= 200)`（フィルター用）
- 問題: charId が `Math.random()` で生成されているため、同じ歌詞・同じ時刻で別 charId が割り振られる可能性。エクスポートの再現性に影響。
- 翻訳先: **新方式での絶対規約**
  - 識別子は安定生成（テキスト＋インデックスのハッシュ等、deterministic）
  - 乱数は seed 経由のみ（`seededRandom(seed, idx)` を Atom IR として固定）

### K-2. レンダーキャッシュ

- 場所: [PurePrimitiveWordSlideText.ts:41-47, 667-678](../../src/renderer/templates/PurePrimitiveWordSlideText.ts:41)
- 現状: `lastParams` / `lastPhase` / `lastNowMs` で同条件のキャッシュ再利用。決定論性は保たれる（同入力→同出力）。
- 翻訳先: 問題なし。**「キャッシュは決定論性を保つなら許容」** という規約として明文化。

---

## L. 体系化された "落とし穴" パターン

複数領域で繰り返し現れる対症療法の型を整理する。**新方式の Engine／Allocator の責務として組み込むべき項目**:

1. **多重測定の最大値採用** … バウンディング系（A-1）。原因は単一API信頼性の低さ
2. **遅延破棄パターン** … フィルタ・マスク・テクスチャ（B-2, C-1）。原因はレンダーパス中の破棄でGPUエラー
3. **レイヤー分離による回避** … ネイティブマスクを使わない（C-1）、エフェクトを階層別に当てる（B-3）
4. **解像度の二重管理** … PIXIは常に1、外部でCSS／scaleで吸収（A-2, A-3, D-1）
5. **毎フレーム時刻同期** … 音声・背景動画（E-3, E-4）。ドリフト補正なし
6. **テンプレ自前の状態追跡** … phase判定が分散（E-1, E-2）
7. **暗黙のフォールバック** … テンプレ解決時に黙ってデフォルトへ（J-2）
8. **localStorage 経由の永続化** … パラメータ・フォント選択（H-1, I-1）

これらは Engine／IR／Allocator のどこに責務を持たせるかを次フェーズで割り当てる。

---

## M. 再設計の入力要件（暫定マッピング）

|暗黙知ID|翻訳先|具体的な要件|
|---|---|---|
|A-1, A-2, A-3|SpriteAllocator|多重測定の最大値、paddingMultiplier 既定、resolution:1 固定|
|B-1, B-2, B-3|screenFilterStack Atom IR + 遅延破棄ユーティリティ|3段階 padding 既定値、フィルタ破棄は次フレーム頭|
|C-1|Mask IR Atom（native + graphics 両対応）|破棄遅延規約|
|D-1, D-2|エンジン契約 screenScale|`stage` フィールドにAR保存、scale認識ユーティリティ|
|E-1, E-2|phaseProgress Atom IR + playbackState/direction コンテキスト|半開区間 `[startMs, endMs)` を規約|
|E-3, E-4|エンジン側の音声・背景動画時刻変換集約|audioOffset、ループ計算|
|E-5|エンジン契約（visibilitychange対応）||
|F-1, F-2|エクスポートパイプライン契約|seek(t) 純粋関数、Semaphore、キャンセルポイント|
|G-1|オーバーライドモデル A+C で置換|個別アクティベーション機構の廃止|
|G-2|新ID体系（安定ID）|拡張ID は廃止候補|
|G-3, G-4|状態管理規約|デバウンス継承、Standard削減|
|G-5|IR Validator|テンプレ宣言と内部参照の一致検証|
|H-1, H-2|フォント管理の単一情報源化|シングルソース、メトリクス取得経路|
|I-1, I-2|.uta 新フォーマット、自動保存戦略継承||
|J-1, J-2|テンプレ解決順序明文化、暗黙フォールバック廃止||
|K-1|seededRandom Atom IR、安定ID|乱数は seed 経由のみ|

---

## N. 残課題・要追加調査

以下は本ドキュメント第1版では十分に抽出しきれなかった領域。第2版以降で扱う。

- **個別アクティベーション解除時のパラメータ保持仕様の詳細**: G-1 の置換設計を決める前に、現状仕様の正確な再現条件を確認
- **WebGL最大テクスチャサイズの分割描画ロジック**: A 領域の追加調査。`MAX_TEXTURE_SIZE` 参照箇所が見つからなかったので、現実装で対処されているかを再確認
- **`charId` の決定論性違反の影響範囲**: K-1 が再現性にどこまで影響しているか、エクスポート結果のフレーム間差分でテスト
- **音声ドリフト補正の必要性**: 長時間プロジェクトで音声時刻と PIXI.Ticker の累積誤差が無視できるかの実測
- **背景動画の事前フレーム抽出（v0.7.0）詳細**: 期待されている動作はあるが、実装が `freezeBackgroundVideoAt` だけで完結しているかの確認
- **既存 llm/ 試作 (claudeFunctionSchemas / TemplateGenerator) の取り込みうる思想と完全に捨てる部分の切り分け**
- **GUI テンプレ管理 / フォント管理の「現状不自然挙動」の再現テスト**: H-2 の仮説検証

---

## 更新履歴

- v1.0: 初版。3並列 Explore 調査結果を統合。
- 第2版以降では N の残課題を順次追加。
