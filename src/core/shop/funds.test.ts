import { describe, expect, it } from 'vitest'
import type { Tournament } from '@/core/types/tournament'
import { BASE_MONTHLY_FUNDS, formatFunds, FUNDS_MAX, monthlyFunds, tournamentPrize } from './funds'

/** 全国優勝したときの大会状態（賞金の計算に必要な項目だけ持つ） */
function nationalChampion(): Tournament {
  return {
    kind: 'nationals',
    name: '夏の全国大会',
    entrants: 49,
    totalRounds: 6,
    round: 6,
    eliminated: false,
    champion: true,
    results: Array.from({ length: 6 }, (_, index) => ({
      round: index + 1,
      roundName: `${index + 1}回戦`,
      opponentName: 'X',
      scoreFor: 3,
      scoreAgainst: 1,
      won: true,
    })),
    bracket: { slots: [], winners: [] },
  }
}

describe('monthlyFunds', () => {
  it('評判が高いほど多い', () => {
    expect(monthlyFunds(20)).toBeGreaterThan(BASE_MONTHLY_FUNDS)
    expect(monthlyFunds(95)).toBeGreaterThan(monthlyFunds(20))
  })
})

describe('formatFunds', () => {
  it('3桁区切りで円をつける', () => {
    expect(formatFunds(1_234_567)).toBe('1,234,567円')
  })
})

describe('部費の上限', () => {
  it('999,999 では止まらない', () => {
    // **カンストして収入が消えていた。** 評判が上がると月5万近く入り、
    // 甲子園で勝ち上がれば1大会で数十万入るので、数年で張り付いていた
    expect(FUNDS_MAX).toBeGreaterThan(1_000_000)
  })

  it('全国優勝を10年重ねても上限に届かない', () => {
    expect(tournamentPrize(nationalChampion()) * 10).toBeLessThan(FUNDS_MAX)
  })

  it('評判95で30年ぶんの月額を貯めても上限に届かない', () => {
    expect(monthlyFunds(95) * 12 * 30).toBeLessThan(FUNDS_MAX)
  })
})
