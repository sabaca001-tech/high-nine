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
import type { Aptitude, GrowableKey, Player, Position } from '@/core/types/player'

/** 練習方針 */
export type TrainingFocus =
  /** チームの練習に合わせる（既定） */
  | { type: 'team' }
  /** 特定の能力を重点的に伸ばす */
  | { type: 'ability'; key: GrowableKey }
  /** 別のポジションを守れるように練習する */
  | { type: 'convert'; position: Position }

export const DEFAULT_FOCUS: TrainingFocus = { type: 'team' }

/** 重点的に伸ばす能力にかかる倍率 */
export const FOCUS_BONUS = 1.6

/** 重点外の能力にかかる倍率。集中するほど他が疎かになる */
export const FOCUS_PENALTY = 0.6

/** コンバート練習中は通常の練習効果が下がる */
export const CONVERT_PRACTICE_PENALTY = 0.7

/** コンバートで到達できる上限。本職(S)には届かない */
export const CONVERT_MAX: Aptitude = 'A'

/** 適性が1段階上がるのに必要な練習回数 */
export const CONVERT_STEPS = 8

/** APTITUDE_ORDER は S が0番。数字が小さいほど良い */
function rankIndex(aptitude: Aptitude): number {
  return APTITUDE_ORDER.indexOf(aptitude)
}

/** その位置をこれ以上鍛えられるか */
export function canConvert(player: Player, position: Position): boolean {
  if (player.position === position) return false
  return rankIndex(player.aptitudes[position]) > rankIndex(CONVERT_MAX)
}

/** いま指定できるコンバート先の一覧 */
export function convertiblePositions(player: Player): Position[] {
  return ALL_POSITIONS.filter((position) => canConvert(player, position))
}

/**
 * この選手がその能力を練習したときの倍率。
 *
 * - チーム方針（既定）… すべて等倍
 * - 能力を指定 … その能力は1.6倍、他は0.6倍
 * - コンバート … 全体に0.7倍（守備位置の練習に時間を使うため）
 */
export function focusMultiplier(player: Player, key: GrowableKey): number {
  const focus = player.focus ?? DEFAULT_FOCUS

  if (focus.type === 'convert') return CONVERT_PRACTICE_PENALTY
  if (focus.type === 'ability') return focus.key === key ? FOCUS_BONUS : FOCUS_PENALTY
  return 1
}

/** 方針を変えたときの新しい選手。コンバートの進捗はやり直しになる */
export function withFocus(player: Player, focus: TrainingFocus): Player {
  if (isSameFocus(player.focus ?? DEFAULT_FOCUS, focus)) return player
  return { ...player, focus, convertProgress: 0 }
}

/** 同じ方針かどうか */
export function isSameFocus(a: TrainingFocus, b: TrainingFocus): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'ability' && b.type === 'ability') return a.key === b.key
  if (a.type === 'convert' && b.type === 'convert') return a.position === b.position
  return true
}

export type ConvertStep = {
  player: Player
  /** 適性が上がったときだけ入る */
  promoted?: { position: Position; from: Aptitude; to: Aptitude }
}

/**
 * コンバート練習を1回ぶん進める。
 *
 * 一定回数積み上がると適性が1段階上がる。
 * 上限（A）に達したら方針をチーム練習へ戻す（進めても意味が無いため）。
 */
export function advanceConvert(player: Player): ConvertStep {
  const focus = player.focus
  if (focus?.type !== 'convert') return { player }

  const position = focus.position
  if (!canConvert(player, position)) {
    return { player: { ...player, focus: DEFAULT_FOCUS, convertProgress: 0 } }
  }

  const progress = (player.convertProgress ?? 0) + 1
  if (progress < CONVERT_STEPS) {
    return { player: { ...player, convertProgress: progress } }
  }

  const from = player.aptitudes[position]
  const to = APTITUDE_ORDER[rankIndex(from) - 1]
  const aptitudes = { ...player.aptitudes, [position]: to }
  const promoted = { position, from, to }

  // 上限に届いたらチーム練習へ戻す
  const reachedMax = rankIndex(to) <= rankIndex(CONVERT_MAX)

  return {
    player: {
      ...player,
      aptitudes,
      convertProgress: 0,
      ...(reachedMax ? { focus: DEFAULT_FOCUS } : {}),
    },
    promoted,
  }
}

/** 方針の表示名 */
export function focusLabel(focus: TrainingFocus | undefined, labels: Record<string, string>): string {
  const value = focus ?? DEFAULT_FOCUS
  if (value.type === 'ability') return labels[value.key] ?? value.key
  if (value.type === 'convert') return `${value.position}へ転向`
  return 'チーム練習'
}
