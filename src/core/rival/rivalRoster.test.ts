import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createRivals, localRivals } from './rivals'
import type { RivalSchool } from './rivals'
import { lineupRatingOf, rivalRoster } from './rivalRoster'
import { starsOf } from './rivals'
import { overallRating } from '@/core/player/rating'

const schools = createRivals(createRng(7), 'kanagawa')
const school = schools[0]

describe('rivalRoster', () => {
  it('同じ学校・同じ年なら必ず同じ名簿になる', () => {
    // **保存していない。** 毎回作り直すので、ここがぶれると
    // 同じ学校と2回戦うたびに別人が出てくる
    expect(rivalRoster(school, 3)).toEqual(rivalRoster(school, 3))
  })

  it('学校が違えば別の名簿になる', () => {
    const a = rivalRoster(schools[0], 3).map((p) => p.name)
    const b = rivalRoster(schools[1], 3).map((p) => p.name)
    expect(a).not.toEqual(b)
  })

  it('スタメンを組めるだけの人数がいる', () => {
    const roster = rivalRoster(school, 3)
    expect(roster.length).toBeGreaterThanOrEqual(9)
    expect(roster.filter((p) => p.isPitcher).length).toBeGreaterThanOrEqual(2)
  })

  it('3学年そろっている', () => {
    const grades = new Set(rivalRoster(school, 3).map((p) => p.grade))
    expect([...grades].sort()).toEqual([1, 2, 3])
  })

  it('同じ学年に同姓同名がいない', () => {
    // 学年をまたいだ重複は避けていない（避けると学年が上がったときに
    // 名前が変わってしまう）。120×120の名前から選ぶので滅多に起きない
    for (const grade of [1, 2, 3]) {
      const names = rivalRoster(school, 3)
        .filter((p) => p.grade === grade)
        .map((p) => p.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('今年の1年生は、来年は同じ名前の2年生として残る', () => {
    // **世代交代が繋がる。** 毎年まるごと別人になると
    // 「あの学校のあの選手」という手応えが生まれない。
    //
    // 注目選手は「学年」で名簿に差し込まれるので、ここでは外して
    // 生成される代そのものの繋がりを見る
    const plain: RivalSchool = { ...school, stars: [] }
    const thisYear = rivalRoster(plain, 5).filter((p) => p.grade === 1)
    const nextYear = rivalRoster(plain, 6).filter((p) => p.grade === 2)

    expect(nextYear.map((p) => p.name)).toEqual(thisYear.map((p) => p.name))
  })

  it('3年生は翌年に卒業して名簿から消える', () => {
    const plain: RivalSchool = { ...school, stars: [] }
    const seniors = rivalRoster(plain, 5).filter((p) => p.grade === 3)
    const nextYear = rivalRoster(plain, 6).map((p) => p.name)

    for (const senior of seniors) expect(nextYear).not.toContain(senior.name)
  })

  it('戦力が高い学校ほど部員も強い', () => {
    const weak: RivalSchool = { ...school, strength: -10 }
    const strong: RivalSchool = { ...school, strength: 20 }
    const average = (s: RivalSchool) => {
      const roster = rivalRoster(s, 3)
      return roster.reduce((sum, p) => sum + overallRating(p), 0) / roster.length
    }
    expect(average(strong)).toBeGreaterThan(average(weak))
  })

  it('注目選手が名簿に入っている', () => {
    // 開始時（1年目）の注目選手は入学年を持つので、在学中の年で引く
    const star = starsOf(school)[0]
    const year = (star.enrolledYear ?? 1) + (3 - star.grade)
    expect(rivalRoster(school, year).map((p) => p.name)).toContain(star.name)
  })

  it('開始時の注目選手も、3年経てば名簿から消える', () => {
    // 入学年を持たせていなかった頃は、開始時の3年生が
    // 何年経っても3年生のまま名簿に居座っていた
    const senior = starsOf(school).find((s) => s.grade === 3)
    if (!senior) return
    expect(rivalRoster(school, 5).map((p) => p.name)).not.toContain(senior.name)
  })

  it('スカウトで逃した選手はその学校に在籍し、印が付く', () => {
    const withScouted: RivalSchool = {
      ...school,
      stars: [
        {
          id: 'chased',
          name: '追いかけ 太郎',
          grade: 1,
          isPitcher: false,
          rating: 62,
          enrolledYear: 5,
          scouted: true,
        },
      ],
    }

    const roster = rivalRoster(withScouted, 5)
    const found = roster.find((player) => player.name === '追いかけ 太郎')

    expect(found).toBeDefined()
    expect(found!.grade).toBe(1)
    expect(found!.origin).toBe('scout')
    // 素質どおりの能力で入学している（素質62と書いてあった選手が総合40では困る）
    expect(overallRating(found!)).toBeGreaterThan(50)
  })

  it('注目選手を混ぜても部員数は増えない', () => {
    const withScouted: RivalSchool = {
      ...school,
      stars: [
        {
          id: 'chased',
          name: '追いかけ 太郎',
          grade: 1,
          isPitcher: false,
          rating: 62,
          enrolledYear: 5,
          scouted: true,
        },
      ],
    }
    expect(rivalRoster(withScouted, 5)).toHaveLength(rivalRoster(school, 5).length)
  })

  it('卒業した注目選手は名簿に出てこない', () => {
    const graduated: RivalSchool = {
      ...school,
      stars: [
        {
          id: 'old',
          name: '卒業 済',
          grade: 3,
          isPitcher: false,
          rating: 70,
          enrolledYear: 1,
        },
      ],
    }
    expect(rivalRoster(graduated, 5).map((p) => p.name)).not.toContain('卒業 済')
  })
})

describe('idの重複', () => {
  it('名簿の中に同じidの選手が2人いない', () => {
    // **注目選手の id と形式が同じだった。**
    // U18の名簿は id で選手を引き当てるので、重複すると別人を掴む
    for (const target of schools.slice(0, 12)) {
      for (const year of [3, 5, 8]) {
        const ids = rivalRoster(target, year).map((player) => player.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
  })

  it('注目選手のidとぶつからない', () => {
    const withStars = schools.find((s) => starsOf(s).length > 0)!
    const roster = rivalRoster(withStars, 5)
    const starIds = new Set(starsOf(withStars).map((star) => star.id))
    // 注目選手として差し込まれた1人ぶんを除けば、名簿側と重ならない
    const plain = roster.filter((player) => !starIds.has(player.id))
    for (const player of plain) expect(starIds.has(player.id)).toBe(false)
  })
})

describe('年度の中で伸び、卒業で一度下がる', () => {
  const schools = createRivals(createRng(31), 'kanagawa', 1)
  const local = localRivals(schools, 'kanagawa').slice(0, 60)
  /** 年度の頭（0）と年度末（1） */
  const START = 0
  const END = 1
  const average = (year: number, progress: number) =>
    local.reduce((sum, school) => sum + lineupRatingOf(school, year, progress), 0) / local.length

  it('年度の頭より終わりのほうが強い（年度の中で伸びる）', () => {
    expect(average(3, END)).toBeGreaterThan(average(3, START) + 3)
  })

  it('年度が替わると下がる（3年生が抜ける）', () => {
    // こちらの卒業と同じタイミングで、他校も3年生を送り出す
    expect(average(4, START)).toBeLessThan(average(3, END) - 3)
  })

  it('伸びは少しずつで、途中で大きく跳ねない', () => {
    // 月にまとめて動かしていた頃は、月をまたいだ途端に相手が1段強くなった
    let previous = average(3, 0)
    for (let step = 1; step <= 12; step++) {
      const now = average(3, step / 12)
      expect(now - previous).toBeLessThan(2)
      previous = now
    }
  })

  it('同じ月どうしで比べると弱くならない', () => {
    // 下がりっぱなしだと、年を追うごとに世界が弱体化していく。
    // **注目選手を抱えない学校で見る。** 注目選手は `advanceRival` が
    // 毎年立て直すもので、学校を据え置いたまま年だけ進めると
    // 卒業して減っていくだけになる
    const plain = local.filter((school) => !school.notable)
    const plainAverage = (year: number) =>
      plain.reduce((sum, school) => sum + lineupRatingOf(school, year, START), 0) / plain.length

    expect(plainAverage(4)).toBeGreaterThan(plainAverage(3) - 1)
    expect(plainAverage(5)).toBeGreaterThan(plainAverage(3) - 1)
  })

  it('選手ひとりの能力は年度をまたいでも途切れない', () => {
    const school = local[0]
    const march = rivalRoster(school, 3, END).filter((player) => player.grade === 1)
    const april = rivalRoster(school, 4, START).filter((player) => player.grade === 2)

    // 3月の1年生（学年ベース36＋1年ぶんの伸び）と、
    // 4月の2年生（学年ベース44）がほぼ並ぶ
    const before = march.reduce((sum, p) => sum + overallRating(p), 0) / march.length
    const after = april.reduce((sum, p) => sum + overallRating(p), 0) / april.length
    expect(Math.abs(after - before)).toBeLessThan(4)
  })
})
