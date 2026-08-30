/**
 * 攻撃の半回ぶんの進行。
 *
 * ここには演出・タイミングの都合を一切持ち込まない（CLAUDE.md 5.5）。
 * 走者は「居るか」ではなく **誰が居るか**（選手id）で持つ。
 * 盗塁を誰の記録に付けるかを決めるために必要。
 */

import type { Rng } from '@/core/rng/random'
import type { Player, Position } from '@/core/types/player'
import { isAvailable, POSITION_LABELS } from '@/core/types/player'
import type { Lineup } from '@/core/types/lineup'
import type { Half, MatchEventLog, PlayLog, PlayResult } from '@/core/types/match'
import { isHit, outsOf, PLAY_RESULT_LABELS } from '@/core/types/match'
import { misplacementPenalty } from '@/core/lineup/aptitude'
import { reassignFieldPositions } from '@/core/lineup/autoLineup'
import {
  FATIGUE_AVOID,
  fatigueOf,
  fatiguePenalty,
} from '@/core/player/fatigue'
import { simulateAtBat } from './simulateAtBat'
import type { MatchTeam } from './teamState'
import {
  batterAt,
  battingValue,
  benchPlayers,
  fielderAt,
  findPlayer,
  pitcherValue,
  recordBatting,
  recordExtraOut,
  recordPitching,
  recordSteal,
  refreshDefense,
  swapIn,
} from './teamState'
import { skillBonus } from '@/core/skill/skillEffects'

/** 塁上の走者。埋まっていなければ null */
export type Bases = [string | null, string | null, string | null]

const EMPTY_BASES: Bases = [null, null, null]

export type HalfContext = {
  offense: MatchTeam
  defenseTeam: MatchTeam
  inning: number
  half: Half
  plays: PlayLog[]
  events: MatchEventLog[]
  nextOrder: () => number
  /** リードした時点で打ち切るか（サヨナラ） */
  stopOnLead: boolean
  /**
   * この点差に届いたら攻撃を打ち切る（コールド）。無ければ null。
   *
   * **7点差ついた時点で試合は終わる。**
   * 回を終えてから点差を見ていた頃は、7回裏に6点差から10点取って
   * 「10点差でコールド」という試合が普通に起きていた。
   * 実際には7点目が入った瞬間に終わっている。
   * 一打で複数点入ることはあるので、点差がぴったりになるとは限らない
   * （満塁本塁打なら6点差から10点差になって終わる）。
   */
  stopAtLead?: number | null
  /** タイブレーク（無死一・二塁から開始） */
  tiebreak: boolean
  /** 自動で代打・継投を判断するか */
  autoSubstitute: boolean
}

