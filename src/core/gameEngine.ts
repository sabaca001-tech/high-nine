/**
 * ゲームエンジン。core への唯一の入口。
 *
 * UI は applyCommand() にコマンドを渡し、返ってきた state で画面を差し替えるだけ。
 * ルール計算を UI 側に書いてはいけない（CLAUDE.md 1.1 参照）。
 */

import { createRng, createSeed } from '@/core/rng/random'
import type { Rng, RngState } from '@/core/rng/random'
import {
  applyRoute,
  cellGrowthBonus,
  clearTournamentCells,
  placeSeasonTournaments,
  placeTournamentCells,
  createBoard,
  dayOfTournament,
  findRoute,
  forcedStopBetween,
  GOAL_INDEX,
} from '@/core/board/boardDefs'
import { dayOfCell, formatDay, monthOfDay, monthsCrossed } from '@/core/calendar/days'
import { SEASON_START_MONTH } from '@/core/calendar/days'
import { resolveCell } from '@/core/board/resolveCell'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { PracticeSpecial } from '@/core/card/cardDefs'
import {
  drawHand,
  replaceBrokenCards,
  replaceCard,
  replaceUselessCards,
} from '@/core/card/drawCards'
import { autoLineup, repairLineup, validateLineup } from '@/core/lineup/autoLineup'
import type { AutoLineupPlan } from '@/core/lineup/autoLineup'
import { createInitialRoster, createPlayer, GRADE_BASE } from '@/core/player/createPlayer'
import { recruitFreshmen } from '@/core/season/graduation'
import { applyCardCost, applyPractice, clamp } from '@/core/player/growth'
import { addBatting, addPitching } from '@/core/player/careerStats'
import { applyMatchGrowth } from '@/core/player/matchGrowth'
import { fatigueAfterOuts, fatigueOf, recoveredFatigue } from '@/core/player/fatigue'
import { matchReputationDelta, matchupLabel, teamRating } from '@/core/season/matchReputation'
import type { MatchStage } from '@/core/player/matchGrowth'
import {
  applySubstitution,
  finalizeMatch,
  isMatchOver,
  startMatchState,
  stepHalfInning,
} from '@/core/match/simulateGame'
import { pickOpponentName } from '@/core/match/opponent'
import {
  addResult,
  addStar,
  advanceRival,
  createRivals,
  localRivals,
  nationalRepresentatives,
  schoolForProspect,
} from '@/core/rival/rivals'
import type { RivalSchool } from '@/core/rival/rivals'
import { runRivalSeason } from '@/core/rival/rivalSeason'
import { rivalRoster, seasonProgressOfCell } from '@/core/rival/rivalRoster'
import {
  allProspects,
  createNationalTeam,
  createProspects,
  emptyScouting,
  findNationalProspect,
  findScoutRegion,
  MAX_APPROACHES,
  prospectSkillName,
  SCOUT_OPEN_MONTH,
  successChance,
} from '@/core/scout/scouting'
import type { ScoutRegion, ScoutResult } from '@/core/scout/scouting'
import { createTraits, shiftTraits } from '@/core/scout/scoutTraits'
import { playU18 } from '@/core/player/u18'
import { ourU18Players, selectU18Squad } from '@/core/player/u18Squad'
import {
  applyCamp,
  campSeasonOf,
  findCampPlan,
  CAMP_AFTERGLOW,
  CAMP_SEASON_LABELS,
} from '@/core/camp/campDefs'
import { findEventChoice, findPlayerEvent } from '@/core/event/playerEvents'
import { advanceSeason } from '@/core/season/graduation'
import { applyStreaks } from '@/core/player/streak'
import {
  autoSquad,
  firstSquadSet,
  repairSquad,
  squadMultiplierOf,
  trimSquad,
} from '@/core/player/squad'
import {
  advanceConvert,
  defaultGrowthOrder,
  growthOrderOf,
  canConvert,
  focusLabel,
  withFocus,
} from '@/core/player/trainingFocus'
import type { GrowthPlan, TrainingFocus } from '@/core/player/trainingFocus'
import { fixedEventFor } from '@/core/calendar/fixedEvents'
import { formatFunds, FUNDS_MAX, monthlyFunds, tournamentPrize } from '@/core/shop/funds'
import { scoutTripCost, tournamentTravel } from '@/core/shop/travel'
import { monthlyUpkeep, UNPAID_TRUST_PENALTY } from '@/core/shop/upkeep'
import {
  advanceManagers,
  findManagerRole,
  managerConditionCost,
  managerDefenseBonus,
  managerFundsRate,
  managerGrowthBonus,
  managerRecovery,
} from '@/core/staff/managers'
import {
  groundMultiplier,
  clampGroundLevel,
  GROUND_DECAY_STEPS,
  GROUND_LEVEL_MIN,
  groundDecayChance,
  groundName,
  groundUpgradeCostFor,
} from '@/core/shop/facility'
import { applyItem, findItem } from '@/core/shop/itemDefs'
import { findEquipment, unlockedKinds } from '@/core/shop/equipmentDefs'
import {
  applyRoundResult,
  createTournament,
  opponentStrengthFor,
  reputationGain,
} from '@/core/tournament/tournament'
import { createBracket, opponentAt } from '@/core/tournament/bracket'
import type { Bracket, BracketTeam } from '@/core/tournament/bracket'
import { applyTournamentGrowth } from '@/core/tournament/tournamentGrowth'
import { findSkill } from '@/core/skill/skillDefs'
import { PRACTICE_LABELS } from '@/core/types/card'
import type { PracticeCard, PracticeKind } from '@/core/types/card'
import {
  ABILITY_LABELS,
  HISTORY_LIMIT,
  isAvailable,
  POSITION_LABELS,
  snapshotOf,
} from '@/core/types/player'
import type { AbilityChange, GrowableKey, Player, Position } from '@/core/types/player'
import type { GameEvent, LogEntry } from '@/core/types/event'
import type { EngineResult, GameCommand, GameState, Month, PracticeBoost } from '@/core/types/game'
import { GRADUATES_LIMIT, LOG_LIMIT, SAVE_VERSION } from '@/core/types/game'
import type { PendingGrowth } from '@/core/types/game'
import type { Lineup } from '@/core/types/lineup'
import type { BoardCell, CellKind } from '@/core/types/board'
import { applyReputation, handSizeFor, REPUTATION_INITIAL } from '@/core/types/season'
import { DEFAULT_REGION_ID, findRegion, REGIONS } from '@/core/types/region'
import { makeSchoolName } from '@/core/rival/rivalDefs'
import { DEFAULT_UNIFORM, normalizeUniform } from '@/core/team/uniforms'
import type { UniformId } from '@/core/team/uniforms'
import { DEFAULT_CAP, normalizeCap } from '@/core/team/cap'
import type { CapDesign } from '@/core/team/cap'
import type { RegionId } from '@/core/types/region'
import { isTournamentOver, roundName } from '@/core/types/tournament'
import type { Tournament, TournamentKind } from '@/core/types/tournament'
import { createAlumnus, trimGraduates } from '@/core/career/career'
import { GRADUATION_MONTH } from '@/core/types/career'
import { overallRating } from '@/core/player/rating'
import { draftBonus } from '@/core/player/u18'

export type NewGameOptions = {
  schoolName?: string
  /** ユニフォームの色。省略時は既定 */
  uniform?: UniformId
  /** 所在地。大会の回戦数が変わる */
  regionId?: RegionId
  /** 省略時はランダム。テストでは固定値を渡す */
  seed?: RngState
}

/** 新規ゲームの初期状態を作る */
export function createInitialState(options: NewGameOptions = {}): GameState {
  const {
    schoolName = 'さくら第一高校',
    uniform = DEFAULT_UNIFORM,
    regionId = DEFAULT_REGION_ID,
    seed = createSeed(),
  } = options
  const rng = createRng(seed)

  // 4月の入部から始める。在校生（2・3年）を用意し、新入生を迎える
  const returning = createInitialRoster(rng, 8, [3, 2])
  const recruited = recruitFreshmen(rng, {
    players: returning,
    reputation: REPUTATION_INITIAL,
    year: 1,
    serial: returning.length + 1,
  })
  const players = [...returning, ...recruited.newcomers]

  const board = withSeasonTournaments(createBoard(rng), regionId)
  const hand = drawHand(rng, 0, handSizeFor(REPUTATION_INITIAL))
  const lineup = autoLineup(players)

  return {
    version: SAVE_VERSION,
    rngState: rng.state,
    schoolName,
    uniform,
    cap: DEFAULT_CAP,
    year: 1,
    month: SEASON_START_MONTH,
    // 入部の報告から始める
    phase: 'newSeason',
    players,
    lineup,
    // スタメンを先に入れてから総合上位で埋める。
    // 総合だけで選ぶと、能力は低いが捕手適性のある選手などがスタメンなのに
    // ベンチ外、という矛盾した状態になる
    squad: repairSquad(
      lineup.slots.map((slot) => slot.playerId),
      players,
    ),
    captainId: null,
    board,
    boardPosition: 0,
    hand,
    serial: recruited.serial + hand.length,
    practiceBoost: null,
    matchSpeed: 'normal',
    matchState: null,
    pendingMatch: null,
    pendingSetup: null,
    regionId,
    rivals: createRivals(rng, regionId, 1),
    u18Squad: null,
    scouting: { ...emptyScouting(), nationalTeam: createNationalTeam(rng, 1) },
    scoutTraits: createTraits(rng),
    tournament: null,
    nationalsBerth: false,
    springBerth: false,
    funds: monthlyFunds(REPUTATION_INITIAL),
    groundLevel: 1,
    managers: [],
    pendingEvent: null,
    pendingGrowth: null,
    pendingOffers: null,
    equipment: [],
    pendingFork: false,
    reputation: REPUTATION_INITIAL,
    graduates: [],
    pendingSeason: {
      year: 1,
      graduates: [],
      newcomers: recruited.newcomers,
      recommendedIds: recruited.recommendedIds,
      scoutResults: [],
      rivalNews: [],
      careerNews: [],
      reputationBefore: REPUTATION_INITIAL,
      reputationAfter: REPUTATION_INITIAL,
    },
    log: [],
  }
}

/** いま立っている位置より先にある、次の大会マス */
function nextTournamentCell(board: BoardCell[], from: number): number | null {
  for (let index = from + 1; index < board.length; index++) {
    if (board[index]?.kind === 'tournament') return index
  }
  return null
}

/**
 * 盤面に、必ず出場する大会（夏の地区・秋季）の回戦マスを置く。
 * 回戦数は所在地の参加校数で決まるので、盤面を作った直後に呼ぶ。
 */
function withSeasonTournaments(board: BoardCell[], regionId: RegionId): BoardCell[] {
  const region = findRegion(regionId)
  return placeSeasonTournaments(board, {
    summerPref: createTournament('summerPref', region).totalRounds,
    autumnPref: createTournament('autumnPref', region).totalRounds,
  })
}

