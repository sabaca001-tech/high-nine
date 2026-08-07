import { CAMP_PLANS, CAMP_SEASON_LABELS, campSeasonOf } from '@/core/camp/campDefs'
import { useGameStore } from '@/state/useGameStore'
import styles from './CampScreen.module.css'

/** 冬の雪の粒。位置と速度をずらして規則的に見えないようにする */
const FLAKES = [
  { left: '8%', duration: 9, delay: 0 },
  { left: '24%', duration: 11, delay: 1.8 },
  { left: '41%', duration: 8, delay: 3.2 },
  { left: '58%', duration: 10.5, delay: 0.9 },
  { left: '73%', duration: 9.5, delay: 4.1 },
  { left: '89%', duration: 12, delay: 2.4 },
]

/** 方針ごとの記号。練習の絵ではなく「何を掴みに行くか」を出す */
const PLAN_MARKS: Record<string, string> = {
  batting: '打',
  fielding: '守',
  pitching: '投',
  mental: '心',
}

/**
 * 合宿の方針を選ぶ画面。年2回（夏・冬）。
 *
 * **能力は伸びない。** ここで狙うのは特殊能力で、
 * 誰が掴むかは選べない（信頼度が高い選手ほど選ばれやすい）。
 */
export function CampScreen() {
  const game = useGameStore((s) => s.game)
  const chooseCampPlan = useGameStore((s) => s.chooseCampPlan)

  if (!game) return null

  const season = campSeasonOf(game.month)
  const label = CAMP_SEASON_LABELS[season]

  return (
    <div className={styles.screen} data-season={season}>
      {season === 'winter' && (
        <div className={styles.snow}>
          {FLAKES.map((flake) => (
            <span
              key={flake.left}
              className={styles.flake}
              style={{
                left: flake.left,
                animationDuration: `${flake.duration}s`,
                animationDelay: `${flake.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      <header className={styles.header}>
        <h1 className={styles.title}>{label}</h1>
        <p className={styles.subtitle}>
          {game.year}年目 {game.month}月 —{' '}
          {season === 'summer' ? '新チームで何を掴みに行くか' : '最後の仕上げに何を掴みに行くか'}
        </p>
      </header>

      <div className={styles.body}>
        {CAMP_PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={styles.plan}
            onClick={() => chooseCampPlan(plan.id)}
          >
            <span className={styles.mark}>{PLAN_MARKS[plan.id]}</span>
            <span>
              <span className={styles.label}>{plan.label}</span>
              <span className={styles.description}>{plan.description}</span>
            </span>
            <span className={styles.cost}>体力 -{plan.conditionCost}</span>
          </button>
        ))}

        <p className={styles.note}>
          何人かが特殊能力の習得に挑戦します。信頼度が高い選手ほど選ばれやすく、
          信頼度60以上なら金特を狙うことがあります。能力値は上がりません。
        </p>
      </div>
    </div>
  )
}
