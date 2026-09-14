import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './styleModules/manual.module.css';
import ManualGuide from '../components/manual/ManualGuide';

const Manual: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className={styles.manual}>
      <header className={styles.manualHeader}>
        <h1 className={styles.manualName}>Руководство по игре</h1>
      </header>
      <ManualGuide onGoMain={() => navigate('/main')} />
    </div>
  );
};

export default Manual;