/** コマンドを適用して新しい状態を返す */
export function applyCommand(state: GameState, command: GameCommand): EngineResult {
  switch (command.type) {
    case 'selectCard':
      return selectCard(state, command.cardId)
    case 'advanceYear':
      return advanceYear(state)
    case 'setLineup':
      return setLineup(state, command.lineup)
    case 'autoLineup':
      return autoOrder(state, command.plan)
    case 'setSquad':
      return setSquad(state, command.squad)
    case 'setMatchSpeed':
      // スキップは「この試合だけ飛ばす」操作なので設定としては覚えない。
      // 覚えてしまうと、一度スキップしたあと全試合が飛んでしまう
      return command.speed === 'skip'
        ? { state, events: [] }
        : { state: { ...state, matchSpeed: command.speed }, events: [] }
    case 'startMatch':
      return startMatch(state)
    case 'advanceMatch':
      return advanceMatch(state, command.toEnd === true)
    case 'substitutePlayer':
      return substitutePlayer(state, command.slotIndex, command.playerId)
    case 'finishMatch':
      return finishMatch(state)
    case 'finishSeason':
      return finishSeason(state, {
        ...(command.schoolName !== undefined ? { schoolName: command.schoolName } : {}),
        ...(command.uniform !== undefined ? { uniform: command.uniform } : {}),
        ...(command.regionId !== undefined ? { regionId: command.regionId } : {}),
        ...(command.cap !== undefined ? { cap: command.cap } : {}),
      })
    case 'playTournamentMatch':
      return playTournamentMatch(state)
    case 'finishTournament':
      return finishTournament(state)
    case 'chooseCampPlan':
      return chooseCampPlan(state, command.planId)
    case 'choosePlayerEventChoice':
      return choosePlayerEventChoice(state, command.choiceId)
    case 'closeGrowthReport':
      return closeGrowthReport(state)

    case 'closeCampReport':
      return closeCampReport(state)
    case 'chooseFriendlyMatch':
      return chooseFriendlyMatch(state, command.offerId)
    case 'buyItem':
      return buyItem(state, command.itemId)
    case 'setTrainingFocus':
      return setTrainingFocus(state, command.playerId, command.focus)
    case 'setGrowthOrder':
      return setGrowthOrder(state, command.position, command.order)
    case 'upgradeGround':
      return upgradeGround(state, command.steps ?? 1)
    case 'buyEquipment':
      return buyEquipment(state, command.equipmentId)
    case 'visitScoutRegion':
      return visitScoutRegion(state, command.regionId)
    case 'approachProspect':
      return approachProspect(state, command.prospectId)
    case 'leaveScoutRegion':
      return leaveScoutRegion(state)
    case 'approachNationalProspect':
      return approachNationalProspect(state, command.prospectId)
    case 'chooseRoute':
      return chooseRoute(state, command.routeId)
  }
}

/** ルート分岐で道筋を選ぶ。この先のマスが選んだ方針で作り直される */
function chooseRoute(state: GameState, routeId: string): EngineResult {
  const route = findRoute(routeId)
  if (state.phase !== 'fork' || !route) {
    return { state, events: [] }
  }

  const rng = createRng(state.rngState)
  const board = applyRoute(rng, state.board, state.boardPosition, route)

  const events: GameEvent[] = [
    { type: 'message', text: `${route.label}を選んだ`, tone: 'normal' },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      board,
      pendingFork: false,
      serial,
      phase: 'cardSelect',
      log,
    },
    events,
  }
}

/** グラウンドを1段階整備する。恒久的に練習効率が上がる */
function upgradeGround(state: GameState, steps: number): EngineResult {
  const wanted = Math.max(1, Math.round(steps))
  const quote = groundUpgradeCostFor(state.groundLevel, wanted)

  if (quote.steps === 0 || state.funds < quote.cost) {
    return { state, events: [] }
  }

  const level = clampGroundLevel(state.groundLevel + quote.steps)
  const events: GameEvent[] = [
    {
      type: 'message',
      text: `グラウンドを整備した（Lv${state.groundLevel} → Lv${level} ${groundName(level)}）`,
      tone: 'good',
    },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      groundLevel: level,
      funds: state.funds - quote.cost,
      serial,
      log,
    },
    events,
  }
}

/**
 * 練習器具を買う。
 * 買うと対応する練習カードが手札に出るようになる。
 * すでに持っているものは買えない（壊れて失ってから買い直す）。
 */
function buyEquipment(state: GameState, equipmentId: string): EngineResult {
  const equipment = findEquipment(equipmentId)
  if (!equipment || state.equipment.includes(equipmentId) || state.funds < equipment.price) {
    return { state, events: [] }
  }

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `${equipment.name}を購入した。「${PRACTICE_LABELS[equipment.unlocks]}」が選べるようになった`,
      tone: 'good',
    },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      equipment: [...state.equipment, equipmentId],
      funds: state.funds - equipment.price,
      serial,
      log,
    },
    events,
  }
}

/** ショップでアイテムを買う。効果はその場で出る */
function buyItem(state: GameState, itemId: string): EngineResult {
  const item = findItem(itemId)
  if (!item || state.funds < item.price) {
    return { state, events: [] }
  }

  const rng = createRng(state.rngState)
  const outcome = applyItem(rng, state.players, item)

  const events: GameEvent[] = [
    { type: 'message', text: `${item.name}を購入した`, tone: 'normal' },
    { type: 'message', text: outcome.text, tone: 'good' },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      players: outcome.players,
      funds: state.funds - item.price,
      // 買った練習器具のバフは、既にあるものより強ければ上書きする
      practiceBoost: nextBoost(state.practiceBoost, outcome.boost, false),
      serial,
      log,
    },
    events,
  }
}

/**
 * 選手の練習方針を決める。
 *
 * 部費ではなく練習で守備位置を覚える形にしたので、コンバートもここで指示する。
 * いつでも変更できるが、**変えるとコンバートの進捗はやり直し**になる。
 */
function setTrainingFocus(
  state: GameState,
  playerId: string,
  focus: TrainingFocus,
): EngineResult {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return { state, events: [] }

  // 上限に届いている位置は指定できない（本職として移す指定は常に受け付ける）
  if (focus.type === 'convert' && !canConvert(player, focus.position, focus.main)) {
    return { state, events: [] }
  }

  const updated = withFocus(player, focus)
  if (updated === player) return { state, events: [] }

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `${player.name}の練習方針：${focusLabel(focus, ABILITY_LABELS)}`,
      tone: 'normal',
    },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      players: state.players.map((p) => (p.id === playerId ? updated : p)),
      serial,
      log,
    },
    events,
  }
}

/**
 * ポジションごとの成長の優先順を差し替える。
 *
 * **順位で持つ。** 倍率を直に持たせると、並べ替えたときに平均が1.0から外れ、
 * チーム全体の成長速度まで動いてしまう。
 * 既定と同じ並びに戻したときは指定そのものを消す（セーブに残さない）。
 */
function setGrowthOrder(
  state: GameState,
  position: Position,
  order: GrowableKey[],
): EngineResult {
  const fixed = growthOrderOf(position, { [position]: order })
  const isDefault = fixed.join() === defaultGrowthOrder(position).join()

  const plan: GrowthPlan = { ...state.growthPlan }
  if (isDefault) delete plan[position]
  else plan[position] = fixed

  const growthPlan = Object.keys(plan).length > 0 ? plan : undefined
  return { state: { ...state, growthPlan }, events: [] }
}

/**
 * コンバート練習を1回ぶん進める。
 * 一定回数積み上がると適性が1段階上がる。
 */
function applyConvertTraining(
  rng: Rng,
  players: GameState['players'],
): {
  players: GameState['players']
  events: GameEvent[]
} {
  const events: GameEvent[] = []

  const updated = players.map((player) => {
    // 離脱中は練習していない
    if (player.focus?.type !== 'convert' || !isAvailable(player)) return player

    const step = advanceConvert(rng, player)
    if (step.promoted) {
      events.push({
        type: 'message',
        text: `${player.name}の${step.promoted.position}適性が上がった（${step.promoted.from} → ${step.promoted.to}）`,
        tone: 'good',
      })
    }
    if (step.converted) {
      events.push({
        type: 'message',
        text: `${player.name}が${POSITION_LABELS[step.converted.to]}に転向した（${
          POSITION_LABELS[step.converted.from]
        }から）`,
        tone: 'good',
      })
    }
    return step.player
  })

  return { players: updated, events }
}

/**
 * 合宿の方針を決めて実施する。
 *
 * **能力は伸びない。** 伸びるのは特殊能力を掴んだ選手だけで、
 * 誰が掴むかは選べない（信頼度が高いほど選ばれやすい）。
 */
function chooseCampPlan(state: GameState, planId: string): EngineResult {
  const plan = findCampPlan(planId)
  if (state.phase !== 'camp' || !plan) {
    return { state, events: [] }
  }

  const rng = createRng(state.rngState)
  const season = campSeasonOf(state.month)
  const { players, granted, missed } = applyCamp(rng, state.players, plan, {
    squad: state.squad,
    facilityMultiplier: groundMultiplier(state.groundLevel) * managerGrowthBonus(state.managers),
  })

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `${CAMP_SEASON_LABELS[season]}：${plan.label}を打った`,
      tone: 'normal',
    },
  ]
  for (const news of granted) {
    const skill = findSkill(news.skillId)
    if (!skill) continue
    events.push({
      type: 'message',
      text:
        news.rank === 'gold'
          ? `${news.playerName}が合宿で覚醒！ 「${skill.name}」を身につけた`
          : `${news.playerName}が「${skill.name}」を身につけた`,
      tone: 'good',
    })
  }
  for (const news of missed) {
    const skill = findSkill(news.skillId)
    if (!skill) continue
    events.push({
      type: 'message',
      text: `${news.playerName}は「${skill.name}」に挑んだが、あと一歩だった`,
      tone: 'normal',
    })
  }
  if (granted.length === 0 && missed.length === 0) {
    events.push({ type: 'message', text: '手応えのある選手は現れなかった', tone: 'normal' })
  }

  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      players,
      // 合宿の成果はしばらく練習にも効く
      practiceBoost: CAMP_AFTERGLOW,
      serial,
      // **成果は一覧で見せてから盤面へ戻す。**
      // ログに流すだけだと、年2回しかない合宿の結果が他の報告に混ざって流れていく
      phase: 'campReport',
      pendingCamp: {
        label: `${CAMP_SEASON_LABELS[season]}：${plan.label}`,
        granted,
        missed,
      },
      log,
    },
    events,
  }
}

/**
 * 個人イベントで選択肢を選び、結果を返す。
 *
 * 効果が入るのは**ここだけ**。マスに止まった時点では
 * 「誰に何が起きたか」しか決まっていない（`resolveCell`）。
 * 先に効果まで決めてしまうと、選択が結果を変えられない。
 */
function choosePlayerEventChoice(state: GameState, choiceId: string): EngineResult {
  const pending = state.pendingEvent
  if (state.phase !== 'playerEvent' || !pending) return { state, events: [] }

  const event = findPlayerEvent(pending.eventId)
  const target = state.players.find((player) => player.id === pending.playerId)

  // 対象が消えている・定義が見つからない場合は、選択待ちのまま詰まらせない。
  // ここで抜けないと、どの選択肢を押しても進めない状態になる
  if (!event || !target) {
    return {
      state: { ...state, pendingEvent: null, phase: 'cardSelect' },
      events: [],
    }
  }

  // 知らない選択肢は何もしない（合宿の方針と同じ扱い）
  const choice = findEventChoice(event, choiceId)
  if (!choice) return { state, events: [] }

  // 部費が要る選択肢は、払えるときだけ通す（借金は作らない）
  if (choice.cost !== undefined && state.funds < choice.cost) {
    return { state, events: [] }
  }

  const rng = createRng(state.rngState)
  const outcome = choice.resolve(rng, target)
  const teamTrust = outcome.teamTrustDelta ?? 0

  const players = state.players.map((player) => {
    if (player.id === target.id) {
      return teamTrust === 0
        ? outcome.player
        : { ...outcome.player, trust: clamp(outcome.player.trust + teamTrust, 0, 100) }
    }
    return teamTrust === 0
      ? player
      : { ...player, trust: clamp(player.trust + teamTrust, 0, 100) }
  })

  const events: GameEvent[] = [
    { type: 'message', text: outcome.text, tone: outcome.tone },
  ]
  if (outcome.changes.length > 0) events.push({ type: 'ability', changes: outcome.changes })

  const fundsDelta = outcome.fundsDelta ?? 0
  if (fundsDelta !== 0) {
    events.push({
      type: 'message',
      text: `部費 ${formatFunds(Math.abs(fundsDelta))} を使った`,
      tone: 'normal',
    })
  }

  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      players,
      lineup: repairLineup(state.lineup, players),
      funds: clamp(state.funds + fundsDelta, 0, FUNDS_MAX),
      pendingEvent: null,
      serial,
      phase: 'cardSelect',
      log,
    },
    events,
  }
}

