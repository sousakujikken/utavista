/**
 * ステージサイズユーティリティ
 * テンプレート間で一貫したステージサイズ取得を提供
 */

export interface StageSize {
  width: number;
  height: number;
}

/**
 * 論理的なステージサイズを取得
 * 優先度：app.renderer > app.screen > フォールバック(1920x1080)
 */
export function getLogicalStageSize(): StageSize {
  const app = (window as any).__PIXI_APP__;
  
  // 最優先：renderer サイズ
  if (app?.renderer && app.renderer.width > 0 && app.renderer.height > 0) {
    return {
      width: app.renderer.width,
      height: app.renderer.height
    };
  }
  
  // 次優先：screen サイズ
  if (app?.screen && app.screen.width > 0 && app.screen.height > 0) {
    return {
      width: app.screen.width,
      height: app.screen.height
    };
  }
  
  // フォールバック：16:9 FHD
  console.warn('StageUtils: PIXIアプリケーションが利用できません。フォールバックサイズ(1920x1080)を使用します。');
  return { width: 1920, height: 1080 };
}

/**
 * ステージ中央座標を取得
 */
export function getStageCenterPosition(): { x: number; y: number } {
  const { width, height } = getLogicalStageSize();
  return {
    x: width / 2,
    y: height / 2
  };
}

/**
 * テンプレートの統一されたフォールバック位置設定
 * PIXIアプリケーションが利用できない場合に画面中央に配置
 */
export function applyFallbackPosition(container: any): void {
  const center = getStageCenterPosition();
  container.position.set(center.x, center.y);
  console.warn('StageUtils: フォールバック位置を適用しました:', center);
}

/**
 * デバッグ用座標ログ出力
 * @param templateName テンプレート名
 * @param containerId コンテナID
 * @param position 位置情報
 * @param phraseOffset フレーズオフセット
 * @param additionalInfo 追加情報
 */
export function logCoordinates(
  templateName: string,
  containerId: string,
  position: { x: number; y: number },
  phraseOffset: { x: number; y: number } = { x: 0, y: 0 },
  additionalInfo: Record<string, any> = {}
): void {
  console.log(`[COORDINATE_DEBUG] ${templateName}`, {
    containerId,
    finalPosition: { x: Math.round(position.x), y: Math.round(position.y) },
    phraseOffset,
    stageSize: getLogicalStageSize(),
    stageCenter: getStageCenterPosition(),
    ...additionalInfo
  });
}