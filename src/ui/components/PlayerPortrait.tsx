/**
 * 選手の顔。
 *
 * **写真ではなくベクターで描く**（画像アセットを持たない方針）。
 * 目指すのは野球漫画の絵柄で、そのために押さえているのは3つ。
 *
 * 1. **太い黒の輪郭線**。パーツごとに `stroke` を乗せる（陰影で見せない）
 * 2. **尖った髪の束**。丸い帽子型ではなく、毛先を三角に切る
 * 3. **大きくて角のある目**。白目・瞳・ハイライトの3層に、上まぶたの太い線
 *
 * 見た目は id から決まるので、同じ選手はいつでも同じ顔になる。
 * マネージャーは `variant="manager"` で髪型の候補が変わる。
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
  className?: string
  style?: CSSProperties
}

/** 線の色。**黒に寄せた濃い茶**。真っ黒より紙面に近い */
const INK = '#20191a'

/** 肌の色（明るい順）。漫画なのでベタ塗り＋影1枚 */
const SKIN_TONES = [
  { base: '#ffe0c4', shade: '#f0c19c' },
  { base: '#fbd4b0', shade: '#e5b088' },
  { base: '#f0c096', shade: '#d69a6f' },
  { base: '#dda877', shade: '#c08a58' },
  { base: '#c08a5e', shade: '#a06c43' },
]

/** 髪の色。黒〜栗色に、少しだけ明るい色を混ぜる */
const HAIR_COLORS = [
  { base: '#241d1b', light: '#3b302c' },
  { base: '#2e2320', light: '#463630' },
  { base: '#3d2b21', light: '#57402f' },
  { base: '#1d1a1c', light: '#332e31' },
  { base: '#4a3524', light: '#664a32' },
  { base: '#5b4436', light: '#79604c' },
]

/**
 * 髪型（男子）。**毛先を尖らせる**のが漫画らしさの要。
 * 頭の輪郭（半径 33 前後の円弧）に沿わせつつ、前髪を三角に切る。
 */
const HAIR_MALE = [
  // 短いスパイク
  'M -34 -10 q 2 -30 34 -30 q 32 0 34 30 l -8 -12 l -5 10 l -7 -14 l -6 12 l -8 -13 l -7 12 l -6 -10 l -6 12 z',
  // 前髪を分ける
  'M -34 -8 q 0 -32 34 -32 q 34 0 34 32 l -10 -14 l -10 8 l -12 -12 l -14 14 l -8 -8 l -6 12 z',
  // 坊主に近い刈り上げ
  'M -33 -12 q 1 -28 33 -28 q 32 0 33 28 q -8 -8 -33 -8 q -25 0 -33 8 z',
  // 長めの前髪
  'M -35 -4 q -1 -36 35 -36 q 36 0 35 36 l -9 -10 l -6 12 l -9 -14 l -8 14 l -9 -12 l -8 12 l -7 -10 l -7 10 z',
  // 逆立てた髪
  'M -34 -8 q 2 -34 34 -34 q 32 0 34 34 l -7 -18 l -6 8 l -6 -16 l -7 10 l -6 -18 l -8 12 l -6 -10 l -6 14 z',
  // 七三
  'M -34 -8 q 0 -32 34 -32 q 34 0 34 32 l -12 -16 q -14 10 -30 4 q -12 -4 -18 10 z',
]

/** 髪型（マネージャー）。輪郭の外まで下ろして長さを出す */
const HAIR_MANAGER = [
  // 肩までのストレート
  'M -36 -6 q 0 -34 36 -34 q 36 0 36 34 v 44 q -6 -34 -10 -40 q -14 8 -26 8 q -12 0 -26 -8 q -4 6 -10 40 z',
  // 前髪ぱっつん＋サイド
  'M -36 -4 q 0 -36 36 -36 q 36 0 36 36 v 38 q -5 -30 -9 -34 h -54 q -4 4 -9 34 z',
  // ポニーテール
  'M -34 -8 q 0 -32 34 -32 q 34 0 34 32 q 8 6 8 20 q 0 12 -6 18 q 2 -18 -6 -26 q -12 6 -30 6 q -18 0 -30 -6 q -6 6 -4 22 z',
  // 短めのボブ
  'M -35 -6 q 0 -34 35 -34 q 35 0 35 34 v 20 q -6 -18 -9 -22 q -13 8 -26 8 q -13 0 -26 -8 q -3 4 -9 22 z',
]

