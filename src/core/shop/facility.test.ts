import { describe, expect, it } from 'vitest'
import {
  clampGroundLevel,
  GROUND_DECAY_STEPS,
  GROUND_LEVEL_MAX,
  GROUND_LEVEL_MIN,
  groundDecayChance,
  groundMultiplier,
  groundName,
  groundUpgradeCost,
  groundUpgradeCostFor,
} from './facility'

describe('グラウンドの段階', () => {
  it('1〜99に丸められる', () => {
    expect(clampGroundLevel(0)).toBe(GROUND_LEVEL_MIN)
    expect(clampGroundLevel(500)).toBe(GROUND_LEVEL_MAX)
    expect(clampGroundLevel(42)).toBe(42)
  })

  it('段階が上がるほど練習効率が上がる', () => {
    expect(groundMultiplier(1)).toBe(1)
    expect(groundMultiplier(50)).toBeGreaterThan(groundMultiplier(10))
    expect(groundMultiplier(99)).toBeGreaterThan(groundMultiplier(50))
  })

  it('序盤ほど1段階の効きが大きい（平方根カーブ）', () => {
    const early = groundMultiplier(11) - groundMultiplier(1)
    const late = groundMultiplier(99) - groundMultiplier(89)
    expect(early).toBeGreaterThan(late)
  })

  it('最大でも1.6倍を超えない', () => {
    expect(groundMultiplier(GROUND_LEVEL_MAX)).toBeCloseTo(1.6, 5)
  })

  it('整備費は段階によらず一律', () => {
    // 段階×3,000円にしていた頃は、後半が高すぎて
    // 「部費が貯まったらとりあえず整備」しかできなくなっていた
    expect(groundUpgradeCost(1)).toBe(groundUpgradeCost(50))
    expect(groundUpgradeCost(GROUND_LEVEL_MAX)).toBeNull()
  })

  it('まとめて整備すると各段階の合計になる', () => {
    const quote = groundUpgradeCostFor(1, 3)
    expect(quote.steps).toBe(3)
    expect(quote.cost).toBe(
      groundUpgradeCost(1)! + groundUpgradeCost(2)! + groundUpgradeCost(3)!,
    )
  })

  it('上限を超えるぶんは数えない', () => {
    const quote = groundUpgradeCostFor(GROUND_LEVEL_MAX - 2, 10)
    expect(quote.steps).toBe(2)
  })

  it('段階ごとに呼び名が変わる', () => {
    expect(groundName(1)).not.toBe(groundName(99))
  })

  it('段階が高いほど荒れやすい', () => {
    expect(groundDecayChance(99)).toBeGreaterThan(groundDecayChance(1))
    // 毎月半分以上荒れるようでは維持できない
    expect(groundDecayChance(GROUND_LEVEL_MAX)).toBeLessThan(0.5)
  })

  it('1回で下がるのは数段階まで', () => {
    expect(GROUND_DECAY_STEPS).toBeLessThanOrEqual(3)
  })
})
