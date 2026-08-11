/**
 * 帽子の色。**core は id しか持たない**ので、ここで CSS 変数に対応づける。
 *
 * ユニフォーム（`playerColors.ts` の `teamCapColor`）と違い、
 * 帽子は本体・つば・マークを別々に選べる。
 */

import type { CapColorId } from '@/core/team/cap'

const CAP_COLOR_VARS: Record<CapColorId, string> = {
  navy: 'var(--cap-navy)',
  crimson: 'var(--cap-crimson)',
  charcoal: 'var(--cap-charcoal)',
  forest: 'var(--cap-forest)',
  white: 'var(--cap-white)',
  sky: 'var(--cap-sky)',
  gold: 'var(--cap-gold)',
}

export function capColorOf(id: CapColorId): string {
  return CAP_COLOR_VARS[id]
}
