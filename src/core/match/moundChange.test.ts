/**
 * 野手として出場している投手をマウンドへ上げる交代。
 *
 * 打てる投手を外野で使う編成は普通にあるのに、
 * 継投の候補が「ベンチにいる投手」だけだったので出番が回らなかった。
 */

import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { autoLineup } from '@/core/lineup/autoLineup'
import { createInitialRoster } from '@/core/player/createPlayer'
import { ALL_POSITIONS } from '@/core/lineup/aptitude'
import type { Lineup } from '@/core/types/lineup'
import type { Player } from '@/core/types/player'
import { createTeam } from './teamState'
import { fieldingPitchers, promoteToMound } from './halfInning'
import { simulateGame } from './simulateGame'

/**
 * 「投手を1人、野手として出す」チームを作る。
 *
 * ベンチには投手を1人も残さない。控えから継投できてしまうと、
 * 守備から上げる経路が使われたのか分からなくなる。
 */
function teamWithFieldingPitcher(seed: number): {
  players: Player[]
  lineup: Lineup
  starterId: string
  fielderPitcherId: string
} {
  const roster = createInitialRoster(createRng(seed))
  const base = autoLineup(roster)
  const starterId = base.slots.find((slot) => slot.position === 'P')!.playerId

  // 先発以外の投手を1人、右翼の枠に押し込む
  const spare = roster.find((player) => player.pitching && player.id !== starterId)!
  const rightIndex = base.slots.findIndex((slot) => slot.position === 'RF')
  const displacedId = base.slots[rightIndex].playerId

  const lineup: Lineup = {
    slots: base.slots.map((slot, index) =>
      index === rightIndex ? { ...slot, playerId: spare.id } : slot,
    ),
  }

  const onField = new Set(lineup.slots.map((slot) => slot.playerId))
  const players = roster.filter(
    (player) => onField.has(player.id) || (!player.pitching && player.id !== displacedId),
  )

  return { players, lineup, starterId, fielderPitcherId: spare.id }
}

describe('守備から投手を上げる', () => {
  it('野手として出ている投手が継投の候補に入る', () => {
    const { players, lineup, fielderPitcherId } = teamWithFieldingPitcher(31)
    const team = createTeam({ name: 'テスト', isPlayer: true, players, lineup })

    expect(fieldingPitchers(team).map((player) => player.id)).toContain(fielderPitcherId)
  })

  it('登板済みの投手は候補に入らない', () => {
    const { players, lineup, fielderPitcherId } = teamWithFieldingPitcher(31)
    const team = createTeam({ name: 'テスト', isPlayer: true, players, lineup })

    promoteToMound(team, team.players.find((player) => player.id === fielderPitcherId)!)

    expect(fieldingPitchers(team).map((player) => player.id)).not.toContain(fielderPitcherId)
  })

  it('マウンドへ上げても誰も退かず、守備位置は9つ揃ったまま', () => {
    const { players, lineup, starterId, fielderPitcherId } = teamWithFieldingPitcher(77)
    const team = createTeam({ name: 'テスト', isPlayer: true, players, lineup })

    const moved = promoteToMound(team, team.players.find((p) => p.id === fielderPitcherId)!)

    expect(moved).not.toBeNull()
    expect(team.pitcherId).toBe(fielderPitcherId)
    // 交代ではないので、誰も試合から退かない
    expect(team.retiredIds).toEqual([])
    // 降りた投手はグラウンドに残る
    expect(team.lineup.slots.some((slot) => slot.playerId === starterId)).toBe(true)
    expect(team.lineup.slots.find((slot) => slot.position === 'P')!.playerId).toBe(
      fielderPitcherId,
    )

    // 守備位置は9つとも1人ずつ
    expect([...new Set(team.lineup.slots.map((slot) => slot.position))].sort()).toEqual(
      [...ALL_POSITIONS].sort(),
    )
    // 打順は動かない
    expect(team.lineup.slots.map((slot) => slot.playerId)).toEqual(
      lineup.slots.map((slot) => slot.playerId),
    )
  })

  it('降りた投手は、守れる位置に置き直される', () => {
    // 投手は捕手・遊撃の適性が低いので、外野や一塁へ回るのが自然
    const heavy: string[] = []

    for (let seed = 1; seed <= 40; seed++) {
      const { players, lineup, starterId, fielderPitcherId } = teamWithFieldingPitcher(seed)
      const team = createTeam({ name: 'テスト', isPlayer: true, players, lineup })
      promoteToMound(team, team.players.find((p) => p.id === fielderPitcherId)!)

      const position = team.lineup.slots.find((slot) => slot.playerId === starterId)!.position
      if (position === 'C' || position === 'SS' || position === '2B') heavy.push(position)
    }

    /*
     * 守備の負担が重い位置に置かれるのは例外的。
     *
     * **能力の凸凹（`ABILITY_SPREAD` ＝ ±34）を広げたぶん増えた**（7 → 12）。
     * 捕手・遊撃は適性で決まるが、**誰も適性を持たない枠**は
     * 打力（`defenseShare` の残り38%）で決まるので、
     * よく打つ投手がそこを取ることがある。
     * ランダムに置いた場合（8枠中3枠＝15件）よりは、まだはっきり少ない。
     */
    expect(heavy.length).toBeLessThan(15)
  })

  it('控え投手がいなくても、試合中に継投が起きる', () => {
    let relieved = 0

    for (let seed = 1; seed <= 40; seed++) {
      const { players, lineup, starterId, fielderPitcherId } = teamWithFieldingPitcher(seed)

      // 先発のスタミナを削って、必ず降板する場面を作る
      const worn = players.map((player) =>
        player.id === starterId && player.pitching
          ? { ...player, pitching: { ...player.pitching, stamina: 10 } }
          : player,
      )

      const result = simulateGame(createRng(seed * 613), {
        players: worn,
        lineup,
        opponentName: '相手校',
        opponentStrength: 10,
        kind: 'friendly',
      })

      if (result.pitchingLines.some((line) => line.playerId === fielderPitcherId)) relieved += 1
    }

    // スタミナ切れの先発を、右翼の投手が救援する
    expect(relieved).toBeGreaterThan(20)
  })
})

