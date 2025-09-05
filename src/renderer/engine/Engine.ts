import * as PIXI from 'pixi.js';
import { InstanceManager } from './InstanceManager';
import { PhraseUnit, CharUnit, WordUnit, LyricsData, AspectRatio, Orientation, StageConfig, BackgroundConfig, BackgroundFitMode } from '../types/types';
import { IAnimationTemplate } from '../types/types';
import { VideoExporter } from '../export/video/VideoExporter';
import { Howl } from 'howler';
import { GridOverlay } from '../utils/GridOverlay';
import { DebugManager } from '../utils/debug';
import { TemplateManager } from './TemplateManager';
import { ParameterManagerV2 } from './ParameterManagerV2';
import { ParameterProcessor } from '../utils/ParameterProcessor';
import { ProjectStateManager } from './ProjectStateManager';
import { calculateStageSize, getDefaultStageConfig } from '../utils/stageCalculator';
import { persistenceService } from '../services/PersistenceService';
import { calculateCharacterIndices } from '../utils/characterIndexCalculator';
import { RenderTexturePool } from './RenderTexturePool';
import { StandardParameters } from '../types/StandardParameters';
import { ParameterValidator } from '../utils/ParameterValidator';
import { ParameterRegistry } from '../utils/ParameterRegistry';
import { UnifiedRestoreManager } from './UnifiedRestoreManager';
import { SparkleEffectPrimitive } from '../primitives/effects/SparkleEffectPrimitive';
import { ProjectFileData, AutoSaveData } from '../../types/UnifiedProjectData';
import { OptimizedParameterUpdater } from './OptimizedParameterUpdater';

export class Engine {
  // パラメータカテゴリ分類
  private static readonly LAYOUT_AFFECTING_PARAMS = new Set([
    'fontSize', 'letterSpacing', 'lineHeight',
    'phraseOffsetX', 'phraseOffsetY', 'wordOffsetX', 'wordOffsetY', 
    'charOffsetX', 'charOffsetY', 'offsetX', 'offsetY',
    'textAlign', 'verticalAlign', 'maxLines', 'lineCount'
  ]);

  app: PIXI.Application;
  instanceManager: InstanceManager;
  canvasContainer: HTMLElement;
  phrases: PhraseUnit[] = [];
  isRunning: boolean = false;
  currentTime: number = 0;
  charPositions: Map<string, {x: number, y: number}> = new Map();
  lastUpdateTime: number = 0;
  private updateFn: (delta: number) => void;
  
  // デバッグ更新のスロットリング用
  private lastDebugUpdateTime: number = 0;
  private readonly DEBUG_UPDATE_INTERVAL: number = 100; // 100ms間隔でデバッグ更新
  
  // スリープ検知用
  private readonly MAX_ELAPSED_TIME: number = 100; // 最大経過時間（スリープ検知用）
  private handleVisibilityChange?: () => void;
  private wasRunningBeforeSleep: boolean = false;
  
  // 複数テンプレート対応のためのマネージャークラス
  templateManager: TemplateManager;
  parameterManager: ParameterManagerV2; // V2専用
  projectStateManager: ProjectStateManager;
  
  // テンプレート
  template: IAnimationTemplate;
  
  // 音声関連のプロパティ
  audioPlayer?: Howl;
  audioDuration: number = 10000; // デフォルト10秒
  audioFilePath?: string; // 音楽ファイルパス
  audioFileName?: string; // 音楽ファイル名

  // 方眼目盛りと座標表示用のオーバーレイ
  private gridOverlay?: GridOverlay;
  
  // デバッグマネージャー
  private debugManager: DebugManager;
  
  // 動画エクスポーター
  videoExporter: VideoExporter;
  
  // RenderTextureプール（メモリ効率化）
  private renderTexturePool?: RenderTexturePool;
  
  // 統一復元マネージャー
  private unifiedRestoreManager: UnifiedRestoreManager;
  private optimizedUpdater: OptimizedParameterUpdater;
  
  // ステージ設定
  private stageConfig: StageConfig;
  
  // 背景レイヤー関連
  private backgroundLayer: PIXI.Container;
  private backgroundSprite?: PIXI.Sprite;
  private backgroundVideo?: HTMLVideoElement;
  private backgroundVideoSprite?: PIXI.Sprite;
  private backgroundConfig: BackgroundConfig = {
    type: 'color',
    backgroundColor: '#000000'
  };
  
  // 背景動画ファイル名を保存（復元用）
  private backgroundVideoFileName: string | null = null;
  
  // 自動保存関連
  private autoSaveTimer?: number;
  private lastAutoSaveTime: number = 0;
  private autoSaveEnabled: boolean = true;
  private static readonly AUTO_SAVE_INTERVAL = 30000; // 30秒
  private static readonly AUTO_SAVE_EXPIRY = 24 * 60 * 60 * 1000; // 24時間
  
  // リサイズハンドラーの参照（メモリリーク防止）
  private boundHandleResize: () => void;

