import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { findRegion, REGIONS } from '@/core/types/region'
import { lineupRatingOf } from './rivalRoster'
import {
  addStar,
  bestStarRating,
  localRivals,
  addResult,
  hasMet,
  recordOf,
  starsOf,
  NATIONAL_RIVALS,
  NATIONAL_SCHOOLS_PER_REGION,
  nationalRepresentatives,
  nationalRivals,
  upperStarRatingAtRank,
  classBonus,
  CLASS_SPREAD,
  rosterPowerOf,
  advanceRival,
  createRivals,
  pickRivalFor,
  RIVALS_PER_REGION,
  schoolForProspect,
} from './rivals'

const rivals = createRivals(createRng(11), 'kanagawa')

describe('starRatingAtRank', () => {
  it('上から数えた順位の総合を返す（U18の当落線）', () => {
    const ratings = rivals
      .flatMap((school) => starsOf(school).filter((star) => star.grade >= 2))
      .map((star) => star.rating)
      .sort((a, b) => b - a)

    expect(upperStarRatingAtRank(rivals, 0)).toBe(ratings[0])
    expect(upperStarRatingAtRank(rivals, 17)).toBe(ratings[17])
  })

  it('人数が足りなければいちばん下を返す', () => {
    expect(upperStarRatingAtRank(rivals, 9999)).toBeGreaterThan(0)
    expect(upperStarRatingAtRank([], 0)).toBe(0)
  })

  it('順位が下がるほど総合も下がる', () => {
    expect(upperStarRatingAtRank(rivals, 17)).toBeLessThanOrEqual(
      upperStarRatingAtRank(rivals, 0),
    )
  })
})

describe('bestStarRating', () => {
  it('県内でいちばん強い注目選手を返す（U18の選考基準）', () => {
    const highest = Math.max(...rivals.flatMap((s) => starsOf(s).map((star) => star.rating)))
    expect(bestStarRating(rivals)).toBe(highest)
  })

  it('学校がいなければ0', () => {
    expect(bestStarRating([])).toBe(0)
  })
})

