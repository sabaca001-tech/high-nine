/** スタメンの自動編成と検証 */

import type { Lineup, LineupSlot } from '@/core/types/lineup'
import { LINEUP_SIZE } from '@/core/types/lineup'
import { isAvailable } from '@/core/types/player'
import type { Player, Position } from '@/core/types/player'
import { ALL_POSITIONS, defenseScore, POSITION_WEIGHT } from './aptitude'
import { battingRating } from '@/core/player/rating'
import {
  battingScore,
  clutchScore,
  onBaseScore,
  runningScore,
  sluggingScore,
} from './battingTraits'
import { FATIGUE_AVOID, FATIGUE_MAX, fatigueOf } from '@/core/player/fatigue'
import { pitcherValue } from '@/core/match/teamState'
import { YOUTH_TIEBREAK } from '@/core/player/squad'

/**
 * 守備位置を埋める順番。
 * **重要度の高い位置から先に埋める**（POSITION_WEIGHT の順）。
 * 投手だけは投手能力を持つ選手しか務まらないので先頭に固定する。
 */
const FILL_ORDER: Position[] = [
  'P',
  ...ALL_POSITIONS.filter((position) => position !== 'P').sort(
    (a, b) => POSITION_WEIGHT[b] - POSITION_WEIGHT[a],
  ),
]

/**
 * おまかせ編成の方針。
 *
 * 1種類しか無かった頃は「守備適性だけで埋める」形だったので、
 * **打てる選手が外れる**ことがあり、結果が納得できなかった。
 * 何を優先したいかを選べるようにする。
 */
export type AutoLineupPlan = 'balanced' | 'ability' | 'youth'

export const AUTO_LINEUP_PLANS: { id: AutoLineupPlan; label: string; description: string }[] = [
  {
    id: 'balanced',
    label: 'バランス',
    description: '守備適性と打力の両方を見て組む',
  },
  {
    id: 'ability',
    label: '能力優先',
    description: '総合の高い選手から順に、守れる位置へ入れる',
  },
  {
    id: 'youth',
    label: '若手優先',
    description: '下級生を積極的に使う。育てながら戦う',
  },
]

/**
 * **守備と打撃のどちらを重く見るか**を守備位置ごとに決める。
 *
 * 全ポジション一律で「守備0.7・打撃0.3」にしていたので、
 * 一塁に守備型を置き、遊撃に打撃型を置くという噛み合わない編成が出ていた。
 * 実際には守備の負担が位置ごとに大きく違う。
 *
 * 重要度の並びは `POSITION_WEIGHT` を使い回す（**表を2つ持たない**）。
 * あちらは「守れない選手を置いたときの痛手」で、こちらは
 * 「誰を置くか選ぶときの物差し」。同じ順序で並んでいないとおかしい。
 *
 * | 位置 | 守備 : 打撃 |
 * |---|---|
 * | 遊撃 | 0.85 : 0.15 |
 * | 二塁 | 0.80 : 0.20 |
 * | 捕手 | 0.76 : 0.24 |
 * | 中堅 | 0.72 : 0.28 |
 * | 三塁 | 0.62 : 0.38 |
 * | 右翼 | 0.55 : 0.45 |
 * | 一塁 | 0.47 : **0.53** |
 * | 左翼 | 0.43 : **0.57** |
 */
const DEFENSE_SHARE_MIN = 0.25
const DEFENSE_SHARE_MAX = 0.85

export function defenseShare(position: Position): number {
  return (
    DEFENSE_SHARE_MIN + (DEFENSE_SHARE_MAX - DEFENSE_SHARE_MIN) * POSITION_WEIGHT[position]
  )
}

/**
 * 「若手優先」で足す大きな下駄。こちらは序列を動かすためのもの。
 * 僅差用の同点崩し（`YOUTH_TIEBREAK`）はベンチ入りと共有している。
 */
const YOUTH_PLAN_BONUS = 22

/**
 * その方針での「その位置にどれだけ向いているか」。
 *
 * どの方針でも守備適性は必ず見る。守れない位置に置くと
 * 失策と被安打が増えるので（aptitude.ts）、無視すると単に弱くなる。
 */