describe('大差での継投', () => {
  it('1イニングに何人も代えない', () => {
    /*
     * **打者ごとに判定していた。** 13-2のような試合で
     * 「0回」「⅓回」「⅓回」と3人が並ぶ継投になっていた。
     * 経験を積ませるのが目的なら、1イニングは任せないと意味が無い。
     */
    let pitchers = 0
    let noOuts = 0
    let games = 0

    for (let seed = 0; seed < 60; seed++) {
      const players = createInitialRoster(createRng(seed), 8, [3, 2, 1], false)
      const result = simulateGame(createRng(seed * 13 + 1), {
        players,
        lineup: autoLineup(players),
        opponentName: '相手校',
        // 大差が付きやすいよう、格下と当てる
        opponentStrength: -40,
        kind: 'friendly',
        mercy: false,
      })

      games++
      pitchers += result.pitchingLines.length
      noOuts += result.pitchingLines.filter((line) => line.outs === 0).length
    }

    // 9回で5人を超えるなら、回をまたがずに代えている
    expect(pitchers / games).toBeLessThan(3.2)
    // 1アウトも取らずに降りる投手は、ほとんど出ない
    expect(noOuts / games).toBeLessThan(0.05)
  })
})

describe('疲労を持った先発', () => {
  it('1人も相手にしないうちに降ろされない', () => {
    /*
     * **投げる前に交代していた。** 消耗の物差し（`staminaFactor`）に
     * 疲労を掛けていたので、疲労12を持っているだけで
     * 投げ始めた瞬間に交代の目安（0.96）を下回っていた。
     * 実測で、疲労30の先発の**6割が1球も投げずに交代**していた。
     */
    let pulled = 0
    const trials = 40

    for (let seed = 0; seed < trials; seed++) {
      const roster = createInitialRoster(createRng(seed + 500))
      const lineup = autoLineup(roster)
      const starterId = lineup.slots.find((slot) => slot.position === 'P')!.playerId
      const tired = roster.map((player) =>
        player.id === starterId ? { ...player, fatigue: 30 } : player,
      )

      const result = simulateGame(createRng(seed + 1), {
        players: tired,
        lineup,
        opponentName: '相手校',
        opponentStrength: 0,
        kind: 'friendly',
      })

      const line = result.pitchingLines.find((entry) => entry.playerId === starterId)
      if (!line || line.outs === 0) pulled += 1
    }

    expect(pulled).toBe(0)
  })
})
