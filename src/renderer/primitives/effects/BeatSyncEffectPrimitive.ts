import * as PIXI from 'pixi.js';
import { BeatMarker } from '../../services/AudioAnalyzer';

/**
 * ビート同期エフェクトのパラメータ
 */
export interface BeatSyncEffectParams {
  enableBeatSync: boolean;
  beatSyncScale: number;           // 最大拡大倍率 (1.0-3.0)
  beatSyncDuration: number;        // エフェクト持続時間 (ms)
  beatSyncOpacity: number;         // 初期不透明度 (0.0-1.0)
  beatSyncThreshold: number;       // ビート信頼度の閾値 (0.0-1.0)
  beatSyncColor: string;          // エフェクトカラー（オプション）
  beatSyncOffset: number;         // ビートタイミングからのオフセット (ms)
  beatSyncBlendMode: PIXI.BLEND_MODES; // ブレンドモード
}

/**
 * アクティブなビートエフェクトアニメーション
 */
interface ActiveBeatEffect {
  container: PIXI.Container;
  startTime: number;
  duration: number;
  initialScale: number;
  targetScale: number;
  initialOpacity: number;
  beatTimestamp: number;
  charId: string;
}

/**
 * ビート同期エフェクトプリミティブ
 * ビートのタイミングで文字コンテナのコピーを拡大&フェードアウト
 */
export class BeatSyncEffectPrimitive {
  private activeEffects: Map<string, ActiveBeatEffect[]> = new Map();
  private beatMarkers: BeatMarker[] = [];
  private lastProcessedBeatIndex: number = 0;
  
  constructor() {
    console.log('BeatSyncEffectPrimitive initialized');
  }

  /**
   * ビートマーカーを更新
   */
  updateBeatMarkers(beats: BeatMarker[]): void {
    this.beatMarkers = beats;
    this.lastProcessedBeatIndex = 0;
    console.log(`BeatSyncEffect: Updated ${beats.length} beat markers`);
  }

  /**
   * ビート同期エフェクトを適用
   */
  applyBeatSyncEffect(
    originalContainer: PIXI.Container,
    parentContainer: PIXI.Container,
    params: BeatSyncEffectParams,
    currentTime: number,
    charId: string
  ): boolean {
    if (!params.enableBeatSync) {
      return false;
    }

    // Get beat markers from engine if primitive's array is empty
    if (this.beatMarkers.length === 0) {
      const engine = (window as any).engineInstance;
      if (engine && engine.getBeatMarkers) {
        const engineBeats = engine.getBeatMarkers();
        if (engineBeats && engineBeats.length > 0) {
          this.beatMarkers = engineBeats;
          console.log(`BeatSync: Synchronized ${engineBeats.length} beats from engine`);
        }
      }
    }

    if (this.beatMarkers.length === 0) {
      return false;
    }

    // デバッグ情報（より頻繁に出力して確認）
    if (Math.random() < 0.05) { // 5%の確率で出力
      const firstBeat = this.beatMarkers[0].timestamp;
      const lastBeat = this.beatMarkers[this.beatMarkers.length - 1].timestamp;
      console.log(`BeatSync Debug: currentTime=${currentTime}ms, beatRange=${firstBeat}ms-${lastBeat}ms (${this.beatMarkers.length} beats), threshold=${params.beatSyncThreshold}`);
      
      // 現在時刻付近のビートを確認（広い範囲で）
      const nearbyBeats = this.beatMarkers.filter(beat => Math.abs(currentTime - beat.timestamp) <= 500);
      if (nearbyBeats.length > 0) {
        console.log(`BeatSync: Nearby beats (±500ms):`, nearbyBeats.slice(0, 5).map(b => `${b.timestamp}ms (diff:${(b.timestamp - currentTime).toFixed(0)}ms, conf:${b.confidence.toFixed(2)})`));
      } else {
        console.log(`BeatSync: No beats found within ±500ms of current time ${currentTime}ms`);
      }
    }

    // 現在時刻付近のビートをチェック（±100ms以内に拡大してテスト）
    const tolerance = 100;
    const currentBeats = this.beatMarkers.filter(beat => {
      const beatTime = beat.timestamp + params.beatSyncOffset;
      const timeDiff = Math.abs(currentTime - beatTime);
      const confidenceCheck = beat.confidence >= params.beatSyncThreshold;
      const timeCheck = timeDiff <= tolerance;
      
      // デバッグ: フィルタリング条件の詳細ログ（ランダムに少ない頻度で）
      if (Math.random() < 0.001 && timeDiff <= 200) { // 200ms以内のビートの0.1%のみ
        console.log(`BeatSync Filter Debug: beat@${beat.timestamp}ms, currentTime=${currentTime}ms, timeDiff=${timeDiff}ms, confidence=${beat.confidence.toFixed(3)}, threshold=${params.beatSyncThreshold}, timeOK=${timeCheck}, confOK=${confidenceCheck}`);
      }
      
      return timeCheck && confidenceCheck;
    });

    // ビートが見つかった場合のデバッグ出力
    if (currentBeats.length > 0) {
      console.log(`BeatSync: Found ${currentBeats.length} beats at ${currentTime}ms for char ${charId}`);
    }

    // 新しいビートが見つかった場合、エフェクトを開始
    for (const beat of currentBeats) {
      const beatTime = beat.timestamp + params.beatSyncOffset;
      
      // 既に処理済みのビートかチェック
      const effectKey = `${charId}_${beat.timestamp}`;
      const existingEffects = this.activeEffects.get(charId) || [];
      const alreadyProcessed = existingEffects.some(effect => 
        Math.abs(effect.beatTimestamp - beat.timestamp) < 10
      );

      if (!alreadyProcessed && Math.abs(currentTime - beatTime) <= tolerance) {
        console.log(`BeatSync: Starting effect for ${charId} at beat ${beat.timestamp}ms (confidence: ${beat.confidence})`);
        this.startBeatEffect(originalContainer, parentContainer, params, currentTime, beat, charId);
      }
    }

    // アクティブなエフェクトを更新
    this.updateActiveEffects(currentTime, charId);

    return this.activeEffects.has(charId) && this.activeEffects.get(charId)!.length > 0;
  }

