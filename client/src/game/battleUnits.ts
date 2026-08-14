/** Минимальные данные юнита для отрисовки на поле боя (совместимо с редактором карт). */

import { Cell } from '../../../server/src/game/gameLogic/cells/cell'

export type BattleUnitTypeId =
  | 'infantry'
  | 'artillery'
  | 'tech'
  | 'armor'
  | 'lightTank'
  | 'mediumTank'
  | 'heavyTank'
  | 'lightAir'
  | 'heavyAir'

export type BattleFactionId = 'germany' | 'ussr'

export type BattleCatalogUnit = {
  id: number
  name: string
  type: BattleUnitTypeId
  faction: BattleFactionId
  imagePath: string
}

export type PlacedBattleUnit = BattleCatalogUnit & {
  instanceId: number
  health?: number
  ammo?: number
  str?: number
  def?: number
  mor?: number
  mines?: number
  explosives?: number
  smokeShells?: number
  ammoSupply?: string
  orders?: { id: number; name: string; order_key?: string }[]
}


export const BATTLE_CATALOG_UNITS: BattleCatalogUnit[] = [
  {
    id: 1,
    name: 'Немецкая пехота',
    type: 'infantry',
    faction: 'germany',
    imagePath: '/src/img/units/Germany/humans/humans/infanrtyGerman.png',
  },
  {
    id: 2,
    name: 'Советская пехота',
    type: 'infantry',
    faction: 'ussr',
    imagePath: '/src/img/units/USSR/humans/infantry/infantryUSSR.png',
  },
  {
    id: 3,
    name: 'T-34',
    type: 'mediumTank',
    faction: 'ussr',
    imagePath: '/src/img/units/USSR/tanks/mediumTanks/t34.png',
  },
  {
    id: 4,
    name: 'Pz-3G',
    type: 'mediumTank',
    faction: 'germany',
    imagePath: '/src/img/units/Germany/tanks/mediumTanks/pz3.png',
  },
  {
    id: 5,
    name: 'Пулемёт максим',
    type: 'infantry',
    faction: 'ussr',
    imagePath: '/src/img/units/USSR/humans/infantry/maxim.png',
  },
]


export function placeUnitsOnGrid(
  grid: Cell[],
  placements: { cellIndex: number; catalogUnitId: number }[],
  nextInstanceId: { current: number },
): Cell[] {
  const byCatalogId = new Map(BATTLE_CATALOG_UNITS.map((u) => [u.id, u]))
  const copy = grid.map((c) => ({ ...c, units: [...(c.units || [])] }))

  for (const { cellIndex, catalogUnitId } of placements) {
    if (cellIndex < 0 || cellIndex >= copy.length) continue
    const def = byCatalogId.get(catalogUnitId)
    if (!def) continue
    const placed: PlacedBattleUnit = {
      ...def,
      instanceId: nextInstanceId.current++,
      health: 100,
      ammo: 100,
    }
    const cell = copy[cellIndex]
    cell.units = [...cell.units, placed as unknown as (typeof cell.units)[number]]
  }

  return copy
}
