/**
 * 特殊能力の補正を引く。
 *
 * **判定も表示もここを通す。** 判定側に数値を直書きしていた頃は、
 * 「守備範囲拡大」「レーザービーム」「クイック」のように
 * **説明だけあって試合では何も起きない**特殊能力が混ざっていた。
 * 定義（`skillDefs`）に書いた値をそのまま読む形にすれば、その手のずれは起きない。
 */

import { findSkill } from './skillDefs'
import type { Player } from '@/core/types/player'
import type { Skill, SkillEffect, SkillSituation, SkillTarget } from '@/core/types/skill'

/** その選手が持っている特殊能力の定義 */
export function skillsOf(player: Player): Skill[] {
  return player.skills
    .map((id) => findSkill(id))
    .filter((skill): skill is Skill => skill !== undefined)
}

/**
 * 補正の合計。
 *
 * `situations` に渡した場面（得点圏・終盤の劣勢など）に合う補正だけを足す。
 * 場面を指定していない補正（`when` 省略＝常時）は必ず足す。
 */
export function skillBonus(
  player: Player,
  target: SkillTarget,
  situations: SkillSituation[] = [],
): number {
  let total = 0

  for (const skill of skillsOf(player)) {
    for (const effect of skill.effects ?? []) {
      if (effect.target !== target) continue
      if (!applies(effect, situations)) continue
      total += effect.amount
    }
  }

  return total
}

function applies(effect: SkillEffect, situations: SkillSituation[]): boolean {
  const when = effect.when ?? 'always'
  return when === 'always' || situations.includes(when)
}
