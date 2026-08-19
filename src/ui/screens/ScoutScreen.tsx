import { useState } from 'react'
import type { CSSProperties } from 'react'
import { toRank } from '@/core/player/rating'
import {
  MAX_APPROACHES,
  MAX_SCOUT_TRIPS,
  SCOUT_OPEN_MONTH,
  canScoutTrip,
  findScoutRegion,
  successChance,
  tripsOf,
} from '@/core/scout/scouting'
import type { Prospect, ScoutRegion } from '@/core/scout/scouting'
import { TRAIT_LABELS, TRAIT_NOTES } from '@/core/scout/scoutTraits'
import type { ScoutTrait } from '@/core/scout/scoutTraits'
import { findSkill } from '@/core/skill/skillDefs'
import { formatFunds } from '@/core/shop/funds'
import { scoutTripCost } from '@/core/shop/travel'
import { POSITION_LABELS } from '@/core/types/player'
import { findRegion, REGIONS, travelDistance } from '@/core/types/region'
import type { RegionId } from '@/core/types/region'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './ScoutScreen.module.css'

/**
 * 新入生のスカウト。
 *
 * **まず行き先の県を選ぶ。** 出張費は距離で決まるので、
 * 弱小校は地元近辺しかまわれない。
 * 1回の出張で会えるのは1人だけなので、10人の中から誰に会うかを選ぶことになる。
 */
export function ScoutScreen() {
  const game = useGameStore((s) => s.game)

  /** 中身を見ている県。出張中でなくても、訪問済みなら見返せる */
  const [openRegion, setOpenRegion] = useState<RegionId | null>(null)
  /**
   * 「県の一覧へ」で閉じた県。
   *
   * **出張中は候補一覧に貼り付いて戻れなかった。**
   * 出張先（`visiting`）は誰かに会うまで残るので、
   * 閉じても次の描画でまた開いてしまい、
   * 「今回は誰にも会わない」という判断ができなかった。
   */
  const [dismissed, setDismissed] = useState<RegionId | null>(null)

  if (!game) return null

  const scouting = game.scouting
  const target = openRegion ?? scouting.visiting
  const showing = target && target !== dismissed ? target : null
  const region = showing ? findScoutRegion(scouting, showing) : undefined

  // スカウトは秋に解禁され、年度末まで続く
  const open = game.month >= SCOUT_OPEN_MONTH || game.month <= 3
  const trips = tripsOf(scouting)
  // 回数を使い切ったら、行き先は選べない
  const canTrip = open && canScoutTrip(scouting)

  if (region && showing) {
    return (
      <ProspectList
        region={region}
        reputation={game.reputation}
        visiting={scouting.visiting === showing}
        onBack={() => {
          setOpenRegion(null)
          setDismissed(showing)
        }}
      />
    )
  }

  return (
    <AppLayout
      title="スカウト"
      subtitle={`部費 ${formatFunds(game.funds)} ／ 残り${MAX_SCOUT_TRIPS - trips}回`}
      scrollable
    >
      <p className={styles.note}>
        {open ? (
          <>
            視察する県を選びます。<strong>出張費は距離で決まります。</strong>
            1回の出張で会えるのは1人だけなので、誰に会うかを選んでください。
            {/*
              **回数を出す。** 部費だけを見せていた頃は、
              残り何回行けるのかが分からないまま出張していた
            */}
            出張は<strong>1年に{MAX_SCOUT_TRIPS}回まで</strong>
            （今年はあと{MAX_SCOUT_TRIPS - trips}回）。
          </>
        ) : (
          <>スカウトは{SCOUT_OPEN_MONTH}月に解禁されます。それまでは視察に出られません。</>
        )}
      </p>

      <NationalTeamSection
        prospects={scouting.nationalTeam}
        homeRegionId={game.regionId}
        reputation={game.reputation}
        funds={game.funds}
        open={open}
        canTrip={canTrip}
        busy={scouting.visiting !== null}
      />

      <RegionList
        homeRegionId={game.regionId}
        traits={game.scoutTraits}
        funds={game.funds}
        open={open}
        canTrip={canTrip}
        visiting={scouting.visiting}
        visited={scouting.regions}
        onOpen={(regionId) => {
          setOpenRegion(regionId)
          setDismissed(null)
        }}
      />
    </AppLayout>
  )
}

/**
 * U15日本代表。**県の一覧より上に、折りたたんで置く。**
 *
 * 30人が全国から選ばれている。視察しなくても顔ぶれが見えているので、
 * 「どの県へ行くか」を決める前の材料になる。
 * 代表に入っていない有望株もいるが、**代表は実力が担保されている**。
 * その代わり全国のスカウトが殺到していて獲得は難しい（`successChance`）。
 */
