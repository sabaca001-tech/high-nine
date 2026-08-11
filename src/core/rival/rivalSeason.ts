/**
 * 他県の1年ぶんの結果。
 *
 * **「強豪」を戦績で決めるための仕組み。**
 * 以前は地力（`tradition`）という隠し値がそのまま格だったので、
 * 強豪校を強くすると**そこに居る選手の能力も上がり**、
 * U18代表が総合95〜100で埋まってしまった。
 *
 * 勝った学校に印が付く形にすれば、選手の能力を上げなくても
 * 「あの学校は強い」と言えるようになる。
 *
 * 試合そのものは回さない。**48県ぶんの決勝を毎年回すのは重すぎる**ので、
 * 力に応じた重み付き抽選で優勝校を決める。
 * 上振れを許してあるので、地力のない学校が優勝する年もある。
 */

import type { Rng } from '@/core/rng/random'
import type { RegionId } from '@/core/types/region'
import { addTitles, rosterPowerOf } from './rivals'
import type { RivalSchool } from './rivals'

/**
 * 抽選の尖り方。
 *
 * 大きいほど地力どおりに勝つ。小さいと毎年ばらけて、
 * 「勝ち続けている学校」という積み上げが生まれない。
 */
const WEIGHT_SCALE = 0.09

/** 力が0以下の学校にも最低限の目を残す */
const WEIGHT_MIN = 0.05

export type RivalSeasonResult = {
  schools: RivalSchool[]
  /** 世代交代の画面に出す一言 */
  news: string[]
}

/**
 * 1年ぶんの結果を反映する。
 *
 * @param oursWonHome 自校が県大会を勝ったか。勝った年は自県の他校に印が付かない
 */
export function runRivalSeason(
  rng: Rng,
  schools: RivalSchool[],
  homeRegionId: RegionId,
  year: number,
  oursWonHome: boolean,
): RivalSeasonResult {
  const byRegion = new Map<RegionId, RivalSchool[]>()
  for (const school of schools) {
    const list = byRegion.get(school.regionId)
    if (list) list.push(school)
    else byRegion.set(school.regionId, [school])
  }

  /** 県の優勝校（学校id）。自県はこちらの大会結果を使う */
  const champions = new Map<string, { region: boolean; nationals: boolean }>()

  for (const [regionId, list] of byRegion) {
    // **自県は実際の大会の結果**。自校が勝った年は他校に付かない
    if (regionId === homeRegionId && oursWonHome) continue

    const champion = pickChampion(rng, list, year)
    if (champion) champions.set(champion.id, { region: true, nationals: true })
  }

  // 全国制覇は、その年の代表から1校
  const representatives = schools.filter((school) => champions.has(school.id))
  const national = pickChampion(rng, representatives, year)

  const news: string[] = []
  const updated = schools.map((school) => {
    const title = champions.get(school.id)
    if (!title) return school

    const championship = national?.id === school.id
    if (championship) news.push(`${school.name}が全国制覇`)

    return addTitles(school, {
      region: 1,
      nationals: 1,
      championships: championship ? 1 : 0,
    })
  })

  return { schools: updated, news }
}

/** 力に応じた重み付き抽選で1校選ぶ */
function pickChampion(rng: Rng, schools: RivalSchool[], year: number): RivalSchool | null {
  if (schools.length === 0) return null

  const weights = schools.map((school) => ({
    value: school,
    // 指数で重み付ける。力の差がそのまま「勝ちやすさ」になり、
    // それでいて弱い学校にも目が残る
    weight: Math.max(WEIGHT_MIN, Math.exp(rosterPowerOf(school, year) * WEIGHT_SCALE)),
  }))

  return rng.weighted(weights)
}
