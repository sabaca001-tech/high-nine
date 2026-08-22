/**
 * 1打席ぶんの判定。
 *
 * 表示速度とは完全に無関係な純粋関数。
 * 先に試合を全部シミュレートしてから再生する設計のため、
 * ここに演出やタイミングの都合を持ち込まない（README 3.4）。
 */

import type { Rng } from '@/core/rng/random'
import { effectOf } from '@/core/player/personality'
import type { Motivation, PitchingAbilities, Player } from '@/core/types/player'
import { velocityScore } from '@/core/types/player'
import type { PlayResult } from '@/core/types/match'
import { skillBonus } from '@/core/skill/skillEffects'
import type { SkillSituation } from '@/core/types/skill'

export type AtBatContext = {
  batter: Player
  pitcher: Player
  /** 守備側チームの守備力（0〜100の目安） */
  defense: number
  /**
   * 守備側が適性を無視して起用している度合い。0なら全員が本職相応。
   * 守備力の低下とは別に、失策と抜ける当たりを増やす。
   */
  misplacement: number
  /** 塁の状況 [一塁, 二塁, 三塁] */
  bases: [boolean, boolean, boolean]
  outs: number
  inning: number
  /** 攻撃側から見た点差。負けていればマイナス */
  scoreDiff: number
  /** 投手の消耗による能力倍率。1.0が万全 */
  pitcherStaminaFactor: number
}

/** やる気による試合での能力倍率 */
const MOTIVATION_FACTOR: Record<Motivation, number> = {
  [-2]: 0.9,
  [-1]: 0.95,
  0: 1,
  1: 1.05,
  2: 1.1,
}

/** 信頼度による倍率。0.95〜1.05 */
function trustFactor(trust: number): number {
  return 0.95 + (trust / 100) * 0.1
}

/**
 * 球威に占める球速の比重。
 *
 * 0.55にしていた頃は、球速が伸びても打たれ方がほとんど変わらず、
 * **球速を上げる意味が薄かった**。速球はそれだけで打者を差し込む。
 *
 * **球速は他の投手能力よりランクが遠い。** 変化球やスタミナは練習で90まで
 * 届くが、160km/h（S）は高校生ではまず出ない。
 * 同じ「B」でも球速のBのほうが価値が高いので、1ランクの重みを大きく取る
 * （球速1ランク＝球威8点、変化球1ランク＝球威2点）。
 */
const VELOCITY_WEIGHT = 0.8

/**
 * 球威の基準合わせ。
 *
 * 球速の尺度をランクの境界に合わせ直したので（140km/h が71→50）、
 * **同じ投手の球速スコアが20ほど下がった**。そのままだと投手が一律に弱くなり、
 * 打率が跳ね上がる。尺度を変えたぶんをここで戻す。
 *
 * 狙いは「球速の重要度を上げる」ことで、投手全体の底上げ／引き下げではない。
 * **`velocityScore` の対応表か `VELOCITY_WEIGHT` を触ったら、ここも測り直す**
 * （`balanceCheck.test.ts` の打率と平均得点を見る）。
 */
const STUFF_BASELINE = -11

/**
 * 球速が三振に効く分。球速スコア1点あたりの三振率への加算。
 *
 * **球威（`stuff`）だけでは球速の価値を出し切れない。**
 * 球威は変化球と平均されるので、球速を上げても打たれ方が少し変わるだけだった。
 * 速球そのものが空振りを取るぶんを別に足す。
 * 球速スコア50（140km/h）で+2.0%、90（160km/h）で+3.6%。
 */
const VELOCITY_STRIKEOUT_RATE = 0.00052

/**
 * 「消耗している」とみなすスタミナ係数。
 * これを下回ると `tired` の特殊能力（尻上がりなど）が効き始める。
 */
const TIRED_FACTOR = 0.85

/**
 * 球威。球速と変化球から決まる「打ちにくさ」。
 *
 * **打席の判定と投手の値踏みで同じ式を使う。**
 * 別々に持っていた頃は、`pitcherValue`（継投・先発の選定）に球速が入っておらず、
 * 147km/hの投手が制球のいい142km/hの投手にマウンドを譲ってベンチに座っていた。
 * 「試合で強い投手」と「自動編成が選ぶ投手」が食い違ってはいけない。
 */
export function stuffScore(pitching: PitchingAbilities): number {
  return straightScore(pitching) * VELOCITY_WEIGHT + breakingScore(pitching) * (1 - VELOCITY_WEIGHT)
}

/**
 * ストレートの威力。**球速にノビが掛かる。**
 *
 * 同じ140km/hでも、手元で伸びる球は詰まらせ、垂れる球は弾き返される。
 * 球速（km/h）は現実の分布に縛られていて上限まで数kmしか動かせないので、
 * 「速くはないが打たれない投手」を作る余地をここに置いた。
 *
 * **足し算ではなく掛け算にしてある。** 足すと、球の遅い投手が
 * ノビだけで速球投手に並んでしまう。ノビは速球の価値を伸縮させるもの。
 */
