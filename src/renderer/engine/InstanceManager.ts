import * as PIXI from 'pixi.js';
import { PhraseUnit, CharUnit, WordUnit, HierarchyType } from '../types/types';
import AnimationInstance from './AnimationInstance';
import { IAnimationTemplate } from '../types/types';
import { TemplateManager } from './TemplateManager';

export class InstanceManager {
  private app: PIXI.Application;
  private instances: Map<string, AnimationInstance> = new Map();
  private activeInstances: Set<string> = new Set();
  private template: IAnimationTemplate;
  private defaultParams: Record<string, any>;
  public mainContainer: PIXI.Container; // パブリックに変更
  
  // 階層別インスタンス管理
  private phraseInstances: Map<string, AnimationInstance> = new Map();
  private wordInstances: Map<string, AnimationInstance> = new Map();
  private charInstances: Map<string, AnimationInstance> = new Map();
  
  // 階層関係マッピング
  private hierarchyMap: Map<string, {parentId: string | null, childIds: string[]}> = new Map();
  
  // 複数テンプレート対応用の追加プロパティ
  private templateAssignments: Map<string, string> = new Map();
  private defaultTemplateId: string = '';
  private templateManager: TemplateManager | null = null;
  private parameterManagerV2: any = null; // ParameterManagerV2への参照
  
  // 前回のログ出力時間
  private lastLogTime: number = 0;
  private static LOG_INTERVAL_MS: number = 1000; // 1秒間隔でログを制限

  constructor(
    app: PIXI.Application,
    template: IAnimationTemplate,
    defaultParams: Record<string, any> = {}
  ) {
    this.app = app;
    this.template = template;
    this.defaultParams = defaultParams;
    
    // メインコンテナを作成
    this.mainContainer = new PIXI.Container();
    (this.mainContainer as any).name = 'mainContainer'; // デバッグ用に名前を設定
    this.mainContainer.zIndex = 0; // テキストレイヤーのzIndex
    this.app.stage.addChild(this.mainContainer);
    this.app.stage.sortChildren(); // zIndexでソート
    
    // メインコンテナの初期位置を左上(0,0)に設定
    this.mainContainer.position.set(0, 0);
    
    // グローバル参照としてメインコンテナを保存
    (window as any).__MAIN_CONTAINER__ = this.mainContainer;
  }
  
  // スロットルされたログ出力
  private throttledLog(message: string) {
    const now = Date.now();
    if (now - this.lastLogTime > InstanceManager.LOG_INTERVAL_MS) {
      this.lastLogTime = now;
    }
  }

  // インスタンス取得用メソッド
  getInstance(id: string): AnimationInstance | undefined {
    return this.instances.get(id);
  }

  // 親子関係の追加
  private addHierarchyRelation(id: string, parentId: string | null) {
    if (!this.hierarchyMap.has(id)) {
      this.hierarchyMap.set(id, {parentId, childIds: []});
    } else {
      // 既存のエントリを更新
      const existing = this.hierarchyMap.get(id)!;
      existing.parentId = parentId;
    }
    
    // 親のchildIdsリストに追加
    if (parentId && this.hierarchyMap.has(parentId)) {
      const parent = this.hierarchyMap.get(parentId)!;
      if (!parent.childIds.includes(id)) {
        parent.childIds.push(id);
      }
    }
  }

  // 歌詞フレーズをロードして階層的なコンテナ構造を生成
  loadPhrases(phrases: PhraseUnit[], charPositions: Map<string, { x: number, y: number }>) {
    // 既存のインスタンスをクリア
    this.clearAllInstances();
    
    // マップをクリア
    this.phraseInstances.clear();
    this.wordInstances.clear();
    this.charInstances.clear();
    this.hierarchyMap.clear();

    // Loadingログを制限
    
    // フレーズレベルのコンテナとインスタンスを作成
    phrases.forEach((phrase) => {
      const phraseInstance = this.createPhraseInstance(phrase);
      
      if (phraseInstance) {
        // 単語レベルのコンテナとインスタンスを作成
        phrase.words.forEach((word, wordIndex) => {
          const wordInstance = this.createWordInstance(word, phrase.id, wordIndex, phrase.words.length);
          
          if (wordInstance) {
            // 文字レベルのコンテナとインスタンスを作成
            word.chars.forEach((char) => {
              const pos = charPositions.get(char.id);
              if (pos) {
                this.createCharInstance(char, pos.x, pos.y, word.id);
              } else {
                console.warn(`Position not found for char: ${char.id}`);
              }
            });
          }
        });
      }
    });
  }

