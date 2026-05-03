import { useEffect, useLayoutEffect, useState } from 'react';
import type React from 'react';

export function useBattleViewState(params: {
  mapWrapRef: React.RefObject<HTMLDivElement | null>;
  battleMapLoad: 'loading' | 'ready';
  hasGrid: boolean;
  orderPick: unknown;
  leftMenu: unknown;
  centerModal: unknown;
  battleEndedOverlay: boolean;
  battleAmmoModal: unknown;
  unloadCargoPickModal: unknown;
  battleRef: React.RefObject<HTMLDivElement | null>;
  dismissOrderPicking: () => void;
}) {
  const {
    mapWrapRef,
    battleMapLoad,
    hasGrid,
    orderPick,
    leftMenu,
    centerModal,
    battleEndedOverlay,
    battleAmmoModal,
    unloadCargoPickModal,
    battleRef,
    dismissOrderPicking,
  } = params;

  const [mapViewport, setMapViewport] = useState({ w: 1000, h: 600 });

  useLayoutEffect(() => {
    const el = mapWrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setMapViewport({
        w: Math.max(160, Math.floor(r.width)),
        h: Math.max(160, Math.floor(r.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapWrapRef, battleMapLoad, hasGrid]);

  useEffect(() => {
    if (!orderPick) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (leftMenu || centerModal || battleEndedOverlay) return;
      if (battleAmmoModal || unloadCargoPickModal) return;
      const battleEl = battleRef.current;
      if (battleEl?.contains(t)) return;
      dismissOrderPicking();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [
    orderPick,
    dismissOrderPicking,
    leftMenu,
    centerModal,
    battleEndedOverlay,
    battleAmmoModal,
    unloadCargoPickModal,
    battleRef,
  ]);

  return { mapViewport };
}