export function straightScore(pitching: PitchingAbilities): number {
  return velocityScore(pitching.velocity) * qualityFactor(pitching.life)
}

/**
 * 変化球の効き。**キレがそのまま効き。**
 *
 * 「変化球（曲がる量）」と「キレ（効き）」を別々に持っていた頃は、
 * 掛け算で合成していたが、2つの能力の意味が重なっていて
 * 画面でも見分けが付かなかった。曲がる量は持ち球の変化量が表す。
 */
export function breakingScore(pitching: PitchingAbilities): number {
  return pitching.sharpness
}

/**
 * ノビの効き方。**50で等倍**（±15%の伸縮）。
 *
 * 中央を等倍にしてあるので、ノビを足したことで
 * 投手全体が強くなったり弱くなったりしない
 * （動くのは「どの投手が強いか」だけ）。
 */
function qualityFactor(value: number): number {
  return 0.85 + (value / 100) * 0.3
}

export function simulateAtBat(rng: Rng, ctx: AtBatContext): PlayResult {
  const { batter, pitcher, defense, bases, outs, inning, scoreDiff } = ctx

  // 得点圏に走者がいるか。特殊能力の発動条件になる
  const risp = bases[1] || bases[2]
  const anyRunner = bases[0] || bases[1] || bases[2]
  const lateAndBehind = inning >= 7 && scoreDiff < 0

  // ── 打者 ──────────────────────────────
  const batterBoost = MOTIVATION_FACTOR[batter.motivation] * trustFactor(batter.trust)
  let contact = batter.batting.meet * batterBoost
  let power = batter.batting.power * batterBoost * (1 + (batter.batting.trajectory - 2) * 0.06)
  const batterPersonality = effectOf(batter.personality)
  let eye = batter.batting.meet * 0.5 + 20 + batterPersonality.eye

  // 性格による勝負強さ
  if (risp || lateAndBehind) {
    contact += batterPersonality.clutch
    power += batterPersonality.clutch
  }

  // **特殊能力の補正は定義から引く。**
  // ここに数値を直書きしていた頃は、説明だけあって試合では何も起きない
  // 特殊能力が混ざっていた（守備範囲拡大・レーザービームなど）
  const batterSituations: SkillSituation[] = []
  if (risp) batterSituations.push('risp')
  if (lateAndBehind) batterSituations.push('lateBehind')

  contact += skillBonus(batter, 'meet', batterSituations)
  power += skillBonus(batter, 'power', batterSituations)
  eye += skillBonus(batter, 'eye', batterSituations)

  // ── 投手 ──────────────────────────────
  const pitching = pitcher.pitching
  const pitcherBoost =
    MOTIVATION_FACTOR[pitcher.motivation] * trustFactor(pitcher.trust) * ctx.pitcherStaminaFactor

  // 投手能力を持たない選手が登板した場合は極端に弱くする
  let stuff = pitching
    ? (stuffScore(pitching) - STUFF_BASELINE) *
      pitcherBoost
    : 20
  let control = pitching ? pitching.control * pitcherBoost : 20
  let strikeoutBonus = 0
  let groundBias = 0

  if (pitching) {
    const pitcherSituations: SkillSituation[] = []
    if (anyRunner) pitcherSituations.push('runner')
    // スタミナが落ちてきたら「消耗時」の補正が効く
    if (ctx.pitcherStaminaFactor < TIRED_FACTOR) pitcherSituations.push('tired')

    stuff += skillBonus(pitcher, 'stuff', pitcherSituations)
    control += skillBonus(pitcher, 'control', pitcherSituations)
    // 率への補正は百分率で書いてあるので、判定に使う小数へ直す
    strikeoutBonus += skillBonus(pitcher, 'strikeout', pitcherSituations) / 100
    groundBias += skillBonus(pitcher, 'groundBall', pitcherSituations) / 100
  }

  // 被本塁打の補正。1.0が標準で、一発病なら上がり、重い球なら下がる
  const longballRate = pitching
    ? Math.max(0.2, 1 + skillBonus(pitcher, 'longball', anyRunner ? ['runner'] : []) / 100)
    : 1

  // ── 四球 ──────────────────────────────
  const walkRate = clamp(0.085 + (eye - control) / 700, 0.02, 0.28)
  if (rng.chance(walkRate)) return 'walk'

  // ── 三振 ──────────────────────────────
  const strikeoutRate = clamp(
    0.16 +
      (stuff - contact) / 420 +
      strikeoutBonus +
      // 空振りを取るのは速球そのもの。ノビはここにも効く
      (pitching ? straightScore(pitching) * VELOCITY_STRIKEOUT_RATE : 0),
    0.03,
    0.5,
  )
  if (rng.chance(strikeoutRate)) return 'strikeout'

  // 走力。**内野安打と、単打を二塁打にする走塁**に効く
  const speed = batter.batting.speed * batterBoost

  // ── 打球が飛んだ場合 ──────────────────
  // 適性を無視した起用は、まず失策として返ってくる。
  // 遊撃にG適性を置くと 1.0*5 = 5 → +2.5% で失策がほぼ倍になる。
  // 守備の特殊能力（守備範囲拡大・エラー癖など）はチーム全体の守備力に乗せてある
  const errorRate = clamp(
    0.028 - (defense - 50) / 1600 + ctx.misplacement * 0.005,
    0.004,
    0.12,
  )
  if (rng.chance(errorRate)) return 'error'

  /*
   * 失策にならなくても、守備範囲の狭さぶんヒットが増える。
   *
   * **走力もここに効く（内野安打）。** 打球の質はミートとパワーで決まるが、
   * 一塁までの速さで抜ける当たりがある。
   * ミート（0.6）やパワー（0.5）より軽く見るのは、
   * 走力で稼げるのは内野への当たりだけだから。
   *
   * **パワーの係数を 0.4 → 0.5 に上げてある。** 同じ合計でも
   * ミート寄り（85/40）が6.37点、パワー寄り（40/85）が5.58点と
   * 14%の差があり、評価点が同じ重みで見ているのと食い違っていた。
   */
  const hitRate = clamp(
    HIT_BASE +
      (contact * 0.6 +
        power * 0.5 +
        speed * 0.15 -
        stuff * 0.5 -
        control * 0.3 -
        defense * 0.2) /
        430 +
      ctx.misplacement * 0.004,
    0.12,
    0.58,
  )

  if (rng.chance(hitRate)) {
    return hitType(rng, batter, power, speed, longballRate)
  }

  return outType(rng, batter, bases, outs, groundBias)
}

