import { describe, expect, it } from 'vitest'
import type { BattingLine, PitchingLine } from '@/core/types/match'
import { emptyBattingLine, emptyPitchingLine } from '@/core/types/match'
import {
  addBatting,
  addPitching,
  average,
  emptyCareerStats,
  era,
  formatEra,
  formatInnings,
  formatRate,
  onBase,
  ops,
  slugging,
  strikeoutRate,
  totalBases,
} from './careerStats'

function batting(values: Partial<BattingLine>): BattingLine {
  return { ...emptyBattingLine('p1', '選手'), ...values }
}

function pitching(values: Partial<PitchingLine>): PitchingLine {
  return { ...emptyPitchingLine('p1', '選手'), ...values }
}

describe('通算成績の積み上げ', () => {
  it('試合ごとに足していける', () => {
    let stats = emptyCareerStats()
    stats = addBatting(stats, batting({ plateAppearances: 4, atBats: 4, hits: 2, homeruns: 1 }))
    stats = addBatting(stats, batting({ plateAppearances: 3, atBats: 2, hits: 1, walks: 1 }))

    expect(stats.batting.games).toBe(2)
    expect(stats.batting.plateAppearances).toBe(7)
    expect(stats.batting.atBats).toBe(6)
    expect(stats.batting.hits).toBe(3)
    expect(stats.batting.homeruns).toBe(1)
    expect(stats.batting.walks).toBe(1)
  })

  it('勝敗は決着が付いた試合だけ数える', () => {
    let stats = emptyCareerStats()
    stats = addPitching(stats, pitching({ outs: 21, decision: 'win' }))
    stats = addPitching(stats, pitching({ outs: 9, decision: null }))
    stats = addPitching(stats, pitching({ outs: 15, decision: 'lose' }))

    expect(stats.pitching.games).toBe(3)
    expect(stats.pitching.wins).toBe(1)
    expect(stats.pitching.losses).toBe(1)
    expect(stats.pitching.outs).toBe(45)
  })
})

describe('率の計算', () => {
  const b = {
    games: 10,
    plateAppearances: 44,
    atBats: 40,
    hits: 12,
    doubles: 3,
    triples: 1,
    homeruns: 2,
    rbi: 9,
    walks: 3,
    strikeouts: 8,
    sacFlies: 1,
    steals: 4,
  }

  it('打率は安打÷打数', () => {
    expect(average(b)).toBeCloseTo(0.3, 5)
  })

  it('出塁率は (安打+四球) ÷ (打数+四球+犠飛)', () => {
    expect(onBase(b)).toBeCloseTo(15 / 44, 5)
  })

  it('塁打数は長打を重みで数える', () => {
    // 単打6 + 二塁打3×2 + 三塁打1×3 + 本塁打2×4 = 23
    expect(totalBases(b)).toBe(23)
    expect(slugging(b)).toBeCloseTo(23 / 40, 5)
  })

  it('OPSは出塁率＋長打率', () => {
    expect(ops(b)).toBeCloseTo(15 / 44 + 23 / 40, 5)
  })

  it('打席が無ければ null（.000 と区別する）', () => {
    const zero = emptyCareerStats().batting
    expect(average(zero)).toBeNull()
    expect(ops(zero)).toBeNull()
    expect(formatRate(null)).toBe('—')
  })

  it('防御率は自責点×9÷投球回', () => {
    // 27アウト＝9回、自責2 → 2.00
    expect(era({ ...emptyCareerStats().pitching, outs: 27, earnedRuns: 2 })).toBeCloseTo(2, 5)
  })

  it('奪三振率は奪三振×9÷投球回', () => {
    expect(
      strikeoutRate({ ...emptyCareerStats().pitching, outs: 27, strikeouts: 12 }),
    ).toBeCloseTo(12, 5)
  })

  it('1球も投げていなければ null', () => {
    expect(era(emptyCareerStats().pitching)).toBeNull()
    expect(formatEra(null)).toBe('—')
  })
})

describe('表示の整形', () => {
  it('1未満の率は先頭の0を落とす', () => {
    expect(formatRate(0.312)).toBe('.312')
  })

  it('1以上（OPSなど）は0を落とさない', () => {
    expect(formatRate(1.024)).toBe('1.024')
  })

  it('投球回はアウト数から分数で表す', () => {
    expect(formatInnings(21)).toBe('7')
    expect(formatInnings(22)).toBe('7⅓')
    expect(formatInnings(23)).toBe('7⅔')
  })
})
