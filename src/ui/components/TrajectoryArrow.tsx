import { trajectoryAngle, TRAJECTORY_LABELS } from '@/core/player/rating'
import styles from './TrajectoryArrow.module.css'

/**
 * 弾道を打球の角度で描く。
 *
 * **既製の矢印文字（→↗↑）では足りない。**
 * 使える向きが45度刻みしか無いので、4段階に割り当てると
 * 弾道2と3が同じ字面になるか、弾道1が「下向き」という誤った意味になっていた。
 * 打球が下に飛ぶことは無いので、1は水平（0度）から始める。
 *
 * 角度の定義は `TRAJECTORY_ANGLES`（1:0度 / 2:22度 / 3:45度 / 4:65度）。
 * ここは向きを描くだけで、値の意味は core が持つ。
 */

/**
 * 描画領域（viewBox 座標）。
 * **一番寝た角度と一番立った角度の両方が収まる比率**にする。
 * 24×32 にしていた頃は、弾道4（65度）の矢じりが上へはみ出して
 * 1つ上の行に食い込んでいた。
 */
const WIDTH = 36
const HEIGHT = 28
/** 矢印の根元。左下から打ち出す */
const ORIGIN = { x: 3, y: HEIGHT - 3 }
/** 矢印の長さ */
const LENGTH = 24

export function TrajectoryArrow({
  trajectory,
  /** 文字と同じ大きさに揃えたいときの高さ(px) */
  size = 20,
}: {
  trajectory: number
  size?: number
}) {
  const angle = trajectoryAngle(trajectory)
  const radians = (angle * Math.PI) / 180
  // SVG は y 軸が下向きなので、上へ向けるには引く
  const tip = {
    x: ORIGIN.x + Math.cos(radians) * LENGTH,
    y: ORIGIN.y - Math.sin(radians) * LENGTH,
  }

  return (
    <svg
      className={styles.arrow}
      style={{ height: size }}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`弾道${trajectory}（${TRAJECTORY_LABELS[trajectory] ?? ''}・約${angle}度）`}
    >
      {/*
        角度の基準になる水平線。**矢印そのものとは離して引く。**
        同じ高さに引いていたら、弾道1（水平）のときに矢印と重なって
        1本の太い線に見えていた。
      */}
      <line
        className={styles.ground}
        x1={ORIGIN.x}
        y1={HEIGHT - 0.5}
        x2={WIDTH - 1}
        y2={HEIGHT - 0.5}
      />
      <line
        className={styles.shaft}
        x1={ORIGIN.x}
        y1={ORIGIN.y}
        x2={tip.x}
        y2={tip.y}
      />
      {/* 矢じり。線の向きに合わせて回す */}
      <polygon
        className={styles.head}
        points="0,-3.2 6,0 0,3.2"
        transform={`translate(${tip.x} ${tip.y}) rotate(${-angle})`}
      />
    </svg>
  )
}
