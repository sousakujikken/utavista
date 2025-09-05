import { StandardParameters, DEFAULT_PARAMETERS } from '../../types/StandardParameters';
import { ParameterValidator } from '../../utils/ParameterValidator';
import { templateRegistry } from '../templates/registry/templateRegistry';
import { ParameterProcessor } from '../utils/ParameterProcessor';

// 完全なパラメータセット（すべて必須）
export type CompleteParameters = Required<StandardParameters>;

// 圧縮保存用の型定義
export interface CompressedProjectData {
  version: "2.0";
  globalDefaults: CompleteParameters;
  phrases: Record<string, CompressedPhrase>;
}

export interface CompressedPhrase {
  templateId: string;
  parameterDiff?: Partial<StandardParameters>;
  individualSettingEnabled?: boolean; // 個別設定状態
}

// 内部ストレージ構造（将来の拡張用に保持）
// interface ParameterStorage {
//   globalDefaults: CompleteParameters;
//   phraseParameters: Map<string, CompleteParameters>;
// }

/**
 * パラメータ管理システム v2
 * - 継承チェーンを排除し、完全初期化ベースのシステム
 * - すべてのフレーズが完全なパラメータセットを保持
 * - UI表示値と実際の値が完全一致
 */
export class ParameterManagerV2 {
  private globalDefaults: CompleteParameters;
  private phraseParameters: Map<string, CompleteParameters> = new Map();
  
  // テンプレートIDの記録（差分計算用）
  private phraseTemplates: Map<string, string> = new Map();
  
  // 個別設定状態管理（V2統一管理）
  private phraseIndividualSettings: Map<string, boolean> = new Map();
  
  // デフォルトテンプレートID
  private defaultTemplateId: string = 'fadeslidetext';
  
  // 変更通知用のコールバック
  private changeListeners: Map<string, (phraseId: string, params: CompleteParameters) => void> = new Map();
  
  // 個別設定変更通知用のコールバック
  private individualSettingListeners: Map<string, (phraseId: string, enabled: boolean) => void> = new Map();
  
  // TemplateManager参照（正確なテンプレートID取得用）
  private templateManager: any = null;
  
  constructor() {
    this.globalDefaults = this.createDefaultParameters();
  }
  
  /**
   * TemplateManagerの参照を設定
   */
  setTemplateManager(templateManager: any): void {
    this.templateManager = templateManager;
  }
  
  /**
   * 完全なデフォルトパラメータセットを生成
   */
  private createDefaultParameters(): CompleteParameters {
    // すべてのオプショナルパラメータも含めて完全な型として返す
    return { ...DEFAULT_PARAMETERS } as CompleteParameters;
  }
  
  /**
   * テンプレートIDをサニタイズ
   */
  private sanitizeTemplateId(templateId: string): string {
    // 空文字や無効な値の場合はそのまま空文字を返す（フォールバック不要）
    if (!templateId || templateId === 'default' || templateId === 'Object' || typeof templateId !== 'string') {
      console.warn(`Invalid templateId: ${templateId}, returning empty (will use default)`);
      return '';
    }
    
    const entry = templateRegistry.find(t => t.id === templateId);
    if (!entry) {
      console.warn(`Template not found: ${templateId}, returning empty (will use default)`);
      return '';
    }
    
    return templateId;
  }

  /**
   * テンプレートのデフォルトパラメータを取得
   */
  private getTemplateDefaults(templateId: string): Partial<StandardParameters> {
    const sanitizedTemplateId = this.sanitizeTemplateId(templateId);
    
    const entry = templateRegistry.find(t => t.id === sanitizedTemplateId);
    if (!entry) {
      console.error(`Sanitized template ${sanitizedTemplateId} not found!`);
      return {};
    }
    
    return this.extractTemplateDefaults(entry.template);
  }
  
