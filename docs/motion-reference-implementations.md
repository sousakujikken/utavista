# Motion Typography Reference Implementations

`KineticSceneTemplate` 1.1の6系統は、次の公開実装で示された表現手法をPixiJS向けに独自実装したものです。外部リポジトリのソースコード、シェーダー、アセットはコピーしていません。

| 内蔵バリエーション | 参考実装 | UTAVISTAでの実装 | ライセンス確認 |
| --- | --- | --- | --- |
| Elastic Destruction | [tsl_elastic_vertex_destruction](https://github.com/armdz/tsl_elastic_vertex_destruction) | 単語テクスチャの水平スライス、決定論的飛散、弾性復元 | リポジトリ上で明示ライセンスを確認できないため手法参照のみ |
| Repetitive Typography | [codrops/RepetitiveTypography](https://github.com/codrops/RepetitiveTypography) | 複製レイヤー、奥行き減衰、時間差移動 | MIT |
| Type Shuffle / Data Decode | [codrops/TypeShuffleAnimation](https://github.com/codrops/TypeShuffleAnimation) | seed付き文字置換、単語開始時刻への収束 | MIT |
| Organic Distortion | [infinite-scrolling-text-distortion](https://github.com/JorgeCapillo/infinite-scrolling-text-distortion) | PixiJS FilterによるUV波形変形 | MIT |
| Glyph Object Emitters | [WebGL-typing-tutorial](https://github.com/uuuulala/WebGL-typing-tutorial) | 単語を発生源にした目・泡・粒子・ノイズ | MIT |
| Kinetic Type Surface | [codrops-kinetic-typo](https://github.com/marioecg/codrops-kinetic-typo) | UV反復フィルターと疑似3D曲面レイヤー | MIT |

## 動きの引き出し（kumagi.com/motions）由来の動き

[動きの引き出し](https://kumagi.com/motions/) の解説（設計の要点・数値）を手掛かりに、歌詞の単語単位で使えるものを選んで独自実装しました。サイトのソースコードやシェーダーはコピーしていません。

| 参照した動き | UTAVISTAでの実装 | 内蔵バリエーション |
| --- | --- | --- |
| [DROP WORD](https://kumagi.com/motions/#drop-word) | ベースラインウェーブを負のオフセット・380ms・30ms遅延で使用 | 10A |
| [SOFT ENTER](https://kumagi.com/motions/#soft-enter) | 出現・消失 `soft`（上昇24px、ぼかし7px→0px） | 10B |
| [KARAOKE FILL](https://kumagi.com/motions/#karaoke-fill) | カラオケ塗り（文字ごとの左→右マスク） | 11A |
| [MASKING](https://kumagi.com/motions/#masking) | 出現・消失 `mask`（マスクと中身を別速度） | 11A |
| [SPRING](https://kumagi.com/motions/#spring) / [SECOND ORDER](https://kumagi.com/motions/#second-order) | 出現・消失 `spring`（減衰比0.42の解析解） | 12A |
| [GENIE](https://kumagi.com/motions/#genie) | 出現・消失 `genie`（横幅を先に絞る漏斗状の収縮） | 12A |
| [BREATHE](https://kumagi.com/motions/#breathe) | 継続 `breathe`（吸う2.6s・止める0.6s・吐く2.4s） | 02A, 12A |
| [SQUASH & STRETCH](https://kumagi.com/motions/#squash-stretch) | 出現・消失 `bounce`（反発0.62、面積一定の伸縮） | 12B |
| [TURNSTILE](https://kumagi.com/motions/#turnstile) | 出現・消失 `turnstile`（端を軸にした80°以内の回転） | 13A |
| [DOUBLE OUTLINE](https://kumagi.com/motions/#double-outline) | 二重輪郭インパクト | 14A |
| [SPEED LINES](https://kumagi.com/motions/#speed-lines) | 放出スタイル `speedLines`（12fpsで引き直す集中線） | 14A |
| [ZOOM DIVE](https://kumagi.com/motions/#zoom-dive) | 画面全体 `zoomDive` | 14A |
| [WHIP PAN](https://kumagi.com/motions/#whip-pan) | 画面全体 `whipPan` | 14B |
| [ANTICIPATION](https://kumagi.com/motions/#anticipation) | 出現・消失 `anticipate`（逆方向の溜めと減衰正弦の揺り戻し） | 14B |

GLITCH・SHATTER など既存の `glitch` / `shatter` / 弾性破壊と重なるもの、UI部品や背景描画（パーティクル造形、空・水面など）が主題のものは対象外にしています。

## 実装上の差異

- Three.js、WebGPU、GSAPは追加せず、既存のPixiJS 7描画系へ統合しています。
- 操作入力やスクロール速度の代わりに、単語の開始・終了時刻、`motionSeed`、各パラメータを入力に使います。
- エフェクト状態はフレーム履歴を持たず、任意の時刻を直接評価できます。
- 6系統を個別にON/OFFできるため、内蔵バリエーション以外の組み合わせも作成できます。
- Kinetic Type Surfaceは完全な3Dメッシュではなく、UV変形と複製レイヤーによるPixiJS向けの疑似3D表現です。
