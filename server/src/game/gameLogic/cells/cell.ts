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
wire:number;
antiTankBuild:number;
storage:number;
mine:number;
trenchTank:number;
dot:number;
pontonBridge:number;
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