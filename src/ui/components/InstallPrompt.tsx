import { useEffect, useState } from 'react'
import styles from './InstallPrompt.module.css'

/**
 * ホーム画面への追加を案内する。
 *
 * インストールできる状態でも、**プレイヤーはその存在に気づけない**。
 * Android/Chrome はブラウザが小さなバナーを出すこともあるが確実ではなく、
 * **iOS には自動の案内が一切無い**（共有メニューから手動でしか追加できない）。
 *
 * - Chrome 系 … `beforeinstallprompt` を捕まえてボタンで出す
 * - iOS Safari … 手順を文章で出す（API が存在しないため）
 *
 * ホーム画面から開いているときは何も出さない。もう入っているので用が無い。
 */

/** `beforeinstallprompt` の型。標準化されていないので最小限だけ書く */
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** 一度断られたら出さないための保存キー（セーブデータには入れない） */
const DISMISSED_KEY = 'hs-baseball-sim:install-dismissed'

/** ホーム画面から開いているか */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS だけ独自のプロパティを持つ
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** iOS の Safari か（`beforeinstallprompt` が来ない環境） */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [showIosSteps, setShowIosSteps] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1',
  )

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // ブラウザ既定のバナーを止めて、こちらのタイミングで出す
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (dismissed || isStandalone()) return null
  // Chrome 系で prompt が来ておらず、iOS でもないなら案内する相手がいない
  if (!event && !isIos()) return null

  const close = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  const install = async () => {
    if (!event) {
      setShowIosSteps(true)
      return
    }
    await event.prompt()
    await event.userChoice
    setEvent(null)
    close()
  }

  return (
    <div className={styles.panel}>
      <span className={styles.text}>
        <strong className={styles.title}>ホーム画面に追加できます</strong>
        {showIosSteps ? (
          // 記号で示さず言葉で書く。SF Symbols の文字は iOS 以外で豆腐になる
          <span className={styles.steps}>
            画面下の共有ボタン（四角に上向き矢印）→「ホーム画面に追加」
          </span>
        ) : (
          <span className={styles.steps}>アプリのように全画面で開き、オフラインでも遊べます</span>
        )}
      </span>

      {!showIosSteps && (
        <button type="button" className={styles.install} onClick={install}>
          追加
        </button>
      )}
      <button type="button" className={styles.close} onClick={close} aria-label="閉じる">
        ✕
      </button>
    </div>
  )
}