/** 大会の次の試合を行う。結果の反映は finishMatch 側 */
function playTournamentMatch(state: GameState): EngineResult {
  const tournament = state.tournament
  if (state.phase !== 'tournament' || !tournament || isTournamentOver(tournament)) {
    return { state, events: [] }
  }

  const rng = createRng(state.rngState)

  // **相手は勝ち上がりで決まる。** 開幕時に決まっているのは組み合わせだけで、
  // 隣の山を勝ち抜いてきた学校がそのまま次の相手になる
  const entry = opponentAt(tournament.bracket, tournament.round)
  const rival = entry?.schoolId
    ? (state.rivals.find((school) => school.id === entry.schoolId) ?? null)
    : null

  // ここでは試合をせず、スタメンを確認する画面へ送る
  return {
    state: {
      ...state,
      rngState: rng.state,
      pendingSetup: {
        kind: 'friendly',
        opponentName: rival?.name ?? entry?.name ?? pickOpponentName(rng),
        ...(rival ? { opponentSchoolId: rival.id } : {}),
        opponentStrength: rival?.strength ?? entry?.strength ?? 0,
        // 全国大会では相手がどこの代表かを出す（甲子園の実感）
        ...(isLocalTournament(tournament.kind) || !rival
          ? {}
          : { opponentRegionName: findRegion(rival.regionId).name }),
        // トーナメントなので引き分けはあり得ない
        decisive: true,
        // **コールドは地区大会だけ。** 甲子園まで来た相手に
        // 「5回10点差で打ち切り」は成立しない
        mercy: isLocalTournament(tournament.kind),
        roundName: roundName(tournament.round, tournament.totalRounds),
      },
      phase: 'lineupCheck',
    },
    events: [],
  }
}

/**
 * 試合に連れて行ける選手。
 *
 * **ベンチ入り（squad）とスタメンだけ。** 部員全員を渡していた頃は、
 * ベンチ外の選手が代打や継投で出てきてしまい、ベンチ入りを決める意味が無かった。
 */
/**
 * おまかせ編成。**ベンチ入りから組み直す。**
 *
 * スタメンだけを組み直していた頃は、
 * ベンチ外に総合80の選手がいてもベンチ入りの総合50が使われ続けていた。
 * 「おまかせ」と言われて期待するのは**部員全員から選ぶ**ことなので、
 * ベンチ入りごと選び直す。
 *
 * 方針（バランス／能力優先／若手優先）はベンチ入りの選び方にも効く。
 * 揃えないと「若手優先で組んだのにベンチ入りは3年生ばかり」になる。
 */
function autoOrder(state: GameState, plan?: AutoLineupPlan): EngineResult {
  const squad = autoSquad(state.players, plan)
  const ids = new Set(squad)
  const roster = state.players.filter((player) => ids.has(player.id))

  return {
    state: { ...state, squad, lineup: autoLineup(roster, plan) },
    events: [],
  }
}

export function matchRoster(state: GameState): Player[] {
  const ids = new Set(state.squad)
  for (const slot of state.lineup.slots) ids.add(slot.playerId)
  return state.players.filter((player) => ids.has(player.id))
}

/**
 * スタメンの確認を終えて試合を始める。
 *
 * **ここで初めて試合が動き出す。** 確認画面で組み替えた
 * スタメンがそのまま結果に反映される。
 * ここではまだ1球も投げず、`advanceMatch` で半回ずつ進める。
 */
function startMatch(state: GameState): EngineResult {
  const setup = state.pendingSetup
  if (state.phase !== 'lineupCheck' || !setup) {
    return { state, events: [] }
  }
  // 成立していない編成のままでは始めさせない
  if (validateLineup(state.lineup, state.players).length > 0) {
    return { state, events: [] }
  }

  const rng = createRng(state.rngState)
  const opponentRoster = rosterOfSchool(state, setup.opponentSchoolId)
  const matchState = startMatchState(rng, {
    players: matchRoster(state),
    lineup: state.lineup,
    opponentName: setup.opponentName,
    ...(setup.opponentSchoolId ? { opponentSchoolId: setup.opponentSchoolId } : {}),
    opponentStrength: setup.opponentStrength,
    kind: setup.kind,
    ...(setup.decisive ? { decisive: true } : {}),
    ...(setup.mercy === false ? { mercy: false } : {}),
    defenseBonus: managerDefenseBonus(state.managers),
    // 相手が分かっているなら、その学校の部員をそのまま出す
    ...(opponentRoster ? { opponentRoster } : {}),
  })

  return {
    state: {
      ...state,
      rngState: rng.state,
      matchState,
      pendingMatch: null,
      pendingSetup: null,
      phase: 'match',
    },
    events: [],
  }
}

/**
 * 試合を半回ぶん進める。
 *
 * `toEnd` なら決着まで一気に進める（スキップ観戦と自動プレイ用）。
 * **どちらで進めても結果は同じ**。乱数の並びが変わらないため。
 */
function advanceMatch(state: GameState, toEnd: boolean): EngineResult {
  if (state.phase !== 'match' || !state.matchState) return { state, events: [] }

  const rng = createRng(state.rngState)
  let matchState = stepHalfInning(rng, state.matchState)
  while (toEnd && !isMatchOver(matchState)) {
    matchState = stepHalfInning(rng, matchState)
  }

  if (!isMatchOver(matchState)) {
    return { state: { ...state, rngState: rng.state, matchState }, events: [] }
  }

  // 決着したので結果にまとめる。ここから先は観戦の再生だけ
  const match = finalizeMatch(rng, matchState)
  return {
    state: { ...state, rngState: rng.state, matchState: null, pendingMatch: match },
    events: [],
  }
}

/**
 * 試合中の選手交代。回の切れ目でだけ行える。
 *
 * 退いた選手は戻れない（高校野球と同じ）。
 * 投手の枠には投手能力を持つ選手しか入れられない。
 */
function substitutePlayer(
  state: GameState,
  slotIndex: number,
  playerId: string,
): EngineResult {
  const matchState = state.matchState
  if (state.phase !== 'match' || !matchState) return { state, events: [] }

  const next = applySubstitution(matchState, slotIndex, playerId)
  if (!next) return { state, events: [] }

  // 交代はこの試合限り。次の試合のスタメンには持ち込まない
  // （自動で出た代打まで登録スタメンを書き換えてしまうため）
  return { state: { ...state, matchState: next }, events: [] }
}

/**
 * 大会を終えて次の月へ進む。
 * 評判の加算はここで一度だけ行う。
 */
function finishTournament(state: GameState): EngineResult {
  const tournament = state.tournament
  if (state.phase !== 'tournament' || !tournament || !isTournamentOver(tournament)) {
    return { state, events: [] }
  }

  const gain = reputationGain(tournament)
  // 評判は上に行くほど伸びにくい。そうしないと1年目で100に張り付く
  const reputation = applyReputation(state.reputation, gain)
  const prize = tournamentPrize(tournament)

  // 遠征費は実際に行った試合数ぶんかかる。全国大会は補助も出る
  const travel = tournamentTravel(
    tournament.kind,
    findRegion(state.regionId),
    tournament.results.length,
  )
  // 部費は0を下回らせない（不足分は学校の立て替えという扱い）
  const funds = clamp(state.funds + prize + travel.grant - travel.cost, 0, FUNDS_MAX)

  // 夏の地区大会を制すと夏の全国大会へ、秋季大会を制すと春の全国大会へ進める
  const nationalsBerth =
    tournament.kind === 'summerPref' ? tournament.champion : state.nationalsBerth
  const springBerth =
    tournament.kind === 'autumnPref' ? tournament.champion : state.springBerth

  const events: GameEvent[] = [
    {
      type: 'message',
      text: tournament.champion
        ? `${tournament.name} 優勝！`
        : `${tournament.name} ${tournament.results.length}回戦で敗退`,
      tone: tournament.champion ? 'good' : 'bad',
    },
  ]
  if (gain > 0) {
    events.push({ type: 'message', text: `学校の評判が ${gain} 上がった`, tone: 'good' })
  }
  if (prize > 0) {
    events.push({
      type: 'message',
      text: `大会の成績で ${formatFunds(prize)} の部費が入った`,
      tone: 'good',
    })
  }
  if (travel.grant > 0) {
    events.push({
      type: 'message',
      text: `後援会から遠征補助 ${formatFunds(travel.grant)} が出た`,
      tone: 'good',
    })
  }
  if (travel.cost > 0) {
    events.push({
      type: 'message',
      text:
        travel.nights > 0
          ? `遠征費 ${formatFunds(travel.cost)} がかかった（移動と${travel.nights}泊ぶん）`
          : `球場までの交通費 ${formatFunds(travel.cost)} がかかった`,
      tone: 'bad',
    })
  }
  if (tournament.kind === 'summerPref' && tournament.champion) {
    events.push({ type: 'message', text: '夏の全国大会への出場が決まった！', tone: 'good' })
  }
  if (tournament.kind === 'autumnPref' && tournament.champion) {
    events.push({ type: 'message', text: '春の全国大会への出場が決まった！', tone: 'good' })
  }

  // 終わった大会のマスはすべて普通のマスに戻す。
  // 戻さないと、残っている回戦のマスで同じ大会が再開してしまう
  let board = clearTournamentCells(state.board, tournament.kind)

  // 全国大会の出場権を得たら、その大会の回戦ぶんのマスを盤面に足す
  if (tournament.kind === 'summerPref' && tournament.champion) {
    board = placeTournamentCells(
      board,
      'nationals',
      state.boardPosition,
      createTournament('nationals', findRegion(state.regionId)).totalRounds,
    )
    events.push({
      type: 'message',
      text: `${formatDay(dayOfTournament('nationals'))}から全国大会が始まる`,
      tone: 'good',
    })
  }
  if (tournament.kind === 'autumnPref' && tournament.champion) {
    board = placeTournamentCells(
      board,
      'springNationals',
      state.boardPosition,
      createTournament('springNationals', findRegion(state.regionId)).totalRounds,
    )
    events.push({
      type: 'message',
      text: `${formatDay(dayOfTournament('springNationals'))}から春の全国大会が始まる`,
      tone: 'good',
    })
  }

  // 大会での成長は**1試合ごと**に済んでいる（finishMatch）。
  // ここでまとめて配っていた頃は、準決勝で伸びた選手が決勝で活きず、
  // 勝ち上がっている実感が最後の画面まで来なかった

  /*
   * **U18の選考は3年生が居るうちに行う。**
   * 11月に選んでいた頃は、夏で引退した3年生が名簿から消えたあとだったので、
   * **自校の3年生は絶対に選ばれなかった**（代表の主力は3年生なのに）。
   * 夏が終わった時点＝引退の直前に選ぶ。
   */
  const called = callU18(state, tournament, events)
  const afterCall: GameState = { ...state, ...called }

  // 夏が終われば3年生は引退する
  const retired = retireThirdYears(afterCall, tournament, events)

  const { log: log2, serial: serial2 } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      ...called,
      ...retired,
      tournament: null,
      board,
      nationalsBerth,
      springBerth,
      reputation,
      funds,
      serial: serial2,
      log: log2,
      // 大会が終わったらそのままカード選択に戻る（同じ日から再開）
      phase: 'cardSelect',
    },
    events,
  }
}

/**
 * U18日本代表を選ぶ。**夏の大会が終わった時点で、引退する前に。**
 *
 * 実際の高校日本代表も夏の甲子園のあとに選ばれ、主力は3年生になる。
 * 11月に選んでいた頃は、その3年生がもう名簿に居なかった。
 */
function callU18(
  state: GameState,
  tournament: Tournament,
  events: GameEvent[],
): Partial<GameState> {
  const summerOver =
    (tournament.kind === 'summerPref' && !tournament.champion) ||
    tournament.kind === 'nationals'
  if (!summerOver) return {}
  // 同じ年に二度選ばない（県大会で負けたあと、翌年まで持ち越す）
  if (state.u18Squad?.year === state.year) return {}

  const rng = createRng(state.rngState)
  const squad = selectU18Squad({
    schools: state.rivals,
    ourPlayers: state.players,
    year: state.year,
    progress: seasonProgressOfCell(state.boardPosition),
  })

  let players = state.players
  for (const player of ourU18Players(squad, players)) {
    const outcome = playU18(rng, player, state.year)
    players = players.map((p) => (p.id === player.id ? outcome.player : p))

    events.push({
      type: 'message',
      text: `${player.name}がU18日本代表に選出された！`,
      tone: 'good',
    })
    events.push({
      type: 'message',
      text:
        outcome.performance >= 70
          ? `${player.name}は国際大会で活躍し、スカウトの評価を大きく上げた`
          : outcome.performance >= 35
            ? `${player.name}は国際大会で経験を積んだ`
            : `${player.name}は世界の壁を思い知らされた`,
      tone: outcome.performance >= 35 ? 'good' : 'normal',
    })
    if (outcome.changes.length > 0) events.push({ type: 'ability', changes: outcome.changes })
  }

  return { players, u18Squad: squad, rngState: rng.state }
}

