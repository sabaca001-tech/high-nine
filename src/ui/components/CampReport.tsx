import { findSkill } from '@/core/skill/skillDefs'
import { useGameStore } from '@/state/useGameStore'
import { playSound } from '@/ui/sound/sound'
import styles from './GrowthReport.module.css'
import own from './CampReport.module.css'

/**
 * 合宿の成果を出すウィンドウ。
 *
 * **ログに流すだけでは読めなかった。** 合宿は年2回しかないのに、
 * 誰が何を掴んだのかが他の報告に混ざって流れていく。
 * その日の成長（`GrowthReport`）と同じ「選手ごとに名前で並べる」形にする。
 *
 * 見た目も同じにしてある（`GrowthReport.module.css` を共有）。
 * **同じ意味のものは同じ形で見せる**ほうが、毎回読み方を覚え直さずに済む。
 */
export function CampReport() {
  const game = useGameStore((s) => s.game)
  const closeCampReport = useGameStore((s) => s.closeCampReport)

  const pending = game?.pendingCamp
  if (!game || !pending) return null

  const handleClose = () => {
    playSound('tap')
    closeCampReport()
  }

  const empty = pending.granted.length === 0 && pending.missed.length === 0

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <p className={styles.title}>{pending.label}</p>

        <div className={styles.list}>
          {pending.granted.map((news) => {
            const skill = findSkill(news.skillId)
            if (!skill) return null

            return (
              <div key={`${news.playerId}-${news.skillId}`} className={styles.row}>
                <span className={styles.name}>{news.playerName}</span>
                <span className={styles.gains}>
                  <span
                    className={
                      news.rank === 'gold' ? `${styles.chip} ${own.gold}` : styles.chip
                    }
                  >
                    {skill.name}
                    <span className={news.rank === 'gold' ? own.goldNote : styles.up}>
                      {news.rank === 'gold' ? '覚醒' : '習得'}
                    </span>
                  </span>
                </span>
              </div>
            )
          })}

          {/* **届かなかった挑戦も出す。** 次の合宿の目標になる */}
          {pending.missed.map((news) => {
            const skill = findSkill(news.skillId)
            if (!skill) return null

            return (
              <div key={`miss-${news.playerId}-${news.skillId}`} className={styles.row}>
                <span className={`${styles.name} ${own.missName}`}>{news.playerName}</span>
                <span className={styles.gains}>
                  <span className={`${styles.chip} ${own.miss}`}>
                    {skill.name}
                    <span className={own.missNote}>あと一歩</span>
                  </span>
                </span>
              </div>
            )
          })}

          {empty && <p className={styles.empty}>手応えのある選手は現れなかった</p>}
        </div>

        <button type="button" className={styles.closeButton} onClick={handleClose}>
          次へ ▶
        </button>
      </div>
    </div>
  )
}
