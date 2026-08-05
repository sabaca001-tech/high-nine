/**
 * ベンチ入りとベンチ外。
 *
 * 弱小校のうちは二軍が組めるほどの規模ではないので、
 * 「ベンチ入りできるか」だけを扱う。
 * ベンチ外の選手も練習には参加するが、指導が行き届かないぶん伸びが鈍い。
 * 「全員を等しく育てられるわけではない」という規模の実感を出すための仕組み。
 *
 * **どちらに置くかはプレイヤーが決める**（スタメン画面でドラッグして入れ替える）。
 * 自動で総合上位を選んでいた頃は、伸ばしたい下級生をベンチに入れられなかった。
 * 指定が無い・部員が入れ替わったときだけ、総合上位で埋め直す。
 */

import { overallRating } from './rating'
import type { Grade, Player } from '@/core/types/player'
import { isAvailable } from '@/core/types/player'

/** ベンチ入りの定員 */
export const FIRST_SQUAD_SIZE = 20

/** ベンチ外の練習効率 */
export const SECOND_SQUAD_MULTIPLIER = 0.75

/**
 * ベンチ入りを決めるときの、学年ごとの下駄。
 *
 * **同じ総合なら下級生を残す。** 3年生は夏で引退するので、
 * ベンチ入りさせても得られるものが少ない。
 * 逆に下級生はベンチ外だと伸びが75%に落ちるので、
 * 使わないとしても枠に入れておく価値がある。
 *
 * 総合の差がこれより大きければ、上級生でもきちんと残る。
 * 「弱い上級生を外して強い下級生を入れる」だけで、
 * 「強い上級生を外す」ことにはならない。
 */
const GRADE_BONUS: Record<Grade, number> = {
  1: 10,
  2: 5,
  3: 0,
}

/**
 * ベンチ入りの優先度。高いほど枠に残す。
 * `autoSquad` と `repairSquad` で**同じ物差しを使う**。
 */
export function squadPriority(player: Player): number {
  return overallRating(player) + GRADE_BONUS[player.grade]
}

/**
 * ベンチ入りを埋める。
 * 新規ゲームと、指定が壊れたときの作り直しに使う。
 *
 * 総合だけで並べていた頃は、**引退間近の弱い3年生が枠を占め**、
 * 伸びしろのある1年生がベンチ外に落ちていた。
 */
export function autoSquad(players: Player[]): string[] {
  return [...players]
    .filter(isAvailable)
    .sort((a, b) => squadPriority(b) - squadPriority(a))
    .slice(0, FIRST_SQUAD_SIZE)
    .map((player) => player.id)
}

/**
 * プレイヤーが指定したベンチ入りを、そのまま受け入れられる形に整える。
 *
 * 重複と在籍していない選手を落とし、定員を超えていれば後ろを切るだけ。
 * **足りなくても勝手に埋めない。**
 *
 * 埋めてしまうと「ベンチ外に落とした選手が、いちばん強い控えとして
 * その場でベンチに戻ってくる」ため、入れ替えができなくなる（実際にそうなっていた）。
 */
export function trimSquad(squad: readonly string[], players: Player[]): string[] {
  const ids = new Set(players.map((player) => player.id))
  return [...new Set(squad)].filter((id) => ids.has(id)).slice(0, FIRST_SQUAD_SIZE)
}

/**
 * 部員が入れ替わったあとにベンチ入りを整え直す。
 *
 * - 卒業などで居なくなった選手を取り除く
 * - 定員に満たなければ、総合の高い順にベンチ外から繰り上げる
 *
 * **年度替わりと新規ゲームでだけ使う。** プレイヤーの操作には `trimSquad` を使う。
 *
 * 怪我での離脱はここでは外さない。**戻ってきたときに元の枠に居てほしい**ため。
 * 練習効率や試合の出場可否は `isAvailable` で別に判定している。
 */
export function repairSquad(squad: readonly string[], players: Player[]): string[] {
  const kept = trimSquad(squad, players)
  if (kept.length >= FIRST_SQUAD_SIZE) return kept

  const inSquad = new Set(kept)
  const promoted = [...players]
    .filter((player) => !inSquad.has(player.id))
    .sort((a, b) => squadPriority(b) - squadPriority(a))
    .slice(0, FIRST_SQUAD_SIZE - kept.length)
    .map((player) => player.id)

  return [...kept, ...promoted]
}

/** ベンチ入りのidを集合で返す（判定用） */
export function firstSquadSet(squad: readonly string[]): Set<string> {
  return new Set(squad)
}

/** 選手ごとの練習倍率。ベンチ外は伸びが鈍い */
export function squadMultiplierOf(playerId: string, firstSquad: Set<string>): number {
  return firstSquad.has(playerId) ? 1 : SECOND_SQUAD_MULTIPLIER
}
