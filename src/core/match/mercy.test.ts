/**
 * コールドゲームの成立の仕方。
 *
 * **点差が規定に届いた時点で終わる。**
 * 回を終えてから点差を見ていた頃は、7回裏に6点差から10点取って
 * 「10点差でコールド」という試合が普通に起きていた。
 */

import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { autoLineup } from '@/core/lineup/autoLineup'
import { createInitialRoster } from '@/core/player/createPlayer'
import { mercyLeadAt, simulateGame } from './simulateGame'

/** 力の差が大きい試合を作る（コールドが起きやすい） */
function lopsided(seed: number, strength: number) {
  const players = createInitialRoster(createRng(seed))
  return simulateGame(createRng(seed * 31), {
    players,
    lineup: autoLineup(players),
    opponentName: '相手校',
    opponentStrength: strength,
    kind: 'friendly',
  })
}

describe('コールドゲーム', () => {
  it('規定の点差を大きく超えたまま終わらない', () => {
    /*
     * 攻撃中に規定へ届いたら、その打席で終わる。
     * 一打で複数点入るので**ぴったり**にはならない。
     *
     * **前の回から持ち越した点差もある。** 規定は回によって違うので
     * （5回10点差・7回7点差）、6回終了時に8点差でも試合は続く。
     * そこから7回表に満塁本塁打が出れば12点差で終わる。
     * つまり上限は「いちばん緩い規定（10点差）＋一打（4点）」。
     */
    const MAX_LEAD = 10 + 4
    let checked = 0

    for (let seed = 1; seed <= 200; seed++) {
      const result = lopsided(seed, -30)
      const lead = mercyLeadAt(result.innings.length)
      if (lead === null) continue

      // 9回まで行った試合はコールドではない
      if (result.innings.length >= 9) continue

      const diff = Math.abs(result.finalScore.player - result.finalScore.opponent)
      expect(diff).toBeGreaterThanOrEqual(lead)
      expect(diff).toBeLessThan(MAX_LEAD)
      checked += 1
    }

    expect(checked).toBeGreaterThan(0)
  })

  it('規定の回・点差はそのまま（5回10点・7回7点）', () => {
    expect(mercyLeadAt(4)).toBeNull()
    expect(mercyLeadAt(5)).toBe(10)
    expect(mercyLeadAt(6)).toBe(10)
    expect(mercyLeadAt(7)).toBe(7)
    expect(mercyLeadAt(8)).toBe(7)
  })
})