/** 攻撃の半回ぶんを進め、入った点を返す */
export function playHalf(rng: Rng, ctx: HalfContext): number {
  const { offense, defenseTeam, inning, half } = ctx
  let outs = 0
  let bases: Bases = ctx.tiebreak
    ? [runnerFor(offense, 1), runnerFor(offense, 2), null]
    : [...EMPTY_BASES]
  let runsThisHalf = 0
  // 回の頭に立っている投手は、その回まだ1点も取られていない
  defenseTeam.inningRunsAtEntry = 0

  /**
   * この半回で最初の打者か。
   * **大差での継投は回の頭だけ**にするために見る（`maybeChangePitcher`）。
   */
  let atInningStart = true

  while (outs < 3) {
    if (ctx.autoSubstitute) {
      maybeChangePitcher(rng, defenseTeam, ctx, runsThisHalf, atInningStart)
      // 競った場面なら代打、大差が付いていれば控えに経験を積ませる。
      // 点差の条件が重ならないので、同じ打者に両方は起きない
      maybePinchHit(rng, offense, ctx, outs, bases)
      maybeRestStarter(rng, offense, ctx)
    }

    const batter = batterAt(offense, offense.battingIndex)
    const pitcher = findPlayer(defenseTeam, defenseTeam.pitcherId)
    if (!batter || !pitcher) break

    // 盗塁は打席の前に試みる。成功すれば得点圏に進む
    const steal = maybeSteal(rng, ctx, bases)
    bases = steal.bases
    outs += steal.outs
    if (outs >= 3) break

    const result = simulateAtBat(rng, {
      batter,
      pitcher,
      defense: defenseTeam.defense,
      misplacement: defenseTeam.misplacement,
      bases: occupied(bases),
      outs,
      inning,
      scoreDiff: offense.runs - defenseTeam.runs,
      pitcherStaminaFactor: pitcherFormFactor(pitcher, defenseTeam.faced),
    })

    const outsBefore = outs
    const advanced = advanceRunners(rng, result, bases, batter)
    bases = advanced.bases
    outs += outsOf(result)

    const runs = advanced.runs
    offense.runs += runs
    runsThisHalf += runs

    recordBatting(offense, batter, result, advanced.rbi)
    if (isHit(result)) offense.hits += 1
    // 失策で入った点は投手の責任にしない
    recordPitching(defenseTeam, pitcher, result, runs, result === 'error' ? 0 : runs)
    defenseTeam.faced += 1

    atInningStart = false

    const order = ctx.nextOrder()
    ctx.plays.push({
      id: `play-${order}`,
      order,
      inning,
      half,
      outs: outsBefore,
      batterName: batter.name,
      pitcherName: pitcher.name,
      result,
      runsScored: runs,
      text: describePlay(batter.name, result, runs, outsBefore),
      score: {
        player: offense.isPlayer ? offense.runs : defenseTeam.runs,
        opponent: offense.isPlayer ? defenseTeam.runs : offense.runs,
      },
      bases: occupied(bases),
      outsAfter: outs,
      highlight: isHighlight(result, runs),
    })

    offense.battingIndex = (offense.battingIndex + 1) % offense.lineup.slots.length

    // サヨナラ
    if (ctx.stopOnLead && offense.runs > defenseTeam.runs) break

    // コールド。点差が規定に届いた時点で、その打席を最後に終わる
    const stopAtLead = ctx.stopAtLead ?? null
    if (stopAtLead !== null && offense.runs - defenseTeam.runs >= stopAtLead) break
  }

  return runsThisHalf
}

/** タイブレークで塁に置く走者。前の打者から順に埋める */
function runnerFor(team: MatchTeam, back: number): string | null {
  const size = team.lineup.slots.length
  const index = (team.battingIndex - back + size * 2) % size
  return team.lineup.slots[index]?.playerId ?? null
}

/** 塁が埋まっているかだけを取り出す。打席の判定と表示に使う */
function occupied(bases: Bases): [boolean, boolean, boolean] {
  return [bases[0] !== null, bases[1] !== null, bases[2] !== null]
}

// ── 盗塁 ────────────────────────────────

/** 盗塁を試み始める走力の下限。これ未満の選手は走らない */
const STEAL_MIN_SPEED = 50

/**
 * 盗塁の判定。一塁に走者がいて二塁が空いているときだけ試みる。
 *
 * 成否には**捕手の肩**が効く。捕手を軽視した編成だと走られ放題になり、
 * 「捕手は代えが利かない」という守備重要度の設計と繋がる。
 */
function maybeSteal(
  rng: Rng,
  ctx: HalfContext,
  bases: Bases,
): { bases: Bases; outs: number } {
  const runnerId = bases[0]
  if (!runnerId || bases[1] !== null) return { bases, outs: 0 }

  const runner = findPlayer(ctx.offense, runnerId)
  if (!runner) return { bases, outs: 0 }

  const speed = runner.batting.speed
  if (speed < STEAL_MIN_SPEED) return { bases, outs: 0 }

  // 走力60で約10%、走力95で約28%の打席で仕掛ける。
  // 「積極走塁」を持っていれば仕掛ける回数が増える
  const attemptRate = Math.min(
    0.5,
    (speed - 40) / 200 + skillBonus(runner, 'stealRate') / 100,
  )
  if (!rng.chance(attemptRate)) return { bases, outs: 0 }

  const catcher = fielderAt(ctx.defenseTeam, 'C')
  const pitcher = findPlayer(ctx.defenseTeam, ctx.defenseTeam.pitcherId)
  // 捕手の肩に、捕手の「ブロック」と投手の「クイック」が乗る
  const catcherArm =
    (catcher ? catcher.batting.arm * 0.6 + catcher.batting.catching * 0.4 : 40) +
    (catcher ? skillBonus(catcher, 'catcherArm') : 0) +
    (pitcher ? skillBonus(pitcher, 'catcherArm') : 0)

  const successRate = clamp(
    0.62 + (speed - catcherArm) / 260 + skillBonus(runner, 'stealSuccess') / 100,
    0.2,
    0.95,
  )

  const order = ctx.nextOrder()
  if (rng.chance(successRate)) {
    recordSteal(ctx.offense, runner)
    ctx.events.push({
      id: `event-${order}`,
      order,
      inning: ctx.inning,
      half: ctx.half,
      text: `${runner.name}、二盗成功！`,
    })
    return { bases: [null, runnerId, bases[2]], outs: 0 }
  }

  if (pitcher) recordExtraOut(ctx.defenseTeam, pitcher)
  ctx.events.push({
    id: `event-${order}`,
    order,
    inning: ctx.inning,
    half: ctx.half,
    text: `${runner.name}、盗塁失敗。${catcher ? `${catcher.name}が刺した` : 'アウト'}`,
  })
  return { bases: [null, bases[1], bases[2]], outs: 1 }
}

