/**
 * U18日本代表の名簿。
 *
 * **「うちから何人選ばれたか」だけの仕組みだった。**
 * 全国から30人が集まる場なのに、他の29人が誰なのか、
 * どの学校から来ているのか、どんなスタメンなのかが一切見えなかった。
 * 選ばれること自体の重みも、届かなかったときの悔しさも出てこない。
 *
 * ここでは**全国の学校から実際に30人を選び、名簿として残す**。
 *
 * 在籍している間は**種から作り直した今の選手**を引き当てるので、
 * 選考後に伸びた能力がそのまま名簿に出る（`rivalRoster`）。
 *
 * それとは別に、選考した時点の姿も写しておく。
 * 代表の3分の2は3年生で、年度が替わると学校の名簿から消えるうえ、
 * 注目選手（`RivalSchool.stars`）由来のメンバーは
 * 卒業と同時に種からも再現できなくなる。
 * 写しておかないと、次の選考までの半年以上、
 * **名簿の大半が名前だけの行**になってしまう。
 */

import { positionGroupOf } from '@/core/lineup/aptitude'
import type { PositionGroup } from '@/core/lineup/aptitude'
import type { Player } from '@/core/types/player'
import { isAvailable } from '@/core/types/player'
import type { RivalSchool } from '@/core/rival/rivals'
import { rivalRoster } from '@/core/rival/rivalRoster'
import { emptyCareerStats } from './careerStats'
import { playerPoints } from './rating'

/**
 * 代表に入った1人。**選手そのものは持たない。**
 *
 * 名前だけは写しておく。
 * 3年生は年度が替わると名簿から消えるので、
 * id しか持っていないと「誰だったのか」まで分からなくなる。
 */
export type U18Member = {
  /** 所属校のid。自校なら null */
  schoolId: string | null
  /** 選手のid */
  playerId: string
  /** 選考時の名前 */
  name: string
  /** 選考時の学年 */
  grade: number
  /**
   * 選考した時点の姿。
   * 在籍していれば今の選手を使うので、これは**卒業したあとの控え**。
   * 記録（`history` / `stats`）は落としてある（名簿には要らないうえ、嵩む）。
   */
  snapshot?: Player
}

/** ある年の代表名簿 */
export type U18Squad = {
  /** 選考した年（通算年） */
  year: number
  members: U18Member[]
}

/**
 * 代表の枠。**全国から30人。**
 *
 * 18にしていた頃は、比較の基準（何番目の選手か）としてしか使っていなかった。
 * 実際に名簿を作るようになったので、
 * ベンチ入りまで含めた実際の代表の規模に合わせてある。
 */
export const U18_SQUAD_SIZE = 30

/**
 * 1校から選ばれる上限。
 *
 * **2では、強い学校の下級生が構造的に締め出されていた。**
 * 3年生2人で枠が埋まるので、全国屈指の2年生を抱えていても呼ばれない。
 * 実際の代表も、その年の主力を出した学校からは3人選ばれることがある。
 */
export const U18_MAX_PER_SCHOOL = 3

/** 代表に選ばれるのは上級生だけ */
export const U18_MIN_GRADE = 2

/**
 * **ポジションごとの枠**（合計30人）。
 *
 * 評価点順に30人を切っていた頃は、
 * - 上位が野手で埋まって**投手が0人**の年があり（先に10人取ることで凌いでいた）
 * - 捕手が1人も居ない代表ができ
 * - 各校の上位2人しか候補に上がらないので、
 *   **3年生が2人いる学校の2年生は、どれだけ強くても候補にすら入らなかった**
 *
 * 実際の代表はポジションごとに人数を決めて選ぶ。
 * 系統ごとに枠を置くと、その系統でいちばん良い選手が素直に選ばれる。
 */
export const U18_QUOTA: Record<PositionGroup, number> = {
  pitcher: 10,
  catcher: 3,
  infield: 9,
  outfield: 8,
}

/**
 * 来年に向けて必ず入れる2年生の数。
 *
 * 枠を系統で分けても、同じ系統に3年生が並べば2年生は押し出される。
 * 実際の代表も、翌年の主力になる下級生を数人入れる。
 */
export const U18_MIN_SECOND_YEARS = 4

/**
 * 名簿を作る前に絞り込む学校数。
 *
 * **全校ぶんの名簿を作ると重い。** 県内だけで178校あり、
 * 1校15人なので2670人ぶんの生成になる。
 * 代表に届くのは各校の上位2人なので、
 * 学校の戦力から見込みを立てて上位だけを見れば結果は変わらない。
 */
const CANDIDATE_SCHOOLS = 60

/**
 * その学校から出てきうる最高の総合の見込み。
 *
 * 絞り込みにしか使わないので、当たっていなくても**順番が合っていればよい**。
 * 戦力の高い学校ほど良い選手が居る、という並びさえ守れれば十分。
 */
