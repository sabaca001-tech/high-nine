/**
 * 選手の見た目の色を決める。
 * 表示のためだけの割り当てなので core には置かない。
 *
 * **帽子とユニフォームはチームで共通**。同じ部の選手なのに
 * 一人ひとり色が違うのは不自然なので、学校名から1組決めて全員に使う。
 * 選手ごとの区別は、ポジションで色分けするネームプレートで付ける。
 */

import { ALL_POSITIONS, positionGroupOf } from '@/core/lineup/aptitude'
import type { PositionGroup } from '@/core/lineup/aptitude'
import type { Aptitude, Player, Position } from '@/core/types/player'
import { normalizeUniform } from '@/core/team/uniforms'
import type { UniformId } from '@/core/team/uniforms'

/**
 * ユニフォームの id と実際の色の対応。
 *
 * **色を知っているのはここだけ。** core は id しか持たないので、
 * テーマを差し替えても core を触らずに済む。
 */
export function teamColors(uniform: UniformId): { cap: string; uniform: string } {
  const id = normalizeUniform(uniform)
  return { cap: `var(--team-${id}-cap)`, uniform: `var(--team-${id}-uniform)` }
}

export function teamCapColor(uniform: UniformId): string {
  return teamColors(uniform).cap
}

/**
 * ポジションの系統の色。投手＝ピンク、捕手＝水色、内野＝黄、外野＝緑。
 * **系統そのものの定義は core にある**（`lineup/aptitude.ts`）。
 * 代表の枠のようにゲームのルールが系統を見るので、色分けの都合ではない。
 */

export type { PositionGroup }

export const POSITION_GROUP_COLORS: Record<PositionGroup, string> = {
  pitcher: 'var(--pos-pitcher)',
  catcher: 'var(--pos-catcher)',
  infield: 'var(--pos-infield)',
  outfield: 'var(--pos-outfield)',
}

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  pitcher: '投手',
  catcher: '捕手',
  infield: '内野',
  outfield: '外野',
}

export function groupOf(position: Position): PositionGroup {
  return positionGroupOf({ position })
}

/** ネームプレートに色を出す適性の下限。ここ未満は「守れない」扱い */
const PLATE_APTITUDE_MIN: Aptitude = 3

function isPlateWorthy(aptitude: Aptitude): boolean {
  return aptitude >= PLATE_APTITUDE_MIN
}

/**
 * その選手が就ける系統の一覧。**本職の系統が必ず先頭**。
 * 本職以外にも適性があれば、その系統が後ろに続く。
 */
export function groupsOf(player: Player): PositionGroup[] {
  const main = groupOf(player.position)
  const others = ALL_POSITIONS
    .filter((position) => position !== player.position)
    .filter((position) => isPlateWorthy(player.aptitudes[position]))
    .map(groupOf)
    .filter((group) => group !== main)

  return [main, ...new Set(others)]
}

/**
 * ネームプレートの背景。
 *
 * **左が本職の色**で、他に適性がある系統の色が右へ混ざる。
 * 一覧を眺めたときに「この選手はどこを守れるか」が色の帯で読める。
 */
export function plateGradient(player: Player): string {
  const colors = groupsOf(player).map((group) => POSITION_GROUP_COLORS[group])
  if (colors.length === 1) return colors[0]

  // 本職の色を左半分にしっかり残し、残りを右側で分け合う
  const stops: string[] = [`${colors[0]} 0%`, `${colors[0]} 45%`]
  const rest = colors.slice(1)
  const span = 55 / rest.length

  rest.forEach((color, index) => {
    const from = 45 + span * index
    stops.push(`${color} ${(from + span * 0.35).toFixed(0)}%`, `${color} ${(from + span).toFixed(0)}%`)
  })

  return `linear-gradient(100deg, ${stops.join(', ')})`
}

/** ランク → 色。CSS変数名を返す */
export function rankColorOf(rank: string): string {
  return `var(--rank-${rank.toLowerCase()})`
}

