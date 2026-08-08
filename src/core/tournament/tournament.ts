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
import type {
  Tournament,
  TournamentDrawEntry,
  TournamentKind,
} from '@/core/types/tournament'
import { roundName, TOURNAMENT_LABELS } from '@/core/types/tournament'

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
  /** 抽選に使う。省略すると相手が決まらないので、必ず渡すこと */
  draw: TournamentDrawEntry[] = [],
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
    draw,
  }
}

/**
 * 山を引く。**開幕時に全回戦の相手を決める。**
 *
 * 回戦ごとに「1回戦は格下・決勝は格上」と難易度を決め打ちしていた頃は、
 * どの大会も同じ筋書きになっていて、抽選の妙が無かった。
 *
 * ここでは**勝ち残る確率**で重みを付ける。
 * 1回戦は全校が同じ重み（＝完全な抽選）なので、**優勝候補と当たることもある**。
 * 回戦が進むほど強い学校の重みが増える。勝ち上がってきた相手なのだから当然で、
 * 難易度の上がり方は決め打ちではなく**そこから自然に出てくる**。
 *
 * 同じ学校は二度出てこない（トーナメントなので当たり前）。
 */
export function drawTournament(
  rng: Rng,
  pool: { id: string; name: string; strength: number }[],
  totalRounds: number,
  /** 学校が足りないときに使う使い捨ての相手 */
  fallback: (round: number) => TournamentDrawEntry,
): TournamentDrawEntry[] {
  const average =
    pool.length > 0 ? pool.reduce((sum, s) => sum + s.strength, 0) / pool.length : 0

  const remaining = [...pool]
  const draw: TournamentDrawEntry[] = []

  for (let round = 1; round <= totalRounds; round++) {
    if (remaining.length === 0) {
      draw.push(fallback(round))
      continue
    }

    // 1回戦は重み1（完全な抽選）。回戦が進むほど強い学校が残りやすい
    const weights = remaining.map((school) => ({
      value: school,
      weight: Math.pow(
        Math.max(SURVIVAL_FLOOR, 1 + (school.strength - average) * SURVIVAL_RATE),
        round - 1,
      ),
    }))

    const picked = rng.weighted(weights)
    remaining.splice(remaining.indexOf(picked), 1)
    draw.push({ schoolId: picked.id, name: picked.name, strength: picked.strength })
  }

  return draw
}

/**
 * 勝ち残りやすさ。平均より1点強いと1回戦ぶんの生存率が5%上がる。
 * 6回戦制なら、平均+20の学校は決勝で32倍出やすくなる。
 */
const SURVIVAL_RATE = 0.05

/** どれだけ弱くても勝ち上がる目はある */
const SURVIVAL_FLOOR = 0.2

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
