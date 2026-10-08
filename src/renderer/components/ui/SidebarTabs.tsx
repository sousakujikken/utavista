import React from 'react';
import { Tab } from '@headlessui/react';

const SidebarTabs: React.FC<{
  labels: string[];
  children: React.ReactNode[];
  /** 非選択時もアンマウントせず非表示で保持するパネルの番号（実行中の処理の状態を失わないため）。 */
  keepMountedIndexes?: number[];
}> = ({ labels, children, keepMountedIndexes = [] }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Tab.Group as="div" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tab.List className="tab-list">
        {labels.map(label => (
          <Tab key={label} className="tab-button">
            {({ selected }) => (
              <span
                className={`tab-button-text ${selected ? 'selected' : ''}`}
                aria-selected={selected}
              >
                {label}
              </span>
            )}
          </Tab>
        ))}
      </Tab.List>
      <Tab.Panels className="tab-panels">
        {children.map((panel, i) => (
          <Tab.Panel
            key={i}
            className="sidebar-tab-panel"
            unmount={!keepMountedIndexes.includes(i)}
          >
            {panel}
          </Tab.Panel>
        ))}
      </Tab.Panels>
    </Tab.Group>
  </div>
);

export default SidebarTabs;
