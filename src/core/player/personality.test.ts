import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { Personality, Player } from '@/core/types/player'
import { applyCardCost, applyPractice } from './growth'
import { effectOf, PERSONALITY_EFFECTS } from './personality'
import { emptyCareerStats } from './careerStats'

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
    aptitudes: {
      P: 'G',
      C: 'F',
      '1B': 'C',
      '2B': 'B',
      '3B': 'B',
      SS: 'C',
      LF: 'B',
      CF: 'S',
      RF: 'B',
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
    const { changes } = applyPractice(rng, [player], PRACTICE_DEFS.batting, false)
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
  it('やんちゃは消耗が激しい', () => {
    const wild = applyCardCost([makePlayer({ personality: 'やんちゃ' })], PRACTICE_DEFS.batting)
    const cool = applyCardCost([makePlayer({ personality: 'クール' })], PRACTICE_DEFS.batting)
    expect(wild[0].condition).toBeLessThan(cool[0].condition)
  })

  it('したたかは消耗しにくい', () => {
    const shrewd = applyCardCost([makePlayer({ personality: 'したたか' })], PRACTICE_DEFS.batting)
    const cool = applyCardCost([makePlayer({ personality: 'クール' })], PRACTICE_DEFS.batting)
    expect(shrewd[0].condition).toBeGreaterThan(cool[0].condition)
  })

  it('ムードメーカーは信頼度が上がりやすい', () => {
    const mood = applyCardCost([makePlayer({ personality: 'ムードメーカー' })], PRACTICE_DEFS.mental)
    const cool = applyCardCost([makePlayer({ personality: 'クール' })], PRACTICE_DEFS.mental)
    expect(mood[0].trust).toBeGreaterThan(cool[0].trust)
  })

  it('体力の回復には性格の影響が出ない', () => {
    const players = ALL.map((personality) => makePlayer({ personality, condition: 50 }))
    const after = applyCardCost(players, PRACTICE_DEFS.rest)
    for (const player of after) {
      expect(player.condition).toBe(80)
    }
  })
})
