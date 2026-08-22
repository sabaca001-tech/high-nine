/**
 * U18日本代表の記録。
 *
 * **誰が選ばれるかは `u18Squad.ts`、何が起きるかは `u18Series.ts`。**
 * ここは残る記録（代表歴）と、その使い道だけを持つ。
 *
 * 代表で活躍するとプロが本気で見に来るようになり、
 * 卒業時のドラフト指名の確率が大きく上がる（career.ts の decidePath）。
 */


/** 代表での1回の活躍度（0〜100） */
export type U18Cap = {
  year: number
  /** その大会での活躍度。0〜100 */
  performance: number
}

/**
 * 代表歴によるドラフトの上乗せ。
 * 選ばれただけでも見てもらえるが、活躍したかで大きく変わる。
 */
export function draftBonus(caps: readonly U18Cap[]): number {
  if (caps.length === 0) return 0
  const best = Math.max(...caps.map((cap) => cap.performance))
  return caps.length * 3 + Math.round(best / 6)
}

