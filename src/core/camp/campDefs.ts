/**
 * 冬合宿。
 *
 * 12月に入ると1度だけ発生し、強化方針を1つ選ぶ。
 * 選んだ内容が全部員にまとめて入る（通常の練習の数回ぶん）ため、
 * 「どこを伸ばすか」を年に1度はっきり決める場になる。
 */

import type { Rng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import { applyPractice, clamp } from '@/core/player/growth'
import type { PracticeKind } from '@/core/types/card'
import type { AbilityChange, Player } from '@/core/types/player'
import type { PracticeBoost } from '@/core/types/game'

export type CampPlanId = 'batting' | 'fielding' | 'pitching' | 'running' | 'mental'

export type CampPlan = {
  id: CampPlanId
  label: string
  description: string
  /** 適用する練習内容 */
  kind: PracticeKind
  /** 体力の消耗 */
  conditionCost: number
  /** 信頼度の増減 */
  trustDelta: number
}

/** 合宿の効果倍率。通常の練習およそ5回ぶん */
export const CAMP_MULTIPLIER = 5

/** 合宿後に残る練習効率バフ（成果が年明けまで続く） */
export const CAMP_AFTERGLOW: PracticeBoost = { multiplier: 1.5, remaining: 3 }

export const CAMP_PLANS: CampPlan[] = [
  {
    id: 'batting',
    label: '打ち込み',
    description: 'ミートとパワーを鍛える',
    kind: 'batting',
    conditionCost: 30,
    trustDelta: 2,
  },
  {
    id: 'fielding',
    label: 'ノック漬け',
    description: '守備と捕球を鍛える',
    kind: 'fielding',
    conditionCost: 28,
    trustDelta: 2,
  },
  {
    id: 'pitching',
    label: '投手強化',
    description: '投手のコントロールとスタミナを鍛える',
    kind: 'pitching',
    conditionCost: 26,
    trustDelta: 2,
  },
  {
    id: 'running',
    label: '走り込み',
    description: 'スタミナと走力を鍛える。消耗は大きい',
    kind: 'stamina',
    conditionCost: 40,
    trustDelta: 1,
  },
  {
    id: 'mental',
    label: '精神統一',
    description: '能力は伸びないが、チームの信頼度が大きく上がる',
    kind: 'mental',
    conditionCost: 12,
    trustDelta: 18,
  },
]

export function findCampPlan(id: string): CampPlan | undefined {
  return CAMP_PLANS.find((plan) => plan.id === id)
}

export type CampOutcome = {
  players: Player[]
  changes: AbilityChange[]
}

/** 合宿を実施する */
export function applyCamp(
  rng: Rng,
  players: Player[],
  plan: CampPlan,
  /** グラウンド整備・マネージャーによる倍率 */
  facilityMultiplier = 1,
  /** 選手ごとの倍率（ベンチ入り/ベンチ外） */
  perPlayerMultiplier?: (player: Player) => number,
): CampOutcome {
  const { players: trained, changes } = applyPractice(
    rng,
    players,
    PRACTICE_DEFS[plan.kind],
    false,
    CAMP_MULTIPLIER * facilityMultiplier,
    perPlayerMultiplier,
  )

  const updated = trained.map((player) => ({
    ...player,
    condition: clamp(player.condition - plan.conditionCost, 0, 100),
    trust: clamp(player.trust + plan.trustDelta, 0, 100),
  }))

  return { players: updated, changes }
}
