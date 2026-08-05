import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { Motivation, Player } from '@/core/types/player'
import { applyCardCost, applyPractice, CARD_COST_SCALE, getAbility, raiseAbility } from './growth'
import { emptyCareerStats } from './careerStats'

/** テスト用の選手を作る（乱数を使わず値を固定する） */
function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'test',
    name: 'テスト 太郎',
    grade: 2,
    position: 'CF',
    isPitcher: false,
    batting: {
      trajectory: 2,
      meet: 40,
      power: 40,
      speed: 40,
      arm: 40,
      fielding: 40,
      catching: 40,
    },
    pitching: null,
    motivation: 0,
    trust: 50,
    condition: 100,
    injuryMonths: 0,
    personality: 'クール',
    aptitudes: {
      P: 'G', C: 'F', '1B': 'C', '2B': 'B', '3B': 'B', SS: 'C', LF: 'B', CF: 'S', RF: 'B',
    },
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
    ...overrides,
  }
}

function makePitcher(overrides: Partial<Player> = {}): Player {
  return makePlayer({
    id: 'pitcher',
    position: 'P',
    isPitcher: true,
    pitching: { velocity: 135, control: 40, stamina: 40, breaking: 40, pitches: [] },
    ...overrides,
  })
}

describe('raiseAbility', () => {
  it('元の選手オブジェクトを変更しない', () => {
    const player = makePlayer()
    const { player: updated } = raiseAbility(player, 'meet', 5)
    expect(player.batting.meet).toBe(40)
    expect(updated.batting.meet).toBe(45)
  })

  it('100を超えず、超過分は change に反映されない', () => {
    const player = makePlayer({
      batting: { ...makePlayer().batting, meet: 98 },
    })
    const { player: updated, change } = raiseAbility(player, 'meet', 10)
    expect(updated.batting.meet).toBe(100)
    expect(change).toEqual({ playerId: 'test', key: 'meet', before: 98, after: 100 })
  })

  it('1を下回らない', () => {
    const player = makePlayer({ batting: { ...makePlayer().batting, meet: 3 } })
    const { player: updated } = raiseAbility(player, 'meet', -10)
    expect(updated.batting.meet).toBe(1)
  })

  it('変化が無ければ change は null', () => {
    const player = makePlayer({ batting: { ...makePlayer().batting, meet: 100 } })
    const { change } = raiseAbility(player, 'meet', 5)
    expect(change).toBeNull()
  })

  it('野手に投手能力を上げようとしても何も起きない', () => {
    const player = makePlayer()
    const { player: updated, change } = raiseAbility(player, 'control', 5)
    expect(updated).toBe(player)
    expect(change).toBeNull()
  })

  it('投手能力を正しく上げられる', () => {
    const pitcher = makePitcher()
    const { player: updated } = raiseAbility(pitcher, 'control', 5)
    expect(updated.pitching?.control).toBe(45)
    expect(pitcher.pitching?.control).toBe(40) // 非破壊
  })
})

describe('getAbility', () => {
  it('持っていない能力は null を返す', () => {
    expect(getAbility(makePlayer(), 'control')).toBeNull()
    expect(getAbility(makePitcher(), 'control')).toBe(40)
    expect(getAbility(makePlayer(), 'meet')).toBe(40)
  })
})

