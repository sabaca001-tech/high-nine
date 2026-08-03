import styles from './PlayerSprite.module.css'

/** スプライトの動作。選んだ練習内容に応じて切り替える */
export type Pose = 'idle' | 'bat' | 'pitch' | 'run' | 'field' | 'rest'

type Props = {
  pose?: Pose
  /** ユニフォームの色。同じ画面に並べたとき見分けがつくよう変える */
  uniform?: string
  capColor?: string
  /** 左右反転させる */
  flip?: boolean
  size?: number
}

// 色の実体は tokens.css。ここでは変数名だけを参照する
const SKIN = 'var(--skin)'
const OUTLINE = 'var(--sprite-outline)'

/**
 * デフォルメ選手のスプライト。
 * 外部画像を使わず SVG で描くことで、オフラインでも軽く動きアセット管理も不要にする。
 */
export function PlayerSprite({
  pose = 'idle',
  uniform = 'var(--uniform-a)',
  capColor = 'var(--cap-a)',
  flip = false,
  size = 56,
}: Props) {
  const bodyClass = [styles.body]
  if (pose === 'run') bodyClass.push(styles.runBody)
  if (pose === 'field') bodyClass.push(styles.crouch)
  if (pose === 'rest') bodyClass.push(styles.sit)

  return (
    <svg
      className={styles.sprite}
      width={size}
      height={size * 1.15}
      viewBox="0 0 40 62"
      role="presentation"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <g className={bodyClass.join(' ')}>
        {/* 脚 */}
        <g className={pose === 'run' ? styles.legFront : undefined}>
          <rect x="13" y="44" width="6" height="13" rx="3" fill={uniform} stroke={OUTLINE} />
        </g>
        <g className={pose === 'run' ? styles.legBack : undefined}>
          <rect x="21" y="44" width="6" height="13" rx="3" fill={uniform} stroke={OUTLINE} />
        </g>

        {/* 胴体 */}
        <rect x="11" y="30" width="18" height="18" rx="7" fill={uniform} stroke={OUTLINE} />

        {/* 後ろ側の腕（バット・グラブを持たない方） */}
        <rect x="8" y="33" width="5" height="11" rx="2.5" fill={uniform} stroke={OUTLINE} />

        {/* ポーズ別の装備 */}
        {pose === 'bat' && (
          <g className={styles.batSwing}>
            <rect x="24" y="33" width="5" height="10" rx="2.5" fill={uniform} stroke={OUTLINE} />
            <rect
              x="25.5"
              y="8"
              width="3.5"
              height="26"
              rx="1.75"
              fill="var(--bat-wood)"
              stroke={OUTLINE}
            />
          </g>
        )}

        {pose === 'pitch' && (
          <>
            <g className={styles.throwArm}>
              <rect x="24" y="33" width="5" height="12" rx="2.5" fill={uniform} stroke={OUTLINE} />
            </g>
            <circle className={styles.ball} cx="30" cy="30" r="3" fill="#fff" stroke={OUTLINE} />
          </>
        )}

        {pose === 'field' && (
          <>
            <rect x="25" y="34" width="5" height="10" rx="2.5" fill={uniform} stroke={OUTLINE} />
            <circle cx="31" cy="45" r="6" fill="var(--glove)" stroke={OUTLINE} />
          </>
        )}

        {(pose === 'idle' || pose === 'run' || pose === 'rest') && (
          <rect x="25" y="33" width="5" height="11" rx="2.5" fill={uniform} stroke={OUTLINE} />
        )}

        {/* 頭 */}
        <circle cx="20" cy="19" r="12.5" fill={SKIN} stroke={OUTLINE} />
        {/* 帽子 */}
        <path d="M7.5 17 A12.5 12.5 0 0 1 32.5 17 Z" fill={capColor} stroke={OUTLINE} />
        <path d="M30 17 h7 a2 2 0 0 1 0 4 h-7 z" fill={capColor} stroke={OUTLINE} />
        {/* 目と口 */}
        <circle cx="16" cy="22" r="1.8" fill={OUTLINE} />
        <circle cx="24" cy="22" r="1.8" fill={OUTLINE} />
        <path
          d="M18 27 q2 2 4 0"
          fill="none"
          stroke={OUTLINE}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

/** 一覧表示用の顔だけのアイコン。15人並べても軽い */
export function PlayerFace({
  uniform = 'var(--uniform-a)',
  capColor = 'var(--cap-a)',
  size = 30,
}: Pick<Props, 'uniform' | 'capColor' | 'size'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="presentation" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill={uniform} stroke={capColor} strokeWidth="2.5" />
      <circle cx="20" cy="24" r="13" fill={SKIN} stroke={OUTLINE} />
      <path d="M7 22 A13 13 0 0 1 33 22 Z" fill={capColor} stroke={OUTLINE} />
      <circle cx="16" cy="26" r="1.8" fill={OUTLINE} />
      <circle cx="24" cy="26" r="1.8" fill={OUTLINE} />
    </svg>
  )
}