  // フレーズインスタンスを作成
  private createPhraseInstance(phrase: PhraseUnit) {
    try {
      // テンプレートマネージャーがあれば、そこからテンプレートを取得
      let template = this.template;
      let params = { ...this.defaultParams };
      
      if (this.templateManager) {
        template = this.templateManager.getTemplateForObject(phrase.id);
        
        // V2でパラメータを取得
        if (this.parameterManagerV2) {
          params = this.parameterManagerV2.getParameters(phrase.id);
        }
      }
      
      // フレーズコンテナを作成
      const phraseContainer = new PIXI.Container();
      this.mainContainer.addChild(phraseContainer);
      
      // パラメータにIDと単語データを追加
      params = {
        ...params,
        id: phrase.id,
        words: phrase.words.map(word => ({
          id: word.id,
          word: word.word,
          start: word.start,
          end: word.end,
          chars: word.chars // 文字データを含める（拡張ID生成に必要）
        }))
      };
      
      // フレーズインスタンスを作成
      const phraseInstance = new AnimationInstance(
        phrase.id,
        template,
        phrase.phrase,
        0, 0,
        params,
        phrase.start,
        phrase.end,
        phraseContainer,
        'phrase'
      );
      
      // 各マップに保存
      this.instances.set(phrase.id, phraseInstance);
      this.phraseInstances.set(phrase.id, phraseInstance);
      
      // 階層関係を記録
      this.addHierarchyRelation(phrase.id, null);
      
      return phraseInstance;
    } catch (error) {
      console.error(`Error creating phrase instance for ${phrase.id}:`, error);
      return null;
    }
  }

  // 単語インスタンスを作成
  private createWordInstance(word: WordUnit, phraseId: string, wordIndex: number, totalWords: number) {
    try {
      // 親フレーズのコンテナを取得
      const phraseInstance = this.phraseInstances.get(phraseId);
      if (!phraseInstance) {
        console.error(`親フレーズインスタンスが見つかりません: ${word.id}のためのフレーズ${phraseId}`);
        return null;
      }
      
      // フレーズインスタンスのコンテナが存在することを確認
      if (!phraseInstance.container) {
        console.error(`フレーズインスタンスのコンテナがnullです: ${phraseId}`);
        return null;
      }
      
      // 親コンテナに名前を設定して調査のためのデバッグ情報を追加
      (phraseInstance.container as any).name = `phrase_container_${phraseId}`;
      
      // 単語コンテナを作成
      const wordContainer = new PIXI.Container();
      (wordContainer as any).name = `word_container_${word.id}`; // デバッグ用に名前を付ける
      
      // 重要: 単語コンテナを親フレーズコンテナに追加
      phraseInstance.container.addChild(wordContainer);
      
      // 変換行列の更新は自動で行われるため、明示的な呼び出しは不要
      // （PIXIの内部処理で適切なタイミングで更新される）

      // テンプレート継承ロジックの改善
      let template = this.template;
      let params = { ...this.defaultParams };
      
      if (this.templateManager) {
        // 単語レベルのテンプレートを取得（フレーズからの継承を含む）
        template = this.templateManager.getTemplateForObject(word.id);
        
        // V2専用
        if (this.parameterManagerV2) {
          params = this.parameterManagerV2.getParameters(word.id);
        }
        
        // デバッグログは完全に無効化
        // if (import.meta.env.DEV && word.id.endsWith('_0')) {
        // }
      }
      
      // 単語レベルのパラメータを取得とフレーズ情報を追加
      const wordParams = {
        ...params, // ParameterManagerV2から取得した正しいパラメータを使用
        // V2完全移行: word.paramsは無視する（レガシー互換性を削除）
        id: word.id, // IDを明示的に設定
        chars: word.chars, // 文字データを渡す
        wordIndex: wordIndex, // 単語インデックスを追加
        totalWords: totalWords, // 総単語数を追加
        // フレーズ情報を単語パラメータに追加
        phrasePhase: null, // ランタイムで設定される
        phraseStartMs: phraseInstance.startMs,
        phraseEndMs: phraseInstance.endMs,
        // フレーズレベルのwordsパラメータを単語レベルに継承
        words: phraseInstance.params.words
      };
      
      // 単語インスタンスを作成
      const wordInstance = new AnimationInstance(
        word.id,
        template, // フェーズ1ではフレーズから継承したテンプレートを使用
        word.word,
        0, 0, // 相対位置
        wordParams,
        word.start,
        word.end,
        wordContainer,
        'word' // 階層タイプ
      );
      
      // 設定後の親子関係のエラーチェックのみ
      if (!wordContainer.parent) {
        console.error(`エラー: 単語コンテナに親がありません。`);
      }
      
      // 各マップに保存
      this.instances.set(word.id, wordInstance);
      this.wordInstances.set(word.id, wordInstance);
      
      // 階層関係を記録
      this.addHierarchyRelation(word.id, phraseId);
      
      return wordInstance;
    } catch (error) {
      console.error(`Error creating word instance for ${word.id}:`, error);
      return null;
    }
  }

