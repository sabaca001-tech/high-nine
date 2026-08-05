import { describe, expect, it } from 'vitest'
import { findRegion, REGIONS, regionStrength, roundsFor } from '@/core/types/region'
import { isTournamentOver, roundName } from '@/core/types/tournament'
import {
  applyRoundResult,
  createTournament,
  opponentStrengthFor,
  reputationGain,
} from './tournament'

const KANAGAWA = findRegion('kanagawa') // 178校
const TOTTORI = findRegion('tottori') // 24校

describe('地区データ', () => {
  it('49地区あり、idが重複しない', () => {
    expect(REGIONS).toHaveLength(49)
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(49)
  })

  it('参加校数はすべて正の値', () => {
    for (const region of REGIONS) {
      expect(region.schools).toBeGreaterThan(0)
    }
  })
})

describe('roundsFor', () => {
  it('参加校が多いほど回戦数が増える', () => {
    expect(roundsFor(178)).toBeGreaterThan(roundsFor(24))
  })

  it('トーナメントとして辻褄が合う（2^回戦数 >= 参加校数）', () => {
    for (const region of REGIONS) {
      const rounds = roundsFor(region.schools)
      expect(2 ** rounds).toBeGreaterThanOrEqual(region.schools)
      expect(2 ** (rounds - 1)).toBeLessThan(region.schools)
    }
  })

  it('神奈川は8回戦、鳥取は5回戦', () => {
    expect(roundsFor(KANAGAWA.schools)).toBe(8)
    expect(roundsFor(TOTTORI.schools)).toBe(5)
  })
})

describe('春の全国大会', () => {
  it('32校・5回戦制', () => {
    const t = createTournament('springNationals', KANAGAWA)
    expect(t.entrants).toBe(32)
    expect(t.totalRounds).toBe(5)
    expect(t.name).toBe('春の全国大会')
  })

  it('地区の激戦度は影響しない（全地区の代表が集まるため）', () => {
    const inKanagawa = createTournament('springNationals', KANAGAWA)
    const inTottori = createTournament('springNationals', TOTTORI)
    expect(opponentStrengthFor(inKanagawa, KANAGAWA)).toBe(
      opponentStrengthFor(inTottori, TOTTORI),
    )
  })

  it('夏の全国大会より少し易しい', () => {
    expect(opponentStrengthFor(createTournament('springNationals', TOTTORI), TOTTORI)).toBeLessThan(
      opponentStrengthFor(createTournament('nationals', TOTTORI), TOTTORI),
    )
  })
})

describe('createTournament', () => {
  it('地区によって回戦数が変わる', () => {
    const big = createTournament('summerPref', KANAGAWA)
    const small = createTournament('summerPref', TOTTORI)

    expect(big.entrants).toBe(178)
    expect(big.totalRounds).toBe(8)
    expect(small.entrants).toBe(24)
    expect(small.totalRounds).toBe(5)
    expect(big.totalRounds).toBeGreaterThan(small.totalRounds)
  })

  it('名前に地区名が入る（全国大会を除く）', () => {
    expect(createTournament('summerPref', KANAGAWA).name).toContain('神奈川')
    expect(createTournament('nationals', KANAGAWA).name).toBe('夏の全国大会')
  })

  it('全国大会は49校', () => {
    expect(createTournament('nationals', TOTTORI).entrants).toBe(49)
  })

  it('秋季大会は夏より小規模', () => {
    const summer = createTournament('summerPref', KANAGAWA)
    const autumn = createTournament('autumnPref', KANAGAWA)
    expect(autumn.entrants).toBeLessThan(summer.entrants)
    expect(autumn.totalRounds).toBeLessThan(summer.totalRounds)
  })

  it('開始時は1回戦・未敗退・未優勝', () => {
    const t = createTournament('summerPref', KANAGAWA)
    expect(t.round).toBe(1)
    expect(t.eliminated).toBe(false)
    expect(t.champion).toBe(false)
    expect(isTournamentOver(t)).toBe(false)
  })
})

