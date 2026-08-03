/**
 * 盤面の生成。
 *
 * **1マス＝1日、盤面は1年で1本**（365マス）。
 * 月ごとにゴールを置くのをやめたので、4月1日から3月31日まで
 * 途切れずに1本の道が続く。大会や合宿はその日付のマスとして置かれ、
 * 通り過ぎることはできない（必ず止まる）。
 */

import type { Rng } from '@/core/rng/random'
import { DAYS_IN_YEAR, dayOf, monthOfDay } from '@/core/calendar/days'
import type { BoardCell, CellKind } from '@/core/types/board'
import type { TournamentKind } from '@/core/types/tournament'

/** 盤面のマス数＝1年の日数 */
export const BOARD_LENGTH = DAYS_IN_YEAR

/** 年度末（3月31日）の位置 */
export const GOAL_INDEX = BOARD_LENGTH - 1

/**
 * 大会と合宿の開催日。
 *
 * 実際の高校野球の日程に寄せてある。全国大会は出場権を得たときだけ
 * 盤面に置かれるので、ここでは「置くならこの日」を決めているだけ。
 */
export const EVENT_DAYS: { day: number; kind: 'tournament' | 'camp'; tournamentKind?: TournamentKind }[] = [
  { day: dayOf(7, 15), kind: 'tournament', tournamentKind: 'summerPref' },
  { day: dayOf(8, 12), kind: 'tournament', tournamentKind: 'nationals' },
  { day: dayOf(10, 15), kind: 'tournament', tournamentKind: 'autumnPref' },
  { day: dayOf(12, 26), kind: 'camp' },
  { day: dayOf(3, 22), kind: 'tournament', tournamentKind: 'springNationals' },
]

/** その大会マスが置かれる日 */
export function dayOfTournament(kind: TournamentKind): number {
  return EVENT_DAYS.find((entry) => entry.tournamentKind === kind)?.day ?? 0
}

/**
 * マスの出現重み。
 * 練習マスを最頻にして成長が主軸であることを伝えつつ、
 * 特訓・OBのような「当たり」を低確率で混ぜて、どのマスに止めるかの読み合いを作る。
 */
const CELL_WEIGHTS: { value: CellKind; weight: number }[] = [
  { value: 'practice', weight: 30 },
  { value: 'good', weight: 12 },
  { value: 'bad', weight: 11 },
  { value: 'random', weight: 10 },
  { value: 'rest', weight: 9 },
  { value: 'boost', weight: 8 },
  { value: 'training', weight: 5 },
  { value: 'alumni', weight: 4 },
  { value: 'match', weight: 6 },
  { value: 'fork', weight: 5 },
  { value: 'blank', weight: 10 },
]

/**
 * ルート分岐で選べる道筋。
 * 分岐マスから先のマスを、選んだ方針で作り直す。
 */
export type RouteId = 'practice' | 'challenge' | 'safe'

export type Route = {
  id: RouteId
  label: string
  description: string
  weights: { value: CellKind; weight: number }[]
}

export const ROUTES: Route[] = [
  {
    id: 'practice',
    label: '練習の道',
    description: '練習マスが多い。堅実に伸ばす',
    weights: [
      { value: 'practice', weight: 55 },
      { value: 'boost', weight: 12 },
      { value: 'rest', weight: 10 },
      { value: 'good', weight: 8 },
      { value: 'bad', weight: 8 },
      { value: 'blank', weight: 7 },
    ],
  },
  {
    id: 'challenge',
    label: '挑戦の道',
    description: '特訓・OB・試合が増えるが、悪いマスも多い',
    weights: [
      { value: 'training', weight: 16 },
      { value: 'alumni', weight: 12 },
      { value: 'match', weight: 14 },
      { value: 'good', weight: 16 },
      { value: 'bad', weight: 24 },
      { value: 'practice', weight: 18 },
    ],
  },
  {
    id: 'safe',
    label: '休養の道',
    description: '体力を回復しやすく、悪いマスがほとんど無い',
    weights: [
      { value: 'rest', weight: 34 },
      { value: 'practice', weight: 26 },
      { value: 'good', weight: 14 },
      { value: 'blank', weight: 22 },
      { value: 'bad', weight: 4 },
    ],
  },
]

