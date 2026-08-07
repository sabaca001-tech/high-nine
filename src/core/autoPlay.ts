/**
 * 自動進行のヘルパー。診断スクリプトとテストで使う。
 *
 * **フェーズを追加したら、進行ループはこのファイルだけ直せば済む。**
 * 以前は診断・テストそれぞれに同じ分岐を書いていたため、
 * `match` / `newSeason` / `tournament` / `camp` を足すたびに
 * あちこちで進行が止まって発覚していた（CLAUDE.md 5.6 参照）。
 *
 * ここは「操作を自動化する」だけで、ゲームルールは一切持たない。
 */

import { applyCommand, createInitialState } from './gameEngine'
import type { NewGameOptions } from './gameEngine'
import { findPlayerEvent } from './event/playerEvents'
import { isTournamentOver } from './types/tournament'
import type { GameState } from './types/game'

export type AutoPlayOptions = {
  /** カードの選び方。既定は手札の先頭（無戦略プレイ） */
  chooseCard?: (state: GameState) => string
  /** 合宿の方針。既定は打撃合宿 */
  chooseCampPlan?: (state: GameState) => string
  /** 個人イベントの選択。既定は最初の選択肢 */
  choosePlayerEventChoice?: (state: GameState) => string
  /** ルート分岐の選び方。既定は練習の道 */
  chooseRoute?: (state: GameState) => string
  /** 1年ぶんの操作回数の上限。超えたら例外 */
  maxSteps?: number
  /**
   * 世代交代の報告（newSeason）が出たらそこで止める。
   *
   * 通常の進行では報告をその場で閉じてしまうので、
   * 報告画面そのものを調べたいときに使う。
   */
  stopAtNewSeason?: boolean
}

/**
 * 1年ぶんの操作回数の上限。
 * 365日をカード（1〜5日）で進むので、最悪365手＋大会などの操作が乗る。
 */
const DEFAULT_MAX_STEPS = 600

/**
 * いまのフェーズに応じた操作を1回だけ行う。
 * 進行ループの1歩ぶん。ログを細かく追いたい診断で使う。
 */
export function playStep(state: GameState, options: AutoPlayOptions = {}): GameState {
  const chooseCard = options.chooseCard ?? ((s: GameState) => s.hand[0].id)
  const chooseCampPlan = options.chooseCampPlan ?? (() => 'batting')
  const chooseRoute = options.chooseRoute ?? (() => 'practice')
  const choosePlayerEventChoice =
    options.choosePlayerEventChoice ?? ((s: GameState) => firstChoiceId(s))

  switch (state.phase) {
    case 'lineupCheck':
      // 自動プレイではスタメンをいじらずそのまま始める
      return applyCommand(state, { type: 'startMatch' }).state

    case 'match':
      // 試合は半回ずつ進む。自動プレイでは交代を挟まず一気に決着させる
      return state.matchState
        ? applyCommand(state, { type: 'advanceMatch', toEnd: true }).state
        : applyCommand(state, { type: 'finishMatch' }).state

    case 'tournament': {
      const tournament = state.tournament
      if (!tournament) throw new Error('大会フェーズなのに tournament が無い')
      return applyCommand(state, {
        type: isTournamentOver(tournament) ? 'finishTournament' : 'playTournamentMatch',
      }).state
    }

    case 'newSeason':
      return applyCommand(state, { type: 'finishSeason' }).state

    case 'camp':
      return applyCommand(state, {
        type: 'chooseCampPlan',
        planId: chooseCampPlan(state),
      }).state

    case 'playerEvent':
      return applyCommand(state, {
        type: 'choosePlayerEventChoice',
        choiceId: choosePlayerEventChoice(state),
      }).state

    case 'fork':
      return applyCommand(state, { type: 'chooseRoute', routeId: chooseRoute(state) }).state

    case 'cardSelect':
      return applyCommand(state, { type: 'selectCard', cardId: chooseCard(state) }).state

    case 'yearEnd':
      return applyCommand(state, { type: 'advanceYear' }).state
  }
}

/**
 * 選択待ちの個人イベントの、最初の選択肢のid。
 * 無戦略プレイの既定値。**部費が要る選択肢は避ける**
 * （払えないと選べず、進行が止まってしまう）。
 */
function firstChoiceId(state: GameState): string {
  const pending = state.pendingEvent
  const event = pending ? findPlayerEvent(pending.eventId) : undefined
  if (!event) return ''
  const affordable = event.choices.filter(
    (choice) => choice.cost === undefined || state.funds >= choice.cost,
  )
  return (affordable[0] ?? event.choices[0]).id
}

