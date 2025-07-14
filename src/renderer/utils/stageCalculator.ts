import { AspectRatio, Orientation, StageSize } from '../types/types';

// デフォルトコンテナサイズ（フォールバック用）
export const DEFAULT_CONTAINER_SIZE = 640;

// 基準解像度の定義
export const BASE_RESOLUTIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1600, height: 1200 },
  '1:1': { width: 1080, height: 1080 }
};

/**
 * 利用可能なコンテナサイズを取得
 */
function getAvailableContainerSize(): { width: number; height: number } {
  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) {
    const rect = canvasContainer.getBoundingClientRect();
    return {
      width: rect.width || DEFAULT_CONTAINER_SIZE,
      height: rect.height || DEFAULT_CONTAINER_SIZE
    };
  }
  return { width: DEFAULT_CONTAINER_SIZE, height: DEFAULT_CONTAINER_SIZE };
}

/**
 * アスペクト比と向きからステージサイズを計算
 */
export function calculateStageSize(
  aspectRatio: AspectRatio,
  orientation: Orientation
): StageSize {
  const baseRes = BASE_RESOLUTIONS[aspectRatio];
  let width = baseRes.width;
  let height = baseRes.height;
  
  // 縦画面の場合は幅と高さを入れ替え
  if (orientation === 'portrait' && aspectRatio !== '1:1') {
    [width, height] = [height, width];
  }
  
  // 利用可能なコンテナサイズを取得
  const containerSize = getAvailableContainerSize();
  
  // アスペクト比を考慮して表示領域にフィットするスケールを計算
  const aspectRatioValue = width / height;
  const containerAspectRatio = containerSize.width / containerSize.height;
  
  let targetWidth: number, targetHeight: number;
  
  if (aspectRatioValue > containerAspectRatio) {
    // コンテンツがコンテナより横長の場合、幅を基準にスケーリング
    targetWidth = containerSize.width;
    targetHeight = containerSize.width / aspectRatioValue;
  } else {
    // コンテンツがコンテナより縦長の場合、高さを基準にスケーリング
    targetHeight = containerSize.height;
    targetWidth = containerSize.height * aspectRatioValue;
  }
  
  // スケールを計算
  const scale = Math.min(
    targetWidth / width,
    targetHeight / height
  );
  
  return { width, height, scale };
}

/**
 * デフォルトのステージ設定を取得
 */
export function getDefaultStageConfig() {
  return {
    aspectRatio: '16:9' as AspectRatio,
    orientation: 'landscape' as Orientation,
    baseWidth: BASE_RESOLUTIONS['16:9'].width,
    baseHeight: BASE_RESOLUTIONS['16:9'].height
  };
}