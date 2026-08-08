import { useState } from 'react'
import type { Bracket, BracketTeam } from '@/core/tournament/bracket'
import { matchesAt, survivorsAt } from '@/core/tournament/bracket'
import { roundName } from '@/core/types/tournament'
import styles from './BracketView.module.css'

/**
 * トーナメント表。
 *
 * **178校の対戦カードを全部並べても読めない。**
 * 375px の画面で意味があるのは「誰が残っているか」と
 * 「次の相手はどこを勝ち上がってきたか」の2つ。
 *
 * そこで、試合数が少ない回戦（ベスト16以降）は**対戦カードをそのまま**出し、
 * それより前の回戦は**勝ち残った学校の一覧**にしている。
 * 一覧は強い順に並べ、多いときは上位だけを出して残りは校数で示す。
 */
export function BracketView({
  bracket,
  totalRounds,
  currentRound,
}: {
  bracket: Bracket
  totalRounds: number
  currentRound: number
}) {
  const [round, setRound] = useState(currentRound)
  if (bracket.slots.length === 0) return null

  const shown = Math.min(round, totalRounds)
  const matches = matchesAt(bracket, shown)
  const decided = bracket.winners.length >= shown

  return (
    <section className={styles.wrap}>
      <div className={styles.tabs}>
        {Array.from({ length: totalRounds }, (_, index) => {
          const value = index + 1
          const reached = bracket.winners.length >= value - 1
          return (
            <button
              key={value}
              type="button"
              disabled={!reached}
              className={value === shown ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setRound(value)}
            >
              {roundName(value, totalRounds)}
            </button>
          )
        })}
      </div>

      {matches.length <= CARD_LIMIT ? (
        <div className={styles.cards}>
          {matches.map((match, index) => (
            <div key={index} className={styles.card}>
              <Side team={match.left} winner={decided && match.winner === match.left} />
              <span className={styles.vs}>–</span>
              <Side team={match.right} winner={decided && match.winner === match.right} />
            </div>
          ))}
        </div>
      ) : (
        <SurvivorList bracket={bracket} round={shown} />
      )}
    </section>
  )
}

/** 対戦カードで並べる上限。これを超える回戦は勝ち残り一覧にする */
const CARD_LIMIT = 8

/** 一覧に名前を出す校数。これを超えたぶんは「他◯校」でまとめる */
const NAME_LIMIT = 24

function Side({ team, winner }: { team: BracketTeam | null; winner: boolean }) {
  const classNames = [styles.side]
  if (winner) classNames.push(styles.winner)
  if (team?.ours) classNames.push(styles.ours)

  return (
    <span className={classNames.join(' ')}>
      {team ? team.name : '不戦勝'}
      {team && <span className={styles.strength}>{formatStrength(team.strength)}</span>}
    </span>
  )
}

function SurvivorList({ bracket, round }: { bracket: Bracket; round: number }) {
  const survivors = [...survivorsAt(bracket, round)].sort((a, b) => b.strength - a.strength)
  const shown = survivors.slice(0, NAME_LIMIT)
  const rest = survivors.length - shown.length

  return (
    <>
      <p className={styles.count}>勝ち残り {survivors.length}校</p>
      <div className={styles.chips}>
        {shown.map((team, index) => (
          <span
            key={`${team.name}-${index}`}
            className={team.ours ? `${styles.chip} ${styles.chipOurs}` : styles.chip}
          >
            {team.name}
            <span className={styles.strength}>{formatStrength(team.strength)}</span>
          </span>
        ))}
        {rest > 0 && <span className={styles.more}>他{rest}校</span>}
      </div>
      {/* 自校が上位に入らないこともあるので、居場所は必ず示す */}
      {!shown.some((team) => team.ours) && survivors.some((team) => team.ours) && (
        <p className={styles.note}>自校もこの回戦に残っている</p>
      )}
    </>
  )
}

/** 強さは「互角＝0」の相対値。符号を付けて格を読ませる */
function formatStrength(strength: number): string {
  return strength > 0 ? `+${strength}` : `${strength}`
}
