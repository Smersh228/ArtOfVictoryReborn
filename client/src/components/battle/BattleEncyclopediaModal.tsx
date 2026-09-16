import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Button from '../Button';
import ManualRuleCard from '../manual/ManualRuleCard';
import type { BattleEncyclopediaView } from '../../game/battleEncyclopedia';
import battleStyles from '../../pages/styleModules/battle.module.css';
import manualStyles from '../../pages/styleModules/manual.module.css';

interface BattleEncyclopediaModalProps {
  view: BattleEncyclopediaView | null;
  onClose: () => void;
}

const BattleEncyclopediaModal: React.FC<BattleEncyclopediaModalProps> = ({ view, onClose }) => {
  useEffect(() => {
    if (!view) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, onClose]);

  if (!view) return null;

  return createPortal(
    <>
      <div
        className={`${battleStyles.leftMenuBackdrop} ${battleStyles.leftMenuBackdropDim} ${battleStyles.battleEncyclopediaBackdrop}`}
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      />
      <aside
        className={`${battleStyles.leftMenuPanel} ${battleStyles.battleEncyclopediaModal}`}
        role="dialog"
        aria-modal="true"
        aria-label={view.kind === 'unit' ? 'Карточка юнита' : 'Карточка гекса'}
      >
        <header className={battleStyles.leftMenuHeader}>
          <div className={battleStyles.leftMenuTitles}>
            <h2 className={battleStyles.leftMenuTitle}>
              {view.kind === 'unit' ? 'Карточка юнита' : 'Карточка гекса'}
            </h2>
            <p className={battleStyles.leftMenuSubtitle}>{view.entry.ruleTitle}</p>
          </div>
        </header>
        <div className={`${battleStyles.leftMenuBody} ${battleStyles.battleEncyclopediaBody}`}>
          <div className={manualStyles.manualInModal}>
            <ManualRuleCard entry={view.entry} imageInInfo />
          </div>
          {view.liveRows.length ? (
            <div className={manualStyles.cardStatSection}>
              <div className={manualStyles.cardStatSectionTitle}>Сейчас в бою</div>
              <div className={manualStyles.statGrid}>
                {view.liveRows.map((row, i) => (
                  <div key={`${row.label}-${i}`} className={manualStyles.statGridRow}>
                    <span className={manualStyles.statGridLabel}>{row.label}</span>
                    <span className={manualStyles.statGridValue}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <footer className={battleStyles.leftMenuFooter}>
          <Button name="Закрыть" onClick={onClose} />
        </footer>
      </aside>
    </>,
    document.body,
  );
};

export default BattleEncyclopediaModal;
