import { useState } from 'react'
import { REPUTATION_GRADE_LABELS, reputationGrade } from '@/core/types/season'
import type { GameState } from '@/core/types/game'
import { useGameStore } from '@/state/useGameStore'
import * as storage from '@/save/storage'
import styles from './TitleScreen.module.css'

/**
 * タイトル画面。
 *
 * セーブが3枠あるので、**枠を選ぶことが最初の操作**になる。
 * 中身のある枠を押せば続きから、空の枠を押せば新規作成へ進む。
 */
export function TitleScreen() {
  const setScreen = useGameStore((s) => s.setScreen)
  const continueGame = useGameStore((s) => s.continueGame)
  const deleteSave = useGameStore((s) => s.deleteSave)
  const setNewGameSlot = useGameStore((s) => s.setNewGameSlot)
  const hasSave = useGameStore((s) => s.hasSave)

  // hasSave が変わるたびに読み直す（削除・新規作成の直後に反映するため）
  const [reloadKey, setReloadKey] = useState(0)
  const slots = useSlots(reloadKey, hasSave)

  /** 削除の確認中の枠。null なら確認していない */
  const [confirming, setConfirming] = useState<number | null>(null)

  return (
    <div className={styles.screen}>
      <span className={styles.logo}>⚾️</span>
      <h1 className={styles.title}>ハイスクール・ナイン</h1>
      <p className={styles.tagline}>3年間で、最高のチームをつくれ。</p>

      <div className={styles.slots}>
        {slots.map(({ slot, state }) => (
          <div key={slot} className={styles.slot}>
            <button
              type="button"
              className={state ? styles.slotButton : `${styles.slotButton} ${styles.slotEmpty}`}
              onClick={() => {
                setConfirming(null)
                if (state) {
                  continueGame(slot)
                } else {
                  setNewGameSlot(slot)
                  setScreen('newGame')
                }
              }}
            >
              <span className={styles.slotNumber}>{slot}</span>
              {state ? (
                <span className={styles.slotBody}>
                  <span className={styles.slotName}>{state.schoolName}</span>
                  <span className={styles.slotMeta}>{describe(state)}</span>
                </span>
              ) : (
                <span className={styles.slotBody}>
                  <span className={styles.slotName}>空き</span>
                  <span className={styles.slotMeta}>ここから新しく始める</span>
                </span>
              )}
            </button>

            {/* 空きの枠にも同じ幅を空けて、ボタンの右端を揃える */}
            {!state && <span className={styles.deleteSpacer} aria-hidden="true" />}

            {state &&
              (confirming === slot ? (
                <span className={styles.confirmRow}>
                  <button
                    type="button"
                    className={styles.confirmDelete}
                    onClick={() => {
                      deleteSave(slot)
                      setConfirming(null)
                      setReloadKey((key) => key + 1)
                    }}
                  >
                    消す
                  </button>
                  <button
                    type="button"
                    className={styles.confirmCancel}
                    onClick={() => setConfirming(null)}
                  >
                    やめる
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.deleteButton}
                  aria-label={`${slot}番のセーブデータを削除`}
                  onClick={() => setConfirming(slot)}
                >
                  削除
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 枠の中身を読む。描画のたびに読み直さないよう key で制御する */
function useSlots(reloadKey: number, hasSave: boolean): storage.SlotSummary[] {
  const [cache, setCache] = useState<{ key: string; slots: storage.SlotSummary[] }>(() => ({
    key: '',
    slots: storage.listSlots(),
  }))

  const key = `${reloadKey}:${hasSave}`
  if (cache.key !== key) {
    const slots = storage.listSlots()
    setCache({ key, slots })
    return slots
  }
  return cache.slots
}

/** 枠の見出しに出す一言 */
function describe(state: GameState): string {
  const grade = reputationGrade(state.reputation)
  return `${state.year}年目 ${state.month}月 / ${REPUTATION_GRADE_LABELS[grade]} / 部員${state.players.length}人`
}
