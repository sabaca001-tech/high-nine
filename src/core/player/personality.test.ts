import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { Personality, Player } from '@/core/types/player'
import { applyCardCost, applyPractice } from './growth'
import { effectOf, PERSONALITY_EFFECTS } from './personality'
import { emptyCareerStats } from './careerStats'

/**
 * テストで使う「進んだ日数」。
 * 成長も消耗も日数に比例するので、ここを変えると期待値も動く。
 * カードは1〜5なので、その真ん中を代表値にする。
 */
const TEST_STEPS = 3


const ALL: Personality[] = [
  'ど根性',
  'クール',
  'ムードメーカー',
  'したたか',
  '天才肌',
  'やんちゃ',
]

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
    growthAptitude: {},
    aptitudes: {
      P: 0,
      C: 1,
      '1B': 3,
      '2B': 4,
      '3B': 4,
      SS: 3,
      LF: 4,
      CF: 5,
      RF: 4,
    },
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
    ...overrides,
  }
}

/** 300回練習させたときの合計成長量 */
function totalGrowth(player: Player, seed = 1234): number {
  const rng = createRng(seed)
  let total = 0
  for (let i = 0; i < 300; i++) {
    const { changes } = applyPractice(rng, [player], PRACTICE_DEFS.batting, { steps: TEST_STEPS })
    total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
  }
  return total
}

describe('PERSONALITY_EFFECTS', () => {
  it('全ての性格に効果が定義されている', () => {
    for (const personality of ALL) {
      const effect = effectOf(personality)
      expect(effect.growth).toBeGreaterThan(0)
      expect(effect.summary.length).toBeGreaterThan(0)
    }
    expect(Object.keys(PERSONALITY_EFFECTS).sort()).toEqual([...ALL].sort())
  })
})

describe('成長への影響', () => {
  it('天才肌はよく伸びる', () => {
    expect(totalGrowth(makePlayer({ personality: '天才肌' }))).toBeGreaterThan(
      totalGrowth(makePlayer({ personality: 'クール' })),
    )
  })

  it('ど根性は体力が低くても伸びる', () => {
    const tired = { condition: 15 }
    const guts = totalGrowth(makePlayer({ ...tired, personality: 'ど根性' }))
    const cool = totalGrowth(makePlayer({ ...tired, personality: 'クール' }))
    expect(guts).toBeGreaterThan(cool)
  })

  it('体力が万全ならど根性の優位は小さい', () => {
    const guts = totalGrowth(makePlayer({ condition: 100, personality: 'ど根性' }))
    const cool = totalGrowth(makePlayer({ condition: 100, personality: 'クール' }))
    // ペナルティが無いので差はほぼ出ない
    expect(Math.abs(guts - cool) / cool).toBeLessThan(0.05)
  })

  it('クールはやる気に左右されにくい', () => {
    const swing = (personality: Personality) =>
      totalGrowth(makePlayer({ personality, motivation: 2 })) -
      totalGrowth(makePlayer({ personality, motivation: -2 }))

    expect(swing('クール')).toBeLessThan(swing('天才肌'))
  })
})

describe('体力消費と信頼度への影響', () => {
  /**
   * 1手あたりの消耗が2〜3という小さな値になったので、端数は確率で丸めている。
   * 1回では差が出ないことがあるため、まとめて平均で比べる。
   */
  function average(
    personality: Personality,
    def: (typeof PRACTICE_DEFS)[keyof typeof PRACTICE_DEFS],
    pick: 'condition' | 'trust',
    startCondition = 100,
  ): number {
    const rng = createRng(9)
    const trials = 500
    let total = 0
    for (let i = 0; i < trials; i++) {
      const player = makePlayer({ personality, condition: startCondition })
      total += applyCardCost(rng, [player], def, TEST_STEPS)[0][pick]
    }
    return total / trials
  }

  it('やんちゃは消耗が激しい', () => {
    expect(average('やんちゃ', PRACTICE_DEFS.batting, 'condition')).toBeLessThan(
      average('クール', PRACTICE_DEFS.batting, 'condition'),
    )
  })

  it('したたかは消耗しにくい', () => {
    expect(average('したたか', PRACTICE_DEFS.batting, 'condition')).toBeGreaterThan(
      average('クール', PRACTICE_DEFS.batting, 'condition'),
    )
  })

  it('ムードメーカーは信頼度が上がりやすい', () => {
    expect(average('ムードメーカー', PRACTICE_DEFS.mental, 'trust')).toBeGreaterThan(
      average('クール', PRACTICE_DEFS.mental, 'trust'),
    )
  })

  it('体力の回復には性格の影響が出ない', () => {
    const values = ALL.map((personality) =>
      average(personality, PRACTICE_DEFS.rest, 'condition', 50),
    )
    for (const value of values) {
      expect(value).toBeCloseTo(values[0], 1)
    }
  })
})
