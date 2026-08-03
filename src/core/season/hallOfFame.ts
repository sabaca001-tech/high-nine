/**
 * 歴代の記録。
 *
 * 通算成績を積み上げても、**卒業した瞬間に見えなくなる**のでは
 * 積み上げる意味が薄い。在校生と卒業生を同じ土俵に並べて、
 * 「この学校でいちばん打った選手は誰か」を残す。
 *
 * 判定に使う値は持たない。表示のための集計だけを行う。
 */

import type { CareerStats } from '@/core/player/careerStats'
import { average, era, inningsPitched, ops, strikeoutRate } from '@/core/player/careerStats'
import type { Player, Position } from '@/core/types/player'
import type { GraduateRecord } from '@/core/types/season'

/** 歴代記録に載る1人。在校生か卒業生かは問わない */
export type HallEntry = {
  id: string
  name: string
  position: Position
  isPitcher: boolean
  /** 在校生なら学年、卒業生なら卒業年 */
  note: string
  stats: CareerStats
}

/** 在校生と卒業生をひとつの名簿にまとめる */
export function allTimeRoster(
  players: Player[],
  graduates: GraduateRecord[],
): HallEntry[] {
  const current = players.map((player) => ({
    id: player.id,
    name: player.name,
    position: player.position,
    isPitcher: player.isPitcher,
    note: `${player.grade}年`,
    stats: player.stats,
  }))

  const past = graduates.map((graduate) => ({
    id: graduate.id,
    name: graduate.name,
    position: graduate.position,
    isPitcher: graduate.isPitcher,
    note: `${graduate.year}年目卒`,
    stats: graduate.highSchool,
  }))

  return [...current, ...past]
}

/**
 * ベストナインに載るための最低出場試合数。
 *
 * これが無いと、1試合だけ出て2打数2安打だった選手が
 * 打率10割で歴代1位になってしまう。
 */
export const BEST_NINE_MIN_GAMES = 5

/**
 * ポジションごとの歴代ベストナイン。
 *
 * **本職の位置だけで競わせる。** 守れる位置すべてで候補にすると、
 * 打てる選手が9枠を独占してしまい「ナイン」にならない。
 */
export function bestNine(roster: HallEntry[]): { position: Position; entry: HallEntry }[] {
  const positions: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

  return positions.flatMap((position) => {
    const candidates = roster.filter(
      (entry) =>
        entry.position === position &&
        (position === 'P'
          ? entry.stats.pitching.games >= BEST_NINE_MIN_GAMES
          : entry.stats.batting.games >= BEST_NINE_MIN_GAMES),
    )
    if (candidates.length === 0) return []

    const best = candidates.reduce((a, b) => (scoreOf(b, position) > scoreOf(a, position) ? b : a))
    return [{ position, entry: best }]
  })
}

/**
 * ベストナインを決める点数。
 *
 * 投手は投球回と防御率、野手は OPS と出場試合数で見る。
 * **積み上げ（試合数）と質（率）の両方**を見ないと、
 * 3年間出続けた凡庸な選手か、1年だけ活躍した選手のどちらかに偏る。
 */
function scoreOf(entry: HallEntry, position: Position): number {
  if (position === 'P') {
    const p = entry.stats.pitching
    const innings = inningsPitched(p)
    const earned = era(p) ?? 9.9
    return innings * 0.6 + p.wins * 4 + p.strikeouts * 0.3 - earned * 6
  }

  const b = entry.stats.batting
  return (ops(b) ?? 0) * 100 + b.games * 0.6 + b.homeruns * 2 + b.rbi * 0.4
}

/** 通算記録の部門 */
export type RecordCategory = {
  key: string
  label: string
  /** 数字の表示。該当者がいなければ空文字 */
  format: (entry: HallEntry) => string
  /** 大きいほど良いか */
  value: (entry: HallEntry) => number | null
}

/** 打率・防御率の部門に載るための最低ライン */
export const RATE_MIN_AT_BATS = 50
export const RATE_MIN_OUTS = 90

/**
 * 部門別の通算記録。
 * 累計の部門（本塁打・打点など）は最低ラインを設けず、
 * **率の部門だけ**規定打席・規定投球回に相当する下限を置く。
 */
export const RECORD_CATEGORIES: RecordCategory[] = [
  {
    key: 'homeruns',
    label: '通算本塁打',
    value: (entry) => entry.stats.batting.homeruns || null,
    format: (entry) => `${entry.stats.batting.homeruns}本`,
  },
  {
    key: 'hits',
    label: '通算安打',
    value: (entry) => entry.stats.batting.hits || null,
    format: (entry) => `${entry.stats.batting.hits}本`,
  },
  {
    key: 'rbi',
    label: '通算打点',
    value: (entry) => entry.stats.batting.rbi || null,
    format: (entry) => `${entry.stats.batting.rbi}点`,
  },
  {
    key: 'steals',
    label: '通算盗塁',
    value: (entry) => entry.stats.batting.steals || null,
    format: (entry) => `${entry.stats.batting.steals}個`,
  },
  {
    key: 'average',
    label: '通算打率',
    value: (entry) =>
      entry.stats.batting.atBats >= RATE_MIN_AT_BATS ? average(entry.stats.batting) : null,
    format: (entry) => formatRate(average(entry.stats.batting)),
  },
  {
    key: 'ops',
    label: '通算OPS',
    value: (entry) =>
      entry.stats.batting.atBats >= RATE_MIN_AT_BATS ? ops(entry.stats.batting) : null,
    format: (entry) => formatRate(ops(entry.stats.batting)),
  },
  {
    key: 'wins',
    label: '通算勝利',
    value: (entry) => entry.stats.pitching.wins || null,
    format: (entry) => `${entry.stats.pitching.wins}勝`,
  },
  {
    key: 'strikeouts',
    label: '通算奪三振',
    value: (entry) => entry.stats.pitching.strikeouts || null,
    format: (entry) => `${entry.stats.pitching.strikeouts}個`,
  },
  {
    key: 'era',
    label: '通算防御率',
    // 防御率だけは小さいほど良いので符号を反転させる
    value: (entry) => {
      if (entry.stats.pitching.outs < RATE_MIN_OUTS) return null
      const value = era(entry.stats.pitching)
      return value === null ? null : -value
    },
    format: (entry) => {
      const value = era(entry.stats.pitching)
      return value === null ? '—' : value.toFixed(2)
    },
  },
  {
    key: 'strikeoutRate',
    label: '通算奪三振率',
    value: (entry) =>
      entry.stats.pitching.outs >= RATE_MIN_OUTS ? strikeoutRate(entry.stats.pitching) : null,
    format: (entry) => {
      const value = strikeoutRate(entry.stats.pitching)
      return value === null ? '—' : value.toFixed(2)
    },
  },
]

/** 1部門の1位。該当者がいなければ null */
export function leaderOf(
  roster: HallEntry[],
  category: RecordCategory,
): { entry: HallEntry; text: string } | null {
  let best: HallEntry | null = null
  let bestValue = -Infinity

  for (const entry of roster) {
    const value = category.value(entry)
    if (value === null) continue
    if (value > bestValue) {
      bestValue = value
      best = entry
    }
  }

  return best ? { entry: best, text: category.format(best) } : null
}

/** 「.312」形式。careerStats の formatRate と同じ規則 */
function formatRate(value: number | null): string {
  if (value === null) return '—'
  const text = value.toFixed(3)
  return value < 1 ? text.replace(/^0/, '') : text
}
