import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';

function clampFixedPopup(
  clientX: number,
  clientY: number,
  el: HTMLElement | null,
  offsetX: number,
  offsetY: number,
): { left: number; top: number } {
  const pad = 8;
  const w = el?.offsetWidth ?? 220;
  const h = el?.offsetHeight ?? 280;
  let left = clientX + offsetX;
  let top = clientY + offsetY;
  if (left + w > window.innerWidth - pad) {
    left = window.innerWidth - w - pad;
  }
  if (top + h > window.innerHeight - pad) {
    top = clientY - h - offsetY;
  }
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  if (left + w > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - w - pad);
  }
  if (top + h > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - h - pad);
  }
  return { left, top };
}

export function useBattleHudLayout(params: {
  battleRef: React.RefObject<HTMLDivElement | null>;
  battleUnitTip: { clientX: number; clientY: number } | null;
  battleUnitOrders: { clientX: number; clientY: number } | null;
  setBattleUnitOrders: React.Dispatch<React.SetStateAction<any>>;
  leftMenu: unknown;
  centerModal: unknown;
  battleEndedOverlay: boolean;
  panelMarginLeft: number;
  gapBeforeBattle: number;
  minSidePanelWidth: number;
}) {
  const {
    battleRef,
    battleUnitTip,
    battleUnitOrders,
    setBattleUnitOrders,
    leftMenu,
    centerModal,
    battleEndedOverlay,
    panelMarginLeft,
    gapBeforeBattle,
    minSidePanelWidth,
  } = params;

  const battleOrdersRef = useRef<HTMLDivElement | null>(null);
  const battleTipRef = useRef<HTMLDivElement | null>(null);
  const [battleTipPos, setBattleTipPos] = useState({ left: 0, top: 0 });
  const [battleOrdersPos, setBattleOrdersPos] = useState({ left: 0, top: 0 });
  const [battleChrome, setBattleChrome] = useState<{ top: number; left: number; height: number } | null>(null);

  useEffect(() => {
    if (!battleUnitOrders) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = battleOrdersRef.current;
      if (el?.contains(e.target as Node)) return;
      setBattleUnitOrders(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [battleUnitOrders, setBattleUnitOrders]);

  useLayoutEffect(() => {
    if (!battleUnitTip || battleUnitOrders) return;
    setBattleTipPos(clampFixedPopup(battleUnitTip.clientX, battleUnitTip.clientY, battleTipRef.current, 14, 14));
  }, [battleUnitTip, battleUnitOrders]);

  useLayoutEffect(() => {
    if (!battleUnitOrders) return;
    setBattleOrdersPos(
      clampFixedPopup(
        battleUnitOrders.clientX,
        battleUnitOrders.clientY,
        battleOrdersRef.current,
        6,
        6,
      ),
    );
  }, [battleUnitOrders]);

  useEffect(() => {
    if (!battleUnitTip || battleUnitOrders) return;
    const onResize = () => {
      setBattleTipPos(clampFixedPopup(battleUnitTip.clientX, battleUnitTip.clientY, battleTipRef.current, 14, 14));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [battleUnitTip, battleUnitOrders]);

  useEffect(() => {
    if (!battleUnitOrders) return;
    const o = battleUnitOrders;
    const onResize = () => {
      setBattleOrdersPos(clampFixedPopup(o.clientX, o.clientY, battleOrdersRef.current, 6, 6));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [battleUnitOrders]);

  const syncBattleChrome = useCallback(() => {
    const el = battleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBattleChrome({ top: r.top, left: r.left, height: r.height });
  }, [battleRef]);

  useLayoutEffect(() => {
    syncBattleChrome();
    const el = battleRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncBattleChrome);
    ro.observe(el);
    window.addEventListener('resize', syncBattleChrome);
    window.addEventListener('scroll', syncBattleChrome, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncBattleChrome);
      window.removeEventListener('scroll', syncBattleChrome, true);
    };
  }, [battleRef, syncBattleChrome]);

  useEffect(() => {
    if (leftMenu || centerModal || battleEndedOverlay) syncBattleChrome();
  }, [leftMenu, centerModal, battleEndedOverlay, syncBattleChrome]);

  const rawSidePanelWidth = battleChrome ? battleChrome.left - panelMarginLeft - gapBeforeBattle : 0;
  const standardPanelStyle: React.CSSProperties | undefined =
    battleChrome && leftMenu && rawSidePanelWidth >= minSidePanelWidth
      ? {
          left: panelMarginLeft,
          top: battleChrome.top,
          width: rawSidePanelWidth,
          height: battleChrome.height,
          transform: 'none',
          maxHeight: 'none',
        }
      : undefined;

  return {
    battleOrdersRef,
    battleTipRef,
    battleTipPos,
    battleOrdersPos,
    standardPanelStyle,
  };
}
