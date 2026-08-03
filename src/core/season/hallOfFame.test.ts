import { describe, expect, it } from 'vitest'
import { emptyCareerStats } from '@/core/player/careerStats'
import type { CareerStats } from '@/core/player/careerStats'
import type { Position } from '@/core/types/player'
import {
  allTimeRoster,
  bestNine,
  BEST_NINE_MIN_GAMES,
  leaderOf,
  RATE_MIN_AT_BATS,
  RECORD_CATEGORIES,
} from './hallOfFame'
import type { HallEntry } from './hallOfFame'

function entry(
  id: string,
  position: Position,
  stats: Partial<CareerStats['batting']> & Partial<CareerStats['pitching']> = {},
): HallEntry {
  const base = emptyCareerStats()
  return {
    id,
    name: `選手 ${id}`,
    position,
    isPitcher: position === 'P',
    note: '3年',
    stats: {
      batting: { ...base.batting, ...stats },
      pitching: { ...base.pitching, ...stats },
    },
  }
}

describe('bestNine', () => {
  it('出場が少ない選手は載らない（1試合の打率10割で1位にならない）', () => {
    const flash = entry('flash', 'CF', {
      games: 1,
      atBats: 2,
      hits: 2,
      plateAppearances: 2,
    })
    const regular = entry('regular', 'CF', {
      games: 30,
      atBats: 100,
      hits: 30,
      plateAppearances: 110,
      walks: 10,
    })

    const nine = bestNine([flash, regular])
    expect(nine.find((slot) => slot.position === 'CF')!.entry.id).toBe('regular')
  })

  it('本職の位置でだけ競う（打てる選手が枠を独占しない）', () => {
    const slugger = entry('slugger', '1B', {
      games: 30,
      atBats: 100,
      hits: 45,
      homeruns: 15,
      plateAppearances: 110,
    })
    const catcher = entry('catcher', 'C', {
      games: 30,
      atBats: 100,
      hits: 20,
      plateAppearances: 105,
    })

    const nine = bestNine([slugger, catcher])
    expect(nine.find((slot) => slot.position === '1B')!.entry.id).toBe('slugger')
    expect(nine.find((slot) => slot.position === 'C')!.entry.id).toBe('catcher')
  })

  it('該当者がいない位置は空ける', () => {
    const only = entry('only', 'SS', { games: BEST_NINE_MIN_GAMES, atBats: 20, hits: 6 })
    const nine = bestNine([only])

    expect(nine).toHaveLength(1)
    expect(nine[0].position).toBe('SS')
  })

  it('投手は投球回と防御率で決まる', () => {
    const ace = entry('ace', 'P', { games: 20, outs: 300, earnedRuns: 20, wins: 12, strikeouts: 90 })
    const loser = entry('loser', 'P', {
      games: 20,
      outs: 300,
      earnedRuns: 90,
      wins: 2,
      strikeouts: 30,
    })

    expect(bestNine([ace, loser])[0].entry.id).toBe('ace')
  })
})

describe('leaderOf', () => {
  const homerunCategory = RECORD_CATEGORIES.find((c) => c.key === 'homeruns')!
  const averageCategory = RECORD_CATEGORIES.find((c) => c.key === 'average')!
  const eraCategory = RECORD_CATEGORIES.find((c) => c.key === 'era')!

  it('累計の部門は多いほうが1位', () => {
    const many = entry('many', 'LF', { games: 20, atBats: 60, hits: 20, homeruns: 9 })
    const few = entry('few', 'RF', { games: 20, atBats: 60, hits: 20, homeruns: 3 })

    expect(leaderOf([few, many], homerunCategory)!.entry.id).toBe('many')
  })

  it('率の部門は規定に届いていないと載らない', () => {
    const small = entry('small', 'CF', {
      games: 5,
      atBats: RATE_MIN_AT_BATS - 1,
      hits: RATE_MIN_AT_BATS - 1,
    })
    expect(leaderOf([small], averageCategory)).toBeNull()
  })

  it('防御率は小さいほうが1位', () => {
    const good = entry('good', 'P', { games: 20, outs: 300, earnedRuns: 20 })
    const bad = entry('bad', 'P', { games: 20, outs: 300, earnedRuns: 90 })

    expect(leaderOf([bad, good], eraCategory)!.entry.id).toBe('good')
  })

  it('誰も記録を持っていなければ null', () => {
    expect(leaderOf([entry('zero', 'CF')], homerunCategory)).toBeNull()
    expect(leaderOf([], homerunCategory)).toBeNull()
  })
})

describe('allTimeRoster', () => {
  it('在校生と卒業生を同じ土俵に並べる', () => {
    const roster = allTimeRoster(
      [
        {
          id: 'p1',
          name: '在校 太郎',
          grade: 2,
          position: 'SS',
          isPitcher: false,
          stats: emptyCareerStats(),
        } as never,
      ],
      [
        {
          id: 'a1',
          name: '卒業 次郎',
          year: 3,
          position: 'CF',
          isPitcher: false,
          highSchool: emptyCareerStats(),
        } as never,
      ],
    )

    expect(roster.map((e) => e.id)).toEqual(['p1', 'a1'])
    expect(roster[0].note).toBe('2年')
    expect(roster[1].note).toBe('3年目卒')
  })
})
