import React, { useEffect, useState } from 'react';
import { FontService } from '../../services/FontService';
import Engine from '../../engine/Engine';
import DebugTab from './DebugTab';
import { Section } from '../common';
import '../../styles/SettingsTab.css';

type DebugTabProps = React.ComponentProps<typeof DebugTab>;

interface SettingsTabProps {
  engine?: Engine;
  debugInfo?: DebugTabProps['debugInfo'];
  timingDebugInfo?: DebugTabProps['timingDebugInfo'];
}

const SettingsTab: React.FC<SettingsTabProps> = ({ engine, debugInfo, timingDebugInfo }) => {
  const [fontCount, setFontCount] = useState(0);
  // デバッグ情報は開いている間だけ描画し、閉じているときは更新処理を走らせない。
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    setFontCount(FontService.getFontFamiliesWithStyles().length);
  }, []);

  return (
    <div className="panel-content app-settings-tab">
      <Section title="フォント">
        <p className="app-settings-description">
          PCにインストールされているフォントを自動的に認識します。フォントを手動で有効化する必要はありません。
        </p>
        <dl className="app-settings-list">
          <div>
            <dt>利用可能なフォント</dt>
            <dd>{fontCount} ファミリー</dd>
          </div>
          <div>
            <dt>読み込み方式</dt>
            <dd>選択時に自動読み込み</dd>
          </div>
        </dl>
      </Section>

      <details
        className="common-section app-settings-debug"
        open={debugOpen}
        onToggle={event => setDebugOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="common-section-title">開発者向け: デバッグ情報</summary>
        {debugOpen && (
          <DebugTab engine={engine} debugInfo={debugInfo} timingDebugInfo={timingDebugInfo} />
        )}
      </details>
    </div>
  );
};

export default SettingsTab;
