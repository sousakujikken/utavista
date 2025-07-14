# タイムライン・歌詞タイミング管理

## 概要

UTAVISTAのタイムライン・タイミング管理システムは、音声再生と歌詞アニメーションの精密な同期を実現するため、独特な設計を採用しています。制約ベースのマーカー配置、階層的タイミング構造、リアルタイム音声同期を特徴とし、一般的な動画編集ソフトとは異なるアプローチで歌詞アニメーションに特化した機能を提供します。

## 時間同期の基準と連動要素

### 絶対的な時間基準

**音声再生時刻（`nowMs`）が唯一の基準**
```typescript
// Engineクラスでの時間管理
private currentTime: number = 0;  // ミリ秒単位

// 時間更新の流れ
updateTime(newTime: number): void {
  this.currentTime = newTime;
  
  // すべての連動要素を同じ時間で更新
  this.instanceManager.update(this.currentTime);
  this.updateTimelinePosition(this.currentTime);
  this.updateBackgroundVideo(this.currentTime);
}
```

**なぜ音声時刻を基準にするのか**:
1. **同期精度**: 視覚と聴覚の一致が最重要
2. **一意性**: 複数の時間基準による混乱を防止
3. **リアルタイム性**: ライブ再生時の精密な同期

### 連動要素の同期システム

```typescript
// 時間連動する全要素
interface TimeSyncElements {
  audioPlayback: number;        // 音声再生位置（基準）
  lyricsAnimation: number;      // 歌詞アニメーション時刻
  backgroundVideo: number;      // 背景動画時刻
  timelineDisplay: number;      // タイムライン表示位置
  markerPositions: number;      // マーカー位置表示
}
```

**連動の実装方式**:
- 音声時刻の変更 → 即座に全要素を更新
- 単一のイベントループで一括処理
- 要素間の時間差を最小化

## 階層的タイミング構造

### 3階層のタイミング設計

UTAVISTAでは、フレーズ→単語→文字の階層構造で、それぞれが独立したタイミング情報を持ちます。

```typescript
interface PhraseUnit {
  id: string;
  start: number;    // フレーズ開始時刻
  end: number;      // フレーズ終了時刻
  words: WordUnit[];
}

interface WordUnit {
  id: string;
  start: number;    // 単語開始時刻（フレーズ内の相対時刻）
  end: number;      // 単語終了時刻
  chars: CharUnit[];
}

interface CharUnit {
  id: string;
  start: number;    // 文字開始時刻（単語内の相対時刻）
  end: number;      // 文字終了時刻
}
```

### 時間制約の階層関係

**制約ルール**:
```typescript
// 階層間の時間制約検証
function validateTiming(phrase: PhraseUnit): boolean {
  // 1. 単語は親フレーズの時間内に収まる
  const wordsValid = phrase.words.every(word => 
    word.start >= phrase.start && word.end <= phrase.end
  );
  
  // 2. 文字は親単語の時間内に収まる  
  const charsValid = phrase.words.every(word =>
    word.chars.every(char =>
      char.start >= word.start && char.end <= word.end
    )
  );
  
  return wordsValid && charsValid;
}
```

**制約の設計理由**:
1. **論理的一貫性**: 親より長い子は存在しない
2. **アニメーション整合性**: 階層アニメーションの前提条件
3. **UI操作の制限**: 不正な編集操作を防止

## HierarchicalMarker による制約ベース配置

### 統一マーカーシステム

```typescript
// 3階層すべてを統一処理
interface HierarchicalMarkerProps {
  hierarchyType: 'phrase' | 'word' | 'char';
  data: PhraseUnit | WordUnit | CharUnit;
  level: number;              // 階層レベル（0=phrase, 1=word, 2=char）
  parentConstraints?: TimeRange;  // 親階層の時間制約
}
```

**なぜ統一マーカーなのか**:
- 階層別の個別実装では制約管理が複雑化
- 操作の一貫性（ドラッグ、選択、編集）
- UIコンポーネントの再利用性

### 制約ベースの移動アルゴリズム

