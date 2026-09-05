import { proVelocityRank, toRank, velocityRank } from '@/core/player/rating'
import { ABILITY_LABELS } from '@/core/types/player'
import type { AbilitySnapshot } from '@/core/types/player'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './AbilityGrid.module.css'

/**
 * ある時点の能力を、ランクと実数で並べる。
 *
 * **同じ形で見せるための共通部品。**
 * OB名鑑（卒業時の能力）と歴代ベストナインで別々に組んでいたので、
 * 片方だけ球速の色が付いていない、といった食い違いが起きていた。
 *
 * 在校生・卒業生・プロのどれでも同じ `AbilitySnapshot` を渡す。
 */
export function AbilityGrid({
  abilities,
  isPitcher,
  /**
   * 球速をプロの物差しで見るか。
   * **プロ入りしても球速は落ちない**（変わるのは比べる相手のほう）ので、
   * 150km/h は高校生なら一級品でも、プロでは普通。
   */
  proVelocity = false,
  title,
}: {
  abilities: AbilitySnapshot
  isPitcher: boolean
  proVelocity?: boolean
  title?: string
}) {
  const keys: (keyof AbilitySnapshot)[] = isPitcher
    ? ['velocity', 'control', 'stamina', 'sharpness', 'life', 'fielding']
    : ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']

  return (
    <div className={styles.wrap}>
      {title && <h3 className={styles.title}>{title}</h3>}
      <div className={styles.grid}>
        {keys.map((key) => {
          const value = abilities[key]
          if (typeof value !== 'number') return null

          // 球速だけ km/h の実数値。ランクは物差しを持ち替える
          const rank =
            key === 'velocity'
              ? proVelocity
                ? proVelocityRank(value)
                : velocityRank(value)
              : toRank(value)

          return (
            <span key={key} className={styles.cell}>
              <span className={styles.label}>{ABILITY_LABELS[key as 'meet']}</span>
              <span className={styles.value} style={{ color: rankColorOf(rank) }}>
                <span className={styles.rank}>{rank}</span>
                {value}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
