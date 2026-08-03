/**
 * ライバル校。
 *
 * 対戦相手をその場で作って捨てていたので、
 * **自分だけが強くなり、周りは何年経っても同じ**という世界になっていた。
 * 学校を state に残し、毎年戦力を動かす。
 *
 * 持っているのは2種類:
 *  - **県内10校** … 地区大会と地元の練習試合の相手
 *  - **県外20校** … 全国大会の相手。U18の選考基準もこの顔ぶれで決まる
 *
 * 選手データを他校ぶんまで丸ごと持つとセーブが膨らむので、
 * 持つのは「学校の戦力」と「注目選手（2人）」だけにする。
 * 試合に出てくる9人はこれまで通り、戦力値から使い捨てで作る。
 */

import type { Rng } from '@/core/rng/random'
import { pickName } from '@/core/player/createPlayer'
import type { Grade } from '@/core/types/player'
import type { RegionId } from '@/core/types/region'
import { REGIONS } from '@/core/types/region'
import { makeSchoolName } from './rivalDefs'

/** 他校の注目選手。名前と実力だけを持つ */
export type RivalPlayer = {
  id: string
  name: string
  grade: Grade
  isPitcher: boolean
  /** 総合 1〜99 */
  rating: number
}

export type RivalSchool = {
  id: string
  name: string
  regionId: RegionId
  /**
   * 地力。名門ほど高く、**年が変わっても動かない**。
   * 戦力はこの値へ引き戻されるので、強豪は強豪のまま、弱小は弱小のままになる。
   */
  tradition: number
  /** 今年の戦力。相手の強さに使う。0が平均で、+20なら格上 */
  strength: number
  /** 前年からの増減。「力をつけてきた」の表示に使う */
  trend: number
  /** 注目選手。U18の選考とスカウトの進学先に使う */
  stars: RivalPlayer[]
  /**
   * 自校との対戦成績。
   * 「去年負けたあの学校」と分かるようにするための記録で、
   * 試合前の確認画面に出す。ゲームの判定には使わない。
   */
  record: RivalRecord
}

/** 1校との対戦成績 */
export type RivalRecord = {
  wins: number
  losses: number
  draws: number
  /** 直近の対戦。まだ当たっていなければ null */
  last: { year: number; label: string; outcome: 'win' | 'lose' | 'draw' } | null
}

export function emptyRivalRecord(): RivalRecord {
  return { wins: 0, losses: 0, draws: 0, last: null }
}

/** 1つの県に置くライバル校の数 */
export const RIVALS_PER_REGION = 10

/**
 * 県外に置く全国クラスの学校の数。
 *
 * 全国大会の相手も使い捨てにしていたので、
 * 「去年あそこに負けた」「今年こそ」という記憶が積み上がらなかった。
 * 20校あれば甲子園で何度も顔を合わせる。
 */
export const NATIONAL_RIVALS = 20

/** 地力の分布。強豪1・中堅・弱小がまざるようにする */
const TRADITION_MIN = -10
const TRADITION_MAX = 22

/**
 * 全国クラスの学校の地力。
 * 県大会を勝ち抜いてきた学校なので、県内の平均よりはっきり上に置く。
 * ただし初出場の学校もいるので下限は低めにしてある。
 */
const NATIONAL_TRADITION_MIN = 8
const NATIONAL_TRADITION_MAX = 34

/** 1校が抱える注目選手の数 */
const STARS_PER_SCHOOL = 2

/** 戦力が地力へ戻る強さ。1.0なら毎年ぴったり地力に戻る */
const REGRESSION = 0.45

/** 年ごとの戦力の揺れ */
const DRIFT = 6

/** 注目選手の学年ごとの成長量 */
const STAR_GROWTH_MIN = 4
const STAR_GROWTH_MAX = 12

/**
 * ライバル校を作る。新規ゲームでだけ呼ぶ。
 *
 * 県内10校（大会と地元の練習試合の相手）と、
 * 県外の全国クラス20校（全国大会の相手・U18の選考基準）をまとめて返す。
 */
export function createRivals(rng: Rng, homeRegionId: RegionId): RivalSchool[] {
  const schools: RivalSchool[] = []
  const names: string[] = []
  const playerNames: string[] = []

  const add = (id: string, regionId: RegionId, tradition: number) => {
    const name = makeSchoolName(rng, names)
    names.push(name)
    schools.push({
      id,
      name,
      regionId,
      tradition,
      strength: tradition + rng.int(-DRIFT, DRIFT),
      trend: 0,
      stars: createStars(rng, id, tradition, playerNames),
      record: emptyRivalRecord(),
    })
  }

  for (let i = 0; i < RIVALS_PER_REGION; i++) {
    // 1校だけは必ず強豪にする。目標になる相手が居ないと張り合いが無い
    const tradition =
      i === 0 ? rng.int(16, TRADITION_MAX) : rng.int(TRADITION_MIN, TRADITION_MAX - 6)
    add(`rs${i + 1}`, homeRegionId, tradition)
  }

  // 県外の全国クラス。1県に1校までにして、全国に散らす
  const elsewhere = REGIONS.filter((region) => region.id !== homeRegionId)
  const picked = shuffle(rng, elsewhere).slice(0, NATIONAL_RIVALS)

  picked.forEach((region, index) => {
    add(`rn${index + 1}`, region.id, rng.int(NATIONAL_TRADITION_MIN, NATIONAL_TRADITION_MAX))
  })

  return schools
}

