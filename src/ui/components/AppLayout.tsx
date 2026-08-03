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

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        <SoundToggle />
      </header>

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
