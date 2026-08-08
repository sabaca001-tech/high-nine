import { describe, expect, it } from 'vitest'
import {
  applyReputation,
  reputationDisplay,
  handSizeFor,
  HAND_SIZE_MAX,
  REPUTATION_GRADE_LABELS,
  REPUTATION_INITIAL,
  REPUTATION_MAX,
  reputationGrade,
  reputationGainAt,
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

describe('reputationGainAt', () => {
  it('上に行くほど上がりにくい', () => {
    expect(reputationGainAt(20, 10)).toBeGreaterThan(reputationGainAt(50, 10))
    expect(reputationGainAt(50, 10)).toBeGreaterThan(reputationGainAt(90, 10))
  })

  it('下に行くほど下がりにくい', () => {
    // 負けが込んだ学校が0まで削られると立て直せない
    expect(reputationGainAt(20, -10)).toBeGreaterThan(reputationGainAt(80, -10))
  })

  it('低いところでも下げ幅が0にはならない', () => {
    expect(reputationGainAt(5, -10)).toBeLessThan(0)
  })
})

describe('applyReputation', () => {
  it('0〜100に収まる', () => {
    expect(applyReputation(0, -50)).toBeGreaterThanOrEqual(0)
    expect(applyReputation(99, 999)).toBeLessThanOrEqual(REPUTATION_MAX)
  })

  it('小数第1位まで保つ（表示のときだけ整数にする）', () => {
    // **整数に丸めていたら、勝ちの加算だけが消えていた。**
    // 評判40で1勝の加算は0.47。Math.round(40 + 0.47) は 40 なので、
    // 勝つたびに切り捨てられ、負け（-0.86）だけが残っていた
    const after = applyReputation(37, 1.7)
    expect(after).toBeGreaterThan(37)
    expect(Math.round(after * 10)).toBe(after * 10)
    expect(reputationDisplay(after)).toBe(Math.round(after))
  })

  it('小さな勝ちを積み重ねれば評判が上がる', () => {
    // 1試合ぶんの加算（素の値+1）を10回。丸めで消えてはいけない
    let reputation = 40
    for (let i = 0; i < 10; i++) reputation = applyReputation(reputation, 1)
    expect(reputation).toBeGreaterThan(43)
  })

  it('負けが込んでも底を打つ（立て直せなくならない）', () => {
    let reputation = REPUTATION_INITIAL
    // 3試合に1勝という弱いチームを想定して長く回す
    for (let i = 0; i < 300; i++) {
      reputation = applyReputation(reputation, i % 3 === 0 ? 1 : -0.4)
    }
    expect(reputation).toBeGreaterThan(5)
  })
})
