import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ALL_POSITIONS, defenseScore, isPlayable } from '@/core/lineup/aptitude'
import { TRAJECTORY_MAX } from '@/core/player/growth'
import {
  canPracticePitch,
  PITCH_COST,
  PITCH_PRACTICE_PENALTY,
  TRAJECTORY_COST,
  TRAJECTORY_PRACTICE_PENALTY,
  canConvert,
  CONVERT_MAIN_MAX,
  CONVERT_MAIN_STEPS,
  CONVERT_MAX,
  CONVERT_PRACTICE_PENALTY,
  convertSteps,
  CONVERT_STEPS,
  DEFAULT_FOCUS,
  FOCUS_BONUS,
  FOCUS_PENALTY,
} from '@/core/player/trainingFocus'
import type { TrainingFocus } from '@/core/player/trainingFocus'
import { effectOf } from '@/core/player/personality'
import { FATIGUE_LABELS, fatigueLevel, fatigueOf } from '@/core/player/fatigue'
import { APTITUDE_STRONG, APTITUDE_WEAK } from '@/core/types/player'
import { overallRating, toRank, TRAJECTORY_LABELS, velocityRank } from '@/core/player/rating'
import type { Rank } from '@/core/player/rating'
import { TrajectoryArrow } from '@/ui/components/TrajectoryArrow'
import { findSkill } from '@/core/skill/skillDefs'
import type { Skill, SkillRank } from '@/core/types/skill'
import {
  ABILITY_LABELS,
  MOTIVATION_LABELS,
  POSITION_LABELS,
  snapshotOf,
  velocityGrade,
} from '@/core/types/player'
import type { AbilitySnapshot, GrowableKey, Player } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { AbilityChart } from '@/ui/components/AbilityChart'
import type { ChartPoint } from '@/ui/components/AbilityChart'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
import { PitchChart } from '@/ui/components/PitchChart'
import { plateGradient, rankColorOf } from '@/ui/theme/playerColors'
import {
  average,
  era,
  formatEra,
  formatInnings,
  formatRate,
  hasBatted,
  hasPitched,
  onBase,
  ops,
  strikeoutRate,
} from '@/core/player/careerStats'
import styles from './PlayerDetailScreen.module.css'

type Tab = 'ability' | 'skills' | 'stats' | 'growth' | 'training'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ability', label: '能力' },
  { id: 'skills', label: '特殊能力' },
  { id: 'stats', label: '成績' },
  { id: 'growth', label: '成長' },
  { id: 'training', label: '練習' },
]

const SKILL_RANK_LABELS: Record<SkillRank, string> = {
  gold: '金特（強力）',
  blue: '青特（有利）',
  red: '赤特（不利）',
}

