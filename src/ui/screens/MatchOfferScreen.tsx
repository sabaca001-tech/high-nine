import { formatFunds } from '@/core/shop/funds'
import { teamRating, matchupLabel, opponentRating } from '@/core/season/matchReputation'
import { ratingLabel } from '@/core/player/rating'
import { lineupRatingOf } from '@/core/rival/rivalRoster'
import { useGameStore } from '@/state/useGameStore'
import { playSound } from '@/ui/sound/sound'
import styles from './MatchOfferScreen.module.css'

/**
 * 練習試合の相手を選ぶ画面。
 *
 * **1つに決め打ちしていたのをやめた。**
 * 以前は止まった瞬間に相手も遠征先も勝手に決まっていて、
 * 遠征費が引かれたことに後から気づくこともあった。
 *
 * 出す情報は3つ。**誰と / いくらかかる / 力の差はどうか。**
 * この3つが並んでいないと「行く価値があるか」を判断できない。
 * 県内の候補は必ず入っているので、部費が無くても断る必要はない。
 */
export function MatchOfferScreen() {
  const game = useGameStore((s) => s.game)
  const chooseFriendlyMatch = useGameStore((s) => s.chooseFriendlyMatch)

  if (!game || !game.pendingOffers) return null

  const ourRating = teamRating(game.players, game.lineup)

  const choose = (offerId: string | null) => {
    playSound('tap')
    chooseFriendlyMatch(offerId)
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>練習試合</h1>
        <p className={styles.subtitle}>
          相手を選ぶ（部費 {formatFunds(game.funds)}）
        </p>
      </header>

      <div className={styles.body}>
        {game.pendingOffers.map((offer) => {
          const tooExpensive = offer.travelCost > game.funds
          const label = matchupLabel(ourRating, offer.opponentStrength)
          // 実在の学校なら、実際に出てくるスタメンの平均を出す
          const school = offer.opponentSchoolId
            ? game.rivals.find((item) => item.id === offer.opponentSchoolId)
            : undefined
          const rating = school
            ? lineupRatingOf(school, game.year, game.month)
            : opponentRating(offer.opponentStrength)

          return (
            <button
              key={offer.id}
              type="button"
              className={styles.offer}
              disabled={tooExpensive}
              onClick={() => choose(offer.id)}
            >
              <span className={styles.offerTop}>
                <span className={styles.name}>{offer.opponentName}</span>
                <span className={styles.rating}>{ratingLabel(rating)}</span>
                <span className={`${styles.matchup} ${matchupClass(label)}`}>{label}</span>
              </span>
              <span className={styles.offerBottom}>
                <span className={styles.place}>{offer.regionName}</span>
                {offer.travelCost === 0 ? (
                  <span className={styles.free}>県内・遠征費なし</span>
                ) : (
                  <span className={tooExpensive ? styles.unaffordable : styles.cost}>
                    遠征費 {formatFunds(offer.travelCost)}
                    {tooExpensive && '（足りません）'}
                  </span>
                )}
              </span>
            </button>
          )
        })}

        <button type="button" className={styles.decline} onClick={() => choose(null)}>
          試合を行わない
        </button>

        <p className={styles.note}>
          遠征すると相手が強くなり、学校の知名度（評判）も少し上がります。
        </p>
      </div>
    </div>
  )
}

/** 格上・格下で色を変える。数字が無くても強さの差が読めるように */
function matchupClass(label: string): string {
  if (label.includes('格上')) return styles.tough
  if (label.includes('格下')) return styles.easy
  return styles.even
}
