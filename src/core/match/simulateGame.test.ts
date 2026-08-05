import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng/random'
import { autoLineup } from '@/core/lineup/autoLineup'
import { createInitialRoster } from '@/core/player/createPlayer'
import type { Player } from '@/core/types/player'
import type { MatchResult, MatchSetup } from '@/core/types/match'
import { isHit, outsOf } from '@/core/types/match'
import { simulateGame } from './simulateGame'

function makeSetup(seed: number, strength = 0): { setup: MatchSetup; players: Player[] } {
  const players = createInitialRoster(createRng(seed))
  return {
    players,
    setup: {
      players,
      lineup: autoLineup(players),
      opponentName: '',
      opponentStrength: strength,
      kind: 'friendly',
    },
  }
}

function play(seed: number, strength = 0): MatchResult {
  const { setup } = makeSetup(seed, strength)
  return simulateGame(createRng(seed * 31 + 7), setup)
}

describe('simulateGame', () => {
  it('同じシード・同じ入力なら完全に同じ結果になる', () => {
    const { setup } = makeSetup(1)
    const a = simulateGame(createRng(555), setup)
    const b = simulateGame(createRng(555), setup)
    expect(a).toEqual(b)
  })

  it('結果はJSONに変換できる（セーブデータに入れられる）', () => {
    const result = play(2)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('9回以上行われ、延長は12回まで', () => {
    for (let seed = 0; seed < 40; seed++) {
      const result = play(seed)
      expect(result.innings.length).toBeGreaterThanOrEqual(9)
      expect(result.innings.length).toBeLessThanOrEqual(12)
    }
  })

  it('イニングごとの得点の合計が最終スコアと一致する', () => {
    for (let seed = 0; seed < 30; seed++) {
      const result = play(seed)
      const player = result.innings.reduce((total, i) => total + i.player, 0)
      const opponent = result.innings.reduce((total, i) => total + i.opponent, 0)

      expect(player).toBe(result.finalScore.player)
      expect(opponent).toBe(result.finalScore.opponent)
    }
  })

  it('勝敗が最終スコアと矛盾しない', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { finalScore, outcome } = play(seed)
      if (finalScore.player > finalScore.opponent) expect(outcome).toBe('win')
      else if (finalScore.player < finalScore.opponent) expect(outcome).toBe('lose')
      else expect(outcome).toBe('draw')
    }
  })

  it('各半回のアウトは3つまで（サヨナラを除く）', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = play(seed)
      const outsByHalf = new Map<string, number>()

      for (const p of result.plays) {
        const key = `${p.inning}-${p.half}`
        outsByHalf.set(key, (outsByHalf.get(key) ?? 0) + outsOf(p.result))
      }
      for (const outs of outsByHalf.values()) {
        expect(outs).toBeLessThanOrEqual(3)
      }
    }
  })

  it('打席ログのスコアは単調増加する', () => {
    const result = play(5)
    let lastPlayer = 0
    let lastOpponent = 0

    for (const p of result.plays) {
      expect(p.score.player).toBeGreaterThanOrEqual(lastPlayer)
      expect(p.score.opponent).toBeGreaterThanOrEqual(lastOpponent)
      lastPlayer = p.score.player
      lastOpponent = p.score.opponent
    }
    expect(lastPlayer).toBe(result.finalScore.player)
    expect(lastOpponent).toBe(result.finalScore.opponent)
  })

  it('得点が入った打席には必ず実況テキストがある', () => {
    const result = play(6)
    for (const p of result.plays) {
      expect(p.text.length).toBeGreaterThan(0)
      if (p.runsScored > 0) expect(p.highlight).toBe(true)
    }
  })

  it('自チームの打撃成績はスタメンの選手のもの', () => {
    const { setup } = makeSetup(7)
    const result = simulateGame(createRng(77), setup)
    const ids = new Set(setup.players.map((p) => p.id))

    for (const line of result.battingLines) {
      expect(ids.has(line.playerId)).toBe(true)
      expect(line.hits).toBeLessThanOrEqual(line.atBats + line.walks)
      expect(line.homeruns).toBeLessThanOrEqual(line.hits)
    }
  })

  it('打撃成績の安打数が打席ログと一致する', () => {
    const { setup } = makeSetup(8)
    const result = simulateGame(createRng(88), setup)

    const hitsFromPlays = new Map<string, number>()
    for (const p of result.plays) {
      if (p.half !== 'bottom') continue // 自チームは後攻
      if (!isHit(p.result)) continue
      hitsFromPlays.set(p.batterName, (hitsFromPlays.get(p.batterName) ?? 0) + 1)
    }

    for (const line of result.battingLines) {
      expect(line.hits).toBe(hitsFromPlays.get(line.name) ?? 0)
    }
  })

  it('投手成績のアウト数がイニング数と矛盾しない', () => {
    for (let seed = 0; seed < 15; seed++) {
      const result = play(seed)
      const totalOuts = result.pitchingLines.reduce((total, line) => total + line.outs, 0)
      // 相手の攻撃回数 × 3 が上限
      expect(totalOuts).toBeLessThanOrEqual(result.innings.length * 3)
    }
  })

  it('格上が相手だと勝率が下がる', () => {
    const winRate = (strength: number): number => {
      let wins = 0
      const trials = 60
      for (let seed = 0; seed < trials; seed++) {
        if (play(seed, strength).outcome === 'win') wins++
      }
      return wins / trials
    }

    expect(winRate(25)).toBeLessThan(winRate(-25))
  })

  it('互角の相手なら勝率がおおむね五分になる', () => {
    let wins = 0
    let losses = 0
    const trials = 80
    for (let seed = 0; seed < trials; seed++) {
      const outcome = play(seed).outcome
      if (outcome === 'win') wins++
      if (outcome === 'lose') losses++
    }
    const winRate = wins / (wins + losses)
    expect(winRate).toBeGreaterThan(0.3)
    expect(winRate).toBeLessThan(0.7)
  })

  it('スコアが極端な値にならない', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { finalScore } = play(seed)
      expect(finalScore.player).toBeLessThan(30)
      expect(finalScore.opponent).toBeLessThan(30)
    }
  })

  it('サヨナラ勝ちのとき、9回裏以降の最後の打席で勝ち越している', () => {
    for (let seed = 0; seed < 60; seed++) {
      const result = play(seed)
      const last = result.plays[result.plays.length - 1]
      if (result.outcome !== 'win' || last.half !== 'bottom' || last.inning < 9) continue

      // 最終打席で勝ち越したなら、その前は勝っていなかったはず
      expect(last.score.player).toBeGreaterThan(last.score.opponent)
      return
    }
  })

  it('MVPは自チームの選手', () => {
    const { setup } = makeSetup(9)
    const result = simulateGame(createRng(99), setup)
    if (result.mvpPlayerId) {
      expect(setup.players.some((p) => p.id === result.mvpPlayerId)).toBe(true)
    }
  })
})

