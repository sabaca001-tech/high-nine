import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import {
  championOf,
  createBracket,
  matchesAt,
  occupantAt,
  opponentAt,
  ourIndexOf,
  resolveRound,
  survivorsAt,
} from './bracket'
import type { Bracket, BracketTeam } from './bracket'

/** 強さを散らした学校を作る */
function pool(count: number): BracketTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    schoolId: `s${i}`,
    name: `第${i}高校`,
    strength: (i % 11) * 3 - 15,
  }))
}

const ours: BracketTeam = { name: 'さくら第一高校', strength: 0 }

describe('createBracket', () => {
  it('枠は2の冪で、参加校ぶんだけ埋まる', () => {
    const bracket = createBracket(createRng(1), {
      totalRounds: 5,
      ours,
      pool: pool(40),
      entrants: 24,
    })
    expect(bracket.slots).toHaveLength(32)
    expect(bracket.slots.filter((team) => team !== null)).toHaveLength(24)
  })

  it('自校がちょうど1つ入る', () => {
    const bracket = createBracket(createRng(2), { totalRounds: 4, ours, pool: pool(15) })
    expect(bracket.slots.filter((team) => team?.ours)).toHaveLength(1)
    expect(ourIndexOf(bracket)).toBeGreaterThanOrEqual(0)
  })

  it('同じ学校が二度出てこない', () => {
    const bracket = createBracket(createRng(3), { totalRounds: 6, ours, pool: pool(63) })
    const ids = bracket.slots.filter((t) => t?.schoolId).map((t) => t!.schoolId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('自校の初戦は不戦勝にならない', () => {
    // 1回戦が無いと、大会に出た実感のないまま2回戦から始まってしまう
    for (let seed = 1; seed < 40; seed++) {
      // 参加校を少なくして、不戦勝が大量に出る状況を作る
      const bracket = createBracket(createRng(seed), {
        totalRounds: 4,
        ours,
        pool: pool(3),
        entrants: 4,
      })
      expect(opponentAt(bracket, 1)).not.toBeNull()
    }
  })
})

describe('resolveRound', () => {
  const build = (): Bracket =>
    createBracket(createRng(11), { totalRounds: 4, ours, pool: pool(15) })

  it('1回戦を解決すると、勝ち残りが半分になる', () => {
    const bracket = resolveRound(createRng(5), build(), 1, true)
    expect(bracket.winners).toHaveLength(1)
    expect(survivorsAt(bracket, 2)).toHaveLength(8)
  })

  it('自校の結果は外から渡したとおりになる', () => {
    const base = build()
    const won = resolveRound(createRng(5), base, 1, true)
    const lost = resolveRound(createRng(5), base, 1, false)

    const stillIn = (b: Bracket) => survivorsAt(b, 2).some((team) => team.ours)
    expect(stillIn(won)).toBe(true)
    expect(stillIn(lost)).toBe(false)
  })

  it('同じ回戦を二度解決しない', () => {
    const once = resolveRound(createRng(5), build(), 1, true)
    expect(resolveRound(createRng(9), once, 1, false)).toBe(once)
  })

  it('決勝まで解決すると優勝校が決まる', () => {
    let bracket = build()
    for (let round = 1; round <= 4; round++) {
      bracket = resolveRound(createRng(round), bracket, round, false)
    }
    expect(championOf(bracket)).not.toBeNull()
    expect(survivorsAt(bracket, 5)).toHaveLength(1)
  })

  it('空きどうしの山は誰も上がらない', () => {
    const bracket = resolveRound(
      createRng(7),
      createBracket(createRng(4), { totalRounds: 3, ours, pool: pool(2), entrants: 3 }),
      1,
      true,
    )
    // 参加3校・8枠なので、両方空きの山が必ずある
    expect(bracket.winners[0]).toContain(-1)
  })
})

describe('opponentAt', () => {
  it('次の回戦の相手は、隣の山を勝ち上がった学校になる', () => {
    // **開幕時に決勝の相手まで決めない。** 勝ち上がりで決まる
    const base = createBracket(createRng(21), { totalRounds: 4, ours, pool: pool(15) })
    expect(opponentAt(base, 1)).not.toBeNull()
    expect(opponentAt(base, 2)).toBeNull()

    const after = resolveRound(createRng(22), base, 1, true)
    const next = opponentAt(after, 2)
    expect(next).not.toBeNull()
    // その相手は、1回戦を勝ち上がった顔ぶれに含まれる
    expect(survivorsAt(after, 2)).toContain(next)
  })

  it('強い学校のほうが勝ち上がりやすい', () => {
    // 番狂わせはあるが、傾向としては強豪が残る
    let strongSurvived = 0
    for (let seed = 0; seed < 60; seed++) {
      const bracket = resolveRound(
        createRng(seed),
        createBracket(createRng(seed + 100), {
          totalRounds: 3,
          ours,
          pool: [
            { name: '強豪', strength: 30 },
            ...pool(6).map((t) => ({ ...t, strength: -10 })),
          ],
        }),
        1,
        true,
      )
      if (survivorsAt(bracket, 2).some((team) => team.name === '強豪')) strongSurvived++
    }
    expect(strongSurvived).toBeGreaterThan(45)
  })
})

describe('matchesAt', () => {
  it('回戦の対戦カードを返し、決着後は勝者が入る', () => {
    const base = createBracket(createRng(31), { totalRounds: 3, ours, pool: pool(7) })
    const before = matchesAt(base, 1)
    expect(before).toHaveLength(4)
    expect(before.every((match) => match.winner === null)).toBe(true)

    const after = matchesAt(resolveRound(createRng(32), base, 1, true), 1)
    expect(after.every((match) => match.winner !== null)).toBe(true)
  })
})

describe('occupantAt', () => {
  it('1回戦は slots そのものを指す', () => {
    const bracket = createBracket(createRng(41), { totalRounds: 3, ours, pool: pool(7) })
    for (let i = 0; i < bracket.slots.length; i++) {
      expect(occupantAt(bracket, 1, i)).toBe(bracket.slots[i] ? i : -1)
    }
  })
})