  constructor(
    containerId: string, 
    template: IAnimationTemplate,
    defaultParams: Partial<StandardParameters> = {},
    templateId: string = 'fadeslidetext'
  ) {
    // グローバル参照を設定（パーティクルシステムなどから時刻取得用）
    if (typeof window !== 'undefined') {
      (window as any).engineInstance = this;
    }
    
    // テンプレートの保存
    this.template = template;
    
    // 各マネージャーの初期化
    this.templateManager = new TemplateManager();
    this.templateManager.registerTemplate(templateId, template, {name: templateId}, true);
    
    // ParameterManagerV2の初期化（V2専用）
    this.parameterManager = new ParameterManagerV2();
    this.parameterManager.setTemplateManager(this.templateManager); // TemplateManager参照を設定
    this.parameterManager.updateGlobalDefaults(defaultParams);
    
    // プロジェクト状態マネージャーの初期化
    this.projectStateManager = new ProjectStateManager({
      id: `state_${Date.now()}`,
      timestamp: Date.now(),
      label: '初期状態',
      templateAssignments: {},
      globalParams: { ...defaultParams },
      objectParams: {},
      defaultTemplateId: templateId
    });
    
    // 個別設定変更リスナーの登録
    this.parameterManager.addIndividualSettingListener('engine-timeline-sync', (phraseId: string, enabled: boolean) => {
      console.log(`[Engine] Individual setting changed: ${phraseId} -> ${enabled}`);
      
      // TimelinePanel の再レンダリングをトリガーするイベントを発火
      if (enabled) {
        window.dispatchEvent(new CustomEvent('objects-activated', { 
          detail: { phraseIds: [phraseId] }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('objects-deactivated', { 
          detail: { phraseIds: [phraseId] }
        }));
      }
    });
    
    
    // ステージ設定の初期化（まずはデフォルト値で開始）
    this.stageConfig = getDefaultStageConfig();
    
    // コンテナの取得
    this.canvasContainer = document.getElementById(containerId) as HTMLElement;
    if (!this.canvasContainer) {
      throw new Error(`Container element with ID "${containerId}" not found`);
    }

    // デフォルトのステージサイズを計算
    const { width, height } = calculateStageSize(this.stageConfig.aspectRatio, this.stageConfig.orientation);

    // PIXIアプリケーションの初期化
    this.app = new PIXI.Application({
      width: width,
      height: height,
      backgroundColor: 0x000000,
      resolution: 1, // 常に1で固定（スケーリングはCSSで行う）
      antialias: true,
    });

    // PIXIアプリケーションの初期化完了を待つ
    if (this.app.init) {
      // PIXI v8対応: awaitする必要がある場合
    }

    // グローバル参照として保存（テンプレートからアクセスできるように）
    (window as any).__PIXI_APP__ = this.app;

    // PIXIキャンバスをDOMに追加
    this.canvasContainer.innerHTML = ''; // 既存の内容をクリア
    this.canvasContainer.appendChild(this.app.view as HTMLCanvasElement);
    
    // CSSスケーリングを適用
    this.applyCSSScaling();

    // 背景レイヤーを初期化（mainContainerより先に追加）
    this.backgroundLayer = new PIXI.Container();
    this.backgroundLayer.name = 'backgroundLayer';
    this.backgroundLayer.zIndex = -1000; // 最下層に設定
    this.app.stage.addChild(this.backgroundLayer);
    this.app.stage.sortChildren(); // zIndexでソート

    // インスタンスマネージャーの初期化
    this.instanceManager = new InstanceManager(this.app, template, defaultParams);
    
    // インスタンスマネージャーにV2パラメータマネージャーを設定
    this.instanceManager.setParameterManagerV2(this.parameterManager);
    
    // V2変更リスナーを設定（スロットリング付き）
    let updateTimeout: NodeJS.Timeout | null = null;
    this.parameterManager.addChangeListener('engine', (phraseId, params) => {
      if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
      }
      
      // 100ms後に実行するようスロットリング
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      updateTimeout = setTimeout(() => {
        // レンダリング更新をトリガー
        if (this.instanceManager) {
          this.instanceManager.updateExistingInstances();
          this.instanceManager.update(this.currentTime);
        }
        updateTimeout = null;
      }, 100);
    });
    
    // 統一復元マネージャーの初期化
    this.unifiedRestoreManager = new UnifiedRestoreManager(
      this,
      this.parameterManager,
      this.projectStateManager,
      this.templateManager,
      this.instanceManager
    );
    
    // OptimizedParameterUpdaterの初期化
    this.optimizedUpdater = new OptimizedParameterUpdater();

    // ステージの原点を明示的に設定 (左上を(0, 0)にする)
    this.app.stage.position.set(0, 0);

    // 方眼目盛りオーバーレイを初期化
    this.gridOverlay = new GridOverlay(this.app);
    this.gridOverlay.setVisible(false); // デフォルトは非表示
    
    // デバッグマネージャーを初期化
    this.debugManager = new DebugManager(this.app, {
      enabled: false, // デフォルトで無効
      showGrid: false, // 方眼目盛りも無効
      logToConsole: true // コンソールログは有効
    });
    
    // 動画エクスポーターを初期化
    this.videoExporter = new VideoExporter(this);

    // ウィンドウリサイズイベントの処理（メモリリーク防止のためbind済み参照を保存）
    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
    
    // システムスリープ/ウェイクイベントのハンドラを設定
    this.setupSleepWakeHandlers();
    
    // updateFn をプロパティに保存して、ticker.remove 時に参照できるようにする
    this.updateFn = this.update.bind(this);
    
    // アニメーションフレームハンドラの設定
    this.app.ticker.add(this.updateFn);
    this.app.ticker.start();

    // デバッグ出力
    
    // 自動保存機能を初期化
    this.setupAutoSave();
    
    // 起動時に自動保存データの復元を試みる（PIXI初期化後に実行）
    setTimeout(async () => {
      try {
        // PIXIアプリケーションの初期化が完了するまで待機
        await this.waitForPixiInitialization();
        
        // まずステージ設定だけを先に適用
        await this.initializeStageConfigFromAutoSave();
        
        // 自動復元を実行（ダイアログなし）
        await this.silentAutoRestore();
        
      } catch (error) {
        console.error('Engine: 自動保存データの確認でエラーが発生しました:', error);
      }
    }, 100);
  }

  // PIXIアプリケーションの初期化完了を待機
  private async waitForPixiInitialization(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 50; // 最大5秒待機
    
    while (attempts < maxAttempts) {
      if (this.app && this.app.screen && this.app.screen.width > 0 && this.app.screen.height > 0) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    console.warn('Engine: PIXI初期化の完了を確認できませんでした');
  }

  // 歌詞データをロード (PhraseUnit[] を受け入れる)
  loadLyrics(data: PhraseUnit[]) {
    console.log('Engine.loadLyrics: 歌詞データのロードを開始します', {
      dataLength: data?.length,
      firstPhrase: data?.[0]
    });
    
    try {
      // まず各オブジェクトに固有のIDが付与されているか確認し、なければ設定する
      const dataWithIds = this.ensureUniqueIds(data);
      console.log('Engine.loadLyrics: IDの確認・設定が完了しました');
      
      // 文字インデックスを計算
      this.phrases = calculateCharacterIndices(dataWithIds);
      console.log('Engine.loadLyrics: 文字インデックスの計算が完了しました', {
        phraseCount: this.phrases.length
      });
      
      // 歌詞データから最大時間を計算してaudioDurationを更新
      this.calculateAndSetAudioDuration();
      console.log('Engine.loadLyrics: オーディオ時間の計算が完了しました', {
        audioDuration: this.audioDuration
      });
      
      this.charPositions.clear();

      
      // 既存の文字タイミングを保持するため、再計算は行わない

      // V2: 各フレーズをParameterManagerV2に初期化
      this.phrases.forEach((phrase, index) => {
        try {
          if (!this.parameterManager.isPhraseInitialized(phrase.id)) {
            const templateId = this.templateManager.getTemplateForObject(phrase.id).constructor.name || 
                              this.templateManager.getDefaultTemplateId();
            this.parameterManager.initializePhrase(phrase.id, templateId);
          }
        } catch (e) {
          console.error(`Engine.loadLyrics: フレーズ ${index} の初期化中にエラーが発生しました:`, {
            phraseId: phrase.id,
            phrase: phrase,
            error: e,
            errorMessage: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined
          });
          throw e;
        }
      });
      console.log('Engine.loadLyrics: ParameterManagerの初期化が完了しました');
      
      // ステージ上に歌詞配置を初期化
      this.arrangeCharsOnStage();
      console.log('Engine.loadLyrics: ステージ上の歌詞配置が完了しました');
      
      // インスタンスマネージャーにロード
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      console.log('Engine.loadLyrics: インスタンスマネージャーへのロードが完了しました');
      
      // 初期表示（0ms時点）を設定
      this.instanceManager.update(0);
      console.log('Engine.loadLyrics: 初期表示の設定が完了しました');
      
      // タイムライン更新イベントを発火してUIコンポーネントに通知
      this.dispatchTimelineUpdatedEvent();
      console.log('Engine.loadLyrics: タイムライン更新イベントを発火しました');
      
      // フレーズコンテナの位置設定はテンプレート側に任せる
      // 強制位置設定のコードを削除
      
      // 歌詞データロード後に自動保存
      if (this.autoSaveEnabled) {
        this.autoSaveToLocalStorage();
        console.log('Engine.loadLyrics: ローカルストレージへの自動保存が完了しました');
      }
      
      console.log('Engine.loadLyrics: 歌詞データのロードが正常に完了しました');
    } catch (error) {
      console.error('Engine.loadLyrics: 歌詞データのロード中にエラーが発生しました:', {
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        dataInfo: {
          dataLength: data?.length,
          hasData: !!data,
          isArray: Array.isArray(data)
        }
      });
      throw error; // エラーを再スローして呼び出し元で処理できるようにする
    }
  }

  // 全てのフレーズ、単語、文字にユニークIDが設定されていることを確認する
  private ensureUniqueIds(data: PhraseUnit[]): PhraseUnit[] {
    return data.map((phrase, pi) => {
      // フレーズにIDがない場合は設定
      if (!phrase.id) {
        phrase.id = `phrase_${pi}`;
      }
      
      // 全ての単語を処理
      const words = phrase.words.map((word, wi) => {
        // 単語にIDがない場合は設定（拡張ID形式で生成）
        if (!word.id) {
          // 単語の文字から半角・全角数をカウント
          const { halfWidth, fullWidth } = this.countCharacterTypes(word.chars);
          word.id = `${phrase.id}_word_${wi}_h${halfWidth}f${fullWidth}`;
        }
        
        // 全ての文字を処理
        const chars = word.chars.map((char, ci) => {
          // 文字にIDがない場合は設定
          if (!char.id) {
            char.id = `${word.id}_char_${ci}`;
          }
          return char;
        });
        
        return { ...word, chars };
      });
      
      return { ...phrase, words };
    });
  }

  /**
   * 文字配列から半角・全角文字数をカウント
   */
  private countCharacterTypes(chars: CharUnit[]): { halfWidth: number; fullWidth: number } {
    let halfWidth = 0;
    let fullWidth = 0;
    
    chars.forEach(char => {
      if (this.isHalfWidthChar(char.char)) {
        halfWidth++;
      } else {
        fullWidth++;
      }
    });
    
    return { halfWidth, fullWidth };
  }

  /**
   * 半角文字判定
   */
  private isHalfWidthChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
  }
  
  // 歌詞データと音楽データから最大時間を計算してaudioDurationを設定する
  private calculateAndSetAudioDuration(): void {
    let lyricsMaxTime = 0;
    
    // 歌詞データから最大時間を計算
    if (this.phrases.length > 0) {
      lyricsMaxTime = Math.max(...this.phrases.map(phrase => phrase.end));
    }
    
    // 音楽データの長さを取得
    let musicMaxTime = 0;
    if (this.audioPlayer) {
      const state = this.audioPlayer.state();
      const duration = this.audioPlayer.duration ? this.audioPlayer.duration() : 0;
      
      if (this.audioPlayer.duration && duration > 0) {
        musicMaxTime = duration * 1000; // ミリ秒に変換
      }
    }
    
    // 歌詞データと音楽データの長い方を選択
    const maxTime = Math.max(lyricsMaxTime, musicMaxTime);
    
    // 最大時間にバッファ（0.2秒）を追加して設定
    // ただし、最小でも10秒は確保する
    this.audioDuration = Math.max(maxTime + 200, 10000);
    
  }
  
  // 文字カウント情報を追加する
  // 旧メソッドは削除（calculateCharacterIndicesを使用するため）
  // private addCharCountInfo(phrases: PhraseUnit[]): void { ... }
  
  // 全角判定ヘルパー関数 - 文字コードで判定
  private isFullWidthChar(char: string): boolean {
    // ASCII文字（半角）の範囲外か判定
    // 半角カタカナやロシア文字など一部例外があるが、英数字や一般的な半角記号はASCII範囲内
    const code = char.charCodeAt(0);
    if (code <= 0x7F) {  // ASCII範囲
      return false;
    }
    
    // 一般的な全角文字：日本語、中国語、韓国語、全角英数字など
    return true;
  }

  // 文字をステージ上に配置する
  /**
   * パラメータ変更が文字配置に影響するかを判定
   */
  private isLayoutAffectingChange(params: Partial<StandardParameters>): boolean {
    return Object.keys(params).some(key => Engine.LAYOUT_AFFECTING_PARAMS.has(key));
  }

  /**
   * 座標のみを再計算（文字カウント情報は保持）
   */
  private recalculateCharPositionsOnly() {
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;
    
    // charPositionsの座標のみクリア（Mapは既存のままで値のみ更新）
    this.phrases.forEach((phrase, phraseIndex) => {
      // フレーズのy座標を計算（垂直方向に配置）
      const phraseY = centerY - 50 + phraseIndex * 120; // フレーズ間の間隔を広げる
      
      // フレーズレベルのパラメータを取得
      const fontSize = phrase.params?.fontSize || this.instanceManager.getDefaultParams().fontSize || 42;
      const letterSpacing = phrase.params?.letterSpacing !== undefined ? 
                           phrase.params.letterSpacing : 
                           this.instanceManager.getDefaultParams().letterSpacing !== undefined ? 
                           this.instanceManager.getDefaultParams().letterSpacing : 1;
      
      // フレーズ全体の幅を計算
      let totalPhraseWidth = 0;
      
      // 各単語の幅を計算して配列に格納
      const wordWidths: number[] = [];
      phrase.words.forEach(word => {
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                 word.params.letterSpacing : letterSpacing;
        
        // 各文字の幅と間隔を計算
        let wordWidth = 0;
        word.chars.forEach((char, i) => {
          const charFontSize = char.params?.fontSize || wordFontSize;
          wordWidth += charFontSize * this.getCharWidthRatio(char.char);
          // 文字間にスペースを追加（最後の文字を除く）
          if (i < word.chars.length - 1) {
            wordWidth += wordLetterSpacing;
          }
        });
        
        wordWidths.push(wordWidth);
        totalPhraseWidth += wordWidth;
      });
      
      // 単語間のスペースを追加
      if (phrase.words.length > 1) {
        totalPhraseWidth += (phrase.words.length - 1) * letterSpacing * 3; // 単語間は文字間の3倍空ける
      }
      
      // フレーズ全体を中央揃えするための開始X座標
      let currentX = centerX - totalPhraseWidth / 2;
      
      // 各単語を配置
      phrase.words.forEach((word, wordIndex) => {
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                word.params.letterSpacing : letterSpacing;
        const wordOffsetX = word.params?.offsetX || 0;
        const wordOffsetY = word.params?.offsetY || 0;
        
        // 単語の開始X座標を記録
        const wordStartX = currentX;
        
        // 各文字を配置
        let charX = wordStartX;
        word.chars.forEach((char, charIndex) => {
          // 文字固有のパラメータを取得
          const charFontSize = char.params?.fontSize || wordFontSize;
          const charOffsetX = char.params?.offsetX || 0;
          const charOffsetY = char.params?.offsetY || 0;
          
          // 文字の幅を計算
          const charWidth = charFontSize * this.getCharWidthRatio(char.char);
          
          // 既存の文字IDの座標のみ更新
          this.charPositions.set(char.id, {
            x: charX + charWidth / 2 + wordOffsetX + charOffsetX,
            y: phraseY + wordOffsetY + charOffsetY
          });
          
          // 次の文字のために位置を更新
          charX += charWidth + wordLetterSpacing;
        });
        
        // 次の単語のために位置を更新
        currentX += wordWidths[wordIndex] + letterSpacing * 3; // 単語間のスペース
      });
    });
  }

  /**
   * 文字幅の比率を取得するヘルパーメソッド
   */
  private getCharWidthRatio(char: string): number {
    // 全角判定
    if (this.isFullWidthChar(char)) {
      return 1.0; // 全角文字はフォントサイズに対して同等幅
    }
    return 0.6; // 半角文字はフォントサイズの60%程度
  }

  arrangeCharsOnStage() {
    // PIXIアプリケーションが初期化されているかチェック
    if (!this.app || !this.app.screen) {
      console.error('Engine: PIXIアプリケーションが初期化されていません。arrangeCharsOnStageをスキップします。');
      return;
    }
    
    // 画面サイズが有効かチェック
    if (!this.app.screen.width || !this.app.screen.height || this.app.screen.width <= 0 || this.app.screen.height <= 0) {
      console.error('Engine: 無効な画面サイズが検出されました。arrangeCharsOnStageをスキップします。', {
        width: this.app.screen.width,
        height: this.app.screen.height
      });
      return;
    }
    
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;
    
    // フレーズごとに縦に配置
    this.phrases.forEach((phrase, phraseIndex) => {
      // フレーズIDがない場合は設定する
      if (!phrase.id) {
        phrase.id = `phrase_${phraseIndex}`;
        console.warn(`フレーズIDが未設定でした。生成します: ${phrase.id}`);
      }
      
      // フレーズのy座標を計算（垂直方向に配置）
      const phraseY = centerY - 50 + phraseIndex * 120; // フレーズ間の間隔を広げる
      
      // フレーズレベルのパラメータを取得
      const fontSize = phrase.params?.fontSize || this.instanceManager.getDefaultParams().fontSize || 42;
      const letterSpacing = phrase.params?.letterSpacing !== undefined ? 
                           phrase.params.letterSpacing : 
                           this.instanceManager.getDefaultParams().letterSpacing !== undefined ? 
                           this.instanceManager.getDefaultParams().letterSpacing : 1;
      
      // フレーズ全体の幅を計算
      let totalPhraseWidth = 0;
      
      // 各単語の幅を計算して配列に格納
      const wordWidths: number[] = [];
      phrase.words.forEach(word => {
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                 word.params.letterSpacing : letterSpacing;
        
        // 各文字の幅と間隔を計算
        let wordWidth = 0;
        word.chars.forEach((char, i) => {
          const charFontSize = char.params?.fontSize || wordFontSize;
          wordWidth += charFontSize * this.getCharWidthRatio(char.char);
          // 文字間にスペースを追加（最後の文字を除く）
          if (i < word.chars.length - 1) {
            wordWidth += wordLetterSpacing;
          }
        });
        
        wordWidths.push(wordWidth);
        totalPhraseWidth += wordWidth;
      });
      
      // 単語間のスペースを追加
      if (phrase.words.length > 1) {
        totalPhraseWidth += (phrase.words.length - 1) * letterSpacing * 3; // 単語間は文字間の3倍空ける
      }
      
      // フレーズ全体を中央揃えするための開始X座標
      let currentX = centerX - totalPhraseWidth / 2;
      
      // 各単語を配置
      phrase.words.forEach((word, wordIndex) => {
        // 単語IDがない場合は設定する（拡張ID形式）
        if (!word.id) {
          const { halfWidth, fullWidth } = this.countCharacterTypes(word.chars);
          word.id = `${phrase.id}_word_${wordIndex}_h${halfWidth}f${fullWidth}`;
          console.warn(`単語IDが未設定でした。生成します: ${word.id}`);
        }
        
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                word.params.letterSpacing : letterSpacing;
        const wordOffsetX = word.params?.offsetX || 0;
        const wordOffsetY = word.params?.offsetY || 0;
        
        // 単語の開始X座標を記録
        const wordStartX = currentX;
        
        // 各文字を配置
        let charX = wordStartX;
        word.chars.forEach((char, charIndex) => {
          // 文字IDがない場合は設定する
          if (!char.id) {
            char.id = `${word.id}_char_${charIndex}`;
            console.warn(`文字IDが未設定でした。生成します: ${char.id}`);
          }
          
          // 文字固有のパラメータを取得
          const charFontSize = char.params?.fontSize || wordFontSize;
          const charOffsetX = char.params?.offsetX || 0;
          const charOffsetY = char.params?.offsetY || 0;
          
          // 文字の幅を計算
          const charWidth = charFontSize * this.getCharWidthRatio(char.char);
          
          // 文字の座標を計算して設定（文字の中心が指定位置に来るようにする）
          this.charPositions.set(char.id, {
            x: charX + charWidth / 2 + wordOffsetX + charOffsetX,
            y: phraseY + wordOffsetY + charOffsetY
          });
          
          
          // 次の文字のために位置を更新
          charX += charWidth + wordLetterSpacing;
        });
        
        // 次の単語のために位置を更新
        currentX += wordWidths[wordIndex] + letterSpacing * 3; // 単語間のスペース
      });
    });
  }

  // ウィンドウリサイズハンドラ
  private handleResize() {
    try {
      
      // PIXIレンダラーのサイズは変更せず、CSSスケーリングのみ更新
      // これにより二重スケーリング問題を回避
      this.applyCSSScaling();
      
      // 歌詞配置の再調整（座標系は元のまま維持）
      this.arrangeCharsOnStage();
      
      // インスタンス位置を更新
      if (this.instanceManager) {
        this.instanceManager.updatePositions(this.charPositions);
        // 現在の時間で更新
        this.instanceManager.update(this.currentTime);
      }
      
    } catch (error) {
      console.error(`Resize error: ${error}`);
    }
  }

  // アニメーションフレーム更新
  private update(delta: number) {
    if (!this.isRunning) return;
    
    const now = performance.now();
    let elapsed = now - this.lastUpdateTime;
    
    // スリープ検知: 異常に大きな経過時間を検出
    if (elapsed > this.MAX_ELAPSED_TIME) {
      console.log(`[Engine] Sleep recovery detected: ${elapsed}ms elapsed, limiting to ${this.MAX_ELAPSED_TIME}ms`);
      elapsed = this.MAX_ELAPSED_TIME;
      // lastUpdateTimeをリセットして、次のフレームから正常に動作するように
      this.lastUpdateTime = now - elapsed;
    }
    
    // 16ms以上経過している場合のみ更新（約60FPS）
    if (elapsed < 16 && this.lastUpdateTime !== 0) {
      return;
    }
    
    // 音楽プレイヤーの現在再生位置を直接参照して同期
    let newTime = this.currentTime;
    
    if (this.audioPlayer && this.audioPlayer.state() === 'loaded') {
      // 音楽が読み込まれている場合は音楽の再生位置を参照（オフセットを逆計算）
      try {
        const audioCurrentTime = this.audioPlayer.seek() * 1000; // ミリ秒に変換
        if (typeof audioCurrentTime === 'number' && !isNaN(audioCurrentTime)) {
          const audioOffset = this.getAudioOffset();
          newTime = audioCurrentTime - audioOffset; // オフセットを逆算してアニメーション時間を計算
        }
      } catch (error) {
        // 音楽プレイヤーからの時間取得に失敗した場合は独立した時間進行にフォールバック
        newTime = this.currentTime + (elapsed || this.app.ticker.deltaMS);
      }
    } else {
      // 音楽が読み込まれていない場合は独立した時間進行
      newTime = this.currentTime + (elapsed || this.app.ticker.deltaMS);
    }
    
    // 終了時刻チェック - タイムライン終端で自動停止
    if (newTime >= this.audioDuration) {
      this.currentTime = this.audioDuration;
      this.pause();
      this.dispatchCustomEvent('timeline-ended', { endTime: this.audioDuration });
      return;
    }
    
    this.currentTime = newTime;
    this.lastUpdateTime = now;
    
    // インスタンスマネージャーの更新
    this.instanceManager.update(this.currentTime);
    
    // デバッグ情報の更新（スロットリング付き）
    const debugElapsed = now - this.lastDebugUpdateTime;
    if (debugElapsed >= this.DEBUG_UPDATE_INTERVAL) {
      this.updateDebugInfo();
      this.lastDebugUpdateTime = now;
    }
  }

  // 再生制御メソッド
  play() {
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    console.log('[Engine] 再生開始');
    
    // 音声がある場合は再生（オフセットを適用）
    if (this.audioPlayer && this.audioPlayer.state() === 'loaded') {
      const audioOffset = this.getAudioOffset();
      const adjustedTime = Math.max(0, (this.currentTime + audioOffset) / 1000); // 秒単位に変換、負の値は0にクランプ
      this.audioPlayer.seek(adjustedTime);
      this.audioPlayer.play();
      console.log(`[Engine] 音楽再生開始 - 現在時間: ${this.currentTime}ms, オフセット: ${audioOffset}ms, 調整後: ${adjustedTime}s`);
    } else {
      const state = this.audioPlayer ? this.audioPlayer.state() : 'none';
      console.warn(`Engine: 音声ファイルが読み込まれていないため、アニメーションのみ再生します (audioPlayer: ${this.audioPlayer ? '存在' : 'null'}, state: ${state})`);
    }
    
    // 背景動画がある場合は再生
    if (this.backgroundVideo) {
      this.backgroundVideo.currentTime = this.currentTime / 1000;
      this.backgroundVideo.play().catch(console.error);
    }
  }

  pause() {
    this.isRunning = false;
    console.log('[Engine] 再生停止');
    
    // 音声がある場合は一時停止
    if (this.audioPlayer) {
      this.audioPlayer.pause();
    }
    
    // 背景動画がある場合は一時停止
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
    }
  }

