import { describe, expect, it } from 'vitest'
import {
  BOARD_LENGTH,
  cellOfTournament,
  GOAL_INDEX,
  placeTournamentCells,
} from '@/core/board/boardDefs'
import { cellOfDay, dayOf, monthOfDay } from '@/core/calendar/days'
import { ALL_POSITIONS } from '@/core/lineup/aptitude'
import { canConvert, CONVERT_STEPS } from '@/core/player/trainingFocus'
import { FIRST_SQUAD_SIZE } from '@/core/player/squad'
import {
  GROUND_LEVEL_MAX,
  groundUpgradeCost,
  groundUpgradeCostFor,
} from '@/core/shop/facility'
import { validateLineup } from '@/core/lineup/autoLineup'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import {
  EQUIPMENTS,
  findEquipment,
  requiresEquipment,
  unlockedKinds,
} from '@/core/shop/equipmentDefs'
import type { CardNumber, PracticeKind } from '@/core/types/card'
import { handSizeFor } from '@/core/types/season'
import type { GameState, Month } from '@/core/types/game'
import { GRADUATES_LIMIT, LOG_LIMIT, SAVE_VERSION } from '@/core/types/game'
import { applyCommand, createInitialState } from './gameEngine'
import {
  playStep,
  playUntilMonth,
  playUntilNewSeason,
  playUntilPhase,
  playOutTournament,
  playUntilYearEnd,
  playYear,
  runMatch,
  startedGame,
} from './autoPlay'
import { benchPlayers } from './match/teamState'
import { localRivals, nationalRivals } from './rival/rivals'
import { isTournamentOver } from './types/tournament'
import { championOf, opponentAt } from './tournament/bracket'
import { overallRating } from './player/rating'
import { opponentRating, teamRating } from './season/matchReputation'
import { findPlayerEvent } from './event/playerEvents'
import { defaultGrowthOrder, positionGrowthMultiplier } from './player/trainingFocus'
import type { GrowableKey } from './types/player'
import {
  findScoutRegion,
  MAX_APPROACHES,
  MAX_SCOUT_TRIPS,
  NATIONAL_TEAM_SIZE,
  PROSPECTS_PER_REGION,
  SCOUT_OPEN_MONTH,
  successChance,
} from './scout/scouting'
import { scoutTripCost } from './shop/travel'
import { findRegion } from './types/region'
import { DEFAULT_UNIFORM } from './team/uniforms'

/**
 * カードを1枚使い、成長の報告が出たら閉じるところまで進める。
 *
 * 報告は**マスの効果の手前**に挟まる（試合マスで練習の結果を見る前に
 * 試合が始まってしまうのを防ぐため）。
 * マスの結果やその先のフェーズを調べるテストはこれを使う。
 */
function stepCard(state: GameState, cardId?: string): GameState {
  const next = applyCommand(state, {
    type: 'selectCard',
    cardId: cardId ?? state.hand[0].id,
  }).state
  return next.phase === 'growthReport'
    ? applyCommand(next, { type: 'closeGrowthReport' }).state
    : next
}

/**
 * 練習試合の相手選びまで来ていたら、**県内（遠征費0）の相手**を選ぶ。
 * 相手を選ぶまで試合は始まらないので、試合を調べるテストはこれを通す。
 */
/**
 * 試合を終えて、成長の報告を閉じたところまで進める。
 *
 * **試合のあとは必ず「試合での成長」で足を止める**ようになったので、
 * `finishMatch` の直後はまだ盤面に戻っていない。
 */
function endMatch(state: GameState): GameState {
  const after = applyCommand(state, { type: 'finishMatch' }).state
  return after.phase === 'growthReport'
    ? applyCommand(after, { type: 'closeGrowthReport' }).state
    : after
}

function acceptFriendly(state: GameState): GameState {
  if (state.phase !== 'matchOffer' || !state.pendingOffers) return state
  const home = state.pendingOffers.find((offer) => offer.travelCost === 0)
  return applyCommand(state, {
    type: 'chooseFriendlyMatch',
    offerId: (home ?? state.pendingOffers[0]).id,
  }).state
}

describe('createInitialState', () => {
  it('1年目4月・新入生の入部から始まる', () => {
    const state = createInitialState({ seed: 1 })
    expect(state.version).toBe(SAVE_VERSION)
    expect(state.year).toBe(1)
    expect(state.month).toBe(4)
    // 入部の報告から始まる
    expect(state.phase).toBe('newSeason')
    expect(state.pendingSeason).not.toBeNull()
    expect(state.pendingSeason!.graduates).toEqual([])
    expect(state.pendingSeason!.newcomers.length).toBeGreaterThan(0)
    expect(state.hand).toHaveLength(handSizeFor(state.reputation))
    expect(state.board).toHaveLength(BOARD_LENGTH)
    expect(state.boardPosition).toBe(0)
  })

  it('在校生は2・3年生だけで、1年生は新入生として加わる', () => {
    const state = createInitialState({ seed: 2 })
    const freshmen = state.players.filter((p) => p.grade === 1)

    expect(state.players.filter((p) => p.grade === 3)).toHaveLength(8)
    expect(state.players.filter((p) => p.grade === 2)).toHaveLength(8)
    expect(freshmen.length).toBe(state.pendingSeason!.newcomers.length)
  })

  it('評判が高いほど新入生が多い', () => {
    // 評判は初期値なので、人数が下限より多いことだけ確認する
    const state = createInitialState({ seed: 3 })
    expect(state.pendingSeason!.newcomers.length).toBeGreaterThanOrEqual(4)
  })

  it('入部の報告を閉じるとカード選択が始まる', () => {
    const started = startedGame({ seed: 4 })
    expect(started.phase).toBe('cardSelect')
    expect(started.pendingSeason).toBeNull()
  })

  it('同じシードなら完全に同じ初期状態になる', () => {
    expect(createInitialState({ seed: 99 })).toEqual(createInitialState({ seed: 99 }))
  })

  it('違うシードなら違う初期状態になる', () => {
    const a = createInitialState({ seed: 1 })
    const b = createInitialState({ seed: 2 })
    expect(a.players.map((p) => p.name)).not.toEqual(b.players.map((p) => p.name))
  })

  it('JSONに変換して復元できる（セーブデータとして成立する）', () => {
    const state = createInitialState({ seed: 5 })
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('selectCard', () => {
  it('カードの数字ぶんコマが進む', () => {
    const state = startedGame({ seed: 3 })
    const card = state.hand[0]
    const { state: next, events } = applyCommand(state, { type: 'selectCard', cardId: card.id })

    expect(next.boardPosition).toBe(Math.min(card.number, GOAL_INDEX))
    expect(events[0]).toEqual({
      type: 'moved',
      from: 0,
      to: next.boardPosition,
      steps: card.number,
    })
  })

  it('使ったカードが手札から消え、枚数が維持される', () => {
    const state = startedGame({ seed: 3 })
    const size = state.hand.length
    const used = state.hand[0]
    const { state: next } = applyCommand(state, { type: 'selectCard', cardId: used.id })

    expect(next.hand).toHaveLength(size)
    expect(next.hand.find((c) => c.id === used.id)).toBeUndefined()
    expect(new Set(next.hand.map((c) => c.id)).size).toBe(size)
  })

  it('評判が上がると手札の枚数が増える', () => {
    const base = startedGame({ seed: 31 })
    const rich: GameState = { ...base, reputation: 95 }

    const next = applyCommand(rich, { type: 'selectCard', cardId: rich.hand[0].id }).state
    expect(next.hand.length).toBeGreaterThan(base.hand.length)
    expect(next.hand.length).toBe(handSizeFor(95))
    expect(new Set(next.hand.map((c) => c.id)).size).toBe(next.hand.length)
  })

  it('元の state を変更しない', () => {
    const state = startedGame({ seed: 3 })
    const snapshot = JSON.parse(JSON.stringify(state))
    applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id })
    expect(state).toEqual(snapshot)
  })

  it('乱数の状態が進む（毎回同じ結果にならない）', () => {
    const state = startedGame({ seed: 3 })
    const { state: next } = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id })
    expect(next.rngState).not.toBe(state.rngState)
  })

  it('手札に無いカードを選ぶとエラーになる', () => {
    const state = startedGame({ seed: 3 })
    expect(() => applyCommand(state, { type: 'selectCard', cardId: 'unknown' })).toThrow()
  })

  it('ゴールを越えてもゴールで止まり、月末フェーズになる', () => {
    const state = playUntilYearEnd(startedGame({ seed: 3 }))
    expect(state.boardPosition).toBe(GOAL_INDEX)
    expect(state.phase).toBe('yearEnd')
  })

  it('月末フェーズ中はカードを選んでも何も起きない', () => {
    const state = playUntilYearEnd(startedGame({ seed: 3 }))
    const { state: next, events } = applyCommand(state, {
      type: 'selectCard',
      cardId: state.hand[0].id,
    })
    expect(next).toBe(state)
    expect(events).toHaveLength(0)
  })

  it('練習を重ねるとチーム全体の能力が上がる', () => {
    const before = startedGame({ seed: 12 })
    const sumMeet = (s: GameState): number =>
      s.players.reduce((total, p) => total + p.batting.meet, 0)

    let state = before
    for (let i = 0; i < 6; i++) {
      state = playUntilYearEnd(state)
      state = applyCommand(state, { type: 'advanceYear' }).state
    }

    expect(sumMeet(state)).toBeGreaterThan(sumMeet(before))
  })

  it('能力値は常に1〜100に収まる', () => {
    let state = startedGame({ seed: 808 })
    for (let i = 0; i < 24; i++) {
      state = playUntilYearEnd(state)
      state = applyCommand(state, { type: 'advanceYear' }).state
    }

    for (const player of state.players) {
      for (const value of Object.values(player.batting)) {
        expect(value).toBeGreaterThanOrEqual(1)
        expect(value).toBeLessThanOrEqual(100)
      }
      expect(player.trust).toBeGreaterThanOrEqual(0)
      expect(player.trust).toBeLessThanOrEqual(100)
      expect(player.condition).toBeGreaterThanOrEqual(0)
      expect(player.condition).toBeLessThanOrEqual(100)
      expect(player.motivation).toBeGreaterThanOrEqual(-2)
      expect(player.motivation).toBeLessThanOrEqual(2)
    }
    // 24年ぶん回すので単体で2秒かかる。他のファイルと並んで走ると
    // 既定の5秒を超えることがあり、たまに落ちていた
  }, 60_000)

  it('ログが上限を超えて溜まらない', () => {
    let state = startedGame({ seed: 21 })
    for (let i = 0; i < 30; i++) {
      state = playUntilYearEnd(state)
      state = applyCommand(state, { type: 'advanceYear' }).state
    }
    expect(state.log.length).toBeLessThanOrEqual(LOG_LIMIT)
    expect(new Set(state.log.map((l) => l.id)).size).toBe(state.log.length)
  }, 60_000)
})

describe('日単位の移動', () => {
  it('カードの数字ぶん日付が進む', () => {
    const state = startedGame({ seed: 401 })
    const card = state.hand[0]
    const next = applyCommand(state, { type: 'selectCard', cardId: card.id }).state

    expect(next.boardPosition).toBe(card.number)
    expect(next.month).toBe(monthOfDay(card.number))
  })

  it('月をまたぐと、またいだ月の処理がその場で走る', () => {
    const base = startedGame({ seed: 402 })
    // 4月30日のマスから1マス動くと必ず5月1日に入る
    const state: GameState = {
      ...base,
      boardPosition: cellOfDay(dayOf(4, 30)),
      hand: base.hand.map((card) => ({ ...card, number: 1 as const })),
    }

    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

    expect(next.month).toBe(5)
    // 部費の支給と維持費の支払いが起きている
    expect(next.log.some((entry) => entry.text.includes('支給'))).toBe(true)
    expect(next.log.some((entry) => entry.text.includes('維持費'))).toBe(true)
  })

  it('月を連続でまたいでも取りこぼさない', () => {
    const base = startedGame({ seed: 403 })
    // 4月下旬 → 6月まで進める。1マス1日なのでカード1枚では月をまたぎ切れない
    const state: GameState = {
      ...base,
      boardPosition: cellOfDay(dayOf(4, 29)),
      hand: base.hand.map((card) => ({ ...card, number: 5 as const })),
      // 途中で足が止まらないよう、通る道はすべて何も起きないマスにする。
      // 大会・合宿だけでなく**分岐マス**も止まる（phase が fork になる）
      board: base.board.map((cell) =>
        cell.kind === 'goal' ? cell : { index: cell.index, kind: 'blank' as const },
      ),
    }

    let next = state
    // 4/29 から 6月に入るまで（33日ぶん）進める。
    // **手数を決め打ちしない。** 補充された手札の数字は5とは限らないので、
    // 「◯手で届くはず」と書くと編成を触るたびに落ちる
    for (let i = 0; i < 20 && next.month < 6; i++) {
      next = stepCard(next)
    }

    expect(next.month).toBe(6)
    // 5月と6月の両方の月替わりが記録されている（下の for の回数と揃えること）
    const months = next.log.filter((entry) => /^1年目 \d+月$/.test(entry.text))
    expect(months.length).toBeGreaterThanOrEqual(2)
  })

  it('大会マスは飛び越えられない', () => {
    const base = startedGame({ seed: 404 })
    const summerCell = cellOfTournament('summerPref')
    const state: GameState = {
      ...base,
      boardPosition: summerCell - 2,
      // 5マス進めば本来は通り過ぎるはず
      hand: base.hand.map((card) => ({ ...card, number: 5 as const })),
    }

    const next = stepCard(state)

    expect(next.boardPosition).toBe(summerCell)
    expect(next.phase).toBe('tournament')
  })

  it('年度末を越えては進まない', () => {
    const base = startedGame({ seed: 405 })
    const state: GameState = {
      ...base,
      boardPosition: GOAL_INDEX - 2,
      hand: base.hand.map((card) => ({ ...card, number: 5 as const })),
    }

    const next = stepCard(state)

    expect(next.boardPosition).toBe(GOAL_INDEX)
    expect(next.phase).toBe('yearEnd')
  })
})

