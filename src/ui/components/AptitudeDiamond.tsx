import type { Aptitude, Position } from '@/core/types/player'
import styles from './AptitudeDiamond.module.css'

/**
 * ポジション適性を野球場の形で見せる。
 *
 * 9つの適性を縦の表で並べると縦に長くなり、
 * 「どこを守れる選手か」が一目で分からない。
 * 実際の守備位置に文字を置けば、外野型か内野型かが形で読める。
 */

/** 描画領域（viewBox 座標） */
const SIZE = 100

/** 守備位置の座標。実際の配置に合わせる */
const SPOTS: Record<Position, { x: number; y: number }> = {
  LF: { x: 13, y: 27 },
  CF: { x: 50, y: 11 },
  RF: { x: 87, y: 27 },
  '3B': { x: 21, y: 57 },
  SS: { x: 35, y: 42 },
  '2B': { x: 65, y: 42 },
  '1B': { x: 79, y: 57 },
  P: { x: 50, y: 63 },
  C: { x: 50, y: 88 },
}

/** 内野のダイヤモンド（本塁→一塁→二塁→三塁） */
const INFIELD = '50,78 74,55 50,34 26,55'

/** 外野を含めたフェアグラウンド */
const FIELD = '50,80 96,34 50,4 4,34'

/** 守れる適性かどうかで色を変える */
function toneOf(aptitude: Aptitude): string {
  if (aptitude === 'S') return styles.tierS
  if (aptitude === 'A' || aptitude === 'B') return styles.tierGood
  if (aptitude === 'C' || aptitude === 'D') return styles.tierMid
  return styles.tierLow
}

const ORDER: Position[] = ['LF', 'CF', 'RF', '3B', 'SS', '2B', '1B', 'P', 'C']

export function AptitudeDiamond({
  aptitudes,
  /** 本職。枠で囲って区別する */
  main,
}: {
  aptitudes: Record<Position, Aptitude>
  main?: Position
}) {
  return (
    <svg
      className={styles.diamond}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={ORDER.map((position) => `${position}${aptitudes[position]}`).join('、')}
    >
      <polygon className={styles.field} points={FIELD} />
      <polygon className={styles.infield} points={INFIELD} />

      {ORDER.map((position) => {
        const spot = SPOTS[position]
        return (
          <g key={position}>
            {main === position && (
              <circle className={styles.mainMark} cx={spot.x} cy={spot.y} r={8} />
            )}
            <text
              className={`${styles.letter} ${toneOf(aptitudes[position])}`}
              x={spot.x}
              y={spot.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {aptitudes[position]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