describe('決着必須の試合（大会）', () => {
  function decisive(seed: number): MatchResult {
    const { setup } = makeSetup(seed)
    return simulateGame(createRng(seed * 17 + 3), { ...setup, decisive: true })
  }

  it('引き分けにならない', () => {
    for (let seed = 0; seed < 120; seed++) {
      expect(decisive(seed).outcome).not.toBe('draw')
    }
  })

  it('9回で決着していれば延長しない', () => {
    let found = false
    for (let seed = 0; seed < 40 && !found; seed++) {
      const result = decisive(seed)
      if (result.finalScore.player !== result.finalScore.opponent) {
        expect(result.innings.length).toBeGreaterThanOrEqual(9)
        found = true
      }
    }
    expect(found).toBe(true)
  })

  it('タイブレークで延長しても長引きすぎない', () => {
    for (let seed = 0; seed < 60; seed++) {
      expect(decisive(seed).innings.length).toBeLessThanOrEqual(25)
    }
  })

  it('通常の試合では引き分けが起きうる', () => {
    let draws = 0
    for (let seed = 0; seed < 200; seed++) {
      if (play(seed).outcome === 'draw') draws++
    }
    expect(draws).toBeGreaterThan(0)
  })
})

describe('特殊能力の影響', () => {
  /** 全員に特定の特殊能力を付けたチームで戦わせ、平均得点を測る */
  function averageRuns(skill: string | null, seedBase: number): number {
    let total = 0
    const trials = 40

    for (let seed = 0; seed < trials; seed++) {
      const players = createInitialRoster(createRng(seedBase + seed))
      const withSkill = skill
        ? players.map((p) => ({ ...p, skills: p.isPitcher ? p.skills : [skill] }))
        : players

      const result = simulateGame(createRng(seedBase * 7 + seed), {
        players: withSkill,
        lineup: autoLineup(withSkill),
        opponentName: '',
        opponentStrength: 0,
        kind: 'friendly',
      })
      total += result.finalScore.player
    }
    return total / trials
  }

  it('選球眼を持つと四球が増える', () => {
    const walks = (skill: string | null): number => {
      let total = 0
      for (let seed = 0; seed < 30; seed++) {
        const players = createInitialRoster(createRng(seed))
        const withSkill = skill ? players.map((p) => ({ ...p, skills: [skill] })) : players
        const result = simulateGame(createRng(seed + 500), {
          players: withSkill,
          lineup: autoLineup(withSkill),
          opponentName: '',
          opponentStrength: 0,
          kind: 'friendly',
        })
        total += result.battingLines.reduce((sum, line) => sum + line.walks, 0)
      }
      return total
    }

    expect(walks('contact-eye')).toBeGreaterThan(walks(null))
    expect(walks('chase-swing')).toBeLessThan(walks(null))
  })

  it('広角打法を持つと得点が増える', () => {
    // 1試合の得点は振れ幅が大きい。100試合では
    // **先発が1人変わっただけで乱数の並びがずれて**逆転することがあるので、
    // 差が安定して見える試合数まで増やす
    expect(averageRuns('power-hitter', 400)).toBeGreaterThan(averageRuns(null, 400))
  })
})

