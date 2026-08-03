import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_MAX, groundUpgradeCost } from './facility'
import { monthlyFunds } from './funds'
import { EQUIPMENT_PER_PLAYER, GROUND_UPKEEP_PER_LEVEL, monthlyUpkeep } from './upkeep'

describe('monthlyUpkeep', () => {
  it('部員が多いほど備品費が高い', () => {
    expect(monthlyUpkeep(24, 1).equipment).toBe(24 * EQUIPMENT_PER_PLAYER)
    expect(monthlyUpkeep(40, 1).equipment).toBeGreaterThan(monthlyUpkeep(24, 1).equipment)
  })

  it('Lv1は設備維持費がかからない（土のグラウンドなので）', () => {
    expect(monthlyUpkeep(24, 1).ground).toBe(0)
  })

  it('整備するほど設備維持費が上がる', () => {
    expect(monthlyUpkeep(24, 5).ground).toBe(4 * GROUND_UPKEEP_PER_LEVEL)
    expect(monthlyUpkeep(24, 50).ground).toBeGreaterThan(monthlyUpkeep(24, 20).ground)
  })

  it('範囲外のレベルは1〜99に丸める', () => {
    expect(monthlyUpkeep(24, 0).ground).toBe(0)
    expect(monthlyUpkeep(24, 500).ground).toBe(monthlyUpkeep(24, GROUND_LEVEL_MAX).ground)
  })

  it('合計は内訳の和', () => {
    const upkeep = monthlyUpkeep(30, 4)
    expect(upkeep.total).toBe(upkeep.equipment + upkeep.ground)
  })
})

describe('収支の釣り合い', () => {
  /**
   * 序盤に赤字だと、何もしていないのに信頼度が下がり続けることになる。
   * 初期状態（評判20・部員24人・Lv1）では必ず黒字であること。
   */
  it('初期状態では支給が維持費を上回る', () => {
    expect(monthlyFunds(20)).toBeGreaterThan(monthlyUpkeep(24, 1).total)
  })

  it('部員が最大規模になっても、Lv1なら黒字を保てる', () => {
    // 部員40人は評判が高くないと集まらないので、評判60で見る
    expect(monthlyFunds(60)).toBeGreaterThan(monthlyUpkeep(40, 1).total)
  })

  /**
   * 設備を最大まで整えると、支給だけではほとんど余らない。
   * 「強化の元手は大会の賞金」という関係にするための狙いどおりの値。
   */
  it('評判100・最大整備でも支給で維持できる（ただし余裕は小さい）', () => {
    const surplus = monthlyFunds(100) - monthlyUpkeep(40, GROUND_LEVEL_MAX).total
    expect(surplus).toBeGreaterThan(0)
    expect(surplus).toBeLessThan(monthlyFunds(100) / 2)
  })

  it('整備費に対して維持費は十分小さい（すぐ元が取れなくなる額ではない）', () => {
    // 1段階ぶんの維持費を1年払っても、その段階の整備費より安い
    expect(GROUND_UPKEEP_PER_LEVEL * 12).toBeLessThan(groundUpgradeCost(10)!)
  })
})
