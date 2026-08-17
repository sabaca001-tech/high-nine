import { ABILITY_LABELS } from '@/core/types/player'
import type { AbilityChange } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { playSound } from '@/ui/sound/sound'
import styles from './GrowthReport.module.css'

type Row = {
  playerId: string
  name: string
  total: number
  gains: { key: AbilityChange['key']; delta: number }[]
}

/**
 * その日の成長を出すウィンドウ。
 *
 * **マスの効果が画面を奪う前に、必ずここで一度止まる。**
 * 以前は試合マスに止まると、練習の結果を見る前に試合が始まっていた。
 * 盤面は後ろに透けたままにして、どこで止まったかは見えるようにする。
 *
 * 中身は `GrowthSummary` と同じ「選手ごとに名前で並べる」形。
 * 育成ゲームで知りたいのは「今の練習で誰が伸びたか」なので集計はしない。
 */
export function GrowthReport() {
  const game = useGameStore((s) => s.game)
  const closeGrowthReport = useGameStore((s) => s.closeGrowthReport)

  const pending = game?.pendingGrowth
  if (!game || !pending) return null

  const rows = aggregate(pending.changes, game.players)

  const handleClose = () => {
    playSound('tap')
    closeGrowthReport()
  }

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <p className={styles.title}>{pending.title ?? 'この日の成長'}</p>

        <div className={styles.list}>
          {rows.length > 0 ? (
            rows.map((row) => (
              <div key={row.playerId} className={styles.row}>
                <span className={styles.name}>{row.name}</span>
                <span className={styles.gains}>
                  {row.gains.map((gain) => (
                    <span key={gain.key} className={styles.chip}>
                      {ABILITY_LABELS[gain.key]}
                      <span className={gain.delta > 0 ? styles.up : styles.down}>
                        {gain.delta > 0 ? '+' : ''}
                        {gain.delta}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            ))
          ) : (
            pending.notes === undefined && <p className={styles.empty}>目に見える変化は無かった</p>
          )}

          {/* 能力以外に動いたもの。ミーティングやメンタル強化はここに出る */}
          {pending.notes?.map((note) => (
            <p key={note} className={styles.note}>
              {note}
            </p>
          ))}
        </div>

        <button type="button" className={styles.closeButton} onClick={handleClose}>
          次へ ▶
        </button>
      </div>
    </div>
  )
}

/** 選手ごとにまとめ、伸びた順に並べる */
function aggregate(changes: AbilityChange[], players: { id: string; name: string }[]): Row[] {
  const nameById = new Map(players.map((player) => [player.id, player.name]))
  const byPlayer = new Map<string, Map<AbilityChange['key'], number>>()

  for (const change of changes) {
    const gains = byPlayer.get(change.playerId) ?? new Map<AbilityChange['key'], number>()
    gains.set(change.key, (gains.get(change.key) ?? 0) + (change.after - change.before))
    byPlayer.set(change.playerId, gains)
  }

  const rows: Row[] = []
  for (const [playerId, gains] of byPlayer) {
    const list = [...gains.entries()]
      .filter(([, value]) => value !== 0)
      .map(([key, delta]) => ({ key, delta }))
      .sort((a, b) => b.delta - a.delta)
    if (list.length === 0) continue

    rows.push({
      playerId,
      // 卒業・引退で在籍していない選手の変化も流れてくることがある
      name: nameById.get(playerId) ?? '選手',
      total: list.reduce((sum, gain) => sum + gain.delta, 0),
      gains: list,
    })
  }

  return rows.sort((a, b) => b.total - a.total)
}
