/**
 * 県ごとの「どんな選手が多いか」。
 *
 * 出張費を払う前に**行き先を選ぶ材料**が要る。
 * 名前だけ並んでいても、遠い県へ行く理由が生まれない。
 *
 * 傾向は候補の生成にも実際に効く。表示だけの飾りにすると、
 * 「投手王国と書いてあるのに投手が居ない」が起きて信用されなくなる。
 */

import type { Rng } from '@/core/rng/random'
import type { GrowableKey } from '@/core/types/player'
import type { RegionId } from '@/core/types/region'
import { REGIONS } from '@/core/types/region'

export type ScoutTrait =
  /** 長距離砲が多い */
  | 'power'
  /** 打撃が固い */
  | 'contact'
  /** 足が速い */
  | 'speed'
  /** 守備が堅い */
  | 'defense'
  /** 投手が多い */
  | 'pitching'
  /** 粗いが素材が良い */
  | 'raw'

export const TRAIT_LABELS: Record<ScoutTrait, string> = {
  power: '長距離砲の産地',
  contact: '打撃巧者が多い',
  speed: '俊足が多い',
  defense: '守備が堅い',
  pitching: '投手王国',
  raw: '粗削りな素材型',
}

export const TRAIT_NOTES: Record<ScoutTrait, string> = {
  power: 'パワーのある打者が多い。長打力を伸ばしたいなら。',
  contact: 'ミートの良い打者が多い。打線の精度が上がる。',
  speed: '走力に恵まれた選手が多い。盗塁と守備範囲に効く。',
  defense: '守備・捕球の水準が高い。二遊間や捕手を探すなら。',
  pitching: '投手の比率が高く、球速も出ている。',
  raw: '当たり外れが大きい。化ける選手もいれば、伸びない選手もいる。',
}

/** 傾向ごとに底上げされる能力 */
const TRAIT_BOOST: Record<ScoutTrait, GrowableKey[]> = {
  power: ['power'],
  contact: ['meet'],
  speed: ['speed'],
  defense: ['fielding', 'catching'],
  pitching: ['control', 'sharpness'],
  raw: [],
}

/** 傾向による能力の上乗せ */
export const TRAIT_BONUS = 10

/**
 * 「素材型」の県は**当たり外れが大きい**。
 *
 * 一律に上乗せしていた頃は、10人の候補の誰かが必ずCに届き、
 * **素材型の県へ行けば確実に当たりが見つかる**状態だった。
 * 荒削りというのは「上振れも下振れもある」という意味なので、
 * 上乗せをやめて振れ幅のほうを広げる。
 * **下振れのほうを大きく取る**（上限は普通の県とほぼ同じ）。
 * 上限まで広げると、結局「素材型へ行けば当たりが出る」に戻ってしまう。
 */
export const RAW_RATING_DOWN = 26
export const RAW_RATING_UP = 14

/** 投手王国では投手の割合が上がる */
export const PITCHING_TRAIT_RATE = 0.6

export type TraitMap = Record<RegionId, ScoutTrait>

const ALL_TRAITS: ScoutTrait[] = ['power', 'contact', 'speed', 'defense', 'pitching', 'raw']

/** 県ごとの傾向を決める */
export function createTraits(rng: Rng): TraitMap {
  const map = {} as TraitMap
  for (const region of REGIONS) {
    map[region.id] = rng.pick(ALL_TRAITS)
  }
  return map
}

/**
 * 年度が変わったときに傾向を引き直す。
 *
 * 固定にしていた頃は、一度「投手王国」を見つけたら**毎年そこへ行くだけ**になり、
 * 行き先を選ぶ判断が1年目で終わっていた。
 * その学年にどんな中学生が育ったかは年ごとに違うので、毎年引き直す。
 *
 * **必ず前年と違う傾向にする。** 同じ値を引き直すと「変わらなかった」のか
 * 「更新されていない」のか区別が付かず、変えた意味が伝わらない。
 */
export function shiftTraits(rng: Rng, previous: TraitMap): TraitMap {
  const map = {} as TraitMap
  for (const region of REGIONS) {
    const before = previous[region.id]
    const candidates = before ? ALL_TRAITS.filter((trait) => trait !== before) : ALL_TRAITS
    map[region.id] = rng.pick(candidates)
  }
  return map
}

/** その傾向で底上げされる能力か */
export function boostedBy(trait: ScoutTrait, key: GrowableKey): boolean {
  return TRAIT_BOOST[trait].includes(key)
}
