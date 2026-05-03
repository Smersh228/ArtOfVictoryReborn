import React from 'react';
import styles from '../../pages/styleModules/editorMap.module.css';

interface EditorMapToolPanelProps {
  activeTab: string;
  tabs: { id: string; label: string }[];
  showObjectPalette: boolean;
  onSwitchTab: (tabId: string) => void;
  controls: React.ReactNode;
  palette: React.ReactNode;
}

const EditorMapToolPanel: React.FC<EditorMapToolPanelProps> = ({
  activeTab,
  tabs,
  showObjectPalette,
  onSwitchTab,
  controls,
  palette,
}) => {
  return (
    <div className={`${styles.editorMapTool} ${!showObjectPalette ? styles.editorMapToolFormOnly : ''}`}>
      <div className={styles.editorUnitFilter}>
        <div className={styles.mainTabs}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`${styles.mainTab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => onSwitchTab(tab.id)}
            >
              {tab.label}
            </div>
          ))}
        </div>
        {controls}
      </div>
      {palette}
    </div>
  );
};

export default EditorMapToolPanel;