describe('advanceYear', () => {
  it('年度末まで進むと次の年度が始まり、盤面と手札が新しくなる', () => {
    const state = playUntilYearEnd(startedGame({ seed: 3 }))
    expect(state.month).toBe(3)
    expect(state.boardPosition).toBe(GOAL_INDEX)

    const { state: next } = applyCommand(state, { type: 'advanceYear' })

    expect(next.month).toBe(4)
    expect(next.year).toBe(2)
    // 卒業と入部の報告から始まる
    expect(next.phase).toBe('newSeason')
    expect(next.boardPosition).toBe(0)
    expect(next.hand).toHaveLength(handSizeFor(next.reputation))
    expect(next.hand.map((c) => c.id)).not.toEqual(state.hand.map((c) => c.id))
  })

  it('カード選択中に呼んでも何も起きない', () => {
    const state = startedGame({ seed: 3 })
    const { state: next, events } = applyCommand(state, { type: 'advanceYear' })
    expect(next).toBe(state)
    expect(events).toHaveLength(0)
  })

  it('1年を通すと4月から3月まで全ての月を通る', () => {
    let state = startedGame({ seed: 3 })
    const seen = new Set<Month>([state.month])

    while (state.phase !== 'yearEnd') {
      state = playStep(state)
      seen.add(state.month)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('月は常に1〜12に収まる', () => {
    let state = startedGame({ seed: 64 })
    const seen: Month[] = []
    for (let i = 0; i < 3; i++) {
      while (state.phase !== 'yearEnd') {
        state = playStep(state)
        seen.push(state.month)
      }
      state = playStep(state)
      state = playStep(state)
      seen.push(state.month)
    }
    for (const month of seen) {
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
    }
  })
})

describe('スタメン', () => {
  it('新規ゲームで成立したスタメンが組まれている', () => {
    const state = startedGame({ seed: 41 })
    expect(validateLineup(state.lineup, state.players)).toEqual([])
  })

  it('setLineup で差し替えられる', () => {
    const state = startedGame({ seed: 42 })
    // 1番と2番を入れ替える
    const slots = [...state.lineup.slots]
    ;[slots[0], slots[1]] = [slots[1], slots[0]]

    const { state: next } = applyCommand(state, { type: 'setLineup', lineup: { slots } })
    expect(next.lineup.slots[0]).toEqual(slots[0])
  })

  it('成立していないスタメンは受け付けない', () => {
    const state = startedGame({ seed: 43 })
    const broken = { slots: state.lineup.slots.slice(0, 4) }

    const { state: next } = applyCommand(state, { type: 'setLineup', lineup: broken })
    expect(next).toBe(state)
  })

  it('autoLineup コマンドで組み直せる', () => {
    const state = startedGame({ seed: 44 })
    const { state: next } = applyCommand(state, { type: 'autoLineup' })
    expect(validateLineup(next.lineup, next.players)).toEqual([])
  })

  it('月を進めてもスタメンは成立したまま', () => {
    let state = startedGame({ seed: 45 })
    for (let i = 0; i < 6; i++) {
      state = playUntilYearEnd(state)
      state = applyCommand(state, { type: 'advanceYear' }).state
    }
    expect(validateLineup(state.lineup, state.players)).toEqual([])
  })
})

describe('練習効率バフ', () => {
  it('黄マスに止まるとバフが付き、練習マスで消費される', () => {
    // 黄マスと練習マスを並べた盤面を用意する
    const base = startedGame({ seed: 51 })
    const state: GameState = {
      ...base,
      board: base.board.map((cell, index) => {
        if (index === 3) return { index, kind: 'boost' as const }
        if (index === 6) return { index, kind: 'practice' as const }
        return cell
      }),
      // 黄マス→練習マスの順に確実に止まるよう手札を作り替える
      hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'batting' as const })),
      boardPosition: 0,
    }

    const afterBoost = stepCard(state)
    expect(afterBoost.practiceBoost).not.toBeNull()
    const remaining = afterBoost.practiceBoost!.remaining

    const afterPractice = stepCard(afterBoost)

    // 残り1回だった場合は消えるので、どちらかを満たしていればよい
    if (remaining === 1) {
      expect(afterPractice.practiceBoost).toBeNull()
    } else {
      expect(afterPractice.practiceBoost!.remaining).toBe(remaining - 1)
    }
  })

  it('バフがあると練習の伸びが大きくなる', () => {
    const build = (boost: GameState['practiceBoost']): number => {
      const base = startedGame({ seed: 52 })
      const state: GameState = {
        ...base,
        board: base.board.map((cell, index) =>
          index === 3 ? { index, kind: 'practice' as const } : cell,
        ),
        hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'batting' as const })),
        boardPosition: 0,
        practiceBoost: boost,
      }
      const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
      return next.players.reduce((total, p) => total + p.batting.meet + p.batting.power, 0)
    }

    expect(build({ multiplier: 3, remaining: 3 })).toBeGreaterThan(build(null))
  })
})

describe('マスの種類', () => {
  it('どの種類のマスに止まっても状態が壊れない', () => {
    const kinds = [
      'practice', 'good', 'bad', 'random', 'rest',
      'boost', 'training', 'alumni', 'match', 'blank',
    ] as const

    for (const kind of kinds) {
      const base = startedGame({ seed: 61 })
      const state: GameState = {
        ...base,
        board: base.board.map((cell, index) => (index === 3 ? { index, kind } : cell)),
        hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
        boardPosition: 0,
      }
      const { state: next } = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id })

      expect(next.players).toHaveLength(base.players.length)
      expect(validateLineup(next.lineup, next.players)).toEqual([])
      for (const player of next.players) {
        expect(player.condition).toBeGreaterThanOrEqual(0)
        expect(player.trust).toBeLessThanOrEqual(100)
        expect(new Set(player.skills).size).toBe(player.skills.length)
      }
      // JSONに変換できる状態が保たれている
      expect(JSON.parse(JSON.stringify(next))).toEqual(next)
    }
  })

  /** 指定したマスに止まるまで進めて、伸びた合計を返す */
  function growthOnCell(kind: 'practice' | 'blank' | 'rest', steps: 1 | 3 | 5, seed: number) {
    const base = startedGame({ seed })
    const state: GameState = {
      ...base,
      board: base.board.map((_cell, index) =>
        index === steps ? { index, kind } : { index, kind: 'blank' as const },
      ),
      hand: base.hand.map((card) => ({ ...card, number: steps, kind: 'batting' as const })),
      boardPosition: 0,
    }
    const { state: next } = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id })

    const before = new Map(base.players.map((p) => [p.id, p.batting.meet + p.batting.power]))
    return next.players.reduce(
      (total, p) => total + (p.batting.meet + p.batting.power - (before.get(p.id) ?? 0)),
      0,
    )
  }

  it('練習マス以外に止まっても能力は伸びる', () => {
    // 以前は練習マスに止まらないと1ミリも伸びなかった。
    // いまはカードが成長の土台なので、何も無いマスでも伸びる
    let total = 0
    for (let seed = 300; seed < 340; seed++) total += growthOnCell('blank', 5, seed)
    expect(total).toBeGreaterThan(0)
  })

  it('同じマスなら、数字が大きいカードのほうが伸びる', () => {
    let small = 0
    let large = 0
    for (let seed = 400; seed < 440; seed++) {
      small += growthOnCell('blank', 1, seed)
      large += growthOnCell('blank', 5, seed)
    }
    expect(large).toBeGreaterThan(small * 2)
  })

  it('同じ数字なら、練習マスに止まったほうが伸びる', () => {
    let blank = 0
    let practice = 0
    for (let seed = 500; seed < 560; seed++) {
      blank += growthOnCell('blank', 5, seed)
      practice += growthOnCell('practice', 5, seed)
    }
    expect(practice).toBeGreaterThan(blank)
  })

  it('休養マスはほとんど伸びない代わりに体力が戻る', () => {
    let rest = 0
    let blank = 0
    for (let seed = 600; seed < 660; seed++) {
      rest += growthOnCell('rest', 5, seed)
      blank += growthOnCell('blank', 5, seed)
    }
    expect(rest).toBeLessThan(blank)
  })

  it('特訓マスで特殊能力が習得されることがある', () => {
    let acquired = false

    for (let seed = 0; seed < 40 && !acquired; seed++) {
      const base = startedGame({ seed })
      const state: GameState = {
        ...base,
        // 信頼度を上げて特訓が起きやすい状況にする
        players: base.players.map((p) => ({ ...p, trust: 80 })),
        board: base.board.map((cell, index) =>
          index === 3 ? { index, kind: 'training' as const } : cell,
        ),
        hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
        boardPosition: 0,
      }
      const { state: next } = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id })
      acquired = next.players.some((p) => p.skills.length > 0)
    }

    expect(acquired).toBe(true)
  })
})

describe('世代交代', () => {
  /**
   * 世代交代の報告が出るまで進める。
   * 「1年進める」だと、3月に春の全国大会があった年は報告を飛び越してしまう
   */
  const playOneYear = playUntilNewSeason

  it('1年経つと3年生が抜け、新入生が加入する', () => {
    const before = startedGame({ seed: 71 })
    const thirdYearIds = before.players.filter((p) => p.grade === 3).map((p) => p.id)

    const after = playOneYear(before)

    expect(after.phase).toBe('newSeason')
    expect(after.pendingSeason).not.toBeNull()

    // 抜けた選手は在籍していない
    for (const id of thirdYearIds) {
      expect(after.players.some((p) => p.id === id)).toBe(false)
    }
    // OB名鑑に残っている（引退した時点で載る）
    expect(after.graduates.length).toBe(thirdYearIds.length)
  })

  it('3年生は夏の大会が終わった時点で引退する', () => {
    let state = startedGame({ seed: 73 })
    const thirdYearIds = state.players.filter((p) => p.grade === 3).map((p) => p.id)
    expect(thirdYearIds.length).toBeGreaterThan(0)

    // 夏の大会が終わるまで進める
    let guard = 0
    while (state.players.some((p) => p.grade === 3)) {
      state = playStep(state)
      if (++guard > 600) throw new Error('3年生が引退しない')
    }

    // まだ年度末ではない＝秋以降を新チームで戦う
    expect(state.phase).not.toBe('yearEnd')
    expect(state.month).toBeGreaterThanOrEqual(7)
    expect(state.month).toBeLessThanOrEqual(9)

    // 引退した時点でOB名鑑に載り、編成も組み直されている
    expect(state.graduates.length).toBe(thirdYearIds.length)
    expect(validateLineup(state.lineup, state.players)).toEqual([])
    expect(state.squad.every((id) => state.players.some((p) => p.id === id))).toBe(true)
  })

  it('卒業後もスタメンが成立している', () => {
    const after = playOneYear(startedGame({ seed: 72 }))
    expect(validateLineup(after.lineup, after.players)).toEqual([])
  })

  it('finishSeason で新年度が始まる', () => {
    const after = playOneYear(startedGame({ seed: 73 }))
    const { state: next } = applyCommand(after, { type: 'finishSeason' })

    expect(next.phase).toBe('cardSelect')
    expect(next.pendingSeason).toBeNull()
    expect(next.month).toBe(4)
    expect(next.year).toBe(2)
  })

  it('報告を閉じる前にカードを選んでも進まない', () => {
    const after = playOneYear(startedGame({ seed: 74 }))
    const { state: next } = applyCommand(after, {
      type: 'selectCard',
      cardId: after.hand[0].id,
    })
    expect(next).toBe(after)
  })

  it('何年繰り返しても部員が枯れず、状態が壊れない', () => {
    let state = startedGame({ seed: 75 })

    for (let year = 0; year < 6; year++) {
      state = playOneYear(state)
      state = applyCommand(state, { type: 'finishSeason' }).state

      expect(state.players.length).toBeGreaterThanOrEqual(9)
      expect(state.players.filter((p) => p.isPitcher).length).toBeGreaterThanOrEqual(1)
      expect(validateLineup(state.lineup, state.players)).toEqual([])
      expect(new Set(state.players.map((p) => p.id)).size).toBe(state.players.length)
      expect(state.graduates.length).toBeLessThanOrEqual(GRADUATES_LIMIT)
      expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    }

    expect(state.year).toBe(7)
  })

  it('評判は0〜100に収まる', () => {
    let state = startedGame({ seed: 76 })
    for (let year = 0; year < 4; year++) {
      state = playOneYear(state)
      state = applyCommand(state, { type: 'finishSeason' }).state
      expect(state.reputation).toBeGreaterThanOrEqual(0)
      expect(state.reputation).toBeLessThanOrEqual(100)
    }
  })
})

