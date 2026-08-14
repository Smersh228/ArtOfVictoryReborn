import { Cell } from '../../../server/src/game/gameLogic/cells/cell';

function hexCorners(cx: number, cy: number, cellSize: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 * Math.PI) / 180;
    corners.push({
      x: cx + cellSize * Math.cos(angle),
      y: cy + cellSize * Math.sin(angle),
    });
  }
  return corners;
}


export function computeBattleCellSize(cells: Cell[], W: number, H: number, pad: number): number {
  if (cells.length === 0 || W < 80 || H < 80) return 36;

  const qrs = cells.map((c) => ({ q: c.coor.x, r: c.coor.z }));

  const fits = (S: number) => {
    for (const { q, r } of qrs) {
      const cx = S * 1.5 * q + W / 2;
      const cy = S * (1.732 * r + 0.866 * q) + H / 2;
      for (const p of hexCorners(cx, cy, S)) {
        if (p.x < pad || p.x > W - pad || p.y < pad || p.y > H - pad) return false;
      }
    }
    return true;
  };

  let lo = 4;
  let hi = Math.min(W, H);
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.max(6, Math.floor(lo * 0.995));
}
