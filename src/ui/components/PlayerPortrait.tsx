/**
 * 選手の顔。
 *
 * **写真ではなくベクターで描く**（画像アセットを持たない方針）。
 * 見た目は id から決まるので、同じ選手はいつでも同じ顔になる。
 *
 * ## 作り方
 *
 * **配置は全員同じ。変えるのはパーツだけ。**
 * 目の間隔・顎の幅・顔の長さまで乱数で振っていた頃は、
 * 顔ごとに骨格が変わって「人の顔に見えないもの」が混ざっていた。
 * 目は必ず `EYE_Y`、あごは `CHIN_Y`、耳は `±CHEEK` —— と位置を定数で固定し、
 * そこに入るパーツ（輪郭・髪型・眉・目・鼻・口）を差し替える形にしてある。
 *
 * ## 絵柄
 *
 * 野球漫画に寄せるために効くのは3つ。
 *
 * 1. **太い黒の輪郭線**（陰影ではなく線で形を見せる）
 * 2. **尖った髪の束**（毛先を三角に切る）
 * 3. **大きな目**（白目・瞳・ハイライトの3層＋上まぶたの太い線）
 */

import type { CSSProperties } from 'react'
import { capInitial, normalizeCap } from '@/core/team/cap'
import type { CapDesign } from '@/core/team/cap'
import { useGameStore } from '@/state/useGameStore'
import { capColorOf } from '@/ui/theme/capColors'

type Props = {
  playerId: string
  size?: number
  /** 帽子をかぶせる */
  cap?: boolean
  /** 帽子のデザイン。省略時は自校の設定を使う */
  capDesign?: CapDesign
  /** ロゴに使う学校名。省略時は自校の名前 */
  schoolName?: string
  /** マネージャーは髪型の候補が変わる */
  variant?: 'player' | 'manager'
  /**
   * 留学生。**肌の色の候補が変わる。**
   * 日本人の肌は個人差が小さいので、通常は狭い範囲でしか振らない。
   */
  exchange?: boolean
  className?: string
  style?: CSSProperties
}

/** 線の色。真っ黒より少し茶を混ぜて紙面に近づける */
const INK = '#20191a'

// ── 位置（全員共通）──────────────────────

/** 目の高さ */
const EYE_Y = 0
/** 目の中心の左右の位置 */
const EYE_X = 14
/** 眉の高さ */
const BROW_Y = -11
/** あごの先 */
const CHIN_Y = 24
/** 頬（顔の最大幅の半分）。耳もここに付く */
const CHEEK = 27
/** 頭のてっぺん */
const HEAD_TOP = -40
/** 鼻の付け根 */
const NOSE_Y = 2
/** 口の高さ */
const MOUTH_Y = 17
/** 帽子のつばの高さ */
const BRIM_Y = -22

/** 描画範囲。帽子と髪が顔より上に出るので上を広く取る */
const VIEW_BOX = '-52 -62 104 104'

// ── 色 ──────────────────────────────────

/**
 * 肌の色（日本人）。
 * **ほとんど差を付けない。** 実際、日焼けの度合いくらいしか変わらない。
 * 褐色まで混ぜていた頃は、同じ学校に人種が混ざって見えていた。
 */
const SKIN_JP = [
  { base: '#ffe3c9', shade: '#f0c9a8' },
  { base: '#fddcbe', shade: '#eec19c' },
  { base: '#f9d3b1', shade: '#e8b78f' },
  { base: '#f2c9a4', shade: '#dcab82' },
  { base: '#eabf98', shade: '#d29e76' },
  { base: '#e2b489', shade: '#c8916a' },
]

/** 肌の色（留学生）。ここだけ広く取る */
const SKIN_EXCHANGE = [
  { base: '#d9a878', shade: '#bd8a5c' },
  { base: '#c08a5e', shade: '#a06c43' },
  { base: '#a5714a', shade: '#875734' },
  { base: '#855636', shade: '#6b4127' },
  { base: '#6f4529', shade: '#57341d' },
]

