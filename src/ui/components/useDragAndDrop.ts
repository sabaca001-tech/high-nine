import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * 指でつまんで動かせる一覧。
 *
 * HTML5 の drag&drop はタッチ端末で動かないので、
 * **ポインタイベント（pointerdown/move/up）で自前に組む**。
 * マウスでも指でも同じ経路で動く。
 *
 * 掴んだ要素は半透明の影として指に追従させ、
 * 離した位置の要素を `elementFromPoint` で拾って落とし先を決める。
 */

/** 掴んでいるもの */
export type DragItem = {
  /** 並べ替えの単位を表すid（選手idなど） */
  id: string
  /** どの列から掴んだか */
  from: string
}

export type DropTarget = {
  /** 落とした先の列 */
  to: string
  /** 落とした先の位置。要素の上でなければ null（末尾扱い） */
  id: string | null
}

/** ドラッグと判定するまでの移動距離。これ未満はタップとして扱う */
const DRAG_THRESHOLD = 6

export function useDragAndDrop(onDrop: (item: DragItem, target: DropTarget) => void) {
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const pending = useRef<DragItem | null>(null)

  const handlePointerDown = useCallback((item: DragItem, event: ReactPointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY }
    pending.current = item
  }, [])

  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    if (!start.current || !pending.current) return

    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y

    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return

    // 動かし始めたらスクロールさせない
    event.preventDefault()
    setDragging(pending.current)
    setPosition({ x: event.clientX, y: event.clientY })
  }, [dragging])

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const item = dragging
      start.current = null
      pending.current = null
      setDragging(null)
      setPosition(null)
      if (!item) return

      // 指を離した位置にある要素から、落とし先の列と位置を読む
      const element = document.elementFromPoint(event.clientX, event.clientY)
      const zone = element?.closest<HTMLElement>('[data-drop-zone]')
      if (!zone?.dataset.dropZone) return

      const over = element?.closest<HTMLElement>('[data-drop-id]')
      onDrop(item, { to: zone.dataset.dropZone, id: over?.dataset.dropId ?? null })
    },
    [dragging, onDrop],
  )

  return { dragging, position, handlePointerDown, handlePointerMove, handlePointerUp }
}

