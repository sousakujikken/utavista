import React, { useState, useEffect, useMemo } from 'react';
import PreviewArea from './layout/PreviewArea';
import TemplateTab from './layout/TemplateTab';
import PlayerPanel from './layout/PlayerPanel';
import TimelinePanel from './layout/TimelinePanel';
import ContentTab from './layout/ContentTab';
import ProjectTab from './layout/ProjectTab';
import SettingsTab from './layout/SettingsTab';
import ZoomControls from './layout/ZoomControls';
import SidebarTabs from './ui/SidebarTabs';
import Engine from '../engine/Engine';
import { IAnimationTemplate } from '../types/types';
import { ViewportManager } from '../utils/ViewportManager';
import { useAdaptiveThrottling } from '../hooks/useThrottledValue';
import { AutoScrollDebugPanel } from './debug/AutoScrollDebugPanel';
import '../styles/NewLayout.css';
import '../styles/components.css';

// ズームレベルの定義（表示時間）
const ZOOM_LEVELS = [10000, 30000, 60000, 120000]; // 10秒, 30秒, 60秒, 120秒

interface NewLayoutProps {
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (value: number) => void;
  onTemplateChange: (template: string) => void;
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  selectedTemplate: string;
  engine?: Engine; // Engineインスタンスを受け取るためのプロパティを追加
  template?: IAnimationTemplate; // 現在のテンプレート
  debugInfo?: {
    previewCenter?: { x: number, y: number };
    phrasePosition?: { x: number, y: number };
    redRectGlobal?: { x: number, y: number };
    redRectLocal?: { x: number, y: number };
    lastUpdated?: number;
  };
  timingDebugInfo?: {
    currentTime?: number;
    activePhrase?: {
      id?: string;
      inTime?: number;
      outTime?: number;
      isVisible?: boolean;
      state?: string;
    }[];
    activeWord?: {
      id?: string;
      inTime?: number;
      outTime?: number;
      isVisible?: boolean;
      state?: string;
    }[];
  };
}

