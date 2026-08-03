import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import styles from './AbilityChart.module.css'

export type ChartPoint = {
  /** 横軸のラベル（「1年目 4月」） */
  label: string
  value: number
}

type Props = {
  title: string
  points: ChartPoint[]
  /** 縦軸の上限。能力は100、球速は km/h なので別 */
  max?: number
  min?: number
  /** 値の後ろに付ける単位 */
  unit?: string
}

/** 描画領域（viewBox 座標） */
const WIDTH = 300
const HEIGHT = 56
const PAD_X = 4
const PAD_Y = 6

/**
 * 1項目ぶんの推移を折れ線で見せる。
 *
 * 単一系列なので凡例は置かない（見出しが系列名を兼ねる）。
 * 触れた位置の値を読み取れるようにして、点ごとの数字は出さない。
 */
export function AbilityChart({ title, points, max = 100, min = 0, unit = '' }: Props) {
  const [cursor, setCursor] = useState<number | null>(null)

  if (points.length === 0) {
    return (
      <div className={styles.chart}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
        </div>
        <p className={styles.empty}>記録がありません</p>
      </div>
    )
  }

  const first = points[0].value
  const current = points[points.length - 1].value
  const delta = current - first

  const x = (index: number): number =>
    points.length <= 1
      ? WIDTH / 2
      : PAD_X + (index / (points.length - 1)) * (WIDTH - PAD_X * 2)

  const y = (value: number): number => {
    const ratio = (value - min) / Math.max(1, max - min)
    return HEIGHT - PAD_Y - ratio * (HEIGHT - PAD_Y * 2)
  }

  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')
  const area = `${PAD_X},${HEIGHT - PAD_Y} ${line} ${WIDTH - PAD_X},${HEIGHT - PAD_Y}`

  /** 触れた位置に一番近い点を選ぶ */
  const handlePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const index = Math.round(ratio * (points.length - 1))
    setCursor(Math.min(points.length - 1, Math.max(0, index)))
  }

  const shown = cursor !== null ? points[cursor] : null

  return (
    <div className={styles.chart}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.current}>
          {current}
          {unit}
          <span
            className={`${styles.delta} ${delta > 0 ? styles.up : delta < 0 ? styles.down : styles.flat}`}
          >
            {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0'}
          </span>
        </span>
      </div>

      <svg
        className={styles.plot}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}の推移。入学時${first}${unit}から現在${current}${unit}`}
        onPointerDown={handlePointer}
        onPointerMove={(event) => {
          if (event.buttons > 0 || event.pointerType === 'mouse') handlePointer(event)
        }}
        onPointerLeave={() => setCursor(null)}
      >
        {/* 目盛り。上限・中間・下限だけ引く */}
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            className={styles.grid}
            x1={0}
            x2={WIDTH}
            y1={y(min + (max - min) * ratio)}
            y2={y(min + (max - min) * ratio)}
          />
        ))}

        <polyline className={styles.area} points={area} />
        <polyline className={styles.line} points={line} />

        {/* 現在地 */}
        <circle
          className={styles.lastDot}
          cx={x(points.length - 1)}
          cy={y(current)}
          r={4}
        />

        {cursor !== null && shown && (
          <>
            <line
              className={styles.cursorLine}
              x1={x(cursor)}
              x2={x(cursor)}
              y1={0}
              y2={HEIGHT}
            />
            <circle className={styles.cursorDot} cx={x(cursor)} cy={y(shown.value)} r={4} />
          </>
        )}
      </svg>

      {shown && (
        <span className={styles.readout}>
          {shown.label} {shown.value}
          {unit}
        </span>
      )}
    </div>
  )
}
