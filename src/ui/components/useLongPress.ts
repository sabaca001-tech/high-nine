import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * 長押しとタップを1つの要素で使い分ける。
 *
 * **タップは編成、長押しは詳細** という住み分けにするために要る。
 * 一覧の行はすでにタップ（選択・入れ替え）とドラッグ（並べ替え）で埋まっていて、
 * 「この選手をじっくり見たい」の入口が無かった。
 *
 * 押している間に指が動いたら**一覧のスクロール**とみなして取り消す。
 * これが無いと、スクロールしようとしただけで詳細画面へ飛ばされる。
 *
 * 長押しが成立したあとは、指を離したときの `click` を1回だけ握り潰す。
 * 潰さないと「詳細を開く」と「入れ替え待ちにする」が同時に起きる。
 */
const HOLD_MS = 450

/** これ以上動いたらスクロールとみなす（px） */
const MOVE_TOLERANCE = 8

export function useLongPress({
  onLongPress,
  onClick,
}: {
  onLongPress: () => void
  onClick: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  /** 長押しが成立したか。直後の click を捨てるために使う */
  const fired = useRef(false)

  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
  }

  // 画面から消えるときにタイマーを残さない
  useEffect(() => cancel, [])

  return {
    onPointerDown: (event: ReactPointerEvent) => {
      fired.current = false
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        onLongPress()
      }, HOLD_MS)
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const start = origin.current
      if (!start) return
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      if (moved > MOVE_TOLERANCE) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClick: () => {
      if (fired.current) {
        fired.current = false
        return
      }
      onClick()
    },
    // 長押しで iOS の吹き出しやテキスト選択が出ないようにする
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  }
}
