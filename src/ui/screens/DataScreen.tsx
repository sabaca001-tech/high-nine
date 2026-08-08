import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatInnings } from '@/core/player/careerStats'
import { GROWTH_RANGE_LABELS, growthRanking } from '@/core/player/growthReport'
import type { GrowthRange } from '@/core/player/growthReport'
import { ABILITY_LABELS } from '@/core/types/player'
import { overallRating, toRank } from '@/core/player/rating'
import type { Player } from '@/core/types/player'
import { FIRST_SQUAD_SIZE } from '@/core/player/squad'
import { formatRecord, hasMet, localRivals, nationalRivals } from '@/core/rival/rivals'
import type { RivalSchool } from '@/core/rival/rivals'
import type { ScoutResult } from '@/core/scout/scouting'
import { TRAIT_LABELS } from '@/core/scout/scoutTraits'
import { EQUIPMENTS } from '@/core/shop/equipmentDefs'
import { groundName, GROUND_LEVEL_MAX } from '@/core/shop/facility'
import { findManagerRole, MANAGER_JOIN_CHANCE } from '@/core/staff/managers'
import { formatFunds, monthlyFunds } from '@/core/shop/funds'
import { monthlyUpkeep } from '@/core/shop/upkeep'
import { uniformName } from '@/core/team/uniforms'
import { CAREER_PATH_LABELS, isCareerPending, isInHallOfFame } from '@/core/types/career'
import type { GraduateRecord } from '@/core/types/season'
import {
  handSizeFor,
  reputationDisplay,
  reputationGrade,
  REPUTATION_GRADE_LABELS,
} from '@/core/types/season'
import { findRegion, regionStrength, roundsFor } from '@/core/types/region'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { HELP_TOPICS } from './helpTopics'
import styles from './DataScreen.module.css'

type Tab = 'team' | 'growth' | 'facility' | 'rivals' | 'draft' | 'scout' | 'help'

const TABS: { id: Tab; label: string }[] = [
  { id: 'team', label: 'チーム' },
  { id: 'growth', label: '成長' },
  { id: 'facility', label: '設備' },
  { id: 'rivals', label: '他校' },
  { id: 'draft', label: '進路' },
  { id: 'scout', label: 'スカウト' },
  { id: 'help', label: '遊び方' },
]

/**
 * データ画面。
 *
 * 各画面に散っていた「いまどうなっているか」をここに集める。
 * 編成のような**操作**は各画面へ送り、ここは読むための場所にする
 * （同じ操作を2か所に置くと、どちらが正なのか分からなくなる）。
 */
export function DataScreen() {
  const game = useGameStore((s) => s.game)
  const [tab, setTab] = useState<Tab>('team')

  if (!game) return null

  return (
    <AppLayout title="データ" subtitle={`${game.year}年目 ${game.month}月`} scrollable>
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

      {tab === 'team' && <TeamTab />}
      {tab === 'growth' && <GrowthTab />}
      {tab === 'facility' && <FacilityTab />}
      {tab === 'rivals' && <RivalsTab />}
      {tab === 'draft' && <DraftTab />}
      {tab === 'scout' && <ScoutTab />}
      {tab === 'help' && <HelpTab />}
    </AppLayout>
  )
}

