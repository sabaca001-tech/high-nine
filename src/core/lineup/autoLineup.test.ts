import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { LINEUP_SIZE } from '@/core/types/lineup'
import type { Player, Position } from '@/core/types/player'
import { ALL_POSITIONS, createAptitudes, defenseScore, isPlayable } from './aptitude'
import { overallRating } from '@/core/player/rating'
import { AUTO_LINEUP_PLANS, autoLineup, repairLineup, starterOf, validateLineup } from './autoLineup'
import { battingScore, onBaseScore, runningScore, sluggingScore } from './battingTraits'

describe('createAptitudes', () => {
  it('メインポジションは必ずS', () => {
    const rng = createRng(1)
    for (const position of ALL_POSITIONS) {
      expect(createAptitudes(rng, position)[position]).toBe('S')
    }
  })

  it('全ポジションぶんの適性が作られる', () => {
    const aptitudes = createAptitudes(createRng(2), 'SS')
    expect(Object.keys(aptitudes).sort()).toEqual([...ALL_POSITIONS].sort())
  })

  it('野手に投手適性はほとんど付かない', () => {
    const rng = createRng(3)
    for (let i = 0; i < 50; i++) {
      expect(isPlayable(createAptitudes(rng, 'CF').P)).toBe(false)
    }
  })

  it('内野手は他の内野も守れることが多い', () => {
    const rng = createRng(4)
    let playable = 0
    const trials = 100
    for (let i = 0; i < trials; i++) {
      if (isPlayable(createAptitudes(rng, 'SS')['2B'])) playable++
    }
    expect(playable / trials).toBeGreaterThan(0.6)
  })
})

describe('defenseScore', () => {
  it('適性が高い位置ほど守備力が高くなる', () => {
    const rng = createRng(5)
    const roster = createInitialRoster(rng)
    const fielder = roster.find((p) => !p.isPitcher && p.position === 'SS')
    if (!fielder) return

    expect(defenseScore(fielder, 'SS')).toBeGreaterThan(defenseScore(fielder, 'C'))
  })
})

describe('autoLineup', () => {
  it('9人・全ポジションが1人ずつ埋まる', () => {
    for (let seed = 0; seed < 20; seed++) {
      const roster = createInitialRoster(createRng(seed))
      const lineup = autoLineup(roster)

      expect(lineup.slots).toHaveLength(LINEUP_SIZE)
      const positions = lineup.slots.map((s) => s.position).sort()
      expect(positions).toEqual([...ALL_POSITIONS].sort())

      const ids = lineup.slots.map((s) => s.playerId)
      expect(new Set(ids).size).toBe(LINEUP_SIZE)
      expect(validateLineup(lineup, roster)).toEqual([])
    }
  })

  it('投手には投手が起用される', () => {
    for (let seed = 0; seed < 20; seed++) {
      const roster = createInitialRoster(createRng(seed))
      const lineup = autoLineup(roster)
      const starter = roster.find((p) => p.id === starterOf(lineup))
      expect(starter?.isPitcher).toBe(true)
    }
  })

  it('9番はスタメンで打力がいちばん低い選手', () => {
    // **投手を固定で最後に置くのはやめた。** たいていは投手が該当するが、
    // 打てる投手を9番に固定する理由は無い
    const roster = createInitialRoster(createRng(9))
    const lineup = autoLineup(roster)
    const byId = new Map(roster.map((p) => [p.id, p]))
    const bat = (id: string) => battingScore(byId.get(id)!)

    const last = bat(lineup.slots[LINEUP_SIZE - 1].playerId)
    for (const slot of lineup.slots.slice(0, LINEUP_SIZE - 1)) {
      expect(bat(slot.playerId)).toBeGreaterThanOrEqual(last)
    }
  })

  it('1番打者は走力が上位に入る', () => {
    // **走力最速とは限らない。** 出塁力も見るし、
    // 足の速い選手がチーム最高の打者なら3番・4番に取られる
    const roster = createInitialRoster(createRng(11))
    const lineup = autoLineup(roster)
    const speedOf = (id: string) => roster.find((p) => p.id === id)?.batting.speed ?? 0

    const speeds = lineup.slots.map((s) => speedOf(s.playerId)).sort((a, b) => b - a)
    const median = speeds[Math.floor(speeds.length / 2)]
    expect(speedOf(lineup.slots[0].playerId)).toBeGreaterThan(median)
  })

  it('部員がちょうど9人でも成立する', () => {
    const roster = createInitialRoster(createRng(12), 3)
    expect(roster).toHaveLength(9)
    expect(validateLineup(autoLineup(roster), roster)).toEqual([])
  })
})

