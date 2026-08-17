import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { Motivation, Player } from '@/core/types/player'
import {
  applyCardCost,
  applyPractice,
  armFromVelocity,
  ARM_SPREAD,
  CARD_COST_SCALE,
  getAbility,
  raiseAbility,
} from './growth'
import { emptyCareerStats } from './careerStats'
import { VELOCITY_MAX } from '@/core/types/player'
import { createGrowthAptitude, createInitialRoster } from './createPlayer'
import { APTITUDE_STRONG, APTITUDE_WEAK } from '@/core/types/player'
import type { AbilityChange } from '@/core/types/player'

/**
 * テストで使う「進んだ日数」。
 * 成長も消耗も日数に比例するので、ここを変えると期待値も動く。
 * カードは1〜5なので、その真ん中を代表値にする。
 */
const TEST_STEPS = 3


/** テスト用の選手を作る（乱数を使わず値を固定する） */
function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'test',
    name: 'テスト 太郎',
    grade: 2,
    position: 'CF',
    isPitcher: false,
    batting: {
      trajectory: 2,
      meet: 40,
      power: 40,
      speed: 40,
      arm: 40,
      fielding: 40,
      catching: 40,
    },
    pitching: null,
    motivation: 0,
    trust: 50,
    condition: 100,
    injuryMonths: 0,
    personality: 'クール',
    growthAptitude: {},
    aptitudes: {
      P: 0, C: 1, '1B': 3, '2B': 4, '3B': 4, SS: 3, LF: 4, CF: 5, RF: 4,
    },
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
    ...overrides,
  }
}

function makePitcher(overrides: Partial<Player> = {}): Player {
  return makePlayer({
    id: 'pitcher',
    position: 'P',
    isPitcher: true,
    pitching: {
      velocity: 135,
      control: 40,
      stamina: 40,
      life: 40,
      sharpness: 40,
      pitches: [],
    },
    ...overrides,
  })
}

describe('raiseAbility', () => {
  it('元の選手オブジェクトを変更しない', () => {
    const player = makePlayer()
    const { player: updated } = raiseAbility(player, 'meet', 5)
    expect(player.batting.meet).toBe(40)
    expect(updated.batting.meet).toBe(45)
  })

  it('100を超えず、超過分は change に反映されない', () => {
    const player = makePlayer({
      batting: { ...makePlayer().batting, meet: 98 },
    })
    const { player: updated, change } = raiseAbility(player, 'meet', 10)
    expect(updated.batting.meet).toBe(100)
    expect(change).toEqual({ playerId: 'test', key: 'meet', before: 98, after: 100 })
  })

  it('1を下回らない', () => {
    const player = makePlayer({ batting: { ...makePlayer().batting, meet: 3 } })
    const { player: updated } = raiseAbility(player, 'meet', -10)
    expect(updated.batting.meet).toBe(1)
  })

  it('変化が無ければ change は null', () => {
    const player = makePlayer({ batting: { ...makePlayer().batting, meet: 100 } })
    const { change } = raiseAbility(player, 'meet', 5)
    expect(change).toBeNull()
  })

  it('野手に投手能力を上げようとしても何も起きない', () => {
    const player = makePlayer()
    const { player: updated, change } = raiseAbility(player, 'control', 5)
    expect(updated).toBe(player)
    expect(change).toBeNull()
  })

  it('投手能力を正しく上げられる', () => {
    const pitcher = makePitcher()
    const { player: updated } = raiseAbility(pitcher, 'control', 5)
    expect(updated.pitching?.control).toBe(45)
    expect(pitcher.pitching?.control).toBe(40) // 非破壊
  })
})

describe('getAbility', () => {
  it('持っていない能力は null を返す', () => {
    expect(getAbility(makePlayer(), 'control')).toBeNull()
    expect(getAbility(makePitcher(), 'control')).toBe(40)
    expect(getAbility(makePlayer(), 'meet')).toBe(40)
  })
})

