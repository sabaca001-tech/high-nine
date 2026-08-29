import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { breakEquipmentInUse, EQUIPMENTS } from './equipmentDefs'

describe('breakEquipmentInUse', () => {
  const owned = EQUIPMENTS.map((equipment) => equipment.id)

  it('使っていない器具は壊れない', () => {
    /*
     * **月ごとに判定していた頃は、一度も使っていない器具が勝手に壊れた。**
     * 買ったのに手札に出ないまま消えることがあり、
     * 「使うから傷む」という当たり前の因果が無かった。
     */
    const rng = createRng(1)
    for (let i = 0; i < 500; i++) {
      // 器具の要らない練習（守備）を選び続ける
      expect(breakEquipmentInUse(rng, owned, 'fielding')).toBeNull()
    }
  })

  it('使った器具だけが壊れる', () => {
    const rng = createRng(2)
    const broken = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const item = breakEquipmentInUse(rng, owned, 'teeBatting')
      if (item) broken.add(item.id)
    }

    expect(broken.size).toBe(1)
    expect([...broken][0]).toBe('tee')
  })

  it('持っていない器具の練習では何も起きない', () => {
    expect(breakEquipmentInUse(createRng(3), [], 'teeBatting')).toBeNull()
  })

  it('壊れる確率は定義どおり', () => {
    const rng = createRng(4)
    const trials = 4000
    let broke = 0
    for (let i = 0; i < trials; i++) {
      if (breakEquipmentInUse(rng, ['tee'], 'teeBatting')) broke++
    }

    const rate = broke / trials
    const expected = EQUIPMENTS.find((equipment) => equipment.id === 'tee')!.breakChance
    expect(Math.abs(rate - expected)).toBeLessThan(0.02)
  })
})
