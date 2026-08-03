/**
 * 毎月の維持費（設備と備品）。
 *
 * 部費の支出が「買いたいときに買う」だけだと、使わずに貯めるのが常に正解になる。
 * ボールもバットも消耗するし、グラウンドは整備し続けないと荒れる。
 * **何もしなくても毎月出ていく金**を作ることで、月々の支給は
 * 「部の維持に消えるお金」、大会の賞金は「強化に使えるお金」という
 * 役割の違いがはっきりする。
 *
 * 部員が増えるほど、設備を良くするほど維持費も上がる。
 * これによってグラウンドの整備が「払い切りの強化」ではなく、
 * **維持費を背負う決断**になる。
 */

import { clampGroundLevel } from './facility'

/** 部員1人あたりの備品費（ボール・バット・消耗品） */
export const EQUIPMENT_PER_PLAYER = 400

/**
 * グラウンドの維持費（1段階あたり）。
 * Lv1は土のグラウンドなので維持費はかからない。
 *
 * 段階が1〜99になったので、1段階あたりは小さい。
 * Lv50で14,700円/月、Lv99で29,400円/月。
 */
export const GROUND_UPKEEP_PER_LEVEL = 300

/** 維持費を払えなかったときに全員から減る信頼度 */
export const UNPAID_TRUST_PENALTY = 3

export type Upkeep = {
  /** 部員数に比例する備品費 */
  equipment: number
  /** グラウンドの段階に比例する設備維持費 */
  ground: number
  total: number
}

/** その月の維持費 */
export function monthlyUpkeep(playerCount: number, groundLevel: number): Upkeep {
  const equipment = playerCount * EQUIPMENT_PER_PLAYER
  const ground = (clampGroundLevel(groundLevel) - 1) * GROUND_UPKEEP_PER_LEVEL

  return { equipment, ground, total: equipment + ground }
}

/** 次の段階に上げると維持費がいくら増えるか。整備の判断材料として見せる */
export function groundUpkeepIncrease(): number {
  return GROUND_UPKEEP_PER_LEVEL
}
