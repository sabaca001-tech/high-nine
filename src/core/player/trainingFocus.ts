/**
 * 選手ごとの練習方針。
 *
 * チーム全体の練習カードだけだと、「この選手のミートだけ伸ばしたい」
 * という意図が通らない。選手ごとに**自主練の内容**を指定できるようにして、
 * 誰をどう育てるかを選べるようにした。
 *
 * ただし全員を自由に伸ばせては困るので、**得意分野に絞るほど他が伸びにくい**
 * というトレードオフを置いている。
 *
 * コンバートもここで扱う。以前は部費で1段階ずつ買っていたが、
 * 「守る位置は金ではなく練習で覚えるもの」なので練習方針に移した。
 */

import { APTITUDE_ORDER, ALL_POSITIONS } from '@/core/lineup/aptitude'
import { APTITUDE_MAX } from '@/core/types/player'
import type { Rng } from '@/core/rng/random'
import type { Aptitude, GrowableKey, Player, Position } from '@/core/types/player'
import { rollPitchingFor } from './convertPitching'
import { isArsenalComplete } from './pitchDefs'
import type { PitchGoal } from './pitchDefs'

/** 練習方針 */
export type TrainingFocus =
  /** チームの練習に合わせる（既定） */
  | { type: 'team' }
  /** 特定の能力を重点的に伸ばす */
  | { type: 'ability'; key: GrowableKey }
  /**
   * 別のポジションを練習する。
   *
   * `main` を立てると**本職そのものを移す**。
   * サブ（既定）は「守れる位置を増やす」だけで、適性はAで止まる。
   * 本職にするなら S まで上げるので時間がかかるが、
   * 到達した時点でポジションが入れ替わる。
   */
  | { type: 'convert'; position: Position; main?: boolean }
  /**
   * 打撃フォームを作り直して**弾道を上げる**。
   *
   * 弾道は1〜4の4段階しかなく、1段の重みが他の能力とまるで違う。
   * 日々の練習で1ずつ増える類の値ではないので、
   * **積み上げた練習量を溜めて、届いたところで1段上がる**形にした。
   * かかる量はパワーを12上げるのと同じくらい（`TRAJECTORY_COST`）。
   */
  | { type: 'trajectory' }
  /**
   * 球種を練習する。
   *
   * **キレを上げるのとは別のこと。**
   * キレは「変化球そのものの強さ」で、こちらは「何を投げられるか」。
   * 積み上げた練習量が届くたびに、持ち球がひとつ動く。
   *
   * **何を狙うかは選べる。** 球種を増やせば的が絞らせず、
   * 変化量を上げれば1球で仕留められる。どちらの投手にするかは監督が決める。
   *
   * 弾道と違って**上限まで続く**（覚えるものが無くなったら自動で終わる）。
   */
  | { type: 'pitch'; goal: PitchGoal }

export const DEFAULT_FOCUS: TrainingFocus = { type: 'team' }

/**
 * 弾道を1段上げるのに必要な練習量（能力値に換算した点数）。
 *
 * **パワーを12上げるのと同じ重み**にしてある。
 * 4段階しかないので、他の能力1点と同じ感覚で上がってしまうと
 * 全員が弾道4になり、打球の質という個性が消える。
 */
export const TRAJECTORY_COST = 12

/** 弾道の練習中、他の能力にかかる倍率 */
export const TRAJECTORY_PRACTICE_PENALTY = 0.7

/**
 * 球種をひとつ覚える（変化量を1上げる）のに必要な練習量。
 *
 * **変化球を8上げるのと同じ重み。** 弾道（12）より軽くしてあるのは、
 * 1段の重みが小さく、覚えるものが何段もあるため。
 */
export const PITCH_COST = 8

/** 球種の練習中、他の能力にかかる倍率 */
export const PITCH_PRACTICE_PENALTY = 0.75

/** 重点的に伸ばす能力にかかる倍率 */
export const FOCUS_BONUS = 1.6

