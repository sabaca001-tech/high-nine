import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { overallRating } from '@/core/player/rating'
import type { Grade } from '@/core/types/player'
import { advanceSeason, recruitCount, talentFromReputation } from './graduation'
import { GRADE_BASE, INITIAL_TALENT } from '@/core/player/createPlayer'
import { REPUTATION_INITIAL } from '@/core/types/season'

function run(seed: number, reputation = 20, scoutedPitchers = 0) {
  const players = createInitialRoster(createRng(seed))
  return {
    players,
    change: advanceSeason(createRng(seed + 100), {
      players,
      reputation,
      year: 2,
      serial: 100,
      scoutedPitchers,
    }),
  }
}

describe('talentFromReputation', () => {
  it('評判が高いほど新入生が強い', () => {
    expect(talentFromReputation(100)).toBeGreaterThan(talentFromReputation(50))
    expect(talentFromReputation(50)).toBeGreaterThan(talentFromReputation(0))
  })
})

describe('recruitCount', () => {
  it('評判が高いほど多く入部する', () => {
    expect(recruitCount(100, 10)).toBeGreaterThanOrEqual(recruitCount(0, 10))
  })

  it('部員が少ないほど多く入部する', () => {
    expect(recruitCount(50, 5)).toBeGreaterThan(recruitCount(50, 13))
  })

  it('下限4人・上限16人を守る', () => {
    for (const reputation of [0, 25, 50, 75, 100]) {
      for (const remaining of [0, 5, 10, 20, 40]) {
        const count = recruitCount(reputation, remaining)
        expect(count).toBeGreaterThanOrEqual(4)
        expect(count).toBeLessThanOrEqual(16)
      }
    }
  })
})

describe('advanceSeason', () => {
  it('3年生が全員卒業する', () => {
    const { players, change } = run(1)
    const thirdYears = players.filter((p) => p.grade === 3)

    expect(change.graduates).toHaveLength(thirdYears.length)
    expect(change.graduates.map((g) => g.id).sort()).toEqual(thirdYears.map((p) => p.id).sort())
    expect(change.players.some((p) => thirdYears.some((t) => t.id === p.id))).toBe(false)
  })

  it('残った選手は1学年上がる', () => {
    const { players, change } = run(2)

    for (const before of players.filter((p) => p.grade < 3)) {
      const after = change.players.find((p) => p.id === before.id)
      expect(after?.grade).toBe(before.grade + 1)
      // 能力は引き継がれる
      expect(after?.batting.meet).toBe(before.batting.meet)
    }
  })

  it('新入生は必ず1年生', () => {
    const { change } = run(3)
    expect(change.newcomers.length).toBeGreaterThan(0)
    for (const player of change.newcomers) {
      expect(player.grade).toBe(1)
      expect(player.skills).toEqual([])
    }
  })

  it('idが既存の選手と重複しない', () => {
    const { players, change } = run(4)
    const existing = new Set(players.map((p) => p.id))

    for (const player of change.newcomers) {
      expect(existing.has(player.id)).toBe(false)
    }
    expect(new Set(change.players.map((p) => p.id)).size).toBe(change.players.length)
  })

  it('卒業記録に能力と特殊能力が残る', () => {
    const players = createInitialRoster(createRng(5)).map((p) =>
      p.grade === 3 ? { ...p, skills: ['contact-eye'] } : p,
    )
    const change = advanceSeason(createRng(55), {
      players,
      reputation: 20,
      year: 3,
      serial: 200,
    })

    for (const record of change.graduates) {
      const before = players.find((p) => p.id === record.id)!
      expect(record.rating).toBe(overallRating(before))
      expect(record.year).toBe(3)
      expect(record.skills).toEqual(['contact-eye'])
    }
  })

  it('投手が必ず2人以上いる状態になる', () => {
    for (let seed = 0; seed < 30; seed++) {
      const { change } = run(seed)
      expect(change.players.filter((p) => p.isPitcher).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('毎年かならず投手が2人入部する', () => {
    // **投手が引退した年に新入生が全員野手**という引きが続くと、
    // 秋の新チームで継投が組めず立て直せなかった
    for (let seed = 0; seed < 40; seed++) {
      const { change } = run(seed)
      expect(change.newcomers.filter((p) => p.isPitcher).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('スカウトで獲れた投手はその年の枠に数える', () => {
    // スカウトで2人獲れていれば、新入生を投手で埋める必要は無い
    let forcedAll = true
    for (let seed = 0; seed < 40; seed++) {
      const { change } = run(seed, undefined, 2)
      if (change.newcomers.filter((p) => p.isPitcher).length < 2) forcedAll = false
    }
    expect(forcedAll).toBe(false)
  })

  it('評判が高いと新入生の平均能力が高い', () => {
    const average = (reputation: number): number => {
      let total = 0
      let count = 0
      for (let seed = 0; seed < 30; seed++) {
        const { change } = run(seed, reputation)
        for (const player of change.newcomers) {
          total += overallRating(player)
          count++
        }
      }
      return total / count
    }

    expect(average(90)).toBeGreaterThan(average(20))
  })

  it('評判が低いと推薦の逸材は来ない', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(run(seed, 30).change.recommendedIds).toEqual([])
    }
  })

  it('評判が高いと推薦の逸材が来ることがある', () => {
    let found = false
    for (let seed = 0; seed < 60 && !found; seed++) {
      found = run(seed, 95).change.recommendedIds.length > 0
    }
    expect(found).toBe(true)
  })

  it('学年構成が偏りすぎない（何年繰り返しても部員が枯れない）', () => {
    let players = createInitialRoster(createRng(9))
    let serial = 100

    for (let year = 2; year <= 20; year++) {
      const change = advanceSeason(createRng(year * 17), {
        players,
        reputation: 40,
        year,
        serial,
      })
      players = change.players
      serial = change.serial

      expect(players.length).toBeGreaterThanOrEqual(9)
      expect(players.length).toBeLessThanOrEqual(40)
      for (const grade of [1, 2, 3] as Grade[]) {
        expect(players.filter((p) => p.grade === grade).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('弱小校からの出発', () => {
  /**
   * **評判20の弱小校に、県内平均並みの新入生は来ない。**
   * 基準を0にしていた頃は、無名の学校でも中位校と同じ素材が入ってきて、
   * 「弱いチームを強くする」という出発点にならなかった。
   */
  it('評判20（初期）の新入生は初期部員と同じ水準', () => {
    expect(talentFromReputation(REPUTATION_INITIAL)).toBe(INITIAL_TALENT)
  })

  it('評判が上がるほど良い新入生が来る', () => {
    expect(talentFromReputation(40)).toBeGreaterThan(talentFromReputation(20))
    expect(talentFromReputation(64)).toBeGreaterThan(talentFromReputation(40))
  })

  it('評判が下がっても初期より悪くはならない', () => {
    // 下限を切らないと、負けが込んだ年から新入生まで悪くなって立て直せない
    expect(talentFromReputation(5)).toBe(talentFromReputation(REPUTATION_INITIAL))
    expect(talentFromReputation(0)).toBe(talentFromReputation(REPUTATION_INITIAL))
  })

  it('上限がある（前の代の3年生を超える新入生は来ない）', () => {
    const top = talentFromReputation(100)
    expect(top).toBe(talentFromReputation(80))
    // 素質の中心が3年生の基準（GRADE_BASE[3]）を超えない
    expect(GRADE_BASE[1] + top).toBeLessThanOrEqual(GRADE_BASE[3])
  })
})
