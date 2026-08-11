/**
 * マネージャー。
 *
 * **買うものではなく、入部してくるもの。**
 * 部費で雇えた頃は「部費が貯まったら必ず雇う」で判断が消えていたうえ、
 * 部員でありながら金で手に入るのが高校野球として筋が通らなかった。
 *
 * 3年に1人くらいの確率で1年生として入部し、3年間在籍して卒業する。
 * あくまで確率なので、5人揃う年もあれば誰もいない年もある。
 *
 * 役割は重複しない。同じ役割が2人いても効果が二重にかかるだけで
 * 面白くならないので、まだ空いている役割から選ぶ。
 */

import type { Rng } from '@/core/rng/random'
import { pickFemaleName } from '@/core/player/createPlayer'
import type { Grade } from '@/core/types/player'

export type ManagerRoleId = 'recorder' | 'trainer' | 'nutritionist' | 'analyst' | 'chief'

export type ManagerRole = {
  id: ManagerRoleId
  /** 役割の名前（記録係など） */
  label: string
  description: string
}

/** 在籍しているマネージャー1人。部員と同じく学年を持ち、3年で卒業する */
export type TeamManager = {
  /** 個体id。役割idとは別 */
  id: string
  /** 人名 */
  name: string
  roleId: ManagerRoleId
  grade: Grade
  /** 入部した年（通算年数） */
  joinedYear: number
  /**
   * 能力 1〜100。**役割の効きがこれに比例する。**
   * 全員が同じ効果だと、入部してくるのが誰でも同じで
   * 「良いマネージャーが来た」という手応えが出ない。
   * 古いセーブには無いので省略可（`managerPower` が既定値を使う）。
   */
  ability?: number
}

/** マネージャーの能力の振れ幅。部員の素質と同じく個人差を持たせる */
const ABILITY_MIN = 25
const ABILITY_MAX = 90

/** 能力が分からないときの既定値（古いセーブ用） */
const DEFAULT_ABILITY = 50

/**
 * その役割の効き具合。
 * 能力50でちょうど1.0、25で0.75、90で1.4。
 * 0にはしない（居るのに何も起きないのでは、入部した意味が無い）。
 */
export function managerPower(manager: TeamManager): number {
  return 0.5 + (manager.ability ?? DEFAULT_ABILITY) / 100
}

/** その役割のマネージャーの効き具合。居なければ0 */
function powerOf(managers: TeamManager[], roleId: ManagerRoleId): number {
  const found = managers.find((manager) => manager.roleId === roleId)
  return found ? managerPower(found) : 0
}

export const MANAGER_ROLES: ManagerRole[] = [
  {
    id: 'recorder',
    label: '記録係',
    description: '練習の成長量が8%上がる',
  },
  {
    id: 'trainer',
    label: 'トレーナー',
    description: '月が変わるときの体力回復が15増える',
  },
  {
    id: 'nutritionist',
    label: '栄養士',
    description: '練習での体力消費が25%減る',
  },
  {
    id: 'analyst',
    label: '分析担当',
    description: '試合での守備力が上がる',
  },
  {
    id: 'chief',
    label: '主務',
    description: '毎月の部費が30%増える',
  },
]

const ROLE_BY_ID = new Map(MANAGER_ROLES.map((role) => [role.id, role]))

export function findManagerRole(id: string): ManagerRole | undefined {
  return ROLE_BY_ID.get(id as ManagerRoleId)
}

/**
 * 1年に1人入部してくる確率。
 *
 * 「3年に1人くらい」なので1/3。3年間在籍するので、
 * 平均すると常に1人いる計算になる。
 * 3年連続で外れる確率が約30%あり、「今年もいない」が普通に起きる。
 */
export const MANAGER_JOIN_CHANCE = 1 / 3

/** その役割のマネージャーが在籍しているか */
export function hasManagerRole(managers: TeamManager[], roleId: ManagerRoleId): boolean {
  return managers.some((manager) => manager.roleId === roleId)
}

