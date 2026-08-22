import { describe, expect, it } from 'vitest'
import { conditionGrowthRate, injuryRiskOf, injuryWeightOf } from './condition'

describe('conditionGrowthRate', () => {
  /**
   * **70以上なら一律1.0だった。**
   * 体力が70〜100を行き来する普段のプレイでは、
   * 「休ませる」という判断に意味がほとんど無かった。
   */
  it('体力が高いほどよく伸びる（段差が無い）', () => {
    for (let condition = 1; condition <= 100; condition++) {
      expect(conditionGrowthRate(condition)).toBeGreaterThan(conditionGrowthRate(condition - 1))
    }
  })

  it('満タンなら1を超える', () => {
    // 上限を1.0にすると、体力は「減ると損をする」だけの数字になる
    expect(conditionGrowthRate(100)).toBeGreaterThan(1)
  })

  it('体力が尽きても練習そのものは消えない', () => {
    expect(conditionGrowthRate(0)).toBeGreaterThan(0.3)
  })

  it('範囲外は端で止まる', () => {
    expect(conditionGrowthRate(-20)).toBe(conditionGrowthRate(0))
    expect(conditionGrowthRate(120)).toBe(conditionGrowthRate(100))
  })
})

describe('injuryRiskOf', () => {
  it('体力が低いほど怪我をしやすい', () => {
    for (let condition = 1; condition <= 100; condition++) {
      expect(injuryRiskOf(condition)).toBeLessThan(injuryRiskOf(condition - 1))
    }
  })

  it('体力が尽きていれば必ず怪我をする', () => {
    expect(injuryRiskOf(0)).toBe(1)
  })

  it('万全でも0にはならない', () => {
    // 完全に防げると、体力を保つことが「絶対に取るべき手」になって選択でなくなる
    expect(injuryRiskOf(100)).toBeGreaterThan(0.3)
    expect(injuryRiskOf(100)).toBeLessThan(0.5)
  })

  it('体力を保てば怪我は半分以下になる', () => {
    expect(injuryRiskOf(95)).toBeLessThan(injuryRiskOf(40) / 1.5)
  })
})

describe('injuryWeightOf', () => {
  it('体力が低い選手ほど選ばれやすい', () => {
    expect(injuryWeightOf(20)).toBeGreaterThan(injuryWeightOf(80))
    expect(injuryWeightOf(100)).toBeGreaterThan(0)
  })
})
