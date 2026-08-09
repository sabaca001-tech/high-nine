/**
 * セーブの枠のテスト。
 *
 * localStorage は core には無いが、`src/save` は永続化の層なので使ってよい
 * （CLAUDE.md 1.1）。ここでは最小限の偽物を用意して振る舞いだけを確かめる。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '@/core/gameEngine'
import {
  clearSave,
  DEFAULT_SLOT,
  hasAnySave,
  hasSave,
  listSlots,
  load,
  save,
  SLOT_COUNT,
} from './storage'

/** localStorage の最小限の代用品 */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
    /** テストから中身を覗くため */
    raw: map,
  }
}

let store = fakeStorage()

beforeEach(() => {
  store = fakeStorage()
  vi.stubGlobal('localStorage', store)
})

const game = createInitialState({ seed: 1, schoolName: 'テスト第一高校' })

describe('セーブの枠', () => {
  it('枠ごとに別々に保存される', () => {
    save({ ...game, schoolName: '1番の学校' }, 1)
    save({ ...game, schoolName: '2番の学校' }, 2)

    expect(load(1)!.schoolName).toBe('1番の学校')
    expect(load(2)!.schoolName).toBe('2番の学校')
    expect(load(3)).toBeNull()
  })

  it('1枠目のキーは1スロットだった頃と同じ（既存のセーブが読める）', () => {
    save(game, DEFAULT_SLOT)
    expect(store.raw.has('hs-baseball-sim:save:v1')).toBe(true)
  })

  it('削除しても他の枠は残る', () => {
    save(game, 1)
    save(game, 2)
    clearSave(1)

    expect(hasSave(1)).toBe(false)
    expect(hasSave(2)).toBe(true)
    expect(hasAnySave()).toBe(true)
  })

  it('すべて空なら hasAnySave は false', () => {
    expect(hasAnySave()).toBe(false)
    save(game, 3)
    expect(hasAnySave()).toBe(true)
  })

  it('listSlots は枠の数だけ返す', () => {
    save(game, 2)
    const slots = listSlots()

    expect(slots).toHaveLength(SLOT_COUNT)
    expect(slots.map((s) => s.slot)).toEqual([1, 2, 3])
    expect(slots[0].state).toBeNull()
    expect(slots[1].state).not.toBeNull()
  })

  it('壊れたデータはバックアップから復元する', () => {
    save(game, 1)
    // 2回目の保存でバックアップが作られる
    save({ ...game, year: 2 }, 1)
    store.raw.set('hs-baseball-sim:save:v1', '{壊れている')

    const restored = load(1)
    expect(restored).not.toBeNull()
    expect(restored!.year).toBe(1)
  })
})

describe('他校の詰め替え', () => {
  it('保存して読み直しても他校がそのまま戻る', () => {
    save(game, DEFAULT_SLOT)
    const loaded = load(DEFAULT_SLOT)!

    expect(loaded.rivals).toEqual(game.rivals)
    expect(loaded.rivals.length).toBe(game.rivals.length)
  })

  it('保存された JSON はキー名を持たない配列になっている', () => {
    // **キー名が中身より重い。** 2800校ぶんのキー名だけで200KB近くを占める
    save(game, DEFAULT_SLOT)
    const raw = store.raw.get('hs-baseball-sim:save:v1')!

    expect(raw).toContain('"rivalsPacked"')
    expect(raw).not.toContain('"rosterSeed"')
    expect(raw.length).toBeLessThan(JSON.stringify(game).length)
  })

  it('詰められていない古いセーブもそのまま読める', () => {
    // v37までのセーブは rivals をそのまま持っている
    store.raw.set('hs-baseball-sim:save:v1', JSON.stringify(game))
    const loaded = load(DEFAULT_SLOT)!

    expect(loaded.rivals).toEqual(game.rivals)
  })
})
