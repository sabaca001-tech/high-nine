/**
 * 世代交代を挟んだ長期バランスの診断。
 *
 * 「毎年3年生が抜けて新入生が入る」を繰り返したとき、チームの実力が
 * 維持されるかを見る。ここが下がり続けると、プレイヤーは何をしても
 * チームが弱くなっていく体験になる（実際に一度そうなった）。
 *
 * 合否判定はしない。数値を見るには:
 *   npx vitest run src/core/seasonBalance.test.ts --disable-console-intercept
 *
 * 注意: 常に手札の先頭を選ぶ「無戦略プレイ」なので、実プレイはこれより強くなる。
 */
import { describe, it } from 'vitest'
import { applyCommand } from './gameEngine'
import { playStep, playUntilYearEnd, playYear, startedGame } from './autoPlay'
import { overallRating } from './player/rating'
import type { GameState } from './types/game'
import { createRng } from './rng/random'
import { upperStarRatingAtRank } from './rival/rivals'
import { u18Bar, U18_SQUAD_SIZE } from './player/u18'
import { createProspects, MAX_APPROACHES, successChance } from './scout/scouting'
import { scoutTripCost } from './shop/travel'
import { findRegion } from './types/region'
import { formatFunds } from './shop/funds'

describe('世代交代の長期バランス', () => {
  it('複数シードの平均推移を出力する（常に成功する診断用）', () => {
    const SEEDS = 8
    const YEARS = 6
    const avg: number[] = Array(YEARS + 1).fill(0)
    const max: number[] = Array(YEARS + 1).fill(0)
    const cond: number[] = Array(YEARS + 1).fill(0)

    const rate = (s: GameState) =>
      s.players.reduce((t, p) => t + overallRating(p), 0) / s.players.length
    const ground: number[] = Array(YEARS + 1).fill(0)

    for (let seed = 0; seed < SEEDS; seed++) {
      let state = startedGame({ seed })
      avg[0] += rate(state)
      max[0] += Math.max(...state.players.map(overallRating))
      cond[0] += state.players.reduce((t, p) => t + p.condition, 0) / state.players.length
      ground[0] += state.groundLevel

      for (let y = 1; y <= YEARS; y++) {
        state = playYear(state)
        state = applyCommand(state, { type: 'finishSeason' }).state
        avg[y] += rate(state)
        max[y] += Math.max(...state.players.map(overallRating))
        cond[y] += state.players.reduce((t, p) => t + p.condition, 0) / state.players.length
        ground[y] += state.groundLevel
      }
    }

    for (let y = 0; y <= YEARS; y++) {
      console.log(
        `${y}年後 平均${(avg[y] / SEEDS).toFixed(1)} 最高${(max[y] / SEEDS).toFixed(1)} 体力${(cond[y] / SEEDS).toFixed(0)} グラウンドLv${(ground[y] / SEEDS).toFixed(0)}`,
      )
    }
  }, 300000)

  /**
   * 部費の収支を地区ごとに見る。
   *
   * 遠征費は「勝ち抜きやすいが甲子園から遠い」地区ほど重くなる設計なので、
   * 参加校が少ない地区で支出がきちんと増えているかを確認する。
   *
   * 収支を月ごとの残高差で測ると、賞金と遠征費が同じ月に相殺されて
   * 支出がほぼ0に見える（実際にそう見えて判断を誤った）。
   * **ログから項目ごとに拾う**こと。
   */
  it('地区ごとの部費の内訳を出力する（常に成功する診断用）', () => {
    const SEEDS = 6
    const YEARS = 5
    // 甲子園から近い順に並べた代表（奈良は会場が地元なので遠征費が0になる）
    const REGION_IDS = ['nara', 'kanagawa', 'miyagi', 'okinawa']

    /** ログの本文から金額を拾う */
    const yen = (text: string): number => {
      const matched = text.match(/([\d,]+)円/)
      return matched ? Number(matched[1].replace(/,/g, '')) : 0
    }

    for (const regionId of REGION_IDS) {
      let income = 0
      let travel = 0
      let trips = 0
      let upkeep = 0
      let unpaid = 0
      let balance = 0

      for (let seed = 0; seed < SEEDS; seed++) {
        let state = startedGame({ seed, regionId })
        const seen = new Set<string>()

        // ログは古いものから捨てられるので、1手ごとに見て取りこぼさないようにする
        const startYear = state.year
        while (state.year < startYear + YEARS) {
          state = playStep(state)
          for (const entry of state.log) {
            if (seen.has(entry.id)) continue
            seen.add(entry.id)

            if (entry.text.includes('支給') || entry.text.includes('大会の成績で')) {
              income += yen(entry.text)
            }
            if (entry.text.includes('遠征補助')) income += yen(entry.text)
            if (entry.text.includes('遠征費') || entry.text.includes('交通費')) {
              travel += yen(entry.text)
              trips += 1
            }
            if (entry.text.includes('維持費') && entry.text.includes('支払った')) {
              upkeep += yen(entry.text)
            }
            if (entry.text.includes('払いきれず')) unpaid += 1
          }
        }
        balance += state.funds
      }

      const k = (total: number) => `${Math.round(total / SEEDS / 1000)}k`
      console.log(
        `[${regionId}] ${YEARS}年 収入${k(income)} 遠征費${k(travel)}（${(trips / SEEDS).toFixed(1)}回） ` +
          `維持費${k(upkeep)} 残高${k(balance)} 未払い${(unpaid / SEEDS).toFixed(1)}回`,
      )
    }
  }, 300000)
})

