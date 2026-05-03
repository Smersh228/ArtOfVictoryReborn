import React from 'react';
import styles from '../../pages/styleModules/editorMap.module.css';

interface CatalogUnit {
  id: number;
  name: string;
  type: string;
  faction: string;
  imagePath: string;
}

interface CatalogHex {
  id: string;
  name: string;
  imagePath: string;
}

function isCatalogUnit(item: CatalogUnit | CatalogHex | null): item is CatalogUnit {
  return item != null && 'faction' in item;
}

function isCatalogHex(item: CatalogUnit | CatalogHex | null): item is CatalogHex {
  return item != null && !('faction' in item);
}

interface EditorMapObjectPaletteProps {
  activeTab: string;
  selectedFaction: string;
  selectedUnitType: string;
  selectedItem: CatalogUnit | CatalogHex | null;
  catalogUnits: CatalogUnit[];
  catalogHexes: CatalogHex[];
  onSelect: (item: CatalogUnit | CatalogHex | null) => void;
}

const EditorMapObjectPalette: React.FC<EditorMapObjectPaletteProps> = ({
  activeTab,
  selectedFaction,
  selectedUnitType,
  selectedItem,
  catalogUnits,
  catalogHexes,
  onSelect,
}) => {
  const filteredUnits = catalogUnits
    .filter((u) => selectedFaction === 'all' || u.faction === selectedFaction)
    .filter((u) => selectedUnitType === 'all' || u.type === selectedUnitType);

  if (activeTab !== 'units' && activeTab !== 'hexes') {
    return null;
  }

  return (
    <div className={styles.rightPalette}>
      <div className={styles.objectsGrid}>
        {activeTab === 'units' &&
          filteredUnits.map((unit) => (
            <div
              key={unit.id}
              className={`${styles.objectItem} ${
                isCatalogUnit(selectedItem) && selectedItem.id === unit.id ? styles.selected : ''
              }`}
              onClick={() =>
                onSelect(isCatalogUnit(selectedItem) && selectedItem.id === unit.id ? null : unit)
              }
            >
              <div className={styles.objectIcon}>
                <img width={50} height={50} src={unit.imagePath} alt={unit.name} />
              </div>
              <div className={styles.objectName}>{unit.name}</div>
            </div>
          ))}
        {activeTab === 'hexes' &&
          catalogHexes.map((hex) => (
            <div
              key={hex.id}
              className={`${styles.objectItem} ${
                isCatalogHex(selectedItem) && selectedItem.id === hex.id ? styles.selected : ''
              }`}
              onClick={() =>
                onSelect(isCatalogHex(selectedItem) && selectedItem.id === hex.id ? null : hex)
              }
            >
              <div className={styles.objectIcon}>
                <img src={hex.imagePath} alt={hex.name} />
              </div>
              <div className={styles.objectName}>{hex.name}</div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default EditorMapObjectPalette;
