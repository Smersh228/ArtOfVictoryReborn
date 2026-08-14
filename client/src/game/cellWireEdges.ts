import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { ensureCellBuilds } from './editorMapFortifications';
import wireBottomImg from '../img/build/wire/provolka_bottom.png';

/** Углы середин рёбер гекса (pointy-top, 0° — восток). */
export const HEX_EDGE_MID_DEG = [30, 90, 150, 210, 270, 330] as const;

/** Единственный спрайт проволоки (горизонтальная полоса внизу PNG). */
export const WIRE_SPRITE_URL = wireBottomImg;

/** Доля высоты PNG с проволокой (полоса снизу). */
export const WIRE_DRAW_BAND_RATIO = 0.24;

const CUBE_NEIGHBOR_DIRS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

/** Визуальный индекс грани (редактор/отрисовка) ↔ индекс направления соседа (движение). */
export function moveDirToVisualEdge(moveDir: number): number {
  if (moveDir <= 0) return 0;
  if (moveDir >= 6) return 0;
  return moveDir === 3 ? 3 : 6 - moveDir;
}

export function visualEdgeToMoveDir(visualEdge: number): number {
  return moveDirToVisualEdge(visualEdge);
}

export function getWireEdgesMask(builds: IBuildCell | undefined | null): number {
  const b = ensureCellBuilds(builds);
  const raw = (b as { wireEdges?: unknown }).wireEdges;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0) return n & 0x3f;
  const legacy = b.wire;
  const lt = typeof legacy === 'number' ? legacy : Number(legacy);
  if (Number.isFinite(lt) && lt > 0) return 0x3f;
  return 0;
}

export function hasWireOnCell(builds: IBuildCell | undefined | null): boolean {
  return getWireEdgesMask(builds) !== 0;
}

export function hasWireOnEdge(builds: IBuildCell | undefined | null, edgeDir: number): boolean {
  if (edgeDir < 0 || edgeDir > 5) return false;
  return (getWireEdgesMask(builds) & (1 << edgeDir)) !== 0;
}

/** Проволока на грани при шаге в направлении соседа `moveDir` (кубические координаты). */
export function hasWireOnMoveDir(builds: IBuildCell | undefined | null, moveDir: number): boolean {
  return hasWireOnEdge(builds, moveDirToVisualEdge(moveDir));
}

export function toggleWireEdgeOnBuilds(builds: IBuildCell | undefined | null, edgeDir: number): IBuildCell {
  const base = ensureCellBuilds(builds);
  if (edgeDir < 0 || edgeDir > 5) return base;
  const mask = getWireEdgesMask(base);
  const bit = 1 << edgeDir;
  return { ...base, wireEdges: (mask ^ bit) & 0x3f, wire: 0 };
}

export function clearAllWireOnBuilds(builds: IBuildCell | undefined | null): IBuildCell {
  return { ...ensureCellBuilds(builds), wireEdges: 0, wire: 0 };
}

export function clearWireEdgeOnBuilds(builds: IBuildCell | undefined | null, edgeDir: number): IBuildCell {
  const base = ensureCellBuilds(builds);
  if (edgeDir < 0 || edgeDir > 5) return base;
  return { ...base, wireEdges: getWireEdgesMask(base) & ~(1 << edgeDir), wire: 0 };
}

export function edgeIndexFromPoint(
  centerX: number,
  centerY: number,
  pointX: number,
  pointY: number,
): number {
  const deg = ((Math.atan2(pointY - centerY, pointX - centerX) * 180) / Math.PI + 360) % 360;
  let best = 0;
  let bestDiff = 360;
  for (let i = 0; i < 6; i++) {
    let diff = Math.abs(deg - HEX_EDGE_MID_DEG[i]);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export function findMoveDir(fromCell: Cell, toCell: Cell): number {
  for (let dir = 0; dir < 6; dir++) {
    const d = CUBE_NEIGHBOR_DIRS[dir];
    const nx = fromCell.coor.x + d.x;
    const ny = fromCell.coor.y + d.y;
    const nz = fromCell.coor.z + d.z;
    if (nx === toCell.coor.x && ny === toCell.coor.y && nz === toCell.coor.z) return dir;
  }
  return -1;
}

export function isGroundUnitType(type: string): boolean {
  const t = String(type || '').trim();
  return t !== 'lightAir' && t !== 'heavyAir';
}

export function unitHasPropKey(unit: { properties?: unknown }, key: string): boolean {
  const props = unit.properties;
  if (!Array.isArray(props)) return false;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p && typeof p === 'object' && (p as { prop_key?: string }).prop_key === key) return true;
  }
  return false;
}

/** Пехота и техника не проходят через сторону с проволокой (если нет «Прорыв…»). */
export function wireBlocksGroundMove(
  fromCell: Cell,
  toCell: Cell,
  unit: { type?: string; properties?: unknown },
): boolean {
  if (!isGroundUnitType(String(unit.type || ''))) return false;
  const dir = findMoveDir(fromCell, toCell);
  if (dir < 0) return false;
  const oppDir = (dir + 3) % 6;
  const blockedExit = hasWireOnMoveDir(fromCell.builds, dir);
  const blockedEntry = hasWireOnMoveDir(toCell.builds, oppDir);
  if (!blockedExit && !blockedEntry) return false;
  if (unitHasPropKey(unit, 'breakingThroughBarbedWire')) return false;
  return true;
}

/** Прорыв: снять проволку с ребра при проходе. */
export function applyWireBreakthroughOnStep(
  fromCell: Cell,
  toCell: Cell,
  unit: { type?: string; properties?: unknown },
): void {
  if (!unitHasPropKey(unit, 'breakingThroughBarbedWire')) return;
  const dir = findMoveDir(fromCell, toCell);
  if (dir < 0) return;
  const oppDir = (dir + 3) % 6;
  if (hasWireOnMoveDir(fromCell.builds, dir)) {
    fromCell.builds = clearWireEdgeOnBuilds(fromCell.builds, moveDirToVisualEdge(dir));
  }
  if (hasWireOnMoveDir(toCell.builds, oppDir)) {
    toCell.builds = clearWireEdgeOnBuilds(toCell.builds, moveDirToVisualEdge(oppDir));
  }
}

export function adjacentCellsWithWire(fromCell: Cell, allCells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (let dir = 0; dir < 6; dir++) {
    const d = CUBE_NEIGHBOR_DIRS[dir];
    const nb = allCells.find(
      (c) =>
        c.coor.x === fromCell.coor.x + d.x &&
        c.coor.y === fromCell.coor.y + d.y &&
        c.coor.z === fromCell.coor.z + d.z,
    );
    if (!nb) continue;
    const oppDir = (dir + 3) % 6;
    if (hasWireOnMoveDir(fromCell.builds, dir) || hasWireOnMoveDir(nb.builds, oppDir)) {
      out.push(nb);
    }
  }
  return out;
}
