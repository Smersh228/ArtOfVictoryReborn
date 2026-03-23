import { Cell } from '../cells/cell'
import { Units } from '../units/units'

interface ICoor {
  x: number
  y: number
  z: number
}

export class orderMove {
  static getNeighbor(hex: ICoor, dir: number): ICoor {
    const dirs = [
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 0, z: -1 },
      { x: 0, y: 1, z: -1 },
      { x: -1, y: 1, z: 0 },
      { x: -1, y: 0, z: 1 },
      { x: 0, y: -1, z: 1 }
    ]
    return {
      x: hex.x + dirs[dir].x,
      y: hex.y + dirs[dir].y,
      z: hex.z + dirs[dir].z
    }
  }

  static findCell(cells: Cell[], coor: ICoor): Cell | undefined {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      if (cell.coor.x === coor.x && cell.coor.y === coor.y && cell.coor.z === coor.z) {
        return cell
      }
    }
    return undefined
  }


  static canMove(cell: Cell, unit: Units): boolean {
    if (!cell) return false
    if (cell.units && cell.units.length > 0) {
      for (let i = 0; i < cell.units.length; i++) {
        if (cell.units[i].team !== unit.team) {
          return false
        }
      }
    }
    if (cell.moveCost === 0) return false
    return true
  }


  static findReachable(start: Cell, maxPoints: number, allCells: Cell[], unit: Units): Cell[] {
    const result: Cell[] = []
    const visited: any = {} 
    const queue: any[] = [] 
    
    visited[start.id] = 0
    queue.push({ cell: start, spent: 0 })
    
    while (queue.length > 0) {
      queue.sort((a, b) => a.spent - b.spent)
      const current = queue.shift()
      
      if (current.spent <= maxPoints) {
        result.push(current.cell)
      }
      for (let dir = 0; dir < 6; dir++) {
        const neighborPos = this.getNeighbor(current.cell.coor, dir)
        const neighbor = this.findCell(allCells, neighborPos)
        
        if (!neighbor) continue
        if (!this.canMove(neighbor, unit)) continue
        
        const cost = neighbor.moveCost || 1
        const newSpent = current.spent + cost
        
        if (newSpent > maxPoints) continue
        
        const oldSpent = visited[neighbor.id]
        if (oldSpent === undefined || newSpent < oldSpent) {
          visited[neighbor.id] = newSpent
          queue.push({ cell: neighbor, spent: newSpent })
        }
      }
    }
    
    return result
  }

  static findPath(start: Cell, target: Cell, allCells: Cell[], unit: Units): Cell[] | null {
    if (start.id === target.id) return [start]
    const visited: any = {} 
    const parent: any = {}
    const queue: any[] = [] 
    visited[start.id] = 0
    queue.push({ cell: start, cost: 0 })
    
    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost)
      const current = queue.shift()
      
      if (current.cell.id === target.id) {
        const path: Cell[] = []
        let cur: Cell | undefined = target
        while (cur) {
          path.unshift(cur)
          cur = parent[cur.id]
        }
        return path
      }
      
      for (let dir = 0; dir < 6; dir++) {
        const neighborPos = this.getNeighbor(current.cell.coor, dir)
        const neighbor = this.findCell(allCells, neighborPos)
        
        if (!neighbor) continue
        if (!this.canMove(neighbor, unit)) continue
        
        const cost = neighbor.moveCost || 1
        const newCost = current.cost + cost
        
        const oldCost = visited[neighbor.id]
        if (oldCost === undefined || newCost < oldCost) {
          visited[neighbor.id] = newCost
          parent[neighbor.id] = current.cell
          queue.push({ cell: neighbor, cost: newCost })
        }
      }
    }
    
    return null
  }

  static moveTo(start: Cell, target: Cell, movePoints: number, allCells: Cell[], unit: Units) {
    const reachable = this.findReachable(start, movePoints, allCells, unit)

    let canReach = false
    for (let i = 0; i < reachable.length; i++) {
      if (reachable[i].id === target.id) {
        canReach = true
        break
      }
    }
    
    let path: Cell[] = []
    let pointsLeft = movePoints
    if (canReach) {
      const foundPath = this.findPath(start, target, allCells, unit)
      if (foundPath) {
        path = foundPath
        let spent = 0
        for (let i = 1; i < path.length; i++) {
          spent = spent + (path[i].moveCost || 1)
        }
        pointsLeft = movePoints - spent
      }
    }
    
    return {path: path, reachableCells: reachable,canReachTarget: canReach, movementPointsLeft: pointsLeft }
  }
}