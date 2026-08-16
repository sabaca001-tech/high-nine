import { describe, expect, it } from 'vitest'
import { APTITUDE_MAX } from '@/core/types/player'
import { validateLineup } from '@/core/lineup/autoLineup'
import { ALL_POSITIONS } from '@/core/lineup/aptitude'
import { createInitialState } from '@/core/gameEngine'
import { SAVE_VERSION } from '@/core/types/game'
import { REPUTATION_INITIAL } from '@/core/types/season'
import { DEFAULT_REGION_ID } from '@/core/types/region'
import { migrate } from './migrate'

/** 現行の状態から v1 相当のセーブデータを作る（v2以降で追加した項目を削る） */
function makeV1Save(): Record<string, unknown> {
  const state = createInitialState({ seed: 1234 })
  const {
    lineup: _lineup,
    practiceBoost: _boost,
    matchSpeed: _speed,
    pendingMatch: _match,
    reputation: _rep,
    graduates: _grads,
    pendingSeason: _season,
    regionId: _region,
    tournament: _tour,
    nationalsBerth: _berth,
    springBerth: _spring,
    funds: _funds,
    groundLevel: _ground,
    managers: _managers,
    pendingEvent: _pendingEvent,
    ...rest
  } = state

  return {
    ...rest,
    version: 1,
    players: state.players.map((player) => {
      const { aptitudes: _aptitudes, skills: _skills, ...player1 } = player
      return player1
    }),
  }
}

