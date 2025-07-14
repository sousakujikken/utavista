import React from 'react';
import { ViewportManager } from '../../utils/ViewportManager';

interface AutoScrollDebugPanelProps {
  currentTime: number;
  viewportManager: ViewportManager;
  scrollState: {
    isScrolling: boolean;
    lastScrollTime: number;
    lastScrollPosition: number;
    scrollCooldown: number;
  };
  seekState: {
    isManualSeeking: boolean;
    lastSeekTime: number;
    seekSource: string;
  };
  isPlaying: boolean;
}

export const AutoScrollDebugPanel: React.FC<AutoScrollDebugPanelProps> = ({
  currentTime,
  viewportManager,
  scrollState,
  seekState,
  isPlaying
}) => {
  const viewport = viewportManager.viewport;
  const threshold = viewport.start + viewport.duration * 0.8;
  const shouldAutoScroll = viewportManager.shouldAutoScroll(currentTime);
  const isTimeVisible = viewportManager.isTimeVisible(currentTime);
  
  const canScroll = () => {
    const now = Date.now();
    
    return (
      shouldAutoScroll &&
      !scrollState.isScrolling &&
      now - scrollState.lastScrollTime > scrollState.scrollCooldown &&
      Math.abs(currentTime - scrollState.lastScrollPosition) > viewport.duration * 0.1
    );
  };
  
  const formatTime = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px',
      minWidth: '300px',
      zIndex: 9999
    }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', borderBottom: '1px solid #666', paddingBottom: '5px' }}>
        自動スクロールデバッグ
      </h3>
      
      <div style={{ marginBottom: '8px' }}>
        <strong>基本情報:</strong>
        <div style={{ marginLeft: '10px' }}>
          再生状態: {isPlaying ? '再生中' : '停止'}
          <br />
          現在時間: {formatTime(currentTime)}
          <br />
          表示範囲: {formatTime(viewport.start)} - {formatTime(viewport.end)}
          <br />
          表示時間長: {formatTime(viewport.duration)}
        </div>
      </div>
      
      <div style={{ marginBottom: '8px' }}>
        <strong>スクロール判定:</strong>
        <div style={{ marginLeft: '10px' }}>
          しきい値: {formatTime(threshold)} (80%)
          <br />
          shouldAutoScroll: <span style={{ color: shouldAutoScroll ? '#4CAF50' : '#f44336' }}>
            {shouldAutoScroll ? 'true' : 'false'}
          </span>
          <br />
          isTimeVisible: <span style={{ color: isTimeVisible ? '#4CAF50' : '#f44336' }}>
            {isTimeVisible ? 'true' : 'false'}
          </span>
          <br />
          canScroll: <span style={{ color: canScroll() ? '#4CAF50' : '#f44336' }}>
            {canScroll() ? 'true' : 'false'}
          </span>
        </div>
      </div>
      
      <div style={{ marginBottom: '8px' }}>
        <strong>スクロール状態:</strong>
        <div style={{ marginLeft: '10px' }}>
          スクロール中: {scrollState.isScrolling ? 'はい' : 'いいえ'}
          <br />
          最終スクロール: {scrollState.lastScrollTime ? new Date(scrollState.lastScrollTime).toLocaleTimeString() : 'なし'}
          <br />
          最終位置: {formatTime(scrollState.lastScrollPosition)}
          <br />
          クールダウン: {scrollState.scrollCooldown}ms
        </div>
      </div>
      
      <div>
        <strong>シーク状態:</strong>
        <div style={{ marginLeft: '10px' }}>
          手動シーク中: {seekState.isManualSeeking ? 'はい' : 'いいえ'}
          <br />
          最終シーク: {seekState.lastSeekTime ? new Date(seekState.lastSeekTime).toLocaleTimeString() : 'なし'}
          <br />
          シークソース: {seekState.seekSource}
        </div>
      </div>
      
      {/* スクロール予測 */}
      {shouldAutoScroll && (
        <div style={{ 
          marginTop: '10px', 
          padding: '8px', 
          background: '#ff9800', 
          borderRadius: '4px',
          textAlign: 'center' 
        }}>
          ⚠️ 自動スクロール準備中
          <br />
          新しい表示開始: {formatTime(viewportManager.calculateNewViewStart(currentTime))}
        </div>
      )}
    </div>
  );
};