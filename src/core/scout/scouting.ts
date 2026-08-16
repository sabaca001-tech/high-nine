/**
 * 新入生のスカウト。
 *
 * **まず行き先の県を選ぶ。** 出張費は距離で決まるので、
 * 弱小校は地元近辺しかまわれない。勝って部費が増えると
 * 遠くの有望な県まで足を伸ばせるようになる。
 *
 * ```
 * 県を選ぶ（出張費を払う）
 *   → その県の候補10人が挙がる（中学の成績つき）
 *   → 1人に会いに行く（＝この出張を使い切る）
 *   → もう1人会いたければ、もう一度出張する
 * ```
 *
 * 会いに行った回数がそのまま入部の見込みになる。
 * 候補はその年度のあいだ残るので、同じ県へ通い直せる。
 * 獲れなかった選手はその県の学校へ進み、翌年以降立ちはだかる。
 */

import type { Rng } from '@/core/rng/random'
import { pickName } from '@/core/player/createPlayer'
import type { Position } from '@/core/types/player'
import type { RegionId } from '@/core/types/region'
import { findRegion, REGIONS } from '@/core/types/region'
import { REPUTATION_INITIAL } from '@/core/types/season'
import { findSkill, skillsFor } from '@/core/skill/skillDefs'
import type { SkillId } from '@/core/types/skill'
import { PITCHING_TRAIT_RATE, RAW_RATING_DOWN, RAW_RATING_UP } from './scoutTraits'
import type { ScoutTrait } from './scoutTraits'

/**
 * 中学での成績。
 *
 * 総合値だけでは「どういう選手か」が伝わらない。
 * 数字と実績で人物像を出す。**判定には一切使わない**。
 */
export type JuniorStats = {
  /** 所属（○○中学校 / ○○ボーイズ など） */
  team: string
  /** 到達点（全国大会ベスト8 など） */
  best: string
  /** 野手成績。投手なら null */
  batting: { games: number; average: number; homeruns: number } | null
  /** 投手成績。野手なら null */
  pitching: { games: number; era: number; velocity: number } | null
}

/** スカウトの候補に挙がった中学生 */
export type Prospect = {
  id: string
  name: string
  position: Position
  isPitcher: boolean
  /** 素質。入学時の総合の目安 */
  rating: number
  /** 出身の県 */
  regionId: RegionId
  /** これまでに会いに行った回数 */
  approaches: number
  /**
   * 触れ込みになっている特殊能力。無ければ null。
   *
   * **スカウトの意味はここにある。** 推薦入学は能力が高いだけで、
   * どんな選手が来るかは入学するまで分からない。
   * スカウトは「何を持っているか」を先に見て狙える。
   */
  skillId: SkillId | null
  /** 中学での成績 */
  junior: JuniorStats
  /**
   * U15日本代表に選ばれているか。
   *
   * 代表はある程度の実力が担保されている代わりに、
   * **全国のスカウトが殺到している**ので獲得が難しい（`successChance`）。
   */
  national?: boolean
}

/** 訪問した県と、そこで挙がった候補 */
export type ScoutRegion = {
  regionId: RegionId
  /** 最初に訪問した年 */
  visitedYear: number
  /** 何回出張したか */
  visits: number
  prospects: Prospect[]
}

/** 年度末に出るスカウトの結末 */
export type ScoutResult = {
  name: string
  rating: number
  regionName: string
  /** 会いに行っていたか。行かなかった候補も進学先だけは分かる */
  approached: boolean
  joined: boolean
  /** 触れ込みの特殊能力の名前。無ければ null */
  skillName: string | null
  /** 逃した場合の進学先 */
  schoolName: string | null
}

export type ScoutingState = {
  /**
   * U15日本代表の30人。**年度ごとに作り直す。**
   * 県を選ぶ前から見えていて、視察していない県の選手も載る。
   * 実力は担保されているが、会いに行くには出身県までの出張費がかかる。
   */
  nationalTeam: Prospect[]
  /** 訪問した県。年度が替わるまで残る */
  regions: ScoutRegion[]
  /**
   * 出張中の県。会いに行くと消える。
   * **1回の出張で会えるのは1人。** 誰に会うかがそのまま判断になる。
   */
  visiting: RegionId | null
  /** 直近の結果。次の世代交代まで残す */
  results: ScoutResult[]
}