function fitFor(plan: AutoLineupPlan, player: Player, position: Position): number {
  const defense = defenseScore(player, position)
  const hitting = player.batting.meet * 0.55 + player.batting.power * 0.45
  // **野手枠の評価に投手能力を混ぜない。**
  // `overallRating` は投手なら投球能力を返すので、
  // 良い投手ほど一塁でも外野でも高く見えて、
  // 「エースが野手として出場する」編成になっていた
  const overall = battingRating(player.batting)

  // 若手優先のときだけ大きな下駄。それ以外でも僅差なら下級生を上に置く
  const youth =
    plan === 'youth'
      ? (3 - player.grade) * YOUTH_PLAN_BONUS
      : (3 - player.grade) * YOUTH_TIEBREAK

  // **投手枠は投球能力で決める。**
  // 守備適性と打力で選んでいたので、球威も制球も見ずに
  // 「打てる投手」が先発になっていた。
  // さらに疲労を織り込む。連投明けのエースより、休んでいる2番手のほうが計算が立つ
  if (position === 'P') {
    const rest = 1 - (fatigueOf(player) / FATIGUE_MAX) * FATIGUE_PICK_WEIGHT
    return pitcherValue(player) * rest + youth
  }

  const share = defenseShare(position)

  switch (plan) {
    case 'ability':
      // 総合を主に見つつ、守れない位置は避ける
      return overall * 1.2 + defense * 0.5 + youth
    case 'youth':
    case 'balanced':
    default:
      // 遊撃なら守備、一塁なら打撃。位置ごとに見るものを変える
      return defense * share + hitting * (1 - share) + youth
  }
}

/**
 * 先発を選ぶときに疲労をどれだけ嫌うか。
 * 疲労50でおよそ3割引き。エースを休ませて2番手を立てる判断が自然に出る強さ。
 */
const FATIGUE_PICK_WEIGHT = 0.6

/**
 * スタメンを自動で組む。
 *
 * 1. 各ポジションを、方針に合った選手から順に埋める
 * 2. 埋まった9人を打撃の特徴に応じて並べる
 */
export function autoLineup(players: Player[], plan: AutoLineupPlan = 'balanced'): Lineup {
  const available = players.filter(isAvailable)
  const pool = available.length >= LINEUP_SIZE ? available : players

  const assigned = new Map<Position, Player>()
  const used = new Set<string>()

  for (const position of FILL_ORDER) {
    const candidates = pool.filter((p) => !used.has(p.id))
    if (candidates.length === 0) break

    // 投手だけは投手能力を持つ選手に限る（誰でも投げられては困る）
    let eligible =
      position === 'P' && candidates.some((p) => p.pitching)
        ? candidates.filter((p) => p.pitching)
        : candidates

    // 連投で消耗した投手は先発から外す。**投げられる者が他に居るときだけ。**
    // 全員疲れている日もあるので、絞り切って0人にはしない
    if (position === 'P') {
      const fresh = eligible.filter((p) => fatigueOf(p) < FATIGUE_AVOID)
      if (fresh.length > 0) eligible = fresh
    }

    const best = eligible.reduce((a, b) =>
      fitFor(plan, b, position) > fitFor(plan, a, position) ? b : a,
    )
    assigned.set(position, best)
    used.add(best.id)
  }

  // 埋め終わってから入れ替えて詰める（下記の理由で greedy だけでは足りない）
  improveBySwaps(plan, assigned)

  const slots = battingOrder([...assigned.entries()].map(([position, player]) => ({
    position,
    playerId: player.id,
  })), pool)

  return { slots }
}

/**
 * 埋めたあと、2人ずつ入れ替えて噛み合わせを直す。
 *
 * **守備の重要度順に埋めるだけでは、後回しの枠に余り物しか来ない。**
 * 遊撃・二塁・捕手が先に良い選手を抜いていくので、
 * 打撃を重く見るはずの一塁・左翼に「打てない選手」が残っていた
 * （実測で「一塁のほうが打撃が上」は40例中5例しかなかった）。
 *
 * 総和が増える入れ替えが無くなるまで繰り返す。
 * 8枠なので1巡28通り、数巡で落ち着く。
 *
 * **投手枠は動かさない。** 野手を混ぜても意味が無いうえ、
 * 誰が投げるかは投球能力だけで決めたい。
 */
