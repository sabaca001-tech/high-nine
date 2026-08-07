import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { staminaCapacity, staminaFactor } from '@/core/match/halfInning'
import { createInitialRoster } from './createPlayer'
import {
  effectiveStamina,
  FATIGUE_MAX,
  FATIGUE_RECOVERY_PER_DAY,
  fatigueAfterOuts,
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

describe('fatigueOf', () => {
  it('記録が無ければ0', () => {
    const { fatigue: _ignored, ...rest } = pitcher
    expect(fatigueOf(rest as Player)).toBe(0)
  })
})

describe('fatigueAfterOuts', () => {
  it('完投（27アウト）で48たまる', () => {
    expect(fatigueAfterOuts(0, 27)).toBe(48)
  })

  it('完投しても中1日で半分は抜ける', () => {
    // 連投の代償は残しつつ、エースが常に本調子でないままにはしない
    const afterComplete = fatigueAfterOuts(0, 27)
    expect(recoveredFatigue(afterComplete, 2)).toBeLessThanOrEqual(afterComplete / 2)
  })

  it('投げるほど溜まる', () => {
    expect(fatigueAfterOuts(0, 27)).toBeGreaterThan(fatigueAfterOuts(0, 9))
  })

  it('上限を超えない', () => {
    expect(fatigueAfterOuts(90, 27)).toBe(FATIGUE_MAX)
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
  it('疲れているとスタミナが目減りする', () => {
    expect(effectiveStamina(tired(60))).toBeLessThan(effectiveStamina(tired(0)))
  })

  it('持ちが短くなる', () => {
    expect(staminaCapacity(effectiveStamina(tired(60)))).toBeLessThan(
      staminaCapacity(effectiveStamina(tired(0))),
    )
  })

  it('1人目の打者から球威が落ちる', () => {
    expect(fatiguePenalty(tired(60))).toBeLessThan(1)
    expect(staminaFactor(tired(60), 1)).toBeLessThan(staminaFactor(tired(0), 1))
  })

  it('万全なら何も変わらない', () => {
    expect(fatiguePenalty(tired(0))).toBe(1)
    expect(effectiveStamina(tired(0))).toBe(pitcher.pitching!.stamina)
  })

  it('同じ球数でも、疲れているほうが先に崩れる', () => {
    const faced = 20
    expect(staminaFactor(tired(70), faced)).toBeLessThan(staminaFactor(tired(20), faced))
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