  /**
   * フレーズ内の全ての可視文字コンテナに対してビート同期エフェクトを適用
   */
  applyBeatSyncEffectToPhrase(
    phraseContainer: PIXI.Container,
    params: BeatSyncEffectParams,
    currentTime: number,
    phraseId: string
  ): boolean {
    if (!params.enableBeatSync || this.beatMarkers.length === 0) {
      return false;
    }

    if (!phraseContainer || phraseContainer.destroyed) {
      return false;
    }

    let effectApplied = false;
    let containersFound = 0;

    // フレーズコンテナ内の全ての単語コンテナを探索
    this.traverseAndApplyEffects(phraseContainer, params, currentTime, phraseId, (container, charId) => {
      containersFound++;
      console.log(`BeatSync: Found char container ${charId}, alpha=${container.alpha}, visible=${container.visible}`);
      
      if (this.applyBeatSyncEffect(container, phraseContainer, params, currentTime, charId)) {
        effectApplied = true;
      }
    });

    console.log(`BeatSync: Traversed phrase ${phraseId}, found ${containersFound} char containers, applied=${effectApplied}`);

    return effectApplied;
  }

  /**
   * コンテナツリーを再帰的に探索し、表示中の文字コンテナにエフェクトを適用
   */
  private traverseAndApplyEffects(
    container: PIXI.Container,
    params: BeatSyncEffectParams,
    currentTime: number,
    phraseId: string,
    applyCallback: (container: PIXI.Container, charId: string) => void
  ): void {
    if (!container || container.destroyed || container.alpha <= 0) {
      return;
    }

    // 文字コンテナかどうかをチェック（名前にcharが含まれている、またはTextオブジェクトを含んでいる）
    const isCharContainer = container.name?.includes('char') || 
                           container.children.some(child => child instanceof PIXI.Text);

    if (isCharContainer && this.hasVisibleText(container)) {
      // 文字コンテナの場合はエフェクトを適用
      const charId = container.name || `${phraseId}_char_${currentTime}_${Math.random().toFixed(6)}`;
      applyCallback(container, charId);
    } else {
      // 文字コンテナでない場合は子要素を再帰的に探索
      for (const child of container.children) {
        if (child instanceof PIXI.Container) {
          this.traverseAndApplyEffects(child, params, currentTime, phraseId, applyCallback);
        }
      }
    }
  }

