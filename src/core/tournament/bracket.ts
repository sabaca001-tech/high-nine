/**
 * トーナメント表。
 *
 * **相手を開幕時に決勝まで決め打ちするのをやめた。**
 * 以前は「山を引く」といっても自校の相手を回戦ぶん並べていただけで、
 * 1回戦の時点で決勝の相手まで確定していた。
 * 他校同士の試合が存在しないので、
 * 「あの優勝候補は3回戦で消えた」という出来事も起こらなかった。
 *
 * ここでは**参加校を全部ブラケットに並べる**。
 * 自校が1つ勝つたびに、同じ回戦の他の試合もまとめて解決する。
 * 次の相手は、隣の山を勝ち上がってきた学校になる。
 *
 * 保存量を抑えるため、勝者は**学校そのものではなく `slots` の添字**で持つ。
 * 178校の県でも、勝ち上がりの記録は255個の数値で収まる。
 */

import type { Rng } from '@/core/rng/random'

/** ブラケットの1枠。空き（不戦勝）なら null */
export type BracketTeam = {
  /** ライバル校のid。その大会限りの相手なら省略 */
  schoolId?: string
  name: string
  /** 強さ。0が互角 */
  strength: number
  /** 自校か */
  ours?: boolean
}

export type Bracket = {
  /**
   * 1回戦の並び。長さは `2 ** totalRounds`。
   * 参加校が2の冪に足りないぶんは null（＝相手が不戦勝で上がる）。
   */
  slots: (BracketTeam | null)[]
  /**
   * 勝ち上がり。`winners[r][i]` は
   * **(r+1)回戦の第i試合を勝った学校の `slots` 添字**。
   * 両方空きなら -1。
   */
  winners: number[][]
}

/** 空き枠を表す添字 */
export const EMPTY = -1

/**
 * 強さの差がどれだけ勝率に効くか。
 * 14差で約76%、30差で約93%。
 * ここを小さくすると番狂わせが減り、強豪がそのまま勝ち上がるだけになる。
 */
const STRENGTH_SPREAD = 14

/** ブラケットを作る */
export function createBracket(
  rng: Rng,
  params: {
    totalRounds: number
    /** 自校 */
    ours: BracketTeam
    /** 相手になりうる学校。足りないぶんは空き（不戦勝）になる */
    pool: BracketTeam[]
    /** 参加校数。省略時は `pool.length + 1` */
    entrants?: number
  },
): Bracket {
  const size = 2 ** params.totalRounds
  const entrants = Math.min(size, params.entrants ?? params.pool.length + 1)

  const others = shuffle(rng, params.pool).slice(0, Math.max(0, entrants - 1))
  const slots: (BracketTeam | null)[] = [{ ...params.ours, ours: true }, ...others]
  while (slots.length < size) slots.push(null)

  const arranged = shuffle(rng, slots)

  // **自校の初戦だけは不戦勝にしない。**
  // 1回戦が無いと、大会に出た実感のないまま2回戦から始まってしまう
  const ourIndex = arranged.findIndex((team) => team?.ours)
  const pairIndex = ourIndex ^ 1
  if (ourIndex >= 0 && arranged[pairIndex] === null) {
    const donor = arranged.findIndex(
      (team, index) => team !== null && !team.ours && index !== ourIndex,
    )
    if (donor >= 0) {
      arranged[pairIndex] = arranged[donor]
      arranged[donor] = null
    }
  }

  return { slots: arranged, winners: [] }
}

/** 自校の `slots` 添字。居なければ -1 */
export function ourIndexOf(bracket: Bracket): number {
  return bracket.slots.findIndex((team) => team?.ours)
}

/**
 * `round` 回戦を戦う時点で、位置 `position` に居る学校の `slots` 添字。
 * `round` が1なら `slots` そのもの。
 */
export function occupantAt(bracket: Bracket, round: number, position: number): number {
  if (round <= 1) return bracket.slots[position] ? position : EMPTY
  const winners = bracket.winners[round - 2]
  return winners?.[position] ?? EMPTY
}

/** 添字から学校を引く */
export function teamAt(bracket: Bracket, index: number): BracketTeam | null {
  return index === EMPTY ? null : (bracket.slots[index] ?? null)
}

/** 自校が `round` 回戦で当たる相手。まだ決まっていなければ null */
export function opponentAt(bracket: Bracket, round: number): BracketTeam | null {
  const ourIndex = ourIndexOf(bracket)
  if (ourIndex < 0) return null

  // round 回戦を戦う時点での自校の位置
  const ourPosition = Math.floor(ourIndex / 2 ** (round - 1))
  return teamAt(bracket, occupantAt(bracket, round, ourPosition ^ 1))
}

