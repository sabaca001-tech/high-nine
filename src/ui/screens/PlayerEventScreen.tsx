import { eventText, findPlayerEvent } from '@/core/event/playerEvents'
import { formatFunds } from '@/core/shop/funds'
import { playerPoints, pointsRank } from '@/core/player/rating'
import { POSITION_LABELS } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
import { playSound } from '@/ui/sound/sound'
import styles from './PlayerEventScreen.module.css'

/**
 * イベントマスの選択画面。
 *
 * **部員1人の名前と顔を大きく出す。** 盤面を進むだけでは
 * 誰が何をしているのか分からないまま1年が過ぎてしまうので、
 * ここでは進行を止めて、その選手だけを見せる。
 *
 * 選択肢には「何が起きそうか」しか書かない。
 * 結果まで書いてしまうと、選ぶ前に答えが出てしまう。
 */
export function PlayerEventScreen() {
  const game = useGameStore((s) => s.game)
  const choosePlayerEventChoice = useGameStore((s) => s.choosePlayerEventChoice)

  if (!game || !game.pendingEvent) return null

  const event = findPlayerEvent(game.pendingEvent.eventId)
  const player = game.players.find((p) => p.id === game.pendingEvent?.playerId)
  if (!event || !player) return null

  const handleChoose = (choiceId: string) => {
    playSound('tap')
    choosePlayerEventChoice(choiceId)
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <span className={styles.badge}>{event.title}</span>
      </header>

      <div className={styles.body}>
        <div className={styles.card}>
          <PlayerPortrait playerId={player.id} size={68} cap exchange={player.origin === 'exchange'} />
          <div className={styles.who}>
            <span className={styles.name}>{player.name}</span>
            <span className={styles.meta}>
              {player.grade}年 / {POSITION_LABELS[player.position]} / 総合{' '}
              {pointsRank(playerPoints(player))}
            </span>
          </div>
        </div>

        <p className={styles.text}>{eventText(event, player.name)}</p>

        <div className={styles.choices}>
          {event.choices.map((choice) => {
            const tooExpensive = choice.cost !== undefined && game.funds < choice.cost

            return (
              <button
                key={choice.id}
                type="button"
                className={styles.choice}
                disabled={tooExpensive}
                onClick={() => handleChoose(choice.id)}
              >
                <span className={styles.label}>{choice.label}</span>
                <span className={styles.hint}>{choice.hint}</span>
                {choice.cost !== undefined && (
                  <span className={tooExpensive ? styles.unaffordable : styles.cost}>
                    部費 {formatFunds(choice.cost)}
                    {tooExpensive && '（足りません）'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
