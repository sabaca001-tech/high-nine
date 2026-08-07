/** 止まったマスの効果を解決する */

import type { Rng } from '@/core/rng/random'
import { PRACTICE_DEFS } from '@/core/card/cardDefs'
import { applyPractice, clamp, raiseAbility } from '@/core/player/growth'
import { overallRating } from '@/core/player/rating'
import { pickOpponentName } from '@/core/match/opponent'
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
import { REGIONS, travelDistance } from '@/core/types/region'
import type { Region } from '@/core/types/region'
import { FRIENDLY_TRAVEL_MAX_DISTANCE, friendlyTravelCost } from '@/core/shop/travel'
import { formatFunds } from '@/core/shop/funds'
import { pickRivalFor, rivalsIn } from '@/core/rival/rivals'
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
  /** 部費の増減。遠征費など。省略時は0 */
  fundsDelta?: number
  /** 評判の増減。省略時は0 */
  reputationDelta?: number
}

/** マス解決に必要な周辺情報 */
export type CellContext = {
  players: Player[]
  lineup: Lineup
  boost: PracticeBoost | null
  /** グラウンド整備・マネージャーによる恒久的な成長倍率 */
  facilityMultiplier?: number
  /** 試合での守備力の上乗せ */
  defenseBonus?: number
  /** 選手ごとの練習倍率（ベンチ入り/ベンチ外） */
  perPlayerMultiplier?: (player: Player) => number
  /** 学校の所在地。練習試合の遠征先を決めるのに使う */
  region?: Region
  /** 現在の部費。遠征費を払えるかの判定に使う */
  funds?: number
  /**
   * ライバル校（県内・県外の両方）。練習試合の相手をここから引く。
   * 地元開催なら自県の学校、遠征なら行き先の県の学校。
   */
  rivals?: RivalSchool[]
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
  const { players, boost } = context
  const facility = context.facilityMultiplier ?? 1

  switch (cell.kind) {
    case 'practice':
      return resolvePractice(rng, players, card, boost, facility, context.perPlayerMultiplier)
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
 * 練習マス: 選んだカードの練習内容で全員が成長する。
 * 練習効率バフはここでのみ消費する（黄マス→練習マスと繋げると大きく伸びる）。
 */
function resolvePractice(
  rng: Rng,
  players: Player[],
  card: PracticeCard,
  boost: PracticeBoost | null,
  facilityMultiplier: number,
  perPlayerMultiplier?: (player: Player) => number,
): CellOutcome {
  const def = PRACTICE_DEFS[card.kind]
  const multiplier = (boost?.multiplier ?? 1) * facilityMultiplier
  const { players: updated, changes, pitchNews } = applyPractice(
    rng,
    players,
    def,
    card.isRare,
    multiplier,
    perPlayerMultiplier,
  )

  const events: GameEvent[] = []
  if (boost) {
    events.push({
      type: 'message',
      text: `練習効率アップ！ ${def.label}の効果が${boost.multiplier}倍になった`,
      tone: 'good',
    })
  } else {
    events.push({
      type: 'message',
      text: card.isRare ? `${def.label}（キラ）で猛練習した！` : `${def.label}に取り組んだ`,
      tone: card.isRare ? 'good' : 'normal',
    })
  }
  if (changes.length > 0) {
    events.push({ type: 'ability', changes })
  }
  // 球種を覚えた・変化量が上がったことを知らせる
  for (const text of pitchNews ?? []) {
    events.push({ type: 'message', text, tone: 'good' })
  }

  return { players: updated, events, boostConsumed: boost !== null }
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

  // 4: 怪我。体力が低い選手ほど起きやすい
  if (kind === 4) {
    const healthy = players.filter((p) => p.injuryMonths === 0)
    if (healthy.length > 0) {
      // 体力が低いほど選ばれやすい
      const target = rng.weighted(
        healthy.map((p) => ({ value: p, weight: Math.max(1, 110 - p.condition) })),
      )
      const months = rng.int(INJURY_MONTHS.min, INJURY_MONTHS.max)

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

/** 練習試合が他県への遠征になる確率 */
const AWAY_MATCH_CHANCE = 0.4

/** 遠征先の相手の強さの上乗せ。わざわざ遠くまで行くのは格上と戦うため */
const AWAY_OPPONENT_BONUS = 8

/**
 * 練習試合マス。
 * ここでは試合を丸ごとシミュレートするだけで、成績の反映は
 * 観戦終了後（gameEngine の finishMatch）に行う。
 *
 * ときどき他県への遠征になる。遠征費がかかる代わりに相手が格上で、
 * 他県まで出向くこと自体が学校の知名度になる（評判 +1）。
 * 部費が足りなければ招待を断り、地元開催に切り替える。
 */
function resolveFriendlyMatch(rng: Rng, context: CellContext): CellOutcome {
  const away = pickAwayTrip(rng, context)

  // 練習試合の相手はこちらの実力に合わせる。
  // 絶対値で固定すると、チームが伸びても衰えても試合が一方的になる
  const base =
    relativeStrength(context.players) + rng.int(-8, 8) + (away ? AWAY_OPPONENT_BONUS : 0)

  // 相手はその土地のライバル校から引く。地元なら自県、遠征なら行き先の県。
  // 学校が置かれていない県へ行った場合だけ、使い捨ての名前になる
  const there = away?.region.id ?? context.region?.id
  const rival = there ? pickRivalFor(rng, rivalsIn(context.rivals ?? [], there), base) : null
  const opponentName = rival?.name ?? pickOpponentName(rng)
  const opponentStrength = rival?.strength ?? base

  if (!away) {
    const events: GameEvent[] = [
      { type: 'message', text: `${opponentName}と練習試合を行う`, tone: 'normal' },
    ]
    if (away === null) {
      events.push({ type: 'message', text: '遠征費が足りず、他県への遠征は見送った', tone: 'bad' })
    }
    return {
      players: context.players,
      events,
      matchSetup: {
        kind: 'friendly',
        opponentName,
        ...(rival ? { opponentSchoolId: rival.id } : {}),
        opponentStrength,
      },
    }
  }

  return {
    players: context.players,
    events: [
      {
        type: 'message',
        text: `${away.region.name}へ遠征し、${opponentName}と練習試合を行う`,
        tone: 'normal',
      },
      {
        type: 'message',
        text: `遠征費 ${formatFunds(away.cost)} がかかった`,
        tone: 'bad',
      },
    ],
    matchSetup: {
      kind: 'friendly',
      opponentName,
      ...(rival ? { opponentSchoolId: rival.id } : {}),
      opponentStrength,
      awayRegionName: away.region.name,
    },
    fundsDelta: -away.cost,
    reputationDelta: 1,
  }
}

/**
 * 遠征する場合の行き先と費用を決める。
 *
 * - `undefined` … 地元開催（遠征が起きなかった）
 * - `null` … 遠征のはずだったが部費が足りず断った
 */
function pickAwayTrip(
  rng: Rng,
  context: CellContext,
): { region: Region; cost: number } | null | undefined {
  const home = context.region
  if (!home || !rng.chance(AWAY_MATCH_CHANCE)) return undefined

  // 練習試合で飛行機には乗らない。日帰りできる範囲の地区だけを候補にする
  const candidates = REGIONS.filter((region) => {
    const distance = travelDistance(home, region)
    return distance > 0 && distance <= FRIENDLY_TRAVEL_MAX_DISTANCE
  })
  if (candidates.length === 0) return undefined

  // **学校を置いてある県を優先する。** 縁のある相手と何度も当たるほうが、
  // 毎回知らない名前が出るより遠征に意味が出る
  const known = candidates.filter(
    (region) => rivalsIn(context.rivals ?? [], region.id).length > 0,
  )
  const region = rng.pick(known.length > 0 ? known : candidates)
  const cost = friendlyTravelCost(travelDistance(home, region))

  // 払えないなら断る（借金は作らない）
  if ((context.funds ?? 0) < cost) return null

  return { region, cost }
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
  const pitchingKeys: GrowableKey[] = ['control', 'stamina', 'breaking']
  return rng.pick(player.isPitcher ? [...battingKeys, ...pitchingKeys] : battingKeys)
}

/** やる気を上下させる（-2〜+2の範囲に収める） */
function shiftMotivation(current: Motivation, delta: number): Motivation {
  return clamp(current + delta, -2, 2) as Motivation
}
