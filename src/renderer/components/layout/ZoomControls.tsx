import React, { useEffect, useState } from 'react';
import '../../styles/components.css';
import Engine from '../../engine/Engine';
import { Button } from '../common';

interface ZoomControlsProps {
  viewStart: number;
  viewEnd: number;
  totalDuration: number;
  /** 現在の表示時間（ms） */
  viewDuration: number;
  /** 表示時間の下限・上限（ms） */
  minViewDuration: number;
  maxViewDuration: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** スライダーで表示時間を直接指定する */
  onViewDurationChange: (duration: number) => void;
  engine?: Engine; // Undo/Redo機能のためにEngineインスタンスを受け取る
}

/** スライダーの分解能。表示時間は対数目盛りで割り当て、短い範囲でも細かく調整できるようにする。 */
const SLIDER_STEPS = 1000;

const ZoomControls: React.FC<ZoomControlsProps> = ({
  viewStart,
  viewEnd,
  totalDuration,
  viewDuration,
  minViewDuration,
  maxViewDuration,
  onZoomIn,
  onZoomOut,
  onViewDurationChange,
  engine
}) => {
  const zoomRange = Math.max(1, maxViewDuration / minViewDuration);
  // 左ほど広く（縮小）、右ほど詳細（拡大）になるよう、表示時間の対数を反転して割り当てる
  const sliderValue = maxViewDuration > minViewDuration
    ? Math.round((1 - Math.log(viewDuration / minViewDuration) / Math.log(zoomRange)) * SLIDER_STEPS)
    : SLIDER_STEPS;
  const sliderToDuration = (value: number) => minViewDuration * Math.pow(zoomRange, 1 - value / SLIDER_STEPS);
  const canZoomIn = viewDuration > minViewDuration + 1;
  const canZoomOut = viewDuration < maxViewDuration - 1;
  const formatViewDuration = (ms: number) => ms >= 10000
    ? `${Math.round(ms / 1000)}秒表示`
    : `${(ms / 1000).toFixed(1)}秒表示`;
  const [, refreshHistoryState] = useState(0);

  useEffect(() => {
    const handleHistoryChange = () => refreshHistoryState(value => value + 1);
    window.addEventListener('undo-redo-state-changed', handleHistoryChange);
    return () => window.removeEventListener('undo-redo-state-changed', handleHistoryChange);
  }, []);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Undo操作
  const handleUndo = () => {
    if (engine && engine.canUndo()) {
      const success = engine.undo();
      if (success) {
      } else {
        console.error('Undo操作に失敗しました');
      }
    }
  };
  
  // Redo操作
  const handleRedo = () => {
    if (engine && engine.canRedo()) {
      const success = engine.redo();
      if (success) {
      } else {
        console.error('Redo操作に失敗しました');
      }
    }
  };

  return (
    <div className="zoom-controls-container" style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '12px',
      padding: '8px',
      backgroundColor: '#2a2a2a',
      borderRadius: '8px',
      minWidth: '280px'
    }}>
      <div style={{ 
        color: '#999', 
        fontSize: '10px',
        textAlign: 'left',
        minWidth: '80px'
      }}>
        <div>表示範囲</div>
        <div>{formatTime(viewStart)} - {formatTime(viewEnd)}</div>
        <div>/ {formatTime(totalDuration)}</div>
      </div>
      
      {/* Undo/Redoボタン（補助操作のため共通の灰色ボタン） */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <Button size="small" onClick={handleUndo} disabled={!engine || !engine.canUndo()} title="元に戻す (Undo)">
          ↶ 戻す
        </Button>
        <Button size="small" onClick={handleRedo} disabled={!engine || !engine.canRedo()} title="やり直し (Redo)">
          ↷ やり直し
        </Button>
      </div>

      {/* ズーム（ボタンは段階的に、スライダーとCtrl+ホイールは連続的に変更） */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <Button size="small" onClick={onZoomOut} disabled={!canZoomOut} title="より広く表示（Ctrl+ホイール下でも縮小）">
          🔍−
        </Button>
        <input
          type="range"
          className="zoom-slider"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={sliderValue}
          disabled={maxViewDuration <= minViewDuration}
          onChange={event => onViewDurationChange(sliderToDuration(Number(event.target.value)))}
          title="表示範囲（右ほど詳細）"
          aria-label="タイムラインの表示範囲"
          style={{ width: '96px', accentColor: 'var(--color-accent)' }}
        />
        <Button size="small" onClick={onZoomIn} disabled={!canZoomIn} title="より詳細に表示（Ctrl+ホイール上でも拡大）">
          🔍+
        </Button>
      </div>

      <div style={{
        color: '#999',
        fontSize: '10px',
        textAlign: 'center',
        minWidth: '60px'
      }}>
        {formatViewDuration(viewDuration)}
      </div>
    </div>
  );
};

export default ZoomControls;
