import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import type { Personality, Player } from '@/core/types/player'
import { applyStreaks } from './streak'

function roster(seed = 1): Player[] {
  return createInitialRoster(createRng(seed))
}

/** 何度も回して発生回数を数える */
function countEvents(players: Player[], trials = 200, seed = 7) {
  const rng = createRng(seed)
  let breakouts = 0
  let slumps = 0

  for (let i = 0; i < trials; i++) {
    for (const event of applyStreaks(rng, players).events) {
      if (event.kind === 'breakout') breakouts++
      else slumps++
    }
  }
  return { breakouts, slumps }
}

describe('applyStreaks', () => {
  it('急成長もスランプも起きる', () => {
    const { breakouts, slumps } = countEvents(roster())
    expect(breakouts).toBeGreaterThan(0)
    expect(slumps).toBeGreaterThan(0)
  })

  it('急成長では能力が上がり、スランプでは下がる', () => {
    const rng = createRng(11)
    for (let i = 0; i < 300; i++) {
      for (const event of applyStreaks(rng, roster()).events) {
        for (const change of event.changes) {
          if (event.kind === 'breakout') expect(change.after).toBeGreaterThan(change.before)
          else expect(change.after).toBeLessThan(change.before)
        }
      }
    }
  })

  it('毎月ほとんどの選手には何も起きない（過剰に発生しない）', () => {
    const players = roster()
    const rng = createRng(12)
    let total = 0
    const trials = 100

    for (let i = 0; i < trials; i++) {
      total += applyStreaks(rng, players).events.length
    }
    // 24人 × 100ヶ月で、発生は全体の15%未満に収まる
    expect(total / (players.length * trials)).toBeLessThan(0.15)
    expect(total).toBeGreaterThan(0)
  })

  it('離脱中の選手には起きない', () => {
    const players = roster().map((p) => ({ ...p, injuryMonths: 2 }))
    const rng = createRng(13)
    let total = 0
    for (let i = 0; i < 200; i++) {
      total += applyStreaks(rng, players).events.length
    }
    expect(total).toBe(0)
  })

  it('やる気が高いほど急成長しやすい', () => {
    const breakoutsFor = (motivation: -2 | 2): number =>
      countEvents(
        roster().map((p) => ({ ...p, motivation })),
        300,
        21,
      ).breakouts

    expect(breakoutsFor(2)).toBeGreaterThan(breakoutsFor(-2))
  })

  it('下級生ほど急成長しやすい', () => {
    const breakoutsFor = (grade: 1 | 3): number =>
      countEvents(
        roster().map((p) => ({ ...p, grade })),
        300,
        22,
      ).breakouts

    expect(breakoutsFor(1)).toBeGreaterThan(breakoutsFor(3))
  })

  it('天才肌は変動が大きく、クールは小さい', () => {
    const totalFor = (personality: Personality): number => {
      const { breakouts, slumps } = countEvents(
        roster().map((p) => ({ ...p, personality })),
        300,
        23,
      )
      return breakouts + slumps
    }
    expect(totalFor('天才肌')).toBeGreaterThan(totalFor('クール'))
  })

  it('元の選手を変更しない', () => {
    const players = roster()
    const before = JSON.parse(JSON.stringify(players))
    const rng = createRng(24)
    for (let i = 0; i < 50; i++) applyStreaks(rng, players)
    expect(players).toEqual(before)
  })

  it('能力は1〜100の範囲に収まる', () => {
    const rng = createRng(25)
    let players = roster().map((p) => ({
      ...p,
      batting: { ...p.batting, meet: 98, power: 3 },
    }))
    for (let i = 0; i < 400; i++) {
      players = applyStreaks(rng, players).players
    }
    for (const player of players) {
      for (const value of Object.values(player.batting)) {
        expect(value).toBeGreaterThanOrEqual(1)
        expect(value).toBeLessThanOrEqual(100)
      }
    }
  })
})
