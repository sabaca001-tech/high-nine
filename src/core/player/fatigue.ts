/**
 * 投手の疲労。
 *
 * 体力（`condition`）とは別に、**投げたぶんだけ溜まって日数で抜ける**値を持つ。
 * 体力は練習で全員が消耗する日常の指標で、月ごとに戻る。
 * こちらは登板そのものの負荷で、**連戦連投を咎める**ための仕組み。
 *
 * これが無かった頃は、大会の1回戦から決勝まで同じ投手が投げても
 * 各試合が独立していて何の代償も無かった。
 * 中1日で回戦が並ぶ盤面にしたのに、**2番手を育てる理由が無い**状態だった。
 *
 * 疲労は「スタミナの目減り」として効く。同じ投手でも、疲れていれば
 * 早く消耗し、球威も少し落ちる。
 */

import type { Player } from '@/core/types/player'

/** 疲労の上限 */
export const FATIGUE_MAX = 100

/**
 * アウト1つあたりの疲労。
 * 完投（27アウト）で 60。9回を投げ切ると3日は尾を引く。
 */
const FATIGUE_PER_OUT = 60 / 27

/**
 * 1日あたりの回復量。
 *
 * 完投（60）から万全に戻るまで5日。大会の回戦は中1日（2日）なので、
 * **完投した翌々日の登板では疲労が36残る**。
 * 短くすると連投の代償が消え、長くすると1人の投手では大会を戦えなくなる。
 */
export const FATIGUE_RECOVERY_PER_DAY = 12

/**
 * 疲労によるスタミナの目減り。
 * 疲労100でスタミナが60%減る（＝持ちが4割になる）。
 */
const FATIGUE_STAMINA_LOSS = 0.6

/**
 * 疲労そのものによる球威の低下。
 * スタミナの目減りとは別に、**1人目の打者から効く**ぶん。
 * 大きくすると疲れた投手が誰にも打たれる的になるので、控えめに置く。
 */
const FATIGUE_DIRECT_LOSS = 0.15

/** その選手の疲労。記録が無ければ0（野手や古いセーブ） */
export function fatigueOf(player: Player): number {
  return player.fatigue ?? 0
}

/** 投げたアウト数ぶんの疲労を足した値 */
export function fatigueAfterOuts(current: number, outs: number): number {
  return clamp(current + outs * FATIGUE_PER_OUT)
}

/** 日数ぶん回復させた値 */
export function recoveredFatigue(current: number, days: number): number {
  return clamp(current - Math.max(0, days) * FATIGUE_RECOVERY_PER_DAY)
}

/**
 * 疲労を織り込んだスタミナ。
 * `staminaCapacity` はこの値で計算する。
 */
export function effectiveStamina(player: Player): number {
  const stamina = player.pitching?.stamina ?? 0
  return stamina * (1 - (fatigueOf(player) / FATIGUE_MAX) * FATIGUE_STAMINA_LOSS)
}

/** 疲労そのものによる能力倍率（1人目の打者から効く） */
export function fatiguePenalty(player: Player): number {
  return 1 - (fatigueOf(player) / FATIGUE_MAX) * FATIGUE_DIRECT_LOSS
}

/** 表示用の段階。数字だけだと「投げられるのか」が読み取れない */
export type FatigueLevel = 'fresh' | 'light' | 'tired' | 'dead'

export const FATIGUE_LABELS: Record<FatigueLevel, string> = {
  fresh: '万全',
  light: 'やや疲労',
  tired: '疲労',
  dead: '限界',
}

export function fatigueLevel(player: Player): FatigueLevel {
  const value = fatigueOf(player)
  if (value >= 70) return 'dead'
  if (value >= 40) return 'tired'
  if (value >= 15) return 'light'
  return 'fresh'
}

/**
 * 継投で使いたくない疲労の目安。
 * ここを超えた投手は、他に投げられる者がいるうちは残しておく。
 */
export const FATIGUE_AVOID = 55

function clamp(value: number): number {
  return Math.min(FATIGUE_MAX, Math.max(0, Math.round(value)))
}