```typescript
// マーカー移動時の制約適用
function constrainMarkerPosition(
  newPosition: number,
  markerType: 'start' | 'end',
  hierarchyType: HierarchyType,
  parentConstraints: TimeRange,
  siblingConstraints: TimeRange[]
): number {
  
  // 1. 親階層の制約
  const parentConstrained = Math.max(
    parentConstraints.start,
    Math.min(parentConstraints.end, newPosition)
  );
  
  // 2. 兄弟要素との重複回避
  const siblingConstrained = avoidSiblingOverlap(
    parentConstrained, siblingConstraints
  );
  
  // 3. 最小幅制約（200ms）
  const minWidthConstrained = enforceMinimumWidth(
    siblingConstrained, markerType, 200
  );
  
  return minWidthConstrained;
}
```

**制約の種類**:
1. **階層制約**: 親の時間範囲内に限定
2. **重複制約**: 兄弟要素との重複を防止
3. **最小幅制約**: 実用的な最小時間幅を保証
4. **グリッド制約**: 時間グリッドへのスナップ

## 複数選択と相対位置保持

### 複数選択時の移動アルゴリズム

```typescript
interface MultiSelectDrag {
  selectedMarkers: MarkerSelection[];
  dragOffset: number;
  originalPositions: Map<string, number>;
}

function handleMultiSelectDrag(dragData: MultiSelectDrag): void {
  const { selectedMarkers, dragOffset, originalPositions } = dragData;
  
  // 1. 基準マーカー（最初に選択されたもの）の新しい位置を計算
  const primaryMarker = selectedMarkers[0];
  const newPrimaryPosition = constrainMarkerPosition(
    originalPositions.get(primaryMarker.id)! + dragOffset,
    primaryMarker.type,
    primaryMarker.hierarchyType,
    primaryMarker.parentConstraints,
    []
  );
  
  // 2. 実際の移動量を算出
  const actualOffset = newPrimaryPosition - originalPositions.get(primaryMarker.id)!;
  
  // 3. 他のマーカーを相対位置で移動
  selectedMarkers.forEach(marker => {
    if (marker.id !== primaryMarker.id) {
      const newPosition = originalPositions.get(marker.id)! + actualOffset;
      updateMarkerPosition(marker, newPosition);
    }
  });
}
```

**相対位置保持の重要性**:
- 選択したマーカー群の時間関係を維持
- 楽曲のリズムやタイミング感を保持
- ユーザーの直感的な操作感を実現

## ViewportManager による表示範囲制御

### 自動スクロール判定システム

```typescript
class ViewportManager {
  private readonly AUTO_SCROLL_THRESHOLD = 0.8;  // 80%の位置でスクロール開始
  
  calculateDisplayRange(currentTime: number, isManualSeek: boolean): TimeRange {
    if (isManualSeek) {
      // 手動シーク時：現在時刻中心の表示範囲
      return this.calculateCenteredRange(currentTime);
    } else {
      // 自動再生時：スクロール判定
      return this.calculateAutoScrollRange(currentTime);
    }
  }
  
  private calculateAutoScrollRange(currentTime: number): TimeRange {
    const currentRange = this.getCurrentDisplayRange();
    const relativePosition = (currentTime - currentRange.start) / 
                            (currentRange.end - currentRange.start);
    
    if (relativePosition >= this.AUTO_SCROLL_THRESHOLD) {
      // 新しい表示範囲に自動スクロール
      return this.createNewScrollRange(currentTime);
    }
    
    return currentRange;  // 現在の範囲を維持
  }
}
```

**自動スクロールの設計思想**:
1. **予測性**: ユーザーが次の操作を予測できる
2. **滑らかさ**: 急激な表示変更を避ける
3. **操作性**: 手動操作時は自動スクロールを停止

### 時間↔座標変換システム

```typescript
// 時間座標変換の統一管理
function timeToPixel(timeMs: number, displayRange: TimeRange, canvasWidth: number): number {
  const relativeTime = (timeMs - displayRange.start) / 
                      (displayRange.end - displayRange.start);
  return relativeTime * canvasWidth;
}

function pixelToTime(pixelX: number, displayRange: TimeRange, canvasWidth: number): number {
  const relativePosition = pixelX / canvasWidth;
  return displayRange.start + (relativePosition * (displayRange.end - displayRange.start));
}
```

**変換システムの重要性**:
- UI操作（ピクセル座標）と時間データの橋渡し
- ズーム・パン操作時の精度保持
- マーカー描画位置の正確な計算

## リアルタイム音声同期

### 音声再生との同期メカニズム

