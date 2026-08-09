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
  /**
   * 入部したマネージャー。いなければ null。
   * **新入生と一緒に出す。** ログに一行流れるだけでは、
   * 誰が入ってきたのか・何ができるのかが分からなかった。
   */
  joinedManager?: import('@/core/staff/managers').TeamManager | null
  /** 卒業したマネージャー */
  graduatedManagers?: import('@/core/staff/managers').TeamManager[]
  /** スカウトの結末。獲れた選手と、逃した選手の進学先 */
  scoutResults: import('@/core/scout/scouting').ScoutResult[]
  /** 県内のライバル校の動き */
  rivalNews: string[]
  reputationBefore: number
  reputationAfter: number
}

/** 学校の評判の上限 */
export const REPUTATION_MAX = 100

/**
 * 評判の上がりにくさ。
 *
 * 素の加算をそのまま足していたら、**1年目で100に張り付いた**。
 * そうなると新入生の質も手札の枚数も頭打ちになり、
 * 「勝って学校を大きくする」という筋が2年目以降なくなってしまう。
 *
 * 上に行くほど伸びを鈍らせて、全国屈指（90以上）は
 * 何年も勝ち続けた学校だけが届く水準にする。
 *  評判20 → 加算の90% ／ 評判50 → 60% ／ 評判80 → 26% ／ 評判95 → 9%
 */
export function reputationGainAt(current: number, raw: number): number {
  if (raw > 0) {
    // **2乗は効きすぎた。** 評判50で加算が4分の1、64で8分の1しか通らず、
    // 勝率6割のチームが30前後で頭打ちになっていた
    // （釣り合いに必要な勝敗比が 50で2:1、64で4.9:1）。
    // 1.5乗にすると 50で0.35、64で0.22 通るので、
    // 県内で勝ち続ければB（強豪）まで届く
    const room = Math.max(0, 1 - current / REPUTATION_MAX)
    return raw * Math.pow(room, REPUTATION_DAMPING)
  }
  // 下がるほうも同じ考えで鈍らせる。**下限で止まらないと詰む。**
  // 負けるたびに削られる仕組みを入れたら、勝てないチームの評判が
  // 一桁まで落ちて新入生も部費も枯れ、立て直しようが無くなった（実測で60年後に6）。
  // 落ちるところまで落ちた学校は、もう失うものが無い
  return raw * Math.max(REPUTATION_LOSS_FLOOR, current / REPUTATION_MAX)
}

/**
 * 評判が低いときに下げ幅へかかる下限の倍率。
 * 評判20なら下げ幅の25%しか通らないので、無戦略でも20前後で底を打つ。
 */
const REPUTATION_LOSS_FLOOR = 0.25

/**
 * 上がりにくさの指数。大きいほど頭打ちが早い。
 * 2.0 だと勝率6割でも30前後で止まり、1.5でもB（64）を保つのに
 * 格下相手で9割の勝率が要った。1.2まで緩めると無戦略プレイでもAに届いてしまう。
 */
const REPUTATION_DAMPING = 1.35

/**
 * 評判を動かす。**小数第1位まで保つ。**
 *
 * **整数に丸めていたら、勝ちの加算だけが消えていた。**
 * 試合ごとの加算は素の値+1で、評判40では0.47しか通らない。
 * `Math.round(40 + 0.47)` は 40 なので、**1試合勝つたびに切り捨てられていた**。
 * 一方、負けの素の値は格下相手だと-2を超えるので0.86通り、
 * こちらは -1 として確実に残る。
 *
 * 結果として「勝ってもびくとも動かないのに、負けると下がる」状態になり、
 * 大会に優勝しても評判が上がらなかった。
 * 積み上げる値を表示の桁で丸めてはいけない。
 */
export function applyReputation(current: number, raw: number): number {
  const next = current + reputationGainAt(current, raw)
  return round1(Math.min(REPUTATION_MAX, Math.max(0, next)))
}

/** 画面に出すときの評判。小数は見せない */
export function reputationDisplay(reputation: number): number {
  return Math.round(reputation)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

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
/**
 * 評判ごとの手札の枚数。
 *
 * **下限を5枚にしてある。** 4枚だと選択肢が少なすぎて、
 * 「引いた中から選ぶ」という手触りにならなかった。
 */
const HAND_SIZE_BY_GRADE: Record<ReputationGrade, number> = {
  G: 5,
  F: 5,
  E: 5,
  D: 6,
  C: 6,
  B: 7,
  A: 7,
  S: 8,
}

export function handSizeFor(reputation: number): number {
  return HAND_SIZE_BY_GRADE[reputationGrade(reputation)]
}

/** 手札の最大枚数。UI の幅を決めるのに使う */
export const HAND_SIZE_MAX = 8