/**
 * 夏が終わったら3年生を引退させる。
 *
 * 高校野球の3年生は夏の大会を最後に退く。
 * 3月まで在籍し続けると、秋・春の大会まで同じ顔ぶれで戦えてしまい、
 * **世代交代の重みが無くなる**。秋からは新チームで戦うことになる。
 *
 * 引退の時点でOB名鑑に載せる。卒業は3月だが、
 * チームを離れる瞬間に記録を確定させるほうが分かりやすい。
 */
function retireThirdYears(
  state: GameState,
  tournament: Tournament,
  events: GameEvent[],
): Partial<GameState> {
  // 地区大会で敗退したらそこまで。優勝したら全国が終わってから
  const summerOver =
    (tournament.kind === 'summerPref' && !tournament.champion) ||
    tournament.kind === 'nationals'
  if (!summerOver) return {}

  const leaving = state.players.filter((player) => player.grade === 3)
  if (leaving.length === 0) return {}

  const rng = createRng(state.rngState)
  const players = state.players.filter((player) => player.grade !== 3)

  const records = leaving.map((player) =>
    createAlumnus(
      rng,
      {
        id: player.id,
        name: player.name,
        isPitcher: player.isPitcher,
        position: player.position,
        year: state.year,
        rating: overallRating(player),
        skills: [...player.skills],
        highSchool: player.stats,
        u18Bonus: draftBonus(player.u18),
        // 卒業時の各能力。総合だけでは何が武器だったのか分からない
        finalAbilities: snapshotOf(player, state.year, GRADUATION_MONTH),
      },
      state.reputation,
    ),
  )

  events.push({
    type: 'message',
    text: `3年生${leaving.length}人が引退した。ここからは新チーム`,
    tone: 'normal',
  })

  // 顔ぶれが大きく変わるので、スタメンとベンチ入りを組み直す
  const lineup = autoLineup(players)

  return {
    rngState: rng.state,
    players,
    lineup,
    squad: repairSquad(
      lineup.slots.map((slot) => slot.playerId),
      players,
    ),
    graduates: [...records, ...state.graduates].slice(0, GRADUATES_LIMIT),
  }
}

/** 世代交代の報告を閉じて新年度を始める */
function finishSeason(
  state: GameState,
  change: {
    schoolName?: string
    uniform?: UniformId
    regionId?: RegionId
    cap?: Partial<CapDesign>
  } = {},
): EngineResult {
  if (state.phase !== 'newSeason') {
    return { state, events: [] }
  }

  const events: GameEvent[] = []

  const schoolName = change.schoolName?.trim()
  const renamed = schoolName !== undefined && schoolName.length > 0 && schoolName !== state.schoolName
  if (renamed) {
    events.push({
      type: 'message',
      text: `校名が「${state.schoolName}」から「${schoolName}」に変わった`,
      tone: 'normal',
    })
  }

  const uniform = change.uniform ? normalizeUniform(change.uniform) : state.uniform
  if (uniform !== state.uniform) {
    events.push({ type: 'message', text: 'ユニフォームを新調した', tone: 'normal' })
  }

  const cap = change.cap ? normalizeCap(change.cap) : normalizeCap(state.cap)

  // 所在地を変えると大会の回戦数も遠征費も変わる。
  // ライバル校は県ごとに置いているので、**引っ越し先の顔ぶれに入れ替える**
  const moved = change.regionId !== undefined && change.regionId !== state.regionId
  const regionId = moved ? change.regionId! : state.regionId

  let rivals = state.rivals
  let rngState = state.rngState
  if (moved) {
    const rng = createRng(state.rngState)
    // 引っ越し先の県内校を作り直す。県外の全国クラスはそのまま残す
    // （甲子園で当たってきた相手を消してしまうと戦績が意味を失う）
    const outside = state.rivals.filter((school) => school.regionId !== state.regionId)
    const fresh = createRivals(rng, regionId).filter((school) => school.regionId === regionId)
    rivals = [...fresh, ...outside.filter((school) => school.regionId !== regionId)]
    rngState = rng.state

    events.push({
      type: 'message',
      text: `${findRegion(state.regionId).name}から${findRegion(regionId).name}へ移転した`,
      tone: 'normal',
    })
  }

  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      ...(renamed ? { schoolName } : {}),
      uniform,
      cap,
      regionId,
      rivals,
      rngState,
      serial,
      phase: 'cardSelect',
      pendingSeason: null,
      log,
    },
    events,
  }
}

/**
 * 観戦を終えて試合結果をチームに反映する。
 *
 * 能力や信頼度の変化をここで行うのは、観戦中に状態が変わると
 * 途中で画面を離れたときに二重適用される恐れがあるため。
 */
function finishMatch(state: GameState): EngineResult {
  const match = state.pendingMatch
  if (state.phase !== 'match' || !match) {
    return { state, events: [] }
  }

  const won = match.outcome === 'win'
  const starters = new Set(state.lineup.slots.map((slot) => slot.playerId))
  const battingById = new Map(match.battingLines.map((line) => [line.playerId, line]))
  const pitchingById = new Map(match.pitchingLines.map((line) => [line.playerId, line]))

  // 成長の判定に乱数を使うので、ここでカーソルを取り出す
  const rng = createRng(state.rngState)
  const growthChanges: AbilityChange[] = []

  // 負ければ終わりの大会は、同じ内容でも得るものが大きい
  const stage: MatchStage = !state.tournament
    ? 'practice'
    : state.tournament.kind === 'nationals' || state.tournament.kind === 'springNationals'
      ? 'nationals'
      : 'pref'

  const players = state.players.map((player) => {
    // 出場した選手ほど得るものが大きい
    const batting = battingById.get(player.id)
    const pitching = pitchingById.get(player.id)
    const played = starters.has(player.id) || batting !== undefined || pitching !== undefined
    const trustGain = (won ? 5 : 2) + (played ? 2 : 0) + (player.id === match.mvpPlayerId ? 3 : 0)
    const conditionCost = played ? 14 : 6

    // 通算成績を積む。出場していなければ何も足さない（試合数も増えない）
    let stats = player.stats
    if (batting) stats = addBatting(stats, batting)
    if (pitching) stats = addPitching(stats, pitching)

    // 成績が良ければ伸び、悪ければ落ちる。チームの勝敗は混ぜない
    const grown = applyMatchGrowth(rng, player, {
      ...(batting ? { batting } : {}),
      ...(pitching ? { pitching } : {}),
      stage,
    })
    growthChanges.push(...grown.changes)

    return {
      ...grown.player,
      stats,
      trust: clamp(player.trust + trustGain, 0, 100),
      condition: clamp(player.condition - conditionCost, 0, 100),
      // 投げたぶんだけ疲労が溜まる。抜けるのは日数（selectCard）
      ...(pitching
        ? { fatigue: fatigueAfterOuts(fatigueOf(player), pitching.outs) }
        : {}),
    }
  })

  // 誰と戦ったかで評判の振れ幅が変わる。格上を倒せば名前が売れ、
  // 格下に落とせば一気に評判を落とす。大会の試合でもここで動かす
  const ourRating = teamRating(state.players, state.lineup)
  const reputationDelta = matchReputationDelta({
    outcome: match.outcome,
    ourRating,
    opponentStrength: match.opponentStrength,
  })
  const reputation = applyReputation(state.reputation, reputationDelta)

  // 相手がライバル校なら対戦成績を残す。「去年負けたあの学校」が分かるようになる
  const rivals = match.opponentSchoolId
    ? state.rivals.map((school) =>
        school.id === match.opponentSchoolId
          ? addResult(school, {
              year: state.year,
              label: state.tournament
                ? `${state.tournament.name} ${roundName(state.tournament.round, state.tournament.totalRounds)}`
                : '練習試合',
              outcome: match.outcome,
            })
          : school,
      )
    : state.rivals

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `${match.opponentName}戦 ${match.finalScore.player}-${match.finalScore.opponent}で${
        won ? '勝利' : match.outcome === 'draw' ? '引き分け' : '敗戦'
      }`,
      tone: won ? 'good' : match.outcome === 'draw' ? 'normal' : 'bad',
    },
  ]

  if (growthChanges.length > 0) {
    events.push({ type: 'ability', changes: growthChanges })
    const gained = new Set(
      growthChanges.filter((c) => c.after > c.before).map((c) => c.playerId),
    ).size
    const lost = new Set(growthChanges.filter((c) => c.after < c.before).map((c) => c.playerId)).size
    if (gained > 0) {
      events.push({ type: 'message', text: `試合での活躍で${gained}人が成長した`, tone: 'good' })
    }
    if (lost > 0) {
      events.push({ type: 'message', text: `${lost}人が打てず、感覚を落とした`, tone: 'bad' })
    }
  }

  // 相手の格に対して勝ちすぎ・負けすぎなら、その意味を書き添える
  const matchup = matchupLabel(ourRating, match.opponentStrength)
  if (reputationDelta >= 2) {
    events.push({
      type: 'message',
      text: `${matchup}の${match.opponentName}を破り、学校の評判が大きく上がった`,
      tone: 'good',
    })
  } else if (reputationDelta <= -2) {
    events.push({
      type: 'message',
      text: `${matchup}の${match.opponentName}に敗れ、学校の評判が大きく下がった`,
      tone: 'bad',
    })
  }

  // 大会の試合だった場合は、勝敗を大会に反映する
  if (state.tournament) {
    const tournament = applyRoundResult(rng, state.tournament, {
      opponentName: match.opponentName,
      scoreFor: match.finalScore.player,
      scoreAgainst: match.finalScore.opponent,
      won,
    })

    // **1つ勝つたびに、その試合を戦ったメンバーが伸びる。**
    // 大会が終わってからまとめて配っていた頃は、
    // 準決勝で伸びた選手が決勝で活きず、手応えが試合と切り離されていた
    const grown = applyTournamentGrowth(rng, players, {
      kind: tournament.kind,
      won,
      champion: tournament.champion,
      starters: state.lineup.slots.map((slot) => slot.playerId),
      squad: state.squad,
    })

    if (grown.changes.length > 0) {
      events.push({ type: 'ability', changes: grown.changes })
      events.push({
        type: 'message',
        text: `${roundName(state.tournament.round, state.tournament.totalRounds)}を勝ち抜き、${
          new Set(grown.changes.map((change) => change.playerId)).size
        }人が一回り大きくなった`,
        tone: 'good',
      })
    }
    for (const news of grown.skills) {
      const skill = findSkill(news.skillId)
      if (!skill) continue
      events.push({
        type: 'message',
        text:
          news.rank === 'gold'
            ? `${news.playerName}が大舞台で覚醒し、金の特殊能力「${skill.name}」を身につけた！`
            : `${news.playerName}が大会での経験から特殊能力「${skill.name}」を身につけた`,
        tone: 'good',
      })
    }

    // **勝っただけならまだ大会は終わらない。** 次の回戦は盤面の先のマスにあるので、
    // いったん普通の進行に戻す。連戦にすると試合の合間に手を打つ余地が無い
    const over = isTournamentOver(tournament)
    if (!over) {
      events.push({
        type: 'message',
        text: `次は${roundName(tournament.round, tournament.totalRounds)}。${formatDay(
          dayOfCell(nextTournamentCell(state.board, state.boardPosition) ?? state.boardPosition),
        )}に行われる`,
        tone: 'good',
      })
    }

    const { log, serial } = appendLog(state.log, events, state.serial)

    return {
      state: {
        ...state,
        rngState: rng.state,
        players: grown.players,
        rivals,
        pendingMatch: null,
        // 1試合ごとの評判はここで動かす。強い相手を倒すほど大きく上がるので、
        // 決勝で勝つことと1回戦で勝つことが同じ重みにならない。
        // 大会をやり切ったこと自体の評価は finishTournament で足す
        reputation,
        tournament,
        serial,
        // 終わったときだけ大会画面（結果のまとめ）へ。続くなら盤面に戻る
        phase: over ? 'tournament' : 'cardSelect',
        log,
      },
      events,
    }
  }

  const reachedGoal = state.boardPosition >= GOAL_INDEX
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      players,
      rivals,
      pendingMatch: null,
      reputation,
      serial,
      phase: reachedGoal ? 'yearEnd' : 'cardSelect',
      log,
    },
    events,
  }
}

