import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { SKILLS, findSkill, skillsFor } from './skillDefs'
import { skillBonus, skillsOf } from './skillEffects'
import { SKILL_TARGET_LABELS, SKILL_TARGET_UNIT } from '@/core/types/skill'
import type { Player } from '@/core/types/player'

const base = createInitialRoster(createRng(3)).find((p) => !p.isPitcher)!
const withSkills = (...ids: string[]): Player => ({ ...base, skills: ids })

describe('SKILLS', () => {
  it('idが重複しない', () => {
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length)
  })

  it('名前が重複しない', () => {
    expect(new Set(SKILLS.map((s) => s.name)).size).toBe(SKILLS.length)
  })

  it('投手用・野手用ともに各ランクが揃っている', () => {
    for (const forPitcher of [true, false]) {
      for (const rank of ['gold', 'blue', 'red'] as const) {
        expect(skillsFor({ forPitcher, rank }).length).toBeGreaterThan(0)
      }
    }
  })

  it('補正の向きがランクと矛盾しない', () => {
    for (const skill of SKILLS) {
      for (const effect of skill.effects ?? []) {
        // 被本塁打だけは「増えると悪い」ので向きが逆
        const good = effect.target === 'longball' ? -effect.amount : effect.amount
        if (skill.rank === 'red') expect(good).toBeLessThan(0)
        if (skill.rank === 'gold') expect(good).not.toBe(0)
      }
    }
  })

  it('金特は青特より効果が大きい', () => {
    const weight = (rank: 'gold' | 'blue') =>
      SKILLS.filter((s) => s.rank === rank).reduce(
        (sum, s) => sum + (s.effects ?? []).reduce((t, e) => t + Math.abs(e.amount), 0),
        0,
      ) / SKILLS.filter((s) => s.rank === rank).length

    expect(weight('gold')).toBeGreaterThan(weight('blue'))
  })

  it('補正の説明に必要なラベルが揃っている', () => {
    // 画面に「どこにどれくらい」を出すので、対応表に穴があってはいけない
    for (const skill of SKILLS) {
      for (const effect of skill.effects ?? []) {
        expect(SKILL_TARGET_LABELS[effect.target]).toBeTruthy()
        expect(SKILL_TARGET_UNIT[effect.target]).toBeTruthy()
      }
    }
  })

  it('効果を持たない特殊能力は無い', () => {
    // **説明だけあって試合では何も起きない**特殊能力が混ざっていた
    // （守備範囲拡大・レーザービーム・クイックなど）
    for (const skill of SKILLS) {
      expect(skill.effects ?? []).not.toHaveLength(0)
    }
  })
})

describe('skillBonus', () => {
  it('持っていなければ0', () => {
    expect(skillBonus(withSkills(), 'meet')).toBe(0)
  })

  it('常時の補正はいつでも効く', () => {
    expect(skillBonus(withSkills('power-hitter'), 'power')).toBe(8)
    expect(skillBonus(withSkills('power-hitter'), 'power', ['risp'])).toBe(8)
  })

  it('場面つきの補正は、その場面でだけ効く', () => {
    const clutch = withSkills('clutch-hitter')
    expect(skillBonus(clutch, 'meet')).toBe(0)
    expect(skillBonus(clutch, 'meet', ['risp'])).toBe(12)
    expect(skillBonus(clutch, 'meet', ['lateBehind'])).toBe(0)
  })

  it('複数の特殊能力は足し合わされる', () => {
    expect(skillBonus(withSkills('power-hitter', 'slugger'), 'power')).toBe(24)
  })

  it('プラスとマイナスは打ち消し合う', () => {
    expect(skillBonus(withSkills('contact-eye', 'chase-swing'), 'eye')).toBe(0)
  })

  it('別の対象には効かない', () => {
    expect(skillBonus(withSkills('power-hitter'), 'meet')).toBe(0)
  })

  it('知らないidは無視する', () => {
    expect(skillBonus(withSkills('存在しない'), 'meet')).toBe(0)
  })
})

describe('skillsOf', () => {
  it('定義のある特殊能力だけを返す', () => {
    const list = skillsOf(withSkills('power-hitter', '存在しない'))
    expect(list.map((s) => s.id)).toEqual(['power-hitter'])
  })

  it('findSkill で引ける', () => {
    expect(findSkill('slugger')?.name).toBe('アーチスト')
    expect(findSkill('存在しない')).toBeUndefined()
  })
})
