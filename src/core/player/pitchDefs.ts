/**
 * 変化球の球種。
 *
 * 「変化球 D」という数字だけでは、その投手が何を投げるのか分からない。
 * 方向ごとに複数の球種を用意し、**どれを覚えるかは選手ごとに変える**ことで
 * 同じ変化球の値でも投手の個性が出るようにした。
 *
 * 変化量（level）は 1〜7。試合の判定には使わず、
 * 判定は従来どおり `breaking`（総合力）で行う。
 * 球種は「何を投げる投手なのか」を見せるためのもの。
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
 * 変化球の総合力が高いほど球種が多い。
 */
export function rollInitialPitches(rng: Rng, breaking: number): Pitch[] {
  const count = breaking >= 70 ? 3 : breaking >= 40 ? 2 : 1
  const pitches: Pitch[] = []

  for (let i = 0; i < count; i++) {
    const pitch = rollPitch(rng, pitches)
    if (pitch) pitches.push(pitch)
  }
  return pitches
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
  breaking: number,
): { pitches: Pitch[]; learned?: Pitch; improved?: Pitch } {
  // 持ち球が総合力に見合っていなければ、まず新球種を覚える
  const deserved = breaking >= 70 ? 3 : breaking >= 40 ? 2 : 1
  if (pitches.length < deserved) {
    const learned = rollPitch(rng, pitches)
    if (learned) return { pitches: [...pitches, learned], learned }
  }

  // 伸ばせる球種の中から1つ選んで変化量を上げる
  const growable = pitches.filter((pitch) => pitch.level < PITCH_MAX_LEVEL)
  if (growable.length === 0) return { pitches: [...pitches] }

  const target = rng.pick(growable)
  const improved = { ...target, level: target.level + 1 }

  return {
    pitches: pitches.map((pitch) => (pitch === target ? improved : pitch)),
    improved,
  }
}
