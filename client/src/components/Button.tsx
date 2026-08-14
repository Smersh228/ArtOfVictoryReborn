import React from 'react';
import styles from './styleModules/button.module.css'

interface ButtonProps {
  name: string
  size?: number
  onClick?: () => void
  className?: string
  disabled?: boolean
  title?: string
  badgeCount?: number
}

const Button: React.FC<ButtonProps> = ({ name, size, onClick, className, disabled, title, badgeCount }) => {
  const showBadge = badgeCount != null && badgeCount > 0
  return (
    <div
      title={title}
      onClick={disabled ? undefined : onClick}
      style={{ width: size ? `${size}px` : 'auto' }}
      className={[styles.button, disabled ? styles.buttonDisabled : '', className].filter(Boolean).join(' ')}
    >
      {name}
      {showBadge ? (
        <span className={styles.buttonBadge} aria-label={`Новых действий: ${badgeCount}`}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      ) : null}
    </div>
  )
}

export default Button;