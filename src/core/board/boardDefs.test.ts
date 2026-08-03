import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { DAYS_IN_YEAR, dayOf, monthOfDay } from '@/core/calendar/days'
import {
  addTournamentCell,
  BOARD_LENGTH,
  clearTournamentCell,
  createBoard,
  dayOfTournament,
  forcedStopBetween,
  GOAL_INDEX,
} from './boardDefs'

describe('createBoard', () => {
  it('1年ぶん（365マス）で、初日は空きマス・最終日は年度末', () => {
    const board = createBoard(createRng(1))

    expect(board).toHaveLength(BOARD_LENGTH)
    expect(BOARD_LENGTH).toBe(DAYS_IN_YEAR)
    expect(board[0].kind).toBe('blank')
    expect(board[GOAL_INDEX].kind).toBe('goal')
  })

  it('index が通算日と一致する', () => {
    const board = createBoard(createRng(2))
    board.forEach((cell, index) => expect(cell.index).toBe(index))
  })

  it('夏の地区大会・秋季大会・冬合宿は最初から置かれている', () => {
    const board = createBoard(createRng(3))

    const summer = board[dayOfTournament('summerPref')]
    expect(summer.kind).toBe('tournament')
    expect(summer.tournamentKind).toBe('summerPref')
    expect(monthOfDay(summer.index)).toBe(7)

    expect(board[dayOfTournament('autumnPref')].tournamentKind).toBe('autumnPref')
    expect(board.some((cell) => cell.kind === 'camp')).toBe(true)
  })

  it('全国大会は出場権があるときだけ置かれる', () => {
    const without = createBoard(createRng(4))
    const withBerth = createBoard(createRng(4), { nationals: true, spring: true })

    expect(without[dayOfTournament('nationals')].kind).not.toBe('tournament')
    expect(withBerth[dayOfTournament('nationals')].tournamentKind).toBe('nationals')
    expect(withBerth[dayOfTournament('springNationals')].tournamentKind).toBe('springNationals')
  })

  it('同じシードなら同じ盤面になる', () => {
    expect(createBoard(createRng(9))).toEqual(createBoard(createRng(9)))
  })
})

describe('forcedStopBetween', () => {
  const board = createBoard(createRng(5))
  const summerDay = dayOfTournament('summerPref')

  it('途中に大会があれば、その手前ではなく大会の日を返す', () => {
    expect(forcedStopBetween(board, summerDay - 5, summerDay + 5)).toBe(summerDay)
  })

  it('大会をまたがなければ null', () => {
    expect(forcedStopBetween(board, 0, 10)).toBeNull()
  })

  it('今いるマス自体は対象にしない（大会マスから動けなくなるのを防ぐ）', () => {
    expect(forcedStopBetween(board, summerDay, summerDay + 3)).toBeNull()
  })

  it('大会がちょうど着地点でも止まる', () => {
    expect(forcedStopBetween(board, summerDay - 3, summerDay)).toBe(summerDay)
  })
})

describe('大会マスの出し入れ', () => {
  it('出場権を得ると、まだ来ていない日に大会マスが立つ', () => {
    const board = createBoard(createRng(6))
    const day = dayOfTournament('nationals')
    const updated = addTournamentCell(board, 'nationals', day - 30)

    expect(updated[day].kind).toBe('tournament')
    expect(updated[day].tournamentKind).toBe('nationals')
  })

  it('すでに過ぎた日には立てない', () => {
    const board = createBoard(createRng(7))
    const day = dayOfTournament('nationals')
    const updated = addTournamentCell(board, 'nationals', day + 1)

    expect(updated[day].kind).not.toBe('tournament')
  })

  it('敗退するとマスが普通のマスに戻り、先へ進めるようになる', () => {
    const board = createBoard(createRng(8))
    const day = dayOfTournament('summerPref')
    const cleared = clearTournamentCell(board, day)

    expect(cleared[day].kind).toBe('blank')
    // 同じ日から動き出せる
    expect(forcedStopBetween(cleared, day - 5, day + 5)).toBeNull()
  })
})

describe('大会の日程', () => {
  it('実際の高校野球の順に並んでいる', () => {
    expect(dayOfTournament('summerPref')).toBeLessThan(dayOfTournament('nationals'))
    expect(dayOfTournament('nationals')).toBeLessThan(dayOfTournament('autumnPref'))
    expect(dayOfTournament('autumnPref')).toBeLessThan(dayOfTournament('springNationals'))
  })

  it('春の全国大会は年度末より前にある（消化できずに年が終わらない）', () => {
    expect(dayOfTournament('springNationals')).toBeLessThan(GOAL_INDEX)
    expect(monthOfDay(dayOfTournament('springNationals'))).toBe(3)
  })

  it('冬合宿は12月にある', () => {
    const board = createBoard(createRng(10))
    const camp = board.find((cell) => cell.kind === 'camp')
    expect(camp).toBeDefined()
    expect(monthOfDay(camp!.index)).toBe(12)
    expect(camp!.index).toBe(dayOf(12, 26))
  })
})
