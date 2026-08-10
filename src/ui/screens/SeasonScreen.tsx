import { useState } from 'react'
import type { CSSProperties } from 'react'
import { overallRating, toRank } from '@/core/player/rating'
import { findSkill } from '@/core/skill/skillDefs'
import type { Player } from '@/core/types/player'
import { PLAYER_ORIGIN_LABELS } from '@/core/types/player'
import { CAREER_PATH_LABELS } from '@/core/types/career'
import type { GraduateRecord } from '@/core/types/season'
import {
  handSizeFor,
  reputationDisplay,
  reputationGrade,
  REPUTATION_GRADE_LABELS,
} from '@/core/types/season'
import { DEFAULT_UNIFORM, UNIFORMS, uniformName } from '@/core/team/uniforms'
import type { UniformId } from '@/core/team/uniforms'
import { findRegion, REGIONS } from '@/core/types/region'
import type { RegionId } from '@/core/types/region'
import { useGameStore } from '@/state/useGameStore'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
import { rankColorOf, teamCapColor } from '@/ui/theme/playerColors'
import { findManagerRole, managerEffectText } from '@/core/staff/managers'
import type { TeamManager } from '@/core/staff/managers'
import styles from './SeasonScreen.module.css'

/**
 * 世代交代の報告画面。
 * 3年生を送り出し、新入生を迎える節目を見せる。
 */
export function SeasonScreen() {
  const game = useGameStore((s) => s.game)
  const finishSeason = useGameStore((s) => s.finishSeason)

  const report = game?.pendingSeason ?? null

  // 学校の設定は年度の切り替わりでだけ変えられる。
  // 触るまでは現在値のまま持ち、そのときだけ送る
  const [editing, setEditing] = useState(false)
  const [schoolName, setSchoolName] = useState(game?.schoolName ?? '')
  const [uniform, setUniform] = useState<UniformId>(game?.uniform ?? DEFAULT_UNIFORM)
  const [regionId, setRegionId] = useState(game?.regionId ?? '')

  if (!game || !report) return null

  const grade = reputationGrade(game.reputation)
  // 帽子とユニフォームはチームで共通
  const capColor = teamCapColor(game.uniform)
  const recommended = new Set(report.recommendedIds)

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.year}>{report.year}年目 春</h1>
        <p className={styles.subtitle}>新しい年度が始まります</p>
      </header>

      <div className={styles.body}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>卒業生</h2>
          {report.graduates.length === 0 ? (
            <p className={styles.empty}>今年の卒業生はいません</p>
          ) : (
            report.graduates.map((graduate) => (
              <GraduateRow key={graduate.id} graduate={graduate} capColor={capColor} />
            ))
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>新入生</h2>
          {report.newcomers.map((player) => (
            <NewcomerRow
              capColor={capColor}
              key={player.id}
              player={player}
              recommended={recommended.has(player.id)}
            />
          ))}
          {/*
            **マネージャーも新入部員。** ログに一行流れるだけでは、
            誰が入ってきたのか・何ができるのかが分からなかった
          */}
          {report.joinedManager && <ManagerRow manager={report.joinedManager} />}
        </section>

        {/*
          会いに行った候補だけを出す。視察した県の全員（10人×県数）を並べると
          読み切れないので、残りは「データ」画面に回す
        */}
        {report.scoutResults.some((result) => result.approached) && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>スカウトの結果</h2>
            {report.scoutResults
              .filter((result) => result.approached)
              .map((result) => (
                <p
                  key={result.name}
                  className={result.joined ? `${styles.news} ${styles.newsGood}` : styles.news}
                >
                  {result.joined
                    ? `${result.name}が入部を決めた！${result.skillName ? `（${result.skillName}）` : ''}`
                    : `${result.name}は${result.schoolName}（${result.regionName}）へ進んだ`}
                </p>
              ))}
          </section>
        )}

        {report.rivalNews.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>県内の動き</h2>
            {report.rivalNews.map((news) => (
              <p key={news} className={styles.news}>
                {news}
              </p>
            ))}
          </section>
        )}

        {report.careerNews.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>OBのその後</h2>
            {report.careerNews.map((news) => (
              <p key={news} className={styles.news}>
                {news}
              </p>
            ))}
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>学校の評判</h2>
          <div className={styles.reputation}>
            <span className={styles.stars}>{grade}</span>
            <span>
              {REPUTATION_GRADE_LABELS[grade]}（{reputationDisplay(game.reputation)}）
            </span>
          </div>
          <p className={styles.reputationNote}>
            試合に勝つと上がります。評判が高いほど良い新入生が多く入部し、
            手札の枚数も増えます（現在{handSizeFor(game.reputation)}枚）。
          </p>
        </section>

        {/*
          年度の切り替わりは、学校そのものを変えられる唯一の場面。
          何も触らなければ変更なしで進む
        */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>学校の設定</h2>
          {editing ? (
            <TeamEditor
              schoolName={schoolName}
              uniform={uniform}
              regionId={regionId}
              onSchoolName={setSchoolName}
              onUniform={setUniform}
              onRegionId={setRegionId}
            />
          ) : (
            <>
              <p className={styles.reputationNote}>
                {game.schoolName} / ユニフォーム{uniformName(game.uniform)} /{' '}
                {findRegion(game.regionId).name}
              </p>
              <button
                type="button"
                className={styles.editButton}
                onClick={() => setEditing(true)}
              >
                校名・ユニフォーム・所在地を変える
              </button>
            </>
          )}
        </section>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.startButton}
          onClick={() =>
            finishSeason(
              editing
                ? { schoolName, uniform, regionId }
                : // 触っていなければ何も渡さない＝変更なし
                  {},
            )
          }
        >
          新年度を始める ▶
        </button>
      </div>
    </div>
  )
}

