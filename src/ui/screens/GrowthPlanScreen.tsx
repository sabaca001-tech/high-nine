import { useState } from 'react'
import { ALL_POSITIONS } from '@/core/lineup/aptitude'
import {
  defaultGrowthOrder,
  growthOrderOf,
  positionGrowthMultiplier,
} from '@/core/player/trainingFocus'
import { ABILITY_LABELS, POSITION_LABELS } from '@/core/types/player'
import type { Position } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import styles from './GrowthPlanScreen.module.css'

/**
 * ポジションごとの成長方針。
 *
 * **おまかせ練習の伸び方は本職で傾く**（`POSITION_GROWTH`）が、
 * その傾き方は決め打ちだった。
 * 「うちの一塁手は走らせたい」「捕手にも打ってほしい」という意図が通らない。
 *
 * ここで能力を並べ替えると、その順位がそのまま倍率になる。
 * **倍率ではなく順位で持つ**ので、どう並べ替えても
 * チーム全体の成長量は変わらない（変わるのは配分だけ）。
 */
export function GrowthPlanScreen() {
  const game = useGameStore((s) => s.game)
  const setScreen = useGameStore((s) => s.setScreen)
  const setGrowthOrder = useGameStore((s) => s.setGrowthOrder)
  const [position, setPosition] = useState<Position>('P')

  if (!game) return null

  const order = growthOrderOf(position, game.growthPlan)
  const isDefault = order.join() === defaultGrowthOrder(position).join()

  /** 1つ入れ替える。端では何もしない */
  const swap = (index: number, to: number) => {
    if (to < 0 || to >= order.length) return
    const next = [...order]
    ;[next[index], next[to]] = [next[to], next[index]]
    setGrowthOrder(position, next)
  }

  return (
    <AppLayout title="成長方針" subtitle="ポジションごとの優先順" scrollable>
      <button type="button" className={styles.back} onClick={() => setScreen('players')}>
        ← 部員一覧へ
      </button>

      <p className={styles.note}>
        練習方針が「チーム練習」の選手は、本職での優先順に沿って伸びます。
        上にあるほど伸びやすく、下ほど鈍くなります。
        並べ替えてもチーム全体の成長量は変わりません（配分が変わるだけです）。
      </p>

      <div className={styles.tabs}>
        {ALL_POSITIONS.map((value) => (
          <button
            key={value}
            type="button"
            className={value === position ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setPosition(value)}
          >
            {value}
          </button>
        ))}
      </div>

      <div className={styles.head}>
        <span className={styles.headTitle}>{POSITION_LABELS[position]}</span>
        {isDefault ? (
          <span className={styles.headNote}>既定のまま</span>
        ) : (
          <button
            type="button"
            className={styles.reset}
            onClick={() => setGrowthOrder(position, defaultGrowthOrder(position))}
          >
            既定に戻す
          </button>
        )}
      </div>

      <ol className={styles.list}>
        {order.map((key, index) => (
          <li key={key} className={styles.row}>
            <span className={styles.rank}>{index + 1}</span>
            <span className={styles.name}>{ABILITY_LABELS[key]}</span>
            <span className={styles.weight}>
              ×{positionGrowthMultiplier(position, key, game.growthPlan).toFixed(2)}
            </span>
            <span className={styles.moves}>
              <button
                type="button"
                className={styles.move}
                disabled={index === 0}
                aria-label={`${ABILITY_LABELS[key]}を上げる`}
                onClick={() => swap(index, index - 1)}
              >
                ▲
              </button>
              <button
                type="button"
                className={styles.move}
                disabled={index === order.length - 1}
                aria-label={`${ABILITY_LABELS[key]}を下げる`}
                onClick={() => swap(index, index + 1)}
              >
                ▼
              </button>
            </span>
          </li>
        ))}
      </ol>

      <p className={styles.footNote}>
        選手ごとの得意・苦手のほうが効き方は大きいので、
        並べ替えても「遊撃手だが打てる」選手は生まれます。
        個別に伸ばしたい能力があるときは、選手データの「練習」タブで指定してください。
      </p>
    </AppLayout>
  )
}
