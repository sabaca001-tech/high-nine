/**
 * 1年を日単位で扱うためのカレンダー。
 *
 * 盤面は1年で1本。**1マスは3日**で、1年は122マス。
 * 月ごとにゴールを置くのをやめ、月は「何日目か」から導く。
 *
 * 1マス＝1日（365マス）にしていた時期があったが、
 * それだとカードの数字が3〜12という大きな値になり、
 * 「いくつ進むのか」が直感的に読めなかった。
 * 1マス3日にすると**カードは1〜5**で済み、
 * 1年の手数（＝練習の回数）もほぼ変わらない。
 *
 * 閏年は扱わない。1年は常に365日で、4月1日から始まる。
 */

import type { Month } from '@/core/types/game'

/** 1年の日数 */
export const DAYS_IN_YEAR = 365

/**
 * 1マスが表す日数。
 * **ここを変えるとカードの数字と1年の手数が同時に動く。**
 * 変えたら必ず seasonBalance.test.ts を回すこと。
 */
export const DAYS_PER_CELL = 3

/** 盤面のマス数 */
export const CELLS_IN_YEAR = Math.ceil(DAYS_IN_YEAR / DAYS_PER_CELL)

/** 年度の開始月 */
export const SEASON_START_MONTH: Month = 4

/** 4月から順に並べた各月の日数 */
const MONTH_LENGTHS: { month: Month; days: number }[] = [
  { month: 4, days: 30 },
  { month: 5, days: 31 },
  { month: 6, days: 30 },
  { month: 7, days: 31 },
  { month: 8, days: 31 },
  { month: 9, days: 30 },
  { month: 10, days: 31 },
  { month: 11, days: 30 },
  { month: 12, days: 31 },
  { month: 1, days: 31 },
  { month: 2, days: 28 },
  { month: 3, days: 31 },
]

/** 各月の初日が「年度の何日目か」（0始まり） */
const MONTH_START: { month: Month; start: number; days: number }[] = (() => {
  let start = 0
  return MONTH_LENGTHS.map((entry) => {
    const row = { month: entry.month, start, days: entry.days }
    start += entry.days
    return row
  })
})()

/** 日付インデックスを 0〜364 に収める */
function clampDay(day: number): number {
  return Math.min(DAYS_IN_YEAR - 1, Math.max(0, Math.floor(day)))
}

/** マスの番号 → 年度の何日目か */
export function dayOfCell(cell: number): number {
  return clampDay(Math.max(0, Math.floor(cell)) * DAYS_PER_CELL)
}

/** 年度の何日目か → マスの番号 */
export function cellOfDay(day: number): number {
  return Math.min(CELLS_IN_YEAR - 1, Math.floor(clampDay(day) / DAYS_PER_CELL))
}

/** 年度の何日目か → 月 */
export function monthOfDay(day: number): Month {
  const target = clampDay(day)
  for (let i = MONTH_START.length - 1; i >= 0; i--) {
    if (target >= MONTH_START[i].start) return MONTH_START[i].month
  }
  return SEASON_START_MONTH
}

/** 年度の何日目か → その月の何日か（1始まり） */
export function dateOfDay(day: number): number {
  const target = clampDay(day)
  for (let i = MONTH_START.length - 1; i >= 0; i--) {
    if (target >= MONTH_START[i].start) return target - MONTH_START[i].start + 1
  }
  return 1
}

/** その月の初日が年度の何日目か */
export function firstDayOfMonth(month: Month): number {
  return MONTH_START.find((entry) => entry.month === month)?.start ?? 0
}

/** その月の日数 */
export function daysInMonth(month: Month): number {
  return MONTH_START.find((entry) => entry.month === month)?.days ?? 30
}

/**
 * 指定した月の指定日が年度の何日目か。
 * 大会マスを「7月15日」のように置くために使う。
 */
export function dayOf(month: Month, date: number): number {
  return clampDay(firstDayOfMonth(month) + Math.max(1, date) - 1)
}

/** 表示用（「7月15日」） */
export function formatDay(day: number): string {
  return `${monthOfDay(day)}月${dateOfDay(day)}日`
}

/**
 * from の翌日から to までの間に月が変わった回数ぶん、変わったあとの月を返す。
 *
 * カードで数日まとめて進むと月をまたぐことがある。
 * またいだ月の処理（部費の支給・体力回復・固定イベント）を
 * **取りこぼさない**ために、またいだ月をすべて列挙する。
 */
export function monthsCrossed(from: number, to: number): Month[] {
  const crossed: Month[] = []
  for (let day = clampDay(from) + 1; day <= clampDay(to); day++) {
    if (dateOfDay(day) === 1) crossed.push(monthOfDay(day))
  }
  return crossed
}
