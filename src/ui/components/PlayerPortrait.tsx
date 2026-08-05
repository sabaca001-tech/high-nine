/**
 * 選手の顔。
 *
 * **写真ではなくベクターで描いた肖像**。
 * 実写素材を持つとオフライン動作とバンドルサイズの方針が崩れるため、
 * 陰影・髪型・目鼻立ちをパーツ化して、選手ごとに違う顔を生成する。
 *
 * 見た目は id から決まるので、同じ選手はいつでも同じ顔になる。
 */

import type { CSSProperties } from 'react'

type Props = {
  playerId: string
  size?: number
  /** 帽子をかぶせる */
  cap?: boolean
  capColor?: string
  className?: string
  style?: CSSProperties
}

/** 肌の色（明るい順） */
const SKIN_TONES = [
  { base: '#f3d0b0', shade: '#dcae89', deep: '#c08e6a' },
  { base: '#ecc09a', shade: '#d29a72', deep: '#b47b55' },
  { base: '#dda87c', shade: '#bf8659', deep: '#9d6942' },
  { base: '#c78f61', shade: '#a86f45', deep: '#875433' },
  { base: '#a97247', shade: '#8b5730', deep: '#6d4123' },
]

/** 髪の色 */
const HAIR_COLORS = ['#1c1a19', '#2b2320', '#3d2c22', '#4a3324', '#221f1d', '#5a4030']

/** 眉の濃さ */
const BROW_STYLES = [
  { d: 'M -13 -6 q 6 -4 12 -1', width: 3.4 },
  { d: 'M -13 -5 q 6 -2 12 0', width: 4.2 },
  { d: 'M -13 -4 q 6 -5 12 -3', width: 3 },
]

/** 髪型。頭の輪郭に沿って描く */
const HAIRSTYLES = [
  // 短髪（丸刈りに近い）
  'M -34 -6 a 34 40 0 0 1 68 0 q -6 -26 -34 -26 q -28 0 -34 26 z',
  // 七三分け
  'M -34 -4 a 34 40 0 0 1 68 0 q -2 -30 -30 -30 q -22 0 -30 14 q 14 6 30 4 q 16 -2 30 12 z',
  // スポーツ刈り（前髪を上げる）
  'M -33 -8 a 33 38 0 0 1 66 0 q -4 -30 -33 -30 q -29 0 -33 30 z',
  // 少し長め
  'M -35 4 a 35 42 0 0 1 70 0 q 2 -34 -35 -34 q -37 0 -35 34 z',
]

/** 口の形 */
const MOUTHS = [
  'M -8 16 q 8 5 16 0',
  'M -8 17 q 8 2 16 0',
  'M -7 16 q 7 7 14 0',
]

/** 顔の輪郭の始点（頭のてっぺんは ここから faceLength ぶん上） */
const FACE_TOP_Y = -8

/** 帽子のつばの高さ */
const CAP_BRIM_Y = -14

/** 帽子が頭を覆う余白。0にすると輪郭線が重なって見える */
const CAP_MARGIN = 3

/**
 * 描画範囲。帽子は顔より上に出るので、上を広めに取って丸みが切れないようにする。
 * 正方形を保つこと（縦横で潰れる）。
 */
const VIEW_BOX = '-52 -60 104 104'

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
function slice(hash: number, shift: number, range: number): number {
  return (hash >>> shift) % range
}

