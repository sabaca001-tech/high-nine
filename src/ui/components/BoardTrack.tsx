import { useEffect, useRef } from 'react'
import { dateOfDay, dayOfCell, monthOfDay } from '@/core/calendar/days'
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
 * 全部を並べると読めないので、**現在地から先だけを切り出して**表示する。
 *
 * **現在地を左端に置く。** 過ぎたマスを左に残していた頃は、
 * 手札で進める5マス先が画面の外に出てしまい、
 * 「どのカードでどこに止まるか」が読めなかった。
 * どこから来たかより、これからどこへ行くかのほうが判断に要る。
 *
 * 先は2週間ぶん見せる。カードは最大5マスしか進まないので、
 * 判断には5マスあれば足りる。その先は大会・合宿に気づくための余白。
 */
const BEHIND = 0
const AHEAD = 14

/** 大会・合宿は日付と名前を出す。飛ばせないマスなので予定として読めるようにする */
function noteOf(cell: BoardCell): string | null {
  if (cell.kind === 'tournament') {
    if (!cell.tournamentKind) return CELL_LABELS.tournament
    // 回戦ごとに別のマスなので、何回戦かまで出す
    const label = TOURNAMENT_LABELS[cell.tournamentKind]
    return cell.round ? `${label} ${cell.round}回戦` : label
  }
  if (cell.kind === 'camp') return CELL_LABELS.camp
  if (cell.kind === 'goal') return '年度末'
  return null
}

export function BoardTrack({ board, position }: Props) {
  const currentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 現在地を**左端**に寄せる。中央に寄せると先が見えなくなる
    currentRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
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
        // 1マス＝1日。マス番号がそのまま年度の何日目かになる
        const day = dayOfCell(cell.index)
        const date = dateOfDay(day)
        // 月が変わったマスは月を出して、季節の流れが読めるようにする
        const showMonth =
          cell.index === from || monthOfDay(day) !== monthOfDay(dayOfCell(cell.index - 1))

        return (
          <div
            key={cell.index}
            ref={isCurrent ? currentRef : undefined}
            className={styles.cellWrap}
          >
            <span className={styles.date}>
              {showMonth && <span className={styles.month}>{monthOfDay(day)}月</span>}
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
