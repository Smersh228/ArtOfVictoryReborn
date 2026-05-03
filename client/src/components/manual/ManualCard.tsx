// components/manual/ManualCard.tsx
import React from 'react';
import styles from '../../pages/styleModules/manual.module.css';

interface ManualCardProps {
  id: number;
  title: string;
  image?: string;
  type?: string;
  description?: string;
  stats?: { icon: string; value: string | number }[];
  onClick?: (id: number) => void;
}

const ManualCard: React.FC<ManualCardProps> = ({ 
  id, 
  title, 
  image, 
  type, 
  description, 
  stats, 
  onClick 
}) => {
  return (
    <div className={styles.card} onClick={() => onClick?.(id)}>
      {image && (
        <div className={styles.cardImage}>
          <img src={image} alt={title} />
        </div>
      )}
      <div className={styles.cardContent}>
        <div className={styles.cardTitle}>{title}</div>
        {type && <div className={styles.cardType}>{type}</div>}
        {description && <div className={styles.cardDescription}>{description}</div>}
        {stats && stats.length > 0 && (
          <div className={styles.cardStats}>
            {stats.map((stat, idx) => (
              <span key={idx}>{stat.icon} {stat.value}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualCard;