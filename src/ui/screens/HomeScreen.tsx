import { useState } from 'react'
import { overallRating } from '@/core/player/rating'
import { reputationGrade, REPUTATION_GRADE_LABELS } from '@/core/types/season'
import { findRegion } from '@/core/types/region'
import { formatDay } from '@/core/calendar/days'
import { TOURNAMENT_LABELS } from '@/core/types/tournament'
import type { PracticeKind } from '@/core/types/card'
import type { GameState } from '@/core/types/game'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { BoardTrack } from '@/ui/components/BoardTrack'
import { FieldScene } from '@/ui/components/FieldScene'
import { GrowthSummary } from '@/ui/components/GrowthSummary'
import { PracticeCardView } from '@/ui/components/PracticeCardView'
import { playSound } from '@/ui/sound/sound'
import styles from './HomeScreen.module.css'

export function HomeScreen() {
  const game = useGameStore((s) => s.game)
  const lastEvents = useGameStore((s) => s.lastEvents)
  const selectCard = useGameStore((s) => s.selectCard)
  const advanceYear = useGameStore((s) => s.advanceYear)

  // 直近に選んだ練習。グラウンドの選手の動きに反映する
  const [lastPractice, setLastPractice] = useState<PracticeKind | null>(null)

  if (!game) return null

  const isYearEnd = game.phase === 'yearEnd'
  const headline = game.log.length > 0 ? game.log[game.log.length - 1] : null
  // 吹き出しの1件を除いた直近3件を、掛け声のようにグラウンドへ流す
  const chatter = game.log.slice(-4, -1)

  // この先いちばん近い「必ず止まるマス」を予告する。
  // 盤面が1年ぶんになったので、月ではなく日付で案内する
  const nextEvent = game.board.find(
    (cell) =>
      cell.index > game.boardPosition && (cell.kind === 'tournament' || cell.kind === 'camp'),
  )

  const upcoming = nextEvent
    ? nextEvent.kind === 'camp'
      ? `${formatDay(nextEvent.index)}：冬合宿`
      : `${formatDay(nextEvent.index)}：${
          nextEvent.tournamentKind === 'nationals' ||
          nextEvent.tournamentKind === 'springNationals'
            ? TOURNAMENT_LABELS[nextEvent.tournamentKind]
            : `${findRegion(game.regionId).name} ${
                nextEvent.tournamentKind ? TOURNAMENT_LABELS[nextEvent.tournamentKind] : '大会'
              }`
        }`
    : null

  const handleSelect = (cardId: string) => {
    const card = game.hand.find((c) => c.id === cardId)
    if (card) setLastPractice(card.kind)
    playSound('tap')
    selectCard(cardId)
  }

  return (
    <AppLayout title={game.schoolName} subtitle={`${game.year}年目 ${game.month}月`}>
      <TeamStats game={game} />

      {upcoming && <p className={styles.upcoming}>{upcoming}</p>}

      <BoardTrack board={game.board} position={game.boardPosition} />

      <FieldScene
        uniform={game.uniform}
        month={game.month}
        practice={lastPractice}
        headline={headline}
        chatter={chatter}
      />

      <GrowthSummary events={lastEvents} />

      {isYearEnd ? (
        <div className={styles.yearEnd}>
          <button type="button" className={styles.nextButton} onClick={advanceYear}>
            次の年度へ進む ▶
          </button>
        </div>
      ) : (
        <>
          <p className={styles.handHint}>カードを選ぶ（数字ぶん進む）</p>
          <div className={styles.hand}>
            {game.hand.map((card) => (
              <PracticeCardView key={card.id} card={card} onSelect={handleSelect} />
            ))}
          </div>
        </>
      )}
    </AppLayout>
  )
}

/** チーム全体の状態をひと目で分かるようにまとめた行 */
function TeamStats({ game }: { game: GameState }) {
  // 部員数は部員一覧で分かるので、限られた幅は変動する数値に使う
  const average = (fn: (p: GameState['players'][number]) => number) =>
    Math.round(
      game.players.reduce((total, p) => total + fn(p), 0) / game.players.length,
    )

  const condition = average((p) => p.condition)

  return (
    <div className={styles.teamStats}>
      <Stat label="能力" value={`${average(overallRating)}`} />
      <Stat label="体力" value={`${condition}`} low={condition < 40} />
      <Stat label="信頼" value={`${average((p) => p.trust)}`} />
      <Stat
        label="評判"
        value={reputationGrade(game.reputation)}
        note={REPUTATION_GRADE_LABELS[reputationGrade(game.reputation)]}
      />
      <Stat label="部費" value={`${Math.floor(game.funds / 1000)}k`} />
    </div>
  )
}

function Stat({
  label,
  value,
  low = false,
  note,
}: {
  label: string
  value: string
  low?: boolean
  /** 値の意味を添える短い言葉（評判の呼び名など） */
  note?: string
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{note ?? label}</span>
      <span className={low ? `${styles.statValue} ${styles.low}` : styles.statValue}>{value}</span>
    </div>
  )
}