export function PlayerDetailScreen() {
  const game = useGameStore((s) => s.game)
  const selectedPlayerId = useGameStore((s) => s.selectedPlayerId)
  const setScreen = useGameStore((s) => s.setScreen)
  // 開いた場所へ返す。部員一覧から開いたら一覧へ、スタメンから開いたらスタメンへ
  const returnTo = useGameStore((s) => s.playerReturnTo)
  const [tab, setTab] = useState<Tab>('ability')

  const player = game?.players.find((p) => p.id === selectedPlayerId)
  if (!game || !player) return null

  const rating = overallRating(player)
  const rank = toRank(rating)

  const profileStyle = {
    // ヘッダーの色はポジション系統から取る（帽子はチーム共通なので区別にならない）
    '--profile-accent': plateGradient(player),
    '--rank-color': rankColorOf(rank),
  } as CSSProperties

  return (
    <AppLayout title="選手データ" scrollable>
      <button type="button" className={styles.back} onClick={() => setScreen(returnTo)}>
        ← {returnTo === 'lineup' ? 'スタメンへ' : '部員一覧へ'}
      </button>

      <div className={styles.profile} style={profileStyle}>
        <span className={styles.sprite}>
          <PlayerPortrait playerId={player.id} size={68} cap exchange={player.origin === 'exchange'} />
        </span>
        <div className={styles.nameBlock}>
          <div className={styles.badges}>
            <span className={`${styles.badge} ${styles.positionBadge}`}>{player.grade}年</span>
            <span
              className={
                player.isPitcher
                  ? `${styles.badge} ${styles.pitcherBadge}`
                  : `${styles.badge} ${styles.positionBadge}`
              }
            >
              {POSITION_LABELS[player.position]}
            </span>
            {player.injuryMonths > 0 && (
              <span className={styles.badge}>離脱{player.injuryMonths}ヶ月</span>
            )}
          </div>
          <p className={styles.name}>{player.name}</p>
          {/*
            **性格名と説明を切り離す。** 1つの文にしていたので
            「天才肌 — 素質が」で折り返し、性格名の途中で行が変わっていた。
          */}
          <p className={styles.meta}>
            <span className={styles.personality}>{player.personality}</span>
            <span className={styles.personalityNote}>
              {effectOf(player.personality).summary}
            </span>
          </p>
          {/*
            伸びやすい能力は選手ごとに違う。ここが見えないと
            「なぜこの選手だけ伸びないのか」が分からない。
            得意と苦手は**それぞれを1つの塊**にして、間でだけ折り返させる
          */}
          <p className={styles.meta}>
            {strongKeys(player).length > 0 && (
              <span className={styles.aptitude}>
                得意 <span className={styles.strong}>{labelsOf(strongKeys(player))}</span>
              </span>
            )}
            {weakKeys(player).length > 0 && (
              <span className={styles.aptitude}>
                苦手 <span className={styles.weak}>{labelsOf(weakKeys(player))}</span>
              </span>
            )}
          </p>
        </div>
        <div className={styles.overall}>
          <div className={styles.overallRank}>{rank}</div>
          <div className={styles.overallLabel}>総合{rating}</div>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'ability' && <AbilityTab player={player} />}
      {tab === 'skills' && <SkillTab player={player} />}
      {tab === 'stats' && <StatsTab player={player} />}
      {tab === 'growth' && <GrowthTab player={player} year={game.year} month={game.month} />}
      {tab === 'training' && <TrainingTab player={player} />}
    </AppLayout>
  )
}

