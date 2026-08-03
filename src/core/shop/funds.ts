/**
 * 部費。
 *
 * 本家はモード外でアイテムを買えるが、本作は完結させたいので
 * **部費という校内の予算**を作り、その範囲でショップを使う形にした。
 *
 * 収入は「毎月の部費」と「大会の成績」の2つ。
 * 評判が上がると部費も増えるので、勝つほど選択肢が広がる。
 */

import type { Tournament } from '@/core/types/tournament'

/** 毎月支給される部費の基本額 */
export const BASE_MONTHLY_FUNDS = 8000

/** 評判1あたりの上乗せ */
const REPUTATION_RATE = 400

/** 部費の上限。貯め込みすぎないようにする */
export const FUNDS_MAX = 999_999

/**
 * 月初に支給される部費。
 * 評判20（初期）で16,000、評判100で48,000。
 */
export function monthlyFunds(reputation: number): number {
  return BASE_MONTHLY_FUNDS + reputation * REPUTATION_RATE
}

/**
 * 1勝ごとの賞金。
 *
 * 全国大会が桁違いに大きいのは、入場料の分配と寄付があるため。
 * ゲーム上の意味としては、**1勝ぶんの賞金が1泊ぶんの宿泊費を上回る**
 * ようにしてある（travel.ts）。逆にすると「勝ち進むほど赤字」になり、
 * 勝ちたくないという歪んだ動機が生まれる。
 */
const PRIZE_PER_WIN: Record<Tournament['kind'], number> = {
  summerPref: 8_000,
  autumnPref: 6_000,
  nationals: 80_000,
  springNationals: 60_000,
}

/** 優勝したときの追加分 */
const CHAMPION_BONUS: Record<Tournament['kind'], number> = {
  summerPref: 40_000,
  nationals: 150_000,
  springNationals: 100_000,
  autumnPref: 15_000,
}

/**
 * 大会の成績でもらえる部費。
 * 勝ち進むほど増え、負けても減らない。
 */
export function tournamentPrize(tournament: Tournament): number {
  const wins = tournament.results.filter((entry) => entry.won).length
  const bonus = tournament.champion ? CHAMPION_BONUS[tournament.kind] : 0
  return wins * PRIZE_PER_WIN[tournament.kind] + bonus
}

/** 金額の表示用フォーマット（1,234円） */
export function formatFunds(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`
}
