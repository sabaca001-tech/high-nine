import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { toRank, overallRating } from '@/core/player/rating'
import type { Player } from '@/core/types/player'
import { plateGradient, rankColorOf } from '@/ui/theme/playerColors'
import styles from './NamePlate.module.css'

/**
 * ポジションで色分けした選手のネームプレート。
 *
 * 投手＝ピンク、捕手＝水色、内野＝黄、外野＝緑。
 * **左が本職の色**で、他に守れる系統があればその色が右へ混ざる。
 * 一覧を眺めるだけで「どこを守れる選手か」が読めるようにするための表示。
 *
 * 並べ替えは**左端のつまみ（⠿）からだけ**始まる。
 * プレート全体を掴めるようにしていた頃は、
 * プレートに `touch-action: none` が要るせいで
 * **一覧のほとんどの場所でスクロールできなかった**。
 */
export function NamePlate({
  player,
  /** 左端に出す番号やラベル（打順など） */
  lead,
  /** 右端に足す内容 */
  trailing,
  selected = false,
  dragging = false,
  onClick,
  /** つまみを押したとき。渡すとドラッグ用のつまみが出る */
  onHandlePointerDown,
  ...rest
}: {
  player: Player
  lead?: ReactNode
  trailing?: ReactNode
  selected?: boolean
  dragging?: boolean
  onClick?: () => void
  onHandlePointerDown?: (event: ReactPointerEvent) => void
} & Record<string, unknown>) {
  const rank = toRank(overallRating(player))

  const style = {
    background: plateGradient(player),
    '--rank-color': rankColorOf(rank),
  } as CSSProperties

  const classNames = [styles.plate]
  if (selected) classNames.push(styles.selected)
  if (dragging) classNames.push(styles.dragging)

  return (
    <div className={classNames.join(' ')} style={style} onClick={onClick} {...rest}>
      {onHandlePointerDown && (
        <span
          className={styles.handle}
          aria-label="つまんで移動"
          onPointerDown={onHandlePointerDown}
          onClick={(event) => event.stopPropagation()}
        >
          ⠿
        </span>
      )}
      {lead !== undefined && <span className={styles.lead}>{lead}</span>}
      <span className={styles.name}>{player.name}</span>
      <span className={styles.grade}>{player.grade}年</span>
      {trailing}
    </div>
  )
}
