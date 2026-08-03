/**
 * 能力の成長計算。
 *
 * 成長量 = 基本値 × やる気補正 × 学年補正 × 体力補正 × 高能力ペナルティ × レア倍率
 * 端数は確率で切り上げる（+2.4 なら 40% の確率で +3、60% で +2）。
 */

import type { Rng } from '@/core/rng/random'
import type { PracticeDef, PracticeGain } from '@/core/card/cardDefs'
import { RARE_MULTIPLIER } from '@/core/card/cardDefs'
import type { AbilityChange, GrowableKey, Grade, Motivation, Player } from '@/core/types/player'
import { ABILITY_MAX, ABILITY_MIN, isAvailable } from '@/core/types/player'
import { effectOf } from './personality'
import { improvePitches } from './pitchDefs'
import { focusMultiplier } from './trainingFocus'

/** 投手能力に属するキー */
const PITCHING_KEYS: GrowableKey[] = ['control', 'stamina', 'breaking']

/** やる気による成長倍率 */
const MOTIVATION_MULTIPLIER: Record<Motivation, number> = {
  [-2]: 0.7,
  [-1]: 0.85,
  0: 1.0,
  1: 1.15,
  2: 1.3,
}

/**
 * 学年による成長倍率。下級生ほど伸びやすい。
 * 3年間で初期3年生（総合55前後）の水準に届く必要があるため、
 * 下級生の倍率は高めに取っている（docs/balance.md 参照）。
 */
const GRADE_MULTIPLIER: Record<Grade, number> = {
  1: 1.35,
  2: 1.1,
  3: 0.85,
}

/** 体力による成長倍率。疲れていると伸びない */
function conditionMultiplier(condition: number): number {
  if (condition >= 70) return 1.0
  if (condition >= 40) return 0.85
  if (condition >= 20) return 0.6
  return 0.4
}

/**
 * 性格を加味した体力ペナルティ。
 * 「ど根性」は疲れていても伸びる（ペナルティが半分）。
 */
function conditionMultiplierFor(player: Player): number {
  const base = conditionMultiplier(player.condition)
  const resilience = effectOf(player.personality).conditionResilience
  return 1 - (1 - base) * resilience
}

/**
 * 性格を加味したやる気の倍率。
 * 「クール」は影響が小さく、「天才肌」は大きい。
 */
function motivationMultiplierFor(player: Player): number {
  const base = MOTIVATION_MULTIPLIER[player.motivation]
  const sensitivity = effectOf(player.personality).motivationSensitivity
  return 1 + (base - 1) * sensitivity
}

/** 能力が高いほど伸びにくくする（カンストを緩やかにする） */
function diminishingMultiplier(current: number): number {
  if (current >= 90) return 0.3
  if (current >= 80) return 0.5
  if (current >= 70) return 0.75
  return 1.0
}

export type PracticeOutcome = {
  players: Player[]
  changes: AbilityChange[]
  /** 球種を覚えた・変化量が上がったことの報告 */
  pitchNews?: string[]
}

/** 変化球練習で持ち球に変化が起きる確率 */
const PITCH_IMPROVE_CHANCE = 0.35

/**
 * 自主練の基本上昇量。
 * チームの練習内容に無い能力でも、方針にしていれば少しずつ伸びる。
 * 通常の練習より小さくして、チームの練習を選ぶ意味を残している。
 */
const SELF_TRAINING_AMOUNT = 2.5

/**
 * 練習による能力上昇を部員全員に適用する。
 * 体力・信頼度の増減はここでは扱わない（applyCardCost が担当）。
 */
export function applyPractice(
  rng: Rng,
  players: Player[],
  def: PracticeDef,
  isRare: boolean,
  /** 黄マスなどで得た練習効率バフの倍率 */
  boostMultiplier = 1,
  /** 選手ごとの倍率（ベンチ入り/ベンチ外など）。省略時は全員1倍 */
  perPlayerMultiplier?: (player: Player) => number,
): PracticeOutcome {
  const changes: AbilityChange[] = []
  const pitchNews: string[] = []
  const multiplier = (isRare ? RARE_MULTIPLIER : 1) * boostMultiplier
  // 変化球の練習なら、能力値だけでなく持ち球も動く
  const isBreakingPractice = def.gains.some((gain) => gain.key === 'breaking')

  const updated = players.map((player) => {
    // 離脱中の選手は練習に参加できない
    if (!isAvailable(player)) return player

    const playerMultiplier = multiplier * (perPlayerMultiplier?.(player) ?? 1)
    let current = player

    for (const gain of def.gains) {
      if (!isTargetOf(player, gain)) continue

      // 選手ごとの練習方針。狙った能力は伸びやすく、それ以外は鈍る
      const amount = calcGrowth(
        rng,
        current,
        gain,
        playerMultiplier * focusMultiplier(player, gain.key),
      )
      if (amount <= 0) continue

      const result = raiseAbility(current, gain.key, amount)
      current = result.player
      if (result.change) changes.push(result.change)
    }

    // 自主練。チームの練習内容に含まれない能力でも、方針にしていれば少し伸びる
    const focus = current.focus
    if (focus?.type === 'ability' && !def.gains.some((gain) => gain.key === focus.key)) {
      const gain: PracticeGain = { key: focus.key, amount: SELF_TRAINING_AMOUNT, target: 'all' }
      if (isTargetOf(current, gain)) {
        const amount = calcGrowth(rng, current, gain, playerMultiplier)
        if (amount > 0) {
          const result = raiseAbility(current, gain.key, amount)
          current = result.player
          if (result.change) changes.push(result.change)
        }
      }
    }

    // 持ち球の習得・変化量アップ
    if (isBreakingPractice && current.pitching && rng.chance(PITCH_IMPROVE_CHANCE)) {
      const result = improvePitches(rng, current.pitching.pitches, current.pitching.breaking)
      current = { ...current, pitching: { ...current.pitching, pitches: result.pitches } }

      if (result.learned) {
        pitchNews.push(`${current.name}が「${result.learned.name}」を覚えた！`)
      } else if (result.improved) {
        pitchNews.push(
          `${current.name}の「${result.improved.name}」の変化が大きくなった（変化量${result.improved.level}）`,
        )
      }
    }

    return current
  })

  return { players: updated, changes, ...(pitchNews.length > 0 ? { pitchNews } : {}) }
}

