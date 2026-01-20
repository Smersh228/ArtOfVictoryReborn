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
trench:1;
wire:1;
antiTankBuild:1;
storage:1;
mine:1;
trenchTank:1;
dot:1;
pontonBridge:1;
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