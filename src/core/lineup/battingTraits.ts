/**
 * 打順を組むための「打者の持ち味」。
 *
 * 打順ごとに見たいものが違う。1番は塁に出てかき回す力、4番は一発、
 * 9番は「いちばん打てない選手」。**ミートとパワーの平均だけでは並べられない。**
 *
 * ここは打順を決めるためだけの物差しで、試合の判定には使わない
 * （判定は `simulateAtBat`）。数字の出どころは揃えてあるので、
 * 「選球眼が良いから2番」と出したら試合でも四球を選ぶ。
 */

import { effectOf } from '@/core/player/personality'
import type { Player } from '@/core/types/player'

function has(player: Player, skillId: string): boolean {
  return player.skills.includes(skillId)
}

/**
 * 出塁力。**四球を選べるかを含む。**
 *
 * ミートだけで見ると「打つけれど振り回す打者」が上位に来る。
 * `simulateAtBat` の `eye` と同じ材料（ミート・性格・選球眼の特殊能力）を使う。
 */
export function onBaseScore(player: Player): number {
  let score = player.batting.meet + effectOf(player.personality).eye * 1.5
  if (has(player, 'contact-eye')) score += 14
  if (has(player, 'chase-swing')) score -= 14
  return score
}

/**
 * 長打力。パワーに弾道を乗せる。
 * 同じパワーでも弾道が高いほうがスタンドまで運べる（`simulateAtBat` と同じ考え方）。
 */
export function sluggingScore(player: Player): number {
  let score = player.batting.power * (1 + (player.batting.trajectory - 2) * 0.12)
  if (has(player, 'power-hitter')) score += 8
  return score
}

/**
 * 勝負強さ。走者を置いた場面で上振れするか。
 * 5番のように「詰まった場面が回ってくる打順」で見る。
 */
export function clutchScore(player: Player): number {
  let score = effectOf(player.personality).clutch * 2
  if (has(player, 'clutch-hitter')) score += 18
  if (has(player, 'walk-off')) score += 12
  if (has(player, 'cold-bat')) score -= 18
  return score
}

/**
 * 総合的な打力。**打順を落とす基準**にも使う。
 * 9番は「これがいちばん低い選手」で決める。
 */
export function battingScore(player: Player): number {
  return player.batting.meet * 0.55 + player.batting.power * 0.45
}

/** 走力。盗塁の成功率が上がる特殊能力も見る */
export function runningScore(player: Player): number {
  let score = player.batting.speed
  if (has(player, 'fast-start')) score += 8
  return score
}
