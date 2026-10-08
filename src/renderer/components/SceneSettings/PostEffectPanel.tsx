import React, { useEffect, useState } from 'react';
import Engine from '../../engine/Engine';
import type { GlobalPostEffectConfig } from '../../effects/GlobalPostEffectManager';
import ParamEditor, { ParamConfig } from '../ParamEditor/ParamEditor';

const POST_EFFECT_CONFIG: ParamConfig[] = [
  { name: 'enabled', type: 'boolean', default: false, label: '共通Post FXを有効化' },
  { name: 'masterIntensity', type: 'number', default: 1, min: 0, max: 2, step: 0.05, label: '全体強度' },
  { name: 'shake', type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'カメラシェイク' },
  { name: 'zoom', type: 'number', default: 0, min: -0.25, max: 0.6, step: 0.01, label: 'ズーム' },
  { name: 'tilt', type: 'number', default: 0, min: -0.35, max: 0.35, step: 0.01, label: '傾き' },
  { name: 'glitch', type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'グリッチ' },
  { name: 'horizontalWarp', type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: '水平うねり' },
  { name: 'hueShift', type: 'number', default: 0, min: -180, max: 180, step: 1, label: '色相回転' },
  { name: 'chromaticAberration', type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: '色収差' },
  { name: 'vignette', type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'ビネット' },
  { name: 'filmGrain', type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'フィルムグレイン' },
  { name: 'scanlines', type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: '走査線' },
  { name: 'saturation', type: 'number', default: 1, min: 0, max: 2, step: 0.05, label: '彩度' },
  { name: 'contrast', type: 'number', default: 1, min: 0.4, max: 2, step: 0.05, label: 'コントラスト' }
];

interface PostEffectPanelProps {
  engine?: Engine;
}

const PostEffectPanel: React.FC<PostEffectPanelProps> = ({ engine }) => {
  const [config, setConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!engine) return;

    const syncConfig = (event?: Event) => {
      const eventConfig = (event as CustomEvent<{ config?: GlobalPostEffectConfig }> | undefined)
        ?.detail?.config;
      setConfig(eventConfig || engine.getPostEffectConfig());
    };

    syncConfig();
    window.addEventListener('post-effect-config-changed', syncConfig);
    window.addEventListener('project-loaded', syncConfig);

    return () => {
      window.removeEventListener('post-effect-config-changed', syncConfig);
      window.removeEventListener('project-loaded', syncConfig);
    };
  }, [engine]);

  const handleChange = (next: Record<string, unknown>) => {
    setConfig(next);
    engine?.updatePostEffectConfig(next as unknown as Partial<GlobalPostEffectConfig>);
  };

  return (
    <section className="post-effect-section">
      <h3>全シーン共通 Post FX</h3>
      <p>背景とすべてのシーンを合成した後、最終画面へ一度だけ適用します。</p>
      <ParamEditor params={config} paramConfig={POST_EFFECT_CONFIG} onChange={handleChange} />
    </section>
  );
};

export default PostEffectPanel;