// ── 走者の進塁 ──────────────────────────

/** 走者を進める。塁の状態・得点・打点を返す */
export function advanceRunners(
  rng: Rng,
  result: PlayResult,
  bases: Bases,
  batter: Player,
): { bases: Bases; runs: number; rbi: number } {
  const [first, second, third] = bases
  const count = bases.filter((id) => id !== null).length
  let runs = 0

  // 「積極走塁」で次の塁を狙いやすく、「走塁下手」で狙えなくなる。
  // 走力60を境にしていたところへ、特殊能力ぶんを足し引きする
  const fast = batter.batting.speed + skillBonus(batter, 'advance') >= 60

  switch (result) {
    case 'homerun': {
      runs = 1 + count
      return { bases: [null, null, null], runs, rbi: runs }
    }
    case 'triple': {
      runs = count
      return { bases: [null, null, batter.id], runs, rbi: runs }
    }
    case 'double': {
      runs = (second ? 1 : 0) + (third ? 1 : 0)
      // 一塁走者は三塁で止まることが多いが、足が速ければ生還する
      let firstRunnerScores = false
      if (first) {
        firstRunnerScores = rng.chance(fast ? 0.45 : 0.3)
        if (firstRunnerScores) runs += 1
      }
      return {
        bases: [null, batter.id, first && !firstRunnerScores ? first : null],
        runs,
        rbi: runs,
      }
    }
    case 'single': {
      runs = third ? 1 : 0
      let secondRunnerScores = false
      if (second) {
        secondRunnerScores = rng.chance(0.6)
        if (secondRunnerScores) runs += 1
      }
      return {
        bases: [batter.id, first ?? (secondRunnerScores ? null : second), null],
        runs,
        rbi: runs,
      }
    }
    case 'error': {
      // 失策なので打点は付かない
      runs = third ? 1 : 0
      return { bases: [batter.id, first, second], runs, rbi: 0 }
    }
    case 'walk': {
      // 押し出しのみ得点
      if (first && second && third) {
        return { bases: [batter.id, first, second], runs: 1, rbi: 1 }
      }
      if (first && second) return { bases: [batter.id, first, second], runs: 0, rbi: 0 }
      if (first) return { bases: [batter.id, first, third], runs: 0, rbi: 0 }
      return { bases: [batter.id, second, third], runs: 0, rbi: 0 }
    }
    case 'sacFly': {
      return { bases: [first, second, null], runs: third ? 1 : 0, rbi: third ? 1 : 0 }
    }
    case 'doublePlay': {
      // 打者と一塁走者がアウト。他の走者は進まない
      return { bases: [null, second, third], runs: 0, rbi: 0 }
    }
    case 'groundout':
    case 'flyout':
    case 'strikeout':
      return { bases: [first, second, third], runs: 0, rbi: 0 }
  }
}

// ── 投手の消耗と継投 ────────────────────

/** 1イニングあたりのおおよその対戦打者数。スタミナを回数に換算するときの目安 */
export const BATTERS_PER_INNING = 4.3

/**
 * スタミナから「万全で投げられる打者数」を求める。
 *
 * **スタミナD（50〜59）で5回＝約22人** を基準に置いている。
 * 以前は `12 + stamina * 0.35` で、D でも 30人（7回相当）まで持ち、
 * さらに交代の判定が緩かったので**毎試合ほぼ完投**していた。
 *
 * 実測（staminaCheck.test.ts、120試合の平均投球回／完投率）:
 *  G(20) 2.3回 8% ／ E(40) 4.9回 21% ／ D(55) 6.7回 38%
 *  C(65) 7.4回 43% ／ B(75) 8.1回 54% ／ S(90) 8.6回 69%
 *
 * **疲労で持ちは短くならない**（疲れているぶんは能力が落ちる）ので、
 * 連戦でも投球回そのものは変わらない。完投率が上がって見えるのはそのため。
 */