  // 文字インスタンスを作成
  private createCharInstance(char: CharUnit, x: number, y: number, wordId: string) {
    try {
      // 親単語のコンテナを取得
      const wordInstance = this.wordInstances.get(wordId);
      if (!wordInstance) {
        console.error(`Parent word instance not found for char: ${char.id}`);
        return null;
      }
      
      // 文字コンテナを作成
      const charContainer = new PIXI.Container();
      // 重要: 文字コンテナに明示的に名前を設定
      (charContainer as any).name = `char_container_${char.id}`;
      
      // 文字コンテナを親単語コンテナに追加
      wordInstance.container.addChild(charContainer);
      
      // 変換行列の更新は自動で行われるため、明示的な呼び出しは不要
      
      // テンプレート継承ロジックの改善
      let template = this.template;
      let params = { ...this.defaultParams };
      
      if (this.templateManager) {
        // 文字レベルのテンプレートを取得（階層継承を含む）
        template = this.templateManager.getTemplateForObject(char.id);
        
        // V2専用
        if (this.parameterManagerV2) {
          params = this.parameterManagerV2.getParameters(char.id);
        }
      }
      
      // 文字レベルのパラメータを取得し、フレーズ情報を追加
      const charParams = {
        ...params, // ParameterManagerV2から取得した正しいパラメータを使用
        // V2完全移行: char.paramsは無視する（レガシー互換性を削除）
        id: char.id, // IDを明示的に設定
        // 文字カウント情報をパラメータに追加
        charIndex: char.charIndex,
        totalChars: char.totalChars,
        totalWords: char.totalWords,
        // 親単語からフレーズ情報を継承
        phrasePhase: null, // ランタイムで設定される
        phraseStartMs: wordInstance.params.phraseStartMs,
        phraseEndMs: wordInstance.params.phraseEndMs
      };
      
      // 文字インスタンスを作成
      const charInstance = new AnimationInstance(
        char.id,
        template, // フェーズ1ではフレーズから継承したテンプレートを使用
        char.char,
        x,
        y,
        charParams,
        char.start,
        char.end,
        charContainer,
        'char' // 階層タイプ
      );
      
      // 各マップに保存
      this.instances.set(char.id, charInstance);
      this.charInstances.set(char.id, charInstance);
      
      // 階層関係を記録
      this.addHierarchyRelation(char.id, wordId);
      
      return charInstance;
    } catch (error) {
      console.error(`Error creating char instance for ${char.id}:`, error);
      return null;
    }
  }
  
