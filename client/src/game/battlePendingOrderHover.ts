import type { BattleHqRevealedOrder, BattleOrderPayload, LobbyFaction } from '../api/rooms';
import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import { findUnitCellByInstanceId } from './battleMovePreview';
import { computeReactiveDaisyCellIds, hexDistCells } from './battleFirePreview';

export type BattlePendingOrderHover = {
  orderKey: string;
  areaCellIds?: number[];
  areaCenterCellId?: number;
  iconCellIds?: number[];
  iconUnitInstanceIds?: number[];
  /** Иконка лечения на пациенте при наведении на санитара. */
  medicalIconUnitInstanceIds?: number[];
};

function idInList(ids: Iterable<number> | null | undefined, cellId: number): boolean {
  if (!ids) return false;
  for (const id of ids) {
    if (Number(id) === Number(cellId)) return true;
  }
  return false;
}

export function computeHexDaisyCellIds(center: Cell, cells: Cell[]): number[] {
  return computeReactiveDaisyCellIds(center, cells);
}

function isFireOrderKey(key: string): boolean {
  return key === 'fire' || key === 'fireHard';
}

function isMeleeAttackOrderKey(key: string): boolean {
  return key === 'attack' || key === 'hardMove';
}

function sapperHexOrderKey(key: string): boolean {
  return (
    key === 'cutWire' ||
    key === 'cutEj' ||
    key === 'buildPonton' ||
    key === 'demining' ||
    key === 'explomost' ||
    key === 'demolition' ||
    key === 'repairRailway' ||
    key === 'arson'
  );
}

function fireTargetCell(p: BattleOrderPayload, cells: Cell[]): Cell | null {
  if (p.targetCellId != null && Number.isFinite(Number(p.targetCellId))) {
    return cells.find((c) => Number(c.id) === Number(p.targetCellId)) ?? null;
  }
  if (p.targetUnitInstanceId != null && Number.isFinite(Number(p.targetUnitInstanceId))) {
    return findUnitCellByInstanceId(cells, Number(p.targetUnitInstanceId))?.cell ?? null;
  }
  return null;
}

function fireHoverPreview(p: BattleOrderPayload, cells: Cell[]): BattlePendingOrderHover | null {
  const key = String(p.orderKey || '').trim();
  const center = fireTargetCell(p, cells);
  if (!center) return null;
  if (p.useReactiveFire) {
    const daisy = computeHexDaisyCellIds(center, cells);
    return {
      orderKey: key,
      areaCellIds: daisy,
      areaCenterCellId: center.id,
      iconCellIds: [center.id],
    };
  }
  return { orderKey: key, iconCellIds: [center.id] };
}

function finiteNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function revealedOrderToPayload(row: BattleHqRevealedOrder): BattleOrderPayload {
  return {
    unitInstanceId: Number(row.unitInstanceId),
    orderKey: String(row.orderKey || '').trim() || 'none',
    targetUnitInstanceId: finiteNum(row.targetUnitInstanceId),
    targetCellId: finiteNum(row.targetCellId),
    reconRangeSteps: finiteNum(row.reconRangeSteps),
    defendFacingCellId: finiteNum(row.defendFacingCellId),
    defendMaxRangeSteps: finiteNum(row.defendMaxRangeSteps),
    flightPathCellIds: Array.isArray(row.flightPathCellIds) ? row.flightPathCellIds.map(Number) : undefined,
    useReactiveFire: row.useReactiveFire,
    bombardmentDirectionCellId: finiteNum(row.bombardmentDirectionCellId),
    bombardmentAreaCellIds: Array.isArray(row.bombardmentAreaCellIds)
      ? row.bombardmentAreaCellIds.map(Number)
      : undefined,
    patrolRangeSteps: finiteNum(row.patrolRangeSteps),
    trenchEdgeDir: finiteNum(row.trenchEdgeDir),
    wireEdgeDir: finiteNum(row.wireEdgeDir),
  };
}

export function resolveHoveredBattleOrder(args: {
  instanceId: number | null | undefined;
  tipUnit: Record<string, unknown> | null | undefined;
  myBattleFaction: LobbyFaction;
  unitIsMineOnMap: (unit: Record<string, unknown>, viewerFaction: LobbyFaction) => boolean;
  pendingOrders: BattleOrderPayload[];
  hqRevealedOrders?: BattleHqRevealedOrder[] | null;
}): BattleOrderPayload | null {
  const iid = Number(args.instanceId);
  if (!Number.isFinite(iid)) return null;
  const mine = !!(args.tipUnit && args.unitIsMineOnMap(args.tipUnit, args.myBattleFaction));
  if (mine) {
    return args.pendingOrders.find((x) => Number(x.unitInstanceId) === iid) ?? null;
  }
  const row = (args.hqRevealedOrders || []).find((x) => Number(x.unitInstanceId) === iid);
  return row ? revealedOrderToPayload(row) : null;
}