export function staminaCapacity(stamina: number): number {
  return Math.max(4, stamina * 0.47 - 4)
}

/**
 * **この試合でどれだけ消耗したか**による能力倍率。
 *
 * スタミナが切れてからも投げ続けられるが、そのぶん打たれる。
 * 交代の判断（`PITCHER_PULL_FACTOR`）はこの値だけを見る。
 *
 * **疲労（`fatigue`）はここに掛けない。**
 * 掛けていた頃は、疲労12（前の試合の名残）を持っているだけで
 * 投げ始めた瞬間から交代の目安（0.96）を下回り、
 * **1人も投げないうちに先発が降ろされていた**。
 * 疲労で短くなるのは投球回ではなく能力のほう（`fatiguePenalty`）。
 */
export function staminaFactor(pitcher: Player, faced: number): number {
  // 「鉄腕」「省エネ投法」でスタミナが底上げされ、「スタミナ切れ」で減る
  const stamina = pitcher.pitching
    ? pitcher.pitching.stamina + skillBonus(pitcher, 'stamina')
    : 20
  const over = Math.max(0, faced - staminaCapacity(stamina))
  // 鉄腕はバテにくい
  // 崩れにくい投手ほど、突然の失点で降ろされにくい。
  // 「走者ありで球威が上がる」特殊能力を持っているかで見る
  const rate = skillBonus(pitcher, 'stuff', ['runner']) > 0 ? 0.018 : 0.03
  // 下限0.5。球威も制球も半減するので、続投すれば確実に失点が増える
  return Math.max(0.5, 1 - Math.min(0.5, over * rate))
}

/**
 * 打席の判定で効く投手の落ち込み。
 * **この試合の消耗と、持ち越した疲労の両方**を掛ける。
 *
 * 交代の判断とは分けてある。疲れた投手は
 * 「早く降りる」のではなく「最初から打たれる」。
 */
export function pitcherFormFactor(pitcher: Player, faced: number): number {
  return staminaFactor(pitcher, faced) * fatiguePenalty(pitcher)
}

/** スタミナが切れた投手を降ろす目安 */
const PITCHER_PULL_FACTOR = 0.96

/**
 * 投手交代の判断。
 *
 * 1. **打ち込まれたら代える**
 * 2. 消耗しきったら代える
 * 3. **大差がついていたら、無事なうちに降ろして控えに投げさせる**
 *
 * 1が無かった頃は、**スタミナさえ残っていれば何点取られても投げ続けていた**。
 * 5点取られても球威が落ちていなければ続投で、
 * 「今日は合っていないから代える」という当たり前の判断が存在しなかった。
 *
 * 3を入れる前は、大量リードでもエースが最後まで投げ切っていた。
 * 勝敗が決した試合で主戦を消耗させる理由は無く、
 * 2番手以降に経験を積ませる機会も失われていた。
 */