describe('大会', () => {
  /** 大会マスに止まるまで進める */
  const untilTournament = (state: GameState) => playUntilPhase(state, 'tournament')


  it('7月の大会マスに止まると夏の大会が始まる', () => {
    const next = untilTournament(startedGame({ seed: 81 }))

    expect(next.tournament).not.toBeNull()
    expect(next.tournament!.kind).toBe('summerPref')
    expect(next.month).toBe(7)
    // 大会マスは飛ばせないので、必ずその日に止まっている
    expect(next.board[next.boardPosition].kind).toBe('tournament')
  })

  it('地区によって回戦数が変わる', () => {
    const play = (regionId: string) =>
      untilTournament(startedGame({ seed: 82, regionId })).tournament!

    expect(play('kanagawa').totalRounds).toBe(8)
    expect(play('tottori').totalRounds).toBe(5)
  })

  it('大会中にカードを選んでも進まない', () => {
    const inTournament = untilTournament(startedGame({ seed: 83 }))
    const { state: next } = applyCommand(inTournament, {
      type: 'selectCard',
      cardId: inTournament.hand[0].id,
    })
    expect(next).toBe(inTournament)
  })

  it('地区大会はコールドあり、全国大会はコールドなし', () => {
    // 甲子園まで来た相手に「5回10点差で打ち切り」は成立しない
    const summer = untilTournament(startedGame({ seed: 8401 }))
    expect(summer.tournament!.kind).toBe('summerPref')

    const pref = applyCommand(summer, { type: 'playTournamentMatch' }).state
    expect(pref.pendingSetup!.mercy).toBe(true)

    // 同じ場面で大会だけ全国に差し替える
    const asNationals: GameState = {
      ...summer,
      tournament: { ...summer.tournament!, kind: 'nationals' },
    }
    const national = applyCommand(asNationals, { type: 'playTournamentMatch' }).state
    expect(national.pendingSetup!.mercy).toBe(false)
  })

  it('試合をすると勝敗が大会に反映される', () => {
    const inTournament = untilTournament(startedGame({ seed: 84 }))

    const checking = applyCommand(inTournament, { type: 'playTournamentMatch' }).state
    // まずスタメン確認へ。この時点ではまだ試合をしていない
    expect(checking.phase).toBe('lineupCheck')
    expect(checking.pendingSetup).not.toBeNull()
    expect(checking.pendingMatch).toBeNull()

    const playing = runMatch(checking)
    expect(playing.phase).toBe('match')
    expect(playing.pendingMatch).not.toBeNull()

    const after = endMatch(playing)
    expect(after.tournament!.results).toHaveLength(1)

    const result = after.tournament!.results[0]
    expect(result.won).toBe(after.tournament!.round === 2)
    expect(result.won).toBe(!after.tournament!.eliminated)

    // 勝てば盤面に戻って次の回戦のマスへ、負ければ大会の結果画面へ
    expect(after.phase).toBe(result.won ? 'cardSelect' : 'tournament')
  })

  it('勝つと次の回戦のマスが先に待っている', () => {
    // 1回戦に勝つまで探す
    for (let seed = 87; seed < 120; seed++) {
      const inTournament = untilTournament(startedGame({ seed }))
      const cell = inTournament.boardPosition

      const after = endMatch(
        runMatch(applyCommand(inTournament, { type: 'playTournamentMatch' }).state),
      )
      if (after.tournament!.eliminated) continue

      // その場から動かず、盤面の先に次の回戦のマスがある
      expect(after.boardPosition).toBe(cell)
      expect(after.phase).toBe('cardSelect')

      const next = after.board.find(
        (c) => c.index > cell && c.kind === 'tournament' && c.tournamentKind === 'summerPref',
      )
      expect(next).toBeDefined()
      expect(next!.round).toBe(2)
      return
    }
    throw new Error('1回戦に勝つ組み合わせが見つからない')
  })

  it('敗退すると残りの回戦のマスも消える', () => {
    for (let seed = 200; seed < 240; seed++) {
      const inTournament = untilTournament(startedGame({ seed }))
      const after = endMatch(
        runMatch(applyCommand(inTournament, { type: 'playTournamentMatch' }).state),
      )
      if (!after.tournament!.eliminated) continue

      const finished = applyCommand(after, { type: 'finishTournament' }).state
      expect(finished.board.some((c) => c.tournamentKind === 'summerPref')).toBe(false)
      return
    }
    throw new Error('1回戦で負ける組み合わせが見つからない')
  })

  it('大会が終わるとマスが普通のマスに戻り、先へ進める', () => {
    const inTournament = untilTournament(startedGame({ seed: 85 }))
    const day = inTournament.boardPosition
    const finished = applyCommand(playOutTournament(inTournament), {
      type: 'finishTournament',
    }).state

    expect(finished.tournament).toBeNull()
    expect(finished.phase).toBe('cardSelect')
    // 同じ日で大会が再開されないよう、マスは普通のマスに戻っている
    expect(finished.board[day].kind).not.toBe('tournament')

    // 実際に先へ進める
    const moved = applyCommand(finished, {
      type: 'selectCard',
      cardId: finished.hand[0].id,
    }).state
    expect(moved.boardPosition).toBeGreaterThan(day)
  })

  it('地区大会に優勝すると全国大会のマスが盤面に現れる', () => {
    // **1年目の弱小校では、まず優勝できない。**
    // どの県にも甲子園に手が届く筆頭校が必ずいるので、
    // 数年育ててから探す（校数の少ない鳥取でも同じ）。
    // 練習の伸びを下げたぶん、県を勝ち抜けるまでの年数も延びている
    for (let seed = 200; seed < 260; seed++) {
      let grown = startedGame({ seed, regionId: 'tottori' })
      for (let i = 0; i < 12; i++) grown = playYear(grown)
      const inTournament = untilTournament(grown)
      const played = playOutTournament(inTournament)
      if (!played.tournament!.champion) continue

      const finished = applyCommand(played, { type: 'finishTournament' }).state
      expect(finished.nationalsBerth).toBe(true)
      // 8月に全国大会のマスが立っている
      const cell = finished.board.find(
        (c) => c.kind === 'tournament' && c.tournamentKind === 'nationals',
      )
      expect(cell).toBeDefined()
      return
    }
    throw new Error('地区大会に優勝するシードが見つからない')
    // **明示的な上限を書く。** 12年ぶんを何シードも回すので、既定の5秒では足りない
  }, 300_000)

  it('1つ勝つたびにチームが伸びる（大会の終わりではなく試合ごと）', () => {
    // 伸びは小さいので、**総合が1上がるまで丸められて見えない**シードもある。
    // 勝ったシードを順に見て、伸びが出るものを探す
    for (let seed = 300; seed < 460; seed++) {
      const inTournament = untilTournament(startedGame({ seed, regionId: 'tottori' }))
      const before = new Map(
        inTournament.players.map((p) => [p.id, overallRating(p)] as const),
      )

      // 1試合だけ進める。勝てたシードを探す
      const played = runMatch(applyCommand(inTournament, { type: 'playTournamentMatch' }).state)
      const finished = applyCommand(played, { type: 'finishMatch' })
      if (!finished.state.tournament?.results.some((r) => r.won)) continue

      // **大会を終える前に**もう伸びている
      const grew = finished.state.players.filter(
        (player) => overallRating(player) > (before.get(player.id) ?? 0),
      )
      if (grew.length === 0) continue

      expect(
        finished.events.some(
          (event) => event.type === 'message' && event.text.includes('一回り大きくなった'),
        ),
      ).toBe(true)
      return
    }
    throw new Error('勝ったうえで総合が上がるシードが見つからない')
  })

  it('負けた試合では大会の経験による成長は起きない', () => {
    for (let seed = 400; seed < 480; seed++) {
      const inTournament = untilTournament(startedGame({ seed }))
      const played = runMatch(applyCommand(inTournament, { type: 'playTournamentMatch' }).state)
      const finished = applyCommand(played, { type: 'finishMatch' })
      if (finished.state.tournament?.results.some((r) => r.won)) continue

      expect(
        finished.events.some(
          (event) => event.type === 'message' && event.text.includes('一回り大きくなった'),
        ),
      ).toBe(false)
      return
    }
    throw new Error('1回戦で負けるシードが見つからない')
  })

  /**
   * 評判は**1試合ごとに動く**（matchReputation）ので、
   * 「大会に出れば上がる」ではなくなった。勝ち上がれば上がり、初戦で負ければ下がる。
   */
  it('勝ち上がれば評判が上がる', () => {
    for (let seed = 200; seed < 280; seed++) {
      const state = untilTournament(startedGame({ seed, regionId: 'tottori' }))
      const before = state.reputation
      const played = playOutTournament(state)
      if (played.tournament!.results.filter((r) => r.won).length < 2) continue

      const finished = applyCommand(played, { type: 'finishTournament' }).state
      expect(finished.reputation).toBeGreaterThan(before)
      return
    }
    throw new Error('2勝以上するシードが見つからない')
  })

  it('格下に初戦で敗れると評判が下がる', () => {
    // **格上に負けたことは責められない**（EXCUSE_RATE）。
    // 抽選なので1回戦から優勝候補と当たることがあり、
    // その敗戦まで罰していては「挑む」意味が無くなる
    for (let seed = 400; seed < 480; seed++) {
      const state = untilTournament(startedGame({ seed }))
      const before = state.reputation
      const played = playOutTournament(state)
      if (played.tournament!.results.some((r) => r.won)) continue

      // 相手がこちらより弱かった場合だけを見る
      const ourRating = teamRating(state.players, state.lineup)
      const opponent = opponentAt(state.tournament!.bracket, 1)
      if (!opponent || opponentRating(opponent.strength) >= ourRating) continue

      const finished = applyCommand(played, { type: 'finishTournament' }).state
      expect(finished.reputation).toBeLessThan(before)
      return
    }
    throw new Error('格下に初戦敗退するシードが見つからない')
  })

  it('1回戦から優勝候補と当たることがある', () => {
    // トーナメントなので、抽選で強豪と当たるのは当たり前。
    // 回戦ごとに難易度を決め打ちしていた頃は、1回戦は必ず格下だった
    let toughOpener = 0
    for (let seed = 500; seed < 560; seed++) {
      const state = untilTournament(startedGame({ seed }))
      const ourRating = teamRating(state.players, state.lineup)
      const opponent = opponentAt(state.tournament!.bracket, 1)
      if (opponent && opponentRating(opponent.strength) > ourRating + 4) toughOpener++
    }
    expect(toughOpener).toBeGreaterThan(0)
  })

  it('同じ大会に同じ学校は二度出てこない', () => {
    for (let seed = 600; seed < 640; seed++) {
      const bracket = untilTournament(startedGame({ seed })).tournament!.bracket
      const named = bracket.slots.filter((team) => team?.schoolId)
      expect(new Set(named.map((team) => team!.schoolId)).size).toBe(named.length)
    }
  })

  it('トーナメント表に参加校が並んでいる', () => {
    // **相手を決勝まで決め打ちするのをやめた。**
    // 参加校を全部ブラケットに並べ、勝ち上がりで相手が決まる
    const state = untilTournament(startedGame({ seed: 601 }))
    const tournament = state.tournament!
    const { bracket } = tournament

    expect(bracket.slots).toHaveLength(2 ** tournament.totalRounds)
    expect(bracket.slots.filter((team) => team !== null)).toHaveLength(tournament.entrants)
    expect(bracket.slots.filter((team) => team?.ours)).toHaveLength(1)
    // 1回戦の相手は決まっているが、2回戦の相手はまだ決まらない
    expect(opponentAt(bracket, 1)).not.toBeNull()
    expect(opponentAt(bracket, 2)).toBeNull()
  })

  it('自校が勝つと、他校同士の試合も同じ回戦ぶん解決される', () => {
    for (let seed = 700; seed < 760; seed++) {
      const state = untilTournament(startedGame({ seed }))
      const played = playOutTournament(state)
      const tournament = played.tournament!
      if (tournament.results.length === 0) continue

      // 戦った回戦ぶんは勝ち上がりが埋まっている
      expect(tournament.bracket.winners.length).toBeGreaterThanOrEqual(
        tournament.results.length,
      )
      // 敗退したら、そのあとの回戦まで消化して優勝校が決まる
      if (tournament.eliminated) {
        expect(championOf(tournament.bracket)).not.toBeNull()
      }
      return
    }
    throw new Error('大会を戦うシードが見つからない')
  })

  it('地区大会で優勝しないと全国大会は開かれない', () => {
    let state = startedGame({ seed: 87 })
    // 1年目を通しで進める。弱いチームなので夏は優勝できない想定
    for (let i = 0; i < 12; i++) {
      state = playUntilYearEnd(state)
      state = applyCommand(state, { type: 'advanceYear' }).state
    }
    // 8月に全国大会が始まっていたら nationalsBerth が立っていたはず
    expect(state.nationalsBerth).toBe(false)
  })

  it('何年進めても大会で進行が止まらない', () => {
    // 大会が始まる月は playMonth 1回で月が進まないため、年で数える
    let state = startedGame({ seed: 88 })
    for (let year = 0; year < 3; year++) {
      state = playYear(state)
      state = applyCommand(state, { type: 'finishSeason' }).state
    }
    expect(state.year).toBe(4)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('合宿', () => {
  /** 合宿マスに止まるまで進める */
  const reachCamp = (seed: number) => playUntilPhase(startedGame({ seed }), 'camp')

  it('最初に来るのは8月の夏合宿', () => {
    const state = reachCamp(91)
    expect(state.month).toBe(8)
    expect(state.phase).toBe('camp')
    // 合宿マスも飛ばせない
    expect(state.board[state.boardPosition].kind).toBe('camp')
  })

  it('方針を選ぶまでカードを選べない', () => {
    const state = reachCamp(92)
    const { state: next } = applyCommand(state, {
      type: 'selectCard',
      cardId: state.hand[0].id,
    })
    expect(next).toBe(state)
  })

  it('方針を選んでも能力値は伸びない。伸びるのは特殊能力', () => {
    const state = reachCamp(93)
    const sumMeet = (s: GameState) => s.players.reduce((t, p) => t + p.batting.meet, 0)
    const sumSkills = (s: GameState) => s.players.reduce((t, p) => t + p.skills.length, 0)
    const before = sumMeet(state)

    const { state: next } = applyCommand(state, { type: 'chooseCampPlan', planId: 'batting' })

    // 成果を一覧で見せてから盤面へ戻る
    expect(next.phase).toBe('campReport')
    expect(next.pendingCamp).not.toBeNull()
    expect(sumMeet(next)).toBe(before)
    expect(sumSkills(next)).toBeGreaterThanOrEqual(sumSkills(state))

    const closed = applyCommand(next, { type: 'closeCampReport' }).state
    expect(closed.phase).toBe('cardSelect')
    expect(closed.pendingCamp).toBeNull()
    // 合宿の余韻で練習効率バフが付く
    expect(next.practiceBoost).not.toBeNull()
  })

  it('存在しない方針は受け付けない', () => {
    const state = reachCamp(94)
    const { state: next } = applyCommand(state, { type: 'chooseCampPlan', planId: 'unknown' })
    expect(next).toBe(state)
  })

  it('合宿は年に2回（夏と冬）', () => {
    let state = reachCamp(95)
    expect(state.month).toBe(8)
    state = applyCommand(state, { type: 'chooseCampPlan', planId: 'batting' }).state

    // 年度末までに、もう1回だけ合宿が来る
    const months: number[] = []
    while (state.phase !== 'yearEnd') {
      state = playStep(state)
      if (state.phase === 'camp') months.push(state.month)
    }
    expect(months).toEqual([12])
  })
})

describe('春の全国大会', () => {
  it('秋季大会に優勝していないと開かれない', () => {
    let state = startedGame({ seed: 96 })
    state = playYear(state)
    // 3月を越えて4月になっている＝春の全国大会は挟まれていない
    expect(state.springBerth).toBe(false)
  })

  it('出場権があると3月に大会マスが立ち、終われば年度末まで進める', () => {
    // 秋季大会を制した状態を直接作る（盤面にも春の全国のマスを置く）
    const base = startedGame({ seed: 97 })
    const state: GameState = {
      ...base,
      springBerth: true,
      board: placeTournamentCells(base.board, 'springNationals', -1, 5),
    }

    const inTournament = playUntilPhase(state, 'tournament', {
      // 夏・秋の大会は素通りさせず、春に着くまで進める
      maxSteps: 600,
    })
    // 最初に当たるのは7月の地区大会なので、春まで消化する
    let current = inTournament
    let guard = 0
    while (current.tournament!.kind !== 'springNationals') {
      current = playOutTournament(current)
      current = applyCommand(current, { type: 'finishTournament' }).state
      current = playUntilPhase(current, 'tournament')
      if (++guard > 6) throw new Error('春の全国大会に到達しない')
    }

    expect(current.month).toBe(3)
    expect(current.tournament!.kind).toBe('springNationals')

    current = playOutTournament(current)
    const after = applyCommand(current, { type: 'finishTournament' }).state
    expect(after.phase).toBe('cardSelect')

    // 年度末まで進めば世代交代へ
    const nextYear = applyCommand(playUntilYearEnd(after), { type: 'advanceYear' }).state
    expect(nextYear.month).toBe(4)
    expect(nextYear.phase).toBe('newSeason')
    expect(nextYear.springBerth).toBe(false)
  })
})

describe('部費とショップ', () => {
  it('月が変わると部費が支給される', () => {
    const state = startedGame({ seed: 101 })
    // 4月中は支給されない。5月に入った時点で入る
    const next = playUntilMonth(state, 5)
    expect(next.funds).toBeGreaterThan(state.funds)
  })

  it('アイテムを買うと部費が減り、効果が出る', () => {
    const base = startedGame({ seed: 102 })
    const state: GameState = {
      ...base,
      funds: 100_000,
      players: base.players.map((p) => ({ ...p, condition: 40 })),
    }

    const { state: next } = applyCommand(state, { type: 'buyItem', itemId: 'drink' })

    expect(next.funds).toBe(100_000 - 12_000)
    expect(next.players[0].condition).toBe(65)
  })

  it('部費が足りないと買えない', () => {
    const base = startedGame({ seed: 103 })
    const state: GameState = { ...base, funds: 1000 }

    const { state: next } = applyCommand(state, { type: 'buyItem', itemId: 'machine' })
    expect(next).toBe(state)
  })

  it('存在しないアイテムは買えない', () => {
    const state = { ...startedGame({ seed: 104 }), funds: 999_999 }
    const { state: next } = applyCommand(state, { type: 'buyItem', itemId: 'unknown' })
    expect(next).toBe(state)
  })

  it('練習器具を買うと練習効率バフが付く', () => {
    const state: GameState = { ...startedGame({ seed: 105 }), funds: 100_000 }
    const { state: next } = applyCommand(state, { type: 'buyItem', itemId: 'gear' })
    expect(next.practiceBoost).toEqual({ multiplier: 1.5, remaining: 5 })
  })

  it('大会で1勝すると賞金が入る', () => {
    // 1勝できるシードを探す（初戦敗退だと賞金0で交通費だけ引かれる）
    for (let seed = 300; seed < 360; seed++) {
      let state = playUntilPhase(startedGame({ seed }), 'tournament')
      const beforeFunds = state.funds

      state = playOutTournament(state)
      const wins = state.tournament!.results.filter((r) => r.won).length
      if (wins < 2) continue

      const finished = applyCommand(state, { type: 'finishTournament' }).state
      // 賞金は入る。ただし球場までの交通費が引かれるので、残高は下がることもある
      expect(finished.log.some((entry) => entry.text.includes('大会の成績で'))).toBe(true)
      expect(beforeFunds).toBeGreaterThan(0)
      return
    }
    throw new Error('2勝するシードが見つからない')
  })
})

describe('練習方針とコンバート', () => {
  it('練習方針を指定できる', () => {
    const state = startedGame({ seed: 111 })
    const player = state.players.find((p) => !p.isPitcher)!

    const { state: next } = applyCommand(state, {
      type: 'setTrainingFocus',
      playerId: player.id,
      focus: { type: 'ability', key: 'meet' },
    })

    expect(next.players.find((p) => p.id === player.id)!.focus).toEqual({
      type: 'ability',
      key: 'meet',
    })
  })

  it('コンバートを指示すると、練習を重ねて適性が上がる', () => {
    const base = startedGame({ seed: 112 })
    const player = base.players.find((p) => !p.isPitcher)!
    const target = ALL_POSITIONS.find(
      (position) => position !== player.position && canConvert(player, position),
    )!
    const before = player.aptitudes[target]

    let state = applyCommand(base, {
      type: 'setTrainingFocus',
      playerId: player.id,
      focus: { type: 'convert', position: target },
    }).state

    // カード以外のフェーズ（試合・分岐など）を挟むので、余裕を持って回す
    const aptitudeOf = (s: GameState) => s.players.find((p) => p.id === player.id)!.aptitudes[target]
    for (let i = 0; i < CONVERT_STEPS * 4 && aptitudeOf(state) === before; i++) {
      state = playStep(state)
    }

    expect(aptitudeOf(state)).not.toBe(before)
    expect(state.log.some((entry) => entry.text.includes('適性が上がった'))).toBe(true)
  })

  it('本職はコンバート先に指定できない', () => {
    const state = startedGame({ seed: 113 })
    const player = state.players[0]

    const { state: next } = applyCommand(state, {
      type: 'setTrainingFocus',
      playerId: player.id,
      focus: { type: 'convert', position: player.position },
    })
    expect(next).toBe(state)
  })

  it('在籍していない選手は指定できない', () => {
    const state = startedGame({ seed: 114 })
    const { state: next } = applyCommand(state, {
      type: 'setTrainingFocus',
      playerId: 'ghost',
      focus: { type: 'ability', key: 'meet' },
    })
    expect(next).toBe(state)
  })

  it('同じ方針を指定し直しても状態は変わらない（進捗が消えない）', () => {
    const base = startedGame({ seed: 115 })
    const player = base.players[0]
    const state = applyCommand(base, {
      type: 'setTrainingFocus',
      playerId: player.id,
      focus: { type: 'ability', key: 'meet' },
    }).state

    const { state: next } = applyCommand(state, {
      type: 'setTrainingFocus',
      playerId: player.id,
      focus: { type: 'ability', key: 'meet' },
    })
    expect(next).toBe(state)
  })

  it('離脱中の選手はコンバート練習が進まない', () => {
    const base = startedGame({ seed: 116 })
    const player = base.players.find((p) => !p.isPitcher)!
    const target = ALL_POSITIONS.find(
      (position) => position !== player.position && canConvert(player, position),
    )!

    let state: GameState = {
      ...applyCommand(base, {
        type: 'setTrainingFocus',
        playerId: player.id,
        focus: { type: 'convert', position: target },
      }).state,
    }
    state = {
      ...state,
      players: state.players.map((p) => (p.id === player.id ? { ...p, injuryMonths: 3 } : p)),
    }

    state = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
    expect(state.players.find((p) => p.id === player.id)!.convertProgress ?? 0).toBe(0)
  })
})

describe('練習試合の相手選び', () => {
  /** 練習試合マスに止まり、成長の報告を閉じたところまで進める */
  function reachOffer(seed: number): GameState {
    const base = startedGame({ seed })
    const state: GameState = {
      ...base,
      board: base.board.map((_cell, index) =>
        index === 3 ? { index, kind: 'match' as const } : { index, kind: 'blank' as const },
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'batting' as const })),
      boardPosition: 0,
      funds: 500_000,
    }
    return stepCard(state)
  }

  it('候補が3つ出て、まだ試合は始まっていない', () => {
    const state = reachOffer(9101)
    expect(state.phase).toBe('matchOffer')
    expect(state.pendingOffers).toHaveLength(3)
    expect(state.pendingSetup).toBeNull()
  })

  it('県内（遠征費0）の候補が必ず入っている', () => {
    // 部費が無くても断らずに戦えるようにするための保証
    for (let seed = 9200; seed < 9240; seed++) {
      const state = reachOffer(seed)
      expect(state.pendingOffers!.some((offer) => offer.travelCost === 0)).toBe(true)
    }
  })

  it('選ぶとスタメン確認へ進む', () => {
    const state = reachOffer(9102)
    const offer = state.pendingOffers!.find((entry) => entry.travelCost === 0)!
    const next = applyCommand(state, {
      type: 'chooseFriendlyMatch',
      offerId: offer.id,
    }).state

    expect(next.phase).toBe('lineupCheck')
    expect(next.pendingOffers).toBeNull()
    expect(next.pendingSetup!.opponentName).toBe(offer.opponentName)
    // 県内なので部費は減らない
    expect(next.funds).toBe(state.funds)
  })

  it('遠征を選ぶと、そのときに初めて遠征費が引かれる', () => {
    for (let seed = 9300; seed < 9340; seed++) {
      const state = reachOffer(seed)
      const away = state.pendingOffers!.find((entry) => entry.travelCost > 0)
      if (!away) continue

      const next = applyCommand(state, {
        type: 'chooseFriendlyMatch',
        offerId: away.id,
      }).state

      expect(next.funds).toBe(state.funds - away.travelCost)
      expect(next.pendingSetup!.awayRegionName).toBe(away.regionName)
      // 他県まで出向くこと自体が知名度になる
      expect(next.reputation).toBeGreaterThan(state.reputation)
      return
    }
    throw new Error('遠征の候補が出なかった')
  })

  it('部費が足りない候補は選べない', () => {
    for (let seed = 9400; seed < 9440; seed++) {
      const rich = reachOffer(seed)
      const away = rich.pendingOffers!.find((entry) => entry.travelCost > 0)
      if (!away) continue

      const broke: GameState = { ...rich, funds: 0 }
      expect(
        applyCommand(broke, { type: 'chooseFriendlyMatch', offerId: away.id }).state,
      ).toBe(broke)
      return
    }
    throw new Error('遠征の候補が出なかった')
  })

  it('試合を行わないことも選べる', () => {
    const state = reachOffer(9103)
    const next = applyCommand(state, { type: 'chooseFriendlyMatch', offerId: null }).state

    expect(next.phase).toBe('cardSelect')
    expect(next.pendingOffers).toBeNull()
    expect(next.pendingSetup).toBeNull()
    expect(next.funds).toBe(state.funds)
  })

  it('選ぶまでカードを選べない', () => {
    const state = reachOffer(9104)
    expect(applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state).toBe(
      state,
    )
  })

  it('相手選びのままセーブできる形を保つ', () => {
    const state = reachOffer(9105)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('試合前のスタメン確認', () => {
  it('練習試合マスに止まると、まず確認画面になる（まだ試合をしていない）', () => {
    const base = startedGame({ seed: 801 })
    const state: GameState = {
      ...base,
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'match' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
      boardPosition: 0,
    }

    const next = acceptFriendly(stepCard(state))

    expect(next.phase).toBe('lineupCheck')
    expect(next.pendingSetup).not.toBeNull()
    expect(next.pendingSetup!.opponentName.length).toBeGreaterThan(0)
    // まだシミュレートしていない
    expect(next.pendingMatch).toBeNull()
  })

  it('確認画面で組み替えたスタメンが試合に反映される', () => {
    const base = startedGame({ seed: 802 })
    const before: GameState = {
      ...base,
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'match' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
      boardPosition: 0,
    }
    const checking = acceptFriendly(stepCard(before))

    // 1番と2番を入れ替えてから始める
    const slots = [...checking.lineup.slots]
    ;[slots[0], slots[1]] = [slots[1], slots[0]]
    const swapped = applyCommand(checking, { type: 'setLineup', lineup: { slots } }).state

    const playing = runMatch(swapped)
    expect(playing.phase).toBe('match')
    expect(playing.pendingMatch).not.toBeNull()
    // 1番打者として登録した選手が最初に打っている
    expect(playing.pendingMatch!.battingLines[0].playerId).toBe(slots[0].playerId)
  })

  it('確認画面の相手名がそのまま試合の相手になる', () => {
    const base = startedGame({ seed: 803 })
    const state: GameState = {
      ...base,
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'match' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
      boardPosition: 0,
    }
    const checking = acceptFriendly(stepCard(state))
    const playing = runMatch(checking)

    expect(playing.pendingMatch!.opponentName).toBe(checking.pendingSetup!.opponentName)
  })

  it('確認中はカードを選べない', () => {
    const base = startedGame({ seed: 804 })
    const state: GameState = {
      ...base,
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'match' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
      boardPosition: 0,
    }
    const checking = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

    const { state: next } = applyCommand(checking, {
      type: 'selectCard',
      cardId: checking.hand[0].id,
    })
    expect(next).toBe(checking)
  })

  it('確認画面でないときに startMatch を呼んでも何も起きない', () => {
    const state = startedGame({ seed: 805 })
    expect(applyCommand(state, { type: 'startMatch' }).state).toBe(state)
  })
})

describe('一軍（ベンチ入り）', () => {
  it('新規ゲームで定員ぶんの一軍が組まれている', () => {
    const state = startedGame({ seed: 701 })
    expect(state.squad).toHaveLength(FIRST_SQUAD_SIZE)
    // スタメンは全員一軍に含まれる
    for (const slot of state.lineup.slots) {
      expect(state.squad).toContain(slot.playerId)
    }
  })

  it('setSquad で入れ替えられる', () => {
    const base = startedGame({ seed: 702 })
    const outsider = base.players.find((player) => !base.squad.includes(player.id))!
    const next = [outsider.id, ...base.squad.slice(0, FIRST_SQUAD_SIZE - 1)]

    const { state } = applyCommand(base, { type: 'setSquad', squad: next })
    expect(state.squad[0]).toBe(outsider.id)
  })

  it('在籍していない選手や重複は落とす', () => {
    const base = startedGame({ seed: 703 })
    const id = base.players[0].id
    const { state } = applyCommand(base, {
      type: 'setSquad',
      squad: ['ghost', id, id],
    })

    expect(state.squad).not.toContain('ghost')
    expect(state.squad.filter((entry) => entry === id)).toHaveLength(1)
    // 足りなくても勝手には埋めない（埋めると二軍へ落とせなくなる）。
    // ただしスタメンは必ず含まれる
    for (const slot of state.lineup.slots) {
      expect(state.squad).toContain(slot.playerId)
    }
  })

  it('二軍へ落とした選手がその場で戻ってこない', () => {
    const base = startedGame({ seed: 707 })
    const starters = new Set(base.lineup.slots.map((slot) => slot.playerId))
    // スタメン以外のいちばん強い控えを落とす（自動補充なら真っ先に戻ってくる相手）
    const target = base.squad.find((id) => !starters.has(id))!

    const { state } = applyCommand(base, {
      type: 'setSquad',
      squad: base.squad.filter((id) => id !== target),
    })

    expect(state.squad).not.toContain(target)
    expect(state.squad.length).toBeLessThan(FIRST_SQUAD_SIZE)
  })

  it('スタメンは必ず一軍に含まれる', () => {
    const base = startedGame({ seed: 708 })
    const starter = base.lineup.slots[0].playerId

    const { state } = applyCommand(base, {
      type: 'setSquad',
      squad: base.squad.filter((id) => id !== starter),
    })
    expect(state.squad).toContain(starter)
  })

  it('同じ内容なら状態を変えない', () => {
    const base = startedGame({ seed: 704 })
    expect(applyCommand(base, { type: 'setSquad', squad: base.squad }).state).toBe(base)
  })

  it('二軍の選手は練習の伸びが鈍い', () => {
    const base = startedGame({ seed: 705 })
    const state: GameState = {
      ...base,
      // 1人だけ一軍にする
      squad: [base.players[0].id],
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'practice' as const } : cell,
      ),
      hand: base.hand.map((card) => ({
        ...card,
        number: 3 as const,
        kind: 'batting' as const,
      })),
      boardPosition: 0,
    }
    // repairSquad で繰り上がるので、繰り上がらない位置の選手で比べる
    const after = applyCommand(
      { ...state, squad: state.players.slice(0, FIRST_SQUAD_SIZE).map((p) => p.id) },
      { type: 'selectCard', cardId: state.hand[0].id },
    ).state

    const first = after.players[0]
    const second = after.players[after.players.length - 1]
    expect(after.squad).toContain(first.id)
    expect(after.squad).not.toContain(second.id)
  })

  it('卒業しても一軍の指定が壊れない', () => {
    let state = startedGame({ seed: 706 })
    state = playYear(state)
    state = applyCommand(state, { type: 'finishSeason' }).state

    expect(state.squad).toHaveLength(FIRST_SQUAD_SIZE)
    for (const id of state.squad) {
      expect(state.players.some((player) => player.id === id)).toBe(true)
    }
  })
})

describe('練習器具', () => {
  it('買うとその練習カードが手札に出るようになる', () => {
    const base: GameState = { ...startedGame({ seed: 601 }), funds: 500_000 }
    // 買う前は器具の要る練習が出ない
    expect(base.hand.every((card) => !requiresEquipment(card.kind))).toBe(true)

    const { state: next } = applyCommand(base, { type: 'buyEquipment', equipmentId: 'bench' })
    expect(next.equipment).toContain('bench')
    expect(next.funds).toBe(500_000 - findEquipment('bench')!.price)

    // 引き続けるとウエイトが出てくる
    // 手札に出るのは抽選なので1年ぶん回す。
    // 途中で壊れると出なくなるので、そのつど買い直して持ち続けさせる
    let state = next
    let seen = false
    while (state.phase !== 'yearEnd' && !seen) {
      if (!state.equipment.includes('bench')) {
        state = applyCommand({ ...state, funds: 500_000 }, {
          type: 'buyEquipment',
          equipmentId: 'bench',
        }).state
      }
      state = playStep(state)
      seen = state.hand.some((card) => card.kind === 'weight')
    }
    expect(seen).toBe(true)
  })

  it('部費が足りないと買えない', () => {
    const state: GameState = { ...startedGame({ seed: 602 }), funds: 100 }
    expect(applyCommand(state, { type: 'buyEquipment', equipmentId: 'bench' }).state).toBe(state)
  })

  it('同じ器具は二重に買えない', () => {
    const base: GameState = {
      ...startedGame({ seed: 603 }),
      funds: 500_000,
      equipment: ['bench'],
    }
    expect(applyCommand(base, { type: 'buyEquipment', equipmentId: 'bench' }).state).toBe(base)
  })

  it('知らない器具は買えない', () => {
    const state: GameState = { ...startedGame({ seed: 604 }), funds: 500_000 }
    expect(applyCommand(state, { type: 'buyEquipment', equipmentId: 'unknown' }).state).toBe(state)
  })

  it('壊れると持ち物から消え、その練習カードも手札から消える', () => {
    // 全部持たせて1年進めれば、いずれ壊れる
    let state: GameState = {
      ...startedGame({ seed: 605 }),
      equipment: EQUIPMENTS.map((equipment) => equipment.id),
    }

    let broke = false
    while (state.phase !== 'yearEnd' && !broke) {
      state = playStep(state)
      broke = state.equipment.length < EQUIPMENTS.length
    }

    expect(broke).toBe(true)
    expect(state.log.some((entry) => entry.text.includes('壊れて'))).toBe(true)

    // 使えない練習が手札に残っていない
    const usable = unlockedKinds(state.equipment)
    for (const card of state.hand) {
      if (requiresEquipment(card.kind)) {
        expect(usable).toContain(card.kind)
      }
    }
  })

  it('壊れても買い直せる', () => {
    const base: GameState = { ...startedGame({ seed: 606 }), funds: 500_000, equipment: [] }
    const bought = applyCommand(base, { type: 'buyEquipment', equipmentId: 'tee' }).state
    const lost: GameState = { ...bought, equipment: [], funds: 500_000 }

    const again = applyCommand(lost, { type: 'buyEquipment', equipmentId: 'tee' }).state
    expect(again.equipment).toContain('tee')
  })
})

describe('練習以外のカード', () => {
  /** その種別のカードだけを手札に持たせ、練習マスに止まらせる */
  function playCard(seed: number, kind: PracticeKind): GameState {
    const base = startedGame({ seed })
    const state: GameState = {
      ...base,
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'practice' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind })),
      boardPosition: 0,
    }
    return stepCard(state)
  }

  it('ミーティングで全員のやる気が上がる', () => {
    const before = startedGame({ seed: 501 })
    const after = playCard(501, 'meeting')

    const sum = (s: GameState) => s.players.reduce((total, p) => total + p.motivation, 0)
    expect(sum(after)).toBeGreaterThan(sum(before))
  })

  it('グラウンド整備で設備が1段階上がる', () => {
    const after = playCard(502, 'groundskeeping')
    expect(after.groundLevel).toBe(2)
    expect(after.log.some((entry) => entry.text.includes('整備した'))).toBe(true)
  })

  it('治療で離脱中の選手の復帰が早まる', () => {
    const base = startedGame({ seed: 503 })
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, injuryMonths: 3 } : p)),
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'practice' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'medical' as const })),
      boardPosition: 0,
    }

    const after = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
    expect(after.players[0].injuryMonths).toBe(2)
  })

  it('自主学習は信頼度が大きく上がる', () => {
    const before = startedGame({ seed: 504 })
    const after = playCard(504, 'study')

    const sum = (s: GameState) => s.players.reduce((total, p) => total + p.trust, 0)
    expect(sum(after)).toBeGreaterThan(sum(before))
  })

  it('息抜きは体力が回復する', () => {
    const base = startedGame({ seed: 505 })
    const tired: GameState = {
      ...base,
      players: base.players.map((p) => ({ ...p, condition: 40 })),
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'practice' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'outing' as const })),
      boardPosition: 0,
    }

    const after = applyCommand(tired, { type: 'selectCard', cardId: tired.hand[0].id }).state
    expect(after.players[0].condition).toBeGreaterThan(40)
  })

  it('全ての種別のカードが例外なく処理できる', () => {
    for (const kind of Object.keys(PRACTICE_DEFS) as PracticeKind[]) {
      const after = playCard(506, kind)
      expect(after.players).toHaveLength(startedGame({ seed: 506 }).players.length)
      expect(validateLineup(after.lineup, after.players)).toEqual([])
    }
  })
})

