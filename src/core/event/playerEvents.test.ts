import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createInitialRoster } from '@/core/player/createPlayer'
import type { Player } from '@/core/types/player'
import { overallRating } from '@/core/player/rating'
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

describe('スイング軌道（弾道の増減）', () => {
  const batter = roster.find((p) => !p.isPitcher)!
  const event = findPlayerEvent('swing-plane')!

  it('野手にだけ起こる', () => {
    expect(event.applies!(batter)).toBe(true)
    expect(event.applies!(roster.find((p) => p.isPitcher)!)).toBe(false)
  })

  it('鋭い打球を追わせると弾道が1段下がる', () => {
    const target: Player = { ...batter, batting: { ...batter.batting, trajectory: 3 } }
    const choice = findEventChoice(event, 'level')!
    const outcome = choice.resolve(createRng(1), target)

    expect(outcome.player.batting.trajectory).toBe(2)
    // ミートは伸びる（引き換えがある）
    expect(outcome.player.batting.meet).toBeGreaterThan(target.batting.meet)
    expect(outcome.changes.some((c) => c.key === 'trajectory')).toBe(true)
  })

  it('打球を上げさせると、上がることも上がらないこともある', () => {
    // **簡単には上がらない。** 弾道は4段階しかないので1段の重みが違う
    const target: Player = { ...batter, batting: { ...batter.batting, trajectory: 2 } }
    const choice = findEventChoice(event, 'upper')!

    let raised = 0
    for (let seed = 1; seed <= 60; seed++) {
      if (choice.resolve(createRng(seed), target).player.batting.trajectory === 3) raised++
    }
    expect(raised).toBeGreaterThan(0)
    expect(raised).toBeLessThan(60)
  })

  it('弾道は1〜4の外へ出ない', () => {
    const top: Player = { ...batter, batting: { ...batter.batting, trajectory: 4 } }
    const bottom: Player = { ...batter, batting: { ...batter.batting, trajectory: 1 } }

    for (let seed = 1; seed <= 20; seed++) {
      expect(
        findEventChoice(event, 'upper')!.resolve(createRng(seed), top).player.batting.trajectory,
      ).toBe(4)
      expect(
        findEventChoice(event, 'level')!.resolve(createRng(seed), bottom).player.batting.trajectory,
      ).toBe(1)
    }
  })

  it('今の軌道を通させれば弾道は動かない', () => {
    const choice = findEventChoice(event, 'keep')!
    const outcome = choice.resolve(createRng(4), batter)
    expect(outcome.player.batting.trajectory).toBe(batter.batting.trajectory)
  })
})

describe('投手の総合は野手能力を含まない', () => {
  it('打撃を伸ばしても投手の総合は動かない', () => {
    const pitcher = roster.find((p) => p.isPitcher)!
    const slugger: Player = {
      ...pitcher,
      batting: { ...pitcher.batting, meet: 99, power: 99, speed: 99 },
    }
    expect(overallRating(slugger)).toBe(overallRating(pitcher))
  })
})
