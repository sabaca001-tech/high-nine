import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { positionGroupOf } from '@/core/lineup/aptitude'
import { createInitialRoster } from './createPlayer'
import { createRivals } from '@/core/rival/rivals'
import { overallRating } from './rating'
import {
  activeU18Players,
  ourU18Players,
  resolveU18Squad,
  selectU18Squad,
  U18_MAX_PER_SCHOOL,
  U18_MIN_GRADE,
  U18_MIN_SECOND_YEARS,
  U18_QUOTA,
  U18_SQUAD_SIZE,
} from './u18Squad'
import type { Player } from '@/core/types/player'

const schools = createRivals(createRng(7), 'kanagawa')
const ourPlayers = createInitialRoster(createRng(3))
const squad = selectU18Squad({ schools, ourPlayers, year: 5 })

const context = {
  schools,
  ourPlayers,
  ourSchoolName: 'さくら第一高校',
  year: 5,
}

describe('selectU18Squad', () => {
  it('全国から30人選ばれる', () => {
    // 「うちから何人選ばれたか」だけだった頃は、
    // 他の29人が誰なのか、どの学校から来ているのかが見えなかった
    expect(squad.members).toHaveLength(U18_SQUAD_SIZE)
    expect(squad.year).toBe(5)
  })

  it('1校から3人以上は選ばれない', () => {
    const perSchool = new Map<string, number>()
    for (const member of squad.members) {
      const key = member.schoolId ?? 'ours'
      perSchool.set(key, (perSchool.get(key) ?? 0) + 1)
    }
    for (const count of perSchool.values()) {
      expect(count).toBeLessThanOrEqual(U18_MAX_PER_SCHOOL)
    }
  })

  it('複数の学校から集まる', () => {
    const ids = new Set(squad.members.map((member) => member.schoolId))
    expect(ids.size).toBeGreaterThan(10)
  })

  it('1年生は選ばれない', () => {
    for (const player of activeU18Players(resolveU18Squad(squad, context))) {
      expect(player.grade).toBeGreaterThanOrEqual(U18_MIN_GRADE)
    }
  })

  it('実力順に選ばれる（いちばん下より上の選手が漏れていない）', () => {
    const ratings = activeU18Players(resolveU18Squad(squad, context)).map(overallRating)
    const bar = Math.min(...ratings)

    // 自校に、選ばれていないのに当落線を超えている上級生が居てはいけない
    const chosen = new Set(ourU18Players(squad, ourPlayers).map((player) => player.id))
    for (const player of ourPlayers) {
      if (chosen.has(player.id)) continue
      if (player.grade < U18_MIN_GRADE) continue
      // 1校2人までの枠で漏れることはあるので、上位2人だけを見る
      const better = ourPlayers.filter(
        (other) =>
          other.grade >= U18_MIN_GRADE && overallRating(other) > overallRating(player),
      ).length
      if (better < U18_MAX_PER_SCHOOL) {
        expect(overallRating(player)).toBeLessThanOrEqual(bar)
      }
    }
  })

  it('保存するのは選考時の姿まで（記録は落とす）', () => {
    // 在籍中は種から作り直すが、卒業したあとの控えとして姿だけ写す
    const json = JSON.parse(JSON.stringify(squad))
    for (const member of json.members) {
      expect(Object.keys(member).sort()).toEqual([
        'grade',
        'name',
        'playerId',
        'schoolId',
        'snapshot',
      ])
      // 記録は落とす。名簿には要らないうえ、30人ぶんだと嵩む
      expect(member.snapshot.history).toEqual([])
    }
  })
})

describe('resolveU18Squad', () => {
  it('保存した id から今の選手を引き当てる', () => {
    const entries = resolveU18Squad(squad, context)
    expect(entries).toHaveLength(squad.members.length)
    expect(activeU18Players(entries).length).toBe(squad.members.length)
    for (const entry of entries) expect(entry.schoolName).toBeTruthy()
  })

  it('能力は引き当てるたびに今の値になる', () => {
    // **選考後に伸びたぶんがそのまま名簿に出る。**
    // 選考時の能力を保存していると、名簿だけ古いままになる
    const grown = ourPlayers.map((player) => ({
      ...player,
      batting: { ...player.batting, meet: 99, power: 99 },
    }))
    const before = resolveU18Squad(squad, context).find((entry) => entry.ours)
    const after = resolveU18Squad(squad, { ...context, ourPlayers: grown }).find(
      (entry) => entry.ours,
    )

    if (before?.player && after?.player) {
      expect(overallRating(after.player)).toBeGreaterThan(overallRating(before.player))
    }
  })

  it('卒業しても、選考した年の姿で名簿に残る', () => {
    // **代表の3分の2は3年生。** 年度が替わった途端に名簿の大半が
    // 空欄になるのでは、次の選考まで読む意味が無い
    const entries = resolveU18Squad(squad, { ...context, year: 8 })
    const gone = entries.filter((entry) => entry.graduated)

    expect(gone.length).toBeGreaterThan(0)
    // 他校の卒業生は、当時の能力つきで引ける
    expect(gone.filter((entry) => !entry.ours).every((entry) => entry.player !== null)).toBe(true)
    expect(activeU18Players(entries).length).toBeLessThan(entries.length)
  })

  it('自校の選手には印が付く', () => {
    const entries = resolveU18Squad(squad, context)
    const ours = entries.filter((entry) => entry.ours)
    expect(ours.every((entry) => entry.schoolName === 'さくら第一高校')).toBe(true)
    expect(ourU18Players(squad, ourPlayers)).toHaveLength(ours.length)
  })
})

