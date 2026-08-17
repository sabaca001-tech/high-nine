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

/** 1校から選ばれる上限。1校から何人も選ばれるのは不自然 */
export const U18_MAX_PER_SCHOOL = 2

/** 代表に選ばれるのは上級生だけ */
export const U18_MIN_GRADE = 2

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

  const pool: { member: U18Member; rating: number }[] = []

  const addFrom = (schoolId: string | null, players: Player[]) => {
    const picked = players
      .filter((player) => isAvailable(player) && player.grade >= U18_MIN_GRADE)
      .sort((a, b) => playerPoints(b) - playerPoints(a))
      .slice(0, U18_MAX_PER_SCHOOL)

    for (const player of picked) {
      pool.push({
        member: {
          schoolId,
          playerId: player.id,
          name: player.name,
          grade: player.grade,
          snapshot: { ...player, history: [], stats: emptyCareerStats() },
        },
        rating: playerPoints(player),
      })
    }
  }

  addFrom(null, ourPlayers)

  const candidates = [...schools]
    .sort((a, b) => ceilingOf(b) - ceilingOf(a))
    .slice(0, CANDIDATE_SCHOOLS)

  for (const school of candidates) {
    addFrom(school.id, rivalRoster(school, year, progress))
  }

  const members = pool
    .sort((a, b) => b.rating - a.rating)
    .slice(0, size)
    .map((entry) => entry.member)

  return { year, members }
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
