import React from 'react';
import styles from './styleModules/button.module.css'

interface ButtonProps {
  name: string
  size?: number
  onClick?: () => void
}

const Button: React.FC<ButtonProps> = ({ name, size, onClick }) => {
  return (
    <div 
      onClick={onClick}
      style={{ width: size ? `${size}px` : 'auto' }}
      className={styles.button}
    >
      {name}
    </div>
  );
};

export default Button;