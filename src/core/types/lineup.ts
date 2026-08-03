/** スタメン（打順と守備位置）の型 */

import type { Position } from './player'

/** 打順1つぶん */
export type LineupSlot = {
  /** 守備位置 */
  position: Position
  playerId: string
}

/**
 * スタメン。
 * 配列の並びがそのまま打順（0番目＝1番打者）。
 * 高校野球なので指名打者は無く、投手も打席に立つ。
 */
export type Lineup = {
  slots: LineupSlot[]
}

export const LINEUP_SIZE = 9
