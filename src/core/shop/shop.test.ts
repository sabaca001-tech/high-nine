import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { createTournament, applyRoundResult } from '@/core/tournament/tournament'
import { findRegion } from '@/core/types/region'
import { formatFunds, monthlyFunds, tournamentPrize } from './funds'
import { applyItem, findItem, SHOP_ITEMS } from './itemDefs'

const TOTTORI = findRegion('tottori')

function roster(seed = 1) {
  return createInitialRoster(createRng(seed))
}

describe('部費の収入', () => {
  it('評判が高いほど毎月の部費が多い', () => {
    expect(monthlyFunds(100)).toBeGreaterThan(monthlyFunds(20))
    expect(monthlyFunds(0)).toBeGreaterThan(0)
  })

  it('大会は勝ち進むほど賞金が増える', () => {
    let t = createTournament('summerPref', TOTTORI)
    const prizes: number[] = []

    for (let i = 0; i < t.totalRounds; i++) {
      t = applyRoundResult(t, { opponentName: 'X', scoreFor: 3, scoreAgainst: 1, won: true })
      prizes.push(tournamentPrize(t))
    }
    for (let i = 1; i < prizes.length; i++) {
      expect(prizes[i]).toBeGreaterThan(prizes[i - 1])
    }
  })

  it('負けても賞金はマイナスにならない', () => {
    const t = applyRoundResult(createTournament('summerPref', TOTTORI), {
      opponentName: 'X',
      scoreFor: 0,
      scoreAgainst: 9,
      won: false,
    })
    expect(tournamentPrize(t)).toBeGreaterThanOrEqual(0)
  })

  it('全国優勝の賞金が最も大きい', () => {
    const champion = (kind: 'summerPref' | 'nationals') => {
      let t = createTournament(kind, TOTTORI)
      for (let i = 0; i < t.totalRounds; i++) {
        t = applyRoundResult(t, { opponentName: 'X', scoreFor: 3, scoreAgainst: 1, won: true })
      }
      return tournamentPrize(t)
    }
    expect(champion('nationals')).toBeGreaterThan(champion('summerPref'))
  })

  it('金額を日本語表記にできる', () => {
    expect(formatFunds(12000)).toBe('12,000円')
  })
})

describe('ショップのアイテム', () => {
  it('idが重複せず、価格が正の値', () => {
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length)
    for (const item of SHOP_ITEMS) {
      expect(item.price).toBeGreaterThan(0)
      expect(item.name.length).toBeGreaterThan(0)
    }
  })

  it('findItem で引ける', () => {
    expect(findItem('drink')?.name).toBe('スポーツドリンク')
    expect(findItem('存在しない')).toBeUndefined()
  })

  it('ドリンクと弁当は体力を回復する', () => {
    const players = roster().map((p) => ({ ...p, condition: 40 }))
    const drink = applyItem(createRng(1), players, findItem('drink')!)
    const meal = applyItem(createRng(1), players, findItem('meal')!)

    expect(drink.players[0].condition).toBe(65)
    expect(meal.players[0].condition).toBe(85)
  })

  it('練習器具は練習効率バフを与える', () => {
    const gear = applyItem(createRng(1), roster(), findItem('gear')!)
    const machine = applyItem(createRng(1), roster(), findItem('machine')!)

    expect(gear.boost).toEqual({ multiplier: 1.5, remaining: 5 })
    expect(machine.boost!.multiplier).toBeGreaterThan(gear.boost!.multiplier)
  })

  it('差し入れはやる気を上げ、範囲を超えない', () => {
    const players = roster().map((p) => ({ ...p, motivation: 2 as const }))
    const { players: after } = applyItem(createRng(1), players, findItem('treat')!)
    for (const player of after) {
      expect(player.motivation).toBe(2)
    }
  })

  it('メンタルコーチは信頼度を上げ、100を超えない', () => {
    const players = roster().map((p) => ({ ...p, trust: 95 }))
    const { players: after } = applyItem(createRng(1), players, findItem('mental-coach')!)
    for (const player of after) {
      expect(player.trust).toBe(100)
    }
  })

  it('指南書は信頼度が最も高い選手が挑戦する', () => {
    const players = roster()
    const target = players[3]
    const prepared = players.map((p) => ({ ...p, trust: p.id === target.id ? 100 : 10 }))

    let acquired = false
    for (let seed = 0; seed < 40 && !acquired; seed++) {
      const { players: after } = applyItem(createRng(seed), prepared, findItem('skill-book')!)
      const changed = after.filter((p, i) => p.skills.length !== prepared[i].skills.length)
      if (changed.length > 0) {
        expect(changed).toHaveLength(1)
        expect(changed[0].id).toBe(target.id)
        acquired = true
      }
    }
    expect(acquired).toBe(true)
  })

  it('どのアイテムも元の選手を変更しない', () => {
    const players = roster()
    const before = JSON.parse(JSON.stringify(players))
    for (const item of SHOP_ITEMS) {
      applyItem(createRng(2), players, item)
    }
    expect(players).toEqual(before)
  })
})
