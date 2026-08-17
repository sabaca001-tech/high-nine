/** 定期テストと学力 */

import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { studyRateOf } from '@/core/player/growth'
import { fixedEventFor } from './fixedEvents'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { Player } from '@/core/types/player'

const roster = createInitialRoster(createRng(4))

/** 学力をそろえた部員を作る */
function withAcademics(value: number, count = 20): Player[] {
  return roster.slice(0, count).map((player, index) => ({
    ...player,
    id: `p${index}`,
    academics: value,
  }))
}

/** 中間試験を1回受ける */
function takeExam(players: Player[], seed: number): Player[] {
  const event = fixedEventFor(6)!
  return event.apply(createRng(seed), players).players
}

describe('定期テスト', () => {
  it('6月と11月にある', () => {
    expect(fixedEventFor(6)?.name).toBe('中間試験')
    expect(fixedEventFor(11)?.name).toBe('期末試験')
  })

  it('学力が低いと赤点を引き、練習の伸びが落ちる', () => {
    const after = takeExam(withAcademics(15), 7)
    const failed = after.filter((player) => studyRateOf(player) < 1)

    expect(failed.length).toBeGreaterThan(0)
    expect(studyRateOf(failed[0])).toBeLessThan(1)
  })

  it('学力が高ければ赤点は無く、稀に練習がはかどる', () => {
    const after = takeExam(withAcademics(95), 7)

    expect(after.every((player) => studyRateOf(player) >= 1)).toBe(true)
    expect(after.some((player) => studyRateOf(player) > 1)).toBe(true)
  })

  it('学力が高いほど赤点は減る', () => {
    const countFailed = (value: number) =>
      [1, 2, 3, 4, 5].reduce(
        (total, seed) =>
          total + takeExam(withAcademics(value), seed).filter((p) => studyRateOf(p) < 1).length,
        0,
      )

    expect(countFailed(20)).toBeGreaterThan(countFailed(50))
    expect(countFailed(50)).toBeGreaterThan(countFailed(80))
  })

  it('テストそのものは全員の体力を削る', () => {
    const before = withAcademics(95)
    const after = takeExam(before, 3)
    expect(after[0].condition).toBeLessThan(before[0].condition)
  })

  it('文言に誰が赤点だったかが出る', () => {
    const event = fixedEventFor(6)!
    const { text } = event.apply(createRng(7), withAcademics(10))
    expect(text).toContain('赤点')
  })
})

describe('学力を上げる', () => {
  it('自主学習カードは学力を上げる（信頼度ではなく）', () => {
    // **信頼度が上がるだけのカードが3枚あった**ので役割を分けた。
    // 信頼度はミーティング、捕球はメンタル強化、学力は自主学習
    expect(PRACTICE_DEFS.study.special).toBe('study')
    expect(PRACTICE_DEFS.study.gains).toHaveLength(0)

    expect(PRACTICE_DEFS.meeting.trustDelta).toBeGreaterThan(PRACTICE_DEFS.study.trustDelta)
    expect(PRACTICE_DEFS.mental.gains.map((gain) => gain.key)).toEqual(['catching'])
  })

  it('練習の伸びは、テストの結果ぶんだけ変わる', () => {
    const base = roster[0]
    const failed: Player = { ...base, studyEffect: { rate: 0.7, months: 2 } }
    const excelled: Player = { ...base, studyEffect: { rate: 1.2, months: 2 } }

    expect(studyRateOf(base)).toBe(1)
    expect(studyRateOf(failed)).toBe(0.7)
    expect(studyRateOf(excelled)).toBe(1.2)
  })

  it('期限が切れた効果は効かない', () => {
    const expired: Player = { ...roster[0], studyEffect: { rate: 0.7, months: 0 } }
    expect(studyRateOf(expired)).toBe(1)
  })
})
