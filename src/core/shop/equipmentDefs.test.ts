import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import { drawCard, drawHand } from '@/core/card/drawCards'
import type { PracticeKind } from '@/core/types/card'
import {
  EQUIPMENTS,
  equipmentFor,
  findEquipment,
  requiresEquipment,
  unlockedKinds,
} from './equipmentDefs'

describe('練習器具の定義', () => {
  it('全ての器具が実在する練習を解放する', () => {
    for (const equipment of EQUIPMENTS) {
      expect(PRACTICE_DEFS[equipment.unlocks]).toBeDefined()
      expect(requiresEquipment(equipment.unlocks)).toBe(true)
      expect(equipmentFor(equipment.unlocks)).toEqual(equipment)
    }
  })

  it('1つの練習を解放する器具は1つだけ', () => {
    const kinds = EQUIPMENTS.map((equipment) => equipment.unlocks)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('idは重複しない', () => {
    const ids = EQUIPMENTS.map((equipment) => equipment.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('壊れる確率は現実的な範囲（毎月壊れては買い直しばかりになる）', () => {
    for (const equipment of EQUIPMENTS) {
      expect(equipment.breakChance).toBeGreaterThan(0)
      expect(equipment.breakChance).toBeLessThanOrEqual(0.2)
    }
  })

  it('知らないidはundefined', () => {
    expect(findEquipment('unknown')).toBeUndefined()
  })
})

describe('unlockedKinds', () => {
  it('持っている器具ぶんの練習を返す', () => {
    expect(unlockedKinds([])).toEqual([])
    expect(unlockedKinds(['bench'])).toEqual([equipmentFor('weight')!.unlocks])
  })

  it('知らないidは無視する', () => {
    expect(unlockedKinds(['unknown', 'bench'])).toHaveLength(1)
  })
})

describe('カードの抽選', () => {
  /** 500枚引いて出た種別を集める */
  function drawnKinds(unlocked: PracticeKind[]): Set<PracticeKind> {
    const rng = createRng(42)
    const kinds = new Set<PracticeKind>()
    for (let i = 0; i < 500; i++) {
      kinds.add(drawCard(rng, i, unlocked).kind)
    }
    return kinds
  }

  it('器具を持っていなければ、その練習は出ない', () => {
    const kinds = drawnKinds([])
    for (const equipment of EQUIPMENTS) {
      expect(kinds.has(equipment.unlocks)).toBe(false)
    }
  })

  it('器具を持っていれば、その練習が出るようになる', () => {
    expect(drawnKinds(['weight']).has('weight')).toBe(true)
  })

  it('器具が要らない練習は最初から出る', () => {
    const kinds = drawnKinds([])
    expect(kinds.has('batting')).toBe(true)
    expect(kinds.has('rest')).toBe(true)
  })

  it('手札にも反映される', () => {
    const rng = createRng(7)
    const hand = drawHand(rng, 0, 8, [])
    for (const card of hand) {
      expect(requiresEquipment(card.kind)).toBe(false)
    }
  })
})
