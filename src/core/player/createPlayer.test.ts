import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { ABILITY_MAX, ABILITY_MIN } from '@/core/types/player'
import type { Grade } from '@/core/types/player'
import { createInitialRoster, createPlayer } from './createPlayer'

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

  it('どのシードでも投手が最低6人いる（各学年2人）', () => {
    for (let seed = 0; seed < 30; seed++) {
      const roster = createInitialRoster(createRng(seed))
      expect(roster.filter((p) => p.isPitcher).length).toBeGreaterThanOrEqual(6)
    }
  })
})
