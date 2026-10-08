import { kineticSceneVariations } from '../data/kineticSceneVariations';
import { KineticSceneTemplate } from '../templates/KineticSceneTemplate';

export interface TemplatePreset {
  id: string;
  templateId: string;
  name: string;
  params: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  schemaVersion: 1;
  builtIn?: boolean;
  description?: string;
  referenceUrl?: string;
}

interface PresetStorage {
  schemaVersion: 1;
  presets: TemplatePreset[];
}

const STORAGE_KEY = 'utavista.template-presets.v1';

const kineticSceneDefaults = Object.fromEntries(
  new KineticSceneTemplate().getParameterConfig().map(parameter => [parameter.name, parameter.default])
);

const DEFAULT_PRESET: TemplatePreset = {
  id: 'builtin-default-scene',
  templateId: 'kineticscenetemplate',
  name: '00 初期設定',
  params: kineticSceneDefaults,
  createdAt: 0,
  updatedAt: 0,
  schemaVersion: 1,
  builtIn: true,
  description: 'キネティック・シーン・コンポーザーの初期設定へ戻します'
};

const BUILT_IN_PRESETS: TemplatePreset[] = [DEFAULT_PRESET, ...kineticSceneVariations.map(variation => ({
  id: variation.id,
  templateId: 'kineticscenetemplate',
  name: variation.name,
  params: variation.params,
  createdAt: 0,
  updatedAt: 0,
  schemaVersion: 1,
  builtIn: true,
  description: variation.description,
  referenceUrl: variation.referenceUrl
}))];

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isPreset(value: unknown): value is TemplatePreset {
  if (!value || typeof value !== 'object') return false;
  const preset = value as Partial<TemplatePreset>;
  return typeof preset.id === 'string'
    && typeof preset.templateId === 'string'
    && typeof preset.name === 'string'
    && !!preset.params
    && typeof preset.params === 'object'
    && preset.schemaVersion === 1;
}

/** テンプレート設定をアプリ横断で再利用するための永続プリセットストア。 */
export class TemplatePresetService {
  static list(templateId: string): TemplatePreset[] {
    const userPresets = this.read().presets
      .filter(preset => preset.templateId === templateId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const builtIns = BUILT_IN_PRESETS.filter(preset => preset.templateId === templateId);
    return [...builtIns, ...userPresets];
  }

  static save(
    templateId: string,
    name: string,
    params: Record<string, unknown>,
    presetId?: string
  ): TemplatePreset {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('プリセット名を入力してください');

    const storage = this.read();
    const existingIndex = presetId
      ? storage.presets.findIndex(preset => preset.id === presetId && preset.templateId === templateId)
      : -1;
    const now = Date.now();
    const preset: TemplatePreset = {
      id: existingIndex >= 0 ? storage.presets[existingIndex].id : createId(),
      templateId,
      name: normalizedName,
      params: JSON.parse(JSON.stringify(params)),
      createdAt: existingIndex >= 0 ? storage.presets[existingIndex].createdAt : now,
      updatedAt: now,
      schemaVersion: 1
    };

    if (existingIndex >= 0) storage.presets[existingIndex] = preset;
    else storage.presets.push(preset);
    this.write(storage);
    return preset;
  }

  static delete(presetId: string): void {
    if (BUILT_IN_PRESETS.some(preset => preset.id === presetId)) return;
    const storage = this.read();
    storage.presets = storage.presets.filter(preset => preset.id !== presetId);
    this.write(storage);
  }

  private static read(): PresetStorage {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { schemaVersion: 1, presets: [] };
      const parsed = JSON.parse(raw) as Partial<PresetStorage>;
      return {
        schemaVersion: 1,
        presets: Array.isArray(parsed.presets) ? parsed.presets.filter(isPreset) : []
      };
    } catch (error) {
      console.warn('テンプレートプリセットの読み込みに失敗しました:', error);
      return { schemaVersion: 1, presets: [] };
    }
  }

  private static write(storage: PresetStorage): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  }
}