  reset() {
    this.currentTime = 0;
    this.lastUpdateTime = 0;
    this.instanceManager.update(this.currentTime);
    
    // 音声がある場合はリセット（オフセットを適用）
    if (this.audioPlayer) {
      this.audioPlayer.stop();
      const audioOffset = this.getAudioOffset();
      const adjustedTime = Math.max(0, audioOffset / 1000); // 秒単位に変換、負の値は0にクランプ
      this.audioPlayer.seek(adjustedTime);
      console.log(`[Engine] 音楽リセット - オフセット: ${audioOffset}ms, 調整後: ${adjustedTime}s`);
    }
    
    // 背景動画がある場合はリセット
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
      this.backgroundVideo.currentTime = 0;
    }
  }
  
  // システムスリープ/ウェイクイベントのハンドラ設定
  private setupSleepWakeHandlers(): void {
    // visibilitychangeイベントを使ってスリープ/ウェイクを検知
    this.handleVisibilityChange = () => {
      if (document.hidden) {
        // ページがバックグラウンドに移った時（スリープの可能性）
        console.log('[Engine] Page visibility hidden - possible sleep');
        // タイマーを一時停止
        if (this.isRunning) {
          this.wasRunningBeforeSleep = true;
          this.pause();
        }
      } else {
        // ページがフォアグラウンドに戻った時（ウェイク）
        console.log('[Engine] Page visibility visible - wake from sleep');
        // lastUpdateTimeをリセット
        this.lastUpdateTime = performance.now();
        this.lastDebugUpdateTime = performance.now();
        // スリープ前に再生中だった場合は再開
        if (this.wasRunningBeforeSleep) {
          this.wasRunningBeforeSleep = false;
          this.play();
        }
      }
    };
    
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }
  
  // スリープ/ウェイクイベントハンドラの削除
  private removeSleepWakeHandlers(): void {
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  /**
   * 統一シーク処理（プレビュー機能と動画エクスポートで共通）
   * 背景動画・アニメーション一括同期を実現
   */
  async seek(timeMs: number): Promise<void> {
    const seekTimestamp = Date.now();
    
    this.currentTime = timeMs;
    this.lastUpdateTime = performance.now();
    
    this.instanceManager.update(this.currentTime);
    
    // 音声がある場合は再生中でなくてもシークを実行（オフセットを適用）
    if (this.audioPlayer) {
      // 一時停止中でも音声の位置を更新
      const audioOffset = this.getAudioOffset();
      const adjustedTime = Math.max(0, (timeMs + audioOffset) / 1000); // 秒単位に変換、負の値は0にクランプ
      this.audioPlayer.seek(adjustedTime);
      console.log(`[Engine] 音楽シーク - 現在時間: ${timeMs}ms, オフセット: ${audioOffset}ms, 調整後: ${adjustedTime}s`);
    } else {
    }
    
    // 背景動画がある場合はループを考慮してシーク
    if (this.backgroundVideo) {
      const videoTimeSeconds = timeMs / 1000;
      const videoDuration = this.backgroundVideo.duration;
      
      if (videoDuration > 0) {
        // 背景動画をループ再生として正しい時間にシーク
        const loopedTime = videoTimeSeconds % videoDuration;
        this.backgroundVideo.currentTime = loopedTime;
        console.log(`[Engine] 背景動画シーク - 要求時間: ${videoTimeSeconds}s, 動画長: ${videoDuration}s, ループ時間: ${loopedTime}s`);
      } else {
        // videoDurationが取得できない場合はそのままシーク
        this.backgroundVideo.currentTime = videoTimeSeconds;
        console.log(`[Engine] 背景動画シーク - 要求時間: ${videoTimeSeconds}s (動画長不明)`);
      }
    }
    
    // シーク操作後にタイムライン更新イベントを発火
    this.dispatchTimelineUpdatedEvent();
    
    // シークイベントを発火
    const seekEvent = new CustomEvent('engine-seeked', {
      detail: {
        currentTime: timeMs,
        totalDuration: this.audioDuration,
        timestamp: seekTimestamp,
        source: 'Engine'
      }
    });
    window.dispatchEvent(seekEvent);
    
    // プレビュー機能と動画エクスポートで統一の待機処理
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }

  /**
   * 精密なシーク（動画エクスポート用）
   * リアルタイム再生に依存しない正確なタイムライン制御
   */
  async seekToExactTime(timeMs: number): Promise<void> {
    try {
      
      // 時間を設定
      this.currentTime = timeMs;
      this.lastUpdateTime = performance.now();
      
      // インスタンスマネージャーを更新
      this.instanceManager.update(this.currentTime);
      
      // 背景動画のシークは VideoExporter 側で処理するため、ここではスキップ
      // NOTE: Engine.seekToExactTimeは背景動画以外の要素（アニメーションテンプレート等）のみを更新
      
      // 強制的にレンダリングを実行して状態を安定化
      this.app.render();
      
      
    } catch (error) {
      console.error(`Engine: Error in seekToExactTime to ${timeMs}ms:`, error);
      throw error;
    }
  }

  // テンプレートの更新（歌詞データを保持）
  updateTemplate(template: IAnimationTemplate, params: Partial<StandardParameters> = {}) {
    this.template = template; // templateプロパティを更新
    this.instanceManager.updateTemplate(template, params);
    
    // 現在の時刻で再度描画を更新して結果を反映
    this.instanceManager.update(this.currentTime);
    
    // タイムライン更新イベントを発火して関連UIを更新
    this.dispatchTimelineUpdatedEvent();
  }
  
  // テンプレートのみを変更（歌詞データを保持）
  changeTemplate(template: IAnimationTemplate, params: Partial<StandardParameters> = {}, templateId?: string): boolean {
    try {
      // パラメータの型チェック（配列を防ぐ）
      if (Array.isArray(params)) {
        console.error('[Engine] changeTemplate: params is an array, converting to empty object');
        params = {};
      }
      
      // 現在の歌詞データと状態を保持
      const currentLyrics = JSON.parse(JSON.stringify(this.phrases)); // ディープコピー
      const currentTime = this.currentTime;
      const isCurrentlyPlaying = this.isRunning;
      
      // パラメータレジストリからデフォルトパラメータを取得
      const registry = ParameterRegistry.getInstance();
      
      // 標準パラメータとテンプレート固有パラメータを組み合わせ
      const standardParams: Record<string, any> = {};
      const templateParams: Record<string, any> = {};
      
      // 標準パラメータのデフォルト値を設定
      const allParams = registry.getAllParameters();
      allParams.forEach((definition, name) => {
        if (definition.category === 'standard') {
          standardParams[name] = definition.defaultValue;
        } else if (definition.category === 'template-specific' && definition.templateId === templateId) {
          templateParams[name] = definition.defaultValue;
        }
      });
      
      const defaultParams = { ...standardParams, ...templateParams };
      // console.log('[Engine] defaultParams type:', Array.isArray(defaultParams) ? 'Array' : typeof defaultParams);
      // console.log('[Engine] defaultParams keys:', Object.keys(defaultParams).slice(0, 5));
      
      // パラメータオブジェクトを安全にマージ
      // console.log('[Engine] Input params before normalization:', {
      //   type: Array.isArray(params) ? 'Array' : typeof params,
      //   keys: Array.isArray(params) ? 'Array indices' : Object.keys(params as any).slice(0, 5),
      //   firstValue: Array.isArray(params) ? params[0] : Object.values(params as any)[0]
      // });
      
      const normalizedParams = ParameterProcessor.normalizeToParameterObject(params);
      // console.log('[Engine] normalizedParams type:', Array.isArray(normalizedParams) ? 'Array' : typeof normalizedParams);
      // console.log('[Engine] normalizedParams keys:', Object.keys(normalizedParams).slice(0, 5));
      
      const mergedParams = ParameterProcessor.mergeParameterObjects(defaultParams, normalizedParams);
      // console.log('[Engine] mergedParams type:', Array.isArray(mergedParams) ? 'Array' : typeof mergedParams);
      // console.log('[Engine] mergedParams keys:', Object.keys(mergedParams).slice(0, 5));
      
      // テンプレートIDを決定（指定がなければ現在のデフォルトIDを使用）
      const actualTemplateId = templateId || this.templateManager.getDefaultTemplateId();
      
      // 古いテンプレートの内部状態をクリーンアップ
      if (this.template && typeof this.template.cleanup === 'function') {
        console.log('[Engine] Cleaning up old template state');
        this.template.cleanup();
      }
      
      // テンプレートマネージャーを更新
      this.templateManager.registerTemplate(actualTemplateId, template, {name: actualTemplateId}, true);
      this.parameterManager.updateGlobalDefaults(mergedParams);
      
      // メインテンプレートを更新
      this.template = template;
      
      
      // インスタンスマネージャーのテンプレートを更新（歌詞データの再読み込みは行わない）
      this.instanceManager.updateTemplate(template, mergedParams);
      
      // 現在の時刻でアニメーションを更新
      this.instanceManager.update(currentTime);
      
      // 再生状態を復元
      if (isCurrentlyPlaying) {
        this.isRunning = true;
        this.lastUpdateTime = performance.now();
      }
      
      return true;
    } catch (error) {
      console.error('Engine: テンプレート変更エラー:', error);
      return false;
    }
  }

  // タイムライン関連データ取得用メソッド
  getTimelineData() {
    return {
      lyrics: this.phrases,
      duration: this.audioDuration
    };
  }
  
  // マーカー操作の結果を反映するメソッド（Undo対応）
  updateLyricsData(updatedLyrics: PhraseUnit[], saveState: boolean = true, changeType: string = '歌詞タイミング変更') {
    // 状態保存（Undo操作時はスキップ）
    if (saveState) {
      // 変更前の状態を保存（V2形式）
      const v2Export = this.parameterManager.exportCompressed();
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)), // 現在の歌詞データを保存
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        parameterData: v2Export, // V2データを保存
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      this.projectStateManager.saveBeforeLyricsChange(changeType);
    }
    
    // 文字インデックスを計算してから更新（一度だけ実行）
    this.phrases = calculateCharacterIndices(updatedLyrics);
    
    // V2: 新しいフレーズをパラメータマネージャーで初期化
    this.phrases.forEach(phrase => {
      const templateId = this.templateManager.getAssignment(phrase.id) || this.templateManager.getDefaultTemplateId();
      if (!this.parameterManager.isPhraseInitialized(phrase.id)) {
        if (import.meta.env.DEV && Math.random() < 0.1) { // 10%の確率でのみ出力
        }
        this.parameterManager.initializePhrase(phrase.id, templateId);
      }
    });
    
    // 変更タイプに応じた最適化処理
    if (changeType === '単語分割編集') {
      // 単語分割の場合は文字位置が変わるため完全な再構築が必要
      this.charPositions.clear();
      this.arrangeCharsOnStage();
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
    } else {
      // デフォルトの全体更新（タイミング変更も含む）
      this.charPositions.clear();
      this.arrangeCharsOnStage();
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
    }
    
    // 現在の時間位置でアニメーションを更新
    this.instanceManager.update(this.currentTime);
    
    // タイムライン更新イベント発火
    this.dispatchTimelineUpdatedEvent();
    
    // 新しい歌詞データをProjectStateManagerの現在状態に反映
    const paramExport = this.parameterManager.exportCompressed();
    this.projectStateManager.updateCurrentState({
      lyricsData: JSON.parse(JSON.stringify(this.phrases)),
      individualSettingsEnabled: paramExport.individualSettingsEnabled || []
    });
    
    // V2パラメータ管理では同期不要
    
    return this.phrases;
  }

  // オブジェクト固有のパラメータを設定
  updateObjectParams(objectId: string, type: 'phrase' | 'word' | 'char' | 'global', params: Partial<StandardParameters>) {
    try {
      if (import.meta.env.DEV && Math.random() < 0.05) { // 5%の確率でのみ出力
      }
      
      // parameterManagerに統一
      this.parameterManager.updateObjectParams(objectId, params);
      
      // 強制パラメータ同期を実行
      this.parameterManager.forceSynchronizeParameters();
      
      // ① デフォルト＋オブジェクトパラメータを反映
      if (!this.template || !this.instanceManager) {
        console.error('Engine: templateまたはinstanceManagerがnull/undefinedです');
        return false;
      }
      
      if (type === 'global') {
        // グローバルパラメータのみを更新
        const globalParams = this.parameterManager.getGlobalDefaults();
        this.instanceManager.updateTemplate(this.template, globalParams);
      } else {
        // オブジェクト固有のパラメータ更新の場合は、ParameterManagerに更新を委譲
        // パラメータを渡さずにupdateTemplateを呼び出し、InstanceManagerが自動的に
        // ParameterManagerから最新のeffectiveParamsを取得するようにする
        this.instanceManager.updateTemplate(this.template);
      }
      
      // ② パラメータ変更に応じた更新処理
      const isLayoutChange = this.isLayoutAffectingChange(params);
      
      // レイアウト変更判定（ログ削除済み）
      
      if (isLayoutChange) {
        // レイアウト変更パラメータ処理
        // 文字配置に影響するパラメータ変更時のみ座標を再計算
        this.recalculateCharPositionsOnly();
        // CSS スケーリングも更新
        this.applyCSSScaling();
        // インスタンスを完全再構築
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      } else {
        if (import.meta.env.DEV && Math.random() < 0.05) { // 5%の確率でのみ出力
        }
        // 配置に影響しないパラメータ変更時は既存インスタンスを更新のみ
        this.instanceManager.updateExistingInstances();
      }
      
      // 現在の時間位置でアニメーションを更新
      this.instanceManager.update(this.currentTime);
      
      // リアルタイム反映のため強制レンダリング
      if (this.instanceManager) {
        this.instanceManager.updateExistingInstances();
        this.instanceManager.update(this.currentTime);
      }
      
      // V2パラメータ管理では同期不要
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      return true;
    } catch (error) {
      console.error('Engine: updateObjectParamsの処理中にエラーが発生しました', error);
      return false;
    }
  }

  
  // グローバルパラメータを更新（Undo対応）
  updateGlobalParams(params: Partial<StandardParameters>, saveState: boolean = true) {
    console.log('[Engine] updateGlobalParams (OLD METHOD) called - redirecting to updateGlobalParameters');
    // 新しい最適化メソッドにリダイレクト
    return this.updateGlobalParameters(params);
    
    /* 旧実装はコメントアウト
    try {
      if (import.meta.env.DEV && Math.random() < 0.1) { // 10%の確率でのみ出力
      }
      
      // 状態保存（Undo操作時はスキップ）
      if (saveState) {
        this.projectStateManager.updateCurrentState({
          lyricsData: JSON.parse(JSON.stringify(this.phrases)),
          currentTime: this.currentTime,
          templateAssignments: this.templateManager.exportAssignments(),
          globalParams: this.parameterManager.getGlobalDefaults(),
          objectParams: this.parameterManager.exportCompressed().phrases || {},
          defaultTemplateId: this.templateManager.getDefaultTemplateId(),
          individualSettingsEnabled: [] // V2では個別設定の概念がない
        });
        this.projectStateManager.saveBeforeParameterChange('グローバルパラメータ');
      }
      
      // parameterManagerに統一
      this.parameterManager.updateGlobalDefaults(params);
      
      // 強制パラメータ同期を実行
      this.parameterManager.forceSynchronizeParameters();
      
      // ① デフォルトパラメータを更新（parameterManagerから取得）
      if (this.template && this.instanceManager) {
        const globalParams = this.parameterManager.getGlobalDefaults();
        this.instanceManager.updateTemplate(this.template, globalParams);
      } else {
        console.error('Engine: templateまたはinstanceManagerがnull/undefinedです');
        return false;
      }
      
      // ② パラメータ変更に応じた更新処理
      const isLayoutChange = this.isLayoutAffectingChange(params);
      
      if (isLayoutChange) {
        if (import.meta.env.DEV && Math.random() < 0.1) { // 10%の確率でのみ出力
        }
        // レイアウト変更時、アクティブ化されたオブジェクトのパラメータを保持
        const activatedObjectParams = this.preserveIndividualSettingObjectParams();
        
        // 文字配置に影響するパラメータ変更時のみ座標を再計算
        this.recalculateCharPositionsOnly();
        // CSS スケーリングも更新
        this.applyCSSScaling();
        // インスタンスを完全再構築
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
        
        // アクティブ化されたオブジェクトのパラメータを復元
        this.restoreIndividualSettingObjectParams(activatedObjectParams);
      } else {
        // 配置に影響しないパラメータ変更時は既存インスタンスを更新のみ
        this.instanceManager.updateExistingInstances();
      }
      
      // 現在の時間位置でアニメーションを更新
      this.instanceManager.update(this.currentTime);
      
      // リアルタイム反映のため強制レンダリング
      if (this.instanceManager) {
        this.instanceManager.updateExistingInstances();
        this.instanceManager.update(this.currentTime);
      }
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      return true;
    } catch (error) {
      console.error('Engine: updateGlobalParamsの処理中にエラーが発生しました', error);
      return false;
    }
    */
  }

  // 選択されたオブジェクトの個別パラメータをクリア
  clearSelectedObjectParams(objectIds: string[]): boolean {
    try {
      
      // パラメータマネージャーで個別パラメータをクリア
      this.parameterManager.clearMultipleObjectParams(objectIds);
      
      // テンプレートマネージャーで個別テンプレート割り当てもクリア
      objectIds.forEach(id => {
        this.templateManager.unassignTemplate(id);
      });
      
      // パラメータサービスからもクリア（もし必要なら）
      objectIds.forEach(id => {
        // オブジェクトタイプを判定
        const parts = id.split('_');
        let type: 'phrase' | 'word' | 'char' | null = null;
        
        if (parts.includes('char')) {
          type = 'char';
        } else if (parts.includes('word')) {
          type = 'word';
        } else if (parts.includes('phrase')) {
          type = 'phrase';
        }
        
        if (type) {
        }
      });
      
      // インスタンスを更新
      if (this.template && this.instanceManager) {
        // 各オブジェクトのインスタンスを更新
        objectIds.forEach(objectId => {
          this.updateObjectInstance(objectId);
        });
        
        // 現在の時間位置でアニメーションを更新
        this.instanceManager.update(this.currentTime);
      }
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      // テンプレート割り当て変更後の状態更新
      const paramExport = this.parameterManager.exportCompressed();
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)),
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        globalParams: this.parameterManager.getGlobalDefaults(),
        objectParams: paramExport.objects || {},
        individualSettingsEnabled: paramExport.individualSettingsEnabled || [],
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      
      return true;
    } catch (error) {
      console.error('Engine: clearSelectedObjectParamsの処理中にエラーが発生しました', error);
      return false;
    }
  }

  // 全ての個別オブジェクトパラメータとアクティベーション状態を強制クリア
  forceCleanAllObjectData(): boolean {
    try {
      
      // パラメータマネージャーで全データクリア
      this.parameterManager.forceCleanAllObjectData();
      
      // テンプレートマネージャーで全ての個別テンプレート割り当てをクリア
      this.templateManager.clearAllAssignments();
      
        const globalParams = this.parameterManager.getGlobalDefaults();
      
      // インスタンスマネージャーを完全に再構築
      if (this.template && this.instanceManager) {
        // 全ての文字位置を再計算
        this.charPositions.clear();
        this.arrangeCharsOnStage();
        
        // インスタンスを再読み込み
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
        
        // 現在の時間位置でアニメーションを更新
        this.instanceManager.update(this.currentTime);
      }
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      // アクティベーション状態変更イベント発火
      const event = new CustomEvent('objects-deactivated', {
        detail: {
          objectIds: [],
          objectType: 'all'
        }
      });
      window.dispatchEvent(event);
      
      return true;
    } catch (error) {
      console.error('Engine: forceCleanAllObjectDataの処理中にエラーが発生しました', error);
      return false;
    }
  }

  // 音声ファイル読み込み用メソッド
  loadAudioFilePath(filePath: string, fileName?: string) {
    
    // Howlerで音声を読み込む（フォーマットを明示的に指定）
    this.audioFilePath = filePath;
    this.audioFileName = fileName;
    this.audioPlayer = new Howl({
      src: [filePath],
      format: ['mp3', 'wav', 'ogg', 'm4a'], // フォーマットを明示的に指定
      html5: true,
      preload: true,
      onload: () => {
        if (this.audioPlayer) {
          const audioDuration = this.audioPlayer.duration() * 1000; // ミリ秒に変換
          
          // 歌詞データと音楽データの両方を考慮してタイムライン長さを再計算
          this.calculateAndSetAudioDuration();
          
          // ProjectStateManagerに音楽ファイル情報を保存
          this.projectStateManager.updateCurrentState({
            audioFileName: this.audioFileName,
            audioFileDuration: audioDuration
          });
          
          // タイムライン更新イベントを発火
          this.dispatchTimelineUpdatedEvent();
          
          
          // 音声ファイルロード後に自動保存
          if (this.autoSaveEnabled) {
            this.autoSaveToLocalStorage();
          }
         }
       },
       onloaderror: (id: number, error: unknown) => {
         console.error(`Engine: 音声ロードエラー (ID: ${id}):`, error);
         // エラー時はエラーメッセージをより明確にする
         if (error === 'No codec support for selected audio sources.') {
           console.error('Engine: このファイル形式はサポートされていません。MP3、WAV、OGGファイルを使用してください。');
         }
       },
       onend: () => {
         this.pause();
         this.dispatchCustomEvent('audio-ended', { 
           currentTime: this.currentTime,
           audioFileName: this.audioFileName 
         });
       }
    });
  }
  
  /**
   * ElectronMediaManagerから現在のファイルパスを取得してaudioFilePathを更新
   */
  private async updateAudioFilePathFromElectronManager() {
    try {
      const { electronMediaManager } = await import('../services/ElectronMediaManager');
      const currentPath = electronMediaManager.getCurrentAudioFilePath();
      if (currentPath) {
        this.audioFilePath = currentPath;
        console.log(`[Engine] audioFilePathを更新: "${this.audioFilePath}"`);
      } else {
        console.warn(`[Engine] ElectronMediaManagerからファイルパスを取得できませんでした`);
      }
    } catch (error) {
      console.error(`[Engine] ElectronMediaManagerからのファイルパス取得に失敗:`, error);
    }
  }
  
  /**
   * HTMLAudioElement/HTMLVideoElementから音声を読み込み（Electron用）
   */
  loadAudioElement(audioElement: HTMLAudioElement | HTMLVideoElement, fileName?: string) {
    
    // AudioElementからHowlを作成
    this.audioFileName = fileName || 'electron-audio';
    
    // ElectronMediaManagerから現在のファイルパスを取得して更新（非同期）
    this.updateAudioFilePathFromElectronManager();
    
    this.audioPlayer = new Howl({
      src: [audioElement.src],
      format: ['mp3', 'wav', 'ogg', 'm4a'],
      html5: true,
      preload: true, // Howlerでも確実にロード
      onload: () => {
        if (this.audioPlayer) {
          const audioDuration = this.audioPlayer.duration() * 1000; // ミリ秒に変換
          
          // 歌詞データと音楽データの両方を考慮してタイムライン長さを再計算
          this.calculateAndSetAudioDuration();
          
          // ProjectStateManagerに音楽ファイル情報を保存
          this.projectStateManager.updateCurrentState({
            audioFileName: this.audioFileName,
            audioFileDuration: audioDuration
          });
          
          // タイムライン更新イベントを発火
          this.dispatchTimelineUpdatedEvent();
          
          
          // 音声ファイルロード後に自動保存
          if (this.autoSaveEnabled) {
            this.autoSaveToLocalStorage();
          }
         }
       },
       onloaderror: (id: number, error: unknown) => {
         console.error(`Engine: HTMLAudioElement音声ロードエラー (ID: ${id}):`, error);
       },
       onend: () => {
         this.pause();
         this.dispatchCustomEvent('audio-ended', { 
           currentTime: this.currentTime,
           audioFileName: this.audioFileName 
         });
       }
    });
    
  }
  
  // タイムライン更新イベントを発火
  public dispatchTimelineUpdatedEvent() {
    // タイムラインイベントログを制限
    try {
      const event = new CustomEvent('timeline-updated', {
        detail: { 
          lyrics: JSON.parse(JSON.stringify(this.phrases)), // ディープコピーで確実に新しいオブジェクトを渡す
          duration: this.audioDuration 
        }
      });
      window.dispatchEvent(event);
      
      // マーカー関連データが更新されたのでアニメーションも更新
      this.instanceManager.update(this.currentTime);
    } catch (error) {
      console.error('Engine: イベント発火エラー:', error);
    }
  }

  
  // クリーンアップ
  destroy() {
    try {
      // 自動保存タイマーをクリア
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
      }
      
      // 個別設定変更リスナーを削除
      if (this.parameterManager) {
        this.parameterManager.removeIndividualSettingListener('engine-timeline-sync');
      }
      
      // リサイズイベントリスナーを削除（正しい参照を使用）
      window.removeEventListener('resize', this.boundHandleResize);
      
      // スリープ/ウェイクイベントリスナーを削除
      this.removeSleepWakeHandlers();
      
      // インスタンスマネージャーをクリーンアップ
      if (this.instanceManager) {
        this.instanceManager.clearAllInstances();
      }
      
      // Ticker からアップデート関数を削除
      if (this.app && this.app.ticker) {
        this.app.ticker.remove(this.updateFn);
      }
      
      // 音声プレイヤーをクリーンアップ
      if (this.audioPlayer) {
        this.audioPlayer.unload();
      }
      
      // デバッグマネージャーをクリーンアップ
      if (this.debugManager) {
        this.debugManager.destroy();
      }
      
      // PIXI アプリケーションを破棄
      if (this.app) {
        this.app.destroy(true, {children: true, texture: true, baseTexture: true});
      }
      
      // HTML要素をクリア
      if (this.canvasContainer) {
        this.canvasContainer.innerHTML = '';
      }
    } catch (error) {
      console.error('Engine destroy error:', error);
    }
  }
  
  // エンジンの状態をチェック
  isReady(): boolean {
    return !!(this.template && this.instanceManager && this.app);
  }
  
  // テンプレートの追加
  addTemplate(
    id: string,
    template: IAnimationTemplate,
    config: { name: string, description?: string, thumbnailUrl?: string } = {},
    defaultParams: Partial<StandardParameters> = {},
    isDefault: boolean = false
  ): boolean {
    try {
      // テンプレートが既に登録されているかチェック
      const isAlreadyRegistered = this.templateManager.isTemplateRegistered(id);
      
      this.templateManager.registerTemplate(id, template, config, isDefault);
      
      // 既に登録されている場合は、グローバルデフォルトを更新しない
      // 初回登録時のみ、テンプレートのデフォルト値を適用
      if (!isAlreadyRegistered && Object.keys(defaultParams).length > 0) {
        this.parameterManager.updateGlobalDefaults(defaultParams);
      }
      
      // もしデフォルトテンプレートとして設定された場合
      if (isDefault) {
        this.template = template;
        // 既に登録されている場合は、パラメータを更新しない
        if (!isAlreadyRegistered) {
          this.updateGlobalParams(defaultParams);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Engine: テンプレート追加エラー:`, error);
      return false;
    }
  }
  
  // 現在のテンプレートIDを取得するヘルパーメソッド
  private getCurrentTemplateId(objectId: string): string {
    // 直接割り当てられたテンプレートを確認
    const assignments = this.templateManager.getAssignments();
    if (assignments.has(objectId)) {
      return assignments.get(objectId)!;
    }
    
    // 親オブジェクトのテンプレートを確認
    const parentId = this.getParentObjectId(objectId);
    if (parentId && assignments.has(parentId)) {
      return assignments.get(parentId)!;
    }
    
    // デフォルトテンプレートID
    return this.templateManager.getDefaultTemplateId();
  }
  
  // 親オブジェクトIDを取得するヘルパーメソッド
  private getParentObjectId(objectId: string): string | null {
    // IDの形式: phrase_0_word_1_char_2
    const parts = objectId.split('_');
    
    if (parts.length >= 4 && parts[parts.length - 2] === 'char') {
      // 文字の場合、親は単語
      return parts.slice(0, parts.length - 2).join('_');
    } else if (parts.length >= 4 && parts[parts.length - 2] === 'word') {
      // 単語の場合、親はフレーズ
      return parts.slice(0, parts.length - 2).join('_');
    }
    
    return null;
  }
  
  // テンプレート割り当て（Undo対応版）
  assignTemplate(
    objectId: string,
    templateId: string,
    preserveParams: boolean = true,
    saveState: boolean = true,
    forceReapply: boolean = false
  ): boolean {
    try {
      
      // 現在のテンプレートID取得
      const currentTemplateId = this.getCurrentTemplateId(objectId);
      
      // 同じテンプレートの場合の処理
      if (currentTemplateId === templateId) {
        if (!forceReapply) {
          return true;
        } else {
          // テンプレート割り当てはスキップするが、インスタンス更新は実行する
          this.performInstanceUpdate(objectId, templateId);
          return true;
        }
      }
      
      // 状態保存（Undo操作時はスキップ）
      if (saveState) {
        this.projectStateManager.updateCurrentState({
          lyricsData: JSON.parse(JSON.stringify(this.phrases)),
          currentTime: this.currentTime,
          templateAssignments: this.templateManager.exportAssignments(),
          globalParams: this.parameterManager.getGlobalDefaults(),
          objectParams: this.parameterManager.exportCompressed().phrases || {},
          defaultTemplateId: this.templateManager.getDefaultTemplateId()
        });
        this.projectStateManager.saveBeforeTemplateChange(objectId, currentTemplateId);
      }
      
      // パラメータ保持処理
      if (preserveParams) {
        this.parameterManager.handleTemplateChange(
          currentTemplateId,
          templateId,
          objectId,
          preserveParams
        );
      }
      
      // テンプレート割り当て
      const result = this.templateManager.assignTemplate(objectId, templateId);
      
      if (result) {
        // 個別テンプレート設定時は個別設定を自動有効化
        if (this.isPhraseId(objectId)) {
          console.log(`[Engine] Auto-enabling individual setting for template change: ${objectId}`);
          this.parameterManager.enableIndividualSetting(objectId);
        }
        
        // 統合されたインスタンス更新処理
        this.performInstanceUpdate(objectId, templateId);
        
        // テンプレート割り当て成功後の状態更新
        if (saveState) {
          const paramExport = this.parameterManager.exportCompressed();
          this.projectStateManager.updateCurrentState({
            lyricsData: JSON.parse(JSON.stringify(this.phrases)),
            currentTime: this.currentTime,
            templateAssignments: this.templateManager.exportAssignments(),
            globalParams: this.parameterManager.getGlobalDefaults(),
            objectParams: paramExport.objects || {},
            individualSettingsEnabled: paramExport.individualSettingsEnabled || [],
            defaultTemplateId: this.templateManager.getDefaultTemplateId()
          });
        }
      } else {
        console.error(`テンプレート割り当てに失敗しました`);
      }
      
      return result;
    } catch (error) {
      console.error(`テンプレート割り当てエラー: ${objectId} -> ${templateId}`, error);
      return false;
    }
  }
  
  // フレーズIDかどうかを判定するヘルパー
  private isPhraseId(id: string): boolean {
    // フレーズIDの形式: phrase_X または phrase_timestamp_randomString
    return id.startsWith('phrase_') && id.split('_').length >= 2;
  }

  // 統合されたインスタンス更新処理
  private performInstanceUpdate(objectId: string, templateId: string): void {
    
    try {
      // インスタンスマネージャーにテンプレートマネージャーの最新情報を設定
      this.instanceManager.updateTemplateAssignments(this.templateManager);
      
      if (this.isPhraseId(objectId)) {
        // フレーズレベルの場合は完全再構築
        const targetPhrase = this.phrases.find(p => p.id === objectId);
        if (targetPhrase) {
          this.reconstructSpecificPhrase(targetPhrase);
        } else {
          console.error(`対象フレーズが見つかりません: ${objectId}`);
          return;
        }
      } else {
        // 非フレーズレベルの場合は部分更新
        this.instanceManager.updateInstanceAndChildren(objectId);
      }
      
      // 現在の時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベントを発火
      this.dispatchTimelineUpdatedEvent();
      
    } catch (error) {
      console.error(`インスタンス更新処理エラー: ${objectId}`, error);
    }
  }
  
  
  // デフォルトテンプレート変更メソッド
  setDefaultTemplate(templateId: string, preserveParams: boolean = true): boolean {
    try {
      // 現在のデフォルトテンプレートID
      const currentDefaultId = this.templateManager.getDefaultTemplateId();
      
      // 同じテンプレートなら何もしない
      if (currentDefaultId === templateId) {
        return true;
      }
      
      // テンプレート変更前に状態を保存
      this.projectStateManager.saveBeforeTemplateChange(null, currentDefaultId);
      
      // パラメータ保持処理
      if (preserveParams) {
        this.parameterManager.handleTemplateChange(
          currentDefaultId,
          templateId,
          undefined, // グローバルパラメータ
          preserveParams
        );
      }
      
      // デフォルトテンプレートを設定
      const result = this.templateManager.setDefaultTemplateId(templateId);
      if (result) {
        // ParameterManagerV2のデフォルトテンプレートIDも同期
        this.parameterManager.setDefaultTemplateId(templateId);
        
        // 古いテンプレートの内部状態をクリーンアップ
        if (this.template && typeof this.template.cleanup === 'function') {
          console.log('[Engine] Cleaning up old default template state');
          this.template.cleanup();
        }
        
        // メインテンプレートも更新
        const template = this.templateManager.getTemplateById(templateId);
        if (template) {
          this.template = template;
        }
        
        // インスタンスマネージャーの更新 - 影響を受ける全インスタンスを更新
        this.instanceManager.updateTemplateAssignments(
          this.templateManager
        );
      }
      
      return result;
    } catch (error) {
      console.error(`デフォルトテンプレート変更エラー: ${templateId}`, error);
      return false;
    }
  }
  
  /**
   * 複数オブジェクトへのテンプレート一括割り当て
   * @param objectIds 割り当て対象のオブジェクトID配列
   * @param templateId 適用するテンプレートID
   * @param preserveParams パラメータを保持するかどうか
   * @returns 成功したかどうか
   */
  batchAssignTemplate(
    objectIds: string[],
    templateId: string,
    preserveParams: boolean = true,
    forceReapply: boolean = false
  ): boolean {
    try {
      if (objectIds.length === 0) return false;
      
      // 現在の状態を保存（一括操作として一つの履歴エントリにする）
      this.projectStateManager.saveBeforeTemplateChange(`テンプレート一括変更: ${objectIds.length}個のオブジェクト`);
      
      // テンプレートマネージャーで一括割り当て
      const successfulIds = this.templateManager.batchAssignTemplate(objectIds, templateId);
      
      // パラメータ処理と更新
      for (const objectId of successfulIds) {
        // 現在のテンプレートIDを取得
        const currentTemplateId = Array.from(this.templateManager.getAssignments().entries())
          .find(([id, tmpl]) => id === objectId)?.[1] || this.templateManager.getDefaultTemplateId();
        
        // パラメータ保持処理
        if (currentTemplateId !== templateId && preserveParams) {
          this.parameterManager.handleTemplateChange(
            currentTemplateId,
            templateId,
            objectId,
            preserveParams
          );
        }
        
        // オブジェクトのインスタンスを更新
        this.updateObjectInstance(objectId);
      }
      
      return successfulIds.length > 0;
    } catch (error) {
      console.error(`Engine: テンプレート一括割り当てエラー:`, error);
      return false;
    }
  }
  
  // 特定フレーズの完全再構築（タイミング情報保持）
  private reconstructSpecificPhrase(phrase: PhraseUnit): void {
    try {
      
      // フレーズの文字位置情報を再計算
      this.recalculateCharPositionsForPhrase(phrase);
      
      // 全体の歌詞データを再ロード（効率的でないが確実）
      // 将来的には特定フレーズのみの再構築メソッドをInstanceManagerに実装
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      
    } catch (error) {
      console.error(`特定フレーズ再構築エラー: ${phrase.id}`, error);
    }
  }
  
  // 特定フレーズの文字位置を再計算
  private recalculateCharPositionsForPhrase(phrase: PhraseUnit): void {
    
    // 該当フレーズの文字位置のみを削除
    phrase.words.forEach(word => {
      word.chars.forEach(char => {
        this.charPositions.delete(char.id);
      });
    });
    
    // 全体の配置を再計算（効率化の余地あり）
    this.arrangeCharsOnStage();
  }
  
  // 特定オブジェクトのインスタンスを更新（改善版）
  private updateObjectInstance(objectId: string): void {
    try {
      // インスタンスマネージャーにテンプレートマネージャーの最新情報を設定
      this.instanceManager.updateTemplateAssignments(this.templateManager);
      
      // 階層的な更新を実行
      this.instanceManager.updateInstanceAndChildren(objectId);
      
      // 現在時刻で再描画
      this.instanceManager.update(this.currentTime);
      
    } catch (error) {
      console.error(`オブジェクトインスタンス更新エラー: ${objectId}`, error);
    }
  }
  
  /**
   * 外部から個別オブジェクトインスタンスの更新を実行（公開メソッド）
   */
  public forceUpdateObjectInstance(objectId: string): void {
    this.updateObjectInstance(objectId);
  }
  
  /**
   * 自動復元時専用：個別設定を保護しながらテンプレートを復元
   */
  
  // プロジェクト保存（V2専用）
  saveProject(): any {
    // V2形式でパラメータをエクスポート
    const v2Export = this.parameterManager.exportCompressed();
    
    return {
      name: 'UTAVISTA Project',
      version: '2.0.0', // V2形式
      timestamp: Date.now(),
      defaultTemplateId: this.templateManager.getDefaultTemplateId(),
      templates: Object.fromEntries(
        this.templateManager.getAllTemplates().map(({id, config}) => [id, config])
      ),
      templateAssignments: this.templateManager.exportAssignments(),
      // V2パラメータデータ
      parameterData: v2Export,
      lyrics: this.phrases
    };
  }

  // 現在時刻を設定するメソッド（動画出力用）
  setCurrentTime(timeMs: number): void {
    this.currentTime = timeMs;
    // OptimizedParameterUpdaterの現在時刻も更新
    if (this.optimizedUpdater) {
      this.optimizedUpdater.setCurrentTime(timeMs);
    }
    this.instanceManager.update(timeMs);
  }

  // ProjectStateManagerへのアクセサ
  getProjectStateManager(): ProjectStateManager {
    return this.projectStateManager;
  }

  // TemplateManagerへのアクセサ (この定義は削除し、後続のタイプ付きメソッドを使用)

  // インスタンスの強制再生成
  forceRecreateInstances(): void {
    // 全インスタンスをクリアして再生成
    this.instanceManager.clearAllInstances();
    
    // 現在のフレーズデータで再生成
    if (this.phrases && this.phrases.length > 0) {
      this.instanceManager.initialize(this.phrases);
      
      // テンプレート割り当てを更新
      this.instanceManager.updateTemplateAssignments(this.templateManager);
      
      // 現在時刻で更新
      this.instanceManager.update(this.currentTime);
    }
  }
  
  /**
   * 動画出力用のスケーリングを設定
   * メインコンテナにスケーリングを適用し、文字サイズを逆スケーリング
   * @param scale スケール係数
   */
  setOutputScale(scale: number): void {
    
    // スケールが1の場合はリセット処理
    if (scale === 1.0) {
      this.resetOutputScale();
      return;
    }
    
    // メインコンテナにスケーリングを適用
    this.instanceManager.setMainContainerScale(scale);
    
    // 文字コンテナを逆スケーリング
    this.applyInverseScalingToText(scale);
  }
  
  /**
   * 出力スケーリングをリセット
   */
  private resetOutputScale(): void {
    
    // メインコンテナのスケールをリセット
    this.instanceManager.setMainContainerScale(1.0);
    
    // フレーズコンテナの逆スケーリングをリセット
    const phraseInstances = this.instanceManager.getPhraseInstances();
    let resetCount = 0;
    
    for (const [id, instance] of phraseInstances) {
      if (instance && instance.container && (instance.container as any).__inverseScaled) {
        // スケールを元に戻す
        instance.container.scale.set(1, 1);
        // フラグをリセット
        (instance.container as any).__inverseScaled = false;
        resetCount++;
      }
    }
    
    
    // 現在の時刻で再描画
    this.instanceManager.update(this.currentTime);
  }

  /**
   * パーティクル品質向上：解像度スケールファクターを設定
   * @param scale 解像度スケールファクター
   */
  private setParticleResolutionScale(scale: number): void {
    SparkleEffectPrimitive.setGlobalResolutionScale(scale);
    console.log(`🎯 [PARTICLE_QUALITY] Set global particle resolution scale to: ${scale}`);
  }

  /**
   * パーティクル解像度スケールをリセット（通常表示用）
   */
  private resetParticleResolutionScale(): void {
    SparkleEffectPrimitive.resetGlobalResolutionScale();
    console.log(`🎯 [PARTICLE_QUALITY] Reset particle resolution scale to 1.0`);
  }
  
  /**
   * 文字コンテナへの逆スケーリングを適用
   * @param scale スケール係数
   */
  private applyInverseScalingToText(scale: number): void {
    // 逆スケール係数（例: スケールが2なら0.5）
    const inverseScale = 1 / scale;
    
    
    // フレーズレベルのインスタンスを取得し、そのコンテナに逆スケーリングを適用
    const phraseInstances = this.instanceManager.getPhraseInstances();
    let updatedCount = 0;
    
    for (const [id, instance] of phraseInstances) {
      // フレーズコンテナに逆スケーリングを適用
      if (instance && instance.container) {
        // コンテナの現在のスケールを取得
        const currentScaleX = instance.container.scale.x;
        const currentScaleY = instance.container.scale.y;
        
        // 逆スケーリングを適用
        instance.container.scale.set(currentScaleX * inverseScale, currentScaleY * inverseScale);
        
        // 逆スケーリングフラグを設定
        (instance.container as any).__inverseScaled = true;
        
        updatedCount++;
      }
    }
    
    
    // 現在の時刻で再描画
    this.instanceManager.update(this.currentTime);
  }
  
  // 最大時間を取得するメソッド
  getMaxTime(): number {
    return this.audioDuration;
  }
  
  // 現在時刻を取得するメソッド（動画出力用）
  getCurrentTime(): number {
    return this.currentTime;
  }
  
  // 音楽オフセット値を取得するメソッド
  getAudioOffset(): number {
    if (this.projectStateManager) {
      const currentState = this.projectStateManager.getCurrentState();
      return currentState.audioOffset || 0;
    }
    return 0;
  }
  
  // =============================================================================
  // Undo/Redo 機能
  // =============================================================================
  
  /**
   * Undo 操作を実行
   * @returns 成功したかどうか
   */
  undo(): boolean {
    try {
      
      if (!this.projectStateManager.canUndo()) {
        return false;
      }
      
      // 現在の状態を更新してからUndoを実行
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)),
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        globalParams: this.parameterManager.getGlobalDefaults(),
        objectParams: this.parameterManager.exportCompressed().phrases || {},
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      
      // Undoを実行
      const success = this.projectStateManager.undo();
      
      if (success) {
        // 状態を復元
        const restoredState = this.projectStateManager.getCurrentState();
        this.restoreProjectState(restoredState);
      }
      
      return success;
    } catch (error) {
      console.error('Engine: Undo操作エラー:', error);
      return false;
    }
  }
  
  /**
   * Redo 操作を実行
   * @returns 成功したかどうか
   */
  redo(): boolean {
    try {
      
      if (!this.projectStateManager.canRedo()) {
        return false;
      }
      
      // Redoを実行
      const success = this.projectStateManager.redo();
      
      if (success) {
        // 状態を復元
        const restoredState = this.projectStateManager.getCurrentState();
        this.restoreProjectState(restoredState);
      }
      
      return success;
    } catch (error) {
      console.error('Engine: Redo操作エラー:', error);
      return false;
    }
  }
  
  /**
   * Undoが可能かどうかを返す
   * @returns Undoが可能かどうか
   */
  canUndo(): boolean {
    return this.projectStateManager.canUndo();
  }
  
  /**
   * Redoが可能かどうかを返す
   * @returns Redoが可能かどうか
   */
  canRedo(): boolean {
    return this.projectStateManager.canRedo();
  }
  
  /**
   * プロジェクト状態を復元する
   * @param state 復元する状態
   */
  private restoreProjectState(state: import('./ProjectStateManager').ProjectState): void {
    try {
      
      // 歌詞データの復元
      if (state.lyricsData) {
        this.phrases = JSON.parse(JSON.stringify(state.lyricsData));
        this.charPositions.clear();
        this.arrangeCharsOnStage();
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      }
      
      // テンプレート割り当ての復元
      if (state.templateAssignments) {
        this.templateManager.importAssignments(state.templateAssignments);
      }
      
      // パラメータの完全復元（改善版）
      if (state.globalParams || state.objectParams) {
        // ParameterManagerの完全復元メソッドを使用
        this.parameterManager.restoreCompleteState({
          global: state.globalParams,
          objects: state.objectParams,
          individualSettingsEnabled: state.individualSettingsEnabled
        });
        
        // パラメータマネージャーを更新
        if (state.globalParams) {
          this.parameterManager.updateGlobalDefaults(state.globalParams);
        }
        
      }
      
      // デフォルトテンプレートの復元
      if (state.defaultTemplateId) {
        this.templateManager.setDefaultTemplateId(state.defaultTemplateId);
        // ParameterManagerV2のデフォルトテンプレートIDも同期
        this.parameterManager.setDefaultTemplateId(state.defaultTemplateId);
        
        const defaultTemplate = this.templateManager.getTemplateById(state.defaultTemplateId);
        if (defaultTemplate) {
          this.template = defaultTemplate;
        }
      }
      
      // 時間位置の復元
      if (state.currentTime !== undefined) {
        this.currentTime = state.currentTime;
      }
      
      // インスタンスマネージャーの更新
      this.instanceManager.updateTemplateAssignments(this.templateManager);
      this.instanceManager.updateTemplate(this.template, this.parameterManager.getGlobalDefaults());
      
      // 現在の時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベントを発火
      this.dispatchTimelineUpdatedEvent();
      
    } catch (error) {
      console.error('Engine: プロジェクト状態復元エラー:', error);
    }
  }
  
  /**
   * Undo/Redo履歴を取得
   * @returns 履歴情報
   */
  getUndoRedoHistory(): {
    history: import('./ProjectStateManager').ProjectState[];
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
  } {
    return {
      history: this.projectStateManager.getStateHistory(),
      currentIndex: this.projectStateManager.getHistoryIndex(),
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    };
  }

  // プロジェクト読み込み（統一復元マネージャー使用）
  async loadProject(config: any): Promise<boolean> {
    try {
      
      // 統一復元マネージャーを使用
      const success = await this.unifiedRestoreManager.restoreFromFile(config as ProjectFileData);
      
      if (success) {
        // 初期状態をProjectStateManagerに保存
        const paramExport = this.parameterManager.exportCompressed();
        this.projectStateManager.updateCurrentState({
          lyricsData: JSON.parse(JSON.stringify(this.phrases)),
          currentTime: this.currentTime,
          templateAssignments: this.templateManager.exportAssignments(),
          globalParams: this.parameterManager.getGlobalDefaults(),
          objectParams: paramExport.objects || {},
          individualSettingsEnabled: paramExport.individualSettingsEnabled || [],
          defaultTemplateId: this.templateManager.getDefaultTemplateId()
        });
        this.projectStateManager.saveCurrentState('プロジェクト読み込み完了');
        
      }
      
      return success;
    } catch (error) {
      console.error(`Engine: プロジェクト読み込みエラー:`, error);
      return false;
    }
  }


  // 方眼目盛りの表示/非表示を切り替え
  toggleGrid(): void {
    if (this.gridOverlay) {
      this.gridOverlay.toggleVisibility();
      
      // デバッグマネージャーの設定も更新
      if (this.debugManager) {
        const settings = this.debugManager.getSettings();
        settings.showGrid = this.gridOverlay.visible;
        this.debugManager.updateSettings(settings);
      }
    }
  }

  // 方眼目盛りの表示状態を設定
  setGridVisible(visible: boolean): void {
    if (this.gridOverlay) {
      this.gridOverlay.setVisible(visible);
      
      // デバッグマネージャーの設定も更新
      if (this.debugManager) {
        const settings = this.debugManager.getSettings();
        settings.showGrid = visible;
        this.debugManager.updateSettings(settings);
      }
    }
  }

  // 方眼目盛りの表示状態を取得
  isGridVisible(): boolean {
    return this.gridOverlay?.visible || false;
  }

  /**
   * Set the background color of the PIXI application
   * @param hexColor Hex color string (e.g., "#333333" or "0x333333")
   */
  setBackgroundColor(hexColor: string): void {
    if (!this.app || !this.app.renderer) {
      console.warn('Engine: PIXI application not initialized');
      return;
    }
    
    try {
      // Convert hex string to PIXI color number
      let colorNumber: number;
      
      if (hexColor.startsWith('#')) {
        // Handle "#333333" format
        colorNumber = parseInt(hexColor.substring(1), 16);
      } else if (hexColor.startsWith('0x')) {
        // Handle "0x333333" format
        colorNumber = parseInt(hexColor.substring(2), 16);
      } else {
        // Assume it's already a hex string without prefix
        colorNumber = parseInt(hexColor, 16);
      }
      
      // Validate the color number
      if (isNaN(colorNumber) || colorNumber < 0 || colorNumber > 0xFFFFFF) {
        console.error(`Engine: Invalid color value: ${hexColor}`);
        return;
      }
      
      // Update the PIXI application background color
      this.app.renderer.backgroundColor = colorNumber;
      
    } catch (error) {
      console.error(`Engine: Error setting background color: ${hexColor}`, error);
    }
  }
  
  /**
   * 背景画像を設定
   */
  setBackgroundImage(imageFilePath: string, fitMode: BackgroundFitMode = 'cover'): void {
    this.clearBackgroundMedia();
    
    this.backgroundConfig = {
      type: 'image',
      imageFilePath,
      fitMode,
      backgroundColor: this.backgroundConfig.backgroundColor
    };
    
    PIXI.Texture.from(imageFilePath).then((texture) => {
      this.backgroundSprite = new PIXI.Sprite(texture);
      this.applyBackgroundFitMode(this.backgroundSprite, fitMode);
      this.backgroundLayer.addChild(this.backgroundSprite);
    }).catch((error) => {
      console.error(`Engine: Failed to load background image: ${imageFilePath}`, error);
      // フォールバック: 背景色に戻す
      this.clearBackgroundMedia();
    });
  }
  
  /**
   * 背景動画を設定
   */
  setBackgroundVideo(videoFilePath: string, fitMode: BackgroundFitMode = 'cover', loop: boolean = false): void {
    this.clearBackgroundMedia();
    
    this.backgroundConfig = {
      type: 'video',
      videoFilePath,
      fitMode,
      backgroundColor: this.backgroundConfig.backgroundColor,
      videoLoop: loop
    };
    
    // HTML5 Video要素を作成
    const video = document.createElement('video');
    // Properly encode the file path if it's a local file
    if (videoFilePath.startsWith('/') || videoFilePath.match(/^[A-Za-z]:\\/)) {
      // Convert to file:// URL and encode the path part
      const encodedPath = 'file://' + encodeURI(videoFilePath.replace(/\\/g, '/'));
      video.src = encodedPath;
    } else {
      video.src = videoFilePath;
    }
    video.loop = loop; // ループ設定を適用
    video.muted = true; // 自動再生のためにミュート
    video.playsInline = true;
    
    video.addEventListener('loadedmetadata', () => {
      const texture = PIXI.Texture.from(video);
      this.backgroundVideoSprite = new PIXI.Sprite(texture);
      this.applyBackgroundFitMode(this.backgroundVideoSprite, fitMode);
      this.backgroundLayer.addChild(this.backgroundVideoSprite);
      
      this.backgroundVideo = video;
      
      // 再生状態に応じて動画を同期
      if (this.isRunning) {
        video.currentTime = this.currentTime / 1000;
        video.play().catch(console.error);
      }
      
    });
    
    video.addEventListener('error', (error) => {
      console.error(`Engine: Failed to load background video: ${videoFilePath}`, error);
      // フォールバック: 背景色に戻す
      this.clearBackgroundMedia();
    });
    
    video.load();
  }
  
  /**
   * HTMLVideoElementから背景動画を設定（Electron用）
   */
  setBackgroundVideoElement(video: HTMLVideoElement, fitMode: BackgroundFitMode = 'cover', fileName?: string, loop: boolean = false): void {
    this.clearBackgroundMedia();
    
    // ファイル名を保存（復元用）
    if (fileName) {
      this.backgroundVideoFileName = fileName;
    }
    
    this.backgroundConfig = {
      type: 'video',
      videoFilePath: fileName || 'loaded',
      fitMode,
      backgroundColor: this.backgroundConfig.backgroundColor,
      videoLoop: loop
    };
    
    // ループ設定を適用
    video.loop = loop;
    
    // すでに読み込まれている動画からテクスチャを作成
    const texture = PIXI.Texture.from(video);
    this.backgroundVideoSprite = new PIXI.Sprite(texture);
    this.applyBackgroundFitMode(this.backgroundVideoSprite, fitMode);
    this.backgroundLayer.addChild(this.backgroundVideoSprite);
    
    this.backgroundVideo = video;
    
    // 再生状態に応じて動画を同期
    if (this.isRunning) {
      video.currentTime = this.currentTime / 1000;
      video.play().catch(console.error);
    }
    
  }

  /**
   * 背景メディアをクリア
   */
  clearBackgroundMedia(): void {
    // 背景スプライトを削除
    if (this.backgroundSprite) {
      this.backgroundLayer.removeChild(this.backgroundSprite);
      this.backgroundSprite.destroy();
      this.backgroundSprite = undefined;
    }
    
    // 背景動画を削除
    if (this.backgroundVideoSprite) {
      this.backgroundLayer.removeChild(this.backgroundVideoSprite);
      this.backgroundVideoSprite.destroy();
      this.backgroundVideoSprite = undefined;
    }
    
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
      this.backgroundVideo.src = '';
      this.backgroundVideo = undefined;
    }
    
    // 背景色タイプに戻す
    this.backgroundConfig.type = 'color';
    delete this.backgroundConfig.imageFilePath;
    delete this.backgroundConfig.videoFilePath;
  }
  
  /**
   * 背景のフィットモードを適用
   */
  private applyBackgroundFitMode(sprite: PIXI.Sprite, fitMode: BackgroundFitMode): void {
    const stageWidth = this.app.renderer.width;
    const stageHeight = this.app.renderer.height;
    const textureWidth = sprite.texture.width;
    const textureHeight = sprite.texture.height;
    
    switch (fitMode) {
      case 'cover': {
        // アスペクト比を保持しながら、ステージ全体を覆う
        const scale = Math.max(stageWidth / textureWidth, stageHeight / textureHeight);
        sprite.scale.set(scale);
        sprite.position.set(
          (stageWidth - textureWidth * scale) / 2,
          (stageHeight - textureHeight * scale) / 2
        );
        break;
      }
      case 'contain': {
        // アスペクト比を保持しながら、ステージ内に収める
        const scale = Math.min(stageWidth / textureWidth, stageHeight / textureHeight);
        sprite.scale.set(scale);
        sprite.position.set(
          (stageWidth - textureWidth * scale) / 2,
          (stageHeight - textureHeight * scale) / 2
        );
        break;
      }
      case 'stretch': {
        // アスペクト比を無視してステージに合わせる
        sprite.scale.set(stageWidth / textureWidth, stageHeight / textureHeight);
        sprite.position.set(0, 0);
        break;
      }
    }
  }
  
  /**
   * 背景設定を取得
   */
  getBackgroundConfig(): BackgroundConfig {
    return { ...this.backgroundConfig };
  }
  
  /**
   * 背景設定を更新
   */
  updateBackgroundConfig(config: Partial<BackgroundConfig>): void {
    const previousType = this.backgroundConfig.type;
    this.backgroundConfig = { ...this.backgroundConfig, ...config };
    
    // 背景タイプが変更された場合、既存の背景メディアをクリア
    if (config.type && config.type !== previousType) {
      if (config.type === 'color') {
        // 単色に変更された場合、動画や画像をクリア
        this.clearBackgroundMedia();
        // 単色を適用
        if (this.backgroundConfig.backgroundColor) {
          this.setBackgroundColor(this.backgroundConfig.backgroundColor);
        }
      }
    }
    
    // 単色背景の場合は即座に色を適用
    if (this.backgroundConfig.type === 'color' && config.backgroundColor) {
      this.setBackgroundColor(config.backgroundColor);
    }
    
    // 不透明度の更新
    if (config.opacity !== undefined) {
      this.backgroundLayer.alpha = config.opacity;
    }
    
    // フィットモードの更新
    if (config.fitMode && this.backgroundConfig.type !== 'color') {
      if (this.backgroundSprite) {
        this.applyBackgroundFitMode(this.backgroundSprite, config.fitMode);
      }
      if (this.backgroundVideoSprite) {
        this.applyBackgroundFitMode(this.backgroundVideoSprite, config.fitMode);
      }
    }
    
    // ループ設定の更新
    if (config.videoLoop !== undefined && this.backgroundVideo) {
      this.backgroundVideo.loop = config.videoLoop;
    }
  }
  
  // デバッグ機能の有効/無効を切り替え
  toggleDebug(): void {
    if (this.debugManager) {
      const enabled = !this.debugManager.isEnabled();
      this.debugManager.setEnabled(enabled);
    }
  }
  
  // デバッグ機能の有効/無効を設定
  setDebugEnabled(enabled: boolean): void {
    if (this.debugManager) {
      this.debugManager.setEnabled(enabled);
    }
  }
  
  /**
   * ステージのアスペクト比と向きを変更
   */
  resizeStage(aspectRatio: AspectRatio, orientation: Orientation): void {
    const { width, height, scale } = calculateStageSize(aspectRatio, orientation);
    
    // ステージ設定を更新
    this.stageConfig = {
      aspectRatio,
      orientation,
      baseWidth: width,
      baseHeight: height
    };
    
    // PIXIアプリケーションをリサイズ
    if (this.app && this.app.renderer) {
      this.app.renderer.resize(width, height);
      
      // CSSスケーリングを再適用
      this.applyCSSScaling();
      
      // インスタンスを再配置
      this.arrangeCharsOnStage();
      if (this.instanceManager) {
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
        this.instanceManager.update(this.currentTime);
      }
      
      // 背景のフィットモードを再適用
      if (this.backgroundConfig.type !== 'color' && this.backgroundConfig.fitMode) {
        if (this.backgroundSprite) {
          this.applyBackgroundFitMode(this.backgroundSprite, this.backgroundConfig.fitMode);
        }
        if (this.backgroundVideoSprite) {
          this.applyBackgroundFitMode(this.backgroundVideoSprite, this.backgroundConfig.fitMode);
        }
      }
      
    }
  }
  
  /**
   * CSSスケーリングを適用してコンテナ内に中央配置
   */
  private applyCSSScaling(): void {
    const canvas = this.app.view as HTMLCanvasElement;
    const { scale } = calculateStageSize(this.stageConfig.aspectRatio, this.stageConfig.orientation);
    
    // CSSでスケーリングと中央配置
    canvas.style.width = `${this.stageConfig.baseWidth * scale}px`;
    canvas.style.height = `${this.stageConfig.baseHeight * scale}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
  }
  
  /**
   * 個別設定が有効化されたオブジェクトのパラメータを保持
   */
  private preserveIndividualSettingObjectParams(): Map<string, StandardParameters> {
    return new Map<string, StandardParameters>();
  }
  
  /**
   * 個別設定が有効化されたオブジェクトのパラメータを復元
   */
  private restoreIndividualSettingObjectParams(preserved: Map<string, StandardParameters>): void {
    
    preserved.forEach((params, objectId) => {
      // パラメータを復元
      this.parameterManager.updateObjectParams(objectId, params);
      
      // インスタンスも更新
      this.updateObjectInstance(objectId);
    });
    
  }
  
  /**
   * 現在のステージ設定を取得
   */
  getStageConfig(): StageConfig {
    return { ...this.stageConfig };
  }
  
  // =============================================================================
  // セーブ・ロード機能関連のアクセサメソッド
  // =============================================================================
  
  /**
   * ProjectStateManagerを取得
   */
  getStateManager(): ProjectStateManager {
    return this.projectStateManager;
  }
  
  /**
   * TemplateManagerを取得
   */
  getTemplateManager(): TemplateManager {
    return this.templateManager;
  }
  
  /**
   * ParameterManagerを取得
   */
  getParameterManager(): ParameterManagerV2 {
    return this.parameterManager;
  }
  
  // デバッグ機能の有効/無効状態を取得
  isDebugEnabled(): boolean {
    return this.debugManager?.isEnabled() || false;
  }
  
  /**
   * 手動で再計算を実行（パラメータ値を変更せずに位置計算やランダムオフセットを再実行）
   */
  manualRecalculate(): void {
    try {
      
      // 状態保存（Undo用）
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)),
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        globalParams: this.parameterManager.getGlobalDefaults(),
        objectParams: this.parameterManager.exportCompressed().phrases || {},
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      this.projectStateManager.saveBeforeLyricsChange('手動再計算');
      
      // 文字位置情報をクリア
      this.charPositions.clear();
      
      // 文字配置を再計算
      this.arrangeCharsOnStage();
      
      // インスタンスマネージャーでフレーズを再読み込み
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      
      // 現在のテンプレートとパラメータで再初期化
      this.instanceManager.updateTemplate(this.template, this.parameterManager.getGlobalDefaults());
      
      // 現在の時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベントを発火
      this.dispatchTimelineUpdatedEvent();
      
    } catch (error) {
      console.error('Engine: 手動再計算エラー:', error);
    }
  }
  
  // デバッグマネージャーを取得
  getDebugManager(): DebugManager {
    return this.debugManager;
  }
  
  // メインコンテナを取得するメソッド（動画出力用）
  getMainContainer(): PIXI.Container {
    return this.instanceManager.getMainContainer();
  }

  /**
   * メインレンダラーから直接フレームをキャプチャ
   * プレビューと同じ表示内容で動画出力が可能
   */
  captureFrame(outputWidth?: number, outputHeight?: number, includeDebugVisuals: boolean = false): Uint8Array {
    try {
      
      // 現在のレンダラーのサイズ
      const currentWidth = this.app.renderer.width;
      const currentHeight = this.app.renderer.height;
      
      // デバッグビジュアルの一時的な制御
      const originalGridVisible = this.gridOverlay?.isVisible() || false;
      const originalDebugEnabled = this.debugManager?.isEnabled() || false;
      
      if (!includeDebugVisuals) {
        if (this.gridOverlay) {
          this.gridOverlay.hide();
        }
        if (this.debugManager) {
          this.debugManager.setEnabled(false);
        }
      }
      
      let pixels: Uint8Array;
      
      if (outputWidth && outputHeight && (outputWidth !== currentWidth || outputHeight !== currentHeight)) {
        // 異なるサイズで出力する場合はRenderTextureを使用
        const renderTexture = PIXI.RenderTexture.create({
          width: outputWidth,
          height: outputHeight,
          resolution: 1
        });
        
        // 一時的にレンダラーのサイズを変更
        this.app.renderer.resize(outputWidth, outputHeight);
        
        // メインステージをレンダーテクスチャに描画
        this.app.renderer.render(this.app.stage, { renderTexture });
        
        // ピクセルデータを取得
        pixels = this.app.renderer.extract.pixels(renderTexture);
        
        // レンダーテクスチャをクリーンアップ
        renderTexture.destroy();
        
        // レンダラーのサイズを元に戻す
        this.app.renderer.resize(currentWidth, currentHeight);
        
      } else {
        // 現在のサイズのままキャプチャ
        pixels = this.app.renderer.extract.pixels();
      }
      
      // デバッグビジュアルの設定を復元
      if (!includeDebugVisuals) {
        if (this.gridOverlay && originalGridVisible) {
          this.gridOverlay.show();
        }
        if (this.debugManager && originalDebugEnabled) {
          this.debugManager.setEnabled(true);
        }
      }
      
      return pixels;
      
    } catch (error) {
      console.error('Frame capture error:', error);
      throw new Error(`Failed to capture frame: ${error.message}`);
    }
  }

  /**
   * オフスクリーンフレームキャプチャ（シークアンドスナップ方式用）
   * RenderTexturePoolを使用してメモリ効率を最適化
   */
  captureOffscreenFrame(outputWidth: number, outputHeight: number, includeDebugVisuals: boolean = false): Uint8Array {
    if (!this.renderTexturePool) {
      throw new Error('Export resources not initialized. Call initializeExportResources first.');
    }

    try {
      
      // デバッグビジュアルの一時的な制御
      const originalGridVisible = this.gridOverlay?.isVisible() || false;
      const originalDebugEnabled = this.debugManager?.isEnabled() || false;
      
      if (!includeDebugVisuals) {
        if (this.gridOverlay) {
          this.gridOverlay.hide();
        }
        if (this.debugManager) {
          this.debugManager.setEnabled(false);
        }
      }
      
      // プールからテクスチャを借りる
      const renderTexture = this.renderTexturePool.acquire();
      
      try {
        // 🔧 固定ベースサイズを使用（プレビュー表示と同じ手法）
        // 動的なstage.width/heightではなく、設定されたbaseWidth/baseHeightを使用
        const baseWidth = this.stageConfig.baseWidth;
        const baseHeight = this.stageConfig.baseHeight;
        
        // スケーリング計算（固定ベースサイズから出力サイズに合わせる）
        const scaleX = outputWidth / baseWidth;
        const scaleY = outputHeight / baseHeight;
        const averageScale = (scaleX + scaleY) / 2; // 平均スケールを計算
        
        // 🔧 デバッグログ：サイズ比較
        const currentStageWidth = this.app.stage.width;
        const currentStageHeight = this.app.stage.height;
        console.log(`🎯 [FIXED_SIZE_CAPTURE] Base: ${baseWidth}x${baseHeight}, Stage: ${currentStageWidth}x${currentStageHeight}, Output: ${outputWidth}x${outputHeight}, Scale: ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}, AvgScale: ${averageScale.toFixed(3)}`);
        
        // パーティクル品質向上：解像度スケールファクターを設定
        this.setParticleResolutionScale(averageScale);
        
        // 現在のスケールを保存
        const originalScaleX = this.app.stage.scale.x;
        const originalScaleY = this.app.stage.scale.y;
        
        // 一時的にスケーリングを適用
        this.app.stage.scale.set(scaleX, scaleY);
        
        try {
          // スケーリング済みステージをオフスクリーンテクスチャに描画
          this.app.renderer.render(this.app.stage, { renderTexture });
          
          // ピクセルデータを取得
          const pixels = this.app.renderer.extract.pixels(renderTexture);
          
          return pixels;
          
        } finally {
          // スケーリングを元に戻す
          this.app.stage.scale.set(originalScaleX, originalScaleY);
          
          // パーティクル解像度スケールもリセット
          this.resetParticleResolutionScale();
        }
        
      } finally {
        // テクスチャをプールに返却（破棄しない）
        this.renderTexturePool.release(renderTexture);
        
        // デバッグビジュアルの設定を復元
        if (!includeDebugVisuals) {
          if (this.gridOverlay && originalGridVisible) {
            this.gridOverlay.show();
          }
          if (this.debugManager && originalDebugEnabled) {
            this.debugManager.setEnabled(true);
          }
        }
      }
      
    } catch (error) {
      console.error('Engine: Offscreen frame capture error:', error);
      throw new Error(`Failed to capture offscreen frame: ${error.message}`);
    }
  }

  /**
   * 背景動画へのアクセスを提供
   */
  getBackgroundVideo(): HTMLVideoElement | null {
    return this.backgroundVideo || null;
  }
  
  /**
   * 動画出力用の時間設定とレンダリング（背景動画除く）
   */
  setTimeForVideoCapture(timeMs: number): void {
    try {
      // 時間を設定
      this.setCurrentTime(timeMs);
      
      // 背景動画の時刻同期は VideoExporter 側で処理するためスキップ
      // NOTE: ここでの背景動画操作は重複処理を避けるため削除
      
      // 強制的にレンダリングを実行
      this.app.render();
      
      // アニメーションの更新を確実に実行
      if (this.instanceManager) {
        this.instanceManager.update(timeMs);
      }
      
    } catch (error) {
      console.error('Error setting time for video capture:', error);
      throw error;
    }
  }
  
  // デバッグ情報の更新（特にコンテナの座標情報）
  private updateDebugInfo(): void {
    try {
      // デバッグ機能が無効、またはインスタンスマネージャーがない場合は何もしない
      if (!this.instanceManager || !this.debugManager || !this.debugManager.isEnabled()) return;
      
      // アクティブなコンテナの情報を取得
      const activeInstances = this.instanceManager.getActiveInstances();
      
      // フレーズ、単語、文字レベルの各コンテナを検索
      let phraseContainer = null;
      let wordContainer = null;
      let charContainer = null;
      
      // IDでソートして先頭のものを使用（表示中のものを優先）
      const sortedIds = Array.from(activeInstances).sort();
      
      for (const id of sortedIds) {
        const instance = this.instanceManager.getInstance(id);
        if (!instance || !instance.container) continue;
        
        // コンテナの階層タイプによって格納
        if (instance.hierarchyType === 'phrase' && !phraseContainer) {
          phraseContainer = instance.container;
        } else if (instance.hierarchyType === 'word' && !wordContainer) {
          wordContainer = instance.container;
        } else if (instance.hierarchyType === 'char' && !charContainer) {
          charContainer = instance.container;
        }
        
        // 全レベルのコンテナが見つかったら終了
        if (phraseContainer && wordContainer && charContainer) break;
      }
      
      // デバッグマネージャーに情報を更新
      this.debugManager.updateFromEngine(
        phraseContainer,
        wordContainer,
        charContainer,
        this.app
      );
      
      // 定期的なデバッグログ出力（1秒に1回）
      if (this.currentTime % 1000 < 16) {
        // コンテナ階層構造を出力（サンプル的に単語コンテナのもの）
        if (wordContainer && this.currentTime % 5000 < 16) { // 5秒に1回
          this.debugManager.dumpContainerHierarchy(wordContainer);
        }
      }
    } catch (error) {
      console.error('デバッグ情報更新エラー:', error);
    }
  }
  
  // 現在位置のフレーズ詳細情報を取得するメソッド（デバッグ用）
  getCurrentPhraseInfo(): any {
    if (!this.debugManager?.isEnabled()) {
      return null;
    }
    
    try {
      // 現在時刻に表示されているフレーズを特定
      const currentPhrase = this.phrases.find(phrase => 
        this.currentTime >= phrase.start && this.currentTime <= phrase.end
      );
      
      if (!currentPhrase) {
        return null;
      }
      
      // フレーズで使用されているテンプレートを取得
      const templateId = this.getCurrentTemplateId(currentPhrase.id);
      const template = this.templateManager.getTemplateById(templateId);
      const templateConfig = this.templateManager.getAllTemplates().find(t => t.id === templateId);
      
      // 有効パラメータを取得
      const effectiveParams = this.getEffectiveParametersForPhrase(currentPhrase.id, templateId);
      
      // コンテナ情報を取得
      const containers = this.getCurrentPhraseContainers(currentPhrase.id);
      
      // フレーズ内の文字カウント情報を取得
      const charCounts = this.getCurrentPhraseCharCounts(currentPhrase);
      
      return {
        phraseId: currentPhrase.id,
        phraseText: currentPhrase.phrase,
        templateId: templateId,
        templateName: templateConfig?.config.name || templateId,
        containers: containers,
        parameters: {
          letterSpacing: effectiveParams.letterSpacing,
          fontSize: effectiveParams.fontSize,
          ...effectiveParams
        },
        charCounts: charCounts,
        timing: {
          start: currentPhrase.start,
          end: currentPhrase.end,
          current: this.currentTime
        }
      };
    } catch (error) {
      console.error('getCurrentPhraseInfo エラー:', error);
      return null;
    }
  }
  
  // 現在のフレーズのコンテナ情報を取得
  private getCurrentPhraseContainers(phraseId: string): any {
    if (!this.instanceManager) return null;
    
    try {
      // フレーズインスタンスを取得
      const phraseInstance = this.instanceManager.getInstance(phraseId);
      let containers: any = {};
      
      if (phraseInstance?.container) {
        phraseInstance.container.updateTransform();
        const phraseGlobal = phraseInstance.container.getGlobalPosition();
        const phraseLocal = phraseInstance.container.position;
        
        containers.phrase = {
          global: { x: phraseGlobal.x, y: phraseGlobal.y },
          local: { x: phraseLocal.x, y: phraseLocal.y }
        };
      }
      
      // フレーズ内の最初の単語のコンテナを取得
      const targetPhrase = this.phrases.find(p => p.id === phraseId);
      if (targetPhrase && targetPhrase.words.length > 0) {
        const firstWord = targetPhrase.words[0];
        const wordInstance = this.instanceManager.getInstance(firstWord.id);
        
        if (wordInstance?.container) {
          wordInstance.container.updateTransform();
          const wordGlobal = wordInstance.container.getGlobalPosition();
          const wordLocal = wordInstance.container.position;
          
          containers.word = {
            global: { x: wordGlobal.x, y: wordGlobal.y },
            local: { x: wordLocal.x, y: wordLocal.y }
          };
          
          // 最初の文字のコンテナも取得
          if (firstWord.chars.length > 0) {
            const firstChar = firstWord.chars[0];
            const charInstance = this.instanceManager.getInstance(firstChar.id);
            
            if (charInstance?.container) {
              charInstance.container.updateTransform();
              const charGlobal = charInstance.container.getGlobalPosition();
              const charLocal = charInstance.container.position;
              
              containers.char = {
                global: { x: charGlobal.x, y: charGlobal.y },
                local: { x: charLocal.x, y: charLocal.y }
              };
            }
          }
        }
      }
      
      return containers;
    } catch (error) {
      console.error('getCurrentPhraseContainers エラー:', error);
      return null;
    }
  }
  
  // 現在のフレーズの文字カウント情報を取得（コンテナ位置情報含む）
  private getCurrentPhraseCharCounts(phrase: PhraseUnit): any[] {
    try {
      const charCounts: any[] = [];
      let phraseCharIndex = 0;
      
      phrase.words.forEach((word, wordIndex) => {
        word.chars.forEach((char, charIndex) => {
          // 文字コンテナの位置情報を取得
          let containerPosition = null;
          if (this.instanceManager) {
            const charInstance = this.instanceManager.getInstance(char.id);
            if (charInstance?.container) {
              try {
                charInstance.container.updateTransform();
                const globalPos = charInstance.container.getGlobalPosition();
                const localPos = charInstance.container.position;
                
                containerPosition = {
                  global: { x: globalPos.x, y: globalPos.y },
                  local: { x: localPos.x, y: localPos.y }
                };
              } catch (error) {
                console.warn(`文字コンテナ位置取得エラー (${char.id}):`, error);
              }
            }
          }
          
          charCounts.push({
            id: char.id,
            char: char.char,
            phraseIndex: phraseCharIndex,
            totalInPhrase: phrase.words.reduce((sum, w) => sum + w.chars.length, 0),
            wordIndex: charIndex,
            totalInWord: word.chars.length,
            wordId: word.id,
            containerPosition: containerPosition, // コンテナ位置情報を追加
            timing: {
              start: char.start,
              end: char.end
            }
          });
          phraseCharIndex++;
        });
      });
      
      return charCounts;
    } catch (error) {
      console.error('getCurrentPhraseCharCounts エラー:', error);
      return [];
    }
  }
  
  // 自動保存機能のセットアップ
  private setupAutoSave(): void {
    // ページ可視性の変化を検知
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.autoSaveEnabled) {
        this.autoSaveToLocalStorage();
      } else if (!document.hidden) {
        // ページが表示状態に戻った時（システムスリープからの復帰を含む）
        // lastUpdateTimeをリセットして時間の不整合を防ぐ
        if (this.isRunning) {
          this.lastUpdateTime = performance.now();
          // console.log('[Engine] Page visibility restored, reset lastUpdateTime');
        }
      }
    });
    
    // ウィンドウのフォーカスが外れたとき
    window.addEventListener('blur', () => {
      if (this.autoSaveEnabled) {
        this.autoSaveToLocalStorage();
      }
    });
    
    // ウィンドウがフォーカスを取り戻したとき
    window.addEventListener('focus', () => {
      // フォーカス復帰時もlastUpdateTimeをリセット
      if (this.isRunning) {
        this.lastUpdateTime = performance.now();
        // console.log('[Engine] Window focus restored, reset lastUpdateTime');
      }
    });
    
    // ページがアンロードされる前
    window.addEventListener('beforeunload', () => {
      if (this.autoSaveEnabled) {
        this.autoSaveToLocalStorage();
      }
    });
    
    // 定期的な自動保存タイマーを開始
    this.startAutoSaveTimer();
  }
  
  // 定期的な自動保存タイマー
  private startAutoSaveTimer(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = window.setInterval(() => {
      if (this.autoSaveEnabled && this.phrases && this.phrases.length > 0) {
        const now = Date.now();
        // 最後の保存から10秒以上経過している場合のみ保存
        if (now - this.lastAutoSaveTime > 10000) {
          this.autoSaveToLocalStorage();
        }
      }
    }, Engine.AUTO_SAVE_INTERVAL);
  }
  
  // Electronアプリデータへの自動保存（V2統一形式）
  private async autoSaveToLocalStorage(): Promise<void> {
    try {
      // V2統一管理でパラメータデータを取得
      const parameterData = this.parameterManager.exportCompressed();
      
      
      const state = this.projectStateManager.exportFullState();
      
      // 既存の自動保存データを読み込んで、recentFilesを保持
      const existingData = await persistenceService.loadAutoSave();
      
      // 現在使用中の音楽・動画ファイルのパスを取得
      let audioFilePath: string | undefined;
      let backgroundVideoFilePath: string | undefined;
      
      try {
        // ElectronMediaManagerから現在のファイルパスを取得
        const { electronMediaManager } = await import('../services/ElectronMediaManager');
        audioFilePath = electronMediaManager.getCurrentAudioFilePath();
        backgroundVideoFilePath = electronMediaManager.getCurrentVideoFilePath();
      } catch (error) {
        console.warn('Engine: ファイルパス取得に失敗:', error);
      }

      const autoSaveData = {
        timestamp: Date.now(),
        projectState: state,
        // V2統一管理でパラメータデータを保存
        parameterData: parameterData,
        // 個別設定状態も保存
        individualSettingsEnabled: this.parameterManager.getIndividualSettingsEnabled(),
        engineState: {
          phrases: this.phrases,  // 構造とタイミング情報のみ（paramsは除外）
          audioInfo: {
            fileName: this.audioFileName,
            duration: this.audioDuration,
            filePath: this.audioFilePath || audioFilePath
          },
          backgroundVideoInfo: {
            fileName: this.backgroundVideoFileName,
            filePath: backgroundVideoFilePath
          },
          stageConfig: this.stageConfig,
          selectedTemplate: this.templateManager.getDefaultTemplateId(),
          templateParams: this.parameterManager.exportCompressed(),
          backgroundConfig: this.backgroundConfig
        },
        // 既存のrecentFilesデータを保持
        recentFiles: existingData?.recentFiles || { audioFiles: [], backgroundVideoFiles: [] }
      };
      
      console.log(`[Engine] ===== 自動保存実行 =====`);
      console.log(`[Engine] audioInfo保存内容:`, autoSaveData.engineState.audioInfo);
      console.log(`[Engine] 現在のaudioFileName: "${this.audioFileName}"`);
      console.log(`[Engine] 現在のaudioFilePath: "${this.audioFilePath}"`);
      console.log(`[Engine] 引数audioFilePath: "${audioFilePath}"`);
      console.log(`[Engine] ファイルパス一致確認: Engine=${this.audioFilePath === audioFilePath}, 引数使用=${this.audioFilePath || audioFilePath}`);
      
      const success = await persistenceService.saveAutoSave(autoSaveData);
      if (success) {
        this.lastAutoSaveTime = Date.now();
        console.log(`[Engine] 自動保存成功`);
      } else {
        console.warn('Engine: 自動保存に失敗しました（ディレクトリが存在しない可能性があります）');
      }
    } catch (error) {
      console.error('Engine: 自動保存に失敗しました:', error);
    }
  }
  
  // Electronアプリデータからの復元（統一復元マネージャー使用）
  public async loadFromLocalStorage(): Promise<boolean> {
    try {
      const autoSaveData = await persistenceService.loadAutoSave();
      if (!autoSaveData) {
        return false;
      }
      
      // データの有効期限チェック
      if (Date.now() - autoSaveData.timestamp > Engine.AUTO_SAVE_EXPIRY) {
        await persistenceService.deleteAutoSave();
        return false;
      }
      
      // Electron形式のデータ構造のみサポート
      if (!autoSaveData.engineState || !autoSaveData.projectState) {
        console.error('Engine: 無効な自動保存データ形式');
        console.error('Engine: engineState:', autoSaveData.engineState);
        console.error('Engine: projectState:', autoSaveData.projectState);
        return false;
      }
      
      
      // 統一復元マネージャーを使用
      const success = await this.unifiedRestoreManager.restoreFromAutoSave(autoSaveData as AutoSaveData);
      
      if (success) {
      }
      
      return success;
    } catch (error) {
      console.error('Engine: 自動保存データの復元に失敗しました:', error);
      return false;
    }
  }

  
  
  // 自動復元（ダイアログなし）
  private async silentAutoRestore(): Promise<void> {
    try {
      const hasAutoSave = await persistenceService.hasAutoSave();
      
      if (!hasAutoSave) {
        return;
      }
      
      const autoSaveData = await persistenceService.loadAutoSave();
      if (!autoSaveData) {
        return;
      }
      
      const timeAgo = Date.now() - autoSaveData.timestamp;
      
      // 24時間以内のデータの場合、自動的に復元
      if (timeAgo < Engine.AUTO_SAVE_EXPIRY) {
        
        if (!autoSaveData.engineState) {
          console.error('Engine: 無効な自動保存データ形式');
          return;
        }
        
        const hasLyrics = !!(autoSaveData.engineState.phrases && autoSaveData.engineState.phrases.length > 0);
        const hasAudio = !!autoSaveData.engineState.audioInfo?.fileName;
        const hasBackgroundVideo = !!autoSaveData.engineState.backgroundVideoInfo?.fileName;
        
        
        // loadFromLocalStorageを呼び出して実際の復元を実行
        const restored = await this.loadFromLocalStorage();
        
        if (restored) {
          
          // 音楽・背景動画ファイルの復元処理も改善版に変更
          if (hasAudio && autoSaveData.engineState.audioInfo) {
            const audioInfo = autoSaveData.engineState.audioInfo;
            console.log(`[Engine] ===== 音楽ファイル復元開始 =====`);
            console.log(`[Engine] 復元対象audioInfo:`, audioInfo);
            console.log(`[Engine] fileName: "${audioInfo.fileName}"`);
            console.log(`[Engine] filePath: "${audioInfo.filePath}"`);
            await this.requestAudioFileRestoreWithPath(audioInfo.fileName, audioInfo.filePath);
          }
          
          if (hasBackgroundVideo && autoSaveData.engineState.backgroundVideoInfo) {
            const videoInfo = autoSaveData.engineState.backgroundVideoInfo;
            await this.requestBackgroundVideoRestoreWithPath(videoInfo.fileName, videoInfo.filePath);
          }
          
          // 自動復元完了時にUIにテンプレート状態を通知
          if (autoSaveData.engineState.selectedTemplate) {
            window.dispatchEvent(new CustomEvent('auto-restore-template-updated', {
              detail: {
                templateId: autoSaveData.engineState.selectedTemplate,
                params: autoSaveData.engineState.templateParams
              }
            }));
          }
        } else {
        }
      } else {
        await persistenceService.deleteAutoSave();
      }
    } catch (error) {
      console.error('Engine: 自動復元に失敗しました:', error);
    }
  }
  
  // 自動保存データをクリア（正式保存後などに使用）
  public async clearAutoSave(): Promise<void> {
    try {
      await persistenceService.deleteAutoSave();
    } catch (error) {
      console.error('Engine: 自動保存データのクリアに失敗しました:', error);
    }
  }
  
  // 自動保存の有効/無効切り替え
  public setAutoSaveEnabled(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
    if (!enabled && this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    } else if (enabled && !this.autoSaveTimer) {
      this.startAutoSaveTimer();
    }
  }

  // 自動保存データから非同期でステージ設定を取得して適用
  private async initializeStageConfigFromAutoSave(): Promise<void> {
    try {
      const autoSaveData = await persistenceService.loadAutoSave();
      if (autoSaveData?.engineState?.stageConfig) {
        const autoSaveStageConfig = autoSaveData.engineState.stageConfig;
        
        // 現在の設定と異なる場合のみリサイズを実行
        const needsResize = (
          this.stageConfig.aspectRatio !== autoSaveStageConfig.aspectRatio ||
          this.stageConfig.orientation !== autoSaveStageConfig.orientation
        );
        
        if (needsResize) {
          this.stageConfig = autoSaveStageConfig;
          this.resizeStage(this.stageConfig.aspectRatio, this.stageConfig.orientation);
        } else {
        }
      } else {
      }
    } catch (error) {
    }
  }

  // 音楽ファイルの復元要求
  private requestAudioFileRestore(fileName: string): void {
    // UIコンポーネントに音楽ファイル復元イベントを発行
    window.dispatchEvent(new CustomEvent('visiblyrics:restore-audio-file', {
      detail: { fileName }
    }));
  }
  
  // 音楽ファイルの復元要求（パス付き） - 改善版
  private async requestAudioFileRestoreWithPath(fileName: string, filePath?: string): Promise<void> {
    try {
      
      // ElectronMediaManagerを直接呼び出して復元
      const { electronMediaManager } = await import('../services/ElectronMediaManager');
      const result = await electronMediaManager.restoreAudioFile(fileName, filePath);
      
      if (result) {
        // HTMLAudioElementをHowlerで再読み込み
        this.loadAudioElement(result.audio, result.fileName);
        
        // UI側に音楽ファイル復元完了を通知
        setTimeout(async () => {
          const actualFilePath = electronMediaManager.getCurrentAudioFilePath();
          const audioLoadEvent = new CustomEvent('music-file-loaded', {
            detail: { 
              filePath: actualFilePath,
              fileName: result.fileName,
              timestamp: Date.now(),
              isRestored: true  // 復元されたファイルであることを示すフラグ
            }
          });
          window.dispatchEvent(audioLoadEvent);
        }, 100);
      } else {
      }
    } catch (error) {
      console.error(`Engine: 音楽ファイル復元に失敗: ${fileName}`, error);
    }
  }
  
  private requestBackgroundVideoRestore(fileName: string): void {
    // UIコンポーネントに背景動画復元イベントを発行
    window.dispatchEvent(new CustomEvent('visiblyrics:restore-background-video', {
      detail: { fileName }
    }));
  }
  
  // 背景動画の復元要求（パス付き） - 改善版
  private async requestBackgroundVideoRestoreWithPath(fileName: string, filePath?: string): Promise<void> {
    try {
      
      // ElectronMediaManagerを直接呼び出して復元
      const { electronMediaManager } = await import('../services/ElectronMediaManager');
      const result = await electronMediaManager.restoreBackgroundVideo(fileName, filePath);
      
      if (result) {
        // 背景動画として設定（Electron用メソッド）
        // 保存されているループ設定を取得
        const storedLoop = this.backgroundConfig?.videoLoop || false;
        this.setBackgroundVideoElement(result.video, 'cover', result.fileName, storedLoop);
      } else {
      }
    } catch (error) {
      console.error(`Engine: 背景動画復元に失敗: ${fileName}`, error);
    }
  }
  
  /**
   * カスタムイベントを window に dispatch
   */
  private dispatchCustomEvent(eventType: string, detail?: any): void {
    const event = new CustomEvent(eventType, { 
      detail: detail,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);
  }
  
  /**
   * エクスポート用リソースを初期化（RenderTexturePool）
   */
  initializeExportResources(width: number, height: number): void {
    this.renderTexturePool = new RenderTexturePool(width, height, 5);
    
    // エクスポート用高解像度テキストの準備
    this.prepareHighResolutionTextForExport(width, height);
    
  }

  /**
   * エクスポート用リソースをクリーンアップ
   */
  cleanupExportResources(): void {
    if (this.renderTexturePool) {
      this.renderTexturePool.destroy();
      this.renderTexturePool = undefined;
    }
    
    // 高解像度テキストを元に戻す
    this.restoreOriginalTextAfterExport();
    
  }
  
  /**
   * エクスポート用の高解像度テキストを準備
   * @param exportWidth エクスポート幅
   * @param exportHeight エクスポート高さ
   */
  private prepareHighResolutionTextForExport(exportWidth: number, exportHeight: number): void {
    if (!this.instanceManager) {
      console.warn('Engine: InstanceManager not available for high-resolution text preparation');
      return;
    }
    
    
    // 全ての文字コンテナを取得してテキストを高解像度で再生成
    this.instanceManager.getAllInstances().forEach(instance => {
      if (instance.phraseContainer) {
        this.updateTextInContainer(instance.phraseContainer, exportWidth, exportHeight, true);
      }
    });
  }
  
  /**
   * エクスポート後に元のテキストに復元
   */
  private restoreOriginalTextAfterExport(): void {
    if (!this.instanceManager) {
      return;
    }
    
    
    // 全ての文字コンテナを取得してテキストを元の解像度で再生成
    this.instanceManager.getAllInstances().forEach(instance => {
      if (instance.phraseContainer) {
        this.updateTextInContainer(instance.phraseContainer, this.stageConfig.baseWidth, this.stageConfig.baseHeight, false);
      }
    });
  }
  
  /**
   * コンテナ内のテキストを更新（解像度適応型）
   * @param container 対象コンテナ
   * @param targetWidth 目標幅
   * @param targetHeight 目標高さ
   * @param isExport エクスポート用かどうか
   */
  private updateTextInContainer(
    container: PIXI.Container, 
    targetWidth: number, 
    targetHeight: number, 
    isExport: boolean
  ): void {
    // 再帰的に全ての子コンテナを処理
    container.children.forEach(child => {
      if (child instanceof PIXI.Container) {
        // 文字コンテナかどうかを判定（PIXITextが含まれているかで判断）
        const textChild = child.children.find(grandChild => grandChild instanceof PIXI.Text) as PIXI.Text;
        
        if (textChild) {
          // テキストオブジェクトを高解像度で再生成
          this.recreateTextForResolution(child, textChild, targetWidth, targetHeight, isExport);
        } else {
          // 子コンテナも再帰的に処理
          this.updateTextInContainer(child, targetWidth, targetHeight, isExport);
        }
      }
    });
  }
  
  /**
   * テキストオブジェクトを指定解像度で再生成
   * @param parentContainer 親コンテナ
   * @param originalText 元のテキストオブジェクト
   * @param targetWidth 目標幅
   * @param targetHeight 目標高さ
   * @param isExport エクスポート用かどうか
   */
  private recreateTextForResolution(
    parentContainer: PIXI.Container,
    originalText: PIXI.Text,
    targetWidth: number,
    targetHeight: number,
    isExport: boolean
  ): void {
    try {
      // 元のテキストの情報を保存
      const originalTextContent = originalText.text;
      const originalStyle = originalText.style;
      const originalPosition = { x: originalText.x, y: originalText.y };
      const originalAnchor = { x: originalText.anchor.x, y: originalText.anchor.y };
      const originalScale = { x: originalText.scale.x, y: originalText.scale.y };
      const originalAlpha = originalText.alpha;
      const originalVisible = originalText.visible;
      
      // 新しいテキストオブジェクトを作成
      const textOptions = {
        fontFamily: originalStyle.fontFamily as string,
        fontSize: originalStyle.fontSize as number,
        fill: originalStyle.fill as string,
        align: (originalStyle.align as 'left' | 'center' | 'right') || 'center',
        fontWeight: (originalStyle.fontWeight as string) || 'normal',
        fontStyle: (originalStyle.fontStyle as string) || 'normal'
      };
      
      let newText: PIXI.Text;
      
      if (isExport) {
        // エクスポート用の高解像度テキストを作成
        const { TextStyleFactory } = require('../utils/TextStyleFactory');
        newText = TextStyleFactory.createExportText(
          originalTextContent,
          textOptions,
          targetWidth,
          targetHeight
        );
      } else {
        // 通常の解像度のテキストを作成
        const { TextStyleFactory } = require('../utils/TextStyleFactory');
        newText = TextStyleFactory.createText(originalTextContent, textOptions);
      }
      
      // 元の属性を復元
      newText.position.set(originalPosition.x, originalPosition.y);
      newText.anchor.set(originalAnchor.x, originalAnchor.y);
      newText.scale.set(originalScale.x, originalScale.y);
      newText.alpha = originalAlpha;
      newText.visible = originalVisible;
      
      // 元のテキストを削除して新しいテキストを追加
      parentContainer.removeChild(originalText);
      parentContainer.addChild(newText);
      
    } catch (error) {
      console.error('Engine: Failed to recreate text for resolution:', error);
    }
  }
  
  // =====================================
  // ParameterManagerV2 統合メソッド
  // =====================================
  
  /**
   * V2パラメータマネージャーの初期化（コンストラクタで実行済み）
   */
  
  /**
   * パラメータ取得（V2専用）
   */
  public getEffectiveParametersForPhrase(phraseId: string, templateId: string): StandardParameters {
    // V2モード: フレーズが初期化されていない場合は初期化
    if (!this.parameterManager.isPhraseInitialized(phraseId)) {
      this.parameterManager.initializePhrase(phraseId, templateId);
    }
    return this.parameterManager.getParameters(phraseId);
  }
  
  /**
   * パラメータ更新（V2専用）
   */
  public updatePhraseParameters(phraseId: string, params: Partial<StandardParameters>): void {
    // V2モード: 直接更新
    this.parameterManager.updateParameters(phraseId, params);
  }
  
  /**
   * グローバルパラメータ更新（V2専用）
   */
  public updateGlobalParameters(params: Partial<StandardParameters>): void {
    console.log('[Engine] updateGlobalParameters called with params:', Object.keys(params));
    
    // V2モード: グローバルデフォルトを更新（通知無効化）
    this.parameterManager.updateGlobalDefaultsSilent(params);
    
    // 最適化されたパラメータ更新を使用
    this.optimizedUpdater.setCurrentTime(this.currentTime);
    // ログ抑制: Current time (毎フレーム出力)
    
    // 初期化済みフレーズのリストを作成
    const phrasesToUpdate = this.phrases
      .filter(phrase => this.parameterManager.isPhraseInitialized(phrase.id))
      .map(phrase => ({
        id: phrase.id,
        startMs: phrase.start * 1000,  // 秒からミリ秒に変換
        endMs: phrase.end * 1000        // 秒からミリ秒に変換
      }));
    
    console.log('[Engine] Phrases to update sample:', phrasesToUpdate.slice(0, 3));
    
    // 最適化された更新を実行
    this.optimizedUpdater.updateGlobalParametersOptimized(
      phrasesToUpdate,
      params,
      {
        updatePhrase: (phraseId, updateParams) => {
          this.parameterManager.updateParameters(phraseId, updateParams);
        },
        onSyncComplete: (visiblePhraseIds) => {
          // 表示範囲の同期更新完了後、表示範囲内のインスタンスのみ更新
          if (this.instanceManager) {
            // 表示範囲内のフレーズのみ更新
            this.instanceManager.updateExistingInstances(visiblePhraseIds);
            this.instanceManager.update(this.currentTime);
          }
        },
        onBatchComplete: (phraseIds) => {
          // 非同期バッチ処理完了後、該当フレーズのインスタンスを更新
          if (this.instanceManager) {
            this.instanceManager.updateExistingInstances(phraseIds);
          }
        },
        onAllComplete: () => {
          // すべての非同期更新完了後の処理
          console.log('Engine: すべてのパラメータ更新が完了しました');
        }
      }
    );
    
    // プロジェクト状態を更新
    const currentState = this.projectStateManager.getCurrentState();
    if (currentState) {
      this.projectStateManager.updateCurrentState({
        globalParams: { ...currentState.globalParams, ...params }
      });
    }
  }
  
  /**
   * テンプレート変更（V2専用）
   */
  public handleTemplateChangeForPhrase(
    phraseId: string,
    newTemplateId: string,
    preserveParams: boolean = true
  ): void {
    // V2モード
    this.parameterManager.handleTemplateChange(phraseId, newTemplateId, preserveParams);
    
    // テンプレート割り当ての更新
    this.templateManager.assignTemplate(phraseId, newTemplateId);
  }
  
}

export default Engine;