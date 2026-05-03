import React from 'react'
import MainBlock from '../components/main/MainBlock'
import styles from './styleModules/main.module.css'

const Main: React.FC = () => {
  return (
    <div className={styles.mainPage}>
      <MainBlock />
    </div>
  )
}

export default Main
