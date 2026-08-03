import { describe, expect, it } from 'vitest'
import {
  handSizeFor,
  HAND_SIZE_MAX,
  REPUTATION_GRADE_LABELS,
  REPUTATION_INITIAL,
  REPUTATION_MAX,
  reputationGrade,
} from './season'
import type { ReputationGrade } from './season'

const ORDER: ReputationGrade[] = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S']

describe('reputationGrade', () => {
  it('0はG、上限はS', () => {
    expect(reputationGrade(0)).toBe('G')
    expect(reputationGrade(REPUTATION_MAX)).toBe('S')
  })

  it('評判が上がるほどグレードも上がる（逆転しない）', () => {
    let previous = -1
    for (let reputation = 0; reputation <= REPUTATION_MAX; reputation++) {
      const index = ORDER.indexOf(reputationGrade(reputation))
      expect(index).toBeGreaterThanOrEqual(previous)
      previous = index
    }
  })

  it('全てのグレードに呼び名がある', () => {
    for (const grade of ORDER) {
      expect(REPUTATION_GRADE_LABELS[grade].length).toBeGreaterThan(0)
    }
  })

  it('初期評判は下のほうのグレード（伸ばす余地が残っている）', () => {
    const index = ORDER.indexOf(reputationGrade(REPUTATION_INITIAL))
    expect(index).toBeLessThan(ORDER.indexOf('C'))
  })
})

describe('handSizeFor', () => {
  it('評判が上がると手札が増える', () => {
    expect(handSizeFor(REPUTATION_MAX)).toBeGreaterThan(handSizeFor(0))
  })

  it('減ることはない（評判が上がって手札が減ると理不尽）', () => {
    let previous = 0
    for (let reputation = 0; reputation <= REPUTATION_MAX; reputation++) {
      const size = handSizeFor(reputation)
      expect(size).toBeGreaterThanOrEqual(previous)
      previous = size
    }
  })

  it('上限は HAND_SIZE_MAX に収まる', () => {
    expect(handSizeFor(REPUTATION_MAX)).toBe(HAND_SIZE_MAX)
  })

  it('最低でも選べる程度の枚数はある', () => {
    expect(handSizeFor(0)).toBeGreaterThanOrEqual(3)
  })
})