describe('opponentStrengthFor', () => {
  it('勝ち進むほど相手が強くなる', () => {
    let t = createTournament('summerPref', KANAGAWA)
    const first = opponentStrengthFor(t, KANAGAWA)

    for (let i = 0; i < t.totalRounds - 1; i++) {
      t = applyRoundResult(t, {
        opponentName: 'X',
        scoreFor: 1,
        scoreAgainst: 0,
        won: true,
      })
    }
    expect(opponentStrengthFor(t, KANAGAWA)).toBeGreaterThan(first)
  })

  it('激戦区ほど相手が強い', () => {
    const big = createTournament('summerPref', KANAGAWA)
    const small = createTournament('summerPref', TOTTORI)
    expect(opponentStrengthFor(big, KANAGAWA)).toBeGreaterThan(
      opponentStrengthFor(small, TOTTORI),
    )
    expect(regionStrength(KANAGAWA)).toBeGreaterThan(regionStrength(TOTTORI))
  })

  it('全国大会は地区大会より強い', () => {
    const pref = createTournament('summerPref', TOTTORI)
    const nationals = createTournament('nationals', TOTTORI)
    expect(opponentStrengthFor(nationals, TOTTORI)).toBeGreaterThan(
      opponentStrengthFor(pref, TOTTORI),
    )
  })

  it('1回戦は格下（マイナス補正）になる地区がある', () => {
    expect(opponentStrengthFor(createTournament('summerPref', TOTTORI), TOTTORI)).toBeLessThan(0)
  })
})

describe('applyRoundResult', () => {
  it('勝つと次の回戦へ進む', () => {
    const t = applyRoundResult(createTournament('summerPref', KANAGAWA), {
      opponentName: '青葉学院',
      scoreFor: 5,
      scoreAgainst: 2,
      won: true,
    })
    expect(t.round).toBe(2)
    expect(t.eliminated).toBe(false)
    expect(t.results).toHaveLength(1)
    expect(t.results[0].opponentName).toBe('青葉学院')
  })

  it('負けると敗退する', () => {
    const t = applyRoundResult(createTournament('summerPref', KANAGAWA), {
      opponentName: '北嶺高校',
      scoreFor: 1,
      scoreAgainst: 4,
      won: false,
    })
    expect(t.eliminated).toBe(true)
    expect(isTournamentOver(t)).toBe(true)
  })

  it('決勝に勝つと優勝', () => {
    let t = createTournament('summerPref', TOTTORI)
    for (let i = 0; i < t.totalRounds; i++) {
      t = applyRoundResult(t, { opponentName: 'X', scoreFor: 3, scoreAgainst: 1, won: true })
    }
    expect(t.champion).toBe(true)
    expect(isTournamentOver(t)).toBe(true)
    expect(t.results).toHaveLength(t.totalRounds)
    expect(t.results[t.totalRounds - 1].roundName).toBe('決勝')
  })

  it('元の大会状態を変更しない', () => {
    const t = createTournament('summerPref', KANAGAWA)
    applyRoundResult(t, { opponentName: 'X', scoreFor: 1, scoreAgainst: 0, won: true })
    expect(t.round).toBe(1)
    expect(t.results).toHaveLength(0)
  })
})

describe('roundName', () => {
  it('終盤は準々決勝・準決勝・決勝になる', () => {
    expect(roundName(8, 8)).toBe('決勝')
    expect(roundName(7, 8)).toBe('準決勝')
    expect(roundName(6, 8)).toBe('準々決勝')
    expect(roundName(1, 8)).toBe('1回戦')
  })
})

describe('reputationGain', () => {
  /**
   * 1勝ごとの評判は試合のたびに動く（matchReputation）ので、ここは優勝だけを見る。
   * 両方で勝ち数を数えると二重に加算される。
   */
  it('優勝するまでは0で、優勝した瞬間に入る', () => {
    let t = createTournament('summerPref', TOTTORI)

    for (let i = 0; i < t.totalRounds - 1; i++) {
      t = applyRoundResult(t, { opponentName: 'X', scoreFor: 2, scoreAgainst: 1, won: true })
      expect(reputationGain(t)).toBe(0)
    }

    t = applyRoundResult(t, { opponentName: 'X', scoreFor: 2, scoreAgainst: 1, won: true })
    expect(t.champion).toBe(true)
    expect(reputationGain(t)).toBeGreaterThan(0)
  })

  it('負けても評判は減らない', () => {
    const t = applyRoundResult(createTournament('summerPref', KANAGAWA), {
      opponentName: 'X',
      scoreFor: 0,
      scoreAgainst: 5,
      won: false,
    })
    expect(reputationGain(t)).toBeGreaterThanOrEqual(0)
  })

  it('全国優勝が最も大きい', () => {
    const champion = (kind: 'summerPref' | 'nationals', region = TOTTORI) => {
      let t = createTournament(kind, region)
      for (let i = 0; i < t.totalRounds; i++) {
        t = applyRoundResult(t, { opponentName: 'X', scoreFor: 2, scoreAgainst: 1, won: true })
      }
      return reputationGain(t)
    }
    expect(champion('nationals')).toBeGreaterThan(champion('summerPref'))
  })
})