  /**
   * テンプレートからデフォルトパラメータを抽出
   */
  private extractTemplateDefaults(template: any): Partial<StandardParameters> {
    // テンプレートからデフォルトパラメータを取得
    if (typeof template.getParameterConfig === 'function') {
      const paramConfig = template.getParameterConfig();
      const defaults: Partial<StandardParameters> = {};
      paramConfig.forEach(param => {
        defaults[param.name as keyof StandardParameters] = param.default;
      });
      return defaults;
    }
    
    return {};
  }
  
  /**
   * フレーズの初期化（テンプレートとグローバル設定から）
   */
  initializePhrase(
    phraseId: string,
    templateId: string,
    currentGlobalSettings?: Partial<StandardParameters>
  ): void {
    
    // 既存フレーズかどうかを判定
    const existingParams = this.phraseParameters.get(phraseId);
    const isExistingPhrase = existingParams !== undefined;
    const isIndividualSettingEnabled = this.phraseIndividualSettings.get(phraseId) || false;
    
    let params: CompleteParameters;
    
    if (isExistingPhrase && isIndividualSettingEnabled) {
      // 既存の個別設定フレーズの場合：個別設定値を保護
      
      // グローバル設定から開始（テンプレートデフォルトはスキップ）
      params = { ...this.globalDefaults };
      
      // 現在のグローバル設定があれば適用
      if (currentGlobalSettings) {
        const validation = ParameterValidator.validate(currentGlobalSettings);
        if (!validation.isValid) {
          console.warn('Global settings validation errors:', validation.errors);
        }
        Object.assign(params, validation.sanitized);
      }
      
      // 既存の個別設定値を復元（最優先で適用）
      Object.assign(params, existingParams);
      
      // 個別設定保護ログ削除済み
    } else {
      // 新規フレーズまたは個別設定無効フレーズの場合：通常の初期化
      
      // 1. システムデフォルトから開始
      params = this.createDefaultParameters();
      
      // 2. テンプレートデフォルトを適用
      const templateDefaults = this.getTemplateDefaults(templateId);
      Object.assign(params, templateDefaults);
      
      // 3. 現在のグローバル設定を適用（指定された場合）
      if (currentGlobalSettings) {
        const validation = ParameterValidator.validate(currentGlobalSettings);
        if (!validation.isValid) {
          console.warn('Global settings validation errors:', validation.errors);
        }
        Object.assign(params, validation.sanitized);
      } else {
        // グローバルデフォルトを適用
        Object.assign(params, this.globalDefaults);
      }
    }
    
    // 4. パラメータを保存
    this.phraseParameters.set(phraseId, params);
    this.phraseTemplates.set(phraseId, templateId);
    
    // 5. 個別設定状態を初期化（既存の状態を保護）
    if (!this.phraseIndividualSettings.has(phraseId)) {
      this.phraseIndividualSettings.set(phraseId, false);
    }
    
    // 6. 変更を通知
    this.notifyParameterChange(phraseId, params);
  }
  
  /**
   * 単一パラメータの更新（他に影響しない）
   */
  updateParameter(
    objectId: string,
    paramName: keyof StandardParameters,
    value: unknown
  ): void {
    const phraseId = this.extractPhraseId(objectId);
    const params = this.phraseParameters.get(phraseId);
    if (!params) {
      throw new Error(`Phrase ${phraseId} not initialized for object ${objectId}`);
    }
    
    // パラメータを更新
    (params as Record<string, unknown>)[paramName] = value;
    
    if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
    }
    
