import { describe, it } from 'vitest'
import { createRng } from './rng/random'
import { autoLineup } from './lineup/autoLineup'
import { simulateGame } from './match/simulateGame'
import { createInitialRoster, INITIAL_TALENT } from './player/createPlayer'
import { ROSTER_TALENT_RATE } from './rival/rivalRoster'
import { applyCommand } from './gameEngine'
import { playUntilYearEnd, startedGame } from './autoPlay'
import { overallRating } from './player/rating'
import type { GameState } from './types/game'
import type { Player } from './types/player'

/**
 * バランス確認用の診断スクリプト。
 *
 * 合否判定はせず、成長曲線を数値で出力するだけ。
 * 数値を調整したあとに以下で実行して、curve が壊れていないか目視する:
 *   npx vitest run src/core/balanceCheck.test.ts --disable-console-intercept
 *
 * 注意: カードは常に手札の先頭を選ぶ「無戦略プレイ」なので、
 *       実際のプレイヤーの成長はこれより速くなる。ここでの数値は下限の目安。
 */
/**
 * 診断のタイムアウト。
 *
 * **既定（5秒）では足りない。** 他校が2818校あるので、
 * `startedGame` で1ゲーム作るだけで時間がかかり、
 * 数年ぶんの進行を回す診断は境界を超える。
 * CI は `npm run test`（既定のタイムアウト）で走るので、必ず明示すること。
 */
const DIAG_TIMEOUT = 300_000

