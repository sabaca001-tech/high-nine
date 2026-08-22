/**
 * 大会の進行。
 *
 * 大会の相手の強さは**こちらの実力に追従させない**。
 * 練習試合と違い、大会は「3年間の育成が足りていたか」を測る場なので、
 * 難易度は絶対値で固定する。強くなれば勝てるようになる、という関係を保つ。
 */

import type { Region } from '@/core/types/region'
import { NATIONAL_ENTRANTS, regionStrength, roundsFor } from '@/core/types/region'
import type { Rng } from '@/core/rng/random'
import type { Tournament, TournamentKind } from '@/core/types/tournament'
import { roundName, TOURNAMENT_LABELS } from '@/core/types/tournament'
import type { Bracket } from './bracket'
import { resolveRound } from './bracket'

/** 秋季大会は夏より参加校が少ない（新チームで規模が小さい想定） */
const AUTUMN_RATIO = 3

/** 春の全国大会の出場校数。夏より少ない */
const SPRING_ENTRANTS = 32

// 大会がいつ開かれるかは盤面の大会マス（boardDefs.ts の EVENT_DAYS）が持つ。
// 以前は「その月なら開催」という月単位の判定を持っていたが、
// 盤面が1マス1日になり日付で置けるようになったので不要になった。

/** 大会を作る */
export function createTournament(
  kind: TournamentKind,
  region: Region,
  /** トーナメント表。省略すると相手が決まらないので、必ず渡すこと */
  bracket: Bracket = { slots: [], winners: [] },
): Tournament {
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
    bracket,
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

  const range = OPPONENT_RANGE[kind]
  const base = range.from + progress * (range.to - range.from)

  // 全国大会は全地区の代表が集まるので、地区の激戦度は関係ない
  const region_ = kind === 'nationals' || kind === 'springNationals' ? 0 : regionStrength(region)

  return Math.round(base + region_)
}

/**
 * 回戦ごとの相手の強さ。1回戦から決勝までの幅。
 *
 * **全国大会の下限を大きく上げた。** 以前は1回戦が +2（総合45相当）で、
 * 県大会の1回戦とほとんど変わらなかった。
 * 甲子園に出てくるのは**全員が県の代表**なので、
 * 初戦から県大会の決勝級の相手が来るのが筋。
 * 育て切ったチームが初出場でそのまま優勝できてしまっていた。
 */
const OPPONENT_RANGE: Record<TournamentKind, { from: number; to: number }> = {
  summerPref: { from: -8, to: 22 },
  autumnPref: { from: -12, to: 16 },
  nationals: { from: 14, to: 36 },
  springNationals: { from: 10, to: 32 },
}

/**
 * 1試合ぶんの結果を反映した新しい大会状態を返す。
 *
 * **同じ回戦の他校同士の試合もここで解決する。**
 * 自校の次の相手は、隣の山を勝ち上がってきた学校になる。
 * 自校が負けた回戦も解決しておく（そのあと誰が優勝したかを見せるため）。
 */
export function applyRoundResult(
  rng: Rng,
  tournament: Tournament,
  result: { opponentName: string; scoreFor: number; scoreAgainst: number; won: boolean },
): Tournament {
  const entry = {
    round: tournament.round,
    roundName: roundName(tournament.round, tournament.totalRounds),
    ...result,
  }

  const results = [...tournament.results, entry]
  const bracket = resolveRound(rng, tournament.bracket, tournament.round, result.won)

  if (!result.won) {
    // 自校が消えたあとも大会は続く。優勝校まで一気に決めてしまう
    return { ...tournament, results, bracket: runOut(rng, bracket, tournament), eliminated: true }
  }

  const isFinal = tournament.round >= tournament.totalRounds
  return {
    ...tournament,
    results,
    bracket,
    champion: isFinal,
    round: isFinal ? tournament.round : tournament.round + 1,
  }
}

