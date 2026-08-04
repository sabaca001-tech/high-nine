/**
 * 盤面の生成。
 *
 * **1マス＝3日、盤面は1年で1本**（122マス）。
 * 月ごとにゴールを置くのをやめたので、4月1日から3月31日まで
 * 途切れずに1本の道が続く。大会や合宿はその日付のマスとして置かれ、
 * 通り過ぎることはできない（必ず止まる）。
 *
 * **大会は1回戦ずつ別のマスに置く。** 以前は1つのマスで
 * 決勝まで連戦していたので、大会が始まると数試合をまとめて消化してしまい、
 * 「勝ち上がっていく」感覚も、試合の合間に手を打つ余地も無かった。
 */

import type { Rng } from '@/core/rng/random'
import { cellOfDay, CELLS_IN_YEAR, dayOf, dayOfCell, monthOfDay } from '@/core/calendar/days'
import type { BoardCell, CellKind } from '@/core/types/board'
import type { TournamentKind } from '@/core/types/tournament'

/** 盤面のマス数 */
export const BOARD_LENGTH = CELLS_IN_YEAR

/** 年度末（3月31日）の位置 */
export const GOAL_INDEX = BOARD_LENGTH - 1

/**
 * 大会と合宿の開催日。
 *
 * 実際の高校野球の日程に寄せてある。全国大会は出場権を得たときだけ
 * 盤面に置かれるので、ここでは「置くならこの日」を決めているだけ。
 *
 * 春の全国大会だけ実際より早い（3月上旬）。回戦ぶんのマスを置くと
 * 年度末（3月31日）を越えてしまうため。
 */
export const EVENT_DAYS: { day: number; kind: 'tournament' | 'camp'; tournamentKind?: TournamentKind }[] = [
  { day: dayOf(7, 15), kind: 'tournament', tournamentKind: 'summerPref' },
  { day: dayOf(8, 12), kind: 'tournament', tournamentKind: 'nationals' },
  { day: dayOf(10, 15), kind: 'tournament', tournamentKind: 'autumnPref' },
  { day: dayOf(12, 26), kind: 'camp' },
  { day: dayOf(3, 5), kind: 'tournament', tournamentKind: 'springNationals' },
]

/** その大会の1回戦が置かれる日 */
export function dayOfTournament(kind: TournamentKind): number {
  return EVENT_DAYS.find((entry) => entry.tournamentKind === kind)?.day ?? 0
}

/** その大会の1回戦が置かれるマス */
export function cellOfTournament(kind: TournamentKind): number {
  return cellOfDay(dayOfTournament(kind))
}

/**
 * 回戦と回戦の間隔（マス）。
 *
 * 1マス＝3日なので、1マス間隔で中2日。
 * 夏の地区大会は最大8回戦あり、7/15から8マス＝24日で8/8。
 * 全国大会（8/12）に間に合う。ここを広げると日程が破綻する。
 */
export const ROUND_GAP = 1

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

/** ルート分岐で作り直す範囲（マス）。この先1ヶ月ぶんだけ変える */
export const ROUTE_RANGE_CELLS = 10

/**
 * 分岐マスから先を、選んだ道筋で作り直す。
 *
 * 盤面が1年ぶんになったので、**この先10マス（約30日）だけ**を対象にする。
 * 1年まるごと書き換えると、1回の選択が効きすぎて他の判断が意味を失う。
 * 大会・合宿・年度末と、すでに通過したマスは動かさない。
 */
export function applyRoute(
  rng: Rng,
  board: BoardCell[],
  fromIndex: number,
  route: Route,
): BoardCell[] {
  const until = fromIndex + ROUTE_RANGE_CELLS

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
 * **大会マスはここでは置かない。** 回戦数が地区によって変わるので、
 * 大会が始まるときに `placeTournamentCells` でまとめて置く。
 */
export function createBoard(rng: Rng): BoardCell[] {
  const board: BoardCell[] = Array.from({ length: BOARD_LENGTH }, (_, index) => {
    if (index === 0) return { index, kind: 'blank' as CellKind }
    if (index === GOAL_INDEX) return { index, kind: 'goal' as CellKind }
    return { index, kind: rng.weighted(CELL_WEIGHTS) }
  })

  // 合宿だけはここで置く。大会は回戦数が地区で変わるので、
  // 開幕のときに placeTournamentCells で回戦ぶんまとめて置く
  for (const entry of EVENT_DAYS) {
    if (entry.tournamentKind) continue
    const index = cellOfDay(entry.day)
    board[index] = { index, kind: 'camp' }
  }

  return board
}

/**
 * 大会の回戦ぶんのマスを置く。
 *
 * **1回戦ずつ別のマスに置く。** 勝つと次の大会マスへ進み、
 * 負けたら残りのマスは普通のマスに戻る。
 * 年度末を越える回戦は置けないので、その手前で打ち切る。
 */
export function placeTournamentCells(
  board: BoardCell[],
  kind: TournamentKind,
  currentCell: number,
  rounds: number,
): BoardCell[] {
  const start = cellOfTournament(kind)
  const next = [...board]

  for (let round = 0; round < rounds; round++) {
    const index = start + round * ROUND_GAP
    // 通り過ぎた位置と年度末には置かない
    if (index <= currentCell || index >= GOAL_INDEX) continue
    next[index] = { index, kind: 'tournament', tournamentKind: kind, round: round + 1 }
  }

  return next
}

/**
 * 年度の初めに、必ず出場する大会（夏の地区・秋季）のマスを置く。
 *
 * 回戦数は地区の参加校数で決まるので、盤面を作ったあとに呼ぶ。
 * 全国大会は出場権を得てから `placeTournamentCells` で足す。
 */
export function placeSeasonTournaments(
  board: BoardCell[],
  rounds: { summerPref: number; autumnPref: number },
): BoardCell[] {
  let next = placeTournamentCells(board, 'summerPref', -1, rounds.summerPref)
  next = placeTournamentCells(next, 'autumnPref', -1, rounds.autumnPref)
  return next
}

/**
 * その大会のマスをすべて普通のマスに戻す。
 * 敗退・優勝で大会が終わったときに呼ぶ。**戻さないと同じ大会が再開する。**
 */
export function clearTournamentCells(board: BoardCell[], kind: TournamentKind): BoardCell[] {
  return board.map((cell) =>
    cell.kind === 'tournament' && cell.tournamentKind === kind
      ? { index: cell.index, kind: 'blank' }
      : cell,
  )
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
export { dayOfCell, monthOfDay }
