import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import PreviewArea from './layout/PreviewArea';
import SceneSettingsTab from './layout/SceneSettingsTab';
import PlayerPanel from './layout/PlayerPanel';
import TimelinePanel from './layout/TimelinePanel';
import ContentTab from './layout/ContentTab';
import ProjectTab from './layout/ProjectTab';
import ExportTab from './layout/ExportTab';
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

// タイムラインの表示時間（ms）。段階を持たず、下限から曲全体まで連続的に変更できる。
const MIN_VIEW_DURATION = 2000;
const DEFAULT_VIEW_DURATION = 60000;
/** ズームボタン1回あたりの倍率 */
const ZOOM_BUTTON_FACTOR = 1.5;
/** ズームボタンのアニメーション時間 */
const ZOOM_ANIMATION_MS = 180;

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
  isPlaying,
  currentTime,
  totalDuration,
  engine, // propsからengineを受け取る
  template, // タイムライン描画では固定コンポーザーの参照を使用する
  debugInfo,
  timingDebugInfo
}) => {
  // ズーム関連の状態
  const [viewDurationSetting, setViewDurationSetting] = useState(DEFAULT_VIEW_DURATION); // 起動時は60秒表示
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
  
  // 表示範囲。下限未満にはせず、曲全体（totalDuration）を超えない
  const maxViewDuration = Math.max(MIN_VIEW_DURATION, totalDuration);
  const viewDuration = Math.min(Math.max(viewDurationSetting, MIN_VIEW_DURATION), totalDuration);
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
  
  // ズーム処理は連続して呼ばれる（ホイール・アニメーション）ため、最新の表示範囲を参照で持つ
  const viewStateRef = useRef({ viewStart, viewDuration, totalDuration, currentTime });
  viewStateRef.current = { viewStart, viewDuration, totalDuration, currentTime };
  const zoomAnimationRef = useRef<number | null>(null);
  const pendingWheelRef = useRef<{ factor: number; anchorTime: number; anchorRatio: number } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);

  /**
   * 表示時間を変更する。anchorTime の時刻が表示幅の anchorRatio（0=左端、1=右端）の位置に留まるよう表示開始時刻も調整する。
   */
  const applyZoom = useCallback((targetDuration: number, anchorTime: number, anchorRatio: number) => {
    const { totalDuration: total } = viewStateRef.current;
    if (!(total > 0)) return;
    const duration = Math.min(Math.max(targetDuration, MIN_VIEW_DURATION), Math.max(MIN_VIEW_DURATION, total));
    const visibleDuration = Math.min(duration, total);
    const start = Math.min(Math.max(0, anchorTime - anchorRatio * visibleDuration), Math.max(0, total - visibleDuration));
    viewStateRef.current = { ...viewStateRef.current, viewStart: start, viewDuration: visibleDuration };
    setViewDurationSetting(duration);
    setViewStart(start);
    viewportManager.updateViewport(start, visibleDuration);
  }, [viewportManager]);

  const cancelZoomAnimation = () => {
    if (zoomAnimationRef.current !== null) {
      cancelAnimationFrame(zoomAnimationRef.current);
      zoomAnimationRef.current = null;
    }
  };

  /** 再生位置を基準に、表示時間を対数補間で滑らかに変える（ボタン・スライダー用）。 */
  const animateZoomTo = (targetDuration: number, animate = true) => {
    cancelZoomAnimation();
    const { viewStart: start, viewDuration: fromDuration, currentTime: playhead } = viewStateRef.current;
    // 再生位置が表示内ならその位置を保ち、表示外なら中央に寄せる
    const ratio = playhead >= start && playhead <= start + fromDuration
      ? (playhead - start) / Math.max(1, fromDuration)
      : 0.5;
    if (!animate) {
      applyZoom(targetDuration, playhead, ratio);
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / ZOOM_ANIMATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const duration = fromDuration * Math.pow(targetDuration / fromDuration, eased);
      applyZoom(duration, playhead, ratio);
      zoomAnimationRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    zoomAnimationRef.current = requestAnimationFrame(step);
  };

  const handleZoomIn = () => animateZoomTo(viewStateRef.current.viewDuration / ZOOM_BUTTON_FACTOR);
  const handleZoomOut = () => animateZoomTo(viewStateRef.current.viewDuration * ZOOM_BUTTON_FACTOR);
  const handleViewDurationChange = (duration: number) => animateZoomTo(duration, false);

  /** Ctrl+ホイール／ピンチ操作。1フレームに届いた入力をまとめて、マウス位置を基準に拡大縮小する。 */
  const handleWheelZoom = useCallback((factor: number, anchorTime: number, anchorRatio: number) => {
    cancelZoomAnimation();
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = pending
      ? { factor: pending.factor * factor, anchorTime, anchorRatio }
      : { factor, anchorTime, anchorRatio };
    if (wheelFrameRef.current !== null) return;
    wheelFrameRef.current = requestAnimationFrame(() => {
      wheelFrameRef.current = null;
      const next = pendingWheelRef.current;
      pendingWheelRef.current = null;
      if (next) applyZoom(viewStateRef.current.viewDuration * next.factor, next.anchorTime, next.anchorRatio);
    });
  }, [applyZoom]);

  useEffect(() => () => {
    cancelZoomAnimation();
    if (wheelFrameRef.current !== null) cancelAnimationFrame(wheelFrameRef.current);
  }, []);

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
            {/* タブ切り替え実装：5タブ構成。
                プロジェクトタブはショートカット（Ctrl/Cmd+O）と保存状態の監視、
                書き出しタブは動画書き出しの進行状態と出力設定を持つため、タブ切替でアンマウントしない。 */}
            <SidebarTabs
              labels={['シーン', 'コンテンツ', 'プロジェクト', '書き出し', '設定']}
              keepMountedIndexes={[2, 3]}
            >
              {[
                <SceneSettingsTab key="scene-settings-tab" engine={engine} />,
                <ContentTab 
                  key="content-tab" 
                  engine={engine} 
                  onLyricsEditModeToggle={() => setLyricsEditMode(true)}
                />,
                <ProjectTab key="project-tab" engine={engine!} />,
                <ExportTab key="export-tab" engine={engine!} />,
                <SettingsTab key="settings-tab" engine={engine} debugInfo={debugInfo} timingDebugInfo={timingDebugInfo} />
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
              viewStart={viewStart}
              viewEnd={viewEnd}
              totalDuration={totalDuration}
              viewDuration={viewDuration}
              minViewDuration={Math.min(MIN_VIEW_DURATION, totalDuration || MIN_VIEW_DURATION)}
              maxViewDuration={maxViewDuration}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onViewDurationChange={handleViewDurationChange}
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
              onWheelZoom={handleWheelZoom}
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