function NationalTeamSection({
  prospects,
  homeRegionId,
  reputation,
  funds,
  open,
  canTrip,
  busy,
}: {
  prospects: Prospect[]
  homeRegionId: RegionId
  reputation: number
  funds: number
  open: boolean
  /** 出張の回数がまだ残っているか */
  canTrip: boolean
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const approachNationalProspect = useGameStore((s) => s.approachNationalProspect)
  const home = findRegion(homeRegionId)

  if (prospects.length === 0) return null

  const met = prospects.filter((prospect) => prospect.approaches > 0).length

  return (
    <section className={styles.national}>
      <button
        type="button"
        className={styles.nationalHead}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.nationalTitle}>U15日本代表</span>
        <span className={styles.nationalCount}>
          {prospects.length}人{met > 0 && ` / 訪問${met}人`}
        </span>
        <span className={styles.nationalMark}>{expanded ? '−' : '＋'}</span>
      </button>

      {expanded && (
        <>
          <p className={styles.nationalNote}>
            全国から選ばれた30人。<strong>実力は担保されています</strong>が、
            全国のスカウトが殺到しているので獲得は難しくなります。
            会いに行くには出身県までの出張費がかかります。
            見込みは学校の評判で大きく変わります。
          </p>

          {prospects.map((prospect) => {
            const cost = scoutTripCost(home, findRegion(prospect.regionId))
            const poor = funds < cost

            return (
              <ProspectCard
                key={prospect.id}
                prospect={prospect}
                reputation={reputation}
                note={`${findRegion(prospect.regionId).name} / 出張費 ${formatFunds(cost)}`}
                action={{
                  label: !open
                    ? `${SCOUT_OPEN_MONTH}月に解禁されます`
                    : !canTrip
                      ? '今年の出張は使い切りました'
                      : busy
                        ? '出張中'
                        : poor
                          ? `部費が足りない ${formatFunds(cost)}`
                          : `会いに行く ${formatFunds(cost)}`,
                  disabled: !canTrip || busy || poor,
                  onClick: () => approachNationalProspect(prospect.id),
                }}
              />
            )
          })}
        </>
      )}
    </section>
  )
}

/** 県の一覧。近い順に並べて、手の届く範囲が上に来るようにする */
function RegionList({
  homeRegionId,
  traits,
  funds,
  open,
  canTrip,
  visiting,
  visited,
  onOpen,
}: {
  homeRegionId: RegionId
  traits: Record<RegionId, ScoutTrait>
  funds: number
  open: boolean
  /** 出張の回数がまだ残っているか */
  canTrip: boolean
  visiting: RegionId | null
  visited: ScoutRegion[]
  onOpen: (regionId: RegionId) => void
}) {
  const visitScoutRegion = useGameStore((s) => s.visitScoutRegion)
  const home = findRegion(homeRegionId)

  const sorted = [...REGIONS].sort(
    (a, b) => travelDistance(home, a) - travelDistance(home, b) || a.name.localeCompare(b.name),
  )

  return (
    <>
      {sorted.map((region) => {
        const cost = scoutTripCost(home, region)
        const seen = visited.find((entry) => entry.regionId === region.id)
        const trait = traits[region.id] ?? 'contact'
        const poor = funds < cost
        // 出張中は別の県へ行けない（まず誰かに会う）
        const busy = visiting !== null
        // いま出張している県。ここだけは候補一覧へ戻れるようにする
        const here = visiting === region.id

        return (
          <section key={region.id} className={styles.region}>
            <header className={styles.regionHead}>
              <span className={styles.regionName}>{region.name}</span>
              <span className={styles.trait}>{TRAIT_LABELS[trait]}</span>
            </header>
            <p className={styles.traitNote}>{TRAIT_NOTES[trait]}</p>

            {seen && (
              <p className={styles.visited}>
                視察済み {seen.visits}回 / 候補{seen.prospects.length}人
              </p>
            )}

            <div className={styles.regionActions}>
              {seen && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onOpen(region.id)}
                >
                  候補を見る
                </button>
              )}
              <button
                type="button"
                className={styles.primary}
                disabled={!here && (!canTrip || poor || busy)}
                onClick={() => (here ? onOpen(region.id) : visitScoutRegion(region.id))}
              >
                {here
                  ? 'いま視察中。候補を見る'
                  : !open
                    ? `${SCOUT_OPEN_MONTH}月から`
                    : !canTrip
                      ? '出張を使い切りました'
                      : busy
                        ? '出張中'
                        : poor
                          ? `部費が足りない ${formatFunds(cost)}`
                          : `視察する ${formatFunds(cost)}`}
              </button>
            </div>
          </section>
        )
      })}
    </>
  )
}