function hoverFromOrder(p: BattleOrderPayload, cells: Cell[], unitInstanceId: number): BattlePendingOrderHover | null {
  const key = String(p.orderKey || '').trim();
  if (!key || key === 'none' || key === 'smoke') return null;
  const iconUnitInstanceIds = [unitInstanceId];
  if (isFireOrderKey(key)) {
    const preview = fireHoverPreview(p, cells);
    if (preview) return { ...preview, iconUnitInstanceIds };
  }
  if (isMeleeAttackOrderKey(key) && p.targetUnitInstanceId != null && Number.isFinite(Number(p.targetUnitInstanceId))) {
    return { orderKey: key, iconUnitInstanceIds: [...iconUnitInstanceIds, Number(p.targetUnitInstanceId)] };
  }
  if (key === 'mining' || key === 'trenches') {
    return { orderKey: key, iconUnitInstanceIds };
  }
  if (sapperHexOrderKey(key) && p.targetCellId != null && Number.isFinite(Number(p.targetCellId))) {
    return { orderKey: key, iconCellIds: [Number(p.targetCellId)], iconUnitInstanceIds };
  }
  if (key === 'railLoading' && p.targetUnitInstanceId != null && Number.isFinite(Number(p.targetUnitInstanceId))) {
    return { orderKey: key, iconUnitInstanceIds: [...iconUnitInstanceIds, Number(p.targetUnitInstanceId)] };
  }
  if (key === 'railUnloading' && p.targetCellId != null && Number.isFinite(Number(p.targetCellId))) {
    return { orderKey: key, iconCellIds: [Number(p.targetCellId)], iconUnitInstanceIds };
  }
  if ((key === 'move' || key === 'moveWar' || key === 'fireMove') && p.targetCellId != null && Number.isFinite(Number(p.targetCellId))) {
    return { orderKey: key, iconCellIds: [Number(p.targetCellId)], iconUnitInstanceIds };
  }
  if (Array.isArray(p.flightPathCellIds) && p.flightPathCellIds.length) {
    return { orderKey: key, iconCellIds: p.flightPathCellIds.map(Number), iconUnitInstanceIds };
  }
  if (p.targetCellId != null && Number.isFinite(Number(p.targetCellId))) {
    return { orderKey: key, iconCellIds: [Number(p.targetCellId)], iconUnitInstanceIds };
  }
  return { orderKey: key, iconUnitInstanceIds };
}

