/**
 * 合宿。
 *
 * **能力を伸ばす場ではなく、特殊能力を掴む場。**
 * 練習数回ぶんの能力をまとめて配っていた頃は、
 * 合宿が「大きい練習マス」でしかなく、選ぶ方針も
 * 「いま伸ばしたい練習」を指すだけで代わり映えしなかった。
 *
 * いまは方針＝**どの系統の特殊能力を狙うか**。
 * 何人かが名指しで挑戦し、成功すればその選手のものになる。
 * 誰に付くかは選べないので、信頼度を上げておくことが仕込みになる。
 *
 * 年2回ある。夏（全国大会のあと）と冬。
 * 夏は3年生が引退した直後の新チームで、冬は最後の仕上げ。
 */

import type { Rng } from '@/core/rng/random'
import { clamp } from '@/core/player/growth'
import { skillsFor } from '@/core/skill/skillDefs'
import { isAvailable } from '@/core/types/player'
import type { Player } from '@/core/types/player'
import type { PracticeBoost } from '@/core/types/game'
import type { SkillId, SkillRank, SkillScope } from '@/core/types/skill'

export type CampPlanId = 'batting' | 'fielding' | 'pitching' | 'mental'

/** 夏の合宿か冬の合宿か。効果は同じで、画面の見せ方だけが変わる */
export type CampSeason = 'summer' | 'winter'

export type CampPlan = {
  id: CampPlanId
  label: string
  description: string
  /**
   * 狙う特殊能力の系統。
   * `mental` だけは系統を絞らず、代わりに信頼度が大きく上がる。
   */
  scopes: SkillScope[]
  /** 体力の消耗（全部員） */
  conditionCost: number
  /** 信頼度の増減（全部員） */
  trustDelta: number
}

/**
 * 1回の合宿で特殊能力に挑戦する人数。
 *
 * 部員20人前後に対して5人。「誰に当たるか」に意味を持たせたいので、
 * 全員に配りはしない。グラウンドとマネージャーの倍率で増える。
 */
export const CAMP_ATTEMPT_BASE = 5

/**
 * 合宿での習得成功率。特訓（青55% / 金18%）より高い。
 * 年2回しか無く、狙ってその日に来られる場なので上振れさせている。
 */
export const CAMP_SUCCESS_RATE: Record<SkillRank, number> = {
  gold: 0.25,
  blue: 0.7,
  red: 1,
}

/** 金特に挑めるようになる信頼度。特訓と揃える */
export const CAMP_GOLD_TRUST = 60

/** 信頼度を満たした選手が金特を狙う割合 */
export const CAMP_GOLD_SHARE = 0.3

/** 合宿後に残る練習効率バフ（成果がしばらく続く） */
export const CAMP_AFTERGLOW: PracticeBoost = { multiplier: 1.5, remaining: 3 }

export const CAMP_PLANS: CampPlan[] = [
  {
    id: 'batting',
    label: '打撃合宿',
    description: '打撃の特殊能力を狙う',
    scopes: ['batting'],
    conditionCost: 26,
    trustDelta: 3,
  },
  {
    id: 'fielding',
    label: '守備走塁合宿',
    description: '守備と走塁の特殊能力を狙う',
    scopes: ['fielding', 'running'],
    conditionCost: 24,
    trustDelta: 3,
  },
  {
    id: 'pitching',
    label: '投手合宿',
    description: '投球の特殊能力を狙う。投手だけが挑戦する',
    scopes: ['pitching'],
    conditionCost: 28,
    trustDelta: 3,
  },
  {
    id: 'mental',
    label: '意識改革合宿',
    description: '系統は選べないが、挑戦する人数が多くチームの信頼度も大きく上がる',
    scopes: ['batting', 'pitching', 'fielding', 'running'],
    conditionCost: 16,
    trustDelta: 14,
  },
]

/** 意識改革合宿だけは挑戦する人数が多い */
const MENTAL_ATTEMPT_BONUS = 2

export function findCampPlan(id: string): CampPlan | undefined {
  return CAMP_PLANS.find((plan) => plan.id === id)
}

/** 合宿で身についた特殊能力1件 */
export type CampSkillNews = {
  playerId: string
  playerName: string
  skillId: SkillId
  rank: SkillRank
}

/** 挑戦したが届かなかった1件。名前が出ることで次の合宿の目標になる */
export type CampMissNews = {
  playerId: string
  playerName: string
  skillId: SkillId
  rank: SkillRank
}

export type CampOutcome = {
  players: Player[]
  granted: CampSkillNews[]
  missed: CampMissNews[]
}

