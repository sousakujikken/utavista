import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Engine } from '../../engine/Engine';
import { ModernVideoExportOptions } from '../../export/video/VideoExporter';
import { Button, Select, Input, Section, StatusMessage } from '../common';
import './ProjectTab.css';
import { WebCodecsLockstepExporter } from '../../export';
import { TransparentVideoExporter } from '../../export/video/TransparentVideoExporter';
import { findSupportedH264Config } from '../../export/video/H264EncoderConfig';
import { createSrt } from '../../utils/SrtExporter';

interface ExportTabProps {
  engine: Engine;
}

type LongSideResolution = 1920 | 1280 | 1080 | 720;
type VideoQualityCRF = 'low' | 'medium' | 'high';

// 拡張されたアスペクト比型
type ExtendedAspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | '3:4' | '6:19';

/**
 * 書き出しタブ: 動画・静止画（PNG）・字幕（SRT）の出力。
 * 書き出しの進行状態を失わないよう、タブ切替でアンマウントしない（NewLayout の keepMountedIndexes）。
 */
const ExportTab: React.FC<ExportTabProps> = ({ engine }) => {
  // 動画出力の完了・キャンセルの通知
  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');

  // 動画出力関連の状態
  const [longSideResolution, setLongSideResolution] = useState<LongSideResolution>(1920);
  const [videoQuality, setVideoQuality] = useState<VideoQualityCRF>('medium');
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60000);
  const [includeMusicTrack, setIncludeMusicTrack] = useState(true);
  const [startTimeInput, setStartTimeInput] = useState('00:00.000');
  const [endTimeInput, setEndTimeInput] = useState('03:12.500');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [batchProgress, setBatchProgress] = useState<number | undefined>();
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [stepCount, setStepCount] = useState<number | null>(null);
  const [stepName, setStepName] = useState<string | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [memoryUsage, setMemoryUsage] = useState<number | undefined>();
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingSrt, setIsExportingSrt] = useState(false);
  const [srtStatus, setSrtStatus] = useState('');
  const [srtStatusType, setSrtStatusType] = useState<'success' | 'error' | 'info'>('info');
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [pngStatus, setPngStatus] = useState('');
  const [pngStatusType, setPngStatusType] = useState<'success' | 'error' | 'info'>('info');
  // ロックステップエクスポーター参照（キャンセル対応）
  const exporterRef = useRef<WebCodecsLockstepExporter | TransparentVideoExporter | null>(null);
  // 背景が透過のときは ProRes 4444（.mov）で書き出す。
  const [isTransparentBackground, setIsTransparentBackground] = useState<boolean>(
    () => engine?.isBackgroundTransparent?.() ?? false
  );
  useEffect(() => {
    const handleTransparencyChange = (event: Event) => {
      setIsTransparentBackground(Boolean((event as CustomEvent<{ transparent: boolean }>).detail?.transparent));
    };
    window.addEventListener('utavista:background-transparency-changed', handleTransparencyChange);
    return () => window.removeEventListener('utavista:background-transparency-changed', handleTransparencyChange);
  }, []);
  // エンジン準備前にマウントされるため、エンジンが渡った時点の背景状態で同期する。
  useEffect(() => {
    setIsTransparentBackground(engine?.isBackgroundTransparent?.() ?? false);
  }, [engine]);
  // WebCodecsサポート状況（現在の設定に対する）
  const [webcodecsUnsupportedMsg, setWebcodecsUnsupportedMsg] = useState<string | null>(null);
  
  // 背景動画フレームレート関連
  const [backgroundVideoFps, setBackgroundVideoFps] = useState<number | null>(null);
  const [fpsRecommendation, setFpsRecommendation] = useState<string>('');
  
  // アスペクト比の選択肢
  const aspectRatioOptions = [
    { value: '16:9' as ExtendedAspectRatio, label: '16:9 (横画面)' },
    { value: '4:3' as ExtendedAspectRatio, label: '4:3 (横画面)' },
    { value: '1:1' as ExtendedAspectRatio, label: '1:1 (正方形)' },
    { value: '9:16' as ExtendedAspectRatio, label: '9:16 (縦画面)' },
    { value: '3:4' as ExtendedAspectRatio, label: '3:4 (縦画面)' },
    { value: '6:19' as ExtendedAspectRatio, label: '6:19 (縦画面)' }
  ];

  // 長辺解像度の選択肢
  const longSideResolutionOptions = [
    { value: 1920 as LongSideResolution, label: '1920 (フルHD+)' },
    { value: 1280 as LongSideResolution, label: '1280 (HD+)' },
    { value: 1080 as LongSideResolution, label: '1080 (フルHD)' },
    { value: 720 as LongSideResolution, label: '720 (HD)' }
  ];

  // 動画品質（CRF）の選択肢
  const videoQualityOptions = [
    { value: 'low' as VideoQualityCRF, label: '低品質 (CRF 28 - 小容量・高速)', crf: 28 },
    { value: 'medium' as VideoQualityCRF, label: '中品質 (CRF 23 - 推奨)', crf: 23 },
    { value: 'high' as VideoQualityCRF, label: '高品質 (CRF 18 - 大容量・低速)', crf: 18 }
  ];

  // コンテンツタブから現在のアスペクト比を取得
  const getCurrentAspectRatio = (): ExtendedAspectRatio => {
    if (!engine) return '16:9';
    
    const stageConfig = engine.getStageConfig();
    const { aspectRatio, orientation } = stageConfig;
    
    // 基本アスペクト比を拡張アスペクト比に変換
    if (aspectRatio === '16:9') return orientation === 'portrait' ? '9:16' : '16:9';
    if (aspectRatio === '4:3') return orientation === 'portrait' ? '3:4' : '4:3';
    if (aspectRatio === '1:1') return '1:1';
    
    return '16:9'; // デフォルト
  };

  // アスペクト比と長辺解像度から実際の幅・高さを計算
  const calculateResolution = (aspectRatio: ExtendedAspectRatio, longSide: LongSideResolution): { width: number; height: number } => {
    switch (aspectRatio) {
      case '16:9':
        return { width: longSide, height: Math.round(longSide * 9 / 16) };
      case '4:3':
        return { width: longSide, height: Math.round(longSide * 3 / 4) };
      case '1:1':
        return { width: longSide, height: longSide };
      case '9:16':
        return { width: Math.round(longSide * 9 / 16), height: longSide };
      case '3:4':
        return { width: Math.round(longSide * 3 / 4), height: longSide };
      case '6:19':
        return { width: Math.round(longSide * 6 / 19), height: longSide };
      default:
        return { width: longSide, height: Math.round(longSide * 9 / 16) };
    }
  };

  // 現在の解像度を取得
  const getCurrentResolution = () => {
    const currentAspectRatio = getCurrentAspectRatio();
    return calculateResolution(currentAspectRatio, longSideResolution);
  };

  // WebCodecsで指定解像度/fpsがサポートされるか事前検証し、メッセージとボタン無効化を制御
  useEffect(() => {
    let cancelled = false;
    const checkSupport = async () => {
      try {
        const { width, height } = getCurrentResolution();
        const curFps = fps;
        const currentAR = getCurrentAspectRatio();

        const VE: any = (window as any).VideoEncoder;
        if (!VE || typeof VE.isConfigSupported !== 'function') {
          if (!cancelled) setWebcodecsUnsupportedMsg('この環境はWebCodecsをサポートしていません。');
          return;
        }

        // Same candidates as the exporter (hardware first, software fallback)
        const supported = (await findSupportedH264Config(width, height, curFps)) !== null;

        if (cancelled) return;
        if (supported) {
          setWebcodecsUnsupportedMsg(null);
          return;
        }

        // Contextual messages
        if (currentAR === '1:1' && width === 1920 && height === 1920) {
          setWebcodecsUnsupportedMsg('縦横比1:1の場合 1920 では出力できません。解像度を 1440 以下に下げてください。');
        } else {
          setWebcodecsUnsupportedMsg(`現在の設定ではWebCodecsで出力できません（${width}x${height}@${curFps}）。解像度やフレームレートを調整してください。`);
        }
      } catch {
        if (!cancelled) setWebcodecsUnsupportedMsg('WebCodecs設定検証中に問題が発生しました。別の解像度をお試しください。');
      }
    };
    checkSupport();
    return () => { cancelled = true; };
  }, [longSideResolution, fps, getCurrentResolution, getCurrentAspectRatio]);

  // ステータス表示の更新
  const showStatus = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setStatus(message);
    setStatusType(type);
    
    setTimeout(() => {
      setStatus('');
    }, 3000);
  }, []);

  // 時間を mm:ss.sss 形式に変換
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };

  // mm:ss.sss 形式から時間を変換
  const parseTime = (timeStr: string): number => {
    const match = timeStr.match(/^(\d+):(\d+)\.(\d+)$/);
    if (!match) return 0;
    
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = parseInt(match[3], 10);
    
    return (minutes * 60 + seconds) * 1000 + milliseconds;
  };

  // 楽曲の長さをエンジンから取得し、推奨設定を計算
  useEffect(() => {
    if (engine) {
      const duration = engine.getMaxTime();
      
      if (endTime === 60000) {
        setEndTime(duration);
        setEndTimeInput(formatTime(duration));
      }
    }
  }, [engine, endTime]);

  // 背景動画フレームレート検出
  useEffect(() => {
    const detectBackgroundVideoFps = async () => {
      if (engine) {
        const backgroundVideo = engine.getBackgroundVideo();
        if (backgroundVideo && backgroundVideo.src) {
          try {
            // ElectronMediaManagerから背景動画のファイルパスを取得
            const { electronMediaManager } = await import('../../services/ElectronMediaManager');
            const videoFilePath = electronMediaManager.getCurrentVideoFilePath();
            
            if (videoFilePath) {
              // IPCでffprobeを実行して背景動画のフレームレートを取得
              const { getElectronAPI } = await import('../../../shared/electronAPI');
              const electronAPI = getElectronAPI();
              
              if (electronAPI && electronAPI.getVideoMetadata) {
                const metadata = await electronAPI.getVideoMetadata(videoFilePath);
                if (metadata && metadata.frameRate) {
                  setBackgroundVideoFps(metadata.frameRate);
                  
                  // フレームレート推奨を生成
                  if (metadata.frameRate === 24) {
                    setFpsRecommendation('背景動画は24fpsです。24fps出力を推奨します。');
                    setFps(24); // 自動的に24fpsに設定
                  } else if (metadata.frameRate === 30) {
                    setFpsRecommendation('背景動画は30fpsです。30fps出力を推奨します。');
                    setFps(30);
                  } else if (metadata.frameRate === 60) {
                    setFpsRecommendation('背景動画は60fpsです。60fps出力を推奨します。');
                    setFps(60);
                  } else {
                    setFpsRecommendation(`背景動画は${metadata.frameRate}fpsです。最も近い標準フレームレートを選択してください。`);
                  }
                }
              }
            }
          } catch (error) {
            console.warn('背景動画フレームレート検出に失敗:', error);
          }
        } else {
          setBackgroundVideoFps(null);
          setFpsRecommendation('');
        }
      }
    };

    detectBackgroundVideoFps();
  }, [engine]); // engineが変更された時のみ実行

  // 実際のエクスポート処理（透過背景はProRes 4444、それ以外はロックステップ）
  const handleExport = async () => {
    if (engine.isBackgroundTransparent()) {
      await handleTransparentExport();
    } else {
      await handleLockstepExport();
    }
  };

  // 透過背景の書き出し（ProRes 4444 / .mov）
  const handleTransparentExport = async () => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.alphaExportStart) {
      setExportError('透過書き出し機能がアプリに反映されていません。Electronアプリを完全に終了して再起動してください。');
      return;
    }

    try {
      const defaultFileName = `transparent_export_${new Date().toISOString().replace(/[:.]/g, '-')}.mov`;
      const filePath = await electronAPI.showSaveDialogForAlphaVideo(defaultFileName);
      if (!filePath) return; // キャンセル

      setIsExporting(true);
      setProgress(0);
      setExportError(null);

      const exporter = new TransparentVideoExporter(engine);
      exporterRef.current = exporter;
      const resolution = getCurrentResolution();
      let audioPath: string | undefined = undefined;
      if (includeMusicTrack) {
        try {
          const { electronMediaManager } = await import('../../services/ElectronMediaManager');
          audioPath = electronMediaManager.getCurrentAudioFilePath() || undefined;
        } catch {}
      }

      const outPath = await exporter.start({
        fps,
        width: resolution.width,
        height: resolution.height,
        startTime: useCustomRange ? startTime : 0,
        endTime: useCustomRange ? endTime : engine.getMaxTime(),
        audioPath,
        outputPath: filePath
      }, p => {
        setProgress(Math.round(p.overall * 100));
        setStepIndex(p.step);
        setStepCount(p.steps);
        setStepName(p.stepName);
        setEtaSeconds(p.etaSeconds ?? null);
      });

      showStatus(`透過動画（ProRes 4444）を出力しました: ${outPath}`, 'success');
    } catch (error) {
      console.error('Transparent export failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      if (message !== 'Export cancelled') setExportError(message);
    } finally {
      setIsExporting(false);
      exporterRef.current = null;
    }
  };

  // ロックステップ（WebCodecs）高速エクスポート（プロジェクトタブ版・デバッグUI）
  const handleLockstepExport = async () => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) {
      setExportError('Electron APIが利用できません');
      return;
    }

    try {
      // ファイル保存ダイアログを表示
      const defaultFileName = `lockstep_export_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
      const filePath = await electronAPI.showSaveDialogForVideo(defaultFileName);
      if (!filePath) return; // キャンセル

      setIsExporting(true);
      setProgress(0);
      setExportError(null);

      exporterRef.current = new WebCodecsLockstepExporter(engine);
      const exporter = exporterRef.current;
      if (!exporter.isSupported) {
        throw new Error('この環境はWebCodecsをサポートしていません。通常のエクスポートを使用してください。');
      }

      // 解像度・区間・音声パスを準備
      const resolution = getCurrentResolution();
      let audioPath: string | undefined = undefined;
      if (includeMusicTrack) {
        try {
          const { electronMediaManager } = await import('../../services/ElectronMediaManager');
          audioPath = electronMediaManager.getCurrentAudioFilePath() || undefined;
        } catch {}
      }

      const outPath = await exporter.start({
        fileName: filePath.split(/[/\\]/).pop() || 'lockstep_export.mp4',
        fps,
        width: resolution.width,
        height: resolution.height,
        startTime: useCustomRange ? startTime : 0,
        endTime: useCustomRange ? endTime : engine.getMaxTime(),
        audioPath,
        outputPath: filePath
      }, (p) => {
        if (typeof p === 'number') {
          setProgress(p * 100);
          setStepIndex(null); setStepCount(null); setStepName(null); setEtaSeconds(null);
        } else {
          setProgress(Math.round(p.overall * 100));
          setStepIndex(p.step);
          setStepCount(p.steps);
          setStepName(p.stepName);
          setEtaSeconds(p.etaSeconds ?? null);
        }
      });

      if (outPath) {
        showStatus(`ロックステップで出力しました: ${outPath}`, 'success');
      }
    } catch (error) {
      console.error('Lockstep export failed:', error);
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
      exporterRef.current = null;
    }
  };

  // エクスポートのキャンセル処理
  const handleCancelExport = async () => {
    if (!isExporting) return;
    try {
      exporterRef.current?.cancel();
      setExportError(null);
      showStatus('動画出力をキャンセルしました', 'info');
    } catch (error) {
      console.error('Failed to cancel export:', error);
      setExportError('エクスポートのキャンセルに失敗しましたが、処理は停止されました');
    } finally {
      setIsExporting(false);
      setProgress(0);
      setBatchProgress(undefined);
      setMemoryUsage(undefined);
      exporterRef.current = null;
    }
  };

  const handleSrtExport = async () => {
    const content = createSrt(engine.getTimelineData().lyrics);
    if (!content) {
      setSrtStatusType('error');
      setSrtStatus('出力できる歌詞データがありません');
      return;
    }

    const audioPath = engine.getAudioFilePath();
    const audioFileName = audioPath?.split(/[/\\]/).pop() || 'lyrics';
    const defaultFileName = `${audioFileName.replace(/\.[^.]+$/, '') || 'lyrics'}.srt`;

    if (typeof window.electronAPI?.exportSrt !== 'function') {
      setSrtStatusType('error');
      setSrtStatus('SRT出力機能がアプリに反映されていません。Electronアプリを完全に終了して再起動してください。');
      return;
    }

    setIsExportingSrt(true);
    setSrtStatus('');
    try {
      const filePath = await window.electronAPI.exportSrt(content, defaultFileName);
      if (!filePath) {
        setSrtStatusType('info');
        setSrtStatus('SRT出力をキャンセルしました');
        return;
      }
      setSrtStatusType('success');
      setSrtStatus(`SRTを書き出しました: ${filePath}`);
    } catch (error) {
      console.error('SRT export failed:', error);
      setSrtStatusType('error');
      const message = error instanceof Error ? error.message : String(error);
      setSrtStatus(`SRTの書き出しに失敗しました: ${message}`);
    } finally {
      setIsExportingSrt(false);
    }
  };

  const handlePngExport = async () => {
    if (typeof window.electronAPI?.exportPng !== 'function') {
      setPngStatusType('error');
      setPngStatus('PNG出力機能がアプリに反映されていません。Electronアプリを完全に終了して再起動してください。');
      return;
    }

    setIsExportingPng(true);
    setPngStatus('');
    try {
      // 現在時刻の全シーンと共通Post FXを最終キャンバスへ反映する。
      const captureTime = engine.currentTime;
      engine.setCurrentTime(captureTime);
      engine.app.render();

      const capturedCanvas = engine.app.renderer.extract.canvas() as HTMLCanvasElement;
      const blob = await new Promise<Blob>((resolve, reject) => {
        capturedCanvas.toBlob(result => {
          if (result) resolve(result);
          else reject(new Error('PNG画像の生成に失敗しました'));
        }, 'image/png');
      });
      const imageData = new Uint8Array(await blob.arrayBuffer());
      const timeLabel = formatTime(captureTime).replace(/[:.]/g, '-');
      const filePath = await window.electronAPI.exportPng(imageData, `utavista_${timeLabel}.png`);

      if (!filePath) {
        setPngStatusType('info');
        setPngStatus('PNG出力をキャンセルしました');
        return;
      }

      setPngStatusType('success');
      setPngStatus(`PNGを書き出しました: ${filePath}`);
    } catch (error) {
      console.error('PNG export failed:', error);
      setPngStatusType('error');
      const message = error instanceof Error ? error.message : String(error);
      setPngStatus(`PNGの書き出しに失敗しました: ${message}`);
    } finally {
      setIsExportingPng(false);
    }
  };

  // メモリリーク調査用の状態
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  // メモリ使用量の取得（Chrome DevTools API使用）
  const getMemoryUsage = async (): Promise<number> => {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      return Math.round(memInfo.usedJSHeapSize / 1024 / 1024); // MB
    }
    return 0;
  };
  
  // GPUプロセスメモリ使用量の取得
  const getGPUMemoryUsage = async (): Promise<number> => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI || !electronAPI.getMemoryInfo) {
        return 0;
      }
      
      const memInfo = await electronAPI.getMemoryInfo();
      return Math.round(memInfo.gpu / 1024 / 1024); // MB
    } catch (error) {
      console.error('Failed to get GPU memory info:', error);
      return 0;
    }
  };

  // メモリリークテストの実行
  const runMemoryLeakTest = async () => {
    setIsTesting(true);
    setTestLogs([]);
    
    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString('ja-JP');
      setTestLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    const startMem = await getMemoryUsage();
    const startGPUMem = await getGPUMemoryUsage();
    addLog(`テスト開始 - JS Heap: ${startMem}MB, GPU: ${startGPUMem}MB`);

    // テスト設定
    const resolution = { width: 1920, height: 1080 };
    const stageConfig = engine.getStageConfig();
    const testOptions: ModernVideoExportOptions = {
      aspectRatio: stageConfig.aspectRatio,
      orientation: stageConfig.orientation,
      quality: 'CUSTOM',
      customResolution: resolution,
      videoQuality: 'medium',
      fps: 30,
      fileName: 'memory_test.mp4',
      startTime: 0,
      endTime: 10000, // 10秒のみ
      includeDebugVisuals: false,
      includeMusicTrack: false,
      outputPath: '' // メモリテストなので実際には出力しない
    };

    // 複数回エクスポートを実行
    const testCount = 3;
    for (let i = 0; i < testCount; i++) {
      addLog(`テスト ${i + 1}/${testCount} 開始`);
      
      try {
        // エクスポート実行（実際には保存しない）
        await engine.videoExporter.testMemoryLeaks(testOptions);
        
        // メモリ使用量を確認
        const currentMem = await getMemoryUsage();
        const currentGPUMem = await getGPUMemoryUsage();
        addLog(`テスト ${i + 1} 完了 - JS Heap: ${currentMem}MB (+${currentMem - startMem}MB), GPU: ${currentGPUMem}MB (+${currentGPUMem - startGPUMem}MB)`);
        
        // 少し待機してGCを促す
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 手動でGCを実行（開発ツールが開いている場合のみ動作）
        if ((window as any).gc) {
          (window as any).gc();
          addLog('手動GC実行');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const afterGCMem = await getMemoryUsage();
          const afterGCGPUMem = await getGPUMemoryUsage();
          addLog(`GC後 - JS Heap: ${afterGCMem}MB, GPU: ${afterGCGPUMem}MB`);
        }
        
      } catch (error) {
        addLog(`エラー: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const finalMem = await getMemoryUsage();
    const finalGPUMem = await getGPUMemoryUsage();
    addLog(`テスト完了 - 最終 JS Heap: ${finalMem}MB (差分: +${finalMem - startMem}MB), GPU: ${finalGPUMem}MB (差分: +${finalGPUMem - startGPUMem}MB)`);
    
    setIsTesting(false);
  };

  return (
    <div className="project-tab export-tab panel-content">
      {/* 動画出力セクション */}
      <Section title="動画出力">
        <div className="export-settings">
          {/* 長辺解像度設定 */}
          <Select 
            label="長辺解像度"
            value={longSideResolution} 
            onChange={(e) => setLongSideResolution(parseInt(e.target.value) as LongSideResolution)}
          >
            {longSideResolutionOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          {/* 出力サイズ（アスペクト比はコンテンツタブの設定に従う） */}
          <div className="resolution-display">
            <div className="resolution-row">
              <span>出力サイズ</span>
              <span className="resolution-value">
                {getCurrentResolution().width} × {getCurrentResolution().height}
              </span>
            </div>
            <span className="resolution-note">
              {aspectRatioOptions.find(option => option.value === getCurrentAspectRatio())?.label}・コンテンツタブで変更
            </span>
          </div>

          {isTransparentBackground && (
            <div className="export-info-note u-mb-sm">
              背景が「透過」のため、アルファチャンネル付きの ProRes 4444（.mov）で出力します。
              音声は非圧縮PCM（24bit・48kHz）で格納され、動画品質（CRF）の設定は使いません。ファイルサイズは大きくなります。
            </div>
          )}

          {/* 品質設定（CRF） */}
          <Select
            label="動画品質 (CRF値)"
            value={videoQuality}
            disabled={isTransparentBackground}
            onChange={(e) => setVideoQuality(e.target.value as VideoQualityCRF)}
          >
            {videoQualityOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          {/* FPS設定 */}
          <Select 
            label="フレームレート"
            value={fps} 
            onChange={(e) => setFps(parseInt(e.target.value) as 24 | 30 | 60)}
          >
            <option value={24}>24 FPS（映画品質）</option>
            <option value={30}>30 FPS（推奨）</option>
            <option value={60}>60 FPS（高品質）</option>
          </Select>
          {fpsRecommendation && (
            <div style={{ 
              marginTop: '4px', 
              fontSize: '0.9em', 
              color: backgroundVideoFps === fps ? '#4CAF50' : '#FF9800',
              fontWeight: '500'
            }}>
              💡 {fpsRecommendation}
            </div>
          )}

          {/* 時間範囲設定 */}
          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={useCustomRange}
                onChange={(e) => setUseCustomRange(e.target.checked)}
              />
              カスタム時間範囲を使用
            </label>
          </div>

          {/* 時間入力フィールド */}
          <div className="time-range-settings">
            <div className="time-input-container">
              <Input
                label="開始時間"
                type="text"
                value={startTimeInput}
                onChange={(e) => setStartTimeInput(e.target.value)}
                onBlur={() => setStartTime(parseTime(startTimeInput))}
                disabled={!useCustomRange}
                placeholder="00:00.000"
              />
              <span className="u-text-muted">～</span>
              <Input
                label="終了時間"
                type="text"
                value={endTimeInput}
                onChange={(e) => setEndTimeInput(e.target.value)}
                onBlur={() => setEndTime(parseTime(endTimeInput))}
                disabled={!useCustomRange}
                placeholder="03:12.500"
              />
            </div>
          </div>

          {/* 楽曲トラック設定 */}
          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={includeMusicTrack}
                onChange={(e) => setIncludeMusicTrack(e.target.checked)}
              />
              楽曲を含める
            </label>
          </div>

          {/* エクスポート進捗（ボタンの上へ移動） */}
          {isExporting && (
            <div className="export-progress u-mb-md">
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progress}%` }}
                />
                <span className="progress-text">{Math.round(progress)}%</span>
              </div>
              <div className="export-info">
                {stepIndex && stepCount && (
                  <span>ステップ {stepIndex}/{stepCount}{stepName ? `（${stepName}）` : ''}</span>
                )}
                {etaSeconds !== null && (
                  <span>残り予測時間: {new Date((etaSeconds || 0) * 1000).toISOString().substr(14, 5)}</span>
                )}
                {batchProgress !== undefined && (
                  <span>バッチ進捗: {Math.round(batchProgress)}%</span>
                )}
                {memoryUsage !== undefined && (
                  <span>メモリ使用量: {memoryUsage}MB</span>
                )}
              </div>
            </div>
          )}

          {/* エクスポートボタン（進捗の下に配置） */}
          <div>
            {!isExporting && !isTransparentBackground && webcodecsUnsupportedMsg && (
              <div className="export-warning u-mb-sm">{webcodecsUnsupportedMsg}</div>
            )}
            {!isExporting ? (
              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={handleExport}
                disabled={!isTransparentBackground && !!webcodecsUnsupportedMsg}
              >
                {isTransparentBackground ? '透過動画を出力（ProRes 4444）' : '動画を出力'}
              </Button>
            ) : (
              <Button 
                variant="danger"
                size="large"
                fullWidth
                onClick={handleCancelExport}
              >
                キャンセル
              </Button>
            )}
            {/* 実験ボタンは廃止（ロックステップに一本化） */}
          </div>

          {/* エラー表示 */}
          {exportError && (
            <StatusMessage 
              type="error" 
              message={exportError}
              onClose={() => setExportError(null)}
            />
          )}

          {status && (
            <StatusMessage
              type={statusType}
              message={status}
              onClose={() => setStatus('')}
            />
          )}
        </div>
      </Section>

      <Section title="静止画（PNG）出力">
        <div className="image-export-settings">
          <p>タイムラインの現在位置を、背景・文字・共通Post FXを合成した1枚のPNGとして書き出します。</p>
          <Button
            variant="secondary"
            size="large"
            fullWidth
            onClick={handlePngExport}
            disabled={isExportingPng || isExporting}
          >
            {isExportingPng ? 'PNGを書き出し中…' : '現在のフレームをPNGで書き出す'}
          </Button>
          {pngStatus && (
            <StatusMessage
              type={pngStatusType}
              message={pngStatus}
              onClose={() => setPngStatus('')}
            />
          )}
        </div>
      </Section>

      <Section title="字幕（SRT）出力">
        <div className="subtitle-export-settings">
          <p>歌詞のフレーズ開始・終了時刻を使い、SubRip字幕ファイルとして書き出します。</p>
          <Button
            variant="secondary"
            size="large"
            fullWidth
            onClick={handleSrtExport}
            disabled={isExportingSrt}
          >
            {isExportingSrt ? 'SRTを書き出し中…' : 'SRTを書き出す'}
          </Button>
          {srtStatus && (
            <StatusMessage
              type={srtStatusType}
              message={srtStatus}
              onClose={() => setSrtStatus('')}
            />
          )}
        </div>
      </Section>

      {/* メモリリークテストセクション（デバッグ用） */}
      {/* <Section title="メモリリークテスト（開発用）" className="test-section">
        <div className="test-controls">
          <Button 
            variant="secondary"
            onClick={runMemoryLeakTest}
            disabled={isTesting}
          >
            {isTesting ? 'テスト実行中...' : 'メモリリークテスト実行'}
          </Button>
          <Button 
            variant="secondary"
            onClick={() => setTestLogs([])}
          >
            ログクリア
          </Button>
        </div>
        
        {testLogs.length > 0 && (
          <div className="test-log">
            <pre>{testLogs.join('\n')}</pre>
          </div>
        )}
      </Section> */}
    </div>
  );
};

export default ExportTab;
