import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import {
  CELLS_IN_YEAR,
  cellOfDay,
  dayOf,
  dayOfCell,
  DAYS_PER_CELL,
  monthOfDay,
} from '@/core/calendar/days'
import {
  BOARD_LENGTH,
  cellOfTournament,
  clearTournamentCells,
  createBoard,
  dayOfTournament,
  forcedStopBetween,
  GOAL_INDEX,
  placeSeasonTournaments,
  placeTournamentCells,
  ROUND_GAP,
} from './boardDefs'

describe('createBoard', () => {
  it('1年ぶんのマスがあり、初日は空きマス・最終マスは年度末', () => {
    const board = createBoard(createRng(1))

    expect(board).toHaveLength(BOARD_LENGTH)
    expect(BOARD_LENGTH).toBe(CELLS_IN_YEAR)
    expect(board[0].kind).toBe('blank')
    expect(board[GOAL_INDEX].kind).toBe('goal')
  })

  it('index がマスの番号と一致する', () => {
    const board = createBoard(createRng(2))
    board.forEach((cell, index) => expect(cell.index).toBe(index))
  })

  it('1マスは3日ぶん。最後のマスでも年度内に収まる', () => {
    expect(DAYS_PER_CELL).toBe(3)
    expect(dayOfCell(GOAL_INDEX)).toBeLessThan(365)
    expect(cellOfDay(dayOfCell(5))).toBe(5)
  })

  it('大会マスはここでは置かない（回戦数が地区で変わるため）', () => {
    const board = createBoard(createRng(3))
    expect(board.some((cell) => cell.kind === 'tournament')).toBe(false)
    // 合宿だけは日程が固定なので置かれている
    expect(board.some((cell) => cell.kind === 'camp')).toBe(true)
  })

  it('同じシードなら同じ盤面になる', () => {
    expect(createBoard(createRng(9))).toEqual(createBoard(createRng(9)))
  })
})

describe('大会を回戦ごとのマスに置く', () => {
  const base = createBoard(createRng(20))

  it('回戦の数だけマスが並ぶ', () => {
    const board = placeTournamentCells(base, 'summerPref', -1, 5)
    const cells = board.filter((cell) => cell.tournamentKind === 'summerPref')

    expect(cells).toHaveLength(5)
    expect(cells.map((cell) => cell.round)).toEqual([1, 2, 3, 4, 5])
  })

  it('1回戦は日程どおりの位置に立つ', () => {
    const board = placeTournamentCells(base, 'summerPref', -1, 3)
    const first = board.find((cell) => cell.round === 1)!

    expect(first.index).toBe(cellOfTournament('summerPref'))
    expect(monthOfDay(dayOfCell(first.index))).toBe(7)
  })

  it('回戦の間隔ぶんずつ後ろへ置かれる', () => {
    const board = placeTournamentCells(base, 'summerPref', -1, 4)
    const cells = board.filter((cell) => cell.tournamentKind === 'summerPref')

    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].index - cells[i - 1].index).toBe(ROUND_GAP)
    }
  })

  it('すでに通り過ぎた位置には置かない', () => {
    const start = cellOfTournament('summerPref')
    const board = placeTournamentCells(base, 'summerPref', start + 1, 4)
    const cells = board.filter((cell) => cell.tournamentKind === 'summerPref')

    expect(cells.every((cell) => cell.index > start + 1)).toBe(true)
  })

  it('年度末より先には置かない（消化できない回戦を作らない）', () => {
    const board = placeTournamentCells(base, 'springNationals', -1, 20)
    const cells = board.filter((cell) => cell.tournamentKind === 'springNationals')

    expect(cells.every((cell) => cell.index < GOAL_INDEX)).toBe(true)
  })

  it('敗退するとその大会のマスがすべて普通のマスに戻る', () => {
    const board = placeTournamentCells(base, 'summerPref', -1, 5)
    const cleared = clearTournamentCells(board, 'summerPref')

    expect(cleared.some((cell) => cell.tournamentKind === 'summerPref')).toBe(false)
    // 同じ位置から動き出せる
    const start = cellOfTournament('summerPref')
    expect(forcedStopBetween(cleared, start - 2, start + 2)).toBeNull()
  })

  it('別の大会のマスは消さない', () => {
    let board = placeTournamentCells(base, 'summerPref', -1, 3)
    board = placeTournamentCells(board, 'autumnPref', -1, 3)
    const cleared = clearTournamentCells(board, 'summerPref')

    expect(cleared.filter((cell) => cell.tournamentKind === 'autumnPref')).toHaveLength(3)
  })
})

describe('placeSeasonTournaments', () => {
  it('夏の地区大会と秋季大会をまとめて置く', () => {
    const board = placeSeasonTournaments(createBoard(createRng(21)), {
      summerPref: 6,
      autumnPref: 4,
    })

    expect(board.filter((cell) => cell.tournamentKind === 'summerPref')).toHaveLength(6)
    expect(board.filter((cell) => cell.tournamentKind === 'autumnPref')).toHaveLength(4)
    // 全国大会は出場権を得てから置かれる
    expect(board.some((cell) => cell.tournamentKind === 'nationals')).toBe(false)
  })

  it('夏の大会が最大の回戦数でも全国大会の日程を侵さない', () => {
    // 神奈川（178校）で8回戦。全国大会は8月12日
    const board = placeSeasonTournaments(createBoard(createRng(22)), {
      summerPref: 8,
      autumnPref: 6,
    })
    const last = board.filter((cell) => cell.tournamentKind === 'summerPref').at(-1)!

    expect(last.index).toBeLessThan(cellOfTournament('nationals'))
  })
})

describe('forcedStopBetween', () => {
  const board = placeTournamentCells(createBoard(createRng(5)), 'summerPref', -1, 5)
  const start = cellOfTournament('summerPref')

  it('途中に大会があれば、その位置を返す', () => {
    expect(forcedStopBetween(board, start - 3, start + 3)).toBe(start)
  })

  it('大会をまたがなければ null', () => {
    expect(forcedStopBetween(board, 0, 4)).toBeNull()
  })

  it('今いるマス自体は対象にしない（大会マスから動けなくなるのを防ぐ）', () => {
    // 次の回戦のマスで止まる
    expect(forcedStopBetween(board, start, start + 3)).toBe(start + ROUND_GAP)
  })
})

describe('大会の日程', () => {
  it('実際の高校野球の順に並んでいる', () => {
    expect(dayOfTournament('summerPref')).toBeLessThan(dayOfTournament('nationals'))
    expect(dayOfTournament('nationals')).toBeLessThan(dayOfTournament('autumnPref'))
    expect(dayOfTournament('autumnPref')).toBeLessThan(dayOfTournament('springNationals'))
  })

  it('春の全国大会は、回戦を消化しても年度末に間に合う', () => {
    const board = placeTournamentCells(createBoard(createRng(11)), 'springNationals', -1, 5)
    const cells = board.filter((cell) => cell.tournamentKind === 'springNationals')

    expect(cells).toHaveLength(5)
    expect(cells.at(-1)!.index).toBeLessThan(GOAL_INDEX)
    expect(monthOfDay(dayOfTournament('springNationals'))).toBe(3)
  })

  it('冬合宿は12月にある', () => {
    const board = createBoard(createRng(10))
    const camp = board.find((cell) => cell.kind === 'camp')!

    expect(monthOfDay(dayOfCell(camp.index))).toBe(12)
    expect(camp.index).toBe(cellOfDay(dayOf(12, 26)))
  })
})
