/** 留学生 */

import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createPlayer, createGrowthAptitude, EXCHANGE_RATE } from './createPlayer'
import {
  EXCHANGE_NAME_MAX,
  EXCHANGE_NAME_PARTS,
  EXCHANGE_NAME_TOTAL_MAX,
  pickExchangeName,
} from './exchangeNames'
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
    // これを超えると、いちばん小さい字でもネームプレートに入らない
    for (const name of [...EXCHANGE_NAME_PARTS.surnames, ...EXCHANGE_NAME_PARTS.givenNames]) {
      expect(name.length).toBeLessThanOrEqual(EXCHANGE_NAME_MAX)
    }
  })

  it('短い名前ばかりにならない（長い名前も出る）', () => {
    // 4文字までに縛っていた頃は、留学生の名前がどれも短く同じ響きに寄っていた。
    // 長い名前は字を小さくして収める（`nameFontSize`）
    const all = [...EXCHANGE_NAME_PARTS.surnames, ...EXCHANGE_NAME_PARTS.givenNames]
    expect(all.filter((name) => name.length >= 5).length).toBeGreaterThan(10)
    expect(all.filter((name) => name.length <= 3).length).toBeGreaterThan(5)
  })

  it('姓と名を合わせても、カードに収まる長さになる', () => {
    // 6文字＋6文字を引くと、いちばん小さい字でも両方が切れて読めなくなる
    const rng = createRng(31)
    const names: string[] = []
    for (let i = 0; i < 300; i++) {
      const name = pickExchangeName(rng, names)
      expect(name.replace(' ', '').length).toBeLessThanOrEqual(EXCHANGE_NAME_TOTAL_MAX)
      names.push(name)
    }
    // 短い名前ばかりに寄せて解決していないことも見る
    expect(names.some((name) => name.replace(' ', '').length >= 9)).toBe(true)
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

    // 上乗せ（`EXCHANGE_TALENT_BONUS`）ぶん、技術も素の値より高くなる。
    // 見たいのは**偏り**なので、身体能力のほうが大きく上がっているかで測る
    expect(physical).toBeGreaterThan(technical)
  })

  it('入学の時点で1学年ぶん上にいる', () => {
    /*
     * **総合を動かしていなかった。** 体つきの偏りだけを付けていたので、
     * 2%しか出ないのに「パワーはあるが総合は普通の1年生」で、
     * 引き当てた実感が薄かった。
     */
    let diff = 0
    for (let seed = 1; seed <= 60; seed++) {
      diff += battingRating(exchangePlayer(seed, false).batting) -
        battingRating(normalPlayer(seed, false).batting)
    }

    const average = diff / 60
    expect(average).toBeGreaterThan(5)
    // ただし天才肌（+20）ほどではない
    expect(average).toBeLessThan(16)
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

  it('投手も、突き抜けはしない（制球と変化球を引いている）', () => {
    let diff = 0
    for (let seed = 1; seed <= 60; seed++) {
      diff += overallRating(exchangePlayer(seed, true)) - overallRating(normalPlayer(seed, true))
    }
    // 上乗せは入るが、制球と変化球を引いているぶん野手ほどは伸びない
    expect(diff / 60).toBeGreaterThan(4)
    expect(diff / 60).toBeLessThan(14)
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
