/**
 * 試合中のチームの状態。
 *
 * **JSON にそのまま変換できる形しか持たない。**
 * 試合を半回ずつ進める（途中で選手交代を挟む）ため、
 * この状態が GameState に入ってセーブされるため。
 * Map / Set を使うと保存できないので、配列で持つ。
 */

import { defenseScore, misplacementPenalty, POSITION_WEIGHT } from '@/core/lineup/aptitude'
import type { Lineup } from '@/core/types/lineup'
import type { Player, Position } from '@/core/types/player'
import type { BattingLine, PitchingLine } from '@/core/types/match'
import { emptyBattingLine, emptyPitchingLine, isHit, outsOf } from '@/core/types/match'
import type { PlayResult } from '@/core/types/match'

export type MatchTeam = {
  name: string
  /** 自校かどうか。スコアの向きと実況の言い回しに使う */
  isPlayer: boolean
  /** ベンチ入りしている選手。交代要員はここから出す */
  players: Player[]
  lineup: Lineup
  /** 次に打つ打順（0始まり） */
  battingIndex: number
  pitcherId: string
  /** 現在の投手が対戦した打者数 */
  faced: number
  /** 守備力（重要度で重み付けした平均） */
  defense: number
  /** 適性を無視した起用の合計。失策率に上乗せされる */
  misplacement: number
  /** マネージャーなどによる守備力の上乗せ。編成が変わっても保つ */
  defenseBonus: number
  runs: number
  /** チーム全体の安打数。決着がつかない場合の判定に使う */
  hits: number
  batting: BattingLine[]
  pitching: PitchingLine[]
  /** すでに登板した投手 */
  usedPitchers: string[]
  /** 交代で退いた選手。高校野球と同じく再出場はできない */
  retiredIds: string[]
}

/**
 * 試合に持ち込む選手データ。
 *
 * `history`（能力の推移）は毎月増える配列で、**試合の判定には一切使わない**。
 * 中断セーブに丸ごと入ると localStorage を圧迫するので、ここで落とす。
 */
export function forMatch(player: Player): Player {
  return player.history.length === 0 ? player : { ...player, history: [] }
}

export function createTeam(params: {
  name: string
  isPlayer: boolean
  players: Player[]
  lineup: Lineup
  defenseBonus?: number
}): MatchTeam {
  const { name, isPlayer, lineup } = params
  const players = params.players.map(forMatch)
  const starter = lineup.slots.find((slot) => slot.position === 'P')?.playerId ?? players[0].id
  const defenseBonus = params.defenseBonus ?? 0

  return {
    name,
    isPlayer,
    players,
    lineup,
    battingIndex: 0,
    pitcherId: starter,
    faced: 0,
    defense: teamDefense(players, lineup) + defenseBonus,
    misplacement: teamMisplacement(players, lineup),
    defenseBonus,
    runs: 0,
    hits: 0,
    batting: [],
    pitching: [],
    usedPitchers: [starter],
    retiredIds: [],
  }
}

/**
 * 守備位置に就いている野手8人の守備力。**重要度で重み付けした平均**。
 *
 * 均等平均だと、遊撃に守れない選手を置いても一塁の名手で帳消しになり、
 * 適性を気にする理由が無くなる。二遊間や捕手の穴ほど大きく響かせる。
 */
export function teamDefense(players: Player[], lineup: Lineup): number {
  let total = 0
  let weight = 0

  for (const slot of lineup.slots) {
    if (slot.position === 'P') continue
    const player = players.find((p) => p.id === slot.playerId)
    const w = POSITION_WEIGHT[slot.position]
    total += (player ? defenseScore(player, slot.position) : 40) * w
    weight += w
  }

  return weight === 0 ? 40 : total / weight
}

/**
 * 適性を無視した起用の合計。失策率と被打率に効く。
 * 「守れない位置に置く」ことの罰を、守備力の低下とは別に上乗せする。
 */
export function teamMisplacement(players: Player[], lineup: Lineup): number {
  let total = 0
  for (const slot of lineup.slots) {
    const player = players.find((p) => p.id === slot.playerId)
    if (player) total += misplacementPenalty(player, slot.position)
  }
  return total
}

/** 編成が変わったので守備力を測り直す。交代のたびに必ず呼ぶ */
export function refreshDefense(team: MatchTeam): void {
  team.defense = teamDefense(team.players, team.lineup) + team.defenseBonus
  team.misplacement = teamMisplacement(team.players, team.lineup)
}

export function findPlayer(team: MatchTeam, id: string): Player | undefined {
  return team.players.find((p) => p.id === id)
}

