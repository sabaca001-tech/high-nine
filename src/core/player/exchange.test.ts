/** 留学生 */

import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createPlayer, createGrowthAptitude, EXCHANGE_RATE } from './createPlayer'
import { EXCHANGE_NAME_MAX, EXCHANGE_NAME_PARTS, pickExchangeName } from './exchangeNames'
import { battingRating, overallRating } from './rating'

/** 留学生を1人作る */
function exchangePlayer(seed: number, isPitcher: boolean) {
  return createPlayer(createRng(seed), { id: 'x', grade: 1, isPitcher, exchange: true })
}

function normalPlayer(seed: number, isPitcher: boolean) {
  return createPlayer(createRng(seed), { id: 'n', grade: 1, isPitcher, exchange: false })
}

describe('留学生', () => {
  it('留学生として作られたことが分かる', () => {
    expect(exchangePlayer(1, false).origin).toBe('exchange')
    expect(normalPlayer(1, false).origin).toBeUndefined()
  })

  it('カードに収まる長さに収めてある', () => {
    // 長いと選手カードのネームプレートで両方が切れて読めなくなる
    for (const name of [...EXCHANGE_NAME_PARTS.surnames, ...EXCHANGE_NAME_PARTS.givenNames]) {
      expect(name.length).toBeLessThanOrEqual(EXCHANGE_NAME_MAX)
    }
  })

  it('名前は姓名とも重複を避けて作られる', () => {
    const rng = createRng(9)
    const names: string[] = []
    for (let i = 0; i < 20; i++) {
      const name = pickExchangeName(rng, names)
      expect(names).not.toContain(name)
      names.push(name)
    }
  })

  it('野手はパワー・走力・肩力に寄り、そのぶん技術が下がる', () => {
    let physical = 0
    let technical = 0

    for (let seed = 1; seed <= 60; seed++) {
      const exchange = exchangePlayer(seed, false)
      const normal = normalPlayer(seed, false)

      physical +=
        exchange.batting.power - normal.batting.power +
        (exchange.batting.speed - normal.batting.speed) +
        (exchange.batting.arm - normal.batting.arm)
      technical +=
        exchange.batting.meet - normal.batting.meet +
        (exchange.batting.fielding - normal.batting.fielding) +
        (exchange.batting.catching - normal.batting.catching)
    }

    expect(physical).toBeGreaterThan(0)
    expect(technical).toBeLessThan(0)
  })

  it('総合は変わらない（凸凹が変わるだけ）', () => {
    let diff = 0
    for (let seed = 1; seed <= 60; seed++) {
      diff += battingRating(exchangePlayer(seed, false).batting) -
        battingRating(normalPlayer(seed, false).batting)
    }
    // 60人ぶんの合計。丸めのぶんしかずれない
    expect(Math.abs(diff / 60)).toBeLessThan(1)
  })

  it('投手は球速とスタミナが上がる', () => {
    let velocity = 0
    let stamina = 0

    for (let seed = 1; seed <= 60; seed++) {
      const exchange = exchangePlayer(seed, true).pitching!
      const normal = normalPlayer(seed, true).pitching!
      velocity += exchange.velocity - normal.velocity
      stamina += exchange.stamina - normal.stamina
    }

    expect(velocity).toBeGreaterThan(0)
    expect(stamina).toBeGreaterThan(0)
  })

  it('投手の総合が突き抜けない（制球と変化球を引いている）', () => {
    let diff = 0
    for (let seed = 1; seed <= 60; seed++) {
      diff += overallRating(exchangePlayer(seed, true)) - overallRating(normalPlayer(seed, true))
    }
    expect(diff / 60).toBeLessThan(4)
  })

  it('身体能力の伸び代が上乗せされる', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = () => createRng(seed)
      const fielder = createGrowthAptitude(rng(), false, true)
      const plain = createGrowthAptitude(rng(), false, false)

      expect(fielder.power!).toBeGreaterThanOrEqual(plain.power!)
      expect(fielder.speed!).toBeGreaterThanOrEqual(plain.speed!)
      expect(fielder.arm!).toBeGreaterThanOrEqual(plain.arm!)
      // 技術の伸び代には手を付けない
      expect(fielder.meet).toBe(plain.meet)
    }
  })

  it('出現率は天才肌と同じくらい（数十人に1人）', () => {
    const rng = createRng(4242)
    let count = 0
    const TRIALS = 4000

    for (let i = 0; i < TRIALS; i++) {
      if (createPlayer(rng, { id: `p${i}`, grade: 1 }).origin === 'exchange') count += 1
    }

    const rate = count / TRIALS
    expect(rate).toBeGreaterThan(EXCHANGE_RATE * 0.5)
    expect(rate).toBeLessThan(EXCHANGE_RATE * 2)
  })
})