  // 親オブジェクトIDを取得するヘルパーメソッド（正規表現による堅牢な実装）
  private getParentObjectId(objectId: string): string | null {
    // 文字ID: 任意の文字列_char_数字または任意文字列 → 親は単語
    const charPattern = /^(.+)_char_(?:\d+|.+)$/;
    const charMatch = objectId.match(charPattern);
    if (charMatch) {
      return charMatch[1]; // 単語IDを返す
    }
    
    // 単語ID: 任意の文字列_word_数字または任意文字列 → 親はフレーズ
    const wordPattern = /^(.+)_word_(?:\d+|.+)$/;
    const wordMatch = objectId.match(wordPattern);
    if (wordMatch) {
      return wordMatch[1]; // フレーズIDを返す
    }
    
    return null;
  }
  
  // 子要素IDを取得するヘルパーメソッド
  private getChildrenIds(parentId: string): string[] {
    const children: string[] = [];
    
    // 階層関係から子要素を特定
    for (const [childId, relation] of this.hierarchyMap.entries()) {
      if (relation.parentId === parentId) {
        children.push(childId);
      }
    }
    
    return children;
  }
  
  // オブジェクトとその子要素を再帰的に更新（改善版）
  updateInstanceAndChildren(objectId: string): void {
    if (!this.templateManager) {
      console.warn('TemplateManager が未設定のため、インスタンス更新をスキップします');
      return;
    }
    
    // 対象インスタンスを取得
    const instance = this.instances.get(objectId);
    if (!instance) {
      console.warn(`インスタンスが見つかりません: ${objectId}`);
      return;
    }
    
    // テンプレートとパラメータを取得 - 階層継承を考慮
    const template = this.templateManager.getTemplateForObject(objectId);
    
    let params: Record<string, any>;
    if (this.parameterManagerV2) {
      params = this.parameterManagerV2.getParameters(objectId);
    } else {
      console.warn(`ParameterManagerV2が利用できません: ${objectId}`);
      return;
    }
    
    // 更新前の状態を記録（デバッグ用）
    const oldTemplate = instance.template?.constructor?.name || 'Unknown';
    const oldFont = instance.params?.fontFamily || 'Unknown';
    const newTemplate = template?.constructor?.name || 'Unknown';
    const newFont = params.fontFamily;
    
    // 重要な変更をログ出力削除済み
    
    // 保持すべき特殊パラメータ
    const preservedParams = {
      id: instance.params.id,
      words: instance.params.words,
      chars: instance.params.chars,
      charIndex: instance.params.charIndex,
      totalChars: instance.params.totalChars,
      totalWords: instance.params.totalWords,
      wordIndex: instance.params.wordIndex,
      phrasePhase: instance.params.phrasePhase,
      phraseStartMs: instance.params.phraseStartMs,
      phraseEndMs: instance.params.phraseEndMs
    };
    
    // インスタンスを更新
    instance.template = template;
    instance.params = { ...params, ...preservedParams, id: objectId }; // 確実に適用
    
    // インスタンス更新完了ログ削除済み
    
    // 子要素を更新 - 階層関係から子要素を特定して再帰的に更新
    const childrenIds = this.getChildrenIds(objectId);
    
    for (const childId of childrenIds) {
      this.updateInstanceAndChildren(childId);
    }
  }
  
  // ひとつのオブジェクトのみ更新するメソッドを修正
  updateSingleInstance(objectId: string): boolean {
    try {
      // オブジェクトとその子要素を再帰的に更新
      this.updateInstanceAndChildren(objectId);
      return true;
    } catch (error) {
      console.error(`インスタンス更新エラー (${objectId}):`, error);
      return false;
    }
  }

