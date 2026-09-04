import type { Cell, IBuildCell } from '../../../server/src/game/gameLogic/cells/cell';
import { ensureCellBuilds } from './editorMapFortifications';

export const PONTON_COMPLETE_SECTIONS = 4;

function hexDistCellsLocal(a: Cell, b: Cell): number {
  const ax = Number(a.coor?.x);
  const az = Number(a.coor?.z);
  const bx = Number(b.coor?.x);
  const bz = Number(b.coor?.z);
  const dq = ax - bx;
  const dr = az - bz;
  const axial = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  const ay = Number(a.coor?.y);
  const by = Number(b.coor?.y);
  if (Number.isFinite(ay) && Number.isFinite(by)) {
    const cube = Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
    return Math.min(cube, axial);
  }
  return axial;
}

function hexExtraOf(cell: Cell | null | undefined): Record<string, unknown> | null {
  const ex = cell && (cell as { hexExtra?: unknown }).hexExtra;
  return ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null;
}

export function pontonSections(builds: IBuildCell | undefined | null): number {
  return Math.max(0, Math.floor(Number(ensureCellBuilds(builds).pontonBridge) || 0));
}

export function isPontonBuilding(builds: IBuildCell | undefined | null): boolean {
  const b = ensureCellBuilds(builds);
  const n = pontonSections(b);
  return Boolean((b as { pontonBuilding?: boolean }).pontonBuilding) && n > 0 && n < PONTON_COMPLETE_SECTIONS;
}

export function isPontonComplete(builds: IBuildCell | undefined | null): boolean {
  const n = pontonSections(builds);
  if (n <= 0) return false;
  if (n >= PONTON_COMPLETE_SECTIONS) return true;
  return !Boolean((ensureCellBuilds(builds) as { pontonBuilding?: boolean }).pontonBuilding);
}

export function hasPontonOnCell(builds: IBuildCell | undefined | null): boolean {
  return pontonSections(builds) > 0;
}

export function pontonDrawOpacity(builds: IBuildCell | undefined | null): number {
  if (isPontonComplete(builds)) return 1;
  const s = pontonSections(builds);
  return Math.max(0.35, Math.min(0.95, 0.25 + s * 0.18));
}

/** Индекс стадии спрайта: 0 = ponton, 1 = ponton1, 2 = ponton2, 3 = pontonReady. */
export function pontonStageIndex(builds: IBuildCell | undefined | null): number {
  if (isPontonComplete(builds)) return PONTON_COMPLETE_SECTIONS - 1;
  const s = pontonSections(builds);
  if (s <= 0) return 0;
  return Math.min(PONTON_COMPLETE_SECTIONS, s) - 1;
}

export function isRiverCell(cell: Cell | null | undefined): boolean {
  if (!cell) return false;
  const ex = hexExtraOf(cell);
  if (ex) {
    if (ex.moveWithRiverProp === true) return true;
    if (ex.isRiver === true || ex.river === true) return true;
    const cat = String(ex.category || '')
      .trim()
      .toLowerCase();
    if (cat === 'rivers' || cat === 'river' || cat === 'water' || cat === 'waters') return true;
    const plc = ex.placementAllowed;
    if (plc && typeof plc === 'object' && (plc as { pontonBridge?: unknown }).pontonBridge === true) {
      return true;
    }
  }
  const rawType = String(cell.type || '').trim();
  const t = rawType.toLowerCase().replace(/[\s_-]/g, '');
  if (t === 'river' || t === 'rivers' || t === 'water') return true;
  if (!/^hex\d+$/.test(t) && /river|water/.test(t)) return true;
  const name = String((cell as { name?: string }).name || (ex && (ex.name || ex.label)) || '');
  const img = String(
    (cell as { img?: string }).img ||
      (cell as { imagePath?: string }).imagePath ||
      (ex && (ex.image_path || ex.img || ex.imagePath)) ||
      '',
  );
  const blob = `${rawType} ${name} ${img}`;
  if (
    /река|руч(?:ей|ья|ью)?|канал|речн|водн|брод|river|water|ford/i.test(blob) &&
    !/озер|озёр|болот|swamp|marsh|lake/i.test(blob)
  ) {
    return true;
  }
  return false;
}

export function cellsEligibleForPonton(fromCell: Cell, allCells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const c of allCells) {
    if (hexDistCellsLocal(fromCell, c) > 1) continue;
    if (!isRiverCell(c) || isPontonComplete(c.builds)) continue;
    out.push(c);
  }
  return out;
}
