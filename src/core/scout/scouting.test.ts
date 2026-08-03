import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { findSkill } from '@/core/skill/skillDefs'
import { findRegion } from '@/core/types/region'
import { REPUTATION_INITIAL } from '@/core/types/season'
import { scoutTripCost } from '@/core/shop/travel'
import {
  createProspects,
  MAX_APPROACHES,
  PROSPECTS_PER_REGION,
  prospectSkillName,
  successChance,
} from './scouting'
import type { Prospect } from './scouting'
import { createTraits } from './scoutTraits'
import type { ScoutTrait } from './scoutTraits'

function make(values: Partial<Prospect> = {}): Prospect {
  return {
    id: 'sc1',
    name: '候補 選手',
    position: 'SS',
    isPitcher: false,
    rating: 50,
    regionId: 'kanagawa',
    approaches: 0,
    skillId: null,
    junior: { team: '中央中学校', best: '県大会出場', batting: null, pitching: null },
    ...values,
  }
}

function generate(
  seed: number,
  reputation = REPUTATION_INITIAL,
  trait: ScoutTrait = 'contact',
): Prospect[] {
  return createProspects(createRng(seed), {
    reputation,
    regionId: 'kanagawa',
    trait,
    year: 1,
    serial: 0,
  })
}

const average = (list: Prospect[]) =>
  list.reduce((total, p) => total + p.rating, 0) / list.length

describe('候補の顔ぶれ', () => {
  it('1つの県で決まった人数が挙がる', () => {
    expect(generate(1)).toHaveLength(PROSPECTS_PER_REGION)
  })

  it('素質の高い順に並ぶ（10人を素のまま出すと読めない）', () => {
    const list = generate(2)
    for (let i = 1; i < list.length; i++) {
      expect(list[i].rating).toBeLessThanOrEqual(list[i - 1].rating)
    }
  })

  it('評判が高いほど素質の高い選手が挙がる', () => {
    expect(average(generate(3, 95))).toBeGreaterThan(average(generate(3, REPUTATION_INITIAL)))
  })

  it('同姓同名が並ばない', () => {
    const list = generate(7, 95)
    expect(new Set(list.map((p) => p.name)).size).toBe(list.length)
  })

  it('県が違えば id が重複しない', () => {
    const a = createProspects(createRng(5), {
      reputation: 50,
      regionId: 'kanagawa',
      trait: 'contact',
      year: 1,
      serial: 0,
    })
    const b = createProspects(createRng(5), {
      reputation: 50,
      regionId: 'osaka',
      trait: 'contact',
      year: 1,
      serial: 1,
    })

    expect(new Set([...a, ...b].map((p) => p.id)).size).toBe(a.length + b.length)
  })

  it('JSONに変換できる（セーブデータに入れられる）', () => {
    const list = generate(9)
    expect(JSON.parse(JSON.stringify(list))).toEqual(list)
  })
})

describe('県ごとの傾向', () => {
  it('投手王国では投手の比率が上がる', () => {
    let pitching = 0
    let normal = 0

    for (let seed = 0; seed < 20; seed++) {
      pitching += generate(seed, 50, 'pitching').filter((p) => p.isPitcher).length
      normal += generate(seed, 50, 'contact').filter((p) => p.isPitcher).length
    }

    expect(pitching).toBeGreaterThan(normal)
  })

  it('素材型の県は素質が高い', () => {
    let raw = 0
    let plain = 0

    for (let seed = 0; seed < 20; seed++) {
      raw += average(generate(seed, 50, 'raw'))
      plain += average(generate(seed, 50, 'contact'))
    }
    expect(raw).toBeGreaterThan(plain)
  })

  it('傾向は全県ぶん決まり、JSONに入れられる', () => {
    const traits = createTraits(createRng(11))
    expect(Object.keys(traits).length).toBeGreaterThan(40)
    expect(JSON.parse(JSON.stringify(traits))).toEqual(traits)
  })
})

