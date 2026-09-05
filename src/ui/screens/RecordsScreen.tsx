import { useState } from 'react'
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
import type { Position } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { AbilityGrid } from '@/ui/components/AbilityGrid'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
import styles from './RecordsScreen.module.css'

/**
 * 歴代記録。
 *
 * 通算成績は積み上がっても、**卒業した瞬間に見えなくなる**のでは
 * 積み上げる意味が薄い。在校生と卒業生を同じ土俵に並べる場所を作る。
 */
/**
 * ベストナインの1人。**押すと能力が開く。**
 *
 * 名前と成績だけを並べていた頃は、
 * 「歴代最強の4番」がどんな能力だったのかがここからは分からなかった。
 * 在校生は今の能力、卒業生は**卒業時**の能力を出す。
 */
function BestNineRow({ position, entry }: { position: Position; entry: HallEntry }) {
  const [open, setOpen] = useState(false)
  const canOpen = entry.abilities !== undefined

  return (
    <div className={styles.entry}>
      <button
        type="button"
        className={styles.row}
        onClick={() => setOpen((value) => !value)}
        disabled={!canOpen}
        aria-expanded={open}
      >
        <span className={styles.position}>{POSITION_LABELS[position]}</span>
        <PlayerPortrait playerId={entry.id} size={30} cap />
        <span className={styles.identity}>
          <span className={styles.name}>{entry.name}</span>
          <span className={styles.note}>{entry.note}</span>
        </span>
        <span className={styles.line}>{summaryOf(entry, position === 'P')}</span>
        {canOpen && <span className={styles.caret}>{open ? '▲' : '▼'}</span>}
      </button>

      {open && entry.abilities && (
        <AbilityGrid
          abilities={entry.abilities}
          isPitcher={entry.isPitcher}
          title={entry.note.includes('卒') ? '卒業時の能力' : 'いまの能力'}
        />
      )}
    </div>
  )
}

export function RecordsScreen() {
  const game = useGameStore((s) => s.game)
  const setScreen = useGameStore((s) => s.setScreen)

  if (!game) return null

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
            <BestNineRow key={position} position={position} entry={entry} />
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
