import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createPlayer } from './createPlayer'
import {
  abilityPoints,
  breakAmountScore,
  PITCHER_WEIGHTS,
  varietyScore,
  overallRating,
  pitchingRating,
  playerPoints,
  pointsRank,
  proVelocityRank,
  toRank,
  trajectoryAngle,
  velocityRank,
} from './rating'
import { PITCH_DIRECTION_ORDER } from './pitchDefs'
import { velocityGrade, velocityScore, VELOCITY_MAX } from '@/core/types/player'

/** 良い順。2つの物差しを比べるのに使う */
const RANK_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
import type { BattingAbilities, PitchingAbilities, Player } from '@/core/types/player'

describe('toRank', () => {
  it('境界値が正しくランク分けされる', () => {
    expect(toRank(100)).toBe('S')
    expect(toRank(90)).toBe('S')
    expect(toRank(89)).toBe('A')
    expect(toRank(80)).toBe('A')
    expect(toRank(79)).toBe('B')
    expect(toRank(70)).toBe('B')
    expect(toRank(69)).toBe('C')
    expect(toRank(60)).toBe('C')
    expect(toRank(59)).toBe('D')
    expect(toRank(50)).toBe('D')
    expect(toRank(49)).toBe('E')
    expect(toRank(40)).toBe('E')
    expect(toRank(39)).toBe('F')
    expect(toRank(25)).toBe('F')
    expect(toRank(24)).toBe('G')
    expect(toRank(1)).toBe('G')
  })
})

describe('trajectoryAngle', () => {
  it('弾道を打球の角度で表す', () => {
    // **打球が下に飛ぶことは無い。** 1は水平から始める
    expect(trajectoryAngle(1)).toBe(0)
    expect(trajectoryAngle(3)).toBe(45)
    expect(trajectoryAngle(4)).toBe(65)
  })

  it('弾道が上がるほど角度も上がる', () => {
    for (let value = 1; value < 4; value++) {
      expect(trajectoryAngle(value + 1)).toBeGreaterThan(trajectoryAngle(value))
    }
  })

  it('真上には向けない（真上はポップフライで良い打球ではない）', () => {
    expect(trajectoryAngle(4)).toBeLessThan(90)
  })

  it('範囲外でも落ちない', () => {
    expect(trajectoryAngle(0)).toBe(0)
  })
})

describe('overallRating', () => {
  it('野手・投手ともに0〜100に収まる', () => {
    const rng = createRng(2026)
    for (let i = 0; i < 200; i++) {
      const player = createPlayer(rng, { id: `p${i}`, grade: 2 })
      const rating = overallRating(player)
      expect(rating).toBeGreaterThanOrEqual(0)
      expect(rating).toBeLessThanOrEqual(100)
    }
  })

  it('能力が高い選手ほど評価が高い', () => {
    const rng = createRng(7)
    const weak = createPlayer(rng, { id: 'weak', grade: 1, isPitcher: false, talentBonus: -15 })
    const strong = createPlayer(rng, { id: 'strong', grade: 3, isPitcher: false, talentBonus: 30 })
    expect(overallRating(strong)).toBeGreaterThan(overallRating(weak))
  })
})

describe('velocityRank', () => {
  /**
   * **高校生の物差し。** 物理の尺度（`velocityScore`）でランクを付けていた頃は、
   * S（160km/h以上）に構造上ほぼ誰も届かず、
   * 高校生の球速はどれだけ鍛えてもD〜Bの帯に固まっていた。
   */
  it('5km/h ごとに1ランク上がる', () => {
    expect(velocityRank(119)).toBe('G')
    expect(velocityRank(120)).toBe('F')
    expect(velocityRank(125)).toBe('E')
    expect(velocityRank(130)).toBe('D')
    expect(velocityRank(135)).toBe('C')
    expect(velocityRank(140)).toBe('B')
    expect(velocityRank(145)).toBe('A')
    expect(velocityRank(150)).toBe('S')
    expect(velocityRank(160)).toBe('S')
  })

  it('境界の1km/h手前は下のランクのまま', () => {
    for (const km of [124, 129, 134, 139, 144, 149]) {
      expect(velocityRank(km)).not.toBe(velocityRank(km + 1))
    }
  })

  it('プロの物差しでは、同じ球速がひとつ下の帯になる', () => {
    // 球速そのものは落ちない。変わるのは比べる相手のほう
    expect(proVelocityRank(150)).toBe('B')
    expect(proVelocityRank(155)).toBe('A')
    expect(proVelocityRank(160)).toBe('S')
    expect(proVelocityRank(140)).toBe('D')

    for (let km = 120; km <= 165; km++) {
      // 高校生の物差しのほうが必ず甘い（同じか上のランクになる）
      expect(RANK_ORDER.indexOf(velocityRank(km))).toBeLessThanOrEqual(
        RANK_ORDER.indexOf(proVelocityRank(km)),
      )
    }
  })

  it('表示のランクと物差しが一致する（画面と判定でずれない）', () => {
    for (let km = 100; km <= 170; km++) {
      expect(velocityRank(km)).toBe(toRank(velocityGrade(km)))
      expect(proVelocityRank(km)).toBe(toRank(velocityScore(km)))
    }
  })

  it('球速が上がるほど尺度も上がる', () => {
    for (let km = 100; km < 170; km++) {
      expect(velocityScore(km + 1)).toBeGreaterThanOrEqual(velocityScore(km))
    }
    expect(velocityScore(200)).toBe(100)
    expect(velocityScore(50)).toBe(0)
  })

  it('上限まで育てればSに届く', () => {
    // 届かない最高ランクは、無いのと同じ
    expect(velocityRank(VELOCITY_MAX)).toBe('S')
  })
})

