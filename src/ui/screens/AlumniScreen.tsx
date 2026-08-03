import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Alumnus, CareerStatus } from '@/core/types/career'
import { CAREER_STATUS_LABELS, careerTotals } from '@/core/types/career'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
import { teamCapColor } from '@/ui/theme/playerColors'
import { DEFAULT_UNIFORM } from '@/core/team/uniforms'
import styles from './AlumniScreen.module.css'

/** 状態ごとの色 */
const STATUS_COLOR: Record<CareerStatus, string> = {
  mlb: 'var(--rank-s)',
  pro: 'var(--accent)',
  college: 'var(--rank-d)',
  corporate: 'var(--good)',
  released: 'var(--bad)',
  retired: 'var(--text-dim)',
}

type Filter = 'all' | 'active' | 'pro'

/**
 * OB名鑑。
 * 卒業生のその後（プロ・大学・社会人）を追える。
 */
export function AlumniScreen() {
  const game = useGameStore((s) => s.game)
  const setScreen = useGameStore((s) => s.setScreen)
  // 帽子はチームで共通（OBも在学時と同じ色）
  const capColor = teamCapColor(game?.uniform ?? DEFAULT_UNIFORM)
  const [filter, setFilter] = useState<Filter>('all')

  if (!game) return null

  const visible = game.graduates.filter((alumnus) => {
    if (filter === 'pro') return alumnus.proSeasons.length > 0
    if (filter === 'active') {
      return alumnus.status !== 'retired' && alumnus.status !== 'released'
    }
    return true
  })

  return (
    <AppLayout title="OB名鑑" subtitle={`${game.graduates.length}人`} scrollable>
      <button type="button" className={styles.back} onClick={() => setScreen('players')}>
        ← 部員一覧へ
      </button>

      <div className={styles.filters}>
        {(
          [
            ['all', 'すべて'],
            ['active', '現役'],
            ['pro', 'プロ経験'],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? `${styles.filter} ${styles.filterActive}` : styles.filter}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>該当する卒業生はいません</p>
      ) : (
        visible.map((alumnus) => <AlumnusCard capColor={capColor} key={alumnus.id} alumnus={alumnus} />)
      )}
    </AppLayout>
  )
}

function AlumnusCard({ alumnus, capColor }: { alumnus: Alumnus; capColor: string }) {
  const [open, setOpen] = useState(false)
  const totals = careerTotals(alumnus)
  const hasStats = alumnus.proSeasons.length > 0

  return (
    <div
      className={styles.card}
      style={{ '--status-color': STATUS_COLOR[alumnus.status] } as CSSProperties}
    >
      <div className={styles.head}>
        <PlayerPortrait playerId={alumnus.id} size={38} cap capColor={capColor} />
        <span>
          <span className={styles.name}>{alumnus.name}</span>
          <span className={styles.sub}>
            {alumnus.year}年目卒 / {alumnus.position} / 卒業時 総合{alumnus.rating}
            {alumnus.team && ` / ${alumnus.team}`}
          </span>
        </span>
        <span className={styles.status}>{CAREER_STATUS_LABELS[alumnus.status]}</span>
      </div>

      {alumnus.note && <p className={styles.note}>{alumnus.note}</p>}

      {hasStats && (
        <>
          <div className={styles.totals}>
            <Stat label="通算" value={`${totals.years}年`} />
            <Stat label="試合" value={`${totals.games}`} />
            {alumnus.isPitcher ? (
              <>
                <Stat label="勝敗" value={`${totals.wins}勝${totals.losses}敗`} />
                <Stat label="奪三振" value={`${totals.strikeouts}`} />
                <Stat label="防御率" value={totals.era.toFixed(2)} />
              </>
            ) : (
              <>
                <Stat label="安打" value={`${totals.hits}`} />
                <Stat label="本塁打" value={`${totals.homeruns}`} />
                <Stat label="打点" value={`${totals.rbi}`} />
                <Stat label="打率" value={formatAverage(totals.average)} />
              </>
            )}
          </div>

          <button type="button" className={styles.toggle} onClick={() => setOpen(!open)}>
            {open ? '年度別成績を閉じる' : '年度別成績を見る'}
          </button>

          {open && <SeasonTable alumnus={alumnus} />}
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </span>
  )
}

function SeasonTable({ alumnus }: { alumnus: Alumnus }) {
  return (
    <table className={styles.seasonTable}>
      <thead>
        {alumnus.isPitcher ? (
          <tr>
            <th>年</th>
            <th>球団</th>
            <th>登板</th>
            <th>勝</th>
            <th>敗</th>
            <th>奪三振</th>
            <th>防御率</th>
          </tr>
        ) : (
          <tr>
            <th>年</th>
            <th>球団</th>
            <th>試合</th>
            <th>打数</th>
            <th>安打</th>
            <th>本</th>
            <th>点</th>
            <th>打率</th>
          </tr>
        )}
      </thead>
      <tbody>
        {alumnus.proSeasons.map((season) => (
          <tr key={season.year} className={season.overseas ? styles.overseas : undefined}>
            <td>{season.year}</td>
            <td>{season.team}</td>
            <td>{season.games}</td>
            {season.pitching ? (
              <>
                <td>{season.pitching.wins}</td>
                <td>{season.pitching.losses}</td>
                <td>{season.pitching.strikeouts}</td>
                <td>{season.pitching.era.toFixed(2)}</td>
              </>
            ) : season.batting ? (
              <>
                <td>{season.batting.atBats}</td>
                <td>{season.batting.hits}</td>
                <td>{season.batting.homeruns}</td>
                <td>{season.batting.rbi}</td>
                <td>{formatAverage(season.batting.average)}</td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 打率は .285 のように表示する */
function formatAverage(value: number): string {
  return value.toFixed(3).replace(/^0/, '')
}