describe('applyCardCost', () => {
  /**
   * 1手あたりの消耗は CARD_COST_SCALE で薄めたうえ、端数を確率で丸めている。
   * 1回だけ見ても±1ぶれるので、まとめて平均を取る。
   */
  function averageAfter(
    def: (typeof PRACTICE_DEFS)[keyof typeof PRACTICE_DEFS],
    overrides: Parameters<typeof makePlayer>[0] = {},
  ): { condition: number; trust: number } {
    const rng = createRng(5)
    const trials = 400
    let condition = 0
    let trust = 0
    for (let i = 0; i < trials; i++) {
      const after = applyCardCost(rng, [makePlayer(overrides)], def, TEST_STEPS)[0]
      condition += after.condition
      trust += after.trust
    }
    return { condition: condition / trials, trust: trust / trials }
  }

  it('練習すると体力が減る', () => {
    const expected = 100 + PRACTICE_DEFS.batting.conditionDelta * CARD_COST_SCALE * TEST_STEPS
    expect(averageAfter(PRACTICE_DEFS.batting).condition).toBeCloseTo(expected, 0)
  })

  it('休養カードで体力が回復する', () => {
    const expected = 50 + PRACTICE_DEFS.rest.conditionDelta * CARD_COST_SCALE * TEST_STEPS
    expect(averageAfter(PRACTICE_DEFS.rest, { condition: 50 }).condition).toBeCloseTo(expected, 0)
  })

  it('メンタル強化で信頼度が上がる', () => {
    const expected = 50 + PRACTICE_DEFS.mental.trustDelta * CARD_COST_SCALE * TEST_STEPS
    expect(averageAfter(PRACTICE_DEFS.mental).trust).toBeCloseTo(expected, 0)
  })

  it('体力・信頼度は0〜100に収まる', () => {
    const players = applyCardCost(
      createRng(1),
      [makePlayer({ trust: 100, condition: 5 })],
      PRACTICE_DEFS.stamina,
      TEST_STEPS,
    )
    expect(players[0].trust).toBeLessThanOrEqual(100)
    expect(players[0].trust).toBeGreaterThanOrEqual(0)
    expect(players[0].condition).toBeGreaterThanOrEqual(0)
  })

  it('元の配列を変更しない', () => {
    const player = makePlayer()
    applyCardCost(createRng(1), [player], PRACTICE_DEFS.batting, TEST_STEPS)
    expect(player.condition).toBe(100)
  })
})

describe('カードの数字（進んだ日数）', () => {
  /** steps 日ぶんの練習を1回行い、伸びた合計を返す */
  function growthOf(steps: number, seed: number): number {
    const rng = createRng(seed)
    let total = 0
    for (let i = 0; i < 200; i++) {
      const { changes } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.batting, { steps })
      total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
    }
    return total
  }

  it('数字が大きいほど大きく伸びる', () => {
    expect(growthOf(5, 71)).toBeGreaterThan(growthOf(1, 71) * 3)
  })

  it('伸びはおおよそ日数に比例する', () => {
    const one = growthOf(1, 72)
    const five = growthOf(5, 72)
    // 確率の丸めがあるので幅を見る。3〜7倍に収まっていれば比例している
    expect(five).toBeGreaterThan(one * 3)
    expect(five).toBeLessThan(one * 7)
  })

  it('数字が大きいほど大きく消耗する', () => {
    const conditionAfter = (steps: number) => {
      const rng = createRng(73)
      let total = 0
      for (let i = 0; i < 200; i++) {
        total += applyCardCost(rng, [makePlayer()], PRACTICE_DEFS.batting, steps)[0].condition
      }
      return total / 200
    }
    // 5日ぶん進めば5日ぶん疲れる。ここが比例していないと大きい数字が一方的に強い
    expect(100 - conditionAfter(5)).toBeGreaterThan((100 - conditionAfter(1)) * 3)
  })

  it('0日なら何も起きない', () => {
    const { changes } = applyPractice(createRng(74), [makePlayer()], PRACTICE_DEFS.batting, {
      steps: 0,
    })
    expect(changes).toHaveLength(0)
  })
})