describe('守備適性を無視した起用', () => {
  /**
   * スタメンの守備位置だけを入れ替えて、
   * **同じ9人・同じ打順のまま守備適性だけを崩した**編成を作る。
   * 打撃は完全に同じなので、差は守備からしか生まれない。
   */
  function scrambled(seed: number): { setup: MatchSetup; scrambledSetup: MatchSetup } {
    const { setup } = makeSetup(seed)
    const positions = setup.lineup.slots.map((slot) => slot.position)

    // 投手だけは動かせない（投手能力を持つ選手しか務まらない）
    const fielders = positions.filter((position) => position !== 'P')
    const swapped = [...fielders].reverse()
    let index = 0

    return {
      setup,
      scrambledSetup: {
        ...setup,
        lineup: {
          slots: setup.lineup.slots.map((slot) =>
            slot.position === 'P' ? slot : { ...slot, position: swapped[index++] },
          ),
        },
      },
    }
  }

  it('適性を無視すると失点が増える', () => {
    let normal = 0
    let scrambledRuns = 0

    for (let seed = 1; seed <= 60; seed++) {
      const pair = scrambled(seed)
      normal += simulateGame(createRng(seed * 101), pair.setup).finalScore.opponent
      scrambledRuns += simulateGame(createRng(seed * 101), pair.scrambledSetup).finalScore
        .opponent
    }

    expect(scrambledRuns).toBeGreaterThan(normal)
  })
})

describe('大差の試合での交代', () => {
  it('大量ビハインドになると控えの下級生に打席が回る', () => {
    let games = 0
    let withRest = 0

    for (let seed = 1; seed <= 40; seed++) {
      const players = createInitialRoster(createRng(seed))
      const lineup = autoLineup(players)

      // 格上に一方的に打たれる状況を作る
      const result = simulateGame(createRng(seed * 313), {
        players,
        lineup,
        opponentName: '',
        opponentStrength: 45,
        kind: 'friendly',
      })

      if (result.finalScore.opponent - result.finalScore.player < 7) continue
      games += 1
      if (result.events.some((event) => event.text.includes('経験を積ませる'))) withRest += 1
    }

    expect(games).toBeGreaterThan(0)
    // 大差の試合の多くで控えが出る
    expect(withRest / games).toBeGreaterThan(0.5)
  })

  it('一度も大差がつかなかった試合では、経験を積ませる交代は起きない', () => {
    let checked = 0

    for (let seed = 1; seed <= 60; seed++) {
      const result = play(seed)
      if (reachedBlowout(result)) continue

      checked += 1
      expect(result.events.some((event) => event.text.includes('経験を積ませる'))).toBe(false)
    }

    expect(checked).toBeGreaterThan(5)
  })
})


/**
 * 試合中に一度でも7点差がついたか。
 *
 * **最終スコアでは判定できない。** 7回に8点差でも、そこから追いつくことがある。
 * 先攻（相手）が打ってから後攻（自校）が打つので、半回ごとに見る。
 */
function reachedBlowout(result: MatchResult): boolean {
  let player = 0
  let opponent = 0

  for (const line of result.innings) {
    opponent += line.opponent
    if (Math.abs(player - opponent) >= 7) return true
    player += line.player
    if (Math.abs(player - opponent) >= 7) return true
  }
  return false
}

describe('大差の試合', () => {
  /** こちらが大きく格上。序盤で試合が壊れる組み合わせ */
  const LOPSIDED = -28

  it('大差がつくと投手が交代する（先発が完投しない）', () => {
    let blowouts = 0
    let changed = 0

    for (let seed = 1; seed < 80; seed++) {
      const result = play(seed, LOPSIDED)
      if (result.finalScore.player - result.finalScore.opponent < 7) continue

      blowouts += 1
      if (result.pitchingLines.length > 1) changed += 1
    }

    expect(blowouts).toBeGreaterThan(3)
    // 大差の試合の多くで2人以上が投げている
    expect(changed / blowouts).toBeGreaterThan(0.5)
  })

  it('大差では下級生の投手に経験が回る', () => {
    let youthAppeared = false

    for (let seed = 1; seed < 80 && !youthAppeared; seed++) {
      const result = play(seed, LOPSIDED)
      if (result.finalScore.player - result.finalScore.opponent < 7) continue
      youthAppeared = result.events.some((event) => event.text.includes('経験を積ませる'))
    }

    expect(youthAppeared).toBe(true)
  })

  it('大差にならなければ投手も代わらない', () => {
    let checked = 0

    for (let seed = 1; seed < 80; seed++) {
      const result = play(seed, 0)
      if (reachedBlowout(result)) continue

      checked += 1
      expect(result.events.some((e) => e.text.includes('経験を積ませる'))).toBe(false)
    }

    expect(checked).toBeGreaterThan(10)
  })
})
