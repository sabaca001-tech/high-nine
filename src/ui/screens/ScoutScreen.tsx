import { useState } from 'react'
import type { CSSProperties } from 'react'
import { toRank } from '@/core/player/rating'
import {
  findScoutRegion,
  MAX_APPROACHES,
  SCOUT_OPEN_MONTH,
  successChance,
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

  if (!game) return null

  const scouting = game.scouting
  const showing = openRegion ?? scouting.visiting
  const region = showing ? findScoutRegion(scouting, showing) : undefined

  // スカウトは秋に解禁され、年度末まで続く
  const open = game.month >= SCOUT_OPEN_MONTH || game.month <= 3

  if (region && showing) {
    return (
      <ProspectList
        region={region}
        reputation={game.reputation}
        visiting={scouting.visiting === showing}
        onBack={() => setOpenRegion(null)}
      />
    )
  }

  return (
    <AppLayout title="スカウト" subtitle={`部費 ${formatFunds(game.funds)}`} scrollable>
      <p className={styles.note}>
        {open ? (
          <>
            視察する県を選びます。<strong>出張費は距離で決まります。</strong>
            1回の出張で会えるのは1人だけなので、誰に会うかを選んでください。
            同じ県へは何度でも通えます。
          </>
        ) : (
          <>スカウトは{SCOUT_OPEN_MONTH}月に解禁されます。それまでは視察に出られません。</>
        )}
      </p>

      <RegionList
        homeRegionId={game.regionId}
        traits={game.scoutTraits}
        funds={game.funds}
        open={open}
        visiting={scouting.visiting}
        visited={scouting.regions}
        onOpen={setOpenRegion}
      />
    </AppLayout>
  )
}

/** 県の一覧。近い順に並べて、手の届く範囲が上に来るようにする */
function RegionList({
  homeRegionId,
  traits,
  funds,
  open,
  visiting,
  visited,
  onOpen,
}: {
  homeRegionId: RegionId
  traits: Record<RegionId, ScoutTrait>
  funds: number
  open: boolean
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
                disabled={!open || poor || busy}
                onClick={() => visitScoutRegion(region.id)}
              >
                {busy
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

      {region.prospects.map((prospect) => (
        <ProspectCard
          key={prospect.id}
          prospect={prospect}
          reputation={reputation}
          visiting={visiting}
        />
      ))}
    </AppLayout>
  )
}

function ProspectCard({
  prospect,
  reputation,
  visiting,
}: {
  prospect: Prospect
  reputation: number
  visiting: boolean
}) {
  const approachProspect = useGameStore((s) => s.approachProspect)

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
        disabled={!visiting || maxed}
        onClick={() => approachProspect(prospect.id)}
      >
        {maxed ? '通いつめた' : visiting ? 'この選手に会いに行く' : '視察に出ると会えます'}
      </button>
    </section>
  )
}

/** 「.312」形式。careerStats と同じ規則 */
function formatAverage(value: number): string {
  const text = value.toFixed(3)
  return value < 1 ? text.replace(/^0/, '') : text
}
