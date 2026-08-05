import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { overallRating } from '@/core/player/rating'
import { findRegion } from '@/core/types/region'
import type { Player } from '@/core/types/player'
import type { Tournament, TournamentKind } from '@/core/types/tournament'
import { createTournament } from './tournament'
import { applyTournamentGrowth, experiencePoints } from './tournamentGrowth'

const KANAGAWA = findRegion('kanagawa')
const roster = createInitialRoster(createRng(11))

/** 指定した回戦まで勝ち上がった大会を作る */
function played(
  kind: TournamentKind,
  wins: number,
  options: { champion?: boolean; lost?: boolean } = {},
): Tournament {
  const base = createTournament(kind, KANAGAWA)
  const results = Array.from({ length: wins }, (_, i) => ({
    round: i + 1,
    roundName: `${i + 1}回戦`,
    opponentName: `相手${i + 1}`,
    scoreFor: 3,
    scoreAgainst: 1,
    won: true,
  }))
  if (options.lost) {
    results.push({
      round: wins + 1,
      roundName: `${wins + 1}回戦`,
      opponentName: '強豪',
      scoreFor: 0,
      scoreAgainst: 5,
      won: false,
    })
  }
  return {
    ...base,
    results,
    champion: options.champion ?? false,
    eliminated: options.lost ?? false,
  }
}

/** スタメン9人・ベンチ入り20人という想定の編成 */
function squadOf(players: Player[]): { starters: string[]; squad: string[] } {
  const ids = players.map((player) => player.id)
  return { starters: ids.slice(0, 9), squad: ids.slice(0, 20) }
}

describe('experiencePoints', () => {
  it('勝ち上がるほど大きくなる', () => {
    expect(experiencePoints(played('summerPref', 4, { lost: true }))).toBeGreaterThan(
      experiencePoints(played('summerPref', 1, { lost: true })),
    )
  })

  it('優勝には上乗せがある', () => {
    const champion = experiencePoints(played('summerPref', 8, { champion: true }))
    const runnerUp = experiencePoints(played('summerPref', 7, { lost: true }))
    expect(champion).toBeGreaterThan(runnerUp + 1)
  })

  it('全国大会は同じ勝ち数でも得るものが大きい', () => {
    expect(experiencePoints(played('nationals', 3, { lost: true }))).toBeGreaterThan(
      experiencePoints(played('summerPref', 3, { lost: true })),
    )
  })

  it('1勝もできなければ0（出ただけでは伸びない）', () => {
    expect(experiencePoints(played('summerPref', 0, { lost: true }))).toBe(0)
    expect(experiencePoints(played('summerPref', 1, { lost: true }))).toBeGreaterThan(0)
  })
})

describe('applyTournamentGrowth', () => {
  it('勝ち上がるとスタメンが伸びる', () => {
    const { starters, squad } = squadOf(roster)
    const result = applyTournamentGrowth(createRng(1), roster, {
      tournament: played('summerPref', 8, { champion: true }),
      starters,
      squad,
    })

    // 総合はいくつもの能力の平均なので、+4程度では動かない選手もいる。
    // 「スタメンの大半に変化が出ている」ことで確かめる
    const grownIds = new Set(result.changes.map((change) => change.playerId))
    expect(starters.filter((id) => grownIds.has(id)).length).toBeGreaterThanOrEqual(7)

    const totalGain = result.changes.reduce(
      (total, change) => total + (change.after - change.before),
      0,
    )
    expect(totalGain).toBeGreaterThan(20)
  })

  it('初戦敗退では何も起きない', () => {
    const { starters, squad } = squadOf(roster)
    const result = applyTournamentGrowth(createRng(2), roster, {
      tournament: played('summerPref', 0, { lost: true }),
      starters,
      squad,
    })

    expect(result.changes).toHaveLength(0)
    expect(result.skills).toHaveLength(0)
    expect(result.players).toEqual(roster)
  })

  it('ベンチ外の選手は伸びない', () => {
    const { starters, squad } = squadOf(roster)
    const outsider = roster.find((player) => !squad.includes(player.id))!
    const result = applyTournamentGrowth(createRng(3), roster, {
      tournament: played('nationals', 6, { champion: true }),
      starters,
      squad,
    })

    expect(result.changes.some((change) => change.playerId === outsider.id)).toBe(false)
  })

  it('スタメンはベンチ入りより伸びる', () => {
    const { starters, squad } = squadOf(roster)
    const tournament = played('summerPref', 8, { champion: true })

    // 乱数のぶれを均すため、何度も回して合計で比べる
    let starterTotal = 0
    let benchTotal = 0
    const rng = createRng(7)
    for (let i = 0; i < 60; i++) {
      const result = applyTournamentGrowth(rng, roster, { tournament, starters, squad })
      for (const change of result.changes) {
        if (starters.includes(change.playerId)) starterTotal += change.after - change.before
        else benchTotal += change.after - change.before
      }
    }

    // スタメン9人 vs ベンチ11人。人数はベンチのほうが多いのに合計で上回る
    expect(starterTotal).toBeGreaterThan(benchTotal)
  })

  it('優勝すると特殊能力が身につくことがある', () => {
    const { starters, squad } = squadOf(roster)
    // 信頼度を上げておくと金特にも手が届く
    const trusted = roster.map((player) => ({ ...player, trust: 80 }))
    const tournament = played('nationals', 6, { champion: true })

    const rng = createRng(13)
    const ranks = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const result = applyTournamentGrowth(rng, trusted, { tournament, starters, squad })
      for (const news of result.skills) ranks.add(news.rank)
    }

    expect(ranks.has('blue')).toBe(true)
    expect(ranks.has('gold')).toBe(true)
    // 赤（マイナス能力）が付くことはない
    expect(ranks.has('red')).toBe(false)
  })

  it('優勝していなければ金特は付かない', () => {
    const { starters, squad } = squadOf(roster)
    const trusted = roster.map((player) => ({ ...player, trust: 90 }))
    const tournament = played('summerPref', 7, { lost: true })

    const rng = createRng(17)
    for (let i = 0; i < 60; i++) {
      const result = applyTournamentGrowth(rng, trusted, { tournament, starters, squad })
      for (const news of result.skills) expect(news.rank).toBe('blue')
    }
  })

  it('元の選手を書き換えない', () => {
    const { starters, squad } = squadOf(roster)
    const before = overallRating(roster[0])
    applyTournamentGrowth(createRng(5), roster, {
      tournament: played('summerPref', 8, { champion: true }),
      starters,
      squad,
    })
    expect(overallRating(roster[0])).toBe(before)
  })
})
