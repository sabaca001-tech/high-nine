/** 手札の抽選 */

import type { Rng } from '@/core/rng/random'
import type { PracticeCard, PracticeKind } from '@/core/types/card'
import { HAND_SIZE } from '@/core/types/card'
import { CARD_NUMBER_WEIGHTS, PRACTICE_DEFS, RARE_CARD_RATE } from './cardDefs'
import { requiresEquipment } from '@/core/shop/equipmentDefs'

/**
 * 器具が要らない練習の一覧。最初から手札に出る。
 * 器具が要る練習は、その器具を持っているときだけ加える。
 */
const BASE_KIND_WEIGHTS = Object.values(PRACTICE_DEFS)
  .filter((def) => !requiresEquipment(def.kind))
  .map((def) => ({ value: def.kind, weight: def.weight }))

/**
 * いま何も起きない練習。**手札に出さない。**
 *
 * 治療は離脱中の選手がいなければ「幸い、怪我をしている部員はいなかった」で
 * 終わるだけのカードで、選ぶ意味が無いのに枠を1つ塞いでいた
 * （壊れた器具の練習を手札から取り除くのと同じ話）。
 */
function isUseless(kind: PracticeKind, hasInjured: boolean): boolean {
  return PRACTICE_DEFS[kind].special === 'heal' && !hasInjured
}

/** その時点で引ける練習の一覧を作る */
function kindWeightsFor(unlocked: readonly PracticeKind[], hasInjured: boolean) {
  const base = BASE_KIND_WEIGHTS.filter((entry) => !isUseless(entry.value, hasInjured))
  if (unlocked.length === 0) return base

  return [
    ...base,
    ...unlocked.map((kind) => ({ value: kind, weight: PRACTICE_DEFS[kind].weight })),
  ]
}

/**
 * カードを1枚引く。
 * id は手札の中で重複しなければよいので、呼び出し側から通し番号を渡す。
 *
 * @param unlocked 練習器具で使えるようになっている練習の一覧
 * @param hasInjured 離脱中の選手がいるか。いなければ治療は出さない
 */
export function drawCard(
  rng: Rng,
  serial: number,
  unlocked: readonly PracticeKind[] = [],
  hasInjured = false,
): PracticeCard {
  return {
    id: `card-${serial}`,
    number: rng.weighted(CARD_NUMBER_WEIGHTS),
    kind: rng.weighted<PracticeKind>(kindWeightsFor(unlocked, hasInjured)),
    isRare: rng.chance(RARE_CARD_RATE),
  }
}

/**
 * 手札を配り直す。年度の初めに使う。
 * @param startSerial 採番の開始値
 * @param size 枚数。省略時は初期枚数
 */
export function drawHand(
  rng: Rng,
  startSerial: number,
  size = HAND_SIZE,
  unlocked: readonly PracticeKind[] = [],
  hasInjured = false,
): PracticeCard[] {
  return Array.from({ length: size }, (_, i) =>
    drawCard(rng, startSerial + i, unlocked, hasInjured),
  )
}

/**
 * 使ったカードを1枚だけ補充する。
 * 選んだカードを取り除き、末尾に新しいカードを足す（手札は常に HAND_SIZE 枚）。
 */
export function replaceCard(
  rng: Rng,
  hand: PracticeCard[],
  usedCardId: string,
  serial: number,
  /** 補充後の枚数。評判が上がると増える */
  size = hand.length,
  unlocked: readonly PracticeKind[] = [],
  hasInjured = false,
): PracticeCard[] {
  const remaining = hand.filter((card) => card.id !== usedCardId)
  // 枠が増えたぶんはまとめて補充する
  const need = Math.max(1, size - remaining.length)
  const drawn = Array.from({ length: need }, (_, i) =>
    drawCard(rng, serial + i, unlocked, hasInjured),
  )
  return [...remaining, ...drawn].slice(0, Math.max(size, remaining.length))
}

/**
 * 壊れた器具の練習カードを手札から取り除き、引き直す。
 *
 * 使えない練習が手札に残っていると、選んでも何も起きないカードになってしまう。
 */
export function replaceBrokenCards(
  rng: Rng,
  hand: PracticeCard[],
  lost: readonly PracticeKind[],
  serial: number,
  unlocked: readonly PracticeKind[],
  hasInjured = false,
): PracticeCard[] {
  if (lost.length === 0) return hand

  let next = serial
  return hand.map((card) =>
    lost.includes(card.kind) ? drawCard(rng, next++, unlocked, hasInjured) : card,
  )
}

/**
 * いま何も起きないカードを引き直す。
 *
 * 怪我人が復帰した後の治療カードは、壊れた器具の練習と同じで
 * **選んでも何も起きないカード**として手札に残り続ける。
 * 手を進めるためだけに切らせるのは、判断を1つ奪っているのと同じ。
 */
export function replaceUselessCards(
  rng: Rng,
  hand: PracticeCard[],
  serial: number,
  unlocked: readonly PracticeKind[],
  hasInjured: boolean,
): PracticeCard[] {
  if (!hand.some((card) => isUseless(card.kind, hasInjured))) return hand

  let next = serial
  return hand.map((card) =>
    isUseless(card.kind, hasInjured) ? drawCard(rng, next++, unlocked, hasInjured) : card,
  )
}
