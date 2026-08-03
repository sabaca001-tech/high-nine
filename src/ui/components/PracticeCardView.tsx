import { PRACTICE_LABELS } from '@/core/types/card'
import type { PracticeCard } from '@/core/types/card'
import { PracticeIcon } from './PracticeIcon'
import styles from './PracticeCardView.module.css'

type Props = {
  card: PracticeCard
  disabled?: boolean
  onSelect: (cardId: string) => void
}

/** 手札の1枚。数字（進むマス数）・アイコン・練習名を表示する */
export function PracticeCardView({ card, disabled = false, onSelect }: Props) {
  const classNames = [styles.card, styles[card.kind]]
  if (card.isRare) classNames.push(styles.rare)

  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        className={classNames.join(' ')}
        disabled={disabled}
        onClick={() => onSelect(card.id)}
        aria-label={`${PRACTICE_LABELS[card.kind]} ${card.number}マス進む${
          card.isRare ? '（キラ）' : ''
        }`}
      >
        <span className={styles.number}>{card.number}</span>
        {card.isRare && <span className={styles.rareMark}>★</span>}
        <span className={styles.icon}>
          <PracticeIcon kind={card.kind} />
        </span>
        <span className={styles.kind}>{PRACTICE_LABELS[card.kind]}</span>
      </button>
    </span>
  )
}