/**
 * カードを1枚使ったことによる体力・信頼度の増減。
 *
 * 重要: これは「どのマスに止まったか」に関係なく、カードを選んだ時点で必ず適用する。
 * 練習マス以外に止まっても部活動自体は行っているため。
 * （マスに止まった時だけ消耗させると体力が常に満タンになり、休養カードが無意味になる）
 */
export function applyCardCost(
  players: Player[],
  def: PracticeDef,
  /** マネージャーによる体力消費の倍率 */
  conditionCostRate = 1,
): Player[] {
  if (def.conditionDelta === 0 && def.trustDelta === 0) return players

  return players.map((player) => {
    // 離脱中は練習していないので消耗もしない
    if (!isAvailable(player)) return player

    const effect = effectOf(player.personality)
    // 消耗だけ性格とマネージャーの影響を受ける（回復はそのまま）
    const condition =
      def.conditionDelta < 0
        ? Math.round(def.conditionDelta * effect.conditionCost * conditionCostRate)
        : def.conditionDelta

    const trust =
      def.trustDelta > 0 ? Math.round(def.trustDelta * effect.trustGain) : def.trustDelta

    return {
      ...player,
      condition: clamp(player.condition + condition, 0, 100),
      trust: clamp(player.trust + trust, 0, 100),
    }
  })
}

/** その選手がこの効果の対象かどうか */
function isTargetOf(player: Player, gain: PracticeGain): boolean {
  // 投手能力は投手にしか存在しない
  if (PITCHING_KEYS.includes(gain.key) && !player.isPitcher) return false

  if (gain.target === 'pitcher') return player.isPitcher
  if (gain.target === 'batter') return !player.isPitcher
  return true
}

/** 成長量を計算する。端数は確率で切り上げ */
function calcGrowth(
  rng: Rng,
  player: Player,
  gain: PracticeGain,
  rareMultiplier: number,
): number {
  const current = getAbility(player, gain.key)
  if (current === null) return 0

  const raw =
    gain.amount *
    motivationMultiplierFor(player) *
    GRADE_MULTIPLIER[player.grade] *
    conditionMultiplierFor(player) *
    diminishingMultiplier(current) *
    effectOf(player.personality).growth *
    rareMultiplier

  const floor = Math.floor(raw)
  const fraction = raw - floor
  return floor + (rng.chance(fraction) ? 1 : 0)
}

/** 能力値を取得する。その選手が持たない能力なら null */
export function getAbility(player: Player, key: GrowableKey): number | null {
  if (PITCHING_KEYS.includes(key)) {
    if (!player.pitching) return null
    return player.pitching[key as 'control' | 'stamina' | 'breaking']
  }
  return player.batting[key as 'meet' | 'power' | 'speed' | 'arm' | 'fielding' | 'catching']
}

/**
 * 能力値を増減させた新しい選手を返す（元の選手は変更しない）。
 * 変化が0だった場合 change は null。
 */
export function raiseAbility(
  player: Player,
  key: GrowableKey,
  delta: number,
): { player: Player; change: AbilityChange | null } {
  const before = getAbility(player, key)
  if (before === null) return { player, change: null }

  const after = clamp(before + delta, ABILITY_MIN, ABILITY_MAX)
  if (after === before) return { player, change: null }

  const change: AbilityChange = { playerId: player.id, key, before, after }

  if (PITCHING_KEYS.includes(key)) {
    return {
      player: { ...player, pitching: { ...player.pitching!, [key]: after } },
      change,
    }
  }
  return {
    player: { ...player, batting: { ...player.batting, [key]: after } },
    change,
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
