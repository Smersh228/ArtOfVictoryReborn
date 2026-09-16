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
  spritePath?: string;
  statRows: ManualStatRow[];
}

interface ManualRuleCardProps {
  entry: ManualRuleCardEntry;
  imageInInfo?: boolean;
}

function ExtraPhoto({ path }: { path: string }) {
  return (
    <div className={styles.cardDescriptionPhotoCol}>
      <div className={styles.cardRuleExtraPhotoFrame}>
        <img src={resolveEditorImageUrl(path)} alt="" />
      </div>
    </div>
  );
}

const ManualRuleCard: React.FC<ManualRuleCardProps> = ({ entry, imageInInfo = false }) => {
  const imgSrc = entry.imagePath ? resolveEditorImageUrl(entry.imagePath) : undefined;
  const spriteSrc = entry.spritePath ? resolveEditorImageUrl(entry.spritePath) : undefined;
  const showSprite = Boolean(spriteSrc && spriteSrc !== imgSrc);
  const extraLeft = entry.imagePath2.trim();
  const extraRight = entry.imagePath3.trim();
  return (
    <div className={`${styles.card}${imageInInfo ? ` ${styles.cardTextOnly}` : ''}`}>
      {!imageInInfo ? (
      <div className={styles.cardImage}>
        {imgSrc ? <img src={imgSrc} alt="" /> : <div className={styles.cardImagePlaceholder}>Правило</div>}
      </div>
      ) : null}
      <div className={styles.cardInfo}>
        {imageInInfo && (imgSrc || spriteSrc) ? (
          <div
            className={`${styles.cardInfoPhoto}${imgSrc ? '' : ` ${styles.cardInfoPhotoSpriteOnly}`}${
              showSprite ? '' : ` ${styles.cardInfoPhotoHistoryOnly}`
            }`}
          >
            {showSprite ? (
              <div className={styles.cardInfoSpriteWrap}>
                <div className={styles.cardInfoSpritePlate}>
                  <img src={spriteSrc} alt="" />
                </div>
              </div>
            ) : null}
            {imgSrc ? (
              <div className={styles.cardInfoPhotoHistory}>
                <img src={imgSrc} alt="" />
              </div>
            ) : null}
          </div>
        ) : null}
        {entry.ruleTitle ? <div className={styles.ruleCardTitle}>{entry.ruleTitle}</div> : null}
        {entry.description.trim() || extraLeft || extraRight ? (
        <div className={styles.cardDescriptionBlock}>
          <div className={styles.cardDescriptionText}>
            <div className={styles.cardDescriptionTextRow}>
              {extraLeft ? <ExtraPhoto path={extraLeft} /> : null}
              {entry.description.trim() ? (
              <div className={styles.cardDescriptionTextBody}>
                {entry.description}
              </div>
              ) : extraLeft || extraRight ? <div className={styles.cardDescriptionTextBody} /> : null}
              {extraRight ? <ExtraPhoto path={extraRight} /> : null}
            </div>
          </div>
        </div>
        ) : null}
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