export function emptyScouting(): ScoutingState {
  return { nationalTeam: [], regions: [], visiting: null, results: [] }
}

/** スカウトを始められる月。冬を挟んで通う時間を作る */
export const SCOUT_OPEN_MONTH = 10

/** 1人あたり何回まで会いに行けるか */
export const MAX_APPROACHES = 4

/** 1つの県で挙がる候補の人数 */
export const PROSPECTS_PER_REGION = 10

/** U15日本代表の人数。全国から選ばれる */
export const NATIONAL_TEAM_SIZE = 30

/**
 * 獲得できる見込み。
 *
 * - 評判が低いと、そもそも土俵に乗らない（初期評判20で5%前後）
 * - 素質が高い選手ほど他校との取り合いになる
 * - 会いに行った回数がそのまま上乗せされる
 */
export function successChance(prospect: Prospect, reputation: number): number {
  const fromReputation = (reputation - REPUTATION_INITIAL) / 180
  const fromApproaches = prospect.approaches * 0.12
  const difficulty = (prospect.rating - 50) / 150
  // 代表は全国のスカウトが殺到している。通っても弱小校では2割前後
  const national = prospect.national ? NATIONAL_PENALTY : 0

  return clamp(0.05 + fromReputation + fromApproaches - difficulty - national, 0.01, 0.9)
}

/**
 * U15代表であることによる獲得率の下げ幅。
 *
 * 通い切った（4回）ときの見込みで、評判20なら約20%、評判95なら約58%。
 * **評判がそのまま効く**ので、代表を獲れるかどうかが強豪校の証になる。
 */
const NATIONAL_PENALTY = 0.3

const FIELDER_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

/**
 * 金特の触れ込みが付く素質の下限。飛び抜けた選手だけ。
 * 素質の水準を上げたので、ここも上げないと代表がほぼ全員金特持ちになる。
 */
const GOLD_SKILL_MIN_RATING = 64

/** 金特が付く確率（上の条件を満たしたとき） */
const GOLD_SKILL_CHANCE = 0.25

/** 青特が付く確率 */
const BLUE_SKILL_CHANCE = 0.55

/**
 * 触れ込みの特殊能力を1つ決める。
 * 赤特（不利な能力）は付けない。**わざわざ通う理由**を作るための仕組みなので、
 * 良い面だけを見せて、その代わり獲るのが難しいという形にする。
 */
function rollSkill(rng: Rng, isPitcher: boolean, rating: number): SkillId | null {
  if (rating >= GOLD_SKILL_MIN_RATING && rng.chance(GOLD_SKILL_CHANCE)) {
    const gold = skillsFor({ forPitcher: isPitcher, rank: 'gold' })
    if (gold.length > 0) return rng.pick(gold).id
  }
  if (rng.chance(BLUE_SKILL_CHANCE)) {
    const blue = skillsFor({ forPitcher: isPitcher, rank: 'blue' })
    if (blue.length > 0) return rng.pick(blue).id
  }
  return null
}

/**
 * 総合で見劣りする代表候補に持たせる一芸。
 * **Cに届かない選手だけ**が対象で、青特を1つ確約する。
 */
function forcedSkill(rng: Rng, isPitcher: boolean, rating: number): SkillId | null {
  if (rating >= FORCED_SKILL_MAX_RATING) return null
  const blue = skillsFor({ forPitcher: isPitcher, rank: 'blue' })
  return blue.length > 0 ? rng.pick(blue).id : null
}

/** ここに届かない代表候補には必ず一芸を持たせる（Cの下限） */
const FORCED_SKILL_MAX_RATING = 60

/** 中学の所属名。実在校を想起させない一般的な語で組み立てる */
const JUNIOR_PREFIX = [
  '第一', '第二', '中央', '東', '西', '南', '北', '緑丘', '若葉', '桜台',
  'みなと', '大和', '高台', '松原', '青空', '川辺', '山手', '朝日',
]
const JUNIOR_SUFFIX = ['中学校', '中学校', '中学校', 'ボーイズ', 'シニア', 'クラブ']

/** 中学時代の到達点。素質が高い選手ほど上に載る */
const ACHIEVEMENTS = [
  '地区大会1回戦敗退',
  '地区大会ベスト8',
  '県大会出場',
  '県大会ベスト4',
  '県大会優勝',
  '全国大会出場',
  '全国大会ベスト8',
  '全国大会優勝',
]

