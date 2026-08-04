import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ALL_POSITIONS, isPlayable } from '@/core/lineup/aptitude'
import { AUTO_LINEUP_PLANS, validateLineup } from '@/core/lineup/autoLineup'
import { FIRST_SQUAD_SIZE } from '@/core/player/squad'
import { overallRating, toRank, trajectoryStars } from '@/core/player/rating'
import { ABILITY_LABELS, MOTIVATION_LABELS } from '@/core/types/player'
import type { Player, Position } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { NamePlate } from '@/ui/components/NamePlate'
import { DragGhost } from '@/ui/components/DragList'
import { useDragAndDrop } from '@/ui/components/useDragAndDrop'
import type { DragItem, DropTarget } from '@/ui/components/useDragAndDrop'
import {
  POSITION_GROUP_COLORS,
  POSITION_GROUP_LABELS,
  rankColorOf,
} from '@/ui/theme/playerColors'
import type { PositionGroup } from '@/ui/theme/playerColors'
import styles from './LineupScreen.module.css'

/**
 * スタメンとベンチ入りの編成画面。
 *
 * 3つの列（スタメン／ベンチ入り／ベンチ外）を**指でつまんで入れ替える**。
 * 縦画面なので3列を横に並べるのは諦め、縦に積んで
 * 選んだ選手の能力だけ右側に固定表示する。
 *
 * 守備位置の変更はドラッグと操作が衝突するので、
 * ネームプレート内のボタンをタップして選ぶ形に分けている。
 */

const ZONE_STARTER = 'starter'
const ZONE_BENCH = 'bench'
const ZONE_OUT = 'out'

/**
 * スタメン・ベンチ入りの編成本体。
 * スタメン画面と、試合前の確認画面の両方から使う。
 */
