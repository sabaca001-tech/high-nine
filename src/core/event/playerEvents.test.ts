import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import type { Player } from '@/core/types/player'
import {
  eventText,
  findEventChoice,
  findPlayerEvent,
  pickPlayerEvent,
  PLAYER_EVENTS,
} from './playerEvents'

const roster = createInitialRoster(createRng(3))

describe('PLAYER_EVENTS', () => {
  it('idが重複しない', () => {
    expect(new Set(PLAYER_EVENTS.map((e) => e.id)).size).toBe(PLAYER_EVENTS.length)
  })

  it('どのイベントにも選択肢が2つ以上あり、idが重複しない', () => {
    for (const event of PLAYER_EVENTS) {
      expect(event.choices.length).toBeGreaterThanOrEqual(2)
      expect(new Set(event.choices.map((c) => c.id)).size).toBe(event.choices.length)
    }
  })

  it('説明文に選手名を差し込める', () => {
    for (const event of PLAYER_EVENTS) {
      expect(event.text).toContain('{name}')
      expect(eventText(event, '山田 太郎')).toContain('山田 太郎')
      expect(eventText(event, '山田 太郎')).not.toContain('{name}')
    }
  })

  it('findPlayerEvent / findEventChoice で引ける', () => {
    const event = findPlayerEvent('slump')!
    expect(event).toBeDefined()
    expect(findEventChoice(event, 'rest')).toBeDefined()
    expect(findEventChoice(event, '存在しない')).toBeUndefined()
    expect(findPlayerEvent('存在しない')).toBeUndefined()
  })

  it('どの選択肢もその選手の状態を返し、元の選手を書き換えない', () => {
    for (const event of PLAYER_EVENTS) {
      for (const choice of event.choices) {
        // 条件を満たす選手を探す（投手専用のイベントもある）
        const target = roster.find((p) => event.applies?.(p) ?? true)
        if (!target) continue

        const before = JSON.parse(JSON.stringify(target)) as Player
        for (let seed = 1; seed <= 20; seed++) {
          const outcome = choice.resolve(createRng(seed), target)
          expect(outcome.player.id).toBe(target.id)
          expect(outcome.text).toContain(target.name)
          expect(outcome.player.condition).toBeGreaterThanOrEqual(0)
          expect(outcome.player.condition).toBeLessThanOrEqual(100)
          expect(outcome.player.trust).toBeGreaterThanOrEqual(0)
          expect(outcome.player.trust).toBeLessThanOrEqual(100)
        }
        expect(target).toEqual(before)
      }
    }
  })

  it('部費が要る選択肢は、その額ぶんの支出を返す', () => {
    for (const event of PLAYER_EVENTS) {
      for (const choice of event.choices) {
        if (choice.cost === undefined) continue
        const target = roster.find((p) => event.applies?.(p) ?? true)!
        const outcome = choice.resolve(createRng(1), target)
        expect(outcome.fundsDelta).toBe(-choice.cost)
      }
    }
  })
})

describe('pickPlayerEvent', () => {
  it('選ばれたイベントは、その選手の条件を満たしている', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pending = pickPlayerEvent(createRng(seed), roster)
      if (!pending) continue

      const event = findPlayerEvent(pending.eventId)!
      const player = roster.find((p) => p.id === pending.playerId)!
      expect(event.applies?.(player) ?? true).toBe(true)
    }
  })

  it('離脱中の選手は選ばれない', () => {
    const injured = roster.map((p, i) => (i < roster.length - 1 ? { ...p, injuryMonths: 2 } : p))
    const healthy = injured[injured.length - 1]

    for (let seed = 1; seed <= 60; seed++) {
      const pending = pickPlayerEvent(createRng(seed), injured)
      if (pending) expect(pending.playerId).toBe(healthy.id)
    }
  })

  it('全員離脱していれば何も起きない', () => {
    const allInjured = roster.map((p) => ({ ...p, injuryMonths: 1 }))
    expect(pickPlayerEvent(createRng(1), allInjured)).toBeNull()
  })

  it('部員がいなければ何も起きない', () => {
    expect(pickPlayerEvent(createRng(1), [])).toBeNull()
  })

  it('いろいろな選手にスポットが当たる', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 300; seed++) {
      const pending = pickPlayerEvent(createRng(seed), roster)
      if (pending) seen.add(pending.playerId)
    }
    // 一部の選手に固まらない
    expect(seen.size).toBeGreaterThan(roster.length / 2)
  })
})
