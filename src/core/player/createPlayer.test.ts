import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { ABILITY_MAX, ABILITY_MIN } from '@/core/types/player'
import type { Grade } from '@/core/types/player'
import { createInitialRoster, createPlayer } from './createPlayer'
import { overallRating } from './rating'
import { battingRating, pitchingRating } from './rating'

describe('createPlayer', () => {
  it('同じシードなら同じ選手ができる', () => {
    const a = createPlayer(createRng(555), { id: 'p1', grade: 1 })
    const b = createPlayer(createRng(555), { id: 'p1', grade: 1 })
    expect(a).toEqual(b)
  })

  it('投手には pitching があり、野手には無い', () => {
    const rng = createRng(11)
    const pitcher = createPlayer(rng, { id: 'p1', grade: 2, isPitcher: true })
    const fielder = createPlayer(rng, { id: 'p2', grade: 2, isPitcher: false })

    expect(pitcher.isPitcher).toBe(true)
    expect(pitcher.pitching).not.toBeNull()
    expect(pitcher.position).toBe('P')

    expect(fielder.isPitcher).toBe(false)
    expect(fielder.pitching).toBeNull()
    expect(fielder.position).not.toBe('P')
  })

  it('全能力が 1〜100 の範囲に収まる', () => {
    const rng = createRng(2024)
    for (let i = 0; i < 300; i++) {
      const grade = ((i % 3) + 1) as Grade
      const player = createPlayer(rng, { id: `p${i}`, grade, talentBonus: 40 })

      for (const value of Object.values(player.batting)) {
        expect(value).toBeGreaterThanOrEqual(ABILITY_MIN)
        expect(value).toBeLessThanOrEqual(ABILITY_MAX)
      }
      expect(player.batting.trajectory).toBeGreaterThanOrEqual(1)
      expect(player.batting.trajectory).toBeLessThanOrEqual(4)

      if (player.pitching) {
        expect(player.pitching.control).toBeLessThanOrEqual(ABILITY_MAX)
        expect(player.pitching.stamina).toBeLessThanOrEqual(ABILITY_MAX)
        expect(player.pitching.sharpness).toBeLessThanOrEqual(ABILITY_MAX)
      }
      expect(player.trust).toBeLessThanOrEqual(100)
      expect(player.condition).toBeLessThanOrEqual(100)
      expect(player.motivation).toBeGreaterThanOrEqual(-2)
      expect(player.motivation).toBeLessThanOrEqual(2)
    }
  })

  it('上級生ほど平均能力が高い', () => {
    const average = (grade: Grade): number => {
      const rng = createRng(999)
      let total = 0
      const n = 300
      for (let i = 0; i < n; i++) {
        total += createPlayer(rng, { id: `p${i}`, grade, isPitcher: false }).batting.meet
      }
      return total / n
    }
    expect(average(3)).toBeGreaterThan(average(2))
    expect(average(2)).toBeGreaterThan(average(1))
  })

  it('talentBonus が高いほど能力が高い', () => {
    const average = (bonus: number): number => {
      const rng = createRng(31)
      let total = 0
      const n = 200
      for (let i = 0; i < n; i++) {
        total += createPlayer(rng, {
          id: `p${i}`,
          grade: 2,
          isPitcher: false,
          talentBonus: bonus,
        }).batting.power
      }
      return total / n
    }
    expect(average(20)).toBeGreaterThan(average(0))
  })
})