export function LineupEditor() {
  const game = useGameStore((s) => s.game)
  const setLineup = useGameStore((s) => s.setLineup)
  const autoLineup = useGameStore((s) => s.autoLineup)
  const setSquad = useGameStore((s) => s.setSquad)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [positionFor, setPositionFor] = useState<number | null>(null)
  /** おまかせの方針を選ぶ一覧を出しているか */
  const [showPlans, setShowPlans] = useState(false)

  const handleDrop = (item: DragItem, target: DropTarget) => {
    if (!game) return

    const starterIds = game.lineup.slots.map((slot) => slot.playerId)
    const starterSet = new Set(starterIds)

    if (target.to === ZONE_STARTER) {
      const index = target.id ? starterIds.indexOf(target.id) : -1
      if (index < 0) return

      const slots = [...game.lineup.slots]
      const fromIndex = starterIds.indexOf(item.id)

      if (fromIndex >= 0) {
        // スタメン同士なら打順を入れ替える
        const swapped = slots[fromIndex].playerId
        slots[fromIndex] = { ...slots[fromIndex], playerId: slots[index].playerId }
        slots[index] = { ...slots[index], playerId: swapped }
        setLineup({ slots })
        return
      }

      // 控えから上げる。押し出された選手はベンチ入りへ回る
      const pushedOut = slots[index].playerId
      slots[index] = { ...slots[index], playerId: item.id }
      setLineup({ slots })

      const next = game.squad.includes(item.id) ? [...game.squad] : [...game.squad, item.id]
      if (!next.includes(pushedOut)) next.push(pushedOut)
      setSquad(next)
      return
    }

    // スタメンの選手は列から外せない（誰かと入れ替える形でしか動かせない）
    if (starterSet.has(item.id)) return

    if (target.to === ZONE_BENCH) {
      if (game.squad.includes(item.id)) return

      if (game.squad.length >= FIRST_SQUAD_SIZE) {
        // 定員が埋まっていたら、スタメン以外のいちばん後ろと入れ替える
        const droppable = [...game.squad].reverse().find((id) => !starterSet.has(id))
        if (!droppable) return
        setSquad([...game.squad.filter((id) => id !== droppable), item.id])
        return
      }
      setSquad([...game.squad, item.id])
      return
    }

    setSquad(game.squad.filter((id) => id !== item.id))
  }

  const drag = useDragAndDrop(handleDrop)

  if (!game) return null

  const { players, lineup, squad } = game
  const byId = new Map(players.map((player) => [player.id, player]))
  const starterIds = lineup.slots.map((slot) => slot.playerId)
  const starterSet = new Set(starterIds)
  const squadSet = new Set(squad)

  const bench = squad.filter((id) => !starterSet.has(id))
  const out = players.filter((player) => !squadSet.has(player.id)).map((player) => player.id)

  const problems = validateLineup(lineup, players)
  const selected = selectedId ? byId.get(selectedId) : undefined

  const assignPosition = (index: number, position: Position) => {
    const slots = [...lineup.slots]
    const existing = slots.findIndex((slot) => slot.position === position)
    if (existing >= 0 && existing !== index) {
      slots[existing] = { ...slots[existing], position: slots[index].position }
    }
    slots[index] = { ...slots[index], position }
    setLineup({ slots })
    setPositionFor(null)
  }

  const plateProps = (id: string, zone: string) => ({
    'data-drop-id': id,
    // ドラッグは**つまみからだけ**始める。
    // プレート全体を掴めるようにすると一覧がスクロールできなくなる
    onHandlePointerDown: (event: ReactPointerEvent) =>
      drag.handlePointerDown({ id, from: zone }, event),
    onClick: () => setSelectedId(id),
    selected: selectedId === id,
    dragging: drag.dragging?.id === id,
  })

  return (
    <>
      <div
        className={styles.screen}
        onPointerMove={drag.handlePointerMove}
        onPointerUp={drag.handlePointerUp}
        onPointerCancel={drag.handlePointerUp}
      >
        <div className={styles.toolbar}>
          <p className={styles.hint}>⠿ をつまんで移動／タップで能力表示</p>
          <button
            type="button"
            className={styles.autoButton}
            onClick={() => setShowPlans((open) => !open)}
          >
            おまかせ ▾
          </button>
        </div>

        {/* おまかせは方針を選ばせる。1種類だと納得できない結果になることがある */}
        {showPlans && (
          <div className={styles.plans}>
            {AUTO_LINEUP_PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={styles.plan}
                onClick={() => {
                  autoLineup(plan.id)
                  setShowPlans(false)
                }}
              >
                <span className={styles.planLabel}>{plan.label}</span>
                <span className={styles.planNote}>{plan.description}</span>
              </button>
            ))}
          </div>
        )}

        {problems.length > 0 && (
          <div className={styles.warning}>
            {problems.map((problem) => (
              <div key={problem.message}>{problem.message}</div>
            ))}
          </div>
        )}

        <div className={styles.body}>
          <div className={styles.lists}>
            <section className={styles.column} data-drop-zone={ZONE_STARTER}>
              <h2 className={styles.columnTitle}>スタメン</h2>
              {lineup.slots.map((slot, index) => {
                const player = byId.get(slot.playerId)
                if (!player) return null
                const aptitude = player.aptitudes[slot.position]

                return (
                  <NamePlate
                    key={`${index}-${slot.playerId}`}
                    player={player}
                    lead={index + 1}
                    trailing={
                      <>
                        <button
                          type="button"
                          className={styles.positionButton}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            setPositionFor(index)
                          }}
                        >
                          {slot.position}
                        </button>
                        <span
                          className={
                            isPlayable(aptitude)
                              ? `${styles.aptitude} ${styles.aptGood}`
                              : `${styles.aptitude} ${styles.aptBad}`
                          }
                        >
                          {aptitude}
                        </span>
                      </>
                    }
                    {...plateProps(slot.playerId, ZONE_STARTER)}
                  />
                )
              })}
            </section>

            <section className={styles.column} data-drop-zone={ZONE_BENCH}>
              <h2 className={styles.columnTitle}>
                ベンチ入り
                <span className={styles.count}>
                  {squad.length}/{FIRST_SQUAD_SIZE}
                </span>
              </h2>
              <p className={styles.columnNote}>練習の効果をそのまま受ける</p>
              {bench.map((id) => {
                const player = byId.get(id)
                if (!player) return null
                return <NamePlate key={id} player={player} {...plateProps(id, ZONE_BENCH)} />
              })}
              {bench.length === 0 && <p className={styles.empty}>ここへ移すとベンチ入りです</p>}
            </section>

            <section className={styles.column} data-drop-zone={ZONE_OUT}>
              <h2 className={styles.columnTitle}>
                ベンチ外<span className={styles.count}>{out.length}人</span>
              </h2>
              <p className={styles.columnNote}>指導が行き届かず、練習の伸びは75%</p>
              {out.map((id) => {
                const player = byId.get(id)
                if (!player) return null
                return <NamePlate key={id} player={player} {...plateProps(id, ZONE_OUT)} />
              })}
              {out.length === 0 && <p className={styles.empty}>全員がベンチ入りしています</p>}
            </section>

            <PositionLegend />
          </div>

          {/* 選んだ選手の能力を右側に固定表示する */}
          <aside className={styles.detail}>
            {selected ? (
              <AbilityPanel player={selected} />
            ) : (
              <p className={styles.empty}>選手をタップすると能力が出ます</p>
            )}
          </aside>
        </div>

        <DragGhost position={drag.position}>
          {drag.dragging && byId.get(drag.dragging.id) && (
            <NamePlate player={byId.get(drag.dragging.id)!} />
          )}
        </DragGhost>
      </div>

      {positionFor !== null && (
        <PositionSheet
          player={byId.get(lineup.slots[positionFor].playerId)}
          current={lineup.slots[positionFor].position}
          onPick={(position) => assignPosition(positionFor, position)}
          onClose={() => setPositionFor(null)}
        />
      )}
    </>
  )
}

