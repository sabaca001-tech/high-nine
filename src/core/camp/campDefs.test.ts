import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { findSkill } from '@/core/skill/skillDefs'
import { applyCamp, campSeasonOf, CAMP_PLANS, findCampPlan } from './campDefs'

function roster(seed = 1) {
  return createInitialRoster(createRng(seed))
}

describe('CAMP_PLANS', () => {
  it('idが重複せず、狙う系統と消耗が定義されている', () => {
    expect(new Set(CAMP_PLANS.map((p) => p.id)).size).toBe(CAMP_PLANS.length)
    for (const plan of CAMP_PLANS) {
      expect(plan.scopes.length).toBeGreaterThan(0)
      expect(plan.conditionCost).toBeGreaterThan(0)
    }
  })

  it('findCampPlan で引ける', () => {
    expect(findCampPlan('batting')?.label).toBe('打撃合宿')
    expect(findCampPlan('存在しない')).toBeUndefined()
  })
})

describe('campSeasonOf', () => {
  it('8月は夏、12月は冬', () => {
    expect(campSeasonOf(8)).toBe('summer')
    expect(campSeasonOf(12)).toBe('winter')
  })
})

describe('applyCamp', () => {
  it('能力値は動かず、特殊能力だけが増える', () => {
    const before = roster()
    const { players: after, granted } = applyCamp(createRng(10), before, findCampPlan('batting')!)

    for (const player of after) {
      const original = before.find((p) => p.id === player.id)!
      expect(player.batting).toEqual(original.batting)
      expect(player.pitching).toEqual(original.pitching)
    }

    // 何度か回せば必ず誰かは掴む
    let total = granted.length
    for (let seed = 20; seed <= 40; seed++) {
      total += applyCamp(createRng(seed), before, findCampPlan('batting')!).granted.length
    }
    expect(total).toBeGreaterThan(0)
  })

  it('身につくのは方針の系統の特殊能力だけ', () => {
    const players = roster()
    const plan = findCampPlan('fielding')!

    for (let seed = 1; seed <= 60; seed++) {
      for (const news of applyCamp(createRng(seed), players, plan).granted) {
        const skill = findSkill(news.skillId)!
        expect(plan.scopes).toContain(skill.scope)
      }
    }
  })

  it('投手合宿に挑戦するのは投手だけ', () => {
    const players = roster()
    const pitcherIds = new Set(players.filter((p) => p.isPitcher).map((p) => p.id))

    for (let seed = 1; seed <= 60; seed++) {
      const result = applyCamp(createRng(seed), players, findCampPlan('pitching')!)
      for (const news of [...result.granted, ...result.missed]) {
        expect(pitcherIds.has(news.playerId)).toBe(true)
      }
    }
  })

  it('体力を消耗し、信頼度が上がる', () => {
    const players = roster().map((p) => ({ ...p, condition: 100, trust: 50 }))
    const plan = findCampPlan('batting')!
    const { players: after } = applyCamp(createRng(11), players, plan)

    expect(after[0].condition).toBe(100 - plan.conditionCost)
    expect(after[0].trust).toBe(50 + plan.trustDelta)
  })

  it('離脱中の選手は帯同せず、消耗もしない', () => {
    const players = roster().map((p, i) =>
      i === 0 ? { ...p, injuryMonths: 2, condition: 40 } : p,
    )
    const plan = findCampPlan('batting')!

    for (let seed = 1; seed <= 40; seed++) {
      const result = applyCamp(createRng(seed), players, plan)
      expect(result.players[0].condition).toBe(40)
      for (const news of [...result.granted, ...result.missed]) {
        expect(news.playerId).not.toBe(players[0].id)
      }
    }
  })

  it('ベンチ入りしている選手のほうが選ばれやすい', () => {
    // 信頼度を揃えて、ベンチ入りかどうかだけで差が出るようにする。
    // 全系統を狙う意識改革合宿なら、投手も野手も等しく挑戦者になれる
    const players = roster().map((p) => ({ ...p, trust: 50 }))
    const squad = players.slice(0, 9).map((p) => p.id)
    const squadSet = new Set(squad)

    let inSquad = 0
    let outSquad = 0
    for (let seed = 1; seed <= 200; seed++) {
      const result = applyCamp(createRng(seed), players, findCampPlan('mental')!, { squad })
      for (const news of [...result.granted, ...result.missed]) {
        if (squadSet.has(news.playerId)) inSquad++
        else outSquad++
      }
    }

    // ベンチ入りは9人、ベンチ外は残り全員。人数で負けていても選ばれる回数で上回る
    expect(inSquad).toBeGreaterThan(outSquad)
  })

  it('信頼度が低いうちは金特が出ない', () => {
    const players = roster().map((p) => ({ ...p, trust: 20 }))
    for (let seed = 1; seed <= 120; seed++) {
      const result = applyCamp(createRng(seed), players, findCampPlan('batting')!)
      for (const news of result.granted) expect(news.rank).toBe('blue')
    }
  })

  it('信頼度が高ければ金特に手が届く', () => {
    const players = roster().map((p) => ({ ...p, trust: 90 }))
    const ranks = new Set<string>()
    for (let seed = 1; seed <= 200; seed++) {
      for (const news of applyCamp(createRng(seed), players, findCampPlan('batting')!).granted) {
        ranks.add(news.rank)
      }
    }
    expect(ranks.has('gold')).toBe(true)
  })

  it('マイナス能力は付かない', () => {
    const players = roster()
    for (let seed = 1; seed <= 120; seed++) {
      for (const plan of CAMP_PLANS) {
        for (const news of applyCamp(createRng(seed), players, plan).granted) {
          expect(news.rank).not.toBe('red')
        }
      }
    }
  })

  it('同じ選手が1回の合宿で2つ掴むことはない', () => {
    const players = roster().map((p) => ({ ...p, trust: 90 }))
    for (let seed = 1; seed <= 120; seed++) {
      const result = applyCamp(createRng(seed), players, findCampPlan('mental')!)
      const ids = [...result.granted, ...result.missed].map((n) => n.playerId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('体力・信頼度は0〜100に収まる', () => {
    const players = roster().map((p) => ({ ...p, condition: 5, trust: 98 }))
    for (const plan of CAMP_PLANS) {
      const { players: after } = applyCamp(createRng(14), players, plan)
      for (const player of after) {
        expect(player.condition).toBeGreaterThanOrEqual(0)
        expect(player.trust).toBeLessThanOrEqual(100)
      }
    }
  })

  it('元の選手を変更しない', () => {
    const players = roster()
    const before = JSON.parse(JSON.stringify(players))
    applyCamp(createRng(15), players, findCampPlan('batting')!)
    expect(players).toEqual(before)
  })
})