/**
 * 候補を1つの県ぶん作る。**県を選んだ時点で生成する。**
 * 生成しておかないと「他校へ行った」という結末が作れない。
 */
export function createProspects(
  rng: Rng,
  params: {
    reputation: number
    regionId: RegionId
    trait: ScoutTrait
    year: number
    /** id を一意にするための通し番号 */
    serial: number
  },
): Prospect[] {
  const prospects: Prospect[] = []
  const names: string[] = []

  for (let i = 0; i < PROSPECTS_PER_REGION; i++) {
    const isPitcher = rng.chance(params.trait === 'pitching' ? PITCHING_TRAIT_RATE : 0.3)
    const name = pickName(rng, names)
    names.push(name)

    /*
     * 評判が高いほど上澄みが来る。
     * **素材型の県は振れ幅が広い**（上にも下にも振れる）。
     * 一律の上乗せにしていた頃は、10人のうち誰かが必ずCに届き、
     * 素材型の県へ行けば確実に当たりが見つかった。
     */
    /*
     * **評判の効きは控えめ。** 0.18にしていた頃は、評判95で平均53・上位65となり、
     * 県を回るだけでCが手に入った。Cは代表（U15）を追いかけて獲るもので、
     * 県の候補で出会えたら「当たり」であってほしい。
     */
    const base = LOCAL_BASE + Math.round((params.reputation - REPUTATION_INITIAL) * 0.11)
    const rating = clampRating(
      base +
        (params.trait === 'raw'
          ? rng.int(-RAW_RATING_DOWN, RAW_RATING_UP)
          : rng.int(-PROSPECT_SPREAD, PROSPECT_SPREAD)),
    )

    prospects.push({
      id: `sc${params.year}-${params.serial}-${i}`,
      name,
      position: isPitcher ? 'P' : rng.pick(FIELDER_POSITIONS),
      isPitcher,
      rating,
      regionId: params.regionId,
      approaches: 0,
      skillId: rollSkill(rng, isPitcher, rating),
      junior: rollJuniorStats(rng, isPitcher, rating),
    })
  }

  // 良い選手から並べる。10人を素のまま出すと読むのがつらい
  return prospects.sort((a, b) => b.rating - a.rating)
}

/**
 * 県の候補の素質の中心（評判20のとき）。
 * 通常の新入生（`GRADE_BASE[1]` ＝ 36）より数点上に置く。
 * **`GRADE_BASE[1]` を動かしたらここも動かす。**
 * 差が縮むと、出張費を払って通う意味が無くなる。
 *
 * **46は高すぎた。** スカウトで獲った選手が入学した時点で
 * 3年生（`GRADE_BASE[3]` ＝ 50）に並び、そこから3年伸びるので
 * チームがスカウト組だけで埋まっていた。
 * 通う価値は残しつつ、**入学時点では上級生に届かない**水準に下げる。
 */
const LOCAL_BASE = 40

/**
 * 県の候補の振れ幅（±）。
 * **上下対称にしてある。** `-10〜+14` と上に振っていた頃は、
 * どの県でも平均が2点ずつ底上げされていた。
 */
const PROSPECT_SPREAD = 12

/**
 * U15日本代表の30人を作る。**年度の初めに一度だけ。**
 *
 * 県ごとの候補と違って、**視察しなくても顔ぶれが見えている**。
 * 全国から選ばれた30人なので実力は担保されているが、
 * その代わり全国のスカウトが殺到していて獲得は難しい。
 *
 * 素質に学校の評判は効かせない。代表は全国から選ばれるもので、
 * こちらの評判とは関係が無い。**評判が効くのは獲得率のほう**。
 */
