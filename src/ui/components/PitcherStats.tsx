import { toRank, velocityRank } from '@/core/player/rating'
import type { Rank } from '@/core/player/rating'
import type { BattingAbilities, PitchingAbilities } from '@/core/types/player'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './PitcherStats.module.css'

/**
 * 投手の能力を数値で並べる。
 *
 * **投手に野手のレーダーを使うのをやめた。**
 * 六角形に「球速・制球・変化・スタミナ・守備・走力」を詰めていたので、
 * 150pxのカードでは軸のラベルが潰れて重なり、
 * そのうえ形が読めても**実際の値が分からない**（球速141km/hなのか135km/hなのか）。
 * 投手は見たい値が数個しかないので、素直に数値で出す。
 */
export function PitcherStats({
  pitching,
  /**
   * 添えると**守備と捕球も並べる**。
   * 投手も守備は使うし、練習でも伸びるのに、一覧のどこにも出ていなかった。
   */
  batting,
  /**
   * 球速を含めるか。
   * 一覧のカードでは球速を大きく別に出すので、ここでは省く。
   */
  velocity = true,
  /** 一覧のカードに置くとき。字と余白を詰める */
  compact = false,
  /**
   * 何列で並べるか。
   * スタメン画面の右の枠は100pxしかなく、2列だと「スタミナ」がはみ出す。
   */
  columns = 2,
}: {
  pitching: PitchingAbilities
  batting?: BattingAbilities
  velocity?: boolean
  compact?: boolean
  columns?: 1 | 2
}) {
  const className = [styles.grid, compact ? styles.compact : '', columns === 1 ? styles.single : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {/*
        球速は km/h の実数値のまま出す（ランクだけにすると速さの実感が消える）。
        ただし**色とランクは他の能力と揃える**。
        揃っていなかった頃は、球速だけが常に同じ色で
        「速いのか遅いのか」が一覧では読めなかった
      */}
      {velocity && (
        <Cell label="球速" text={`${pitching.velocity}`} rank={velocityRank(pitching.velocity)} />
      )}
      <Cell label="制球" value={pitching.control} />
      <Cell label="スタミナ" value={pitching.stamina} />
      {/* ノビは速球の、キレは変化球の強さ */}
      <Cell label="ノビ" value={pitching.life} />
      <Cell label="キレ" value={pitching.sharpness} />
      {batting && (
        <>
          <Cell label="守備" value={batting.fielding} />
          <Cell label="捕球" value={batting.catching} />
        </>
      )}
    </div>
  )
}

function Cell({
  label,
  value,
  text,
  /** 数値からは決まらないランク（球速）。省略時は value から出す */
  rank: given,
}: {
  label: string
  value?: number
  text?: string
  rank?: Rank
}) {
  const rank = given ?? (value === undefined ? null : toRank(value))

  return (
    <span className={styles.cell}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value} style={{ color: rankColorOf(rank ?? 'G') }}>
        {rank && <span className={styles.rank}>{rank}</span>}
        {text ?? value}
      </span>
    </span>
  )
}
