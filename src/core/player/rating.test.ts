import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createPlayer } from './createPlayer'
import { overallRating, pitchingRating, toRank, trajectoryAngle, velocityRank } from './rating'
import { PITCH_DIRECTION_ORDER } from './pitchDefs'
import { velocityScore, VELOCITY_MAX } from '@/core/types/player'
import type { PitchingAbilities } from '@/core/types/player'

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

describe('trajectoryAngle', () => {
  it('弾道を打球の角度で表す', () => {
    // **打球が下に飛ぶことは無い。** 1は水平から始める
    expect(trajectoryAngle(1)).toBe(0)
    expect(trajectoryAngle(3)).toBe(45)
    expect(trajectoryAngle(4)).toBe(65)
  })

  it('弾道が上がるほど角度も上がる', () => {
    for (let value = 1; value < 4; value++) {
      expect(trajectoryAngle(value + 1)).toBeGreaterThan(trajectoryAngle(value))
    }
  })

  it('真上には向けない（真上はポップフライで良い打球ではない）', () => {
    expect(trajectoryAngle(4)).toBeLessThan(90)
  })

  it('範囲外でも落ちない', () => {
    expect(trajectoryAngle(0)).toBe(0)
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

describe('velocityRank', () => {
  /**
   * **球速のランクは他の能力より遠い。**
   * 変化球やスタミナは練習で90まで届くが、160km/h（S）は高校生ではまず出ない。
   */
  it('5km/h ごとに1ランク上がる', () => {
    expect(velocityRank(129)).toBe('G')
    expect(velocityRank(130)).toBe('F')
    expect(velocityRank(135)).toBe('E')
    expect(velocityRank(140)).toBe('D')
    expect(velocityRank(145)).toBe('C')
    expect(velocityRank(150)).toBe('B')
    expect(velocityRank(155)).toBe('A')
    expect(velocityRank(160)).toBe('S')
  })

  it('境界の1km/h手前は下のランクのまま', () => {
    for (const km of [134, 139, 144, 149, 154, 159]) {
      expect(velocityRank(km)).not.toBe(velocityRank(km + 1))
    }
  })

  it('表示のランクと尺度が一致する（画面と判定でずれない）', () => {
    for (let km = 100; km <= 170; km++) {
      expect(velocityRank(km)).toBe(toRank(velocityScore(km)))
    }
  })

  it('球速が上がるほど尺度も上がる', () => {
    for (let km = 100; km < 170; km++) {
      expect(velocityScore(km + 1)).toBeGreaterThanOrEqual(velocityScore(km))
    }
    expect(velocityScore(200)).toBe(100)
    expect(velocityScore(50)).toBe(0)
  })

  it('上限まで育てればSに届く', () => {
    // 届かない最高ランクは、無いのと同じ
    expect(velocityRank(VELOCITY_MAX)).toBe('S')
  })
})

describe('投手の総合', () => {
  const base: PitchingAbilities = {
    velocity: 140,
    control: 60,
    stamina: 60,
    life: 60,
    sharpness: 60,
    pitches: [{ direction: 'left', name: 'スライダー', level: 2 }],
  }

  it('ノビとキレも総合に効く', () => {
    expect(pitchingRating({ ...base, life: 90 })).toBeGreaterThan(pitchingRating(base))
    expect(pitchingRating({ ...base, sharpness: 90 })).toBeGreaterThan(pitchingRating(base))
  })

  it('球種が多いほど総合が高い', () => {
    // 3球種を持つ投手と、スライダー1本の投手が同じ総合で並んではいけない
    const rich: PitchingAbilities = {
      ...base,
      pitches: [
        { direction: 'left', name: 'スライダー', level: 2 },
        { direction: 'down', name: 'フォーク', level: 2 },
        { direction: 'lowerLeft', name: 'カーブ', level: 2 },
      ],
    }
    expect(pitchingRating(rich)).toBeGreaterThan(pitchingRating(base))
  })

  it('変化量が大きいほど総合が高い', () => {
    const sharp: PitchingAbilities = {
      ...base,
      pitches: [{ direction: 'left', name: 'スライダー', level: 6 }],
    }
    expect(pitchingRating(sharp)).toBeGreaterThan(pitchingRating(base))
  })

  it('持ち球ぶんの上乗せには上限がある（集めただけで総合は跳ね上がらない）', () => {
    const everything: PitchingAbilities = {
      ...base,
      pitches: PITCH_DIRECTION_ORDER.map((direction) => ({
        direction,
        name: direction,
        level: 7,
      })),
    }
    expect(pitchingRating(everything) - pitchingRating(base)).toBeLessThanOrEqual(6)
  })
})
