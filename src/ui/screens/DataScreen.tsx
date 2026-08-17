import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { autoLineup } from '@/core/lineup/autoLineup'
import { activeU18Players, resolveU18Squad, u18Players, U18_SQUAD_SIZE } from '@/core/player/u18Squad'
import type { U18Entry } from '@/core/player/u18Squad'
import { formatInnings } from '@/core/player/careerStats'
import { GROWTH_RANGE_LABELS, growthRanking } from '@/core/player/growthReport'
import type { GrowthRange } from '@/core/player/growthReport'
import { ABILITY_LABELS } from '@/core/types/player'
import { overallRating, ratingLabel, toRank } from '@/core/player/rating'
import { lineupRatingOf, seasonProgressOfCell } from '@/core/rival/rivalRoster'
import type { Player } from '@/core/types/player'
import { FIRST_SQUAD_SIZE } from '@/core/player/squad'
import {
  formatRecord,
  hasMet,
  localRivals,
  nationalRivals,
  recordOf,
  starsOf,
  rosterPowerOf,
  titlesOf,
  prestigeLabel,
  prestigeOf,
} from '@/core/rival/rivals'
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
import { OpponentRoster } from '@/ui/components/OpponentRoster'
import { rankColorOf } from '@/ui/theme/playerColors'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { HELP_TOPICS } from './helpTopics'
import styles from './DataScreen.module.css'

type Tab = 'team' | 'growth' | 'facility' | 'rivals' | 'u18' | 'draft' | 'scout' | 'help'

