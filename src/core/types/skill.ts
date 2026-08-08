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

/**
 * 補正がかかる先。
 *
 * **試合の判定で使っている値と1対1で対応させる。**
 * 表示用に別の名前を用意すると、書いてある補正と実際の効きがずれる。
 */
export type SkillTarget =
  // 打者
  | 'meet' // ミート（当てやすさ）
  | 'power' // パワー（長打）
  | 'eye' // 選球眼（四球の選びやすさ）
  // 走塁
  | 'stealRate' // 盗塁を仕掛ける頻度
  | 'stealSuccess' // 盗塁の成功率
  | 'advance' // 走者の進塁
  // 守備
  | 'defense' // 守備力（失策の減少）
  | 'catcherArm' // 捕手の盗塁阻止
  // 投手
  | 'stuff' // 球威
  | 'control' // 制球
  | 'strikeout' // 奪三振率
  | 'groundBall' // ゴロを打たせる割合
  | 'stamina' // スタミナの持ち
  | 'longball' // 被本塁打

/**
 * 効く場面。省略時は常時。
 *
 * 判定側のフラグと同じ名前にしてある。増やすときは
 * `simulateAtBat` の `SkillContext` にも同じ名前で足すこと。
 */
export type SkillSituation =
  | 'always'
  | 'risp' // 得点圏に走者
  | 'lateBehind' // 終盤の劣勢
  | 'runner' // 走者を背負っている（投手）
  | 'tired' // 消耗している

export const SKILL_TARGET_LABELS: Record<SkillTarget, string> = {
  meet: 'ミート',
  power: 'パワー',
  eye: '選球眼',
  stealRate: '盗塁を狙う頻度',
  stealSuccess: '盗塁成功率',
  advance: '進塁',
  defense: '守備',
  catcherArm: '盗塁阻止',
  stuff: '球威',
  control: '制球',
  strikeout: '奪三振',
  groundBall: 'ゴロ率',
  stamina: 'スタミナ',
  longball: '被本塁打',
}

export const SKILL_SITUATION_LABELS: Record<SkillSituation, string> = {
  always: '',
  risp: '得点圏',
  lateBehind: '終盤の劣勢',
  runner: '走者あり',
  tired: '消耗時',
}

/**
 * 1つぶんの補正。
 *
 * `amount` の単位は `target` によって違う。
 * 能力（ミート・球威など）は**能力値そのもの**への加算、
 * 率（奪三振・盗塁成功率など）は**百分率**への加算。
 * どちらも `SKILL_TARGET_UNIT` に持たせて、表示で取り違えないようにする。
 */
export type SkillEffect = {
  target: SkillTarget
  amount: number
  when?: SkillSituation
}

/** 補正の単位。表示のときに「+8」か「+6%」かを分ける */
export const SKILL_TARGET_UNIT: Record<SkillTarget, 'ability' | 'percent'> = {
  meet: 'ability',
  power: 'ability',
  eye: 'ability',
  stealRate: 'percent',
  stealSuccess: 'percent',
  advance: 'percent',
  defense: 'ability',
  catcherArm: 'ability',
  stuff: 'ability',
  control: 'ability',
  strikeout: 'percent',
  groundBall: 'percent',
  stamina: 'ability',
  longball: 'percent',
}

export type Skill = {
  id: SkillId
  name: string
  rank: SkillRank
  scope: SkillScope
  /** 投手専用か。false なら野手用 */
  forPitcher: boolean
  description: string
  /**
   * 能力への補正。**表示と判定で同じ表を使う。**
   * ここに書いていない効果（登板の判断など）は description で説明する。
   */
  effects?: SkillEffect[]
}