/**
 * 新年度にマネージャーが入部してくるかを判定する。
 * 入部しなければ null。全部の役割が埋まっていても null。
 */
export function rollManagerJoin(
  rng: Rng,
  params: {
    managers: TeamManager[]
    /** 新しい年（この年の4月が始まる） */
    year: number
    /** id の採番に使う通し番号 */
    serial: number
    /** すでに使われている名前。部員と被らないようにする */
    takenNames: readonly string[]
  },
): { manager: TeamManager; serial: number } | null {
  if (!rng.chance(MANAGER_JOIN_CHANCE)) return null

  const vacant = MANAGER_ROLES.filter((role) => !hasManagerRole(params.managers, role.id))
  if (vacant.length === 0) return null

  const role = rng.pick(vacant)
  return {
    manager: {
      id: `manager-${params.serial}`,
      // **マネージャーは女子**。男子の名簿から引くと「翔太」になっていた
      name: pickFemaleName(rng, params.takenNames),
      roleId: role.id,
      grade: 1,
      joinedYear: params.year,
      ability: rng.int(ABILITY_MIN, ABILITY_MAX),
    },
    serial: params.serial + 1,
  }
}

export type ManagerSeasonChange = {
  managers: TeamManager[]
  /** 卒業したマネージャー */
  graduated: TeamManager[]
  /** 入部したマネージャー。いなければ null */
  joined: TeamManager | null
  serial: number
}

/**
 * 年度が変わるときのマネージャーの入れ替え。
 * 3年生を送り出してから、入部の判定を行う。
 */
export function advanceManagers(
  rng: Rng,
  params: {
    managers: TeamManager[]
    year: number
    serial: number
    takenNames: readonly string[]
  },
): ManagerSeasonChange {
  const graduated = params.managers.filter((manager) => manager.grade >= 3)
  const promoted = params.managers
    .filter((manager) => manager.grade < 3)
    .map((manager) => ({ ...manager, grade: (manager.grade + 1) as Grade }))

  const join = rollManagerJoin(rng, {
    managers: promoted,
    year: params.year,
    serial: params.serial,
    takenNames: params.takenNames,
  })

  return {
    managers: join ? [...promoted, join.manager] : promoted,
    graduated,
    joined: join?.manager ?? null,
    serial: join?.serial ?? params.serial,
  }
}

// ── 在籍しているマネージャーによる効果 ────────────────────
// 役割は重複しないので、その役割の1人を見ればよい。
// 効き具合は本人の能力に比例する（`managerPower`）

/** 練習の成長量の倍率 */
export function managerGrowthBonus(managers: TeamManager[]): number {
  return 1 + 0.08 * powerOf(managers, 'recorder')
}

/** 練習での体力消費の倍率 */
export function managerConditionCost(managers: TeamManager[]): number {
  return 1 - 0.25 * powerOf(managers, 'nutritionist')
}

/** 月替わりの体力回復の上乗せ */
export function managerRecovery(managers: TeamManager[]): number {
  return Math.round(15 * powerOf(managers, 'trainer'))
}

/** 試合での守備力の上乗せ */
export function managerDefenseBonus(managers: TeamManager[]): number {
  return Math.round(8 * powerOf(managers, 'analyst'))
}

/** 毎月の部費収入の倍率 */
export function managerFundsRate(managers: TeamManager[]): number {
  return 1 + 0.3 * powerOf(managers, 'chief')
}

/** 役割の説明に、その人の効き具合を当てはめた一文 */
export function managerEffectText(manager: TeamManager): string {
  const power = managerPower(manager)
  switch (manager.roleId) {
    case 'recorder':
      return `練習の成長量が${(8 * power).toFixed(0)}%上がる`
    case 'trainer':
      return `月が変わるときの体力回復が${Math.round(15 * power)}増える`
    case 'nutritionist':
      return `練習での体力消費が${(25 * power).toFixed(0)}%減る`
    case 'analyst':
      return `試合での守備力が${Math.round(8 * power)}上がる`
    case 'chief':
      return `毎月の部費が${(30 * power).toFixed(0)}%増える`
  }
}
