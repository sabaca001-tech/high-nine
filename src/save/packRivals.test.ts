import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { addResult, addStar, createRivals, recordOf, starsOf } from '@/core/rival/rivals'
import { packRivals, unpackRivals } from './packRivals'

const schools = createRivals(createRng(5), 'kanagawa')

describe('packRivals', () => {
  it('詰めて戻すと元に戻る', () => {
    expect(unpackRivals(packRivals(schools))).toEqual(schools)
  })

  it('注目選手・対戦成績つきでも元に戻る', () => {
    const withStar = addStar(schools[0], {
      id: 'chased',
      name: '追いかけた 選手',
      grade: 2,
      isPitcher: true,
      rating: 72,
      enrolledYear: 4,
      skillId: 'ace-heart',
      scouted: true,
    })
    const withRecord = addResult(withStar, { year: 3, label: '夏の大会 決勝', outcome: 'lose' })
    const [restored] = unpackRivals(packRivals([withRecord]))

    expect(restored).toEqual(withRecord)
    expect(starsOf(restored).some((star) => star.scouted)).toBe(true)
    expect(recordOf(restored).last?.label).toBe('夏の大会 決勝')
  })

  it('JSONが半分以下になる', () => {
    // **キー名が中身より重い。** 2800校ぶんのキー名だけで200KB近くを占める
    const before = JSON.stringify(schools).length
    const after = JSON.stringify(packRivals(schools)).length
    expect(after).toBeLessThan(before * 0.5)
  })

  it('壊れたデータでも落ちない', () => {
    expect(unpackRivals([])).toEqual([])
    expect(unpackRivals('だめ' as unknown as unknown[])).toEqual([])
    expect(unpackRivals([null, 3])).toEqual([])
  })
})
