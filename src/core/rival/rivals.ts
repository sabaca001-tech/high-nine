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
import { findRegion, REGIONS } from '@/core/types/region'
import { makeSchoolName } from './rivalDefs'

/** 他校の注目選手。名前と実力だけを持つ */
export type RivalPlayer = {
  id: string
  name: string
  grade: Grade
  isPitcher: boolean
  /** 総合 1〜99 */
  rating: number
  /**
   * 入学した年。**省略時は学年を据え置く**（古いセーブ用）。
   * これがあると、学年が上がって3年を過ぎたら名簿から外れる。
   */
  enrolledYear?: number
  /** 触れ込みの特殊能力。スカウトで見ていた選手はこれを持って進学する */
  skillId?: string
  /** **こちらがスカウトで追いかけていた選手か。** 表示で分かるようにする */
  scouted?: boolean
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
  /**
   * 注目選手。U18の選考とスカウトの進学先に使う。
   * **抱えていない学校は持たない**（各県の筆頭校だけが持つ）。
   * 2800校ぶんの空配列は、それだけで30KBの無駄になる。読むときは `starsOf` を通す。
   */
  stars?: RivalPlayer[]
  /**
   * 注目選手を抱える学校か。
   *
   * **県内は全校を持つ（178校の県もある）**ので、
   * 全部に注目選手を置くと名簿が注目選手だらけになるうえ、
   * U18の選考基準もその数に引きずられる。
   * 名の通った学校（`stars` を持つ学校）だけに立てる。
   */
  notable?: boolean
  /**
   * 部員名簿を作るための種。**選手そのものは保存しない。**
   * 30校×15人を抱えるとセーブが膨らむので、
   * 同じ種から毎回同じ部員を作り直す（`rivalRoster`）。
   */
  rosterSeed: number
  /**
   * 自校との対戦成績。**まだ当たっていなければ持たない。**
   * 「去年負けたあの学校」と分かるようにするための記録で、
   * 試合前の確認画面に出す。ゲームの判定には使わない。
   *
   * 全校ぶん空の記録を持たせると、658校で17KBがまるごと無駄になる。
   * 読むときは `recordOf` を通すこと。
   */
  record?: RivalRecord
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

/** その学校の注目選手。抱えていなければ空 */
export function starsOf(school: RivalSchool): RivalPlayer[] {
  return school.stars ?? EMPTY_STARS
}

/** 注目選手を持たない学校用。毎回作らないよう1つだけ持つ */
const EMPTY_STARS: RivalPlayer[] = []

/** その学校との対戦成績。まだ当たっていなければ空の記録を返す */
export function recordOf(school: RivalSchool): RivalRecord {
  return school.record ?? EMPTY_RECORD
}

/** 未対戦のときに返す記録。毎回作らないよう1つだけ持つ */
const EMPTY_RECORD: RivalRecord = { wins: 0, losses: 0, draws: 0, last: null }

/**
 * 1つの県に置く**注目校**の数。
 *
 * **県内の学校そのものは全校ぶん作る。**（`createRivals`）
 * 10校しか無かった頃は、大会の対戦相手が10校の中から選ばれるだけで、
 * トーナメント表を出そうにも「勝ち上がってきた学校」が存在しなかった。
 * ここで決めるのは、注目選手（U18の選考基準・スカウトの進学先）を抱える校数。
 */
export const RIVALS_PER_REGION = 10

/**
 * 県外の**1県あたり**の学校数。
 *
 * 1県1校だった頃は、遠征の練習試合で同じ県へ行くたびに
 * **必ず同じ学校が出てきた**。その県には1校しか存在しないので当然で、
 * 「遠征先で新しい相手と当たる」という手応えが出ない。
 * U18の候補も48校の上位2人しか居なかった。
 *
 * 名簿は種から作り直すので、増えるのは名前と数値だけ。
 */
export const NATIONAL_SCHOOLS_PER_REGION = 165

/**
 * 県外に置く学校の総数。
 *
 * 全国大会の相手を使い捨てにしていた頃は、
 * 「去年あそこに負けた」「今年こそ」という記憶が積み上がらなかった。
 */
export const NATIONAL_RIVALS = (REGIONS.length - 1) * NATIONAL_SCHOOLS_PER_REGION

/**
 * 県内の学校の地力の分布。
 *
 * **格上が少なすぎた。** 県内10校のうち格上は実質2校で、
 * 3年も育てれば県内が全部格下になっていた。
 * 実際の県には甲子園常連が数校、それに続く強豪が十数校あり、
 * その下に大多数が広がっている。**校数のピラミッドをそのまま作る。**
 *
 * 178校の県なら、常連5校・強豪12校・中堅上位27校が出てくる。
 */
const TRADITION_TIERS: { weight: number; min: number; max: number }[] = [
  { weight: 0.35, min: 42, max: 68 }, // 全国区の名門
  { weight: 3, min: 28, max: 42 }, // 甲子園常連
  { weight: 7, min: 18, max: 28 }, // 強豪
  { weight: 15, min: 8, max: 18 }, // 中堅上位
  { weight: 30, min: -2, max: 8 }, // 中堅
  { weight: 45, min: -16, max: -2 }, // 下位
]

/**
 * 県の上位校の地力の下限。**どの県にも強豪が数校いる。**
 *
 * 抽選任せだと、名門の段（101分の1）を1校も引かない県が普通に出る。
 * 24校の鳥取なら期待値0.24校で、
 * 「甲子園に手が届く学校」が1つも存在しない県が生まれていた。
 *
 * 逆に上位を1校だけ強くすると、その1校を倒せば県内に敵がいなくなる。
 * **上位4校まで下限を置いて、県内に序列のある強豪を残す。**
 * 県外も同じ配り方にしてある（甲子園に出てくるのは各県の最上位なので、
 * 県ごとの厚みがそのまま全国の厚みになる）。
 */
const TOP_SCHOOL_FLOORS: { min: number; max: number }[] = [
  { min: 26, max: 56 }, // 筆頭校
  { min: 20, max: 40 }, // 2番手
  { min: 14, max: 30 }, // 3番手
  { min: 10, max: 24 }, // 4番手
]

/**
 * **代ごとの当たり外れ**（±）。
 *
 * 名簿を「学年のベース＋学校の戦力」だけで作っていた頃は、
 * 3学年とも同じ基準で作られるので、
 * **どの代も同じ出来**だった。良い代・悪い代が無いので、
 * 卒業しても学校の格が動かず、県内の序列も年々ほぼ固定されていた。
 *
 * 入学年ごとに出来をずらすと、
 * 「良い新入生が揃った学校が3年かけて台頭し、卒業と同時に落ちる」
 * という入れ替わりが自然に起きる。
 *
 * **保存は増えない。** 種（`rosterSeed`）と入学年から毎回同じ値を作る。
 */
export const CLASS_SPREAD = 9

/**
 * その代の出来。同じ学校・同じ入学年なら必ず同じ値になる。
 * 単位は選手の素質（`talentBonus`）と同じ。
 */
export function classBonus(school: RivalSchool, enrolledYear: number): number {
  // **ハッシュだけで出す。** 8000校を並べ替えるのに使うので、
  // 1件ごとに `createRng` を作ると一覧の描画で数百msかかる（実測374ms）
  let hash = (school.rosterSeed ^ Math.imul(enrolledYear + 1, 2654435761)) >>> 0
  hash = Math.imul(hash ^ (hash >>> 15), 2246822519)
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
  hash = (hash ^ (hash >>> 16)) >>> 0

  // 一様分布を2つ足して平均する（真ん中に寄せる。当たり外れは極端すぎないほうがいい）
  const a = (hash & 0xffff) / 0xffff
  const b = ((hash >>> 16) & 0xffff) / 0xffff
  return Math.round((a + b - 1) * CLASS_SPREAD)
}

/**
 * いま在籍している3代を均した「学校の実際の力」。
 *
 * `strength` だけで並べると、良い代を抱えて台頭している学校が
 * 一覧の下のほうに埋もれる（一覧に出す学校を戦力で絞っているため）。
 * 名簿を作らずに比べられる**安い指標**として使う。
 * 実測が要る場面では `lineupRatingOf` を使うこと。
 */
export function rosterPowerOf(school: RivalSchool, year: number): number {
  const classes = [year, year - 1, year - 2].map((enrolled) => classBonus(school, enrolled))
  return school.strength + classes.reduce((sum, value) => sum + value, 0) / classes.length
}

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
export function createRivals(
  rng: Rng,
  homeRegionId: RegionId,
  /** ゲームを始める年。注目選手の入学年を数えるのに使う */
  year = 1,
): RivalSchool[] {
  const schools: RivalSchool[] = []
  /**
   * 校名の重複避けは**県ごと**に行う。
   *
   * 全国でまとめて避けていた頃は、946校ぶんの名前を
   * 1426通りの組み合わせから引くことになり、後半で引き当てられなくなっていた。
   * 違う県に同じ校名があるのは現実にもあることなので、避ける必要が無い。
   */
  const namesByRegion = new Map<RegionId, string[]>()
  const playerNames: string[] = []

  const add = (id: string, regionId: RegionId, tradition: number, notable: boolean) => {
    // その県らしい地名を混ぜる。どこと戦っているのか実感が湧くように
    const names = namesByRegion.get(regionId) ?? []
    const name = makeSchoolName(rng, names, regionId)
    names.push(name)
    namesByRegion.set(regionId, names)
    schools.push({
      id,
      name,
      regionId,
      tradition,
      strength: tradition + rng.int(-DRIFT, DRIFT),
      trend: 0,
      ...(notable ? { notable: true, stars: createStars(rng, id, tradition, playerNames, year) } : {}),
      rosterSeed: rng.int(1, 2_000_000_000),
    })
  }

  /**
   * 県内は**参加校ぶん全部**作る。
   *
   * 10校しか無かった頃は、大会の相手をその10校から引くしかなく、
   * 「他の学校がどこまで勝ち上がったか」というトーナメント表そのものが
   * 作れなかった。名簿は種から作り直すので、
   * 1校あたりに保存するのは数値と名前だけで済む。
   */
  const localCount = findRegion(homeRegionId).schools

  // 地力の高い順に並べて作る。先頭の RIVALS_PER_REGION 校が注目校になる
  traditionsFor(rng, localCount).forEach((tradition, index) => {
    add(`rs${index + 1}`, homeRegionId, tradition, index < RIVALS_PER_REGION)
  })

  // 県外。自県以外のすべての地区に、序列を付けて複数校ずつ置く
  const elsewhere = shuffle(
    rng,
    REGIONS.filter((region) => region.id !== homeRegionId),
  )

  let serial = 0
  for (const region of elsewhere) {
    // **自県と同じ配り方にする。** 県ごとの厚みが揃っていないと、
    // 甲子園（各県の最上位）に出てくる顔ぶれの強さも歪む
    traditionsFor(rng, NATIONAL_SCHOOLS_PER_REGION).forEach((tradition, rank) => {
      serial++
      // 注目選手を抱えるのは各県の筆頭校だけ。
      // 全校に置くと、注目選手だけで名簿が数百人ぶんに膨らむ
      add(`rn${serial}`, region.id, tradition, rank === 0)
    })
  }

  return schools
}

/**
 * 1県ぶんの地力を、強い順に並べて返す。
 * 校数のピラミッドで配ったうえで、上位数校には下限を置く。
 */
function traditionsFor(rng: Rng, count: number): number[] {
  const list = Array.from({ length: count }, () => rollTradition(rng))

  list.sort((a, b) => b - a)
  TOP_SCHOOL_FLOORS.forEach((floor, index) => {
    if (index >= list.length) return
    list[index] = Math.max(list[index], rng.int(floor.min, floor.max))
  })

  // 下限を当てた結果、順番が入れ替わることがある
  return list.sort((a, b) => b - a)
}

/** 校数のピラミッドから地力を1つ引く */
function rollTradition(rng: Rng): number {
  const tier = rng.weighted(TRADITION_TIERS.map((t) => ({ value: t, weight: t.weight })))
  return rng.int(tier.min, tier.max)
}

/** 県内の学校。地区大会と地元の練習試合の相手 */
export function localRivals(schools: RivalSchool[], regionId: RegionId): RivalSchool[] {
  return schools.filter((school) => school.regionId === regionId)
}

/** 県外の学校。遠征の練習試合とU18の候補になる */
export function nationalRivals(schools: RivalSchool[], regionId: RegionId): RivalSchool[] {
  return schools.filter((school) => school.regionId !== regionId)
}

/**
 * 全国大会に出てくる顔ぶれ。**各県から1校ずつ。**
 *
 * 甲子園は各県1代表なので、
 * 県外の学校をそのまま並べると同じ県から何校も出てきてしまう。
 * その年いちばん戦力の高い学校をその県の代表とする
 * （戦力は毎年動くので、代表校も入れ替わる）。
 */
export function nationalRepresentatives(
  schools: RivalSchool[],
  homeRegionId: RegionId,
  /** その年。渡すと、良い代を抱えた学校が代表になれる */
  year?: number,
): RivalSchool[] {
  const best = new Map<RegionId, RivalSchool>()
  const power = (school: RivalSchool) =>
    year === undefined ? school.strength : rosterPowerOf(school, year)

  for (const school of schools) {
    if (school.regionId === homeRegionId) continue
    const current = best.get(school.regionId)
    if (!current || power(school) > power(current)) best.set(school.regionId, school)
  }
  return [...best.values()]
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
  year: number,
): RivalPlayer[] {
  const stars: RivalPlayer[] = []

  for (let i = 0; i < STARS_PER_SCHOOL; i++) {
    const grade = rng.pick<Grade>([1, 2, 3])
    // **入学年を必ず持たせる。** 持たせていなかった頃は
    // `starGrade` が学年を据え置き、開始時の3年生が
    // **何年経っても3年生のまま名簿に居座っていた**
    stars.push(
      makeStar(rng, `${schoolId}-${i}`, grade, tradition, takenNames, year - (grade - 1)),
    )
  }
  return stars
}

function makeStar(
  rng: Rng,
  id: string,
  grade: Grade,
  tradition: number,
  takenNames: string[],
  /** 入学年。分かっていれば渡す（学年を数えて卒業させるため） */
  enrolledYear?: number,
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
    ...(enrolledYear !== undefined ? { enrolledYear } : {}),
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
  const takenNames = starsOf(school).map((star) => star.name)
  const stars = starsOf(school)
    .filter((star) => star.grade < 3)
    .map((star) => ({
      ...star,
      grade: (star.grade + 1) as Grade,
      rating: clampRating(star.rating + rng.int(STAR_GROWTH_MIN, STAR_GROWTH_MAX)),
    }))

  // 抜けたぶんだけ新入生を迎える。
  // **スカウトで流れてきた選手が居る年は補充しない。**
  // 補充まですると注目選手が毎年増え続ける。
  // 注目校でない学校（県内の大多数）はそもそも注目選手を持たない
  while (school.notable && stars.length < STARS_PER_SCHOOL) {
    stars.push(
      makeStar(rng, `${school.id}-${year}-${stars.length}`, 1, school.tradition, takenNames, year),
    )
  }

  const updated: RivalSchool = { ...school, strength: next, trend, stars }

  return { school: updated, news: newsFor(updated, year) }
}

/**
 * はっきり動いた学校だけ報告する。全校ぶん出すと読めない。
 *
 * **県内は全校ぶんあるので、注目校に絞る。**
 * 178校を毎年見ていると、揺れ幅6以上の学校が数十校出てきて
 * 世代交代の画面が他校の話で埋まる。
 */
function newsFor(school: RivalSchool, year: number): string | null {
  if (!school.notable) return null
  if (school.trend >= 6) return `${school.name}が力をつけてきた`
  if (school.trend <= -6) return `${school.name}は主力が抜けて苦しそうだ`
  // **当たりの代が入ってきた学校は、3年かけて台頭する。**
  // 戦力の数字には出ないので、ここで知らせないと入れ替わりの理由が読めない
  if (classBonus(school, year) >= GOOD_CLASS_NEWS) return `${school.name}に有望な新入生が揃った`
  return null
}

/** この出来の代が入ってきたら報告する */
const GOOD_CLASS_NEWS = 6

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
    stars: [...starsOf(school), star],
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
  const record = recordOf(school)
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
    for (const star of starsOf(school)) best = Math.max(best, star.rating)
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
    .flatMap((school) => starsOf(school).map((star) => star.rating))
    .sort((a, b) => b - a)

  if (ratings.length === 0) return 0
  return ratings[Math.min(rank, ratings.length - 1)]
}

/** 上級生の注目選手だけを強い順に並べたときの `rank` 番目 */
export function upperStarRatingAtRank(schools: RivalSchool[], rank: number): number {
  const ratings = schools
    .flatMap((school) => starsOf(school).filter((star) => star.grade >= 2))
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