describe('代表の水準', () => {
  it('90超えは数人、95以上は居るか居ないか', () => {
    // **全員が95以上では、自校の選手がどう育っても届かない。**
    // 他校の選手は練習の頭打ち（自校）と違って生成されるだけなので、
    // 学校の力を素質に変えるところで詰めてある（`rosterTalentOf`）
    const schools = createRivals(createRng(20), 'kanagawa', 1)
    const squad = selectU18Squad({ schools, ourPlayers: [], year: 5, progress: 0.6 })
    const ratings = squad.members
      .map((member) => (member.snapshot ? overallRating(member.snapshot) : 0))
      .sort((a, b) => b - a)

    /*
     * **ここでは学校を1年も進めていない**（注目選手は伸びず、戦力も揺れない）ので、
     * 実プレイより一段低く出る。
     *
     * **横一線にならないことのほうが大事。** 全員が同じくらいの能力だと、
     * 「今年の代表にはとんでもないのが1人いる」という年が生まれず、
     * 代表を見に行く意味も、そこへ届くかどうかの手応えも出てこない。
     * 傑物（`STANDOUT_CHANCE`）が数人だけ混ざる形にしてある。
     */
    // 全員が95以上では、自校の選手がどう育っても届かない
    expect(ratings.filter((rating) => rating >= 95).length).toBeLessThanOrEqual(10)
    // 上と下でしっかり開く（横一線でない）
    expect(ratings[0] - ratings[29]).toBeGreaterThanOrEqual(12)
    // 逆に弱すぎても代表の意味が無い
    expect(ratings[0]).toBeGreaterThanOrEqual(90)
  })
})

describe('球速の水準', () => {
  it('代表でも160km/hはまず出ない', () => {
    const schools = createRivals(createRng(20), 'kanagawa', 1)
    const squad = selectU18Squad({ schools, ourPlayers: [], year: 5, progress: 0.6 })
    const velocities = squad.members
      .map((member) => member.snapshot?.pitching?.velocity)
      .filter((value): value is number => value !== undefined)

    expect(velocities.length).toBeGreaterThan(0)
    expect(Math.max(...velocities)).toBeLessThan(160)
  })
})

describe('ポジションごとの枠', () => {
  it('系統ごとに人数が決まっている', () => {
    /*
     * **評価点順に30人を切ると、捕手が1人も居ない代表ができた。**
     * 実際の代表はポジションごとに人数を決めて選ぶ。
     */
    const squad = selectU18Squad({
      schools,
      ourPlayers: createInitialRoster(createRng(9)),
      year: 4,
    })

    const counts = new Map<string, number>()
    for (const member of squad.members) {
      const group = positionGroupOf(member.snapshot!)
      counts.set(group, (counts.get(group) ?? 0) + 1)
    }

    expect(squad.members).toHaveLength(U18_SQUAD_SIZE)
    expect(counts.get('pitcher')).toBe(U18_QUOTA.pitcher)
    expect(counts.get('catcher')).toBe(U18_QUOTA.catcher)
  })

  it('来年に向けて2年生が入る', () => {
    // 系統で枠を分けても、同じ系統に3年生が並べば2年生は押し出される
    const squad = selectU18Squad({
      schools,
      ourPlayers: createInitialRoster(createRng(9)),
      year: 4,
    })

    const juniors = squad.members.filter((member) => member.grade === 2)
    expect(juniors.length).toBeGreaterThanOrEqual(U18_MIN_SECOND_YEARS)
  })

  it('強い下級生が、同じ学校の3年生に押し出されない', () => {
    /*
     * **1校の候補を評価点上位2人で切っていた頃の穴。**
     * 3年生2人で枠が埋まるので、全国屈指の2年生を抱えていても呼ばれなかった。
     */
    const base = createInitialRoster(createRng(9))
    const boost = (player: Player, level: number, grade: 2 | 3): Player => ({
      ...player,
      grade,
      batting: {
        ...player.batting,
        meet: level,
        power: level,
        speed: level,
        arm: level,
        fielding: level,
        catching: level,
      },
    })

    const outfielders = base.filter((player) => positionGroupOf(player) === 'outfield')
    if (outfielders.length < 2) return

    const ours = base.map((player) => {
      if (player.id === outfielders[0].id) return boost(player, 96, 3)
      if (player.id === outfielders[1].id) return boost(player, 93, 2)
      return player
    })

    const squad = selectU18Squad({ schools, ourPlayers: ours, year: 6 })
    const picked = squad.members.filter((member) => member.schoolId === null)

    expect(picked.some((member) => member.playerId === outfielders[1].id)).toBe(true)
  })
})