export function createNationalTeam(rng: Rng, year: number): Prospect[] {
  const prospects: Prospect[] = []
  const names: string[] = []

  for (let i = 0; i < NATIONAL_TEAM_SIZE; i++) {
    const isPitcher = rng.chance(0.3)
    const name = pickName(rng, names)
    names.push(name)

    /*
     * **基本はC（60〜69）。少しだけDが混ざる。**
     * 全国から選ばれた30人なので、粒は揃っている。
     * Dに落ちた選手は「総合では劣るが一芸がある」形にして、
     * 数字だけでは決められないようにする（下で必ず特殊能力を持たせる）。
     */
    const rating = clampRating(NATIONAL_BASE + rng.int(-9, 6))
    const regionId = rng.pick(REGIONS).id

    prospects.push({
      id: `u15-${year}-${i}`,
      name,
      position: isPitcher ? 'P' : rng.pick(FIELDER_POSITIONS),
      isPitcher,
      rating,
      regionId,
      approaches: 0,
      // **Dの選手は必ず一芸を持つ。** 総合だけで切ると、代表なのに
      // 「弱いだけの選手」になってしまう
      skillId: rollSkill(rng, isPitcher, rating) ?? forcedSkill(rng, isPitcher, rating),
      junior: rollJuniorStats(rng, isPitcher, rating),
      national: true,
    })
  }

  return prospects.sort((a, b) => b.rating - a.rating)
}

/**
 * 代表選手の素質の中心。
 *
 * 県ごとの候補（評判20で中心40）より**はっきり上**に置く。
 * 近づけると「代表を狙う理由」が獲得率の低さに見合わなくなる。
 * 1年生でいきなり3年生（`GRADE_BASE[3]` ＝ 50）に並ぶ素材。
 *
 * **60は高すぎた。** 獲れた瞬間にチームで一番の選手になり、
 * 3年育てる意味が薄れていた。
 */
const NATIONAL_BASE = 63

/** 中学の成績を作る。素質と噛み合った数字にする */
function rollJuniorStats(rng: Rng, isPitcher: boolean, rating: number): JuniorStats {
  const team = `${rng.pick(JUNIOR_PREFIX)}${rng.pick(JUNIOR_SUFFIX)}`
  // 素質が高いほど上の到達点。ただし振れ幅は残す
  const level = clamp(Math.floor((rating - 26) / 6) + rng.int(-1, 1), 0, ACHIEVEMENTS.length - 1)
  const best = ACHIEVEMENTS[level]

  if (isPitcher) {
    return {
      team,
      best,
      batting: null,
      pitching: {
        games: rng.int(8, 24),
        era: round2(clamp(4.6 - (rating - 34) * 0.06 + (rng.float() - 0.5) * 1.2, 0.3, 6.5)),
        // 高校の球速と同じ尺度で出す（createPlayer の velocityFor に合わせる）
        velocity: Math.round(clamp(110 + rating * 0.5 + rng.int(-3, 3), 105, 150)),
      },
    }
  }

  return {
    team,
    best,
    batting: {
      games: rng.int(12, 30),
      average: round3(clamp(0.26 + (rating - 34) * 0.005 + (rng.float() - 0.5) * 0.08, 0.15, 0.62)),
      homeruns: Math.max(0, Math.round((rating - 32) * 0.18 + rng.int(-1, 2))),
    },
    pitching: null,
  }
}

/** 触れ込みの表示名。無ければ null */
export function prospectSkillName(prospect: Prospect): string | null {
  return prospect.skillId ? (findSkill(prospect.skillId)?.name ?? null) : null
}

/** 候補の出身県の名前 */
export function prospectRegionName(prospect: Prospect): string {
  return findRegion(prospect.regionId).name
}

/** 訪問済みの県を探す */
export function findScoutRegion(
  state: ScoutingState,
  regionId: RegionId,
): ScoutRegion | undefined {
  return state.regions.find((region) => region.regionId === regionId)
}

/**
 * 進路が決まる候補すべて。
 * **U15代表も含める。** 含めないと、代表の選手だけ結末が出ない。
 */
export function allProspects(state: ScoutingState): Prospect[] {
  return [...state.regions.flatMap((region) => region.prospects), ...(state.nationalTeam ?? [])]
}

/** U15代表から1人探す */
export function findNationalProspect(
  state: ScoutingState,
  prospectId: string,
): Prospect | undefined {
  return (state.nationalTeam ?? []).find((prospect) => prospect.id === prospectId)
}

/** 会いに行ったことのある候補だけ */
export function approachedProspects(state: ScoutingState): Prospect[] {
  return allProspects(state).filter((prospect) => prospect.approaches > 0)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampRating(value: number): number {
  return Math.min(85, Math.max(20, Math.round(value)))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
