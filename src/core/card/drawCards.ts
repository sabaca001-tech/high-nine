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

/** その時点で引ける練習の一覧を作る */
function kindWeightsFor(unlocked: readonly PracticeKind[]) {
  if (unlocked.length === 0) return BASE_KIND_WEIGHTS

  return [
    ...BASE_KIND_WEIGHTS,
    ...unlocked.map((kind) => ({ value: kind, weight: PRACTICE_DEFS[kind].weight })),
  ]
}

/**
 * カードを1枚引く。
 * id は手札の中で重複しなければよいので、呼び出し側から通し番号を渡す。
 *
 * @param unlocked 練習器具で使えるようになっている練習の一覧
 */
export function drawCard(
  rng: Rng,
  serial: number,
  unlocked: readonly PracticeKind[] = [],
): PracticeCard {
  return {
    id: `card-${serial}`,
    number: rng.weighted(CARD_NUMBER_WEIGHTS),
    kind: rng.weighted<PracticeKind>(kindWeightsFor(unlocked)),
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
): PracticeCard[] {
  return Array.from({ length: size }, (_, i) => drawCard(rng, startSerial + i, unlocked))
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
): PracticeCard[] {
  const remaining = hand.filter((card) => card.id !== usedCardId)
  // 枠が増えたぶんはまとめて補充する
  const need = Math.max(1, size - remaining.length)
  const drawn = Array.from({ length: need }, (_, i) => drawCard(rng, serial + i, unlocked))
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
): PracticeCard[] {
  if (lost.length === 0) return hand

  let next = serial
  return hand.map((card) =>
    lost.includes(card.kind) ? drawCard(rng, next++, unlocked) : card,
  )
}
