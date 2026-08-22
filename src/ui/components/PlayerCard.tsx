import type { CSSProperties, ReactNode } from 'react'
import { playerPoints, pointsRank, velocityRank } from '@/core/player/rating'
import {
  ABILITY_LABELS,
  MOTIVATION_LABELS,
  PLAYER_ORIGIN_LABELS,
} from '@/core/types/player'
import { focusLabel } from '@/core/player/trainingFocus'
import type { Motivation, Player } from '@/core/types/player'
import { BatterStats } from './BatterStats'
import { TrajectoryArrow } from './TrajectoryArrow'
import { AptitudeDiamond } from './AptitudeDiamond'
import { PitchChart } from './PitchChart'
import { PitcherStats } from './PitcherStats'
import { PlayerPortrait } from './PlayerPortrait'
import { plateGradient, rankColorOf } from '@/ui/theme/playerColors'
import { nameFontSize, splitName } from './nameFontSize'
import styles from './PlayerCard.module.css'

/**
 * 部員一覧・スタメン設定で使う選手カード。
 *
 * 横長の1行だと能力を並べる幅が足りず、結局タップしないと分からなかった。
 * 四角いカードにして、上段に名前と状態、下段に
 * **ポジション適性（グラウンド図）と能力（レーダー）を左右に並べる**。
 * どちらも形で読めるので、一覧のままチームの構成を把握できる。
 */

const MOOD_CLASS: Record<Motivation, string> = {
  [-2]: styles.moodMinus2,
  [-1]: styles.moodMinus1,
  0: styles.mood0,
  1: styles.mood1,
  2: styles.mood2,
}

export function PlayerCard({
  player,
  onClick,
  /** 選択中の枠を出す */
  selected = false,
  /** カード右上に出す任意の印（スタメンの打順など） */
  badge,
  /** カード下部に足す内容（スタメンの守備位置など） */
  footer,
}: {
  player: Player
  onClick?: () => void
  selected?: boolean
  badge?: ReactNode
  footer?: ReactNode
}) {
  const points = playerPoints(player)
  const rank = pointsRank(points)

  const [family, given] = splitName(player.name)

  const style = {
    // カードの色分けはポジション系統で行う（帽子はチーム共通で区別にならない）
    '--card-accent': plateGradient(player),
    '--rank-color': rankColorOf(rank),
    '--name-size': nameFontSize(player.name),
  } as CSSProperties

  const body = (
    <>
      <div className={styles.head}>
        <PlayerPortrait playerId={player.id} size={30} cap exchange={player.origin === 'exchange'} />

        {/* ネームプレート。左が本職の系統、右に他の適性の色が混ざる */}
        <span className={styles.plate} style={{ background: plateGradient(player) }}>
          <span className={styles.name}>
            <span className={styles.family}>{family}</span>
            {given && <span className={styles.given}>{given}</span>}
          </span>
          <span className={styles.sub}>
            {player.grade}年 / {player.isPitcher ? '投手' : player.position}
            {/*
              どうやって入部したか。**スカウトで通って獲った選手**が
              他の新入生と見分けられなかったので、名前の下に出す
            */}
            {player.origin && (
              <span className={styles.origin}>{PLAYER_ORIGIN_LABELS[player.origin]}</span>
            )}
          </span>
        </span>

        <span className={styles.rank}>{rank}</span>
      </div>

      {/* 体力とやる気は毎月動くので、常に見えるようにする。
          打順などの印もここに置く（名前の行に足すと名前が潰れる） */}
      <div className={styles.status}>
        {badge}
        <span className={`${styles.mood} ${MOOD_CLASS[player.motivation]}`}>
          {MOTIVATION_LABELS[player.motivation]}
        </span>
        <span className={styles.gaugeTrack}>
          <span className={styles.gaugeFill} style={{ width: `${player.condition}%` }} />
        </span>
        <span className={styles.gaugeValue}>{player.condition}</span>
      </div>

      {player.injuryMonths > 0 && (
        <p className={styles.injured}>怪我で離脱中（あと{player.injuryMonths}ヶ月）</p>
      )}

      {/* 自主練の内容。一覧のままチーム全体の方針が読めるようにする */}
      {player.focus && player.focus.type !== 'team' && (
        <p className={styles.focus}>{focusLabel(player.focus, ABILITY_LABELS)}</p>
      )}

      {/*
        **投手には野手のレーダーを使わない。**
        六角形に6軸を詰めると、150pxのカードではラベルが潰れて重なるうえ、
        形が読めても球速が141km/hなのか135km/hなのか分からなかった。
        投手は数値4つと持ち球で判断する。
      */}
      {player.pitching ? (
        /*
          **投手は左に球速と持ち球、右に能力。** 野手の並び（左に絵・右に数値）と揃える。
          守備適性の図は出さない。投手はマウンドに立つのが仕事で、
          「どこを守れるか」より**何を投げるのか**が知りたい
          （守備そのものは右の列に数字で出る）。
        */
        <div className={styles.body}>
          <div className={styles.figures}>
            <span className={styles.trajectoryRow}>
              <span className={styles.trajectoryLabel}>球速</span>
              <span
                className={styles.velocity}
                style={{ color: rankColorOf(velocityRank(player.pitching.velocity)) }}
              >
                {player.pitching.velocity}
              </span>
            </span>
            <span className={styles.chartBox}>
              <PitchChart pitches={player.pitching.pitches} labels={false} compact />
              <span className={styles.chartCaption}>持ち球</span>
            </span>
          </div>
          <div className={styles.stats}>
            <PitcherStats
              pitching={player.pitching}
              batting={player.batting}
              velocity={false}
              compact
              columns={1}
            />
          </div>
        </div>
      ) : (
        /*
          **野手は左に弾道と守備適性、右に能力。**
          弾道はラベルの右に矢印を置くだけの1行にして、縦を食わないようにする。
        */
        <div className={styles.body}>
          <div className={styles.figures}>
            <span className={styles.trajectoryRow}>
              <span className={styles.trajectoryLabel}>弾道</span>
              <TrajectoryArrow trajectory={player.batting.trajectory} size={13} />
            </span>
            <span className={styles.chartBox}>
              <AptitudeDiamond player={player} main={player.position} />
              <span className={styles.chartCaption}>守備適性</span>
            </span>
          </div>
          <div className={styles.stats}>
            <BatterStats batting={player.batting} compact columns={1} />
          </div>
        </div>
      )}

      {footer}
    </>
  )

  const className = selected ? `${styles.card} ${styles.selected}` : styles.card

  return onClick ? (
    <button type="button" className={className} style={style} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  )
}
