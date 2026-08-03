import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createPlayer } from './createPlayer'
import { overallRating, toRank, trajectoryStars } from './rating'

describe('toRank', () => {
  it('境界値が正しくランク分けされる', () => {
    expect(toRank(100)).toBe('S')
    expect(toRank(90)).toBe('S')
    expect(toRank(89)).toBe('A')
    expect(toRank(80)).toBe('A')
    expect(toRank(79)).toBe('B')
    expect(toRank(70)).toBe('B')
    expect(toRank(69)).toBe('C')
    expect(toRank(60)).toBe('C')
    expect(toRank(59)).toBe('D')
    expect(toRank(50)).toBe('D')
    expect(toRank(49)).toBe('E')
    expect(toRank(40)).toBe('E')
    expect(toRank(39)).toBe('F')
    expect(toRank(25)).toBe('F')
    expect(toRank(24)).toBe('G')
    expect(toRank(1)).toBe('G')
  })
})

describe('trajectoryStars', () => {
  it('弾道を星4つで表す', () => {
    expect(trajectoryStars(1)).toBe('★☆☆☆')
    expect(trajectoryStars(4)).toBe('★★★★')
  })
})

describe('overallRating', () => {
  it('野手・投手ともに0〜100に収まる', () => {
    const rng = createRng(2026)
    for (let i = 0; i < 200; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 2 })
      const rating = overallRating(player)
      expect(rating).toBeGreaterThanOrEqual(0)
      expect(rating).toBeLessThanOrEqual(100)
    }
  })

  it('能力が高い選手ほど評価が高い', () => {
    const rng = createRng(7)
    const weak = createPlayer(rng, { id: 'weak', grade: 1, isPitcher: false, talentBonus: -15 })
    const strong = createPlayer(rng, { id: 'strong', grade: 3, isPitcher: false, talentBonus: 30 })
    expect(overallRating(strong)).toBeGreaterThan(overallRating(weak))
  })
})