function maybeChangePitcher(
  rng: Rng,
  team: MatchTeam,
  ctx: HalfContext,
  runsThisHalf: number,
  /** この半回の最初の打者か。大差での交代はここだけで判断する */
  atInningStart: boolean,
): void {
  const current = findPlayer(team, team.pitcherId)
  if (!current) return

  /*
   * **大差の交代は回の頭だけ。**
   * 打者ごとに判定していた頃は、13-2の試合で
   * 「0回」「⅓回」「⅓回」と3人が並ぶような継投になっていた。
   * 経験を積ませるのが目的なら、1イニングは任せないと意味が無い。
   */
  if (atInningStart && isGarbageTime(team, ctx)) {
    // 大差では**若い投手**を優先する。経験を積ませるのが目的なので、
    // いちばん良い2番手ではなく下級生から出す。
    //
    // **下級生がいなければ、それでも降ろす。** 先発が最年少のときに
    // 「若い投手がいない」で完投させていたが、
    // 勝敗が決した試合で主戦を消耗させない、という目的は学年と関係ない
    const relievers = reliefCandidates(team, 'youth')
    const reliever = relievers.find((player) => player.grade < current.grade) ?? relievers[0]
    if (reliever && !rng.chance(0.4)) {
      sendToMound(team, reliever, ctx, '経験を積ませる')
      return
    }
  }

  const hit = isHitHard(team, runsThisHalf)
  if (!hit && staminaFactor(current, team.faced) > PITCHER_PULL_FACTOR) return

  const reliever = reliefCandidates(team)[0]
  if (!reliever) return

  /*
   * 現状よりはっきり良くならないなら代えない（消耗ぶんを見込んで比べる）。
   * **打ち込まれているときは、多少落ちても代える。**
   * 「今日は合っていない」ときに同じ投手を続けても好転しない。
   *
   * **崩壊した日は、控えの質を問わない。**
   * 比で足切りしていた頃は、エースと2番手の差が大きいチームだと
   * **6点取られても控えが基準に届かず、そのまま投げ切って**いた
   * （実測で54%）。誰が出ても同じなら、まだ壊れていないほうを使う。
   */
  const blownOut = runsAllowedBy(team) >= BLOWN_OUT_RUNS
  if (!blownOut && pitcherValue(reliever) < pitcherValue(current) * (hit ? 0.62 : 0.7)) return
  // 交代のタイミングには幅を持たせる（打ち込まれているときは迷わない）
  if (!hit && rng.chance(0.2)) return

  sendToMound(team, reliever, ctx, hit ? '打ち込まれた' : undefined)
  // 出てきた投手は、この回の失点を引き継がない
  team.inningRunsAtEntry = runsThisHalf
}

/** いまの投手がこの試合で取られた点 */
function runsAllowedBy(team: MatchTeam): number {
  return team.pitching.find((entry) => entry.playerId === team.pitcherId)?.runs ?? 0
}

/**
 * ここまで取られたら「今日は誰が出ても同じ」と見なす。
 * 控えの質を問わずに代える。
 */
const BLOWN_OUT_RUNS = 6

/**
 * 打ち込まれているか。
 *
 * **スタミナとは別の物差し。** 球威が残っていても、
 * 抑えられていないなら代えるのが普通の判断。
 *
 * - この回に3点以上取られた（ビッグイニングの途中降板）
 * - この試合で5点以上取られた
 * - 立ち上がりに崩れた（2回もたずに3失点）
 */
function isHitHard(team: MatchTeam, runsThisHalf: number): boolean {
  const line = team.pitching.find((entry) => entry.playerId === team.pitcherId)
  if (!line) return false

  // その投手がこの回に取られたぶんだけを見る
  if (runsThisHalf - (team.inningRunsAtEntry ?? 0) >= BIG_INNING_RUNS) return true
  if (line.runs >= PULL_RUNS) return true
  return line.outs <= EARLY_OUTS && line.runs >= EARLY_RUNS
}

/**
 * この回に取られたら代える点数。
 * **3では代えすぎた**（1試合に3.7人使い、控えを使い切っていた）。
 * 高校野球は継投の駒が少ないので、1イニング4失点を目安にする。
 */
const BIG_INNING_RUNS = 4
/** 試合を通して取られたら代える点数 */
const PULL_RUNS = 5
/** 立ち上がりの崩れ（2回もたずに4失点） */
const EARLY_OUTS = 5
const EARLY_RUNS = 4

/**
 * まだ登板していない控え投手を返す。
 *
 * 既定は「良い順」。`youth` を渡すと**下級生から**返す（大差の試合用）。
 * どちらの並びでも、**疲れている投手は後ろに回す**。
 * 連投で消耗した腕を真っ先に出すと、疲労を持たせた意味が無くなる。
 */
export function availableRelievers(team: MatchTeam, order: 'best' | 'youth' = 'best'): Player[] {
  const onField = new Set(team.lineup.slots.map((slot) => slot.playerId))
  return sortRelievers(
    team.players.filter(
      (p) =>
        p.isPitcher &&
        p.pitching &&
        !team.usedPitchers.includes(p.id) &&
        !team.retiredIds.includes(p.id) &&
        !onField.has(p.id) &&
        isAvailable(p),
    ),
    order,
  )
}

/**
 * **野手として出場している投手**。継投の候補に入れる。
 *
 * 打てる投手を右翼で使う、という編成は普通にあるのに、
 * 継投の候補が「ベンチにいる投手」だけだったので、
 * **その投手には一度も出番が回らなかった**。
 * ベンチに投手が残っていなければ、エースが何点取られても投げ続けていた。
 *
 * マウンドへ上げるときは `promoteToMound` で守備位置を組み直す。
 */
