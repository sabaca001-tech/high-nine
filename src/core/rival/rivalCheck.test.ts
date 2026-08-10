import { describe, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { createRivals, localRivals, nationalRivals, nationalRepresentatives } from './rivals'
import { lineupRatingOf } from './rivalRoster'

describe('診断: 他校の強さ', () => {
  it('スタメン平均総合の分布を出す', () => {
    const rng = createRng(20)
    const schools = createRivals(rng, 'kanagawa', 1)
    const local = localRivals(schools, 'kanagawa')
    const national = nationalRivals(schools, 'kanagawa')

    const show = (label: string, list: typeof schools) => {
      const rated = list
        .map((school) => ({ school, rating: lineupRatingOf(school, 3, 8) }))
        .sort((a, b) => b.rating - a.rating)
      const values = rated.map((r) => r.rating)
      const at = (p: number) => values[Math.floor(values.length * p)]
      console.log(
        `${label} ${list.length}校 最高${values[0].toFixed(1)} 上位1%${at(0.01).toFixed(1)} 上位5%${at(0.05).toFixed(1)} 中央${at(0.5).toFixed(1)} 最低${values[values.length - 1].toFixed(1)}`,
      )
      console.log(`  上位5校: ${rated.slice(0, 5).map((r) => `${r.school.name}${r.rating.toFixed(0)}(地力${r.school.tradition})`).join(' ')}`)
    }

    show('県内', local)
    show('県外', national)
    show('甲子園代表', nationalRepresentatives(schools, 'kanagawa'))

    // 年度をまたぐと下がり、その年のうちに戻していく
    const top = [...local].sort((a, b) => b.tradition - a.tradition)[0]
    console.log(
      `${top.name} 3年目4月${lineupRatingOf(top, 3, 4).toFixed(1)} → 8月${lineupRatingOf(top, 3, 8).toFixed(1)} → 3月${lineupRatingOf(top, 3, 3).toFixed(1)} → 4年目4月${lineupRatingOf(top, 4, 4).toFixed(1)} → 3月${lineupRatingOf(top, 4, 3).toFixed(1)}`,
    )
  }, 300000)
})