function ceilingOf(school: RivalSchool): number {
  return school.strength
}

/**
 * 代表を選ぶ。
 *
 * 全国の学校から実力順に、1校2人まで。自校の部員も同じ土俵で並べる。
 * **相対評価なので、周りが育てば基準も上がる。**
 *
 * **並べるのは総合ではなく評価点**（`playerPoints`）。
 * 加重平均で選んでいた頃は、どの能力もそこそこという万能型ばかりが集まり、
 * 代表名簿が同じ顔で埋まっていた。一芸に突き抜けた選手も選ばれるようにする。
 */
export function selectU18Squad(params: {
  schools: RivalSchool[]
  /** 自校の部員 */
  ourPlayers: Player[]
  year: number
  /** 年度の進み具合（0〜1）。他校の部員は年度が進むほど伸びている */
  progress?: number
  size?: number
}): U18Squad {
  const { schools, ourPlayers, year, progress, size = U18_SQUAD_SIZE } = params

  const pool: Candidate[] = []

  /**
   * 候補に挙げる。**系統ごとにその学校の最上位**を出す。
   *
   * 評価点上位2人で切っていた頃は、3年生の投手が2人いる学校の捕手は、
   * 全国屈指でも候補にすら入らなかった。
   * 1校から何人も選ばれないようにするのは**選ぶ側の仕事**（`U18_MAX_PER_SCHOOL`）で、
   * 候補を出す段階で絞ってしまうと、その学校のいちばん良い捕手が消える。
   */
  const addFrom = (schoolId: string | null, players: Player[]) => {
    const best = new Map<PositionGroup, Player[]>()

    for (const player of players) {
      if (!isAvailable(player) || player.grade < U18_MIN_GRADE) continue

      const group = positionGroupOf(player)
      const list = [...(best.get(group) ?? []), player]
        .sort((a, b) => playerPoints(b) - playerPoints(a))
        .slice(0, CANDIDATES_PER_GROUP)
      best.set(group, list)
    }

    for (const [group, list] of best) {
      for (const player of list) {
        pool.push({
          member: {
            schoolId,
            playerId: player.id,
            name: player.name,
            grade: player.grade,
            snapshot: { ...player, history: [], stats: emptyCareerStats() },
          },
          rating: playerPoints(player),
          group,
          grade: player.grade,
          schoolId,
        })
      }
    }
  }

/**
 * 1校・1系統から候補に出す人数。
 *
 * **1人に絞ると、層の厚い学校の2番手が消える。**
 * 同じ学校に全国屈指の外野手が2人いることはあるし、
 * 3年生が居るというだけで下級生が候補から外れるのも違う。
 */
const CANDIDATES_PER_GROUP = 2

  addFrom(null, ourPlayers)

  const candidates = [...schools]
    .sort((a, b) => ceilingOf(b) - ceilingOf(a))
    .slice(0, CANDIDATE_SCHOOLS)

  for (const school of candidates) {
    addFrom(school.id, rivalRoster(school, year, progress))
  }

  const ranked = [...pool].sort((a, b) => b.rating - a.rating)
  const chosen: Candidate[] = []
  const perSchool = new Map<string, number>()

  /** 1校2人までを守りながら加える。入れたら true */
  const take = (entry: Candidate): boolean => {
    if (chosen.includes(entry)) return false

    const key = entry.schoolId ?? 'ours'
    const used = perSchool.get(key) ?? 0
    if (used >= U18_MAX_PER_SCHOOL) return false

    chosen.push(entry)
    perSchool.set(key, used + 1)
    return true
  }

  // 1. 系統ごとの枠を埋める
  for (const group of Object.keys(U18_QUOTA) as PositionGroup[]) {
    let left = U18_QUOTA[group]
    for (const entry of ranked) {
      if (left <= 0) break
      if (entry.group === group && take(entry)) left--
    }
  }

  // 2. 枠が埋まらなかったぶん（その系統の候補が足りない年）は評価点順で埋める
  for (const entry of ranked) {
    if (chosen.length >= size) break
    take(entry)
  }

  /*
   * 3. 来年に向けて2年生を確保する。
   *
   * **人数を足すのではなく、入れ替える。** 足す形にすると
   * あとで人数を切り詰めるときに投手が落ちて、
   * せっかく系統ごとに取った枠が崩れる。
   * 同じ系統の中で、いちばん評価点の低い3年生と入れ替える。
   */
  let juniors = chosen.filter((entry) => entry.grade === U18_MIN_GRADE).length
  for (const entry of ranked) {
    if (juniors >= U18_MIN_SECOND_YEARS) break
    if (entry.grade !== U18_MIN_GRADE || chosen.includes(entry)) continue

    const key = entry.schoolId ?? 'ours'
    if ((perSchool.get(key) ?? 0) >= U18_MAX_PER_SCHOOL) continue

    // 同じ系統の、いちばん評価点の低い3年生
    const weakest = chosen
      .filter((item) => item.group === entry.group && item.grade > U18_MIN_GRADE)
      .sort((a, b) => a.rating - b.rating)[0]
    if (!weakest) continue

    const droppedKey = weakest.schoolId ?? 'ours'
    perSchool.set(droppedKey, Math.max(0, (perSchool.get(droppedKey) ?? 1) - 1))
    chosen.splice(chosen.indexOf(weakest), 1)

    chosen.push(entry)
    perSchool.set(key, (perSchool.get(key) ?? 0) + 1)
    juniors++
  }

  const members = chosen.sort((a, b) => b.rating - a.rating).map((entry) => entry.member)

  return { year, members }
}

