import type { PracticeKind } from '@/core/types/card'
import type { LogEntry } from '@/core/types/event'
import type { Month } from '@/core/types/game'
import type { UniformId } from '@/core/team/uniforms'
import { particleOf, seasonOf } from '@/ui/theme/season'
import { teamColors } from '@/ui/theme/playerColors'
import { PlayerSprite } from './PlayerSprite'
import type { Pose } from './PlayerSprite'
import styles from './FieldScene.module.css'

/** 練習内容 → 選手の動き */
const POSE_BY_PRACTICE: Record<PracticeKind, Pose> = {
  batting: 'bat',
  running: 'run',
  fielding: 'field',
  shoulder: 'pitch',
  pitching: 'pitch',
  breaking: 'pitch',
  stamina: 'run',
  mental: 'idle',
  rest: 'rest',
  bunt: 'bat',
  longToss: 'bat',
  sprint: 'run',
  control: 'pitch',
  meeting: 'idle',
  groundskeeping: 'field',
  medical: 'rest',
  study: 'idle',
  outing: 'rest',
  teeBatting: 'bat',
  weight: 'idle',
  agility: 'run',
  machineBatting: 'bat',
  bullpen: 'pitch',
  videoStudy: 'idle',
}

/**
 * 背景に立たせる選手の配置（左位置・奥行きによる縮小率・向き）。
 *
 * 色は持たない。**帽子とユニフォームはチームで共通**なので、
 * 選んだユニフォームの色を全員に使う（CLAUDE.md）。
 * 以前は1人ずつ違う色にしていて、同じ部なのにバラバラだった。
 */
const FORMATION = [
  { left: '4%', scale: 1.1, flip: false },
  { left: '33%', scale: 0.72, flip: true },
  { left: '56%', scale: 0.88, flip: false },
  { left: '80%', scale: 0.62, flip: true },
]

type Props = {
  month: Month
  /** 直近に選んだ練習。未選択なら全員待機 */
  practice: PracticeKind | null
  /** チームのユニフォーム。全員に同じ色を使う */
  uniform: UniformId
  /** 画面に出す最新の出来事 */
  headline: LogEntry | null
  /** 吹き出しの下に流す直近のログ */
  chatter: LogEntry[]
  /**
   * 掛け声の帯を押したとき。
   * 渡すと**これまでのログを開くボタン**になる。
   */
  onOpenLog?: () => void
  /** ログを開いているか。矢印の向きに使う */
  logOpen?: boolean
}

/**
 * グラウンドの情景。
 *
 * 画像アセットを一切使わず SVG と CSS だけで描く。
 * 理由: 外部通信なしで動き、季節・時間帯の差し替えが色変数の変更だけで済むため。
 */
export function FieldScene({
  month,
  practice,
  uniform,
  headline,
  chatter,
  onOpenLog,
  logOpen = false,
}: Props) {
  const season = seasonOf(month)
  const colors = teamColors(uniform)
  const particle = particleOf(season)
  const pose = practice ? POSE_BY_PRACTICE[practice] : 'idle'

  return (
    <div className={styles.scene} data-season={season}>
      <Backdrop />
      <div className={styles.ground} />
      <div className={styles.baseline} />

      <div className={styles.players}>
        {FORMATION.map((spot, index) => (
          <div
            key={spot.left}
            className={styles.player}
            style={{
              left: spot.left,
              // 奥にいる選手ほど小さく、少し上に立たせて遠近感を出す
              // 下部は実況テキストの領域なので、選手はその上に立たせる
              bottom: `${20 + (1.1 - spot.scale) * 34}%`,
              transform: `scale(${spot.scale})`,
            }}
          >
            <PlayerSprite
              // 全員が同時に同じ動きをすると不自然なので、1人だけ待機させる
              pose={index === 1 ? 'idle' : pose}
              uniform={colors.uniform}
              capColor={colors.cap}
              flip={spot.flip}
            />
          </div>
        ))}
      </div>

      {particle && <Particles kind={particle} />}

      {headline && (
        <p className={`${styles.bubble} ${toneClass(headline.tone, 'bubble')}`}>{headline.text}</p>
      )}

      {/*
        **掛け声の帯は、これまでのログへの入口でもある。**
        直近3件が流れて消えるだけだったので、
        少し前に何が起きたのかを見返す手段がどこにも無かった。
      */}
      {onOpenLog ? (
        <button
          type="button"
          className={`${styles.chatter} ${styles.chatterButton}`}
          onClick={onOpenLog}
          aria-expanded={logOpen}
        >
          {chatter.map((entry) => (
            <span
              key={entry.id}
              className={`${styles.chatterLine} ${toneClass(entry.tone, 'chatter')}`}
            >
              {entry.text}
            </span>
          ))}
          <span className={styles.chatterMore}>
            {logOpen ? '閉じる ▲' : 'これまでの出来事 ▼'}
          </span>
        </button>
      ) : (
        <div className={styles.chatter}>
          {chatter.map((entry) => (
            <span
              key={entry.id}
              className={`${styles.chatterLine} ${toneClass(entry.tone, 'chatter')}`}
            >
              {entry.text}
            </span>
          ))}
        </div>
      )}

    </div>
  )
}

