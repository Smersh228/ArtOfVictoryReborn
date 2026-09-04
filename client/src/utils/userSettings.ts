import briefSovUrl from '../img/backgrondImage/briefSov.ogg'
import briefWerUrl from '../img/backgrondImage/briefWer.ogg'
import sovTopicUrl from '../img/backgrondImage/Menu.jpg'
import werTopicUrl from '../img/backgrondImage/menu2.jpg'

export const SETTINGS_CHANGED_EVENT = 'aov-settings-changed'

const THEME_KEY = 'aov-theme'
const MUSIC_KEY = 'aov-music'

export const MENU_THEMES = [
  { id: 'sov', label: 'РККА', image: sovTopicUrl },
  { id: 'wer', label: 'Вермахт', image: werTopicUrl },
] as const

export const MENU_TRACKS = [
  { id: 'off', label: 'Без музыки', src: null },
  { id: 'sov', label: 'РККА', src: briefSovUrl },
  { id: 'wer', label: 'Вермахт', src: briefWerUrl },
] as const

export type MenuThemeId = (typeof MENU_THEMES)[number]['id']
export type MenuTrackId = (typeof MENU_TRACKS)[number]['id']

function emitChanged() {
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
}

function readStored(key: string): string {
  try {
    return String(localStorage.getItem(key) || '').trim()
  } catch {
    return ''
  }
}

export function readMenuThemeId(): MenuThemeId {
  const raw = readStored(THEME_KEY)
  return MENU_THEMES.some((row) => row.id === raw) ? (raw as MenuThemeId) : 'sov'
}

export function menuThemeImage(id: MenuThemeId = readMenuThemeId()): string {
  return MENU_THEMES.find((row) => row.id === id)?.image ?? sovTopicUrl
}

export function setMenuThemeId(id: MenuThemeId) {
  try {
    localStorage.setItem(THEME_KEY, id)
  } catch {
    /* ignore */
  }
  emitChanged()
}

export function readMenuTrackId(): MenuTrackId {
  const raw = readStored(MUSIC_KEY)
  return MENU_TRACKS.some((row) => row.id === raw) ? (raw as MenuTrackId) : 'off'
}

export function menuTrackSrc(id: MenuTrackId = readMenuTrackId()): string | null {
  return MENU_TRACKS.find((row) => row.id === id)?.src ?? null
}

export function setMenuTrackId(id: MenuTrackId) {
  try {
    localStorage.setItem(MUSIC_KEY, id)
  } catch {
    /* ignore */
  }
  emitChanged()
}
