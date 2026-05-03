import React from 'react';
import styles from '../../pages/styleModules/editorUnit.module.css';

interface TabItem { id: string; label: string }
interface FilterItem { id: string; label: string }

interface EditorUnitSidebarProps {
  tabs: TabItem[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  factions: FilterItem[];
  unitTypes: FilterItem[];
  selectedFaction: string;
  selectedUnitType: string;
  setSelectedFaction: (id: string) => void;
  setSelectedUnitType: (id: string) => void;
  onAddClick: () => void;
  units: any[];
  hexes: any[];
  rules: any[];
  selectedUnit: any;
  onSelectItem: (item: any) => void;
  renderThumb: (src: string | undefined, emoji: string) => React.ReactNode;
}

const EditorUnitSidebar: React.FC<EditorUnitSidebarProps> = ({
  tabs,
  activeTab,
  setActiveTab,
  factions,
  unitTypes,
  selectedFaction,
  selectedUnitType,
  setSelectedFaction,
  setSelectedUnitType,
  onAddClick,
  units,
  hexes,
  rules,
  selectedUnit,
  onSelectItem,
  renderThumb,
}) => {
  return (
    <div className={styles.editorUnitList}>
      <div className={styles.editorUnitFilter}>
        <div className={styles.mainTabs}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`${styles.mainTab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {activeTab === 'units' && (
          <>
            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>Фракция</div>
              <div className={styles.filterRow}>
                {factions.map((f) => (
                  <div
                    key={f.id}
                    className={`${styles.filterItem} ${selectedFaction === f.id ? styles.active : ''}`}
                    onClick={() => setSelectedFaction(f.id)}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>Тип</div>
              <div className={styles.unitTypeGrid}>
                {unitTypes.map((type) => (
                  <div
                    key={type.id}
                    className={`${styles.filterItem} ${selectedUnitType === type.id ? styles.active : ''}`}
                    onClick={() => setSelectedUnitType(type.id)}
                  >
                    {type.label}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.editorUnitItems}>
        <div className={styles.addItem} onClick={onAddClick}>
          <div>Добавить</div>
        </div>

        {activeTab === 'units' &&
          units
            .filter((u) => selectedFaction === 'all' || u.faction === selectedFaction)
            .filter((u) => selectedUnitType === 'all' || u.type === selectedUnitType)
            .map((unit) => (
              <div
                key={unit.id}
                className={`${styles.unitItem} ${selectedUnit?.id === unit.id ? styles.selected : ''}`}
                onClick={() => onSelectItem(unit)}
              >
                {renderThumb(unit.imagePath, '🪖')}
                <div>{unit.name}</div>
              </div>
            ))}

        {activeTab === 'hexes' &&
          hexes.map((item) => (
            <div
              key={item.id}
              className={`${styles.unitItem} ${selectedUnit?.id === item.id ? styles.selected : ''}`}
              onClick={() => onSelectItem(item)}
            >
              {renderThumb(item.imagePath, '⬡')}
              <div>{item.name}</div>
            </div>
          ))}

        {activeTab === 'rules' &&
          rules.map((item) => (
            <div
              key={item.id}
              className={`${styles.unitItem} ${selectedUnit?.id === item.id ? styles.selected : ''}`}
              onClick={() => onSelectItem(item)}
            >
              {renderThumb(item.imagePath || item.imagePath2 || item.imagePath3, '📋')}
              <div>{item.title || item.name}</div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default EditorUnitSidebar;
