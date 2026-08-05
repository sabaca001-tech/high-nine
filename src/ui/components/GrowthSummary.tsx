import type { GameEvent } from '@/core/types/event'
import { ABILITY_LABELS } from '@/core/types/player'
import type { AbilityChange } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import styles from './GrowthSummary.module.css'

/** 弾道・球速も変化することがあるので、GrowableKey ではなく変化の型から取る */
type ChangeKey = AbilityChange['key']

type Props = {
  events: GameEvent[]
}

type PlayerGrowth = {
  playerId: string
  name: string
  /** 伸びの合計（マイナスもある） */
  total: number
  gains: { key: ChangeKey; delta: number }[]
}

/**
 * 直近の練習・試合の結果を**選手ごとに**表示する。
 *
 * 以前は能力ごとに集計して「ミート +1.0 ×6人」と出していた。
 * 数字は正しいのだが、**誰が伸びたのかが分からない**うえ、
 * 平均を出すと全員が同じだけ伸びたように見えてしまっていた。
 * 育成ゲームで知りたいのは「今の練習で誰が伸びたか」なので、名前で並べる。
 *
 * 人数が多い日もあるので高さに上限を置く（無いと手札を画面外へ押し出す）。
 */
export function GrowthSummary({ events }: Props) {
  const players = useGameStore((s) => s.game?.players)
  const rows = aggregate(events, players ?? [])
  if (rows.length === 0) return null

  return (
    <div className={styles.panel}>
      {rows.map((row) => (
        <div key={row.playerId} className={styles.row}>
          <span className={styles.name}>{row.name}</span>
          <span className={styles.gains}>
            {row.gains.map((gain) => (
              <span key={gain.key} className={styles.chip}>
                {ABILITY_LABELS[gain.key]}
                <span className={gain.delta > 0 ? styles.up : styles.down}>
                  {gain.delta > 0 ? '+' : ''}
                  {gain.delta}
                </span>
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 選手ごとにまとめ、伸びた順に並べる */
function aggregate(
  events: GameEvent[],
  players: { id: string; name: string }[],
): PlayerGrowth[] {
  const nameById = new Map(players.map((player) => [player.id, player.name]))
  const byPlayer = new Map<string, Map<ChangeKey, number>>()

  for (const event of events) {
    if (event.type !== 'ability') continue
    for (const change of event.changes) {
      const gains = byPlayer.get(change.playerId) ?? new Map<ChangeKey, number>()
      gains.set(change.key, (gains.get(change.key) ?? 0) + delta(change))
      byPlayer.set(change.playerId, gains)
    }
  }

  const rows: PlayerGrowth[] = []
  for (const [playerId, gains] of byPlayer) {
    const list = [...gains.entries()]
      .filter(([, value]) => value !== 0)
      .map(([key, value]) => ({ key, delta: value }))
      .sort((a, b) => b.delta - a.delta)
    if (list.length === 0) continue

    rows.push({
      playerId,
      // 卒業・引退で在籍していない選手の変化も流れてくるので、名前が引けないことがある
      name: nameById.get(playerId) ?? '選手',
      total: list.reduce((sum, gain) => sum + gain.delta, 0),
      gains: list,
    })
  }

  return rows.sort((a, b) => b.total - a.total)
}

function delta(change: AbilityChange): number {
  return change.after - change.before
}