/** 重点外の能力にかかる倍率。集中するほど他が疎かになる */
export const FOCUS_PENALTY = 0.6

/** コンバート練習中は通常の練習効果が下がる */
export const CONVERT_PRACTICE_PENALTY = 0.7

/** サブポジとして鍛えたときの上限。本職（5）には届かない */
export const CONVERT_MAX: Aptitude = 4

/** 本職として転向したときの上限。ここまで来ると本職が入れ替わる */
export const CONVERT_MAIN_MAX: Aptitude = APTITUDE_MAX

/** 適性が1段階上がるのに必要な練習回数 */
export const CONVERT_STEPS = 8

/**
 * 本職を移すときの1段階ぶん。
 *
 * **サブで守れるようにするのとは重みが違う。**
 * 「今日から一塁手」で済むなら、守備適性という仕組み自体の意味が薄い。
 */
export const CONVERT_MAIN_STEPS = 14

/** その方針での上限 */
export function convertCeiling(focus: { main?: boolean }): Aptitude {
  return focus.main ? CONVERT_MAIN_MAX : CONVERT_MAX
}

/** その方針での1段階ぶんの練習回数 */
export function convertSteps(focus: { main?: boolean }): number {
  return focus.main ? CONVERT_MAIN_STEPS : CONVERT_STEPS
}

/** 適性は数字が大きいほど良い（5が本職） */
function rankIndex(aptitude: Aptitude): number {
  return APTITUDE_ORDER.indexOf(aptitude)
}

/**
 * その位置をこれ以上鍛えられるか。
 *
 * サブなら A まで、本職として移すなら S まで。
 * **本職を移す指定は、すでに S でも受け付ける**
 * （適性が足りていれば、その場で本職が入れ替わる）。
 */
export function canConvert(player: Player, position: Position, main = false): boolean {
  if (player.position === position) return false
  if (main) return true
  return rankIndex(player.aptitudes[position]) > rankIndex(CONVERT_MAX)
}

/** いま指定できるコンバート先の一覧 */
export function convertiblePositions(player: Player, main = false): Position[] {
  return ALL_POSITIONS.filter((position) => canConvert(player, position, main))
}

/**
 * 本職のポジションで、その能力がどれだけ効くか。
 *
 * **おまかせ（チーム練習）でも、伸び方はポジションで傾く。**
 * すべて等倍にしていた頃は、遊撃手のパワーも一塁手の走力も同じだけ伸びて、
 * 3年経つと**誰を見ても同じ形のレーダー**になっていた。
 * 守る位置なりの選手に育つほうが、編成を考える意味が出る。
 *
 * **強制ではない。** 幅は 0.65〜1.35 に収めてあり、
 * 選手ごとの得意・苦手（`growthAptitude`）や練習カードの内容のほうが
 * 効き方は大きい。「遊撃手だが打てる」も普通に生まれる。
 *
 * 平均が1.0になるように配ってあるので、チーム全体の成長量は変わらない
 * （変えたいのは「誰のどこが伸びるか」だけ）。
 *
 * **順位で持つ。** 倍率を直に持たせると、監督が並べ替えたときに
 * 平均が1.0から外れてチーム全体の成長速度まで動いてしまう。
 * 順位から倍率を引けば、どう並べ替えても総量は変わらない。
 */
const DEFAULT_GROWTH_PLAN: Record<Position, GrowableKey[]> = {
  // 投手は投げる能力に寄せる。打撃はほとんど伸びない
  P: [
    'velocity',
    'control',
    'sharpness',
    'life',
    'stamina',
    'catching',
    'fielding',
    'arm',
    'speed',
    'meet',
    'power',
  ],
  C: ['catching', 'arm', 'fielding', 'meet', 'power', 'speed'],
  SS: ['fielding', 'arm', 'speed', 'meet', 'catching', 'power'],
  '2B': ['fielding', 'speed', 'catching', 'meet', 'arm', 'power'],
  '3B': ['arm', 'fielding', 'power', 'meet', 'catching', 'speed'],
  '1B': ['power', 'meet', 'catching', 'fielding', 'speed', 'arm'],
  CF: ['speed', 'fielding', 'meet', 'arm', 'power', 'catching'],
  LF: ['power', 'meet', 'speed', 'fielding', 'arm', 'catching'],
  RF: ['arm', 'power', 'meet', 'speed', 'fielding', 'catching'],
}

