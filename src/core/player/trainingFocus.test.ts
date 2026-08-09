import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { Player } from '@/core/types/player'
import { applyPractice } from './growth'
import { emptyCareerStats } from './careerStats'
import {
  advanceConvert,
  canConvert,
  CONVERT_MAX,
  CONVERT_PRACTICE_PENALTY,
  CONVERT_STEPS,
  convertiblePositions,
  DEFAULT_FOCUS,
  FOCUS_BONUS,
  focusLabel,
  focusMultiplier,
  isSameFocus,
  positionGrowthMultiplier,
  withFocus,
} from './trainingFocus'
import { ALL_POSITIONS } from '@/core/lineup/aptitude'
import { createInitialRoster } from './createPlayer'
import type { GrowableKey } from '@/core/types/player'

/**
 * テストで使う「進んだ日数」。
 * 成長も消耗も日数に比例するので、ここを変えると期待値も動く。
 * カードは1〜5なので、その真ん中を代表値にする。
 */
const TEST_STEPS = 3


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
      P: 'G', C: 'F', '1B': 'C', '2B': 'B', '3B': 'B', SS: 'C', LF: 'B', CF: 'S', RF: 'B',
    },
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
    ...overrides,
  }
}

describe('focusMultiplier', () => {
  it('方針が無ければ、本職での重要度で傾く', () => {
    // **等倍ではない。** すべて同じだけ伸ばしていた頃は、
    // 3年経つと誰を見ても同じ形のレーダーになっていた
    const player = makePlayer()
    expect(focusMultiplier(player, 'meet')).toBe(
      positionGrowthMultiplier(player.position, 'meet'),
    )
    expect(focusMultiplier(player, 'power')).toBe(
      positionGrowthMultiplier(player.position, 'power'),
    )
  })

  it('能力を指定すると、その能力は伸びやすく他は鈍る', () => {
    const player = makePlayer({ focus: { type: 'ability', key: 'meet' } })
    expect(focusMultiplier(player, 'meet')).toBeGreaterThan(1)
    expect(focusMultiplier(player, 'power')).toBeLessThan(1)
  })

  it('コンバート中はすべての能力の伸びが鈍る', () => {
    const player = makePlayer({ focus: { type: 'convert', position: '1B' } })
    expect(focusMultiplier(player, 'meet')).toBeLessThan(1)
    expect(focusMultiplier(player, 'fielding')).toBeLessThan(1)
  })
})

describe('練習への反映', () => {
  /** 300回練習したときの、その能力の合計上昇量 */
  function totalGain(player: Player, key: 'meet' | 'power', seed = 55): number {
    const rng = createRng(seed)
    let total = 0
    for (let i = 0; i < 300; i++) {
      const { changes } = applyPractice(rng, [player], PRACTICE_DEFS.batting, { steps: TEST_STEPS })
      total += changes
        .filter((change) => change.key === key)
        .reduce((sum, change) => sum + (change.after - change.before), 0)
    }
    return total
  }

  it('指定した能力は指定しない場合より伸びる', () => {
    const focused = makePlayer({ focus: { type: 'ability', key: 'meet' } })
    expect(totalGain(focused, 'meet')).toBeGreaterThan(totalGain(makePlayer(), 'meet'))
  })

  it('指定していない能力は伸びが鈍る', () => {
    const focused = makePlayer({ focus: { type: 'ability', key: 'meet' } })
    expect(totalGain(focused, 'power')).toBeLessThan(totalGain(makePlayer(), 'power'))
  })

  it('チームの練習に無い能力でも、方針にしていれば伸びる（自主練）', () => {
    // 走塁練習ではミートもパワーも伸びないが、方針にしていれば伸びる
    const rng = createRng(77)
    const player = makePlayer({ focus: { type: 'ability', key: 'meet' } })
    const { players } = applyPractice(rng, [player], PRACTICE_DEFS.running, { steps: TEST_STEPS })

    expect(players[0].batting.meet).toBeGreaterThanOrEqual(player.batting.meet)
  })
})

describe('コンバート', () => {
  it('本職とA以上の位置は指定できない', () => {
    const player = makePlayer()
    expect(canConvert(player, 'CF')).toBe(false) // 本職
    expect(canConvert(player, '2B')).toBe(true) // B なのでAまで伸ばせる
    expect(convertiblePositions(player)).not.toContain('CF')
  })

  it(`${CONVERT_STEPS}回の練習で適性が1段階上がる`, () => {
    let player = makePlayer({ focus: { type: 'convert', position: '1B' } })
    expect(player.aptitudes['1B']).toBe('C')

    for (let i = 0; i < CONVERT_STEPS - 1; i++) {
      player = advanceConvert(player).player
      // 途中では上がらない
      expect(player.aptitudes['1B']).toBe('C')
    }

    const step = advanceConvert(player)
    expect(step.promoted).toEqual({ position: '1B', from: 'C', to: 'B' })
    expect(step.player.aptitudes['1B']).toBe('B')
    expect(step.player.convertProgress).toBe(0)
  })

  it(`上限（${CONVERT_MAX}）に届くとチーム練習に戻る`, () => {
    let player = makePlayer({
      focus: { type: 'convert', position: '2B' },
      convertProgress: CONVERT_STEPS - 1,
      aptitudes: { ...makePlayer().aptitudes, '2B': 'B' },
    })

    player = advanceConvert(player).player
    expect(player.aptitudes['2B']).toBe(CONVERT_MAX)
    expect(player.focus).toEqual(DEFAULT_FOCUS)
  })

  it('本職より上（S）にはならない', () => {
    let player = makePlayer({
      focus: { type: 'convert', position: '2B' },
      aptitudes: { ...makePlayer().aptitudes, '2B': 'A' },
    })
    // すでにAなので、方針ごと戻される
    player = advanceConvert(player).player

    expect(player.aptitudes['2B']).toBe('A')
    expect(player.focus).toEqual(DEFAULT_FOCUS)
  })

  it('方針でないときは何も起きない', () => {
    const player = makePlayer()
    expect(advanceConvert(player).player).toBe(player)
  })
})

