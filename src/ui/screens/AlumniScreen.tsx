import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Alumnus, CareerStatus, ProSeason } from '@/core/types/career'
import { ageAt, CAREER_STATUS_LABELS, careerTotals, isInHallOfFame } from '@/core/types/career'
import { ABILITY_LABELS } from '@/core/types/player'
import type { AbilitySnapshot } from '@/core/types/player'
import { proVelocityRank, toRank, velocityRank } from '@/core/player/rating'
import { AbilityChart } from '@/ui/components/AbilityChart'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
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
        visible.map((alumnus) => <AlumnusCard key={alumnus.id} alumnus={alumnus} />)
      )}
    </AppLayout>
  )
}

function AlumnusCard({ alumnus }: { alumnus: Alumnus }) {
  const [open, setOpen] = useState(false)
  const totals = careerTotals(alumnus)
  const hasStats = alumnus.proSeasons.length > 0

  return (
    <div
      className={styles.card}
      style={{ '--status-color': STATUS_COLOR[alumnus.status] } as CSSProperties}
    >
      {/*
        **1行に詰め込まない。** 卒業年・守備位置・実力・所属を1文に並べていたので、
        375pxでは球団名が「横浜マリ／ンスターズ」のように途中で改行していた。
        数値の行と所属の行に分け、どちらも折り返さない。
      */}
      <div className={styles.head}>
        <PlayerPortrait playerId={alumnus.id} size={38} cap />
        <span className={styles.who}>
          <span className={styles.name}>{alumnus.name}</span>
          <span className={styles.sub}>
            {alumnus.year}年目卒 / {alumnus.position} / 高校{alumnus.rating} → プロ
            {alumnus.ability}
          </span>
          {alumnus.team && <span className={styles.team}>{alumnus.team}</span>}
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

          <TitleList seasons={alumnus.proSeasons} />

          <button type="button" className={styles.toggle} onClick={() => setOpen(!open)}>
            {open ? '詳しい成績を閉じる' : '詳しい成績を見る'}
          </button>

          {open && (
            <>
              <CareerTimeline alumnus={alumnus} />
              <FinalAbilities alumnus={alumnus} />
              <AbilityChart
                title="実力の推移（プロ基準）"
                points={alumnus.proSeasons.map((season) => ({
                  // **年度ではなく年齢で並べる。** 「3年目に24本」より
                  // 「23歳で24本」のほうが、早咲きか遅咲きかが読める
                  label: `${ageAt(alumnus.year, season.year)}歳`,
                  value: season.ability,
                }))}
                max={PRO_ABILITY_MAX}
              />
              <SeasonTable alumnus={alumnus} />
            </>
          )}
        </>
      )}

      {/* プロの成績がまだ無くても、経歴と卒業時の能力は見せる */}
      {!hasStats && (
        <>
          <CareerTimeline alumnus={alumnus} />
          <FinalAbilities alumnus={alumnus} />
        </>
      )}
    </div>
  )
}

/**
 * 経歴。**所属が変わった出来事だけ**を年表にする。
 * 大学経由なのか、移籍したのか、海外へ出たのかが数字からは読めなかった。
 */
function CareerTimeline({ alumnus }: { alumnus: Alumnus }) {
  const log = alumnus.careerLog ?? []
  if (log.length === 0) return null

  return (
    <div className={styles.timeline}>
      <h3 className={styles.blockTitle}>経歴</h3>
      {log.map((entry, index) => (
        <div key={`${entry.year}-${index}`} className={styles.timelineRow}>
          <span className={styles.timelineAge}>{entry.age}歳</span>
          <span
            className={styles.timelineDot}
            style={{ background: STATUS_COLOR[entry.status] }}
            aria-hidden
          />
          <span className={styles.timelineText}>{entry.text}</span>
        </div>
      ))}
    </div>
  )
}

/** 卒業時の各能力。総合だけでは何が武器だったのかが分からない */
function FinalAbilities({ alumnus }: { alumnus: Alumnus }) {
  const abilities = alumnus.finalAbilities
  if (!abilities) return null

  const keys: (keyof AbilitySnapshot)[] = alumnus.isPitcher
    ? ['velocity', 'control', 'stamina', 'sharpness', 'life', 'fielding']
    : ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']

  return (
    <div className={styles.finals}>
      <h3 className={styles.blockTitle}>卒業時の能力</h3>
      <div className={styles.finalGrid}>
        {keys.map((key) => {
          const value = abilities[key]
          if (typeof value !== 'number') return null
          return (
            <span key={key} className={styles.final}>
              <span className={styles.finalLabel}>{ABILITY_LABELS[key as 'meet']}</span>
              <span className={styles.finalValue}>
                {/*
                  **球速はプロに入っても落ちない。** 変わるのは比べる相手のほうで、
                  150km/h は高校生なら一級品でも、プロでは普通。
                  プロ入りした選手だけプロの物差しでランクを付ける
                */}
                {key === 'velocity'
                  ? `${value} ${isInHallOfFame(alumnus) ? proVelocityRank(value) : velocityRank(value)}`
                  : toRank(value)}
              </span>
            </span>
          )
        })}
      </div>
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
            <th>歳</th>
            <th>球団</th>
            <th>登板</th>
            <th>回</th>
            <th>勝</th>
            <th>敗</th>
            <th>S</th>
            <th>奪三</th>
            <th>防御率</th>
          </tr>
        ) : (
          <tr>
            <th>歳</th>
            <th>球団</th>
            <th>試合</th>
            <th>打数</th>
            <th>安打</th>
            <th>二</th>
            <th>本</th>
            <th>点</th>
            <th>盗</th>
            <th>四球</th>
            <th>打率</th>
          </tr>
        )}
      </thead>
      <tbody>
        {alumnus.proSeasons.map((season) => (
          <tr key={season.year} className={season.overseas ? styles.overseas : undefined}>
            <td>
              {ageAt(alumnus.year, season.year)}
              {/* タイトルを獲った年が一目で分かるようにする */}
              {season.titles.length > 0 && <span className={styles.titleMark}>★</span>}
            </td>
            <td>{season.team}</td>
            <td>{season.games}</td>
            {season.pitching ? (
              <>
                <td>{season.pitching.innings}</td>
                <td>{season.pitching.wins}</td>
                <td>{season.pitching.losses}</td>
                <td>{season.pitching.saves}</td>
                <td>{season.pitching.strikeouts}</td>
                <td>{season.pitching.era.toFixed(2)}</td>
              </>
            ) : season.batting ? (
              <>
                <td>{season.batting.atBats}</td>
                <td>{season.batting.hits}</td>
                <td>{season.batting.doubles}</td>
                <td>{season.batting.homeruns}</td>
                <td>{season.batting.rbi}</td>
                <td>{season.batting.steals}</td>
                <td>{season.batting.walks}</td>
                <td>{formatAverage(season.batting.average)}</td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * 獲得タイトル。**同じタイトルは回数でまとめる。**
 * 「首位打者3回」のように読めないと、通算の重みが伝わらない。
 */
function TitleList({ seasons }: { seasons: ProSeason[] }) {
  const counts = new Map<string, number>()
  for (const season of seasons) {
    for (const title of season.titles) counts.set(title, (counts.get(title) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  return (
    <div className={styles.titles}>
      {[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([title, count]) => (
          <span key={title} className={styles.title}>
            {title}
            {count > 1 && <span className={styles.titleCount}>×{count}</span>}
          </span>
        ))}
    </div>
  )
}

/** 打率は .285 のように表示する */
function formatAverage(value: number): string {
  return value.toFixed(3).replace(/^0/, '')
}