/**
 * 順位ごとの倍率。**合計が項目数と一致する**ように置いてある。
 *
 * 平均が1.0なので、並べ替えても**チーム全体の成長量は変わらない**。
 * 変わるのは「誰のどこが伸びるか」だけ。
 */
const FIELDER_WEIGHTS = [1.3, 1.15, 1.05, 0.95, 0.85, 0.7]
const PITCHER_WEIGHTS = [1.35, 1.3, 1.25, 1.15, 1.05, 0.95, 0.9, 0.85, 0.8, 0.75, 0.65]

/** 優先順の並びから倍率を引く */
function weightAt(position: Position, rank: number): number {
  const table = position === 'P' ? PITCHER_WEIGHTS : FIELDER_WEIGHTS
  return table[rank] ?? 1
}

/** そのポジションの既定の優先順 */
export function defaultGrowthOrder(position: Position): GrowableKey[] {
  return DEFAULT_GROWTH_PLAN[position]
}

/** 監督が並べ替えた優先順。ポジションごとに持つ */
export type GrowthPlan = Partial<Record<Position, GrowableKey[]>>

/**
 * そのポジションでいま使われている優先順。
 * 指定が無ければ既定を返す。
 *
 * **並びが壊れていても直して返す。** 保存されたデータに
 * 知らない能力が混ざっていたり、足りなかったりしても、
 * 既定の並びで埋めれば成長計算は続けられる。
 */
export function growthOrderOf(position: Position, plan?: GrowthPlan): GrowableKey[] {
  const base = DEFAULT_GROWTH_PLAN[position]
  const saved = plan?.[position]
  if (!saved) return base

  const valid = saved.filter((key, index) => base.includes(key) && saved.indexOf(key) === index)
  return [...valid, ...base.filter((key) => !valid.includes(key))]
}

/** 本職での重要度による倍率。並びに無い能力は等倍 */
export function positionGrowthMultiplier(
  position: Position,
  key: GrowableKey,
  plan?: GrowthPlan,
): number {
  const order = growthOrderOf(position, plan)
  const rank = order.indexOf(key)
  return rank < 0 ? 1 : weightAt(position, rank)
}

/**
 * この選手がその能力を練習したときの倍率。
 *
 * - チーム方針（既定）… 本職での重要度で傾く（`POSITION_GROWTH`）
 * - 能力を指定 … その能力は1.6倍、他は0.6倍
 * - コンバート … 全体に0.7倍（守備位置の練習に時間を使うため）
 */
export function focusMultiplier(player: Player, key: GrowableKey, plan?: GrowthPlan): number {
  const focus = player.focus ?? DEFAULT_FOCUS

  if (focus.type === 'convert') return CONVERT_PRACTICE_PENALTY
  if (focus.type === 'trajectory') return TRAJECTORY_PRACTICE_PENALTY
  if (focus.type === 'pitch') return PITCH_PRACTICE_PENALTY
  if (focus.type === 'ability') return focus.key === key ? FOCUS_BONUS : FOCUS_PENALTY
  return positionGrowthMultiplier(player.position, key, plan)
}

/** 方針を変えたときの新しい選手。コンバートの進捗はやり直しになる */
export function withFocus(player: Player, focus: TrainingFocus): Player {
  if (isSameFocus(player.focus ?? DEFAULT_FOCUS, focus)) return player
  return { ...player, focus, convertProgress: 0 }
}

/** その選手が球種の練習を指示できるか（投手で、覚える余地があるか） */
export function canPracticePitch(player: Player): boolean {
  return player.pitching !== null && !isArsenalComplete(player.pitching.pitches)
}