    // 即座にレンダリングに反映
    this.notifyParameterChange(phraseId, params);
  }
  
  /**
   * バッチ更新（複数パラメータ）
   */
  updateParameters(
    objectId: string,
    updates: Partial<StandardParameters>
  ): void {
    const phraseId = this.extractPhraseId(objectId);
    let params = this.phraseParameters.get(phraseId);
    if (!params) {
      // フレーズが未初期化の場合は自動初期化
      const templateId = this.getDefaultTemplateId() || 'fadeslidetext';
      this.initializePhrase(phraseId, templateId);
      params = this.phraseParameters.get(phraseId)!;
    }
    
    // 配列が渡された場合の緊急対応
    if (Array.isArray(updates)) {
      console.error('[ParameterManagerV2] updateParameters: Array passed instead of parameter object');
      console.error('[ParameterManagerV2] objectId:', objectId);
      console.error('[ParameterManagerV2] updates:', updates);
      console.error('[ParameterManagerV2] This indicates a bug in the calling code');
      
      // パラメータ設定配列の場合は変換を試みる
      if (ParameterValidator.isParameterConfigArray(updates)) {
        console.error('[ParameterManagerV2] Converting parameter config array to parameter object');
        updates = ParameterValidator.convertConfigToParams(updates) as Partial<StandardParameters>;
      } else {
        console.error('[ParameterManagerV2] Skipping invalid update');
        return;
      }
    }
    
    // パラメータを検証
    const validation = ParameterValidator.validate(updates);
    if (!validation.isValid) {
      console.warn('Parameter validation errors:', validation.errors);
    }
    
    // 更新を適用
    Object.assign(params, validation.sanitized);
    
    if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
    }
    
    // フレーズパラメータ変更時の自動個別設定有効化を無効化
    // 注意: この自動有効化はパーティクルエフェクトなどのテンプレート内部処理で
    // 意図しない個別設定有効化を引き起こすため無効化
    // const isCurrentlyIndividual = this.phraseIndividualSettings.get(phraseId) || false;
    // 
    // if (!isCurrentlyIndividual) {
    //   console.log(`[ParameterManagerV2] Auto-enabling individual setting for phrase: ${phraseId}`);
    //   this.phraseIndividualSettings.set(phraseId, true);
    //   
    //   // 個別設定有効化の通知
    //   this.notifyIndividualSettingChange(phraseId, true);
    // }
    
    // 変更を通知
    this.notifyParameterChange(phraseId, params);
  }
  
  /**
   * UI表示用パラメータ取得（実際の値と完全一致）
   */
  getParameters(objectId: string): CompleteParameters & { templateId?: string } {
    // フレーズIDかどうかを判定
    const phraseId = this.extractPhraseId(objectId);
    
    const params = this.phraseParameters.get(phraseId);
    if (!params) {
      // 未初期化の場合はデフォルトを返す
      console.warn(`ParameterManagerV2: Phrase ${phraseId} not initialized for object ${objectId}, returning defaults`);
      console.debug(`ParameterManagerV2: 抽出されたフレーズID: "${phraseId}", オリジナルオブジェクトID: "${objectId}"`);
      console.debug(`ParameterManagerV2: 現在初期化済みフレーズ:`, Array.from(this.phraseParameters.keys()));
      return this.createDefaultParameters();
    }
    
    // templateIdを追加して返す（個別設定の場合のみ）
    const templateId = this.phraseTemplates.get(phraseId);
    const isIndividual = this.phraseIndividualSettings.get(phraseId) || false;
    
    const result = JSON.parse(JSON.stringify(params));
    // 個別設定がある場合のみtemplateIdを設定、そうでなければundefined
    result.templateId = isIndividual ? templateId : undefined;
    
    return result;
  }
  
  /**
   * オブジェクトIDからフレーズIDを抽出
   */
  extractPhraseId(objectId: string): string {
    // 拡張形式の文字ID: phrase_X_word_Y_hZfW_char_N → phrase_X を抽出
    const extendedCharPattern = /^(.+)_word_\d+_h\d+f\d+_char_\d+$/;
    const extendedCharMatch = objectId.match(extendedCharPattern);
    if (extendedCharMatch) {
      return extendedCharMatch[1]; // フレーズIDを返す
    }
    
    // 拡張形式の単語ID: phrase_X_word_Y_hZfW → phrase_X を抽出
    const extendedWordPattern = /^(.+)_word_\d+_h\d+f\d+$/;
    const extendedWordMatch = objectId.match(extendedWordPattern);
    if (extendedWordMatch) {
      return extendedWordMatch[1]; // フレーズIDを返す
    }
    
    // 従来形式の文字ID: 任意の文字列_word_数字_char_数字 → フレーズIDを抽出
    const charPattern = /^(.+)_word_\d+_char_\d+$/;
    const charMatch = objectId.match(charPattern);
    if (charMatch) {
      return charMatch[1]; // フレーズIDを返す
    }
    
    // 従来形式の単語ID: 任意の文字列_word_数字 → フレーズIDを抽出
    const wordPattern = /^(.+)_word_\d+$/;
    const wordMatch = objectId.match(wordPattern);
    if (wordMatch) {
      return wordMatch[1]; // フレーズIDを返す
    }
    
    // フレーズIDまたは不明な形式の場合はそのまま返す
    return objectId;
  }
  
  /**
   * グローバルデフォルトの更新（統一的処理）
   */
  updateGlobalDefaults(updates: Partial<StandardParameters>): void {
    this.updateGlobalDefaultsInternal(updates, true);
  }

  /**
   * グローバルデフォルトの更新（通知無効化版）
   */
  updateGlobalDefaultsSilent(updates: Partial<StandardParameters>): void {
    this.updateGlobalDefaultsInternal(updates, false);
  }

  /**
   * グローバルデフォルトの更新（内部実装）
   */
  private updateGlobalDefaultsInternal(updates: Partial<StandardParameters>, enableNotifications: boolean): void {
    // デバッグ: 実際に何が渡されているかを確認
    // console.log('[ParameterManagerV2] updateGlobalDefaults called with:', {
    //   type: Array.isArray(updates) ? 'Array' : typeof updates,
    //   length: Array.isArray(updates) ? updates.length : 'N/A',
    //   keys: Array.isArray(updates) ? 'Array indices' : Object.keys(updates as any).slice(0, 5),
    //   firstItem: Array.isArray(updates) ? updates[0] : 'N/A',
    //   stackTrace: new Error().stack?.split('\n').slice(1, 4)
    // });
    
    // 型安全な正規化（配列が来ることは設計上あり得ない）
    const normalizedUpdates = ParameterProcessor.validateParameterObject(updates as Record<string, any>);
    
    const validation = ParameterValidator.validate(normalizedUpdates);
    if (!validation.isValid) {
      console.warn('Global defaults validation errors:', validation.errors);
      // 検証エラーがあっても、有効な値は適用する
    }
    
    // 全てのパラメータを統一的に扱う（特別扱いなし）
    const validUpdates: Partial<StandardParameters> = {};
    for (const [key, value] of Object.entries(normalizedUpdates)) {
      // 明示的にundefinedでない限り、すべての値を適用（空文字も含む）
      if (value !== undefined) {
        validUpdates[key as keyof StandardParameters] = value;
      }
    }
    
    if (Object.keys(validUpdates).length > 0) {
      // 安全なオブジェクトマージ
      this.globalDefaults = ParameterProcessor.mergeParameterObjects(this.globalDefaults, validUpdates) as CompleteParameters;
      
      // 個別設定がないフレーズのパラメータを更新
      this.propagateGlobalChangesToNormalPhrases(validUpdates, enableNotifications);
    }
  }
  
  /**
   * グローバル変更を通常フレーズに伝播
   */
  private propagateGlobalChangesToNormalPhrases(updates: Partial<StandardParameters>, enableNotifications: boolean = true): void {
    const normalPhraseIds: string[] = [];
    
    for (const [phraseId] of this.phraseParameters.entries()) {
      const isIndividual = this.phraseIndividualSettings.get(phraseId) || false;
      if (!isIndividual) {
        normalPhraseIds.push(phraseId);
      }
    }
    
    if (normalPhraseIds.length > 0) {
      
      // 各通常フレーズのパラメータを更新
      for (const phraseId of normalPhraseIds) {
        const currentParams = this.phraseParameters.get(phraseId);
        if (currentParams) {
          const updatedParams = { ...currentParams, ...updates };
          this.phraseParameters.set(phraseId, updatedParams as CompleteParameters);
        }
      }
      
      // 変更通知（有効化されている場合のみ）
      if (enableNotifications) {
        for (const phraseId of normalPhraseIds) {
          const params = this.phraseParameters.get(phraseId);
          if (params) {
            this.notifyParameterChange(phraseId, params);
          }
        }
      }
    }
  }
  
  /**
   * 新規フレーズ作成時のベース値として使用
   */
  getGlobalDefaults(): CompleteParameters {
    // 配列チェック（防御的プログラミング）
    if (Array.isArray(this.globalDefaults)) {
      console.error('[ParameterManagerV2] globalDefaults is an array, reinitializing');
      this.globalDefaults = this.createDefaultParameters();
    }
    
    const result = JSON.parse(JSON.stringify(this.globalDefaults));
    return result;
  }
  
  /**
   * テンプレート変更の処理
   */
  handleTemplateChange(
    objectId: string,
    newTemplateId: string,
    preserveParams: boolean = true
  ): void {
    const phraseId = this.extractPhraseId(objectId);
    const currentParams = this.phraseParameters.get(phraseId);
    if (!currentParams) {
      // 未初期化の場合は新規初期化
      this.initializePhrase(phraseId, newTemplateId);
      return;
    }
    
    if (!preserveParams) {
      // パラメータ保持しない場合は再初期化
      this.initializePhrase(phraseId, newTemplateId, this.globalDefaults);
      return;
    }
    
    // パラメータ保持する場合
    const newTemplateDefaults = this.getTemplateDefaults(newTemplateId);
    
    // 新しいパラメータセットを作成
    const newParams = this.createDefaultParameters();
    
    // 新しいテンプレートのデフォルトを適用
    Object.assign(newParams, newTemplateDefaults);
    
    // ユーザーが変更した値を保持
    const paramsToPreserve: Partial<StandardParameters> = {};
    
    // 重要なレイアウトパラメータは常に保持
    const criticalParams: (keyof StandardParameters)[] = [
      'letterSpacing', 'fontSize', 'fontFamily', 'lineHeight', 
      'offsetX', 'offsetY', 'textColor'
    ];
    
    for (const key of criticalParams) {
      if (currentParams[key] !== undefined) {
        paramsToPreserve[key] = currentParams[key];
      }
    }
    
    // その他のユーザー変更値を検出して保持
    for (const [key, value] of Object.entries(currentParams)) {
      const paramKey = key as keyof StandardParameters;
      // デフォルト値と異なる場合は保持
      if (!criticalParams.includes(paramKey) && 
          JSON.stringify(value) !== JSON.stringify(this.globalDefaults[paramKey])) {
        paramsToPreserve[paramKey] = value;
      }
    }
    
    // 保持したパラメータを適用
    Object.assign(newParams, paramsToPreserve);
    
    // 更新
    this.phraseParameters.set(phraseId, newParams);
    this.phraseTemplates.set(phraseId, newTemplateId);
    this.notifyParameterChange(phraseId, newParams);
  }
  
  /**
   * 保存用の圧縮エクスポート
   */
  exportCompressed(): CompressedProjectData {
    const compressed: Record<string, CompressedPhrase> = {};
    
    for (const [phraseId, params] of this.phraseParameters.entries()) {
      const isIndividual = this.phraseIndividualSettings.get(phraseId) || false;
      
      // 個別設定がある場合のみテンプレートIDを取得・保存
      let templateId = '';
      if (isIndividual) {
        // まずTemplateManagerから取得
        if (this.templateManager && this.templateManager.getAssignment) {
          templateId = this.templateManager.getAssignment(phraseId) || '';
        }
        
        // フォールバック: 内部記録から取得
        if (!templateId) {
          templateId = this.phraseTemplates.get(phraseId) || '';
        }
      }
      // 個別設定がない場合は空文字（デフォルト使用）
      
      const sanitizedTemplateId = templateId ? this.sanitizeTemplateId(templateId) : '';
      const diff = this.calculateDiff(this.globalDefaults, params);
      
      // 開発時のみログ出力（高頻度なので通常は抑制）
      if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
      }
      
      compressed[phraseId] = {
        templateId: sanitizedTemplateId,
        parameterDiff: Object.keys(diff).length > 0 ? diff : undefined,
        individualSettingEnabled: isIndividual
      };
    }
    
    return {
      version: "2.0",
      globalDefaults: this.globalDefaults,
      phrases: compressed
    };
  }
  
  /**
   * 圧縮データからの復元
   */
  importCompressed(data: CompressedProjectData): void {
    
    // グローバルデフォルトを安全に設定
    const normalizedGlobalDefaults = ParameterProcessor.normalizeToParameterObject(data.globalDefaults);
    this.globalDefaults = ParameterProcessor.mergeParameterObjects(
      this.createDefaultParameters(), 
      normalizedGlobalDefaults
    ) as CompleteParameters;
    
    // 各フレーズを復元
    this.phraseParameters.clear();
    this.phraseTemplates.clear();
    this.phraseIndividualSettings.clear();
    
    for (const [phraseId, compressedPhrase] of Object.entries(data.phrases)) {
      // 個別設定状態を先に復元（重要）
      const isIndividualEnabled = compressedPhrase.individualSettingEnabled || false;
      this.phraseIndividualSettings.set(phraseId, isIndividualEnabled);
      
      // 個別設定の場合のみテンプレートIDを保存、そうでなければデフォルトを使用
      let templateIdToStore = '';
      if (isIndividualEnabled && compressedPhrase.templateId) {
        templateIdToStore = this.sanitizeTemplateId(compressedPhrase.templateId);
      } else {
        // 個別設定がない場合はテンプレートIDを保存しない（デフォルト使用）
        templateIdToStore = '';
      }
      
      // ベースパラメータを作成
      let params: CompleteParameters;
      
      if (isIndividualEnabled && compressedPhrase.parameterDiff) {
        // 個別設定が有効な場合：グローバルデフォルト＋差分のみ適用
        // テンプレートデフォルトは適用しない（個別設定を保護）
        params = { ...this.globalDefaults };
        
        // 差分を適用
        Object.assign(params, compressedPhrase.parameterDiff);
        
      } else {
        // 個別設定が無効な場合：正しい優先順位で適用
        // 1. システムデフォルトから開始
        params = { ...this.createDefaultParameters() };
        
        // 2. テンプレートデフォルト（推奨値）を適用（templateIdがある場合のみ）
        if (templateIdToStore) {
          const templateDefaults = this.getTemplateDefaults(templateIdToStore);
          Object.assign(params, templateDefaults);
        }
        
        // 3. ユーザーグローバル設定を適用（最優先）
        Object.assign(params, this.globalDefaults);
        
        // 4. 差分があれば適用（個別調整）
        if (compressedPhrase.parameterDiff) {
          Object.assign(params, compressedPhrase.parameterDiff);
        }
        
      }
      
      this.phraseParameters.set(phraseId, params as CompleteParameters);
      this.phraseTemplates.set(phraseId, templateIdToStore);
    }
    
    // 復元完了後の統計をログ出力
    const individualCount = Array.from(this.phraseIndividualSettings.values()).filter(v => v).length;
  }
  
  
  /**
   * 差分計算
   */
  private calculateDiff(
    base: CompleteParameters,
    target: CompleteParameters
  ): Partial<StandardParameters> {
    const diff: Partial<StandardParameters> = {};
    
    for (const [key, value] of Object.entries(target)) {
      const baseValue = base[key as keyof CompleteParameters];
      if (JSON.stringify(value) !== JSON.stringify(baseValue)) {
        diff[key as keyof StandardParameters] = value;
      }
    }
    
    return diff;
  }
  
  /**
   * 変更通知
   */
  private notifyParameterChange(phraseId: string, params: CompleteParameters): void {
    if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
    }
    
    this.changeListeners.forEach((listener, id) => {
      if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
      }
      listener(phraseId, params);
    });
  }
  
  /**
   * バッチ更新（複数フレーズを同時に更新、通知は行わない - Engine側で直接Instance更新を実行）
   */
  updateParametersForMultiplePhrasesWithoutNotification(
    updates: Array<{ phraseId: string; params: Partial<StandardParameters> }>
  ): void {
    
    // 各フレーズを更新（通知なし、個別設定保護機能付き）
    let skippedCount = 0;
    let updatedCount = 0;
    
    updates.forEach(({ phraseId, params }) => {
      const actualPhraseId = this.extractPhraseId(phraseId);
      
      // 個別設定が有効なフレーズは保護する
      if (this.phraseIndividualSettings.get(actualPhraseId)) {
        skippedCount++;
        return;
      }
      
      const existingParams = this.phraseParameters.get(actualPhraseId);
      if (!existingParams) {
        console.warn(`Phrase ${actualPhraseId} not initialized for batch update (object: ${phraseId})`);
        return;
      }
      
      // パラメータを検証
      const validation = ParameterValidator.validate(params);
      if (!validation.isValid) {
        console.warn('Parameter validation errors:', validation.errors);
      }
      
      // 更新を適用（通知なし）
      Object.assign(existingParams, validation.sanitized);
      updatedCount++;
      
    });
    
  }
  
  /**
   * 変更リスナーの登録
   */
  addChangeListener(id: string, listener: (phraseId: string, params: CompleteParameters) => void): void {
    this.changeListeners.set(id, listener);
  }
  
  /**
   * キャッシュの強制リフレッシュ（互換性のため）
   */
  forceRefreshCache(): void {
    // V2ではキャッシュを使用していないため、no-op
  }
  
  /**
   * 全ての個別オブジェクトデータを強制クリア（V2統一管理）
   * 全フレーズの個別設定を無効化してグローバルデフォルトにリセット
   */
  forceCleanAllObjectData(): void {
    
    // 全フレーズの個別設定を無効化
    for (const phraseId of this.phraseParameters.keys()) {
      this.phraseIndividualSettings.set(phraseId, false);
      
      // パラメータを正しい優先順位でリセット
      const templateId = this.phraseTemplates.get(phraseId) || this.defaultTemplateId;
      const templateDefaults = this.getTemplateDefaults(templateId);
      
      // 正しい優先順位でリセット
      const resetParams = { ...this.createDefaultParameters() }; // 1. システムデフォルト
      Object.assign(resetParams, templateDefaults); // 2. テンプレート推奨値
      Object.assign(resetParams, this.globalDefaults); // 3. ユーザーグローバル設定（最優先）
      
      this.phraseParameters.set(phraseId, resetParams);
      
      // 個別設定変更を通知
      this.notifyIndividualSettingChange(phraseId, false);
      // パラメータ変更を通知
      this.notifyParameterChange(phraseId, resetParams);
    }
    
  }
  
  /**
   * 変更リスナーの削除
   */
  removeChangeListener(id: string): void {
    this.changeListeners.delete(id);
  }
  
  /**
   * 個別設定変更リスナーの登録
   */
  addIndividualSettingListener(id: string, listener: (phraseId: string, enabled: boolean) => void): void {
    this.individualSettingListeners.set(id, listener);
  }
  
  /**
   * 個別設定変更リスナーの削除
   */
  removeIndividualSettingListener(id: string): void {
    this.individualSettingListeners.delete(id);
  }
  
  /**
   * 個別設定変更の通知
   */
  private notifyIndividualSettingChange(phraseId: string, enabled: boolean): void {
    if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
    }
    
    this.individualSettingListeners.forEach((listener, id) => {
      if (import.meta.env.DEV && Math.random() < 0.01) { // 1%の確率でのみ出力
      }
      listener(phraseId, enabled);
    });
  }
  
  /**
   * すべてのフレーズパラメータをクリア
   */
  clearAllPhraseParameters(): void {
    this.phraseParameters.clear();
    this.phraseTemplates.clear();
    this.phraseIndividualSettings.clear();
  }
  
  /**
   * 特定フレーズのパラメータをクリア
   */
  clearPhraseParameters(objectId: string): void {
    const phraseId = this.extractPhraseId(objectId);
    this.phraseParameters.delete(phraseId);
    this.phraseTemplates.delete(phraseId);
    this.phraseIndividualSettings.delete(phraseId);
  }
  
  /**
   * フレーズが初期化されているかチェック
   */
  isPhraseInitialized(objectId: string): boolean {
    const phraseId = this.extractPhraseId(objectId);
    return this.phraseParameters.has(phraseId);
  }
  
  /**
   * 初期化されたフレーズのリストを取得
   */
  getInitializedPhrases(): string[] {
    return Array.from(this.phraseParameters.keys());
  }
  
  /**
   * デフォルトテンプレートIDを取得
   */
  getDefaultTemplateId(): string {
    return this.defaultTemplateId;
  }
  
  /**
   * デフォルトテンプレートIDを設定
   */
  setDefaultTemplateId(templateId: string): void {
    this.defaultTemplateId = templateId;
  }
  
  /**
   * 個別設定を有効化（V2統一管理）
   */
  enableIndividualSetting(objectId: string): void {
    const phraseId = this.extractPhraseId(objectId);
    
    // フレーズが初期化されていない場合は自動初期化
    if (!this.phraseParameters.has(phraseId)) {
      const templateId = this.getDefaultTemplateId() || 'fadeslidetext';
      this.initializePhrase(phraseId, templateId);
    }
    
    this.phraseIndividualSettings.set(phraseId, true);
    
    // 個別設定変更を通知
    this.notifyIndividualSettingChange(phraseId, true);
  }
  
  /**
   * 個別設定を無効化（V2統一管理）
   */
  disableIndividualSetting(objectId: string): void {
    const phraseId = this.extractPhraseId(objectId);
    this.phraseIndividualSettings.set(phraseId, false);
    
    // 個別設定変更を通知
    this.notifyIndividualSettingChange(phraseId, false);
  }
  
  /**
   * 個別設定状態の取得（V2統一管理）
   */
  isIndividualSettingEnabled(objectId: string): boolean {
    const phraseId = this.extractPhraseId(objectId);
    return this.phraseIndividualSettings.get(phraseId) || false;
  }
  
  /**
   * 個別設定が有効なフレーズ一覧を取得
   */
  getIndividualSettingsEnabled(): string[] {
    const enabledPhrases: string[] = [];
    for (const [phraseId, enabled] of this.phraseIndividualSettings.entries()) {
      if (enabled) {
        enabledPhrases.push(phraseId);
      }
    }
    return enabledPhrases;
  }
  
  /**
   * 複数オブジェクトのパラメータをクリア（V2統一管理）
   * 個別設定を無効化してグローバル設定を再適用
   */
  clearMultipleObjectParams(objectIds: string[]): void {
    
    objectIds.forEach(objectId => {
      const phraseId = this.extractPhraseId(objectId);
      
      // 個別設定を無効化
      this.phraseIndividualSettings.set(phraseId, false);
      
      // パラメータを正しい優先順位でリセット
      if (this.phraseParameters.has(phraseId)) {
        const templateId = this.phraseTemplates.get(phraseId) || this.defaultTemplateId;
        const templateDefaults = this.getTemplateDefaults(templateId);
        
        // 正しい優先順位でリセット
        const resetParams = { ...this.createDefaultParameters() }; // 1. システムデフォルト
        Object.assign(resetParams, templateDefaults); // 2. テンプレート推奨値
        Object.assign(resetParams, this.globalDefaults); // 3. ユーザーグローバル設定（最優先）
        
        this.phraseParameters.set(phraseId, resetParams);
        
        // パラメータ変更を通知
        this.notifyParameterChange(phraseId, resetParams);
      }
      
      // 個別設定変更を通知
      this.notifyIndividualSettingChange(phraseId, false);
    });
    
  }
  
  /**
   * デバッグ用: 現在の状態をダンプ
   */
  debugDump(): void {
    // デバッグダンプログ削除済み
  }
}