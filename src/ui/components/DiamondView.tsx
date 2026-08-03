import type { PlayLog } from '@/core/types/match'
import { isHit } from '@/core/types/match'
import styles from './DiamondView.module.css'

type Props = {
  /** 直近の打席。まだ始まっていなければ null */
  play: PlayLog | null
}

/**
 * 走者・アウトカウントを示すダイヤモンド。
 *
 * Pixi.js のような描画ライブラリは使わず SVG で描く。
 * 画像を持たない方針を保ったまま、状況が一目で分かるようにする。
 */
export function DiamondView({ play }: Props) {
  const bases = play?.bases ?? [false, false, false]
  const outs = play ? play.outsAfter % 3 : 0
  const hit = play !== null && isHit(play.result)
  const scored = play !== null && play.runsScored > 0

  return (
    <div className={scored ? `${styles.wrapper} ${styles.flash}` : styles.wrapper}>
      <svg className={styles.field} width="92" height="82" viewBox="0 0 92 82" role="presentation">
        {/* 内野の土 */}
        <path d="M46 74 L14 42 L46 10 L78 42 Z" fill="var(--dirt-scene)" opacity="0.85" />
        {/* 芝 */}
        <path d="M46 64 L24 42 L46 20 L68 42 Z" fill="var(--grass)" opacity="0.9" />

        {/* 二塁 */}
        <rect
          x="40"
          y="14"
          width="12"
          height="12"
          transform="rotate(45 46 20)"
          className={bases[1] ? `${styles.base} ${styles.baseOccupied}` : styles.base}
        />
        {/* 三塁 */}
        <rect
          x="18"
          y="36"
          width="12"
          height="12"
          transform="rotate(45 24 42)"
          className={bases[2] ? `${styles.base} ${styles.baseOccupied}` : styles.base}
        />
        {/* 一塁 */}
        <rect
          x="62"
          y="36"
          width="12"
          height="12"
          transform="rotate(45 68 42)"
          className={bases[0] ? `${styles.base} ${styles.baseOccupied}` : styles.base}
        />
        {/* 本塁 */}
        <rect
          x="41"
          y="59"
          width="10"
          height="10"
          transform="rotate(45 46 64)"
          className={styles.base}
        />

        {/* 打球。安打のときだけ飛ぶ */}
        <circle
          key={play?.id}
          cx="46"
          cy="62"
          r="3.5"
          className={hit ? `${styles.ball} ${styles.ballHit}` : styles.ball}
          opacity={hit ? 1 : 0}
        />
      </svg>

      <div className={styles.status}>
        <span>アウト</span>
        <span className={styles.outs}>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={index < outs ? `${styles.outMark} ${styles.outFilled}` : styles.outMark}
            />
          ))}
        </span>
      </div>
    </div>
  )
}