const TABS: { id: Tab; label: string }[] = [
  { id: 'team', label: 'チーム' },
  { id: 'growth', label: '成長' },
  { id: 'facility', label: '設備' },
  { id: 'rivals', label: '他校' },
  { id: 'u18', label: 'U18' },
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
      {tab === 'u18' && <U18Tab />}
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

/**
 * 出す学校を選んで、**スタメンの平均総合の順**に並べる。
 *
 * 選ぶのは戦力順（実測は1校0.2msかかるので、2818校ぶんは走らせない）。
 * 並べ替えと表示は実測なので、
 * 一覧の数字と開いたときの9人が食い違わない。
 */
function pickRivals(
  schools: RivalSchool[],
  /** 何校まで出すか */
  limit: number,
  year: number,
  progress: number,
): { school: RivalSchool; rating: number }[] {
  // **良い代を抱えた学校が埋もれないよう、在校3代を均した力で絞る。**
  // `strength` だけで切ると、台頭してきた学校が一覧に出てこない。
  // 力は**先に1回だけ計算する**（比較のたびに出すと8000校で374msかかった）
  const ranked = schools.map((school) => ({
    school,
    // 戦績のある学校は必ず候補に残す（勝ってきた学校が一覧から消えないように）
    power: rosterPowerOf(school, year) + prestigeOf(school),
  }))
  ranked.sort((a, b) => b.power - a.power)

  // 実測（`lineupRatingOf`）は1校0.2msかかるので、**候補を絞ってから測る**。
  // 8000校を全部測ると1.6秒かかって画面が固まる
  return ranked
    .filter((entry, index) => index < limit * 2 || hasMet(recordOf(entry.school)))
    .map(({ school }) => ({ school, rating: lineupRatingOf(school, year, progress) }))
    // **勝っている学校を上に出す。** 強豪は戦績で決まる
    .sort(
      (a, b) => prestigeOf(b.school) - prestigeOf(a.school) || b.rating - a.rating,
    )
    .slice(0, limit)
}

/**
 * 校名・県名で絞る。空なら全部返す。
 *
 * 8,000校を毎回なめるが、文字列の一致だけなので数msで済む
 * （重いのは名簿を作る `lineupRatingOf` のほう）。
 */
function searchRivals(schools: RivalSchool[], keyword: string): RivalSchool[] {
  if (keyword.length === 0) return schools

  return schools.filter(
    (school) =>
      school.name.includes(keyword) || findRegion(school.regionId).name.includes(keyword),
  )
}

/** 戦績の一言。何も勝っていなければ空 */
function titleText(school: RivalSchool): string {
  const titles = titlesOf(school)
  const parts: string[] = []
  if (titles.championships > 0) parts.push(`全国制覇${titles.championships}回`)
  if (titles.nationals > 0) parts.push(`甲子園${titles.nationals}回`)
  else if (titles.region > 0) parts.push(`県優勝${titles.region}回`)
  return parts.join(' / ')
}

/** 一覧に既定で出す校数と、「もっと見る」で増える校数 */
const LOCAL_PREVIEW = 20
const NATIONAL_PREVIEW = 20
const MORE_STEP = 20

/**
 * 一覧に出す上限。
 *
 * **全校は出せない。** 県外だけで7,900校あり、
 * 実測（1校0.2ms）で1.6秒、行も7,900行になって画面が固まる。
 * 強い順に見ていく画面なので、上位200校まで見られれば足りる。
 */
const RIVAL_LIST_MAX = 200

/** ライバル校 */
function RivalsTab() {
  const game = useGameStore((s) => s.game)!
  const [localLimit, setLocalLimit] = useState(LOCAL_PREVIEW)
  const [nationalLimit, setNationalLimit] = useState(NATIONAL_PREVIEW)
  /**
   * 校名で絞る。
   *
   * **8,000校から目当ての1校を探せなかった。**
   * 強い順に並ぶだけなので、一度戦った学校を見返すのも運任せだった。
   * 県名でも引けるようにしてある（「鳥取」で鳥取の学校が並ぶ）。
   */
  const [query, setQuery] = useState('')

  /**
   * 出す学校を選んで、**スタメンの平均総合の順**に並べる。
   *
   * 選ぶのは戦力順（実測は1校0.2msかかるので、2818校ぶんは走らせない）。
   * 並べ替えと表示は実測なので、
   * 一覧の数字と開いたときの9人が食い違わない。
   */
  // **8,000校を毎回ふるい直さない。** 依存に新しい配列を渡すと
  // `useMemo` が毎描画で走り、並べ替えだけで40msかかる
  const localAll = useMemo(
    () => localRivals(game.rivals, game.regionId),
    [game.rivals, game.regionId],
  )
  const nationalAll = useMemo(
    () => nationalRivals(game.rivals, game.regionId),
    [game.rivals, game.regionId],
  )
  // 他校の部員も年度の中で少しずつ伸びるので、今日までの進み具合を見る
  const { year } = game
  const progress = seasonProgressOfCell(game.boardPosition)

  const keyword = query.trim()
  const localShown = useMemo(
    () => pickRivals(searchRivals(localAll, keyword), localLimit, year, progress),
    [localAll, keyword, localLimit, year, progress],
  )
  const nationalShown = useMemo(
    () => pickRivals(searchRivals(nationalAll, keyword), nationalLimit, year, progress),
    [nationalAll, keyword, nationalLimit, year, progress],
  )

  return (
    <>
      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          placeholder="学校名・県名で探す"
          onChange={(event) => setQuery(event.target.value)}
        />
        {keyword.length > 0 && (
          <button type="button" className={styles.searchClear} onClick={() => setQuery('')}>
            消す
          </button>
        )}
      </div>

      {/*
        **県内は参加校ぶん全部ある（178校の県もある）。**
        全部並べると縦に長すぎて他のタブへ戻れなくなるので、
        強い順に上位だけを出し、戦ったことのある学校は必ず混ぜる。
        「もっと見る」でも上限（`RIVAL_LIST_MAX`）までしか出さない。
      */}
      <Section title={`${findRegion(game.regionId).name}の学校（${localAll.length}校）`}>
        {localShown.map(({ school, rating }) => (
          <RivalRow key={school.id} school={school} rating={rating} />
        ))}
        {localLimit < RIVAL_LIST_MAX && localAll.length > localShown.length && (
          <button
            type="button"
            className={styles.moreRivals}
            onClick={() => setLocalLimit((current) => Math.min(RIVAL_LIST_MAX, current + MORE_STEP))}
          >
            さらに{MORE_STEP}校を見る（{localAll.length}校中{localShown.length}校）
          </button>
        )}
      </Section>

      {/*
        県外は全48地区に165校ずつある（7,900校）。
        全部並べると7,900行になるので、県内と同じく強い順に上位だけ出す
      */}
      <Section title={`県外の学校（${nationalAll.length}校）`}>
        {nationalShown.map(({ school, rating }) => (
          <RivalRow key={school.id} school={school} rating={rating} showRegion />
        ))}
        {nationalLimit < RIVAL_LIST_MAX && nationalAll.length > nationalShown.length && (
          <button
            type="button"
            className={styles.moreRivals}
            onClick={() =>
              setNationalLimit((current) => Math.min(RIVAL_LIST_MAX, current + MORE_STEP))
            }
          >
            さらに{MORE_STEP}校を見る（{nationalAll.length}校中{nationalShown.length}校）
          </button>
        )}
      </Section>
    </>
  )
}

/**
 * U18日本代表。
 *
 * **次の選考まで、前回選ばれた顔ぶれをそのまま見せる。**
 * 名簿は id だけを保存しているので、能力は開くたびに引き直す。
 * 選考のあとに伸びたぶんがそのまま出るし、
 * 年度が替わって卒業した選手は「卒業」と分かる。
 */
function U18Tab() {
  const game = useGameStore((s) => s.game)!
  const squad = game.u18Squad

  // 30人ぶんの名簿を毎回作り直すので、描画のたびに走らせない
  const entries = useMemo(
    () =>
      squad
        ? resolveU18Squad(squad, {
            schools: game.rivals,
            ourPlayers: game.players,
            ourSchoolName: game.schoolName,
            year: game.year,
            progress: seasonProgressOfCell(game.boardPosition),
          })
        : [],
    [squad, game.rivals, game.players, game.schoolName, game.year, game.boardPosition],
  )

  // スタメンはその場で組む。能力が伸びれば顔ぶれも入れ替わる。
  // **卒業した選手も当時の姿で並べる**（3年生を外すと9人に足りない）
  const lineup = useMemo(() => {
    const players = u18Players(entries)
    return players.length >= 9 ? autoLineup(players) : null
  }, [entries])

  if (!squad) {
    return (
      <Section title="U18日本代表">
        <p className={styles.empty}>
          まだ選考が行われていません。夏の大会が終わった時点で、全国から
          {U18_SQUAD_SIZE}人が選ばれます
        </p>
      </Section>
    )
  }

  const starters = new Map(
    (lineup?.slots ?? []).map((slot, index) => [slot.playerId, { order: index + 1, position: slot.position }]),
  )
  const ours = entries.filter((entry) => entry.ours)

  const sorted = [...entries].sort((a, b) => {
    const rank = (entry: U18Entry) =>
      entry.player ? (starters.get(entry.player.id)?.order ?? 100) : 200
    return rank(a) - rank(b)
  })

  return (
    <>
      <Section title={`${squad.year}年目の代表（${squad.members.length}人）`}>
        <Row label="自校からの選出" value={`${ours.length}人`} />
        <Row label="在籍中" value={`${activeU18Players(entries).length}人`} />
        {lineup && <Row label="スタメン" value="下の一覧で「打順／守備位置」が付いた9人" />}
        <p className={styles.note}>
          次の選考（来年の夏）まで、この顔ぶれのまま。
          能力は今の値で表示されます
        </p>
      </Section>

      <Section title="名簿">
        {sorted.map((entry) => (
          <U18Row
            key={`${entry.member.schoolId ?? 'ours'}-${entry.member.playerId}`}
            entry={entry}
            slot={entry.player ? starters.get(entry.player.id) : undefined}
          />
        ))}
      </Section>
    </>
  )
}


function U18Row({
  entry,
  slot,
}: {
  entry: U18Entry
  slot?: { order: number; position: string }
}) {
  const player = entry.player

  return (
    <div className={entry.ours ? `${styles.u18Row} ${styles.u18Ours}` : styles.u18Row}>
      <span className={styles.u18Order}>{slot ? slot.order : '—'}</span>
      <span className={styles.u18Who}>
        <span className={styles.u18Name}>
          {entry.member.name}
          {entry.ours && <span className={styles.u18Badge}>自校</span>}
          {entry.graduated && <span className={styles.u18Gone}>卒業</span>}
        </span>
        <span className={styles.u18School}>{entry.schoolName}</span>
      </span>
      {player ? (
        <span className={styles.u18Stats}>
          <span className={styles.u18Pos}>
            {slot ? slot.position : player.position}
          </span>
          <span className={styles.u18Grade}>
            {entry.graduated ? `${entry.member.grade}年（当時）` : `${player.grade}年`}
          </span>
          <span
            className={styles.u18Rank}
            style={{ color: rankColorOf(toRank(overallRating(player))) }}
          >
            {toRank(overallRating(player))}
          </span>
          <span className={styles.u18Rating}>{overallRating(player)}</span>
        </span>
      ) : (
        <span className={styles.u18Stats}>
          <span className={styles.u18Grade}>{entry.member.grade}年（当時）</span>
        </span>
      )}
    </div>
  )
}

function RivalRow({
  school,
  rating,
  showRegion,
}: {
  school: RivalSchool
  /** スタメン9人の平均総合。親でまとめて実測している */
  rating: number
  showRegion?: boolean
}) {
  const game = useGameStore((s) => s.game)!
  const [open, setOpen] = useState(false)
  const stars = starsOf(school)
  const best = stars.reduce((top, star) => (star.rating > top.rating ? star : top), stars[0])

  return (
    <div className={styles.rival}>
      {/*
        **学校名をタップするとスタメンが見られる。**
        戦力の数字だけでは、どんな選手が揃っているのかが分からなかった。
        名簿は種から作り直すので、ここに出る9人は実際に試合で当たる顔ぶれ。
      */}
      <button
        type="button"
        className={styles.rivalHead}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={styles.rivalName}>
          {/*
            **格は名前の隣に出す。** 戦力（その年の代の話）だけでは、
            昔から強い名門なのか今年たまたま良い代なのかが読めなかった
          */}
          {prestigeLabel(school) && (
            <span className={styles.rivalGrade}>{prestigeLabel(school)}</span>
          )}
          {school.name}
          {showRegion && (
            <span className={styles.rivalRegion}>{findRegion(school.regionId).name}</span>
          )}
        </span>
        <span
          className={styles.rivalStrength}
          style={{ color: rankColorOf(toRank(Math.round(rating))) }}
        >
          {ratingLabel(rating)}
        </span>
        <span className={styles.rivalCaret}>{open ? '▴' : '▾'}</span>
      </button>
      <div className={styles.rivalMeta}>
        {/*
          **強豪かどうかは戦績で決まる。**
          地力（隠し値）で決めていた頃は、強豪校を強くするとそこに居る個人も強くなり、
          U18代表が総合95〜100で埋まった。勝った回数なら能力を上げずに格を表せる。
        */}
        {titleText(school) && <span className={styles.rivalTitles}>{titleText(school)}</span>}
        {hasMet(recordOf(school)) ? (
          <span className={styles.rivalRecord}>通算 {formatRecord(recordOf(school))}</span>
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

      {open && (
        <OpponentRoster
          school={school}
          year={game.year}
          progress={seasonProgressOfCell(game.boardPosition)}
          label="スタメン"
          defaultOpen
        />
      )}
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
