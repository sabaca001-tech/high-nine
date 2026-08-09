/** 対戦相手チームの生成 */

import type { Rng } from '@/core/rng/random'
import { autoLineup } from '@/core/lineup/autoLineup'
import { ROSTER_TALENT_RATE } from '@/core/rival/rivalRoster'
import { createPlayer } from '@/core/player/createPlayer'
import type { Lineup } from '@/core/types/lineup'
import type { Grade, Player } from '@/core/types/player'

/** 相手校名。実在校を想起させない一般的な名前にする */
const OPPONENT_NAMES = [
  '青葉学院',
  '北嶺高校',
  '南陽工業',
  'みどりヶ丘高校',
  '東雲商業',
  '白鷺高校',
  '桐生第三',
  '大空学園',
  '長峰高校',
  '若草農業',
  '海原高校',
  '星陵台高校',
]

export type OpponentTeam = {
  name: string
  players: Player[]
  lineup: Lineup
}

/**
 * 相手チームを作る。
 *
 * **学校が分かっているときは、その学校の部員を使う**（`roster` を渡す）。
 * 渡されなければ従来どおり戦力値から作る（学校を置いていない県への遠征など）。
 *
 * 学校の部員は保存せず、`rivalRoster` が種から毎回同じ名簿を作る。
 * 同じ学校と2回戦えば同じ選手が出てくるし、
 * スカウトで逃した選手もその学校に居る。
 */
export function createOpponent(
  rng: Rng,
  strength: number,
  fixedName?: string,
  roster?: Player[],
): OpponentTeam {
  const name = fixedName ?? rng.pick(OPPONENT_NAMES)
  if (roster && roster.length >= 9) {
    return { name, players: roster, lineup: autoLineup(roster) }
  }
  return createDisposableOpponent(rng, strength, name)
}

/** 学校が分からないときの使い捨ての相手 */
function createDisposableOpponent(rng: Rng, strength: number, fixedName?: string): OpponentTeam {
  // 名前は試合前の確認画面で先に決まっていることがある
  const name = fixedName ?? rng.pick(OPPONENT_NAMES)

  const players: Player[] = []
  let index = 0

  // 部員構成はこちらと同じにする（各学年5人）。
  // これを揃えないと strength=0 が「互角」にならない
  for (const grade of [3, 2, 1] as Grade[]) {
    for (let i = 0; i < 5; i++) {
      players.push(
        createPlayer(rng, {
          id: `opp${index++}`,
          grade,
          // 各学年の1人目だけ投手を確約して、投手が居ない事故を防ぐ
          isPitcher: i === 0 ? true : undefined,
          // **実在の学校（`rivalRoster`）と同じ物差しで作る。**
          // そのまま足していた頃は、学校が分からない使い捨ての相手だけが
          // 一段強く、甲子園の代表校より強い「名も無い相手」が出ていた
          talentBonus: Math.round(strength * ROSTER_TALENT_RATE),
        }),
      )
    }
  }

  return { name, players, lineup: autoLineup(players) }
}

/** 相手校名を1つ選ぶ（試合前に名前だけ欲しいとき用） */
export function pickOpponentName(rng: Rng): string {
  return rng.pick(OPPONENT_NAMES)
}
