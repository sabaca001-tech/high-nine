import { playerPoints } from '@/core/player/rating'
import { firstSquadSet } from '@/core/player/squad'
import type { Player } from '@/core/types/player'
import { isInHallOfFame } from '@/core/types/career'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { PlayerCard } from '@/ui/components/PlayerCard'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
import { findManagerRole, managerEffectText } from '@/core/staff/managers'
import type { TeamManager } from '@/core/staff/managers'
import { toRank } from '@/core/player/rating'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './PlayerListScreen.module.css'

export function PlayerListScreen() {
  const game = useGameStore((s) => s.game)
  const showPlayer = useGameStore((s) => s.showPlayer)
  const setScreen = useGameStore((s) => s.setScreen)

  if (!game) return null

  // ベンチ入りとベンチ外を分けて見せる
  const firstSquad = firstSquadSet(game.squad)
  const sorted = [...game.players].sort((a, b) => playerPoints(b) - playerPoints(a))
  const first = sorted.filter((player) => firstSquad.has(player.id))
  const second = sorted.filter((player) => !firstSquad.has(player.id))

  return (
    <AppLayout title="部員一覧" subtitle={`${game.players.length}人`} scrollable>
      <div className={styles.links}>
        {/*
          **折り返させない。** 「OB名鑑（プロ入り 9人） ▶」は
          2列に並べた幅（約180px）に収まらず、「9／人）▶」で改行していた。
          人数は別の要素にして、名前だけを本文に残す。
        */}
        <button type="button" className={styles.alumniLink} onClick={() => setScreen('alumni')}>
          OB名鑑
          <span className={styles.linkCount}>{game.graduates.filter(isInHallOfFame).length}人</span>
          <span className={styles.linkArrow}>▶</span>
        </button>
        <button type="button" className={styles.alumniLink} onClick={() => setScreen('records')}>
          歴代記録
          <span className={styles.linkArrow}>▶</span>
        </button>
        {/*
          **ポジションごとの成長の優先順を並べ替える。**
          おまかせ練習の傾き方が決め打ちで、
          「うちの一塁手は走らせたい」という意図が通らなかった
        */}
        <button
          type="button"
          className={styles.alumniLink}
          onClick={() => setScreen('growthPlan')}
        >
          成長方針
          <span className={styles.linkArrow}>▶</span>
        </button>
      </div>

      <Section
        title="ベンチ入り"
        badgeClass={styles.grade3}
        players={first}
        onSelect={showPlayer}
        note="練習の効果をそのまま受ける"
      />
      {second.length > 0 && (
        <Section
          title="ベンチ外"
          badgeClass={styles.grade1}
          players={second}
          onSelect={showPlayer}
          note="指導が行き届かず、練習の伸びは75%"
        />
      )}

      {/*
        **マネージャーも部員。** 一覧のどこにも出てこないので、
        誰が居て何が効いているのかを確かめる場所が無かった
      */}
      <section>
        <h2 className={styles.gradeHeading}>
          <span className={`${styles.gradeBadge} ${styles.manager}`}>マネージャー</span>
          <span className={styles.rule} />
          <span>{game.managers.length}人</span>
        </h2>
        {game.managers.length === 0 ? (
          <p className={styles.sectionNote}>
            まだ居ません。年度が替わるときに、3年に1人ほどの割合で入部してきます
          </p>
        ) : (
          <div className={styles.managerList}>
            {[...game.managers]
              .sort((a, b) => b.grade - a.grade)
              .map((manager) => (
                <ManagerRow key={manager.id} manager={manager} />
              ))}
          </div>
        )}
      </section>
    </AppLayout>
  )
}

function Section({
  title,
  badgeClass,
  players,
  onSelect,
  note,
}: {
  title: string
  badgeClass: string
  players: Player[]
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
            onClick={() => onSelect(player.id)}
          />
        ))}
      </div>
    </section>
  )
}

/** マネージャー1人。役割と、その人の効き具合を出す */
function ManagerRow({ manager }: { manager: TeamManager }) {
  const role = findManagerRole(manager.roleId)
  const ability = manager.ability ?? 50

  return (
    <div className={styles.managerRow}>
      {/* **マネージャーにも顔を出す。** 部員なのにここだけ名前だけだった */}
      <PlayerPortrait playerId={manager.id} size={34} variant="manager" />
      <span className={styles.managerRank} style={{ color: rankColorOf(toRank(ability)) }}>
        {toRank(ability)}
      </span>
      <span className={styles.managerWho}>
        <span className={styles.managerName}>
          {manager.name}
          <span className={styles.managerGrade}>{manager.grade}年</span>
        </span>
        <span className={styles.managerEffect}>{managerEffectText(manager)}</span>
      </span>
      <span className={styles.managerRole}>{role?.label ?? 'マネージャー'}</span>
    </div>
  )
}
