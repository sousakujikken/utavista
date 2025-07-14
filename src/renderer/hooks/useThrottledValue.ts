import { useState, useEffect, useRef } from 'react';

/**
 * 値の更新頻度を制限するカスタムフック
 * @param value 制限したい値
 * @param delay 制限間隔（ミリ秒）
 * @returns 制限された値
 */
export const useThrottledValue = <T>(value: T, delay: number): T => {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecuted = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const now = Date.now();
    
    // 前回の実行から十分な時間が経過していれば即座に更新
    if (now - lastExecuted.current >= delay) {
      setThrottledValue(value);
      lastExecuted.current = now;
    } else {
      // 遅延実行を設定
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastExecuted.current = Date.now();
      }, delay - (now - lastExecuted.current));
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return throttledValue;
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