const NewLayout: React.FC<NewLayoutProps> = ({
  onPlay,
  onPause,
  onReset,
  onSeek,
  onTemplateChange,
  isPlaying,
  currentTime,
  totalDuration,
  selectedTemplate,
  engine, // propsからengineを受け取る
  template, // propsからtemplateを受け取る
  debugInfo,
  timingDebugInfo
}) => {
  // ズーム関連の状態
  const [zoomLevel, setZoomLevel] = useState(2); // 初期値を60秒表示に設定
  const [viewStart, setViewStart] = useState(0); // 表示開始時間
  
  // 歌詞編集モードの状態
  const [lyricsEditMode, setLyricsEditMode] = useState(false);
  
  // デバッグモード（開発用）
  const [showAutoScrollDebug, setShowAutoScrollDebug] = useState(false);
  
  // スクロール状態管理（継続スクロール防止）
  const [scrollState, setScrollState] = useState({
    isScrolling: false,
    lastScrollTime: 0,
    lastScrollPosition: 0,
    scrollCooldown: 500 // 500ms間隔制限
  });
  
  // 手動シーク状態管理
  const [seekState, setSeekState] = useState({
    isManualSeeking: false,
    lastSeekTime: 0,
    seekSource: 'auto' as 'user' | 'auto' | 'engine'
  });
  
  // 現在のズームレベルでの表示範囲、ただしdurationを超えない
  const viewDuration = Math.min(ZOOM_LEVELS[zoomLevel], totalDuration);
  const viewEnd = Math.min(viewStart + viewDuration, totalDuration);
  
  // ViewportManager インスタンス
  const viewportManager = useMemo(() => 
    new ViewportManager(totalDuration, 1000), // 仮の幅、後で更新
    [totalDuration]
  );
  
  // ViewportManager の状態を更新
  useEffect(() => {
    viewportManager.updateViewport(viewStart, viewDuration);
  }, [viewStart, viewDuration, viewportManager]);
  
  // パフォーマンス最適化：適応的throttling
  const { displayTime, scrollTime } = useAdaptiveThrottling(currentTime, isPlaying);
  
  // エンジンの有無をログ出力（デバッグ用）
  React.useEffect(() => {
    if (engine) {
    } else {
      console.warn('NewLayout: Engineインスタンスがありません');
    }
  }, [engine]);
  
  // 歌詞データの長さに応じて最適なズームレベルを選択（現在は使用しない）
  const getOptimalZoomLevel = (duration: number): number => {
    // 30秒未満の場合は10秒表示
    if (duration <= 30000) return 0;
    // 60秒未満の場合は30秒表示
    if (duration <= 60000) return 1;
    // 120秒未満の場合は60秒表示
    if (duration <= 120000) return 2;
    // それ以上は120秒表示
    return 3;
  };
  
  // totalDurationが変更されたときにズームレベルを調整（コメントアウト：常に60秒で起動）
  // useEffect(() => {
  //   const optimalZoomLevel = getOptimalZoomLevel(totalDuration);
  //   setZoomLevel(optimalZoomLevel);
  // }, [totalDuration]);
  
  // ズームイン・アウトハンドラ（ViewportManager使用版）
  const handleZoomIn = () => {
    if (zoomLevel > 0) {
      const newZoomLevel = zoomLevel - 1;
      const newViewDuration = Math.min(ZOOM_LEVELS[newZoomLevel], totalDuration);
      
      setZoomLevel(newZoomLevel);
      
      // ViewportManagerで中心位置を計算
      viewportManager.updateViewport(viewStart, newViewDuration);
      const newViewStart = viewportManager.calculateCenteredViewStart(currentTime);
      setViewStart(newViewStart);
    }
  };
  
  const handleZoomOut = () => {
    if (zoomLevel < ZOOM_LEVELS.length - 1) {
      const newZoomLevel = zoomLevel + 1;
      const newViewDuration = Math.min(ZOOM_LEVELS[newZoomLevel], totalDuration);
      
      // 最大時間でもデータの長さを超えない場合はズームアウトしない
      if (newViewDuration > viewDuration) {
        setZoomLevel(newZoomLevel);
        
        // ViewportManagerで中心位置を計算
        viewportManager.updateViewport(viewStart, newViewDuration);
        const newViewStart = viewportManager.calculateCenteredViewStart(currentTime);
        setViewStart(newViewStart);
      }
    }
  };
  
  // スクロール条件判定ヘルパー関数（ViewportManager使用版）
  const canScroll = (currentTime: number): boolean => {
    const now = Date.now();
    
    return (
      viewportManager.shouldAutoScroll(currentTime) && // ViewportManagerで判定
      !scrollState.isScrolling && // スクロール中でない
      now - scrollState.lastScrollTime > scrollState.scrollCooldown && // クールダウン
      Math.abs(currentTime - scrollState.lastScrollPosition) > viewDuration * 0.1 // 最小移動量
    );
  };
  
  // フォールバック処理判定（改善版）
  const shouldApplyFallback = (currentTime: number): boolean => {
    if (!seekState.isManualSeeking || Date.now() - seekState.lastSeekTime < 100) {
      return false;
    }
    
    // 範囲外の場合
    if (!viewportManager.isTimeVisible(currentTime)) {
      return true;
    }
    
    // 範囲内でも端に近い場合（70%以上または30%以下）
    const progress = viewportManager.getProgress(currentTime);
    return progress > 0.7 || progress < 0.3;
  };
  
  // 現在時間に合わせて表示範囲を調整（パフォーマンス最適化版）
  useEffect(() => {
    // 自動スクロール処理（throttling適用）
    if (canScroll(scrollTime)) {
      setScrollState(prev => ({ ...prev, isScrolling: true }));
      
      const newViewStart = viewportManager.calculateNewViewStart(scrollTime);
      setViewStart(newViewStart);
      
      // スクロール完了後の状態更新
      setTimeout(() => {
        setScrollState(prev => ({
          ...prev,
          isScrolling: false,
          lastScrollTime: Date.now(),
          lastScrollPosition: scrollTime
        }));
      }, 50);
    }
    
    // フォールバック処理（手動シーク後）
    if (shouldApplyFallback(scrollTime)) {
      // 現在時間を中央に配置
      const newViewStart = viewportManager.calculateCenteredViewStart(scrollTime);
      setViewStart(newViewStart);
      
      // シーク状態をリセット
      setTimeout(() => {
        setSeekState(prev => ({ ...prev, isManualSeeking: false }));
      }, 500);
    }
  }, [scrollTime, viewStart, viewDuration, totalDuration, viewportManager]);
  // currentTimeからscrollTimeに変更してパフォーマンス最適化
  // viewEndを除外して循環参照を防止
  
  // 手動シークイベントの処理（競合防止）
  useEffect(() => {
    const handleSeek = (event: CustomEvent) => {
      const { source, timestamp } = event.detail;
      
      if (source === 'user' || source === 'waveform' || source === 'playerPanel') {
        setSeekState({
          isManualSeeking: true,
          lastSeekTime: timestamp || Date.now(),
          seekSource: source
        });
        
        // 自動スクロールを一時停止
        setTimeout(() => {
          setSeekState(prev => ({ ...prev, isManualSeeking: false }));
        }, 1000);
      }
    };
    
    window.addEventListener('engine-seeked', handleSeek);
    return () => window.removeEventListener('engine-seeked', handleSeek);
  }, []);
  
  // デバッグモードのキーボードショートカット
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        setShowAutoScrollDebug(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="new-layout-container">
      <header className="app-header">
        {/* バージョン情報を一時的に非表示 */}
      </header>
      
      <main className="app-content">
        {/* 上段エリア */}
        <section className="top-area">
          <div className="preview-area">
            <PreviewArea 
              engine={engine} 
              lyricsEditMode={lyricsEditMode}
              onCloseLyricsEdit={() => setLyricsEditMode(false)}
            />
          </div>
          <div className="sidepanel-area">
            {/* タブ切り替え実装：4タブ構成 */}
            <SidebarTabs labels={['テンプレート', 'コンテンツ', 'プロジェクト', '設定']}>
              {[
                <TemplateTab
                  key="template-tab"
                  selectedTemplate={selectedTemplate}
                  onTemplateChange={onTemplateChange}
                  engine={engine}
                  template={template}
                />,
                <ContentTab 
                  key="content-tab" 
                  engine={engine} 
                  onLyricsEditModeToggle={() => setLyricsEditMode(true)}
                />,
                <ProjectTab key="project-tab" engine={engine!} />,
                <SettingsTab key="settings-tab" engine={engine} />
              ]}
            </SidebarTabs>
          </div>
        </section>
        
        {/* 下段エリア */}
        <section className="bottom-area">
          <div className="player-area" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <PlayerPanel
                isPlaying={isPlaying}
                currentTime={currentTime}
                totalDuration={totalDuration}
                onPlay={onPlay}
                onPause={onPause}
                onReset={onReset}
                onSeek={onSeek}
              />
            </div>
            <ZoomControls
              zoomLevel={zoomLevel}
              viewStart={viewStart}
              viewEnd={viewEnd}
              totalDuration={totalDuration}
              maxZoomLevel={ZOOM_LEVELS.length - 1}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              zoomLevels={ZOOM_LEVELS}
              engine={engine} // Undo/Redo機能のためにEngineインスタンスを渡す
            />
          </div>
          {/* 3段のタイムラインパネル */}
          <div className="timeline-area">
            <TimelinePanel
              currentTime={displayTime} // 表示用にthrottling適用
              totalDuration={totalDuration}
              engine={engine} // Engineインスタンスを渡す
              template={template} // テンプレートを渡す
              viewStart={viewStart}
              viewDuration={viewDuration}
              zoomLevel={zoomLevel}
              viewportManager={viewportManager} // ViewportManagerを追加
            />
          </div>
        </section>
      </main>
      
      <footer className="app-footer">
        {/* 時刻表示を一時的に非表示 */}
      </footer>
      
      {/* デバッグパネル（Ctrl+Shift+Dで表示切替） */}
      {showAutoScrollDebug && (
        <AutoScrollDebugPanel
          currentTime={currentTime}
          viewportManager={viewportManager}
          scrollState={scrollState}
          seekState={seekState}
          isPlaying={isPlaying}
        />
      )}
    </div>
  );
};

// 時間をmm:ss.ms形式にフォーマット
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

// 時間に基づく状態を取得
function getTimeState(time: number): string {
  if (time < 1000) {
    return "開始前";
  } else if (time < 3500) {
    return "「こんにちは」発声中";
  } else if (time < 4000) {
    return "インターバル";
  } else if (time < 6000) {
    return "「世界」発声中";
  } else {
    return "終了";
  }
}

export default NewLayout;