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

        {/*
          トーナメント表。**まだ戦っていない回戦も並べる。**
          勝ち上がった記録だけを出していた頃は、
          「あと何回勝てば優勝なのか」「次は準決勝なのか」が
          開幕時点では読めなかった。
          相手はその回戦に進んでから決まるので、先の欄は伏せてある。
        */}
        <div className={styles.ladder}>
          {Array.from({ length: tournament.totalRounds }, (_, index) => {
            const round = index + 1
            const entry = tournament.results.find((result) => result.round === round)
            const isNext = !over && round === tournament.round

            const classNames = [styles.rung]
            if (entry) classNames.push(entry.won ? styles.won : styles.lost)
            else if (isNext) classNames.push(styles.upcoming)

            return (
              <div key={round} className={classNames.join(' ')}>
                <span className={styles.roundLabel}>
                  {roundName(round, tournament.totalRounds)}
                </span>
                <span className={styles.opponent}>
                  {entry ? entry.opponentName : isNext ? '抽選中' : '—'}
                </span>
                <span className={styles.score}>
                  {entry ? `${entry.scoreFor} - ${entry.scoreAgainst}` : ''}
                </span>
              </div>
            )
          })}
        </div>
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
