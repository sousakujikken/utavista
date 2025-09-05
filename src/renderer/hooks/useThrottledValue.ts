import { useMemo } from 'react';

/**
 * 値の更新頻度を制限するカスタムフック（単純化版）
 * @param value 制限したい値
 * @param delay 制限間隔（ミリ秒）
 * @returns 制限された値
 */
export const useThrottledValue = <T>(value: T, delay: number): T => {
  // シンプルに値をそのまま返す（スロットリングを無効化）
  // 無限ループの原因を除去するための一時的な措置
  return value;
};

/**
 * 状況に応じたthrottling強度の調整
 * @param currentTime 現在時間
 * @param isPlaying 再生中かどうか
 * @returns 調整されたthrottling値
 */
export const useAdaptiveThrottling = (currentTime: number, isPlaying: boolean) => {
  const activeDelay = isPlaying ? 50 : 200;    // 再生中は50ms、停止中は200ms
  const scrollDelay = isPlaying ? 100 : 500;   // スクロール処理も調整
  
  const displayTime = useThrottledValue(currentTime, activeDelay);
  const scrollTime = useThrottledValue(currentTime, scrollDelay);
  
  return { displayTime, scrollTime };
};