/** 能力タブ。投手なら投手能力を先に出す */
function AbilityTab({ player }: { player: Player }) {
  const b = player.batting

  return (
    <>
      {player.pitching && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>投手能力</h2>
          {/*
            球速も他の能力と同じ並びで出す。**色とランクを揃える。**
            揃っていなかった頃は、球速だけが常に同じ色で
            「速いのか遅いのか」がここでは読めなかった。
            ゲージは km/h ではなく高校生の物差し（velocityGrade）で伸ばす。
            ランクと同じ物差しにしないと、Aなのにゲージは半分、という見え方になる
          */}
          <AbilityRow
            label={ABILITY_LABELS.velocity}
            value={velocityGrade(player.pitching.velocity)}
            display={`${player.pitching.velocity} km/h`}
            rank={velocityRank(player.pitching.velocity)}
          />
          <AbilityRow label={ABILITY_LABELS.control} value={player.pitching.control} />
          <AbilityRow label={ABILITY_LABELS.stamina} value={player.pitching.stamina} />
          {/* ノビは速球の、キレは変化球の強さ */}
          <AbilityRow label={ABILITY_LABELS.life} value={player.pitching.life} />
          <AbilityRow label={ABILITY_LABELS.sharpness} value={player.pitching.sharpness} />

          <h3 className={styles.subTitle}>持ち球</h3>
          <PitchChart pitches={player.pitching.pitches} />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>野手能力</h2>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>{ABILITY_LABELS.trajectory}</span>
          <span className={styles.trajectory}>
            <TrajectoryArrow trajectory={b.trajectory} size={22} />
            <span className={styles.trajectoryName}>{TRAJECTORY_LABELS[b.trajectory]}</span>
          </span>
        </div>
        <AbilityRow label={ABILITY_LABELS.meet} value={b.meet} />
        <AbilityRow label={ABILITY_LABELS.power} value={b.power} />
        <AbilityRow label={ABILITY_LABELS.speed} value={b.speed} />
        {/* 投手の肩力は球速に連動するので、独立して育てられないことを添える */}
        <AbilityRow
          label={ABILITY_LABELS.arm}
          value={b.arm}
          note={player.pitching ? '球速に連動' : undefined}
        />
        <AbilityRow label={ABILITY_LABELS.fielding} value={b.fielding} />
        <AbilityRow label={ABILITY_LABELS.catching} value={b.catching} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>コンディション</h2>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>やる気</span>
          <span>{MOTIVATION_LABELS[player.motivation]}</span>
        </div>
        {player.injuryMonths > 0 && (
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>状態</span>
            <span className={styles.injured}>
              怪我で離脱中（あと{player.injuryMonths}ヶ月）
            </span>
          </div>
        )}
        {/*
          投手の疲労は体力とは別物。連投すると同じスタミナでも早く崩れるので、
          次に投げさせるかどうかの判断材料としてここに出す
        */}
        {player.isPitcher && (
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>肩の状態</span>
            <span className={fatigueOf(player) >= 40 ? styles.injured : undefined}>
              {FATIGUE_LABELS[fatigueLevel(player)]}（{fatigueOf(player)}）
            </span>
          </div>
        )}
        <Gauge label="体力" value={player.condition} variant="condition" />
        <Gauge label="信頼度" value={player.trust} variant="trust" />
      </section>
    </>
  )
}

/** 特殊能力タブ。金・青・赤に分けて、効果の説明つきで並べる */
function SkillTab({ player }: { player: Player }) {
  const skills = player.skills
    .map((id) => findSkill(id))
    .filter((skill): skill is Skill => skill !== undefined)

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>特殊能力</h2>

      {skills.length === 0 ? (
        <p className={styles.empty}>
          まだ習得していません。特訓マス、または「名将の指南書」で習得できます。
        </p>
      ) : (
        (['gold', 'blue', 'red'] as SkillRank[]).map((rank) => {
          const list = skills.filter((skill) => skill.rank === rank)
          if (list.length === 0) return null

          return (
            <div key={rank}>
              <p className={styles.chartNote}>{SKILL_RANK_LABELS[rank]}</p>
              <div className={styles.skillGrid}>
                {list.map((skill) => (
                  <div key={skill.id} className={`${styles.skill} ${styles[skill.rank]}`}>
                    <span className={styles.skillName}>{skill.name}</span>
                    <span className={styles.skillDesc}>{skill.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}

/** 成長タブ。入学時からの推移を項目ごとの折れ線で見せる */
/**
 * 通算成績。
 *
 * 高校3年間で積み上がっていくのを見せるための画面。
 * **率は保存せず、素の数から毎回計算する**（careerStats.ts）。
 */
function StatsTab({ player }: { player: Player }) {
  const { batting, pitching } = player.stats
  const played = hasBatted(player.stats) || hasPitched(player.stats)

  if (!played) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>通算成績</h2>
        <p className={styles.empty}>まだ公式戦・練習試合に出場していません。</p>
      </section>
    )
  }

  return (
    <>
      {player.u18.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>U18日本代表</h2>
          {player.u18.map((cap) => (
            <p key={cap.year} className={styles.u18Row}>
              {cap.year}年目 —{' '}
              {cap.performance >= 70
                ? '主軸として活躍'
                : cap.performance >= 35
                  ? '出場機会を得た'
                  : '世界の壁を経験'}
              （評価{cap.performance}）
            </p>
          ))}
        </section>
      )}

      {hasPitched(player.stats) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>通算投手成績</h2>
          <dl className={styles.statGrid}>
            <StatCell label="登板" value={`${pitching.games}`} />
            <StatCell label="投球回" value={formatInnings(pitching.outs)} />
            <StatCell label="勝敗" value={`${pitching.wins}勝${pitching.losses}敗`} />
            <StatCell label="奪三振" value={`${pitching.strikeouts}`} />
            <StatCell label="防御率" value={formatEra(era(pitching))} wide />
            <StatCell label="奪三振率" value={formatEra(strikeoutRate(pitching))} wide />
          </dl>
        </section>
      )}

      {hasBatted(player.stats) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>通算打撃成績</h2>
          <dl className={styles.statGrid}>
            <StatCell label="試合" value={`${batting.games}`} />
            <StatCell label="打席" value={`${batting.plateAppearances}`} />
            <StatCell label="打率" value={formatRate(average(batting))} />
            <StatCell label="安打" value={`${batting.hits}`} />
            <StatCell label="本塁打" value={`${batting.homeruns}`} />
            <StatCell label="打点" value={`${batting.rbi}`} />
            <StatCell label="盗塁" value={`${batting.steals}`} />
            <StatCell label="出塁率" value={formatRate(onBase(batting))} />
            <StatCell label="OPS" value={formatRate(ops(batting))} />
          </dl>
        </section>
      )}
    </>
  )
}

function StatCell({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? `${styles.statCell} ${styles.statCellWide}` : styles.statCell}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
    </div>
  )
}

function GrowthTab({ player, year, month }: { player: Player; year: number; month: number }) {
  // history は月が変わったときの記録なので、末尾に「いまの値」を足して能力タブと一致させる
  const history = [...player.history, snapshotOf(player, year, month)]

  const pointsOf = (get: (snapshot: AbilitySnapshot) => number | undefined): ChartPoint[] =>
    history
      .map((snapshot) => ({
        label: `${snapshot.year}年目 ${snapshot.month}月`,
        value: get(snapshot) ?? 0,
      }))
      .filter((point) => point.value > 0)

  if (history.length <= 1) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>入学からの推移</h2>
        <p className={styles.empty}>まだ記録がありません。月が変わると1件ずつ記録されます。</p>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>入学からの推移</h2>
      <p className={styles.chartNote}>
        グラフに触れるとその時点の値が出ます。縦軸は能力値1〜100で共通です。
      </p>

      {player.pitching && (
        <>
          <AbilityChart
            title={ABILITY_LABELS.velocity}
            points={pointsOf((s) => s.velocity)}
            min={110}
            max={155}
            unit="km/h"
          />
          <AbilityChart title={ABILITY_LABELS.control} points={pointsOf((s) => s.control)} />
          <AbilityChart title={ABILITY_LABELS.stamina} points={pointsOf((s) => s.stamina)} />
          <AbilityChart title={ABILITY_LABELS.life} points={pointsOf((s) => s.life)} />
          <AbilityChart title={ABILITY_LABELS.sharpness} points={pointsOf((s) => s.sharpness)} />
        </>
      )}

      <AbilityChart title={ABILITY_LABELS.meet} points={pointsOf((s) => s.meet)} />
      <AbilityChart title={ABILITY_LABELS.power} points={pointsOf((s) => s.power)} />
      <AbilityChart title={ABILITY_LABELS.speed} points={pointsOf((s) => s.speed)} />
      <AbilityChart title={ABILITY_LABELS.arm} points={pointsOf((s) => s.arm)} />
      <AbilityChart title={ABILITY_LABELS.fielding} points={pointsOf((s) => s.fielding)} />
      <AbilityChart title={ABILITY_LABELS.catching} points={pointsOf((s) => s.catching)} />
    </section>
  )
}

/** その選手が伸ばせる能力の一覧 */
function growableKeysOf(player: Player): GrowableKey[] {
  const batting: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']
  const pitching = ['control', 'stamina', 'life', 'sharpness'] as GrowableKey[]
  return player.pitching ? [...pitching, ...batting] : batting
}

/**
 * 練習タブ。選手ごとの自主練の内容を決める。
 *
 * 能力を1つ選ぶとその能力が伸びやすくなる代わりに他が鈍る。
 * コンバートもここで指示する（以前は部費で買っていた）。
 */
function TrainingTab({ player }: { player: Player }) {
  const setTrainingFocus = useGameStore((s) => s.setTrainingFocus)
  const focus = player.focus ?? DEFAULT_FOCUS
  const progress = player.convertProgress ?? 0
  // いま指示中のコンバートがあれば、その種類を初期表示にする
  const [mainConvert, setMainConvert] = useState(
    focus.type === 'convert' ? (focus.main ?? false) : false,
  )

  const choose = (next: TrainingFocus) => setTrainingFocus(player.id, next)

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>練習方針</h2>
        <p className={styles.chartNote}>
          いつでも変えられます。ひとつに絞ると、それ以外の伸びは鈍ります。
        </p>

        <button
          type="button"
          className={
            focus.type === 'team' ? `${styles.focusRow} ${styles.focusActive}` : styles.focusRow
          }
          onClick={() => choose({ type: 'team' })}
        >
          <span className={styles.focusName}>チーム練習に合わせる</span>
          <span className={styles.focusDesc}>
            本職（{POSITION_LABELS[player.position]}）で大事な能力ほど伸びる
          </span>
        </button>

        <p className={styles.chartNote}>能力を重点的に伸ばす</p>
        <div className={styles.focusGrid}>
          {growableKeysOf(player).map((key) => {
            const active = focus.type === 'ability' && focus.key === key
            return (
              <button
                key={key}
                type="button"
                className={
                  active ? `${styles.focusChip} ${styles.focusActive}` : styles.focusChip
                }
                onClick={() => choose({ type: 'ability', key })}
              >
                {ABILITY_LABELS[key]}
              </button>
            )
          })}
        </div>
        <p className={styles.chartNote}>
          選んだ能力は{FOCUS_BONUS}倍、それ以外は{FOCUS_PENALTY}倍。
          チームの練習に含まれない能力でも、少しずつ伸びます。
        </p>

        {/*
          **弾道は他の能力と刻みが違う**（1〜4の4段階）ので、
          能力の一覧には混ぜず、専用の行にする。
        */}
        {!player.isPitcher && (
          <>
            <button
              type="button"
              className={
                focus.type === 'trajectory'
                  ? `${styles.focusRow} ${styles.focusActive}`
                  : styles.focusRow
              }
              disabled={player.batting.trajectory >= TRAJECTORY_MAX}
              onClick={() => choose({ type: 'trajectory' })}
            >
              <span className={styles.focusName}>打撃フォームを作り直す（弾道）</span>
              <span className={styles.focusDesc}>
                {player.batting.trajectory >= TRAJECTORY_MAX
                  ? 'すでに弾道は最大'
                  : `溜まりきると弾道が1段上がる。パワーを${TRAJECTORY_COST}上げるのと同じくらいかかる`}
              </span>
            </button>

            {focus.type === 'trajectory' && (
              <p className={styles.chartNote}>
                弾道{player.batting.trajectory} → {player.batting.trajectory + 1}（
                {Math.round(((player.trajectoryProgress ?? 0) / TRAJECTORY_COST) * 100)}%）
                ／ この間、他の能力の伸びは{TRAJECTORY_PRACTICE_PENALTY}倍になります
              </p>
            )}
          </>
        )}

        {/*
          **持ち球は能力値ではない**（何を投げるか）ので、
          弾道と同じく能力の一覧には混ぜず、専用の行に置く。
        */}
        {player.pitching && (
          <>
            <button
              type="button"
              className={
                focus.type === 'pitch'
                  ? `${styles.focusRow} ${styles.focusActive}`
                  : styles.focusRow
              }
              disabled={!canPracticePitch(player)}
              onClick={() => choose({ type: 'pitch' })}
            >
              <span className={styles.focusName}>球種を増やす・磨く</span>
              <span className={styles.focusDesc}>
                {canPracticePitch(player)
                  ? '溜まりきるたびに、新しい球種を覚えるか変化量が1上がる'
                  : 'すべての球種を極めている'}
              </span>
            </button>

            {focus.type === 'pitch' && (
              <p className={styles.chartNote}>
                次の球種まで{Math.round(((player.pitchProgress ?? 0) / PITCH_COST) * 100)}
                %／ この間、他の能力の伸びは{PITCH_PRACTICE_PENALTY}倍になります
              </p>
            )}
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ポジション適性とコンバート</h2>

        {/*
          **サブで守れるようにするのか、本職そのものを移すのかを選ぶ。**
          「守れる位置を増やす」しか無かった頃は、
          遊撃手を一塁へ移したくても本職は遊撃のままだった。
        */}
        <div className={styles.convertMode}>
          {(
            [
              [false, 'サブで守る', `${CONVERT_MAX}まで・${CONVERT_STEPS}回で1段階`],
              [true, '本職を移す', `${CONVERT_MAIN_MAX}まで・${CONVERT_MAIN_STEPS}回で1段階`],
            ] as [boolean, string, string][]
          ).map(([value, label, note]) => (
            <button
              key={label}
              type="button"
              className={
                mainConvert === value
                  ? `${styles.convertMode} ${styles.convertModeButton} ${styles.convertModeActive}`
                  : `${styles.convertMode} ${styles.convertModeButton}`
              }
              onClick={() => setMainConvert(value)}
            >
              <span className={styles.convertModeName}>{label}</span>
              <span className={styles.convertModeNote}>{note}</span>
            </button>
          ))}
        </div>

        <p className={styles.chartNote}>
          {mainConvert
            ? `守らせたい位置をタップすると、本職を移す練習を始めます。適性が${CONVERT_MAIN_MAX}段（本職）に届いた時点でポジションが入れ替わります（投手⇄野手も可）。`
            : `守れるようにしたい位置をタップすると、その練習を始めます。${CONVERT_MAX}段まで伸ばせます（本職の${CONVERT_MAIN_MAX}段には届きません）。数字はその位置で出せる守備力です。`}
        </p>

        <div className={styles.aptitudeGrid}>
          {ALL_POSITIONS.map((position) => {
            const aptitude = player.aptitudes[position]
            // 段数ではなく「その位置で出せる守備力」を出す。
            // 守れない位置（0段）は数字を出さない
            const defense = aptitude > 0 ? Math.round(defenseScore(player, position)) : null
            const convertible = canConvert(player, position, mainConvert)
            const active =
              focus.type === 'convert' &&
              focus.position === position &&
              (focus.main ?? false) === mainConvert

            return (
              <button
                key={position}
                type="button"
                className={
                  active
                    ? `${styles.aptitudeCell} ${styles.aptitudeSelected}`
                    : styles.aptitudeCell
                }
                disabled={!convertible}
                onClick={() =>
                  choose(
                    active
                      ? { type: 'team' }
                      : { type: 'convert', position, ...(mainConvert ? { main: true } : {}) },
                  )
                }
              >
                <span className={styles.aptitudePos}>{position}</span>
                <span
                  className={
                    isPlayable(aptitude)
                      ? `${styles.aptitudeRank} ${styles.aptGood}`
                      : `${styles.aptitudeRank} ${styles.aptBad}`
                  }
                >
                  {defense ?? '—'}
                </span>
              </button>
            )
          })}
        </div>

        {focus.type === 'convert' ? (
          <div className={styles.convertPanel}>
            <p className={styles.convertText}>
              {focus.position}
              {focus.main ? 'へ本職転向中' : 'を練習中'}（あと
              {convertSteps(focus) - progress}回）
              <span className={styles.convertTrack}>
                <span
                  className={styles.convertFill}
                  style={{ width: `${(progress / convertSteps(focus)) * 100}%` }}
                />
              </span>
              <span className={styles.convertCost}>
                この間、通常の練習の伸びは{CONVERT_PRACTICE_PENALTY}倍になります
                {focus.main && focus.position === 'P' && !player.isPitcher && (
                  <>／転向したときに投球能力が決まります（肩の強さで球速が変わります）</>
                )}
              </span>
            </p>
          </div>
        ) : (
          <p className={styles.convertHint}>
            {mainConvert
              ? '本職と同じ位置は選べません'
              : `本職と${CONVERT_MAX}到達済みの位置は選べません`}
          </p>
        )}
      </section>
    </>
  )
}

/** 能力1行。ランク・ゲージ・数値をまとめて出す */
function AbilityRow({
  label,
  value,
  /** 「球速に連動」のような但し書き */
  note,
  display,
  rank: given,
}: {
  label: string
  value: number
  note?: string
  /** 数値の代わりに出す文字（球速の「140 km/h」など） */
  display?: string
  /** value からは決まらないランク（球速）。省略時は value から出す */
  rank?: Rank
}) {
  const rank = given ?? toRank(value)
  const color = rankColorOf(rank)

  return (
    <div className={styles.abilityRow}>
      <span className={styles.abilityLabel}>
        {label}
        {note && <span className={styles.abilityNote}>{note}</span>}
      </span>
      <span className={styles.abilityRank} style={{ color }}>
        {rank}
      </span>
      <div className={styles.abilityTrack}>
        <div className={styles.abilityFill} style={{ width: `${value}%`, background: color }} />
      </div>
      <span className={styles.abilityValue}>{display ?? Math.round(value)}</span>
    </div>
  )
}

function Gauge({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: 'condition' | 'trust'
}) {
  const fillClass = variant === 'condition' ? styles.conditionFill : styles.trustFill
  return (
    <div className={styles.gaugeRow}>
      <span className={styles.gaugeLabel}>{label}</span>
      <div className={styles.gaugeTrack}>
        <div className={`${styles.gaugeFill} ${fillClass}`} style={{ width: `${value}%` }} />
      </div>
      <span className={styles.gaugeValue}>{value}</span>
    </div>
  )
}


/** 伸びやすい能力（練習で目に見えて伸びる） */
function strongKeys(player: Player): GrowableKey[] {
  return aptitudeKeys(player, (value) => value >= APTITUDE_STRONG)
}

/** 伸びにくい能力（練習してもほとんど動かない） */
function weakKeys(player: Player): GrowableKey[] {
  return aptitudeKeys(player, (value) => value <= APTITUDE_WEAK)
}

function aptitudeKeys(player: Player, match: (value: number) => boolean): GrowableKey[] {
  const entries = Object.entries(player.growthAptitude ?? {}) as [GrowableKey, number][]
  return entries.filter(([, value]) => match(value)).map(([key]) => key)
}

function labelsOf(keys: GrowableKey[]): string {
  return keys.map((key) => ABILITY_LABELS[key]).join('・')
}