  // 階層的な更新処理
  update(nowMs: number) {
    // Note: update開始ログは頻繁すぎるためコメントアウト
    //   currentTime: nowMs,
    //   totalInstances: this.instances.size,
    //   phraseInstances: this.phraseInstances.size,
    //   wordInstances: this.wordInstances.size,
    //   charInstances: this.charInstances.size
    // });
    
    this.activeInstances.clear();
    let activeCount = 0;
    
    // ヘッドタイムとテールタイムの最大値を取得
    const maxHeadTime = this.getMaxHeadTime();
    const maxTailTime = this.getMaxTailTime();
    
    try {
      // 単語レベルの処理状況を確認
      let wordProcessed = 0;
      let wordActive = 0;

      // まず文字レベルの更新
      this.charInstances.forEach(instance => {
        if (this.isInstanceInTimeRange(instance, nowMs, maxHeadTime, maxTailTime)) {
          instance.update(nowMs);
          this.activeInstances.add(instance.id);
          activeCount++;
        } else {
          instance.hideOutOfRange();
        }
      });
      
      // 次に単語レベルの更新
      this.wordInstances.forEach(instance => {
        wordProcessed++;
        if (this.isInstanceInTimeRange(instance, nowMs, maxHeadTime, maxTailTime)) {
          const result = instance.update(nowMs);
          wordActive++;
          this.activeInstances.add(instance.id);
          activeCount++;
        } else {
          instance.hideOutOfRange();
        }
      });
      
      // 単語処理状況は過度にログ出力しないよう削除
      
      // 最後にフレーズレベルの更新
      this.phraseInstances.forEach(instance => {
        if (this.isInstanceInTimeRange(instance, nowMs, maxHeadTime, maxTailTime)) {
          instance.update(nowMs);
          this.activeInstances.add(instance.id);
          activeCount++;
        } else {
          instance.hideOutOfRange();
        }
      });
      
    } catch (error) {
      console.error(`Error during update at ${nowMs}ms:`, error);
    }
    
    // Note: update完了ログは頻繁すぎるためコメントアウト
    //   activeInstances: activeCount,
    //   activeInstancesSize: this.activeInstances.size
    // });
  }
  
  // インスタンスが表示期間内かどうかを判定
  private isInstanceInTimeRange(
    instance: AnimationInstance,
    nowMs: number,
    maxHeadTime: number,
    maxTailTime: number
  ): boolean {
    // パラメータから個別のヘッドタイムとテールタイムを取得
    const headTime = instance.params.headTime !== undefined ? instance.params.headTime : maxHeadTime;
    const tailTime = instance.params.tailTime !== undefined ? instance.params.tailTime : maxTailTime;
    
    // 単語コンテナの場合、フレーズの時間範囲を使用
    if (instance.hierarchyType === 'word' && instance.params.phraseStartMs && instance.params.phraseEndMs) {
      // 単語コンテナはフレーズの時間範囲に依存して表示される
      return nowMs >= instance.params.phraseStartMs - headTime && nowMs <= instance.params.phraseEndMs + tailTime;
    }
    
    // 文字コンテナの場合もフレーズの時間範囲を使用
    if (instance.hierarchyType === 'char' && instance.params.phraseStartMs && instance.params.phraseEndMs) {
      // 文字コンテナもフレーズの時間範囲に依存して表示される
      return nowMs >= instance.params.phraseStartMs - headTime && nowMs <= instance.params.phraseEndMs + tailTime;
    }
    
    // フレーズコンテナの場合、自身の時間範囲を使用
    return nowMs >= instance.startMs - headTime && nowMs <= instance.endMs + tailTime;
  }
  
  // テンプレートメタデータからヘッドタイムの最大値を取得
  private getMaxHeadTime(): number {
    let maxHeadTime = 500;  // デフォルト値
    
    if (typeof this.template.getParameterConfig === 'function') {
      const params = this.template.getParameterConfig();
      const headTimeParam = params.find(p => p.name === 'headTime');
      if (headTimeParam && headTimeParam.default !== undefined) {
        maxHeadTime = headTimeParam.default;
      }
    } else {
      throw new Error(`Template ${this.template.constructor.name} must implement getParameterConfig() method`);
    }
    
    return maxHeadTime;
  }
  
