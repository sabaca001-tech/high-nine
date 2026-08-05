import { overallRating } from '@/core/player/rating'
import { firstSquadSet } from '@/core/player/squad'
import type { Player } from '@/core/types/player'
import type { UniformId } from '@/core/team/uniforms'
import { isInHallOfFame } from '@/core/types/career'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { PlayerCard } from '@/ui/components/PlayerCard'
import styles from './PlayerListScreen.module.css'

export function PlayerListScreen() {
  const game = useGameStore((s) => s.game)
  const showPlayer = useGameStore((s) => s.showPlayer)
  const setScreen = useGameStore((s) => s.setScreen)

  if (!game) return null

  // ベンチ入りとベンチ外を分けて見せる
  const firstSquad = firstSquadSet(game.squad)
  const sorted = [...game.players].sort((a, b) => overallRating(b) - overallRating(a))
  const first = sorted.filter((player) => firstSquad.has(player.id))
  const second = sorted.filter((player) => !firstSquad.has(player.id))

  return (
    <AppLayout title="部員一覧" subtitle={`${game.players.length}人`} scrollable>
      <div className={styles.links}>
        <button type="button" className={styles.alumniLink} onClick={() => setScreen('alumni')}>
          OB名鑑（プロ入り {game.graduates.filter(isInHallOfFame).length}人） ▶
        </button>
        <button type="button" className={styles.alumniLink} onClick={() => setScreen('records')}>
          歴代記録 ▶
        </button>
      </div>

      <Section
        title="ベンチ入り"
        badgeClass={styles.grade3}
        players={first}
        uniform={game.uniform}
        onSelect={showPlayer}
        note="練習の効果をそのまま受ける"
      />
      {second.length > 0 && (
        <Section
          title="ベンチ外"
          badgeClass={styles.grade1}
          players={second}
          uniform={game.uniform}
          onSelect={showPlayer}
          note="指導が行き届かず、練習の伸びは75%"
        />
      )}
    </AppLayout>
  )
}

function Section({
  title,
  badgeClass,
  players,
  uniform,
  onSelect,
  note,
}: {
  title: string
  badgeClass: string
  players: Player[]
  uniform: UniformId
  onSelect: (id: string) => void
  note: string
}) {
  return (
    <section>
      <h2 className={styles.gradeHeading}>
        <span className={`${styles.gradeBadge} ${badgeClass}`}>{title}</span>
        <span className={styles.rule} />
        <span>{players.length}人</span>
      </h2>
      <p className={styles.sectionNote}>{note}</p>
      {/* 2列のカードにして、適性図と能力レーダーを一覧のまま読めるようにする */}
      <div className={styles.grid}>
        {players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            uniform={uniform}
            onClick={() => onSelect(player.id)}
          />
        ))}
      </div>
    </section>
  )
}
