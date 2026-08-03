import { describe, expect, it } from 'vitest'
import type { Month } from '@/core/types/game'
import {
  DAYS_IN_YEAR,
  dateOfDay,
  dayOf,
  daysInMonth,
  firstDayOfMonth,
  monthOfDay,
  monthsCrossed,
} from './days'

const ORDER: Month[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]

describe('カレンダー', () => {
  it('1年は365日で、月の日数の合計と一致する', () => {
    const total = ORDER.reduce((sum, month) => sum + daysInMonth(month), 0)
    expect(total).toBe(DAYS_IN_YEAR)
  })

  it('0日目は4月1日、最終日は3月31日', () => {
    expect(monthOfDay(0)).toBe(4)
    expect(dateOfDay(0)).toBe(1)
    expect(monthOfDay(DAYS_IN_YEAR - 1)).toBe(3)
    expect(dateOfDay(DAYS_IN_YEAR - 1)).toBe(31)
  })

  it('月は4月から3月の順に並ぶ', () => {
    let previous = -1
    for (const month of ORDER) {
      const start = firstDayOfMonth(month)
      expect(start).toBeGreaterThan(previous)
      expect(monthOfDay(start)).toBe(month)
      expect(dateOfDay(start)).toBe(1)
      previous = start
    }
  })

  it('全ての日で月と日が矛盾しない', () => {
    for (let day = 0; day < DAYS_IN_YEAR; day++) {
      const month = monthOfDay(day)
      const date = dateOfDay(day)
      expect(date).toBeGreaterThanOrEqual(1)
      expect(date).toBeLessThanOrEqual(daysInMonth(month))
      expect(dayOf(month, date)).toBe(day)
    }
  })

  it('範囲外の日付は端に丸められる', () => {
    expect(monthOfDay(-5)).toBe(4)
    expect(monthOfDay(DAYS_IN_YEAR + 100)).toBe(3)
  })

  describe('monthsCrossed', () => {
    it('同じ月の中を進んでも月は変わらない', () => {
      expect(monthsCrossed(0, 5)).toEqual([])
    })

    it('月をまたぐと、またいだ先の月を返す', () => {
      // 4月30日（day 29）から5月1日（day 30）へ
      expect(monthsCrossed(29, 30)).toEqual([5])
    })

    it('2ヶ月ぶんまたいだら2つ返す（取りこぼさない）', () => {
      const from = dayOf(4, 29)
      const to = dayOf(6, 2)
      expect(monthsCrossed(from, to)).toEqual([5, 6])
    })

    it('1年を通すと12ヶ月ぶんの月初を数える（4月1日は起点なので除く）', () => {
      expect(monthsCrossed(0, DAYS_IN_YEAR - 1)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3])
    })
  })
})