describe('バランス確認', () => {
  it('3年分の推移を出力する（常に成功する診断用）', () => {
    let state = startedGame({ seed: 20260801 })
    let cardsUsed = 0

    const summary = (s: GameState, label: string) => {
      const avg = (fn: (p: (typeof s.players)[number]) => number) =>
        (s.players.reduce((t, p) => t + fn(p), 0) / s.players.length).toFixed(1)
      // p11 は必ず投手なので、1年生の野手を見る
      const best = [...s.players].sort((a, b) => overallRating(b) - overallRating(a))[0]
      console.log(
        `${label} 部員${s.players.length}人 平均総合${avg(overallRating)} ` +
          `体力${avg((p) => p.condition)} 信頼${avg((p) => p.trust)} ` +
          `評判${s.reputation} OB${s.graduates.length}人 | 最高${overallRating(best)}`,
      )
    }

    summary(state, '開始      ')

    // ループ1周が1年。以前は変数名も見出しも「月」になっていて、
    // 12年後の数値を1年後だと読み違えるもとになっていた
    const YEARS = 72
    for (let year = 0; year < YEARS; year++) {
      // カードの使用枚数を数えるため、選択のたびにカウントする
      state = playUntilYearEnd(state, {
        chooseCard: (s) => {
          cardsUsed++
          return s.hand[0].id
        },
      })
      state = applyCommand(state, { type: 'advanceYear' }).state
      if ((year + 1) % 12 === 0) summary(state, `${year + 1}年後`)
    }

    console.log(`1年あたりのカード使用枚数: ${(cardsUsed / YEARS).toFixed(1)}`)
  }, DIAG_TIMEOUT)

  it('試合の平均スコアと成績を出力する（常に成功する診断用）', () => {
    const trials = 200
    let runsFor = 0
    let runsAgainst = 0
    let wins = 0
    let draws = 0
    let innings = 0
    let hits = 0
    let atBats = 0
    let homeruns = 0
    let strikeouts = 0
    let walks = 0

    for (let seed = 0; seed < trials; seed++) {
      const players = createInitialRoster(createRng(seed), 8, [3, 2, 1], false)
      const result = simulateGame(createRng(seed * 13 + 1), {
        players,
        lineup: autoLineup(players),
        opponentName: '',
        // **自校と同じ水準の相手と当てる。** 初期部員は弱小校の水準
        // （`INITIAL_TALENT`）で作られるので、strength 0 の相手だと
        // 一方的な試合になり、打撃と投球の釣り合いが測れない。
        // 相手は戦力の一部しか素質に乗らない（`ROSTER_TALENT_RATE`）ので割り戻す
        opponentStrength: Math.round(INITIAL_TALENT / ROSTER_TALENT_RATE),
        kind: 'friendly',
      })

      runsFor += result.finalScore.player
      runsAgainst += result.finalScore.opponent
      if (result.outcome === 'win') wins++
      if (result.outcome === 'draw') draws++
      innings += result.innings.length

      for (const line of result.battingLines) {
        hits += line.hits
        atBats += line.atBats
        homeruns += line.homeruns
        strikeouts += line.strikeouts
        walks += line.walks
      }
    }

    console.log(
      `平均スコア ${(runsFor / trials).toFixed(2)} - ${(runsAgainst / trials).toFixed(2)} / ` +
        `勝率${((wins / trials) * 100).toFixed(1)}% 引分${draws} / ` +
        `平均${(innings / trials).toFixed(2)}回`,
    )
    console.log(
      `打率${(hits / atBats).toFixed(3)} 1試合平均: 安打${(hits / trials).toFixed(1)} ` +
        `本塁打${(homeruns / trials).toFixed(2)} 三振${(strikeouts / trials).toFixed(1)} ` +
        `四球${(walks / trials).toFixed(1)}`,
    )
  }, DIAG_TIMEOUT)

  /**
   * **打撃能力が成績にどれだけ効くか。**
   *
   * 評価点はミートとパワーをいちばん重く見ている（それぞれ .28）ので、
   * 実際の打撃成績もそれに見合って動いていないと、
   * 「点数は高いのに打てない選手」が生まれる。
   *
   * 打者9人のミート・パワーだけを揃えて、同じ相手と200試合戦わせる。
   * 弾道は2に固定（本塁打は弾道でも動くので、混ぜると効きが読めない）。
   */
  it('打撃能力の帯ごとの成績を出力する（常に成功する診断用）', () => {
    const cases: { label: string; meet: number; power: number; speed?: number }[] = [
      { label: 'ミート40 / パワー40', meet: 40, power: 40 },
      { label: 'ミート55 / パワー55', meet: 55, power: 55 },
      { label: 'ミート70 / パワー70', meet: 70, power: 70 },
      { label: 'ミート85 / パワー85', meet: 85, power: 85 },
      { label: 'ミート85 / パワー40', meet: 85, power: 40 },
      { label: 'ミート40 / パワー85', meet: 40, power: 85 },
      // 走力だけを動かす。内野安打と、単打を二塁打にする走塁に効く
      { label: 'ミート55 / パワー55 / 走力20', meet: 55, power: 55, speed: 20 },
      { label: 'ミート55 / パワー55 / 走力55', meet: 55, power: 55, speed: 55 },
      { label: 'ミート55 / パワー55 / 走力90', meet: 55, power: 55, speed: 90 },
    ]

    console.log('打者9人の能力を揃えて200試合（相手は互角。弾道は2に固定）')

    for (const item of cases) {
      const trials = 200
      let hits = 0
      let atBats = 0
      let homeruns = 0
      let walks = 0
      let strikeouts = 0
      let doubles = 0
      let runs = 0

      for (let seed = 0; seed < trials; seed++) {
        // 天才肌は他校に出ないので、釣り合いを測る診断では出さない
        const base = createInitialRoster(createRng(seed), 8, [3, 2, 1], false)
        const players: Player[] = base.map((player) =>
          player.isPitcher
            ? player
            : {
                ...player,
                batting: {
                  ...player.batting,
                  meet: item.meet,
                  power: item.power,
                  trajectory: 2,
                  ...(item.speed === undefined ? {} : { speed: item.speed }),
                },
              },
        )

        const result = simulateGame(createRng(seed * 13 + 1), {
          players,
          lineup: autoLineup(players),
          opponentName: '',
          opponentStrength: Math.round(INITIAL_TALENT / ROSTER_TALENT_RATE),
          kind: 'friendly',
        })

        runs += result.finalScore.player
        for (const line of result.battingLines) {
          hits += line.hits
          atBats += line.atBats
          homeruns += line.homeruns
          walks += line.walks
          strikeouts += line.strikeouts
          doubles += line.doubles
        }
      }

      const average = hits / atBats
      const onBase = (hits + walks) / (atBats + walks)
      console.log(
        `  ${item.label}: 打率${average.toFixed(3)} 出塁${onBase.toFixed(3)} ` +
          `二塁打${(doubles / trials).toFixed(2)} 本塁打${(homeruns / trials).toFixed(2)} ` +
          `三振${(strikeouts / trials).toFixed(1)} 得点${(runs / trials).toFixed(2)}`,
      )
    }
  }, DIAG_TIMEOUT)
})
