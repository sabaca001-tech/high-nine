import type { Player } from '@/core/types/player'
import { velocityScore } from '@/core/types/player'
import styles from './AbilityRadar.module.css'

/**
 * 能力を六角形のレーダーで見せる。
 *
 * 数字やランクの羅列は「どれが高いか」を読むのに時間がかかる。
 * 形にすれば、打撃型か守備型かが一目で分かり、
 * 能力が伸びると形そのものが広がるので成長も見て取れる。
 *
 * 投手と野手で軸の意味が違うので、軸のラベルごと差し替える。
 */

/** 描画領域（viewBox 座標） */
const SIZE = 100
const CENTER = SIZE / 2
/** 最大値のときの半径 */
const RADIUS = 33

type RadarAxis = { label: string; value: number }

/** その選手のレーダーの軸を決める */
function axesOf(player: Player): RadarAxis[] {
  const b = player.batting

  if (player.pitching) {
    const p = player.pitching
    return [
      // 投手は打撃で評価しない。守備位置としての動きを見たいので走力を入れる。
      // 肩力は球速に比例する（growth.ts の armFromVelocity）ので軸にしない
      { label: '球速', value: velocityScore(p.velocity) },
      { label: '制球', value: p.control },
      { label: '変化', value: p.breaking },
      { label: 'スタミナ', value: p.stamina },
      { label: '守備', value: b.fielding },
      { label: '走力', value: b.speed },
    ]
  }

  return [
    { label: 'ミート', value: b.meet },
    { label: 'パワー', value: b.power },
    { label: '走力', value: b.speed },
    { label: '肩力', value: b.arm },
    { label: '守備', value: b.fielding },
    { label: '捕球', value: b.catching },
  ]
}

/** 頂点の座標。真上から時計回りに並べる */
function pointAt(index: number, count: number, ratio: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  return {
    x: CENTER + Math.cos(angle) * RADIUS * ratio,
    y: CENTER + Math.sin(angle) * RADIUS * ratio,
  }
}

function polygon(count: number, ratio: number, values?: RadarAxis[]): string {
  return Array.from({ length: count }, (_, index) => {
    const scale = values ? Math.max(0.04, values[index].value / 100) : ratio
    const point = pointAt(index, count, scale)
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`
  }).join(' ')
}

export function AbilityRadar({
  player,
  /** 軸のラベルを出すか。一覧では出し、狭い場所では省く */
  labels = true,
}: {
  player: Player
  labels?: boolean
}) {
  const axes = axesOf(player)
  const count = axes.length

  return (
    <svg
      className={styles.radar}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={axes.map((axis) => `${axis.label}${Math.round(axis.value)}`).join('、')}
    >
      {/* 目盛りの六角形。3段だけ引く */}
      {[1, 0.66, 0.33].map((ratio) => (
        <polygon key={ratio} className={styles.grid} points={polygon(count, ratio)} />
      ))}

      {/* 中心から各頂点への線 */}
      {axes.map((axis, index) => {
        const point = pointAt(index, count, 1)
        return (
          <line
            key={axis.label}
            className={styles.spoke}
            x1={CENTER}
            y1={CENTER}
            x2={point.x}
            y2={point.y}
          />
        )
      })}

      <polygon className={styles.area} points={polygon(count, 1, axes)} />

      {labels &&
        axes.map((axis, index) => {
          // ラベルは頂点の少し外側に置く
          const point = pointAt(index, count, 1.32)
          return (
            <text
              key={axis.label}
              className={styles.label}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {axis.label}
            </text>
          )
        })}
    </svg>
  )
}
