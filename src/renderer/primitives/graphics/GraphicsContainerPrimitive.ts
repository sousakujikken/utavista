/**
 * GraphicsContainerPrimitive
 * グラフィック要素のコンテナ管理と歌詞タイミング同期を提供
 */

import * as PIXI from 'pixi.js';

/**
 * 歌詞タイミング情報
 */
export interface GraphicsTimingInfo {
  phraseStart: number;
  phraseEnd: number;
  wordTimings?: Array<{ start: number; end: number; index: number }>;
  charTimings?: Array<{ start: number; end: number; index: number }>;
  currentTime: number;
}

/**
 * グラフィック層の種類
 */
export type GraphicsLayerType = 'below_text' | 'above_text';

/**
 * グラフィックレイヤー設定
 */
export interface GraphicsLayerConfig {
  layerId: string;
  zIndex: number;
  layerType: GraphicsLayerType; // テキストより下層か上層か
  visible?: boolean;
  alpha?: number;
  blendMode?: PIXI.BLEND_MODES;
}

/**
 * グラフィック要素のライフサイクル
 */
export interface GraphicsLifecycle {
  createAt: 'phrase_start' | 'word_start' | 'char_start' | 'custom';
  destroyAt: 'phrase_end' | 'word_end' | 'char_end' | 'custom';
  customTiming?: {
    createMs?: number;
    destroyMs?: number;
  };
}

/**
 * グラフィックコンテナプリミティブ
 * グラフィックレイヤーの管理と歌詞同期機能を提供
 * テキスト下層・上層の分離管理をサポート
 */
export class GraphicsContainerPrimitive {
  // レイヤー管理
  private layers: Map<string, PIXI.Container> = new Map();
  
  // 下層・上層コンテナの管理
  private belowTextContainers: Map<string, PIXI.Container> = new Map();
  private aboveTextContainers: Map<string, PIXI.Container> = new Map();
  
  // グラフィック要素管理
  private graphicsElements: Map<string, {
    element: PIXI.DisplayObject;
    lifecycle: GraphicsLifecycle;
    layerId: string;
  }> = new Map();
  
  // タイミング情報キャッシュ
  private timingCache: Map<string, GraphicsTimingInfo> = new Map();

  /**
   * グラフィックレイヤーシステムの初期化
   * フレーズコンテナに下層・上層コンテナを作成
   */
  initializeGraphicsLayers(phraseContainer: PIXI.Container, phraseId: string): {
    belowTextContainer: PIXI.Container;
    aboveTextContainer: PIXI.Container;
  } {
    const belowTextContainerId = `${phraseId}_below_text`;
    const aboveTextContainerId = `${phraseId}_above_text`;
    
    // 既存チェック
    if (this.belowTextContainers.has(belowTextContainerId) && 
        this.aboveTextContainers.has(aboveTextContainerId)) {
      return {
        belowTextContainer: this.belowTextContainers.get(belowTextContainerId)!,
        aboveTextContainer: this.aboveTextContainers.get(aboveTextContainerId)!
      };
    }
    
    // 下層コンテナ作成（テキストより下）
    const belowTextContainer = new PIXI.Container();
    belowTextContainer.name = `graphics_below_text_${phraseId}`;
    belowTextContainer.zIndex = -100; // テキストより下層
    
    // 上層コンテナ作成（テキストより上）
    const aboveTextContainer = new PIXI.Container();
    aboveTextContainer.name = `graphics_above_text_${phraseId}`;
    aboveTextContainer.zIndex = 100; // テキストより上層
    
    // フレーズコンテナに追加
    phraseContainer.addChild(belowTextContainer);
    phraseContainer.addChild(aboveTextContainer);
    phraseContainer.sortChildren();
    
    // 管理マップに登録
    this.belowTextContainers.set(belowTextContainerId, belowTextContainer);
    this.aboveTextContainers.set(aboveTextContainerId, aboveTextContainer);
    
    console.log(`[GraphicsContainer] レイヤーシステム初期化: ${phraseId}`);
    
    return { belowTextContainer, aboveTextContainer };
  }
  
