/**
 * 変化球の球種。
 *
 * 「変化球 D」という数字だけでは、その投手が何を投げるのか分からない。
 * 方向ごとに複数の球種を用意し、**どれを覚えるかは選手ごとに変える**ことで
 * 同じ変化球の値でも投手の個性が出るようにした。
 *
 * 変化量（level）は 1〜7。**どれだけ曲がるか**を表す。
 * 打たれにくさの判定に使うのは能力値のキレ（`sharpness`）で、
 * 球種は「何を投げる投手なのか」と持ち球の充実ぶり（`arsenalScore`）を表す。
 */

import type { Rng } from '@/core/rng/random'
import type { Pitch, PitchDirection } from '@/core/types/player'

export const PITCH_MAX_LEVEL = 7

/** 方向の表示名 */
export const PITCH_DIRECTION_LABELS: Record<PitchDirection, string> = {
  left: 'スライダー系',
  lowerLeft: 'カーブ系',
  down: 'フォーク系',
  lowerRight: 'シンカー系',
  right: 'シュート系',
  up: '特殊',
}

/**
 * 方向ごとの球種の候補。
 * 実在の選手を想起させる呼称は使わず、一般的な球種名だけを並べる。
 */
export const PITCH_NAMES: Record<PitchDirection, string[]> = {
  left: ['スライダー', 'カットボール', '高速スライダー', 'スラーブ'],
  lowerLeft: ['カーブ', 'スローカーブ', 'ナックルカーブ', 'ドロップカーブ'],
  down: ['フォーク', 'SFF', 'チェンジアップ', 'パーム', 'スプリット'],
  lowerRight: ['シンカー', 'サークルチェンジ', 'スクリュー', 'Vスライダー'],
  right: ['シュート', 'ムービングファスト', 'ツーシーム'],
  up: ['ナックル', 'ホップライジング'],
}

/**
 * 方向の出やすさ。
 * スライダーとカーブは高校生でも持っている率が高く、
 * ナックルのような特殊球はまれ。
 */
const DIRECTION_WEIGHTS: { value: PitchDirection; weight: number }[] = [
  { value: 'left', weight: 30 },
  { value: 'lowerLeft', weight: 26 },
  { value: 'down', weight: 20 },
  { value: 'lowerRight', weight: 12 },
  { value: 'right', weight: 10 },
  { value: 'up', weight: 2 },
]

/** 表示するときの並び順（左回りに一周する） */
export const PITCH_DIRECTION_ORDER: PitchDirection[] = [
  'up',
  'left',
  'lowerLeft',
  'down',
  'lowerRight',
  'right',
]

/**
 * 新しい球種を1つ作る。
 * すでに持っている方向は選ばない（同じ方向に2つは持てない）。
 * 空きが無ければ null。
 */
export function rollPitch(rng: Rng, existing: readonly Pitch[]): Pitch | null {
  const used = new Set(existing.map((pitch) => pitch.direction))
  const candidates = DIRECTION_WEIGHTS.filter((entry) => !used.has(entry.value))
  if (candidates.length === 0) return null

  const direction = rng.weighted(candidates)
  return {
    direction,
    name: rng.pick(PITCH_NAMES[direction]),
    level: 1 + rng.int(0, 1),
  }
}

/**
 * 投手を作るときの持ち球。
 * キレが高いほど球種が多く、**変化量も大きい**。
 *
 * **変化量を1〜2で固定していたのをやめた。** 持ち球は練習でしか育たないので、
 * 生成されるだけの他校の投手は全員が「曲がらない球を2つ」しか持たず、
 * 3年生のエースでも持ち球の図が新入生と同じに見えていた。
 * 評価点は変化量を重く見る（`PITCHER_WEIGHTS.breakAmount`）ので、
 * そこが低いままだと他校の投手が構造的に低く評価される。
 */
export function rollInitialPitches(rng: Rng, sharpness: number): Pitch[] {
  const count = sharpness >= 70 ? 3 : sharpness >= 40 ? 2 : 1
  const pitches: Pitch[] = []

  for (let i = 0; i < count; i++) {
    const pitch = rollPitch(rng, pitches)
    if (pitch) pitches.push({ ...pitch, level: initialPitchLevel(rng, sharpness) })
  }
  return pitches
}

/**
 * 生成時の変化量。キレ70で4、キレ90で5あたり。
 * 上限は6にしてある（7は練習で磨いた投手だけの領域）。
 */
function initialPitchLevel(rng: Rng, sharpness: number): number {
  const base = 1 + Math.round(sharpness / 24)
  return Math.max(1, Math.min(6, base + rng.int(-1, 1)))
}

/** 持てる球種の数（方向の数だけ持てる） */
export const PITCH_MAX_COUNT = PITCH_DIRECTION_ORDER.length

/** これ以上、覚えることも磨くことも無いか */
export function isArsenalComplete(pitches: readonly Pitch[]): boolean {
  return (
    pitches.length >= PITCH_MAX_COUNT && pitches.every((pitch) => pitch.level >= PITCH_MAX_LEVEL)
  )
}

/**
 * 持ち球の充実ぶり（0〜）。
 *
 * **球種の数と変化量の両方を見る。** 数だけで測ると
 * 変化量1の球を6つ持った投手が最高になり、
 * 変化量だけで測ると1球種を磨き上げた投手と3球種の投手が並ぶ。
 *
 * 入学時（1〜2球種・変化量1〜2）で2〜3、
 * 3球種を変化量4まで磨いた投手で8前後になる。
 */
export function arsenalScore(pitches: readonly Pitch[]): number {
  const levels = pitches.reduce((sum, pitch) => sum + pitch.level, 0)
  return levels * 0.5 + pitches.length * 0.7
}

/**
 * 変化球練習の成果を持ち球に反映する。
 *
 * 「新しい球種を覚える」か「今ある球種の変化量が上がる」かのどちらか。
 * 変化のあった球種を返す（無ければ null）。
 */
export function improvePitches(
  rng: Rng,
  pitches: readonly Pitch[],
  sharpness: number,
  /**
   * 球種練習として行う場合。
   *
   * **総合力に見合う数を超えて覚えられる。** 通常の練習では
   * 「変化球の総合力に見合う持ち球」までしか増えないので、
   * 変化球が伸びない投手は何を練習しても1球種のままだった。
   * 本人が球種の練習を選んだのなら、そこは伸ばせるようにする。
   */
  deliberate = false,
): { pitches: Pitch[]; learned?: Pitch; improved?: Pitch } {
  // 持ち球がキレに見合っていなければ、まず新球種を覚える
  const deserved = sharpness >= 70 ? 3 : sharpness >= 40 ? 2 : 1
  if (pitches.length < deserved) {
    const learned = rollPitch(rng, pitches)
    if (learned) return { pitches: [...pitches, learned], learned }
  }

  // 伸ばせる球種の中から1つ選んで変化量を上げる
  const growable = pitches.filter((pitch) => pitch.level < PITCH_MAX_LEVEL)
  if (growable.length === 0) {
    // 磨ける球種が無ければ、球種練習に限り新しい球種を覚える
    const learned = deliberate ? rollPitch(rng, pitches) : null
    if (learned) return { pitches: [...pitches, learned], learned }
    return { pitches: [...pitches] }
  }

  const target = rng.pick(growable)
  const improved = { ...target, level: target.level + 1 }

  return {
    pitches: pitches.map((pitch) => (pitch === target ? improved : pitch)),
    improved,
  }
}
