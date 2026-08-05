import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { ABILITY_MAX, ABILITY_MIN } from '@/core/types/player'
import type { Grade } from '@/core/types/player'
import { createInitialRoster, createPlayer } from './createPlayer'
import { overallRating } from './rating'

describe('createPlayer', () => {
  it('同じシードなら同じ選手ができる', () => {
    const a = createPlayer(createRng(555), { id: 'p1', grade: 1 })
    const b = createPlayer(createRng(555), { id: 'p1', grade: 1 })
    expect(a).toEqual(b)
  })

  it('投手には pitching があり、野手には無い', () => {
    const rng = createRng(11)
    const pitcher = createPlayer(rng, { id: 'p1', grade: 2, isPitcher: true })
    const fielder = createPlayer(rng, { id: 'p2', grade: 2, isPitcher: false })

    expect(pitcher.isPitcher).toBe(true)
    expect(pitcher.pitching).not.toBeNull()
    expect(pitcher.position).toBe('P')

    expect(fielder.isPitcher).toBe(false)
    expect(fielder.pitching).toBeNull()
    expect(fielder.position).not.toBe('P')
  })

  it('全能力が 1〜100 の範囲に収まる', () => {
    const rng = createRng(2024)
    for (let i = 0; i < 300; i++) {
      const grade = ((i % 3) + 1) as Grade
      const player = createPlayer(rng, { id: `p${i}`, grade, talentBonus: 40 })

      for (const value of Object.values(player.batting)) {
        expect(value).toBeGreaterThanOrEqual(ABILITY_MIN)
        expect(value).toBeLessThanOrEqual(ABILITY_MAX)
      }
      expect(player.batting.trajectory).toBeGreaterThanOrEqual(1)
      expect(player.batting.trajectory).toBeLessThanOrEqual(4)

      if (player.pitching) {
        expect(player.pitching.control).toBeLessThanOrEqual(ABILITY_MAX)
        expect(player.pitching.stamina).toBeLessThanOrEqual(ABILITY_MAX)
        expect(player.pitching.breaking).toBeLessThanOrEqual(ABILITY_MAX)
      }
      expect(player.trust).toBeLessThanOrEqual(100)
      expect(player.condition).toBeLessThanOrEqual(100)
      expect(player.motivation).toBeGreaterThanOrEqual(-2)
      expect(player.motivation).toBeLessThanOrEqual(2)
    }
  })

  it('上級生ほど平均能力が高い', () => {
    const average = (grade: Grade): number => {
      const rng = createRng(999)
      let total = 0
      const n = 300
      for (let i = 0; i < n; i++) {
        total += createPlayer(rng, { id: `p${i}`, grade, isPitcher: false }).batting.meet
      }
      return total / n
    }
    expect(average(3)).toBeGreaterThan(average(2))
    expect(average(2)).toBeGreaterThan(average(1))
  })

  it('talentBonus が高いほど能力が高い', () => {
    const average = (bonus: number): number => {
      const rng = createRng(31)
      let total = 0
      const n = 200
      for (let i = 0; i < n; i++) {
        total += createPlayer(rng, {
          id: `p${i}`,
          grade: 2,
          isPitcher: false,
          talentBonus: bonus,
        }).batting.power
      }
      return total / n
    }
    expect(average(20)).toBeGreaterThan(average(0))
  })
})

describe('createInitialRoster', () => {
  it('各学年8人ずつ、計24人になる', () => {
    const roster = createInitialRoster(createRng(1))
    expect(roster).toHaveLength(24)
    for (const grade of [1, 2, 3] as Grade[]) {
      expect(roster.filter((p) => p.grade === grade)).toHaveLength(8)
    }
  })

  it('id が重複しない', () => {
    const roster = createInitialRoster(createRng(2))
    expect(new Set(roster.map((p) => p.id)).size).toBe(roster.length)
  })

  it('どのシードでも投手が最低3人いる（各学年1人）', () => {
    for (let seed = 0; seed < 30; seed++) {
      const roster = createInitialRoster(createRng(seed))
      expect(roster.filter((p) => p.isPitcher).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('投手は部員のおよそ2割に収まる（打線を組んでも余らない）', () => {
    let pitchers = 0
    let total = 0

    for (let seed = 0; seed < 40; seed++) {
      const roster = createInitialRoster(createRng(seed))
      pitchers += roster.filter((p) => p.isPitcher).length
      total += roster.length
    }

    const rate = pitchers / total
    expect(rate).toBeGreaterThan(0.12)
    expect(rate).toBeLessThan(0.3)
  })
})


describe('性格の出現率', () => {
  it('天才肌はレア（2%前後）', () => {
    const rng = createRng(77)
    const trials = 3000
    let genius = 0
    for (let i = 0; i < trials; i++) {
      if (createPlayer(rng, { id: `p${i}`, grade: 1 }).personality === '天才肌') genius += 1
    }
    const rate = genius / trials
    expect(rate).toBeGreaterThan(0.005)
    expect(rate).toBeLessThan(0.05)
  })

  it('他の性格はどれも出る', () => {
    const rng = createRng(78)
    const seen = new Set<string>()
    for (let i = 0; i < 600; i++) {
      seen.add(createPlayer(rng, { id: `p${i}`, grade: 2 }).personality)
    }
    expect(seen.size).toBeGreaterThanOrEqual(5)
  })

  it('天才肌は入学時の能力も高い', () => {
    const rng = createRng(79)
    let geniusTotal = 0
    let geniusCount = 0
    let otherTotal = 0
    let otherCount = 0

    for (let i = 0; i < 6000; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: false })
      const rating = overallRating(player)
      if (player.personality === '天才肌') {
        geniusTotal += rating
        geniusCount += 1
      } else {
        otherTotal += rating
        otherCount += 1
      }
    }

    expect(geniusCount).toBeGreaterThan(20)
    expect(geniusTotal / geniusCount).toBeGreaterThan(otherTotal / otherCount)
  })
})
