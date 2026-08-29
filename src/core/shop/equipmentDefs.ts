/**
 * 練習器具。
 *
 * 買うと**その器具を使う練習カードが手札に出るようになる**。
 * アイテム（買った瞬間に効果が出る消耗品）と違い、
 * 器具は「選べる練習の種類が増える」という形で効く。
 *
 * ただし**一定の確率で壊れる**。壊れるとそのカードは出なくなるので、
 * 買って終わりではなく、買い直しを含めた維持の判断が続く。
 * 恒久強化を上げっぱなしにできないようにする、という方針はグラウンドと同じ。
 */

import type { PracticeKind } from '@/core/types/card'

export type EquipmentId =
  | 'bench'
  | 'machine'
  | 'tee'
  | 'ladder'
  | 'bullpen'
  | 'video'

export type Equipment = {
  id: EquipmentId
  name: string
  /** 買うと使えるようになる練習 */
  unlocks: PracticeKind
  description: string
  price: number
  /**
   * **その器具の練習を1回するごとに**壊れる確率。
   *
   * 月ごとの判定にしていた頃は、**一度も使っていない器具が勝手に壊れた**。
   * 買ったのに手札に出ないまま消えることがあり、
   * 「使うから傷む」という当たり前の因果が無かった。
   *
   * 酷使する器具ほど壊れやすい。安い器具ほど壊れやすい、ではない
   * （安いから壊れるのでは「安物買い」の話になり、選択が単純になる）。
   *
   * 月ごとの値の**半分**に置き直してある。使う頻度ぶん判定が増えるので、
   * そのままでは壊れすぎる。
   */
  breakChance: number
}

export const EQUIPMENTS: Equipment[] = [
  {
    id: 'tee',
    name: 'ティースタンドとネット',
    unlocks: 'teeBatting',
    description: 'ティー打撃ができるようになる（ミートが大きく伸びる）',
    price: 60_000,
    breakChance: 0.05,
  },
  {
    id: 'bench',
    name: 'ベンチプレス一式',
    unlocks: 'weight',
    description: 'ウエイトトレーニングができるようになる（パワーが大きく伸びる）',
    price: 120_000,
    breakChance: 0.025,
  },
  {
    id: 'ladder',
    name: 'ラダーとミニハードル',
    unlocks: 'agility',
    description: 'アジリティ練習ができるようになる（走力と守備が伸びる）',
    price: 80_000,
    breakChance: 0.045,
  },
  {
    id: 'machine',
    name: 'ピッチングマシン',
    unlocks: 'machineBatting',
    description: 'マシン打撃ができるようになる（ミートとパワーが伸びる）',
    price: 200_000,
    breakChance: 0.06,
  },
  {
    id: 'bullpen',
    name: 'ブルペン整備',
    unlocks: 'bullpen',
    description: 'ブルペン投球ができるようになる（コントロールとスタミナが伸びる）',
    price: 160_000,
    breakChance: 0.03,
  },
  {
    id: 'video',
    name: 'ビデオ撮影機材',
    unlocks: 'videoStudy',
    description: 'ビデオ分析ができるようになる（変化球とミートが伸び、消耗しない）',
    price: 140_000,
    breakChance: 0.04,
  },
]

const BY_ID = new Map(EQUIPMENTS.map((equipment) => [equipment.id, equipment]))

export function findEquipment(id: string): Equipment | undefined {
  return BY_ID.get(id as EquipmentId)
}

/** 持っている器具で使えるようになる練習の一覧 */
export function unlockedKinds(owned: readonly string[]): PracticeKind[] {
  return owned
    .map((id) => findEquipment(id)?.unlocks)
    .filter((kind): kind is PracticeKind => kind !== undefined)
}

/** 器具が要る練習かどうか。要らない練習は最初から手札に出る */
const GATED_KINDS = new Set<PracticeKind>(EQUIPMENTS.map((equipment) => equipment.unlocks))

export function requiresEquipment(kind: PracticeKind): boolean {
  return GATED_KINDS.has(kind)
}

/** その練習を使えるようにする器具 */
export function equipmentFor(kind: PracticeKind): Equipment | undefined {
  return EQUIPMENTS.find((equipment) => equipment.unlocks === kind)
}

/**
 * その練習で使う器具を、確率で壊す。
 *
 * **使ったときだけ傷む。** 月ごとに判定していた頃は、
 * 一度も使っていない器具が勝手に壊れて、
 * 買ったのに手札に出ないまま消えることがあった。
 *
 * @returns 壊れた器具（壊れなければ null）
 */
export function breakEquipmentInUse(
  rng: { chance: (probability: number) => boolean },
  owned: readonly string[],
  kind: PracticeKind,
): Equipment | null {
  const item = owned
    .map((id) => findEquipment(id))
    .find((entry): entry is Equipment => entry !== undefined && entry.unlocks === kind)

  if (!item) return null
  return rng.chance(item.breakChance) ? item : null
}
