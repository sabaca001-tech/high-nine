import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { REGIONS } from '@/core/types/region'
import { createTraits, shiftTraits } from './scoutTraits'

describe('createTraits', () => {
  it('全49県ぶん決まる', () => {
    const traits = createTraits(createRng(1))
    for (const region of REGIONS) {
      expect(traits[region.id]).toBeDefined()
    }
  })
})

describe('shiftTraits', () => {
  it('すべての県で前年と違う傾向になる', () => {
    const before = createTraits(createRng(2))
    const after = shiftTraits(createRng(3), before)

    for (const region of REGIONS) {
      expect(after[region.id]).not.toBe(before[region.id])
    }
  })

  it('何年繰り返しても全県ぶん埋まったまま', () => {
    const rng = createRng(4)
    let traits = createTraits(rng)
    for (let year = 0; year < 10; year++) {
      traits = shiftTraits(rng, traits)
    }
    for (const region of REGIONS) {
      expect(traits[region.id]).toBeDefined()
    }
  })

  it('同じ県がずっと同じ傾向で固定されない', () => {
    const rng = createRng(5)
    let traits = createTraits(rng)
    const seen = new Set<string>()
    for (let year = 0; year < 12; year++) {
      traits = shiftTraits(rng, traits)
      seen.add(traits.kanagawa)
    }
    expect(seen.size).toBeGreaterThan(2)
  })
})
