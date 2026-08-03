import { useEffect, useRef } from 'react'
import { dateOfDay, monthOfDay } from '@/core/calendar/days'
import type { BoardCell } from '@/core/types/board'
import { CELL_LABELS, CELL_MARKS } from '@/core/types/board'
import { TOURNAMENT_LABELS } from '@/core/types/tournament'
import styles from './BoardTrack.module.css'

type Props = {
  board: BoardCell[]
  position: number
}

/**
 * すごろくの盤面。1マス＝1日で1年365マスある。
 *
 * 全部を並べると読めないので、**現在地の前後だけを切り出して**表示する。
 * 前を少し残すのは「どこから来たか」が分かるようにするため。
 */
const BEHIND = 3
const AHEAD = 12

/** 大会・合宿は日付と名前を出す。飛ばせないマスなので予定として読めるようにする */
function noteOf(cell: BoardCell): string | null {
  if (cell.kind === 'tournament') {
    return cell.tournamentKind ? TOURNAMENT_LABELS[cell.tournamentKind] : CELL_LABELS.tournament
  }
  if (cell.kind === 'camp') return CELL_LABELS.camp
  if (cell.kind === 'goal') return '年度末'
  return null
}

export function BoardTrack({ board, position }: Props) {
  const currentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [position])

  const from = Math.max(0, position - BEHIND)
  const to = Math.min(board.length - 1, position + AHEAD)
  const window = board.slice(from, to + 1)

  return (
    <div className={styles.track}>
      {window.map((cell) => {
        const isCurrent = cell.index === position
        const classNames = [styles.cell, styles[cell.kind]]
        if (isCurrent) classNames.push(styles.current)
        else if (cell.index < position) classNames.push(styles.passed)

        const note = noteOf(cell)
        const date = dateOfDay(cell.index)
        // 月が変わる日は月を出して、季節の流れが読めるようにする
        const showMonth = date === 1 || cell.index === from

        return (
          <div
            key={cell.index}
            ref={isCurrent ? currentRef : undefined}
            className={styles.cellWrap}
          >
            <span className={styles.date}>
              {showMonth && <span className={styles.month}>{monthOfDay(cell.index)}月</span>}
              {date}
            </span>
            {isCurrent && <span className={styles.pin} />}
            <div className={classNames.join(' ')}>
              <span className={styles.mark}>{CELL_MARKS[cell.kind]}</span>
            </div>
            {/* 飛ばせないマスは名前を出す */}
            <span className={note ? styles.note : styles.noteEmpty}>{note ?? ''}</span>
          </div>
        )
      })}
    </div>
  )
}
