import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import { LINEUP_SIZE } from '@/core/types/lineup'
import type { Position } from '@/core/types/player'
import { ALL_POSITIONS, createAptitudes, defenseScore, isPlayable } from './aptitude'
import { overallRating } from '@/core/player/rating'
import { AUTO_LINEUP_PLANS, autoLineup, repairLineup, starterOf, validateLineup } from './autoLineup'

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

  it('投手の打順は最後になる', () => {
    const roster = createInitialRoster(createRng(9))
    const lineup = autoLineup(roster)
    expect(lineup.slots[LINEUP_SIZE - 1].position).toBe('P')
  })

  it('1番打者は打線の中で走力が高い方に入る', () => {
    const roster = createInitialRoster(createRng(11))
    const lineup = autoLineup(roster)
    const speedOf = (id: string) => roster.find((p) => p.id === id)?.batting.speed ?? 0

    const leadoff = speedOf(lineup.slots[0].playerId)
    const others = lineup.slots.slice(1, 8).map((s) => speedOf(s.playerId))
    expect(leadoff).toBeGreaterThanOrEqual(Math.max(...others))
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
    const sum = (lineup: ReturnType<typeof autoLineup>) =>
      lineup.slots.reduce((total, slot) => {
        const player = roster.find((p) => p.id === slot.playerId)!
        return total + overallRating(player)
      }, 0)

    expect(sum(autoLineup(roster, 'ability'))).toBeGreaterThan(
      sum(autoLineup(roster, 'balanced')),
    )
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
