import { Cell } from '../../../../server/src/game/gameLogic/cells/cell'
import {
  battleFireTargetDropShadowFilter,
  battleHoverDropShadowFilter,
  battleLogisticsGoldDropShadowFilter,
  drawImageCoverInCircle,
  drawImageCoverInSquare,
  unitDrawSize,
  unitPositionsForDraw,
} from './cellsDrawBase'

interface CachedImageState {
  ready: HTMLImageElement | null
  pending: boolean
  noUrl: boolean
}

interface ShootDecalMap {
  fire?: HTMLImageElement
  fireHard?: HTMLImageElement
  attack?: HTMLImageElement
}

interface LogisticsDecalMap {
  tow?: HTMLImageElement
  loading?: HTMLImageElement
  getSup?: HTMLImageElement
}

function drawCircleDecal(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  x: number,
  y: number,
  r: number,
) {
  if (!img?.naturalWidth) return
  ctx.save()
  drawImageCoverInCircle(ctx, img, x, y, r)
  ctx.restore()
}

function getBattleFilter(params: {
  isFirePickTarget: boolean
  isLogisticsPickTarget: boolean
  isPendingLogisticsTarget: boolean
  battleHoverKind: 'ally' | 'enemy' | 'neutral' | null
}) {
  const { isFirePickTarget, isLogisticsPickTarget, isPendingLogisticsTarget, battleHoverKind } = params
  if (isFirePickTarget) return battleFireTargetDropShadowFilter()
  if (isLogisticsPickTarget || isPendingLogisticsTarget) return battleLogisticsGoldDropShadowFilter()
  if (battleHoverKind != null) return battleHoverDropShadowFilter(battleHoverKind)
  return 'none'
}

function getReportShootKey(brDecal: any, unitId: any) {
  if (!brDecal || unitId == null || !brDecal.targetInstanceIds.includes(unitId)) return null
  if (brDecal.orderKey === 'fire') return 'fire'
  if (brDecal.orderKey === 'fireHard') return 'fireHard'
  if (brDecal.orderKey === 'attack') return 'attack'
  return null
}

function getReportLogisticsKey(brDecal: any, unitId: any) {
  if (!brDecal || unitId == null || !brDecal.targetInstanceIds.includes(unitId)) return null
  if (brDecal.orderKey === 'tow') return 'tow'
  if (brDecal.orderKey === 'loading') return 'loading'
  if (brDecal.orderKey === 'getSup') return 'getSup'
  return null
}

function getPendingShootKey(pp: any, unitId: any) {
  if (!pp || !('targetInstanceId' in pp) || unitId == null || pp.targetInstanceId !== unitId) return null
  if (pp.orderKey === 'fire') return 'fire'
  if (pp.orderKey === 'fireHard') return 'fireHard'
  if (pp.orderKey === 'attack') return 'attack'
  return null
}

function getPendingLogisticsKey(plp: any, unitId: any) {
  if (!plp || unitId == null || plp.targetInstanceId !== unitId) return null
  if (plp.kind === 'tow') return 'tow'
  if (plp.kind === 'loading') return 'loading'
  if (plp.kind === 'getSup') return 'getSup'
  return null
}