/** 見出しと本文の枠 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

/** 「項目 …… 値」の1行 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  )
}

/** チーム。編成への入口もここに置く */
function TeamTab() {
  const game = useGameStore((s) => s.game)!
  const setScreen = useGameStore((s) => s.setScreen)

  const region = findRegion(game.regionId)
  const grade = reputationGrade(game.reputation)
  const squad = new Set(game.squad)
  const starters = new Set(game.lineup.slots.map((slot) => slot.playerId))
  const injured = game.players.filter((player) => player.injuryMonths > 0).length
  const average =
    game.players.reduce((total, player) => total + overallRating(player), 0) /
    Math.max(1, game.players.length)

  return (
    <>
      <Section title="学校">
        <Row label="学校名" value={game.schoolName} />
        <Row label="ユニフォーム" value={uniformName(game.uniform)} />
        <Row
          label="所在地"
          value={`${region.name}（${region.schools}校 / 優勝まで${roundsFor(region.schools)}勝）`}
        />
        <Row label="地区の激戦度" value={`相手の強さ ${signed(regionStrength(region))}`} />
        <Row
          label="評判"
          value={`${grade} ${REPUTATION_GRADE_LABELS[grade]}（${reputationDisplay(game.reputation)}）`}
        />
        <Row label="手札の枚数" value={`${handSizeFor(game.reputation)}枚`} />
        <p className={styles.note}>
          学校名・ユニフォーム・所在地は、年度が切り替わるときに変えられます。
        </p>
      </Section>

      <Section title="部員">
        <Row label="部員数" value={`${game.players.length}人`} />
        <Row label="ベンチ入り" value={`${squad.size} / ${FIRST_SQUAD_SIZE}人`} />
        <Row label="ベンチ外" value={`${game.players.length - squad.size}人`} />
        <Row label="怪我で離脱中" value={`${injured}人`} />
        <Row label="平均総合" value={average.toFixed(1)} />
        <Row
          label="スタメンの平均"
          value={averageOf(game.players.filter((p) => starters.has(p.id))).toFixed(1)}
        />
      </Section>

      <Section title="編成を変える">
        <p className={styles.note}>
          打順・守備位置・ベンチ入りは、まとめてスタメン画面で入れ替えます。
        </p>
        <button type="button" className={styles.link} onClick={() => setScreen('lineup')}>
          スタメン／ベンチ入りを変える ▶
        </button>
        <button type="button" className={styles.link} onClick={() => setScreen('players')}>
          部員一覧（能力・練習方針） ▶
        </button>
        <button type="button" className={styles.link} onClick={() => setScreen('records')}>
          歴代記録（ベストナイン・通算記録） ▶
        </button>
      </Section>
    </>
  )
}

/**
 * 誰がどれだけ伸びたか。
 *
 * 練習も試合もその場でメッセージが流れるだけで、後から振り返れなかった。
 * 「今年いちばん伸びたのは誰か」が分からないと、
 * 練習の選び方が良かったのかを判断しようがない。
 */
function GrowthTab() {
  const game = useGameStore((s) => s.game)!
  const showPlayer = useGameStore((s) => s.showPlayer)
  const [range, setRange] = useState<GrowthRange>('season')

  const ranking = growthRanking(game.players, range, game.year)
  const grown = ranking.filter((entry) => entry.delta !== 0 || entry.gains.length > 0)

  return (
    <>
      <div className={styles.tabs}>
        {(['month', 'season', 'enrollment'] as GrowthRange[]).map((id) => (
          <button
            key={id}
            type="button"
            className={range === id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setRange(id)}
          >
            {GROWTH_RANGE_LABELS[id]}
          </button>
        ))}
      </div>

      <Section title={`伸びた順（${GROWTH_RANGE_LABELS[range]}）`}>
        {grown.length === 0 ? (
          <p className={styles.note}>
            まだ記録がありません。月が変わると1件ずつ記録され、そこからの差を出します。
          </p>
        ) : (
          grown.map((entry) => (
            <button
              key={entry.player.id}
              type="button"
              className={styles.growthRow}
              onClick={() => showPlayer(entry.player.id)}
            >
              <span className={styles.growthName}>
                {entry.player.name}
                <span className={styles.growthGrade}>{entry.player.grade}年</span>
              </span>
              <span className={styles.growthTotal}>
                {entry.from} → {entry.to}
                <span className={entry.delta >= 0 ? styles.growthUp : styles.growthDown}>
                  {signed(entry.delta)}
                </span>
              </span>
              <span className={styles.growthDetail}>
                {entry.gains.length === 0
                  ? '変化なし'
                  : entry.gains
                      .slice(0, 5)
                      .map((gain) => `${ABILITY_LABELS[gain.key]}${signed(gain.delta)}`)
                      .join(' ')}
              </span>
            </button>
          ))
        )}
      </Section>
    </>
  )
}

