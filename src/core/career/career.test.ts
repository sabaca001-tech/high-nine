import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import type { Alumnus } from '@/core/types/career'
import { careerTotals, isCareerActive } from '@/core/types/career'
import { emptyCareerStats } from '@/core/player/careerStats'
import { advanceCareer, createAlumnus, decidePath, simulateProSeason } from './career'

function base(rating: number, isPitcher = false) {
  return {
    id: 'a1',
    name: 'テスト 一郎',
    isPitcher,
    position: (isPitcher ? 'P' : 'CF') as Alumnus['position'],
    year: 3,
    rating,
    skills: [],
    highSchool: emptyCareerStats(),
  }
}

/** 進路が止まるまで進める */
function runCareer(seed: number, alumnus: Alumnus, maxYears = 30): Alumnus {
  const rng = createRng(seed)
  let current = alumnus
  for (let year = 0; year < maxYears && isCareerActive(current); year++) {
    current = advanceCareer(rng, current, alumnus.year + year + 1).alumnus
  }
  return current
}

describe('decidePath', () => {
  it('能力が高いほどプロに近づく', () => {
    const rate = (rating: number): number => {
      let pro = 0
      const rng = createRng(1)
      for (let i = 0; i < 200; i++) {
        if (decidePath(rng, rating, 20) === 'pro') pro++
      }
      return pro / 200
    }
    // 直接プロに行けるのは高校生としてかなり上位（しきい値76前後）
    expect(rate(95)).toBeGreaterThan(rate(78))
    expect(rate(78)).toBeGreaterThan(rate(70))
  })

  it('低い能力ではプロにならない', () => {
    const rng = createRng(2)
    for (let i = 0; i < 200; i++) {
      expect(decidePath(rng, 30, 20)).not.toBe('pro')
    }
  })

  it('評判が高いと進路が有利になる', () => {
    const proRate = (reputation: number): number => {
      let pro = 0
      const rng = createRng(3)
      for (let i = 0; i < 300; i++) {
        if (decidePath(rng, 73, reputation) === 'pro') pro++
      }
      return pro / 300
    }
    expect(proRate(100)).toBeGreaterThan(proRate(0))
  })
})

describe('createAlumnus', () => {
  it('進路に応じた所属と状態になる', () => {
    for (let seed = 0; seed < 40; seed++) {
      const alumnus = createAlumnus(createRng(seed), base(70), 50)

      if (alumnus.path === 'pro') expect(alumnus.status).toBe('pro')
      if (alumnus.path === 'college') expect(alumnus.status).toBe('college')
      if (alumnus.path === 'corporate') expect(alumnus.status).toBe('corporate')
      if (alumnus.path === 'none') {
        expect(alumnus.status).toBe('retired')
        expect(alumnus.team).toBeNull()
      }
      if (alumnus.path !== 'none') expect(alumnus.team).not.toBeNull()
    }
  })

  it('卒業時の能力と特殊能力が残る', () => {
    const alumnus = createAlumnus(createRng(4), { ...base(80), skills: ['ace-heart'] }, 40)
    expect(alumnus.rating).toBe(80)
    expect(alumnus.skills).toEqual(['ace-heart'])
  })
})

