import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { menuTrackSrc, SETTINGS_CHANGED_EVENT } from '../utils/userSettings'

const MenuMusic: React.FC = () => {
  const { pathname } = useLocation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const unlockRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.loop = true
    audio.volume = 0.35
    audio.preload = 'auto'
    audioRef.current = audio

    const dropUnlock = () => {
      if (!unlockRef.current) return
      document.removeEventListener('pointerdown', unlockRef.current)
      unlockRef.current = null
    }

    const waitUnlock = () => {
      if (unlockRef.current) return
      const onFirst = () => {
        dropUnlock()
        void audio.play().catch(() => undefined)
      }
      unlockRef.current = onFirst
      document.addEventListener('pointerdown', onFirst, { once: true })
    }

    const apply = () => {
      const src = pathname === '/battle' ? null : menuTrackSrc()
      if (!src) {
        dropUnlock()
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        return
      }
      const abs = new URL(src, window.location.href).href
      if (audio.src !== abs) {
        audio.src = src
      }
      const play = audio.play()
      if (play && typeof play.catch === 'function') {
        play.catch(() => waitUnlock())
      }
    }

    apply()
    window.addEventListener(SETTINGS_CHANGED_EVENT, apply)
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, apply)
      dropUnlock()
      audio.pause()
      audio.removeAttribute('src')
      audioRef.current = null
    }
  }, [pathname])

  return null
}

export default MenuMusic
