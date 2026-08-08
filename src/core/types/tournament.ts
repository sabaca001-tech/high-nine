/** 大会の型定義 */

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
   * 抽選で決まった山。**開幕時に全回戦の相手が決まる。**
   *
   * トーナメントなので、運が悪ければ1回戦から優勝候補と当たる。
   * 回戦ごとに難易度を決め打ちしていた頃は、
   * 1回戦は必ず格下・決勝は必ず格上という筋書きになっていて、
   * 抽選の妙という高校野球のいちばん面白いところが消えていた。
   */
  draw: TournamentDrawEntry[]
}

/** 抽選で決まった1回戦ぶんの相手 */
export type TournamentDrawEntry = {
  /** ライバル校のid。使い捨ての相手なら省略 */
  schoolId?: string
  name: string
  /** 相手の強さ。0が互角 */
  strength: number
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
