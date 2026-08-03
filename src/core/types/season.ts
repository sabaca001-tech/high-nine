/** 世代交代（卒業・新入生加入）に関する型 */

import type { Player } from './player'
import type { Alumnus } from './career'

/**
 * OB名鑑に残す卒業生の記録。
 * 卒業後の進路（プロ・大学・社会人）も含めて追跡する。
 */
export type GraduateRecord = Alumnus

/** 新年度の切り替わりで起きたことのまとめ。UI はこれを1画面で見せる */
export type SeasonReport = {
  /** 新しい年（この年の4月が始まる） */
  year: number
  graduates: GraduateRecord[]
  /** 卒業生のその後で起きた出来事（プロ入り・引退・渡米など） */
  careerNews: string[]
  /** 加入した新入生 */
  newcomers: Player[]
  /** 推薦で入った逸材のid */
  recommendedIds: string[]
  /** スカウトの結末。獲れた選手と、逃した選手の進学先 */
  scoutResults: import('@/core/scout/scouting').ScoutResult[]
  /** 県内のライバル校の動き */
  rivalNews: string[]
  reputationBefore: number
  reputationAfter: number
}

/** 学校の評判の上限 */
export const REPUTATION_MAX = 100

/** 評判の初期値 */
export const REPUTATION_INITIAL = 20

/**
 * 評判のグレード。能力値と同じ G〜S の8段階で表す。
 *
 * 星1〜5では段階が粗く、評判を上げた手応えが出にくかった。
 * 能力値と同じ表記に揃えると、「うちはまだ D の学校」のように
 * チームの位置づけを能力と同じ感覚で読める。
 */
export type ReputationGrade = 'G' | 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S'

const REPUTATION_THRESHOLDS: { grade: ReputationGrade; min: number }[] = [
  { grade: 'S', min: 90 },
  { grade: 'A', min: 78 },
  { grade: 'B', min: 64 },
  { grade: 'C', min: 50 },
  { grade: 'D', min: 36 },
  { grade: 'E', min: 24 },
  { grade: 'F', min: 12 },
  { grade: 'G', min: 0 },
]

/** 評判 → グレード */
export function reputationGrade(reputation: number): ReputationGrade {
  for (const { grade, min } of REPUTATION_THRESHOLDS) {
    if (reputation >= min) return grade
  }
  return 'G'
}

/** グレードごとの呼び名。学校の格として読めるようにする */
export const REPUTATION_GRADE_LABELS: Record<ReputationGrade, string> = {
  G: '無名校',
  F: '弱小校',
  E: '中堅以下',
  D: '中堅校',
  C: '有力校',
  B: '強豪校',
  A: '名門校',
  S: '全国屈指',
}

/**
 * 評判に応じた手札の枚数。
 *
 * 評判が上がると**選択肢が増える**という形の報酬にした。
 * 能力を直接盛るより、プレイヤーの判断の幅が広がるほうが面白い。
 */
const HAND_SIZE_BY_GRADE: Record<ReputationGrade, number> = {
  G: 4,
  F: 4,
  E: 5,
  D: 5,
  C: 6,
  B: 6,
  A: 7,
  S: 8,
}

export function handSizeFor(reputation: number): number {
  return HAND_SIZE_BY_GRADE[reputationGrade(reputation)]
}

/** 手札の最大枚数。UI の幅を決めるのに使う */
export const HAND_SIZE_MAX = 8
