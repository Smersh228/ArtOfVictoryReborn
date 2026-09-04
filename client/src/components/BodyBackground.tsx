import React, { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { menuThemeImage, SETTINGS_CHANGED_EVENT } from '../utils/userSettings';


const BodyBackground: React.FC = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (pathname === '/battle') {
      return;
    }
    const apply = () => {
      document.body.style.backgroundImage = `url(${menuThemeImage()})`;
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
    };
    apply();
    window.addEventListener(SETTINGS_CHANGED_EVENT, apply);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, apply);
  }, [pathname]);

  return null;
};

export default BodyBackground;
