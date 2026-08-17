import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from './createPlayer'
import { growthOf, growthRanking } from './growthReport'
import { playerPoints } from './rating'
import { snapshotOf } from '@/core/types/player'
import type { Player } from '@/core/types/player'

const roster = createInitialRoster(createRng(3))

/**
 * 打撃を伸ばして総合が動く選手＝野手を選ぶ。
 * 添字で決め打ちすると、選手生成の乱数の使い方が変わったときに
 * たまたま投手を引いて「meet を伸ばしても総合が動かない」で落ちる。
 */
function fielderAt(index: number): Player {
  const fielders = roster.filter((player) => !player.isPitcher)
  return fielders[index % fielders.length]
}

/** 能力を底上げした選手を作る（記録は入学時のまま） */
function grown(player: Player, amount: number): Player {
  return {
    ...player,
    batting: {
      ...player.batting,
      meet: player.batting.meet + amount,
      power: player.batting.power + amount,
    },
  }
}

describe('growthOf', () => {
  it('入学からの伸びを出せる', () => {
    const player = grown(fielderAt(10), 10)
    const entry = growthOf(player, 'enrollment', 1)!

    // 伸びは**評価点**で出す（総合の平均では一芸が伸びても数字が動かない）
    expect(entry.to).toBe(playerPoints(player))
    expect(entry.delta).toBeGreaterThan(0)
    expect(entry.gains.map((g) => g.key)).toContain('meet')
    expect(entry.gains.find((g) => g.key === 'meet')!.delta).toBe(10)
  })

  it('伸びていなければ差は0', () => {
    const entry = growthOf(fielderAt(10), 'enrollment', 1)!
    expect(entry.delta).toBe(0)
    expect(entry.gains).toEqual([])
  })

  it('下がった能力もそのまま出す', () => {
    const player = grown(fielderAt(11), -6)
    const entry = growthOf(player, 'enrollment', 1)!

    expect(entry.delta).toBeLessThan(0)
    expect(entry.gains.find((g) => g.key === 'meet')!.delta).toBe(-6)
  })

  it('伸びの大きい能力から並ぶ', () => {
    const base = fielderAt(12)
    const player: Player = {
      ...base,
      batting: { ...base.batting, meet: base.batting.meet + 2, power: base.batting.power + 9 },
    }
    const entry = growthOf(player, 'enrollment', 1)!

    expect(entry.gains[0].key).toBe('power')
  })

  it('記録が無ければ null', () => {
    expect(growthOf({ ...roster[0], history: [] }, 'enrollment', 1)).toBeNull()
  })

  it('直近1ヶ月は末尾の記録と比べる', () => {
    const base = fielderAt(13)
    // 2ヶ月ぶんの記録を足してから伸ばす
    const withHistory: Player = {
      ...base,
      history: [...base.history, snapshotOf(base, 1, 5), snapshotOf(base, 1, 6)],
    }
    const player = grown(withHistory, 4)

    expect(growthOf(player, 'month', 1)!.gains.find((g) => g.key === 'meet')!.delta).toBe(4)
  })

  it('今年度の起点が無ければ入学時と比べる', () => {
    const player = grown(fielderAt(14), 5)
    // history は1年目の記録しか無い。3年目を指定しても落ちない
    expect(growthOf(player, 'season', 3)!.delta).toBeGreaterThan(0)
  })
})

describe('growthRanking', () => {
  it('伸びた順に並ぶ', () => {
    /*
     * **同じ選手を3人に増やして比べる。**
     * 別々の選手を並べていた頃は、伸び幅より「どの帯から伸びたか」で
     * 評価点の差が決まり（高いランクほど1点が重い）、
     * 選手生成の乱数がずれるたびに順位が入れ替わっていた。
     */
    const base = fielderAt(0)
    const players = [
      { ...grown(base, 2), id: 'a' },
      { ...grown(base, 12), id: 'b' },
      { ...grown(base, 7), id: 'c' },
    ]
    const ranking = growthRanking(players, 'enrollment', 1)

    expect(ranking).toHaveLength(3)
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i].delta).toBeLessThanOrEqual(ranking[i - 1].delta)
    }
    expect(ranking[0].player.id).toBe('b')
  })

  it('記録の無い選手は除く', () => {
    const players = [roster[0], { ...roster[1], history: [] }]
    expect(growthRanking(players, 'enrollment', 1)).toHaveLength(1)
  })
})