describe('グラウンド整備', () => {
  it('部費を払うとグラウンドが1段階上がる', () => {
    const state: GameState = { ...startedGame({ seed: 201 }), funds: 200_000 }
    const { state: next } = applyCommand(state, { type: 'upgradeGround' })

    expect(next.groundLevel).toBe(2)
    expect(next.funds).toBe(200_000 - groundUpgradeCost(1)!)
  })

  it('まとめて整備できる', () => {
    const state: GameState = { ...startedGame({ seed: 204 }), funds: 500_000 }
    const quote = groundUpgradeCostFor(state.groundLevel, 10)
    const { state: next } = applyCommand(state, { type: 'upgradeGround', steps: 10 })

    expect(next.groundLevel).toBe(state.groundLevel + 10)
    expect(next.funds).toBe(500_000 - quote.cost)
  })

  it('部費が足りないと整備できない', () => {
    const state: GameState = { ...startedGame({ seed: 202 }), funds: 1000 }
    expect(applyCommand(state, { type: 'upgradeGround' }).state).toBe(state)
  })

  it('最大まで上げるとそれ以上は整備できない', () => {
    const state: GameState = {
      ...startedGame({ seed: 203 }),
      funds: 99_999_999,
      groundLevel: GROUND_LEVEL_MAX,
    }
    expect(applyCommand(state, { type: 'upgradeGround' }).state).toBe(state)
  })

  it('放っておくとグラウンドは荒れて下がる', () => {
    // 荒れるのは毎月の抽選なので、**1シードでは引かない年もある**。
    // 荒れやすい高い段階で、いくつかのシードを1年ずつ回して確かめる
    let decayed = false

    for (let seed = 210; seed < 216 && !decayed; seed++) {
      let state: GameState = { ...startedGame({ seed }), groundLevel: 90 }
      while (state.phase !== 'yearEnd' && !decayed) {
        state = playStep(state)
        if (state.groundLevel < 90) decayed = true
      }
    }
    expect(decayed).toBe(true)
  })

  it('グラウンドを整備すると練習の伸びが良くなる', () => {
    const build = (groundLevel: number): number => {
      const base = startedGame({ seed: 204 })
      const state: GameState = {
        ...base,
        groundLevel,
        board: base.board.map((cell, index) =>
          index === 3 ? { index, kind: 'practice' as const } : cell,
        ),
        hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'batting' as const })),
        boardPosition: 0,
      }
      // **1手では丸めに埋もれる。** 何手か重ねてから比べる
      let current = state
      for (let i = 0; i < 12; i++) {
        current = applyCommand(current, { type: 'selectCard', cardId: current.hand[0].id }).state
        if (current.phase === 'growthReport') {
          current = applyCommand(current, { type: 'closeGrowthReport' }).state
        }
        if (current.phase !== 'cardSelect') break
      }
      return current.players.reduce((total, p) => total + p.batting.meet + p.batting.power, 0)
    }
    expect(build(5)).toBeGreaterThan(build(1))
  })

  it('マネージャーは部費では雇えない。最初は誰もいない', () => {
    const state = startedGame({ seed: 205 })
    expect(state.managers).toEqual([])
  })

  it('年度を重ねるとマネージャーが入部してくる。役割は重複しない', () => {
    // 入部は3年に1人ほどの確率なので、1シードでは出ない年もある
    let sawManager = false

    for (const seed of [206, 216, 226]) {
      let state = startedGame({ seed })
      for (let i = 0; i < 8; i++) {
        state = applyCommand(playYear(state), { type: 'finishSeason' }).state
        if (state.managers.length > 0) sawManager = true
        const roles = state.managers.map((m) => m.roleId)
        expect(new Set(roles).size).toBe(roles.length)
      }
    }

    expect(sawManager).toBe(true)
  })

  it('主務が在籍すると毎月の部費が増える', () => {
    const base = startedGame({ seed: 207 })
    const withChief: GameState = {
      ...base,
      managers: [{ id: 'm1', name: 'テスト 主務', roleId: 'chief', grade: 1, joinedYear: 1 }],
    }

    // 月をまたいだ時点の支給額で比べる
    const plain = playUntilMonth(base, 5).funds - base.funds
    const boosted = playUntilMonth(withChief, 5).funds - withChief.funds
    expect(boosted).toBeGreaterThan(plain)
  })

  it('トレーナーが在籍すると月替わりの体力回復が増える', () => {
    const base = startedGame({ seed: 208 })
    // 月替わりの回復だけを見たいので、体力を落とした状態から月をまたぐ
    const atMonthEnd: GameState = {
      ...base,
      players: base.players.map((p) => ({ ...p, condition: 30 })),
    }

    const average = (s: GameState) =>
      s.players.reduce((t, p) => t + p.condition, 0) / s.players.length

    // 同じ手順で進めるよう、休養カードを選ばない固定の選び方にする
    const plain = playUntilMonth(atMonthEnd, 5)
    const withTrainer = playUntilMonth(
      {
        ...atMonthEnd,
        managers: [
          { id: 'm1', name: 'テスト トレーナー', roleId: 'trainer', grade: 1, joinedYear: 1 },
        ],
      },
      5,
    )

    expect(average(withTrainer)).toBeGreaterThan(average(plain))
  })
})

