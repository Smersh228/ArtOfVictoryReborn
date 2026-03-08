import { Units } from "../units/units";

interface ICoor {
x:number;
y:number;
z:number;
}

interface IBaseDefendCell {
infantry:number;
technics:number;

}
interface IBuildCell {
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
units:Units[];
readonly coor:ICoor;
img: string;
moveCost: number;
visible:boolean;
baseDefend:IBaseDefendCell;
builds:IBuildCell;
//добавить механику холмов
constructor(id:number,type:string,units:Units[],
            coor:ICoor,img:string,moveCost:number,
            visible:boolean,baseDefend:IBaseDefendCell,builds:IBuildCell)
{
this.id = id;
this.type = type;
this.units = units;
this.coor = coor;
this.img = img;
this.moveCost = moveCost;
this.visible = visible;
this.baseDefend = baseDefend;
this.builds = builds;

}


}