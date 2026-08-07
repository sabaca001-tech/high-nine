import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import {
  advanceManagers,
  findManagerRole,
  managerConditionCost,
  managerDefenseBonus,
  managerFundsRate,
  managerGrowthBonus,
  managerRecovery,
  MANAGER_JOIN_CHANCE,
  MANAGER_ROLES,
  rollManagerJoin,
} from './managers'
import type { TeamManager } from './managers'

function manager(roleId: TeamManager['roleId'], grade: TeamManager['grade'] = 1): TeamManager {
  return { id: `m-${roleId}`, name: `テスト ${roleId}`, roleId, grade, joinedYear: 1 }
}

describe('MANAGER_ROLES', () => {
  it('idが重複しない', () => {
    expect(new Set(MANAGER_ROLES.map((role) => role.id)).size).toBe(MANAGER_ROLES.length)
  })

  it('findManagerRole で引ける', () => {
    expect(findManagerRole('recorder')?.label).toBe('記録係')
    expect(findManagerRole('存在しない')).toBeUndefined()
  })
})

describe('rollManagerJoin', () => {
  it('3年に1人くらいの頻度で入部してくる', () => {
    let joined = 0
    const trials = 3000
    for (let seed = 1; seed <= trials; seed++) {
      const result = rollManagerJoin(createRng(seed), {
        managers: [],
        year: 1,
        serial: seed,
        takenNames: [],
      })
      if (result) joined++
    }

    const rate = joined / trials
    expect(rate).toBeGreaterThan(MANAGER_JOIN_CHANCE - 0.05)
    expect(rate).toBeLessThan(MANAGER_JOIN_CHANCE + 0.05)
  })

  it('1年生として入部する', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = rollManagerJoin(createRng(seed), {
        managers: [],
        year: 3,
        serial: seed,
        takenNames: [],
      })
      if (result) {
        expect(result.manager.grade).toBe(1)
        expect(result.manager.joinedYear).toBe(3)
        return
      }
    }
    throw new Error('200回試しても誰も入部しなかった')
  })

  it('すでに在籍している役割は選ばれない', () => {
    const existing = [manager('recorder')]
    for (let seed = 1; seed <= 300; seed++) {
      const result = rollManagerJoin(createRng(seed), {
        managers: existing,
        year: 1,
        serial: seed,
        takenNames: [],
      })
      if (result) expect(result.manager.roleId).not.toBe('recorder')
    }
  })

  it('全部の役割が埋まっていれば入部しない', () => {
    const full = MANAGER_ROLES.map((role) => manager(role.id))
    for (let seed = 1; seed <= 100; seed++) {
      const result = rollManagerJoin(createRng(seed), {
        managers: full,
        year: 1,
        serial: seed,
        takenNames: [],
      })
      expect(result).toBeNull()
    }
  })

  it('部員と同じ名前は避ける', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const result = rollManagerJoin(createRng(seed), {
        managers: [],
        year: 1,
        serial: seed,
        takenNames: [],
      })
      if (!result) continue

      const again = rollManagerJoin(createRng(seed), {
        managers: [],
        year: 1,
        serial: seed,
        takenNames: [result.manager.name],
      })
      // 同じシードでも、使われている名前は避けて別の名前になる
      if (again) expect(again.manager.name).not.toBe(result.manager.name)
      return
    }
    throw new Error('入部する例が見つからなかった')
  })
})

describe('advanceManagers', () => {
  it('3年生は卒業し、下級生は進級する', () => {
    const change = advanceManagers(createRng(1), {
      managers: [manager('recorder', 3), manager('trainer', 1)],
      year: 2,
      serial: 100,
      takenNames: [],
    })

    expect(change.graduated.map((m) => m.roleId)).toEqual(['recorder'])
    const trainer = change.managers.find((m) => m.roleId === 'trainer')
    expect(trainer?.grade).toBe(2)
  })

  it('卒業した役割は、その年から空きとして扱われる', () => {
    // 記録係が卒業した直後は、記録係が入部してくることもありうる
    let sawRecorder = false
    for (let seed = 1; seed <= 400; seed++) {
      const change = advanceManagers(createRng(seed), {
        managers: [manager('recorder', 3)],
        year: 2,
        serial: seed,
        takenNames: [],
      })
      if (change.joined?.roleId === 'recorder') sawRecorder = true
    }
    expect(sawRecorder).toBe(true)
  })

  it('何年も回すと、いない年もいっぱいいる年も出る', () => {
    let managers: TeamManager[] = []
    let serial = 1
    const counts: number[] = []

    const rng = createRng(7)
    for (let year = 2; year <= 60; year++) {
      const change = advanceManagers(rng, { managers, year, serial, takenNames: [] })
      managers = change.managers
      serial = change.serial
      counts.push(managers.length)
    }

    expect(Math.min(...counts)).toBe(0)
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(2)
    // 3年在籍・年1/3で入部なので、平均するとおよそ1人
    const average = counts.reduce((sum, n) => sum + n, 0) / counts.length
    expect(average).toBeGreaterThan(0.4)
    expect(average).toBeLessThan(2)
  })

  it('serial を消費するのは入部したときだけ', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const change = advanceManagers(createRng(seed), {
        managers: [],
        year: 2,
        serial: 500,
        takenNames: [],
      })
      expect(change.serial).toBe(change.joined ? 501 : 500)
    }
  })
})

describe('マネージャーの効果', () => {
  it('役割ごとに別の効果を持つ', () => {
    expect(managerGrowthBonus([manager('recorder')])).toBeGreaterThan(1)
    expect(managerConditionCost([manager('nutritionist')])).toBeLessThan(1)
    expect(managerRecovery([manager('trainer')])).toBeGreaterThan(0)
    expect(managerDefenseBonus([manager('analyst')])).toBeGreaterThan(0)
    expect(managerFundsRate([manager('chief')])).toBeGreaterThan(1)
  })

  it('誰も在籍していなければ効果は無い', () => {
    expect(managerGrowthBonus([])).toBe(1)
    expect(managerConditionCost([])).toBe(1)
    expect(managerRecovery([])).toBe(0)
    expect(managerDefenseBonus([])).toBe(0)
    expect(managerFundsRate([])).toBe(1)
  })

  it('担当外のマネージャーには効果が乗らない', () => {
    expect(managerGrowthBonus([manager('trainer')])).toBe(1)
    expect(managerFundsRate([manager('analyst')])).toBe(1)
  })

  it('複数在籍していれば、それぞれの効果が同時に乗る', () => {
    const both = [manager('recorder'), manager('chief')]
    expect(managerGrowthBonus(both)).toBeGreaterThan(1)
    expect(managerFundsRate(both)).toBeGreaterThan(1)
  })
})
