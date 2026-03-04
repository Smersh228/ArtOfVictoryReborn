import React from 'react';
import styles from './styleModules/button.module.css'
interface Button {
name:string


}


const Button: React.FC<Button> = ({name}) => {
  
  return (
    <div className={styles.button}>
      {name}
    </div>
  );
};

export default Button;