describe('createInitialRoster', () => {
  it('各学年8人ずつ、計24人になる', () => {
    const roster = createInitialRoster(createRng(1))
    expect(roster).toHaveLength(24)
    for (const grade of [1, 2, 3] as Grade[]) {
      expect(roster.filter((p) => p.grade === grade)).toHaveLength(8)
    }
  })

  it('id が重複しない', () => {
    const roster = createInitialRoster(createRng(2))
    expect(new Set(roster.map((p) => p.id)).size).toBe(roster.length)
  })

  it('どのシードでも投手が最低3人いる（各学年1人）', () => {
    for (let seed = 0; seed < 30; seed++) {
      const roster = createInitialRoster(createRng(seed))
      expect(roster.filter((p) => p.isPitcher).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('投手は部員のおよそ2割に収まる（打線を組んでも余らない）', () => {
    let pitchers = 0
    let total = 0

    for (let seed = 0; seed < 40; seed++) {
      const roster = createInitialRoster(createRng(seed))
      pitchers += roster.filter((p) => p.isPitcher).length
      total += roster.length
    }

    // 素の確率は PITCHER_RATE(0.18) だが、学年ごとに1人は必ず投手にするので
    // 少人数の代ではそのぶん上振れする
    const rate = pitchers / total
    expect(rate).toBeGreaterThan(0.12)
    expect(rate).toBeLessThan(0.33)
  })
})


describe('性格の出現率', () => {
  it('天才肌はレア（2%前後）', () => {
    const rng = createRng(77)
    const trials = 3000
    let genius = 0
    for (let i = 0; i < trials; i++) {
      if (createPlayer(rng, { id: `p${i}`, grade: 1 }).personality === '天才肌') genius += 1
    }
    const rate = genius / trials
    expect(rate).toBeGreaterThan(0.005)
    expect(rate).toBeLessThan(0.05)
  })

  it('他の性格はどれも出る', () => {
    const rng = createRng(78)
    const seen = new Set<string>()
    for (let i = 0; i < 600; i++) {
      seen.add(createPlayer(rng, { id: `p${i}`, grade: 2 }).personality)
    }
    expect(seen.size).toBeGreaterThanOrEqual(5)
  })

  it('天才肌は入学時の能力も高い', () => {
    const rng = createRng(79)
    let geniusTotal = 0
    let geniusCount = 0
    let otherTotal = 0
    let otherCount = 0

    for (let i = 0; i < 6000; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: false })
      const rating = overallRating(player)
      if (player.personality === '天才肌') {
        geniusTotal += rating
        geniusCount += 1
      } else {
        otherTotal += rating
        otherCount += 1
      }
    }

    expect(geniusCount).toBeGreaterThan(20)
    expect(geniusTotal / geniusCount).toBeGreaterThan(otherTotal / otherCount)
  })
})


describe('学年による差', () => {
  /** その学年の総合を集める */
  function ratings(grade: 1 | 2 | 3, count = 400): number[] {
    const rng = createRng(91 + grade)
    return Array.from({ length: count }, (_, i) =>
      overallRating(createPlayer(rng, { id: `p${i}`, grade, isPitcher: false })),
    )
  }

  const first = ratings(1)
  const third = ratings(3)
  const average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length

  it('平均では3年生のほうが上', () => {
    expect(average(third)).toBeGreaterThan(average(first))
  })

  it('学年の差は選手ごとの差より小さい', () => {
    // これが逆だと「3年生＞2年生＞1年生」で並んでしまい、
    // 強い1年生も弱い3年生も生まれない
    const gradeGap = average(third) - average(first)
    const spread = Math.max(...first) - Math.min(...first)
    expect(gradeGap).toBeLessThan(spread / 2)
  })

  /*
   * **上位1割で測ってはいけない。**
   * 素質は一様分布（±`TALENT_SPREAD`）なので、1年の上位1割は
   * ちょうど3年の平均と重なる（36 + 0.8×18 ＝ 50.4 ≒ 50）。
   * 境目そのものを見ているので、乱数が少しずれるだけで裏返る。
   * 「強い1年」と言える上位5%で測る。
   */
  it('1年生の上位は3年生の平均を超える（強い1年は強い）', () => {
    const topFirst = [...first].sort((a, b) => b - a)[Math.floor(first.length * 0.05)]
    expect(topFirst).toBeGreaterThan(average(third))
  })

  it('3年生の下位は1年生の平均を下回る（弱い3年は弱い）', () => {
    const lowThird = [...third].sort((a, b) => a - b)[Math.floor(third.length * 0.05)]
    expect(lowThird).toBeLessThan(average(first))
  })
})

describe('投手の野手能力', () => {
  /**
   * **投手としての総合を超えない。**
   * 野手と同じ振り方をしていた頃は、素質の高い投手は打撃・守備・走塁まで
   * 軒並み高く、自動編成が「打てるから」と別のポジションへ回していた。
   */
  it('入部時点の野手能力が投手としての総合を超えない', () => {
    const rng = createRng(77)
    for (let i = 0; i < 200; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: true })
      const cap = pitchingRating(player.pitching!)
      const b = player.batting

      for (const value of [b.meet, b.power, b.speed, b.fielding, b.catching]) {
        expect(value).toBeLessThanOrEqual(cap)
      }
      // 肩力だけは球速から導くので、この上限の外にある
    }
  })

  it('野手能力は一律ではなく散らばる', () => {
    const rng = createRng(78)
    const meets = new Set<number>()
    for (let i = 0; i < 40; i++) {
      meets.add(createPlayer(rng, { id: `p${i}`, grade: 2, isPitcher: true }).batting.meet)
    }
    expect(meets.size).toBeGreaterThan(10)
  })
})

