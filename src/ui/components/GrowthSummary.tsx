import type { GameEvent } from '@/core/types/event'
import { ABILITY_LABELS } from '@/core/types/player'
import type { AbilityChange } from '@/core/types/player'
import styles from './GrowthSummary.module.css'

type Props = {
  events: GameEvent[]
}

type Aggregated = {
  key: AbilityChange['key']
  /** 変化した人数 */
  count: number
  /** 平均変化量 */
  average: number
}

/**
 * 直近の練習結果をまとめて表示する。
 * 部員15人ぶんの差分を全部並べると読めないため、能力ごとに集計する。
 * 個々の数値は選手詳細画面で確認できる。
 */
export function GrowthSummary({ events }: Props) {
  const aggregated = aggregate(events)
  if (aggregated.length === 0) return null

  return (
    <div className={styles.panel}>
      {aggregated.map(({ key, count, average }) => (
        <span key={key} className={styles.chip}>
          {ABILITY_LABELS[key]}
          <span className={average > 0 ? styles.up : styles.down}>
            {average > 0 ? '+' : ''}
            {average.toFixed(1)}
          </span>
          <span className={styles.count}>×{count}人</span>
        </span>
      ))}
    </div>
  )
}

function aggregate(events: GameEvent[]): Aggregated[] {
  const totals = new Map<AbilityChange['key'], { count: number; sum: number }>()

  for (const event of events) {
    if (event.type !== 'ability') continue
    for (const change of event.changes) {
      const entry = totals.get(change.key) ?? { count: 0, sum: 0 }
      entry.count += 1
      entry.sum += change.after - change.before
      totals.set(change.key, entry)
    }
  }

  return [...totals.entries()].map(([key, { count, sum }]) => ({
    key,
    count,
    average: sum / count,
  }))
}