describe('applyCardCost', () => {
  /**
   * 1手あたりの消耗は CARD_COST_SCALE で薄めたうえ、端数を確率で丸めている。
   * 1回だけ見ても±1ぶれるので、まとめて平均を取る。
   */
  function averageAfter(
    def: (typeof PRACTICE_DEFS)[keyof typeof PRACTICE_DEFS],
    overrides: Parameters<typeof makePlayer>[0] = {},
  ): { condition: number; trust: number } {
    const rng = createRng(5)
    const trials = 400
    let condition = 0
    let trust = 0
    for (let i = 0; i < trials; i++) {
      const after = applyCardCost(rng, [makePlayer(overrides)], def)[0]
      condition += after.condition
      trust += after.trust
    }
    return { condition: condition / trials, trust: trust / trials }
  }

  it('練習すると体力が減る', () => {
    const expected = 100 + PRACTICE_DEFS.batting.conditionDelta * CARD_COST_SCALE
    expect(averageAfter(PRACTICE_DEFS.batting).condition).toBeCloseTo(expected, 0)
  })

  it('休養カードで体力が回復する', () => {
    const expected = 50 + PRACTICE_DEFS.rest.conditionDelta * CARD_COST_SCALE
    expect(averageAfter(PRACTICE_DEFS.rest, { condition: 50 }).condition).toBeCloseTo(expected, 0)
  })

  it('メンタル強化で信頼度が上がる', () => {
    const expected = 50 + PRACTICE_DEFS.mental.trustDelta * CARD_COST_SCALE
    expect(averageAfter(PRACTICE_DEFS.mental).trust).toBeCloseTo(expected, 0)
  })

  it('体力・信頼度は0〜100に収まる', () => {
    const players = applyCardCost(
      createRng(1),
      [makePlayer({ trust: 100, condition: 5 })],
      PRACTICE_DEFS.stamina,
    )
    expect(players[0].trust).toBeLessThanOrEqual(100)
    expect(players[0].trust).toBeGreaterThanOrEqual(0)
    expect(players[0].condition).toBeGreaterThanOrEqual(0)
  })

  it('元の配列を変更しない', () => {
    const player = makePlayer()
    applyCardCost(createRng(1), [player], PRACTICE_DEFS.batting)
    expect(player.condition).toBe(100)
  })
})

describe('applyPractice', () => {
  it('打撃練習でミートとパワーが伸びる', () => {
    const rng = createRng(1)
    const { players, changes } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.batting, false)

    expect(players[0].batting.meet).toBeGreaterThan(40)
    expect(players[0].batting.power).toBeGreaterThan(40)
    expect(changes.map((c) => c.key).sort()).toEqual(['meet', 'power'])
  })

  it('体力・信頼度には手を触れない（applyCardCost の担当）', () => {
    const rng = createRng(1)
    const { players } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.batting, false)
    expect(players[0].condition).toBe(100)
    expect(players[0].trust).toBe(50)
  })

  it('休養では能力が伸びない', () => {
    const rng = createRng(1)
    const { changes } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.rest, false)
    expect(changes).toHaveLength(0)
  })

  it('投球練習は投手だけが伸びる', () => {
    const rng = createRng(1)
    const { players, changes } = applyPractice(
      rng,
      [makePlayer(), makePitcher()],
      PRACTICE_DEFS.pitching,
      false,
    )

    expect(players[0].batting).toEqual(makePlayer().batting) // 野手は変化なし
    expect(players[1].pitching!.control).toBeGreaterThan(40)
    expect(changes.every((c) => c.playerId === 'pitcher')).toBe(true)
  })

  it('やる気が高いほど成長する', () => {
    const totalGrowth = (motivation: Motivation): number => {
      const rng = createRng(4649)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(
          rng,
          [makePlayer({ motivation })],
          PRACTICE_DEFS.batting,
          false,
        )
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(2)).toBeGreaterThan(totalGrowth(0))
    expect(totalGrowth(0)).toBeGreaterThan(totalGrowth(-2))
  })

  it('1年生は3年生より伸びる', () => {
    const totalGrowth = (grade: 1 | 3): number => {
      const rng = createRng(818)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(
          rng,
          [makePlayer({ grade })],
          PRACTICE_DEFS.batting,
          false,
        )
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(1)).toBeGreaterThan(totalGrowth(3))
  })

  it('体力が低いと伸びにくい', () => {
    const totalGrowth = (condition: number): number => {
      const rng = createRng(202)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(
          rng,
          [makePlayer({ condition })],
          PRACTICE_DEFS.batting,
          false,
        )
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(100)).toBeGreaterThan(totalGrowth(10))
  })

  it('レアカードは効果が大きい', () => {
    const totalGrowth = (isRare: boolean): number => {
      const rng = createRng(77)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.batting, isRare)
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(true)).toBeGreaterThan(totalGrowth(false))
  })

  it('能力が高いほど伸びにくい', () => {
    const totalGrowth = (meet: number): number => {
      const rng = createRng(313)
      let total = 0
      for (let i = 0; i < 400; i++) {
        const player = makePlayer({ batting: { ...makePlayer().batting, meet } })
        const { changes } = applyPractice(rng, [player], PRACTICE_DEFS.batting, false)
        total += changes
          .filter((c) => c.key === 'meet')
          .reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(30)).toBeGreaterThan(totalGrowth(85))
  })
})
