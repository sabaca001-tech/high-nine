import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { REGIONS } from '@/core/types/region'
import { makeSchoolName, placesOf } from './rivalDefs'

describe('校名の生成', () => {
  it('すべての県に地名が用意されている', () => {
    for (const region of REGIONS) {
      expect(placesOf(region.id).length).toBeGreaterThan(0)
    }
  })

  it('その県らしい地名が多く混ざる', () => {
    const places = placesOf('kanagawa')
    const rng = createRng(3)
    let local = 0
    const trials = 200

    for (let i = 0; i < trials; i++) {
      const name = makeSchoolName(rng, [], 'kanagawa')
      if (places.some((place) => name.startsWith(place))) local += 1
    }

    // 全部を地名にはしない（実在校に寄りすぎるため）
    expect(local / trials).toBeGreaterThan(0.6)
    expect(local / trials).toBeLessThan(0.9)
  })

  it('県ごとに違う顔ぶれになる', () => {
    const names = (regionId: Parameters<typeof makeSchoolName>[2]) => {
      const rng = createRng(7)
      return Array.from({ length: 10 }, () => makeSchoolName(rng, [], regionId))
    }

    expect(names('kanagawa')).not.toEqual(names('okinawa'))
  })

  it('県を指定しなくても名前は作れる', () => {
    const name = makeSchoolName(createRng(1), [])
    expect(name.length).toBeGreaterThan(2)
  })

  it('すでに使われている名前は避ける', () => {
    const rng = createRng(11)
    const used: string[] = []

    for (let i = 0; i < 20; i++) {
      const name = makeSchoolName(rng, used, 'osaka')
      expect(used).not.toContain(name)
      used.push(name)
    }
  })
})