export function findRoute(id: string): Route | undefined {
  return ROUTES.find((route) => route.id === id)
}

/** ルート分岐で作り直す範囲。この先1ヶ月ぶんだけ変える */
export const ROUTE_RANGE_DAYS = 30

/**
 * 分岐マスから先を、選んだ道筋で作り直す。
 *
 * 盤面が1年ぶんになったので、**この先30日ぶんだけ**を対象にする。
 * 1年まるごと書き換えると、1回の選択が効きすぎて他の判断が意味を失う。
 * 大会・合宿・年度末と、すでに通過したマスは動かさない。
 */
export function applyRoute(
  rng: Rng,
  board: BoardCell[],
  fromIndex: number,
  route: Route,
): BoardCell[] {
  const until = fromIndex + ROUTE_RANGE_DAYS

  return board.map((cell) => {
    if (cell.index <= fromIndex || cell.index > until) return cell
    if (isFixed(cell)) return cell
    return { index: cell.index, kind: rng.weighted(route.weights) }
  })
}

/** 日程で決まっているマスかどうか（乱数で置き換えてはいけない） */
function isFixed(cell: BoardCell): boolean {
  return cell.kind === 'goal' || cell.kind === 'tournament' || cell.kind === 'camp'
}

/**
 * 1年ぶんの盤面を生成する。
 *
 * 0番（4月1日＝スタート地点）は必ず blank、最後（3月31日）は goal。
 * 大会マスは出場が決まっているものだけ置く
 * （全国大会は地区大会を勝ってから盤面に現れる）。
 */
export function createBoard(
  rng: Rng,
  options: { nationals?: boolean; spring?: boolean } = {},
): BoardCell[] {
  const board: BoardCell[] = Array.from({ length: BOARD_LENGTH }, (_, index) => {
    if (index === 0) return { index, kind: 'blank' as CellKind }
    if (index === GOAL_INDEX) return { index, kind: 'goal' as CellKind }
    return { index, kind: rng.weighted(CELL_WEIGHTS) }
  })

  for (const entry of EVENT_DAYS) {
    if (entry.tournamentKind === 'nationals' && !options.nationals) continue
    if (entry.tournamentKind === 'springNationals' && !options.spring) continue
    board[entry.day] = placeEvent(entry)
  }

  return board
}

function placeEvent(entry: (typeof EVENT_DAYS)[number]): BoardCell {
  return entry.tournamentKind
    ? { index: entry.day, kind: 'tournament', tournamentKind: entry.tournamentKind }
    : { index: entry.day, kind: 'camp' }
}

/**
 * 全国大会の出場権を得たときに、その大会マスを盤面へ足す。
 * すでに通り過ぎた日付には置かない。
 */
export function addTournamentCell(
  board: BoardCell[],
  kind: TournamentKind,
  currentDay: number,
): BoardCell[] {
  const day = dayOfTournament(kind)
  if (day <= currentDay) return board

  return board.map((cell) =>
    cell.index === day ? { index: day, kind: 'tournament', tournamentKind: kind } : cell,
  )
}

/**
 * 大会で敗退したので、そのマスを普通のマスに戻す。
 * 勝ち進んでいる間はマスに留まり、負けるとここで道が開いて先へ進める。
 */
export function clearTournamentCell(board: BoardCell[], day: number): BoardCell[] {
  return board.map((cell) => (cell.index === day ? { index: day, kind: 'blank' } : cell))
}

/**
 * 移動の途中に必ず止まるマスがあれば、その位置を返す。
 * 大会や合宿を飛び越えられないようにするためのもの。
 */
export function forcedStopBetween(board: BoardCell[], from: number, to: number): number | null {
  for (let index = from + 1; index <= Math.min(to, GOAL_INDEX); index++) {
    const cell = board[index]
    if (cell && (cell.kind === 'tournament' || cell.kind === 'camp')) return index
  }
  return null
}

/** その月の1日目が何日目か（UIの月区切り表示に使う） */
export { monthOfDay }
