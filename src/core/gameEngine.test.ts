import { describe, expect, it } from 'vitest'
import { BOARD_LENGTH, dayOfTournament, GOAL_INDEX } from '@/core/board/boardDefs'
import { dayOf, monthOfDay } from '@/core/calendar/days'
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
import type { PracticeKind } from '@/core/types/card'
import { handSizeFor } from '@/core/types/season'
import type { GameState, Month } from '@/core/types/game'
import { GRADUATES_LIMIT, LOG_LIMIT, SAVE_VERSION } from '@/core/types/game'
import { applyCommand, createInitialState } from './gameEngine'
import {
  playStep,
  playUntilMonth,
  playUntilNewSeason,
  playUntilPhase,
  playUntilYearEnd,
  playYear,
  runMatch,
  startedGame,
} from './autoPlay'
import { benchPlayers } from './match/teamState'
import { localRivals, nationalRivals } from './rival/rivals'
import { isTournamentOver } from './types/tournament'
import { overallRating } from './player/rating'
import {
  findScoutRegion,
  MAX_APPROACHES,
  PROSPECTS_PER_REGION,
  SCOUT_OPEN_MONTH,
  successChance,
} from './scout/scouting'
import { scoutTripCost } from './shop/travel'
import { findRegion } from './types/region'
import { DEFAULT_UNIFORM } from './team/uniforms'

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
  })

  it('ログが上限を超えて溜まらない', () => {
    let state = startedGame({ seed: 21 })
    for (let i = 0; i < 30; i++) {
      state = playUntilYearEnd(state)
      state = applyCommand(state, { type: 'advanceYear' }).state
    }
    expect(state.log.length).toBeLessThanOrEqual(LOG_LIMIT)
    expect(new Set(state.log.map((l) => l.id)).size).toBe(state.log.length)
  })
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
    // 4月29日から動くと必ず5月に入る
    const state: GameState = { ...base, boardPosition: dayOf(4, 29) }

    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

    expect(next.month).toBe(5)
    // 部費の支給と維持費の支払いが起きている
    expect(next.log.some((entry) => entry.text.includes('支給'))).toBe(true)
    expect(next.log.some((entry) => entry.text.includes('維持費'))).toBe(true)
  })

  it('2ヶ月ぶんまたいでも取りこぼさない', () => {
    const base = startedGame({ seed: 403 })
    // 4月29日 → 6月1日以降まで一気に進める
    const state: GameState = {
      ...base,
      boardPosition: dayOf(4, 29),
      hand: base.hand.map((card) => ({ ...card, number: 12 as const })),
      // 途中に必ず止まるマスが無いようにする
      board: base.board.map((cell) =>
        cell.kind === 'tournament' || cell.kind === 'camp'
          ? { index: cell.index, kind: 'blank' as const }
          : cell,
      ),
    }

    let next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
    next = applyCommand(next, { type: 'selectCard', cardId: next.hand[0].id }).state
    next = applyCommand(next, { type: 'selectCard', cardId: next.hand[0].id }).state

    expect(next.month).toBe(6)
    // 5月と6月の両方の月替わりが記録されている
    const months = next.log.filter((entry) => /^1年目 \d+月$/.test(entry.text))
    expect(months.length).toBeGreaterThanOrEqual(2)
  })

  it('大会マスは飛び越えられない', () => {
    const base = startedGame({ seed: 404 })
    const summerDay = dayOfTournament('summerPref')
    const state: GameState = {
      ...base,
      boardPosition: summerDay - 2,
      // 12日進めば本来は通り過ぎるはず
      hand: base.hand.map((card) => ({ ...card, number: 12 as const })),
    }

    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

    expect(next.boardPosition).toBe(summerDay)
    expect(next.phase).toBe('tournament')
  })

  it('年度末を越えては進まない', () => {
    const base = startedGame({ seed: 405 })
    const state: GameState = {
      ...base,
      boardPosition: GOAL_INDEX - 2,
      hand: base.hand.map((card) => ({ ...card, number: 12 as const })),
    }

    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

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

    const afterBoost = applyCommand(state, {
      type: 'selectCard',
      cardId: state.hand[0].id,
    }).state
    expect(afterBoost.practiceBoost).not.toBeNull()
    const remaining = afterBoost.practiceBoost!.remaining

    const afterPractice = applyCommand(afterBoost, {
      type: 'selectCard',
      cardId: afterBoost.hand[0].id,
    }).state

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

  it('1年経つと3年生が卒業し、新入生が加入する', () => {
    const before = startedGame({ seed: 71 })
    const thirdYearIds = before.players.filter((p) => p.grade === 3).map((p) => p.id)

    const after = playOneYear(before)

    expect(after.phase).toBe('newSeason')
    expect(after.pendingSeason).not.toBeNull()
    expect(after.pendingSeason!.graduates).toHaveLength(thirdYearIds.length)

    // 卒業した選手は在籍していない
    for (const id of thirdYearIds) {
      expect(after.players.some((p) => p.id === id)).toBe(false)
    }
    // OB名鑑に残っている
    expect(after.graduates.length).toBe(thirdYearIds.length)
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

  /** 大会が終わるまで試合を消化する */
  function playOutTournament(initial: GameState): GameState {
    let state = initial
    let guard = 0
    while (!state.tournament!.eliminated && !state.tournament!.champion) {
      state = applyCommand(state, { type: 'playTournamentMatch' }).state
      // 試合前にスタメンを確認する画面を挟む
      state = runMatch(state)
      state = applyCommand(state, { type: 'finishMatch' }).state
      if (++guard > 20) throw new Error('大会が終わらない')
    }
    return state
  }

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

    const after = applyCommand(playing, { type: 'finishMatch' }).state
    expect(after.phase).toBe('tournament')
    expect(after.tournament!.results).toHaveLength(1)

    const result = after.tournament!.results[0]
    expect(result.won).toBe(after.tournament!.round === 2)
    expect(result.won).toBe(!after.tournament!.eliminated)
  })

  it('勝ち進んでいる間は大会マスに留まる', () => {
    const inTournament = untilTournament(startedGame({ seed: 87 }))
    const day = inTournament.boardPosition

    const after = applyCommand(
      runMatch(applyCommand(inTournament, { type: 'playTournamentMatch' }).state),
      { type: 'finishMatch' },
    ).state

    // 勝っても負けても、大会が終わるまではその日から動かない
    expect(after.boardPosition).toBe(day)
    expect(after.phase).toBe('tournament')
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
    // 優勝するまでシードを変えて探す
    for (let seed = 200; seed < 260; seed++) {
      const inTournament = untilTournament(startedGame({ seed, regionId: 'tottori' }))
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
  })

  it('大会の成績で評判が上がる（負けても下がらない）', () => {
    const state = untilTournament(startedGame({ seed: 86 }))
    const before = state.reputation

    const finished = applyCommand(playOutTournament(state), { type: 'finishTournament' }).state
    expect(finished.reputation).toBeGreaterThanOrEqual(before)
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

describe('冬合宿', () => {
  /** 合宿マスに止まるまで進める */
  const reachCamp = (seed: number) => playUntilPhase(startedGame({ seed }), 'camp')

  it('12月の合宿マスに止まると合宿フェーズになる', () => {
    const state = reachCamp(91)
    expect(state.month).toBe(12)
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

  it('方針を選ぶと能力が伸び、練習フェーズへ戻る', () => {
    const state = reachCamp(93)
    const sumMeet = (s: GameState) => s.players.reduce((t, p) => t + p.batting.meet, 0)
    const before = sumMeet(state)

    const { state: next } = applyCommand(state, { type: 'chooseCampPlan', planId: 'batting' })

    expect(next.phase).toBe('cardSelect')
    expect(sumMeet(next)).toBeGreaterThan(before)
    // 合宿の余韻で練習効率バフが付く
    expect(next.practiceBoost).not.toBeNull()
  })

  it('存在しない方針は受け付けない', () => {
    const state = reachCamp(94)
    const { state: next } = applyCommand(state, { type: 'chooseCampPlan', planId: 'unknown' })
    expect(next).toBe(state)
  })

  it('合宿は年に1回だけ', () => {
    let state = reachCamp(95)
    state = applyCommand(state, { type: 'chooseCampPlan', planId: 'batting' }).state

    // 年度末まで進めても、もう合宿は起きない
    let camps = 0
    while (state.phase !== 'yearEnd') {
      state = playStep(state)
      if (state.phase === 'camp') camps += 1
    }
    expect(camps).toBe(0)
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
    const day = dayOfTournament('springNationals')
    const state: GameState = {
      ...base,
      springBerth: true,
      board: base.board.map((cell) =>
        cell.index === day
          ? { index: day, kind: 'tournament', tournamentKind: 'springNationals' }
          : cell,
      ),
    }

    const inTournament = playUntilPhase(state, 'tournament', {
      // 夏・秋の大会は素通りさせず、春に着くまで進める
      maxSteps: 600,
    })
    // 最初に当たるのは7月の地区大会なので、春まで消化する
    let current = inTournament
    let guard = 0
    while (current.tournament!.kind !== 'springNationals') {
      while (!current.tournament!.champion && !current.tournament!.eliminated) {
        current = applyCommand(current, { type: 'playTournamentMatch' }).state
        current = runMatch(current)
        current = applyCommand(current, { type: 'finishMatch' }).state
      }
      current = applyCommand(current, { type: 'finishTournament' }).state
      current = playUntilPhase(current, 'tournament')
      if (++guard > 6) throw new Error('春の全国大会に到達しない')
    }

    expect(current.month).toBe(3)
    expect(current.tournament!.kind).toBe('springNationals')

    while (!current.tournament!.champion && !current.tournament!.eliminated) {
      current = applyCommand(current, { type: 'playTournamentMatch' }).state
      current = runMatch(current)
      current = applyCommand(current, { type: 'finishMatch' }).state
    }
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

      let guard = 0
      while (!state.tournament!.eliminated && !state.tournament!.champion) {
        state = applyCommand(state, { type: 'playTournamentMatch' }).state
        state = runMatch(state)
        state = applyCommand(state, { type: 'finishMatch' }).state
        if (++guard > 20) throw new Error('大会が終わらない')
      }
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

    const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state

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
    const checking = applyCommand(before, {
      type: 'selectCard',
      cardId: before.hand[0].id,
    }).state

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
    const checking = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
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
    return applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
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

describe('グラウンド整備とマネージャー', () => {
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
    // 荒れやすい高い段階で、月をまたぐ年を通して確かめる
    let state: GameState = { ...startedGame({ seed: 210 }), groundLevel: 90 }
    let decayed = false

    while (state.phase !== 'yearEnd' && !decayed) {
      state = playStep(state)
      if (state.groundLevel < 90) decayed = true
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
      const next = applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
      return next.players.reduce((total, p) => total + p.batting.meet + p.batting.power, 0)
    }
    expect(build(5)).toBeGreaterThan(build(1))
  })

  it('マネージャーを雇える。1人だけ在籍する', () => {
    const state: GameState = { ...startedGame({ seed: 205 }), funds: 500_000 }

    const hired = applyCommand(state, { type: 'hireManager', managerId: 'trainer' }).state
    expect(hired.managerId).toBe('trainer')

    const swapped = applyCommand(hired, { type: 'hireManager', managerId: 'chief' }).state
    expect(swapped.managerId).toBe('chief')
  })

  it('同じマネージャーは雇い直せない', () => {
    const state: GameState = {
      ...startedGame({ seed: 206 }),
      funds: 500_000,
      managerId: 'trainer',
    }
    expect(applyCommand(state, { type: 'hireManager', managerId: 'trainer' }).state).toBe(state)
  })

  it('主務を雇うと毎月の部費が増える', () => {
    const base = startedGame({ seed: 207 })
    const withChief: GameState = { ...base, managerId: 'chief' }

    // 月をまたいだ時点の支給額で比べる
    const plain = playUntilMonth(base, 5).funds - base.funds
    const boosted = playUntilMonth(withChief, 5).funds - withChief.funds
    expect(boosted).toBeGreaterThan(plain)
  })

  it('トレーナーを雇うと月替わりの体力回復が増える', () => {
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
    const withTrainer = playUntilMonth({ ...atMonthEnd, managerId: 'trainer' }, 5)

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
    return applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
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
    // 他の選手は伸びている
    expect(next.players[1].batting.meet).toBeGreaterThan(state.players[1].batting.meet)
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
    let state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, injuryMonths: 2 } : p)),
    }

    state = playUntilMonth(state, 5)
    expect(state.players.find((p) => p.id === injuredId)!.injuryMonths).toBe(1)

    state = playUntilMonth(state, 6)
    expect(state.players.find((p) => p.id === injuredId)!.injuryMonths).toBe(0)
    expect(state.log.some((entry) => entry.text.includes('復帰'))).toBe(true)
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
    return applyCommand(state, { type: 'selectCard', cardId: state.hand[0].id }).state
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
    expect(state.pendingMatch!.innings.length).toBeGreaterThanOrEqual(9)
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
      // 成長したことがイベントに出ている
      if (after.events.some((event) => event.type === 'ability')) {
        const grown = after.state.players.filter(
          (player) => overallRating(player) > (before.get(player.id) ?? 0),
        )
        expect(grown.length).toBeGreaterThan(0)
        found = true
      }
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

    for (let seed = 8000; seed < 8040 && !found; seed++) {
      let state = playUntilPhase(startedGame({ seed, regionId: 'tottori' }), 'tournament')
      let guard = 0

      while (!found && guard < 40) {
        if (state.tournament && !isTournamentOver(state.tournament)) {
          const checking = applyCommand(state, { type: 'playTournamentMatch' }).state

          if (state.tournament.kind === 'nationals') {
            const setup = checking.pendingSetup!
            const names = nationalRivals(state.rivals, state.regionId).map((s) => s.name)
            expect(names).toContain(setup.opponentName)
            expect(setup.opponentRegionName).toBeTruthy()
            expect(setup.opponentRegionName).not.toBe('鳥取')
            found = true
            break
          }
          state = runMatch(checking)
          state = applyCommand(state, { type: 'finishMatch' }).state
        } else {
          state = playStep(state)
        }
        guard++
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