describe('日付固定イベント', () => {
  it('4月は入学式でやる気が上がる', () => {
    // 4月は年度の初日だが、他の月と同じ月次処理を通すので行事も起きる
    const state = playYear(startedGame({ seed: 211 }))

    expect(state.month).toBe(4)
    expect(state.log.some((entry) => entry.text.includes('入学式'))).toBe(true)
  })

  it('決まった月に必ず行事が起きる', () => {
    let state = startedGame({ seed: 212 })
    const seen = new Set<string>()

    // ログは上限で切り捨てられるので、1手ごとに拾う
    while (state.phase !== 'yearEnd') {
      state = playStep(state)
      for (const entry of state.log) {
        if (entry.text.includes('猛暑')) seen.add('猛暑')
        if (entry.text.includes('体育祭')) seen.add('体育祭')
        if (entry.text.includes('初詣')) seen.add('初詣')
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})

describe('怪我と離脱', () => {
  /** 全員のスタミナを削って怪我が起きやすい赤マスに止める */
  function playBadCell(seed: number): GameState {
    const base = startedGame({ seed })
    const state: GameState = {
      ...base,
      players: base.players.map((p) => ({ ...p, condition: 15 })),
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'bad' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
      boardPosition: 0,
    }
    return stepCard(state)
  }

  it('赤マスで怪我が起きることがある', () => {
    let injured: GameState | null = null
    for (let seed = 0; seed < 60 && !injured; seed++) {
      const next = playBadCell(seed)
      if (next.players.some((p) => p.injuryMonths > 0)) injured = next
    }
    expect(injured).not.toBeNull()
    const hurt = injured!.players.find((p) => p.injuryMonths > 0)!
    expect(hurt.injuryMonths).toBeGreaterThanOrEqual(1)
    expect(hurt.injuryMonths).toBeLessThanOrEqual(3)
  })

  it('離脱中の選手は練習で伸びない', () => {
    const base = startedGame({ seed: 301 })
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, injuryMonths: 2 } : p)),
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'practice' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'batting' as const })),
      boardPosition: 0,
    }

    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
    expect(next.players[0].batting.meet).toBe(state.players[0].batting.meet)

    // 他の選手は伸びている。
    // **特定の1人で判定してはいけない。** 伸びやすさは選手ごとに違うので、
    // ミートが苦手な選手を引くとその1人だけ動かないことがある
    const grew = next.players.filter(
      (player, index) => index > 0 && player.batting.meet > state.players[index].batting.meet,
    )
    expect(grew.length).toBeGreaterThan(0)
  })

  it('離脱中の選手は体力も減らない', () => {
    const base = startedGame({ seed: 302 })
    // マスの効果で体力が動かないよう、何も起きないマスに止める
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, injuryMonths: 2, condition: 50 } : { ...p, condition: 50 },
      ),
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'blank' as const } : cell,
      ),
      hand: base.hand.map((card) => ({
        ...card,
        number: 3 as const,
        kind: 'batting' as const,
      })),
      boardPosition: 0,
    }
    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
    expect(next.players[0].condition).toBe(50)
    expect(next.players[1].condition).toBeLessThan(50)
  })

  it('離脱中の選手はスタメンから外れる', () => {
    const base = startedGame({ seed: 303 })
    const starterId = base.lineup.slots[0].playerId
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === starterId ? { ...p, injuryMonths: 2 } : p)),
      hand: base.hand.map((card) => ({ ...card, kind: 'batting' as const })),
    }

    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
    expect(next.lineup.slots.some((slot) => slot.playerId === starterId)).toBe(false)
    expect(validateLineup(next.lineup, next.players)).toEqual([])
  })

  it('月が変わると離脱期間が1つ減り、0で復帰する', () => {
    const base = startedGame({ seed: 304 })
    const injuredId = base.players[0].id

    /**
     * 月末のマスに置いて1マスだけ進める。
     * 自動プレイで月まで進めると、途中で治療カードや青マスを踏んで
     * 怪我が治ってしまい、離脱期間そのものを確かめられない。
     */
    function crossMonth(from: GameState, month: Month, date: number): GameState {
      const at: GameState = {
        ...from,
        boardPosition: cellOfDay(dayOf(month, date)),
        // 何も起きないマスと、効果を持たない打撃カードだけにする
        board: from.board.map((cell) =>
          cell.kind === 'goal' ? cell : { index: cell.index, kind: 'blank' as const },
        ),
        hand: from.hand.map((card) => ({
          ...card,
          number: 1 as const,
          kind: 'batting' as PracticeKind,
        })),
      }
      return stepCard(at)
    }

    let state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, injuryMonths: 2 } : p)),
    }

    state = crossMonth(state, 4, 30)
    expect(state.players.find((p) => p.id === injuredId)!.injuryMonths).toBe(1)

    state = crossMonth(state, 5, 31)
    expect(state.players.find((p) => p.id === injuredId)!.injuryMonths).toBe(0)
    expect(state.log.some((entry) => entry.text.includes('復帰'))).toBe(true)
  })
})

