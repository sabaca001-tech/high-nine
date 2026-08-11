/**
 * 帽子のデザイン。
 *
 * ユニフォーム（`uniforms.ts`）と同じで、**core は色コードを知らない**。
 * 持つのは id だけで、実際の色は UI 側（`src/ui/theme/capColors.ts`）が対応づける。
 *
 * 変えられるのは**配色とロゴだけ**。形まで選べるようにすると、
 * 選択肢は増えるのに見分けが付きにくくなる（帽子は小さく描かれる）。
 */

export type CapColorId = 'navy' | 'crimson' | 'charcoal' | 'forest' | 'white' | 'sky' | 'gold'

export const CAP_COLORS: { id: CapColorId; name: string }[] = [
  { id: 'navy', name: '紺' },
  { id: 'crimson', name: '臙脂' },
  { id: 'charcoal', name: '墨' },
  { id: 'forest', name: '深緑' },
  { id: 'white', name: '白' },
  { id: 'sky', name: '空色' },
  { id: 'gold', name: '山吹' },
]

/** 帽子のマーク。文字は学校名の頭文字を使う */
export type CapLogoId = 'initial' | 'star' | 'bolt' | 'leaf' | 'none'

export const CAP_LOGOS: { id: CapLogoId; name: string }[] = [
  { id: 'initial', name: '校名の頭文字' },
  { id: 'star', name: '星' },
  { id: 'bolt', name: '稲妻' },
  { id: 'leaf', name: '若葉' },
  { id: 'none', name: 'なし' },
]

export type CapDesign = {
  /** 帽子の本体 */
  crown: CapColorId
  /** つば。本体と変えると印象が大きく変わる */
  brim: CapColorId
  /** マークの色 */
  logoColor: CapColorId
  logo: CapLogoId
}

export const DEFAULT_CAP: CapDesign = {
  crown: 'navy',
  brim: 'navy',
  logoColor: 'white',
  logo: 'initial',
}

const COLOR_IDS = new Set<string>(CAP_COLORS.map((color) => color.id))
const LOGO_IDS = new Set<string>(CAP_LOGOS.map((logo) => logo.id))

/** 知らない id が来たら既定に落とす（古いセーブ対策） */
export function normalizeCap(value: Partial<CapDesign> | undefined | null): CapDesign {
  if (!value) return DEFAULT_CAP

  const color = (id: string | undefined, fallback: CapColorId): CapColorId =>
    id !== undefined && COLOR_IDS.has(id) ? (id as CapColorId) : fallback

  return {
    crown: color(value.crown, DEFAULT_CAP.crown),
    brim: color(value.brim, DEFAULT_CAP.brim),
    logoColor: color(value.logoColor, DEFAULT_CAP.logoColor),
    logo:
      value.logo !== undefined && LOGO_IDS.has(value.logo)
        ? (value.logo as CapLogoId)
        : DEFAULT_CAP.logo,
  }
}

/**
 * 帽子に入れる文字。**学校名の1文字目**を使う。
 *
 * アルファベットを選ばせる形も考えたが、
 * 「さくら第一高校」に `S` と入れるより「さ」のほうが自分の学校に見える。
 */
export function capInitial(schoolName: string): string {
  const trimmed = schoolName.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 1) : '球'
}