/** ふだんの編成画面 */
export function LineupScreen() {
  const game = useGameStore((s) => s.game)
  if (!game) return null

  return (
    <AppLayout title="スタメン" subtitle={`${game.year}年目 ${game.month}月`}>
      <LineupEditor />
    </AppLayout>
  )
}

/** 色の意味を説明する凡例。色分けだけでは何色が何かは伝わらない */
function PositionLegend() {
  const groups: PositionGroup[] = ['pitcher', 'catcher', 'infield', 'outfield']

  return (
    <div className={styles.legend}>
      {groups.map((group) => (
        <span key={group} className={styles.legendItem}>
          <span
            className={styles.legendSwatch}
            style={{ background: POSITION_GROUP_COLORS[group] }}
          />
          {POSITION_GROUP_LABELS[group]}
        </span>
      ))}
      <span className={styles.legendNote}>左＝本職／右＝他に守れる位置</span>
    </div>
  )
}

/** 選んだ選手の能力。右側に固定で出す */
function AbilityPanel({ player }: { player: Player }) {
  const rank = toRank(overallRating(player))

  return (
    <div className={styles.panel}>
      <p className={styles.panelName}>{player.name}</p>
      <p className={styles.panelSub}>
        {player.grade}年 / {player.position}
      </p>
      <p className={styles.panelRank} style={{ color: rankColorOf(rank) }}>
        {rank}
      </p>

      <Row label="状態" value={MOTIVATION_LABELS[player.motivation]} />
      <Row label="体力" value={`${player.condition}`} />

      {player.pitching ? (
        <>
          <Row label={ABILITY_LABELS.velocity} value={`${player.pitching.velocity}`} />
          <Row label={ABILITY_LABELS.control} value={toRank(player.pitching.control)} />
          <Row label={ABILITY_LABELS.stamina} value={toRank(player.pitching.stamina)} />
          <Row label={ABILITY_LABELS.breaking} value={toRank(player.pitching.breaking)} />
        </>
      ) : (
        <Row
          label={ABILITY_LABELS.trajectory}
          value={trajectoryStars(player.batting.trajectory)}
        />
      )}

      <Row label={ABILITY_LABELS.meet} value={toRank(player.batting.meet)} />
      <Row label={ABILITY_LABELS.power} value={toRank(player.batting.power)} />
      <Row label={ABILITY_LABELS.speed} value={toRank(player.batting.speed)} />
      <Row label={ABILITY_LABELS.arm} value={toRank(player.batting.arm)} />
      <Row label={ABILITY_LABELS.fielding} value={toRank(player.batting.fielding)} />
      <Row label={ABILITY_LABELS.catching} value={toRank(player.batting.catching)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  const isRank = value.length === 1 && /[SABCDEFG]/.test(value)

  return (
    <div className={styles.panelRow}>
      <span className={styles.panelLabel}>{label}</span>
      <span
        className={isRank ? styles.panelValue : styles.panelPlain}
        style={isRank ? { color: rankColorOf(value) } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

/** 守備位置を選ぶシート */
function PositionSheet({
  player,
  current,
  onPick,
  onClose,
}: {
  player: Player | undefined
  current: Position
  onPick: (position: Position) => void
  onClose: () => void
}) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <p className={styles.sheetTitle}>{player?.name ?? ''}の守備位置</p>
        <div className={styles.positionGrid}>
          {ALL_POSITIONS.map((position) => {
            const aptitude = player?.aptitudes[position] ?? 'G'
            return (
              <button
                key={position}
                type="button"
                className={
                  position === current
                    ? `${styles.positionChoice} ${styles.positionCurrent}`
                    : styles.positionChoice
                }
                onClick={() => onPick(position)}
              >
                <span>{position}</span>
                <span className={isPlayable(aptitude) ? styles.aptGood : styles.aptBad}>
                  {aptitude}
                </span>
              </button>
            )
          })}
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