export function fieldingPitchers(team: MatchTeam, order: 'best' | 'youth' = 'best'): Player[] {
  const fielding = new Set(
    team.lineup.slots.filter((slot) => slot.position !== 'P').map((slot) => slot.playerId),
  )

  return sortRelievers(
    team.players.filter(
      (p) =>
        fielding.has(p.id) &&
        p.pitching &&
        !team.usedPitchers.includes(p.id) &&
        isAvailable(p),
    ),
    order,
  )
}

/** 継投の候補すべて。ベンチと守備位置の両方から集める */
export function reliefCandidates(team: MatchTeam, order: 'best' | 'youth' = 'best'): Player[] {
  return sortRelievers([...availableRelievers(team, order), ...fieldingPitchers(team, order)], order)
}

function sortRelievers(list: Player[], order: 'best' | 'youth'): Player[] {
  const tired = (player: Player) => (fatigueOf(player) >= FATIGUE_AVOID ? 1 : 0)

  if (order === 'youth') {
    return [...list].sort(
      (a, b) => tired(a) - tired(b) || a.grade - b.grade || pitcherValue(b) - pitcherValue(a),
    )
  }
  return [...list].sort((a, b) => tired(a) - tired(b) || pitcherValue(b) - pitcherValue(a))
}

/** 出どころ（ベンチ／守備位置）に応じてマウンドに上げる */
function sendToMound(team: MatchTeam, reliever: Player, ctx: HalfContext, reason?: string): void {
  const onField = team.lineup.slots.some(
    (slot) => slot.position !== 'P' && slot.playerId === reliever.id,
  )
  if (onField) moveToMound(team, reliever, ctx, reason)
  else changePitcher(team, reliever, ctx, reason)
}

/** 投手を代える。降板した投手は退く */
export function changePitcher(
  team: MatchTeam,
  reliever: Player,
  ctx: HalfContext,
  reason?: string,
): void {
  const current = findPlayer(team, team.pitcherId)
  const slotIndex = team.lineup.slots.findIndex((slot) => slot.position === 'P')
  if (slotIndex < 0) return

  swapIn(team, slotIndex, reliever)
  team.pitcherId = reliever.id
  team.faced = 0
  team.usedPitchers = [...team.usedPitchers, reliever.id]

  const order = ctx.nextOrder()
  ctx.events.push({
    id: `event-${order}`,
    order,
    inning: ctx.inning,
    half: ctx.half,
    text: `${team.isPlayer ? '' : `${team.name} `}投手交代 ${current?.name ?? ''} → ${reliever.name}${
      reason ? `（${reason}）` : ''
    }`,
  })
}

/**
 * 野手として出ている投手をマウンドへ上げる。
 *
 * **降りた投手は退かない。** 空いた守備位置に回り、
 * そのうえで**8人の守備位置を組み直す**（`reassignFieldPositions`）。
 * 単に位置を入れ替えるだけだと、球威で選ばれた投手が
 * そのまま遊撃を守るような並びになる。
 * 打順は動かせないので、動かすのは守備位置だけ。
 *
 * 交代が成立したら、退いた投手が回った守備位置を返す。
 */
export function promoteToMound(team: MatchTeam, reliever: Player): Position | null {
  const moundIndex = team.lineup.slots.findIndex((slot) => slot.position === 'P')
  const fieldIndex = team.lineup.slots.findIndex((slot) => slot.playerId === reliever.id)
  if (moundIndex < 0 || fieldIndex < 0 || moundIndex === fieldIndex) return null
  if (!reliever.pitching) return null

  const vacated = team.lineup.slots[fieldIndex].position
  const swapped: Lineup = {
    slots: team.lineup.slots.map((slot, index) => {
      if (index === fieldIndex) return { ...slot, position: 'P' }
      if (index === moundIndex) return { ...slot, position: vacated }
      return slot
    }),
  }

  const outgoingId = team.lineup.slots[moundIndex].playerId
  team.lineup = reassignFieldPositions(swapped, team.players)
  team.pitcherId = reliever.id
  team.faced = 0
  if (!team.usedPitchers.includes(reliever.id)) {
    team.usedPitchers = [...team.usedPitchers, reliever.id]
  }
  refreshDefense(team)

  return team.lineup.slots.find((slot) => slot.playerId === outgoingId)?.position ?? null
}