export function drawUnitsOnCell(
  ctx: CanvasRenderingContext2D,
  params: {
    cell: Cell
    center: { x: number; y: number }
    cellSize: number
    lobbyPreview: boolean
    mode: 'editor' | 'battle'
    viewerBattleFaction: 'none' | 'rkka' | 'wehrmacht'
    hoveredUnit: { cell: Cell; unit: any; index: number } | null
    battleFireTargetInstanceIds: number[] | null
    battleLogisticsPickInstanceIds: number[] | null
    battlePendingLogisticsPreview: any
    battleReportReplayHighlight: any
    battlePendingShootPreview: any
    battleLogisticsUnitDecal: { orderKey: 'tow' | 'loading'; targetInstanceIds: number[] } | null
    battleDefendHover: any
    shootOrderDecalImgRef: React.MutableRefObject<ShootDecalMap>
    logisticsUnitDecalImgRef: React.MutableRefObject<LogisticsDecalMap>
    defendOrderDecalImgRef: React.MutableRefObject<HTMLImageElement | null>
    ambushOrderDecalImgRef: React.MutableRefObject<HTMLImageElement | null>
    fireSupIconImgRef: React.MutableRefObject<HTMLImageElement | null>
    resolveEditorCachedImage: (path: string | null | undefined) => CachedImageState
    isEnemyUnitHiddenByFog: (unit: { faction?: string }, cell: Cell) => boolean
  },
) {
  const {
    cell,
    center,
    cellSize,
    lobbyPreview,
    mode,
    viewerBattleFaction,
    hoveredUnit,
    battleFireTargetInstanceIds,
    battleLogisticsPickInstanceIds,
    battlePendingLogisticsPreview,
    battleReportReplayHighlight,
    battlePendingShootPreview,
    battleLogisticsUnitDecal,
    battleDefendHover,
    shootOrderDecalImgRef,
    logisticsUnitDecalImgRef,
    defendOrderDecalImgRef,
    ambushOrderDecalImgRef,
    fireSupIconImgRef,
    resolveEditorCachedImage,
    isEnemyUnitHiddenByFog,
  } = params

  if (!cell.units?.length) return

  const size = unitDrawSize(cell.units.length, lobbyPreview, mode, cellSize)
  const positions = unitPositionsForDraw(lobbyPreview, mode, cellSize)
  const hiPad = lobbyPreview ? 3 : mode === 'battle' ? Math.max(4, Math.round(cellSize * 0.12)) : 5

  const battleHoverKindForUnit = (u: { faction?: string }): 'ally' | 'enemy' | 'neutral' => {
    const uf = u.faction as string | undefined
    let k: 'ally' | 'enemy' | 'neutral' = 'neutral'
    if (viewerBattleFaction !== 'none' && (uf === 'ussr' || uf === 'germany')) {
      const ally =
        (viewerBattleFaction === 'rkka' && uf === 'ussr') ||
        (viewerBattleFaction === 'wehrmacht' && uf === 'germany')
      k = ally ? 'ally' : 'enemy'
    }
    return k
  }

  cell.units.slice(0, 3).forEach((unit: any, index: number) => {
    if (isEnemyUnitHiddenByFog(unit, cell)) return

    const pos = positions[index]
    const unitX = center.x + pos.x
    const unitY = center.y + pos.y

    const isHovered = hoveredUnit != null && hoveredUnit.cell.id === cell.id && hoveredUnit.index === index
    const isHighlighted = unit.highlighted === true
    const unitId = unit.instanceId
    const isFirePickTarget =
      mode === 'battle' && unitId != null && battleFireTargetInstanceIds?.includes(unitId)
    const isLogisticsPickTarget =
      mode === 'battle' && unitId != null && battleLogisticsPickInstanceIds?.includes(unitId)
    const plp = battlePendingLogisticsPreview
    const pendingLogisticsKey = getPendingLogisticsKey(plp, unitId)
    const isPendingLogisticsTarget = mode === 'battle' && pendingLogisticsKey != null
    const reportGlowIds = battleReportReplayHighlight?.glowInstanceIds ?? []
    const isReportShooterGlow = mode === 'battle' && unitId != null && reportGlowIds.includes(unitId)

    if (isHighlighted) {
      ctx.shadowColor = 'red'
      ctx.shadowBlur = 20
      ctx.beginPath()
      ctx.arc(unitX, unitY, size / 2 + hiPad, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }

    let battleHoverKind: 'ally' | 'enemy' | 'neutral' | null = null
    if (mode === 'battle' && isHovered) {
      battleHoverKind = battleHoverKindForUnit(unit)
    } else if (mode === 'battle' && isReportShooterGlow) {
      battleHoverKind = battleHoverKindForUnit(unit)
    }

    const unitImgPath = unit.imagePath
    const unitImgState = unitImgPath ? resolveEditorCachedImage(unitImgPath) : null
    const unitTex = unitImgState?.ready ? unitImgState.ready : null

    const battleFilter = getBattleFilter({
      isFirePickTarget: Boolean(isFirePickTarget),
      isLogisticsPickTarget: Boolean(isLogisticsPickTarget),
      isPendingLogisticsTarget,
      battleHoverKind,
    })

    if (unitTex) {
      const half = size / 2
      if (mode === 'editor') {
        ctx.save()
        ctx.beginPath()
        ctx.rect(unitX - half, unitY - half, size, size)
        ctx.clip()
        drawImageCoverInSquare(ctx, unitTex, unitX, unitY, half)
        ctx.restore()
      } else {
        ctx.save()
        ctx.filter = battleFilter
        drawImageCoverInSquare(ctx, unitTex, unitX, unitY, half)
        ctx.restore()
      }
    } else if (mode === 'editor') {
      const skipPlaceholder = unitImgState && (unitImgState.pending || (!unitImgState.noUrl && !unitImgState.ready))
      if (!skipPlaceholder) {
        const half = size / 2
        ctx.fillStyle = '#FF6B6B'
        ctx.fillRect(unitX - half, unitY - half, size, size)
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 2
        ctx.strokeRect(unitX - half, unitY - half, size, size)
        ctx.fillStyle = 'white'
        ctx.font = lobbyPreview ? 'bold 10px Arial' : 'bold 14px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(unit.name?.[0] || 'U', unitX, unitY)
      }
    } else {
      ctx.save()
      if (mode === 'battle') {
        ctx.filter = battleFilter
      }
      ctx.fillStyle = '#4A6FA5'
      ctx.beginPath()
      ctx.arc(unitX, unitY, size / 2, 0, 2 * Math.PI)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = 'white'
      ctx.font = lobbyPreview ? 'bold 10px Arial' : 'bold 14px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(unit.name?.[0] || 'U', unitX, unitY)
    }

    const pp = battlePendingShootPreview
    const brDecal = battleReportReplayHighlight?.targetDecal
    const reportShootKey = getReportShootKey(brDecal, unitId)
    const reportLogisticsKey = getReportLogisticsKey(brDecal, unitId)
    const pendingOrderKey = getPendingShootKey(pp, unitId)
    const decalKey = reportShootKey ?? pendingOrderKey
    if (mode === 'battle' && decalKey) {
      const decal = shootOrderDecalImgRef.current[decalKey]
      drawCircleDecal(ctx, decal, unitX, unitY, Math.max(6, cellSize * 0.12))
    }
    if (mode === 'battle' && reportLogisticsKey) {
      const ldecal = logisticsUnitDecalImgRef.current[reportLogisticsKey]
      drawCircleDecal(ctx, ldecal, unitX, unitY, Math.max(6, cellSize * 0.12))
    }

    const lud = battleLogisticsUnitDecal
    if (mode === 'battle' && lud && unitId != null && lud.targetInstanceIds.includes(unitId)) {
      const ldecal = logisticsUnitDecalImgRef.current[lud.orderKey]
      drawCircleDecal(ctx, ldecal, unitX, unitY, Math.max(6, cellSize * 0.12))
    } else if (mode === 'battle' && pendingLogisticsKey) {
      const ldecal = logisticsUnitDecalImgRef.current[pendingLogisticsKey]
      drawCircleDecal(ctx, ldecal, unitX, unitY, Math.max(6, cellSize * 0.12))
    }

    const dh = battleDefendHover
    const useAmbushDecal = dh?.defendKind === 'ambush'
    const defImg = useAmbushDecal ? ambushOrderDecalImgRef.current : defendOrderDecalImgRef.current
    if (
      mode === 'battle' &&
      dh &&
      dh.facingDecal !== 'deploy' &&
      dh.facingDecal !== 'changeSector' &&
      defImg?.naturalWidth &&
      unit.type !== 'artillery' &&
      unit.instanceId === dh.unitInstanceId &&
      (isHovered || dh.showSectorWithoutUnitHover === true)
    ) {
      drawCircleDecal(ctx, defImg, unitX, unitY, Math.max(6, cellSize * 0.13))
    }

    if (mode === 'battle') {
      const tac = unit.tactical as { fireSuppression?: boolean } | undefined
      if (tac?.fireSuppression === true) {
        const fsImg = fireSupIconImgRef.current
        drawCircleDecal(ctx, fsImg, unitX, unitY, Math.max(9, Math.min(size * 0.225, cellSize * 0.206)))
      }
    }

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  })

  const extraUnits = cell.units.length - 3
  if (extraUnits > 0) {
    const bx = center.x + (lobbyPreview ? 13 : 20)
    const by = center.y + (lobbyPreview ? -10 : -15)
    if (mode === 'editor') {
      const w = lobbyPreview ? 15 : 22
      const h = lobbyPreview ? 12 : 18
      ctx.fillStyle = '#ff4444'
      ctx.fillRect(bx - w / 2, by - h / 2, w, h)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.strokeRect(bx - w / 2, by - h / 2, w, h)
    } else {
      ctx.beginPath()
      ctx.arc(bx, by, lobbyPreview ? 8 : 12, 0, 2 * Math.PI)
      ctx.fillStyle = '#ff4444'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.fillStyle = 'white'
    ctx.font = lobbyPreview ? 'bold 9px Arial' : 'bold 12px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`+${extraUnits}`, bx, by)
  }
}