/** 打順 index の打者 */
export function batterAt(team: MatchTeam, index: number): Player | undefined {
  const slot = team.lineup.slots[index]
  return slot ? findPlayer(team, slot.playerId) : undefined
}

/** 守っている位置。捕手の肩を見るときなどに使う */
export function fielderAt(team: MatchTeam, position: Position): Player | undefined {
  const slot = team.lineup.slots.find((s) => s.position === position)
  return slot ? findPlayer(team, slot.playerId) : undefined
}

/** まだ試合に出ていない控え。交代要員の候補 */
export function benchPlayers(team: MatchTeam): Player[] {
  const onField = new Set(team.lineup.slots.map((slot) => slot.playerId))
  return team.players.filter(
    (player) =>
      !onField.has(player.id) &&
      !team.retiredIds.includes(player.id) &&
      player.injuryMonths <= 0,
  )
}

/**
 * 選手を1人入れ替える。
 * 退いた選手は `retiredIds` に入り、二度と出られない。
 */
export function swapIn(team: MatchTeam, slotIndex: number, incoming: Player): void {
  const slot = team.lineup.slots[slotIndex]
  if (!slot) return

  team.retiredIds = [...team.retiredIds, slot.playerId]
  team.lineup = {
    slots: team.lineup.slots.map((s, index) =>
      index === slotIndex ? { ...s, playerId: incoming.id } : s,
    ),
  }
  refreshDefense(team)
}

/** 投手能力の目安。継投の順番を決めるのに使う */
export function pitcherValue(player: Player): number {
  const p = player.pitching
  if (!p) return 0
  return p.control * 0.35 + p.stamina * 0.3 + p.breaking * 0.35
}

/** 打撃力の目安。代打を出すかの判断に使う */
export function battingValue(player: Player): number {
  const b = player.batting
  return b.meet * 0.55 + b.power * 0.45
}

export function recordBatting(
  team: MatchTeam,
  batter: Player,
  result: PlayResult,
  rbi: number,
): void {
  const line = { ...(lineFor(team.batting, batter) ?? emptyBattingLine(batter.id, batter.name)) }

  line.plateAppearances += 1
  // 四球と犠飛は打数に数えない
  if (result !== 'walk' && result !== 'sacFly') line.atBats += 1
  if (isHit(result)) line.hits += 1
  if (result === 'double') line.doubles += 1
  if (result === 'triple') line.triples += 1
  if (result === 'homerun') line.homeruns += 1
  if (result === 'strikeout') line.strikeouts += 1
  if (result === 'walk') line.walks += 1
  if (result === 'sacFly') line.sacFlies += 1
  line.rbi += rbi

  team.batting = replaceLine(team.batting, line)
}

/** 盗塁を1つ足す。打席の記録とは別に付く */
export function recordSteal(team: MatchTeam, runner: Player): void {
  const line = { ...(lineFor(team.batting, runner) ?? emptyBattingLine(runner.id, runner.name)) }
  line.steals += 1
  team.batting = replaceLine(team.batting, line)
}

export function recordPitching(
  team: MatchTeam,
  pitcher: Player,
  result: PlayResult,
  runsAllowed: number,
  /** 自責点。失策がからんだ得点は含めない */
  earnedRuns: number,
): void {
  const line = {
    ...(lineFor(team.pitching, pitcher) ?? emptyPitchingLine(pitcher.id, pitcher.name)),
  }

  line.outs += outsOf(result)
  if (isHit(result)) line.hits += 1
  if (result === 'strikeout') line.strikeouts += 1
  if (result === 'walk') line.walks += 1
  line.runs += runsAllowed
  line.earnedRuns += earnedRuns

  team.pitching = replaceLine(team.pitching, line)
}

/** 盗塁刺しなど、打席によらないアウトを投球回に足す */
export function recordExtraOut(team: MatchTeam, pitcher: Player): void {
  const line = lineFor(team.pitching, pitcher) ?? emptyPitchingLine(pitcher.id, pitcher.name)
  team.pitching = replaceLine(team.pitching, { ...line, outs: line.outs + 1 })
}

type Line = { playerId: string }

function lineFor<T extends Line>(lines: T[], player: Player): T | undefined {
  return lines.find((line) => line.playerId === player.id)
}

function replaceLine<T extends Line>(lines: T[], line: T): T[] {
  const index = lines.findIndex((l) => l.playerId === line.playerId)
  if (index < 0) return [...lines, line]
  return lines.map((l, i) => (i === index ? line : l))
}
