/** Unit payload on a cell (server/editor JSON); replaces legacy Units class. */
export type CellUnit = Record<string, unknown> & {
  faction?: string
  instanceId?: number
  id?: number
  name?: string
}

export interface ICoor {
x:number;
y:number;
z:number;
}

interface IBaseDefendCell {
infantry:number;
technics:number;

}
export interface IBuildCell {
trench:number;
trenchEdges:number;
/** instanceId отряда, занявшего окоп. */
trenchOccupantId?:number;
wire:number;
wireEdges:number;
antiTankBuild:number;
antiTankEdges:number;
storage:number;
/** Боезапас на складе (по умолчанию 40). */
storageAmmo?:number;
/** Дымовые снаряды на складе (по умолчанию 2). */
storageSmoke?:number;
/** Взрывчатка на складе (по умолчанию 2). */
storageExplosives?:number;
/** Мины на складе (по умолчанию 4). */
storageMines?:number;
mine:number;
/** Тип мины на гексе: пехотная или танковая. */
mineKind?: 'infantry' | 'tank';
/** Команда-владелец мины (нечётная — СССР, чётная — Вермахт). */
mineTeam?: number;
/** Карта мины перевёрнута после подрыва — тип виден всем. */
mineRevealed?: boolean;
trenchTank:number;
dot:number;
/** Защита ДОТ в бою (старт 4, только уменьшается). */
dotDef?:number;
/** Боезапас внутри ДОТ (старт 15). */
dotAmmo?:number;
/** Направление сектора ДОТ (0–5). */
dotFacing?:number;
/** Соседний гекс, куда направлен сектор ДОТ (из редактора карт). */
dotFacingCellId?:number;
/** instanceId юнита внутри ДОТ. */
dotOccupantId?:number;
pontonBridge:number;
/** Понтон строится по секциям (1–3); false/нет — готовый мост из редактора. */
pontonBuilding?: boolean;
/** Дымовая завеса на гексе. */
smoke?: {
  groupId: number
  placedTurn: number
  originCellId: number
  offset: number
  windDir: number | null
} | number;
}



export class Cell {
id:number;
type:string;
units: CellUnit[];
readonly coor:ICoor;
img: string;
moveCost: number;
moveCostInf: number;
moveCostTech: number;
visible:boolean;
baseDefend:IBaseDefendCell;
builds:IBuildCell;
highlight?: boolean;
constructor(
  id: number,
  type: string,
  units: CellUnit[],
  coor: ICoor,
  img: string,
  moveCost: number,
  visible: boolean,
  baseDefend: IBaseDefendCell,
  builds: IBuildCell,
  moveCostInf?: number,
  moveCostTech?: number,
) {
  this.id = id
  this.type = type
  this.units = units
  this.coor = coor
  this.img = img
  this.moveCost = moveCost
  this.moveCostInf = moveCostInf !== undefined ? moveCostInf : moveCost
  this.moveCostTech = moveCostTech !== undefined ? moveCostTech : moveCost
  this.visible = visible
  this.baseDefend = baseDefend
  this.builds = builds
}


}