```typescript
// 音声再生時のリアルタイム同期
class Engine {
  private audioCurrentTime = 0;
  private lastSyncTime = 0;
  private syncInterval = 16.67; // 60FPS（約16.67ms）
  
  startAudioSync(): void {
    this.audioSyncTimer = setInterval(() => {
      const newTime = this.getAudioCurrentTime();
      
      if (Math.abs(newTime - this.audioCurrentTime) > 10) {
        // 10ms以上の差がある場合のみ更新（ノイズ除去）
        this.updateTime(newTime);
        this.audioCurrentTime = newTime;
      }
    }, this.syncInterval);
  }
  
  seek(targetTime: number): void {
    // 1. 音声をシーク
    this.setAudioCurrentTime(targetTime);
    
    // 2. すべての連動要素を同期
    this.updateTime(targetTime);
    
    // 3. 背景動画も同期
    this.updateBackgroundVideoTime(targetTime);
  }
}
```

**同期精度の管理**:
1. **高頻度更新**: 60FPS での状態チェック
2. **ノイズフィルタ**: 微小な時間差は無視
3. **一括同期**: シーク時の全要素同時更新

### 背景動画との同期

```typescript
// 背景動画の精密同期
updateBackgroundVideoTime(targetTime: number): void {
  if (this.backgroundVideo) {
    // フレーム単位での精密シーク
    const targetFrame = Math.floor(targetTime / 1000 * this.backgroundVideoFPS);
    const preciseTime = targetFrame / this.backgroundVideoFPS;
    
    this.backgroundVideo.currentTime = preciseTime;
  }
}
```

**背景動画同期の課題と対策**:
- ブラウザの動画シーク精度の限界
- フレーム境界での丸め処理
- シーク遅延の最小化

## 歌詞編集との統合

### リアルタイム編集反映

```typescript
// 歌詞編集時のタイムライン更新
function updateLyricsData(newLyricsData: PhraseUnit[]): void {
  // 1. 時間制約の検証
  const isValid = validateAllTimingConstraints(newLyricsData);
  if (!isValid) {
    throw new Error('タイミング制約違反');
  }
  
  // 2. charIndex の再計算
  calculateCharIndex(newLyricsData);
  
  // 3. インスタンスマネージャーに反映
  this.instanceManager.updateLyricsData(newLyricsData);
  
  // 4. タイムラインUI の更新
  this.updateTimelineMarkers(newLyricsData);
  
  // 5. 現在時刻での再レンダリング
  this.instanceManager.update(this.currentTime);
}
```

**編集統合の特徴**:
- リアルタイムでの制約チェック
- アニメーション状態の即座反映
- タイムラインとエディターの双方向同期

## パフォーマンス最適化

### 時間範囲による描画制御

```typescript
// 表示範囲外のマーカーは描画をスキップ
function renderTimelineMarkers(displayRange: TimeRange): void {
  const visibleMarkers = this.allMarkers.filter(marker =>
    isMarkerInDisplayRange(marker, displayRange)
  );
  
  // 可視マーカーのみを描画
  visibleMarkers.forEach(marker => marker.render());
}

function isMarkerInDisplayRange(marker: Marker, range: TimeRange): boolean {
  const buffer = 1000; // 1秒のバッファ
  return marker.endTime >= (range.start - buffer) && 
         marker.startTime <= (range.end + buffer);
}
```

### Throttling による更新制御

```typescript
// 頻繁な更新要求のスロットリング
const throttledTimelineUpdate = throttle((newTime: number) => {
  this.updateTimelineDisplay(newTime);
}, 16.67); // 60FPS制限
```

## まとめ

UTAVISTAのタイムライン・タイミング管理システムは、歌詞アニメーションの精密な時間制御を実現するため、以下の独特な設計を採用しています：

1. **音声時刻基準の統一同期**: すべての要素が音声再生時刻を基準に動作
2. **階層的タイミング構造**: フレーズ→単語→文字の制約ベース時間管理
3. **制約ベース配置**: 階層関係を保持するマーカー移動制御
4. **相対位置保持**: 複数選択時の時間関係維持
5. **自動スクロール制御**: 予測可能で滑らかな表示範囲管理
6. **リアルタイム同期**: 60FPS での高精度音声・動画同期
7. **パフォーマンス最適化**: 表示範囲制御とスロットリング

この設計により、複雑な歌詞タイミング編集と精密な音声同期を両立し、直感的で効率的な歌詞アニメーション制作環境を実現しています。