/** 眉。角度で気性を出す */
const BROWS = [
  { d: 'M -14 -8 l 15 4', width: 3.6 },
  { d: 'M -14 -5 l 15 -1', width: 4.4 },
  { d: 'M -14 -3 l 15 -6', width: 3.2 },
]

/** 目の形。上まぶたの線と白目の形を変える */
const EYES = [
  // 鋭い（吊り目）
  { lid: 'M -9 -3 l 18 3', height: 8, tilt: -4 },
  // 大きい丸目
  { lid: 'M -9 -2 q 9 -5 18 0', height: 10, tilt: 0 },
  // 細い
  { lid: 'M -9 -1 l 18 0', height: 6, tilt: 0 },
  // たれ目
  { lid: 'M -9 -1 q 9 -4 18 3', height: 9, tilt: 3 },
]

/**
 * 前髪。**帽子をかぶると髪が全部隠れてしまう**ので、
 * つばの下に出るぶんだけ別に描く。
 * これがあるだけで「帽子をかぶった人」に見える。
 */
const BANGS = [
  // 大きな房が2つ
  'M 0 -3 l 10 16 l 4 -14 l 9 13 v -15 z',
  // 斜めに流す
  'M 0 -3 l 17 17 l 5 -16 v -4 z',
  // 短く3房
  'M 0 -3 l 7 11 l 4 -9 l 7 12 l 4 -10 l 6 9 v -13 z',
]

/** 口 */
const MOUTHS = [
  'M -7 0 q 7 4 14 0',
  'M -6 0 l 12 0',
  'M -7 -1 q 7 8 14 0',
  'M -5 0 q 5 6 10 -1',
]

/** 描画範囲。帽子と髪が顔より上に出るので上を広く取る */
const VIEW_BOX = '-52 -62 104 104'

/**
 * 顔の縦位置。**比率ではなく数字で置く。**
 * 比率で組んでいた頃は、輪郭・帽子・肩が別々の式から出ていて、
 * 選手によってあごが肩に埋まったり、帽子がずれたりした。
 */
const EYE_Y = -2

/** あごの先。ここに個体差（0〜4）が乗る */
const CHIN_Y = 22

/** 帽子のつばの高さ。目より十分に上へ置く */
const BRIM_Y = -22

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

/** 符号なしで取り出す小さな値 */
function slice(value: number, shift: number, range: number): number {
  return (value >>> shift) % range
}

