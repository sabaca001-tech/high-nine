import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
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
  U18_SQUAD_SIZE,
} from './u18Squad'

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