/**
 * その日の成長の報告を閉じて、止まったマスの効果へ進む。
 *
 * 効果そのものは `selectCard` の時点ですでに解決してある。
 * ここでやるのは**フェーズを先送りしていたぶんを進めること**だけ。
 * 先に解決しておかないと、報告を閉じるまで乱数の続きが決まらず、
 * 中断してセーブしたときに再開できなくなる。
 */
/** 合宿の成果を閉じて、盤面へ戻る */
function closeCampReport(state: GameState): EngineResult {
  if (state.phase !== 'campReport') return { state, events: [] }
  return { state: { ...state, pendingCamp: null, phase: 'cardSelect' }, events: [] }
}

function closeGrowthReport(state: GameState): EngineResult {
  const pending = state.pendingGrowth
  if (state.phase !== 'growthReport' || !pending) return { state, events: [] }

  return {
    state: { ...state, pendingGrowth: null, phase: pending.nextPhase },
    events: [],
  }
}

/**
 * 練習試合の相手を選ぶ。`offerId` が null なら試合を行わない。
 *
 * **遠征費はここで初めて引く。** 候補を出した時点では何も起きていないので、
 * 「気づいたら部費が減っていた」ということにならない。
 * 払えない相手は選べない（借金は作らない）。
 */
function chooseFriendlyMatch(state: GameState, offerId: string | null): EngineResult {
  const offers = state.pendingOffers
  if (state.phase !== 'matchOffer' || !offers) return { state, events: [] }

  // 断った。何も起きずに練習へ戻る
  if (offerId === null) {
    const events: GameEvent[] = [
      { type: 'message', text: '今日は練習試合を組まなかった', tone: 'normal' },
    ]
    const { log, serial } = appendLog(state.log, events, state.serial)
    return {
      state: { ...state, pendingOffers: null, phase: 'cardSelect', serial, log },
      events,
    }
  }

  const offer = offers.find((entry) => entry.id === offerId)
  if (!offer || state.funds < offer.travelCost) return { state, events: [] }

  const away = offer.travelCost > 0
  const events: GameEvent[] = [
    {
      type: 'message',
      text: away
        ? `${offer.regionName}へ遠征し、${offer.opponentName}と練習試合を行う`
        : `${offer.opponentName}と練習試合を行う`,
      tone: 'normal',
    },
  ]
  if (away) {
    events.push({
      type: 'message',
      text: `遠征費 ${formatFunds(offer.travelCost)} がかかった`,
      tone: 'bad',
    })
  }

  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      pendingOffers: null,
      pendingSetup: {
        kind: 'friendly',
        opponentName: offer.opponentName,
        ...(offer.opponentSchoolId ? { opponentSchoolId: offer.opponentSchoolId } : {}),
        opponentStrength: offer.opponentStrength,
        ...(away ? { awayRegionName: offer.regionName } : {}),
      },
      funds: clamp(state.funds - offer.travelCost, 0, FUNDS_MAX),
      // 他県まで出向くこと自体が学校の知名度になる
      reputation: away ? applyReputation(state.reputation, 1) : state.reputation,
      serial,
      phase: 'lineupCheck',
      log,
    },
    events,
  }
}

/**
 * カード1枚ぶんの練習を全部員に適用する。
 *
 * **成長の土台はここ。** 止まったマスは倍率（`cellGrowthBonus`）で効くだけで、
 * 練習マスを踏めなくても進んだ日数ぶんは必ず伸びる。
 * 練習効率バフ（黄マス・合宿の余韻）もここで消費する。
 */
function applyCardTraining(
  state: GameState,
  rng: Rng,
  params: {
    players: Player[]
    card: PracticeCard
    /** 進んだ日数。成長量はこれに比例する */
    steps: number
    cellKind: CellKind
    firstSquad: Set<string>
  },
): { players: Player[]; events: GameEvent[]; boostConsumed: boolean } {
  const { players, card, steps, cellKind, firstSquad } = params
  const def = PRACTICE_DEFS[card.kind]

  // 能力を伸ばさないカード（休養・治療・ミーティングなど）では何も起きない
  if (def.gains.length === 0 || steps <= 0) {
    return { players, events: [], boostConsumed: false }
  }

  const boost = state.practiceBoost
  const cellBonus = cellGrowthBonus(cellKind)

  const { players: updated, changes, pitchNews } = applyPractice(rng, players, def, {
    steps,
    isRare: card.isRare,
    multiplier:
      (boost?.multiplier ?? 1) *
      cellBonus *
      // グラウンド整備とマネージャーは常時かかる恒久的な倍率
      groundMultiplier(state.groundLevel) *
      managerGrowthBonus(state.managers),
    // ベンチ外は指導が行き届かないぶん伸びが鈍い
    perPlayerMultiplier: (player) => squadMultiplierOf(player.id, firstSquad),
    // ポジションごとの成長の優先順（監督が並べ替えられる）
    growthPlan: state.growthPlan,
  })

  const events: GameEvent[] = [
    {
      type: 'message',
      text: card.isRare
        ? `${def.label}（キラ）で猛練習した！（${steps}日）`
        : `${def.label}に取り組んだ（${steps}日）`,
      tone: card.isRare ? 'good' : 'normal',
    },
  ]
  if (boost) {
    events.push({
      type: 'message',
      text: `練習効率アップ！ 効果が${boost.multiplier}倍になった`,
      tone: 'good',
    })
  }
  if (changes.length > 0) events.push({ type: 'ability', changes })
  // 球種を覚えた・変化量が上がったことを知らせる
  for (const text of pitchNews ?? []) {
    events.push({ type: 'message', text, tone: 'good' })
  }

  return { players: updated, events, boostConsumed: boost !== null }
}

/** 地区大会か（全国大会でなければ true） */
function isLocalTournament(kind: TournamentKind): boolean {
  return kind === 'summerPref' || kind === 'autumnPref'
}

/**
 * 大会の山を引く。
 *
 * **1回戦の組み合わせは完全な抽選**なので、運が悪ければ初戦から優勝候補と当たる。
 * 難易度を回戦ごとに決め打ちしてはいない。
 *
 * 県大会は**県内の学校をそのまま並べる**（全校を持っている）。
 * 全国大会は各県の代表が集まる場なので、
 * 持っている県外20校に、その大会限りの代表校を足して埋める。
 */
function bracketFor(rng: Rng, state: GameState, kind: TournamentKind): Bracket {
  const region = findRegion(state.regionId)
  const base = createTournament(kind, region)

  // **全国大会は各県から1校ずつ。** 県外の学校をそのまま並べると、
  // 同じ県から何校も甲子園に出てくることになる
  const schools = isLocalTournament(kind)
    ? localRivals(state.rivals, state.regionId)
    : nationalRepresentatives(state.rivals, state.regionId)

  const pool: BracketTeam[] = schools.map((school) => ({
    schoolId: school.id,
    name: school.name,
    strength: school.strength,
  }))

  // 学校が足りないぶんは、その大会限りの相手で埋める。
  // 全国大会は49校ぶんの代表が要るので、ここが主に効く。
  // **名前は `makeSchoolName` で作る。** 固定の一覧から重複しない名前を
  // 引き続けようとすると、一覧を使い切った時点で止まらなくなる
  const takenNames = pool.map((team) => team.name)
  const range = opponentRangeFor(kind, region)

  // 全国大会の相手は各県の代表。まだ代表が居ない県から順に割り当てる
  const usedRegions = new Set([state.regionId, ...schools.map((school) => school.regionId)])
  const spare = REGIONS.filter((r) => !usedRegions.has(r.id))

  while (pool.length < base.entrants - 1) {
    const from = isLocalTournament(kind)
      ? region.id
      : (spare[(pool.length - schools.length) % Math.max(1, spare.length)]?.id ?? region.id)
    const name = makeSchoolName(rng, takenNames, from)
    takenNames.push(name)
    pool.push({ name, strength: rng.int(range.from, range.to) })
  }

  return createBracket(rng, {
    totalRounds: base.totalRounds,
    ours: { name: state.schoolName, strength: 0 },
    pool,
    entrants: base.entrants,
  })
}

/**
 * その大会限りの相手の強さの幅。
 * 実在の学校（`rivals`）と釣り合う水準に置く。
 */
function opponentRangeFor(
  kind: TournamentKind,
  region: ReturnType<typeof findRegion>,
): { from: number; to: number } {
  const first = opponentStrengthFor({ ...createTournament(kind, region), round: 1 }, region)
  const last = opponentStrengthFor(
    { ...createTournament(kind, region), round: createTournament(kind, region).totalRounds },
    region,
  )
  return { from: first, to: last }
}

/**
 * 相手校の部員名簿。学校が分からなければ undefined。
 *
 * 名簿は保存していない。`rivalRoster` が学校の種から毎回同じ顔ぶれを作る
 * （CLAUDE.md「他校を足すとき」— 全校ぶんの選手を抱えるとセーブが膨らむ）。
 */
function rosterOfSchool(state: GameState, schoolId?: string): Player[] | undefined {
  if (!schoolId) return undefined
  const school = state.rivals.find((rival) => rival.id === schoolId)
  return school ? rivalRoster(school, state.year, seasonProgressOfCell(state.boardPosition)) : undefined
}

/**
 * ベンチ入りを差し替える。
 * 在籍していない選手や重複は落とし、定員に足りなければ繰り上げる。
 */
function setSquad(state: GameState, squad: string[]): EngineResult {
  // 足りなくても埋めない。埋めるとベンチ外へ落とした選手がその場で戻ってくる
  const trimmed = trimSquad(squad, state.players)

  // スタメンは必ずベンチ入りに含める（出場する選手がベンチ外というのは成立しない）
  const withStarters = [...trimmed]
  for (const slot of state.lineup.slots) {
    if (!withStarters.includes(slot.playerId)) withStarters.push(slot.playerId)
  }
  const next = trimSquad(withStarters, state.players)

  if (next.join(',') === state.squad.join(',')) return { state, events: [] }
  return { state: { ...state, squad: next }, events: [] }
}

/** スタメンを差し替える。成立していない編成は受け付けない */
function setLineup(state: GameState, lineup: Lineup): EngineResult {
  if (validateLineup(lineup, state.players).length > 0) {
    return { state, events: [] }
  }
  return { state: { ...state, lineup }, events: [] }
}

/**
 * カードを1枚選んで、コマを進め、止まったマスを解決する。
 *
 * 盤面は1マス＝1日、1年で1本（365マス）。
 * カードの数字は「進む日数」で、途中に大会や合宿があれば
 * **飛び越えずに必ずそこで止まる**。
 * 月をまたいだ場合は、またいだ月の処理（部費・体力回復・固定イベント）を
 * その場でまとめて行う。
 */
/**
 * チーム全体で動いたもの（信頼度・やる気）を一言にする。
 * 1人ずつ並べても読めないので、平均の変化だけを出す。
 */
function teamNotes(before: Player[], after: Player[]): string[] {
  if (before.length === 0) return []

  const average = (list: Player[], read: (player: Player) => number) =>
    list.reduce((sum, player) => sum + read(player), 0) / list.length

  const notes: string[] = []
  const trust = Math.round(average(after, (p) => p.trust) - average(before, (p) => p.trust))
  const motivation =
    average(after, (p) => p.motivation) - average(before, (p) => p.motivation)

  if (trust !== 0) notes.push(`チームの信頼度 ${trust > 0 ? '+' : ''}${trust}`)
  if (motivation > 0.05) notes.push('チームのやる気が上がった')
  if (motivation < -0.05) notes.push('チームのやる気が下がった')

  return notes
}