/**
 * スタメン確認から試合の決着まで一気に進める。
 *
 * 試合は**半回ずつ**進むので、`startMatch` だけでは結果が出ない。
 * 交代を挟まない場面（テスト・診断）はこれを使う。
 */
export function runMatch(state: GameState): GameState {
  const started = applyCommand(state, { type: 'startMatch' }).state
  if (started.phase !== 'match') return started
  return applyCommand(started, { type: 'advanceMatch', toEnd: true }).state
}

/**
 * いま進行中の大会が終わる（優勝か敗退）まで進める。
 *
 * **大会は1回戦ごとに別のマスに置かれる。** 勝つといったん盤面へ戻り、
 * 次の回戦のマスまで進んでから次の試合になる。
 * 「大会画面で次の試合を押し続ける」形ではもう回らないので、
 * 普通の進行（`playStep`）に任せる。
 */
export function playOutTournament(
  initial: GameState,
  options: AutoPlayOptions = {},
): GameState {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  let state = initial
  let steps = 0

  while (state.tournament && !isTournamentOver(state.tournament)) {
    state = playStep(state, options)
    if (++steps > maxSteps) throw new Error('大会が終わらない')
  }

  return state
}

/**
 * 年度末（`phase === 'yearEnd'`）になるまで進める。
 * 途中の試合・大会・合宿はすべて自動で片付ける。
 */
export function playUntilYearEnd(initial: GameState, options: AutoPlayOptions = {}): GameState {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS

  let state = initial
  let steps = 0

  while (state.phase !== 'yearEnd') {
    // 世代交代の報告で止めたい場合（報告画面のテスト用）
    if (options.stopAtNewSeason && state.phase === 'newSeason') return state

    state = playStep(state, options)

    if (++steps > maxSteps) {
      throw new Error(`進行が止まった（phase: ${state.phase}）`)
    }
  }

  return state
}

/**
 * 1年ぶん進める。
 * 年度末まで進めてから次の年度へ送り、世代交代の報告フェーズで返す。
 */
export function playYear(initial: GameState, options: AutoPlayOptions = {}): GameState {
  const atYearEnd = playUntilYearEnd(initial, options)
  return applyCommand(atYearEnd, { type: 'advanceYear' }).state
}

/**
 * 新規ゲームを作り、入部の報告を閉じてカード選択まで進めた状態を返す。
 *
 * ゲームは4月の入部から始まるため、いきなりカードを選ぶテストでは
 * これを使う（`createInitialState` は入部の報告フェーズを返す）。
 */
export function startedGame(options: NewGameOptions = {}): GameState {
  return applyCommand(createInitialState(options), { type: 'finishSeason' }).state
}

/**
 * そのフェーズになるまで進める。
 * 盤面が1年ぶんになり「何手で大会に着くか」が固定でなくなったので、
 * 大会や合宿を調べるテストはこれで目的の場面まで進める。
 */
export function playUntilPhase(
  initial: GameState,
  phase: GameState['phase'],
  options: AutoPlayOptions = {},
): GameState {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  let state = initial

  for (let steps = 0; steps <= maxSteps; steps++) {
    if (state.phase === phase) return state
    state = playStep(state, options)
  }
  throw new Error(`${phase} に到達しない`)
}

/**
 * 指定した月になるまで進める。
 * 月は「何日目か」から決まるので、日数ではなく月で指定できるようにする。
 */
export function playUntilMonth(
  initial: GameState,
  month: GameState['month'],
  options: AutoPlayOptions = {},
): GameState {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  let state = initial

  for (let steps = 0; steps <= maxSteps; steps++) {
    if (state.month === month) return state
    // 年度末を越えてしまうと目的の月を通り過ぎる
    if (state.phase === 'yearEnd') throw new Error(`${month}月に到達しない`)
    state = playStep(state, options)
  }
  throw new Error(`${month}月に到達しない`)
}

/**
 * 世代交代の報告（`phase === 'newSeason'`）が出た時点の状態を返す。
 * 報告画面を調べるテストはこれを使う。
 */
export function playUntilNewSeason(initial: GameState, options: AutoPlayOptions = {}): GameState {
  let state = playYear(initial, options)
  if (state.phase !== 'newSeason') {
    throw new Error(`世代交代に到達しない（phase: ${state.phase}）`)
  }
  return state
}
