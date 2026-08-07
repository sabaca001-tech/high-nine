/**
 * 盤面の生成。
 *
 * **1マス＝1日、盤面は1年で1本**（365マス）。
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
 * 春の全国大会だけ実際より少し早い。8回戦ぶんのマス（中1日で15日）を置くと
 * 年度末（3月31日）を越えてしまうため。
 */
export const EVENT_DAYS: { day: number; kind: 'tournament' | 'camp'; tournamentKind?: TournamentKind }[] = [
  { day: dayOf(7, 15), kind: 'tournament', tournamentKind: 'summerPref' },
  { day: dayOf(8, 12), kind: 'tournament', tournamentKind: 'nationals' },
  // 夏の全国大会は8/12開幕で最大6回戦（中1日で8/22まで）。その後に置く
  { day: dayOf(8, 25), kind: 'camp' },
  { day: dayOf(10, 15), kind: 'tournament', tournamentKind: 'autumnPref' },
  { day: dayOf(12, 26), kind: 'camp' },
  { day: dayOf(3, 10), kind: 'tournament', tournamentKind: 'springNationals' },
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
 * 回戦と回戦の間隔（マス＝日）。
 *
 * 中1日。連日で決勝まで戦わせると、体力の回復も継投の判断も入る余地が無い。
 * 夏の地区大会は最大8回戦あり、7/15から14日で7/29。
 * 全国大会（8/12）に間に合う。ここを広げると日程が破綻する。
 */
export const ROUND_GAP = 2

/**
 * マスの出現重み。
 *
 * **1マス1日にしたぶん、1年の手数が約49手から約146手に増えた。**
 * 重みをそのままにすると、練習試合も特訓も怪我も年3倍起きてしまう。
 * 練習マス以外は「1年に何回あってほしいか」から逆算して薄め、
 * 増えたぶんは練習マスと空きマスが受け持つ。
 *
 * 練習マスを最頻にして成長が主軸であることを伝えつつ、
 * 特訓・OBのような「当たり」を低確率で混ぜて、どのマスに止めるかの読み合いを作る。
 *
 * **個人イベント（イベントマス）は空きマスから取っている。**
 * 何も起きない日を減らして、部員1人に目が向く日に置き換えた形。
 * 年7回ほどで、月に1度は誰かの名前で足が止まる。
 *
 * | マス | 年あたりの回数（146手） |
 * |---|---|
 * | 練習 | 61 |
 * | 何も無い | 34 |
 * | 個人イベント | 7.3 |
 * | 休養 | 7.3 |
 * | 青・赤・白・黄 | 各 5.8 |
 * | 練習試合 | 4.4 |
 * | 特訓・OB・分岐 | 各 2.9 |
 */
const CELL_WEIGHTS: { value: CellKind; weight: number }[] = [
  { value: 'practice', weight: 42 },
  { value: 'blank', weight: 23 },
  { value: 'event', weight: 5 },
  { value: 'rest', weight: 5 },
  { value: 'good', weight: 4 },
  { value: 'bad', weight: 4 },
  { value: 'random', weight: 4 },
  { value: 'boost', weight: 4 },
  { value: 'match', weight: 3 },
  { value: 'training', weight: 2 },
  { value: 'alumni', weight: 2 },
  { value: 'fork', weight: 2 },
]

/**
 * 止まったマスによる成長の補正。
 *
 * **能力が伸びる土台はカードのほう**（`CARD_GROWTH_SCALE`）で、
 * ここはその増減にすぎない。以前は練習マスに止まったときだけ
 * 成長が発生していたので、カードの数字が移動距離の意味しか持たず、
 * 「練習マスを踏めたか」だけで育成が決まっていた。
 *
 * 練習マスは1.8倍。**踏めれば嬉しいが、踏めなくても伸びる**という重みにする。
 * 休養マスはほとんど伸びない代わりに体力が大きく戻る。
 *
 * 書いていないマスは1.0倍（そのマス自身の効果だけが起きる）。
 */
export const CELL_GROWTH_BONUS: Partial<Record<CellKind, number>> = {
  practice: 1.8,
  good: 1.2,
  bad: 0.7,
  rest: 0.4,
}

/** そのマスに止まったときの成長倍率 */
export function cellGrowthBonus(kind: CellKind): number {
  return CELL_GROWTH_BONUS[kind] ?? 1
}

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

/**
 * 道筋は「その1ヶ月だけ密度を上げる」もの。
 * 基本の盤面（練習42/空き28）より特別なマスを厚くしてあり、
 * だからこそ分岐マスに止まる価値がある。
 */
export const ROUTES: Route[] = [
  {
    id: 'practice',
    label: '練習の道',
    description: '練習マスが多い。堅実に伸ばす',
    weights: [
      { value: 'practice', weight: 70 },
      { value: 'boost', weight: 10 },
      { value: 'rest', weight: 6 },
      { value: 'good', weight: 3 },
      { value: 'bad', weight: 3 },
      { value: 'event', weight: 4 },
      { value: 'blank', weight: 4 },
    ],
  },
  {
    id: 'challenge',
    label: '挑戦の道',
    description: '特訓・OB・試合が増えるが、悪いマスも多い',
    weights: [
      { value: 'training', weight: 8 },
      { value: 'alumni', weight: 6 },
      { value: 'match', weight: 7 },
      { value: 'good', weight: 8 },
      { value: 'bad', weight: 12 },
      { value: 'event', weight: 10 },
      { value: 'practice', weight: 35 },
      { value: 'blank', weight: 14 },
    ],
  },
  {
    id: 'safe',
    label: '休養の道',
    description: '体力を回復しやすく、悪いマスがほとんど無い',
    weights: [
      { value: 'rest', weight: 25 },
      { value: 'practice', weight: 35 },
      { value: 'good', weight: 10 },
      { value: 'event', weight: 4 },
      { value: 'blank', weight: 23 },
      { value: 'bad', weight: 3 },
    ],
  },
]

export function findRoute(id: string): Route | undefined {
  return ROUTES.find((route) => route.id === id)
}

/** ルート分岐で作り直す範囲（マス＝日）。この先1ヶ月ぶんだけ変える */
export const ROUTE_RANGE_CELLS = 30

/**
 * 分岐マスから先を、選んだ道筋で作り直す。
 *
 * 盤面が1年ぶんになったので、**この先30マス（＝30日）だけ**を対象にする。
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