/** 1つの県の候補一覧 */
function ProspectList({
  region,
  reputation,
  visiting,
  onBack,
}: {
  region: ScoutRegion
  reputation: number
  visiting: boolean
  onBack: () => void
}) {
  const leaveScoutRegion = useGameStore((s) => s.leaveScoutRegion)
  const name = findRegion(region.regionId).name

  return (
    <AppLayout
      title={`${name}の候補`}
      subtitle={visiting ? '1人に会えます' : '視察済み'}
      scrollable
    >
      <button type="button" className={styles.back} onClick={onBack}>
        ← 県の一覧へ
      </button>

      <p className={styles.note}>
        {visiting
          ? `いま${name}にいます。会いに行けるのは1人だけです。`
          : `もう一度会いに行くには、${name}へ視察に出てください。`}
      </p>

      {/*
        **誰にも会わずに終えられるようにする。**
        めぼしい候補が居ない県でも、誰かに会うまで次の県へ行けなかった。
        出張費は行った時点で払っているので戻らない。
      */}
      {visiting && (
        <button
          type="button"
          className={styles.leave}
          onClick={() => {
            leaveScoutRegion()
            onBack()
          }}
        >
          誰にも会わずに引き上げる（出張費は戻りません）
        </button>
      )}

      {region.prospects.map((prospect) => (
        <RegionProspectCard
          key={prospect.id}
          prospect={prospect}
          reputation={reputation}
          visiting={visiting}
        />
      ))}
    </AppLayout>
  )
}

/** 県の候補1人ぶん。会えるのは出張中だけ */
function RegionProspectCard({
  prospect,
  reputation,
  visiting,
}: {
  prospect: Prospect
  reputation: number
  visiting: boolean
}) {
  const approachProspect = useGameStore((s) => s.approachProspect)

  return (
    <ProspectCard
      prospect={prospect}
      reputation={reputation}
      action={{
        label: visiting ? 'この選手に会いに行く' : '視察に出ると会えます',
        disabled: !visiting,
        onClick: () => approachProspect(prospect.id),
      }}
    />
  )
}

type CardAction = {
  label: string
  disabled: boolean
  onClick: () => void
}

function ProspectCard({
  prospect,
  reputation,
  action,
  note,
}: {
  prospect: Prospect
  reputation: number
  action: CardAction
  /** 出身県や出張費など、そのカードだけの補足 */
  note?: string
}) {
  const chance = successChance(prospect, reputation)
  const rank = toRank(prospect.rating)
  const maxed = prospect.approaches >= MAX_APPROACHES
  const skill = prospect.skillId ? findSkill(prospect.skillId) : undefined
  const { junior } = prospect

  return (
    <section className={styles.card} style={{ '--rank-color': rankColorOf(rank) } as CSSProperties}>
      <header className={styles.head}>
        <span className={styles.rank}>{rank}</span>
        <span className={styles.identity}>
          <span className={styles.name}>{prospect.name}</span>
          <span className={styles.meta}>
            {junior.team} / {POSITION_LABELS[prospect.position]}
            {note && ` / ${note}`}
          </span>
        </span>
      </header>

      {/* 中学での成績。総合値だけでは「どういう選手か」が伝わらない */}
      <dl className={styles.junior}>
        <div className={styles.juniorCell}>
          <dt className={styles.juniorLabel}>中学最高成績</dt>
          <dd className={styles.juniorValue}>{junior.best}</dd>
        </div>
        {junior.batting && (
          <>
            <div className={styles.juniorCell}>
              <dt className={styles.juniorLabel}>打率</dt>
              <dd className={styles.juniorValue}>{formatAverage(junior.batting.average)}</dd>
            </div>
            <div className={styles.juniorCell}>
              <dt className={styles.juniorLabel}>本塁打</dt>
              <dd className={styles.juniorValue}>{junior.batting.homeruns}本</dd>
            </div>
          </>
        )}
        {junior.pitching && (
          <>
            <div className={styles.juniorCell}>
              <dt className={styles.juniorLabel}>防御率</dt>
              <dd className={styles.juniorValue}>{junior.pitching.era.toFixed(2)}</dd>
            </div>
            <div className={styles.juniorCell}>
              <dt className={styles.juniorLabel}>最速</dt>
              <dd className={styles.juniorValue}>{junior.pitching.velocity}km/h</dd>
            </div>
          </>
        )}
      </dl>

      {skill && (
        <p className={skill.rank === 'gold' ? `${styles.skill} ${styles.skillGold}` : styles.skill}>
          <span className={styles.skillName}>{skill.name}</span>
          {skill.description}
        </p>
      )}

      <div className={styles.gaugeRow}>
        <span className={styles.gaugeLabel}>入部の見込み</span>
        <span className={styles.gaugeTrack}>
          <span className={styles.gaugeFill} style={{ width: `${Math.round(chance * 100)}%` }} />
        </span>
        <span className={styles.gaugeValue}>{Math.round(chance * 100)}%</span>
      </div>

      <p className={styles.visits}>
        訪問 {prospect.approaches} / {MAX_APPROACHES} 回
      </p>

      <button
        type="button"
        className={styles.button}
        disabled={action.disabled || maxed}
        onClick={action.onClick}
      >
        {maxed ? '通いつめた' : action.label}
      </button>
    </section>
  )
}

/** 「.312」形式。careerStats と同じ規則 */
function formatAverage(value: number): string {
  const text = value.toFixed(3)
  return value < 1 ? text.replace(/^0/, '') : text
}