/** 髪の色。日本人は黒〜焦げ茶が大半で、たまに明るい色 */
const HAIR_COLORS = [
  '#17161a',
  '#1c1a1c',
  '#221d1c',
  '#28211f',
  '#2e2521',
  '#332723',
  '#3b2d24',
  '#45342a',
  '#513c2d',
  '#5d4634',
]

/** 瞳の色。黒目がちだが、少しだけ幅を持たせる */
const EYE_COLORS = ['#1a1416', '#20181a', '#271c19', '#2f2119', '#3a281c', '#463020']

// ── パーツ ──────────────────────────────

/**
 * 輪郭。**すべて同じ枠に収める**（頭のてっぺん・頬・あご先が共通）。
 * 変えるのは頬の張り方とあごの絞り方だけ。
 */
function faceShape(cheekY: number, jawIn: number, chinIn: number): string {
  return (
    `M ${-CHEEK} ${cheekY}` +
    ` C ${-CHEEK} ${HEAD_TOP + 4} ${-CHEEK * 0.62} ${HEAD_TOP} 0 ${HEAD_TOP}` +
    ` C ${CHEEK * 0.62} ${HEAD_TOP} ${CHEEK} ${HEAD_TOP + 4} ${CHEEK} ${cheekY}` +
    ` C ${CHEEK} ${cheekY + jawIn} ${chinIn} ${CHIN_Y - 6} 0 ${CHIN_Y}` +
    ` C ${-chinIn} ${CHIN_Y - 6} ${-CHEEK} ${cheekY + jawIn} ${-CHEEK} ${cheekY}` +
    ` z`
  )
}

/** 10種類。丸顔・面長・エラ張り・細面 など */
const FACE_SHAPES = [
  faceShape(-4, 10, 14),
  faceShape(-2, 12, 12),
  faceShape(-6, 8, 16),
  faceShape(0, 14, 10),
  faceShape(-3, 11, 18),
  faceShape(-5, 9, 11),
  faceShape(-1, 13, 15),
  faceShape(-7, 7, 13),
  faceShape(-2, 10, 9),
  faceShape(-4, 12, 17),
]

/**
 * 髪型（男子）。**頭の輪郭に沿わせ、毛先を尖らせる。**
 * どれも同じ頭（てっぺん `HEAD_TOP`、幅 `CHEEK`）に載る。
 */
const HAIR_MALE = [
  // 短いスパイク
  'M -28 -14 q 2 -28 28 -28 q 26 0 28 28 l -7 -11 l -4 9 l -6 -12 l -5 10 l -7 -11 l -6 10 l -5 -9 l -5 10 z',
  // 立ち上げた前髪
  'M -28 -12 q 1 -30 28 -30 q 27 0 28 30 l -6 -16 l -5 8 l -5 -15 l -6 9 l -5 -16 l -7 11 l -5 -9 l -5 12 z',
  // 七三分け
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 l -10 -14 q -12 9 -26 4 q -10 -4 -15 9 z',
  // 短く刈り上げ
  'M -27 -16 q 1 -26 27 -26 q 26 0 27 26 q -7 -7 -27 -7 q -20 0 -27 7 z',
  // 前髪を下ろす
  'M -28 -8 q 0 -34 28 -34 q 28 0 28 34 l -8 -12 l -6 11 l -7 -13 l -7 12 l -7 -12 l -6 11 l -6 -11 l -6 12 z',
  // 真ん中分け
  'M -28 -10 q 0 -32 28 -32 q 28 0 28 32 l -9 -13 q -9 8 -19 8 q -10 0 -19 -8 z',
  // ツンツン（毛先が長い）
  'M -28 -12 q 2 -30 28 -30 q 26 0 28 30 l -6 -20 l -5 10 l -5 -18 l -6 12 l -5 -19 l -7 13 l -5 -11 l -6 15 z',
  // 坊主
  'M -26 -18 q 2 -24 26 -24 q 24 0 26 24 q -8 -5 -26 -5 q -18 0 -26 5 z',
  // 横に流す
  'M -28 -10 q 0 -32 28 -32 q 28 0 28 32 l -12 -14 q -16 8 -30 2 q -8 -3 -14 10 z',
  // 前下がり
  'M -28 -6 q 0 -36 28 -36 q 28 0 28 36 l -7 -14 l -5 12 l -6 -14 l -6 13 l -6 -13 l -6 12 l -6 -12 l -6 14 z',
  // ソフトモヒカン
  'M -27 -14 q 1 -28 27 -28 q 26 0 27 28 l -6 -8 l -5 6 l -4 -18 l -6 16 l -5 -16 l -5 18 l -5 -6 l -5 8 z',
  // 天然パーマ（丸い束）
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 q -5 -6 -9 -2 q -5 -7 -10 -1 q -5 -8 -10 0 q -5 -6 -10 0 q -5 -5 -9 3 z',
  // 長めのマッシュ
  'M -29 -4 q 0 -38 29 -38 q 29 0 29 38 q -6 -14 -10 -16 q -8 6 -19 6 q -11 0 -19 -6 q -4 2 -10 16 z',
  // 刈り上げ＋前髪
  'M -27 -14 q 1 -28 27 -28 q 26 0 27 28 l -8 -10 l -6 9 l -7 -11 l -8 10 l -6 -9 l -7 11 z',
  // ぼさぼさ
  'M -28 -10 q 0 -32 28 -32 q 28 0 28 32 l -5 -12 l -6 6 l -4 -14 l -7 10 l -4 -14 l -7 12 l -5 -10 l -6 12 z',
  // 直毛の短髪
  'M -27 -13 q 1 -29 27 -29 q 26 0 27 29 l -9 -8 q -18 -6 -36 0 z',
]

