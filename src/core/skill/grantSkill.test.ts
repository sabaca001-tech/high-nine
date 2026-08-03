import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createPlayer } from '@/core/player/createPlayer'
import type { Player } from '@/core/types/player'
import { addRedSkill, attemptTraining, removeRedSkill } from './grantSkill'
import { findSkill, SKILLS, skillsFor } from './skillDefs'

function makePlayer(overrides: Partial<Player> = {}): Player {
  return { ...createPlayer(createRng(1), { id: 'p1', grade: 2, isPitcher: false }), ...overrides }
}

describe('skillDefs', () => {
  it('idが重複していない', () => {
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length)
  })

  it('投手用・野手用の両方に金・青・赤が揃っている', () => {
    for (const forPitcher of [true, false]) {
      for (const rank of ['gold', 'blue', 'red'] as const) {
        expect(skillsFor({ forPitcher, rank }).length).toBeGreaterThan(0)
      }
    }
  })

  it('findSkill で引ける', () => {
    expect(findSkill(SKILLS[0].id)?.name).toBe(SKILLS[0].name)
    expect(findSkill('存在しない')).toBeUndefined()
  })
})

describe('attemptTraining', () => {
  it('成功すると特殊能力が1つ増える', () => {
    const rng = createRng(7)
    let player = makePlayer({ trust: 50 })
    let granted = 0

    for (let i = 0; i < 200; i++) {
      const result = attemptTraining(rng, player)
      if (result.granted) {
        granted++
        expect(result.player.skills.length).toBe(player.skills.length + 1)
        player = result.player
      } else {
        expect(result.player).toBe(player)
      }
    }
    expect(granted).toBeGreaterThan(0)
  })

  it('同じ特殊能力を重複して習得しない', () => {
    const rng = createRng(8)
    let player = makePlayer({ trust: 90 })
    for (let i = 0; i < 300; i++) {
      player = attemptTraining(rng, player).player
    }
    expect(new Set(player.skills).size).toBe(player.skills.length)
  })

  it('野手が投手用の特殊能力を習得しない', () => {
    const rng = createRng(9)
    let player = makePlayer({ trust: 90 })
    for (let i = 0; i < 300; i++) {
      player = attemptTraining(rng, player).player
    }
    for (const id of player.skills) {
      expect(findSkill(id)?.forPitcher).toBe(false)
    }
  })

  it('信頼度が低いと金特を習得できない', () => {
    const rng = createRng(10)
    let player = makePlayer({ trust: 30 })
    for (let i = 0; i < 400; i++) {
      player = attemptTraining(rng, player).player
    }
    expect(player.skills.some((id) => findSkill(id)?.rank === 'gold')).toBe(false)
  })

  it('信頼度が高いと金特を習得しうる', () => {
    const rng = createRng(11)
    let player = makePlayer({ trust: 95 })
    for (let i = 0; i < 600; i++) {
      player = attemptTraining(rng, player).player
    }
    expect(player.skills.some((id) => findSkill(id)?.rank === 'gold')).toBe(true)
  })
})

describe('addRedSkill / removeRedSkill', () => {
  it('マイナス能力を付けて、また外せる', () => {
    const rng = createRng(12)
    const added = addRedSkill(rng, makePlayer())
    expect(added.granted).toBe(true)
    expect(findSkill(added.skillId!)?.rank).toBe('red')

    const removed = removeRedSkill(rng, added.player)
    expect(removed.granted).toBe(true)
    expect(removed.player.skills).toHaveLength(0)
  })

  it('マイナス能力を持っていなければ外せない', () => {
    const result = removeRedSkill(createRng(13), makePlayer())
    expect(result.granted).toBe(false)
  })
})
