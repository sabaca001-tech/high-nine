import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import {
  addStar,
  bestStarRating,
  localRivals,
  NATIONAL_RIVALS,
  nationalRivals,
  upperStarRatingAtRank,
  advanceRival,
  createRivals,
  pickRivalFor,
  RIVALS_PER_REGION,
  schoolForProspect,
} from './rivals'

const rivals = createRivals(createRng(11), 'kanagawa')

describe('starRatingAtRank', () => {
  it('上から数えた順位の総合を返す（U18の当落線）', () => {
    const ratings = rivals
      .flatMap((school) => school.stars.filter((star) => star.grade >= 2))
      .map((star) => star.rating)
      .sort((a, b) => b - a)

    expect(upperStarRatingAtRank(rivals, 0)).toBe(ratings[0])
    expect(upperStarRatingAtRank(rivals, 17)).toBe(ratings[17])
  })

  it('人数が足りなければいちばん下を返す', () => {
    expect(upperStarRatingAtRank(rivals, 9999)).toBeGreaterThan(0)
    expect(upperStarRatingAtRank([], 0)).toBe(0)
  })

  it('順位が下がるほど総合も下がる', () => {
    expect(upperStarRatingAtRank(rivals, 17)).toBeLessThanOrEqual(
      upperStarRatingAtRank(rivals, 0),
    )
  })
})

describe('bestStarRating', () => {
  it('県内でいちばん強い注目選手を返す（U18の選考基準）', () => {
    const highest = Math.max(...rivals.flatMap((s) => s.stars.map((star) => star.rating)))
    expect(bestStarRating(rivals)).toBe(highest)
  })

  it('学校がいなければ0', () => {
    expect(bestStarRating([])).toBe(0)
  })
})

describe('createRivals', () => {
  it('県内と県外をまとめて作る', () => {
    expect(rivals).toHaveLength(RIVALS_PER_REGION + NATIONAL_RIVALS)
    expect(localRivals(rivals, 'kanagawa')).toHaveLength(RIVALS_PER_REGION)
    expect(nationalRivals(rivals, 'kanagawa')).toHaveLength(NATIONAL_RIVALS)
  })

  it('県外の学校は1県に1校まで（全国に散らす）', () => {
    const regions = nationalRivals(rivals, 'kanagawa').map((school) => school.regionId)
    expect(new Set(regions).size).toBe(regions.length)
    expect(regions).not.toContain('kanagawa')
  })

  it('県外の学校のほうが地力が高い（甲子園に出てくる顔ぶれ）', () => {
    const avg = (list: typeof rivals) =>
      list.reduce((total, school) => total + school.tradition, 0) / list.length

    expect(avg(nationalRivals(rivals, 'kanagawa'))).toBeGreaterThan(
      avg(localRivals(rivals, 'kanagawa')),
    )
  })

  it('校名が重複しない', () => {
    expect(new Set(rivals.map((school) => school.name)).size).toBe(rivals.length)
  })

  it('県内にも必ず1校は強豪がいる（目標になる相手を置く）', () => {
    const local = localRivals(rivals, 'kanagawa')
    expect(Math.max(...local.map((school) => school.tradition))).toBeGreaterThanOrEqual(16)
  })

  it('JSONに変換できる（セーブデータに入れられる）', () => {
    expect(JSON.parse(JSON.stringify(rivals))).toEqual(rivals)
  })
})

describe('advanceRival', () => {
  it('注目選手は進級し、3年生は卒業して補充される', () => {
    const rng = createRng(5)
    const before = rivals[0]
    const after = advanceRival(rng, before, 2).school

    expect(after.stars.length).toBe(before.stars.length)
    // 3年生だった選手は居なくなっている
    for (const star of before.stars.filter((s) => s.grade === 3)) {
      expect(after.stars.map((s) => s.id)).not.toContain(star.id)
    }
  })

  it('戦力は地力の周りに留まる（際限なく強くならない）', () => {
    const rng = createRng(9)
    let school = rivals[0]

    for (let year = 2; year <= 30; year++) {
      school = advanceRival(rng, school, year).school
      // 地力 ± ゆらぎ の範囲を大きく外れない
      expect(Math.abs(school.strength - school.tradition)).toBeLessThan(20)
    }
  })

  it('注目選手は在学中ずっと伸びる（自分の学校と同じように育つ）', () => {
    const rng = createRng(3)
    // 1年生の注目選手を1人つかまえて、卒業まで追いかける
    let school = rivals.find((s) => s.stars.some((star) => star.grade === 1))!
    const target = school.stars.find((star) => star.grade === 1)!
    let previous = target.rating

    for (let year = 2; year <= 3; year++) {
      school = advanceRival(rng, school, year).school
      const now = school.stars.find((star) => star.id === target.id)!
      expect(now.rating).toBeGreaterThan(previous)
      previous = now.rating
    }
  })
})

describe('pickRivalFor', () => {
  it('求めた強さに近い学校を当てる', () => {
    const rng = createRng(21)
    const strong = pickRivalFor(rng, rivals, 20)!
    const weak = pickRivalFor(rng, rivals, -10)!

    expect(strong.strength).toBeGreaterThan(weak.strength)
  })

  it('学校がいなければ null（全国大会などは使い捨ての相手にする）', () => {
    expect(pickRivalFor(createRng(1), [], 0)).toBeNull()
  })
})

describe('schoolForProspect', () => {
  it('良い選手ほど強い学校が獲る', () => {
    const rng = createRng(31)
    let strongSum = 0
    let weakSum = 0

    for (let i = 0; i < 40; i++) {
      strongSum += schoolForProspect(rng, rivals, 80)!.strength
      weakSum += schoolForProspect(rng, rivals, 30)!.strength
    }

    expect(strongSum).toBeGreaterThan(weakSum)
  })
})

describe('addStar', () => {
  it('選手が入ると戦力も上がる', () => {
    const before = rivals[3]
    const after = addStar(before, {
      id: 'x',
      name: '新入 生',
      grade: 1,
      isPitcher: false,
      rating: 72,
    })

    expect(after.stars.length).toBe(before.stars.length + 1)
    expect(after.strength).toBeGreaterThan(before.strength)
  })
})