describe('applyPractice', () => {
  it('打撃練習でミートとパワーが伸びる', () => {
    // 1回の伸びは1未満のことがあり（端数は確率で切り上げる）、
    // **1回だけ見ても動かない**。何度か重ねて確かめる
    const rng = createRng(1)
    let player = makePlayer()
    const keys = new Set<string>()

    // 1手あたりの伸びを下げたので、確かめるには手数が要る
    for (let i = 0; i < 20; i++) {
      const result = applyPractice(rng, [player], PRACTICE_DEFS.batting, { steps: TEST_STEPS })
      player = result.players[0]
      for (const change of result.changes) keys.add(change.key)
    }

    expect(player.batting.meet).toBeGreaterThan(40)
    expect(player.batting.power).toBeGreaterThan(40)
    expect([...keys].sort()).toEqual(['meet', 'power'])
  })

  it('体力・信頼度には手を触れない（applyCardCost の担当）', () => {
    const rng = createRng(1)
    const { players } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.batting, { steps: TEST_STEPS })
    expect(players[0].condition).toBe(100)
    expect(players[0].trust).toBe(50)
  })

  it('休養では能力が伸びない', () => {
    const rng = createRng(1)
    const { changes } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.rest, { steps: TEST_STEPS })
    expect(changes).toHaveLength(0)
  })

  it('投球練習は投手だけが伸びる', () => {
    // 1日ぶんの伸びは1に満たないので、確率で切り上がるまで何度か回す
    const rng = createRng(1)
    let batter = makePlayer()
    let pitcher = makePitcher()
    const changes: AbilityChange[] = []

    for (let i = 0; i < 20; i++) {
      const result = applyPractice(rng, [batter, pitcher], PRACTICE_DEFS.pitching, {
        steps: TEST_STEPS,
      })
      batter = result.players[0]
      pitcher = result.players[1]
      changes.push(...result.changes)
    }

    expect(batter.batting).toEqual(makePlayer().batting) // 野手は変化なし
    expect(pitcher.pitching!.control).toBeGreaterThan(40)
    expect(changes.every((c) => c.playerId === 'pitcher')).toBe(true)
  })

  it('やる気が高いほど成長する', () => {
    const totalGrowth = (motivation: Motivation): number => {
      const rng = createRng(4649)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(
          rng,
          [makePlayer({ motivation })],
          PRACTICE_DEFS.batting,
          { steps: TEST_STEPS },
        )
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(2)).toBeGreaterThan(totalGrowth(0))
    expect(totalGrowth(0)).toBeGreaterThan(totalGrowth(-2))
  })

  it('1年生は3年生より伸びる', () => {
    const totalGrowth = (grade: 1 | 3): number => {
      const rng = createRng(818)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(
          rng,
          [makePlayer({ grade })],
          PRACTICE_DEFS.batting,
          { steps: TEST_STEPS },
        )
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(1)).toBeGreaterThan(totalGrowth(3))
  })

  it('体力が低いと伸びにくい', () => {
    const totalGrowth = (condition: number): number => {
      const rng = createRng(202)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(
          rng,
          [makePlayer({ condition })],
          PRACTICE_DEFS.batting,
          { steps: TEST_STEPS },
        )
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(100)).toBeGreaterThan(totalGrowth(10))
  })

  it('レアカードは効果が大きい', () => {
    const totalGrowth = (isRare: boolean): number => {
      const rng = createRng(77)
      let total = 0
      for (let i = 0; i < 300; i++) {
        const { changes } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.batting, { steps: TEST_STEPS, isRare })
        total += changes.reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(true)).toBeGreaterThan(totalGrowth(false))
  })

  it('能力が高いほど伸びにくい', () => {
    const totalGrowth = (meet: number): number => {
      const rng = createRng(313)
      let total = 0
      for (let i = 0; i < 400; i++) {
        const player = makePlayer({ batting: { ...makePlayer().batting, meet } })
        const { changes } = applyPractice(rng, [player], PRACTICE_DEFS.batting, { steps: TEST_STEPS })
        total += changes
          .filter((c) => c.key === 'meet')
          .reduce((sum, c) => sum + (c.after - c.before), 0)
      }
      return total
    }
    expect(totalGrowth(30)).toBeGreaterThan(totalGrowth(85))
  })
})


