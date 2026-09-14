import { useEffect, useState } from 'react';

const TOUCH_UI_QUERY = '(hover: none) and (pointer: coarse), (max-width: 700px)';

export function isBattleTouchUi(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(TOUCH_UI_QUERY).matches;
}

/** Телефон / тач: нет устойчивого hover, осмотр — зажатием пальца. */
export function useBattleTouchUi(): boolean {
  const [touchUi, setTouchUi] = useState(isBattleTouchUi);
  useEffect(() => {
    const mq = window.matchMedia(TOUCH_UI_QUERY);
    const sync = () => setTouchUi(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return touchUi;
}