describe('withFocus', () => {
  it('方針を変えるとコンバートの進捗はやり直しになる', () => {
    const player = makePlayer({
      focus: { type: 'convert', position: '1B' },
      convertProgress: 5,
    })
    const changed = withFocus(player, { type: 'convert', position: '2B' })
    expect(changed.convertProgress).toBe(0)
  })

  it('同じ方針なら何も変えない（進捗が消えない）', () => {
    const player = makePlayer({
      focus: { type: 'convert', position: '1B' },
      convertProgress: 5,
    })
    expect(withFocus(player, { type: 'convert', position: '1B' })).toBe(player)
  })

  it('isSameFocus は中身まで見る', () => {
    expect(isSameFocus({ type: 'team' }, { type: 'team' })).toBe(true)
    expect(isSameFocus({ type: 'ability', key: 'meet' }, { type: 'ability', key: 'meet' })).toBe(
      true,
    )
    expect(isSameFocus({ type: 'ability', key: 'meet' }, { type: 'ability', key: 'power' })).toBe(
      false,
    )
    expect(isSameFocus({ type: 'convert', position: '1B' }, { type: 'team' })).toBe(false)
  })
})

describe('focusLabel', () => {
  const labels = { meet: 'ミート' }

  it('方針ごとに読める名前になる', () => {
    expect(focusLabel(undefined, labels)).toBe('チーム練習')
    expect(focusLabel({ type: 'ability', key: 'meet' }, labels)).toBe('ミート')
    expect(focusLabel({ type: 'convert', position: 'SS' }, labels)).toBe('SSへ転向')
  })
})

describe('positionGrowthMultiplier', () => {
  /**
   * **おまかせでも、伸び方は本職で傾く。**
   * すべて等倍にしていた頃は、3年経つと誰を見ても同じ形のレーダーになっていた。
   */
  const BATTING: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']

  it('チーム全体の成長量は変えない（各ポジションで平均1.0前後）', () => {
    for (const position of ALL_POSITIONS) {
      const keys = position === 'P' ? [...BATTING, 'velocity', 'control', 'stamina', 'breaking'] : BATTING
      const values = (keys as GrowableKey[]).map((key) =>
        positionGrowthMultiplier(position, key),
      )
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length
      expect(mean).toBeCloseTo(1, 5)
    }
  })

  it('強制ではない（幅は0.7〜1.35に収める）', () => {
    // ここを広げると「遊撃手だが打てる」が生まれなくなる
    for (const position of ALL_POSITIONS) {
      for (const key of BATTING) {
        const value = positionGrowthMultiplier(position, key)
        expect(value).toBeGreaterThanOrEqual(0.7)
        expect(value).toBeLessThanOrEqual(1.35)
      }
    }
  })

  it('本職なりの能力がいちばん伸びる', () => {
    expect(positionGrowthMultiplier('SS', 'fielding')).toBeGreaterThan(
      positionGrowthMultiplier('SS', 'power'),
    )
    expect(positionGrowthMultiplier('1B', 'power')).toBeGreaterThan(
      positionGrowthMultiplier('1B', 'speed'),
    )
    expect(positionGrowthMultiplier('CF', 'speed')).toBeGreaterThan(
      positionGrowthMultiplier('CF', 'catching'),
    )
    expect(positionGrowthMultiplier('C', 'catching')).toBeGreaterThan(
      positionGrowthMultiplier('C', 'speed'),
    )
    expect(positionGrowthMultiplier('P', 'velocity')).toBeGreaterThan(
      positionGrowthMultiplier('P', 'meet'),
    )
  })

  it('おまかせのときだけ効く（能力指定・コンバートには混ざらない）', () => {
    const roster = createInitialRoster(createRng(5))
    const shortstop = { ...roster[0], position: 'SS' as const, focus: undefined }
    expect(focusMultiplier(shortstop, 'fielding')).toBe(
      positionGrowthMultiplier('SS', 'fielding'),
    )
    expect(focusMultiplier({ ...shortstop, focus: { type: 'ability', key: 'power' } }, 'power')).toBe(
      FOCUS_BONUS,
    )
    expect(
      focusMultiplier({ ...shortstop, focus: { type: 'convert', position: '2B' } }, 'fielding'),
    ).toBe(CONVERT_PRACTICE_PENALTY)
  })
})
