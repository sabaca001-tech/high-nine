import { describe, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { PRACTICE_DEFS } from './card/cardDefs'
import { createPlayer } from './player/createPlayer'
import { applyPractice } from './player/growth'
import { overallRating } from './player/rating'
import type { Player } from '@/core/types/player'

const KINDS = ['batting', 'running', 'fielding', 'pitching', 'stamina', 'breaking'] as const

/** 3年ぶん（1年365日 × 3）を、いろいろな練習で回す */
function raise(seed: number, exchange: boolean, isPitcher: boolean): Player {
  const rng = createRng(seed)
  let player = createPlayer(rng, { id: 'p', grade: 1, isPitcher, exchange })

  for (let i = 0; i < 220; i++) {
    const def = PRACTICE_DEFS[KINDS[i % KINDS.length]]
    if (!def) continue
    const out = applyPractice(rng, [player], def, { steps: 5 })
    player = { ...out.players[0], condition: 90 }
  }
  return player
}

describe('診断: 留学生', () => {
  it('3年後の姿を出力する', () => {
    for (const isPitcher of [false, true]) {
      for (const exchange of [false, true]) {
        const players = Array.from({ length: 60 }, (_, i) => raise(i + 1, exchange, isPitcher))
        const avg = (f: (p: Player) => number) =>
          (players.reduce((sum, p) => sum + f(p), 0) / players.length).toFixed(1)

        const label = `${isPitcher ? '投手' : '野手'}${exchange ? '(留学生)' : '　　　　'}`
        console.log(
          isPitcher
            ? `${label} 総合${avg(overallRating)} 球速${avg((p) => p.pitching!.velocity)} スタミナ${avg((p) => p.pitching!.stamina)} 制球${avg((p) => p.pitching!.control)} キレ${avg((p) => p.pitching!.sharpness)}`
            : `${label} 総合${avg(overallRating)} ミート${avg((p) => p.batting.meet)} パワー${avg((p) => p.batting.power)} 走力${avg((p) => p.batting.speed)} 肩力${avg((p) => p.batting.arm)} 守備${avg((p) => p.batting.fielding)} 捕球${avg((p) => p.batting.catching)}`,
        )
      }
    }
  }, 120000)
})
