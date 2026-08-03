import { CAMP_PLANS } from '@/core/camp/campDefs'
import { useGameStore } from '@/state/useGameStore'
import { PracticeIcon } from '@/ui/components/PracticeIcon'
import styles from './CampScreen.module.css'

/** 雪の粒。位置と速度をずらして規則的に見えないようにする */
const FLAKES = [
  { left: '8%', duration: 9, delay: 0 },
  { left: '24%', duration: 11, delay: 1.8 },
  { left: '41%', duration: 8, delay: 3.2 },
  { left: '58%', duration: 10.5, delay: 0.9 },
  { left: '73%', duration: 9.5, delay: 4.1 },
  { left: '89%', duration: 12, delay: 2.4 },
]

/**
 * 冬合宿の方針を選ぶ画面。
 * 年に1度、チームをまとめてどこに伸ばすかを決める。
 */
export function CampScreen() {
  const game = useGameStore((s) => s.game)
  const chooseCampPlan = useGameStore((s) => s.chooseCampPlan)

  if (!game) return null

  return (
    <div className={styles.screen}>
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

      <header className={styles.header}>
        <h1 className={styles.title}>冬合宿</h1>
        <p className={styles.subtitle}>
          {game.year}年目 12月 — 今年の締めくくりに何を鍛えるか
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
            <span className={styles.icon}>
              <PracticeIcon kind={plan.kind} size={28} />
            </span>
            <span>
              <span className={styles.label}>{plan.label}</span>
              <span className={styles.description}>{plan.description}</span>
            </span>
            <span className={styles.cost}>体力 -{plan.conditionCost}</span>
          </button>
        ))}

        <p className={styles.note}>
          選んだ内容が全部員にまとめて入り、しばらく練習効率も上がります
        </p>
      </div>
    </div>
  )
}
