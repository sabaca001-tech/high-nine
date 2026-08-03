/**
 * 特殊能力の定義データ。
 * 名称はすべて本作独自のもの（実在作品の名称は使わない）。
 */

import type { Skill, SkillId } from '@/core/types/skill'

export const SKILLS: Skill[] = [
  // ── 野手・金 ──────────────────────────────
  {
    id: 'clutch-hitter',
    name: '勝負師',
    rank: 'gold',
    scope: 'batting',
    forPitcher: false,
    description: '得点圏に走者がいるとき、打撃能力が大きく上がる',
  },
  {
    id: 'walk-off',
    name: '土壇場の男',
    rank: 'gold',
    scope: 'batting',
    forPitcher: false,
    description: '終盤の劣勢時、打撃能力が大きく上がる',
  },
  // ── 野手・青 ──────────────────────────────
  {
    id: 'contact-eye',
    name: '選球眼',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '四球を選びやすい',
  },
  {
    id: 'power-hitter',
    name: '広角打法',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '逆方向へも長打を打てる',
  },
  {
    id: 'fast-start',
    name: '好スタート',
    rank: 'blue',
    scope: 'running',
    forPitcher: false,
    description: '盗塁の成功率が上がる',
  },
  {
    id: 'wide-range',
    name: '守備範囲拡大',
    rank: 'blue',
    scope: 'fielding',
    forPitcher: false,
    description: '打球への追いつきが良くなる',
  },
  {
    id: 'strong-arm',
    name: 'レーザービーム',
    rank: 'blue',
    scope: 'fielding',
    forPitcher: false,
    description: '送球が速く正確になる',
  },
  // ── 野手・赤 ──────────────────────────────
  {
    id: 'chase-swing',
    name: 'ボール球に手が出る',
    rank: 'red',
    scope: 'batting',
    forPitcher: false,
    description: '四球を選びにくくなる',
  },
  {
    id: 'error-prone',
    name: 'エラー癖',
    rank: 'red',
    scope: 'fielding',
    forPitcher: false,
    description: '守備でミスをしやすい',
  },
  {
    id: 'cold-bat',
    name: 'プレッシャーに弱い',
    rank: 'red',
    scope: 'batting',
    forPitcher: false,
    description: 'チャンスで打撃能力が下がる',
  },

  // ── 投手・金 ──────────────────────────────
  {
    id: 'ace-heart',
    name: '鉄腕',
    rank: 'gold',
    scope: 'pitching',
    forPitcher: true,
    description: 'ピンチでも球威が落ちず、スタミナの消耗も抑えられる',
  },
  {
    id: 'strikeout-king',
    name: '奪三振',
    rank: 'gold',
    scope: 'pitching',
    forPitcher: true,
    description: '追い込んでからの三振率が大きく上がる',
  },
  // ── 投手・青 ──────────────────────────────
  {
    id: 'pinch-strong',
    name: 'ピンチに強い',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '走者を背負っても能力が落ちにくい',
  },
  {
    id: 'ground-ball',
    name: 'ゴロ打たせ',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '内野ゴロになりやすく、併殺を取りやすい',
  },
  {
    id: 'quick-throw',
    name: 'クイック',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '盗塁されにくい',
  },
  // ── 投手・赤 ──────────────────────────────
  {
    id: 'pinch-weak',
    name: 'ピンチに弱い',
    rank: 'red',
    scope: 'pitching',
    forPitcher: true,
    description: '走者を背負うと能力が下がる',
  },
  {
    id: 'wild-pitch',
    name: '暴投',
    rank: 'red',
    scope: 'pitching',
    forPitcher: true,
    description: 'ワイルドピッチを投げやすい',
  },
]

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]))

export function findSkill(id: SkillId): Skill | undefined {
  return SKILL_BY_ID.get(id)
}

/** 指定した条件に合う特殊能力を絞り込む */
export function skillsFor(options: {
  forPitcher: boolean
  rank?: Skill['rank']
}): Skill[] {
  return SKILLS.filter(
    (skill) =>
      skill.forPitcher === options.forPitcher &&
      (options.rank === undefined || skill.rank === options.rank),
  )
}
