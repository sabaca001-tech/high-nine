import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { startedGame } from '@/core/autoPlay'
import { applyCommand } from '@/core/gameEngine'
import type { GameState } from '@/core/types/game'
import { createInitialRoster } from './createPlayer'
import { overallRating } from './rating'
import {
  autoSquad,
  FIRST_SQUAD_SIZE,
  MIN_SQUAD_PITCHERS,
  squadPriority,
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

  it('投手枠を確保したあとは優先度の高い順に選ぶ', () => {
    const squad = autoSquad(players)
    const byId = new Map(players.map((player) => [player.id, player]))

    // 先頭の投手枠（最大3人）を除いた残りが優先度順になっている
    const rest = squad.slice(MIN_SQUAD_PITCHERS)
    const scores = rest.map((id) => squadPriority(byId.get(id)!))

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('投手が必ず3人ベンチ入りする', () => {
    // 先発1人では大会を戦えないし、大差の試合で控えに投げさせる余地も無い
    const byId = new Map(players.map((player) => [player.id, player]))
    const pitchers = autoSquad(players).filter((id) => byId.get(id)!.isPitcher)
    expect(pitchers.length).toBeGreaterThanOrEqual(MIN_SQUAD_PITCHERS)
  })

  it('投手が3人に満たない部でも壊れない', () => {
    const few = players.filter((p) => !p.isPitcher).slice(0, 12)
    const squad = autoSquad(few)
    expect(squad.length).toBe(Math.min(few.length, FIRST_SQUAD_SIZE))
    expect(new Set(squad).size).toBe(squad.length)
  })

  it('同じ総合なら下級生を残す', () => {
    // 3年生は夏で抜けるので、ベンチ入りさせても得られるものが少ない
    const senior = players.find((p) => p.grade === 3)!
    const junior = { ...players.find((p) => p.grade === 1)!, id: 'same' }
    const sameRating = { ...senior.batting }

    expect(
      squadPriority({ ...junior, batting: sameRating, pitching: senior.pitching }),
    ).toBeGreaterThan(squadPriority(senior))
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


describe('ベンチ入りの学年', () => {
  const roster = createInitialRoster(createRng(83))
  const byId = new Map(roster.map((p) => [p.id, p]))

  it('総合の低い上級生より、総合の高い下級生が残る', () => {
    const squad = new Set(autoSquad(roster))
    const outside = roster.filter((p) => !squad.has(p.id))
    const inside = roster.filter((p) => squad.has(p.id))
    if (outside.length === 0) return

    // ベンチ外に落ちた1年生より総合が低い3年生が枠に残っていたら、
    // 学年の下駄（10）を超える差があるはず
    for (const junior of outside.filter((p) => p.grade === 1)) {
      for (const senior of inside.filter((p) => p.grade === 3)) {
        if (overallRating(senior) >= overallRating(junior)) continue
        expect(overallRating(junior) - overallRating(senior)).toBeLessThan(10)
      }
    }
  })

  it('繰り上げも同じ物差しで決まる', () => {
    // 半分だけ指定して、残りが優先度順に埋まることを見る
    const partial = autoSquad(roster).slice(0, 5)
    const filled = repairSquad(partial, roster)

    expect(filled).toHaveLength(FIRST_SQUAD_SIZE)
    const promoted = filled.slice(5).map((id) => squadPriority(byId.get(id)!))
    for (let i = 1; i < promoted.length; i++) {
      expect(promoted[i]).toBeLessThanOrEqual(promoted[i - 1])
    }
  })
})

describe('おまかせ編成はベンチ外も見る', () => {
  it('ベンチ外に強い選手がいれば、弱いベンチ入りと入れ替わる', () => {
    // **ベンチ入りの中だけで組んでいた頃は、
    // ベンチ外に総合80がいてもベンチ入りの総合50が使われ続けていた**
    const base = startedGame({ seed: 21 })

    // わざと弱い選手だけをベンチ入りにする
    const weakest = [...base.players]
      .sort((a, b) => overallRating(a) - overallRating(b))
      .slice(0, FIRST_SQUAD_SIZE)
    const state: GameState = {
      ...base,
      squad: weakest.map((player) => player.id),
    }

    const after = applyCommand(state, { type: 'autoLineup' }).state
    const rating = (ids: readonly string[]) =>
      ids.reduce((sum, id) => {
        const player = after.players.find((p) => p.id === id)
        return sum + (player ? overallRating(player) : 0)
      }, 0)

    // ベンチ入りの総和が上がっている
    expect(rating(after.squad)).toBeGreaterThan(rating(state.squad))
    // スタメンは必ずベンチ入りから組む
    for (const slot of after.lineup.slots) {
      expect(after.squad).toContain(slot.playerId)
    }
  })

  it('方針はベンチ入りの選び方にも効く', () => {
    const state = startedGame({ seed: 33 })
    const youth = applyCommand(state, { type: 'autoLineup', plan: 'youth' }).state
    const ability = applyCommand(state, { type: 'autoLineup', plan: 'ability' }).state

    const grades = (ids: readonly string[]) =>
      ids.reduce((sum, id) => {
        const player = state.players.find((p) => p.id === id)
        return sum + (player ? player.grade : 0)
      }, 0)

    // 若手優先のほうが、ベンチ入りの学年の合計が小さい（下級生が多い）
    expect(grades(youth.squad)).toBeLessThan(grades(ability.squad))
  })
})
