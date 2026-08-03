import { ROUTES } from '@/core/board/boardDefs'
import type { Route } from '@/core/board/boardDefs'
import { CELL_MARKS } from '@/core/types/board'
import { useGameStore } from '@/state/useGameStore'
import { playSound } from '@/ui/sound/sound'
import styles from './ForkScreen.module.css'

/**
 * ルート分岐の選択画面。
 * この先のマスの傾向を選ぶ。
 */
export function ForkScreen() {
  const game = useGameStore((s) => s.game)
  const chooseRoute = useGameStore((s) => s.chooseRoute)

  if (!game) return null

  const handleChoose = (routeId: string) => {
    playSound('tap')
    chooseRoute(routeId)
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>道が分かれている</h1>
        <p className={styles.subtitle}>この先のマスの傾向を選べます</p>
      </header>

      <div className={styles.body}>
        {ROUTES.map((route) => (
          <button
            key={route.id}
            type="button"
            className={styles.route}
            onClick={() => handleChoose(route.id)}
          >
            <span className={styles.label}>{route.label}</span>
            <span className={styles.description}>{route.description}</span>
            <span className={styles.preview}>
              <RoutePreview route={route} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** その道で出やすいマスを、出現率の高い順に見せる */
function RoutePreview({ route }: { route: Route }) {
  const total = route.weights.reduce((sum, entry) => sum + entry.weight, 0)

  return (
    <>
      {[...route.weights]
        .sort((a, b) => b.weight - a.weight)
        .map((entry) => (
          <span key={entry.value} className={`${styles.chip} ${styles[entry.value]}`}>
            {CELL_MARKS[entry.value]} {Math.round((entry.weight / total) * 100)}%
          </span>
        ))}
    </>
  )
}
