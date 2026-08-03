import { toRank } from '@/core/player/rating'
import type { Player } from '@/core/types/player'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './AbilityLetters.module.css'

type Props = {
  player: Player
  /** ラベル（ミ・パ…）を省いて詰める */
  compact?: boolean
}

/** 野手の並び。1文字にして横幅を抑える */
const BATTING: { label: string; get: (player: Player) => number }[] = [
  { label: 'ミ', get: (p) => p.batting.meet },
  { label: 'パ', get: (p) => p.batting.power },
  { label: '走', get: (p) => p.batting.speed },
  { label: '肩', get: (p) => p.batting.arm },
  { label: '守', get: (p) => p.batting.fielding },
  { label: '捕', get: (p) => p.batting.catching },
]

/** 投手の並び。球速だけは数値なので別扱い */
const PITCHING: { label: string; get: (player: Player) => number }[] = [
  { label: '制', get: (p) => p.pitching?.control ?? 0 },
  { label: 'ス', get: (p) => p.pitching?.stamina ?? 0 },
  { label: '変', get: (p) => p.pitching?.breaking ?? 0 },
]

/**
 * 各能力のランクを並べて表示する。
 * 一覧やスタメン画面で、タップせずに能力を比べられるようにする。
 */
export function AbilityLetters({ player, compact = false }: Props) {
  const entries = player.isPitcher ? [...PITCHING, ...BATTING.slice(0, 3)] : BATTING

  return (
    <div className={compact ? `${styles.row} ${styles.compact}` : styles.row}>
      {player.isPitcher && player.pitching && (
        <span className={styles.cell}>
          <span className={styles.label}>球</span>
          <span className={styles.rank} style={{ color: 'var(--accent)' }}>
            {player.pitching.velocity}
          </span>
        </span>
      )}

      {entries.map((entry) => {
        const rank = toRank(entry.get(player))
        return (
          <span key={entry.label} className={styles.cell}>
            <span className={styles.label}>{entry.label}</span>
            <span className={styles.rank} style={{ color: rankColorOf(rank) }}>
              {rank}
            </span>
          </span>
        )
      })}
    </div>
  )
}