/** マウンドへ上げて実況にも出す。自動継投から呼ぶ */
export function moveToMound(
  team: MatchTeam,
  reliever: Player,
  ctx: HalfContext,
  reason?: string,
): void {
  const current = findPlayer(team, team.pitcherId)
  const moved = promoteToMound(team, reliever)
  if (moved === null) return

  const notes = [`${current?.name ?? ''}は${POSITION_LABELS[moved]}へ`, reason].filter(Boolean)

  const order = ctx.nextOrder()
  ctx.events.push({
    id: `event-${order}`,
    order,
    inning: ctx.inning,
    half: ctx.half,
    text: `${team.isPlayer ? '' : `${team.name} `}投手交代 ${current?.name ?? ''} → ${reliever.name}（${notes.join('／')}）`,
  })
}

// ── 代打 ────────────────────────────────

/** 代打を検討し始める回 */
const PINCH_HIT_FROM_INNING = 7

/** これだけ打力が上なら代打を送る */
const PINCH_HIT_GAP = 12

/**
 * 代打の自動判断。
 *
 * **投手の打順には代打を送らない。** 送ると守備位置の玉突きが起きて
 * 「誰がどこを守っているか」が追えなくなるため、投手を代えたいときは
 * 継投（`changePitcher`）で行う。手動の交代では投手も入れ替えられる。
 */
function maybePinchHit(
  rng: Rng,
  team: MatchTeam,
  ctx: HalfContext,
  outs: number,
  bases: Bases,
): void {
  if (ctx.inning < PINCH_HIT_FROM_INNING) return

  const slotIndex = team.battingIndex
  const slot = team.lineup.slots[slotIndex]
  if (!slot || slot.position === 'P') return

  const batter = findPlayer(team, slot.playerId)
  if (!batter) return

  // 競っている場面か、勝負どころだけ動く
  const diff = team.runs - ctx.defenseTeam.runs
  const runners = bases.some((id) => id !== null)
  if (diff > 3 || diff < -6) return
  if (!runners && outs === 2 && diff >= 0) return

  const candidate = benchPlayers(team)
    .filter((player) => !player.isPitcher)
    .sort((a, b) => battingValue(b) - battingValue(a))[0]
  if (!candidate) return
  if (battingValue(candidate) - battingValue(batter) < PINCH_HIT_GAP) return
  if (rng.chance(0.35)) return

  swapIn(team, slotIndex, candidate)

  const order = ctx.nextOrder()
  ctx.events.push({
    id: `event-${order}`,
    order,
    inning: ctx.inning,
    half: ctx.half,
    text: `${team.isPlayer ? '' : `${team.name} `}代打 ${batter.name} → ${candidate.name}`,
  })
}

// ── 経験を積ませる交代 ──────────────────

/**
 * 大差の判定を始める回。**リードしているときは遅らせる。**
 * 勝っている試合で早々に主力を下げると、そのまま追いつかれかねない。
 * 負けている試合は失うものが無いので早めに切り替える。
 *
 * リード側を7回から6回に早めたのは、**コールドゲームを入れたから**。
 * 7回終了・7点差で試合が打ち切られるので、7回から動き始めると
 * 控えに投げさせる回が1つも残らなかった。
 */
const GARBAGE_FROM_INNING_AHEAD = 6
const GARBAGE_FROM_INNING_BEHIND = 5

/** これだけ開いていれば勝敗はほぼ決している */
const GARBAGE_DIFF = 7

/** 大差のときに許す「守れなさ」の上限（misplacementPenalty の値） */
const GARBAGE_MISPLACEMENT_MAX = 1.0

/**
 * 勝敗がほぼ決した場面か。**`team` から見た点差**で判定する。
 *
 * 野手の入れ替えと投手交代で同じ基準を使う。
 * 片方だけ緩いと「打線は控えなのにエースが投げ続けている」ことになる。
 *
 * **相手は `ctx` から引く。** 以前は決め打ちで `ctx.defenseTeam` と比べていて、
 * 守備側（＝投手交代の判断）を渡したときに自分自身と引き算していた。
 * 点差が常に0になるので、**大差での投手交代は一度も起きていなかった**。
 * 打線だけ控えに代わり、エースは何点差でも投げ切っていた。
 */