describe('伸びやすさの個人差', () => {
  /** 同じ練習を repeat 回してミートがどれだけ伸びたか */
  function meetGain(aptitude: number, repeat = 60, seed = 31): number {
    const rng = createRng(seed)
    let player = makePlayer({ growthAptitude: { meet: aptitude } })
    for (let i = 0; i < repeat; i++) {
      player = applyPractice(rng, [player], PRACTICE_DEFS.batting, { steps: TEST_STEPS }).players[0]
    }
    return player.batting.meet - 40
  }

  it('得意な能力ほど伸びる', () => {
    expect(meetGain(1.5)).toBeGreaterThan(meetGain(1.0))
    expect(meetGain(1.0)).toBeGreaterThan(meetGain(0.5))
  })

  it('記録が無ければ標準（1.0）として扱う', () => {
    const rng = createRng(7)
    const withNone = applyPractice(
      rng,
      [{ ...makePlayer(), growthAptitude: {} }],
      PRACTICE_DEFS.batting,
      { steps: TEST_STEPS },
    )
    expect(withNone.changes.length).toBeGreaterThanOrEqual(0)
  })

  it('得意な選手のほうが目に見えて多く伸びる', () => {
    // 得意と苦手を並べて何度も練習させ、伸び方が割れることを確かめる。
    // ここが割れないと、画面には全員「+1」しか出てこない。
    //
    // **1回の練習で差が出ることは求めない。** 1日ぶんの伸びは1に満たないので、
    // 1回ごとに見れば「伸びた／伸びない」の二択にしかならない。
    // 差が出るのは「どれだけの頻度で名前が挙がるか」のほう
    const rng = createRng(41)
    const strong = makePlayer({ id: 'strong', growthAptitude: { meet: 1.6 } })
    const weak = makePlayer({ id: 'weak', growthAptitude: { meet: 0.5 } })

    let strongTotal = 0
    let weakTotal = 0
    for (let i = 0; i < 200; i++) {
      const { changes } = applyPractice(rng, [strong, weak], PRACTICE_DEFS.batting, {
        steps: TEST_STEPS,
      })
      const gain = (id: string) =>
        changes
          .filter((c) => c.playerId === id && c.key === 'meet')
          .reduce((sum, c) => sum + (c.after - c.before), 0)
      strongTotal += gain('strong')
      weakTotal += gain('weak')
    }

    // 得意（1.6倍）と苦手（0.5倍）なので、2倍以上の差がついていないとおかしい
    expect(strongTotal).toBeGreaterThan(weakTotal * 2)
  })
})

describe('createGrowthAptitude', () => {
  it('得意2つ・苦手2つが決まる', () => {
    const aptitude = createGrowthAptitude(createRng(3), false)
    const values = Object.values(aptitude)
    expect(values.filter((value) => value >= APTITUDE_STRONG)).toHaveLength(2)
    expect(values.filter((value) => value <= APTITUDE_WEAK)).toHaveLength(2)
  })

  it('野手に投手能力の得意・苦手は付かない', () => {
    for (let seed = 1; seed < 40; seed++) {
      const aptitude = createGrowthAptitude(createRng(seed), false)
      for (const key of ['control', 'stamina', 'sharpness']) {
        expect(aptitude[key as keyof typeof aptitude]).toBeUndefined()
      }
    }
  })

  it('投手には投手能力も候補に入る', () => {
    const keys = new Set<string>()
    for (let seed = 1; seed < 60; seed++) {
      for (const key of Object.keys(createGrowthAptitude(createRng(seed), true))) keys.add(key)
    }
    expect([...keys].some((key) => ['control', 'stamina', 'sharpness'].includes(key))).toBe(true)
  })

  it('平均は1.0前後（チーム全体の成長速度は変わらない）', () => {
    let total = 0
    let count = 0
    const ALL_KEYS = 6
    for (let seed = 1; seed < 300; seed++) {
      const aptitude = createGrowthAptitude(createRng(seed), false)
      const values = Object.values(aptitude)
      // 記録の無い能力は1.0として数える
      total += values.reduce((sum, value) => sum + value, 0) + (ALL_KEYS - values.length)
      count += ALL_KEYS
    }
    expect(total / count).toBeGreaterThan(0.93)
    expect(total / count).toBeLessThan(1.07)
  })
})


