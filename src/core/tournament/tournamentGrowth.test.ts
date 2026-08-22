import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { overallRating } from '@/core/player/rating'
import type { Player } from '@/core/types/player'
import { applyTournamentGrowth, matchExperience } from './tournamentGrowth'

const roster = createInitialRoster(createRng(11))

/** スタメン9人・ベンチ入り20人という想定の編成 */
function squadOf(players: Player[]): { starters: string[]; squad: string[] } {
  const ids = players.map((player) => player.id)
  return { starters: ids.slice(0, 9), squad: ids.slice(0, 20) }
}

const { starters, squad } = squadOf(roster)

/** 1勝ぶんの成長を適用する */
function win(seed: number, options: { champion?: boolean; kind?: 'summerPref' | 'nationals' } = {}) {
  return applyTournamentGrowth(createRng(seed), roster, {
    kind: options.kind ?? 'summerPref',
    won: true,
    champion: options.champion ?? false,
    starters,
    squad,
  })
}

describe('matchExperience', () => {
  it('負けた試合では0', () => {
    expect(matchExperience('summerPref', false, false)).toBe(0)
  })

  it('勝てば経験が入る', () => {
    expect(matchExperience('summerPref', true, false)).toBeGreaterThan(0)
  })

  it('優勝を決めた試合は上乗せがある', () => {
    expect(matchExperience('summerPref', true, true)).toBeGreaterThan(
      matchExperience('summerPref', true, false) * 2,
    )
  })

  it('全国大会は1勝の重みが違う', () => {
    expect(matchExperience('nationals', true, false)).toBeGreaterThan(
      matchExperience('summerPref', true, false),
    )
  })

  it('秋季大会は夏より軽い（新チームの腕試し）', () => {
    expect(matchExperience('autumnPref', true, false)).toBeLessThan(
      matchExperience('summerPref', true, false),
    )
  })
})

describe('applyTournamentGrowth', () => {
  it('負けた試合では何も起きない', () => {
    const result = applyTournamentGrowth(createRng(2), roster, {
      kind: 'summerPref',
      won: false,
      champion: false,
      starters,
      squad,
    })

    expect(result.changes).toHaveLength(0)
    expect(result.skills).toHaveLength(0)
    expect(result.players).toEqual(roster)
  })

  it('1勝ごとにスタメンが伸びる', () => {
    // 1試合ぶんは小さいので、何度か回して合計で見る
    let total = 0
    for (let seed = 1; seed <= 40; seed++) {
      for (const change of win(seed).changes) total += change.after - change.before
    }
    expect(total).toBeGreaterThan(0)
  })

  it('勝ち上がるほど積み上がる', () => {
    // 3試合勝った状態を順に適用すると、1試合だけより伸びる
    const rng = createRng(9)
    let players = roster
    let total = 0
    for (let i = 0; i < 3; i++) {
      const result = applyTournamentGrowth(rng, players, {
        kind: 'summerPref',
        won: true,
        champion: false,
        starters,
        squad,
      })
      players = result.players
      for (const change of result.changes) total += change.after - change.before
    }

    const single = applyTournamentGrowth(createRng(9), roster, {
      kind: 'summerPref',
      won: true,
      champion: false,
      starters,
      squad,
    })
    const singleTotal = single.changes.reduce((sum, c) => sum + (c.after - c.before), 0)

    expect(total).toBeGreaterThan(singleTotal)
  })

  it('高い能力ほど伸びにくい（練習と同じ）', () => {
    // 大会だけAやSまで積み上がるのでは、練習の頭打ちが意味を失う
    const at = (level: number) => {
      const leveled = roster.map((player) => ({
        ...player,
        batting: {
          ...player.batting,
          meet: level,
          power: level,
          speed: level,
          arm: level,
          fielding: level,
          catching: level,
        },
      }))

      let total = 0
      for (let seed = 1; seed <= 60; seed++) {
        const result = applyTournamentGrowth(createRng(seed), leveled, {
          kind: 'summerPref',
          won: true,
          champion: true,
          starters,
          squad,
        })
        for (const change of result.changes) total += change.after - change.before
      }
      return total
    }

    const low = at(50)
    const high = at(85)

    expect(high).toBeLessThan(low / 2)
    expect(high).toBeGreaterThan(0)
  })

  it('ベンチ外の選手は伸びない', () => {
    const outsider = roster.find((player) => !squad.includes(player.id))!
    let touched = false
    for (let seed = 1; seed <= 40; seed++) {
      if (win(seed, { champion: true }).changes.some((c) => c.playerId === outsider.id)) {
        touched = true
      }
    }
    expect(touched).toBe(false)
  })

  it('スタメンはベンチ入りより伸びる', () => {
    let starterTotal = 0
    let benchTotal = 0

    for (let seed = 1; seed <= 120; seed++) {
      for (const change of win(seed, { champion: true }).changes) {
        if (starters.includes(change.playerId)) starterTotal += change.after - change.before
        else benchTotal += change.after - change.before
      }
    }

    // スタメン9人 vs ベンチ11人。人数はベンチのほうが多いのに合計で上回る
    expect(starterTotal).toBeGreaterThan(benchTotal)
  })

  it('優勝を決めた試合では金特に手が届く', () => {
    const trusted = roster.map((player) => ({ ...player, trust: 80 }))
    const ranks = new Set<string>()

    for (let seed = 1; seed <= 120; seed++) {
      const result = applyTournamentGrowth(createRng(seed), trusted, {
        kind: 'nationals',
        won: true,
        champion: true,
        starters,
        squad,
      })
      for (const news of result.skills) ranks.add(news.rank)
    }

    expect(ranks.has('blue')).toBe(true)
    expect(ranks.has('gold')).toBe(true)
    expect(ranks.has('red')).toBe(false)
  })

  it('優勝を決めていない試合では金特は付かない', () => {
    const trusted = roster.map((player) => ({ ...player, trust: 90 }))

    for (let seed = 1; seed <= 120; seed++) {
      const result = applyTournamentGrowth(createRng(seed), trusted, {
        kind: 'summerPref',
        won: true,
        champion: false,
        starters,
        squad,
      })
      for (const news of result.skills) expect(news.rank).toBe('blue')
    }
  })

  it('元の選手を書き換えない', () => {
    const before = overallRating(roster[0])
    win(5, { champion: true })
    expect(overallRating(roster[0])).toBe(before)
  })
})
