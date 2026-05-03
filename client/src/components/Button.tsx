import React from 'react';
import styles from './styleModules/button.module.css'

interface ButtonProps {
  name: string
  size?: number
  onClick?: () => void
  className?: string
  disabled?: boolean
  title?: string
}

const Button: React.FC<ButtonProps> = ({ name, size, onClick, className, disabled, title }) => {
  return (
    <div
      title={title}
      onClick={disabled ? undefined : onClick}
      style={{ width: size ? `${size}px` : 'auto' }}
      className={[styles.button, disabled ? styles.buttonDisabled : '', className].filter(Boolean).join(' ')}
    >
      {name}
    </div>
  )
}

export default Button;