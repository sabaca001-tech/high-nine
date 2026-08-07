/**
 * 個人イベント（イベントマス）。
 *
 * **盤面が1マス1日になって、1年の手数が146手まで増えた。**
 * そのぶん1手が軽くなり、誰が何をしているのか分からないまま
 * 1年が過ぎるようになっていた。チーム全体の数字は動くのに、
 * 「この選手のこの出来事」が記憶に残らない。
 *
 * ここは**部員1人の名前が出て、監督が選ぶ**マス。
 * 止まると進行が止まり、選んだ結果がその選手だけに返る。
 * テンポをわざと落として、個人に目を向けさせるための仕組み。
 *
 * 選択には**必ず引き換えがある**。「良いほうを選ぶだけ」では
 * 止まる意味が無いので、伸びる代わりに消耗する／賭けになる、
 * という形にしてある。
 */

import type { Rng } from '@/core/rng/random'
import { clamp, raiseAbility } from '@/core/player/growth'
import { grantSkill } from '@/core/skill/grantSkill'
import { findSkill } from '@/core/skill/skillDefs'
import type { EventTone } from '@/core/types/event'
import type { AbilityChange, GrowableKey, Motivation, Player } from '@/core/types/player'
import { ABILITY_LABELS, MOTIVATION_LABELS } from '@/core/types/player'

/** 選択待ちの個人イベント。**セーブに入るのはこれだけ**（定義は関数を持つので入れない） */
export type PendingPlayerEvent = {
  eventId: string
  playerId: string
}

export type PlayerEventOutcome = {
  /** 対象の選手（更新後） */
  player: Player
  /** 何が起きたかの一文 */
  text: string
  tone: EventTone
  changes: AbilityChange[]
  /** チーム全体の信頼度の増減。省略時は0 */
  teamTrustDelta?: number
  /** 部費の増減。省略時は0 */
  fundsDelta?: number
}

export type PlayerEventChoice = {
  id: string
  label: string
  /** 何が起きそうかの手がかり。結果そのものは書かない */
  hint: string
  /** 選ぶのに必要な部費。払えないときは選べない */
  cost?: number
  resolve: (rng: Rng, player: Player) => PlayerEventOutcome
}

export type PlayerEventDef = {
  id: string
  title: string
  /** 場面の説明。`{name}` が選手名に置き換わる */
  text: string
  /** この選手に起こりうるか。省略時は誰にでも起こる */
  applies?: (player: Player) => boolean
  choices: PlayerEventChoice[]
}

// ── 効果を組み立てるための小道具 ──────────────────────────

/** その選手が持っている能力の中から1つ選ぶ */
function anyKey(rng: Rng, player: Player): GrowableKey {
  const batting: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']
  const pitching: GrowableKey[] = ['velocity', 'control', 'stamina', 'breaking']
  return rng.pick(player.isPitcher ? [...batting, ...pitching] : batting)
}

/** 投手なら投手の、野手なら野手の「本業」の能力を1つ選ぶ */
function coreKey(rng: Rng, player: Player): GrowableKey {
  return player.isPitcher
    ? rng.pick<GrowableKey>(['velocity', 'control', 'breaking', 'stamina'])
    : rng.pick<GrowableKey>(['meet', 'power'])
}

function shift(current: Motivation, delta: number): Motivation {
  return clamp(current + delta, -2, 2) as Motivation
}

/** 能力を1つ動かして、変化の記録つきで返す */
function bump(
  player: Player,
  key: GrowableKey,
  amount: number,
): { player: Player; changes: AbilityChange[] } {
  const { player: next, change } = raiseAbility(player, key, amount)
  return { player: next, changes: change ? [change] : [] }
}

function withCondition(player: Player, delta: number): Player {
  return { ...player, condition: clamp(player.condition + delta, 0, 100) }
}

function withTrust(player: Player, delta: number): Player {
  return { ...player, trust: clamp(player.trust + delta, 0, 100) }
}

// ── イベント定義 ────────────────────────────────────