/** 残りの回戦を他校同士で消化する。自校が敗退したあとに使う */
function runOut(rng: Rng, bracket: Bracket, tournament: Tournament): Bracket {
  let next = bracket
  for (let round = bracket.winners.length + 1; round <= tournament.totalRounds; round++) {
    next = resolveRound(rng, next, round, false)
  }
  return next
}

/**
 * 大会の成績で得られる評判。
 * 勝ち進むほど加算され、優勝は大きい。負けても減らさない
 * （大会に挑むこと自体が罰にならないようにする）。
 */
export function reputationGain(tournament: Tournament): number {
  const full = CHAMPION_REPUTATION[tournament.kind]
  if (tournament.champion) return full

  // 勝ち上がった割合ぶん。決勝進出でおよそ半分、初戦敗退なら0
  const cleared = tournament.round - 1
  if (cleared <= 0 || tournament.totalRounds <= 1) return 0

  const progress = cleared / tournament.totalRounds
  return round1(full * progress * RUNNER_UP_SHARE)
}

/**
 * 優勝に対して、勝ち上がりをどれだけ評価するか。
 * 決勝まで行っても優勝の半分弱に留めて、「勝ち切ること」の価値を残す。
 */
const RUNNER_UP_SHARE = 0.55

/**
 * **早く負けるほど評判を失う。**
 *
 * 「どこまで勝ったか」で加点するだけだった頃は、
 * 初戦敗退の年に起きるのが「何も貰えない」だけで、
 * 一度上がった評判はほとんど落ちなかった。
 *
 * 期待されている学校ほど、早い敗退は取り返しがつかない。
 * 無名校の1回戦負けは誰も気にしないが、
 * 甲子園に出ている学校が県の1回戦で消えれば評判は大きく傷つく。
 *
 * @param reputation いまの評判。**期待の大きさ**として使う
 */
export function earlyExitPenalty(tournament: Tournament, reputation: number): number {
  if (tournament.champion || tournament.totalRounds <= 1) return 0

  const cleared = Math.max(0, tournament.round - 1)
  const progress = cleared / tournament.totalRounds

  // 半分まで勝ち上がれば「早い敗退」ではない（8回戦ならベスト8前後）
  const missed = Math.max(0, 1 - progress / EXPECTED_PROGRESS)
  if (missed <= 0) return 0

  // 評判0の学校でも少しは下がる（`EXPECTATION_FLOOR`）が、
  // 大半は「その学校に何が期待されていたか」で決まる
  const expectation = EXPECTATION_FLOOR + (1 - EXPECTATION_FLOOR) * (reputation / 100)
  return -round1(EARLY_EXIT_PENALTY[tournament.kind] * missed * expectation)
}

/**
 * 初戦敗退したときに失う評判（期待が最大の学校の場合）。
 *
 * **夏の地区大会がいちばん重い。** 3年生にとって最後の大会で、
 * ここを勝てなければその年は終わる。
 * 全国大会は出ること自体が評価なので、負けても失うものは小さい。
 */
const EARLY_EXIT_PENALTY: Record<TournamentKind, number> = {
  summerPref: 7,
  autumnPref: 3,
  nationals: 3,
  springNationals: 2.5,
}

/** ここまで勝ち上がれば「早い敗退」とは呼ばない */
const EXPECTED_PROGRESS = 0.5

/** 評判が0の学校にかかる分。期待されていなくても、負けは負け */
const EXPECTATION_FLOOR = 0.2

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * 大会での戦績への評価。
 *
 * 1勝ごとの評判は試合のたびに動いている（`matchReputationDelta`）ので、
 * ここは「どこまで勝ち上がったか」という**大会全体の格**を評価する。
 *
 * **優勝だけを見ていた頃は、決勝で負けた年と初戦で負けた年が同じ扱いだった。**
 * 県大会でベスト4に入り続けても評判が動かず、
 * 勝率6割のチームが30前後で頭打ちになっていた。
 */
const CHAMPION_REPUTATION: Record<TournamentKind, number> = {
  summerPref: 12,
  nationals: 25,
  autumnPref: 5,
  springNationals: 16,
}
