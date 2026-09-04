import React, { useEffect } from 'react'
import styles from './Modal.module.css'

export type ModalSize = 'md' | 'lg' | 'xl'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  size?: ModalSize
  children: React.ReactNode
  footer?: React.ReactNode
  /** Выше обычных модалок (профиль поверх белого списка). */
  elevated?: boolean
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, size = 'md', children, footer, elevated }) => {
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen) return null

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      className={`${styles.backdrop} ${elevated ? styles.backdropElevated : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`${styles.dialog} ${size === 'lg' ? styles.dialogWide : ''} ${size === 'xl' ? styles.dialogXl : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={stop}
      >
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 id="modal-title" className={styles.title}>
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  )
}

export default Modal
