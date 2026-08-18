/**
 * 特殊能力の定義データ。
 * 名称はすべて本作独自のもの（実在作品の名称は使わない）。
 *
 * **補正は `effects` に数値で書く。** ここに書いた値をそのまま
 * 試合の判定（`simulateAtBat` / `halfInning`）が読む。
 * 判定側に数値を直書きすると、画面に出す説明と実際の効きがずれる。
 *
 * `amount` の単位は `SKILL_TARGET_UNIT` で決まる。
 * 能力（ミート・球威など）は能力値への加算、率（奪三振など）は百分率への加算。
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
    effects: [
      { target: 'meet', amount: 12, when: 'risp' },
      { target: 'power', amount: 12, when: 'risp' },
    ],
  },
  {
    id: 'walk-off',
    name: '土壇場の男',
    rank: 'gold',
    scope: 'batting',
    forPitcher: false,
    description: '終盤の劣勢時、打撃能力が大きく上がる',
    effects: [
      { target: 'meet', amount: 12, when: 'lateBehind' },
      { target: 'power', amount: 12, when: 'lateBehind' },
    ],
  },
  {
    id: 'slugger',
    name: 'アーチスト',
    rank: 'gold',
    scope: 'batting',
    forPitcher: false,
    description: '長打力が飛び抜けている',
    effects: [{ target: 'power', amount: 16 }],
  },
  {
    id: 'hit-machine',
    name: '安打製造機',
    rank: 'gold',
    scope: 'batting',
    forPitcher: false,
    description: 'とにかく当てる。三振がほとんど無い',
    effects: [{ target: 'meet', amount: 14 }],
  },
  {
    id: 'iron-will',
    name: '不動心',
    rank: 'gold',
    scope: 'batting',
    forPitcher: false,
    description: '走者を背負った場面でも、終盤でも崩れない',
    effects: [
      { target: 'meet', amount: 7, when: 'risp' },
      { target: 'meet', amount: 7, when: 'lateBehind' },
      { target: 'eye', amount: 8 },
    ],
  },

  // ── 野手・青 ──────────────────────────────
  {
    id: 'contact-eye',
    name: '選球眼',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '四球を選びやすい',
    effects: [{ target: 'eye', amount: 18 }],
  },
  {
    id: 'power-hitter',
    name: '広角打法',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '逆方向へも長打を打てる',
    effects: [{ target: 'power', amount: 8 }],
  },
  {
    id: 'line-drive',
    name: 'ライナー打ち',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '鋭い打球で野手の間を抜く',
    effects: [{ target: 'meet', amount: 8 }],
  },
  {
    id: 'opposite-field',
    name: '流し打ち',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '追い込まれても当てにいける',
    effects: [
      { target: 'meet', amount: 5 },
      { target: 'eye', amount: 6 },
    ],
  },
  {
    id: 'first-pitch',
    name: '初球狙い',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '甘い球を逃さない。ただし四球は減る',
    effects: [
      { target: 'meet', amount: 7 },
      { target: 'eye', amount: -8 },
    ],
  },
  {
    id: 'pinch-batter',
    name: '代打の切り札',
    rank: 'blue',
    scope: 'batting',
    forPitcher: false,
    description: '終盤の劣勢で力を発揮する',
    effects: [
      { target: 'meet', amount: 8, when: 'lateBehind' },
      { target: 'power', amount: 8, when: 'lateBehind' },
    ],
  },
  {
    id: 'fast-start',
    name: '好スタート',
    rank: 'blue',
    scope: 'running',
    forPitcher: false,
    description: '盗塁の成功率が上がる',
    effects: [{ target: 'stealSuccess', amount: 8 }],
  },
  {
    id: 'aggressive-run',
    name: '積極走塁',
    rank: 'blue',
    scope: 'running',
    forPitcher: false,
    description: '果敢に走る。盗塁を仕掛ける回数が増える',
    effects: [
      { target: 'stealRate', amount: 8 },
      { target: 'advance', amount: 10 },
    ],
  },
  {
    id: 'wide-range',
    name: '守備範囲拡大',
    rank: 'blue',
    scope: 'fielding',
    forPitcher: false,
    description: '打球への追いつきが良くなる',
    effects: [{ target: 'defense', amount: 10 }],
  },
  {
    id: 'strong-arm',
    name: 'レーザービーム',
    rank: 'blue',
    scope: 'fielding',
    forPitcher: false,
    description: '送球が速く正確。走者の進塁を抑える',
    effects: [
      { target: 'defense', amount: 5 },
      { target: 'advance', amount: -10 },
    ],
  },
  {
    id: 'block',
    name: 'ブロック',
    rank: 'blue',
    scope: 'fielding',
    forPitcher: false,
    description: '捕手として盗塁を刺しやすい',
    effects: [{ target: 'catcherArm', amount: 10 }],
  },
  {
    id: 'sure-hands',
    name: '堅実',
    rank: 'blue',
    scope: 'fielding',
    forPitcher: false,
    description: '取りこぼしが少ない',
    effects: [{ target: 'defense', amount: 7 }],
  },

  // ── 野手・赤 ──────────────────────────────
  {
    id: 'chase-swing',
    name: 'ボール球に手が出る',
    rank: 'red',
    scope: 'batting',
    forPitcher: false,
    description: '四球を選びにくくなる',
    effects: [{ target: 'eye', amount: -18 }],
  },
  {
    id: 'error-prone',
    name: 'エラー癖',
    rank: 'red',
    scope: 'fielding',
    forPitcher: false,
    description: '守備で取りこぼしやすい',
    effects: [{ target: 'defense', amount: -12 }],
  },
  {
    id: 'cold-bat',
    name: 'チャンスに弱い',
    rank: 'red',
    scope: 'batting',
    forPitcher: false,
    description: '得点圏に走者がいると打撃能力が下がる',
    effects: [
      { target: 'meet', amount: -12, when: 'risp' },
      { target: 'power', amount: -12, when: 'risp' },
    ],
  },
  {
    id: 'weak-runner',
    name: '走塁下手',
    rank: 'red',
    scope: 'running',
    forPitcher: false,
    description: '走塁の判断が悪く、次の塁を狙えない',
    effects: [
      { target: 'advance', amount: -12 },
      { target: 'stealSuccess', amount: -10 },
    ],
  },
  {
    id: 'pop-up',
    name: 'ポップフライ',
    rank: 'red',
    scope: 'batting',
    forPitcher: false,
    description: '打球が上がりすぎて長打にならない',
    effects: [{ target: 'power', amount: -10 }],
  },

  // ── 投手・金 ──────────────────────────────
  {
    id: 'ace-heart',
    name: 'エースの風格',
    rank: 'gold',
    scope: 'pitching',
    forPitcher: true,
    description: '走者を背負うと力が増す。崩れにくい',
    effects: [
      { target: 'stuff', amount: 8, when: 'runner' },
      { target: 'control', amount: 8, when: 'runner' },
    ],
  },
  {
    id: 'strikeout-king',
    name: 'ドクターK',
    rank: 'gold',
    scope: 'pitching',
    forPitcher: true,
    description: '三振を奪う力が飛び抜けている',
    effects: [{ target: 'strikeout', amount: 6 }],
  },
  {
    id: 'iron-arm',
    name: '鉄腕',
    rank: 'gold',
    scope: 'pitching',
    forPitcher: true,
    description: 'スタミナが尽きにくく、連投にも耐える',
    effects: [
      { target: 'stamina', amount: 15 },
      // 「連投にも耐える」を実際に効かせる。疲労が半分しか溜まらない
      { target: 'recovery', amount: 50 },
    ],
  },
  {
    id: 'quick-recovery',
    name: '回復',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '登板の疲れが残りにくい。連戦で投げられる',
    effects: [{ target: 'recovery', amount: 30 }],
  },
  {
    id: 'slow-recovery',
    name: '疲れやすい',
    rank: 'red',
    scope: 'pitching',
    forPitcher: true,
    description: '一度投げると疲れが抜けない',
    effects: [{ target: 'recovery', amount: -30 }],
  },
  {
    id: 'unhittable',
    name: '打たせて取る達人',
    rank: 'gold',
    scope: 'pitching',
    forPitcher: true,
    description: 'ゴロを打たせ、長打を許さない',
    effects: [
      { target: 'groundBall', amount: 20 },
      { target: 'longball', amount: -30 },
    ],
  },

  // ── 投手・青 ──────────────────────────────
  {
    id: 'pinch-strong',
    name: 'ピンチに強い',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '走者を背負うと能力が上がる',
    effects: [
      { target: 'stuff', amount: 10, when: 'runner' },
      { target: 'control', amount: 10, when: 'runner' },
    ],
  },
  {
    id: 'ground-ball',
    name: 'ゴロ投手',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: 'ゴロを打たせやすい',
    effects: [{ target: 'groundBall', amount: 15 }],
  },
  {
    id: 'quick-throw',
    name: 'クイック',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '素早い投球で盗塁を許しにくい',
    effects: [{ target: 'catcherArm', amount: 8 }],
  },
  {
    id: 'pin-point',
    name: '精密機械',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '狙ったところへ投げ込む。四球が少ない',
    effects: [{ target: 'control', amount: 12 }],
  },
  {
    id: 'heavy-ball',
    name: '重い球',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '芯で捉えられても飛ばない',
    effects: [
      { target: 'stuff', amount: 6 },
      { target: 'longball', amount: -20 },
    ],
  },
  {
    id: 'late-bloomer',
    name: '尻上がり',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '消耗してからのほうが良い球を投げる',
    effects: [
      { target: 'stuff', amount: 10, when: 'tired' },
      { target: 'control', amount: 6, when: 'tired' },
    ],
  },
  {
    id: 'stamina-saver',
    name: '省エネ投法',
    rank: 'blue',
    scope: 'pitching',
    forPitcher: true,
    description: '球数を抑えて長いイニングを投げる',
    effects: [{ target: 'stamina', amount: 8 }],
  },

  // ── 投手・赤 ──────────────────────────────
  {
    id: 'pinch-weak',
    name: 'ピンチに弱い',
    rank: 'red',
    scope: 'pitching',
    forPitcher: true,
    description: '走者を背負うと能力が下がる',
    effects: [
      { target: 'stuff', amount: -10, when: 'runner' },
      { target: 'control', amount: -10, when: 'runner' },
    ],
  },
  {
    id: 'wild-pitch',
    name: '暴投',
    rank: 'red',
    scope: 'pitching',
    forPitcher: true,
    description: '制球が定まらず四球が増える',
    effects: [{ target: 'control', amount: -8 }],
  },
  {
    id: 'gopher-ball',
    name: '一発病',
    rank: 'red',
    scope: 'pitching',
    forPitcher: true,
    description: '甘く入った球を長打にされやすい',
    effects: [{ target: 'longball', amount: 35 }],
  },
  {
    id: 'short-breath',
    name: 'スタミナ切れ',
    rank: 'red',
    scope: 'pitching',
    forPitcher: true,
    description: '早い回から球威が落ちる',
    effects: [{ target: 'stamina', amount: -12 }],
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