function toneClass(tone: LogEntry['tone'], prefix: 'bubble' | 'chatter'): string {
  if (tone === 'good') return prefix === 'bubble' ? styles.bubbleGood : styles.chatterGood
  if (tone === 'bad') return prefix === 'bubble' ? styles.bubbleBad : styles.chatterBad
  return ''
}

/** 遠景。山・校舎・防球ネット・木を1枚のSVGで描く */
function Backdrop() {
  return (
    <svg
      className={styles.backdrop}
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMax slice"
      role="presentation"
      aria-hidden="true"
    >
      {/* 遠くの山 */}
      <path d="M0 96 L70 52 L130 96 Z" fill="var(--hill-far)" />
      <path d="M100 100 L180 46 L260 100 Z" fill="var(--hill-far)" />
      <path d="M-20 108 L60 70 L150 108 Z" fill="var(--hill)" />
      <path d="M230 108 L320 62 L420 108 Z" fill="var(--hill)" />

      {/* 校舎 */}
      <rect x="248" y="66" width="130" height="46" fill="var(--building)" />
      <rect x="248" y="62" width="130" height="6" fill="var(--building-shade)" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={256 + i * 15} y={74} width="9" height="9" fill="var(--window)" />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={`b${i}`} x={256 + i * 15} y={90} width="9" height="9" fill="var(--window)" />
      ))}

      {/* 並木。地面の高さに合わせて小さめに並べる */}
      {[16, 62, 108, 158, 204, 250].map((x, i) => (
        <g key={x}>
          <rect x={x + 6} y={100} width="4" height="12" fill="var(--trunk)" />
          <circle cx={x + 8} cy={97} r={i % 2 === 0 ? 10 : 8} fill="var(--tree)" />
          <circle cx={x + 1} cy={101} r="6" fill="var(--tree)" />
          <circle cx={x + 15} cy={101} r="5.5" fill="var(--tree)" />
        </g>
      ))}

      {/* 芝 */}
      <rect x="0" y="108" width="400" height="30" fill="var(--grass)" />

      {/* 防球ネット（斜め格子） */}
      <g stroke="var(--net-line)" strokeWidth="0.7">
        {Array.from({ length: 34 }, (_, i) => (
          <line key={`n${i}`} x1={i * 14 - 60} y1="40" x2={i * 14} y2="120" />
        ))}
        {Array.from({ length: 34 }, (_, i) => (
          <line key={`m${i}`} x1={i * 14} y1="40" x2={i * 14 - 60} y2="120" />
        ))}
      </g>
      {/* 支柱 */}
      {[40, 140, 240, 340].map((x) => (
        <rect key={x} x={x} y="38" width="3" height="84" fill="var(--pole)" />
      ))}
      <rect x="0" y="118" width="400" height="4" fill="var(--pole)" />
    </svg>
  )
}

/** 桜・雪の粒 */
function Particles({ kind }: { kind: 'petal' | 'snow' }) {
  // 粒ごとに開始位置と速度をずらして、規則的に見えないようにする
  const items = [
    { left: '6%', duration: 7.5, delay: 0 },
    { left: '21%', duration: 9, delay: 1.4 },
    { left: '38%', duration: 6.8, delay: 2.8 },
    { left: '54%', duration: 8.6, delay: 0.7 },
    { left: '69%', duration: 7.2, delay: 3.6 },
    { left: '86%', duration: 9.4, delay: 2.1 },
  ]

  return (
    <div className={styles.particles}>
      {items.map((item) => (
        <span
          key={item.left}
          className={kind === 'snow' ? `${styles.particle} ${styles.snowFlake}` : styles.particle}
          style={{
            left: item.left,
            animationDuration: `${item.duration}s`,
            animationDelay: `${item.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