  /**
   * グラフィックレイヤーの作成
   */
  createGraphicsLayer(
    parentContainer: PIXI.Container,
    config: GraphicsLayerConfig
  ): PIXI.Container {
    // 既存レイヤーがあれば返す
    if (this.layers.has(config.layerId)) {
      console.warn(`[GraphicsContainer] Layer ${config.layerId} already exists`);
      return this.layers.get(config.layerId)!;
    }

    // 新規レイヤー作成
    const layer = new PIXI.Container();
    layer.name = `graphics_layer_${config.layerId}_${config.layerType}`;
    layer.zIndex = config.zIndex;
    layer.visible = config.visible !== undefined ? config.visible : true;
    layer.alpha = config.alpha !== undefined ? config.alpha : 1.0;
    
    if (config.blendMode !== undefined) {
      layer.blendMode = config.blendMode;
    }

    // レイヤータイプに応じて適切なコンテナに追加
    let targetContainer: PIXI.Container;
    
    if (config.layerType === 'below_text') {
      // 下層コンテナを探す
      targetContainer = this.findBelowTextContainer(parentContainer);
    } else {
      // 上層コンテナを探す  
      targetContainer = this.findAboveTextContainer(parentContainer);
    }
    
    if (!targetContainer) {
      console.error(`[GraphicsContainer] 適切なコンテナが見つかりません: ${config.layerType}`);
      targetContainer = parentContainer; // フォールバック
    }
    
    // 対象コンテナに追加
    targetContainer.addChild(layer);
    targetContainer.sortChildren();
    
    // レイヤーを登録
    this.layers.set(config.layerId, layer);
    
    console.log(`[GraphicsContainer] レイヤー作成: ${config.layerId} (${config.layerType})`);
    
    return layer;
  }

  /**
   * グラフィックレイヤーの取得
   */
  getLayer(layerId: string): PIXI.Container | undefined {
    return this.layers.get(layerId);
  }

  /**
   * グラフィック要素の追加
   */
  addGraphicsElement(
    elementId: string,
    element: PIXI.DisplayObject,
    layerId: string,
    lifecycle: GraphicsLifecycle
  ): void {
    const layer = this.layers.get(layerId);
    if (!layer) {
      console.error(`[GraphicsContainer] Layer ${layerId} not found`);
      return;
    }

    // 既存要素があれば削除
    if (this.graphicsElements.has(elementId)) {
      this.removeGraphicsElement(elementId);
    }

    // レイヤーに追加
    layer.addChild(element);
    
    // 要素を登録
    this.graphicsElements.set(elementId, {
      element,
      lifecycle,
      layerId
    });
  }

  /**
   * グラフィック要素の削除
   */
  removeGraphicsElement(elementId: string): void {
    const elementInfo = this.graphicsElements.get(elementId);
    if (!elementInfo) {
      return;
    }

    const layer = this.layers.get(elementInfo.layerId);
    if (layer && elementInfo.element.parent === layer) {
      layer.removeChild(elementInfo.element);
    }

    // 要素を破棄
    if (elementInfo.element instanceof PIXI.Graphics) {
      elementInfo.element.clear();
    }
    elementInfo.element.destroy();
    
    // 登録から削除
    this.graphicsElements.delete(elementId);
  }

  /**
   * 歌詞タイミングとの同期
   */
  syncWithLyrics(
    layerId: string,
    timingInfo: GraphicsTimingInfo
  ): void {
    const layer = this.layers.get(layerId);
    if (!layer) {
      return;
    }

    // タイミング情報をキャッシュ
    this.timingCache.set(layerId, timingInfo);

    // ライフサイクルに基づいて要素を管理
    this.graphicsElements.forEach((elementInfo, elementId) => {
      if (elementInfo.layerId !== layerId) {
        return;
      }

      const shouldExist = this.shouldElementExist(
        elementInfo.lifecycle,
        timingInfo
      );

      // 表示/非表示制御
      elementInfo.element.visible = shouldExist;
    });
  }

  /**
   * 要素が存在すべきかを判定
   */
  private shouldElementExist(
    lifecycle: GraphicsLifecycle,
    timing: GraphicsTimingInfo
  ): boolean {
    const nowMs = timing.currentTime;
    
    // 作成タイミングチェック
    let shouldCreate = false;
    switch (lifecycle.createAt) {
      case 'phrase_start':
        shouldCreate = nowMs >= timing.phraseStart;
        break;
      case 'word_start':
        if (timing.wordTimings && timing.wordTimings.length > 0) {
          shouldCreate = nowMs >= timing.wordTimings[0].start;
        }
        break;
      case 'char_start':
        if (timing.charTimings && timing.charTimings.length > 0) {
          shouldCreate = nowMs >= timing.charTimings[0].start;
        }
        break;
      case 'custom':
        if (lifecycle.customTiming?.createMs !== undefined) {
          shouldCreate = nowMs >= lifecycle.customTiming.createMs;
        }
        break;
    }

    // 破棄タイミングチェック
    let shouldDestroy = false;
    switch (lifecycle.destroyAt) {
      case 'phrase_end':
        shouldDestroy = nowMs > timing.phraseEnd;
        break;
      case 'word_end':
        if (timing.wordTimings && timing.wordTimings.length > 0) {
          const lastWord = timing.wordTimings[timing.wordTimings.length - 1];
          shouldDestroy = nowMs > lastWord.end;
        }
        break;
      case 'char_end':
        if (timing.charTimings && timing.charTimings.length > 0) {
          const lastChar = timing.charTimings[timing.charTimings.length - 1];
          shouldDestroy = nowMs > lastChar.end;
        }
        break;
      case 'custom':
        if (lifecycle.customTiming?.destroyMs !== undefined) {
          shouldDestroy = nowMs > lifecycle.customTiming.destroyMs;
        }
        break;
    }

    return shouldCreate && !shouldDestroy;
  }

