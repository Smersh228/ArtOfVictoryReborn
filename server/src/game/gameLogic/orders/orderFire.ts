import { Cell } from '../cells/cell'
import { Units } from '../units/units'

interface FireResult {
  hits: number
  damages: number
  rollResults: number[]
  diceCount: number
  accuracy: number
}

export class orderFire {
  getDefense(target: Units, targetCell: Cell): number {
    return target.defend || 0
  }

  getDiceCount(unit: Units, intensityArray: number[]): number {
    const strength = unit.strength || 1
    if (strength > intensityArray.length) {
      return intensityArray[0]
    }
    return intensityArray[strength - 1] || 1
  }

  getAccuracy(rangeArray: number[], distance: number): number {
    const index = distance - 1
    if (index >= 0 && index < rangeArray.length) {
      return rangeArray[index]
    }
    return 0
  }

  roll(diceCount: number): number[] {
    const results: number[] = []
    for (let i = 0; i < diceCount; i++) {
      results.push(Math.floor(Math.random() * 6) + 1)
    }
    return results
  }

  shoot(
    attacker: Units,
    target: Units,
    targetCell: Cell,
    distance: number,
    intensityArray: number[],
    rangeArray: number[],
    isSuppression: boolean = false
  ): FireResult {
    if (distance > rangeArray.length) {
      return {
        hits: 0,
        damages: 0,
        rollResults: [],
        diceCount: 0,
        accuracy: 0
      }
    }

    let diceCount = this.getDiceCount(attacker, intensityArray)
    
    if (isSuppression) {
      const bonus = Math.ceil(diceCount / 2)
      diceCount = diceCount + bonus
    }

    const accuracy = this.getAccuracy(rangeArray, distance)

    if (accuracy === 0) {
      return { hits: 0, damages: 0, rollResults: [], diceCount,accuracy }
    }

    const defense = this.getDefense(target, targetCell)
    const rolls = this.roll(diceCount)
    const hits = rolls.filter(r => r <= accuracy).length

    let remainingHits = hits - defense
    if (remainingHits < 0) remainingHits = 0
    const damages = remainingHits

    if (damages > 0) {
      target.strength = Math.max(0, target.strength - damages)
    }

    return {hits, damages, rollResults: rolls, diceCount, accuracy }
  }
}