/**
 * スカウトとU18代表の診断。
 *
 * 「弱小校のうちはスカウトできない」「最初は代表に選ばれない」が
 * 数字として成立しているかを見る。判定はせず出力するだけ。
 */
describe('スカウトとU18の到達度', () => {
  it('評判ごとの候補の質と、行き先ごとの出張費を出力する', () => {
    console.log('評判  候補の平均素質  最上位  中位候補の見込み(0回→4回)')

    for (const reputation of [20, 40, 60, 80, 95]) {
      const prospects = createProspects(createRng(reputation), {
        reputation,
        regionId: 'kanagawa',
        trait: 'contact',
        year: 1,
        serial: 0,
      })
      const mid = prospects[Math.floor(prospects.length / 2)]
      const avg = prospects.reduce((total, p) => total + p.rating, 0) / prospects.length

      const none = successChance({ ...mid, approaches: 0 }, reputation)
      const full = successChance({ ...mid, approaches: MAX_APPROACHES }, reputation)

      console.log(
        `${String(reputation).padStart(4)}  ${avg.toFixed(1).padStart(12)}  ` +
          `${String(prospects[0].rating).padStart(6)}  ` +
          `${(none * 100).toFixed(0).padStart(11)}% → ${(full * 100).toFixed(0).padStart(3)}%`,
      )
    }

    console.log('')
    console.log('神奈川から  出張費  （月の部費: 評判20で16,000円 / 評判95で46,000円）')
    const home = findRegion('kanagawa')
    for (const id of ['kanagawa', 'shizuoka', 'osaka', 'hiroshima', 'fukuoka', 'okinawa']) {
      const region = findRegion(id)
      console.log(
        `${region.name.padStart(10)}  ${formatFunds(scoutTripCost(home, region)).padStart(9)}`,
      )
    }
  })

  it('年ごとの代表選出人数と、県内最強の注目選手を出力する', () => {
    const SEEDS = 6
    const YEARS = 6

    const selected: number[] = Array(YEARS + 1).fill(0)
    const bar: number[] = Array(YEARS + 1).fill(0)
    const best: number[] = Array(YEARS + 1).fill(0)

    for (let seed = 0; seed < SEEDS; seed++) {
      let state = startedGame({ seed })

      for (let y = 1; y <= YEARS; y++) {
        // 卒業する前に数える。3年生で選ばれた選手を取りこぼさないため
        state = playUntilYearEnd(state)
        selected[y] += state.players.filter((p) => p.u18.length > 0).length
        bar[y] += u18Bar(upperStarRatingAtRank(state.rivals, U18_SQUAD_SIZE - 1))
        best[y] += Math.max(...state.players.map(overallRating))

        state = applyCommand(state, { type: 'advanceYear' }).state
        state = applyCommand(state, { type: 'finishSeason' }).state
      }
    }

    console.log('年  代表経験者  代表の当落線  自校の最高総合')
    for (let y = 1; y <= YEARS; y++) {
      console.log(
        `${y}年後  ${(selected[y] / SEEDS).toFixed(1).padStart(8)}人  ` +
          `${(bar[y] / SEEDS).toFixed(0).padStart(12)}  ${(best[y] / SEEDS).toFixed(0).padStart(12)}`,
      )
    }
  }, 300000)
})

