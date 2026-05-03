import type { Cell } from '../../../server/src/game/gameLogic/cells/cell';
import type { BattleDefendHoverState, BattleReportReplayHighlight } from '../components/map/Cells';
import { findUnitCellByInstanceId } from '../game/battleMovePreview';

export function buildBattleReportReplayHighlight(replay: any): BattleReportReplayHighlight | null {
  const r: any = replay;
  if (!r) return null;
  if (r.kind === 'unitGlow') {
    const ids = (r.instanceIds as number[] | undefined)?.filter((x: number) => Number.isFinite(x) && x > 0) ?? [];
    const cid = Number((r as { lossCellId?: unknown }).lossCellId);
    return ids.length
      ? {
          glowInstanceIds: ids,
          lossCellId: Number.isFinite(cid) ? cid : undefined,
        }
      : null;
  }
  if (r.kind === 'loss') {
    const uid = Number(r.unitInstanceId);
    const cid = Number(r.lossCellId);
    const glowIds = Number.isFinite(uid) && uid > 0 ? [uid] : [];
    return {
      glowInstanceIds: glowIds,
      lossCellId: Number.isFinite(cid) ? cid : undefined,
    };
  }
  if (r.kind === 'sectorOrder') {
    const unitId = Number(r.unitInstanceId);
    return Number.isFinite(unitId) && unitId > 0 ? { glowInstanceIds: [unitId] } : null;
  }
  if (r.kind === 'move') {
    const mid = r.moverInstanceId as number | undefined;
    return mid != null && Number.isFinite(mid) ? { glowInstanceIds: [mid] } : null;
  }
  if (r.kind === 'fire') {
    const shooters = Array.isArray(r.shooterInstanceIds)
      ? r.shooterInstanceIds.filter((x: number) => Number.isFinite(x) && x > 0)
      : [];
    const area = r.areaTargetInstanceIds as number[] | undefined;
    const single = r.targetInstanceId as number | undefined;
    const targetIds = area?.length ? area : single != null && Number.isFinite(single) ? [single] : [];
    const glow: number[] = [
      ...new Set(
        [...(shooters.length ? shooters : [r.shooterInstanceId as number]), ...targetIds].filter(
          (x: number) => Number.isFinite(x) && x > 0,
        ),
      ),
    ];
    return {
      glowInstanceIds: glow,
      lossCellId: r.targetCellId != null && Number.isFinite(Number(r.targetCellId)) ? Number(r.targetCellId) : undefined,
      targetDecal:
        targetIds.length > 0 ? { orderKey: r.orderKey as 'fire' | 'fireHard', targetInstanceIds: targetIds } : undefined,
    };
  }
  if (r.kind === 'attack') {
    return {
      glowInstanceIds: [r.attackerInstanceId as number, r.targetInstanceId as number],
      targetDecal: { orderKey: 'attack' as const, targetInstanceIds: [r.targetInstanceId as number] },
    };
  }
  if (r.kind === 'logistics') {
    const glow = [r.fromInstanceId, r.toInstanceId].filter(
      (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0,
    );
    const ids = glow.length ? glow : [r.toInstanceId as number];
    if (r.orderKey === 'unloading' && r.toCellId != null && Number.isFinite(r.toCellId)) {
      return { glowInstanceIds: ids, unloadCellDecalId: r.toCellId as number };
    }
    const recipientDecalId =
      r.orderKey === 'getSup' ? (r.toInstanceId as number) : (r.fromInstanceId ?? r.toInstanceId) as number;
    const ok = r.orderKey === 'tow' ? 'tow' : r.orderKey === 'loading' ? 'loading' : 'getSup';
    return {
      glowInstanceIds: ids,
      targetDecal: { orderKey: ok, targetInstanceIds: [recipientDecalId] },
    };
  }
  return null;
}

export function buildBattleReportSectorHover(replay: any, cells: Cell[]): BattleDefendHoverState | null {
  const r: any = replay;
  if (!r || r.kind !== 'sectorOrder') return null;
  const unitInstanceId = Number(r.unitInstanceId);
  const facingCellId = Number(r.facingCellId);
  if (!Number.isFinite(unitInstanceId) || !Number.isFinite(facingCellId)) return null;
  const sectorCellIds = Array.isArray(r.sectorCellIds)
    ? r.sectorCellIds.map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x))
    : [];
  const live = findUnitCellByInstanceId(cells, unitInstanceId);
  const facingDecal: BattleDefendHoverState['facingDecal'] =
    r.variant === 'artilleryDeploy' ? 'deploy' : r.variant === 'artilleryChangeSector' ? 'changeSector' : undefined;
  return {
    unitInstanceId,
    facingCellId,
    sectorCellIds,
    defendKind: r.variant === 'ambush' ? 'ambush' : 'defend',
    facingDecal,
    unitStandingCellId: live?.cell?.id,
    showSectorWithoutUnitHover: true,
  };
}