/** 髪型（マネージャー）。輪郭の外まで下ろして長さを出す */
const HAIR_MANAGER = [
  // 肩までのストレート
  'M -30 -8 q 0 -34 30 -34 q 30 0 30 34 v 40 q -5 -30 -9 -35 q -12 7 -21 7 q -9 0 -21 -7 q -4 5 -9 35 z',
  // 前髪ぱっつん
  'M -30 -6 q 0 -36 30 -36 q 30 0 30 36 v 32 q -4 -26 -8 -30 h -44 q -4 4 -8 30 z',
  // ポニーテール
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 q 7 5 7 17 q 0 10 -5 15 q 2 -15 -5 -22 q -10 5 -25 5 q -15 0 -25 -5 q -5 5 -3 18 z',
  // ボブ
  'M -29 -8 q 0 -34 29 -34 q 29 0 29 34 v 16 q -5 -15 -8 -18 q -11 7 -21 7 q -10 0 -21 -7 q -3 3 -8 18 z',
  // サイドテール
  'M -29 -8 q 0 -34 29 -34 q 29 0 29 34 v 10 q -4 -12 -7 -15 q -11 7 -22 7 q -11 0 -22 -7 q -3 3 -7 15 q 0 16 -6 22 q -4 -12 6 -32 z',
  // 三つ編み
  'M -29 -8 q 0 -34 29 -34 q 29 0 29 34 v 26 q -4 -22 -8 -26 q -11 7 -21 7 q -10 0 -21 -7 q -4 4 -8 26 z',
  // 短めのショート
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 v 6 q -5 -10 -8 -12 q -10 6 -20 6 q -10 0 -20 -6 q -3 2 -8 12 z',
  // ふんわり内巻き
  'M -30 -6 q 0 -36 30 -36 q 30 0 30 36 v 24 q -3 -12 -8 -14 q -6 8 -14 4 q 6 -8 4 -14 q -12 6 -24 0 q -2 6 4 14 q -8 4 -14 -4 q -5 2 -8 14 z',
  // 高い位置のお団子
  'M -28 -12 q 0 -26 28 -26 q 28 0 28 26 q -8 -6 -28 -6 q -20 0 -28 6 z M -8 -40 a 8 8 0 0 1 16 0 a 8 8 0 0 1 -16 0 z',
  // 分け目のあるロング
  'M -30 -6 q 0 -36 30 -36 q 30 0 30 36 v 38 q -5 -30 -9 -34 q -10 8 -21 8 q -11 0 -21 -8 q -4 4 -9 34 z',
]

/**
 * 前髪。**帽子をかぶると髪が全部隠れる**ので、つばの下に出るぶんを別に描く。
 * これがあるだけで「帽子をかぶった人」に見える。
 */
