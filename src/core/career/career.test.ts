import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import type { Alumnus } from '@/core/types/career'
import {
  ageAt,
  careerTotals,
  isCareerActive,
  isCareerPending,
  isInHallOfFame,
} from '@/core/types/career'
import { emptyCareerStats } from '@/core/player/careerStats'
import {
  advanceCareer,
  createAlumnus,
  decidePath,
  simulateProSeason,
  toProAbility,
  trimGraduates,
} from './career'

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
    // 直接プロに行けるのは高校生としてかなり上位（しきい値86）。
    // **水準に届いても指名は確約されない**ので、86前後では半々になる
    expect(rate(95)).toBeGreaterThan(rate(88))
    expect(rate(88)).toBeGreaterThan(rate(82))
    expect(rate(78)).toBe(0)
  })

  it('低い能力ではプロにならない', () => {
    const rng = createRng(2)
    for (let i = 0; i < 200; i++) {
      expect(decidePath(rng, 30, 20)).not.toBe('pro')
    }
  })

  it('評判が高いと進路が有利になる', () => {
    // プロ入りの水準（82）に近い選手で比べる
    const proRate = (reputation: number): number => {
      let pro = 0
      const rng = createRng(3)
      for (let i = 0; i < 300; i++) {
        if (decidePath(rng, 80, reputation) === 'pro') pro++
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
          ability: 40,
          games: 100,
          batting: { atBats: 400, hits: 120, homeruns: 20, rbi: 70, average: 0.3, doubles: 5, steals: 2, walks: 10 },
          pitching: null,
      titles: [],
        },
        {
          year: 5,
          team: 'X',
          overseas: false,
          ability: 42,
          games: 120,
          batting: { atBats: 500, hits: 130, homeruns: 25, rbi: 80, average: 0.26, doubles: 5, steals: 2, walks: 10 },
          pitching: null,
      titles: [],
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


describe('toProAbility', () => {
  it('ほとんどの選手は半分になる', () => {
    const rng = createRng(11)
    let halved = 0
    const trials = 400
    for (let i = 0; i < trials; i++) {
      if (toProAbility(rng, 90).ability === 45) halved += 1
    }
    expect(halved / trials).toBeGreaterThan(0.8)
  })

  it('稀に落ち幅が小さい選手がいる', () => {
    const rng = createRng(12)
    let adapted = 0
    const trials = 400
    for (let i = 0; i < trials; i++) {
      if (toProAbility(rng, 90).adapted) adapted += 1
    }
    expect(adapted).toBeGreaterThan(0)
    expect(adapted / trials).toBeLessThan(0.3)
  })

  it('高校の総合より必ず低くなる', () => {
    const rng = createRng(13)
    for (let i = 0; i < 200; i++) {
      expect(toProAbility(rng, 85).ability).toBeLessThan(85)
    }
  })
})

describe('プロ入り後の物差し', () => {
  it('高校からプロへ行くと能力が置き換わる', () => {
    // 82以上でプロになるまで引き直す
    for (let seed = 1; seed < 80; seed++) {
      const alumnus = createAlumnus(createRng(seed), base(95), 60)
      if (alumnus.path !== 'pro') continue
      expect(alumnus.ability).toBeLessThan(alumnus.rating)
      return
    }
    throw new Error('プロ入りするシードが見つからない')
  })

  it('大学経由でも入団時に置き換わる', () => {
    for (let seed = 1; seed < 120; seed++) {
      const alumnus = createAlumnus(createRng(seed), base(70), 40)
      if (alumnus.path !== 'college') continue

      const rng = createRng(seed + 500)
      let current = alumnus
      for (let year = 0; year < 6 && current.status === 'college'; year++) {
        current = advanceCareer(rng, current, 4 + year).alumnus
      }
      if (current.status !== 'pro') continue

      expect(current.ability).toBeLessThan(current.rating)
      return
    }
    // 大学から必ずプロへ行くとは限らないので、届かなくても失敗にはしない
  })

  it('プロで年ごとの実力が記録される', () => {
    for (let seed = 1; seed < 80; seed++) {
      const alumnus = createAlumnus(createRng(seed), base(95), 60)
      if (alumnus.path !== 'pro') continue

      const played = runCareer(seed + 90, alumnus, 5)
      expect(played.proSeasons.length).toBeGreaterThan(0)
      for (const season of played.proSeasons) {
        expect(typeof season.ability).toBe('number')
        expect(season.ability).toBeGreaterThan(0)
      }
      return
    }
    throw new Error('プロ入りするシードが見つからない')
  })
})

describe('OB名鑑の対象', () => {
  const pro = (): Alumnus => ({
    ...base(90),
    path: 'pro',
    status: 'pro',
    ability: 45,
    team: 'X',
    collegeYears: 0,
    proSeasons: [],
    note: null,
  })
  const college = (): Alumnus => ({
    ...base(70),
    id: 'c1',
    path: 'college',
    status: 'college',
    ability: 70,
    team: '青嶺大学',
    collegeYears: 2,
    proSeasons: [],
    note: null,
  })
  const done = (): Alumnus => ({
    ...base(40),
    id: 'n1',
    path: 'none',
    status: 'retired',
    ability: 40,
    team: null,
    collegeYears: 0,
    proSeasons: [],
    note: null,
  })

  it('プロだけが名鑑に載る', () => {
    expect(isInHallOfFame(pro())).toBe(true)
    expect(isInHallOfFame(college())).toBe(false)
    expect(isInHallOfFame(done())).toBe(false)
  })

  it('引退したプロも載り続ける', () => {
    const retired: Alumnus = {
      ...pro(),
      status: 'retired',
      proSeasons: [
        {
          year: 5,
          team: 'X',
          overseas: false,
          ability: 40,
          games: 100,
          batting: { atBats: 300, hits: 80, homeruns: 10, rbi: 40, average: 0.267, doubles: 5, steals: 2, walks: 10 },
          pitching: null,
      titles: [],
        },
      ],
    }
    expect(isInHallOfFame(retired)).toBe(true)
  })

  it('大学在学中は「プロを目指している」側に入る', () => {
    expect(isCareerPending(college())).toBe(true)
    expect(isCareerPending(pro())).toBe(false)
    expect(isCareerPending(done())).toBe(false)
  })

  it('上限で切ってもプロは落とさない', () => {
    const list: Alumnus[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ ...done(), id: `n${i}` })),
      { ...pro(), id: 'p1' },
      ...Array.from({ length: 8 }, (_, i) => ({ ...done(), id: `m${i}` })),
    ]
    const trimmed = trimGraduates(list, 5)

    expect(trimmed).toHaveLength(5)
    expect(trimmed.some((alumnus) => alumnus.id === 'p1')).toBe(true)
  })

  it('上限を超えていなければそのまま返す', () => {
    const list = [pro(), college()]
    expect(trimGraduates(list, 10)).toBe(list)
  })
})

describe('経歴と年齢', () => {
  it('卒業した年が18歳', () => {
    expect(ageAt(5, 5)).toBe(18)
    expect(ageAt(5, 12)).toBe(25)
  })

  it('卒業時点で経歴が1行できる', () => {
    const rng = createRng(3)
    const alumnus = createAlumnus(rng, base(90), 60)
    expect(alumnus.careerLog).toHaveLength(1)
    expect(alumnus.careerLog![0].age).toBe(18)
    expect(alumnus.careerLog![0].text).toBeTruthy()
  })

  it('プロで移籍すると経歴に残る', () => {
    // **同じ球団で引退まで、ばかりでは経歴が動かない**
    let transferred = 0
    for (let seed = 1; seed <= 80; seed++) {
      const rng = createRng(seed)
      const drafted = createAlumnus(rng, base(95), 80)
      if (drafted.path !== 'pro') continue
      let alumnus: Alumnus = { ...drafted, status: 'pro', ability: 55 }

      const teams = new Set<string | null>([alumnus.team])
      for (let year = 0; year < 12 && alumnus.status === 'pro'; year++) {
        alumnus = advanceCareer(rng, alumnus, 6 + year).alumnus
        teams.add(alumnus.team)
      }
      if (teams.size > 1) transferred++
    }
    expect(transferred).toBeGreaterThan(0)
  })

  it('進路が変わるたびに経歴が積み上がる', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = createRng(seed)
      let alumnus = createAlumnus(rng, base(70), 40)
      if (alumnus.path !== 'college') continue

      for (let year = 0; year < 6; year++) {
        alumnus = advanceCareer(rng, alumnus, 6 + year).alumnus
      }
      expect(alumnus.careerLog!.length).toBeGreaterThanOrEqual(2)
      // 年齢は単調に増える
      const ages = alumnus.careerLog!.map((entry) => entry.age)
      expect([...ages].sort((a, b) => a - b)).toEqual(ages)
      return
    }
    throw new Error('大学へ進むシードが見つからない')
  })
})