describe('中学の成績', () => {
  it('投手には投手成績、野手には打撃成績が付く', () => {
    for (const prospect of generate(4, 70)) {
      if (prospect.isPitcher) {
        expect(prospect.junior.pitching).not.toBeNull()
        expect(prospect.junior.batting).toBeNull()
      } else {
        expect(prospect.junior.batting).not.toBeNull()
        expect(prospect.junior.pitching).toBeNull()
      }
    }
  })

  it('素質が高い選手ほど中学での到達点も上になる', () => {
    const ranks = [
      '地区大会1回戦敗退',
      '地区大会ベスト8',
      '県大会出場',
      '県大会ベスト4',
      '県大会優勝',
      '全国大会出場',
      '全国大会ベスト8',
      '全国大会優勝',
    ]
    let top = 0
    let bottom = 0

    for (let seed = 0; seed < 20; seed++) {
      const list = generate(seed, 70)
      top += ranks.indexOf(list[0].junior.best)
      bottom += ranks.indexOf(list[list.length - 1].junior.best)
    }

    expect(top).toBeGreaterThan(bottom)
  })

  it('素質の高い投手ほど球速が出ている', () => {
    let fast = 0
    let fastCount = 0
    let slow = 0
    let slowCount = 0

    for (let seed = 0; seed < 40; seed++) {
      for (const p of generate(seed, 90)) {
        if (!p.junior.pitching) continue
        if (p.rating >= 60) {
          fast += p.junior.pitching.velocity
          fastCount += 1
        } else {
          slow += p.junior.pitching.velocity
          slowCount += 1
        }
      }
    }

    expect(fastCount).toBeGreaterThan(0)
    expect(slowCount).toBeGreaterThan(0)
    expect(fast / fastCount).toBeGreaterThan(slow / slowCount)
  })
})

describe('successChance', () => {
  it('弱小校では見込みがほとんど無い', () => {
    expect(successChance(make(), REPUTATION_INITIAL)).toBeLessThan(0.12)
  })

  it('評判が上がると見込みも上がる', () => {
    expect(successChance(make(), 90)).toBeGreaterThan(
      successChance(make(), REPUTATION_INITIAL),
    )
  })

  it('会いに行くほど見込みが上がる', () => {
    expect(successChance(make({ approaches: MAX_APPROACHES }), 60)).toBeGreaterThan(
      successChance(make({ approaches: 1 }), 60),
    )
  })

  it('素質が高い選手ほど獲りにくい', () => {
    expect(successChance(make({ rating: 80 }), 60)).toBeLessThan(
      successChance(make({ rating: 40 }), 60),
    )
  })

  it('確率としてありえない値は返さない', () => {
    expect(successChance(make({ rating: 85 }), 0)).toBeGreaterThan(0)
    expect(
      successChance(make({ rating: 20, approaches: MAX_APPROACHES }), 100),
    ).toBeLessThanOrEqual(1)
  })
})

describe('出張費', () => {
  const home = findRegion('kanagawa')

  it('遠いほど高い', () => {
    expect(scoutTripCost(home, findRegion('okinawa'))).toBeGreaterThan(
      scoutTripCost(home, findRegion('osaka')),
    )
    expect(scoutTripCost(home, findRegion('osaka'))).toBeGreaterThan(
      scoutTripCost(home, findRegion('chiba')),
    )
  })

  it('地元でも0円ではない（視察には必ず費用がかかる）', () => {
    expect(scoutTripCost(home, findRegion('kanagawa'))).toBeGreaterThan(0)
  })

  it('弱小校の月の部費（16,000円）では遠くへ行けない', () => {
    // 「弱小校のうちは地元近辺しかまわれない」を数字で押さえておく
    expect(scoutTripCost(home, findRegion('kanagawa'))).toBeLessThanOrEqual(16_000)
    expect(scoutTripCost(home, findRegion('okinawa'))).toBeGreaterThan(50_000)
  })
})

describe('触れ込みの特殊能力', () => {
  it('赤特（不利な能力）は付かない', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const prospect of generate(seed, 95)) {
        if (!prospect.skillId) continue
        expect(findSkill(prospect.skillId)!.rank).not.toBe('red')
      }
    }
  })

  it('投手には投手用、野手には野手用が付く', () => {
    for (const prospect of generate(42, 90)) {
      if (!prospect.skillId) continue
      expect(findSkill(prospect.skillId)!.forPitcher).toBe(prospect.isPitcher)
    }
  })

  it('表示名を取り出せる', () => {
    const withSkill = generate(42, 90).find((p) => p.skillId !== null)
    if (withSkill) expect(prospectSkillName(withSkill)).toBeTruthy()
    expect(prospectSkillName(make())).toBeNull()
  })
})
