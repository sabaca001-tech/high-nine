/**
 * 大会の1勝ごとの成長。
 *
 * 1試合ごとの成長（`matchGrowth`）とは別に、**1つ勝つたびに**
 * その試合を戦ったメンバー全体が伸びる。
 *
 * 練習試合を10回こなすより、県大会を勝ち上がった1週間のほうが選手は変わる、
 * というのが狙い。大会が「積み上げた力を確かめるだけの場」ではなく、
 * **それ自体が最大の育成機会**になる。
 *
 * 併せて、勝ち上がった選手には特殊能力が身につくことがある。
 * 特訓マスに止まるのを待つしかなかった習得経路に、
 * 「勝てば付く」という道を足す。優勝したときだけ金特に手が届く。
 *
 * **大会が終わってからまとめて配るのはやめた。**
 * 準決勝で伸びた選手が決勝で活きない、勝ち上がっている実感が
 * 最後の画面まで来ないなど、試合と手応えが切り離されていた。
 */

import type { Rng } from '@/core/rng/random'
import { growthChanceFor, raiseAbility } from '@/core/player/growth'
import { grantSkill } from '@/core/skill/grantSkill'
import type { AbilityChange, GrowableKey, Player } from '@/core/types/player'
import { isAvailable } from '@/core/types/player'
import type { SkillId, SkillRank } from '@/core/types/skill'
import type { TournamentKind } from '@/core/types/tournament'

/**
 * 大会の格。全国は1試合の重みが違う。
 * 秋季大会を夏より低くしているのは、新チームの腕試しという位置づけのため。
 */
const STAGE_WEIGHT: Record<TournamentKind, number> = {
  summerPref: 1,
  autumnPref: 0.9,
  nationals: 1.6,
  springNationals: 1.4,
}

/**
 * 1勝ぶんの経験。**負けた試合では何も起きない。**
 * 出ただけで伸びるなら「大会の結果で伸びる」という筋が通らない。
 */
const WIN_POINT = 1

/** 優勝を決めた試合への上乗せ。ここだけ勝ち星1つぶんより大きい */
const CHAMPION_BONUS = 2

/**
 * この点数で能力が1上がる。
 *
 * **2.5から下げてある。** 勝ち上がりそのものの見返りを厚くして、
 * 「勝てば強くなる／初戦で負ければ伸びない」という差を作る。
 * 練習の伸び（`CARD_GROWTH_SCALE`）を下げたぶんの受け皿でもある。
 */
const POINTS_PER_STEP = 0.9

/** スタメンとベンチ入りで得るものが違う。ベンチは半分 */
const STARTER_SHARE = 1
const BENCH_SHARE = 0.5

/** 経験1点あたりの特殊能力の習得率。優勝で2割強になる */
const SKILL_CHANCE_PER_POINT = 0.02
const SKILL_CHANCE_MAX = 0.35

/** 金特に手が届く条件（優勝したときだけ）と、そのうち実際に金特になる割合 */
const GOLD_SHARE = 0.3

/** 金特に挑めるのは信頼度が高い選手だけ。特訓と同じ基準に揃える */
const GOLD_TRUST = 60

export type TournamentSkillNews = {
  playerId: string
  playerName: string
  skillId: SkillId
  rank: SkillRank
}

export type TournamentGrowthResult = {
  players: Player[]
  changes: AbilityChange[]
  skills: TournamentSkillNews[]
  /** 大会全体の経験点。0なら誰も伸びない */
  points: number
}

/**
 * 大会の結果をチームの成長に変える。
 *
 * 出場した選手＝**大会が終わった時点のスタメンとベンチ入り**とする。
 * 誰が何試合出たかを持ち回るとセーブが膨らむし、
 * 「その大会を戦ったメンバー」としては十分な近似になる。
 */
export function applyTournamentGrowth(
  rng: Rng,
  players: Player[],
  params: {
    kind: TournamentKind
    /** この試合に勝ったか。負けた試合では何も起きない */
    won: boolean
    /** この勝利で優勝が決まったか */
    champion: boolean
    /** スタメンの選手ID */
    starters: string[]
    /** ベンチ入りの選手ID */
    squad: string[]
  },
): TournamentGrowthResult {
  const points = matchExperience(params.kind, params.won, params.champion)
  if (points <= 0) {
    return { players, changes: [], skills: [], points: 0 }
  }

  const starters = new Set(params.starters)
  const squad = new Set(params.squad)
  const changes: AbilityChange[] = []
  const skills: TournamentSkillNews[] = []

  const updated = players.map((player) => {
    const share = starters.has(player.id)
      ? STARTER_SHARE
      : squad.has(player.id)
        ? BENCH_SHARE
        : 0
    // ベンチ外は大会に帯同していない。離脱中の選手も戦っていない
    if (share === 0 || !isAvailable(player)) return player

    const gained = points * share
    let current = player

    const steps = rollSteps(rng, gained / POINTS_PER_STEP)
    for (let i = 0; i < steps; i++) {
      const key = rng.pick(keysFor(current))
      // 高い能力ほど上がりにくいのは、練習でも大会でも同じ
      if (!rng.chance(growthChanceFor(current, key))) continue

      const result = raiseAbility(current, key, 1)
      current = result.player
      if (result.change) changes.push(result.change)
    }

    const chance = Math.min(SKILL_CHANCE_MAX, gained * SKILL_CHANCE_PER_POINT)
    if (rng.chance(chance)) {
      // 金特は優勝を決めた試合の、信頼を得ている選手だけ
      const canAimGold = params.champion && current.trust >= GOLD_TRUST
      const rank: SkillRank = canAimGold && rng.chance(GOLD_SHARE) ? 'gold' : 'blue'
      const result = grantSkill(rng, current, rank)
      current = result.player
      if (result.granted && result.skillId) {
        skills.push({
          playerId: current.id,
          playerName: current.name,
          skillId: result.skillId,
          rank,
        })
      }
    }

    return current
  })

  return { players: updated, changes, skills, points }
}

/**
 * 1試合ぶんの経験点。**負ければ0**で、何も起きない。
 * 優勝を決めた試合だけ上乗せがある。
 */
export function matchExperience(
  kind: TournamentKind,
  won: boolean,
  champion: boolean,
): number {
  if (!won) return 0
  return (WIN_POINT + (champion ? CHAMPION_BONUS : 0)) * STAGE_WEIGHT[kind]
}

/**
 * 伸びる能力の候補。
 * 大会は総合力を問われる場なので、練習と違って幅広く伸びる。
 * ただし投手能力は投手だけ。
 */
function keysFor(player: Player): GrowableKey[] {
  const keys: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']
  if (player.pitching) keys.push('control', 'stamina', 'sharpness')
  return keys
}

/** 端数は確率で切り上げる（1.4 なら 40% で 2、60% で 1） */
function rollSteps(rng: Rng, value: number): number {
  const floor = Math.floor(value)
  return floor + (rng.chance(value - floor) ? 1 : 0)
}
