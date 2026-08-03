/**
 * ユニフォームの候補。
 *
 * 以前は**学校名のハッシュ**から色を決めていたので、
 * 学校名を変えると色まで変わってしまい、選ぶこともできなかった。
 * id を state に持たせて、プレイヤーが選べるようにする。
 *
 * ここでは **id と名前だけ**を持つ。実際の色は UI 側
 * （`src/ui/theme/playerColors.ts`）が CSS 変数に対応づける。
 * core が色コードを知っていると、テーマの差し替えができなくなる。
 */

export type UniformId = 'navy' | 'crimson' | 'charcoal' | 'forest' | 'cream' | 'sky'

export const UNIFORMS: { id: UniformId; name: string }[] = [
  { id: 'navy', name: '紺' },
  { id: 'crimson', name: '臙脂' },
  { id: 'charcoal', name: '墨' },
  { id: 'forest', name: '深緑' },
  { id: 'cream', name: '生成り' },
  { id: 'sky', name: '空色' },
]

export const DEFAULT_UNIFORM: UniformId = 'navy'

const IDS = new Set<string>(UNIFORMS.map((uniform) => uniform.id))

/** 知らない id が来たら既定に落とす（古いセーブや手を入れたデータ対策） */
export function normalizeUniform(id: string | undefined): UniformId {
  return id !== undefined && IDS.has(id) ? (id as UniformId) : DEFAULT_UNIFORM
}

export function uniformName(id: UniformId): string {
  return UNIFORMS.find((uniform) => uniform.id === id)?.name ?? ''
}
