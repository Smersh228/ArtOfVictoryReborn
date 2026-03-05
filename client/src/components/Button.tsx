import React from 'react';
import styles from './styleModules/button.module.css'
interface Button {
name:string
size?:number

}


const Button: React.FC<Button> = ({name,size}) => {
  
  return (
    <div style={{width:size === undefined ? "" : `${size}px`}} className={styles.button}>
      {name}
    </div>
  );
};

export default Button;