export function computeBattlePendingOrderHover(args: {
  cells: Cell[];
  pendingOrders: BattleOrderPayload[];
  battleUnitTip: { unit?: Record<string, unknown> } | null;
  battleUnitOrders: unknown;
  myBattleFaction: LobbyFaction;
  unitIsMineOnMap: (unit: Record<string, unknown>, viewerFaction: LobbyFaction) => boolean;
  orderPick: {
    orderKey?: string;
    useReactiveFire?: boolean;
    fireModeStep?: string;
    unloadCargoInstanceId?: number;
    unit?: { instanceId?: unknown };
  } | null;
  battleHoverCellId: number | null;
  battleAreaFireCellIds: Iterable<number> | null | undefined;
  battleFireTargetInstanceIds: Iterable<number> | null | undefined;
  hqRevealedOrders?: BattleHqRevealedOrder[] | null;
  hqListHoverInstanceId?: number | null;
}): BattlePendingOrderHover | null {
  const {
    cells,
    pendingOrders,
    battleUnitTip,
    battleUnitOrders,
    myBattleFaction,
    unitIsMineOnMap,
    orderPick,
    battleHoverCellId,
    battleAreaFireCellIds,
    battleFireTargetInstanceIds,
    hqRevealedOrders,
    hqListHoverInstanceId,
  } = args;

  if (
    orderPick &&
    isFireOrderKey(String(orderPick.orderKey || '')) &&
    orderPick.fireModeStep !== 'mode' &&
    battleHoverCellId != null
  ) {
    const hover = cells.find((c) => Number(c.id) === Number(battleHoverCellId));
    if (hover) {
      const inArea = idInList(battleAreaFireCellIds, hover.id);
      const unitOnHoverIsTarget = (hover.units || []).some((raw) => {
        const iid = Number((raw as { instanceId?: unknown }).instanceId);
        return Number.isFinite(iid) && idInList(battleFireTargetInstanceIds, iid);
      });
      if (inArea || unitOnHoverIsTarget) {
        const key = String(orderPick.orderKey);
        if (orderPick.useReactiveFire) {
          const daisy = computeHexDaisyCellIds(hover, cells);
          return {
            orderKey: key,
            areaCellIds: daisy,
            areaCenterCellId: hover.id,
            iconCellIds: [hover.id],
          };
        }
        return { orderKey: key, iconCellIds: [hover.id] };
      }
    }
  }

  if (
    orderPick &&
    isMeleeAttackOrderKey(String(orderPick.orderKey || '')) &&
    battleHoverCellId != null
  ) {
    const hover = cells.find((c) => Number(c.id) === Number(battleHoverCellId));
    if (hover) {
      const ids: number[] = [];
      for (const raw of hover.units || []) {
        const iid = Number((raw as { instanceId?: unknown }).instanceId);
        if (Number.isFinite(iid) && idInList(battleFireTargetInstanceIds, iid)) ids.push(iid);
      }
      if (ids.length) {
        return { orderKey: String(orderPick.orderKey), iconUnitInstanceIds: ids };
      }
    }
  }

  if (orderPick && String(orderPick.orderKey || '').trim() === 'smoke') return null;
  if (battleUnitOrders) return null;

  const tipUnit = battleUnitTip?.unit ?? null;
  const medicalIds = medicalPatientIdsForHoveredMedic(cells, pendingOrders, tipUnit, myBattleFaction, unitIsMineOnMap);
  const withMedical = (hover: BattlePendingOrderHover | null): BattlePendingOrderHover | null => {
    if (!medicalIds.length) return hover;
    if (!hover) {
      return { orderKey: 'medical', iconUnitInstanceIds: medicalIds, medicalIconUnitInstanceIds: medicalIds };
    }
    return { ...hover, medicalIconUnitInstanceIds: medicalIds };
  };

  const hoverIid = Number(tipUnit?.instanceId);
  const listIid = Number(hqListHoverInstanceId);
  const iid = Number.isFinite(hoverIid) ? hoverIid : listIid;
  const liveForOrder =
    Number.isFinite(hoverIid) && tipUnit
      ? tipUnit
      : Number.isFinite(iid)
        ? (findUnitCellByInstanceId(cells, iid)?.unit as Record<string, unknown> | undefined) ?? null
        : null;
  const p = resolveHoveredBattleOrder({
    instanceId: iid,
    tipUnit: liveForOrder,
    myBattleFaction,
    unitIsMineOnMap,
    pendingOrders,
    hqRevealedOrders,
  });
  if (!p) return withMedical(null);
  if (String(p.orderKey || '').trim() === 'smoke' && p.targetCellId != null && Number.isFinite(Number(p.targetCellId))) {
    return withMedical({ orderKey: 'smoke', iconCellIds: [Number(p.targetCellId)], iconUnitInstanceIds: [iid] });
  }
  return withMedical(hoverFromOrder(p, cells, iid));
}

type MedicalTactical = {
  medicalJob?: { targetUnitInstanceId?: unknown };
  medicalAidFromInstanceId?: unknown;
};

function patientInMedicRange(cells: Cell[], medicInstanceId: number, patientInstanceId: number): boolean {
  if (patientInstanceId === medicInstanceId) return false;
  const medicLive = findUnitCellByInstanceId(cells, medicInstanceId);
  const tgtLive = findUnitCellByInstanceId(cells, patientInstanceId);
  if (!medicLive || !tgtLive) return false;
  return hexDistCells(medicLive.cell, tgtLive.cell) <= 1;
}

function medicalPatientIdsForHoveredMedic(
  cells: Cell[],
  pendingOrders: BattleOrderPayload[],
  tipUnit: Record<string, unknown> | null,
  myBattleFaction: LobbyFaction,
  unitIsMineOnMap: (unit: Record<string, unknown>, viewerFaction: LobbyFaction) => boolean,
): number[] {
  if (!tipUnit || !unitIsMineOnMap(tipUnit, myBattleFaction)) return [];
  const medicId = Number(tipUnit.instanceId);
  if (!Number.isFinite(medicId)) return [];
  const ids = new Set<number>();
  const addIfInRange = (tid: number) => {
    if (!Number.isFinite(tid) || tid === medicId) return;
    if (patientInMedicRange(cells, medicId, tid)) ids.add(tid);
  };

  for (const p of pendingOrders) {
    if (Number(p.unitInstanceId) !== medicId) continue;
    if (String(p.orderKey || '').trim() !== 'medical') continue;
    addIfInRange(Number(p.targetUnitInstanceId));
  }

  const medicLive = findUnitCellByInstanceId(cells, medicId);
  const jobTid = Number(
    (medicLive?.unit as { tactical?: MedicalTactical } | undefined)?.tactical?.medicalJob?.targetUnitInstanceId,
  );
  addIfInRange(jobTid);

  for (const cell of cells) {
    for (const raw of cell.units || []) {
      const u = raw as { instanceId?: unknown; tactical?: MedicalTactical };
      const iid = Number(u.instanceId);
      if (!Number.isFinite(iid) || iid === medicId) continue;
      if (Number(u.tactical?.medicalAidFromInstanceId) !== medicId) continue;
      addIfInRange(iid);
    }
  }

  return [...ids];
}
