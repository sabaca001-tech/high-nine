/**
 * 試合の進行。
 *
 * 重要な設計: **試合は半回ずつ進む。**
 * 回の切れ目で状態を返すので、そこにプレイヤーの選手交代を挟める。
 * 交代を挟まなければ、どの速度で見ても結果は完全に同じになる
 * （乱数の並びが変わらないため）。
 *
 * UI は plays を好きな速度で再生するだけで、結果には一切影響しない（README 3.4）。
 */

import type { Rng } from '@/core/rng/random'
import type {
  BattingLine,
  Half,
  MatchEventLog,
  MatchKind,
  MatchResult,
  MatchSetup,
  PitchingLine,
  PlayLog,
} from '@/core/types/match'
import { createOpponent } from './opponent'
import { playHalf } from './halfInning'
import type { MatchTeam } from './teamState'
import { benchPlayers, createTeam, swapIn } from './teamState'

/** 通常の試合回数 */
const REGULATION_INNINGS = 9
/** 引き分けにする上限（延長） */
const MAX_INNINGS = 12

/** 決着をつける試合の上限。ここに達することはまず無い */
const MAX_INNINGS_DECISIVE = 25

/** タイブレークが始まる回 */
const TIEBREAK_FROM = 10

/**
 * コールドゲームの規定。**その回を終えた時点**の点差で成立する。
 *
 * 地方大会の一般的な規定に合わせて「5回10点差・7回7点差」。
 * これが無いと、力の差がはっきりついた試合でも9回まで投げ切ることになり、
 * 投手の疲労だけが積み上がっていた。
 *
 * 回の大きい順に並べる（7回以降は7点差で成立し、10点差でも当然成立する）。
 */
const MERCY_RULES: { fromInning: number; lead: number }[] = [
  { fromInning: 7, lead: 7 },
  { fromInning: 5, lead: 10 },
]

/** その回を終えた時点でコールドが成立する点差。無ければ null */
export function mercyLeadAt(inning: number): number | null {
  return MERCY_RULES.find((rule) => inning >= rule.fromInning)?.lead ?? null
}

/**
 * その時点でコールドゲームが成立しているか。
 * **コールドの無い試合（全国大会）では常に false。**
 */
function isMercy(state: MatchState, inning: number): boolean {
  if (!state.mercy) return false
  const lead = mercyLeadAt(inning)
  return lead !== null && Math.abs(state.home.runs - state.away.runs) >= lead
}

/**
 * 進行中の試合。**JSON にそのまま変換できる形だけを持つ**
 * （回の切れ目でセーブデータに入るため）。
 */
export type MatchState = {
  kind: MatchKind
  decisive: boolean
  /** コールドゲームがあるか。全国大会だけ false */
  mercy: boolean
  /** 相手がライバル校ならその id。対戦成績を残すのに使う */
  opponentSchoolId: string | null
  /**
   * 相手の強さ。0が互角、+20なら格上。
   * 試合が終わったあとに**格上に勝ったのか格下に負けたのか**を判定するため、
   * 結果まで持ち回る（評判の増減がここで決まる）。
   */
  opponentStrength: number
  /** 自校（後攻） */
  home: MatchTeam
  /** 相手（先攻） */
  away: MatchTeam
  inning: number
  half: Half
  /** 進行中の回の得点。表と裏をまたいで積む */
  currentLine: { player: number; opponent: number }
  innings: { player: number; opponent: number }[]
  plays: PlayLog[]
  events: MatchEventLog[]
  /** 打席と交代を同じ時系列に並べるための通し番号 */
  serial: number
  /** 試合が終わっていれば結果。まだなら null */
  outcome: MatchResult['outcome'] | null
}

/** 試合を組み立てる。まだ1球も投げていない状態を返す */
export function startMatchState(rng: Rng, setup: MatchSetup): MatchState {
  const opponent = createOpponent(rng, setup.opponentStrength, setup.opponentName || undefined)

  return {
    kind: setup.kind,
    decisive: setup.decisive === true,
    // 省略時はコールドあり。無いのは全国大会だけ
    mercy: setup.mercy !== false,
    opponentSchoolId: setup.opponentSchoolId ?? null,
    opponentStrength: setup.opponentStrength,
    // プレイヤーは常に後攻。サヨナラ勝ちが起きるようにする
    away: createTeam({
      name: opponent.name,
      isPlayer: false,
      players: opponent.players,
      lineup: opponent.lineup,
    }),
    home: createTeam({
      name: '自校',
      isPlayer: true,
      players: setup.players,
      lineup: setup.lineup,
      // マネージャー（分析担当）は自校の守備だけを底上げする
      defenseBonus: setup.defenseBonus ?? 0,
    }),
    inning: 1,
    half: 'top',
    currentLine: { player: 0, opponent: 0 },
    innings: [],
    plays: [],
    events: [],
    serial: 0,
    outcome: null,
  }
}

