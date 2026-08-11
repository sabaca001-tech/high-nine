import { useState } from 'react'
import { autoLineup } from '@/core/lineup/autoLineup'
import { BatterStats } from './BatterStats'
import { PitcherStats } from './PitcherStats'
import { PitchChart } from './PitchChart'
import { TrajectoryArrow } from './TrajectoryArrow'
import { rivalRoster } from '@/core/rival/rivalRoster'
import type { RivalSchool } from '@/core/rival/rivals'
import { overallRating, toRank } from '@/core/player/rating'
import type { Player } from '@/core/types/player'
import { rankColorOf } from '@/ui/theme/playerColors'
import styles from './OpponentRoster.module.css'

/**
 * 相手校のスタメン。
 *
 * **相手が誰なのか分からないまま試合が始まっていた。**
 * 「格上」としか出ていないので、どこが強いのか・誰を警戒すべきかが読めず、
 * スタメンを組み替える判断ができなかった。
 *
 * 部員は保存していない。`rivalRoster` が学校の種から毎回同じ名簿を作るので、
 * ここに出る9人は**その学校に実在する選手**で、次に当たっても同じ顔ぶれになる。
 *
 * 畳んでおく。毎回開くものではないうえ、
 * 開きっぱなしだと自分のスタメンが画面外へ出てしまう。
 */
export function OpponentRoster({
  school,
  year,
  progress,
  /** 畳んでいるときのボタンの文言。データ画面では「相手の」が付かない */
  label = '相手のスタメン',
  /** 最初から開いた状態にする */
  defaultOpen = false,
}: {
  school: RivalSchool
  year: number
  /** 年度の進み具合（0〜1）。年度が進むほど部員が伸びている */
  progress?: number
  label?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  // 能力を開いている選手。**1人ずつ**にする（9人ぶん開くと画面から溢れる）
  const [detailId, setDetailId] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" className={styles.toggle} onClick={() => setOpen(true)}>
        {label}を見る ▾
      </button>
    )
  }

  const roster = rivalRoster(school, year, progress)
  const lineup = autoLineup(roster)
  const byId = new Map(roster.map((player) => [player.id, player]))

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.toggle} onClick={() => setOpen(false)}>
        {label} ▴
      </button>

      <div className={styles.list}>
        {lineup.slots.map((slot, index) => {
          const player = byId.get(slot.playerId)
          if (!player) return null
          const rating = overallRating(player)

          const showing = detailId === player.id

          return (
            <div key={slot.playerId} className={styles.entry}>
              {/* 行そのものを押すと、残りの能力が開く */}
              <button
                type="button"
                className={showing ? `${styles.row} ${styles.rowOpen}` : styles.row}
                onClick={() => setDetailId(showing ? null : player.id)}
              >
                <span className={styles.order}>{index + 1}</span>
                <span className={styles.position}>{slot.position}</span>
                <span className={styles.name}>
                  {player.name}
                  {/* こちらがスカウトで追いかけていた選手には印を付ける */}
                  {player.origin === 'scout' && <span className={styles.scouted}>スカウト</span>}
                </span>
                <span className={styles.grade}>{player.grade}年</span>
                <span className={styles.rating} style={{ color: rankColorOf(toRank(rating)) }}>
                  {rating}
                </span>
                <span className={styles.detail}>
                  {summaryOf(player)}
                  <span className={styles.more}>{showing ? '▴' : '▾'}</span>
                </span>
              </button>

              {showing && <Abilities player={player} />}
            </div>
          )
        })}
      </div>

      <p className={styles.note}>
        名前を押すと残りの能力が見られます。次に当たっても同じ顔ぶれで、3年生は夏で抜けます。
      </p>
    </div>
  )
}

/**
 * 押したときに開く、残りの能力。
 *
 * **1行では3つしか出せない。** 肩も守備も捕球も見えないので、
 * 「守れる相手か」「走れる相手か」が読めなかった。
 * 自校の選手カードと同じ部品を使って、同じ物差しで並べる。
 */
function Abilities({ player }: { player: Player }) {
  if (player.pitching) {
    return (
      <div className={styles.abilities}>
        <PitcherStats pitching={player.pitching} compact columns={2} />
        <BatterStats batting={player.batting} compact columns={2} />
        {/* 持ち球は図と球種名で幅を使うので、横いっぱいに置く */}
        <div className={styles.pitches}>
          <PitchChart pitches={player.pitching.pitches} compact narrow />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.abilities}>
      <span className={styles.trajectory}>
        弾道
        <TrajectoryArrow trajectory={player.batting.trajectory} size={13} />
      </span>
      <BatterStats batting={player.batting} compact columns={2} />
    </div>
  )
}

/**
 * その選手の持ち味を1行で。
 * 全能力を並べる幅は無いので、**投手は球速・制球、野手はミート・パワー**に絞る。
 */
function summaryOf(player: Player): string {
  if (player.pitching) {
    const p = player.pitching
    return `${p.velocity}km/h 制${toRank(p.control)} 変${toRank(p.breaking)}`
  }
  const b = player.batting
  return `ミ${toRank(b.meet)} パ${toRank(b.power)} 走${toRank(b.speed)}`
}
