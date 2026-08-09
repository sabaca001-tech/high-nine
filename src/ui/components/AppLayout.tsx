import type { ReactNode } from 'react'
import { useState } from 'react'
import { useGameStore } from '@/state/useGameStore'
import type { Screen } from '@/state/useGameStore'
import { isSoundEnabled, playSound, setSoundEnabled } from '@/ui/sound/sound'
import styles from './AppLayout.module.css'

type Props = {
  title: string
  subtitle?: string
  /** 本文をスクロール可能にする（一覧画面など） */
  scrollable?: boolean
  children: ReactNode
}

/** 見出しをタップしてタイトルへ戻る前の確認 */
const BACK_CONFIRM = 'タイトル画面に戻りますか？（進行は自動で保存されています）'

const NAV_ITEMS: { screen: Screen; icon: string; label: string }[] = [
  { screen: 'home', icon: '⚾️', label: '練習' },
  { screen: 'lineup', icon: '📋', label: 'スタメン' },
  { screen: 'players', icon: '👥', label: '部員' },
  { screen: 'shop', icon: '🛒', label: 'ショップ' },
  { screen: 'scout', icon: '🔍', label: 'スカウト' },
  { screen: 'data', icon: '📊', label: 'データ' },
]

/** 効果音の切り替え。設定は端末に保存される */
function SoundToggle() {
  const [enabled, setEnabled] = useState(isSoundEnabled)

  return (
    <button
      type="button"
      className={styles.soundButton}
      aria-label={enabled ? '効果音をオフにする' : '効果音をオンにする'}
      onClick={() => {
        const next = !enabled
        setSoundEnabled(next)
        setEnabled(next)
        if (next) playSound('tap')
      }}
    >
      {enabled ? '🔊' : '🔇'}
    </button>
  )
}

/** 全画面共通の枠（ヘッダー・本文・下部ナビ） */
export function AppLayout({ title, subtitle, scrollable = false, children }: Props) {
  const screen = useGameStore((s) => s.screen)
  const setScreen = useGameStore((s) => s.setScreen)
  const backToTitle = useGameStore((s) => s.backToTitle)
  const [askingBack, setAskingBack] = useState(false)

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        {/*
          **見出しからタイトルへ戻れる。** 戻る導線がどこにも無く、
          別の学校で始めたいときにタブを閉じるしかなかった。
          誤爆すると進行中の画面から飛ばされるので、一度だけ確認する
        */}
        <button
          type="button"
          className={styles.title}
          onClick={() => setAskingBack(true)}
          aria-label={`${title}｜タイトル画面へ戻る`}
        >
          <h1 className={styles.titleText}>{title}</h1>
          <span className={styles.titleHint}>▾</span>
        </button>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        <SoundToggle />
      </header>

      {askingBack && (
        <div className={styles.backSheet}>
          <p className={styles.backText}>{BACK_CONFIRM}</p>
          <div className={styles.backButtons}>
            <button
              type="button"
              className={styles.backCancel}
              onClick={() => setAskingBack(false)}
            >
              続ける
            </button>
            <button
              type="button"
              className={styles.backGo}
              onClick={() => {
                setAskingBack(false)
                backToTitle()
              }}
            >
              タイトルへ
            </button>
          </div>
        </div>
      )}

      <main className={scrollable ? `${styles.body} ${styles.scrollBody}` : styles.body}>
        {children}
      </main>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          // 選手詳細は部員一覧の一部として扱う
          const isActive =
            screen === item.screen ||
            (item.screen === 'players' &&
              (screen === 'playerDetail' || screen === 'alumni'))
          return (
            <button
              key={item.screen}
              type="button"
              className={isActive ? `${styles.navButton} ${styles.navActive}` : styles.navButton}
              onClick={() => setScreen(item.screen)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