const BANGS = [
  'M 0 -3 l 9 15 l 4 -13 l 8 12 v -14 z',
  'M 0 -3 l 15 16 l 5 -15 v -4 z',
  'M 0 -3 l 6 10 l 4 -8 l 6 11 l 4 -9 l 5 8 v -12 z',
  'M 0 -3 l 11 13 l 3 -11 l 6 9 v -12 z',
  'M 0 -3 l 5 12 l 5 -10 l 5 12 l 4 -11 v -3 z',
  'M 0 -3 l 8 9 l 3 -7 l 7 10 l 3 -9 l 4 6 v -9 z',
]

/** 眉。角度と太さで気性を出す */
const BROWS = [
  { d: 'M -13 -3 l 14 3', width: 3.6 },
  { d: 'M -13 -1 l 14 0', width: 4.4 },
  { d: 'M -13 1 l 14 -5', width: 3.2 },
  { d: 'M -13 -4 l 14 5', width: 4.8 },
  { d: 'M -13 0 q 7 -5 14 0', width: 3.4 },
  { d: 'M -13 -2 q 7 -4 14 1', width: 4.2 },
  { d: 'M -12 -2 l 12 2', width: 5.2 },
  { d: 'M -13 2 l 14 -6', width: 4 },
  { d: 'M -13 -1 q 7 2 14 -3', width: 3 },
  { d: 'M -12 0 l 11 -1', width: 5.6 },
  { d: 'M -13 -3 q 7 1 14 2', width: 3.8 },
  { d: 'M -13 1 q 7 -6 14 -1', width: 4.6 },
]

/**
 * 目。白目の大きさ・瞳の大きさ・上まぶたの線を組み合わせる。
 * `tilt` は目尻の上がり（マイナスで吊り目）。
 */
const EYES = [
  { rx: 7.4, ry: 5.4, iris: 4.2, lid: 'M -8 -1 l 16 2', tilt: -3 },
  { rx: 7.8, ry: 6.2, iris: 4.6, lid: 'M -8 0 q 8 -5 16 0', tilt: 0 },
  { rx: 7.0, ry: 4.2, iris: 3.8, lid: 'M -8 0 l 16 0', tilt: 0 },
  { rx: 7.6, ry: 5.8, iris: 4.4, lid: 'M -8 0 q 8 -3 16 3', tilt: 2 },
  { rx: 8.2, ry: 6.6, iris: 5.0, lid: 'M -9 -1 q 9 -6 18 1', tilt: -1 },
  { rx: 6.6, ry: 4.6, iris: 3.6, lid: 'M -7 -1 l 14 3', tilt: -4 },
  { rx: 7.2, ry: 5.0, iris: 4.0, lid: 'M -8 1 q 8 -6 16 -1', tilt: -2 },
  { rx: 7.9, ry: 5.6, iris: 4.4, lid: 'M -8 -2 l 16 4', tilt: -5 },
  { rx: 7.4, ry: 6.0, iris: 4.8, lid: 'M -8 1 q 8 -2 16 4', tilt: 3 },
  { rx: 6.9, ry: 4.4, iris: 3.6, lid: 'M -7 0 q 7 -4 14 0', tilt: 0 },
  { rx: 8.0, ry: 5.2, iris: 4.2, lid: 'M -8 -1 q 8 -4 16 2', tilt: -1 },
  { rx: 7.1, ry: 5.6, iris: 4.6, lid: 'M -8 0 l 16 -2', tilt: 1 },
]

/** 鼻。線だけで示す（塗らない） */
const NOSES = [
  'M 1 0 l -3 8 l 6 1',
  'M 0 2 l -2 7 q 3 2 6 -1',
  'M 1 1 l -2 9 l 5 0',
  'M 0 3 q -3 5 0 7 q 3 1 5 -1',
  'M 1 0 l -1 9 l 4 1',
  'M 0 4 l -3 5 l 6 1',
  'M 1 2 q -4 5 -1 8 l 5 -1',
  'M 0 0 l -2 10 l 5 -1',
  'M 1 3 l -2 6 l 4 1',
  'M 0 1 q -3 7 1 9 l 4 -2',
]