/**
 * 控えに出番が回っているかの診断。
 *
 * ベンチ入りを決める判断に意味を持たせるには、
 * 控えにも打席が回って通算成績と成長が付く必要がある。
 */
describe('控えの出番', () => {
  it('1年ぶんで打席が回った人数を出力する', () => {
    const SEEDS = 6
    let played = 0
    let bench = 0
    let benchPlayed = 0
    let squad = 0

    for (let seed = 0; seed < SEEDS; seed++) {
      const start = startedGame({ seed })
      const state = playUntilYearEnd(start)

      const starters = new Set(start.lineup.slots.map((slot) => slot.playerId))
      const inSquad = new Set(start.squad)

      for (const player of state.players) {
        if (!inSquad.has(player.id)) continue
        squad += 1
        if (player.stats.batting.games > 0 || player.stats.pitching.games > 0) played += 1
        if (starters.has(player.id)) continue
        bench += 1
        if (player.stats.batting.games > 0 || player.stats.pitching.games > 0) benchPlayed += 1
      }
    }

    console.log(
      `ベンチ入り${(squad / SEEDS).toFixed(1)}人中 出場${(played / SEEDS).toFixed(1)}人 ` +
        `／ 控え${(bench / SEEDS).toFixed(1)}人中 出場${(benchPlayed / SEEDS).toFixed(1)}人`,
    )
  }, 300000)
})

/**
 * 総合Sの出現頻度の診断。
 *
 * 「Sは10年に1人、弱小校ではさらに稀」を狙っている。
 * 判定はせず、10年ぶんの在籍選手から最高ランクの出方を出力する。
 */
describe('総合Sの希少さ', () => {
  it('10年でSランクが何人出るかを出力する', () => {
    const SEEDS = 6
    const YEARS = 10

    /** その年に在籍していた選手の最高総合 */
    const best: number[] = []
    let sCount = 0
    let aCount = 0

    for (let seed = 0; seed < SEEDS; seed++) {
      let state = startedGame({ seed })
      const seen = new Set<string>()

      for (let year = 1; year <= YEARS; year++) {
        state = playUntilYearEnd(state)

        for (const player of state.players) {
          const rating = overallRating(player)
          // 同じ選手を年ごとに数えない。到達した最高ランクだけを見る
          if (rating >= 90 && !seen.has(`S:${player.id}`)) {
            seen.add(`S:${player.id}`)
            sCount += 1
          } else if (rating >= 80 && !seen.has(`A:${player.id}`)) {
            seen.add(`A:${player.id}`)
            aCount += 1
          }
        }
        best.push(Math.max(...state.players.map(overallRating)))

        state = applyCommand(state, { type: 'advanceYear' }).state
        state = applyCommand(state, { type: 'finishSeason' }).state
      }
    }

    console.log(
      `10年あたり Sランク${(sCount / SEEDS).toFixed(1)}人 / Aランク${(aCount / SEEDS).toFixed(1)}人`,
    )
    console.log(
      `年ごとの最高総合 平均${(best.reduce((a, b) => a + b, 0) / best.length).toFixed(1)} / ` +
        `全体の最高${Math.max(...best)}`,
    )
  }, 300000)
})
