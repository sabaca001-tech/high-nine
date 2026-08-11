import { defenseScore } from '@/core/lineup/aptitude'
import { toRank } from '@/core/player/rating'
import type { Player, Position } from '@/core/types/player'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './AptitudeDiamond.module.css'

/**
 * ポジション適性を野球場の形で見せる。
 *
 * 9つの適性を縦の表で並べると縦に長くなり、
 * 「どこを守れる選手か」が一目で分からない。
 * 実際の守備位置に文字を置けば、外野型か内野型かが形で読める。
 *
 * **出すのは適性の記号ではなく、その位置での守備力。**
 * 「適性C」と書かれても何割の力で守れるのかが読めなかった。
 * 適性は5段階で、1段が守備力の20%。本職（5段）ならそのままの守備力が出る。
 * 守れない位置（0段）は**何も出さない**。
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

const ORDER: Position[] = ['LF', 'CF', 'RF', '3B', 'SS', '2B', '1B', 'P', 'C']

export function AptitudeDiamond({
  player,
  /** 本職。枠で囲って区別する */
  main,
}: {
  player: Player
  main?: Position
}) {
  /** その位置で発揮できる守備力。0段なら null（出さない） */
  const valueAt = (position: Position): number | null =>
    player.aptitudes[position] === 0 ? null : Math.round(defenseScore(player, position))

  return (
    <svg
      className={styles.diamond}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={ORDER.map((position) => `${position}${valueAt(position) ?? '不可'}`).join('、')}
    >
      <polygon className={styles.field} points={FIELD} />
      <polygon className={styles.infield} points={INFIELD} />

      {ORDER.map((position) => {
        const spot = SPOTS[position]
        const value = valueAt(position)
        if (value === null) return null

        return (
          <g key={position}>
            {main === position && (
              <circle className={styles.mainMark} cx={spot.x} cy={spot.y} r={9} />
            )}
            <text
              className={styles.letter}
              style={{ fill: rankColorOf(toRank(value)) }}
              x={spot.x}
              y={spot.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
