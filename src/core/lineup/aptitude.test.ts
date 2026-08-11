import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import type { Aptitude, Player, Position } from '@/core/types/player'
import { APTITUDE_MAX } from '@/core/types/player'
import { createAptitudes, defenseScore, misplacementPenalty, POSITION_WEIGHT } from './aptitude'
import { ALL_POSITIONS } from './aptitude'

const players = createInitialRoster(createRng(7))

/** 全ポジションの適性を指定した値に揃えた選手を作る */
function withAptitude(player: Player, aptitude: Aptitude): Player {
  const aptitudes = {} as Record<Position, Aptitude>
  for (const position of ALL_POSITIONS) aptitudes[position] = aptitude
  return { ...player, aptitudes }
}

describe('POSITION_WEIGHT', () => {
  it('二遊間＞捕手＞中堅＞三塁＞右翼＞一塁＞左翼＞投手 の順になっている', () => {
    const order: Position[] = ['SS', '2B', 'C', 'CF', '3B', 'RF', '1B', 'LF', 'P']

    for (let i = 1; i < order.length; i++) {
      expect(POSITION_WEIGHT[order[i]]).toBeLessThan(POSITION_WEIGHT[order[i - 1]])
    }
  })
})

describe('misplacementPenalty', () => {
  it('3段以上の適性なら罰は無い', () => {
    for (const aptitude of [5, 4, 3] as Aptitude[]) {
      expect(misplacementPenalty(withAptitude(players[0], aptitude), 'SS')).toBe(0)
    }
  })

  it('適性が低いほど大きくなる', () => {
    const d = misplacementPenalty(withAptitude(players[0], 2), 'SS')
    const g = misplacementPenalty(withAptitude(players[0], 0), 'SS')
    expect(g).toBeGreaterThan(d)
    expect(d).toBeGreaterThan(0)
  })

  it('同じ適性でも、重要な位置に置くほど罰が大きい', () => {
    const bad = withAptitude(players[0], 0)
    expect(misplacementPenalty(bad, 'SS')).toBeGreaterThan(misplacementPenalty(bad, 'LF'))
    expect(misplacementPenalty(bad, 'C')).toBeGreaterThan(misplacementPenalty(bad, '1B'))
  })
})

describe('適性は5段階、1段が守備力の20%', () => {
  const player = players.find((p) => !p.pitching)!

  it('本職（5段）なら守備の能力がそのまま出る', () => {
    // **能力表の「守備」と、守備適性の図に出る本職の数字は必ず一致する**
    const full = defenseScore(withAptitude(player, APTITUDE_MAX), '1B')
    expect(full).toBeCloseTo(player.batting.fielding, 5)
  })

  it('1段ごとに20%ずつ落ちる', () => {
    const at = (level: Aptitude) => defenseScore(withAptitude(player, level), '1B')
    const full = at(APTITUDE_MAX)

    expect(at(4)).toBeCloseTo(full * 0.8, 5)
    expect(at(3)).toBeCloseTo(full * 0.6, 5)
    expect(at(1)).toBeCloseTo(full * 0.2, 5)
    // 0段は守れない
    expect(at(0)).toBe(0)
  })

  it('本職は必ず5段、それ以外は5段にならない', () => {
    const rng = createRng(11)
    for (const main of ALL_POSITIONS) {
      const aptitudes = createAptitudes(rng, main)
      expect(aptitudes[main]).toBe(APTITUDE_MAX)
      for (const position of ALL_POSITIONS) {
        if (position === main) continue
        expect(aptitudes[position]).toBeLessThan(APTITUDE_MAX)
      }
    }
  })
})
