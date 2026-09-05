/**
 * U18日本代表の国際大会。
 *
 * **活躍度を能力から乱数で出していた。** 代表に選ばれると
 * 「評価点 ×0.09 ＋ 乱数」で活躍度が決まり、そのぶん能力が伸びる、という作りで、
 * **試合そのものは行われていなかった**。
 * 強い選手が強い数字を出すだけなので、代表に呼ばれても物語が生まれない。
 *
 * ここでは**選ばれた30人で実際に試合をする**。
 * 打った・抑えたという成績がそのまま活躍度になり、
 * 成長も普段の試合と同じ仕組み（`applyMatchGrowth`）で入る。
 *
 * **伸びるのは自校の選手だけ。** 他校の選手は種から作り直しているので、
 * ここで能力を足しても次に作り直した時点で消える。
 */

import type { Rng } from '@/core/rng/random'
import { autoLineup } from '@/core/lineup/autoLineup'
import { pitcherValue } from '@/core/match/teamState'
import { simulateGame } from '@/core/match/simulateGame'
import type { Lineup } from '@/core/types/lineup'
import type { BattingLine, PitchingLine } from '@/core/types/match'
import type { AbilityChange, Player } from '@/core/types/player'
import { grantSkill } from '@/core/skill/grantSkill'
import type { SkillId, SkillRank } from '@/core/types/skill'
import { applyMatchGrowth, performancePoints } from './matchGrowth'

/**
 * 対戦相手。**実在の代表チーム名は使わない。**
 * 地域の選抜という体裁にしてある。
 */
const OPPONENTS: { name: string; strength: number }[] = [
  { name: 'アジア選抜', strength: 18 },
  { name: '南米選抜', strength: 24 },
  { name: '欧州選抜', strength: 21 },
  { name: '北中米選抜', strength: 30 },
  { name: '世界選抜', strength: 34 },
]

/**
 * **5試合戦う。** 3試合では、代表に選ばれても得るものが
 * 県大会を1つ勝つ程度にしかならず、
 * 「全国から選ばれた」ことの重みが出てこなかった。
 *
 * 相手の強さは高めに置いてある。
 * 甲子園の決勝より上の水準で、**通用するかどうか**が問われる場にする。
 * 後半ほど強い相手が来るので、勝ち上がるほど成績を残すのが難しい。
 */

export type U18GameResult = {
  opponentName: string
  scoreFor: number
  scoreAgainst: number
  outcome: 'win' | 'lose' | 'draw'
}

/** 自校の選手1人の、大会を通した成績 */
export type U18Performance = {
  playerId: string
  name: string
  /** 0〜100。ドラフトの評価（`draftBonus`）に効く */
  performance: number
  batting: BattingLine | null
  pitching: PitchingLine | null
}

/** 代表で掴んだ特殊能力 */
export type U18SkillNews = {
  playerId: string
  playerName: string
  skillId: SkillId
  rank: SkillRank
}

export type U18SeriesOutcome = {
  /** 成長と代表歴を反映した自校の選手（渡された配列と同じ並び） */
  players: Player[]
  games: U18GameResult[]
  performances: U18Performance[]
  changes: AbilityChange[]
  /** 代表で身につけた特殊能力 */
  skills: U18SkillNews[]
}

/**
 * 代表の国際大会を戦う。
 *
 * @param squad 代表30人（自校・他校を含む）
 * @param ourPlayers 自校の部員全員。ここに含まれる選手だけが伸びる
 */
export function playU18Series(
  rng: Rng,
  params: { squad: Player[]; ourPlayers: Player[]; year: number },
): U18SeriesOutcome {
  const { squad, ourPlayers, year } = params
  const ourIds = new Set(ourPlayers.map((player) => player.id))

  if (squad.length < 9 || !squad.some((player) => ourIds.has(player.id))) {
    return { players: ourPlayers, games: [], performances: [], changes: [], skills: [] }
  }

  const lineup = autoLineup(squad)
  const starters = rotationOf(squad, lineup)
  const games: U18GameResult[] = []
  const battingById = new Map<string, BattingLine>()
  const pitchingById = new Map<string, PitchingLine>()

  let players = ourPlayers
  const changes: AbilityChange[] = []

  for (const [index, opponent] of OPPONENTS.entries()) {
    const result = simulateGame(rng, {
      players: squad,
      // **試合ごとに先発を替える。** 同じ編成で3試合戦わせていた頃は、
      // 1人のエースが23回を投げ切っていた（試合をまたぐと疲労も抜ける）。
      // 代表は投手を10人連れて行くので、順に先発させる
      lineup: withStarter(lineup, starters[index % starters.length]),
      opponentName: opponent.name,
      opponentStrength: opponent.strength,
      kind: 'friendly',
      // 国際大会にコールドは無い。引き分けはあってよい
      mercy: false,
    })

    games.push({
      opponentName: opponent.name,
      scoreFor: result.finalScore.player,
      scoreAgainst: result.finalScore.opponent,
      outcome: result.outcome,
    })

    for (const line of result.battingLines) {
      if (ourIds.has(line.playerId)) battingById.set(line.playerId, mergeBatting(battingById.get(line.playerId), line))
    }
    for (const line of result.pitchingLines) {
      if (ourIds.has(line.playerId)) pitchingById.set(line.playerId, mergePitching(pitchingById.get(line.playerId), line))
    }

    /*
     * **成長はその試合ごとに入れる。** まとめて配ると、
     * 3試合ぶんの点数が1回の上限（`STAGE_MAX_STEPS`）で頭打ちになる。
     * 舞台は全国大会と同じ扱いにしてある（世界と当たる一発勝負なので）。
     */
    players = players.map((player) => {
      const batting = result.battingLines.find((line) => line.playerId === player.id)
      const pitching = result.pitchingLines.find((line) => line.playerId === player.id)
      if (!batting && !pitching) return player

      const grown = applyMatchGrowth(rng, player, {
        ...(batting ? { batting } : {}),
        ...(pitching ? { pitching } : {}),
        stage: 'nationals',
      })
      changes.push(...grown.changes)
      return grown.player
    })
  }

  const performances: U18Performance[] = []
  const skills: U18SkillNews[] = []

  players = players.map((player) => {
    const batting = battingById.get(player.id) ?? null
    const pitching = pitchingById.get(player.id) ?? null
    if (!batting && !pitching) return player

    const performance = performanceFrom(batting, pitching)
    performances.push({ playerId: player.id, name: player.name, performance, batting, pitching })

    let current: Player = {
      ...player,
      u18: [...player.u18, { year, performance }],
      // 代表に呼ばれること自体が自信になる
      trust: Math.min(100, player.trust + 6),
    }

    /*
     * **活躍したら特殊能力を掴む。**
     * 世界の強豪と5試合戦って何も残らないのでは、
     * 代表に呼ばれることが「能力が少し伸びる」だけの出来事になる。
     *
     * 大会の勝ち上がり（`applyTournamentGrowth`）と同じ経路にしてある。
     * **金特に手が届くのは活躍した選手だけ**で、そこも大会と揃えてある。
     */
    const chance = Math.min(SKILL_CHANCE_MAX, (performance / 100) * SKILL_CHANCE_RATE)
    if (rng.chance(chance)) {
      const canAimGold = performance >= GOLD_PERFORMANCE
      const rank: SkillRank = canAimGold && rng.chance(GOLD_SHARE) ? 'gold' : 'blue'
      const result = grantSkill(rng, current, rank)
      current = result.player
      if (result.granted && result.skillId) {
        skills.push({
          playerId: current.id,
          playerName: current.name,
          skillId: result.skillId,
          rank,
        })
      }
    }

    return current
  })

  return { players, games, performances, changes, skills }
}