/** 口 */
const MOUTHS = [
  'M -7 0 q 7 4 14 0',
  'M -6 0 l 12 0',
  'M -7 -1 q 7 8 14 0',
  'M -5 0 q 5 6 10 -1',
  'M -6 1 q 6 -5 12 0',
  'M -8 0 q 8 3 16 -1',
  'M -5 -1 l 10 2',
  'M -6 0 q 6 6 12 1',
  'M -7 1 q 7 -4 14 1',
  'M -4 0 q 4 5 8 0',
  'M -8 1 l 15 -2',
  'M -6 -1 q 6 7 12 -1',
]

/** 文字列から安定した数値を作る */
function hash(value: string): number {
  let total = 2166136261
  for (let i = 0; i < value.length; i++) {
    total ^= value.charCodeAt(i)
    total = Math.imul(total, 16777619)
  }
  return total >>> 0
}

/**
 * hash から1つ選ぶ。
 *
 * 注意: シフト結果が負にならないよう必ず符号なしで扱う。
 * `>>` を使うと 2^31 以上の hash で負の添字になり、undefined を引いて落ちる。
 */
function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length]
}

export function PlayerPortrait({
  playerId,
  size = 44,
  cap = false,
  capDesign,
  schoolName,
  variant = 'player',
  exchange = false,
  className,
  style,
}: Props) {
  /*
   * **帽子は自校の設定をそのまま使う。**
   * 呼び出し側ごとに色を渡していた頃は、画面によって帽子の色が違っていた。
   * 明示的に渡されたときだけそちらを優先する（エディットの試着で使う）。
   */
  const game = useGameStore((s) => s.game)
  const design = capDesign ?? normalizeCap(game?.cap)
  const school = schoolName ?? game?.schoolName ?? ''

  const h = hash(playerId)
  const manager = variant === 'manager'

  // **パーツごとに別のビットを使う。** 同じビットから引くと組み合わせが偏る
  const skin = pick(exchange ? SKIN_EXCHANGE : SKIN_JP, h)
  const hair = pick(HAIR_COLORS, h >>> 3)
  const hairstyle = pick(manager ? HAIR_MANAGER : HAIR_MALE, h >>> 7)
  const face = pick(FACE_SHAPES, h >>> 11)
  const brow = pick(BROWS, h >>> 14)
  const eye = pick(EYES, h >>> 17)
  const iris = pick(EYE_COLORS, h >>> 20)
  const nose = pick(NOSES, h >>> 22)
  const mouth = pick(MOUTHS, h >>> 25)
  const bang = pick(BANGS, h >>> 28)

  const crown = capColorOf(design.crown)
  const brim = capColorOf(design.brim)
  const logoColor = capColorOf(design.logoColor)

  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      className={className}
      style={style}
      role="presentation"
      aria-hidden="true"
    >
      {/* 首と肩。顔より暗くして、顔を前に出す */}
      <path
        d={`M -9 ${CHIN_Y - 6} h 18 v 12 h -18 z`}
        fill={skin.shade}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M -46 46 q 12 -12 34 -14 h 24 q 22 2 34 14 z"
        fill="var(--uniform-a)"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* 髪。帽子で隠れるが、かぶらない場面ではこれが主役 */}
      <path d={hairstyle} fill={hair} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />

      {/* 耳 */}
      <path
        d={`M ${-CHEEK + 1} -2 q -6 2 -5 8 q 1 6 6 4`}
        fill={skin.base}
        stroke={INK}
        strokeWidth="1.8"
      />
      <path
        d={`M ${CHEEK - 1} -2 q 6 2 5 8 q -1 6 -6 4`}
        fill={skin.base}
        stroke={INK}
        strokeWidth="1.8"
      />

      {/* 顔 */}
      <path d={face} fill={skin.base} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />

      {/* 頬の影。ベタ1枚だけ乗せる */}
      <path
        d={`M ${CHEEK * 0.5} ${EYE_Y + 2} q ${CHEEK * 0.35} 10 ${-CHEEK * 0.22} 18 q ${-CHEEK * 0.1} -12 ${-CHEEK * 0.06} -19 z`}
        fill={skin.shade}
        opacity="0.7"
      />

      {/* 眉 */}
      <path
        d={brow.d}
        transform={`translate(${-EYE_X + 6} ${BROW_Y})`}
        fill="none"
        stroke={hair}
        strokeWidth={brow.width}
        strokeLinecap="round"
      />
      <path
        d={brow.d}
        transform={`translate(${EYE_X + 7} ${BROW_Y}) scale(-1 1)`}
        fill="none"
        stroke={hair}
        strokeWidth={brow.width}
        strokeLinecap="round"
      />

      {/* 目。白目・瞳・ハイライトの3層に、上まぶたの太い線 */}
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(${EYE_X * side} ${EYE_Y}) scale(${side} 1)`}>
          <ellipse
            cx="0"
            cy="0"
            rx={eye.rx}
            ry={eye.ry}
            fill="#fffaf5"
            stroke={INK}
            strokeWidth="1.4"
          />
          <ellipse cx="1" cy="0.4" rx={eye.iris * 0.9} ry={eye.iris} fill={iris} />
          <circle cx="2" cy={-eye.iris * 0.35} r={eye.iris * 0.34} fill="#ffffff" />
          {/* 上まぶた。**ここを太くするだけで一気に漫画になる** */}
          <path
            d={eye.lid}
            transform={`translate(0 ${-eye.ry - 0.5 + eye.tilt})`}
            fill="none"
            stroke={INK}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* 鼻 */}
      <path
        d={nose}
        transform={`translate(0 ${NOSE_Y})`}
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 口 */}
      <path
        d={mouth}
        transform={`translate(0 ${MOUTH_Y})`}
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* 帽子 */}
      {cap && (
        <g>
          {/* 前髪。つばの下から出す。これが無いと帽子が地肌に載って見える */}
          <path
            d={bang}
            transform={`translate(${-CHEEK * 0.62} ${BRIM_Y + 2})`}
            fill={hair}
            stroke={INK}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d={bang}
            transform={`translate(${CHEEK * 0.62} ${BRIM_Y + 2}) scale(-1 1)`}
            fill={hair}
            stroke={INK}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* 本体 */}
          <path
            d={`M ${-CHEEK - 2} ${BRIM_Y} a ${CHEEK + 2} ${CHEEK * 1.05} 0 0 1 ${CHEEK * 2 + 4} 0 z`}
            fill={crown}
            stroke={INK}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* つば */}
          <path
            d={`M ${-CHEEK - 3} ${BRIM_Y} h ${CHEEK * 2 + 6} q 8 1 7 5 q -1 3 -9 2 h ${-(CHEEK * 2 + 2)} q -6 0 -6 -3 z`}
            fill={brim}
            stroke={INK}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* マーク */}
          <CapLogo design={design} schoolName={school} color={logoColor} y={BRIM_Y - CHEEK * 0.5} />
        </g>
      )}
    </svg>
  )
}

/** 帽子のマーク。文字と図形で描き分ける */
function CapLogo({
  design,
  schoolName,
  color,
  y,
}: {
  design: CapDesign
  schoolName: string
  color: string
  y: number
}) {
  if (design.logo === 'none') return null

  if (design.logo === 'initial') {
    return (
      <text
        x="0"
        y={y + 4}
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill={color}
        stroke={INK}
        strokeWidth="0.8"
        paintOrder="stroke"
      >
        {capInitial(schoolName)}
      </text>
    )
  }

  const marks: Record<string, string> = {
    star: 'M 0 -9 l 2.6 5.6 l 6.2 0.7 l -4.6 4.2 l 1.3 6.1 l -5.5 -3.1 l -5.5 3.1 l 1.3 -6.1 l -4.6 -4.2 l 6.2 -0.7 z',
    bolt: 'M 2 -10 l -8 11 h 5 l -3 10 l 9 -12 h -5 z',
    leaf: 'M 0 -9 q 9 5 8 12 q -1 6 -8 6 q -7 0 -8 -6 q -1 -7 8 -12 z',
  }

  return (
    <path
      d={marks[design.logo]}
      transform={`translate(0 ${y})`}
      fill={color}
      stroke={INK}
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  )
}