describe('投手の疲労', () => {
  /** 練習試合を1つ消化した状態を作る */
  function afterMatch(seed: number): GameState {
    const base = startedGame({ seed })
    const state: GameState = {
      ...base,
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'match' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
      boardPosition: 0,
    }
    const stopped = acceptFriendly(stepCard(state))
    return endMatch(runMatch(stopped))
  }

  it('投げた投手に疲労が溜まる', () => {
    const next = afterMatch(6001)
    const tired = next.players.filter((player) => (player.fatigue ?? 0) > 0)

    expect(tired.length).toBeGreaterThan(0)
    expect(tired.every((player) => player.isPitcher)).toBe(true)
  })

  it('野手には疲労が溜まらない', () => {
    const next = afterMatch(6002)
    expect(next.players.filter((p) => !p.isPitcher).every((p) => (p.fatigue ?? 0) === 0)).toBe(true)
  })

  it('日が進むと抜ける', () => {
    const after = afterMatch(6003)
    const before = after.players.map((p) => p.fatigue ?? 0)
    expect(Math.max(...before)).toBeGreaterThan(0)

    // 何も起きないマスだけにして、5日ぶん進める
    const state: GameState = {
      ...after,
      phase: 'cardSelect',
      board: after.board.map((cell) =>
        cell.kind === 'goal' ? cell : { index: cell.index, kind: 'blank' as const },
      ),
      hand: after.hand.map((card) => ({ ...card, number: 5 as const })),
    }
    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

    const total = (s: GameState) => s.players.reduce((sum, p) => sum + (p.fatigue ?? 0), 0)
    expect(total(next)).toBeLessThan(total(after))
  })

  it('年度をまたぐと完全に戻る', () => {
    const after = afterMatch(6004)
    const withTired = {
      ...after,
      players: after.players.map((p) => (p.isPitcher ? { ...p, fatigue: 90 } : p)),
    }
    const next = applyCommand(playYear(withTired), { type: 'advanceYear' }).state
    expect(next.players.every((p) => (p.fatigue ?? 0) === 0)).toBe(true)
  })

  it('おまかせ編成は疲れた投手を先発から外す', () => {
    const base = startedGame({ seed: 6005 })
    const pitchers = base.players.filter((p) => p.isPitcher)
    expect(pitchers.length).toBeGreaterThan(1)

    // いちばん良い投手だけ消耗させる
    const ace = [...pitchers].sort(
      (a, b) => (b.pitching?.stamina ?? 0) - (a.pitching?.stamina ?? 0),
    )[0]
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === ace.id ? { ...p, fatigue: 80 } : p)),
    }

    const next = applyCommand(state, { type: 'autoLineup' }).state
    const starterId = next.lineup.slots.find((slot) => slot.position === 'P')?.playerId
    expect(starterId).not.toBe(ace.id)
  })
})

describe('成長の報告', () => {
  /**
   * 指定した種類のマスへ、練習カードで止まる。
   *
   * **1手では誰も伸びない年もある**（1手あたりの伸びは1未満で、
   * 端数を確率で切り上げている）ので、報告が出るシードまで探す。
   */
  function stopOn(kind: 'blank' | 'match' | 'fork', seed: number): GameState {
    for (let offset = 0; offset < 40; offset++) {
      const base = startedGame({ seed: seed + offset * 101 })
      const state: GameState = {
        ...base,
        board: base.board.map((_cell, index) =>
          index === 3 ? { index, kind } : { index, kind: 'blank' as const },
        ),
        hand: base.hand.map((card) => ({ ...card, number: 3 as const, kind: 'batting' as const })),
        boardPosition: 0,
      }
      const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
      if (next.pendingGrowth && next.pendingGrowth.changes.length > 0) return next
    }
    throw new Error('成長の報告が出るシードが見つからない')
  }

  it('カードを使うと、まず成長の報告になる', () => {
    const next = stopOn('blank', 900)
    expect(next.phase).toBe('growthReport')
    expect(next.pendingGrowth).not.toBeNull()
    expect(next.pendingGrowth!.changes.length).toBeGreaterThan(0)
  })

  it('報告を閉じるまでカードを選べない', () => {
    const next = stopOn('blank', 901)
    expect(applyCommand(next, { type: 'selectCard', cardId: next.hand[0].id }).state).toBe(next)
  })

  it('閉じると練習フェーズへ戻る', () => {
    const next = applyCommand(stopOn('blank', 902), { type: 'closeGrowthReport' }).state
    expect(next.phase).toBe('cardSelect')
    expect(next.pendingGrowth).toBeNull()
  })

  it('試合マスでも、試合が始まる前に報告が挟まる', () => {
    // これが無いと、練習の結果を見る前に試合の画面へ飛んでしまう
    const next = stopOn('match', 903)
    expect(next.phase).toBe('growthReport')
    expect(next.pendingGrowth!.nextPhase).toBe('matchOffer')
    // 相手候補はもう出来ている（閉じればすぐ相手選び）
    expect(next.pendingOffers).not.toBeNull()

    const closed = applyCommand(next, { type: 'closeGrowthReport' }).state
    expect(closed.phase).toBe('matchOffer')
  })

  it('分岐マスでも、道を選ぶ前に報告が挟まる', () => {
    const next = stopOn('fork', 904)
    expect(next.phase).toBe('growthReport')
    expect(applyCommand(next, { type: 'closeGrowthReport' }).state.phase).toBe('fork')
  })

  it('伸びた選手がいなければ報告を挟まない', () => {
    // 能力を伸ばさないカード（休養）なら足止めしない
    const base = startedGame({ seed: 905 })
    const state: GameState = {
      ...base,
      board: base.board.map((_cell, index) => ({ index, kind: 'blank' as const })),
      hand: base.hand.map((card) => ({ ...card, number: 1 as const, kind: 'rest' as const })),
      boardPosition: 0,
      // 月をまたぐと急成長が起きることがあるので、月の途中に置く
      players: base.players.map((p) => ({ ...p, condition: 50 })),
    }
    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
    expect(next.phase).toBe('cardSelect')
    expect(next.pendingGrowth).toBeNull()
  })

  it('報告待ちのままセーブできる形を保つ', () => {
    const next = stopOn('match', 906)
    expect(JSON.parse(JSON.stringify(next))).toEqual(next)
  })
})

