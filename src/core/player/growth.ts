/**
 * 能力の成長計算。
 *
 * 成長量 = 基本値 × 手数補正 × やる気補正 × 学年補正 × 体力補正 × 高能力ペナルティ × レア倍率
 * 端数は確率で切り上げる（+2.4 なら 40% の確率で +3、60% で +2）。
 */

import type { Rng } from '@/core/rng/random'
import type { PracticeDef, PracticeGain } from '@/core/card/cardDefs'
import { RARE_MULTIPLIER } from '@/core/card/cardDefs'
import type { AbilityChange, GrowableKey, Grade, Motivation, Player } from '@/core/types/player'
import {
  ABILITY_MAX,
  ABILITY_MIN,
  isAvailable,
  VELOCITY_MAX,
  VELOCITY_MIN,
  velocityScore,
} from '@/core/types/player'
import { effectOf } from './personality'
import { improvePitches } from './pitchDefs'
import { focusMultiplier } from './trainingFocus'

/** 投手能力に属するキー（球速は尺度が違うので別扱い） */
const PITCHING_KEYS: GrowableKey[] = ['control', 'stamina', 'breaking']

/**
 * 投手の肩力は球速に比例させる。
 *
 * 速い球を投げる腕が、送球だけ弱いということは無い。
 * 球速が伸びたら肩力も一緒に上がるので、**投手の肩力は独立して育てない**。
 */
export function armFromVelocity(velocity: number): number {
  return Math.round(Math.min(ABILITY_MAX, Math.max(ABILITY_MIN, velocityScore(velocity) + 5)))
}

/**
 * 球速1km/h ぶんの「能力値換算」。
 *
 * カード定義の `amount` は1〜100の能力を想定した値なので、
 * そのまま km/h に足すと球速だけ極端に伸びる。
 * 100点ぶんの尺度が35km/h（`velocityScore`）なので 0.35 が等価。
 * そこから**少し多めに**して、球速が伸びる手応えを出している。
 */
const VELOCITY_GAIN_RATE = 0.45

/**
 * 練習1回あたりの倍率。
 *
 * 盤面を1マス1日に戻したことで、1年の練習マスが約13回から約61回に増えた
 * （手数49→146、練習マスの重みも組み直した結果）。
 * カード定義の `amount` は「1回の練習でこれくらい」という読みやすい値のまま残し、
 * **増えた回数ぶんをここで割り戻す**。カードの数字を全部書き換えるより、
 * 盤面の刻みを変えたときにここ1か所を直すほうが追いやすい。
 *
 * 計算上は 13.4 / 61 ≒ 0.22。そこから実測で調整している。
 * **入学時の能力（`GRADE_BASE`）を上げたぶん、ここを下げてある。**
 * 「低いところから大きく伸ばす」より「良い素材を採って仕上げる」ゲームにしたい。
 *
 * 学年差を縮めたときも合わせて下げる。3年間の伸びが
 * `GRADE_BASE[3] - GRADE_BASE[1]`（＝14）とおおよそ釣り合っていないと、
 * 3年生になった選手が初期3年生を大きく追い越してしまう。
 * 変えたら必ず seasonBalance.test.ts を回すこと。
 */
export const PRACTICE_GROWTH_SCALE = 0.11

/**
 * カード1枚あたりの体力・信頼度の倍率。
 *
 * こちらは「止まったマスに関係なく毎手かかる」ので、
 * 練習マスの回数ではなく**手数そのもの**（49→146手）で割り戻す。
 * 計算上は 1/3 ≒ 0.33 だが、それだと無戦略プレイの体力が50台に居座り、
 * 体力補正（70未満で0.85倍）が常時かかる状態になったので 0.30 に緩めてある。
 * 成長の倍率とは別の値になるのが正しい。
 */
export const CARD_COST_SCALE = 0.3

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

/**
 * 能力が高いほど伸びにくくする。
 *
 * **総合Sは10年に1人程度**にしたいので、上に行くほど強く鈍らせる。
 * 以前（90以上で0.3）は3年あれば誰でも90に届いてしまい、
 * 「飛び抜けた選手」という感覚が無かった。
 */