/** 設備・部費 */
function FacilityTab() {
  const game = useGameStore((s) => s.game)!
  const setScreen = useGameStore((s) => s.setScreen)

  const upkeep = monthlyUpkeep(game.players.length, game.groundLevel)
  const income = monthlyFunds(game.reputation)

  return (
    <>
      <Section title="部費">
        <Row label="残高" value={formatFunds(game.funds)} />
        <Row label="毎月の支給" value={formatFunds(income)} />
        <Row label="毎月の維持費" value={formatFunds(upkeep.total)} />
        <Row label="差し引き" value={signedFunds(income - upkeep.total)} />
        <p className={styles.note}>
          維持費は部員数と設備の水準で決まります。払えないと道具が足りず、信頼度が下がります。
        </p>
      </Section>

      <Section title="グラウンド">
        <Row
          label="整備段階"
          value={`Lv${game.groundLevel} / ${GROUND_LEVEL_MAX}（${groundName(game.groundLevel)}）`}
        />
        <p className={styles.note}>
          放っておくと荒れて下がります。段階が上がるほど下がりやすくなります。
        </p>
      </Section>

      <Section title="マネージャー">
        {game.managers.length > 0 ? (
          game.managers.map((manager) => {
            const role = findManagerRole(manager.roleId)
            return (
              <div key={manager.id}>
                <Row label={`${manager.grade}年 ${manager.name}`} value={role?.label ?? ''} />
                <p className={styles.note}>{role?.description}</p>
              </div>
            )
          })
        ) : (
          <p className={styles.note}>いまは在籍していません。</p>
        )}
        <p className={styles.note}>
          マネージャーは雇えません。毎年 約{Math.round(MANAGER_JOIN_CHANCE * 100)}%
          の確率で入部してきて、3年間在籍します。
        </p>
      </Section>

      <Section title="練習器具">
        {EQUIPMENTS.map((equipment) => {
          const owned = game.equipment.includes(equipment.id)
          return (
            <div key={equipment.id} className={styles.row}>
              <span className={styles.rowLabel}>{equipment.name}</span>
              <span className={owned ? styles.owned : styles.rowValue}>
                {owned ? '所有' : '未所有'}
              </span>
            </div>
          )
        })}
        <p className={styles.note}>
          持っていると対応する練習カードが手札に出ます。使ううちに確率で壊れます。
        </p>
        <button type="button" className={styles.link} onClick={() => setScreen('shop')}>
          ショップで買う ▶
        </button>
      </Section>
    </>
  )
}

/** 一覧に既定で出す県内の校数 */
const LOCAL_PREVIEW = 20

/** ライバル校 */
function RivalsTab() {
  const game = useGameStore((s) => s.game)!
  const [showAll, setShowAll] = useState(false)

  const local = [...localRivals(game.rivals, game.regionId)].sort(
    (a, b) => b.strength - a.strength,
  )
  // 上位 LOCAL_PREVIEW 校＋戦ったことのある学校
  const localShown = local.filter(
    (school, index) => index < LOCAL_PREVIEW || hasMet(school.record),
  )
  const national = [...nationalRivals(game.rivals, game.regionId)].sort(
    (a, b) => b.strength - a.strength,
  )

  return (
    <>
      {/*
        **県内は参加校ぶん全部ある（178校の県もある）。**
        全部並べると縦に長すぎて他のタブへ戻れなくなるので、
        強い順に上位だけを出し、戦ったことのある学校は必ず混ぜる。
      */}
      <Section title={`${findRegion(game.regionId).name}の学校（${local.length}校）`}>
        {(showAll ? local : localShown).map((school) => (
          <RivalRow key={school.id} school={school} />
        ))}
        {!showAll && local.length > localShown.length && (
          <button type="button" className={styles.moreRivals} onClick={() => setShowAll(true)}>
            残り{local.length - localShown.length}校を見る
          </button>
        )}
      </Section>

      <Section title="全国の強豪">
        {national.map((school) => (
          <RivalRow key={school.id} school={school} showRegion />
        ))}
      </Section>
    </>
  )
}

