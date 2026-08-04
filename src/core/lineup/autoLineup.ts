/** スタメンの自動編成と検証 */

import type { Lineup, LineupSlot } from '@/core/types/lineup'
import { LINEUP_SIZE } from '@/core/types/lineup'
import { isAvailable } from '@/core/types/player'
import type { Player, Position } from '@/core/types/player'
import { ALL_POSITIONS, defenseScore, POSITION_WEIGHT } from './aptitude'
import { overallRating } from '@/core/player/rating'

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
 * その方針での「その位置にどれだけ向いているか」。
 *
 * どの方針でも守備適性は必ず見る。守れない位置に置くと
 * 失策と被安打が増えるので（aptitude.ts）、無視すると単に弱くなる。
 */
function fitFor(plan: AutoLineupPlan, player: Player, position: Position): number {
  const defense = defenseScore(player, position)
  const hitting = player.batting.meet * 0.55 + player.batting.power * 0.45
  const overall = overallRating(player)

  switch (plan) {
    case 'ability':
      // 総合を主に見つつ、守れない位置は避ける
      return overall * 1.2 + defense * 0.5
    case 'youth':
      // 下級生を大きく優遇する。3年生は夏で抜けるので伸ばす価値が薄い
      return defense * 0.7 + hitting * 0.3 + (3 - player.grade) * 22
    case 'balanced':
    default:
      return defense * 0.7 + hitting * 0.3
  }
}

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
    const eligible =
      position === 'P' && candidates.some((p) => p.pitching)
        ? candidates.filter((p) => p.pitching)
        : candidates

    const best = eligible.reduce((a, b) =>
      fitFor(plan, b, position) > fitFor(plan, a, position) ? b : a,
    )
    assigned.set(position, best)
    used.add(best.id)
  }

  const slots = battingOrder([...assigned.entries()].map(([position, player]) => ({
    position,
    playerId: player.id,
  })), pool)

  return { slots }
}

/**
 * 打順を決める。高校野球でよくある組み方に寄せた単純なルール。
 *  1番: 走力が高い
 *  2番: ミートが高い
 *  3-4番: 打力（ミート＋パワー）が高い
 *  以降: 打力順
 *  投手は最後に回す（打撃が弱いことが多いため）
 */
function battingOrder(slots: LineupSlot[], players: Player[]): LineupSlot[] {
  const find = (id: string) => players.find((p) => p.id === id)

  const hitting = (slot: LineupSlot): number => {
    const player = find(slot.playerId)
    if (!player) return 0
    return player.batting.meet * 0.55 + player.batting.power * 0.45
  }
  const speed = (slot: LineupSlot): number => find(slot.playerId)?.batting.speed ?? 0
  const meet = (slot: LineupSlot): number => find(slot.playerId)?.batting.meet ?? 0

  const remaining = [...slots]
  const order: LineupSlot[] = []

  // 投手は打順を最後にするため、いったん外に出す
  const pitcherIndex = remaining.findIndex((slot) => slot.position === 'P')
  const pitcher = pitcherIndex >= 0 ? remaining.splice(pitcherIndex, 1)[0] : null

  const take = (score: (slot: LineupSlot) => number) => {
    if (remaining.length === 0) return
    const best = remaining.reduce((a, b) => (score(b) > score(a) ? b : a))
    remaining.splice(remaining.indexOf(best), 1)
    order.push(best)
  }

  take(speed) // 1番
  take(meet) // 2番
  take(hitting) // 3番
  take(hitting) // 4番

  // 残りは打力順
  remaining.sort((a, b) => hitting(b) - hitting(a))
  order.push(...remaining)

  if (pitcher) order.push(pitcher)
  return order
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
