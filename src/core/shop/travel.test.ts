import { describe, expect, it } from 'vitest'
import { findRegion, REGIONS, travelDistance } from '@/core/types/region'
import type { Tournament, TournamentKind } from '@/core/types/tournament'
import { tournamentPrize } from './funds'
import {
  distanceToNationalVenue,
  friendlyTravelCost,
  FRIENDLY_TRAVEL_MAX_DISTANCE,
  tournamentTravel,
} from './travel'

describe('travelDistance', () => {
  it('同じ地方なら0（地元扱い）', () => {
    expect(travelDistance(findRegion('kanagawa'), findRegion('chiba'))).toBe(0)
    expect(travelDistance(findRegion('osaka'), findRegion('hyogo'))).toBe(0)
  })

  it('左右対称で、自分自身とは0', () => {
    const a = findRegion('aomori')
    const b = findRegion('kochi')
    expect(travelDistance(a, b)).toBe(travelDistance(b, a))
    expect(travelDistance(a, a)).toBe(0)
  })

  it('地方をまたげば必ず距離がある（海を渡る中国↔四国も含む）', () => {
    expect(travelDistance(findRegion('okayama'), findRegion('kagawa'))).toBeGreaterThan(0)
  })

  it('遠いほど大きい', () => {
    const venue = findRegion('hyogo')
    const kinki = travelDistance(findRegion('nara'), venue)
    const kanto = travelDistance(findRegion('kanagawa'), venue)
    const hokkaido = travelDistance(findRegion('minami-hokkaido'), venue)
    const okinawa = travelDistance(findRegion('okinawa'), venue)

    expect(kinki).toBeLessThan(kanto)
    expect(kanto).toBeLessThan(hokkaido)
    expect(hokkaido).toBeLessThan(okinawa)
  })

  it('全ての地区に地方が設定されている', () => {
    const venue = findRegion('hyogo')
    for (const region of REGIONS) {
      expect(Number.isFinite(distanceToNationalVenue(region))).toBe(true)
      expect(travelDistance(region, venue)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('tournamentTravel', () => {
  it('地区大会は宿泊せず、試合数ぶんの交通費だけ', () => {
    const one = tournamentTravel('summerPref', findRegion('kanagawa'), 1)
    const eight = tournamentTravel('summerPref', findRegion('kanagawa'), 8)

    expect(one.nights).toBe(0)
    expect(one.grant).toBe(0)
    expect(eight.cost).toBe(one.cost * 8)
  })

  it('地区大会の費用は所在地で変わらない（県内だから）', () => {
    const near = tournamentTravel('autumnPref', findRegion('hyogo'), 3)
    const far = tournamentTravel('autumnPref', findRegion('okinawa'), 3)
    expect(near.cost).toBe(far.cost)
  })

  it('全国大会は遠いほど高い', () => {
    const kanto = tournamentTravel('nationals', findRegion('kanagawa'), 3)
    const okinawa = tournamentTravel('nationals', findRegion('okinawa'), 3)
    expect(okinawa.cost).toBeGreaterThan(kanto.cost)
  })

  it('会場が地元（近畿）なら通いなので泊まらない', () => {
    const home = tournamentTravel('nationals', findRegion('osaka'), 5)
    expect(home.distance).toBe(0)
    expect(home.nights).toBe(0)
    expect(home.cost).toBe(0)
  })

  it('勝ち進むほど宿泊費がかさむ', () => {
    const region = findRegion('kanagawa')
    expect(tournamentTravel('nationals', region, 5).cost).toBeGreaterThan(
      tournamentTravel('nationals', region, 1).cost,
    )
  })

  it('全国大会だけ遠征補助が出る', () => {
    expect(tournamentTravel('nationals', findRegion('kanagawa'), 1).grant).toBeGreaterThan(0)
    expect(tournamentTravel('summerPref', findRegion('kanagawa'), 1).grant).toBe(0)
  })
})

/** 賞金と遠征費の釣り合いを見るためのダミー大会 */
function makeTournament(kind: TournamentKind, wins: number, champion: boolean): Tournament {
  const results = Array.from({ length: wins }, (_, index) => ({
    round: index + 1,
    roundName: `${index + 1}回戦`,
    opponentName: '相手',
    scoreFor: 3,
    scoreAgainst: 1,
    won: true,
  }))
  if (!champion) {
    results.push({
      round: wins + 1,
      roundName: `${wins + 1}回戦`,
      opponentName: '相手',
      scoreFor: 1,
      scoreAgainst: 3,
      won: false,
    })
  }
  return {
    kind,
    name: 'テスト大会',
    entrants: 49,
    totalRounds: 6,
    round: wins + 1,
    eliminated: !champion,
    draw: [],
    champion,
    results,
  }
}

describe('賞金と遠征費の釣り合い', () => {
  /** 大会1つぶんの収支 */
  function balance(kind: TournamentKind, regionId: string, wins: number, champion: boolean) {
    const tournament = makeTournament(kind, wins, champion)
    const travel = tournamentTravel(kind, findRegion(regionId), tournament.results.length)
    return tournamentPrize(tournament) + travel.grant - travel.cost
  }

  it('全国大会は初戦敗退でも大赤字にはならない', () => {
    // 補助のおかげで、近い地区なら黒字、遠い地区でも月の部費数ヶ月ぶんに収まる
    expect(balance('nationals', 'kanagawa', 0, false)).toBeGreaterThan(0)
    expect(balance('nationals', 'okinawa', 0, false)).toBeGreaterThan(-100_000)
  })

  it('全国大会は勝ち進むほど収支が良くなる（勝つのが損にならない）', () => {
    const one = balance('nationals', 'kanagawa', 1, false)
    const three = balance('nationals', 'kanagawa', 3, false)
    expect(three).toBeGreaterThan(one)
  })

  it('どの地区でも全国優勝すれば黒字になる', () => {
    for (const region of REGIONS) {
      expect(balance('nationals', region.id, 6, true)).toBeGreaterThan(0)
    }
  })

  it('地区大会を勝ち抜けば交通費を上回る賞金が出る', () => {
    expect(balance('summerPref', 'kanagawa', 8, true)).toBeGreaterThan(0)
    expect(balance('summerPref', 'tottori', 5, true)).toBeGreaterThan(0)
  })
})

describe('friendlyTravelCost', () => {
  it('遠いほど高く、距離0なら無料', () => {
    expect(friendlyTravelCost(0)).toBe(0)
    expect(friendlyTravelCost(6)).toBeGreaterThan(friendlyTravelCost(3))
  })

  it('日帰り圏の上限でも、大会の遠征費よりはずっと安い', () => {
    const friendly = friendlyTravelCost(FRIENDLY_TRAVEL_MAX_DISTANCE)
    const nationals = tournamentTravel('nationals', findRegion('kanagawa'), 1).cost
    expect(friendly).toBeLessThan(nationals)
  })
})
