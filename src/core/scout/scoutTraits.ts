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
  raw: '完成度は低いが素質は高い。育て切れるなら化ける。',
}

/** 傾向ごとに底上げされる能力 */
const TRAIT_BOOST: Record<ScoutTrait, GrowableKey[]> = {
  power: ['power'],
  contact: ['meet'],
  speed: ['speed'],
  defense: ['fielding', 'catching'],
  pitching: ['control', 'breaking'],
  raw: [],
}

/** 傾向による能力の上乗せ */
export const TRAIT_BONUS = 10

/** 「素材型」は総合が高い代わりに、完成度（体力・信頼度）が低い */
export const RAW_RATING_BONUS = 6

/** 投手王国では投手の割合が上がる */
export const PITCHING_TRAIT_RATE = 0.6

export type TraitMap = Record<RegionId, ScoutTrait>

const ALL_TRAITS: ScoutTrait[] = ['power', 'contact', 'speed', 'defense', 'pitching', 'raw']

/**
 * 県ごとの傾向を決める。**新規ゲームで一度だけ**。
 * 途中で変わると「あの県は投手王国だった」という覚え方ができなくなる。
 */
export function createTraits(rng: Rng): TraitMap {
  const map = {} as TraitMap
  for (const region of REGIONS) {
    map[region.id] = rng.pick(ALL_TRAITS)
  }
  return map
}

/** その傾向で底上げされる能力か */
export function boostedBy(trait: ScoutTrait, key: GrowableKey): boolean {
  return TRAIT_BOOST[trait].includes(key)
}
