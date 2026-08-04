/**
 * Zustand ストア。core と UI の橋渡しだけを行う。
 * ここにゲームルールを書いてはいけない（計算は必ず core の関数を呼ぶ）。
 */

import { create } from 'zustand'
import { applyCommand, createInitialState } from '@/core/gameEngine'
import type { GameEvent } from '@/core/types/event'
import type { GameState } from '@/core/types/game'
import type { Lineup } from '@/core/types/lineup'
import type { TrainingFocus } from '@/core/player/trainingFocus'
import type { MatchSpeed } from '@/core/types/match'
import * as storage from '@/save/storage'

/** 表示中の画面 */
export type Screen =
  | 'title'
  | 'newGame'
  | 'home'
  | 'players'
  | 'playerDetail'
  | 'lineup'
  | 'shop'
  | 'scout'
  | 'alumni'
  | 'records'
  | 'data'

type GameStore = {
  /** null ならまだゲームを始めていない */
  game: GameState | null
  screen: Screen
  /** 選手詳細で表示中の選手 */
  selectedPlayerId: string | null
  /** 直近のコマンドで発生したイベント（結果パネルの表示に使う） */
  lastEvents: GameEvent[]
  /** セーブデータの有無。タイトル画面の「続きから」の出し分けに使う */
  hasSave: boolean
  /**
   * いま遊んでいるセーブの枠。
   * 保存先を決めるだけで、ゲームの内容には一切関わらない。
   */
  slot: storage.SlotId

  /** 新規作成でどの枠を使うか。タイトル画面で選んで NewGameScreen が読む */
  newGameSlot: storage.SlotId
  setNewGameSlot: (slot: storage.SlotId) => void

  newGame: (schoolName?: string, regionId?: string, slot?: storage.SlotId) => void
  continueGame: (slot?: storage.SlotId) => void
  selectCard: (cardId: string) => void
  advanceYear: () => void
  setLineup: (lineup: Lineup) => void
  autoLineup: (plan?: import('@/core/lineup/autoLineup').AutoLineupPlan) => void
  setSquad: (squad: string[]) => void
  setMatchSpeed: (speed: MatchSpeed) => void
  startMatch: () => void
  advanceMatch: (toEnd?: boolean) => void
  substitutePlayer: (slotIndex: number, playerId: string) => void
  finishMatch: () => void
  finishSeason: (change?: {
    schoolName?: string
    uniform?: import('@/core/team/uniforms').UniformId
    regionId?: string
  }) => void
  playTournamentMatch: () => void
  finishTournament: () => void
  chooseCampPlan: (planId: string) => void
  buyItem: (itemId: string) => void
  setTrainingFocus: (playerId: string, focus: TrainingFocus) => void
  upgradeGround: (steps?: number) => void
  hireManager: (managerId: string) => void
  buyEquipment: (equipmentId: string) => void
  visitScoutRegion: (regionId: string) => void
  approachProspect: (prospectId: string) => void
  chooseRoute: (routeId: string) => void
  backToTitle: () => void
  deleteSave: (slot?: storage.SlotId) => void

  setScreen: (screen: Screen) => void
  showPlayer: (playerId: string) => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  screen: 'title',
  selectedPlayerId: null,
  lastEvents: [],
  hasSave: storage.hasAnySave(),
  slot: storage.DEFAULT_SLOT,
  newGameSlot: storage.DEFAULT_SLOT,

  setNewGameSlot: (slot) => set({ newGameSlot: slot }),

  newGame: (schoolName, regionId, slot = storage.DEFAULT_SLOT) => {
    const game = createInitialState({
      ...(schoolName ? { schoolName } : {}),
      ...(regionId ? { regionId } : {}),
    })
    storage.save(game, slot)
    set({ game, slot, screen: 'home', lastEvents: [], hasSave: true })
  },

  continueGame: (slot = storage.DEFAULT_SLOT) => {
    const game = storage.load(slot)
    if (!game) {
      // 壊れていた場合はタイトルに留まる
      set({ hasSave: storage.hasAnySave() })
      return
    }
    set({ game, slot, screen: 'home', lastEvents: [] })
  },

  selectCard: (cardId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'selectCard', cardId })
  },

  advanceYear: () => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'advanceYear' })
  },

  setLineup: (lineup) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'setLineup', lineup })
  },

  setSquad: (squad) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'setSquad', squad })
  },

  autoLineup: (plan) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'autoLineup', ...(plan ? { plan } : {}) })
  },

  setMatchSpeed: (speed) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'setMatchSpeed', speed })
  },

  startMatch: () => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'startMatch' })
  },

  advanceMatch: (toEnd) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'advanceMatch', ...(toEnd ? { toEnd: true } : {}) })
  },

  substitutePlayer: (slotIndex, playerId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'substitutePlayer', slotIndex, playerId })
  },

  finishMatch: () => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'finishMatch' })
  },

  finishSeason: (change = {}) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'finishSeason', ...change })
  },

  playTournamentMatch: () => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'playTournamentMatch' })
  },

  finishTournament: () => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'finishTournament' })
  },

  chooseCampPlan: (planId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'chooseCampPlan', planId })
  },

  buyItem: (itemId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'buyItem', itemId })
  },

  setTrainingFocus: (playerId, focus) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'setTrainingFocus', playerId, focus })
  },

  upgradeGround: (steps) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'upgradeGround', steps })
  },

  buyEquipment: (equipmentId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'buyEquipment', equipmentId })
  },

  hireManager: (managerId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'hireManager', managerId })
  },

  visitScoutRegion: (regionId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'visitScoutRegion', regionId })
  },

  approachProspect: (prospectId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'approachProspect', prospectId })
  },

  chooseRoute: (routeId) => {
    const { game } = get()
    if (!game) return
    dispatch(set, game, { type: 'chooseRoute', routeId })
  },

  backToTitle: () => set({ screen: 'title', selectedPlayerId: null }),

  deleteSave: (slot = storage.DEFAULT_SLOT) => {
    storage.clearSave(slot)
    set({
      game: null,
      screen: 'title',
      hasSave: storage.hasAnySave(),
      lastEvents: [],
    })
  },

  setScreen: (screen) => set({ screen }),

  showPlayer: (playerId) => set({ selectedPlayerId: playerId, screen: 'playerDetail' }),
}))

/** コマンドを適用して保存する共通処理 */
function dispatch(
  set: (partial: Partial<GameStore>) => void,
  game: GameState,
  command: Parameters<typeof applyCommand>[1],
): void {
  const { state, events } = applyCommand(game, command)
  if (state === game) return // 何も起きなかった（連打など）

  storage.save(state, useGameStore.getState().slot)
  set({ game: state, lastEvents: events })
}
