/**
 * 練習試合の相手候補。
 *
 * **1つに決め打ちしていたのをやめた。**
 * 以前は止まった瞬間に相手も遠征先も勝手に決まっていて、
 * 遠征費だけ引かれていることに後から気づくことすらあった。
 * 練習試合は「誰と、いくらかけて、そもそもやるかどうか」を選ぶ場にする。
 *
 * **県内の相手は必ず候補に入れる。** 遠征は選択肢であって前提ではない。
 * 部費が乏しい学校でも、必ず0円で戦える相手が1つはある。
 */

import type { Rng } from '@/core/rng/random'
import { pickOpponentName } from './opponent'
import { pickRivalFor, rivalsIn } from '@/core/rival/rivals'
import type { RivalSchool } from '@/core/rival/rivals'
import { REGIONS, travelDistance } from '@/core/types/region'
import type { Region } from '@/core/types/region'
import { FRIENDLY_TRAVEL_MAX_DISTANCE, friendlyTravelCost } from '@/core/shop/travel'

/** 出す候補の数（「行わない」は含まない） */
export const FRIENDLY_OFFER_COUNT = 3

/** 遠征先の相手の強さの上乗せ。わざわざ遠くまで行くのは格上と戦うため */
export const AWAY_OPPONENT_BONUS = 8

/**
 * 練習試合の相手候補1つ。**セーブに入るので JSON にできる形だけ持つ。**
 */
export type FriendlyOffer = {
  id: string
  opponentName: string
  /** ライバル校ならその id。使い捨ての相手なら省略 */
  opponentSchoolId?: string
  /** 相手の強さ。0が互角、+20なら格上 */
  opponentStrength: number
  /** 開催地の県名 */
  regionName: string
  /** 遠征費。県内なら0 */
  travelCost: number
}

/**
 * 候補を作る。
 *
 * 1つ目は必ず県内（遠征費0）。残りは日帰りできる範囲の他県から引く。
 * **払えない候補も出す。** 「行けるが高い」と「そもそも足りない」は
 * プレイヤーが見て判断することで、選択に意味が出る。
 */
export function createFriendlyOffers(
  rng: Rng,
  params: {
    /** こちらの実力（相手の強さの基準になる） */
    strength: number
    /** 学校の所在地 */
    region: Region
    rivals: RivalSchool[]
    /** id の採番に使う通し番号 */
    serial: number
  },
): { offers: FriendlyOffer[]; serial: number } {
  const { region: home, rivals } = params
  let serial = params.serial

  const offers: FriendlyOffer[] = []

  /** その県の相手を1つ作る */
  const offerIn = (region: Region, bonus: number): FriendlyOffer => {
    const base = params.strength + rng.int(-8, 8) + bonus
    const rival = pickRivalFor(rng, rivalsIn(rivals, region.id), base)
    const distance = travelDistance(home, region)

    return {
      id: `offer-${serial++}`,
      opponentName: rival?.name ?? pickOpponentName(rng),
      ...(rival ? { opponentSchoolId: rival.id } : {}),
      opponentStrength: rival?.strength ?? base,
      regionName: region.name,
      travelCost: distance > 0 ? friendlyTravelCost(distance) : 0,
    }
  }

  // 1つ目は必ず県内。遠征しない選択が常に残るようにする
  offers.push(offerIn(home, 0))

  // 練習試合で飛行機には乗らない。日帰りできる範囲の県だけを候補にする
  const reachable = REGIONS.filter((region) => {
    const distance = travelDistance(home, region)
    return distance > 0 && distance <= FRIENDLY_TRAVEL_MAX_DISTANCE
  })

  // **学校を置いてある県を優先する。** 縁のある相手と何度も当たるほうが、
  // 毎回知らない名前が出るより遠征に意味が出る
  const known = reachable.filter((region) => rivalsIn(rivals, region.id).length > 0)
  const pool = rng.shuffle(known.length > 0 ? known : reachable)

  for (const region of pool) {
    if (offers.length >= FRIENDLY_OFFER_COUNT) break
    offers.push(offerIn(region, AWAY_OPPONENT_BONUS))
  }

  // 行ける県が足りなければ県内で埋める（離島の県など）
  while (offers.length < FRIENDLY_OFFER_COUNT) {
    offers.push(offerIn(home, 0))
  }

  return { offers, serial }
}