/** 同じ方針かどうか */
export function isSameFocus(a: TrainingFocus, b: TrainingFocus): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'ability' && b.type === 'ability') return a.key === b.key
  if (a.type === 'convert' && b.type === 'convert') {
    return a.position === b.position && (a.main ?? false) === (b.main ?? false)
  }
  if (a.type === 'pitch' && b.type === 'pitch') return a.goal === b.goal
  return true
}

export type ConvertStep = {
  player: Player
  /** 適性が上がったときだけ入る */
  promoted?: { position: Position; from: Aptitude; to: Aptitude }
  /** 本職が入れ替わったときだけ入る */
  converted?: { from: Position; to: Position }
}

/**
 * コンバート練習を1回ぶん進める。
 *
 * 一定回数積み上がると適性が1段階上がる。
 * 上限に達したら方針をチーム練習へ戻す（進めても意味が無いため）。
 * **本職として転向していた場合は、そこでポジションが入れ替わる。**
 */
export function advanceConvert(rng: Rng, player: Player): ConvertStep {
  const focus = player.focus
  if (focus?.type !== 'convert') return { player }

  const position = focus.position
  const main = focus.main ?? false
  const ceiling = convertCeiling(focus)
  const steps = convertSteps(focus)

  // すでに上限まで来ていれば、本職の入れ替えだけ済ませて終わる
  if (rankIndex(player.aptitudes[position]) <= rankIndex(ceiling)) {
    return main ? switchMainPosition(rng, player, position) : { player: backToTeam(player) }
  }

  const progress = (player.convertProgress ?? 0) + 1
  if (progress < steps) {
    return { player: { ...player, convertProgress: progress } }
  }

  const from = player.aptitudes[position]
  const to = APTITUDE_ORDER[rankIndex(from) - 1]
  const aptitudes = { ...player.aptitudes, [position]: to }
  const promoted = { position, from, to }
  const reachedMax = rankIndex(to) <= rankIndex(ceiling)

  const raised: Player = { ...player, aptitudes, convertProgress: 0 }
  if (!reachedMax) return { player: raised, promoted }

  if (!main) return { player: backToTeam(raised), promoted }

  const switched = switchMainPosition(rng, raised, position)
  return { ...switched, promoted }
}

function backToTeam(player: Player): Player {
  return { ...player, focus: DEFAULT_FOCUS, convertProgress: 0 }
}

/**
 * 本職を入れ替える。
 *
 * **投手と野手の行き来もここで扱う。**
 * 野手が投手になるときは投球能力を持っていないので、その場で作る
 * （持たないまま本職にすると、登板しても何も投げられない）。
 * 逆に投手が野手になったら投球能力は捨てる。
 * `isPitcher` と `pitching` は必ず揃っている、という前提が
 * あちこちにあるため（`Player` の型注釈）。
 */
function switchMainPosition(rng: Rng, player: Player, position: Position): ConvertStep {
  const from = player.position
  const toPitcher = position === 'P'

  const base: Player = {
    ...backToTeam(player),
    position,
    // 転向した位置は本職なので最上段にする
    aptitudes: { ...player.aptitudes, [position]: APTITUDE_MAX },
    isPitcher: toPitcher,
  }

  const converted = { from, to: position }
  if (toPitcher) {
    return {
      player: { ...base, pitching: player.pitching ?? rollPitchingFor(rng, player) },
      converted,
    }
  }
  return { player: { ...base, pitching: null }, converted }
}

/** 方針の表示名 */
export function focusLabel(focus: TrainingFocus | undefined, labels: Record<string, string>): string {
  const value = focus ?? DEFAULT_FOCUS
  if (value.type === 'ability') return labels[value.key] ?? value.key
  if (value.type === 'convert') {
    return value.main ? `${value.position}へ本職転向` : `${value.position}を練習`
  }
  if (value.type === 'trajectory') return '弾道'
  if (value.type === 'pitch') return value.goal === 'break' ? '変化量' : '球種'
  return 'チーム練習'
}