/** 県内の学校。地区大会と地元の練習試合の相手 */
export function localRivals(schools: RivalSchool[], regionId: RegionId): RivalSchool[] {
  return schools.filter((school) => school.regionId === regionId)
}

/** 県外の学校。全国大会の相手 */
export function nationalRivals(schools: RivalSchool[], regionId: RegionId): RivalSchool[] {
  return schools.filter((school) => school.regionId !== regionId)
}

/** その県の学校。遠征先で当たる相手を探すのに使う */
export function rivalsIn(schools: RivalSchool[], regionId: RegionId): RivalSchool[] {
  return schools.filter((school) => school.regionId === regionId)
}

/** シードから決まる並べ替え。同じシードなら同じ結果になる */
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** 注目選手を作る。学校の地力が高いほど良い選手が居る */
function createStars(
  rng: Rng,
  schoolId: string,
  tradition: number,
  takenNames: string[],
): RivalPlayer[] {
  const stars: RivalPlayer[] = []

  for (let i = 0; i < STARS_PER_SCHOOL; i++) {
    const grade = rng.pick<Grade>([1, 2, 3])
    stars.push(makeStar(rng, `${schoolId}-${i}`, grade, tradition, takenNames))
  }
  return stars
}

function makeStar(
  rng: Rng,
  id: string,
  grade: Grade,
  tradition: number,
  takenNames: string[],
): RivalPlayer {
  const name = pickName(rng, takenNames)
  takenNames.push(name)

  // 1年生で30前後、3年生で60前後。地力の高い学校ほど上乗せされる
  const base = 22 + grade * 14 + Math.round(tradition * 0.8)

  return {
    id,
    name,
    grade,
    isPitcher: rng.chance(0.35),
    rating: clampRating(base + rng.int(-6, 8)),
  }
}

/** 学校1つの1年ぶんの変化 */
export type RivalUpdate = {
  school: RivalSchool
  /** 世代交代の報告に出す一言。無ければ null */
  news: string | null
}

/**
 * ライバル校の1年を進める。
 *
 * 戦力は地力へ引き戻しつつ揺らす。放っておくと強豪が
 * 際限なく強くなる（あるいは弱小が消えていく）ので、必ず引き戻す。
 */
export function advanceRival(rng: Rng, school: RivalSchool, year: number): RivalUpdate {
  const pull = (school.tradition - school.strength) * REGRESSION
  const next = round(school.strength + pull + rng.int(-DRIFT, DRIFT))
  const trend = next - school.strength

  // 注目選手：3年生は卒業し、残りは進級して伸びる
  const takenNames = school.stars.map((star) => star.name)
  const stars = school.stars
    .filter((star) => star.grade < 3)
    .map((star) => ({
      ...star,
      grade: (star.grade + 1) as Grade,
      rating: clampRating(star.rating + rng.int(STAR_GROWTH_MIN, STAR_GROWTH_MAX)),
    }))

  // 抜けたぶんだけ新入生を迎える
  while (stars.length < STARS_PER_SCHOOL) {
    stars.push(
      makeStar(rng, `${school.id}-${year}-${stars.length}`, 1, school.tradition, takenNames),
    )
  }

  const updated: RivalSchool = { ...school, strength: next, trend, stars }

  return { school: updated, news: newsFor(updated) }
}

/** はっきり動いた学校だけ報告する。全校ぶん出すと読めない */
function newsFor(school: RivalSchool): string | null {
  if (school.trend >= 6) return `${school.name}が力をつけてきた`
  if (school.trend <= -6) return `${school.name}は主力が抜けて苦しそうだ`
  return null
}

/**
 * 逃した選手が入る学校。実力に見合った学校へ行く。
 *
 * **出身県の学校を優先する。** 地元の中学生が縁もゆかりも無い県へ行くのは不自然で、
 * 「○○県の△△高校へ進んだ」という報告も読みにくくなる。
 */