const MAX_SWAP_PASSES = 4

function improveBySwaps(plan: AutoLineupPlan, assigned: Map<Position, Player>): void {
  const positions = [...assigned.keys()].filter((position) => position !== 'P')

  for (let pass = 0; pass < MAX_SWAP_PASSES; pass++) {
    let improved = false

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]
        const b = positions[j]
        const playerA = assigned.get(a)
        const playerB = assigned.get(b)
        if (!playerA || !playerB) continue

        const current = fitFor(plan, playerA, a) + fitFor(plan, playerB, b)
        const swapped = fitFor(plan, playerB, a) + fitFor(plan, playerA, b)

        if (swapped > current + 1e-9) {
          assigned.set(a, playerB)
          assigned.set(b, playerA)
          improved = true
        }
      }
    }

    if (!improved) break
  }
}

/**
 * 打順を決める。
 *
 * **打順ごとに見たいものが違う。** ミートとパワーの平均で並べていた頃は、
 * 「四球を選べる打者」も「一発のある打者」も同じ扱いで、
 * 誰を何番に置いても同じ打線に見えていた。
 *
 * | 打順 | 何を見るか |
 * |---|---|
 * | 1 | 出塁力＋走力。塁に出てかき回す |
 * | 2 | 出塁力。とにかく塁に置く |
 * | 3 | チームで最も優秀な打者（ミート寄り） |
 * | 4 | チームで最も優秀な打者（パワー寄り） |
 * | 5 | 長打＋勝負強さ。走者が残った場面が回る |
 * | 6 | ミート |
 * | 7 | 長打 |
 * | 8 | 残り |
 * | 9 | **打力がいちばん低い選手** |
 *
 * **投手も同じ物差しで並べる。** 8番に固定していた頃は、
 * 打てる投手をわざわざ下位に沈めていた。
 * 打てない投手なら9番（打力最下位）で自然に拾われる。
 */
function battingOrder(slots: LineupSlot[], players: Player[]): LineupSlot[] {
  const byId = new Map(players.map((player) => [player.id, player]))
  const of = (slot: LineupSlot): Player | undefined => byId.get(slot.playerId)
  const bat = (slot: LineupSlot): number => {
    const player = of(slot)
    return player ? battingScore(player) : 0
  }

  /** その打順で見たい持ち味。値が大きいほどその打順に向く */
  const scoreFor = (order: number, slot: LineupSlot): number => {
    const player = of(slot)
    if (!player) return -Infinity

    const onBase = onBaseScore(player)
    const slug = sluggingScore(player)
    const total = battingScore(player)

    switch (order) {
      case 1:
        return onBase * 0.6 + runningScore(player) * 0.4
      case 2:
        return onBase
      case 3:
        // チームで最も優秀な打者。ミート寄りに見る
        return total + player.batting.meet * 0.35
      case 4:
        // 同じく最も優秀な打者。こちらはパワー寄り
        return total + slug * 0.45
      case 5:
        return slug * 0.6 + total * 0.4 + clutchScore(player)
      case 6:
        return player.batting.meet
      case 7:
        return slug
      default:
        // 8番。残った中から打力の高い順
        return total
    }
  }

  const remaining = [...slots]
  /** 打順 → 選手。埋めた順ではなく打順で持つ */
  const assigned = new Map<number, LineupSlot>()

  const place = (order: number, slot: LineupSlot) => {
    assigned.set(order, slot)
    remaining.splice(remaining.indexOf(slot), 1)
  }

  // **9番から決める。** 上から埋めると、最後に残った選手が
  // たまたま打てる選手ということが起きる
  const worst = remaining.reduce((a, b) => (bat(b) < bat(a) ? b : a))
  place(9, worst)

  // **投手も打力どおりに並べる。** 以前は8番に固定していたが、
  // 打てる投手を下位に沈めておく理由は無い。
  // 打てない投手なら、そもそも9番（打力最下位）で拾われる。

  // **3番と4番は2人まとめて取る。**
  // どちらも「チームで最も優秀な打者」の枠なので、まず打力上位2人を確保し、
  // そのうち長打力の高いほうを4番に置く。
  // 1人ずつ選ぶと、パワー型が先に3番を取ってしまうことがあった（実際にあった）
  if (remaining.length >= 2) {
    const best = [...remaining].sort((a, b) => bat(b) - bat(a)).slice(0, 2)
    const [power, contact] = [...best].sort(
      (a, b) => sluggingScore(of(b)!) - sluggingScore(of(a)!),
    )
    place(4, power)
    place(3, contact)
  }

  // **中軸を先に埋める。** 1番・2番から埋めると上位打者が先に抜けて、
  // 5番に打力の低い選手が残る（実際に残った）
  for (const order of [5, 1, 2, 6, 7, 8]) {
    if (assigned.has(order) || remaining.length === 0) continue
    const best = remaining.reduce((a, b) => (scoreFor(order, b) > scoreFor(order, a) ? b : a))
    place(order, best)
  }

  return Array.from({ length: slots.length }, (_, i) => assigned.get(i + 1)).filter(
    (slot): slot is LineupSlot => slot !== undefined,
  )
}