  /**
   * 特定のタイミングでアクティブな要素を取得
   */
  getActiveElementAtTime(
    timing: 'word' | 'char',
    timingInfo: GraphicsTimingInfo
  ): number {
    const nowMs = timingInfo.currentTime;
    
    if (timing === 'word' && timingInfo.wordTimings) {
      for (let i = 0; i < timingInfo.wordTimings.length; i++) {
        const word = timingInfo.wordTimings[i];
        if (nowMs >= word.start && nowMs <= word.end) {
          return i;
        }
      }
    } else if (timing === 'char' && timingInfo.charTimings) {
      for (let i = 0; i < timingInfo.charTimings.length; i++) {
        const char = timingInfo.charTimings[i];
        if (nowMs >= char.start && nowMs <= char.end) {
          return i;
        }
      }
    }
    
    return -1;
  }

  /**
   * 下層コンテナを検索
   */
  private findBelowTextContainer(parentContainer: PIXI.Container): PIXI.Container | null {
    // 親コンテナから下層コンテナを探す
    const belowContainer = parentContainer.children.find(child => 
      child instanceof PIXI.Container && child.name.includes('graphics_below_text_')
    ) as PIXI.Container;
    
    return belowContainer || null;
  }
  
  /**
   * 上層コンテナを検索
   */
  private findAboveTextContainer(parentContainer: PIXI.Container): PIXI.Container | null {
    // 親コンテナから上層コンテナを探す
    const aboveContainer = parentContainer.children.find(child => 
      child instanceof PIXI.Container && child.name.includes('graphics_above_text_')
    ) as PIXI.Container;
    
    return aboveContainer || null;
  }
  
  /**
   * すべてのレイヤーをクリア
   */
  clearAllLayers(): void {
    // すべての要素を削除
    this.graphicsElements.forEach((_, elementId) => {
      this.removeGraphicsElement(elementId);
    });

    // レイヤーをクリア
    this.layers.forEach((layer, layerId) => {
      if (layer.parent) {
        layer.parent.removeChild(layer);
      }
      layer.destroy({ children: true });
    });
    
    // 下層・上層コンテナをクリア
    this.belowTextContainers.forEach((container, containerId) => {
      if (container.parent) {
        container.parent.removeChild(container);
      }
      container.destroy({ children: true });
    });
    
    this.aboveTextContainers.forEach((container, containerId) => {
      if (container.parent) {
        container.parent.removeChild(container);
      }
      container.destroy({ children: true });
    });

    this.layers.clear();
    this.graphicsElements.clear();
    this.timingCache.clear();
    this.belowTextContainers.clear();
    this.aboveTextContainers.clear();
  }

  /**
   * 特定レイヤーのクリア
   */
  clearLayer(layerId: string): void {
    // レイヤー内の要素を削除
    const elementsToRemove: string[] = [];
    this.graphicsElements.forEach((elementInfo, elementId) => {
      if (elementInfo.layerId === layerId) {
        elementsToRemove.push(elementId);
      }
    });

    elementsToRemove.forEach(elementId => {
      this.removeGraphicsElement(elementId);
    });

    // レイヤー自体も削除
    const layer = this.layers.get(layerId);
    if (layer) {
      if (layer.parent) {
        layer.parent.removeChild(layer);
      }
      layer.destroy({ children: true });
      this.layers.delete(layerId);
    }

    this.timingCache.delete(layerId);
  }
  
  /**
   * 特定フレーズの全グラフィック要素をクリア
   */
  clearPhraseGraphics(phraseId: string): void {
    const belowTextContainerId = `${phraseId}_below_text`;
    const aboveTextContainerId = `${phraseId}_above_text`;
    
    // 下層コンテナのクリア
    const belowContainer = this.belowTextContainers.get(belowTextContainerId);
    if (belowContainer) {
      if (belowContainer.parent) {
        belowContainer.parent.removeChild(belowContainer);
      }
      belowContainer.destroy({ children: true });
      this.belowTextContainers.delete(belowTextContainerId);
    }
    
    // 上層コンテナのクリア
    const aboveContainer = this.aboveTextContainers.get(aboveTextContainerId);
    if (aboveContainer) {
      if (aboveContainer.parent) {
        aboveContainer.parent.removeChild(aboveContainer);
      }
      aboveContainer.destroy({ children: true });
      this.aboveTextContainers.delete(aboveTextContainerId);
    }
    
    console.log(`[GraphicsContainer] フレーズグラフィック削除: ${phraseId}`);
  }
}