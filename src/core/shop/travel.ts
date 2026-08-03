/**
 * 遠征費。
 *
 * 部費の使い道が「ショップで買う」だけだと、勝っても貯まる一方になる。
 * 実際の高校野球でいちばん大きな出費は**遠征の移動と宿泊**なので、
 * 遠くで試合するほど部費が出ていくようにした。
 *
 * これによって所在地の選択に、回戦数（＝勝ち抜きにくさ）とは別の軸が入る。
 * 参加校が少なくて全国に出やすい地区ほど甲子園から遠い、という関係になっていて、
 * 「勝ちやすいが遠征費が重い」「勝ちにくいが近い」のどちらを取るかを選べる。
 *
 * 賞金（収入）は funds.ts、ここは支出と遠征補助を扱う。
 */

import { findRegion, travelDistance } from '@/core/types/region'
import type { Region } from '@/core/types/region'
import type { TournamentKind } from '@/core/types/tournament'

/** 全国大会の開催地。ここへの距離が遠征費になる */
const NATIONAL_VENUE_REGION_ID = 'hyogo'

/** 遠征に連れて行く人数（ベンチ入りと引率） */
export const TRAVEL_PARTY = 18

/** 1人・距離1あたりの交通費（往復ぶん） */
const FARE_PER_DISTANCE = 350

/** 1人1泊の宿泊費 */
const LODGING_PER_NIGHT = 3000

/** 地区大会で球場まで移動する費用（1人・1試合あたり） */
const LOCAL_FARE_PER_GAME = 400

/**
 * 全国大会に出場するだけでもらえる遠征補助（後援会・寄付）。
 *
 * これが無いと「初戦敗退＝丸損」になり、勝って全国に行ったこと自体が
 * 罰になってしまう。出場の時点で交通費ぶんはおおむね賄えるようにしている。
 */
const APPEARANCE_GRANT: Record<TournamentKind, number> = {
  summerPref: 0, // 地元開催なので補助は無い
  autumnPref: 0,
  nationals: 100_000,
  springNationals: 80_000,
}

/** 練習試合の遠征（日帰りのバス移動）。1人・距離1あたり */
const FRIENDLY_FARE_PER_DISTANCE = 120

/**
 * 練習試合の遠征先として選べる最大距離。
 * 隣接する地方まで。練習試合で飛行機に乗る学校は無い。
 */
export const FRIENDLY_TRAVEL_MAX_DISTANCE = 7

/**
 * スカウトの出張費。
 *
 * 監督1人が動く前提。**距離がそのまま費用になる**ので、
 * 遠くの県ほど「良い選手がいるかもしれないが手が出ない」になる。
 * 弱小校（月の部費16,000円）だと地元近辺を1〜2回まわるのが精一杯。
 */
const SCOUT_BASE_COST = 8_000
const SCOUT_FARE_PER_DISTANCE = 1_800

/** これ以上遠いと日帰りできず、宿泊費が乗る */
const SCOUT_LODGING_DISTANCE = 12
const SCOUT_LODGING = 9_000

/** 1回の出張にかかる費用 */
export function scoutTripCost(from: Region, to: Region): number {
  const distance = travelDistance(from, to)
  const lodging = distance >= SCOUT_LODGING_DISTANCE ? SCOUT_LODGING : 0
  return SCOUT_BASE_COST + distance * SCOUT_FARE_PER_DISTANCE + lodging
}

export type TravelExpense = {
  /** 遠征費（支出） */
  cost: number
  /** 遠征補助（収入）。全国大会のみ */
  grant: number
  /** 移動距離。0なら地元 */
  distance: number
  /** 宿泊数 */
  nights: number
}

/** 全国大会かどうか */
function isNational(kind: TournamentKind): boolean {
  return kind === 'nationals' || kind === 'springNationals'
}

/**
 * 大会1つぶんの遠征費と補助。
 *
 * 全国大会は会場までの往復に加えて、**勝ち進むほど宿泊費がかさむ**。
 * 1勝の賞金は1泊ぶんより大きく設定してあるので、勝つほど得にはなる。
 *
 * @param games 実際に行った試合数
 */
export function tournamentTravel(
  kind: TournamentKind,
  region: Region,
  games: number,
): TravelExpense {
  if (!isNational(kind)) {
    // 地区大会は県内なので、球場までの移動費だけ
    return {
      cost: TRAVEL_PARTY * LOCAL_FARE_PER_GAME * games,
      grant: 0,
      distance: 0,
      nights: 0,
    }
  }

  const distance = travelDistance(region, findRegion(NATIONAL_VENUE_REGION_ID))
  // 会場が地元なら通いなので泊まらない
  const nights = distance === 0 ? 0 : games

  return {
    cost: TRAVEL_PARTY * (FARE_PER_DISTANCE * distance + LODGING_PER_NIGHT * nights),
    grant: APPEARANCE_GRANT[kind],
    distance,
    nights,
  }
}

/** 全国大会の会場までの距離。所在地選択の画面で見せる */
export function distanceToNationalVenue(region: Region): number {
  return travelDistance(region, findRegion(NATIONAL_VENUE_REGION_ID))
}

/** 練習試合で他県へ遠征するときの費用 */
export function friendlyTravelCost(distance: number): number {
  return TRAVEL_PARTY * FRIENDLY_FARE_PER_DISTANCE * distance
}
