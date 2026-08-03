import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import { applyPractice } from '@/core/player/growth'
import { applyCamp, CAMP_PLANS, findCampPlan } from './campDefs'

function roster(seed = 1) {
  return createInitialRoster(createRng(seed))
}

describe('CAMP_PLANS', () => {
  it('idが重複せず、全て有効な練習内容を指す', () => {
    expect(new Set(CAMP_PLANS.map((p) => p.id)).size).toBe(CAMP_PLANS.length)
    for (const plan of CAMP_PLANS) {
      expect(PRACTICE_DEFS[plan.kind]).toBeDefined()
      expect(plan.conditionCost).toBeGreaterThan(0)
    }
  })

  it('findCampPlan で引ける', () => {
    expect(findCampPlan('batting')?.label).toBe('打ち込み')
    expect(findCampPlan('存在しない')).toBeUndefined()
  })
})

describe('applyCamp', () => {
  it('通常の練習より大きく伸びる', () => {
    const players = roster()
    const plan = findCampPlan('batting')!

    const camp = applyCamp(createRng(10), players, plan)
    const normal = applyPractice(createRng(10), players, PRACTICE_DEFS.batting, false)

    const total = (changes: { before: number; after: number }[]) =>
      changes.reduce((sum, c) => sum + (c.after - c.before), 0)

    expect(total(camp.changes)).toBeGreaterThan(total(normal.changes) * 2)
  })

  it('体力を消耗し、信頼度が上がる', () => {
    const players = roster().map((p) => ({ ...p, condition: 100, trust: 50 }))
    const plan = findCampPlan('batting')!
    const { players: after } = applyCamp(createRng(11), players, plan)

    expect(after[0].condition).toBe(100 - plan.conditionCost)
    expect(after[0].trust).toBe(50 + plan.trustDelta)
  })

  it('精神統一は能力を伸ばさず信頼度だけ大きく上げる', () => {
    const players = roster().map((p) => ({ ...p, trust: 10 }))
    const plan = findCampPlan('mental')!
    const { players: after, changes } = applyCamp(createRng(12), players, plan)

    expect(changes).toHaveLength(0)
    expect(after[0].trust).toBe(10 + plan.trustDelta)
  })

  it('投手強化は投手だけが伸びる', () => {
    const players = roster()
    const { changes } = applyCamp(createRng(13), players, findCampPlan('pitching')!)

    const pitcherIds = new Set(players.filter((p) => p.isPitcher).map((p) => p.id))
    expect(changes.length).toBeGreaterThan(0)
    for (const change of changes) {
      expect(pitcherIds.has(change.playerId)).toBe(true)
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
