import { formatInnings } from '@/core/player/careerStats'
import {
  allTimeRoster,
  bestNine,
  BEST_NINE_MIN_GAMES,
  leaderOf,
  RECORD_CATEGORIES,
} from '@/core/season/hallOfFame'
import type { HallEntry } from '@/core/season/hallOfFame'
import { POSITION_LABELS } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
import { teamCapColor } from '@/ui/theme/playerColors'
import styles from './RecordsScreen.module.css'

/**
 * 歴代記録。
 *
 * 通算成績は積み上がっても、**卒業した瞬間に見えなくなる**のでは
 * 積み上げる意味が薄い。在校生と卒業生を同じ土俵に並べる場所を作る。
 */
export function RecordsScreen() {
  const game = useGameStore((s) => s.game)
  const setScreen = useGameStore((s) => s.setScreen)

  if (!game) return null

  const capColor = teamCapColor(game.uniform)
  const roster = allTimeRoster(game.players, game.graduates)
  const nine = bestNine(roster)

  return (
    <AppLayout title="歴代記録" subtitle={game.schoolName} scrollable>
      <button type="button" className={styles.back} onClick={() => setScreen('players')}>
        ← 部員一覧へ
      </button>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>歴代ベストナイン</h2>
        {nine.length === 0 ? (
          <p className={styles.empty}>
            まだ記録がありません。{BEST_NINE_MIN_GAMES}試合以上に出場すると載ります。
          </p>
        ) : (
          nine.map(({ position, entry }) => (
            <div key={position} className={styles.row}>
              <span className={styles.position}>{POSITION_LABELS[position]}</span>
              <PlayerPortrait playerId={entry.id} size={30} cap capColor={capColor} />
              <span className={styles.identity}>
                <span className={styles.name}>{entry.name}</span>
                <span className={styles.note}>{entry.note}</span>
              </span>
              <span className={styles.line}>{summaryOf(entry, position === 'P')}</span>
            </div>
          ))
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>通算記録</h2>
        {RECORD_CATEGORIES.map((category) => {
          const leader = leaderOf(roster, category)
          return (
            <div key={category.key} className={styles.recordRow}>
              <span className={styles.recordLabel}>{category.label}</span>
              {leader ? (
                <>
                  <span className={styles.recordName}>{leader.entry.name}</span>
                  <span className={styles.recordValue}>{leader.text}</span>
                </>
              ) : (
                <span className={styles.recordEmpty}>該当者なし</span>
              )}
            </div>
          )
        })}
      </section>
    </AppLayout>
  )
}

/** ベストナインの1行に添える成績の要約 */
function summaryOf(entry: HallEntry, isPitcher: boolean): string {
  if (isPitcher) {
    const p = entry.stats.pitching
    return `${formatInnings(p.outs)}回 ${p.wins}勝${p.losses}敗 ${p.strikeouts}奪三振`
  }
  const b = entry.stats.batting
  return `${b.games}試合 ${b.hits}安打 ${b.homeruns}本 ${b.rbi}打点`
}