export function schoolForProspect(
  rng: Rng,
  schools: RivalSchool[],
  rating: number,
  /** 候補の出身県。その県に学校があればそこから選ぶ */
  homeRegionId?: RegionId,
): RivalSchool | null {
  const local = homeRegionId ? rivalsIn(schools, homeRegionId) : []
  const pool = local.length > 0 ? local : schools
  if (pool.length === 0) return null

  // 良い選手ほど強い学校が獲る。同程度の学校の中から選ぶ
  const sorted = [...pool].sort((a, b) => b.strength - a.strength)
  const rank = Math.min(sorted.length - 1, Math.floor(((99 - rating) / 60) * sorted.length))
  const window = sorted.slice(Math.max(0, rank - 1), rank + 2)

  return rng.pick(window.length > 0 ? window : sorted)
}

/**
 * 逃した選手をその学校に加える。
 * 翌年以降、その選手が育って自分の前に立ちはだかる。
 */
export function addStar(school: RivalSchool, star: RivalPlayer): RivalSchool {
  return {
    ...school,
    stars: [...school.stars, star],
    // 良い選手が入れば戦力も上がる
    strength: school.strength + Math.max(0, Math.round((star.rating - 40) / 8)),
  }
}

/**
 * 大会・練習試合の相手を選ぶ。
 *
 * **難易度の曲線（回戦ごとの強さ）は崩さない。**
 * その強さに近い学校を当て、名前と戦力を少しだけ寄せる。
 * こうすると「勝ち上がると常連校と当たる」感覚が出つつ、
 * 育成が足りているかを測る基準は動かない。
 */
export function pickRivalFor(
  rng: Rng,
  schools: RivalSchool[],
  baseStrength: number,
): { id: string; name: string; regionId: RegionId; strength: number } | null {
  if (schools.length === 0) return null

  const sorted = [...schools].sort(
    (a, b) => Math.abs(a.strength - baseStrength) - Math.abs(b.strength - baseStrength),
  )
  const school = rng.pick(sorted.slice(0, Math.min(3, sorted.length)))

  return {
    id: school.id,
    name: school.name,
    regionId: school.regionId,
    strength: round(baseStrength * 0.6 + school.strength * 0.4),
  }
}

/** 対戦成績を1試合ぶん足す */
export function addResult(
  school: RivalSchool,
  result: { year: number; label: string; outcome: 'win' | 'lose' | 'draw' },
): RivalSchool {
  const record = school.record
  return {
    ...school,
    record: {
      wins: record.wins + (result.outcome === 'win' ? 1 : 0),
      losses: record.losses + (result.outcome === 'lose' ? 1 : 0),
      draws: record.draws + (result.outcome === 'draw' ? 1 : 0),
      last: result,
    },
  }
}

/** 対戦したことがあるか */
export function hasMet(record: RivalRecord): boolean {
  return record.wins + record.losses + record.draws > 0
}

/** 「通算2勝3敗」のような表記。引き分けがあれば足す */
export function formatRecord(record: RivalRecord): string {
  const base = `${record.wins}勝${record.losses}敗`
  return record.draws > 0 ? `${base}${record.draws}分` : base
}

/** いちばん強い注目選手の総合 */
export function bestStarRating(schools: RivalSchool[]): number {
  let best = 0
  for (const school of schools) {
    for (const star of school.stars) best = Math.max(best, star.rating)
  }
  return best
}

/**
 * 注目選手を強い順に並べたとき、上から `rank` 番目の総合。
 *
 * U18の選考基準に使う。**「いちばん強い1人」と比べてはいけない。**
 * 代表は十数人選ばれるので、1人と比べると誰も届かないか、
 * その1人が卒業した年だけ急に全員通る、という飛び方をする。
 * 対象がそれだけ居ないときは、いちばん下の選手の総合を返す。
 */
export function starRatingAtRank(schools: RivalSchool[], rank: number): number {
  const ratings = schools
    .flatMap((school) => school.stars.map((star) => star.rating))
    .sort((a, b) => b - a)

  if (ratings.length === 0) return 0
  return ratings[Math.min(rank, ratings.length - 1)]
}

/** 上級生の注目選手だけを強い順に並べたときの `rank` 番目 */
export function upperStarRatingAtRank(schools: RivalSchool[], rank: number): number {
  const ratings = schools
    .flatMap((school) => school.stars.filter((star) => star.grade >= 2))
    .map((star) => star.rating)
    .sort((a, b) => b - a)

  if (ratings.length === 0) return 0
  return ratings[Math.min(rank, ratings.length - 1)]
}

function clampRating(value: number): number {
  return Math.min(99, Math.max(1, Math.round(value)))
}

/**
 * 整数に丸める。
 *
 * `Math.round` は -0.2 に対して **-0** を返し、JSON にすると 0 になる。
 * セーブして読み直すと値が変わってしまうので、必ず 0 に潰す。
 */
function round(value: number): number {
  const rounded = Math.round(value)
  return rounded === 0 ? 0 : rounded
}
