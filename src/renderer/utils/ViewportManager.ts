/**
 * タイムライン表示レンジ管理クラス
 * 座標変換と表示制御の統一管理を行う
 */
export class ViewportManager {
  private viewStart: number = 0;
  private viewDuration: number = 30000;
  private totalDuration: number = 0;
  private containerWidth: number = 0;

  constructor(totalDuration: number, containerWidth: number = 1000) {
    this.totalDuration = totalDuration;
    this.containerWidth = containerWidth;
  }

  /**
   * 時間からピクセル位置への変換
   * @param timeMs 時間（ミリ秒）
   * @returns ピクセル位置
   */
  timeToPixel(timeMs: number): number {
    if (this.viewDuration === 0) return 0;
    return ((timeMs - this.viewStart) / this.viewDuration) * this.containerWidth;
  }

  /**
   * ピクセル位置から時間への変換
   * @param pixel ピクセル位置
   * @returns 時間（ミリ秒）
   */
  pixelToTime(pixel: number): number {
    if (this.containerWidth === 0) return this.viewStart;
    return this.viewStart + (pixel / this.containerWidth) * this.viewDuration;
  }

  /**
   * 表示範囲の更新
   * @param newViewStart 新しい表示開始時間
   * @param newViewDuration 新しい表示時間長
   */
  updateViewport(newViewStart: number, newViewDuration: number): void {
    this.viewStart = Math.max(0, Math.min(newViewStart, this.totalDuration - newViewDuration));
    this.viewDuration = Math.min(newViewDuration, this.totalDuration);
  }

  /**
   * コンテナ幅の更新
   * @param newWidth 新しいコンテナ幅
   */
  updateContainerWidth(newWidth: number): void {
    this.containerWidth = newWidth;
  }

  /**
   * 総時間の更新
   * @param newTotalDuration 新しい総時間
   */
  updateTotalDuration(newTotalDuration: number): void {
    this.totalDuration = newTotalDuration;
  }

  /**
   * 時間が表示範囲内かチェック
   * @param timeMs 時間（ミリ秒）
   * @returns 表示範囲内かどうか
   */
  isTimeVisible(timeMs: number): boolean {
    return timeMs >= this.viewStart && timeMs <= this.viewStart + this.viewDuration;
  }

  /**
   * 自動スクロール判定
   * @param currentTime 現在時間
   * @param threshold しきい値（デフォルト0.8 = 80%）
   * @returns スクロールが必要かどうか
   */
  shouldAutoScroll(currentTime: number, threshold: number = 0.8): boolean {
    const thresholdTime = this.viewStart + this.viewDuration * threshold;
    // isTimeVisible条件を削除 - 範囲外でも自動スクロールを許可
    return currentTime >= thresholdTime;
  }

  /**
   * 新しい表示開始位置を計算
   * @param currentTime 現在時間
   * @param targetPosition 現在時間を配置する位置（デフォルト0.3 = 30%）
   * @returns 新しい表示開始位置
   */
  calculateNewViewStart(currentTime: number, targetPosition: number = 0.3): number {
    // 現在時間を表示範囲のtargetPosition位置に配置
    return Math.max(0, Math.min(
      currentTime - this.viewDuration * targetPosition,
      this.totalDuration - this.viewDuration
    ));
  }

  /**
   * 時間を中央に配置する表示開始位置を計算
   * @param centerTime 中央に配置する時間
   * @returns 新しい表示開始位置
   */
  calculateCenteredViewStart(centerTime: number): number {
    return Math.max(0, Math.min(
      centerTime - this.viewDuration / 2,
      this.totalDuration - this.viewDuration
    ));
  }

  /**
   * フォールバック位置を計算（手動シーク後用）
   * @param currentTime 現在時間
   * @param offsetRatio オフセット比率（デフォルト0.25 = 25%）
   * @returns 新しい表示開始位置
   */
  calculateFallbackViewStart(currentTime: number, offsetRatio: number = 0.25): number {
    return Math.max(0, Math.min(
      currentTime - this.viewDuration * offsetRatio,
      this.totalDuration - this.viewDuration
    ));
  }

  /**
   * 現在のビューポート情報を取得
   * @returns ビューポート情報
   */
  get viewport() {
    return {
      start: this.viewStart,
      duration: this.viewDuration,
      end: this.viewStart + this.viewDuration,
      totalDuration: this.totalDuration,
      containerWidth: this.containerWidth
    };
  }

  /**
   * ミリ秒/ピクセル比率を取得
   * @returns ms/pixel比率
   */
  get msPerPixel(): number {
    return this.containerWidth > 0 ? this.viewDuration / this.containerWidth : 0;
  }

  /**
   * 現在の表示進捗を取得
   * @param currentTime 現在時間
   * @returns 進捗率（0.0-1.0）
   */
  getProgress(currentTime: number): number {
    if (this.viewDuration === 0) return 0;
    const progress = (currentTime - this.viewStart) / this.viewDuration;
    return Math.max(0, Math.min(1, progress));
  }

  /**
   * デバッグ情報を取得
   * @param currentTime 現在時間
   * @returns デバッグ情報
   */
  getDebugInfo(currentTime: number) {
    return {
      viewStart: this.viewStart,
      viewDuration: this.viewDuration,
      viewEnd: this.viewStart + this.viewDuration,
      totalDuration: this.totalDuration,
      containerWidth: this.containerWidth,
      currentTime,
      currentTimePosition: this.timeToPixel(currentTime),
      isTimeVisible: this.isTimeVisible(currentTime),
      progress: this.getProgress(currentTime),
      msPerPixel: this.msPerPixel,
      shouldAutoScroll: this.shouldAutoScroll(currentTime)
    };
  }
}