describe('migrate', () => {
  it('現行バージョンのデータはそのまま通る', () => {
    const state = createInitialState({ seed: 1 })
    const migrated = migrate(JSON.parse(JSON.stringify(state)))
    expect(migrated).toEqual(state)
  })

  it('v1のセーブを現行バージョンへ移行できる', () => {
    const v1 = makeV1Save()
    const migrated = migrate(v1)

    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)

    // v2以降で追加した項目が埋まっている
    expect(migrated!.practiceBoost).toBeNull()
    expect(migrated!.matchSpeed).toBe('normal')
    expect(migrated!.pendingMatch).toBeNull()
    expect(migrated!.reputation).toBe(REPUTATION_INITIAL)
    expect(migrated!.graduates).toEqual([])
    expect(migrated!.pendingSeason).toBeNull()
    expect(validateLineup(migrated!.lineup, migrated!.players)).toEqual([])
    for (const player of migrated!.players) {
      expect(player.skills).toEqual([])
      expect(player.aptitudes[player.position]).toBe(APTITUDE_MAX)
    }
  })

  it('v2のセーブを現行バージョンへ移行できる', () => {
    const state = createInitialState({ seed: 4321 })
    const {
      matchSpeed: _speed,
      pendingMatch: _match,
      reputation: _rep,
      graduates: _grads,
      pendingSeason: _season,
      regionId: _region,
      tournament: _tour,
      nationalsBerth: _berth,
      springBerth: _spring,
      funds: _funds,
      groundLevel: _ground,
      managers: _managers,
      pendingEvent: _pendingEvent,
      ...rest
    } = state
    const v2 = { ...rest, version: 2 }

    const migrated = migrate(v2)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)
    expect(migrated!.matchSpeed).toBe('normal')
    expect(migrated!.reputation).toBe(REPUTATION_INITIAL)
    expect(migrated!.players.map((p) => p.name)).toEqual(state.players.map((p) => p.name))
  })

  it('v3のセーブを現行バージョンへ移行できる', () => {
    const state = createInitialState({ seed: 5555 })
    const {
      reputation: _rep,
      graduates: _grads,
      pendingSeason: _season,
      regionId: _region,
      tournament: _tour,
      nationalsBerth: _berth,
      springBerth: _spring,
      funds: _funds,
      groundLevel: _ground,
      managers: _managers,
      pendingEvent: _pendingEvent,
      ...rest
    } = state
    const v3 = { ...rest, version: 3 }

    const migrated = migrate(v3)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)
    expect(migrated!.reputation).toBe(REPUTATION_INITIAL)
    expect(migrated!.graduates).toEqual([])
    expect(migrated!.pendingSeason).toBeNull()
  })

  it('v4のセーブを現行バージョンへ移行できる', () => {
    const state = createInitialState({ seed: 6666 })
    const {
      regionId: _region,
      tournament: _tour,
      nationalsBerth: _berth,
      springBerth: _spring,
      funds: _funds,
      groundLevel: _ground,
      managers: _managers,
      pendingEvent: _pendingEvent,
      ...rest
    } = state
    const v4 = { ...rest, version: 4 }

    const migrated = migrate(v4)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)
    expect(migrated!.regionId).toBe(DEFAULT_REGION_ID)
    expect(migrated!.tournament).toBeNull()
    expect(migrated!.nationalsBerth).toBe(false)
    expect(migrated!.springBerth).toBe(false)
  })

  it('v5のセーブを現行バージョンへ移行できる', () => {
    const state = createInitialState({ seed: 7777 })
    const {
      springBerth: _spring,
      funds: _funds,
      groundLevel: _ground,
      managers: _managers,
      pendingEvent: _pendingEvent,
      ...rest
    } = state
    const v5 = { ...rest, version: 5 }

    const migrated = migrate(v5)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)
    expect(migrated!.springBerth).toBe(false)
  })

  it('v6のセーブを現行バージョンへ移行できる', () => {
    const state = createInitialState({ seed: 8888 })
    const {
      funds: _funds,
      groundLevel: _ground,
      managers: _managers,
      pendingEvent: _pendingEvent,
      ...rest
    } = state
    const v6 = { ...rest, version: 6 }

    const migrated = migrate(v6)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)
    // 部費は1ヶ月ぶん支給された状態から始まる
    expect(migrated!.funds).toBeGreaterThan(0)
  })

  it('v7のセーブを現行バージョンへ移行できる', () => {
    const state = createInitialState({ seed: 9999 })
    const {
      groundLevel: _ground,
      managers: _managers,
      pendingEvent: _pendingEvent,
      ...rest
    } = state
    const v7 = { ...rest, version: 7 }

    const migrated = migrate(v7)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)
    expect(migrated!.groundLevel).toBe(1)
    expect(migrated!.managers).toEqual([])
  })

  it('v1移行は何度やっても同じ結果になる（適性がぶれない）', () => {
    const v1 = makeV1Save()
    const a = migrate(JSON.parse(JSON.stringify(v1)))
    const b = migrate(JSON.parse(JSON.stringify(v1)))
    expect(a).toEqual(b)
  })

  it('移行後も既存の進行状況が保たれる', () => {
    const v1 = makeV1Save()
    const migrated = migrate(v1)!
    expect(migrated.year).toBe(v1.year)
    expect(migrated.month).toBe(v1.month)
    expect(migrated.players.map((p) => p.name)).toEqual(
      (v1.players as { name: string }[]).map((p) => p.name),
    )
  })

  it('v9のOB名鑑を現行バージョンへ移行できる（進路は不明扱い）', () => {
    const state = createInitialState({ seed: 12121 })
    const v9 = {
      ...state,
      version: 9,
      graduates: [
        { id: 'g1', name: '旧 太郎', rating: 70, isPitcher: false, position: 'CF', year: 2, skills: [] },
      ],
    }

    const migrated = migrate(v9)
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)

    const record = migrated!.graduates[0]
    expect(record.status).toBe('retired')
    expect(record.proSeasons).toEqual([])
    expect(record.name).toBe('旧 太郎')
  })

  it('v39の投手にノビとキレが入る（読み直しても弱くならない）', () => {
    const state = createInitialState({ seed: 4545 })
    const v39 = JSON.parse(JSON.stringify({ ...state, version: 39 })) as Record<string, unknown>

    // v39 の形（life / sharpness を持たない）に戻す
    const players = (v39.players as Record<string, unknown>[]).map((player) => {
      if (!player.pitching) return player
      const pitching = { ...(player.pitching as Record<string, unknown>) }
      delete pitching.life
      delete pitching.sharpness
      return { ...player, pitching }
    })

    const migrated = migrate({ ...v39, players })
    expect(migrated).not.toBeNull()
    expect(migrated!.version).toBe(SAVE_VERSION)

    for (const player of migrated!.players) {
      if (!player.pitching) continue
      expect(player.pitching.life).toBeGreaterThan(0)
      expect(player.pitching.sharpness).toBeGreaterThan(0)
      // 変化球の得意な投手のキレが平均以下に落ちてはいけない
      expect(player.pitching.sharpness).toBeGreaterThanOrEqual(
        Math.min(player.pitching.breaking, player.pitching.control) - 1,
      )
    }
  })

  it('未来のバージョンは読み込まない', () => {
    const state = createInitialState({ seed: 2 })
    expect(migrate({ ...state, version: SAVE_VERSION + 1 })).toBeNull()
  })

  it('壊れたデータは null になる', () => {
    expect(migrate(null)).toBeNull()
    expect(migrate('文字列')).toBeNull()
    expect(migrate([])).toBeNull()
    expect(migrate({})).toBeNull()
    expect(migrate({ version: SAVE_VERSION, players: [] })).toBeNull()
  })
})

describe('v38 → v39（適性を5段階へ）', () => {
  it('記号の適性を段数に読み替える', () => {
    // 記号で持っていた頃のセーブを作る
    const state = createInitialState({ seed: 5 })
    const letters = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
    const base = JSON.parse(
      JSON.stringify({
        ...state,
        version: 38,
        players: state.players.map((player, index) => ({
          ...player,
          aptitudes: Object.fromEntries(
            ALL_POSITIONS.map((position, i) => [position, letters[(index + i) % letters.length]]),
          ),
        })),
      }),
    )
    const migrated = migrate(base)

    expect(migrated).not.toBeNull()
    for (const player of migrated!.players) {
      for (const position of ALL_POSITIONS) {
        const aptitude = player.aptitudes[position]
        expect(Number.isInteger(aptitude)).toBe(true)
        expect(aptitude).toBeGreaterThanOrEqual(0)
        expect(aptitude).toBeLessThanOrEqual(APTITUDE_MAX)
      }
      // 本職は必ず最上段。ここが下がると本職の位置で全力を出せない
      expect(player.aptitudes[player.position]).toBe(APTITUDE_MAX)
    }
  })
})
