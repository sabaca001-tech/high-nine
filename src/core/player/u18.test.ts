import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from './createPlayer'
import type { Player } from '@/core/types/player'
import { draftBonus, playU18 } from './u18'

const players = createInitialRoster(createRng(3))

/** 総合が指定の水準になるよう能力を底上げした選手を作る */
function strong(player: Player, level: number): Player {
  return {
    ...player,
    grade: 3,
    batting: {
      ...player.batting,
      meet: level,
      power: level,
      speed: level,
      arm: level,
      fielding: level,
      catching: level,
    },
    pitching: player.pitching
      ? { ...player.pitching, velocity: 150, control: level, stamina: level, sharpness: level }
      : null,
  }
}

describe('playU18', () => {
  it('能力が高い選手ほど活躍する', () => {
    const rng = createRng(17)
    let high = 0
    let low = 0

    for (let i = 0; i < 40; i++) {
      high += playU18(rng, strong(players[0], 95), 3).performance
      low += playU18(rng, strong(players[0], 72), 3).performance
    }

    expect(high).toBeGreaterThan(low)
  })

  it('代表歴が記録に残る', () => {
    const outcome = playU18(createRng(2), strong(players[0], 90), 3)
    expect(outcome.player.u18).toHaveLength(1)
    expect(outcome.player.u18[0].year).toBe(3)
  })
})

describe('draftBonus', () => {
  it('選ばれていなければ0', () => {
    expect(draftBonus([])).toBe(0)
  })

  it('活躍したほうが大きい', () => {
    expect(draftBonus([{ year: 3, performance: 90 }])).toBeGreaterThan(
      draftBonus([{ year: 3, performance: 10 }]),
    )
  })

  it('複数回選ばれるとさらに上がる', () => {
    expect(
      draftBonus([
        { year: 2, performance: 60 },
        { year: 3, performance: 60 },
      ]),
    ).toBeGreaterThan(draftBonus([{ year: 3, performance: 60 }]))
  })
})