export function PlayerPortrait({
  playerId,
  size = 44,
  cap = false,
  capColor = 'var(--cap-a)',
  className,
  style,
}: Props) {
  const h = hash(playerId)

  const skin = pick(SKIN_TONES, h)
  const hairColor = pick(HAIR_COLORS, h >>> 3)
  const hairstyle = pick(HAIRSTYLES, h >>> 6)
  const brow = pick(BROW_STYLES, h >>> 9)
  const mouth = pick(MOUTHS, h >>> 12)

  // 顔の輪郭を少しずつ変える
  const jawWidth = 34 + slice(h, 15, 5) - 2
  const faceLength = 42 + slice(h, 18, 7) - 3
  const eyeGap = 13 + slice(h, 21, 4) - 1
  const eyeSize = 3.6 + slice(h, 24, 3) * 0.4

  const gradientId = `skin-${playerId}`
  const shadowId = `shadow-${playerId}`
  const clipId = `face-${playerId}`

  /**
   * 顔の輪郭。**必ず左右対称に閉じること。**
   * 以前は右の頬から顎へ下りたあと、左の頬に戻らずに始点へ直線で閉じていたため、
   * 顔の左半分が塗られず透明に見えていた。
   */
  /**
   * 帽子。**必ず頭の輪郭から導くこと。**
   *
   * 以前は帽子の丸みを `jawWidth` だけで決めていたので、
   * 顔の縦幅（`faceLength`）が大きい選手では**頭のてっぺんが帽子から飛び出していた**。
   * 顔と帽子で別々の乱数を使っているのが原因で、条件が揃った選手だけ崩れる。
   *
   * 頭のてっぺんは `FACE_TOP_Y - faceLength`。
   * 帽子の高さをそこから逆算して、必ず `CAP_MARGIN` ぶん上を覆うようにする。
   */
  const capWidth = jawWidth + 2
  const capHeight = CAP_BRIM_Y - FACE_TOP_Y + faceLength + CAP_MARGIN

  const facePath =
    `M ${-jawWidth} ${FACE_TOP_Y}` +
    ` a ${jawWidth} ${faceLength} 0 0 1 ${jawWidth * 2} 0` +
    ` q 0 ${faceLength * 0.5} ${-jawWidth * 0.5} ${faceLength * 0.68}` +
    ` q ${-jawWidth * 0.5} ${faceLength * 0.26} ${-jawWidth} 0` +
    ` q ${-jawWidth * 0.5} ${-faceLength * 0.26} ${-jawWidth * 0.5} ${-faceLength * 0.68}` +
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
      <defs>
        {/* 立体感を出すための肌のグラデーション */}
        <radialGradient id={gradientId} cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor={skin.base} />
          <stop offset="62%" stopColor={skin.shade} />
          <stop offset="100%" stopColor={skin.deep} />
        </radialGradient>
        <linearGradient id={shadowId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </linearGradient>
        {/* 頬の陰が顎からはみ出さないよう、輪郭で切り抜く */}
        <clipPath id={clipId}>
          <path d={facePath} />
        </clipPath>
      </defs>

      {/* 首と肩 */}
      <path d={`M -12 ${faceLength - 8} h 24 v 10 h -24 z`} fill={skin.deep} />
      <path
        d={`M -42 44 q 10 -14 30 -16 h 24 q 20 2 30 16 z`}
        fill="var(--uniform-a)"
        stroke="rgba(0,0,0,0.25)"
      />

      {/* 耳 */}
      <ellipse cx={-jawWidth + 2} cy="4" rx="4.5" ry="7" fill={skin.shade} />
      <ellipse cx={jawWidth - 2} cy="4" rx="4.5" ry="7" fill={skin.shade} />

      {/* 顔の輪郭。下ぶくれにならないよう顎を絞る */}
      <path d={facePath} fill={`url(#${gradientId})`} />

      {/* 頬の陰 */}
      <ellipse
        cx="0"
        cy="14"
        rx={jawWidth * 0.8}
        ry="16"
        fill={`url(#${shadowId})`}
        opacity="0.5"
        clipPath={`url(#${clipId})`}
      />

      {/* 髪 */}
      <path d={hairstyle} fill={hairColor} />

      {/* 眉 */}
      <path
        d={brow.d}
        transform={`translate(${-eyeGap + 5} 0)`}
        fill="none"
        stroke={hairColor}
        strokeWidth={brow.width}
        strokeLinecap="round"
      />
      <path
        d={brow.d}
        transform={`translate(${eyeGap + 7} 0) scale(-1 1)`}
        fill="none"
        stroke={hairColor}
        strokeWidth={brow.width}
        strokeLinecap="round"
      />

      {/* 目。白目・虹彩・ハイライトの3層 */}
      {[-eyeGap, eyeGap].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="4" rx={eyeSize + 1.6} ry={eyeSize} fill="#f7f3ef" />
          <circle cx={x} cy="4" r={eyeSize * 0.72} fill="#3b2a1c" />
          <circle cx={x} cy="4" r={eyeSize * 0.34} fill="#120c07" />
          <circle cx={x - eyeSize * 0.3} cy={4 - eyeSize * 0.35} r={eyeSize * 0.22} fill="#fff" />
          {/* まぶたの影 */}
          <path
            d={`M ${x - eyeSize - 1.6} 4 a ${eyeSize + 1.6} ${eyeSize} 0 0 1 ${(eyeSize + 1.6) * 2} 0`}
            fill="none"
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="1.4"
          />
        </g>
      ))}

      {/* 鼻 */}
      <path
        d="M 0 6 q -2 8 -4 11 q 2 2 8 0"
        fill="none"
        stroke={skin.deep}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* 口 */}
      <path d={mouth} fill="none" stroke="#8b4a42" strokeWidth="2.4" strokeLinecap="round" />

      {/* 帽子 */}
      {cap && (
        <>
          <path
            d={`M ${-capWidth} ${CAP_BRIM_Y} a ${capWidth} ${capHeight} 0 0 1 ${capWidth * 2} 0 z`}
            fill={capColor}
          />
          <path
            d={`M ${-capWidth} ${CAP_BRIM_Y} h ${capWidth * 2} q 6 0 6 5 h ${-(capWidth * 2 + 6)} z`}
            fill={capColor}
            opacity="0.85"
          />
          <ellipse
            cx="0"
            cy={CAP_BRIM_Y - capHeight * 0.55}
            rx="6"
            ry="4"
            fill="rgba(255,255,255,0.25)"
          />
        </>
      )}
    </svg>
  )
}