describe('投手の総合', () => {
  const base: PitchingAbilities = {
    velocity: 140,
    control: 60,
    stamina: 60,
    life: 60,
    sharpness: 60,
    pitches: [{ direction: 'left', name: 'スライダー', level: 2 }],
  }

  it('ノビとキレも総合に効く', () => {
    expect(pitchingRating({ ...base, life: 90 })).toBeGreaterThan(pitchingRating(base))
    expect(pitchingRating({ ...base, sharpness: 90 })).toBeGreaterThan(pitchingRating(base))
  })

  it('球種が多いほど総合が高い', () => {
    // 3球種を持つ投手と、スライダー1本の投手が同じ総合で並んではいけない
    const rich: PitchingAbilities = {
      ...base,
      pitches: [
        { direction: 'left', name: 'スライダー', level: 2 },
        { direction: 'down', name: 'フォーク', level: 2 },
        { direction: 'lowerLeft', name: 'カーブ', level: 2 },
      ],
    }
    expect(pitchingRating(rich)).toBeGreaterThan(pitchingRating(base))
  })

  it('変化量が大きいほど総合が高い', () => {
    const sharp: PitchingAbilities = {
      ...base,
      pitches: [{ direction: 'left', name: 'スライダー', level: 6 }],
    }
    expect(pitchingRating(sharp)).toBeGreaterThan(pitchingRating(base))
  })

  it('持ち球ぶんの上乗せには上限がある（集めただけで総合は跳ね上がらない）', () => {
    const everything: PitchingAbilities = {
      ...base,
      pitches: PITCH_DIRECTION_ORDER.map((direction) => ({
        direction,
        name: direction,
        level: 7,
      })),
    }
    expect(pitchingRating(everything) - pitchingRating(base)).toBeLessThanOrEqual(6)
  })
})

describe('評価点', () => {
  /** 能力値だけを指定した野手を作る */
  function withAbilities(values: Partial<BattingAbilities>): Player {
    const base = createPlayer(createRng(1), { id: 'x', grade: 3, isPitcher: false })
    return {
      ...base,
      batting: {
        trajectory: 2,
        meet: 60,
        power: 60,
        speed: 60,
        arm: 60,
        fielding: 60,
        catching: 60,
        ...values,
      },
      skills: [],
    }
  }

  it('高い能力ほど1点の値打ちが上がる', () => {
    // G×1 → S×2.5。同じ「+10」でも、上の帯のほうがずっと大きい
    expect(abilityPoints(20)).toBe(20)
    expect(abilityPoints(60)).toBe(90)
    expect(abilityPoints(90)).toBe(225)
  })

  it('一芸に突き抜けた選手が、オールCより高く出る', () => {
    // **これが総合（加重平均）ではできなかったこと。**
    // ミートとパワーがSで他がGの選手は、平均で測るとオールCより下になる
    const allC = withAbilities({})
    const specialist = withAbilities({
      meet: 90,
      power: 90,
      speed: 20,
      arm: 20,
      fielding: 20,
      catching: 20,
    })

    expect(overallRating(specialist)).toBeLessThan(overallRating(allC))
    expect(playerPoints(specialist)).toBeGreaterThan(playerPoints(allC))
  })

  it('弾道が高いほうが少しだけ高く出る', () => {
    const flat = withAbilities({ trajectory: 1 })
    const arch = withAbilities({ trajectory: 4 })
    expect(playerPoints(arch)).toBeGreaterThan(playerPoints(flat))
    // ただし能力ひとつぶんの差にはならない
    expect(playerPoints(arch) - playerPoints(flat)).toBeLessThan(50)
  })

  it('投手は持ち球の数と変化量も評価に入る', () => {
    const base = createPlayer(createRng(3), { id: 'p', grade: 3, isPitcher: true })
    const rich: Player = {
      ...base,
      pitching: {
        ...base.pitching!,
        pitches: [
          { direction: 'left', name: 'スライダー', level: 5 },
          { direction: 'down', name: 'フォーク', level: 5 },
          { direction: 'lowerLeft', name: 'カーブ', level: 4 },
        ],
      },
    }
    const poor: Player = {
      ...base,
      pitching: { ...base.pitching!, pitches: [{ direction: 'left', name: 'スライダー', level: 1 }] },
    }

    expect(playerPoints(rich)).toBeGreaterThan(playerPoints(poor))
  })

  it('ランクの境界は「全能力がそのランクちょうど」に合わせてある', () => {
    const at = (value: number) =>
      pointsRank(playerPoints(withAbilities({ meet: value, power: value, speed: value, arm: value, fielding: value, catching: value, trajectory: 1 })))

    expect(at(90)).toBe('S')
    expect(at(85)).toBe('A')
    expect(at(70)).toBe('B')
    expect(at(60)).toBe('C')
    expect(at(50)).toBe('D')
    expect(at(40)).toBe('E')
    expect(at(25)).toBe('F')
    expect(at(15)).toBe('G')
  })
})