/**
 * `round` 回戦の全試合を解決する。**自校の結果だけは外から渡す。**
 *
 * 自校が勝ち上がった時点で呼ぶ。他校同士は強さの差から確率で決める。
 */
export function resolveRound(
  rng: Rng,
  bracket: Bracket,
  round: number,
  ourWon: boolean,
): Bracket {
  if (bracket.winners.length >= round) return bracket

  const ourIndex = ourIndexOf(bracket)
  const ourPosition = ourIndex < 0 ? -1 : Math.floor(ourIndex / 2 ** (round - 1))
  const matches = bracket.slots.length / 2 ** round
  const winners: number[] = []

  for (let match = 0; match < matches; match++) {
    const leftPosition = match * 2
    const left = occupantAt(bracket, round, leftPosition)
    const right = occupantAt(bracket, round, leftPosition + 1)

    if (left === EMPTY && right === EMPTY) {
      winners.push(EMPTY)
      continue
    }
    if (left === EMPTY || right === EMPTY) {
      winners.push(left === EMPTY ? right : left)
      continue
    }

    // 自校の試合は、実際に行われた結果を使う
    if (leftPosition === ourPosition || leftPosition + 1 === ourPosition) {
      const ourSlot = leftPosition === ourPosition ? left : right
      const otherSlot = leftPosition === ourPosition ? right : left
      winners.push(ourWon ? ourSlot : otherSlot)
      continue
    }

    winners.push(beats(rng, bracket.slots[left]!, bracket.slots[right]!) ? left : right)
  }

  return { ...bracket, winners: [...bracket.winners, winners] }
}

/** a が b に勝つか */
function beats(rng: Rng, a: BracketTeam, b: BracketTeam): boolean {
  const chance = 1 / (1 + Math.pow(10, (b.strength - a.strength) / STRENGTH_SPREAD))
  return rng.chance(chance)
}

/**
 * `round` 回戦を戦う学校の一覧（＝前の回戦を勝ち抜いた顔ぶれ）。
 * まだその回戦まで進んでいなければ空。
 */
export function survivorsAt(bracket: Bracket, round: number): BracketTeam[] {
  if (round <= 1) return bracket.slots.filter((team): team is BracketTeam => team !== null)
  const winners = bracket.winners[round - 2]
  if (!winners) return []
  return winners
    .map((index) => teamAt(bracket, index))
    .filter((team): team is BracketTeam => team !== null)
}

/**
 * ブラケットを上下に割った「山」。
 *
 * **178校の対戦カードを全部並べても読めない**が、
 * 「優勝候補がどの山にいるか」は組み合わせが決まった時点でいちばん知りたいことで、
 * 山ごとにまとめれば一画面に収まる。
 *
 * 4つに割ると、それぞれの山を勝ち抜いた学校が準決勝で当たる。
 * 参加校が少ない大会では、山の数を実際の枠数まで落とす。
 */
export function blocksOf(bracket: Bracket, count = 4): BracketBlock[] {
  const size = bracket.slots.length
  const blocks = Math.max(1, Math.min(count, size / 2))
  const per = size / blocks

  return Array.from({ length: blocks }, (_, index) => {
    const from = index * per
    const teams = bracket.slots
      .slice(from, from + per)
      .filter((team): team is BracketTeam => team !== null)

    return {
      // A・B・C…と呼ぶ。番号だと回戦や試合番号と紛らわしい
      name: String.fromCharCode('A'.charCodeAt(0) + index),
      teams,
      ours: teams.some((team) => team.ours),
    }
  })
}

export type BracketBlock = {
  name: string
  teams: BracketTeam[]
  /** 自校がこの山にいるか */
  ours: boolean
}

/** `round` 回戦の対戦カード。決着済みなら勝者も返す */
export function matchesAt(
  bracket: Bracket,
  round: number,
): { left: BracketTeam | null; right: BracketTeam | null; winner: BracketTeam | null }[] {
  const matches = bracket.slots.length / 2 ** round
  if (matches < 1) return []

  const result = []
  for (let match = 0; match < matches; match++) {
    const left = teamAt(bracket, occupantAt(bracket, round, match * 2))
    const right = teamAt(bracket, occupantAt(bracket, round, match * 2 + 1))
    const decided = bracket.winners[round - 1]
    result.push({
      left,
      right,
      winner: decided ? teamAt(bracket, decided[match] ?? EMPTY) : null,
    })
  }
  return result
}

/** その大会を制した学校。まだ決まっていなければ null */
export function championOf(bracket: Bracket): BracketTeam | null {
  const last = bracket.winners[bracket.winners.length - 1]
  if (!last || last.length !== 1) return null
  return teamAt(bracket, last[0])
}

/** シードから決まる並べ替え */
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
