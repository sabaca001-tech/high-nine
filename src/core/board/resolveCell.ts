/** 止まったマスの効果を解決する */

import type { Rng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import { injuryRiskOf, injuryWeightOf } from '@/core/player/condition'
import { clamp, raiseAbility } from '@/core/player/growth'
import { overallRating } from '@/core/player/rating'
import { createFriendlyOffers } from '@/core/match/friendlyOffers'
import type { FriendlyOffer } from '@/core/match/friendlyOffers'
import { attemptTraining, removeRedSkill } from '@/core/skill/grantSkill'
import { eventText, findPlayerEvent, pickPlayerEvent } from '@/core/event/playerEvents'
import type { PendingPlayerEvent } from '@/core/event/playerEvents'
import { findSkill } from '@/core/skill/skillDefs'
import type { PracticeCard } from '@/core/types/card'
import type { BoardCell } from '@/core/types/board'
import type { GameEvent } from '@/core/types/event'
import type { PracticeBoost } from '@/core/types/game'
import type { Lineup } from '@/core/types/lineup'
import type { PendingMatchSetup } from '@/core/types/match'
import type { GrowableKey, Motivation, Player } from '@/core/types/player'
import { ABILITY_LABELS, MOTIVATION_LABELS } from '@/core/types/player'
import type { Region } from '@/core/types/region'
import type { RivalSchool } from '@/core/rival/rivals'

export type CellOutcome = {
  players: Player[]
  events: GameEvent[]
  /** 新たに得た練習効率バフ。無ければ undefined */
  boost?: PracticeBoost
  /** 練習効率バフを消費したか */
  boostConsumed?: boolean
  /** これから行う試合。スタメンを確認してから始める */
  matchSetup?: PendingMatchSetup
  /** ルート分岐に止まった。UI で道筋を選ばせる */
  fork?: boolean
  /** 個人イベントに止まった。UI で選択肢を選ばせる */
  playerEvent?: PendingPlayerEvent
  /** 練習試合の相手候補。UI で選ばせる（断ることもできる） */
  friendlyOffers?: FriendlyOffer[]
  /** 部費の増減。遠征費など。省略時は0 */
  fundsDelta?: number
  /** 評判の増減。省略時は0 */
  reputationDelta?: number
}

/** マス解決に必要な周辺情報 */
export type CellContext = {
  players: Player[]
  lineup: Lineup
  /** 試合での守備力の上乗せ */
  defenseBonus?: number
  /** 学校の所在地。練習試合の遠征先を決めるのに使う */
  region?: Region
  /** 現在の部費。遠征費を払えるかの判定に使う */
  funds?: number
  /**
   * ライバル校（県内・県外の両方）。練習試合の相手をここから引く。
   * 地元開催なら自県の学校、遠征なら行き先の県の学校。
   */
  rivals?: RivalSchool[]
  /** 候補の id を採番するための通し番号 */
  serial?: number
}

/** 黄マスで得られる練習効率バフの候補 */
const BOOST_LEVELS: { value: PracticeBoost; weight: number }[] = [
  { value: { multiplier: 1.5, remaining: 3 }, weight: 5 },
  { value: { multiplier: 2, remaining: 2 }, weight: 3 },
  { value: { multiplier: 2.5, remaining: 1 }, weight: 2 },
]

/**
 * 止まったマスを解決する。
 * 通過しただけのマスは何も起きない（README 3.2 参照）。
 */
export function resolveCell(
  rng: Rng,
  cell: BoardCell,
  card: PracticeCard,
  context: CellContext,
): CellOutcome {
  const { players } = context

  switch (cell.kind) {
    case 'practice':
      return resolvePractice(players, card)
    case 'good':
      return resolveGoodEvent(rng, players)
    case 'bad':
      return resolveBadEvent(rng, players)
    case 'random':
      // 白マス。良いことも悪いことも起こる
      return rng.chance(0.5) ? resolveGoodEvent(rng, players) : resolveBadEvent(rng, players)
    case 'rest':
      return resolveRest(players)
    case 'boost':
      return resolveBoost(rng, players)
    case 'training':
      return resolveTraining(rng, players)
    case 'event':
      return resolvePlayerEventCell(rng, players)
    case 'alumni':
      return resolveAlumni(rng, players)
    case 'match':
      return resolveFriendlyMatch(rng, context)
    case 'fork':
      return {
        players,
        events: [{ type: 'message', text: '道が分かれている。方針を決めよう', tone: 'normal' }],
        fork: true,
      }
    case 'blank':
      // 何も起きない場合でも一言返す。無反応だと操作が効いたか分からないため
      return {
        players,
        events: [{ type: 'message', text: '特に何事もなく1日が過ぎた', tone: 'normal' }],
      }
    // 大会・合宿・年度末は gameEngine 側でフェーズを切り替えるので、ここでは何もしない
    case 'tournament':
    case 'camp':
    case 'goal':
      return { players, events: [] }
  }
}

/**
 * 練習マス: 練習に打ち込めた日。
 *
 * **ここで成長させるのはやめた。** 能力が伸びる土台はカードのほうにあり
 * （`applyPractice` を gameEngine が毎手呼ぶ）、
 * このマスは倍率を上乗せする補助でしかない（`CELL_GROWTH_BONUS`）。
 * 以前のように練習マス限定で伸ばしていると、
 * 「練習マスを踏めたか」だけで育成が決まり、カードの数字が移動距離の意味しか持たなかった。
 */
function resolvePractice(players: Player[], card: PracticeCard): CellOutcome {
  const def = PRACTICE_DEFS[card.kind]

  return {
    players,
    events: [
      {
        type: 'message',
        text: `${def.label}にじっくり打ち込めた`,
        tone: 'good',
      },
    ],
  }
}

/** 黄マス: 練習効率アップ */
function resolveBoost(rng: Rng, players: Player[]): CellOutcome {
  const boost = rng.weighted(BOOST_LEVELS)
  return {
    players,
    events: [
      {
        type: 'message',
        text: `チームに活気が出てきた！ 次の練習${boost.remaining}回が${boost.multiplier}倍になる`,
        tone: 'good',
      },
    ],
    boost,
  }
}

/** 特訓マス: 選手1人が特殊能力の取得に挑戦する */
function resolveTraining(rng: Rng, players: Player[]): CellOutcome {
  // 信頼度が高い選手ほど選ばれやすくする（育成の目標になるように）
  const target = rng.weighted(players.map((p) => ({ value: p, weight: 10 + p.trust })))
  const result = attemptTraining(rng, target)
  const skill = result.skillId ? findSkill(result.skillId) : undefined

  if (!skill) {
    return {
      players,
      events: [
        { type: 'message', text: `${target.name}の特訓を行ったが、収穫はなかった`, tone: 'normal' },
      ],
    }
  }

  if (!result.granted) {
    return {
      players,
      events: [
        {
          type: 'message',
          text: `${target.name}が「${skill.name}」の習得に挑んだが、あと一歩だった`,
          tone: 'normal',
        },
      ],
    }
  }

  return {
    players: players.map((p) => (p.id === target.id ? result.player : p)),
    events: [
      {
        type: 'message',
        text: `${target.name}が特殊能力「${skill.name}」を習得した！`,
        tone: 'good',
      },
    ],
  }
}

/**
 * イベントマス: 部員1人に出来事が起きる。
 *
 * ここでは**誰に何が起きたかを決めるだけ**で、効果は選択のあとに入る
 * （`gameEngine` の `choosePlayerEventChoice`）。
 * 対象がいなければ何も起きない日として流す。
 */
function resolvePlayerEventCell(rng: Rng, players: Player[]): CellOutcome {
  const pending = pickPlayerEvent(rng, players)
  const event = pending ? findPlayerEvent(pending.eventId) : undefined
  const target = pending ? players.find((p) => p.id === pending.playerId) : undefined

  if (!pending || !event || !target) {
    return {
      players,
      events: [{ type: 'message', text: '特に何事もなく1日が過ぎた', tone: 'normal' }],
    }
  }

  return {
    players,
    events: [{ type: 'message', text: eventText(event, target.name), tone: 'normal' }],
    playerEvent: pending,
  }
}

/** OBマス: 卒業生が指導に来る */
function resolveAlumni(rng: Rng, players: Player[]): CellOutcome {
  const count = Math.min(3, players.length)
  const targets = rng.shuffle(players).slice(0, count)
  const targetIds = new Set(targets.map((p) => p.id))

  const changes = []
  const updatedById = new Map<string, Player>()

  for (const target of targets) {
    const key = randomGrowableKey(rng, target)
    const { player, change } = raiseAbility(target, key, rng.int(3, 6))
    updatedById.set(target.id, player)
    if (change) changes.push(change)
  }

  const updated = players.map((p) => {
    const base = updatedById.get(p.id) ?? p
    // 指導を受けた選手は信頼度も上がる
    return targetIds.has(p.id) ? { ...base, trust: clamp(base.trust + 4, 0, 100) } : base
  })

  const events: GameEvent[] = [
    {
      type: 'message',
      text: `卒業生が練習を見に来た。${targets.map((p) => p.name).join('・')}が指導を受けた`,
      tone: 'good',
    },
  ]
  if (changes.length > 0) events.push({ type: 'ability', changes })

  return { players: updated, events }
}

/** 青マス */
function resolveGoodEvent(rng: Rng, players: Player[]): CellOutcome {
  const kind = rng.int(1, 5)

  // 1: 誰か1人が大きく成長する
  if (kind === 1) {
    const target = rng.pick(players)
    const key = randomGrowableKey(rng, target)
    const { player, change } = raiseAbility(target, key, rng.int(4, 7))
    const updated = players.map((p) => (p.id === player.id ? player : p))
    const events: GameEvent[] = [
      {
        type: 'message',
        text: `${target.name}が特訓に燃えている！ ${ABILITY_LABELS[key]}が大きく伸びた`,
        tone: 'good',
      },
    ]
    if (change) events.push({ type: 'ability', changes: [change] })
    return { players: updated, events }
  }

  // 2: チーム全体の信頼度アップ
  if (kind === 2) {
    return {
      players: players.map((p) => ({ ...p, trust: clamp(p.trust + 5, 0, 100) })),
      events: [
        { type: 'message', text: 'チームの雰囲気が良い。信頼度が上がった', tone: 'good' },
      ],
    }
  }

  // 3: 誰か1人のやる気アップ
  if (kind === 3) {
    const target = rng.pick(players)
    const next = shiftMotivation(target.motivation, 1)
    if (next === target.motivation) {
      return {
        players,
        events: [
          { type: 'message', text: `${target.name}は絶好調を維持している`, tone: 'good' },
        ],
      }
    }
    return {
      players: players.map((p) => (p.id === target.id ? { ...p, motivation: next } : p)),
      events: [
        {
          type: 'message',
          text: `${target.name}のやる気が上がった（${MOTIVATION_LABELS[next]}）`,
          tone: 'good',
        },
      ],
    }
  }

  // 4: 特別指導でマイナス能力を克服する
  if (kind === 4) {
    const withRed = players.filter((p) =>
      p.skills.some((id) => findSkill(id)?.rank === 'red'),
    )
    if (withRed.length > 0) {
      const target = rng.pick(withRed)
      const result = removeRedSkill(rng, target)
      const skill = result.skillId ? findSkill(result.skillId) : undefined
      if (result.granted && skill) {
        return {
          players: players.map((p) => (p.id === target.id ? result.player : p)),
          events: [
            {
              type: 'message',
              text: `特別指導！ ${target.name}が「${skill.name}」を克服した`,
              tone: 'good',
            },
          ],
        }
      }
    }
    // 対象がいなければ体力回復に振り替える
  }

  // 5: 差し入れで体力回復
  return {
    players: players.map((p) => ({ ...p, condition: clamp(p.condition + 15, 0, 100) })),
    events: [
      { type: 'message', text: 'OBから差し入れが届いた。体力が回復した', tone: 'good' },
    ],
  }
}

/** 怪我で離脱する月数 */
const INJURY_MONTHS = { min: 1, max: 3 }

/** 赤マス */
function resolveBadEvent(rng: Rng, players: Player[]): CellOutcome {
  const kind = rng.int(1, 4)

  // 4: 怪我。**体力が低いほど、起きやすく・選ばれやすい**
  if (kind === 4) {
    const healthy = players.filter((p) => p.injuryMonths === 0)
    if (healthy.length > 0) {
      // 体力が低いほど選ばれやすい
      const target = rng.weighted(
        healthy.map((p) => ({ value: p, weight: injuryWeightOf(p.condition) })),
      )
      const months = rng.int(INJURY_MONTHS.min, INJURY_MONTHS.max)

      // **起きるかどうかも体力で決まる。**
      // 以前はここで必ず怪我をしていたので、
      // チーム全体を疲れさせても怪我は増えず、
      // 体力を保って怪我を防ぐ、ということができなかった
      if (!rng.chance(injuryRiskOf(target.condition))) {
        return {
          players,
          events: [
            {
              type: 'message',
              text: `${target.name}がヒヤリとする場面があったが、大事には至らなかった`,
              tone: 'normal',
            },
          ],
        }
      }

      return {
        players: players.map((p) =>
          p.id === target.id ? { ...p, injuryMonths: months, condition: clamp(p.condition - 10, 0, 100) } : p,
        ),
        events: [
          {
            type: 'message',
            text: `${target.name}が怪我をした。${months}ヶ月の離脱`,
            tone: 'bad',
          },
        ],
      }
    }
  }

  // 1: 誰か1人のやる気ダウン
  if (kind === 1) {
    const target = rng.pick(players)
    const next = shiftMotivation(target.motivation, -1)
    if (next === target.motivation) {
      return {
        players,
        events: [
          { type: 'message', text: `${target.name}はどん底から立ち直れずにいる`, tone: 'bad' },
        ],
      }
    }
    return {
      players: players.map((p) => (p.id === target.id ? { ...p, motivation: next } : p)),
      events: [
        {
          type: 'message',
          text: `${target.name}が調子を落とした（${MOTIVATION_LABELS[next]}）`,
          tone: 'bad',
        },
      ],
    }
  }

  // 2: 誰か1人の能力ダウン
  if (kind === 2) {
    const target = rng.pick(players)
    const key = randomGrowableKey(rng, target)
    const { player, change } = raiseAbility(target, key, -rng.int(2, 4))
    const updated = players.map((p) => (p.id === player.id ? player : p))
    const events: GameEvent[] = [
      {
        type: 'message',
        text: `${target.name}がフォームを崩した。${ABILITY_LABELS[key]}が下がった`,
        tone: 'bad',
      },
    ]
    if (change) events.push({ type: 'ability', changes: [change] })
    return { players: updated, events }
  }

  // 3: 全体の体力ダウン
  return {
    players: players.map((p) => ({ ...p, condition: clamp(p.condition - 15, 0, 100) })),
    events: [{ type: 'message', text: '厳しい暑さでチーム全体が消耗した', tone: 'bad' }],
  }
}

/** 緑マス */
function resolveRest(players: Player[]): CellOutcome {
  return {
    players: players.map((p) => ({ ...p, condition: clamp(p.condition + 25, 0, 100) })),
    events: [{ type: 'message', text: 'オフを取った。体力が回復した', tone: 'normal' }],
  }
}

/**
 * 練習試合マス。
 *
 * **ここでは相手を決めない。** 候補を出すところまでで、
 * 誰とやるか（そもそもやるか）はプレイヤーが選ぶ（`matchOffer` フェーズ）。
 * 以前は止まった瞬間に相手も遠征先も勝手に決まっていて、
 * 遠征費が引かれたことに後から気づくこともあった。
 */
function resolveFriendlyMatch(rng: Rng, context: CellContext): CellOutcome {
  const region = context.region
  if (!region) {
    return {
      players: context.players,
      events: [{ type: 'message', text: '練習試合の相手が見つからなかった', tone: 'normal' }],
    }
  }

  const { offers } = createFriendlyOffers(rng, {
    strength: relativeStrength(context.players),
    region,
    rivals: context.rivals ?? [],
    serial: context.serial ?? 0,
  })

  return {
    players: context.players,
    events: [{ type: 'message', text: '練習試合の相手を選ぼう', tone: 'normal' }],
    friendlyOffers: offers,
  }
}

/**
 * チームの実力を、相手生成に渡す補正値に変換する。
 * 基準は初期チームの平均総合（GRADE_BASE から決まる値）。
 */
const BASELINE_TEAM_RATING = 37

function relativeStrength(players: Player[]): number {
  if (players.length === 0) return 0
  const average = players.reduce((total, p) => total + overallRating(p), 0) / players.length
  return Math.round(average - BASELINE_TEAM_RATING)
}

/** その選手が持っている能力の中から1つ選ぶ */
function randomGrowableKey(rng: Rng, player: Player): GrowableKey {
  const battingKeys: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']
  const pitchingKeys: GrowableKey[] = ['control', 'stamina', 'sharpness']
  return rng.pick(player.isPitcher ? [...battingKeys, ...pitchingKeys] : battingKeys)
}

/** やる気を上下させる（-2〜+2の範囲に収める） */
function shiftMotivation(current: Motivation, delta: number): Motivation {
  return clamp(current + delta, -2, 2) as Motivation
}