describe('validateLineup', () => {
  it('選手が重複していると検出する', () => {
    const roster = createInitialRoster(createRng(21))
    const lineup = autoLineup(roster)
    const broken = {
      slots: lineup.slots.map((slot, i) =>
        i === 1 ? { ...slot, playerId: lineup.slots[0].playerId } : slot,
      ),
    }
    expect(broken.slots.length).toBe(LINEUP_SIZE)
    expect(validateLineup(broken, roster).some((p) => p.type === 'duplicatePlayer')).toBe(true)
  })

  it('ポジションが重複・欠落していると検出する', () => {
    const roster = createInitialRoster(createRng(22))
    const lineup = autoLineup(roster)
    const broken = {
      slots: lineup.slots.map((slot, i) =>
        i === 1 ? { ...slot, position: lineup.slots[0].position } : slot,
      ),
    }
    const problems = validateLineup(broken, roster)
    expect(problems.some((p) => p.type === 'duplicatePosition')).toBe(true)
    expect(problems.some((p) => p.type === 'missingPosition')).toBe(true)
  })

  it('在籍していない選手を検出する', () => {
    const roster = createInitialRoster(createRng(23))
    const lineup = autoLineup(roster)
    const broken = {
      slots: lineup.slots.map((slot, i) => (i === 0 ? { ...slot, playerId: 'ghost' } : slot)),
    }
    expect(validateLineup(broken, roster).some((p) => p.type === 'unknownPlayer')).toBe(true)
  })

  it('人数が足りないと検出する', () => {
    const roster = createInitialRoster(createRng(24))
    const lineup = autoLineup(roster)
    expect(validateLineup({ slots: lineup.slots.slice(0, 5) }, roster).some((p) => p.type === 'size')).toBe(
      true,
    )
  })
})

describe('repairLineup', () => {
  it('壊れていなければそのまま返す', () => {
    const roster = createInitialRoster(createRng(31))
    const lineup = autoLineup(roster)
    expect(repairLineup(lineup, roster)).toBe(lineup)
  })

  it('選手が抜けたら組み直す', () => {
    const roster = createInitialRoster(createRng(32))
    const lineup = autoLineup(roster)

    // スタメンの1人が退部した状況
    const removedId = lineup.slots[0].playerId
    const remaining = roster.filter((p) => p.id !== removedId)

    const repaired = repairLineup(lineup, remaining)
    expect(validateLineup(repaired, remaining)).toEqual([])
    expect(repaired.slots.some((s) => s.playerId === removedId)).toBe(false)
  })
})

describe('ポジションの網羅', () => {
  it('ALL_POSITIONS は9個', () => {
    const expected: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
    expect([...ALL_POSITIONS].sort()).toEqual([...expected].sort())
  })
})

describe('おまかせの方針', () => {
  const roster = createInitialRoster(createRng(31))

  it('どの方針でも成立した編成になる', () => {
    for (const plan of AUTO_LINEUP_PLANS) {
      expect(validateLineup(autoLineup(roster, plan.id), roster)).toEqual([])
    }
  })

  it('能力優先は総合の高い選手が多く入る', () => {
    /**
     * 野手8人ぶんの総合の合計。
     * **投手枠は除く。** どの方針でも投手は投球能力（pitcherValue）で選ぶので、
     * 混ぜると方針の違いが埋もれる。
     */
    const sum = (players: Player[], plan: Parameters<typeof autoLineup>[1]) =>
      autoLineup(players, plan).slots.reduce((total, slot) => {
        if (slot.position === 'P') return total
        return total + overallRating(players.find((p) => p.id === slot.playerId)!)
      }, 0)

    // 1つの部員名簿だけでは差が出ないことがある。
    // 学年差を縮めてから選手同士が近くなり、どちらの方針でも同じ9人が並ぶ回がある
    let ability = 0
    let balanced = 0
    for (let seed = 1; seed <= 20; seed++) {
      const players = createInitialRoster(createRng(seed))
      ability += sum(players, 'ability')
      balanced += sum(players, 'balanced')
    }

    expect(ability).toBeGreaterThan(balanced)
  })

  it('若手優先は下級生が多く入る', () => {
    const grades = (plan: Parameters<typeof autoLineup>[1]) =>
      autoLineup(roster, plan).slots.reduce((total, slot) => {
        const player = roster.find((p) => p.id === slot.playerId)!
        return total + player.grade
      }, 0)

    // 学年の合計が小さいほど下級生が多い
    expect(grades('youth')).toBeLessThan(grades('balanced'))
  })

  it('どの方針でも投手の位置には投手が入る', () => {
    for (const plan of AUTO_LINEUP_PLANS) {
      const slot = autoLineup(roster, plan.id).slots.find((s) => s.position === 'P')!
      const player = roster.find((p) => p.id === slot.playerId)!
      expect(player.pitching).not.toBeNull()
    }
  })
})