function selectCard(state: GameState, cardId: string): EngineResult {
  // 他のフェーズ中は操作を受け付けない（連打対策）
  if (state.phase !== 'cardSelect') {
    return { state, events: [] }
  }

  const card = state.hand.find((c) => c.id === cardId)
  if (!card) {
    throw new Error(`手札に存在しないカードが選択された: ${cardId}`)
  }

  const rng = createRng(state.rngState)
  const events: GameEvent[] = []

  const from = state.boardPosition
  const wanted = Math.min(from + card.number, GOAL_INDEX)
  // 大会・合宿は通り過ぎられない
  const forced = forcedStopBetween(state.board, from, wanted)
  const to = forced ?? wanted

  events.push({ type: 'moved', from, to, steps: to - from })
  if (forced !== null && forced < wanted) {
    events.push({
      type: 'message',
      text: `${formatDay(dayOfCell(forced))}。ここは飛ばせない`,
      tone: 'normal',
    })
  }

  /*
   * 効果に使う日数。**飛び越えられずに止められたぶんも、やったことにする。**
   *
   * 大会や合宿のマスは飛び越えられないので、5のカードを切っても
   * 1マスしか進まないことがある。そのとき成長も体力の回復も5分の1になり、
   * **大会の直前に休養カードを切ると、ほとんど回復しないまま試合に入っていた**。
   * プレイヤーには避けようがないうえ、画面のどこにも理由が出ない。
   * 移動だけを止めて、練習・休養そのものはカードどおりに入れる。
   */
  const effectSteps = wanted - from

  // 止まったマスに関係なく、カードを使った時点で体力を消耗する
  let players = applyCardCost(
    rng,
    state.players,
    PRACTICE_DEFS[card.kind],
    effectSteps,
    managerConditionCost(state.managers),
  )

  // 投手の疲労は**進んだ日数**で抜ける。
  // 月ごとに戻す体力と違い、大会の中1日でどれだけ回復するかが効くので日単位で扱う
  players = recoverPitcherFatigue(players, to - from)

  // 自主練としてのコンバートは、どのマスに止まっても進む
  const converted = applyConvertTraining(rng, players)
  players = converted.players
  events.push(...converted.events)

  // 練習以外のカード（ミーティング・整備・治療）の効果
  const special = applyCardSpecial(state, players, PRACTICE_DEFS[card.kind].special)
  players = special.players
  events.push(...special.events)

  // 月をまたいだぶんの処理をまとめて行う
  const monthly = applyMonthChanges(
    rng,
    { ...state, players, groundLevel: special.groundLevel },
    from,
    to,
  )
  players = monthly.players
  events.push(...monthly.events)

  const cell = state.board[to]
  events.push({ type: 'cell', cellIndex: to, cellKind: cell.kind })

  const firstSquad = firstSquadSet(state.squad)

  // ── カードによる成長 ──
  // **止まったマスに関係なく、進んだ日数ぶん必ず伸びる。**
  // マスは倍率で効くだけ。以前は練習マス限定だったので、
  // カードの数字が移動距離の意味しか持っていなかった
  const training = applyCardTraining(state, rng, {
    players,
    card,
    steps: effectSteps,
    cellKind: cell.kind,
    firstSquad,
  })
  players = training.players
  events.push(...training.events)

  const outcome = resolveCell(rng, cell, card, {
    players,
    lineup: state.lineup,
    defenseBonus: managerDefenseBonus(state.managers),
    // 練習試合が他県への遠征になることがあるので、所在地と部費を渡す
    region: findRegion(state.regionId),
    funds: monthly.funds,
    // 練習試合の相手はその土地の学校から引く（地元でも遠征先でも）
    rivals: state.rivals,
    serial: state.serial,
  })
  events.push(...outcome.events)

  // バフは**毎手消費する**。練習マス限定で消費していた頃と違い、
  // 練習そのものが毎手起きるようになったため
  const practiceBoost = nextBoost(state.practiceBoost, outcome.boost, training.boostConsumed)

  // 使ったカードを補充する。評判が上がっていれば枠ごと増える
  const handSize = handSizeFor(monthly.reputation)
  const unlocked = unlockedKinds(monthly.equipment)
  // 治療は**離脱中の選手がいるときだけ**出す。
  // このマスで怪我をした選手も含めるので、判定は解決後の名簿で行う
  const hasInjured = outcome.players.some((player) => player.injuryMonths > 0)
  let serial = state.serial
  const refilled = replaceCard(rng, state.hand, cardId, serial, handSize, unlocked, hasInjured)
  serial += Math.max(1, handSize - (state.hand.length - 1))

  // 器具が壊れたら、その練習のカードは手札からも引き直す
  const broken = replaceBrokenCards(rng, refilled, monthly.lostKinds, serial, unlocked, hasInjured)
  serial += monthly.lostKinds.length > 0 ? refilled.length : 0

  // 怪我人が復帰したら、残っている治療カードも引き直す
  const hand = replaceUselessCards(rng, broken, serial, unlocked, hasInjured)
  serial += hand === broken ? 0 : broken.length

  // 止まったマスの種類でフェーズが決まる
  const reachedGoal = to >= GOAL_INDEX
  let tournament = state.tournament
  let phase: GameState['phase']

  if (outcome.friendlyOffers) {
    phase = 'matchOffer'
  } else if (outcome.matchSetup) {
    phase = 'lineupCheck'
  } else if (outcome.fork) {
    phase = 'fork'
  } else if (outcome.playerEvent) {
    phase = 'playerEvent'
  } else if (cell.kind === 'tournament' && cell.tournamentKind) {
    // 大会マスに止まった。まだ始まっていなければ開幕させる
    if (!tournament || tournament.kind !== cell.tournamentKind) {
      tournament = createTournament(
        cell.tournamentKind,
        findRegion(state.regionId),
        bracketFor(rng, state, cell.tournamentKind),
      )
      events.push({
        type: 'message',
        text: `${tournament.name}が開幕（${tournament.entrants}校・${tournament.totalRounds}回戦制）`,
        tone: 'normal',
      })
    }
    phase = 'tournament'
  } else if (cell.kind === 'camp') {
    phase = 'camp'
  } else if (reachedGoal) {
    events.push({ type: 'message', text: '年度末。1年が終わった', tone: 'normal' })
    phase = 'yearEnd'
  } else {
    phase = 'cardSelect'
  }

  // ── その日の成長の報告 ──
  // **マスの効果が画面を奪う前に、必ず一度見せる。**
  // 試合マスに止まると練習の結果を見る前に試合が始まってしまっていた。
  // 効果はもう解決済みで、ここでは進むフェーズを先送りするだけ
  const grown = events.flatMap((event) => (event.type === 'ability' ? event.changes : []))

  /*
   * **能力以外の変化も報告する。**
   * ミーティングやメンタル強化は能力を伸ばさないので、
   * 一覧が空のまま「目に見える変化は無かった」と出ていた。
   * 実際には信頼度とやる気が動いているのに、何も起きていないように見える。
   */
  const notes = teamNotes(state.players, outcome.players)
  const pendingGrowth: PendingGrowth | null =
    grown.length > 0 || notes.length > 0
      ? { changes: grown, ...(notes.length > 0 ? { notes } : {}), nextPhase: phase }
      : null
  if (pendingGrowth) phase = 'growthReport'

  const { log, serial: nextSerial } = appendLog(state.log, events, serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      players: outcome.players,
      // 部員の増減はないが、念のため編成の整合性を保つ
      lineup: repairLineup(state.lineup, outcome.players),
      boardPosition: to,
      month: monthOfDay(dayOfCell(to)),
      hand,
      serial: nextSerial,
      practiceBoost,
      pendingMatch: null,
      pendingSetup: outcome.matchSetup ?? null,
      pendingFork: outcome.fork === true,
      pendingEvent: outcome.playerEvent ?? null,
      pendingOffers: outcome.friendlyOffers ?? null,
      pendingGrowth,
      tournament,
      // 遠征費などマスで発生した収支。部費は0を下回らせない
      funds: clamp(monthly.funds + (outcome.fundsDelta ?? 0), 0, FUNDS_MAX),
      groundLevel: monthly.groundLevel,
      equipment: monthly.equipment,
      scouting: monthly.scouting,
      u18Squad: monthly.u18Squad,
      reputation: applyReputation(monthly.reputation, outcome.reputationDelta ?? 0),
      phase,
      log,
    },
    events,
  }
}

/**
 * 練習以外のカードの効果を適用する。
 *
 * 能力を伸ばすだけのカードばかりだと選択が単調になるので、
 * やる気・設備・怪我といった**別の軸に効く**カードを混ぜている。
 */
function applyCardSpecial(
  state: GameState,
  players: GameState['players'],
  special: PracticeSpecial | undefined,
): { players: GameState['players']; groundLevel: number; events: GameEvent[] } {
  if (!special) return { players, groundLevel: state.groundLevel, events: [] }

  if (special === 'motivationUp') {
    return {
      players: players.map((player) => ({
        ...player,
        motivation: clamp(player.motivation + 1, -2, 2) as Player['motivation'],
      })),
      groundLevel: state.groundLevel,
      events: [{ type: 'message', text: 'チームのやる気が上がった', tone: 'good' }],
    }
  }

  if (special === 'groundUp') {
    const level = clampGroundLevel(state.groundLevel + 1)
    if (level === state.groundLevel) {
      return {
        players,
        groundLevel: level,
        events: [
          { type: 'message', text: 'グラウンドはこれ以上ないほど整っている', tone: 'normal' },
        ],
      }
    }
    return {
      players,
      groundLevel: level,
      events: [
        {
          type: 'message',
          text: `部員総出でグラウンドを整備した（Lv${state.groundLevel} → Lv${level}）`,
          tone: 'good',
        },
      ],
    }
  }

  // heal: 離脱中の選手の復帰が早まる
  const healed = players.filter((player) => player.injuryMonths > 0)
  return {
    players: players.map((player) =>
      player.injuryMonths > 0 ? { ...player, injuryMonths: player.injuryMonths - 1 } : player,
    ),
    groundLevel: state.groundLevel,
    events:
      healed.length > 0
        ? [
            {
              type: 'message',
              text: `${healed.map((p) => p.name).join('・')}の治療が進んだ`,
              tone: 'good',
            },
          ]
        : [{ type: 'message', text: '幸い、怪我をしている部員はいなかった', tone: 'normal' }],
  }
}

/** 月替わりでまとめて起きることの結果 */
type MonthChangeResult = {
  players: GameState['players']
  funds: number
  reputation: number
  groundLevel: number
  equipment: string[]
  scouting: GameState['scouting']
  u18Squad: GameState['u18Squad']
  /** 壊れて使えなくなった練習。手札から取り除くために返す */
  lostKinds: PracticeKind[]
  events: GameEvent[]
}

/**
 * from の翌日から to までに月をまたいだぶんの処理をまとめて行う。
 *
 * 盤面が1年ぶりになり「月末に止まる」という区切りが無くなったので、
 * **月をまたいだ瞬間**にここで月次処理を走らせる。
 * カード1枚で2ヶ月ぶんまたぐこともあるため、またいだ月をすべて順に処理する。
 */
function applyMonthChanges(
  rng: Rng,
  state: GameState,
  from: number,
  to: number,
): MonthChangeResult {
  // from/to はマスの番号なので、日付に直してから月をまたいだか調べる
  const crossed = monthsCrossed(dayOfCell(from), dayOfCell(to))
  const events: GameEvent[] = []

  let players = state.players
  let funds = state.funds
  let groundLevel = state.groundLevel
  let equipment = state.equipment
  let scouting = state.scouting
  let u18Squad = state.u18Squad
  const reputation = state.reputation

  for (const month of crossed) {
    const result = applyOneMonth(
      rng,
      { ...state, players, funds, groundLevel, equipment, scouting, u18Squad },
      month,
    )
    players = result.players
    funds = result.funds
    groundLevel = result.groundLevel
    equipment = result.equipment
    scouting = result.scouting
    u18Squad = result.u18Squad
    events.push(...result.events)
  }

  // 壊れた器具ぶんの練習は、この先もう引けない
  const lostKinds = unlockedKinds(state.equipment).filter(
    (kind) => !unlockedKinds(equipment).includes(kind),
  )

  return {
    players,
    funds,
    reputation,
    groundLevel,
    equipment,
    scouting,
    u18Squad,
    lostKinds,
    events,
  }
}