function GraduateRow({ graduate, capColor }: { graduate: GraduateRecord; capColor: string }) {
  const rank = toRank(graduate.rating)

  return (
    <div className={styles.graduate}>
      <PlayerPortrait playerId={graduate.id} size={34} cap capColor={capColor} />
      <span>
        <span className={styles.name}>{graduate.name}</span>
        <span className={styles.sub}>
          {graduate.position} / 総合{graduate.rating} / {CAREER_PATH_LABELS[graduate.path]}
          {graduate.team && `（${graduate.team}）`}
        </span>
        {graduate.skills.length > 0 && (
          <span className={styles.skills}>
            {graduate.skills.map((id) => {
              const skill = findSkill(id)
              if (!skill) return null
              return (
                <span key={id} className={`${styles.skillChip} ${styles[skill.rank]}`}>
                  {skill.name}
                </span>
              )
            })}
          </span>
        )}
      </span>
      <span className={styles.rank} style={{ '--rank-color': rankColorOf(rank) } as CSSProperties}>
        {rank}
      </span>
    </div>
  )
}

function NewcomerRow({
  player,
  recommended,
  capColor,
}: {
  player: Player
  recommended: boolean
  capColor: string
}) {
  const rating = overallRating(player)
  const rank = toRank(rating)

  // 入部の経路（推薦・留学生）が分かるようにする。
  // 留学生は名前だけでも分かるが、他の一覧と表記を揃えておく
  const badge = player.origin ? PLAYER_ORIGIN_LABELS[player.origin] : recommended ? '推薦' : null

  return (
    <div className={badge ? `${styles.newcomer} ${styles.recommended}` : styles.newcomer}>
      <PlayerPortrait playerId={player.id} size={34} cap capColor={capColor} />
      <span>
        <span className={styles.name}>
          {player.name}
          {badge && <span className={styles.recommendBadge}>{badge}</span>}
        </span>
        <span className={styles.sub}>
          {player.position} / 総合{rating}
        </span>
      </span>
      <span className={styles.rank} style={{ '--rank-color': rankColorOf(rank) } as CSSProperties}>
        {rank}
      </span>
    </div>
  )
}

/**
 * 学校の設定を変える。
 *
 * 年度の切り替わりでだけ触れる。**所在地を変えると大会の回戦数と遠征費が変わる**ので、
 * その場で分かるように参加校数を添える。
 */
function TeamEditor({
  schoolName,
  uniform,
  regionId,
  onSchoolName,
  onUniform,
  onRegionId,
}: {
  schoolName: string
  uniform: UniformId
  regionId: RegionId
  onSchoolName: (value: string) => void
  onUniform: (value: UniformId) => void
  onRegionId: (value: RegionId) => void
}) {
  return (
    <div className={styles.editor}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>学校名</span>
        <input
          className={styles.input}
          value={schoolName}
          maxLength={16}
          onChange={(event) => onSchoolName(event.target.value)}
        />
      </label>

      <span className={styles.fieldLabel}>ユニフォーム</span>
      <div className={styles.uniforms}>
        {UNIFORMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              item.id === uniform ? `${styles.uniform} ${styles.uniformActive}` : styles.uniform
            }
            onClick={() => onUniform(item.id)}
          >
            <span
              className={styles.swatch}
              style={{ background: `var(--team-${item.id}-cap)` }}
            />
            {item.name}
          </button>
        ))}
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>所在地</span>
        <select
          className={styles.select}
          value={regionId}
          onChange={(event) => onRegionId(event.target.value)}
        >
          {REGIONS.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}（{region.schools}校）
            </option>
          ))}
        </select>
      </label>

      <p className={styles.editorNote}>
        所在地を変えると、大会の回戦数・遠征費・県内のライバル校が入れ替わります。
        甲子園で当たってきた学校との戦績は残ります。
      </p>
    </div>
  )
}

/** 入部したマネージャー。役割と、その人の効き具合を出す */
function ManagerRow({ manager }: { manager: TeamManager }) {
  const role = findManagerRole(manager.roleId)
  const ability = manager.ability ?? 50

  return (
    <div className={styles.manager}>
      <span className={styles.managerBadge}>マネージャー</span>
      <span className={styles.managerWho}>
        <span className={styles.managerName}>{manager.name}</span>
        <span className={styles.managerEffect}>{managerEffectText(manager)}</span>
      </span>
      <span className={styles.managerRole}>{role?.label ?? 'マネージャー'}</span>
      <span className={styles.managerRank} style={{ color: rankColorOf(toRank(ability)) }}>
        {toRank(ability)}
      </span>
    </div>
  )
}
