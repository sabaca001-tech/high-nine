import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { HAND_SIZE } from '@/core/types/card'
import { PRACTICE_DEFS } from './cardDefs'
import type { PracticeKind } from '@/core/types/card'
import { drawCard, drawHand, replaceCard } from './drawCards'

describe('drawCard', () => {
  it('数字は1〜5（進むマス数）、種別は定義済みのものになる', () => {
    const rng = createRng(1)
    const kinds = Object.keys(PRACTICE_DEFS)
    for (let i = 0; i < 500; i++) {
      const card = drawCard(rng, i)
      expect(card.number).toBeGreaterThanOrEqual(1)
      expect(card.number).toBeLessThanOrEqual(5)
      expect(kinds).toContain(card.kind)
      expect(card.id).toBe(`card-${i}`)
    }
  })

  it('レアカードは稀に出る（おおむね8%）', () => {
    const rng = createRng(3939)
    let rare = 0
    const trials = 5000
    for (let i = 0; i < trials; i++) {
      if (drawCard(rng, i).isRare) rare++
    }
    expect(rare / trials).toBeGreaterThan(0.05)
    expect(rare / trials).toBeLessThan(0.11)
  })
})

describe('drawHand', () => {
  it('5枚配られ、id が重複しない', () => {
    const hand = drawHand(createRng(10), 0)
    expect(hand).toHaveLength(HAND_SIZE)
    expect(new Set(hand.map((c) => c.id)).size).toBe(HAND_SIZE)
  })

  it('同じシードなら同じ手札になる', () => {
    expect(drawHand(createRng(42), 0)).toEqual(drawHand(createRng(42), 0))
  })
})

describe('replaceCard', () => {
  it('使ったカードが消え、枚数は変わらない', () => {
    const rng = createRng(5)
    const hand = drawHand(rng, 0)
    const used = hand[2]

    const next = replaceCard(rng, hand, used.id, 100)

    expect(next).toHaveLength(HAND_SIZE)
    expect(next.find((c) => c.id === used.id)).toBeUndefined()
    expect(next[next.length - 1].id).toBe('card-100')
  })

  it('元の手札を変更しない', () => {
    const rng = createRng(6)
    const hand = drawHand(rng, 0)
    const snapshot = [...hand]
    replaceCard(rng, hand, hand[0].id, 100)
    expect(hand).toEqual(snapshot)
  })

  it('存在しないidを渡しても枚数は変わらない', () => {
    const rng = createRng(7)
    const hand = drawHand(rng, 0)
    const next = replaceCard(rng, hand, 'unknown', 100)
    expect(next).toHaveLength(hand.length)
  })

  it('枚数を増やすと、増えたぶんまとめて補充される', () => {
    const rng = createRng(8)
    const hand = drawHand(rng, 0, 5)
    const next = replaceCard(rng, hand, hand[0].id, 100, 8)

    expect(next).toHaveLength(8)
    expect(new Set(next.map((card) => card.id)).size).toBe(8)
    expect(next.find((card) => card.id === hand[0].id)).toBeUndefined()
  })

  it('枚数を減らしても、残った手札は捨てない', () => {
    const rng = createRng(9)
    const hand = drawHand(rng, 0, 8)
    const next = replaceCard(rng, hand, hand[0].id, 100, 5)

    // 使った1枚だけが消え、残りは持ったまま
    expect(next).toHaveLength(7)
  })
})

describe('練習系とそれ以外の割合', () => {
  it('引いたカードのおよそ7割が練習系になる', () => {
    const rng = createRng(4242)
    let practice = 0
    const trials = 4000

    for (let i = 0; i < trials; i++) {
      if (PRACTICE_DEFS[drawCard(rng, i).kind].gains.length > 0) practice += 1
    }

    const rate = practice / trials
    expect(rate).toBeGreaterThan(0.64)
    expect(rate).toBeLessThan(0.76)
  })

  it('練習器具を買うと練習系の割合が上がる', () => {
    const rate = (unlocked: PracticeKind[]): number => {
      const rng = createRng(77)
      let practice = 0
      const trials = 3000
      for (let i = 0; i < trials; i++) {
        if (PRACTICE_DEFS[drawCard(rng, i, unlocked).kind].gains.length > 0) practice += 1
      }
      return practice / trials
    }

    expect(rate(['teeBatting', 'weight', 'machineBatting'])).toBeGreaterThan(rate([]))
  })
})
