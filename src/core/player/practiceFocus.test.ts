/**
 * 「積み上げて1段上がる」練習方針のテスト。
 *
 * 弾道（1〜4）と持ち球は、他の能力のように毎手1ずつ動く値ではない。
 * 練習量を溜めて、届いたところで1段上がる形になっている。
 */

import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import type { Player } from '@/core/types/player'
import { applyPractice, TRAJECTORY_MAX } from './growth'
import { emptyCareerStats } from './careerStats'
import { canPracticePitch } from './trainingFocus'
import { arsenalScore, PITCH_MAX_COUNT, PITCH_MAX_LEVEL } from './pitchDefs'

function makeBatter(overrides: Partial<Player> = {}): Player {
  return {
    id: 'batter',
    name: 'テスト 太郎',
    grade: 1,
    position: 'CF',
    isPitcher: false,
    batting: { trajectory: 1, meet: 40, power: 40, speed: 40, arm: 40, fielding: 40, catching: 40 },
    pitching: null,
    motivation: 0,
    trust: 50,
    condition: 100,
    injuryMonths: 0,
    personality: 'クール',
    growthAptitude: {},
    aptitudes: { P: 0, C: 1, '1B': 3, '2B': 4, '3B': 4, SS: 3, LF: 4, CF: 5, RF: 4 },
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
    ...overrides,
  }
}

function makePitcher(overrides: Partial<Player> = {}): Player {
  return makeBatter({
    id: 'pitcher',
    position: 'P',
    isPitcher: true,
    pitching: {
      velocity: 140,
      control: 50,
      stamina: 50,
      breaking: 50,
      life: 50,
      sharpness: 50,
      pitches: [{ direction: 'left', name: 'スライダー', level: 1 }],
    },
    ...overrides,
  })
}

/** 練習を繰り返す。1手＝3日ぶん */
function practice(player: Player, hands: number, seed = 5): Player {
  const rng = createRng(seed)
  let current = player
  for (let i = 0; i < hands; i++) {
    current = applyPractice(rng, [current], PRACTICE_DEFS.batting, { steps: 3 }).players[0]
  }
  return current
}

describe('弾道の練習', () => {
  it('続ければ弾道が1段上がる', () => {
    const grown = practice(makeBatter({ focus: { type: 'trajectory' } }), 60)
    expect(grown.batting.trajectory).toBe(2)
  })

  it('1段上がったらチーム練習に戻る（溜め直しにはならない）', () => {
    const grown = practice(makeBatter({ focus: { type: 'trajectory' } }), 60)
    expect(grown.focus).toEqual({ type: 'team' })
    expect(grown.trajectoryProgress).toBe(0)
  })

  it('パワーを10〜15上げるのと同じくらいの練習量がかかる', () => {
    // 1手で上がるようでは、全員がすぐ弾道4になって打球の質という個性が消える
    const before = makeBatter({ focus: { type: 'trajectory' } })
    const power = practice(makeBatter(), 60).batting.power - before.batting.power
    expect(power).toBeGreaterThanOrEqual(8)
    expect(power).toBeLessThanOrEqual(20)
  })

  it('弾道が最大の打者には指示しても何も起きない', () => {
    const maxed = makeBatter({
      batting: { ...makeBatter().batting, trajectory: TRAJECTORY_MAX },
      focus: { type: 'trajectory' },
    })
    expect(practice(maxed, 60).batting.trajectory).toBe(TRAJECTORY_MAX)
  })
})

describe('球種の練習', () => {
  it('続ければ持ち球が増える（変化量が上がる）', () => {
    const before = makePitcher({ focus: { type: 'pitch' } })
    const grown = practice(before, 60)
    expect(arsenalScore(grown.pitching!.pitches)).toBeGreaterThan(
      arsenalScore(before.pitching!.pitches),
    )
  })

  it('溜まりきるまでは持ち球が動かない', () => {
    const grown = practice(makePitcher({ focus: { type: 'pitch' } }), 1)
    expect(grown.pitching!.pitches).toHaveLength(1)
    expect(grown.pitchProgress).toBeGreaterThan(0)
  })

  it('弾道と違って上限まで続く（1段ごとに方針が外れない）', () => {
    const grown = practice(makePitcher({ focus: { type: 'pitch' } }), 60)
    expect(grown.focus).toEqual({ type: 'pitch' })
  })

  it('覚えるものが無くなったらチーム練習に戻る', () => {
    const complete = makePitcher({
      focus: { type: 'pitch' },
      pitching: {
        ...makePitcher().pitching!,
        pitches: [
          { direction: 'left', name: 'スライダー', level: PITCH_MAX_LEVEL },
          { direction: 'lowerLeft', name: 'カーブ', level: PITCH_MAX_LEVEL },
          { direction: 'down', name: 'フォーク', level: PITCH_MAX_LEVEL },
          { direction: 'lowerRight', name: 'シンカー', level: PITCH_MAX_LEVEL },
          { direction: 'right', name: 'シュート', level: PITCH_MAX_LEVEL },
          { direction: 'up', name: 'ナックル', level: PITCH_MAX_LEVEL - 1 },
        ],
      },
    })
    expect(canPracticePitch(complete)).toBe(true)

    const grown = practice(complete, 60)
    expect(grown.pitching!.pitches).toHaveLength(PITCH_MAX_COUNT)
    expect(canPracticePitch(grown)).toBe(false)
    expect(grown.focus).toEqual({ type: 'team' })
  })

  it('変化球が伸びない投手でも球種は増やせる', () => {
    // 通常の練習では「総合力に見合う数」までしか増えないので、
    // 変化球の低い投手は何を練習しても1球種のままだった
    const raw = makePitcher({
      focus: { type: 'pitch' },
      pitching: { ...makePitcher().pitching!, breaking: 20 },
    })
    const grown = practice(raw, 120)
    expect(arsenalScore(grown.pitching!.pitches)).toBeGreaterThan(
      arsenalScore(raw.pitching!.pitches),
    )
  })

  it('野手に指示はできない', () => {
    expect(canPracticePitch(makeBatter())).toBe(false)
  })
})