/** 選考の途中で持ち回る1人 */
type Candidate = {
  member: U18Member
  rating: number
  group: PositionGroup
  grade: number
  schoolId: string | null
}

/** 名簿の1人を、いまの選手として引き当てたもの */
export type U18Entry = {
  member: U18Member
  /**
   * いまの選手。**卒業していても、選考時の姿を返す。**
   * 見つからなければ null（自校の卒業生など）。
   */
  player: Player | null
  /** すでに卒業しているか */
  graduated: boolean
  /** 所属校の名前 */
  schoolName: string
  /** 自校の選手か */
  ours: boolean
}

/**
 * 名簿を今の選手に引き当てる。
 *
 * **保存しているのは id だけ**なので、能力は毎回引き直す。
 * そのぶん、選考のあとに伸びたぶんがそのまま名簿に出る。
 *
 * 3年生は年度が替わると学校から居なくなるが、
 * そのときは**選考した年の名簿から引き直して、当時の姿を出す**。
 * 代表の3分の2は3年生なので、
 * 4月を過ぎた途端に名簿の大半が空欄になるのでは読む意味が無い。
 */
export function resolveU18Squad(
  squad: U18Squad,
  context: {
    schools: RivalSchool[]
    ourPlayers: Player[]
    ourSchoolName: string
    /** いまの年。ここで名簿を作り直すので、進級と成長が反映される */
    year: number
    /** 年度の進み具合（0〜1）。年度の途中で伸びたぶんも反映される */
    progress?: number
  },
): U18Entry[] {
  const { schools, ourPlayers, ourSchoolName, year, progress } = context
  const rosters = new Map<string, Player[]>()

  /** その年の名簿を1回だけ作る */
  const rosterOf = (school: RivalSchool, at: number): Player[] => {
    const key = `${school.id}@${at}`
    const cached = rosters.get(key)
    if (cached) return cached
    // 当時の名簿を引き直すときは、年度末の姿（選考後の伸びを含む）で見る
    const roster = rivalRoster(school, at, at === year ? progress : undefined)
    rosters.set(key, roster)
    return roster
  }

  return squad.members.map((member): U18Entry => {
    if (member.schoolId === null) {
      const player = ourPlayers.find((item) => item.id === member.playerId)
      return {
        member,
        player: player ?? member.snapshot ?? null,
        graduated: player === undefined,
        schoolName: ourSchoolName,
        ours: true,
      }
    }

    const school = schools.find((item) => item.id === member.schoolId)
    if (!school) {
      return { member, player: null, graduated: true, schoolName: '（不明）', ours: false }
    }

    const now = rosterOf(school, year).find((player) => player.id === member.playerId)
    if (now) {
      return { member, player: now, graduated: false, schoolName: school.name, ours: false }
    }

    // 卒業していれば、選考した時点の姿を出す
    return {
      member,
      player: member.snapshot ?? null,
      graduated: true,
      schoolName: school.name,
      ours: false,
    }
  })
}

/** 名簿のうち、いま在籍している選手だけ */
export function activeU18Players(entries: U18Entry[]): Player[] {
  return entries
    .filter((entry) => !entry.graduated)
    .map((entry) => entry.player)
    .filter((player): player is Player => player !== null)
}

/** 名簿に載っている選手（卒業していても、当時の姿を返す） */
export function u18Players(entries: U18Entry[]): Player[] {
  return entries
    .map((entry) => entry.player)
    .filter((player): player is Player => player !== null)
}

/** 自校から選ばれた選手 */
export function ourU18Players(squad: U18Squad, ourPlayers: Player[]): Player[] {
  const ids = new Set(
    squad.members.filter((member) => member.schoolId === null).map((member) => member.playerId),
  )
  return ourPlayers.filter((player) => ids.has(player.id))
}
