import { toRank } from '@/core/player/rating'
import type { BattingAbilities } from '@/core/types/player'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './PitcherStats.module.css'

/**
 * 野手の能力を数値で並べる。
 *
 * **六角形のレーダーをやめた。** 形は「打撃型か守備型か」を伝えるが、
 * ミートがA(83)なのかB(75)なのかは読めない。
 * 一覧で選手を比べるときに知りたいのはその数字のほうで、
 * 投手（`PitcherStats`）とも見え方が揃う。
 *
 * 並びは「ミート・パワー」で1行、「走力・肩力」で1行、「守備・捕球」で1行。
 * 打つ力・走る力と投げる力・守る力を、行で分けてある。
 *
 * 弾道はここに入れない。数値ではなく向きなので、
 * 守備適性と同じ**絵の側**（`PlayerCard` の左）に置いてある。
 */
export function BatterStats({
  batting,
  /** 一覧のカードに置くとき。字と余白を詰める */
  compact = false,
  /** 何列で並べるか。カードでは絵の右に縦一列で置く */
  columns = 2,
}: {
  batting: BattingAbilities
  compact?: boolean
  columns?: 1 | 2
}) {
  const className = [styles.grid, compact ? styles.compact : '', columns === 1 ? styles.single : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      <Cell label="ミート" value={batting.meet} />
      <Cell label="パワー" value={batting.power} />
      <Cell label="走力" value={batting.speed} />
      <Cell label="肩力" value={batting.arm} />
      <Cell label="守備" value={batting.fielding} />
      <Cell label="捕球" value={batting.catching} />
    </div>
  )
}

function Cell({ label, value }: { label: string; value: number }) {
  const rank = toRank(value)

  return (
    <span className={styles.cell}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value} style={{ color: rankColorOf(rank) }}>
        <span className={styles.rank}>{rank}</span>
        {value}
      </span>
    </span>
  )
}
