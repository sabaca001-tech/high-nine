import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import type { Aptitude, Player, Position } from '@/core/types/player'
import { misplacementPenalty, POSITION_WEIGHT } from './aptitude'
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
  it('C以上の適性なら罰は無い', () => {
    for (const aptitude of ['S', 'A', 'B', 'C'] as Aptitude[]) {
      expect(misplacementPenalty(withAptitude(players[0], aptitude), 'SS')).toBe(0)
    }
  })

  it('適性が低いほど大きくなる', () => {
    const d = misplacementPenalty(withAptitude(players[0], 'D'), 'SS')
    const g = misplacementPenalty(withAptitude(players[0], 'G'), 'SS')
    expect(g).toBeGreaterThan(d)
    expect(d).toBeGreaterThan(0)
  })

  it('同じ適性でも、重要な位置に置くほど罰が大きい', () => {
    const bad = withAptitude(players[0], 'G')
    expect(misplacementPenalty(bad, 'SS')).toBeGreaterThan(misplacementPenalty(bad, 'LF'))
    expect(misplacementPenalty(bad, 'C')).toBeGreaterThan(misplacementPenalty(bad, '1B'))
  })
})