describe('プロの進行', () => {
  function makePro(ability: number, isPitcher = false): Alumnus {
    return {
      ...base(ability, isPitcher),
      path: 'pro',
      status: 'pro',
      ability,
      team: '東京グランドス',
      collegeYears: 0,
      proSeasons: [],
      note: null,
    }
  }

  it('1年ごとに成績が1つ積み上がる', () => {
    const rng = createRng(11)
    let alumnus = makePro(75)
    for (let i = 0; i < 3; i++) {
      alumnus = advanceCareer(rng, alumnus, 4 + i).alumnus
    }
    expect(alumnus.proSeasons.length).toBeGreaterThanOrEqual(3)
    expect(alumnus.proSeasons[0].year).toBe(4)
  })

  it('野手には打撃成績、投手には投手成績が付く', () => {
    const batter = simulateProSeason(createRng(12), makePro(75, false), 5)
    const pitcher = simulateProSeason(createRng(12), makePro(75, true), 5)

    expect(batter.batting).not.toBeNull()
    expect(batter.pitching).toBeNull()
    expect(pitcher.pitching).not.toBeNull()
    expect(pitcher.batting).toBeNull()
  })

  it('成績が現実的な範囲に収まる', () => {
    for (let seed = 0; seed < 40; seed++) {
      const batter = simulateProSeason(createRng(seed), makePro(50 + (seed % 45)), 5)
      expect(batter.games).toBeGreaterThan(0)
      expect(batter.games).toBeLessThanOrEqual(143)
      expect(batter.batting!.average).toBeGreaterThanOrEqual(0.12)
      expect(batter.batting!.average).toBeLessThanOrEqual(0.38)
      expect(batter.batting!.hits).toBeLessThanOrEqual(batter.batting!.atBats)

      const pitcher = simulateProSeason(createRng(seed), makePro(50 + (seed % 45), true), 5)
      expect(pitcher.pitching!.era).toBeGreaterThanOrEqual(0.9)
      expect(pitcher.pitching!.era).toBeLessThanOrEqual(9.9)
    }
  })

  it('能力が高いほど良い成績になる', () => {
    const averageOf = (ability: number): number => {
      let total = 0
      for (let seed = 0; seed < 40; seed++) {
        total += simulateProSeason(createRng(seed), makePro(ability), 5).batting!.average
      }
      return total / 40
    }
    expect(averageOf(90)).toBeGreaterThan(averageOf(50))
  })

  it('いつかは必ず現役を終える', () => {
    for (let seed = 0; seed < 30; seed++) {
      const finished = runCareer(seed, makePro(80), 40)
      expect(isCareerActive(finished)).toBe(false)
      expect(finished.note).not.toBeNull()
    }
  })

  it('実力が落ちると戦力外か引退になる', () => {
    const finished = runCareer(21, makePro(46), 40)
    expect(['retired', 'corporate']).toContain(finished.status)
  })

  it('飛び抜けた選手は海外へ渡ることがある', () => {
    let found = false
    for (let seed = 0; seed < 60 && !found; seed++) {
      const rng = createRng(seed)
      let alumnus = makePro(95)
      for (let i = 0; i < 10 && isCareerActive(alumnus); i++) {
        const update = advanceCareer(rng, alumnus, 4 + i)
        alumnus = update.alumnus
        if (alumnus.status === 'mlb') found = true
      }
    }
    expect(found).toBe(true)
  })
})

describe('大学の進行', () => {
  function makeCollege(ability: number): Alumnus {
    return {
      ...base(ability),
      path: 'college',
      status: 'college',
      ability,
      team: '青嶺大学',
      collegeYears: 1,
      proSeasons: [],
      note: null,
    }
  }

  it('4年間は在学が続く', () => {
    const rng = createRng(31)
    let alumnus = makeCollege(65)
    for (let i = 0; i < 3; i++) {
      alumnus = advanceCareer(rng, alumnus, 4 + i).alumnus
      expect(alumnus.status).toBe('college')
    }
    expect(alumnus.collegeYears).toBe(4)
  })

  it('4年後に進路が分かれる', () => {
    const outcomes = new Set<string>()
    for (let seed = 0; seed < 40; seed++) {
      const rng = createRng(seed)
      let alumnus = makeCollege(50 + (seed % 30))
      for (let i = 0; i < 4; i++) {
        alumnus = advanceCareer(rng, alumnus, 4 + i).alumnus
      }
      outcomes.add(alumnus.status)
    }
    // 少なくとも2種類の進路に分かれる
    expect(outcomes.size).toBeGreaterThanOrEqual(2)
  })

  it('大学で伸びるとプロ入りできる', () => {
    let found = false
    for (let seed = 0; seed < 40 && !found; seed++) {
      const rng = createRng(seed)
      let alumnus = makeCollege(70)
      for (let i = 0; i < 4; i++) {
        alumnus = advanceCareer(rng, alumnus, 4 + i).alumnus
      }
      if (alumnus.status === 'pro') found = true
    }
    expect(found).toBe(true)
  })
})

describe('careerTotals', () => {
  it('通算成績を集計できる', () => {
    const alumnus: Alumnus = {
      ...base(80),
      path: 'pro',
      status: 'pro',
      ability: 80,
      team: 'X',
      collegeYears: 0,
      note: null,
      proSeasons: [
        {
          year: 4,
          team: 'X',
          overseas: false,
          games: 100,
          batting: { atBats: 400, hits: 120, homeruns: 20, rbi: 70, average: 0.3 },
          pitching: null,
        },
        {
          year: 5,
          team: 'X',
          overseas: false,
          games: 120,
          batting: { atBats: 500, hits: 130, homeruns: 25, rbi: 80, average: 0.26 },
          pitching: null,
        },
      ],
    }

    const totals = careerTotals(alumnus)
    expect(totals.years).toBe(2)
    expect(totals.games).toBe(220)
    expect(totals.hits).toBe(250)
    expect(totals.homeruns).toBe(45)
    expect(totals.average).toBeCloseTo(250 / 900, 3)
  })

  it('成績が無くても落ちない', () => {
    const totals = careerTotals({
      ...base(50),
      path: 'none',
      status: 'retired',
      ability: 50,
      team: null,
      collegeYears: 0,
      proSeasons: [],
      note: null,
    })
    expect(totals.years).toBe(0)
    expect(totals.average).toBe(0)
    expect(totals.era).toBe(0)
  })
})