describe('打順の組み方', () => {
  const roster = createInitialRoster(createRng(77))
  const lineup = autoLineup(roster)
  const byId = new Map(roster.map((p) => [p.id, p]))
  const at = (order: number) => byId.get(lineup.slots[order - 1].playerId)!

  /** スタメン9人 */
  const starters = lineup.slots.map((slot) => byId.get(slot.playerId)!)

  it('1番は出塁力と走力の両方が上位', () => {
    const rank = (score: (p: (typeof starters)[number]) => number, player: (typeof starters)[number]) =>
      starters.filter((other) => score(other) > score(player)).length

    // どちらか片方だけ飛び抜けた選手ではなく、両方そこそこ上にいる
    expect(rank(onBaseScore, at(1)) + rank(runningScore, at(1))).toBeLessThan(7)
  })

  it('2番は1番より出塁力が高いか、ほぼ並ぶ', () => {
    // 1番は走力も見るので、純粋な出塁力では2番が上回ることがある
    const top2 = [onBaseScore(at(1)), onBaseScore(at(2))]
    const others = starters
      .filter((p) => p !== at(1) && p !== at(2))
      .map(onBaseScore)
    expect(Math.min(...top2)).toBeGreaterThanOrEqual(Math.min(...others))
  })

  it('3番と4番に打力の上位が入る', () => {
    const middle = [battingScore(at(3)), battingScore(at(4))]
    const lower = [6, 7, 8, 9].map((order) => battingScore(at(order)))
    expect(Math.min(...middle)).toBeGreaterThan(Math.min(...lower))
  })

  it('4番は3番より長打力が高い', () => {
    expect(sluggingScore(at(4))).toBeGreaterThanOrEqual(sluggingScore(at(3)))
  })

  it('9番はスタメンで打力が最下位', () => {
    const last = battingScore(at(9))
    for (const player of starters) {
      expect(battingScore(player)).toBeGreaterThanOrEqual(last)
    }
  })

  it('投手は8番か9番に入る', () => {
    // 打力だけで決めると、ミートの高い投手が2番に入ることがあった
    const pitcherOrder = lineup.slots.findIndex((slot) => slot.position === 'P') + 1
    expect(pitcherOrder).toBeGreaterThanOrEqual(8)
  })

  it('3番と4番に最も優秀な打者が入る', () => {
    // 「チームで最も優秀な打者」の枠。上位打線から埋めていた頃は
    // 3番のほうが1番より弱いという並びになっていた。
    // 3番はミート寄り・4番はパワー寄りに選ぶので、
    // 1人ずつ比べると前後することがある。**2人の合計**で見る
    let middle = 0
    let top = 0

    for (let seed = 1; seed <= 20; seed++) {
      const players = createInitialRoster(createRng(seed))
      const slots = autoLineup(players).slots
      const scoreAt = (order: number) =>
        battingScore(players.find((p) => p.id === slots[order - 1].playerId)!)

      middle += scoreAt(3) + scoreAt(4)
      top += scoreAt(1) + scoreAt(2)
    }

    expect(middle).toBeGreaterThan(top)
  })

  it('9人が重複なく並ぶ', () => {
    expect(new Set(lineup.slots.map((s) => s.playerId)).size).toBe(LINEUP_SIZE)
  })
})
