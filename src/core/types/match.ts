/** 試合に関する型定義 */

import type { Player } from './player'
import type { Lineup } from './lineup'

/** 観戦速度。結果には影響せず、再生の速さだけが変わる */
export type MatchSpeed = 'skip' | 'normal' | 'fast'

export const MATCH_SPEED_LABELS: Record<MatchSpeed, string> = {
  skip: 'スキップ',
  normal: '通常',
  fast: '高速',
}

/** 打席の結果 */
export type PlayResult =
  | 'strikeout' // 三振
  | 'groundout' // ゴロアウト
  | 'flyout' // フライアウト
  | 'doublePlay' // 併殺
  | 'sacFly' // 犠牲フライ
  | 'walk' // 四球
  | 'error' // 失策で出塁
  | 'single' // 単打
  | 'double' // 二塁打
  | 'triple' // 三塁打
  | 'homerun' // 本塁打

export const PLAY_RESULT_LABELS: Record<PlayResult, string> = {
  strikeout: '三振',
  groundout: 'ゴロ',
  flyout: 'フライ',
  doublePlay: '併殺',
  sacFly: '犠飛',
  walk: '四球',
  error: '失策',
  single: '単打',
  double: '二塁打',
  triple: '三塁打',
  homerun: '本塁打',
}

/** 安打として記録される結果か */
export function isHit(result: PlayResult): boolean {
  return (
    result === 'single' || result === 'double' || result === 'triple' || result === 'homerun'
  )
}

/** アウトが増える結果か（増える数を返す） */
export function outsOf(result: PlayResult): number {
  if (result === 'doublePlay') return 2
  if (result === 'strikeout' || result === 'groundout' || result === 'flyout') return 1
  if (result === 'sacFly') return 1
  return 0
}

/** 攻守どちらの回か */
export type Half = 'top' | 'bottom'

/** 1打席ぶんの記録。UI はこれを順番に再生する */
export type PlayLog = {
  id: string
  /** 試合全体での並び順。投手交代と混ぜて時系列に並べるために使う */
  order: number
  inning: number
  half: Half
  /** 打席前のアウト数 */
  outs: number
  batterName: string
  pitcherName: string
  result: PlayResult
  /** この打席で入った点 */
  runsScored: number
  /** 実況テキスト */
  text: string
  /** 打席後のスコア */
  score: { player: number; opponent: number }
  /** 打席後の塁の状況 [一塁, 二塁, 三塁] */
  bases: [boolean, boolean, boolean]
  /** 打席後のアウト数（3なら攻守交代） */
  outsAfter: number
  /** 見どころ（スキップ時にも表示する） */
  highlight: boolean
}

/** 投手交代などの割り込み。PlayLog と同じ流れに混ぜて再生する */
export type MatchEventLog = {
  id: string
  order: number
  inning: number
  half: Half
  text: string
}

/**
 * 打撃成績。
 * 通算成績（打率・出塁率・OPS）を積み上げられるよう、
 * **率ではなく素の数** だけを持つ。率は表示のときに計算する。
 */
export type BattingLine = {
  playerId: string
  name: string
  /** 打席数。打数＋四球＋犠飛 */
  plateAppearances: number
  atBats: number
  hits: number
  doubles: number
  triples: number
  homeruns: number
  rbi: number
  strikeouts: number
  walks: number
  /** 犠飛。打数には数えないが打席には数える */
  sacFlies: number
  /** 盗塁成功数 */
  steals: number
}

/** 投手の勝敗の記録。付かないこともある */
export type PitchingDecision = 'win' | 'lose'

/** 投手成績 */
export type PitchingLine = {
  playerId: string
  name: string
  /** 投球回はアウト数で持つ（3で1回） */
  outs: number
  hits: number
  runs: number
  /** 自責点。失策がからんだ得点は数えない */
  earnedRuns: number
  strikeouts: number
  walks: number
  /** この試合で勝敗が付いたか */
  decision: PitchingDecision | null
}

/** 空の打撃成績を作る */
export function emptyBattingLine(playerId: string, name: string): BattingLine {
  return {
    playerId,
    name,
    plateAppearances: 0,
    atBats: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeruns: 0,
    rbi: 0,
    strikeouts: 0,
    walks: 0,
    sacFlies: 0,
    steals: 0,
  }
}

/** 空の投手成績を作る */
export function emptyPitchingLine(playerId: string, name: string): PitchingLine {
  return {
    playerId,
    name,
    outs: 0,
    hits: 0,
    runs: 0,
    earnedRuns: 0,
    strikeouts: 0,
    walks: 0,
    decision: null,
  }
}

/** 試合の種類 */
export type MatchKind = 'friendly'

/** 試合まるごとの結果。先に全部作ってから UI が再生する */
export type MatchResult = {
  kind: MatchKind
  opponentName: string
  /** 相手がライバル校ならその id。無ければ null */
  opponentSchoolId: string | null
  /** 相手の強さ。0が互角、+20なら格上。評判の増減に使う */
  opponentStrength: number
  /** イニングごとの得点（0番目が1回） */
  innings: { player: number; opponent: number }[]
  finalScore: { player: number; opponent: number }
  outcome: 'win' | 'lose' | 'draw'
  plays: PlayLog[]
  events: MatchEventLog[]
  battingLines: BattingLine[]
  pitchingLines: PitchingLine[]
  /** 一番活躍した選手 */
  mvpPlayerId: string | null
}

/** シミュレーションの入力 */
/**
 * これから行う試合の情報。
 *
 * 試合を**その場でシミュレートせず**、スタメンを確認してから始めるために
 * 一度ここに置く。確認画面でスタメンを変えた結果が試合に反映される。
 * 相手校名は先に決めておく（確認画面に出すため）。
 */
export type PendingMatchSetup = {
  kind: MatchKind
  opponentName: string
  /**
   * 相手がライバル校ならその id。使い捨ての相手なら null。
   * 対戦成績を残すために、試合結果まで持ち回る。
   */
  opponentSchoolId?: string
  opponentStrength: number
  decisive?: boolean
  /** 練習試合で遠征する場合の行き先（表示用） */
  awayRegionName?: string
  /** 相手がどこの代表か（全国大会での表示用） */
  opponentRegionName?: string
  /** 大会の回戦名（表示用） */
  roundName?: string
}

export type MatchSetup = {
  players: Player[]
  lineup: Lineup
  opponentName: string
  /** 相手がライバル校ならその id。対戦成績を残すのに使う */
  opponentSchoolId?: string
  /** 相手の強さ。0が互角、+20なら格上 */
  opponentStrength: number
  kind: MatchKind
  /**
   * 必ず決着をつけるか。
   * トーナメントでは引き分けが成立しないので true にする。
   * 10回以降はタイブレーク（無死一・二塁から開始）になる。
   */
  decisive?: boolean
  /** 自校の守備力への上乗せ（マネージャーなど） */
  defenseBonus?: number
}