export function isGarbageTime(team: MatchTeam, ctx: HalfContext): boolean {
  const opponent = team === ctx.offense ? ctx.defenseTeam : ctx.offense
  const diff = team.runs - opponent.runs
  if (Math.abs(diff) < GARBAGE_DIFF) return false

  const from = diff > 0 ? GARBAGE_FROM_INNING_AHEAD : GARBAGE_FROM_INNING_BEHIND
  return ctx.inning >= from
}

/**
 * 大差がついた試合で、控えの下級生を出す。
 *
 * 代打の判断は「競った場面で打力の高い控えを出す」なので、
 * **控えを育てる目的では一度も出番が回らなかった**。
 * 実際の高校野球でも大量リード・大量ビハインドでは下級生に経験を積ませる。
 *
 * 出た選手には打席が回り、通算成績と試合での成長が付く。
 * ベンチ入りを決める判断に「誰を育てたいか」が乗るようになる。
 */
function maybeRestStarter(rng: Rng, team: MatchTeam, ctx: HalfContext): void {
  if (!isGarbageTime(team, ctx)) return

  const slotIndex = team.battingIndex
  const slot = team.lineup.slots[slotIndex]
  // 投手を下げると誰が投げるかの玉突きが起きる（代打と同じ理由）
  if (!slot || slot.position === 'P') return

  const starter = findPlayer(team, slot.playerId)
  if (!starter || starter.grade === 1) return

  // 多少の適性外は許すが、**重要な位置ほど厳しく**見る。
  // 大差でも遊撃に守れない選手を置けばひっくり返りかねない。
  // 左翼なら E でも通り、遊撃なら D までしか通らない
  const candidate = benchPlayers(team)
    .filter(
      (player) =>
        !player.isPitcher &&
        player.grade < starter.grade &&
        misplacementPenalty(player, slot.position) <= GARBAGE_MISPLACEMENT_MAX,
    )
    .sort((a, b) => a.grade - b.grade || battingValue(b) - battingValue(a))[0]

  if (!candidate) return
  if (rng.chance(0.5)) return

  swapIn(team, slotIndex, candidate)

  const order = ctx.nextOrder()
  ctx.events.push({
    id: `event-${order}`,
    order,
    inning: ctx.inning,
    half: ctx.half,
    text: `${team.isPlayer ? '' : `${team.name} `}選手交代 ${starter.name} → ${candidate.name}（経験を積ませる）`,
  })
}

// ── 実況 ────────────────────────────────

/** 見どころとして扱う打席か。スキップ時にもここだけは見せる */
function isHighlight(result: PlayResult, runs: number): boolean {
  return result === 'homerun' || runs > 0 || result === 'triple' || result === 'doublePlay'
}

/** 実況テキスト */
export function describePlay(
  name: string,
  result: PlayResult,
  runs: number,
  outs: number,
): string {
  switch (result) {
    case 'homerun':
      if (runs >= 4) return `${name}、満塁ホームラン！ 一挙${runs}点！`
      if (runs > 1) return `${name}、${runs}ランホームラン！`
      return `${name}、ソロホームラン！`
    case 'triple':
      return runs > 0 ? `${name}、走者一掃の三塁打！ ${runs}点` : `${name}、三塁打で好機を作る`
    case 'double':
      return runs > 0 ? `${name}、タイムリーツーベース！ ${runs}点` : `${name}、二塁打で出塁`
    case 'single':
      return runs > 0 ? `${name}、タイムリーヒット！ ${runs}点` : `${name}、ヒットで出塁`
    case 'walk':
      return runs > 0 ? `${name}、押し出しの四球で1点` : `${name}、四球を選んで出塁`
    case 'error':
      return runs > 0 ? `相手のエラー！ ${name}が出塁し${runs}点` : `相手のエラーで${name}が出塁`
    case 'sacFly':
      return `${name}、犠牲フライで1点`
    case 'doublePlay':
      return `${name}、痛恨のゲッツー`
    case 'strikeout':
      return outs === 2 ? `${name}、三振。攻撃終了` : `${name}、三振に倒れる`
    case 'groundout':
      return `${name}、ゴロに倒れる`
    case 'flyout':
      return `${name}、フライに倒れる`
    default:
      return `${name} ${PLAY_RESULT_LABELS[result]}`
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
