import type { ReactNode } from 'react'

/** 指に追従する影。掴んでいる間だけ出す */
export function DragGhost({
  position,
  children,
}: {
  position: { x: number; y: number } | null
  children: ReactNode
}) {
  if (!position) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 50,
        opacity: 0.9,
        width: '60%',
        maxWidth: 260,
      }}
    >
      {children}
    </div>
  )
}
