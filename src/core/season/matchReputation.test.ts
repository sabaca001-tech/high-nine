import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { autoLineup } from '@/core/lineup/autoLineup'
import { createInitialRoster, GRADE_BASE } from '@/core/player/createPlayer'
import {
  matchReputationDelta,
  matchupLabel,
  OPPONENT_BASE_RATING,
  opponentRating,
  teamRating,
} from './matchReputation'

const players = createInitialRoster(createRng(21))
const lineup = autoLineup(players)

describe('teamRating', () => {
  it('スタメンの平均総合になる', () => {
    const rating = teamRating(players, lineup)
    expect(rating).toBeGreaterThan(0)
    expect(rating).toBeLessThan(100)
  })

  it('スタメンが1人も居なければ平均値を返す', () => {
    expect(teamRating([], lineup)).toBe(opponentRating(0))
  })
})

describe('matchReputationDelta', () => {
  /**
   * 自校の評価を「互角の相手」に合わせておく。
   * 数字を直に書くと、`OPPONENT_BASE_RATING`（＝互角の基準）を動かしたときに
   * 意図しない格差が入り込んで落ちる（実際に落ちた）。
   */
  const our = OPPONENT_BASE_RATING

  it('互角の基準が createPlayer の GRADE_BASE と揃っている', () => {
    // 相手は各学年5人ずつ。その平均が「強さ0」の相手の総合になる
    const average = (GRADE_BASE[1] + GRADE_BASE[2] + GRADE_BASE[3]) / 3
    expect(OPPONENT_BASE_RATING).toBe(Math.round(average))
  })

  it('引き分けは動かない', () => {
    expect(
      matchReputationDelta({ outcome: 'draw', ourRating: our, opponentStrength: 20 }),
    ).toBe(0)
  })

  it('格上に勝つほど大きく上がる', () => {
    const even = matchReputationDelta({ outcome: 'win', ourRating: our, opponentStrength: 3 })
    const upset = matchReputationDelta({ outcome: 'win', ourRating: our, opponentStrength: 25 })

    expect(even).toBeGreaterThan(0)
    expect(upset).toBeGreaterThan(even)
  })

  it('格下に勝ってもほとんど上がらない', () => {
    const easy = matchReputationDelta({ outcome: 'win', ourRating: our, opponentStrength: -20 })
    const even = matchReputationDelta({ outcome: 'win', ourRating: our, opponentStrength: 3 })

    expect(easy).toBeGreaterThan(0)
    expect(easy).toBeLessThanOrEqual(even)
  })

  it('負ければ必ず下がる', () => {
    for (const strength of [-20, 0, 20, 40]) {
      expect(
        matchReputationDelta({ outcome: 'lose', ourRating: our, opponentStrength: strength }),
      ).toBeLessThan(0)
    }
  })

  it('格下に負けるほど大きく下がる', () => {
    const collapse = matchReputationDelta({
      outcome: 'lose',
      ourRating: our,
      opponentStrength: -20,
    })
    const even = matchReputationDelta({ outcome: 'lose', ourRating: our, opponentStrength: 3 })

    expect(collapse).toBeLessThan(even)
  })

  it('格上に負けても致命的ではない', () => {
    const toGiant = matchReputationDelta({ outcome: 'lose', ourRating: our, opponentStrength: 40 })
    const toEqual = matchReputationDelta({ outcome: 'lose', ourRating: our, opponentStrength: 0 })

    expect(toGiant).toBeGreaterThan(toEqual)
  })

  it('番狂わせの上がり幅は、格下に負けた下がり幅より小さい', () => {
    // 勝ちで稼ぐより、取りこぼしのほうが痛い。勝ち続ける意味を出す
    const upset = matchReputationDelta({ outcome: 'win', ourRating: our, opponentStrength: 25 })
    const collapse = matchReputationDelta({
      outcome: 'lose',
      ourRating: our,
      opponentStrength: -25,
    })
    expect(upset).toBeLessThan(-collapse)
  })
})

describe('matchupLabel', () => {
  it('力の差を言葉にする', () => {
    expect(matchupLabel(40, 20)).toBe('格上')
    expect(matchupLabel(40, 0)).toBe('互角')
    expect(matchupLabel(60, 0)).toBe('格下')
  })
})