/**
 * 合宿を実施する。
 *
 * 挑戦者は**信頼度が高いほど選ばれやすい**（特訓と同じ物差し）。
 * ベンチ入りしている選手は重みが2倍で、控えは選ばれにくい。
 * 離脱中の選手は帯同していないので対象外。
 */
export function applyCamp(
  rng: Rng,
  players: Player[],
  plan: CampPlan,
  params: {
    /** ベンチ入りの選手id。重みが2倍になる */
    squad?: string[]
    /** グラウンド整備・マネージャーによる倍率。挑戦人数にかかる */
    facilityMultiplier?: number
  } = {},
): CampOutcome {
  const squad = new Set(params.squad ?? [])
  const facility = params.facilityMultiplier ?? 1

  const attempts =
    Math.round(CAMP_ATTEMPT_BASE * facility) + (plan.id === 'mental' ? MENTAL_ATTEMPT_BONUS : 0)

  // **掴めるものが残っていない選手は挑戦者に選ばない。**
  // 選ぶだけ選んで「候補が無いので何も起きない」で枠を潰すと、
  // 打撃合宿で投手が指名され続けて合宿が空振りになる。
  // 投手合宿に野手が参加しないのも、この絞り込みで自然にそうなる
  // （投球の特殊能力は投手にしか無い）。
  const eligible = players.filter(
    (player) => isAvailable(player) && hasCampCandidate(player, plan),
  )

  const granted: CampSkillNews[] = []
  const missed: CampMissNews[] = []
  const updatedById = new Map<string, Player>()
  const chosen = new Set<string>()

  for (let i = 0; i < attempts; i++) {
    const pool = eligible.filter((player) => !chosen.has(player.id))
    if (pool.length === 0) break

    const target = rng.weighted(
      pool.map((player) => ({
        value: player,
        weight: (10 + player.trust) * (squad.has(player.id) ? 2 : 1),
      })),
    )
    chosen.add(target.id)

    const result = attemptCampSkill(rng, updatedById.get(target.id) ?? target, plan)
    if (!result.skillId) continue

    if (result.granted) {
      updatedById.set(target.id, result.player)
      granted.push({
        playerId: target.id,
        playerName: target.name,
        skillId: result.skillId,
        rank: result.rank,
      })
    } else {
      missed.push({
        playerId: target.id,
        playerName: target.name,
        skillId: result.skillId,
        rank: result.rank,
      })
    }
  }

  // 参加した全部員が消耗し、寝食を共にしたぶん信頼度が上がる
  const updated = players.map((player) => {
    const base = updatedById.get(player.id) ?? player
    if (!isAvailable(player)) return base
    return {
      ...base,
      condition: clamp(base.condition - plan.conditionCost, 0, 100),
      trust: clamp(base.trust + plan.trustDelta, 0, 100),
    }
  })

  return { players: updated, granted, missed }
}

/** その方針で、まだ掴んでいない特殊能力が残っているか */
function hasCampCandidate(player: Player, plan: CampPlan): boolean {
  return campCandidates(player, plan, 'blue').length > 0
}

/** その方針・ランクで、まだ持っていない特殊能力 */
function campCandidates(player: Player, plan: CampPlan, rank: SkillRank) {
  return skillsFor({ forPitcher: player.isPitcher, rank }).filter(
    (skill) => plan.scopes.includes(skill.scope) && !player.skills.includes(skill.id),
  )
}

type CampAttempt = {
  player: Player
  granted: boolean
  skillId: SkillId | null
  rank: SkillRank
}

/**
 * 1人ぶんの挑戦。
 * 方針の系統に合う特殊能力の中から1つ選び、確率で習得させる。
 */
function attemptCampSkill(rng: Rng, player: Player, plan: CampPlan): CampAttempt {
  const canAimGold = player.trust >= CAMP_GOLD_TRUST
  const rank: SkillRank = canAimGold && rng.chance(CAMP_GOLD_SHARE) ? 'gold' : 'blue'

  const candidates = campCandidates(player, plan, rank)
  if (candidates.length === 0) return { player, granted: false, skillId: null, rank }

  const target = rng.pick(candidates)
  if (!rng.chance(CAMP_SUCCESS_RATE[rank])) {
    return { player, granted: false, skillId: target.id, rank }
  }

  return {
    player: { ...player, skills: [...player.skills, target.id] },
    granted: true,
    skillId: target.id,
    rank,
  }
}

/** その月がどちらの合宿か。夏は8月、冬は12月 */
export function campSeasonOf(month: number): CampSeason {
  return month >= 6 && month <= 9 ? 'summer' : 'winter'
}

export const CAMP_SEASON_LABELS: Record<CampSeason, string> = {
  summer: '夏合宿',
  winter: '冬合宿',
}