/**
 * 月が1つ変わったときにまとめて起きること。
 *
 * 部費の支給と維持費、体力回復、やる気の変動、急成長・スランプ、
 * その月の学校行事、能力の記録。
 * **4月（年度初め）も同じ処理を通す。** 通さないと入学式だけ起きない。
 */
export function applyOneMonth(
  rng: Rng,
  state: GameState,
  month: Month,
): {
  players: GameState['players']
  funds: number
  groundLevel: number
  equipment: string[]
  scouting: GameState['scouting']
  u18Squad: GameState['u18Squad']
  events: GameEvent[]
} {
  const events: GameEvent[] = []
  let players = state.players
  let funds = state.funds
  let groundLevel = state.groundLevel
  let equipment = state.equipment
  let scouting = state.scouting
  let u18Squad = state.u18Squad

  events.push({ type: 'monthAdvanced', year: state.year, month })
  events.push({ type: 'message', text: `${state.year}年目 ${month}月`, tone: 'normal' })

  // 月をまたぐと少しだけ体力が戻る。トレーナーが居るとさらに回復する
  const recovery = 10 + managerRecovery(state.managers)
  players = players.map((player) => ({
    ...player,
    condition: Math.min(100, player.condition + recovery),
    motivation: rollMonthlyMotivation(rng, player.motivation),
    // 離脱期間は月をまたぐごとに1つ減る
    injuryMonths: Math.max(0, player.injuryMonths - 1),
  }))

  // 怪我から復帰した選手を知らせる
  for (const before of state.players) {
    if (before.injuryMonths === 1) {
      events.push({ type: 'message', text: `${before.name}が怪我から復帰した`, tone: 'good' })
    }
  }

  // 月初に部費が支給され、設備と備品の維持費が引かれる
  const income = Math.round(monthlyFunds(state.reputation) * managerFundsRate(state.managers))
  const upkeep = monthlyUpkeep(players.length, state.groundLevel)
  const unpaid = funds + income < upkeep.total
  funds = clamp(funds + income - upkeep.total, 0, FUNDS_MAX)

  events.push({
    type: 'message',
    text: `部費 ${formatFunds(income)} が支給された`,
    tone: 'normal',
  })
  events.push({
    type: 'message',
    text: `設備と備品の維持費 ${formatFunds(upkeep.total)} を支払った`,
    tone: 'normal',
  })

  // 払えないと道具が足りず、部員の不満になる
  if (unpaid) {
    players = players.map((player) => ({
      ...player,
      trust: clamp(player.trust - UNPAID_TRUST_PENALTY, 0, 100),
    }))
    events.push({
      type: 'message',
      text: '維持費を払いきれず、道具が足りていない。部員の信頼度が下がった',
      tone: 'bad',
    })
  }

  // 練習器具は使ううちに壊れる。壊れるとその練習カードは出なくなる
  const broken = equipment.filter((id) => {
    const item = findEquipment(id)
    return item !== undefined && rng.chance(item.breakChance)
  })
  if (broken.length > 0) {
    equipment = equipment.filter((id) => !broken.includes(id))
    for (const id of broken) {
      const item = findEquipment(id)
      if (item) {
        events.push({
          type: 'message',
          text: `${item.name}が壊れてしまった。「${PRACTICE_LABELS[item.unlocks]}」は選べなくなる`,
          tone: 'bad',
        })
      }
    }
  }

  // グラウンドは放っておくと荒れる。維持費を払えなかった月は荒れやすい。
  // これが無いと、部費が貯まった時点で最大段階に固定されてしまう
  const decayChance = groundDecayChance(groundLevel) * (unpaid ? 2 : 1)
  if (groundLevel > GROUND_LEVEL_MIN && rng.chance(decayChance)) {
    const before = groundLevel
    groundLevel = Math.max(GROUND_LEVEL_MIN, groundLevel - rng.int(1, GROUND_DECAY_STEPS))
    events.push({
      type: 'message',
      text: `グラウンドが荒れてきた（Lv${before} → Lv${groundLevel}）`,
      tone: 'bad',
    })
  }

  // 急成長・スランプ。練習の積み上げとは別に偶発的に起きる
  const streaks = applyStreaks(rng, players)
  players = streaks.players
  for (const streak of streaks.events) {
    events.push({
      type: 'message',
      text: streak.text,
      tone: streak.kind === 'breakout' ? 'good' : 'bad',
    })
    events.push({ type: 'ability', changes: streak.changes })
  }

  // その月の学校行事（毎年決まって起きる）
  const fixedEvent = fixedEventFor(month)
  if (fixedEvent) {
    const applied = fixedEvent.apply(rng, players)
    players = applied.players
    events.push({ type: 'message', text: applied.text, tone: 'normal' })
  }

  // 秋：ここから世代交代までがスカウトの期間。
  // 候補は**県を訪問した時点で**挙がるので、ここでは案内するだけ
  if (month === SCOUT_OPEN_MONTH) {
    events.push({
      type: 'message',
      text: '来年度のスカウトが解禁された。視察する県を選ぼう',
      tone: 'normal',
    })
  }

  // 月ごとに能力を記録して、あとから推移を追えるようにする
  players = players.map((player) => ({
    ...player,
    history: [...player.history, snapshotOf(player, state.year, month)].slice(-HISTORY_LIMIT),
  }))

  return { players, funds, groundLevel, equipment, scouting, u18Squad, events }
}

/** U18日本代表が召集される月。冬の合宿の前 */

/**
 * 練習効率バフの更新。
 * 新しく得たバフは、残り効果量（倍率×残り回数）が大きい方を採用する。
 */
function nextBoost(
  current: PracticeBoost | null,
  gained: PracticeBoost | undefined,
  consumed: boolean | undefined,
): PracticeBoost | null {
  let boost = current

  if (consumed && boost) {
    const remaining = boost.remaining - 1
    boost = remaining > 0 ? { ...boost, remaining } : null
  }

  if (gained) {
    const worth = (b: PracticeBoost) => b.multiplier * b.remaining
    if (!boost || worth(gained) >= worth(boost)) return gained
  }

  return boost
}

/**
 * 年度末（3月31日）の結果を確認して、次の年度を始める。
 *
 * 盤面が1年ぶんになったので、月ごとの区切りは無くなり
 * **年度の切り替えだけ**がここに残る。
 * 卒業・進級・新入生加入と、新しい1年ぶんの盤面の用意を行う。
 */
function advanceYear(state: GameState): EngineResult {
  if (state.phase !== 'yearEnd') {
    return { state, events: [] }
  }

  const rng = createRng(state.rngState)
  const year = state.year + 1

  // 全国大会の出場権は年度をまたぐと失効する
  const board = withSeasonTournaments(createBoard(rng), state.regionId)
  const handSize = handSizeFor(state.reputation)
  // 3年生は抜けるので、残る部員に離脱者がいるかで見る
  const hand = drawHand(
    rng,
    state.serial,
    handSize,
    unlockedKinds(state.equipment),
    state.players.some((player) => player.grade !== 3 && player.injuryMonths > 0),
  )
  let serial = state.serial + handSize

  const events: GameEvent[] = [
    { type: 'monthAdvanced', year, month: SEASON_START_MONTH },
    { type: 'message', text: `${year}年目 ${SEASON_START_MONTH}月`, tone: 'normal' },
  ]

  // スカウトの結果を出す。獲れた選手は新入生に加わり、
  // 逃した選手は県内のライバル校へ進む
  const scouted = resolveScouting(rng, state, year)
  serial = scouted.serial

  const change = advanceSeason(rng, {
    players: state.players,
    reputation: state.reputation,
    year,
    serial,
    alumni: state.graduates,
    // スカウトで投手を獲れていれば、そのぶん新入生の投手枠を減らす
    scoutedPitchers: scouted.joined.filter((player) => player.isPitcher).length,
  })

  const players = [...change.players, ...scouted.joined]
  serial = change.serial

  // マネージャーも部員。3年生を送り出し、確率で新しく1人入部してくる
  const managerChange = advanceManagers(rng, {
    managers: state.managers,
    year,
    serial,
    takenNames: players.map((player) => player.name),
  })
  serial = managerChange.serial

  // ライバル校の1年を進める。強豪は強豪のまま、力をつける学校も出てくる
  const advanced: RivalSchool[] = []
  const rivalNews: string[] = []
  for (const school of scouted.rivals) {
    const update = advanceRival(rng, school, year)
    advanced.push(update.school)
    if (update.news) rivalNews.push(update.news)
  }

  /*
   * **全国の1年ぶんの結果を決める。**
   * 強豪かどうかは地力ではなく戦績で決まるので、
   * 毎年どこかの学校が県を勝ち、そのうちの1校が全国を獲る。
   * 自県は実際の大会の結果を使う（自校が優勝した年は他校に付かない）。
   */
  const season = runRivalSeason(rng, advanced, state.regionId, state.year, state.nationalsBerth)
  const rivals = season.schools
  rivalNews.push(...season.news)
  // 新しい卒業生を先頭に、既存OBは進路が1年ぶん進んだものに差し替える。
  // 上限で切るときも、プロに届いた選手は落とさない
  const graduates = trimGraduates(
    [...change.graduates, ...change.updatedAlumni],
    GRADUATES_LIMIT,
  )

  const pendingSeason = {
    year,
    graduates: change.graduates,
    // **スカウトで獲った選手も新入部員。**
    // 別扱いにしていた頃は、通って獲った選手が新入生の一覧に出てこなかった
    newcomers: [...scouted.joined, ...change.newcomers],
    recommendedIds: change.recommendedIds,
    joinedManager: managerChange.joined,
    graduatedManagers: managerChange.graduated,
    careerNews: change.careerNews,
    scoutResults: scouted.results,
    rivalNews,
    reputationBefore: state.reputation,
    reputationAfter: state.reputation,
  }

  events.push({
    type: 'message',
    text: `${change.graduates.length}人が卒業し、${change.newcomers.length}人が入部した`,
    tone: 'normal',
  })
  for (const news of change.careerNews) {
    events.push({ type: 'message', text: news, tone: 'good' })
  }
  for (const manager of managerChange.graduated) {
    const role = findManagerRole(manager.roleId)
    events.push({
      type: 'message',
      text: `マネージャーの${manager.name}が卒業した（${role?.label ?? ''}）`,
      tone: 'normal',
    })
  }
  if (managerChange.joined) {
    const role = findManagerRole(managerChange.joined.roleId)
    events.push({
      type: 'message',
      text: `${managerChange.joined.name}がマネージャーとして入部した。${role?.label ?? ''}を任せる`,
      tone: 'good',
    })
  }
  // ログには会いに行った候補だけを出す。視察した県の全員を流すと埋まってしまう
  for (const result of scouted.results.filter((entry) => entry.approached)) {
    events.push({
      type: 'message',
      text: result.joined
        ? `スカウトしていた${result.name}が入部した！${
            result.skillName ? `「${result.skillName}」の持ち主だ` : ''
          }`
        : `${result.name}は${result.schoolName}（${result.regionName}）へ進んだ`,
      tone: result.joined ? 'good' : 'bad',
    })
  }
  for (const news of rivalNews) {
    events.push({ type: 'message', text: news, tone: 'normal' })
  }
  // 4月も「月が変わった」ので、他の月と同じ処理を通す。
  // 通さないと入学式（4月の行事）だけ起きない
  const april = applyOneMonth(
    rng,
    { ...state, players, year, month: SEASON_START_MONTH, rivals },
    SEASON_START_MONTH,
  )
  events.push(...april.events)

  // 年度をまたげば腕は完全に戻る。前年の連投を翌年まで引きずらせない
  const rested = april.players.map((player) =>
    fatigueOf(player) === 0 ? player : { ...player, fatigue: 0 },
  )
  const nextLineup = repairLineup(state.lineup, rested)
  const { log, serial: nextSerial } = appendLog(state.log, events, serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      year,
      month: SEASON_START_MONTH,
      // 出場権は年度をまたぐと失効する
      nationalsBerth: false,
      springBerth: false,
      phase: 'newSeason',
      players: rested,
      funds: april.funds,
      groundLevel: april.groundLevel,
      equipment: april.equipment,
      // 卒業で編成が崩れるので必ず組み直す
      lineup: nextLineup,
      // スタメンを先に入れてから埋める（スタメンがベンチ外、という状態を作らない）
      squad: repairSquad(
        [...nextLineup.slots.map((slot) => slot.playerId), ...state.squad],
        rested,
      ),
      graduates,
      managers: managerChange.managers,
      pendingSeason,
      rivals,
      // 訪問の記録と候補は使い切り。次の秋にまた視察して回る。
      // U15代表もその学年の顔ぶれなので、毎年選び直す
      scouting: {
        nationalTeam: createNationalTeam(rng, year),
        regions: [],
        visiting: null,
        results: scouted.results,
      },
      // 県の傾向も毎年引き直す。固定だと一度良い県を見つけたら
      // 毎年そこへ行くだけになり、行き先を選ぶ判断が1年目で終わってしまう
      scoutTraits: shiftTraits(rng, state.scoutTraits),
      tournament: null,
      board,
      boardPosition: 0,
      hand,
      practiceBoost: null,
      serial: nextSerial,
      log,
    },
    events,
  }
}

