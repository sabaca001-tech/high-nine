/**
 * 投手の登板イニングの診断。
 *
 * 「毎試合ほぼ完投している」という手触りを数字で確認するためのもの。
 * 判定はせず、スタミナ帯ごとの先発の投球回を出力する。
 */

import { describe, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { autoLineup } from '@/core/lineup/autoLineup'
import { createInitialRoster } from '@/core/player/createPlayer'
import type { Player } from '@/core/types/player'
import { simulateGame } from './simulateGame'

/**
 * 先発投手のスタミナを固定したチームを作る。
 *
 * スタメンは**先に決めてから**能力をいじる。
 * あとで組み直すと、スタミナを下げた選手が先発から外れてしまう。
 */
function teamWithStamina(
  seed: number,
  stamina: number,
): { players: Player[]; lineup: ReturnType<typeof autoLineup>; starterId: string } {
  const players = createInitialRoster(createRng(seed))
  const lineup = autoLineup(players)
  const starterId = lineup.slots.find((slot) => slot.position === 'P')!.playerId

  return {
    players: players.map((player) =>
      player.id === starterId && player.pitching
        ? { ...player, pitching: { ...player.pitching, stamina } }
        : player,
    ),
    lineup,
    starterId,
  }
}

describe('診断: 先発投手の投球回', () => {
  it('スタミナ帯ごとの投球回と完投率を出力する', () => {
    const GAMES = 120

    console.log('スタミナ  平均投球回  完投率')
    for (const stamina of [20, 40, 55, 65, 75, 90]) {
      let outs = 0
      let complete = 0

      for (let seed = 1; seed <= GAMES; seed++) {
        const { players, lineup, starterId } = teamWithStamina(seed, stamina)

        const result = simulateGame(createRng(seed * 977), {
          players,
          lineup,
          opponentName: '',
          opponentStrength: 0,
          kind: 'friendly',
        })

        const line = result.pitchingLines.find((p) => p.playerId === starterId)
        outs += line?.outs ?? 0
        if (result.pitchingLines.length === 1) complete += 1
      }

      const innings = outs / 3 / GAMES
      console.log(
        `${String(stamina).padStart(6)}  ${innings.toFixed(1).padStart(9)}回  ${((complete / GAMES) * 100).toFixed(0).padStart(4)}%`,
      )
    }
  }, 60000)
})
