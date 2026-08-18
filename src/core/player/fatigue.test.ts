import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { staminaFactor } from '@/core/match/halfInning'
import { createInitialRoster } from './createPlayer'
import {
  FATIGUE_MAX,
  FATIGUE_RECOVERY_PER_DAY,
  fatigueAfterPitching,
  fatigueLevel,
  fatigueOf,
  fatiguePenalty,
  recoveredFatigue,
} from './fatigue'
import type { Player } from '@/core/types/player'

const roster = createInitialRoster(createRng(41))
const pitcher = roster.find((player) => player.isPitcher)!

function tired(value: number): Player {
  return { ...pitcher, fatigue: value }
}

/** スタミナと疲労を指定した投手 */
function withStamina(stamina: number, fatigue = 0, skills: string[] = []): Player {
  return { ...pitcher, fatigue, skills, pitching: { ...pitcher.pitching!, stamina } }
}

/** イニング数ぶんの投球成績（3アウト＝1回、走者は控えめに） */
function innings(count: number) {
  return { outs: count * 3, hits: count, walks: Math.round(count / 3) }
}

describe('fatigueOf', () => {
  it('記録が無ければ0', () => {
    const { fatigue: _ignored, ...rest } = pitcher
    expect(fatigueOf(rest as Player)).toBe(0)
  })
})

describe('疲労の溜まり方', () => {
  /**
   * **イニングではなく「スタミナをどれだけ使ったか」で溜まる。**
   * 回数で数えていた頃は、スタミナSの投手が長く投げるほど疲れる形になっていて、
   * 「余力のある投手は同じ回数でも疲れない」が表せなかった。
   */
  it('スタミナDが5回投げるほうが、スタミナSが7回投げるより疲れる', () => {
    const weak = fatigueAfterPitching(withStamina(55), innings(5))
    const strong = fatigueAfterPitching(withStamina(90), innings(7))

    expect(weak).toBeGreaterThan(strong)
  })

  it('同じ回数なら、スタミナが高いほど疲れない', () => {
    expect(fatigueAfterPitching(withStamina(90), innings(6))).toBeLessThan(
      fatigueAfterPitching(withStamina(55), innings(6)),
    )
  })

  it('投げるほど溜まる', () => {
    const player = withStamina(70)
    expect(fatigueAfterPitching(player, innings(7))).toBeGreaterThan(
      fatigueAfterPitching(player, innings(3)),
    )
  })

  it('持ちいっぱいまで投げても、中3日で万全に戻る', () => {
    // スタミナDが5回＝ほぼ持ちいっぱい
    const full = fatigueAfterPitching(withStamina(55), innings(5))
    expect(full).toBeGreaterThan(25)
    expect(recoveredFatigue(full, 4)).toBe(0)
  })

  it('上限を超えない', () => {
    expect(fatigueAfterPitching(withStamina(30, 90), innings(9))).toBe(FATIGUE_MAX)
  })

  it('「回復」を持っていると溜まりにくい', () => {
    const normal = fatigueAfterPitching(withStamina(70), innings(6))
    const quick = fatigueAfterPitching(withStamina(70, 0, ['quick-recovery']), innings(6))
    const iron = fatigueAfterPitching(withStamina(70, 0, ['iron-arm']), innings(6))
    const slow = fatigueAfterPitching(withStamina(70, 0, ['slow-recovery']), innings(6))

    expect(quick).toBeLessThan(normal)
    expect(iron).toBeLessThan(quick)
    expect(slow).toBeGreaterThan(normal)
  })
})

describe('recoveredFatigue', () => {
  it('1日ぶんずつ抜ける', () => {
    expect(recoveredFatigue(60, 1)).toBe(60 - FATIGUE_RECOVERY_PER_DAY)
  })

  it('完投から5日で万全に戻る', () => {
    expect(recoveredFatigue(60, 5)).toBe(0)
  })

  it('大会の中1日では抜け切らない', () => {
    // 中1日＝2日。完投した投手は次の回戦でまだ疲れている
    expect(recoveredFatigue(60, 2)).toBeGreaterThan(30)
  })

  it('0を下回らない', () => {
    expect(recoveredFatigue(10, 99)).toBe(0)
  })
})

describe('疲労の効き方', () => {
  /**
   * **投げられる回は短くならない。** 疲労でスタミナを目減りさせていた頃は、
   * 疲れた投手も1人目の打者には本調子と同じで、ただ早く崩れるだけだった。
   * 疲れているなら最初から球威も制球も落ちているほうが実感に合う。
   */
  it('1人目の打者から能力が落ちる', () => {
    expect(fatiguePenalty(tired(60))).toBeLessThan(1)
    expect(staminaFactor(tired(60), 1)).toBeLessThan(staminaFactor(tired(0), 1))
  })

  it('疲労が重いほど落ちる', () => {
    expect(fatiguePenalty(tired(90))).toBeLessThan(fatiguePenalty(tired(40)))
  })

  it('万全なら何も変わらない', () => {
    expect(fatiguePenalty(tired(0))).toBe(1)
  })

  it('投げられる打者数そのものは変わらない', () => {
    // 疲れていても「イニングを食えない」わけではない。打たれるだけ
    const faced = 10
    const ratio = staminaFactor(tired(60), faced) / staminaFactor(tired(60), 1)
    const freshRatio = staminaFactor(tired(0), faced) / staminaFactor(tired(0), 1)
    expect(ratio).toBeCloseTo(freshRatio, 6)
  })
})

describe('fatigueLevel', () => {
  it('数字が上がるほど段階も上がる', () => {
    expect(fatigueLevel(tired(0))).toBe('fresh')
    expect(fatigueLevel(tired(20))).toBe('light')
    expect(fatigueLevel(tired(50))).toBe('tired')
    expect(fatigueLevel(tired(80))).toBe('dead')
  })
})