/**
 * スカウトの結果を出す。
 *
 * 足を運んだ回数と学校の評判で決まる。獲れなかった選手は
 * **県内のライバル校へ進む**ので、来年その選手と当たることになる。
 */
function resolveScouting(
  rng: Rng,
  state: GameState,
  year: number,
): {
  joined: Player[]
  results: ScoutResult[]
  rivals: RivalSchool[]
  serial: number
} {
  const results: ScoutResult[] = []
  const joined: Player[] = []
  let rivals = state.rivals
  let serial = state.serial

  // 訪問した県で挙がった候補は**全員**行き先が決まる。
  // 会いに行かなかった選手も他校へ進むので、
  // 「あのとき通っていれば」が後から分かる
  for (const prospect of allProspects(state.scouting)) {
    const approached = prospect.approaches > 0
    // U15代表は30人いるので、会いに行っていない選手まで報告に並べると
    // 読めなくなる。**行き先だけは決める**（強豪校の注目選手になる）
    const reportable = approached || !prospect.national

    if (approached && rng.chance(successChance(prospect, state.reputation))) {
      const player = createPlayer(rng, {
        id: `p${serial++}`,
        grade: 1,
        enrolledAt: { year, month: SEASON_START_MONTH },
        isPitcher: prospect.isPitcher,
        // スカウトした選手は**素質どおりの能力**で入学する。
        // 34を引いていた頃は、素質34と書いてあった選手が
        // 総合22（＝ごく普通の新入生）で入ってきていた。
        // カードに出す数字と実際が食い違うと、通う判断そのものが成り立たない
        talentBonus: prospect.rating - GRADE_BASE[1],
        // 素質を示してから獲った選手なので、そこからさらに振らない
        talentSpread: 0,
        // 名前は触れ込みのものを使うので、留学生としては作らない
        exchange: false,
        takenNames: state.players.map((p) => p.name),
      })
      // 触れ込みの特殊能力を持って入学してくる。ここがスカウトの意味
      joined.push({
        ...player,
        name: prospect.name,
        skills: prospect.skillId ? [prospect.skillId] : [],
        origin: 'scout',
      })
      results.push({
        name: prospect.name,
        rating: prospect.rating,
        regionName: findRegion(prospect.regionId).name,
        approached: true,
        joined: true,
        skillName: prospectSkillName(prospect),
        schoolName: null,
      })
      continue
    }

    const school = schoolForProspect(rng, rivals, prospect.rating, prospect.regionId)

    // **素質の高い選手だけ**を他校の注目選手として残す。
    // 10人×訪問県ぶんを全部抱えさせるとセーブが膨らむ。
    // ただし**会いに行った選手は素質を問わず残す。**
    // 出張費を払って通った相手が、翌年どこにも居ないのでは張り合いが無い
    if (school && (approached || prospect.rating >= RIVAL_STAR_MIN_RATING)) {
      rivals = rivals.map((s) =>
        s.id === school.id
          ? addStar(s, {
              id: `${school.id}-${prospect.id}`,
              name: prospect.name,
              grade: 1,
              isPitcher: prospect.isPitcher,
              rating: prospect.rating,
              enrolledYear: year,
              ...(prospect.skillId ? { skillId: prospect.skillId } : {}),
              // こちらが通っていた選手には印を付ける
              ...(approached ? { scouted: true } : {}),
            })
          : s,
      )
    }

    if (reportable) {
      results.push({
        name: prospect.name,
        rating: prospect.rating,
        regionName: findRegion(prospect.regionId).name,
        approached,
        joined: false,
        skillName: prospectSkillName(prospect),
        schoolName: school?.name ?? '地元の高校',
      })
    }
  }

  return { joined, results, rivals, serial }
}

/**
 * 他校の注目選手として残す素質の下限。
 * 全員を抱えさせるとセーブが膨らむので、覚えておく価値のある選手だけにする。
 */
const RIVAL_STAR_MIN_RATING = 56

/**
 * スカウトで県を訪問する。
 *
 * **出張費はここで決まる**（所在地からの距離）。
 * 初めての県なら候補が挙がり、二度目以降は同じ顔ぶれに会いに行ける。
 * 1回の出張で会えるのは1人だけ。
 */
function visitScoutRegion(state: GameState, regionId: RegionId): EngineResult {
  if (state.month < SCOUT_OPEN_MONTH && state.month > 3) return { state, events: [] }
  // すでに出張中なら、まず誰かに会う
  if (state.scouting.visiting !== null) return { state, events: [] }

  const home = findRegion(state.regionId)
  const target = findRegion(regionId)
  const cost = scoutTripCost(home, target)
  if (state.funds < cost) return { state, events: [] }

  const rng = createRng(state.rngState)
  const existing = findScoutRegion(state.scouting, regionId)

  const region: ScoutRegion = existing
    ? { ...existing, visits: existing.visits + 1 }
    : {
        regionId,
        visitedYear: state.year,
        visits: 1,
        prospects: createProspects(rng, {
          reputation: state.reputation,
          regionId,
          trait: state.scoutTraits[regionId] ?? 'contact',
          year: state.year,
          serial: state.scouting.regions.length,
        }),
      }

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `${target.name}へ視察に出た（${formatFunds(cost)}）`,
      tone: 'normal',
    },
  ]
  if (!existing) {
    events.push({
      type: 'message',
      text: `${target.name}で${region.prospects.length}人の候補が挙がった`,
      tone: 'good',
    })
  }

  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      rngState: rng.state,
      funds: state.funds - cost,
      scouting: {
        ...state.scouting,
        visiting: regionId,
        regions: existing
          ? state.scouting.regions.map((r) => (r.regionId === regionId ? region : r))
          : [...state.scouting.regions, region],
      },
      serial,
      log,
    },
    events,
  }
}

/**
 * 誰にも会わずに出張を終える。
 *
 * **出張費は戻らない**（行った時点で払っている）。
 * それでも、めぼしい候補が居ない県で「会わない」を選べないと、
 * 誰かに会うまで他の県へ行けないまま止まってしまう。
 */
function leaveScoutRegion(state: GameState): EngineResult {
  const visiting = state.scouting.visiting
  if (visiting === null) return { state, events: [] }

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `${findRegion(visiting).name}では誰にも会わずに引き上げた`,
      tone: 'normal',
    },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: { ...state, scouting: { ...state.scouting, visiting: null }, log, serial },
    events,
  }
}

/**
 * 候補に会いに行く。
 *
 * **費用は訪問の時点で払い済み**。ここでは出張を1回使い切る。
 * もう1人に会いたければ、もう一度その県へ出張する。
 */
function approachProspect(state: GameState, prospectId: string): EngineResult {
  const visiting = state.scouting.visiting
  if (visiting === null) return { state, events: [] }

  const region = findScoutRegion(state.scouting, visiting)
  const prospect = region?.prospects.find((p) => p.id === prospectId)
  if (!region || !prospect) return { state, events: [] }
  if (prospect.approaches >= MAX_APPROACHES) return { state, events: [] }

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `${prospect.name}に会い、熱心に誘った`,
      tone: 'normal',
    },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      scouting: {
        ...state.scouting,
        // 出張はここで使い切る
        visiting: null,
        regions: state.scouting.regions.map((r) =>
          r.regionId !== visiting
            ? r
            : {
                ...r,
                prospects: r.prospects.map((p) =>
                  p.id === prospectId ? { ...p, approaches: p.approaches + 1 } : p,
                ),
              },
        ),
      },
      serial,
      log,
    },
    events,
  }
}

/**
 * U15日本代表の1人に会いに行く。
 *
 * 県の候補と違い、**視察して顔ぶれを見る手順が要らない**（最初から見えている）。
 * その代わり出身県までの出張費をここで払う。
 * 遠くの代表を口説き続けるには、それだけ部費が要る。
 */
function approachNationalProspect(state: GameState, prospectId: string): EngineResult {
  if (state.month < SCOUT_OPEN_MONTH && state.month > 3) return { state, events: [] }
  // 県への出張中は動けない。まずそちらで誰かに会う
  if (state.scouting.visiting !== null) return { state, events: [] }

  const prospect = findNationalProspect(state.scouting, prospectId)
  if (!prospect) return { state, events: [] }
  if (prospect.approaches >= MAX_APPROACHES) return { state, events: [] }

  const cost = scoutTripCost(findRegion(state.regionId), findRegion(prospect.regionId))
  if (state.funds < cost) return { state, events: [] }

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `U15代表の${prospect.name}に会いに${findRegion(prospect.regionId).name}へ出た（${formatFunds(cost)}）`,
      tone: 'normal',
    },
  ]
  const { log, serial } = appendLog(state.log, events, state.serial)

  return {
    state: {
      ...state,
      funds: state.funds - cost,
      scouting: {
        ...state.scouting,
        nationalTeam: state.scouting.nationalTeam.map((entry) =>
          entry.id === prospectId ? { ...entry, approaches: entry.approaches + 1 } : entry,
        ),
      },
      serial,
      log,
    },
    events,
  }
}

/**
 * 進んだ日数ぶん、投手の疲労を抜く。
 * 野手は疲労を持たないので触らない。
 */
function recoverPitcherFatigue(players: Player[], days: number): Player[] {
  if (days <= 0) return players

  return players.map((player) => {
    const current = fatigueOf(player)
    if (current === 0) return player

    const next = recoveredFatigue(current, days)
    return next === current ? player : { ...player, fatigue: next }
  })
}

/**
 * 月替わりでやる気が揺れる。
 * 40%の確率で1段階上下し、それ以外は据え置き。
 */
function rollMonthlyMotivation(
  rng: Rng,
  current: number,
): GameState['players'][number]['motivation'] {
  if (!rng.chance(0.4)) return current as GameState['players'][number]['motivation']
  const delta = rng.chance(0.5) ? 1 : -1
  const next = Math.min(2, Math.max(-2, current + delta))
  return next as GameState['players'][number]['motivation']
}

/** message イベントを画面ログに積む。古いものから捨てる */
function appendLog(
  log: LogEntry[],
  events: GameEvent[],
  startSerial: number,
): { log: LogEntry[]; serial: number } {
  let serial = startSerial
  const added: LogEntry[] = []

  for (const event of events) {
    if (event.type !== 'message') continue
    added.push({ id: `log-${serial}`, text: event.text, tone: event.tone })
    serial += 1
  }

  return { log: [...log, ...added].slice(-LOG_LIMIT), serial }
}