function diminishingMultiplier(current: number): number {
  if (current >= 90) return 0.08
  if (current >= 85) return 0.16
  if (current >= 80) return 0.28
  if (current >= 70) return 0.5
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
  rng: Rng,
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
    // CARD_COST_SCALE は消耗にも回復にも掛ける。片方だけ薄めると
    // 休養カードが手数のぶんだけ強くなってしまう
    const condition = roundRandom(
      rng,
      def.conditionDelta *
        CARD_COST_SCALE *
        (def.conditionDelta < 0 ? effect.conditionCost * conditionCostRate : 1),
    )

    const trust = roundRandom(
      rng,
      def.trustDelta * CARD_COST_SCALE * (def.trustDelta > 0 ? effect.trustGain : 1),
    )

    return {
      ...player,
      condition: clamp(player.condition + condition, 0, 100),
      trust: clamp(player.trust + trust, 0, 100),
    }
  })
}

/**
 * 端数を確率で丸める（-2.6 なら 60% で -3、40% で -2）。
 *
 * **四捨五入にしてはいけない。** 1手あたりの消耗が2〜3という小さな値になったので、
 * 四捨五入すると性格やマネージャーの2割の差が丸め込まれて消える
 * （「やんちゃは消耗が激しい」が成立しなくなった）。
 * 成長計算と同じやり方に揃えてある。
 */
function roundRandom(rng: Rng, value: number): number {
  const floor = Math.floor(value)
  return floor + (rng.chance(value - floor) ? 1 : 0)
}

/** その選手がこの効果の対象かどうか */
function isTargetOf(player: Player, gain: PracticeGain): boolean {
  // 投手能力は投手にしか存在しない
  if (gain.key === 'velocity' && !player.pitching) return false
  if (PITCHING_KEYS.includes(gain.key) && !player.isPitcher) return false
  // 投手の肩力は球速に連動するので、練習で直接は動かさない
  if (gain.key === 'arm' && player.pitching) return false

  if (gain.target === 'pitcher') return player.isPitcher
  if (gain.target === 'batter') return !player.isPitcher
  return true
}

/**
 * その選手にとってその能力が伸びやすいか。
 * 記録が無い能力は標準（1.0）とみなす（古いセーブや簡易生成の選手のため）。
 */
export function aptitudeMultiplier(player: Player, key: GrowableKey): number {
  return player.growthAptitude?.[key] ?? 1
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

  // 球速だけ尺度が違う。伸びにくさの判定も km/h ではなく0〜100に直して見る
  const isVelocity = gain.key === 'velocity'
  const scaled = isVelocity ? velocityScore(current) : current

  const raw =
    gain.amount *
    (isVelocity ? VELOCITY_GAIN_RATE : 1) *
    PRACTICE_GROWTH_SCALE *
    // 得意な能力は伸び、苦手な能力はほとんど動かない。
    // ここが無いと、他の補正が丸めで潰れて全員が同じ「+1」になる
    aptitudeMultiplier(player, gain.key) *
    motivationMultiplierFor(player) *
    GRADE_MULTIPLIER[player.grade] *
    conditionMultiplierFor(player) *
    diminishingMultiplier(scaled) *
    effectOf(player.personality).growth *
    rareMultiplier

  const floor = Math.floor(raw)
  const fraction = raw - floor
  return floor + (rng.chance(fraction) ? 1 : 0)
}

/** 能力値を取得する。その選手が持たない能力なら null */
export function getAbility(player: Player, key: GrowableKey): number | null {
  if (key === 'velocity') return player.pitching?.velocity ?? null
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

  // 球速は km/h。1〜100ではないので専用の範囲で丸め、肩力も連れて動かす
  if (key === 'velocity') {
    const after = clamp(before + delta, VELOCITY_MIN, VELOCITY_MAX)
    if (after === before) return { player, change: null }

    return {
      player: {
        ...player,
        pitching: { ...player.pitching!, velocity: after },
        batting: { ...player.batting, arm: armFromVelocity(after) },
      },
      change: { playerId: player.id, key, before, after },
    }
  }

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
