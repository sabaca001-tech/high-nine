import type { Pitch, PitchDirection } from '@/core/types/player'
import { PITCH_MAX_LEVEL } from '@/core/player/pitchDefs'
import styles from './PitchChart.module.css'

/**
 * 持ち球の変化方向を矢印で見せる。
 *
 * 「変化球 D」という数字だけでは何を投げる投手か分からないので、
 * 中心から各方向へ矢印を伸ばし、長さで変化量を表す。
 * 球種名は矢印の先に添える（同じ方向でもカーブ／スローカーブなどがあるため）。
 */

/** 描画領域（viewBox 座標） */
const SIZE = 200
const CENTER = SIZE / 2
/** 変化量1あたりの矢印の長さ */
const UNIT = 10
/** 変化量0でも少しだけ出す長さ */
const BASE = 8

/** 方向 → 単位ベクトル（SVGはy軸が下向き） */
const VECTORS: Record<PitchDirection, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  lowerLeft: { x: -0.71, y: 0.71 },
  down: { x: 0, y: 1 },
  lowerRight: { x: 0.71, y: 0.71 },
  right: { x: 1, y: 0 },
}

/** ラベルを矢印の外側のどちら側に置くか */
const ANCHORS: Record<PitchDirection, 'start' | 'middle' | 'end'> = {
  up: 'middle',
  left: 'end',
  lowerLeft: 'end',
  down: 'middle',
  lowerRight: 'start',
  right: 'start',
}

export function PitchChart({ pitches }: { pitches: Pitch[] }) {
  if (pitches.length === 0) {
    return <p className={styles.empty}>持ち球はまだありません（変化球練習で覚えます）</p>
  }

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`持ち球 ${pitches.map((p) => `${p.name}${p.level}`).join('、')}`}
      >
        {/* 目盛りの円。変化量の大きさを読む手がかり */}
        {[1, 4, PITCH_MAX_LEVEL].map((level) => (
          <circle
            key={level}
            className={styles.guide}
            cx={CENTER}
            cy={CENTER}
            r={BASE + level * UNIT}
          />
        ))}

        {pitches.map((pitch) => {
          const vector = VECTORS[pitch.direction]
          const length = BASE + pitch.level * UNIT
          const x = CENTER + vector.x * length
          const y = CENTER + vector.y * length
          // ラベルは矢印の先から少し外へ
          const labelX = CENTER + vector.x * (length + 10)
          const labelY = CENTER + vector.y * (length + 10)

          return (
            <g key={pitch.direction}>
              <line
                className={styles.arrow}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
              />
              <circle className={styles.tip} cx={x} cy={y} r={4} />
              <text
                className={styles.label}
                x={labelX}
                y={labelY}
                textAnchor={ANCHORS[pitch.direction]}
                dominantBaseline="middle"
              >
                {pitch.name}
                <tspan className={styles.level}> {pitch.level}</tspan>
              </text>
            </g>
          )
        })}

        {/* 投手（球の出どころ） */}
        <circle className={styles.origin} cx={CENTER} cy={CENTER} r={5} />
      </svg>
    </div>
  )
}
