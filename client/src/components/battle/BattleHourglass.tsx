import React from 'react';
import hourglassUrl from '../../img/123.svg';
import styles from '../../pages/styleModules/battle.module.css';

interface BattleHourglassProps {
  size?: number;
  inverted?: boolean;
}

const BattleHourglass: React.FC<BattleHourglassProps> = ({ size = 56, inverted = false }) => (
  <img
    src={hourglassUrl}
    alt=""
    width={size}
    height={size}
    className={`${styles.battleHourglass}${inverted ? ` ${styles.battleHourglassInverted}` : ''}`}
    draggable={false}
  />
);

export default BattleHourglass;