/** 先発投手を取り出す */
export function starterOf(lineup: Lineup): string | null {
  return lineup.slots.find((slot) => slot.position === 'P')?.playerId ?? null
}

export type LineupProblem =
  | { type: 'size'; message: string }
  | { type: 'duplicatePlayer'; playerId: string; message: string }
  | { type: 'duplicatePosition'; position: Position; message: string }
  | { type: 'missingPosition'; position: Position; message: string }
  | { type: 'unknownPlayer'; playerId: string; message: string }

/** スタメンが成立しているかを調べる。UI の警告表示に使う */
export function validateLineup(lineup: Lineup, players: Player[]): LineupProblem[] {
  const problems: LineupProblem[] = []
  const ids = new Set(players.map((p) => p.id))

  if (lineup.slots.length !== LINEUP_SIZE) {
    problems.push({ type: 'size', message: `スタメンは${LINEUP_SIZE}人にしてください` })
  }

  const seenPlayers = new Set<string>()
  const seenPositions = new Set<Position>()

  for (const slot of lineup.slots) {
    if (!ids.has(slot.playerId)) {
      problems.push({
        type: 'unknownPlayer',
        playerId: slot.playerId,
        message: '在籍していない選手が含まれています',
      })
      continue
    }
    if (seenPlayers.has(slot.playerId)) {
      const name = players.find((p) => p.id === slot.playerId)?.name ?? ''
      problems.push({
        type: 'duplicatePlayer',
        playerId: slot.playerId,
        message: `${name}が重複しています`,
      })
    }
    if (seenPositions.has(slot.position)) {
      problems.push({
        type: 'duplicatePosition',
        position: slot.position,
        message: `${slot.position}が重複しています`,
      })
    }
    seenPlayers.add(slot.playerId)
    seenPositions.add(slot.position)
  }

  for (const position of ALL_POSITIONS) {
    if (!seenPositions.has(position)) {
      problems.push({
        type: 'missingPosition',
        position,
        message: `${position}が空いています`,
      })
    }
  }

  return problems
}

/**
 * 在籍していない選手が含まれていたら組み直す。
 * 卒業・退部で崩れたスタメンを自動で修復するために使う。
 */
export function repairLineup(lineup: Lineup, players: Player[]): Lineup {
  if (validateLineup(lineup, players).length > 0) return autoLineup(players)

  // 離脱した選手がスタメンに残っていたら組み直す
  const injured = lineup.slots.some((slot) => {
    const player = players.find((p) => p.id === slot.playerId)
    return player !== undefined && !isAvailable(player)
  })
  return injured ? autoLineup(players) : lineup
}
