/** 大会の型定義 */

import type { Bracket } from '@/core/tournament/bracket'

/** 大会の種類 */
export type TournamentKind =
  | 'summerPref' // 夏の地区大会。優勝すると夏の全国大会へ
  | 'nationals' // 夏の全国大会
  | 'autumnPref' // 秋季地区大会。優勝すると春の全国大会へ
  | 'springNationals' // 春の全国大会（翌年3月）

export const TOURNAMENT_LABELS: Record<TournamentKind, string> = {
  summerPref: '夏の大会',
  nationals: '夏の全国大会',
  autumnPref: '秋季大会',
  springNationals: '春の全国大会',
}

/** 1回戦ぶんの結果 */
export type TournamentRoundResult = {
  round: number
  roundName: string
  opponentName: string
  scoreFor: number
  scoreAgainst: number
  won: boolean
}

export type Tournament = {
  kind: TournamentKind
  /** 表示名（「神奈川 夏の大会」など） */
  name: string
  /** 参加校数 */
  entrants: number
  /** 優勝までに必要な勝ち数 */
  totalRounds: number
  /** 現在の回戦（1始まり） */
  round: number
  eliminated: boolean
  champion: boolean
  results: TournamentRoundResult[]
  /**
   * トーナメント表。**参加校を全部並べたブラケット。**
   *
   * 開幕時に決まるのは組み合わせだけで、**相手は勝ち上がりで決まる**。
   * 以前は自校の相手を決勝まで並べていたので、
   * 1回戦の時点で決勝の相手が確定していたし、
   * 他校同士の試合が存在しないので「優勝候補が3回戦で消えた」も起きなかった。
   */
  bracket: Bracket
}

/** 大会が終わっているか（優勝か敗退） */
export function isTournamentOver(tournament: Tournament): boolean {
  return tournament.champion || tournament.eliminated
}

/**
 * 回戦の呼び名。残り2試合なら準決勝、最後なら決勝。
 */
export function roundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round
  if (remaining === 0) return '決勝'
  if (remaining === 1) return '準決勝'
  if (remaining === 2) return '準々決勝'
  return `${round}回戦`
}
