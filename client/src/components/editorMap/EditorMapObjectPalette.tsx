import React from 'react';
import styles from '../../pages/styleModules/editorMap.module.css';
import {
  EDITOR_MAP_FORTIFICATIONS,
  type CatalogFortification,
  isCatalogFortification,
} from '../../game/editorMapFortifications';

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
  mapBuilding?: { name: string; imagePath: string };
}

interface CatalogBuilding {
  id: string;
  dbId: number;
  name: string;
  imagePath: string;
}

function isCatalogUnit(item: CatalogUnit | CatalogHex | CatalogBuilding | null): item is CatalogUnit {
  return item != null && 'faction' in item;
}

function isCatalogHex(item: CatalogUnit | CatalogHex | CatalogBuilding | null): item is CatalogHex {
  return item != null && !('faction' in item) && !('dbId' in item);
}

function isCatalogBuilding(item: CatalogUnit | CatalogHex | CatalogBuilding | null): item is CatalogBuilding {
  return item != null && 'dbId' in item && typeof (item as CatalogBuilding).dbId === 'number';
}

type PaletteItem = CatalogUnit | CatalogHex | CatalogBuilding | CatalogFortification;

interface EditorMapObjectPaletteProps {
  activeTab: string;
  selectedFaction: string;
  selectedUnitType: string;
  selectedItem: PaletteItem | null;
  catalogUnits: CatalogUnit[];
  catalogHexes: CatalogHex[];
  catalogBuildings: CatalogBuilding[];
  onSelect: (item: PaletteItem | null) => void;
}

const EditorMapObjectPalette: React.FC<EditorMapObjectPaletteProps> = ({
  activeTab,
  selectedFaction,
  selectedUnitType,
  selectedItem,
  catalogUnits,
  catalogHexes,
  catalogBuildings,
  onSelect,
}) => {
  const filteredUnits = catalogUnits
    .filter((u) => selectedFaction === 'all' || u.faction === selectedFaction)
    .filter((u) => selectedUnitType === 'all' || u.type === selectedUnitType);

  if (activeTab !== 'units' && activeTab !== 'hexes' && activeTab !== 'buildings') {
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
        {activeTab === 'buildings' && (
          <>
            {EDITOR_MAP_FORTIFICATIONS.map((f) => (
              <div
                key={f.id}
                className={`${styles.objectItem} ${
                  isCatalogFortification(selectedItem) && selectedItem.id === f.id ? styles.selected : ''
                }`}
                onClick={() =>
                  onSelect(
                    isCatalogFortification(selectedItem) && selectedItem.id === f.id ? null : f,
                  )
                }
              >
                <div
                  className={`${styles.objectIcon} ${styles.objectIconBuild}${
                    f.iconVariant === 'wire' ? ` ${styles.objectIconBuildWire}` : ''
                  }`}
                >
                  <img src={f.imagePath} alt={f.name} />
                </div>
                <div className={styles.objectName}>{f.name}</div>
              </div>
            ))}
            {catalogBuildings.map((b) => (
              <div
                key={b.id}
                className={`${styles.objectItem} ${
                  isCatalogBuilding(selectedItem) && selectedItem.dbId === b.dbId ? styles.selected : ''
                }`}
                onClick={() =>
                  onSelect(
                    isCatalogBuilding(selectedItem) && selectedItem.dbId === b.dbId ? null : b,
                  )
                }
              >
                <div className={styles.objectIcon}>
                  <img width={50} height={50} src={b.imagePath} alt={b.name} />
                </div>
                <div className={styles.objectName}>{b.name}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default EditorMapObjectPalette;
