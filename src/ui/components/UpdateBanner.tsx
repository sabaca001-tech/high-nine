import { useEffect, useState } from 'react'
import styles from './UpdateBanner.module.css'

/**
 * 新しい版が配信されたことを知らせる。
 *
 * Service Worker はキャッシュ優先なので、**黙っていると古い版のまま遊び続ける**。
 * かといって勝手に差し替えると、画面に古い JS が載ったまま
 * 新しいアセットを取りに行って壊れる。
 * 用意ができたことだけ伝えて、**切り替えはプレイヤーに選ばせる**。
 */
export function UpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let disposed = false

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration || disposed) return

      // すでに新しい版が待機している（前回の訪問で落ちてきた場合）
      if (registration.waiting) setWaiting(registration.waiting)

      registration.addEventListener('updatefound', () => {
        const next = registration.installing
        if (!next) return
        next.addEventListener('statechange', () => {
          // controller が居る＝初回インストールではなく差し替え
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            setWaiting(next)
          }
        })
      })
    })

    return () => {
      disposed = true
    }
  }, [])

  if (!waiting) return null

  const apply = () => {
    // 差し替わったら読み直す。1回だけ聞く（無限リロードを避ける）
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    )
    waiting.postMessage('SKIP_WAITING')
  }

  return (
    <div className={styles.banner}>
      <span className={styles.text}>新しい版があります</span>
      <button type="button" className={styles.button} onClick={apply}>
        更新する
      </button>
    </div>
  )
}