/** 試合が終わっているか */
export function isMatchOver(state: MatchState): boolean {
  return state.outcome !== null
}

/**
 * 半回ぶん進める。**この関数を呼んだ回数だけ試合が進む。**
 * 引数を破壊せず、新しい状態を返す。
 */
export function stepHalfInning(rng: Rng, state: MatchState): MatchState {
  if (state.outcome !== null) return state

  const next = cloneState(state)
  const { inning, half } = next
  const maxInnings = next.decisive ? MAX_INNINGS_DECISIVE : MAX_INNINGS

  const tiebreak = next.decisive && inning >= TIEBREAK_FROM
  if (tiebreak && inning === TIEBREAK_FROM && half === 'top') {
    next.events.push({
      id: 'event-tb',
      order: next.serial++,
      inning,
      half: 'top',
      text: 'タイブレーク開始（無死一・二塁）',
    })
  }

  const nextOrder = () => next.serial++

  if (half === 'top') {
    next.currentLine = { player: 0, opponent: 0 }
    next.currentLine.opponent = playHalf(rng, {
      offense: next.away,
      defenseTeam: next.home,
      inning,
      half: 'top',
      plays: next.plays,
      events: next.events,
      nextOrder,
      stopOnLead: false,
      tiebreak,
      autoSubstitute: true,
    })

    // 9回以降、後攻がリードしていれば裏の攻撃は行わない。
    // **コールドが成立する点差で後攻がリードしている場合も同じ**
    // （5回表を終えて10点差なら、その裏を戦う意味が無い）
    const homeAhead = next.home.runs > next.away.runs
    if (homeAhead && (inning >= REGULATION_INNINGS || isMercy(next, inning))) {
      return closeInning(next, maxInnings)
    }

    next.half = 'bottom'
    return next
  }

  next.currentLine.player = playHalf(rng, {
    offense: next.home,
    defenseTeam: next.away,
    inning,
    half: 'bottom',
    plays: next.plays,
    events: next.events,
    nextOrder,
    // 9回以降はサヨナラで即終了する
    stopOnLead: inning >= REGULATION_INNINGS,
    tiebreak,
    autoSubstitute: true,
  })

  return closeInning(next, maxInnings)
}

/** 回を締めて、試合が終わったかを判定する */
function closeInning(state: MatchState, maxInnings: number): MatchState {
  state.innings.push(state.currentLine)
  state.currentLine = { player: 0, opponent: 0 }

  const decided = state.inning >= REGULATION_INNINGS && state.home.runs !== state.away.runs
  const exhausted = state.inning >= maxInnings
  const mercy = isMercy(state, state.inning)

  if (mercy) {
    state.events.push({
      id: `event-cold-${state.inning}`,
      order: state.serial++,
      inning: state.inning,
      half: state.half,
      text: `${state.inning}回コールドゲーム`,
    })
  }

  if (decided || exhausted || mercy) {
    state.outcome =
      state.home.runs > state.away.runs
        ? 'win'
        : state.home.runs < state.away.runs
          ? 'lose'
          : 'draw'
  } else {
    state.inning += 1
    state.half = 'top'
  }

  return state
}

/**
 * 決着した試合を結果にまとめる。
 * 引き分けが許されない試合の保険もここで処理する。
 */
export function finalizeMatch(rng: Rng, state: MatchState): MatchResult {
  let outcome = state.outcome ?? 'draw'

  // 決着必須なのに同点のまま上限に達した場合の保険。
  // 安打数の多い方を勝ちとし、それも同じなら乱数で決める（シードで再現可能）
  if (outcome === 'draw' && state.decisive) {
    if (state.home.hits !== state.away.hits) {
      outcome = state.home.hits > state.away.hits ? 'win' : 'lose'
    } else {
      outcome = rng.chance(0.5) ? 'win' : 'lose'
    }
  }

  const battingLines = state.home.batting
  const pitchingLines = assignDecision(state.home.pitching, outcome)

  return {
    kind: state.kind,
    opponentName: state.away.name,
    opponentSchoolId: state.opponentSchoolId,
    opponentStrength: state.opponentStrength,
    innings: state.innings,
    finalScore: { player: state.home.runs, opponent: state.away.runs },
    outcome,
    plays: state.plays,
    events: state.events,
    battingLines,
    pitchingLines,
    mvpPlayerId: pickMvp(battingLines, pitchingLines, outcome),
  }
}

