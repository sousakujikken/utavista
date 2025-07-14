import { describe, it, expect, beforeEach } from 'vitest';
import { ParameterManagerV2, CompleteParameters } from '../ParameterManagerV2';
import { DEFAULT_PARAMETERS } from '../../../types/StandardParameters';

describe('ParameterManagerV2', () => {
  let pm: ParameterManagerV2;
  
  beforeEach(() => {
    pm = new ParameterManagerV2();
  });
  
  describe('初期化', () => {
    it('フレーズ初期化時に完全パラメータを生成', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      
      const params = pm.getParameters('phrase_1');
      
      // すべての必須パラメータが定義されていることを確認
      expect(params.fontSize).toBeDefined();
      expect(params.fontFamily).toBeDefined();
      expect(params.textColor).toBeDefined();
      expect(params.letterSpacing).toBeDefined();
      expect(params.lineHeight).toBeDefined();
      expect(params.offsetX).toBeDefined();
      expect(params.offsetY).toBeDefined();
      
      // オプショナルパラメータも含まれていることを確認
      expect(params.preInDuration).toBeDefined();
      expect(params.flickerMinFrequency).toBeDefined();
    });
    
    it('グローバルデフォルトが正しく適用される', () => {
      const customGlobal = {
        fontSize: 200,
        textColor: '#FF0000'
      };
      
      pm.updateGlobalDefaults(customGlobal);
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      
      const params = pm.getParameters('phrase_1');
      expect(params.fontSize).toBe(200);
      expect(params.textColor).toBe('#FF0000');
    });
    
    it('カスタムグローバル設定での初期化', () => {
      const customSettings = {
        fontSize: 150,
        letterSpacing: 10
      };
      
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate', customSettings);
      
      const params = pm.getParameters('phrase_1');
      expect(params.fontSize).toBe(150);
      expect(params.letterSpacing).toBe(10);
    });
  });
  
  describe('パラメータ更新', () => {
    it('単一パラメータ更新が他に影響しない', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      
      const before = pm.getParameters('phrase_1');
      const beforeColor = before.textColor;
      const beforeLetterSpacing = before.letterSpacing;
      
      pm.updateParameter('phrase_1', 'fontSize', 100);
      
      const after = pm.getParameters('phrase_1');
      expect(after.fontSize).toBe(100);
      expect(after.textColor).toBe(beforeColor); // 他のパラメータは変わらない
      expect(after.letterSpacing).toBe(beforeLetterSpacing);
    });
    
    it('バッチ更新が正しく動作する', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      
      const updates = {
        fontSize: 90,
        textColor: '#00FF00',
        letterSpacing: 5
      };
      
      pm.updateParameters('phrase_1', updates);
      
      const params = pm.getParameters('phrase_1');
      expect(params.fontSize).toBe(90);
      expect(params.textColor).toBe('#00FF00');
      expect(params.letterSpacing).toBe(5);
    });
    
    it('未初期化フレーズの更新でエラーが発生する', () => {
      expect(() => {
        pm.updateParameter('phrase_not_exist', 'fontSize', 100);
      }).toThrow('Phrase phrase_not_exist not initialized');
    });
  });
  
  describe('テンプレート変更', () => {
    it('パラメータ保持でテンプレート変更', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      pm.updateParameter('phrase_1', 'fontSize', 200);
      pm.updateParameter('phrase_1', 'textColor', '#FF00FF');
      
      pm.handleTemplateChange('phrase_1', 'MultiLineText', true);
      
      const params = pm.getParameters('phrase_1');
      // 重要なパラメータは保持される
      expect(params.fontSize).toBe(200);
      expect(params.textColor).toBe('#FF00FF');
    });
    
    it('パラメータ保持なしでテンプレート変更', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      pm.updateParameter('phrase_1', 'fontSize', 200);
      
      pm.handleTemplateChange('phrase_1', 'MultiLineText', false);
      
      const params = pm.getParameters('phrase_1');
      // デフォルト値にリセットされる
      expect(params.fontSize).toBe(DEFAULT_PARAMETERS.fontSize);
    });
  });
  
  describe('圧縮エクスポート/インポート', () => {
    it('変更なしの場合は差分が空', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      
      const exported = pm.exportCompressed();
      expect(exported.version).toBe('2.0');
      expect(exported.phrases.phrase_1.parameterDiff).toBeUndefined();
    });
    
    it('変更がある場合は差分のみ保存', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      pm.updateParameter('phrase_1', 'fontSize', 200);
      pm.updateParameter('phrase_1', 'textColor', '#FF0000');
      
      const exported = pm.exportCompressed();
      const diff = exported.phrases.phrase_1.parameterDiff;
      
      expect(diff).toBeDefined();
      expect(Object.keys(diff!).length).toBe(2);
      expect(diff!.fontSize).toBe(200);
      expect(diff!.textColor).toBe('#FF0000');
    });
    
    it('インポートで正しく復元される', () => {
      // データを準備
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      pm.updateParameter('phrase_1', 'fontSize', 200);
      pm.initializePhrase('phrase_2', 'MultiLineText');
      pm.updateParameter('phrase_2', 'lineHeight', 200);
      
      // エクスポート
      const exported = pm.exportCompressed();
      
      // 新しいインスタンスで復元
      const pm2 = new ParameterManagerV2();
      pm2.importCompressed(exported);
      
      // phrase_1の確認
      const params1 = pm2.getParameters('phrase_1');
      expect(params1.fontSize).toBe(200);
      
      // phrase_2の確認
      const params2 = pm2.getParameters('phrase_2');
      expect(params2.lineHeight).toBe(200);
    });
  });
  
  describe('V1からの移行', () => {
    it('V1データから正しく移行される', () => {
      const v1Data = {
        templateId: 'FlickerFadeTemplate',
        globalParams: {
          fontSize: 150,
          textColor: '#FFFFFF'
        },
        lyrics: [
          { id: 'phrase_1' },
          { id: 'phrase_2' }
        ],
        objectParams: {
          phrase_2: {
            letterSpacing: 10
          }
        },
        templateAssignments: {
          phrase_2: 'MultiLineText'
        }
      };
      
      const v2Data = pm.migrateFromV1(v1Data);
      
      // グローバルデフォルトの確認
      expect(v2Data.globalDefaults.fontSize).toBe(150);
      expect(v2Data.globalDefaults.textColor).toBe('#FFFFFF');
      
      // phrase_1は差分なし（グローバルと同じ）
      expect(v2Data.phrases.phrase_1.parameterDiff).toBeUndefined();
      
      // phrase_2は差分あり
      expect(v2Data.phrases.phrase_2.parameterDiff).toBeDefined();
      expect(v2Data.phrases.phrase_2.parameterDiff!.letterSpacing).toBe(10);
      expect(v2Data.phrases.phrase_2.templateId).toBe('MultiLineText');
    });
  });
  
  describe('パラメータの独立性', () => {
    it('複数フレーズのパラメータが独立している', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      pm.initializePhrase('phrase_2', 'FlickerFadeTemplate');
      
      pm.updateParameter('phrase_1', 'fontSize', 100);
      
      const params1 = pm.getParameters('phrase_1');
      const params2 = pm.getParameters('phrase_2');
      
      expect(params1.fontSize).toBe(100);
      expect(params2.fontSize).toBe(DEFAULT_PARAMETERS.fontSize);
    });
    
    it('返されるパラメータが深いコピーである', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      
      const params1 = pm.getParameters('phrase_1');
      params1.fontSize = 999;
      
      const params2 = pm.getParameters('phrase_1');
      expect(params2.fontSize).not.toBe(999);
    });
  });
  
  describe('ユーティリティメソッド', () => {
    it('フレーズ初期化チェック', () => {
      expect(pm.isPhraseInitialized('phrase_1')).toBe(false);
      
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      expect(pm.isPhraseInitialized('phrase_1')).toBe(true);
    });
    
    it('初期化されたフレーズリスト取得', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      pm.initializePhrase('phrase_2', 'MultiLineText');
      
      const phrases = pm.getInitializedPhrases();
      expect(phrases).toContain('phrase_1');
      expect(phrases).toContain('phrase_2');
      expect(phrases.length).toBe(2);
    });
    
    it('フレーズパラメータのクリア', () => {
      pm.initializePhrase('phrase_1', 'FlickerFadeTemplate');
      pm.initializePhrase('phrase_2', 'MultiLineText');
      
      pm.clearPhraseParameters('phrase_1');
      
      expect(pm.isPhraseInitialized('phrase_1')).toBe(false);
      expect(pm.isPhraseInitialized('phrase_2')).toBe(true);
    });
  });
});