  // テンプレートメタデータからテールタイムの最大値を取得
  private getMaxTailTime(): number {
    let maxTailTime = 500;  // デフォルト値
    
    if (typeof this.template.getParameterConfig === 'function') {
      const params = this.template.getParameterConfig();
      const tailTimeParam = params.find(p => p.name === 'tailTime');
      if (tailTimeParam && tailTimeParam.default !== undefined) {
        maxTailTime = tailTimeParam.default;
      }
    } else {
      throw new Error(`Template ${this.template.constructor.name} must implement getParameterConfig() method`);
    }
    
    return maxTailTime;
  }

  // インスタンスの位置を更新
  updatePositions(charPositions: Map<string, { x: number, y: number }>) {
    for (const [id, instance] of this.charInstances.entries()) {
      const pos = charPositions.get(id);
      if (pos) {
        instance.x = pos.x;
        instance.y = pos.y;
      }
    }
  }

  // 指定したインスタンスの時間を更新
  updateInstanceTime(id: string, newStart: number, newEnd: number) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.startMs = newStart;
      instance.endMs = newEnd;
      this.throttledLog(`InstanceManager: インスタンス時間更新 ${id} ${newStart}-${newEnd}ms`);
    } else {
      console.warn(`InstanceManager: 更新対象のインスタンスが見つかりません: ${id}`);
    }
  }

  // 既存インスタンスのプロパティのみ更新（配置に影響しないパラメータ変更時）
  updateExistingInstances(phraseIds?: string[]) {
    if (import.meta.env.DEV && Math.random() < 0.05) { // 5%の確率でのみ出力
    }
    
    let updatedCount = 0;
    
    // phraseIds が明示的に指定されている場合のみ更新
    if (phraseIds !== undefined) {
      // 空の配列が渡された場合は何も更新しない（最適化）
      if (phraseIds.length === 0) {
        console.log(`InstanceManager: 最適化により0個のインスタンスを更新`);
        return;
      }
      
      // 更新対象を限定する場合
      const phraseIdSet = new Set(phraseIds);
      
      // フレーズインスタンスとその子要素のみ更新
      for (const phraseId of phraseIds) {
        // フレーズインスタンス
        const phraseInstance = this.instances.get(phraseId);
        if (phraseInstance) {
          this.updateSingleInstanceInternal(phraseInstance);
          updatedCount++;
        }
        
        // 関連する単語・文字インスタンスを取得して更新
        const childrenIds = this.getChildrenIds(phraseId);
        for (const childId of childrenIds) {
          const childInstance = this.instances.get(childId);
          if (childInstance) {
            this.updateSingleInstanceInternal(childInstance);
            updatedCount++;
            
            // 文字インスタンスも取得（単語の子要素）
            const grandChildrenIds = this.getChildrenIds(childId);
            for (const grandChildId of grandChildrenIds) {
              const grandChildInstance = this.instances.get(grandChildId);
              if (grandChildInstance) {
                this.updateSingleInstanceInternal(grandChildInstance);
                updatedCount++;
              }
            }
          }
        }
      }
    } else {
      // 全インスタンスを更新（従来の動作）
      for (const [id, instance] of this.instances.entries()) {
        if (instance.template && instance.objectId) {
          this.updateSingleInstanceInternal(instance);
          updatedCount++;
        }
      }
    }
    
    if (import.meta.env.DEV && Math.random() < 0.1) { // 10%の確率でのみ出力
      console.log(`InstanceManager: ${updatedCount}個のインスタンスを更新`);
    }
  }
  
  // 単一インスタンスのパラメータ更新（内部用）
  private updateSingleInstanceInternal(instance: AnimationInstance) {
    if (!instance.template || !instance.objectId) return;
    
    let params: Record<string, any> = {};
    
    // V2専用: 直接パラメータを取得
    if (this.parameterManagerV2) {
      params = this.parameterManagerV2.getParameters(instance.objectId);
      
      // デバッグ：重要なパラメータの変更を記録
      const oldFont = instance.params.fontFamily;
      const newFont = params.fontFamily;
      if (oldFont !== newFont && import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
      }
    } else {
      console.warn(`InstanceManager: ParameterManagerV2が利用できません: ${instance.objectId}`);
      return;
    }
    
    // 保持すべき特殊パラメータのリスト
    const preservedParams = {
      id: instance.params.id,
      words: instance.params.words,
      chars: instance.params.chars,
      charIndex: instance.params.charIndex,
      totalChars: instance.params.totalChars,
      totalWords: instance.params.totalWords,
      wordIndex: instance.params.wordIndex,
      phrasePhase: instance.params.phrasePhase,
      phraseStartMs: instance.params.phraseStartMs,
      phraseEndMs: instance.params.phraseEndMs
    };
    
    // パラメータを更新（特殊パラメータは保持）
    instance.params = { ...params, ...preservedParams };
  }

  // すべてのインスタンスをクリア
  clearAllInstances() {
    for (const instance of this.instances.values()) {
      instance.destroy();
    }
    this.instances.clear();
    this.activeInstances.clear();
    this.phraseInstances.clear();
    this.wordInstances.clear();
    this.charInstances.clear();
    this.hierarchyMap.clear();
    this.mainContainer.removeChildren();
  }

  // テンプレートを更新（歌詞データを保持）（改善版）
  updateTemplate(template: IAnimationTemplate, params: Record<string, any> = {}) {
    try {
      
      if (!template) {
        console.error('InstanceManager: updateTemplateに渡されたtemplateがnull/undefinedです');
        return false;
      }
      
      // 古いテンプレートの内部状態をクリーンアップ
      if (this.template && typeof this.template.cleanup === 'function') {
        console.log('[InstanceManager] Cleaning up old template state');
        this.template.cleanup();
      }
      
      this.template = template;
      this.defaultParams = { ...this.defaultParams, ...params };
      
      // テンプレートマネージャーが設定されている場合は、個別テンプレート割り当てを考慮
      if (this.templateManager) {
        
        // 個別割り当てを考慮した更新
        let updateCount = 0;
        for (const [instanceId, instance] of this.instances.entries()) {
          // 個別に割り当てられたテンプレートを取得
          const assignedTemplate = this.templateManager.getTemplateForObject(instanceId);
          
          
          let effectiveParams: Record<string, any>;
          if (this.parameterManagerV2) {
            effectiveParams = this.parameterManagerV2.getParameters(instanceId);
          } else {
            console.warn(`ParameterManagerV2が利用できません: ${instanceId}`);
            continue;
          }
          
          // インスタンスを更新
          instance.template = assignedTemplate;
          
          
          // 保持すべき特殊パラメータのリスト
          const preservedParams = {
            id: instance.params.id || instanceId,
            words: instance.params.words,
            chars: instance.params.chars,
            charIndex: instance.params.charIndex,
            totalChars: instance.params.totalChars,
            totalWords: instance.params.totalWords,
            wordIndex: instance.params.wordIndex,
            phrasePhase: instance.params.phrasePhase,
            phraseStartMs: instance.params.phraseStartMs,
            phraseEndMs: instance.params.phraseEndMs
          };
          
          // パラメータを更新（特殊パラメータは保持）
          instance.params = { ...effectiveParams, ...preservedParams };
          
          updateCount++;
        }
        
      } else {
        
        // 従来の更新処理（全インスタンスに同じテンプレートを適用）
        let updateCount = 0;
        for (const instance of this.instances.values()) {
          instance.template = template;
          
          // 保持すべき特殊パラメータのリスト
          const preservedParams = {
            id: instance.params.id,
            words: instance.params.words,
            chars: instance.params.chars,
            charIndex: instance.params.charIndex,
            totalChars: instance.params.totalChars,
            totalWords: instance.params.totalWords,
            wordIndex: instance.params.wordIndex,
            phrasePhase: instance.params.phrasePhase,
            phraseStartMs: instance.params.phraseStartMs,
            phraseEndMs: instance.params.phraseEndMs
          };
          
          // オブジェクト固有のパラメータを保持しつつ、デフォルトパラメータを更新
          const instanceParamsBeforeUpdate = { ...instance.params };
          const instanceCustomParams = {};
          
          // オブジェクト固有の設定のみを抽出（特殊パラメータは除外）
          const specialParamKeys = Object.keys(preservedParams);
          for (const [key, value] of Object.entries(instanceParamsBeforeUpdate)) {
            if (!specialParamKeys.includes(key) && this.defaultParams[key] !== value) {
              instanceCustomParams[key] = value;
            }
          }
          
          // デフォルトパラメータを適用し、カスタムパラメータと特殊パラメータで上書き
          instance.params = { ...this.defaultParams, ...instanceCustomParams, ...preservedParams };
          
          updateCount++;
        }
        
      }
      
      // テンプレート更新後、全てのインスタンスの古い視覚要素をクリーンアップ
      this.cleanupAllVisualElements();
      
      return true;
    } catch (error) {
      console.error('InstanceManager: updateTemplate処理中にエラーが発生しました', error);
      return false;
    }
  }

  // デフォルトパラメータを取得するメソッド
  getDefaultParams(): Record<string, any> {
    return this.defaultParams;
  }
  
  // 全てのインスタンスの視覚要素をクリーンアップ
  private cleanupAllVisualElements() {
    for (const instance of this.instances.values()) {
      if (instance.template.removeVisualElements && typeof instance.template.removeVisualElements === 'function') {
        try {
          instance.template.removeVisualElements(instance.container);
        } catch (error) {
          console.error(`cleanupAllVisualElements: エラー ${instance.id}:`, error);
        }
      }
    }
  }
  
  // アクティブなインスタンスのIDセットを取得
  getActiveInstances(): Set<string> {
    return new Set(this.activeInstances);
  }
  
  /**
   * 全てのインスタンスを取得
   * @returns AnimationInstanceの配列
   */
  getAllInstances(): AnimationInstance[] {
    return Array.from(this.instances.values());
  }
  
  /**
   * 文字レベルのインスタンスを取得
   * @returns 文字レベルのインスタンスのMap
   */
  getCharInstances(): Map<string, AnimationInstance> {
    return this.charInstances;
  }
  
  /**
   * フレーズレベルのインスタンスを取得
   * @returns フレーズレベルのインスタンスのMap
   */
  getPhraseInstances(): Map<string, AnimationInstance> {
    return this.phraseInstances;
  }
  
  // メインコンテナを取得するメソッド（動画出力用）
  getMainContainer(): PIXI.Container {
    return this.mainContainer;
  }
  
  /**
   * メインコンテナにスケーリングを適用
   * @param scale スケール係数
   */
  setMainContainerScale(scale: number): void {
    
    if (this.mainContainer) {
      // 元の位置とスケールを記録
      const originalScale = `(${this.mainContainer.scale.x}, ${this.mainContainer.scale.y})`;
      const originalPosition = `(${this.mainContainer.position.x}, ${this.mainContainer.position.y})`;
      
      // コンテナにスケール適用
      this.mainContainer.scale.set(scale, scale);
      
    } else {
      console.warn('InstanceManager: mainContainerが存在しないためスケーリングを適用できません');
    }
  }
  
  // テンプレート割り当て情報の更新メソッド追加
  updateTemplateAssignments(templateManager: TemplateManager): void {
    this.templateManager = templateManager;
  }
  
  // V2専用設定
  setParameterManagerV2(parameterManagerV2: any): void {
    this.parameterManagerV2 = parameterManagerV2;
  }
  
}

export default InstanceManager;