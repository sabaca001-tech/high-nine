/** 他県の1年ぶんの結果（強豪は戦績で決まる） */

import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createRivals, localRivals, prestigeOf, titlesOf } from './rivals'
import { runRivalSeason } from './rivalSeason'
import { REGIONS } from '@/core/types/region'

const schools = createRivals(createRng(7), 'kanagawa')

/**
 * その年に増えたぶんだけを見る。
 * **学校は最初から戦績を持っている**（`initialTitles`）ので、
 * 絶対値で数えると開始時の歴史まで数えてしまう。
 */
function gained(
  before: typeof schools,
  after: typeof schools,
  key: 'region' | 'nationals' | 'championships',
): typeof schools {
  const was = new Map(before.map((school) => [school.id, titlesOf(school)[key]]))
  return after.filter((school) => titlesOf(school)[key] > (was.get(school.id) ?? 0))
}

describe('runRivalSeason', () => {
  it('毎年、各県に1校ずつ優勝校が出る', () => {
    const { schools: after } = runRivalSeason(createRng(1), schools, 'kanagawa', 2, false)
    const champions = gained(schools, after, 'region')

    // 47都道府県ぶん（自県も含む）
    expect(champions.length).toBe(REGIONS.length)
    // 同じ県から2校は出ない
    expect(new Set(champions.map((school) => school.regionId)).size).toBe(REGIONS.length)
  })

  it('自校が県を勝った年は、自県の他校に印が付かない', () => {
    const { schools: after } = runRivalSeason(createRng(1), schools, 'kanagawa', 2, true)
    const local = localRivals(gained(schools, after, 'region'), 'kanagawa')

    expect(local).toHaveLength(0)
  })

  it('全国制覇はその年の代表から1校だけ', () => {
    const { schools: after } = runRivalSeason(createRng(3), schools, 'kanagawa', 2, false)
    const winners = gained(schools, after, 'championships')

    expect(winners.length).toBe(1)
    // 全国制覇した学校は、その年に甲子園へ出ている
    expect(gained(schools, after, 'nationals').map((school) => school.id)).toContain(winners[0].id)
  })

  it('積み上がるので、勝ち続けた学校ほど格が上がる', () => {
    let current = schools
    const rng = createRng(9)
    for (let year = 2; year <= 12; year++) {
      current = runRivalSeason(rng, current, 'kanagawa', year, false).schools
    }

    const best = [...current].sort((a, b) => prestigeOf(b) - prestigeOf(a))[0]
    expect(prestigeOf(best)).toBeGreaterThan(0)
    // 11年ぶんの県大会が全国に散っている（開始時の戦績はここでは数えない）
    const totalOf = (list: typeof current) =>
      list.reduce((sum, school) => sum + titlesOf(school).region, 0)
    expect(totalOf(current) - totalOf(schools)).toBe(REGIONS.length * 11)
  })

  it('力のある学校のほうがよく勝つ', () => {
    let current = schools
    const rng = createRng(21)
    for (let year = 2; year <= 21; year++) {
      current = runRivalSeason(rng, current, 'kanagawa', year, false).schools
    }

    const withTitles = gained(schools, current, 'region')
    const average = (list: typeof current) =>
      list.reduce((sum, school) => sum + school.strength, 0) / list.length

    // 優勝経験校の戦力は、全体の平均よりはっきり高い
    expect(average(withTitles)).toBeGreaterThan(average(current) + 5)
  })
})
