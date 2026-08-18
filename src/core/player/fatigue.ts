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
 * **溜まり方はイニングではなく「スタミナをどれだけ使ったか」。**
 * スタミナD（55）の投手が5回投げるのと、S（90）の投手が7回投げるのとでは、
 * 前者のほうが疲れる。同じ回数を投げても、余力のある投手は疲れない。
 *
 * **効き方は「投げられる回が短くなる」のではなく「能力が下がる」。**
 * 疲れた投手を出せば、イニングは食えるが打たれる。
 */

import type { Player } from '@/core/types/player'
import { skillBonus } from '@/core/skill/skillEffects'
import { staminaCapacity } from '@/core/match/halfInning'

/** 疲労の上限 */
export const FATIGUE_MAX = 100

/**
 * スタミナを使い切る登板1回ぶんの疲労。
 *
 * **アウト数に比例させるのをやめた。** イニングで数えると、
 * スタミナS（90）の投手が7回投げたときのほうが
 * D（55）の投手が5回投げたときより疲れる、という逆の関係になっていた。
 * 実際は「自分の持ちに対してどれだけ投げたか」で疲れる。
 *
 * **55では厳しすぎた**（持ちいっぱいで投げると、中1日の回戦で常に疲労が残る）。
 * 3分の2に落として、持ちいっぱいまで投げても中3日で万全に戻るようにしてある。
 */
const FATIGUE_PER_FULL_OUTING = 37

/**
 * 1日あたりの回復量。
 *
 * 完投（48）から万全に戻るまで4日。大会の回戦は中1日（2日）なので、
 * **完投した翌々日の登板では疲労が24残る**。
 * 短くすると連投の代償が消え、長くすると1人の投手では大会を戦えなくなる。
 */
export const FATIGUE_RECOVERY_PER_DAY = 12

/**
 * 疲労による能力の低下。疲労100で35%落ちる。
 *
 * **「投げられる回が短くなる」形をやめた。** 疲労でスタミナを目減りさせていた頃は、
 * 疲れた投手は早く崩れるだけで、1人目の打者に対しては本調子と変わらなかった。
 * 疲れているなら、**最初の打者から球威も制球も落ちている**ほうが実感に合う。
 */
const FATIGUE_DIRECT_LOSS = 0.35

/** その選手の疲労。記録が無ければ0（野手や古いセーブ） */
export function fatigueOf(player: Player): number {
  return player.fatigue ?? 0
}

/**
 * 1試合投げたぶんの疲労を足した値。
 *
 * **相手にした打者数を、その投手の持ち（`staminaCapacity`）で割る。**
 * 持ちいっぱいまで投げれば `FATIGUE_PER_FULL_OUTING`、
 * 半分なら半分。スタミナが高い投手ほど、同じ回数でも疲れない。
 *
 * 「回復」「鉄腕」を持っていれば、そのぶん溜まりにくい。
 */
export function fatigueAfterPitching(
  player: Player,
  line: { outs: number; hits: number; walks: number },
): number {
  const stamina = player.pitching?.stamina ?? 0
  const faced = line.outs + line.hits + line.walks
  const load = faced / Math.max(1, staminaCapacity(stamina + skillBonus(player, 'stamina')))
  const rate = Math.max(0, 1 - skillBonus(player, 'recovery') / 100)

  return clamp(fatigueOf(player) + load * FATIGUE_PER_FULL_OUTING * rate)
}

/** 日数ぶん回復させた値 */
export function recoveredFatigue(current: number, days: number): number {
  return clamp(current - Math.max(0, days) * FATIGUE_RECOVERY_PER_DAY)
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
