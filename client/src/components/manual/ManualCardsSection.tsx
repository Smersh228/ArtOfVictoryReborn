import React from 'react';
import styles from '../../pages/styleModules/manual.module.css';
import ManualRuleCard, { type ManualRuleCardEntry } from './ManualRuleCard';

interface ManualCardsSectionProps {
  title: string;
  cards: ManualRuleCardEntry[];
  emptyText?: React.ReactNode;
}

const ManualCardsSection: React.FC<ManualCardsSectionProps> = ({ title, cards, emptyText }) => {
  return (
    <div>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.cardsList}>
        {cards.map((c) => (
          <ManualRuleCard key={c.id} entry={c} />
        ))}
        {cards.length === 0 && emptyText ? <div className={styles.noData}>{emptyText}</div> : null}
      </div>
    </div>
  );
};

export default ManualCardsSection;
