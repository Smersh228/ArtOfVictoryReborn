import React, { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import menuBackgroundUrl from '../img/backgrondImage/Menu.jpg';


const BodyBackground: React.FC = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (pathname === '/battle') {
      return;
    }
    document.body.style.backgroundImage = `url(${menuBackgroundUrl})`;
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundRepeat = '';
    document.body.style.backgroundAttachment = '';
  }, [pathname]);

  return null;
};

export default BodyBackground;