  /**
   * コンテナに表示可能なテキストが含まれているかチェック
   */
  private hasVisibleText(container: PIXI.Container): boolean {
    // コンテナ自体が完全に透明な場合のみ除外
    if (container.alpha <= 0) {
      return false;
    }

    for (const child of container.children) {
      if (child instanceof PIXI.Text && child.alpha > 0 && child.text.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * ビートエフェクトを開始
   */
  private startBeatEffect(
    originalContainer: PIXI.Container,
    parentContainer: PIXI.Container,
    params: BeatSyncEffectParams,
    currentTime: number,
    beat: BeatMarker,
    charId: string
  ): void {
    try {
      // コンテナの有効性をチェック
      if (!originalContainer || originalContainer.destroyed) {
        return;
      }
      if (!parentContainer || parentContainer.destroyed) {
        return;
      }

      // 元のコンテナをコピー
      const effectContainer = this.createContainerCopy(originalContainer);
      if (!effectContainer) {
        return;
      }

      // エフェクト用のプロパティを設定
      effectContainer.alpha = params.beatSyncOpacity;
      
      // カラーフィルター適用（オプション）
      if (params.beatSyncColor !== '#ffffff') {
        const colorMatrix = new PIXI.ColorMatrixFilter();
        const color = this.hexToRgb(params.beatSyncColor);
        if (color) {
          colorMatrix.tint(color.r / 255, color.g / 255, color.b / 255);
          effectContainer.filters = [colorMatrix];
        }
      }

      // ブレンドモード設定
      effectContainer.blendMode = params.beatSyncBlendMode;

      // 親コンテナに追加
      parentContainer.addChild(effectContainer);
      
      console.log(`BeatSync: Effect container created and added to parent. Scale: ${params.beatSyncScale}, Duration: ${params.beatSyncDuration}ms, Opacity: ${params.beatSyncOpacity}`);

      // アクティブエフェクトとして登録
      const effect: ActiveBeatEffect = {
        container: effectContainer,
        startTime: currentTime,
        duration: params.beatSyncDuration,
        initialScale: 1.0,
        targetScale: params.beatSyncScale,
        initialOpacity: params.beatSyncOpacity,
        beatTimestamp: beat.timestamp,
        charId: charId
      };

      const charEffects = this.activeEffects.get(charId) || [];
      charEffects.push(effect);
      this.activeEffects.set(charId, charEffects);

      console.log(`BeatSyncEffect: Started effect for ${charId} at beat ${beat.timestamp}ms. Active effects: ${charEffects.length}`);
    } catch (error) {
      console.error('BeatSyncEffect: Failed to start beat effect:', error);
    }
  }

  /**
   * コンテナのコピーを作成
   */
  private createContainerCopy(originalContainer: PIXI.Container): PIXI.Container | null {
    try {
      // 元のコンテナの有効性チェック
      if (!originalContainer || originalContainer.destroyed) {
        return null;
      }

      const copy = new PIXI.Container();
      
      // 位置とトランスフォームを安全にコピー
      copy.x = originalContainer.x || 0;
      copy.y = originalContainer.y || 0;
      copy.rotation = originalContainer.rotation || 0;
      
      if (originalContainer.skew) {
        copy.skew.copyFrom(originalContainer.skew);
      }
      if (originalContainer.pivot) {
        copy.pivot.copyFrom(originalContainer.pivot);
      }
      if ((originalContainer as any).anchor) {
        copy.anchor = (originalContainer as any).anchor;
      }

      // 子要素を安全にコピー
      for (const child of originalContainer.children) {
        if (!child || child.destroyed) {
          continue;
        }

        try {
          if (child instanceof PIXI.Text) {
            const textCopy = new PIXI.Text(child.text, child.style);
            textCopy.x = child.x || 0;
            textCopy.y = child.y || 0;
            textCopy.rotation = child.rotation || 0;
            textCopy.alpha = child.alpha || 1;
            if (child.anchor) {
              textCopy.anchor.copyFrom(child.anchor);
            }
            copy.addChild(textCopy);
          } else if (child instanceof PIXI.Graphics) {
            const graphicsCopy = child.clone();
            copy.addChild(graphicsCopy);
          } else if (child instanceof PIXI.Sprite) {
            const spriteCopy = new PIXI.Sprite(child.texture);
            spriteCopy.x = child.x || 0;
            spriteCopy.y = child.y || 0;
            spriteCopy.rotation = child.rotation || 0;
            spriteCopy.alpha = child.alpha || 1;
            if (child.anchor) {
              spriteCopy.anchor.copyFrom(child.anchor);
            }
            copy.addChild(spriteCopy);
          }
        } catch (childError) {
          console.warn('BeatSyncEffect: Failed to copy child element:', childError);
          // 個々の子要素のコピーに失敗しても続行
        }
      }

      return copy;
    } catch (error) {
      console.error('BeatSyncEffect: Failed to create container copy:', error);
      return null;
    }
  }

  /**
   * アクティブなエフェクトを更新
   */
  private updateActiveEffects(currentTime: number, charId: string): void {
    const charEffects = this.activeEffects.get(charId) || [];
    const updatedEffects: ActiveBeatEffect[] = [];

    for (const effect of charEffects) {
      // コンテナが無効になっている場合はスキップ
      if (!effect.container || effect.container.destroyed) {
        continue;
      }

      const elapsed = currentTime - effect.startTime;
      const progress = Math.min(elapsed / effect.duration, 1.0);

      if (progress >= 1.0) {
        // エフェクト完了、コンテナを削除
        try {
          if (effect.container.parent) {
            effect.container.parent.removeChild(effect.container);
          }
          if (!effect.container.destroyed) {
            effect.container.destroy({ children: true });
          }
        } catch (error) {
          console.warn('BeatSyncEffect: Error cleaning up effect container:', error);
        }
      } else {
        try {
          // エフェクトを更新
          const easeOutProgress = 1 - Math.pow(1 - progress, 2); // イーズアウト
          
          // スケール更新（安全チェック）
          if (effect.container.scale) {
            const currentScale = effect.initialScale + 
              (effect.targetScale - effect.initialScale) * easeOutProgress;
            effect.container.scale.set(currentScale);
            
            // デバッグ: スケール値を確認
            if (Math.random() < 0.01 && progress < 0.1) { // 開始直後のみ出力
              console.log(`BeatSync Update: ${effect.charId} progress=${progress.toFixed(2)}, scale=${currentScale.toFixed(2)}`);
            }
          }

          // 不透明度更新（フェードアウト）
          const currentOpacity = effect.initialOpacity * (1 - progress);
          effect.container.alpha = currentOpacity;

          updatedEffects.push(effect);
        } catch (error) {
          console.warn('BeatSyncEffect: Error updating effect container:', error);
          // エラーが発生した場合はエフェクトをクリーンアップ
          try {
            if (effect.container && effect.container.parent) {
              effect.container.parent.removeChild(effect.container);
            }
          } catch (cleanupError) {
            // 無視
          }
        }
      }
    }

    if (updatedEffects.length > 0) {
      this.activeEffects.set(charId, updatedEffects);
    } else {
      this.activeEffects.delete(charId);
    }
  }

  /**
   * Hex色をRGBに変換
   */
  private hexToRgb(hex: string): {r: number; g: number; b: number} | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * 特定の文字のエフェクトをクリア
   */
  clearCharEffects(charId: string): void {
    const effects = this.activeEffects.get(charId) || [];
    for (const effect of effects) {
      if (effect.container.parent) {
        effect.container.parent.removeChild(effect.container);
      }
      effect.container.destroy({ children: true });
    }
    this.activeEffects.delete(charId);
  }

  /**
   * すべてのエフェクトをクリア
   */
  clearAllEffects(): void {
    for (const [charId] of this.activeEffects) {
      this.clearCharEffects(charId);
    }
    this.activeEffects.clear();
  }

  /**
   * リソースを解放
   */
  dispose(): void {
    this.clearAllEffects();
    this.beatMarkers = [];
    this.lastProcessedBeatIndex = 0;
    console.log('BeatSyncEffectPrimitive disposed');
  }

  /**
   * デフォルトパラメータを取得
   */
  static getDefaultParams(): BeatSyncEffectParams {
    return {
      enableBeatSync: false,
      beatSyncScale: 1.5,
      beatSyncDuration: 300,
      beatSyncOpacity: 0.8,
      beatSyncThreshold: 0.6,
      beatSyncColor: '#ffffff',
      beatSyncOffset: 0,
      beatSyncBlendMode: PIXI.BLEND_MODES.NORMAL
    };
  }
}

export default BeatSyncEffectPrimitive;