import { describe, expect, it } from 'vitest'
import { createRng, nextFloat } from './random'

describe('nextFloat', () => {
  it('0以上1未満の値を返す', () => {
    let state = 12345
    for (let i = 0; i < 1000; i++) {
      const [value, next] = nextFloat(state)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      state = next
    }
  })

  it('同じ状態からは必ず同じ値が出る（純粋関数である）', () => {
    expect(nextFloat(42)).toEqual(nextFloat(42))
  })
})

describe('createRng', () => {
  it('同じシードなら同じ結果になる', () => {
    const a = createRng(2024)
    const b = createRng(2024)
    const seqA = [a.int(1, 5), a.int(1, 5), a.int(1, 5)]
    const seqB = [b.int(1, 5), b.int(1, 5), b.int(1, 5)]
    expect(seqA).toEqual(seqB)
  })

  it('違うシードなら違う結果になる', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.int(1, 100))
    const seqB = Array.from({ length: 10 }, () => b.int(1, 100))
    expect(seqA).not.toEqual(seqB)
  })

  it('状態を引き継げば途中から再開できる（セーブ&ロード相当）', () => {
    const original = createRng(777)
    original.int(1, 5)
    original.int(1, 5)
    const savedState = original.state

    // 保存した状態から復元したものは、続きが一致する
    const restored = createRng(savedState)
    expect(restored.int(1, 5)).toBe(original.int(1, 5))
    expect(restored.int(1, 5)).toBe(original.int(1, 5))
  })

  it('int() は両端を含む範囲に収まる', () => {
    const rng = createRng(99)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const n = rng.int(1, 5)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(5)
      expect(Number.isInteger(n)).toBe(true)
      seen.add(n)
    }
    // 1〜5がすべて出現するはず
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('int() は min > max ならエラー', () => {
    const rng = createRng(1)
    expect(() => rng.int(5, 1)).toThrow()
  })

  it('chance(0) は常にfalse、chance(1) は常にtrue', () => {
    const rng = createRng(555)
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })

  it('chance() の発生率がおおむね確率どおりになる', () => {
    const rng = createRng(3131)
    let hits = 0
    const trials = 10000
    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.3)) hits++
    }
    expect(hits / trials).toBeGreaterThan(0.27)
    expect(hits / trials).toBeLessThan(0.33)
  })

  it('pick() は配列の要素を返す', () => {
    const rng = createRng(8)
    const items = ['打撃', '走塁', '守備'] as const
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items))
    }
  })

  it('pick() は空配列でエラー', () => {
    const rng = createRng(1)
    expect(() => rng.pick([])).toThrow()
  })

  it('weighted() は重みの大きい方が多く選ばれる', () => {
    const rng = createRng(20260801)
    const items = [
      { value: 'common', weight: 9 },
      { value: 'rare', weight: 1 },
    ]
    let rareCount = 0
    const trials = 10000
    for (let i = 0; i < trials; i++) {
      if (rng.weighted(items) === 'rare') rareCount++
    }
    // 期待値は10%
    expect(rareCount / trials).toBeGreaterThan(0.08)
    expect(rareCount / trials).toBeLessThan(0.12)
  })

  it('weighted() は重み0の要素を選ばない', () => {
    const rng = createRng(64)
    const items = [
      { value: 'yes', weight: 1 },
      { value: 'never', weight: 0 },
    ]
    for (let i = 0; i < 500; i++) {
      expect(rng.weighted(items)).toBe('yes')
    }
  })

  it('shuffle() は元の配列を変更せず、同じ要素を保持する', () => {
    const rng = createRng(1234)
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const shuffled = rng.shuffle(original)

    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) // 非破壊
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original) // 要素は同じ
    expect(shuffled).not.toEqual(original) // 並びは変わっている
  })

  it('state を読むと現在の内部状態が取れる', () => {
    const rng = createRng(100)
    const before = rng.state
    rng.float()
    expect(rng.state).not.toBe(before)
  })
})
