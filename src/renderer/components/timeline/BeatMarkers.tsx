import React from 'react';
import { BeatMarker } from '../../services/AudioAnalyzer';

interface BeatMarkersProps {
  beats: BeatMarker[];
  duration: number;
  timelineWidth: number;
  msPerPixel: number;
  viewStart?: number;
  currentTime: number;
}

interface BeatMarkerProps {
  beat: BeatMarker;
  position: number;
  isHighConfidence: boolean;
  isPastCurrentTime: boolean;
}

/**
 * 個別のビートマーカーコンポーネント
 */
const SingleBeatMarker: React.FC<BeatMarkerProps> = ({
  beat,
  position,
  isHighConfidence,
  isPastCurrentTime
}) => {
  // 信頼度に基づいてスタイルを決定
  const getMarkerStyle = () => {
    const baseStyle = {
      position: 'absolute' as const,
      left: `${position}px`,
      top: '0px',
      height: '100%',
      width: '2px',
      pointerEvents: 'none' as const,
      zIndex: 5,
      opacity: isPastCurrentTime ? 0.5 : 1,
      transition: 'opacity 0.1s ease'
    };

    if (isHighConfidence) {
      // 高信頼度: より太くて明るいマーク
      return {
        ...baseStyle,
        width: '3px',
        backgroundColor: '#ff6b35',
        boxShadow: '0 0 4px rgba(255, 107, 53, 0.6)'
      };
    } else {
      // 中〜低信頼度: 細くて控えめなマーク
      return {
        ...baseStyle,
        backgroundColor: '#ffa726',
        boxShadow: '0 0 2px rgba(255, 167, 38, 0.4)'
      };
    }
  };

  return (
    <div 
      style={getMarkerStyle()}
      title={`Beat: ${beat.timestamp.toFixed(0)}ms, Confidence: ${(beat.confidence * 100).toFixed(1)}%`}
    />
  );
};

/**
 * ビートマーカー表示コンポーネント
 */
const BeatMarkers: React.FC<BeatMarkersProps> = ({
  beats,
  duration,
  timelineWidth,
  msPerPixel,
  viewStart = 0,
  currentTime
}) => {
  if (!beats || beats.length === 0) {
    return null;
  }

  // 表示範囲内のビートをフィルタリング
  const viewEnd = viewStart + (timelineWidth * msPerPixel);
  const visibleBeats = beats.filter(beat => 
    beat.timestamp >= viewStart && 
    beat.timestamp <= viewEnd
  );

  // ビートマーカーをレンダリング
  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4
      }}
    >
      {visibleBeats.map((beat, index) => {
        // タイムライン上の位置を計算
        const relativeTime = beat.timestamp - viewStart;
        const position = relativeTime / msPerPixel;
        
        // 信頼度が70%以上を高信頼度とみなす
        const isHighConfidence = beat.confidence >= 0.7;
        
        // 現在時刻より前かどうか
        const isPastCurrentTime = beat.timestamp < currentTime;

        return (
          <SingleBeatMarker
            key={`beat-${index}-${beat.timestamp}`}
            beat={beat}
            position={position}
            isHighConfidence={isHighConfidence}
            isPastCurrentTime={isPastCurrentTime}
          />
        );
      })}
    </div>
  );
};

export default BeatMarkers;