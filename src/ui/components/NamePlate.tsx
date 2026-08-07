import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { toRank, overallRating } from '@/core/player/rating'
import type { Player } from '@/core/types/player'
import { plateGradient, rankColorOf } from '@/ui/theme/playerColors'
import { useLongPress } from './useLongPress'
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
  preview = false,
  dragging = false,
  onClick,
  /** 長押ししたとき。渡すと長押しで詳細を開けるようになる */
  onLongPress,
  /** つまみを押したとき。渡すとドラッグ用のつまみが出る */
  onHandlePointerDown,
  ...rest
}: {
  player: Player
  lead?: ReactNode
  trailing?: ReactNode
  /** 入れ替え待ち（2回タップ）。次にタップした相手と入れ替わる */
  selected?: boolean
  /** 能力を見ているだけ（1回タップ） */
  preview?: boolean
  dragging?: boolean
  onClick?: () => void
  onLongPress?: () => void
  onHandlePointerDown?: (event: ReactPointerEvent) => void
} & Record<string, unknown>) {
  const rating = overallRating(player)
  const rank = toRank(rating)

  const style = {
    background: plateGradient(player),
    '--rank-color': rankColorOf(rank),
  } as CSSProperties

  // 長押しを渡されたときだけ、タップと長押しを使い分ける
  const press = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    onClick: onClick ?? (() => {}),
  })
  const pressProps = onLongPress ? press : { onClick }

  const classNames = [styles.plate]
  if (selected) classNames.push(styles.selected)
  else if (preview) classNames.push(styles.preview)
  if (dragging) classNames.push(styles.dragging)

  return (
    <div className={classNames.join(' ')} style={style} {...pressProps} {...rest}>
      {onHandlePointerDown && (
        <span
          className={styles.handle}
          aria-label="つまんで移動"
          onPointerDown={(event) => {
            // つまみからのドラッグは長押し判定に混ぜない
            event.stopPropagation()
            onHandlePointerDown(event)
          }}
          onClick={(event) => event.stopPropagation()}
        >
          ⠿
        </span>
      )}
      {lead !== undefined && <span className={styles.lead}>{lead}</span>}
      <span className={styles.name}>{player.name}</span>
      {/*
        総合力は**名前のすぐ横**に出す。
        誰と誰を入れ替えるかは結局この数字で決めるので、
        1人ずつタップして能力を開かないと比べられないのでは編成にならない
      */}
      <span className={styles.rating}>{rating}</span>
      <span className={styles.grade}>{player.grade}年</span>
      {trailing}
    </div>
  )
}