/**
 * 打球が抜ける素の率。
 *
 * **能力の係数を増やしたぶん、ここを下げてある**（0.31 → 0.288）。
 * 下げずに係数だけ足すと、打率が全体に上がって投手が弱くなる。
 * 素の値を下げて係数を上げるほうが、**能力の差がそのまま成績の差になる**。
 */
const HIT_BASE = 0.288

/**
 * 安打の種類を決める。
 *
 * **本塁打はパワーと弾道で決まる。** 以前は素の値が0.07あり、
 * パワーの低い打者でも安打の7%が本塁打になっていた。
 * 「能力が低いのに柵越えする」という手触りになるので、
 * 素の値を下げてパワーの効きを強くし、非力な打者はほぼ出ないようにした。
 *
 *   パワー30・弾道1 … ほぼ0（下限0.4%）
 *   パワー50・弾道2 … 安打の4%
 *   パワー80・弾道3 … 安打の13%
 *   パワー95・弾道4 … 安打の19%
 */
function hitType(
  rng: Rng,
  batter: Player,
  power: number,
  speed: number,
  /** 被本塁打の倍率。1.0が標準（投手の特殊能力で増減する） */
  longballRate = 1,
): PlayResult {
  const homerunShare = clamp(
    (0.03 + (power - 45) / 420 + (batter.batting.trajectory - 2) * 0.03) * longballRate,
    0.004,
    0.35,
  )
  const tripleShare = clamp(0.02 + (speed - 50) / 1200, 0.005, 0.06)
  /*
   * **二塁打も走力で動く。** 0.2で固定していた頃は、
   * 同じ当たりでも足の速い打者が二塁を陥れる、という走塁が存在しなかった。
   * 走力90で0.25、走力20で0.16。
   */
  const doubleShare = clamp(0.2 + (speed - 50) / 800, 0.12, 0.3)

  return rng.weighted<PlayResult>([
    { value: 'homerun', weight: homerunShare },
    { value: 'triple', weight: tripleShare },
    { value: 'double', weight: doubleShare },
    { value: 'single', weight: Math.max(0.01, 1 - homerunShare - tripleShare - doubleShare) },
  ])
}

/** アウトの種類を決める。併殺・犠飛はここで判定する */
function outType(
  rng: Rng,
  batter: Player,
  bases: [boolean, boolean, boolean],
  outs: number,
  groundBias: number,
): PlayResult {
  const groundShare = clamp(
    0.55 - (batter.batting.trajectory - 2) * 0.12 + groundBias,
    0.2,
    0.85,
  )
  const isGrounder = rng.chance(groundShare)

  if (isGrounder) {
    // 一塁に走者がいて2アウト未満なら併殺の可能性
    if (bases[0] && outs < 2) {
      const doublePlayRate = 0.34 + groundBias
      // 足が速い打者は併殺を免れやすい
      const adjusted = clamp(doublePlayRate - (batter.batting.speed - 50) / 500, 0.1, 0.6)
      if (rng.chance(adjusted)) return 'doublePlay'
    }
    return 'groundout'
  }

  // 三塁に走者がいて2アウト未満なら犠牲フライの可能性
  if (bases[2] && outs < 2 && rng.chance(0.45)) return 'sacFly'
  return 'flyout'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
