/**
 * 攻撃の半回ぶんの進行。
 *
 * ここには演出・タイミングの都合を一切持ち込まない（CLAUDE.md 5.5）。
 * 走者は「居るか」ではなく **誰が居るか**（選手id）で持つ。
 * 盗塁を誰の記録に付けるかを決めるために必要。
 */

import type { Rng } from '@/core/rng/random'
import type { Player } from '@/core/types/player'
import { isAvailable } from '@/core/types/player'
import type { Half, MatchEventLog, PlayLog, PlayResult } from '@/core/types/match'
import { isHit, outsOf, PLAY_RESULT_LABELS } from '@/core/types/match'
import { misplacementPenalty } from '@/core/lineup/aptitude'
import {
  effectiveStamina,
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
  swapIn,
} from './teamState'

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

  while (outs < 3) {
    if (ctx.autoSubstitute) {
      maybeChangePitcher(rng, defenseTeam, ctx)
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
      pitcherStaminaFactor: staminaFactor(pitcher, defenseTeam.faced),
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

  // 走力60で約10%、走力95で約28%の打席で仕掛ける
  const attemptRate = Math.min(0.35, (speed - 40) / 200)
  if (!rng.chance(attemptRate)) return { bases, outs: 0 }

  const catcher = fielderAt(ctx.defenseTeam, 'C')
  const catcherArm = catcher
    ? catcher.batting.arm * 0.6 + catcher.batting.catching * 0.4
    : 40
  const successRate = clamp(0.62 + (speed - catcherArm) / 260, 0.35, 0.92)

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

  const pitcher = findPlayer(ctx.defenseTeam, ctx.defenseTeam.pitcherId)
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

  const fast = batter.batting.speed >= 60

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
 *  G(20) 1.7回 0% ／ E(40) 4.1回 0% ／ D(55) 5.7回 0%
 *  C(65) 6.7回 0% ／ B(75) 7.8回 13% ／ S(90) 8.9回 66%
 */
export function staminaCapacity(stamina: number): number {
  return Math.max(4, stamina * 0.47 - 4)
}

/**
 * 投手の消耗による能力倍率。
 * スタミナが切れてからも投げ続けられるが、そのぶん打たれる。
 *
 * **疲労（`fatigue`）は「スタミナの目減り」として効く。**
 * 連投した投手は同じスタミナでも早く崩れ、さらに1人目の打者から少し球威が落ちる。
 */
export function staminaFactor(pitcher: Player, faced: number): number {
  const stamina = pitcher.pitching ? effectiveStamina(pitcher) : 20
  const over = Math.max(0, faced - staminaCapacity(stamina))
  // 鉄腕はバテにくい
  const rate = pitcher.skills.includes('ace-heart') ? 0.018 : 0.03
  // 下限0.5。球威も制球も半減するので、続投すれば確実に失点が増える
  const worn = Math.max(0.5, 1 - Math.min(0.5, over * rate))
  return worn * fatiguePenalty(pitcher)
}

/** スタミナが切れた投手を降ろす目安 */
const PITCHER_PULL_FACTOR = 0.96

/**
 * 投手交代の判断。
 *
 * 1. 消耗しきったら代える（従来どおり）
 * 2. **大差がついていたら、無事なうちに降ろして控えに投げさせる**
 *
 * 2を入れる前は、大量リードでもエースが最後まで投げ切っていた。
 * 勝敗が決した試合で主戦を消耗させる理由は無く、
 * 2番手以降に経験を積ませる機会も失われていた。
 */
function maybeChangePitcher(rng: Rng, team: MatchTeam, ctx: HalfContext): void {
  const current = findPlayer(team, team.pitcherId)
  if (!current) return

  if (isGarbageTime(team, ctx)) {
    // 大差では**若い投手**を優先する。経験を積ませるのが目的なので、
    // いちばん良い2番手ではなく下級生から出す。
    //
    // **下級生がいなければ、それでも降ろす。** 先発が最年少のときに
    // 「若い投手がいない」で完投させていたが、
    // 勝敗が決した試合で主戦を消耗させない、という目的は学年と関係ない
    const relievers = availableRelievers(team, 'youth')
    const reliever = relievers.find((player) => player.grade < current.grade) ?? relievers[0]
    if (reliever && !rng.chance(0.4)) {
      changePitcher(team, reliever, ctx, '経験を積ませる')
      return
    }
  }

  if (staminaFactor(current, team.faced) > PITCHER_PULL_FACTOR) return

  const reliever = availableRelievers(team)[0]
  if (!reliever) return
  // 現状よりはっきり良くならないなら代えない（消耗ぶんを見込んで比べる）
  if (pitcherValue(reliever) < pitcherValue(current) * 0.7) return
  // 交代のタイミングには幅を持たせる
  if (rng.chance(0.2)) return

  changePitcher(team, reliever, ctx)
}

/**
 * まだ登板していない控え投手を返す。
 *
 * 既定は「良い順」。`youth` を渡すと**下級生から**返す（大差の試合用）。
 * どちらの並びでも、**疲れている投手は後ろに回す**。
 * 連投で消耗した腕を真っ先に出すと、疲労を持たせた意味が無くなる。
 */
export function availableRelievers(team: MatchTeam, order: 'best' | 'youth' = 'best'): Player[] {
  const onField = new Set(team.lineup.slots.map((slot) => slot.playerId))
  const list = team.players.filter(
    (p) =>
      p.isPitcher &&
      p.pitching &&
      !team.usedPitchers.includes(p.id) &&
      !team.retiredIds.includes(p.id) &&
      !onField.has(p.id) &&
      isAvailable(p),
  )

  const tired = (player: Player) => (fatigueOf(player) >= FATIGUE_AVOID ? 1 : 0)

  if (order === 'youth') {
    return list.sort(
      (a, b) => tired(a) - tired(b) || a.grade - b.grade || pitcherValue(b) - pitcherValue(a),
    )
  }
  return list.sort((a, b) => tired(a) - tired(b) || pitcherValue(b) - pitcherValue(a))
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