export const PLAYER_EVENTS: PlayerEventDef[] = [
  {
    id: 'slump',
    title: '不調',
    text: '{name}が調子を落としている。バットが振れていない。',
    applies: (player) => !player.isPitcher,
    choices: [
      {
        id: 'drill',
        label: '納得いくまで振らせる',
        hint: '打撃は伸びるが体力を大きく削る',
        resolve: (rng, player) => {
          const key = rng.pick<GrowableKey>(['meet', 'power'])
          const { player: bumped, changes } = bump(player, key, rng.int(3, 5))
          return {
            player: withTrust(withCondition(bumped, -22), 4),
            text: `${player.name}は日が暮れるまで振り込んだ。${ABILITY_LABELS[key]}が伸びた`,
            tone: 'good',
            changes,
          }
        },
      },
      {
        id: 'rest',
        label: '思い切って休ませる',
        hint: '体力とやる気が戻る',
        resolve: (_rng, player) => ({
          player: { ...player, ...withCondition(player, 25), motivation: shift(player.motivation, 1) },
          text: `${player.name}を休ませた。頭が整理されたようだ（${MOTIVATION_LABELS[shift(player.motivation, 1)]}）`,
          tone: 'good',
          changes: [],
        }),
      },
      {
        id: 'watch',
        label: '黙って見守る',
        hint: '自分で抜け出せるかどうか',
        resolve: (rng, player) => {
          if (rng.chance(0.45)) {
            const key = rng.pick<GrowableKey>(['meet', 'power'])
            const { player: bumped, changes } = bump(player, key, rng.int(4, 7))
            return {
              player: withTrust(bumped, 6),
              text: `${player.name}は自分で答えを見つけた。${ABILITY_LABELS[key]}が大きく伸びた`,
              tone: 'good',
              changes,
            }
          }
          return {
            player: { ...player, motivation: shift(player.motivation, -1) },
            text: `${player.name}は出口を見つけられないままだ`,
            tone: 'bad',
            changes: [],
          }
        },
      },
    ],
  },
  {
    id: 'sore-arm',
    title: '肩の違和感',
    text: '{name}が肩に張りを感じているという。',
    applies: (player) => player.isPitcher && player.injuryMonths === 0,
    choices: [
      {
        id: 'rest',
        label: '大事を取って外す',
        hint: '無事に済むが投げ込みは進まない',
        resolve: (_rng, player) => ({
          player: withTrust(withCondition(player, 20), 4),
          text: `${player.name}を数日外した。張りは引いたようだ`,
          tone: 'normal',
          changes: [],
        }),
      },
      {
        id: 'push',
        label: '投げ込ませる',
        hint: '球威は上がるが、壊す危険がある',
        resolve: (rng, player) => {
          if (rng.chance(0.35)) {
            return {
              player: {
                ...withCondition(player, -15),
                injuryMonths: rng.int(1, 2),
              },
              text: `${player.name}が肩を痛めた。無理をさせすぎた`,
              tone: 'bad',
              changes: [],
            }
          }
          const key = rng.pick<GrowableKey>(['velocity', 'stamina'])
          const { player: bumped, changes } = bump(player, key, rng.int(3, 6))
          return {
            player: withCondition(bumped, -18),
            text: `${player.name}は投げ切った。${ABILITY_LABELS[key]}が伸びた`,
            tone: 'good',
            changes,
          }
        },
      },
    ],
  },
  {
    id: 'rival',
    title: 'ライバル',
    text: '{name}が他校の同学年の選手に強い刺激を受けたようだ。',
    choices: [
      {
        id: 'fuel',
        label: '闘志を煽る',
        hint: 'やる気が上がり、本業の能力も伸びる',
        resolve: (rng, player) => {
          const key = coreKey(rng, player)
          const { player: bumped, changes } = bump(player, key, rng.int(2, 4))
          return {
            player: { ...withCondition(bumped, -10), motivation: shift(player.motivation, 1) },
            text: `${player.name}は火がついた。${ABILITY_LABELS[key]}が伸びた`,
            tone: 'good',
            changes,
          }
        },
      },
      {
        id: 'calm',
        label: '自分の野球に集中させる',
        hint: 'チーム全体が落ち着く',
        resolve: (_rng, player) => ({
          player: withTrust(player, 8),
          text: `${player.name}は目の前の練習に戻った。部の空気も締まった`,
          tone: 'good',
          changes: [],
          teamTrustDelta: 3,
        }),
      },
    ],
  },
  {
    id: 'growth-spurt',
    title: '身体の変化',
    text: '{name}の身体がひと回り大きくなった。今なら何を入れても入る。',
    applies: (player) => player.grade < 3,
    choices: [
      {
        id: 'strength',
        label: '力をつけさせる',
        hint: 'パワー系が大きく伸びる',
        resolve: (rng, player) => {
          const key = player.isPitcher ? 'velocity' : 'power'
          const { player: bumped, changes } = bump(player, key, rng.int(4, 7))
          return {
            player: withCondition(bumped, -14),
            text: `${player.name}の${ABILITY_LABELS[key]}が伸びた`,
            tone: 'good',
            changes,
          }
        },
      },
      {
        id: 'balance',
        label: '身のこなしを取り戻させる',
        hint: '守備と走塁が伸びる',
        resolve: (rng, player) => {
          const first = bump(player, 'speed', rng.int(2, 4))
          const second = bump(first.player, 'fielding', rng.int(2, 4))
          return {
            player: withCondition(second.player, -12),
            text: `${player.name}は大きくなった身体を扱えるようになった`,
            tone: 'good',
            changes: [...first.changes, ...second.changes],
          }
        },
      },
    ],
  },
  {
    id: 'exam',
    title: '赤点',
    text: '{name}の成績が危ない。このままだと大会に出られない。',
    choices: [
      {
        id: 'study',
        label: '補習に行かせる',
        hint: '練習はできないが、部の信頼は保たれる',
        resolve: (_rng, player) => ({
          player: withTrust(withCondition(player, 10), 3),
          text: `${player.name}は補習に通い、なんとか間に合わせた`,
          tone: 'normal',
          changes: [],
          teamTrustDelta: 2,
        }),
      },
      {
        id: 'practice',
        label: '練習を優先させる',
        hint: '伸びるが、周りの目は厳しくなる',
        resolve: (rng, player) => {
          const key = coreKey(rng, player)
          const { player: bumped, changes } = bump(player, key, rng.int(3, 5))
          return {
            player: withTrust(bumped, -6),
            text: `${player.name}は練習を取った。${ABILITY_LABELS[key]}は伸びたが、教員の目は冷たい`,
            tone: 'normal',
            changes,
            teamTrustDelta: -3,
          }
        },
      },
    ],
  },
  {
    id: 'form-change',
    title: 'フォーム改造',
    text: '{name}がフォームを変えたいと言い出した。',
    choices: [
      {
        id: 'try',
        label: '任せてみる',
        hint: '大きく伸びるかもしれないし、崩れるかもしれない',
        resolve: (rng, player) => {
          const key = coreKey(rng, player)
          if (rng.chance(0.55)) {
            const { player: bumped, changes } = bump(player, key, rng.int(5, 8))
            return {
              player: withTrust(bumped, 5),
              text: `${player.name}の改造は当たった。${ABILITY_LABELS[key]}が大きく伸びた`,
              tone: 'good',
              changes,
            }
          }
          const { player: bumped, changes } = bump(player, key, -rng.int(3, 6))
          return {
            player: { ...bumped, motivation: shift(player.motivation, -1) },
            text: `${player.name}は感覚を見失った。${ABILITY_LABELS[key]}が下がった`,
            tone: 'bad',
            changes,
          }
        },
      },
      {
        id: 'keep',
        label: '今のままで通させる',
        hint: '小さく確実に積む',
        resolve: (rng, player) => {
          const key = coreKey(rng, player)
          const { player: bumped, changes } = bump(player, key, rng.int(1, 2))
          return {
            player: bumped,
            text: `${player.name}は今の形を磨いた。${ABILITY_LABELS[key]}が少し伸びた`,
            tone: 'normal',
            changes,
          }
        },
      },
    ],
  },
  {
    id: 'glove',
    title: '道具',
    text: '{name}のグラブがもう限界だ。',
    choices: [
      {
        id: 'buy',
        label: '部費で新調する',
        hint: '守備が伸び、本人も応える',
        cost: 40_000,
        resolve: (rng, player) => {
          const { player: bumped, changes } = bump(player, 'fielding', rng.int(2, 4))
          return {
            player: withTrust(bumped, 8),
            text: `${player.name}に新しいグラブを渡した。手に馴染むまで捕り続けている`,
            tone: 'good',
            changes,
            fundsDelta: -40_000,
          }
        },
      },
      {
        id: 'repair',
        label: '自分で直させる',
        hint: '道具を大事にする気持ちが育つ',
        resolve: (_rng, player) => ({
          player: withTrust(player, 5),
          text: `${player.name}は夜通しグラブを手入れした。道具への向き合い方が変わった`,
          tone: 'good',
          changes: [],
          teamTrustDelta: 2,
        }),
      },
    ],
  },
  {
    id: 'mentor',
    title: '面倒見',
    text: '{name}が下級生につきっきりで教えている。',
    applies: (player) => player.grade >= 2,
    choices: [
      {
        id: 'entrust',
        label: '任せる',
        hint: 'チーム全体の信頼が上がる',
        resolve: (_rng, player) => ({
          player: withTrust(player, 6),
          text: `${player.name}に任せた。下級生の動きが目に見えて良くなった`,
          tone: 'good',
          changes: [],
          teamTrustDelta: 6,
        }),
      },
      {
        id: 'own',
        label: '自分の練習をさせる',
        hint: '本人は伸びるが、周りは物足りない',
        resolve: (rng, player) => {
          const key = anyKey(rng, player)
          const { player: bumped, changes } = bump(player, key, rng.int(3, 5))
          return {
            player: bumped,
            text: `${player.name}は自分の練習に戻った。${ABILITY_LABELS[key]}が伸びた`,
            tone: 'good',
            changes,
            teamTrustDelta: -2,
          }
        },
      },
    ],
  },
  {
    id: 'nerves',
    title: '本番に弱い',
    text: '{name}は練習では打つのに、試合になると力が出ないという。',
    choices: [
      {
        id: 'mental',
        label: '一対一で向き合う',
        hint: '殻を破れば特殊能力が身につくかもしれない',
        resolve: (rng, player) => {
          if (rng.chance(0.4)) {
            const result = grantSkill(rng, player, 'blue')
            const skill = result.skillId ? findSkill(result.skillId) : undefined
            if (result.granted && skill) {
              return {
                player: withTrust(result.player, 8),
                text: `${player.name}は殻を破った。「${skill.name}」を身につけた`,
                tone: 'good',
                changes: [],
              }
            }
          }
          return {
            player: withTrust(player, 6),
            text: `${player.name}とじっくり話した。すぐには変わらないが、目つきは変わった`,
            tone: 'normal',
            changes: [],
          }
        },
      },
      {
        id: 'experience',
        label: '場数を踏ませる',
        hint: 'やる気は上がるが、消耗する',
        resolve: (_rng, player) => ({
          player: {
            ...withCondition(player, -12),
            motivation: shift(player.motivation, 1),
          },
          text: `${player.name}を出せる場面すべてで使った。慣れてきたようだ`,
          tone: 'good',
          changes: [],
        }),
      },
    ],
  },
  {
    id: 'position-doubt',
    title: '居場所',
    text: '{name}が「自分はこのままでいいのか」と漏らしている。',
    choices: [
      {
        id: 'push',
        label: '主力として扱う',
        hint: '信頼とやる気が上がる',
        resolve: (_rng, player) => ({
          player: withTrust(player, 12),
          text: `${player.name}に期待を伝えた。表情が変わった`,
          tone: 'good',
          changes: [],
        }),
      },
      {
        id: 'compete',
        label: '競わせる',
        hint: '悔しさをぶつけて伸びる。ただし信頼は下がる',
        resolve: (rng, player) => {
          const key = coreKey(rng, player)
          const { player: bumped, changes } = bump(player, key, rng.int(4, 6))
          return {
            player: withTrust(bumped, -5),
            text: `${player.name}は悔しさをぶつけてきた。${ABILITY_LABELS[key]}が伸びた`,
            tone: 'good',
            changes,
          }
        },
      },
    ],
  },
]