export function PlayerPortrait({
  playerId,
  size = 44,
  cap = false,
  capDesign,
  schoolName,
  variant = 'player',
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

  const skin = pick(SKIN_TONES, h)
  const hair = pick(HAIR_COLORS, h >>> 3)
  const hairstyle = pick(manager ? HAIR_MANAGER : HAIR_MALE, h >>> 6)
  const brow = pick(BROWS, h >>> 9)
  const eye = pick(EYES, h >>> 11)
  const mouth = pick(MOUTHS, h >>> 14)
  const bang = pick(BANGS, h >>> 16)

  /*
   * **顔の寸法は数字で置く。**
   * 比率で組んでいた頃は、輪郭・帽子・肩がそれぞれ別の式から出ていて、
   * 選手によってあごが肩に埋まったり、帽子が頭からずれたりした。
   */
  const jaw = 26 + slice(h, 17, 5) // 顔の半幅
  const chin = CHIN_Y + slice(h, 20, 5) // あごの先
  const eyeGap = 13 + slice(h, 23, 3)

  const crown = capColorOf(design.crown)
  const brim = capColorOf(design.brim)
  const logoColor = capColorOf(design.logoColor)

  /**
   * 顔の輪郭。**丸ではなく、頬から顎へ落とす。**
   * 上半分は円弧、下半分は直線的に絞って輪郭を尖らせる。
   */
  const facePath =
    `M ${-jaw} ${EYE_Y - 4}` +
    ` a ${jaw} ${jaw * 1.18} 0 0 1 ${jaw * 2} 0` +
    ` l ${-jaw * 0.14} ${(chin - EYE_Y) * 0.52}` +
    ` q ${-jaw * 0.2} ${(chin - EYE_Y) * 0.5} ${-jaw * 0.86} ${(chin - EYE_Y) * 0.5}` +
    ` q ${-jaw * 0.66} 0 ${-jaw * 0.86} ${-(chin - EYE_Y) * 0.5}` +
    ` z`

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
        d={`M -9 ${chin - 6} h 18 v 12 h -18 z`}
        fill={skin.shade}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d={`M -46 46 q 12 -12 34 -14 h 24 q 22 2 34 14 z`}
        fill="var(--uniform-a)"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* 髪。帽子で隠れるが、かぶらない場面ではこれが主役 */}
      <path
        d={hairstyle}
        transform={`translate(0 ${EYE_Y - 4})`}
        fill={hair.base}
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* 耳 */}
      <path d={`M ${-jaw + 1} ${EYE_Y - 2} q -6 2 -5 8 q 1 6 6 4`} fill={skin.base} stroke={INK} strokeWidth="1.8" />
      <path d={`M ${jaw - 1} ${EYE_Y - 2} q 6 2 5 8 q -1 6 -6 4`} fill={skin.base} stroke={INK} strokeWidth="1.8" />

      {/* 顔 */}
      <path d={facePath} fill={skin.base} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />

      {/* 頬の影。ベタ1枚だけ乗せる */}
      <path
        d={`M ${jaw * 0.5} ${EYE_Y + 2} q ${jaw * 0.35} ${(chin - EYE_Y) * 0.4} ${-jaw * 0.22} ${(chin - EYE_Y) * 0.78} q ${-jaw * 0.1} ${-(chin - EYE_Y) * 0.5} ${-jaw * 0.06} ${-(chin - EYE_Y) * 0.8} z`}
        fill={skin.shade}
        opacity="0.7"
      />

      {/* 眉 */}
      <path
        d={brow.d}
        transform={`translate(${-eyeGap + 6} ${EYE_Y - 8})`}
        fill="none"
        stroke={hair.base}
        strokeWidth={brow.width}
        strokeLinecap="round"
      />
      <path
        d={brow.d}
        transform={`translate(${eyeGap + 8} ${EYE_Y - 8}) scale(-1 1)`}
        fill="none"
        stroke={hair.base}
        strokeWidth={brow.width}
        strokeLinecap="round"
      />

      {/* 目。白目・瞳・ハイライトの3層に、上まぶたの太い線 */}
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(${eyeGap * side} ${EYE_Y}) scale(${side} 1)`}>
          <ellipse cx="0" cy="0" rx="7.4" ry={eye.height * 0.6} fill="#fffaf5" stroke={INK} strokeWidth="1.4" />
          <ellipse cx="1" cy="0.5" rx="4.2" ry={eye.height * 0.5} fill={hair.base} />
          <circle cx="2.2" cy={-eye.height * 0.16} r="1.9" fill="#ffffff" />
          {/* 上まぶた。**ここを太くするだけで一気に漫画になる** */}
          <path
            d={eye.lid}
            transform={`translate(0 ${-eye.height * 0.5 + eye.tilt})`}
            fill="none"
            stroke={INK}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* 鼻。線1本で示す */}
      <path
        d={`M 1 ${EYE_Y + 6} l -3 7 l 6 1`}
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 口 */}
      <path
        d={mouth}
        transform={`translate(0 ${chin - 9})`}
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
            transform={`translate(${-jaw * 0.62} ${BRIM_Y + 2})`}
            fill={hair.base}
            stroke={INK}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d={bang}
            transform={`translate(${jaw * 0.62} ${BRIM_Y + 2}) scale(-1 1)`}
            fill={hair.base}
            stroke={INK}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* 本体 */}
          <path
            d={`M ${-jaw - 2} ${BRIM_Y} a ${jaw + 2} ${jaw * 1.05} 0 0 1 ${jaw * 2 + 4} 0 z`}
            fill={crown}
            stroke={INK}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* つば */}
          <path
            d={`M ${-jaw - 3} ${BRIM_Y} h ${jaw * 2 + 6} q 8 1 7 5 q -1 3 -9 2 h ${-(jaw * 2 + 2)} q -6 0 -6 -3 z`}
            fill={brim}
            stroke={INK}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* マーク */}
          <CapLogo design={design} schoolName={school} color={logoColor} y={BRIM_Y - jaw * 0.5} />
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
