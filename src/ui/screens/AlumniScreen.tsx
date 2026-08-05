import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Alumnus, CareerStatus } from '@/core/types/career'
import { CAREER_STATUS_LABELS, careerTotals, isInHallOfFame } from '@/core/types/career'
import { AbilityChart } from '@/ui/components/AbilityChart'
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

type Filter = 'all' | 'active'

/**
 * OB名鑑。
 *
 * **プロに届いた選手だけを載せる。** 卒業生を全員並べていた頃は、
 * 高校で競技を終えた選手で埋まって「うちからプロが出た」が埋もれていた。
 * 大学経由の選手は、在学中はここに出ず、指名された年に現れる。
 * 進路の途中経過は「データ → 進路」で追える。
 */
export function AlumniScreen() {
  const game = useGameStore((s) => s.game)
  const setScreen = useGameStore((s) => s.setScreen)
  // 帽子はチームで共通（OBも在学時と同じ色）
  const capColor = teamCapColor(game?.uniform ?? DEFAULT_UNIFORM)
  const [filter, setFilter] = useState<Filter>('all')

  if (!game) return null

  const pros = game.graduates.filter(isInHallOfFame)
  const visible = pros.filter((alumnus) =>
    filter === 'active' ? alumnus.status === 'pro' || alumnus.status === 'mlb' : true,
  )

  return (
    <AppLayout title="OB名鑑" subtitle={`プロ入り ${pros.length}人`} scrollable>
      <button type="button" className={styles.back} onClick={() => setScreen('players')}>
        ← 部員一覧へ
      </button>

      <div className={styles.filters}>
        {(
          [
            ['all', 'すべて'],
            ['active', '現役'],
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
        <p className={styles.empty}>
          {pros.length === 0
            ? 'まだプロ入りしたOBはいません。ここに載るのはプロへ進んだ選手だけです（大学経由の指名も含みます）'
            : '該当するOBはいません'}
        </p>
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
            {alumnus.year}年目卒 / {alumnus.position} / 高校時 {alumnus.rating} → プロ{' '}
            {alumnus.ability}
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

          {open && (
            <>
              <AbilityChart
                title="実力の推移（プロ基準）"
                points={alumnus.proSeasons.map((season) => ({
                  label: `${season.year}年目`,
                  value: season.ability,
                }))}
                max={PRO_ABILITY_MAX}
              />
              <SeasonTable alumnus={alumnus} />
            </>
          )}
        </>
      )}
    </div>
  )
}

/**
 * 能力グラフの縦軸。
 * プロ入りで能力は高校基準からおよそ半分に置き換わるので、
 * 100 のままだと折れ線が下半分に張り付いて読めない。
 */
const PRO_ABILITY_MAX = 70

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
