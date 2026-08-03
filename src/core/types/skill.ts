/** 特殊能力の型定義 */

/**
 * 特殊能力のランク。
 * gold  … 極めて強い（本家の金特に相当）
 * blue  … 有利になる
 * red   … 不利になる（マイナス能力）
 */
export type SkillRank = 'gold' | 'blue' | 'red'

/** 特殊能力が効く場面 */
export type SkillScope = 'batting' | 'pitching' | 'fielding' | 'running'

export type SkillId = string

export type Skill = {
  id: SkillId
  name: string
  rank: SkillRank
  scope: SkillScope
  /** 投手専用か。false なら野手用 */
  forPitcher: boolean
  description: string
}
