import { toRank } from '@/core/player/rating'
import styles from './AbilityBar.module.css'

/** ランクに対応する CSS 変数名 */
const RANK_COLOR_VAR: Record<string, string> = {
  S: 'var(--rank-s)',
  A: 'var(--rank-a)',
  B: 'var(--rank-b)',
  C: 'var(--rank-c)',
  D: 'var(--rank-d)',
  E: 'var(--rank-e)',
  F: 'var(--rank-f)',
  G: 'var(--rank-g)',
}

type Props = {
  label: string
  value: number
  /** 直近の変化量。0以外なら差分を表示する */
  delta?: number
}

/** 能力値1行ぶん（ラベル・ランク・ゲージ・数値） */
export function AbilityBar({ label, value, delta = 0 }: Props) {
  const rank = toRank(value)
  const color = RANK_COLOR_VAR[rank]

  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.rank} style={{ color }}>
        {rank}
      </span>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${value}%`, background: color }} />
      </div>
      <span className={styles.value}>
        {value}
        {delta !== 0 && (
          <span className={delta > 0 ? styles.delta : `${styles.delta} ${styles.deltaDown}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </span>
    </div>
  )
}