const EVENT_BY_ID = new Map(PLAYER_EVENTS.map((event) => [event.id, event]))

export function findPlayerEvent(id: string): PlayerEventDef | undefined {
  return EVENT_BY_ID.get(id)
}

export function findEventChoice(
  event: PlayerEventDef,
  choiceId: string,
): PlayerEventChoice | undefined {
  return event.choices.find((choice) => choice.id === choiceId)
}

/**
 * 起こすイベントと対象の選手を決める。
 *
 * **対象を先に決めてからイベントを絞る。** 逆にすると、
 * 投手専用のイベントが選ばれたときに対象がいない場合があり、
 * 「何も起きなかった」で終わってしまう。
 *
 * 出番の少ない選手にもスポットが当たるよう、
 * 選手は重みをつけずに一様に選ぶ。
 */
export function pickPlayerEvent(rng: Rng, players: Player[]): PendingPlayerEvent | null {
  const candidates = players.filter((player) => player.injuryMonths === 0)
  if (candidates.length === 0) return null

  const player = rng.pick(candidates)
  const events = PLAYER_EVENTS.filter((event) => event.applies?.(player) ?? true)
  if (events.length === 0) return null

  return { eventId: rng.pick(events).id, playerId: player.id }
}

/** 場面の説明文の `{name}` を選手名に置き換える */
export function eventText(event: PlayerEventDef, playerName: string): string {
  return event.text.replaceAll('{name}', playerName)
}
