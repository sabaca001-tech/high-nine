import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from './createPlayer'
import { overallRating } from './rating'
import type { Player } from '@/core/types/player'
import {
  draftBonus,
  playU18,
  selectU18,
  u18Bar,
  U18_BASE_RATING,
  U18_MAX_PER_SCHOOL,
} from './u18'

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
      ? { ...player.pitching, velocity: 150, control: level, stamina: level, breaking: level }
      : null,
  }
}

describe('selectU18', () => {
  it('弱小校の選手は選ばれない', () => {
    expect(selectU18(players, 40)).toEqual([])
  })

  it('抜けた選手だけが選ばれる', () => {
    const roster = players.map((player, index) =>
      index === 0 ? strong(player, 95) : player,
    )
    const selected = selectU18(roster, 40)

    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe(players[0].id)
  })

  it('全国に上を行く選手が並んでいると選ばれない（相対評価）', () => {
    const roster = players.map((player, index) =>
      index === 0 ? strong(player, 85) : player,
    )
    const rating = overallRating(roster[0])

    expect(selectU18(roster, rating - 10).length).toBe(1)
    expect(selectU18(roster, rating + 5)).toEqual([])
  })

  it('1校から何人も選ばれない', () => {
    const roster = players.map((player) => strong(player, 95))
    expect(selectU18(roster, 40).length).toBeLessThanOrEqual(U18_MAX_PER_SCHOOL)
  })

  it('下級生は選ばれない', () => {
    const roster = players.map((player, index) =>
      index === 0 ? { ...strong(player, 95), grade: 1 as const } : player,
    )
    expect(selectU18(roster, 40)).toEqual([])
  })

  it('怪我で離脱中の選手は選ばれない', () => {
    const roster = players.map((player, index) =>
      index === 0 ? { ...strong(player, 95), injuryMonths: 2 } : player,
    )
    expect(selectU18(roster, 40)).toEqual([])
  })
})

describe('playU18', () => {
  it('能力が高い選手ほど活躍する', () => {
    const rng = createRng(17)
    let high = 0
    let low = 0

    for (let i = 0; i < 40; i++) {
      high += playU18(rng, strong(players[0], 95), 3).performance
      low += playU18(rng, strong(players[0], U18_BASE_RATING), 3).performance
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

describe('u18Bar', () => {
  it('全国の水準が上がれば基準も上がる（相対評価）', () => {
    expect(u18Bar(90)).toBeGreaterThan(u18Bar(70))
  })

  it('全国が弱くても床は下回らない', () => {
    expect(u18Bar(0)).toBe(U18_BASE_RATING)
    expect(u18Bar(40)).toBe(U18_BASE_RATING)
  })
})