describe('評価の優先順', () => {
  /**
   * **重みの並びが仕様そのもの。**
   * 「パワー＝ミート＞守備＞走力＞捕球＞肩力＞弾道」のような順序は、
   * 数字を触ったときにいちばん壊れやすいので縛っておく。
   */
  function withAbilities(values: Partial<BattingAbilities>): Player {
    const base = createPlayer(createRng(1), { id: 'x', grade: 3, isPitcher: false })
    return {
      ...base,
      batting: {
        trajectory: 2,
        meet: 60,
        power: 60,
        speed: 60,
        arm: 60,
        fielding: 60,
        catching: 60,
        ...values,
      },
      skills: [],
    }
  }

  it('野手は パワー＝ミート ＞ 守備 ＞ 走力 ＞ 捕球 ＞ 肩力 ＞ 弾道 の順で効く', () => {
    const flat = withAbilities({})
    const gain = (key: keyof BattingAbilities) =>
      playerPoints(withAbilities({ [key]: 75 })) - playerPoints(flat)

    expect(gain('power')).toBe(gain('meet'))
    expect(gain('meet')).toBeGreaterThan(gain('fielding'))
    expect(gain('fielding')).toBeGreaterThan(gain('speed'))
    expect(gain('speed')).toBeGreaterThan(gain('catching'))
    expect(gain('catching')).toBeGreaterThan(gain('arm'))

    // 弾道はいちばん軽い能力より軽い
    const trajectoryGain = playerPoints(withAbilities({ trajectory: 3 })) - playerPoints(flat)
    expect(trajectoryGain).toBeLessThan(gain('arm'))
    expect(trajectoryGain).toBeGreaterThan(0)
  })

  it('投手は 球速 ＞ 制球 ＞ 変化量 ＞ キレ ＞ ノビ ＞ 球種 ＞ スタミナ の順に重い', () => {
    // 重み（同じ値・同じ伸びを与えたときの効き）で見る
    const weights = PITCHER_WEIGHTS
    expect(weights.velocity).toBeGreaterThan(weights.control)
    expect(weights.control).toBeGreaterThan(weights.breakAmount)
    expect(weights.breakAmount).toBeGreaterThan(weights.sharpness)
    expect(weights.sharpness).toBeGreaterThan(weights.life)
    expect(weights.life).toBeGreaterThan(weights.variety)
    expect(weights.variety).toBeGreaterThan(weights.stamina)

    // 重みの合計は1。野手と同じ土俵で比べるため
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('変化量は「平均」で見る（曲がらない球を増やしても上がらない）', () => {
    expect(breakAmountScore([{ direction: 'left', name: 'ス', level: 5 }])).toBeGreaterThan(
      breakAmountScore([
        { direction: 'left', name: 'ス', level: 5 },
        { direction: 'down', name: 'フ', level: 1 },
      ]),
    )
    // 球種の数は別に数える
    expect(varietyScore([{ direction: 'left', name: 'ス', level: 5 }])).toBeLessThan(
      varietyScore([
        { direction: 'left', name: 'ス', level: 5 },
        { direction: 'down', name: 'フ', level: 1 },
      ]),
    )
  })
})