/**
 * 勝敗を1人に付ける。
 *
 * 本来の「勝利投手」の規定は複雑なので、**最も長く投げた投手**に付ける。
 * 高校野球ではほとんどの試合で先発が最長になるため、実感と大きくずれない。
 * 引き分けなら誰にも付かない。
 */
function assignDecision(
  lines: PitchingLine[],
  outcome: MatchResult['outcome'],
): PitchingLine[] {
  if (outcome === 'draw' || lines.length === 0) return lines

  let bestIndex = 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].outs > lines[bestIndex].outs) bestIndex = i
  }

  return lines.map((line, index) =>
    index === bestIndex ? { ...line, decision: outcome === 'win' ? 'win' : 'lose' } : line,
  )
}

/**
 * 自校の選手を1人入れ替える。回の切れ目にだけ行える操作。
 * 成立しない交代なら null を返す（呼び手は状態を変えない）。
 */
export function applySubstitution(
  state: MatchState,
  slotIndex: number,
  incomingId: string,
): MatchState | null {
  if (state.outcome !== null) return null

  const next = cloneState(state)
  const team = next.home
  const slot = team.lineup.slots[slotIndex]
  if (!slot) return null

  const incoming = team.players.find((player) => player.id === incomingId)
  if (!incoming) return null
  if (!benchPlayers(team).some((player) => player.id === incomingId)) return null
  // 投手の枠には投手能力を持つ選手しか入れられない
  if (slot.position === 'P' && !incoming.pitching) return null

  const outgoing = team.players.find((player) => player.id === slot.playerId)
  swapIn(team, slotIndex, incoming)

  if (slot.position === 'P') {
    team.pitcherId = incoming.id
    team.faced = 0
    if (!team.usedPitchers.includes(incoming.id)) {
      team.usedPitchers = [...team.usedPitchers, incoming.id]
    }
  }

  next.events.push({
    id: `event-${next.serial}`,
    order: next.serial++,
    inning: next.inning,
    half: next.half,
    text: `${slot.position === 'P' ? '投手交代' : '選手交代'} ${outgoing?.name ?? ''} → ${incoming.name}`,
  })

  return next
}

/**
 * 試合を最後までシミュレートする。
 * 途中で交代を挟まない場面（自動プレイ・診断・テスト）で使う。
 */
export function simulateGame(rng: Rng, setup: MatchSetup): MatchResult {
  let state = startMatchState(rng, setup)
  while (!isMatchOver(state)) {
    state = stepHalfInning(rng, state)
  }
  return finalizeMatch(rng, state)
}

/** 半回ぶん進めるあいだ、元の状態を壊さないための複製 */
function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    home: cloneTeam(state.home),
    away: cloneTeam(state.away),
    currentLine: { ...state.currentLine },
    innings: [...state.innings],
    plays: [...state.plays],
    events: [...state.events],
  }
}

function cloneTeam(team: MatchTeam): MatchTeam {
  return {
    ...team,
    lineup: { slots: [...team.lineup.slots] },
    batting: [...team.batting],
    pitching: [...team.pitching],
    usedPitchers: [...team.usedPitchers],
    retiredIds: [...team.retiredIds],
  }
}

/** 一番活躍した選手を選ぶ */
function pickMvp(
  batting: BattingLine[],
  pitching: PitchingLine[],
  outcome: MatchResult['outcome'],
): string | null {
  let bestId: string | null = null
  let bestScore = -Infinity

  for (const line of batting) {
    const score = line.hits * 2 + line.rbi * 3 + line.homeruns * 3
    if (score > bestScore) {
      bestScore = score
      bestId = line.playerId
    }
  }

  for (const line of pitching) {
    // 負け試合で投手をMVPにしない
    const penalty = outcome === 'lose' ? line.runs * 2 : line.runs
    const score = line.outs * 0.5 + line.strikeouts * 0.7 - penalty
    if (score > bestScore) {
      bestScore = score
      bestId = line.playerId
    }
  }

  return bestScore > 0 ? bestId : null
}
