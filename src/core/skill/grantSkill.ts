/** 特殊能力の付与・削除 */

import type { Rng } from '@/core/rng/random'
import type { Player } from '@/core/types/player'
import type { SkillId, SkillRank } from '@/core/types/skill'
import { skillsFor } from './skillDefs'

/** 特訓の成功率。金特は狙って取れないよう低くする */
const SUCCESS_RATE: Record<SkillRank, number> = {
  gold: 0.18,
  blue: 0.55,
  red: 1,
}

export type SkillGrantResult = {
  player: Player
  /** 実際に付与できたか */
  granted: boolean
  skillId: SkillId | null
}

/**
 * 特訓：まだ持っていない特殊能力の中から1つ選び、確率で習得させる。
 * 失敗しても何も起きない（体力消費は呼び出し側で扱う）。
 */
export function attemptTraining(rng: Rng, player: Player): SkillGrantResult {
  // 金特に挑めるのは信頼度が高い選手だけ。育成の目標になるようにする
  const canAimGold = player.trust >= 60
  const rank: SkillRank = canAimGold && rng.chance(0.3) ? 'gold' : 'blue'

  const candidates = skillsFor({ forPitcher: player.isPitcher, rank }).filter(
    (skill) => !player.skills.includes(skill.id),
  )
  if (candidates.length === 0) return { player, granted: false, skillId: null }

  const target = rng.pick(candidates)
  if (!rng.chance(SUCCESS_RATE[rank])) {
    return { player, granted: false, skillId: target.id }
  }

  return {
    player: { ...player, skills: [...player.skills, target.id] },
    granted: true,
    skillId: target.id,
  }
}

/**
 * 指定したランクの特殊能力を1つ付ける。**成功判定はしない。**
 *
 * 大会での活躍のように「付けるかどうかは呼び出し側がすでに決めている」場面で使う。
 * 特訓（`attemptTraining`）と違って、ここまで来たら必ず身につく。
 */
export function grantSkill(rng: Rng, player: Player, rank: SkillRank): SkillGrantResult {
  const candidates = skillsFor({ forPitcher: player.isPitcher, rank }).filter(
    (skill) => !player.skills.includes(skill.id),
  )
  if (candidates.length === 0) return { player, granted: false, skillId: null }

  const target = rng.pick(candidates)
  return {
    player: { ...player, skills: [...player.skills, target.id] },
    granted: true,
    skillId: target.id,
  }
}

/** マイナス能力を1つ付ける。すでに全部持っていれば何も起きない */
export function addRedSkill(rng: Rng, player: Player): SkillGrantResult {
  return grantSkill(rng, player, 'red')
}

/** マイナス能力を1つ取り除く。青マスの特別指導などで使う */
export function removeRedSkill(rng: Rng, player: Player): SkillGrantResult {
  const owned = skillsFor({ forPitcher: player.isPitcher, rank: 'red' }).filter((skill) =>
    player.skills.includes(skill.id),
  )
  if (owned.length === 0) return { player, granted: false, skillId: null }

  const target = rng.pick(owned)
  return {
    player: { ...player, skills: player.skills.filter((id) => id !== target.id) },
    granted: true,
    skillId: target.id,
  }
}
