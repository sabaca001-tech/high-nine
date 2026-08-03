import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from './createPlayer'
import { overallRating } from './rating'
import {
  autoSquad,
  FIRST_SQUAD_SIZE,
  firstSquadSet,
  repairSquad,
  SECOND_SQUAD_MULTIPLIER,
  squadMultiplierOf,
} from './squad'

const players = createInitialRoster(createRng(1))

describe('autoSquad', () => {
  it('定員ぶんだけ選ぶ', () => {
    expect(autoSquad(players)).toHaveLength(FIRST_SQUAD_SIZE)
  })

  it('総合の高い順に選ぶ', () => {
    const squad = autoSquad(players)
    const byId = new Map(players.map((player) => [player.id, player]))
    const ratings = squad.map((id) => overallRating(byId.get(id)!))

    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1])
    }
  })

  it('離脱中の選手は選ばない', () => {
    const injured = players.map((player, index) =>
      index === 0 ? { ...player, injuryMonths: 2 } : player,
    )
    expect(autoSquad(injured)).not.toContain(players[0].id)
  })
})

describe('repairSquad', () => {
  it('在籍していない選手を落とす', () => {
    const squad = repairSquad(['ghost', ...players.slice(0, 5).map((p) => p.id)], players)
    expect(squad).not.toContain('ghost')
  })

  it('足りなければ総合の高い順に繰り上げる', () => {
    const squad = repairSquad([players[0].id], players)
    expect(squad).toHaveLength(FIRST_SQUAD_SIZE)
    expect(squad[0]).toBe(players[0].id)
  })

  it('定員を超えるぶんは切る', () => {
    const squad = repairSquad(
      players.map((player) => player.id),
      players,
    )
    expect(squad).toHaveLength(FIRST_SQUAD_SIZE)
  })

  it('指定した並びは保つ（勝手に強い順へ並べ替えない）', () => {
    // わざと弱い順に指定する
    const weakFirst = [...players]
      .sort((a, b) => overallRating(a) - overallRating(b))
      .slice(0, FIRST_SQUAD_SIZE)
      .map((player) => player.id)

    expect(repairSquad(weakFirst, players)).toEqual(weakFirst)
  })

  it('怪我をしていても枠は外さない（戻ったときに元の枠に居てほしい）', () => {
    const chosen = players.slice(0, FIRST_SQUAD_SIZE).map((player) => player.id)
    const injured = players.map((player, index) =>
      index === 0 ? { ...player, injuryMonths: 3 } : player,
    )
    expect(repairSquad(chosen, injured)).toContain(players[0].id)
  })
})

describe('squadMultiplierOf', () => {
  it('一軍は等倍、二軍は伸びが鈍い', () => {
    const squad = firstSquadSet(autoSquad(players))
    const inSquad = [...squad][0]
    const outOfSquad = players.find((player) => !squad.has(player.id))!

    expect(squadMultiplierOf(inSquad, squad)).toBe(1)
    expect(squadMultiplierOf(outOfSquad.id, squad)).toBe(SECOND_SQUAD_MULTIPLIER)
  })
})
