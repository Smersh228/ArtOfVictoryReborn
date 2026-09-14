import React, { useCallback, useEffect, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import styles from './styleModules/userSettingsModal.module.css'
import {
  MENU_THEMES,
  MENU_TRACKS,
  readMenuThemeId,
  readMenuTrackId,
  setMenuThemeId,
  setMenuTrackId,
  SETTINGS_CHANGED_EVENT,
  type MenuThemeId,
  type MenuTrackId,
} from '../utils/userSettings'

type SettingsView = 'home' | 'theme' | 'music'

const UserSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void; hideTheme?: boolean }> = ({
  isOpen,
  onClose,
  hideTheme = false,
}) => {
  const [view, setView] = useState<SettingsView>('home')
  const [themeId, setThemeId] = useState<MenuThemeId>(() => readMenuThemeId())
  const [trackId, setTrackId] = useState<MenuTrackId>(() => readMenuTrackId())

  useEffect(() => {
    if (!isOpen) {
      setView('home')
      return
    }
    setView(hideTheme ? 'music' : 'home')
  }, [isOpen, hideTheme])

  useEffect(() => {
    const sync = () => {
      setThemeId(readMenuThemeId())
      setTrackId(readMenuTrackId())
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, sync)
  }, [])

  const close = useCallback(() => {
    setView('home')
    onClose()
  }, [onClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Настройки"
      subtitle={view === 'theme' ? 'Смена темы' : view === 'music' ? 'Смена музыки' : undefined}
      footer={
        view === 'home' || hideTheme ? (
          <Button name="Закрыть" size={380} onClick={close} />
        ) : (
          <Button name="Назад" size={380} onClick={() => setView('home')} />
        )
      }
    >
      <div className={styles.actions}>
        {view === 'home' && !hideTheme ? (
          <>
            <Button name="Смена темы" size={380} onClick={() => setView('theme')} />
            <Button name="Смена музыки" size={380} onClick={() => setView('music')} />
          </>
        ) : null}
        {view === 'theme' && !hideTheme
          ? MENU_THEMES.map((row) => (
              <Button
                key={row.id}
                name={row.id === themeId ? `${row.label} · выбрано` : row.label}
                size={380}
                onClick={() => setMenuThemeId(row.id)}
              />
            ))
          : null}
        {view === 'music'
          ? MENU_TRACKS.map((row) => (
              <Button
                key={row.id}
                name={row.id === trackId ? `${row.label} · выбрано` : row.label}
                size={380}
                onClick={() => setMenuTrackId(row.id)}
              />
            ))
          : null}
      </div>
    </Modal>
  )
}

export default UserSettingsModal
