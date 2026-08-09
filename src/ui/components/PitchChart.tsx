import type { Pitch, PitchDirection } from '@/core/types/player'
import { PITCH_MAX_LEVEL } from '@/core/player/pitchDefs'
import styles from './PitchChart.module.css'

/**
 * 持ち球の変化方向を矢印で見せる。
 *
 * 「変化球 D」という数字だけでは何を投げる投手か分からないので、
 * 中心から各方向へ矢印を伸ばし、長さで変化量を表す。
 *
 * **球種名は図の中に書かない。** 矢印の先に添えていた頃は、
 * 左下・真下・右下のように向きが近い球種を持つと
 * 「スローカーブ」「フォーク」の字が重なって読めなくなっていた。
 * 名前は図の下に、向きの矢印つきで並べる。
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

/** 方向を表す矢印。凡例で「どの向きの球か」を示す */
const GLYPHS: Record<PitchDirection, string> = {
  up: '↑',
  left: '←',
  lowerLeft: '↙',
  down: '↓',
  lowerRight: '↘',
  right: '→',
}

export function PitchChart({
  pitches,
  /** 球種名の一覧を図の下に出すか。狭い場所では省く */
  labels = true,
  /** 目盛りと注記を省いて小さく描く（カードの中など） */
  compact = false,
  /** 幅の狭い枠（スタメン画面の右パネルなど）に置くとき */
  narrow = false,
}: {
  pitches: Pitch[]
  labels?: boolean
  compact?: boolean
  narrow?: boolean
}) {
  if (pitches.length === 0) {
    return (
      <p className={styles.empty}>
        {compact ? 'まだ無い' : '持ち球はまだありません（変化球練習で覚えます）'}
      </p>
    )
  }

  // 小さく描くときは目盛りを外周だけにする。
  // 3本引くと潰れて、線が何本あるのか分からない塊になる
  const guides = compact ? [PITCH_MAX_LEVEL] : [1, 4, PITCH_MAX_LEVEL]

  const described = pitches.map((p) => `${p.name}${p.level}`).join('、')

  return (
    <div
      className={[styles.wrap, compact ? styles.compact : '', narrow ? styles.narrow : '']
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        className={styles.chart}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`持ち球 ${described}`}
      >
        {/* 目盛りの円。変化量の大きさを読む手がかり */}
        {guides.map((level) => (
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

          return (
            <g key={pitch.direction}>
              <line
                className={styles.arrow}
                x1={CENTER}
                y1={CENTER}
                x2={CENTER + vector.x * length}
                y2={CENTER + vector.y * length}
              />
              <circle
                className={styles.tip}
                cx={CENTER + vector.x * length}
                cy={CENTER + vector.y * length}
                r={5}
              />
            </g>
          )
        })}

        {/* 投手（球の出どころ） */}
        <circle className={styles.origin} cx={CENTER} cy={CENTER} r={5} />
      </svg>

      {labels && (
        <ul className={styles.legend}>
          {pitches.map((pitch) => (
            <li key={pitch.direction} className={styles.item}>
              <span className={styles.glyph}>{GLYPHS[pitch.direction]}</span>
              <span className={styles.pitchName}>{pitch.name}</span>
              <span className={styles.level}>{pitch.level}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
