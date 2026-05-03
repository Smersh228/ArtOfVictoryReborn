import React from 'react';
import styles from '../../pages/styleModules/manual.module.css';
import { resolveEditorImageUrl } from '../../api/editorCatalog';

interface ManualStatRow { label: string; value: string }

export interface ManualRuleCardEntry {
  id: number;
  ruleTitle: string;
  description: string;
  imagePath: string;
  imagePath2: string;
  imagePath3: string;
  statRows: ManualStatRow[];
}

interface ManualRuleCardProps {
  entry: ManualRuleCardEntry;
}

const ManualRuleCard: React.FC<ManualRuleCardProps> = ({ entry }) => {
  const imgSrc = entry.imagePath ? resolveEditorImageUrl(entry.imagePath) : undefined;
  return (
    <div className={styles.card}>
      <div className={styles.cardImage}>
        {imgSrc ? <img src={imgSrc} alt="" /> : <div className={styles.cardImagePlaceholder}>Правило</div>}
      </div>
      <div className={styles.cardInfo}>
        {entry.ruleTitle ? <div className={styles.ruleCardTitle}>{entry.ruleTitle}</div> : null}
        <div className={styles.cardDescriptionBlock}>
          <div className={styles.cardDescriptionText}>
            <div className={styles.cardDescriptionTextRow}>
              <div className={`${styles.cardDescriptionPhotoCol} ${styles.cardDescriptionPhotoColLeft}`}>
                {entry.imagePath2 ? (
                  <div className={styles.cardRuleExtraPhotoFrame}>
                    <img src={resolveEditorImageUrl(entry.imagePath2)} alt="" />
                  </div>
                ) : null}
              </div>
              <div className={styles.cardDescriptionTextBody}>
                {entry.description.trim() ? entry.description : '—'}
              </div>
              <div className={`${styles.cardDescriptionPhotoCol} ${styles.cardDescriptionPhotoColRight}`}>
                {entry.imagePath3 ? (
                  <div className={styles.cardRuleExtraPhotoFrame}>
                    <img src={resolveEditorImageUrl(entry.imagePath3)} alt="" />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {entry.statRows.length > 0 && (
          <div className={styles.cardStatSection}>
            <div className={styles.cardStatSectionTitle}>Характеристики</div>
            <div className={styles.statGrid}>
              {entry.statRows.map((row, i) => (
                <div key={`${row.label}-${i}`} className={styles.statGridRow}>
                  <span className={styles.statGridLabel}>{row.label}</span>
                  <span className={styles.statGridValue}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualRuleCard;