/**
 * 特殊能力を掴む確率。**活躍度に比例する。**
 * 5試合を通して活躍した選手（活躍度80）で40%、可もなく不可もなくで22%。
 */
const SKILL_CHANCE_RATE = 0.5
const SKILL_CHANCE_MAX = 0.45

/** 金特に手が届く活躍度。世界を相手に結果を出した選手だけ */
const GOLD_PERFORMANCE = 70

/** 金特に届く条件を満たした選手のうち、実際に金特になる割合 */
const GOLD_SHARE = 0.35

/**
 * 大会を通した活躍度（0〜100）。
 *
 * **成績から出す。** 能力から出していた頃は、
 * 強い選手が呼ばれて強い数字を出すだけで、
 * 「世界には通用しなかった」も「無名が化けた」も起きなかった。
 *
 * 3試合で無安打なら30前後、猛打賞を続ければ90を超える。
 */
export function performanceFrom(
  batting: BattingLine | null,
  pitching: PitchingLine | null,
): number {
  const points = performancePoints(batting ?? undefined, pitching ?? undefined)
  return clamp(Math.round(PERFORMANCE_BASE + points * PERFORMANCE_RATE), 0, 100)
}

/** 出場して可もなく不可もなくのときの活躍度 */
const PERFORMANCE_BASE = 45

/** 成績1点あたりの活躍度 */
const PERFORMANCE_RATE = 4

/**
 * 先発を回す順番。**評価点の高い投手から。**
 * スタメンの野手として出ている投手は外す（同じ選手を2か所に置けない）。
 */
function rotationOf(squad: Player[], lineup: Lineup): string[] {
  const fielders = new Set(
    lineup.slots.filter((slot) => slot.position !== 'P').map((slot) => slot.playerId),
  )
  const rotation = squad
    .filter((player) => player.pitching && !fielders.has(player.id))
    .sort((a, b) => pitcherValue(b) - pitcherValue(a))
    .map((player) => player.id)

  const current = lineup.slots.find((slot) => slot.position === 'P')?.playerId
  return rotation.length > 0 ? rotation : current ? [current] : []
}

/** 先発だけ差し替えた打順。打順そのものは動かさない */
function withStarter(lineup: Lineup, playerId: string): Lineup {
  return {
    slots: lineup.slots.map((slot) =>
      slot.position === 'P' ? { ...slot, playerId } : slot,
    ),
  }
}

function mergeBatting(before: BattingLine | undefined, line: BattingLine): BattingLine {
  if (!before) return line
  return {
    ...before,
    plateAppearances: before.plateAppearances + line.plateAppearances,
    atBats: before.atBats + line.atBats,
    hits: before.hits + line.hits,
    doubles: before.doubles + line.doubles,
    triples: before.triples + line.triples,
    homeruns: before.homeruns + line.homeruns,
    rbi: before.rbi + line.rbi,
    walks: before.walks + line.walks,
    strikeouts: before.strikeouts + line.strikeouts,
    sacFlies: before.sacFlies + line.sacFlies,
    steals: before.steals + line.steals,
  }
}

function mergePitching(before: PitchingLine | undefined, line: PitchingLine): PitchingLine {
  if (!before) return line
  return {
    ...before,
    outs: before.outs + line.outs,
    hits: before.hits + line.hits,
    runs: before.runs + line.runs,
    earnedRuns: before.earnedRuns + line.earnedRuns,
    walks: before.walks + line.walks,
    strikeouts: before.strikeouts + line.strikeouts,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
