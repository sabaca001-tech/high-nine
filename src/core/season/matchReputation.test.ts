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

  it('互角の基準は「相手のスタメン9人の平均」', () => {
    // **部員全体の平均ではない。** 比べる相手は自校の teamRating
    // （スタメン9人の平均）なので、こちらもスタメンで測らないと格付けがずれる。
    // 学年の基準より上に来るのは、9人が上位から選ばれるため
    const average = (GRADE_BASE[1] + GRADE_BASE[2] + GRADE_BASE[3]) / 3
    expect(OPPONENT_BASE_RATING).toBeGreaterThan(average)
    expect(OPPONENT_BASE_RATING).toBeLessThan(average + 10)
  })

  it('強い学校ほどスタメン平均が上がる（ただし戦力そのままではない）', () => {
    // 名簿は戦力の一部を素質に足して作る（rivalRoster）ので、
    // 戦力をそのまま足すと強い学校ほど過大評価になる
    expect(opponentRating(20)).toBeGreaterThan(opponentRating(0))
    expect(opponentRating(20) - opponentRating(0)).toBeLessThan(20)
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

  it('1敗で失う量には上限がある', () => {
    // **差がどれだけ開いても、1試合で学校の評価がひっくり返ることはない。**
    // 上限が無かった頃は、強くなるほど相手との差が開いて1敗が -5 を超え、
    // B（強豪校・64）を保つのに格下相手で9割の勝率が要った
    const collapse = matchReputationDelta({
      outcome: 'lose',
      ourRating: our,
      opponentStrength: -30,
      stage: 'nationals',
    })
    expect(-collapse).toBeLessThanOrEqual(6)
  })

  it('練習試合の増減は大会よりずっと小さい', () => {
    /*
     * **どの試合も同じ重さだった頃は、評判が練習試合の積み重ねで決まっていた。**
     * 学校の評判は大会でどこまで勝ったかで決まるもので、
     * 練習試合はそのための調整という位置づけにする。
     */
    for (const outcome of ['win', 'lose'] as const) {
      const practice = matchReputationDelta({
        outcome,
        ourRating: our,
        opponentStrength: -10,
        stage: 'practice',
      })
      const pref = matchReputationDelta({
        outcome,
        ourRating: our,
        opponentStrength: -10,
        stage: 'pref',
      })

      expect(Math.abs(practice)).toBeLessThan(Math.abs(pref) / 2)
    }
  })

  it('舞台を省略すると練習試合として扱う', () => {
    const omitted = matchReputationDelta({ outcome: 'lose', ourRating: our, opponentStrength: 0 })
    const practice = matchReputationDelta({
      outcome: 'lose',
      ourRating: our,
      opponentStrength: 0,
      stage: 'practice',
    })

    expect(omitted).toBe(practice)
  })

  it('格上を倒すことが評判の主な稼ぎになる', () => {
    // 格下に勝っても素の値は1のまま。挑んで勝つことが評価される
    const upset = matchReputationDelta({ outcome: 'win', ourRating: our, opponentStrength: 25 })
    const easy = matchReputationDelta({ outcome: 'win', ourRating: our, opponentStrength: -25 })
    expect(upset).toBeGreaterThan(easy * 3)
  })
})

describe('matchupLabel', () => {
  it('力の差を言葉にする', () => {
    const even = opponentRating(0)
    expect(matchupLabel(even, 30)).toBe('格上')
    expect(matchupLabel(even, 0)).toBe('互角')
    expect(matchupLabel(even + 20, 0)).toBe('格下')
  })
})
