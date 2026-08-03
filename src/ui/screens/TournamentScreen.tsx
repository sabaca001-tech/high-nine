import { isTournamentOver, roundName } from '@/core/types/tournament'
import { findRegion } from '@/core/types/region'
import { formatFunds } from '@/core/shop/funds'
import { tournamentTravel } from '@/core/shop/travel'
import { useGameStore } from '@/state/useGameStore'
import styles from './TournamentScreen.module.css'

/**
 * 大会の進行画面。
 * 勝ち上がりの状況を見せ、次の試合へ送り出す。
 */
export function TournamentScreen() {
  const game = useGameStore((s) => s.game)
  const playTournamentMatch = useGameStore((s) => s.playTournamentMatch)
  const finishTournament = useGameStore((s) => s.finishTournament)

  const tournament = game?.tournament ?? null
  if (!game || !tournament) return null

  const over = isTournamentOver(tournament)
  const currentRoundName = roundName(tournament.round, tournament.totalRounds)

  // ここまでの遠征費。大会が終わったときに部費から引かれる
  const travel = tournamentTravel(
    tournament.kind,
    findRegion(game.regionId),
    tournament.results.length,
  )

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.name}>{tournament.name}</h1>
        <p className={styles.scale}>
          参加{tournament.entrants}校 / 優勝まで{tournament.totalRounds}勝
        </p>
        {travel.cost > 0 && (
          <p className={styles.travel}>
            {travel.distance > 0 ? '遠征費' : '交通費'} {formatFunds(travel.cost)}
            {travel.nights > 0 && `（${travel.nights}泊）`}
            {travel.grant > 0 && ` / 遠征補助 ${formatFunds(travel.grant)}`}
          </p>
        )}

        <div className={styles.progress}>
          {Array.from({ length: tournament.totalRounds }, (_, index) => {
            const round = index + 1
            const result = tournament.results.find((entry) => entry.round === round)
            const classNames = [styles.step]

            if (result) classNames.push(result.won ? styles.stepWon : styles.stepLost)
            else if (round === tournament.round && !over) classNames.push(styles.stepCurrent)

            return (
              <span key={round} className={classNames.join(' ')}>
                {round}
              </span>
            )
          })}
        </div>
      </header>

      <div className={styles.body}>
        {over ? (
          <>
            <div
              className={`${styles.outcome} ${
                tournament.champion ? styles.champion : styles.eliminated
              }`}
            >
              {tournament.champion ? '優勝' : `${tournament.results.length}回戦 敗退`}
            </div>
            {tournament.champion && tournament.kind === 'summerPref' && (
              <p className={styles.note}>全国大会への出場が決まった</p>
            )}
          </>
        ) : (
          <div className={styles.nextUp}>
            <p className={styles.nextLabel}>次の試合</p>
            <p className={styles.nextRound}>{currentRoundName}</p>
          </div>
        )}

        {tournament.results.map((entry) => (
          <div
            key={entry.round}
            className={`${styles.result} ${entry.won ? styles.won : styles.lost}`}
          >
            <span className={styles.roundLabel}>{entry.roundName}</span>
            <span className={styles.opponent}>{entry.opponentName}</span>
            <span className={styles.score}>
              {entry.scoreFor} - {entry.scoreAgainst}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.controls}>
        {over ? (
          <button type="button" className={styles.button} onClick={finishTournament}>
            大会を終える ▶
          </button>
        ) : (
          <button type="button" className={styles.button} onClick={playTournamentMatch}>
            {currentRoundName}へ ▶
          </button>
        )}
      </div>
    </div>
  )
}
