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
import type { AutoLineupPlan } from '@/core/lineup/autoLineup'
import type { Grade, Player } from '@/core/types/player'
import { isAvailable } from '@/core/types/player'

/** ベンチ入りの定員 */
export const FIRST_SQUAD_SIZE = 20

/** ベンチ外の練習効率 */
export const SECOND_SQUAD_MULTIPLIER = 0.75

/**
 * 学年ごとの同点崩し。1学年あたりの上乗せ。
 *
 * **同じくらいの能力なら下級生を残す。** 3年生は夏で引退するので、
 * 枠を与えても得られるものが少ない。
 * 逆に下級生はベンチ外だと伸びが75%に落ちるので、
 * 使わないとしても枠に入れておく価値がある。
 *
 * **序列をひっくり返す力は持たせない。** 1年生と3年生の差は6（能力6点ぶん）で、
 * それより開いていれば上級生がきちんと残る。
 * 10にしていた頃は、総合45の1年生が総合54の3年生を押し出していた。
 * 逆に3まで下げたら、総合5違いの1年生がベンチ外へ落ちるようになった。
 * 3年生は夏で抜けるので、**5点差程度なら1年生のほうが価値がある**。
 *
 * スタメンの自動編成（`autoLineup`）と**同じ値を使う**。
 * 片方だけ緩いと「ベンチには入るのにスタメンでは外れる」がねじれる。
 */
export const YOUTH_TIEBREAK = 3

const GRADE_BONUS: Record<Grade, number> = {
  1: YOUTH_TIEBREAK * 2,
  2: YOUTH_TIEBREAK,
  3: 0,
}

/**
 * ベンチ入りの優先度。高いほど枠に残す。
 * `autoSquad` と `repairSquad` で**同じ物差しを使う**。
 *
 * 方針（おまかせ編成の3種）に合わせて重みを変える。
 * スタメンの選び方と揃えないと、
 * 「若手優先で組んだのにベンチ入りは3年生ばかり」という食い違いが出る。
 */
export function squadPriority(player: Player, plan: AutoLineupPlan = 'balanced'): number {
  const rating = overallRating(player)
  if (plan === 'ability') return rating
  if (plan === 'youth') return rating + YOUTH_PLAN_BONUS[player.grade]
  return rating + GRADE_BONUS[player.grade]
}

/** 「若手優先」でベンチ入りに足す下駄。スタメンの `YOUTH_PLAN_BONUS` と揃える */
const YOUTH_PLAN_BONUS: Record<Grade, number> = {
  1: 44,
  2: 22,
  3: 0,
}

/**
 * ベンチ入りに必ず入れる投手の数。
 *
 * 先発1人では大会を戦えない（連投で疲労が抜けない）し、
 * 大差の試合で控えに投げさせる余地も無くなる。
 * **総合だけで並べると投手が1人も入らない年がある**ので、枠を先に取る。
 */
export const MIN_SQUAD_PITCHERS = 3

/**
 * ベンチ入りを埋める。
 * 新規ゲームと、指定が壊れたときの作り直しに使う。
 *
 * 総合だけで並べていた頃は、**引退間近の弱い3年生が枠を占め**、
 * 伸びしろのある1年生がベンチ外に落ちていた。
 *
 * **投手枠は先に取る。** 打力で並べると投手が押し出され、
 * 大会で継投が組めなくなる。
 */
export function autoSquad(players: Player[], plan: AutoLineupPlan = 'balanced'): string[] {
  const available = [...players].filter(isAvailable)
  return fillSquad([], available, plan)
}

/**
 * 空きを埋める。**投手を先に確保してから**、残りを優先度順に詰める。
 * `autoSquad` と `repairSquad` で同じ手順を使う。
 */
function fillSquad(
  kept: string[],
  pool: Player[],
  plan: AutoLineupPlan = 'balanced',
): string[] {
  const chosen = [...kept]
  const taken = new Set(chosen)
  const byPriority = [...pool].sort((a, b) => squadPriority(b, plan) - squadPriority(a, plan))

  const keptPitchers = pool.filter(
    (player) => taken.has(player.id) && player.isPitcher,
  ).length

  // まず投手枠。足りないぶんだけ、良い投手から詰める
  for (const player of byPriority) {
    if (chosen.length >= FIRST_SQUAD_SIZE) break
    const pitchers = keptPitchers + chosen.filter((id) => isPitcherId(id, pool)).length
    if (pitchers >= MIN_SQUAD_PITCHERS) break
    if (taken.has(player.id) || !player.isPitcher) continue
    chosen.push(player.id)
    taken.add(player.id)
  }

  // 残りは優先度順
  for (const player of byPriority) {
    if (chosen.length >= FIRST_SQUAD_SIZE) break
    if (taken.has(player.id)) continue
    chosen.push(player.id)
    taken.add(player.id)
  }

  return chosen
}

function isPitcherId(id: string, pool: Player[]): boolean {
  return pool.find((player) => player.id === id)?.isPitcher === true
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

  return fillSquad(kept, players)
}

/** ベンチ入りのidを集合で返す（判定用） */
export function firstSquadSet(squad: readonly string[]): Set<string> {
  return new Set(squad)
}

/** 選手ごとの練習倍率。ベンチ外は伸びが鈍い */
export function squadMultiplierOf(playerId: string, firstSquad: Set<string>): number {
  return firstSquad.has(playerId) ? 1 : SECOND_SQUAD_MULTIPLIER
}
