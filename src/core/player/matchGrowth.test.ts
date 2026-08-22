import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { emptyBattingLine, emptyPitchingLine } from '@/core/types/match'
import type { BattingLine, PitchingLine } from '@/core/types/match'
import { createInitialRoster } from './createPlayer'
import { applyMatchGrowth, performancePoints } from './matchGrowth'

const roster = createInitialRoster(createRng(31))
const batter = roster.find((player) => !player.isPitcher)!
const pitcher = roster.find((player) => player.isPitcher)!

function batting(overrides: Partial<BattingLine>): BattingLine {
  return { ...emptyBattingLine(batter.id, batter.name), ...overrides }
}

function pitching(overrides: Partial<PitchingLine>): PitchingLine {
  return { ...emptyPitchingLine(pitcher.id, pitcher.name), ...overrides }
}

/** 乱数のぶれを均して、伸びの合計を測る */
function totalDelta(
  line: { batting?: BattingLine; pitching?: PitchingLine },
  player = batter,
  trials = 200,
): number {
  const rng = createRng(5)
  let total = 0
  for (let i = 0; i < trials; i++) {
    const result = applyMatchGrowth(rng, player, line)
    for (const change of result.changes) total += change.after - change.before
  }
  return total / trials
}

describe('performancePoints', () => {
  it('打てばプラス', () => {
    expect(performancePoints(batting({ atBats: 4, hits: 3, rbi: 2, doubles: 1 }))).toBeGreaterThan(0)
  })

  it('打てなければマイナス', () => {
    expect(performancePoints(batting({ atBats: 4, hits: 0, strikeouts: 2 }))).toBeLessThan(0)
  })

  it('四球で出塁したぶんは評価される', () => {
    const walked = performancePoints(batting({ atBats: 3, hits: 0, walks: 2 }))
    const silent = performancePoints(batting({ atBats: 3, hits: 0, walks: 0 }))
    expect(walked).toBeGreaterThan(silent)
  })

  it('好投はプラス、打ち込まれればマイナス', () => {
    expect(performancePoints(undefined, pitching({ outs: 21, strikeouts: 8, hits: 3 }))).toBeGreaterThan(0)
    expect(
      performancePoints(undefined, pitching({ outs: 6, earnedRuns: 7, hits: 10, walks: 4 })),
    ).toBeLessThan(0)
  })
})

describe('applyMatchGrowth', () => {
  it('出場していなければ何も起きない', () => {
    const result = applyMatchGrowth(createRng(1), batter, {})
    expect(result.changes).toHaveLength(0)
    expect(result.player).toBe(batter)
  })

  it('好成績なら伸びる', () => {
    expect(totalDelta({ batting: batting({ atBats: 5, hits: 4, homeruns: 2, rbi: 5 }) })).toBeGreaterThan(0)
  })

  it('不振なら落ちる', () => {
    expect(totalDelta({ batting: batting({ atBats: 5, hits: 0, strikeouts: 3 }) })).toBeLessThan(0)
  })

  it('落ち幅は伸び幅より小さい', () => {
    const up = totalDelta({ batting: batting({ atBats: 4, hits: 4, rbi: 3 }) })
    const down = totalDelta({ batting: batting({ atBats: 4, hits: 0, strikeouts: 4 }) })
    expect(Math.abs(down)).toBeLessThan(up)
  })

  it('チームの勝敗は関係しない（同じ成績なら同じ結果）', () => {
    // 引数に勝敗を渡さない形にしてある。同じ成績・同じシードなら必ず一致する
    const line = { batting: batting({ atBats: 4, hits: 2, rbi: 1 }) }
    const a = applyMatchGrowth(createRng(9), batter, line)
    const b = applyMatchGrowth(createRng(9), batter, line)
    expect(a.changes).toEqual(b.changes)
  })

  it('大会の試合は得るものが大きい', () => {
    const line = { batting: batting({ atBats: 4, hits: 3, homeruns: 1, rbi: 3 }) }
    const practice = totalDelta({ ...line })
    const rng = createRng(5)
    let nationals = 0
    for (let i = 0; i < 200; i++) {
      const result = applyMatchGrowth(rng, batter, { ...line, stage: 'nationals' })
      for (const change of result.changes) nationals += change.after - change.before
    }
    expect(nationals / 200).toBeGreaterThan(practice)
  })

  it('投手は好投で投手能力が動く', () => {
    const rng = createRng(3)
    const keys = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const result = applyMatchGrowth(rng, pitcher, {
        pitching: pitching({ outs: 27, strikeouts: 12, hits: 2 }),
      })
      for (const change of result.changes) keys.add(change.key)
    }
    expect([...keys].some((key) => ['control', 'stamina', 'sharpness', 'life'].includes(key))).toBe(
      true,
    )
  })

  it('投球の結果で打撃能力は動かない', () => {
    // **投打をまとめて1つの点数にしていた頃は、完封した投手のミートが伸びていた。**
    // 何をして得た点数なのかが分からなくなるので、最初から分けて数える
    const rng = createRng(7)
    const keys = new Set<string>()
    for (let i = 0; i < 120; i++) {
      const result = applyMatchGrowth(rng, pitcher, {
        pitching: pitching({ outs: 27, strikeouts: 14 }),
        stage: 'nationals',
      })
      for (const change of result.changes) keys.add(change.key)
    }

    expect(keys.size).toBeGreaterThan(0)
    expect([...keys].every((key) => ['control', 'stamina', 'sharpness', 'life'].includes(key))).toBe(
      true,
    )
  })

  it('打った結果は打撃能力に出る（投げていても）', () => {
    // 投手が打った日は打撃が伸びてよい。**引き金がどちらの結果かだけが大事**
    const rng = createRng(11)
    const keys = new Set<string>()
    for (let i = 0; i < 120; i++) {
      const result = applyMatchGrowth(rng, pitcher, {
        batting: batting({ atBats: 4, hits: 3, homeruns: 1, rbi: 3 }),
        pitching: pitching({ outs: 6, earnedRuns: 5, hits: 9 }),
        stage: 'pref',
      })
      for (const change of result.changes) keys.add(change.key)
    }

    // 打って伸び、投げて落ちるので、両方の系統が動く
    expect([...keys].some((key) => ['meet', 'power', 'fielding'].includes(key))).toBe(true)
    expect([...keys].some((key) => ['control', 'stamina', 'sharpness', 'life'].includes(key))).toBe(
      true,
    )
  })
})
