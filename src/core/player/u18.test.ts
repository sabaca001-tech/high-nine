import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from './createPlayer'
import type { Player } from '@/core/types/player'
import { emptyBattingLine } from '@/core/types/match'
import { draftBonus } from './u18'
import { performanceFrom, playU18Series } from './u18Series'

describe('playU18Series', () => {
  /** 代表30人ぶんの名簿。自校の選手を数人混ぜる */
  function squadOf(ours: Player[]): Player[] {
    const others = createInitialRoster(createRng(21)).map((player, index) => ({
      ...player,
      id: `x${index}`,
      grade: 3 as const,
    }))
    return [...ours, ...others].slice(0, 30)
  }

  const ours = createInitialRoster(createRng(11))
    .slice(0, 4)
    .map((player) => ({ ...player, grade: 3 as const }))

  it('実際に試合をして、成績が活躍度になる', () => {
    const outcome = playU18Series(createRng(5), {
      squad: squadOf(ours),
      ourPlayers: ours,
      year: 3,
    })

    expect(outcome.games).toHaveLength(3)
    for (const game of outcome.games) {
      expect(game.scoreFor + game.scoreAgainst).toBeGreaterThanOrEqual(0)
    }
    // 出場した自校の選手には成績が付く
    expect(outcome.performances.length).toBeGreaterThan(0)
  })

  it('代表歴が記録に残る', () => {
    const outcome = playU18Series(createRng(7), {
      squad: squadOf(ours),
      ourPlayers: ours,
      year: 3,
    })

    const played = outcome.players.filter((player) => player.u18.length > 0)
    expect(played.length).toBeGreaterThan(0)
    expect(played[0].u18[0].year).toBe(3)
  })

  it('自校の選手が居なければ何も起きない', () => {
    const outsiders = createInitialRoster(createRng(31)).map((player, index) => ({
      ...player,
      id: `y${index}`,
      grade: 3 as const,
    }))
    const outcome = playU18Series(createRng(9), {
      squad: outsiders,
      ourPlayers: ours,
      year: 3,
    })

    expect(outcome.games).toHaveLength(0)
    expect(outcome.players).toEqual(ours)
  })

  it('打てば活躍度が上がり、打てなければ下がる', () => {
    const line = (hits: number, homeruns: number) => ({
      ...emptyBattingLine('p', 'テスト'),
      atBats: 12,
      hits,
      homeruns,
      rbi: homeruns * 2,
    })

    expect(performanceFrom(line(6, 2), null)).toBeGreaterThan(performanceFrom(line(1, 0), null))
    expect(performanceFrom(line(0, 0), null)).toBeLessThan(45)
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