function RivalRow({ school, showRegion }: { school: RivalSchool; showRegion?: boolean }) {
  const best = school.stars.reduce(
    (top, star) => (star.rating > top.rating ? star : top),
    school.stars[0],
  )

  return (
    <div className={styles.rival}>
      <div className={styles.rivalHead}>
        <span className={styles.rivalName}>
          {school.name}
          {showRegion && (
            <span className={styles.rivalRegion}>{findRegion(school.regionId).name}</span>
          )}
        </span>
        <span className={styles.rivalStrength}>戦力 {signed(school.strength)}</span>
      </div>
      <div className={styles.rivalMeta}>
        {hasMet(school.record) ? (
          <span className={styles.rivalRecord}>通算 {formatRecord(school.record)}</span>
        ) : (
          <span className={styles.rivalNone}>対戦なし</span>
        )}
        {best && (
          <span className={styles.rivalStar}>
            注目 {best.name}（{best.grade}年 / 総合{best.rating}）
          </span>
        )}
        {school.trend !== 0 && (
          <span className={school.trend > 0 ? styles.trendUp : styles.trendDown}>
            前年比 {signed(school.trend)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * 卒業後の進路。
 *
 * OB名鑑はプロに届いた選手だけなので、**そこに載る前の選手をここで追う**。
 * 大学生は在学中ここに居て、指名されるとOB名鑑へ移る。
 */
function DraftTab() {
  const game = useGameStore((s) => s.game)!
  const setScreen = useGameStore((s) => s.setScreen)

  const drafted = game.graduates.filter(isInHallOfFame)
  const pending = game.graduates.filter(isCareerPending)
  const finished = game.graduates.filter(
    (graduate) => !isInHallOfFame(graduate) && !isCareerPending(graduate),
  )

  return (
    <>
      <Section title={`プロ入り（${drafted.length}人）`}>
        {drafted.length === 0 ? (
          <p className={styles.note}>まだプロ入りした選手はいません。</p>
        ) : (
          drafted.map((graduate) => <GraduateRow key={graduate.id} graduate={graduate} />)
        )}
      </Section>

      <Section title={`プロを目指している（${pending.length}人）`}>
        {pending.length === 0 ? (
          <p className={styles.note}>大学・社会人で現役の卒業生はいません。</p>
        ) : (
          pending.map((graduate) => <GraduateRow key={graduate.id} graduate={graduate} />)
        )}
        <p className={styles.note}>
          大学に進んだ選手は4年後に進路が決まります。指名されればOB名鑑に載ります。
        </p>
      </Section>

      <Section title={`競技を終えた（${finished.length}人）`}>
        {finished.length === 0 ? (
          <p className={styles.note}>まだ該当する卒業生はいません。</p>
        ) : (
          finished.map((graduate) => <GraduateRow key={graduate.id} graduate={graduate} />)
        )}
      </Section>

      <button type="button" className={styles.link} onClick={() => setScreen('alumni')}>
        OB名鑑（プロでの成績） ▶
      </button>
    </>
  )
}

function GraduateRow({ graduate }: { graduate: GraduateRecord }) {
  const stats = graduate.highSchool
  const line = graduate.isPitcher
    ? `${formatInnings(stats.pitching.outs)}回 ${stats.pitching.wins}勝${stats.pitching.losses}敗`
    : `${stats.batting.games}試合 ${stats.batting.hits}安打 ${stats.batting.homeruns}本`

  return (
    <div className={styles.rival}>
      <div className={styles.rivalHead}>
        <span className={styles.rivalName}>{graduate.name}</span>
        <span className={styles.rivalStrength}>
          {toRank(graduate.rating)}（{graduate.rating}）
        </span>
      </div>
      <div className={styles.rivalMeta}>
        <span className={styles.rivalRecord}>
          {graduate.year}年目卒 / {CAREER_PATH_LABELS[graduate.path]}
          {graduate.team && ` / ${graduate.team}`}
        </span>
        <span className={styles.rivalNone}>高校通算 {line}</span>
      </div>
    </div>
  )
}

/** スカウト。訪問した県と、そこで見た選手を残す */
function ScoutTab() {
  const game = useGameStore((s) => s.game)!
  const setScreen = useGameStore((s) => s.setScreen)

  const { regions, results } = game.scouting

  return (
    <>
      <Section title={`今年度の視察（${regions.length}県）`}>
        {regions.length === 0 ? (
          <p className={styles.note}>まだどこにも視察に行っていません。</p>
        ) : (
          regions.map((region) => (
            <div key={region.regionId} className={styles.rival}>
              <div className={styles.rivalHead}>
                <span className={styles.rivalName}>{findRegion(region.regionId).name}</span>
                <span className={styles.rivalStrength}>{region.visits}回</span>
              </div>
              <div className={styles.rivalMeta}>
                <span className={styles.rivalRecord}>
                  {TRAIT_LABELS[game.scoutTraits[region.regionId] ?? 'contact']}
                </span>
                <span className={styles.rivalNone}>候補{region.prospects.length}人</span>
              </div>
              {region.prospects.map((prospect) => (
                <div key={prospect.id} className={styles.prospect}>
                  <span className={styles.prospectRank}>{toRank(prospect.rating)}</span>
                  <span className={styles.prospectName}>{prospect.name}</span>
                  <span className={styles.prospectMeta}>
                    {prospect.junior.best}
                    {prospect.approaches > 0 && ` / 訪問${prospect.approaches}回`}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
        <button type="button" className={styles.link} onClick={() => setScreen('scout')}>
          スカウトに行く ▶
        </button>
      </Section>

      <Section title={`前年度の結果（${results.length}人）`}>
        {results.length === 0 ? (
          <p className={styles.note}>まだ結果がありません。</p>
        ) : (
          results.map((result) => <ScoutResultRow key={result.name} result={result} />)
        )}
      </Section>
    </>
  )
}

function ScoutResultRow({ result }: { result: ScoutResult }) {
  return (
    <div className={styles.prospect}>
      <span className={result.joined ? styles.prospectJoined : styles.prospectRank}>
        {result.joined ? '入部' : '他校'}
      </span>
      <span className={styles.prospectName}>{result.name}</span>
      <span className={styles.prospectMeta}>
        {result.joined
          ? `総合${result.rating}${result.skillName ? ` / ${result.skillName}` : ''}`
          : `${result.schoolName}（${result.regionName}）`}
      </span>
    </div>
  )
}

/**
 * 遊び方。
 *
 * **機能を足したら helpTopics.ts に項目を足す。**
 * 仕組みが画面に散っていて、触っただけでは分からないものが多い。
 */
function HelpTab() {
  const [open, setOpen] = useState<string | null>(HELP_TOPICS[0].id)

  return (
    <>
      {HELP_TOPICS.map((topic) => (
        <section key={topic.id} className={styles.section}>
          <button
            type="button"
            className={styles.helpTitle}
            onClick={() => setOpen(open === topic.id ? null : topic.id)}
          >
            {topic.title}
            <span className={styles.helpMark}>{open === topic.id ? '−' : '＋'}</span>
          </button>
          {open === topic.id &&
            topic.body.map((paragraph) => (
              <p key={paragraph} className={styles.helpBody}>
                {paragraph}
              </p>
            ))}
        </section>
      ))}
    </>
  )
}

function averageOf(players: Player[]): number {
  if (players.length === 0) return 0
  return players.reduce((total, player) => total + overallRating(player), 0) / players.length
}

/** 「+3」「-2」のように符号を付ける */
function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

/** 金額に符号を付ける。桁区切りは formatFunds に任せる */
function signedFunds(value: number): string {
  return value >= 0 ? `+${formatFunds(value)}` : `-${formatFunds(-value)}`
}