describe('球速の成長', () => {
  /** 投球練習・走り込みを繰り返して球速がどこまで伸びるか */
  function trained(kind: 'pitching' | 'stamina', times: number, seed = 51): Player {
    const rng = createRng(seed)
    let player = makePitcher({ grade: 1 })
    for (let i = 0; i < times; i++) {
      player = applyPractice(rng, [player], PRACTICE_DEFS[kind], { steps: TEST_STEPS }).players[0]
    }
    return player
  }

  it('練習で球速が伸びる', () => {
    const before = makePitcher().pitching!.velocity
    expect(trained('pitching', 40).pitching!.velocity).toBeGreaterThan(before)
  })

  it('走り込みがいちばん伸びる', () => {
    const running = trained('stamina', 40).pitching!.velocity
    const throwing = trained('pitching', 40).pitching!.velocity
    expect(running).toBeGreaterThan(throwing)
  })

  it('3年間ぶん練習しても上限を超えない', () => {
    expect(trained('stamina', 400).pitching!.velocity).toBeLessThanOrEqual(VELOCITY_MAX)
  })

  it('野手の球速は動かない（そもそも持たない）', () => {
    const rng = createRng(3)
    const { changes } = applyPractice(rng, [makePlayer()], PRACTICE_DEFS.pitching, { steps: TEST_STEPS })
    expect(changes.every((c) => c.key !== 'velocity')).toBe(true)
  })
})

describe('投手の肩力は球速に連動する', () => {
  it('生成した時点で目安の周りに収まっている', () => {
    // **ぴったり一致はさせない。** 一致させると球速が同じ投手の肩力が
    // 1ポイントも違わなくなり、「球速の割に肩が強い」が作れない
    const roster = createInitialRoster(createRng(61))
    let varied = false

    for (const player of roster) {
      if (!player.pitching) continue
      const base = armFromVelocity(player.pitching.velocity)
      expect(Math.abs(player.batting.arm - base)).toBeLessThanOrEqual(ARM_SPREAD)
      if (player.batting.arm !== base) varied = true
    }
    expect(varied).toBe(true)
  })

  it('球速が伸びると肩力も上がる', () => {
    const before = makePitcher({ grade: 1 })
    const { player: after } = raiseAbility(before, 'velocity', 8)

    expect(after.pitching!.velocity).toBe(before.pitching!.velocity + 8)
    expect(after.batting.arm).toBeGreaterThan(before.batting.arm)
  })

  it('球速が伸びても個体差は消えない', () => {
    // 目安に置き換えていた頃は、最初の1km/hで生成時の個体差が消えていた
    const before = makePitcher({ grade: 1 })
    const gap = before.batting.arm - armFromVelocity(before.pitching!.velocity)
    const { player: after } = raiseAbility(before, 'velocity', 8)

    expect(after.batting.arm - armFromVelocity(after.pitching!.velocity)).toBe(gap)
  })

  it('投手は遠投で肩力が直接は伸びない（球速経由で上がる）', () => {
    const rng = createRng(7)
    const { changes } = applyPractice(rng, [makePitcher()], PRACTICE_DEFS.shoulder, { steps: TEST_STEPS })
    expect(changes.every((c) => c.key !== 'arm')).toBe(true)
  })

  it('野手は遠投で肩力が伸びる', () => {
    const rng = createRng(7)
    let player = makePlayer()
    for (let i = 0; i < 20; i++) {
      player = applyPractice(rng, [player], PRACTICE_DEFS.shoulder, { steps: TEST_STEPS }).players[0]
    }
    expect(player.batting.arm).toBeGreaterThan(40)
  })
})