describe('createRivals', () => {
  it('県内は参加校ぶん全部、県外は全国クラスだけを作る', () => {
    // **県内は全校。** トーナメント表で勝ち上がりを見せるには、
    // 参加校がそのまま存在していないといけない
    const local = localRivals(rivals, 'kanagawa')
    expect(local).toHaveLength(findRegion('kanagawa').schools)
    expect(nationalRivals(rivals, 'kanagawa')).toHaveLength(NATIONAL_RIVALS)
    expect(rivals).toHaveLength(local.length + NATIONAL_RIVALS)
  })

  it('注目選手を持つのは名の通った学校だけ', () => {
    // 全校に置くと、U18の選考基準が注目選手の数に引きずられる
    const local = localRivals(rivals, 'kanagawa')
    expect(local.filter((school) => starsOf(school).length > 0)).toHaveLength(RIVALS_PER_REGION)
  })

  it('県内に格上が十分いる', () => {
    // **格下ばかりでは県大会が作業になる。** 校数のピラミッドから引くので、
    // 甲子園常連クラス（地力28以上）も数校は出てくる
    const local = localRivals(rivals, 'kanagawa')
    expect(local.filter((school) => school.tradition >= 28).length).toBeGreaterThanOrEqual(2)
    expect(local.filter((school) => school.tradition >= 18).length).toBeGreaterThanOrEqual(8)
  })

  it('県外は全国に散らし、1県に複数校ずつ置く', () => {
    // 1県1校だった頃は、遠征で同じ県へ行くたびに必ず同じ学校が出てきた
    const regions = nationalRivals(rivals, 'kanagawa').map((school) => school.regionId)
    expect(new Set(regions).size).toBe(REGIONS.length - 1)
    expect(regions).not.toContain('kanagawa')

    for (const region of new Set(regions)) {
      expect(regions.filter((id) => id === region)).toHaveLength(NATIONAL_SCHOOLS_PER_REGION)
    }
  })

  it('全国大会に出てくるのは各県から1校だけ', () => {
    // 甲子園は各県1代表。そのまま並べると同じ県から何校も出てくる
    const reps = nationalRepresentatives(rivals, 'kanagawa')
    expect(reps).toHaveLength(REGIONS.length - 1)
    expect(new Set(reps.map((s) => s.regionId)).size).toBe(reps.length)

    // その年いちばん戦力の高い学校が代表になる
    for (const rep of reps) {
      const same = rivals.filter((s) => s.regionId === rep.regionId)
      expect(rep.strength).toBe(Math.max(...same.map((s) => s.strength)))
    }
  })

  it('甲子園に出てくる代表校は、県内の平均よりはっきり上', () => {
    // 県外は1県16校あるので、平均を取ると中堅まで混ざる。
    // 全国大会に出てくるのは各県の筆頭なので、そこで比べる
    const avg = (list: typeof rivals) =>
      list.reduce((total, school) => total + school.tradition, 0) / list.length

    expect(avg(nationalRepresentatives(rivals, 'kanagawa'))).toBeGreaterThan(
      avg(localRivals(rivals, 'kanagawa')),
    )
  })

  it('校名は県の中で重複しない', () => {
    // **全国では避けない。** 946校ぶんの名前を1426通りから引くと
    // 後半で引き当てられなくなる。違う県に同じ校名があるのは現実にもある
    const byRegion = new Map<string, string[]>()
    for (const school of rivals) {
      const names = byRegion.get(school.regionId) ?? []
      names.push(school.name)
      byRegion.set(school.regionId, names)
    }
    for (const names of byRegion.values()) {
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('県内にも必ず1校は強豪がいる（目標になる相手を置く）', () => {
    const local = localRivals(rivals, 'kanagawa')
    expect(Math.max(...local.map((school) => school.tradition))).toBeGreaterThanOrEqual(16)
  })

  it('JSONに変換できる（セーブデータに入れられる）', () => {
    expect(JSON.parse(JSON.stringify(rivals))).toEqual(rivals)
  })
})

describe('advanceRival', () => {
  it('注目選手は進級し、3年生は卒業して補充される', () => {
    const rng = createRng(5)
    const before = rivals[0]
    const after = advanceRival(rng, before, 2).school

    expect(starsOf(after).length).toBe(starsOf(before).length)
    // 3年生だった選手は居なくなっている
    for (const star of starsOf(before).filter((s) => s.grade === 3)) {
      expect(starsOf(after).map((s) => s.id)).not.toContain(star.id)
    }
  })

  it('戦力は地力の周りに留まる（際限なく強くならない）', () => {
    const rng = createRng(9)
    let school = rivals[0]

    for (let year = 2; year <= 30; year++) {
      school = advanceRival(rng, school, year).school
      // 地力 ± ゆらぎ の範囲を大きく外れない
      expect(Math.abs(school.strength - school.tradition)).toBeLessThan(20)
    }
  })

  it('注目選手は在学中ずっと伸びる（自分の学校と同じように育つ）', () => {
    const rng = createRng(3)
    // 1年生の注目選手を1人つかまえて、卒業まで追いかける
    let school = rivals.find((s) => starsOf(s).some((star) => star.grade === 1))!
    const target = starsOf(school).find((star) => star.grade === 1)!
    let previous = target.rating

    for (let year = 2; year <= 3; year++) {
      school = advanceRival(rng, school, year).school
      const now = starsOf(school).find((star) => star.id === target.id)!
      expect(now.rating).toBeGreaterThan(previous)
      previous = now.rating
    }
  })
})

describe('pickRivalFor', () => {
  it('求めた強さに近い学校を当てる', () => {
    const rng = createRng(21)
    const strong = pickRivalFor(rng, rivals, 20)!
    const weak = pickRivalFor(rng, rivals, -10)!

    expect(strong.strength).toBeGreaterThan(weak.strength)
  })

  it('学校がいなければ null（全国大会などは使い捨ての相手にする）', () => {
    expect(pickRivalFor(createRng(1), [], 0)).toBeNull()
  })
})

describe('schoolForProspect', () => {
  it('良い選手ほど強い学校が獲る', () => {
    const rng = createRng(31)
    let strongSum = 0
    let weakSum = 0

    for (let i = 0; i < 40; i++) {
      strongSum += schoolForProspect(rng, rivals, 80)!.strength
      weakSum += schoolForProspect(rng, rivals, 30)!.strength
    }

    expect(strongSum).toBeGreaterThan(weakSum)
  })
})

describe('addStar', () => {
  it('選手が入ると戦力も上がる', () => {
    const before = rivals[3]
    const after = addStar(before, {
      id: 'x',
      name: '新入 生',
      grade: 1,
      isPitcher: false,
      rating: 72,
    })

    expect(starsOf(after).length).toBe(starsOf(before).length + 1)
    expect(after.strength).toBeGreaterThan(before.strength)
  })
})

describe('他校のデータは年を重ねても増えない', () => {
  /**
   * **他校は卒業生を持たない。**
   * 部員は種から作り直す（`rivalRoster`）ので、
   * 学校が抱えるのは名前と数値と注目選手2人だけ。
   * ここが増える構造だと、他校を増やすほどセーブが年々膨らむ。
   */
  it('60年進めても学校1つあたりの大きさが変わらない', () => {
    const rng = createRng(31)
    let school = createRivals(createRng(5), 'kanagawa')[0]
    const before = JSON.stringify(school).length

    for (let year = 2; year <= 60; year++) {
      school = advanceRival(rng, school, year).school
    }

    expect(JSON.stringify(school).length).toBeLessThan(before * 1.2)
  })

  it('注目選手は卒業して入れ替わる（溜まらない）', () => {
    const rng = createRng(32)
    let school = createRivals(createRng(6), 'kanagawa').find((s) => s.notable)!

    for (let year = 2; year <= 40; year++) {
      school = advanceRival(rng, school, year).school
      expect(starsOf(school).length).toBeLessThanOrEqual(2)
      for (const star of starsOf(school)) expect(star.grade).toBeLessThanOrEqual(3)
    }
  })

  it('未対戦の学校は対戦成績を持たない', () => {
    // 946校ぶんの空の記録は、それだけで17KBの無駄になる
    const fresh = createRivals(createRng(9), 'kanagawa')
    expect(fresh.every((school) => school.record === undefined)).toBe(true)
    expect(hasMet(recordOf(fresh[0]))).toBe(false)

    const met = addResult(fresh[0], { year: 3, label: '練習試合', outcome: 'win' })
    expect(hasMet(recordOf(met))).toBe(true)
    expect(recordOf(met).wins).toBe(1)
  })
})

describe('名門校', () => {
  it('どの県にも強豪が数校いる', () => {
    // 抽選任せだと、校数の少ない県には格上が1校も生まれなかった。
    // 1校だけ強くしても、そこを倒した時点で県内に敵がいなくなる
    for (const regionId of ['tottori', 'kanagawa', 'osaka'] as const) {
      const schools = createRivals(createRng(regionId.length * 97), regionId)
      const top = localRivals(schools, regionId)
        .map((school) => school.tradition)
        .sort((a, b) => b - a)

      expect(top[0]).toBeGreaterThanOrEqual(26)
      expect(top[1]).toBeGreaterThanOrEqual(20)
      expect(top[2]).toBeGreaterThanOrEqual(14)
      expect(top[3]).toBeGreaterThanOrEqual(10)
    }
  })

  it('全国には総合Aのスタメンを組む学校がある', () => {
    // 「他校でAに届くところが1つも無い」のは、7,900校もあれば不自然。
    // **夏の時点**で見る（他校も年度の中で伸びるので、4月がいちばん低い）
    const schools = createRivals(createRng(20), 'kanagawa')
    const best = nationalRivals(schools, 'kanagawa')
      .filter((school) => school.tradition >= 50)
      .map((school) => lineupRatingOf(school, 3, 0.4))
      .sort((a, b) => b - a)[0]

    expect(best).toBeGreaterThanOrEqual(80)
  })

  it('代の当たり外れで、県内の序列が入れ替わる', () => {
    const schools = localRivals(createRivals(createRng(12), 'kanagawa'), 'kanagawa')
    const orderAt = (year: number) =>
      [...schools]
        .sort((a, b) => rosterPowerOf(b, year) - rosterPowerOf(a, year))
        .slice(0, 10)
        .map((school) => school.id)
        .join()

    // 良い新入生を迎えた学校が上がり、その代が抜けると落ちる。
    // 戦力（`strength`）を動かさなくても顔ぶれが変わる
    expect(orderAt(5)).not.toBe(orderAt(6))
    expect(orderAt(5)).not.toBe(orderAt(8))
  })

  it('代の出来は、同じ学校・同じ入学年なら必ず同じ', () => {
    // 保存していないので、毎回同じ値が出ないと選手が別人になる
    const school = createRivals(createRng(3), 'kanagawa')[0]
    expect(classBonus(school, 7)).toBe(classBonus(school, 7))
    expect(Math.abs(classBonus(school, 7))).toBeLessThanOrEqual(CLASS_SPREAD)
  })
})
