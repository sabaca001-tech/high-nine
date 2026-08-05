/**
 * 大会の進行。
 *
 * 大会の相手の強さは**こちらの実力に追従させない**。
 * 練習試合と違い、大会は「3年間の育成が足りていたか」を測る場なので、
 * 難易度は絶対値で固定する。強くなれば勝てるようになる、という関係を保つ。
 */

import type { Region } from '@/core/types/region'
import { NATIONAL_ENTRANTS, regionStrength, roundsFor } from '@/core/types/region'
import type { Tournament, TournamentKind } from '@/core/types/tournament'
import { roundName, TOURNAMENT_LABELS } from '@/core/types/tournament'

/** 秋季大会は夏より参加校が少ない（新チームで規模が小さい想定） */
const AUTUMN_RATIO = 3

/** 春の全国大会の出場校数。夏より少ない */
const SPRING_ENTRANTS = 32

// 大会がいつ開かれるかは盤面の大会マス（boardDefs.ts の EVENT_DAYS）が持つ。
// 以前は「その月なら開催」という月単位の判定を持っていたが、
// 盤面が1マス1日になり日付で置けるようになったので不要になった。

/** 大会を作る */
export function createTournament(kind: TournamentKind, region: Region): Tournament {
  const entrants = entrantsOf(kind, region)
  const totalRounds = roundsFor(entrants)

  const isNational = kind === 'nationals' || kind === 'springNationals'

  return {
    kind,
    name: isNational ? TOURNAMENT_LABELS[kind] : `${region.name} ${TOURNAMENT_LABELS[kind]}`,
    entrants,
    totalRounds,
    round: 1,
    eliminated: false,
    champion: false,
    results: [],
  }
}

function entrantsOf(kind: TournamentKind, region: Region): number {
  if (kind === 'nationals') return NATIONAL_ENTRANTS
  if (kind === 'springNationals') return SPRING_ENTRANTS
  if (kind === 'autumnPref') return Math.max(8, Math.round(region.schools / AUTUMN_RATIO))
  return region.schools
}

/**
 * その回戦の相手の強さ。
 * 1回戦は格下、決勝は格上。地区の激戦度と大会の格も加算する。
 */
export function opponentStrengthFor(tournament: Tournament, region: Region): number {
  const { round, totalRounds, kind } = tournament
  const progress = totalRounds <= 1 ? 1 : (round - 1) / (totalRounds - 1)

  const base = -8 + progress * 30
  const prestige = PRESTIGE[kind]

  // 全国大会は全地区の代表が集まるので、地区の激戦度は関係ない
  const region_ = kind === 'nationals' || kind === 'springNationals' ? 0 : regionStrength(region)

  return Math.round(base + region_ + prestige)
}

/** 大会の格。相手の強さに加算される */
const PRESTIGE: Record<TournamentKind, number> = {
  summerPref: 0,
  nationals: 10,
  springNationals: 8,
  autumnPref: -4,
}

/** 1試合ぶんの結果を反映した新しい大会状態を返す */
export function applyRoundResult(
  tournament: Tournament,
  result: { opponentName: string; scoreFor: number; scoreAgainst: number; won: boolean },
): Tournament {
  const entry = {
    round: tournament.round,
    roundName: roundName(tournament.round, tournament.totalRounds),
    ...result,
  }

  const results = [...tournament.results, entry]

  if (!result.won) {
    return { ...tournament, results, eliminated: true }
  }

  const isFinal = tournament.round >= tournament.totalRounds
  return {
    ...tournament,
    results,
    champion: isFinal,
    round: isFinal ? tournament.round : tournament.round + 1,
  }
}

/**
 * 大会の成績で得られる評判。
 * 勝ち進むほど加算され、優勝は大きい。負けても減らさない
 * （大会に挑むこと自体が罰にならないようにする）。
 */
export function reputationGain(tournament: Tournament): number {
  if (!tournament.champion) return 0
  return CHAMPION_REPUTATION[tournament.kind]
}

/**
 * 優勝したことへの評価。
 *
 * **1勝ごとの評判はもう試合のたびに動いている**（`matchReputationDelta`）。
 * ここで勝ち数ぶんを足すと二重になるうえ、
 * 「1回戦で格上を倒した」と「1回戦で格下に勝った」が同じ重みになってしまう。
 * ここは「大会を制した」という一点だけを評価する。
 */
const CHAMPION_REPUTATION: Record<TournamentKind, number> = {
  summerPref: 12,
  nationals: 25,
  autumnPref: 5,
  springNationals: 16,
}
