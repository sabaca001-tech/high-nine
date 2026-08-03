import { useEffect, useRef } from 'react'
import type { LogEntry } from '@/core/types/event'
import styles from './EventLog.module.css'

type Props = {
  entries: LogEntry[]
}

/** 出来事のログ。新しい行が追加されたら一番下まで自動スクロールする */
export function EventLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries.length])

  if (entries.length === 0) {
    return (
      <div className={styles.log}>
        <p className={styles.empty}>カードを選んで練習を始めよう</p>
      </div>
    )
  }

  return (
    <div className={styles.log}>
      {entries.map((entry) => (
        <p
          key={entry.id}
          className={
            entry.tone === 'normal' ? styles.entry : `${styles.entry} ${styles[entry.tone]}`
          }
        >
          {entry.text}
        </p>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
