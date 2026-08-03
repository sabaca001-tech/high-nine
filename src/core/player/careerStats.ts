/**
 * 個人の通算成績。
 *
 * **率ではなく素の数だけを積み上げる。**
 * 打率・出塁率・OPS・防御率は表示のたびに計算する。
 * 率を保存すると、試合を足したときに合成できず必ず狂う。
 *
 * 年度ごとの内訳は持たない（セーブが際限なく膨らむため）。
 * 「積み上がっていくのを楽しむ」ための通算値だけを残す。
 */

import type { BattingLine, PitchingLine } from '@/core/types/match'

/** 野手の通算成績 */
export type BattingStats = {
  /** 出場試合数 */
  games: number
  plateAppearances: number
  atBats: number
  hits: number
  doubles: number
  triples: number
  homeruns: number
  rbi: number
  walks: number
  strikeouts: number
  sacFlies: number
  steals: number
}

/** 投手の通算成績 */
export type PitchingStats = {
  /** 登板試合数 */
  games: number
  /** 投球回はアウト数で持つ（3で1回） */
  outs: number
  wins: number
  losses: number
  hits: number
  runs: number
  earnedRuns: number
  strikeouts: number
  walks: number
}

/** 選手1人の通算成績 */
export type CareerStats = {
  batting: BattingStats
  pitching: PitchingStats
}

export function emptyCareerStats(): CareerStats {
  return {
    batting: {
      games: 0,
      plateAppearances: 0,
      atBats: 0,
      hits: 0,
      doubles: 0,
      triples: 0,
      homeruns: 0,
      rbi: 0,
      walks: 0,
      strikeouts: 0,
      sacFlies: 0,
      steals: 0,
    },
    pitching: {
      games: 0,
      outs: 0,
      wins: 0,
      losses: 0,
      hits: 0,
      runs: 0,
      earnedRuns: 0,
      strikeouts: 0,
      walks: 0,
    },
  }
}

/** 1試合ぶんの打撃成績を足す */
export function addBatting(stats: CareerStats, line: BattingLine): CareerStats {
  const b = stats.batting
  return {
    ...stats,
    batting: {
      games: b.games + 1,
      plateAppearances: b.plateAppearances + line.plateAppearances,
      atBats: b.atBats + line.atBats,
      hits: b.hits + line.hits,
      doubles: b.doubles + line.doubles,
      triples: b.triples + line.triples,
      homeruns: b.homeruns + line.homeruns,
      rbi: b.rbi + line.rbi,
      walks: b.walks + line.walks,
      strikeouts: b.strikeouts + line.strikeouts,
      sacFlies: b.sacFlies + line.sacFlies,
      steals: b.steals + line.steals,
    },
  }
}

/** 1試合ぶんの投手成績を足す */
export function addPitching(stats: CareerStats, line: PitchingLine): CareerStats {
  const p = stats.pitching
  return {
    ...stats,
    pitching: {
      games: p.games + 1,
      outs: p.outs + line.outs,
      wins: p.wins + (line.decision === 'win' ? 1 : 0),
      losses: p.losses + (line.decision === 'lose' ? 1 : 0),
      hits: p.hits + line.hits,
      runs: p.runs + line.runs,
      earnedRuns: p.earnedRuns + line.earnedRuns,
      strikeouts: p.strikeouts + line.strikeouts,
      walks: p.walks + line.walks,
    },
  }
}

/** 通算成績が1試合でもあるか。無ければ画面に出さない */
export function hasBatted(stats: CareerStats): boolean {
  return stats.batting.games > 0
}

export function hasPitched(stats: CareerStats): boolean {
  return stats.pitching.games > 0
}

// ── 率の計算 ────────────────────────────
// すべて素の数から導く。保存はしない。

/** 打率。打数0なら null（「.000」と区別する） */
export function average(b: BattingStats): number | null {
  return b.atBats === 0 ? null : b.hits / b.atBats
}

/** 出塁率 (安打＋四球) / (打数＋四球＋犠飛) */
export function onBase(b: BattingStats): number | null {
  const chances = b.atBats + b.walks + b.sacFlies
  return chances === 0 ? null : (b.hits + b.walks) / chances
}

/** 塁打数。単打1・二塁打2・三塁打3・本塁打4 */
export function totalBases(b: BattingStats): number {
  const singles = b.hits - b.doubles - b.triples - b.homeruns
  return singles + b.doubles * 2 + b.triples * 3 + b.homeruns * 4
}

/** 長打率 */
export function slugging(b: BattingStats): number | null {
  return b.atBats === 0 ? null : totalBases(b) / b.atBats
}

/** OPS。出塁率＋長打率 */
export function ops(b: BattingStats): number | null {
  const obp = onBase(b)
  const slg = slugging(b)
  return obp === null || slg === null ? null : obp + slg
}

/** 投球回（小数。7回1/3なら 7.333…） */
export function inningsPitched(p: PitchingStats): number {
  return p.outs / 3
}

/** 防御率 = 自責点 × 9 ÷ 投球回。1球も投げていなければ null */
export function era(p: PitchingStats): number | null {
  if (p.outs === 0) return null
  return (p.earnedRuns * 9) / inningsPitched(p)
}

/** 奪三振率 = 奪三振 × 9 ÷ 投球回 */
export function strikeoutRate(p: PitchingStats): number | null {
  if (p.outs === 0) return null
  return (p.strikeouts * 9) / inningsPitched(p)
}

// ── 表示のための整形 ────────────────────

/** 「.312」形式。1を超える場合（OPS）は「1.024」 */
export function formatRate(value: number | null): string {
  if (value === null) return '—'
  const text = value.toFixed(3)
  return value < 1 ? text.replace(/^0/, '') : text
}

/** 「2.45」形式 */
export function formatEra(value: number | null): string {
  return value === null ? '—' : value.toFixed(2)
}

/** 「7回1/3」形式の投球回 */
export function formatInnings(outs: number): string {
  const full = Math.floor(outs / 3)
  const rest = outs % 3
  if (rest === 0) return `${full}`
  return `${full}${rest === 1 ? '⅓' : '⅔'}`
}