describe('個人イベント', () => {
  /** イベントマスに止まるまで進める */
  const reachEvent = (seed: number) => playUntilPhase(startedGame({ seed }), 'playerEvent')

  it('イベントマスに止まると選択待ちになる', () => {
    const state = reachEvent(301)
    expect(state.phase).toBe('playerEvent')
    expect(state.pendingEvent).not.toBeNull()
    expect(state.board[state.boardPosition].kind).toBe('event')
    // 対象は在籍している部員
    expect(state.players.some((p) => p.id === state.pendingEvent!.playerId)).toBe(true)
  })

  it('選ぶまでカードを選べない', () => {
    const state = reachEvent(302)
    const { state: next } = applyCommand(state, {
      type: 'selectCard',
      cardId: state.hand[0].id,
    })
    expect(next).toBe(state)
  })

  it('選ぶと結果が出て、練習フェーズへ戻る', () => {
    const state = reachEvent(303)
    const event = findPlayerEvent(state.pendingEvent!.eventId)!
    // **払える選択肢を選ぶ。** 先頭が部費の要る選択肢のこともあり、
    // 残高が足りないと（正しく）弾かれてフェーズが動かない
    const choice = event.choices.find((c) => (c.cost ?? 0) <= state.funds)!

    const { state: next, events } = applyCommand(state, {
      type: 'choosePlayerEventChoice',
      choiceId: choice.id,
    })

    expect(next.phase).toBe('cardSelect')
    expect(next.pendingEvent).toBeNull()
    expect(events.some((e) => e.type === 'message')).toBe(true)
  })

  it('存在しない選択肢は受け付けない', () => {
    const state = reachEvent(304)
    const { state: next } = applyCommand(state, {
      type: 'choosePlayerEventChoice',
      choiceId: 'unknown',
    })
    expect(next).toBe(state)
  })

  it('部費が足りない選択肢は選べない', () => {
    // 部費が要る選択肢を持つイベントに当たるまで探す
    for (let seed = 310; seed < 400; seed++) {
      const reached = playUntilPhase(startedGame({ seed }), 'playerEvent')
      const event = findPlayerEvent(reached.pendingEvent!.eventId)!
      const paid = event.choices.find((choice) => choice.cost !== undefined)
      if (!paid) continue

      const broke: GameState = { ...reached, funds: 0 }
      const { state: next } = applyCommand(broke, {
        type: 'choosePlayerEventChoice',
        choiceId: paid.id,
      })
      expect(next).toBe(broke)
      return
    }
    throw new Error('部費が要る選択肢のイベントに当たらなかった')
  })

  it('1年通しても進行が止まらず、セーブできる形のまま', () => {
    const state = playYear(startedGame({ seed: 305 }))
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('ルート分岐', () => {
  /** 分岐マスに止まった状態を作る */
  function reachFork(seed: number): GameState {
    const base = startedGame({ seed })
    const state: GameState = {
      ...base,
      board: base.board.map((cell, index) =>
        index === 3 ? { index, kind: 'fork' as const } : cell,
      ),
      hand: base.hand.map((card) => ({ ...card, number: 3 as const })),
      boardPosition: 0,
    }
    return stepCard(state)
  }

  it('分岐マスに止まると選択フェーズになる', () => {
    const state = reachFork(311)
    expect(state.phase).toBe('fork')
    expect(state.pendingFork).toBe(true)
  })

  it('選ぶまでカードを進められない', () => {
    const state = reachFork(312)
    const { state: next } = applyCommand(state, {
      type: 'selectCard',
      cardId: state.hand[0].id,
    })
    expect(next).toBe(state)
  })

  it('道筋を選ぶとこの先のマスが作り直される', () => {
    const state = reachFork(313)
    const before = state.board.map((cell) => cell.kind)

    const next = applyCommand(state, { type: 'chooseRoute', routeId: 'safe' }).state

    expect(next.phase).toBe('cardSelect')
    expect(next.pendingFork).toBe(false)
    // 通過済みのマスとゴールは変わらない
    expect(next.board[0].kind).toBe(before[0])
    expect(next.board[1].kind).toBe(before[1])
    expect(next.board[next.board.length - 1].kind).toBe('goal')
  })

  it('休養の道は休養マスが多くなる', () => {
    const countRest = (routeId: string): number => {
      let total = 0
      for (let seed = 0; seed < 30; seed++) {
        const state = reachFork(seed)
        const next = applyCommand(state, { type: 'chooseRoute', routeId }).state
        total += next.board.filter((cell) => cell.kind === 'rest').length
      }
      return total
    }
    expect(countRest('safe')).toBeGreaterThan(countRest('practice'))
  })

  it('練習の道は練習マスが多くなる', () => {
    const countPractice = (routeId: string): number => {
      let total = 0
      for (let seed = 0; seed < 30; seed++) {
        const state = reachFork(seed)
        const next = applyCommand(state, { type: 'chooseRoute', routeId }).state
        total += next.board.filter((cell) => cell.kind === 'practice').length
      }
      return total
    }
    expect(countPractice('practice')).toBeGreaterThan(countPractice('challenge'))
  })

  it('存在しない道筋は選べない', () => {
    const state = reachFork(314)
    expect(applyCommand(state, { type: 'chooseRoute', routeId: 'unknown' }).state).toBe(state)
  })
})

describe('決定性', () => {
  it('同じシード・同じ操作なら同じ結果になる', () => {
    const play = (): GameState => {
      let state = startedGame({ seed: 20260801 })
      for (let i = 0; i < 5; i++) {
        state = playUntilYearEnd(state)
        state = applyCommand(state, { type: 'advanceYear' }).state
      }
      return state
    }
    expect(play()).toEqual(play())
  })

  it('セーブ&ロードを挟んでも続きが変わらない', () => {
    let state = startedGame({ seed: 777 })
    state = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

    // 保存して復元したものと、そのまま続けたものが一致する
    const restored: GameState = JSON.parse(JSON.stringify(state))
    const a = applyCommand(state, { type: 'selectCard', cardId: state.hand[1].id }).state
    const b = applyCommand(restored, { type: 'selectCard', cardId: restored.hand[1].id }).state

    expect(b).toEqual(a)
  })
})

describe('試合中の選手交代', () => {
  /** スタメン確認まで進めてから試合を始める */
  function inMatch(seed: number): GameState {
    let state = playUntilPhase(startedGame({ seed }), 'lineupCheck')
    state = applyCommand(state, { type: 'startMatch' }).state
    return applyCommand(state, { type: 'advanceMatch' }).state
  }

  it('半回ずつ進み、決着すると結果が出る', () => {
    let state = inMatch(4001)
    expect(state.phase).toBe('match')
    expect(state.matchState).not.toBeNull()
    expect(state.pendingMatch).toBeNull()

    let guard = 0
    while (state.matchState) {
      state = applyCommand(state, { type: 'advanceMatch' }).state
      if (++guard > 60) throw new Error('試合が終わらない')
    }

    expect(state.pendingMatch).not.toBeNull()
    // **コールドで終わることもある**（5回10点差・7回7点差）ので、
    // 「9回まで」ではなく「決着まで進んだか」で見る
    expect(state.pendingMatch!.innings.length).toBeGreaterThanOrEqual(5)
    expect(state.pendingMatch!.outcome).not.toBe('draw')
  })

  it('半回ずつ進めても、一気に進めても結果は同じ', () => {
    const start = applyCommand(
      playUntilPhase(startedGame({ seed: 4002 }), 'lineupCheck'),
      { type: 'startMatch' },
    ).state

    let stepped = start
    let guard = 0
    while (stepped.matchState) {
      stepped = applyCommand(stepped, { type: 'advanceMatch' }).state
      if (++guard > 60) throw new Error('試合が終わらない')
    }

    const atOnce = applyCommand(start, { type: 'advanceMatch', toEnd: true }).state

    expect(stepped.pendingMatch).toEqual(atOnce.pendingMatch)
  })

  it('控えの選手をスタメンと入れ替えられる', () => {
    const state = inMatch(4003)
    const before = state.matchState!
    const bench = benchPlayers(before.home)
    expect(bench.length).toBeGreaterThan(0)

    // 投手以外の枠に、投手でない控えを入れる
    const slotIndex = before.home.lineup.slots.findIndex((slot) => slot.position !== 'P')
    const incoming = bench.find((player) => !player.isPitcher)!
    const outgoingId = before.home.lineup.slots[slotIndex].playerId

    const after = applyCommand(state, {
      type: 'substitutePlayer',
      slotIndex,
      playerId: incoming.id,
    }).state

    expect(after.matchState!.home.lineup.slots[slotIndex].playerId).toBe(incoming.id)
    // 退いた選手は戻れない
    expect(after.matchState!.home.retiredIds).toContain(outgoingId)
    expect(benchPlayers(after.matchState!.home).map((p) => p.id)).not.toContain(outgoingId)
  })

  it('一度退いた選手は再び出せない', () => {
    const state = inMatch(4004)
    const slotIndex = state.matchState!.home.lineup.slots.findIndex((s) => s.position !== 'P')
    const outgoingId = state.matchState!.home.lineup.slots[slotIndex].playerId
    const incoming = benchPlayers(state.matchState!.home).find((p) => !p.isPitcher)!

    const after = applyCommand(state, {
      type: 'substitutePlayer',
      slotIndex,
      playerId: incoming.id,
    }).state

    // 退いた選手を戻そうとしても何も起きない
    const retry = applyCommand(after, {
      type: 'substitutePlayer',
      slotIndex,
      playerId: outgoingId,
    }).state
    expect(retry).toBe(after)
  })

  it('投手の枠には投手しか入れられない', () => {
    const state = inMatch(4005)
    const slotIndex = state.matchState!.home.lineup.slots.findIndex((s) => s.position === 'P')
    const fielder = benchPlayers(state.matchState!.home).find((p) => !p.pitching)
    if (!fielder) return

    const after = applyCommand(state, {
      type: 'substitutePlayer',
      slotIndex,
      playerId: fielder.id,
    }).state
    expect(after).toBe(state)
  })

  it('ベンチ外の選手は試合に連れて行かれない', () => {
    const state = inMatch(4006)
    const squad = new Set(
      playUntilPhase(startedGame({ seed: 4006 }), 'lineupCheck').squad,
    )
    for (const player of state.matchState!.home.players) {
      expect(squad.has(player.id)).toBe(true)
    }
  })
})

describe('試合での成長', () => {
  it('活躍した選手は試合後に伸びる', () => {
    let found = false

    for (let seed = 1; seed <= 12 && !found; seed++) {
      let state = playUntilPhase(startedGame({ seed }), 'lineupCheck')
      state = runMatch(state)
      const before = new Map(state.players.map((p) => [p.id, overallRating(p)]))

      const after = applyCommand(state, { type: 'finishMatch' })
      // ability イベントには**下降も含まれる**（打てなかった選手は落ちる）ので、
      // イベントの有無ではなく「総合が上がった選手が居るか」で見る
      const grown = after.state.players.filter(
        (player) => overallRating(player) > (before.get(player.id) ?? 0),
      )
      if (grown.length > 0) found = true
    }

    expect(found).toBe(true)
  })
})

describe('スカウト', () => {
  /** スカウトが解禁される10月まで進める */
  function untilScoutOpen(seed: number, funds = 900_000): GameState {
    let state = startedGame({ seed })
    let guard = 0
    while (state.month !== SCOUT_OPEN_MONTH) {
      state = playStep(state)
      if (++guard > 600) throw new Error('スカウトが解禁されない')
    }
    return { ...state, funds }
  }

  /** 地元の県を視察した状態にする */
  function visited(seed: number, funds = 900_000): GameState {
    const state = untilScoutOpen(seed, funds)
    return applyCommand(state, { type: 'visitScoutRegion', regionId: state.regionId }).state
  }

  it('視察するまで候補は挙がらない', () => {
    const state = untilScoutOpen(5001)
    expect(state.scouting.regions).toEqual([])
    expect(state.scouting.visiting).toBeNull()
  })

  it('県を視察すると出張費を払って候補が挙がる', () => {
    const before = untilScoutOpen(5002)
    const home = findRegion(before.regionId)
    const cost = scoutTripCost(home, home)

    const after = applyCommand(before, {
      type: 'visitScoutRegion',
      regionId: before.regionId,
    }).state

    expect(after.funds).toBe(before.funds - cost)
    expect(after.scouting.visiting).toBe(before.regionId)

    const region = findScoutRegion(after.scouting, before.regionId)!
    expect(region.prospects).toHaveLength(PROSPECTS_PER_REGION)
    expect(region.visits).toBe(1)
  })

  it('遠い県ほど出張費が高い', () => {
    const state = untilScoutOpen(5003)
    const home = findRegion(state.regionId)

    const near = applyCommand(state, {
      type: 'visitScoutRegion',
      regionId: state.regionId,
    }).state
    const far = applyCommand(state, { type: 'visitScoutRegion', regionId: 'okinawa' }).state

    expect(state.funds - far.funds).toBeGreaterThan(state.funds - near.funds)
    expect(scoutTripCost(home, findRegion('okinawa'))).toBeGreaterThan(scoutTripCost(home, home))
  })

  it('部費が足りなければ視察に出られない', () => {
    const state = untilScoutOpen(5004, 0)
    expect(
      applyCommand(state, { type: 'visitScoutRegion', regionId: state.regionId }).state,
    ).toBe(state)
  })

  it('出張中は別の県へ行けない（まず誰かに会う）', () => {
    const state = visited(5005)
    expect(applyCommand(state, { type: 'visitScoutRegion', regionId: 'osaka' }).state).toBe(
      state,
    )
  })

  it('1回の出張で会えるのは1人だけ', () => {
    const state = visited(5006)
    const region = findScoutRegion(state.scouting, state.regionId)!
    const [first, second] = region.prospects

    const after = applyCommand(state, {
      type: 'approachProspect',
      prospectId: first.id,
    }).state

    // 出張を使い切ったので、次の選手には会えない
    expect(after.scouting.visiting).toBeNull()
    expect(
      applyCommand(after, { type: 'approachProspect', prospectId: second.id }).state,
    ).toBe(after)
  })

  it('出張は1年に MAX_SCOUT_TRIPS 回まで', () => {
    // **部費だけが制約だと、貯まった時点で制約が消える。**
    // 900,000円あれば全県の候補を総なめにできてしまっていた
    let state = untilScoutOpen(5020, 9_000_000)

    for (let i = 0; i < MAX_SCOUT_TRIPS; i++) {
      state = applyCommand(state, { type: 'visitScoutRegion', regionId: state.regionId }).state
      expect(state.scouting.trips).toBe(i + 1)

      // 次の出張に出るには、まず誰かに会って今回の出張を使い切る。
      // 同じ選手には MAX_APPROACHES 回しか会えないので、毎回別の選手にする
      const region = findScoutRegion(state.scouting, state.regionId)!
      state = applyCommand(state, {
        type: 'approachProspect',
        prospectId: region.prospects[i].id,
      }).state
    }

    const funds = state.funds
    const after = applyCommand(state, {
      type: 'visitScoutRegion',
      regionId: state.regionId,
    }).state

    // 回数を使い切ったら、部費が有り余っていても出られない
    expect(after).toBe(state)
    expect(after.funds).toBe(funds)
  })

  it('会いに行くと見込みが上がる', () => {
    const state = visited(5007)
    const target = findScoutRegion(state.scouting, state.regionId)!.prospects[0]
    const before = successChance(target, state.reputation)

    const after = applyCommand(state, {
      type: 'approachProspect',
      prospectId: target.id,
    }).state

    const updated = findScoutRegion(after.scouting, after.regionId)!.prospects.find(
      (p) => p.id === target.id,
    )!
    expect(updated.approaches).toBe(1)
    expect(successChance(updated, after.reputation)).toBeGreaterThan(before)
  })

  it('同じ県へ通い直すと、同じ候補にまた会える', () => {
    let state = visited(5008)
    const target = findScoutRegion(state.scouting, state.regionId)!.prospects[0]

    for (let i = 0; i < 3; i++) {
      state = applyCommand(state, { type: 'approachProspect', prospectId: target.id }).state
      state = applyCommand(state, {
        type: 'visitScoutRegion',
        regionId: state.regionId,
      }).state
    }

    const region = findScoutRegion(state.scouting, state.regionId)!
    // 候補の顔ぶれは変わらない
    expect(region.prospects.map((p) => p.id)).toContain(target.id)
    expect(region.prospects.find((p) => p.id === target.id)!.approaches).toBe(3)
    expect(region.visits).toBe(4)
  })

  it('決めた回数までしか通えない', () => {
    let state = visited(5009)
    const id = findScoutRegion(state.scouting, state.regionId)!.prospects[0].id

    for (let i = 0; i < MAX_APPROACHES + 2; i++) {
      state = applyCommand(state, { type: 'approachProspect', prospectId: id }).state
      state = applyCommand(state, {
        type: 'visitScoutRegion',
        regionId: state.regionId,
      }).state
    }

    const prospect = findScoutRegion(state.scouting, state.regionId)!.prospects.find(
      (p) => p.id === id,
    )!
    expect(prospect.approaches).toBe(MAX_APPROACHES)
  })

  it('会いに行かなかった候補も、進学先が分かる', () => {
    let state = visited(5010)
    const id = findScoutRegion(state.scouting, state.regionId)!.prospects[0].id
    state = applyCommand(state, { type: 'approachProspect', prospectId: id }).state

    const next = playYear(state)
    const results = next.pendingSeason!.scoutResults

    // 視察した県の候補は全員ぶん結果が出る
    expect(results).toHaveLength(PROSPECTS_PER_REGION)
    expect(results.filter((r) => r.approached)).toHaveLength(1)
    for (const result of results) {
      if (result.joined) continue
      expect(result.schoolName).toBeTruthy()
      expect(result.regionName).toBeTruthy()
    }
  })

  it('U15代表は最初から30人見えている', () => {
    const state = startedGame({ seed: 5100 })
    expect(state.scouting.nationalTeam).toHaveLength(NATIONAL_TEAM_SIZE)
    // 視察しなくても顔ぶれが分かる
    expect(state.scouting.regions).toHaveLength(0)
  })

  it('代表に会いに行くと出張費がかかり、訪問回数が増える', () => {
    const base = startedGame({ seed: 5101 })
    const state: GameState = { ...base, month: SCOUT_OPEN_MONTH, funds: 200000 }
    const target = state.scouting.nationalTeam[0]

    const next = applyCommand(state, {
      type: 'approachNationalProspect',
      prospectId: target.id,
    }).state

    expect(next.funds).toBeLessThan(state.funds)
    expect(next.scouting.nationalTeam[0].approaches).toBe(1)
  })

  it('部費が足りなければ代表には会えない', () => {
    const base = startedGame({ seed: 5102 })
    const state: GameState = { ...base, month: SCOUT_OPEN_MONTH, funds: 0 }
    const target = state.scouting.nationalTeam[0]

    const next = applyCommand(state, {
      type: 'approachNationalProspect',
      prospectId: target.id,
    }).state
    expect(next.scouting.nationalTeam[0].approaches).toBe(0)
  })

  it('解禁前は代表にも会えない', () => {
    const base = startedGame({ seed: 5103 })
    const state: GameState = { ...base, month: 6, funds: 200000 }
    const target = state.scouting.nationalTeam[0]

    const next = applyCommand(state, {
      type: 'approachNationalProspect',
      prospectId: target.id,
    }).state
    expect(next.scouting.nationalTeam[0].approaches).toBe(0)
    expect(next.funds).toBe(state.funds)
  })

  it('会いに行っていない代表は報告に並ばない（30人ぶん流れない）', () => {
    const state = startedGame({ seed: 5104 })
    const next = playYear(state)
    expect(next.pendingSeason!.scoutResults).toHaveLength(0)
  })

  it('会いに行った代表は報告に載る', () => {
    const base = startedGame({ seed: 5105 })
    let state: GameState = { ...base, month: SCOUT_OPEN_MONTH, funds: 400000 }
    const target = state.scouting.nationalTeam[0]

    state = applyCommand(state, {
      type: 'approachNationalProspect',
      prospectId: target.id,
    }).state

    const next = playYear(state)
    const results = next.pendingSeason!.scoutResults
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe(target.name)
  })

  it('年度が替わると代表も選び直される', () => {
    const state = startedGame({ seed: 5106 })
    const before = state.scouting.nationalTeam.map((p) => p.id)

    const next = applyCommand(playYear(state), { type: 'advanceYear' }).state
    expect(next.scouting.nationalTeam).toHaveLength(NATIONAL_TEAM_SIZE)
    expect(next.scouting.nationalTeam.map((p) => p.id)).not.toEqual(before)
  })

  it('年度が替わると訪問の記録は消える', () => {
    let state = visited(5011)
    const id = findScoutRegion(state.scouting, state.regionId)!.prospects[0].id
    state = applyCommand(state, { type: 'approachProspect', prospectId: id }).state

    const next = playYear(state)
    expect(next.scouting.regions).toEqual([])
    expect(next.scouting.visiting).toBeNull()
  })

  it('獲得できた選手は1年生として入部する', () => {
    // 評判を上げて何度も通えば、いずれ獲れる
    let found = false

    for (let seed = 6000; seed < 6014 && !found; seed++) {
      let state = { ...visited(seed), reputation: 95 }
      const target = findScoutRegion(state.scouting, state.regionId)!.prospects[0]

      for (let i = 0; i < MAX_APPROACHES; i++) {
        state = applyCommand(state, {
          type: 'approachProspect',
          prospectId: target.id,
        }).state
        state = applyCommand(state, {
          type: 'visitScoutRegion',
          regionId: state.regionId,
        }).state
      }

      const next = playYear(state)
      const result = next.pendingSeason!.scoutResults.find((r) => r.name === target.name)
      if (result?.joined) {
        const joined = next.players.find((player) => player.name === target.name)
        expect(joined).toBeDefined()
        expect(joined!.grade).toBe(1)
        // 触れ込みの特殊能力を持って入学してくる
        if (target.skillId) expect(joined!.skills).toContain(target.skillId)
        found = true
      }
    }

    expect(found).toBe(true)
  }, 60000)
})

describe('ライバル校', () => {
  it('新規ゲームで県内と全国の学校が用意される', () => {
    const state = startedGame({ seed: 7001 })
    expect(localRivals(state.rivals, state.regionId).length).toBeGreaterThan(0)
    expect(nationalRivals(state.rivals, state.regionId).length).toBeGreaterThan(0)
  })

  it('年をまたぐと戦力が動く', () => {
    const state = startedGame({ seed: 7002 })
    const before = state.rivals.map((school) => school.strength)
    const after = playYear(state).rivals.map((school) => school.strength)

    expect(after).not.toEqual(before)
  })

  it('全国大会の相手は県外の学校から選ばれ、代表県が分かる', () => {
    // 夏の地区大会を優勝して全国へ出るまで進める
    let found = false

    /*
     * 鳥取（24校＝5回戦）でも全国に届くのは稀なので、何度も試す。
     *
     * **1年目では届かない。** 初期部員は弱小校の水準（`INITIAL_TALENT`）で、
     * 引き継いだチームのまま県を勝ち抜けることはまず無い。
     * 何年か育ててから探す。
     */
    for (let seed = 8000; seed < 8600 && !found; seed++) {
      let state = startedGame({ seed, regionId: 'tottori' })
      for (let year = 0; year < 4; year++) {
        state = playUntilYearEnd(state, { chooseCard: (s) => s.hand[0].id })
        state = applyCommand(state, { type: 'advanceYear' }).state
      }

      for (let guard = 0; guard < 600 && !found; guard++) {
        if (state.phase === 'yearEnd') break

        // 全国大会の回戦マスに着いたら、そこで相手を確かめる
        if (
          state.phase === 'tournament' &&
          state.tournament?.kind === 'nationals' &&
          !isTournamentOver(state.tournament)
        ) {
          const setup = applyCommand(state, { type: 'playTournamentMatch' }).state
            .pendingSetup!
          const names = nationalRivals(state.rivals, state.regionId).map((s) => s.name)

          // **甲子園は49校。持っている県外の学校（20校）では足りない**ので、
          // 残りはその大会限りの代表校で埋まる。
          // 実在の学校が当たったときだけ、代表県が出ることを確かめる
          if (names.includes(setup.opponentName)) {
            expect(setup.opponentRegionName).toBeTruthy()
            expect(setup.opponentRegionName).not.toBe('鳥取')
            found = true
            break
          }
        }
        state = playStep(state)
      }
    }

    expect(found).toBe(true)
  }, 120000)

  it('地区大会の相手は県内の学校から選ばれる', () => {
    const state = playUntilPhase(startedGame({ seed: 7003 }), 'tournament')
    const checking = applyCommand(state, { type: 'playTournamentMatch' }).state

    expect(localRivals(state.rivals, state.regionId).map((school) => school.name)).toContain(
      checking.pendingSetup!.opponentName,
    )
  })
})

describe('新年度の学校の変更', () => {
  /** 世代交代の報告が出た状態にする */
  function atNewSeason(seed: number): GameState {
    return playYear(startedGame({ seed }))
  }

  it('何も指定しなければ変更なし', () => {
    const before = atNewSeason(9001)
    const after = applyCommand(before, { type: 'finishSeason' }).state

    expect(after.schoolName).toBe(before.schoolName)
    expect(after.uniform).toBe(before.uniform)
    expect(after.regionId).toBe(before.regionId)
    expect(after.rivals).toBe(before.rivals)
  })

  it('学校名とユニフォームを変えられる', () => {
    const before = atNewSeason(9002)
    const after = applyCommand(before, {
      type: 'finishSeason',
      schoolName: '新星高校',
      uniform: 'crimson',
    }).state

    expect(after.schoolName).toBe('新星高校')
    expect(after.uniform).toBe('crimson')
  })

  it('空の学校名は無視する（名無しの学校を作らない）', () => {
    const before = atNewSeason(9003)
    const after = applyCommand(before, { type: 'finishSeason', schoolName: '   ' }).state
    expect(after.schoolName).toBe(before.schoolName)
  })

  it('知らないユニフォームは既定に落とす', () => {
    const before = atNewSeason(9004)
    const after = applyCommand(before, {
      type: 'finishSeason',
      uniform: 'そんな色は無い' as never,
    }).state
    expect(after.uniform).toBe(DEFAULT_UNIFORM)
  })

  it('所在地を変えると県内のライバル校が入れ替わる', () => {
    const before = atNewSeason(9005)
    const after = applyCommand(before, { type: 'finishSeason', regionId: 'tottori' }).state

    expect(after.regionId).toBe('tottori')
    expect(localRivals(after.rivals, 'tottori').length).toBeGreaterThan(0)
    // 引っ越し前の県の学校は残らない
    expect(localRivals(after.rivals, before.regionId)).toEqual([])
  })

  it('所在地を変えても県外の学校（＝甲子園で当たる相手）は残る', () => {
    const before = atNewSeason(9006)
    const outside = nationalRivals(before.rivals, before.regionId)
      .filter((school) => school.regionId !== 'tottori')
      .map((school) => school.id)

    const after = applyCommand(before, { type: 'finishSeason', regionId: 'tottori' }).state
    const ids = after.rivals.map((school) => school.id)

    for (const id of outside) expect(ids).toContain(id)
  })

  it('新年度以外では変更できない', () => {
    const state = startedGame({ seed: 9007 })
    expect(applyCommand(state, { type: 'finishSeason', schoolName: '別の高校' }).state).toBe(
      state,
    )
  })
})

describe('成長方針（ポジションごとの優先順）', () => {
  it('並べ替えると保存され、伸び方が変わる', () => {
    const base = startedGame({ seed: 810 })
    const order: GrowableKey[] = ['speed', 'meet', 'power', 'fielding', 'catching', 'arm']

    const next = applyCommand(base, { type: 'setGrowthOrder', position: '1B', order }).state

    expect(next.growthPlan?.['1B']).toEqual(order)
    // 走力を最優先にしたので、既定（パワー最優先）より走力が伸びやすい
    expect(positionGrowthMultiplier('1B', 'speed', next.growthPlan)).toBeGreaterThan(
      positionGrowthMultiplier('1B', 'speed'),
    )
  })

  it('既定と同じ並びに戻すと、指定そのものが消える', () => {
    // セーブに要らないものを残さない
    const base = startedGame({ seed: 811 })
    const changed = applyCommand(base, {
      type: 'setGrowthOrder',
      position: 'CF',
      order: ['meet', 'speed', 'fielding', 'arm', 'power', 'catching'],
    }).state
    expect(changed.growthPlan?.CF).toBeTruthy()

    const restored = applyCommand(changed, {
      type: 'setGrowthOrder',
      position: 'CF',
      order: defaultGrowthOrder('CF'),
    }).state
    expect(restored.growthPlan).toBeUndefined()
  })

  it('練習の伸び方に実際に効く', () => {
    // 一塁手を「走力最優先」にすると、走力が伸びやすくなる
    const base = startedGame({ seed: 812 })
    const firstBaseman = base.players.find((p) => p.position === '1B')
    if (!firstBaseman) return

    const speedFirst: GrowableKey[] = ['speed', 'meet', 'power', 'fielding', 'catching', 'arm']
    const planned = applyCommand(base, {
      type: 'setGrowthOrder',
      position: '1B',
      order: speedFirst,
    }).state

    const grow = (state: GameState) => {
      let current = state
      for (let i = 0; i < 30; i++) current = stepCard(current)
      return current.players.find((p) => p.id === firstBaseman.id)!.batting.speed
    }

    expect(grow(planned)).toBeGreaterThanOrEqual(grow(base))
  })
})

describe('治療カード', () => {
  it('怪我人がいない間は手札に出ない', () => {
    let state = startedGame({ seed: 44 })

    for (let i = 0; i < 120; i++) {
      const injured = state.players.some((player) => player.injuryMonths > 0)
      if (!injured) {
        expect(state.hand.map((card) => card.kind)).not.toContain('medical')
      }
      state = playStep(state)
      if (state.phase === 'yearEnd') break
    }
  }, 60000)
})

describe('新入部員の一覧', () => {
  it('スカウトで獲った選手も新入生に並ぶ', () => {
    // **通って獲った選手が一覧に出てこなかった。**
    // 名簿には加わるのに、世代交代の画面では別扱いだった。
    // 自動プレイは視察に行かないので、通い切った状態を作って確かめる
    for (let seed = 1; seed < 30; seed++) {
      let state = playUntilMonth(startedGame({ seed }), SCOUT_OPEN_MONTH)
      state = applyCommand(state, { type: 'visitScoutRegion', regionId: state.regionId }).state

      const region = state.scouting.regions[0]
      if (!region) continue

      // 通い切って、評判も上げておく（獲得の見込みを上げる）
      state = {
        ...state,
        reputation: 95,
        scouting: {
          ...state.scouting,
          regions: [
            { ...region, prospects: region.prospects.map((p) => ({ ...p, approaches: 4 })) },
          ],
        },
      }

      state = playUntilPhase(playUntilYearEnd(state), 'newSeason')
      const scouted = state.pendingSeason?.newcomers.filter((p) => p.origin === 'scout') ?? []
      if (scouted.length === 0) continue

      // 一覧に出ている選手は、そのまま名簿にも居る
      for (const player of scouted) {
        expect(state.players.some((current) => current.id === player.id)).toBe(true)
      }
      return
    }
    throw new Error('スカウトで獲れたシードが見つからない')
  }, 300000)

  it('入部した1年生は全員が一覧に出る', () => {
    let state = startedGame({ seed: 5 })
    const before = new Set(state.players.map((player) => player.id))
    state = playUntilPhase(playYear(state), 'newSeason')

    const report = state.pendingSeason!
    const joined = state.players.filter(
      (player) => player.grade === 1 && !before.has(player.id),
    )

    expect(joined.length).toBeGreaterThan(0)
    for (const player of joined) {
      expect(report.newcomers.some((newcomer) => newcomer.id === player.id)).toBe(true)
    }
  }, 120000)
})

describe('飛び越えられないマスで止められたとき', () => {
  /**
   * **大会や合宿のマスは飛び越えられない。**
   * 5のカードを切っても1マスしか進まないことがあり、
   * 以前はそのぶん成長も体力の回復も5分の1になっていた。
   * 大会の直前に休養カードを切ると、ほとんど回復しないまま試合に入る形で、
   * プレイヤーには避けようがないうえ、画面のどこにも理由が出ない。
   */
  function stateBeforeTournament(seed: number): GameState {
    // 初期状態は新年度の画面から始まるので、カードを選べる形にしてから使う
    const base = startedGame({ seed })
    const target = base.board.findIndex((cell, index) => index > 5 && cell.kind === 'tournament')
    expect(target).toBeGreaterThan(0)
    return { ...base, boardPosition: target - 1 }
  }

  function play(state: GameState, kind: PracticeKind, number: CardNumber): GameState {
    const card = { ...state.hand[0], kind, number }
    return applyCommand(
      { ...state, hand: [card, ...state.hand.slice(1)] },
      { type: 'selectCard', cardId: card.id },
    ).state
  }

  const averageCondition = (state: GameState): number =>
    state.players.reduce((sum, player) => sum + player.condition, 0) / state.players.length

  it('休養カードは、止められても日数ぶんまるごと回復する', () => {
    const before = stateBeforeTournament(11)
    const stopped = play(before, 'rest', 5)

    // 盤面は1マスしか進んでいない
    expect(stopped.boardPosition - before.boardPosition).toBe(1)

    // それでも回復量は、遮られずに5マス進んだときと変わらない
    const free = { ...startedGame({ seed: 11 }), boardPosition: 3 }
    const freeAfter = play(free, 'rest', 5)
    const stoppedGain = averageCondition(stopped) - averageCondition(before)
    const freeGain = averageCondition(freeAfter) - averageCondition(free)

    expect(stoppedGain).toBeGreaterThan(0)
    expect(stoppedGain).toBeGreaterThan(freeGain * 0.7)
  })

  it('グラウンド整備は止められても1段階上がる', () => {
    const before = stateBeforeTournament(12)
    const after = play(before, 'groundskeeping', 5)
    expect(after.groundLevel).toBe(before.groundLevel + 1)
  })

  it('大会マスに止まったら大会が始まる', () => {
    const before = stateBeforeTournament(13)
    const after = play(before, 'rest', 5)
    expect(after.tournament).not.toBeNull()
  })
})