describe('球速の伸び代', () => {
  it('投手には球速の得意・苦手が付きうる', () => {
    // 入っていなかった頃は、誰が投げても球速の伸び方が同じで、
    // 「伸び代のある投手」が生まれなかった
    const rng = createRng(41)
    let withVelocity = 0
    for (let i = 0; i < 200; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: true })
      if (player.growthAptitude.velocity !== undefined) withVelocity++
    }
    expect(withVelocity).toBeGreaterThan(20)
  })

  it('稀に球速だけ飛び抜けて伸びる投手が出る', () => {
    // 150km/h はドラフトの分かれ目。入学時の球速だけで決まると育てる余地が無い
    const rng = createRng(42)
    let bloomers = 0
    for (let i = 0; i < 400; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: true })
      if ((player.growthAptitude.velocity ?? 0) >= 1.9) bloomers++
    }
    expect(bloomers).toBeGreaterThan(5)
    expect(bloomers).toBeLessThan(80)
  })

  it('野手には球速の伸び代が付かない', () => {
    const rng = createRng(43)
    for (let i = 0; i < 50; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: false })
      expect(player.growthAptitude.velocity).toBeUndefined()
    }
  })
})

describe('伸び代の個人差', () => {
  /**
   * **得意2つ・苦手2つ・残りは等倍、という配り方をやめた。**
   * 半分の能力が「ちょうど1.0」で並ぶので、3年育てるとどの選手も
   * 同じような形に落ち着いていた。
   */
  it('すべての能力に別々の伸び代が付く', () => {
    const rng = createRng(51)
    for (let i = 0; i < 30; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: false })
      const values = Object.values(player.growthAptitude) as number[]
      expect(values).toHaveLength(6)
      // 全部が同じ値ということは無い
      expect(new Set(values).size).toBeGreaterThan(3)
    }
  })

  it('選手ごとに「よく伸びる／伸びない」の差がある', () => {
    // 能力ごとの乱数だけだと平均が1.0に寄って、
    // 「この選手はよく伸びる」が作れない
    const rng = createRng(52)
    const means: number[] = []
    for (let i = 0; i < 200; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: false })
      const values = Object.values(player.growthAptitude) as number[]
      means.push(values.reduce((a, b) => a + b, 0) / values.length)
    }
    expect(Math.max(...means) - Math.min(...means)).toBeGreaterThan(0.5)
  })

  it('チーム全体の成長速度は変えない（伸び代の平均は1.0前後）', () => {
    const rng = createRng(53)
    const all: number[] = []
    for (let i = 0; i < 400; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 1, isPitcher: false })
      all.push(...(Object.values(player.growthAptitude) as number[]))
    }
    const mean = all.reduce((a, b) => a + b, 0) / all.length
    expect(mean).toBeGreaterThan(0.94)
    expect(mean).toBeLessThan(1.12)
  })
})

describe('入部時の能力の凸凹', () => {
  it('能力ごとにはっきり差が付く', () => {
    const rng = createRng(61)
    const gaps: number[] = []
    for (let i = 0; i < 200; i++) {
      const b = createPlayer(rng, { id: `p${i}`, grade: 2, isPitcher: false }).batting
      const values = [b.meet, b.power, b.speed, b.arm, b.fielding, b.catching]
      gaps.push(Math.max(...values) - Math.min(...values))
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    expect(mean).toBeGreaterThan(20)
  })

  it('凸凹にしても総合は素質どおりになる', () => {
    // **スカウトの「素質◯◯」と食い違ってはいけない。**
    // ばらつきの合計を0に揃えているので、平均は素質に一致する
    const rng = createRng(62)
    const ratings: number[] = []
    for (let i = 0; i < 400; i++) {
      const player = createPlayer(rng, {
        id: `p${i}`,
        grade: 1,
        isPitcher: false,
        talentBonus: 24,
        talentSpread: 0,
      })
      ratings.push(battingRating(player.batting))
    }
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length
    // 素質は GRADE_BASE[1](36) + 24 = 60
    expect(Math.abs(mean - 60)).toBeLessThan(2)
  })
})
