import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ALL_POSITIONS, defenseScore, isPlayable } from '@/core/lineup/aptitude'
import { AUTO_LINEUP_PLANS, validateLineup } from '@/core/lineup/autoLineup'
import { FIRST_SQUAD_SIZE } from '@/core/player/squad'
import { overallRating, toRank } from '@/core/player/rating'
import { TrajectoryArrow } from '@/ui/components/TrajectoryArrow'
import { PitchChart } from '@/ui/components/PitchChart'
import { PitcherStats } from '@/ui/components/PitcherStats'
import { ABILITY_LABELS, MOTIVATION_LABELS } from '@/core/types/player'
import { skillsOf } from '@/core/skill/skillEffects'
import {
  SKILL_SITUATION_LABELS,
  SKILL_TARGET_LABELS,
  SKILL_TARGET_UNIT,
} from '@/core/types/skill'
import type { Player, Position } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { NamePlate } from '@/ui/components/NamePlate'
import { PlayerPortrait } from '@/ui/components/PlayerPortrait'
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
  const showPlayer = useGameStore((s) => s.showPlayer)

  /**
   * タップは3段階で回す。
   *
   * 1回目 … 能力を見るだけ（`previewId`）
   * 2回目 … 入れ替え待ち（`armedId`）。ここで初めて編成が動く状態になる
   * 3回目 … 選択解除
   *
   * **1回のタップでいきなり入れ替え待ちにしない。**
   * 能力を確かめたいだけで触った選手が武装状態になり、
   * 次に別の選手を見ようとタップした瞬間に入れ替わってしまっていた。
   */
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
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
        // スタメン同士なら**打順だけ**を入れ替える。
        // 守備位置は選手についていくので、枠ごと丸ごと入れ替える
        ;[slots[fromIndex], slots[index]] = [slots[index], slots[fromIndex]]
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

  /**
   * タップで選んだ2人を入れ替える。
   *
   * **ドラッグだけだと届かない組み合わせがある。** 一覧が長いと
   * スタメンの上のほうとベンチ入りの下のほうが同時に画面に入らず、
   * つまんだまま運べなかった（実際に入れ替えられなかった）。
   *
   * 「置く」ドラッグと違い、こちらは**そのまま入れ替える**。
   * どちらを掴んだかに関係なく結果が同じになる。
   */
  const swapPlayers = (aId: string, bId: string) => {
    if (!game || aId === bId) return

    const starterIds = game.lineup.slots.map((slot) => slot.playerId)
    const inSquad = new Set(game.squad)
    const zoneOf = (id: string) =>
      starterIds.includes(id) ? ZONE_STARTER : inSquad.has(id) ? ZONE_BENCH : ZONE_OUT

    const zoneA = zoneOf(aId)
    const zoneB = zoneOf(bId)

    // ── スタメン同士。**打順だけ**を入れ替える ──
    //
    // **守備位置は選手についていく。** playerId だけを差し替えていた頃は、
    // 打順を入れ替えたつもりが守備位置まで交換されていて、
    // 二塁手が三塁へ動くという意図しない編成になっていた。
    // 枠（打順）ごと入れ替えれば、各自が自分の守備位置を持ったまま並び替わる。
    if (zoneA === ZONE_STARTER && zoneB === ZONE_STARTER) {
      const slots = [...game.lineup.slots]
      const i = starterIds.indexOf(aId)
      const j = starterIds.indexOf(bId)
      ;[slots[i], slots[j]] = [slots[j], slots[i]]
      setLineup({ slots })
      return
    }

    // ── 片方がスタメン。控えを上げ、押し出された選手が相手の居た場所へ ──
    if (zoneA === ZONE_STARTER || zoneB === ZONE_STARTER) {
      const starterId = zoneA === ZONE_STARTER ? aId : bId
      const otherId = zoneA === ZONE_STARTER ? bId : aId
      const otherZone = zoneA === ZONE_STARTER ? zoneB : zoneA

      const slots = [...game.lineup.slots]
      const index = starterIds.indexOf(starterId)
      slots[index] = { ...slots[index], playerId: otherId }
      setLineup({ slots })

      // 相手がベンチ外なら、押し出されたスタメンがベンチ外へ下がる。
      // ベンチ入りなら両方ともベンチ入りのまま
      const next = game.squad.filter((id) => id !== otherId && id !== starterId)
      next.push(otherId)
      if (otherZone === ZONE_BENCH) next.push(starterId)
      setSquad(next)
      return
    }

    // ── ベンチ入りとベンチ外。所属を入れ替える ──
    if (zoneA !== zoneB) {
      const benchId = zoneA === ZONE_BENCH ? aId : bId
      const outId = zoneA === ZONE_BENCH ? bId : aId
      setSquad([...game.squad.filter((id) => id !== benchId), outId])
      return
    }

    // 同じ列の控え同士。並び順に意味が無いので何もしない
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
  const previewed = previewId ? byId.get(previewId) : undefined
  const armed = armedId ? byId.get(armedId) : undefined

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
    onClick: () => {
      // 入れ替え待ちの選手がいて、別の選手を触った → 入れ替える
      if (armedId !== null && armedId !== id) {
        swapPlayers(armedId, id)
        setArmedId(null)
        setPreviewId(null)
        return
      }
      // 別の選手 → 能力を見るだけ
      if (previewId !== id) {
        setPreviewId(id)
        setArmedId(null)
        return
      }
      // 同じ選手の2回目 → 入れ替え待ちにする
      if (armedId !== id) {
        setArmedId(id)
        return
      }
      // 3回目 → 解除
      setArmedId(null)
      setPreviewId(null)
    },
    // **長押しで能力詳細へ。** タップは編成に使い切っているので、
    // 「この選手をじっくり見たい」の入口を長押しに分ける
    onLongPress: () => showPlayer(id, 'lineup'),
    selected: armedId === id,
    preview: previewId === id,
    dragging: drag.dragging?.id === id,
  })

  const clearSelection = () => {
    setArmedId(null)
    setPreviewId(null)
  }

  return (
    <>
      <div
        className={styles.screen}
        onPointerMove={drag.handlePointerMove}
        onPointerUp={drag.handlePointerUp}
        onPointerCancel={drag.handlePointerUp}
      >
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
            {/* **ベンチ入りごと組み直す**ことを書いておく。黙って入れ替わると驚く */}
            <p className={styles.planNote}>ベンチ外の選手も含めて選び直します</p>
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
              {/*
                **「おまかせ」は見出しの行に置く。** 専用の行を1つ使っていた頃は、
                説明の帯と合わせて90pxほど（選手2人ぶん）を文字だけで消費していた
              */}
              <h2 className={styles.columnTitle}>
                スタメン
                <button
                  type="button"
                  className={styles.autoButton}
                  onClick={() => setShowPlans((open) => !open)}
                >
                  おまかせ ▾
                </button>
              </h2>
              {lineup.slots.map((slot, index) => {
                const player = byId.get(slot.playerId)
                if (!player) return null
                const aptitude = player.aptitudes[slot.position]
                // その位置で発揮できる守備力。適性0なら守れない
                const defense = aptitude > 0 ? Math.round(defenseScore(player, slot.position)) : null

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
                          {defense ?? '—'}
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
            {/*
              **入れ替え待ちの案内はここに出す。** 一覧の上に帯として出していた頃は、
              現れたぶん行が下へずれて、
              「同じ選手をもう一度タップ」が隣の行に当たっていた。
              右の枠は選手を選ぶまで空いているので、ここなら一覧が動かない
            */}
            {armed && (
              <div className={styles.armedNote}>
                <span className={styles.armedName}>{armed.name}</span>
                を入れ替える相手をタップ
                <button type="button" className={styles.armedCancel} onClick={clearSelection}>
                  やめる
                </button>
              </div>
            )}
            {previewed ? (
              /*
                **選手が変わったら表示も既定に戻す。**
                key を付けないと、投手を見たあとに野手を選んでも
                「投手能力」を選んだままの状態が残る
              */
              <AbilityPanel key={previewed.id} player={previewed} />
            ) : (
              !armed && <p className={styles.empty}>選手をタップ</p>
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

/** 能力の表示。投手／野手のどちらを出すか */
type AbilityView = 'pitching' | 'batting'

/**
 * 選んだ選手の能力。右側に固定で出す。
 *
 * **投手にも野手能力はある。** 打順を組むときは投手の打力を、
 * 継投を考えるときは球速と持ち球を見たい。
 * どちらも同時に出すと枠に入らないので、切り替えられるようにした。
 * 既定はその選手の本職（投手なら投手能力）。
 */
function AbilityPanel({ player }: { player: Player }) {
  const rank = toRank(overallRating(player))
  const [view, setView] = useState<AbilityView>(player.pitching ? 'pitching' : 'batting')

  return (
    <div className={styles.panel}>
      {/* **顔を出す。** 名前だけだと、並べ替えているうちに誰の能力か分からなくなる */}
      <PlayerPortrait
        playerId={player.id}
        size={56}
        cap
        exchange={player.origin === 'exchange'}
        className={styles.panelFace}
      />
      <p className={styles.panelName}>{player.name}</p>
      <p className={styles.panelSub}>
        {player.grade}年 / {player.position}
      </p>
      <p className={styles.panelRank} style={{ color: rankColorOf(rank) }}>
        {rank}
      </p>

      <PlayablePositions player={player} />

      <Row label="状態" value={MOTIVATION_LABELS[player.motivation]} />
      <Row label="体力" value={`${player.condition}`} />

      {/* 野手は投手能力を持たないので、切り替えは投手にだけ出す */}
      {player.pitching && (
        <div className={styles.viewSwitch}>
          {(
            [
              ['pitching', '投手'],
              ['batting', '野手'],
            ] as [AbilityView, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                view === value ? `${styles.viewTab} ${styles.viewTabActive}` : styles.viewTab
              }
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/*
        **投手には投手の並びを出す。** 打撃6項目まで並べていたので、
        肝心の球速・変化球より下に押し出されていた。
        持ち球も、ここで分からないと継投の判断ができない。
      */}
      {player.pitching && view === 'pitching' ? (
        <>
          <div className={styles.panelPitching}>
            <PitcherStats pitching={player.pitching} columns={1} />
          </div>
          <PitchChart pitches={player.pitching.pitches} narrow />
          <Row label={ABILITY_LABELS.fielding} value={toRank(player.batting.fielding)} />
          <Row label={ABILITY_LABELS.speed} value={toRank(player.batting.speed)} />
        </>
      ) : (
        <>
          <Row
            label={ABILITY_LABELS.trajectory}
            value={<TrajectoryArrow trajectory={player.batting.trajectory} size={16} />}
          />
          <Row label={ABILITY_LABELS.meet} value={toRank(player.batting.meet)} />
          <Row label={ABILITY_LABELS.power} value={toRank(player.batting.power)} />
          <Row label={ABILITY_LABELS.speed} value={toRank(player.batting.speed)} />
          <Row label={ABILITY_LABELS.arm} value={toRank(player.batting.arm)} />
          <Row label={ABILITY_LABELS.fielding} value={toRank(player.batting.fielding)} />
          <Row label={ABILITY_LABELS.catching} value={toRank(player.batting.catching)} />
        </>
      )}

      <SkillList player={player} />
    </div>
  )
}

/**
 * 持っている特殊能力と、その補正。
 *
 * **能力値の下に出す。** 一覧から選手を選ぶ場面でこそ
 * 「この選手は何ができるのか」を知りたいのに、
 * 詳細画面まで開かないと分からなかった。
 *
 * 補正は定義（`skillDefs` の `effects`）から引くので、
 * ここに書いてある数字がそのまま試合の判定に効く。
 */
function SkillList({ player }: { player: Player }) {
  const skills = skillsOf(player)
  if (skills.length === 0) return null

  return (
    <div className={styles.skills}>
      {skills.map((skill) => (
        <div key={skill.id} className={`${styles.skill} ${SKILL_RANK_CLASS[skill.rank]}`}>
          <span className={styles.skillName}>{skill.name}</span>
          {(skill.effects ?? []).map((effect, index) => (
            <span key={index} className={styles.skillEffect}>
              {SKILL_SITUATION_LABELS[effect.when ?? 'always'] && (
                <span className={styles.skillWhen}>
                  {SKILL_SITUATION_LABELS[effect.when ?? 'always']}
                </span>
              )}
              {SKILL_TARGET_LABELS[effect.target]}
              <span className={effect.amount > 0 ? styles.skillUp : styles.skillDown}>
                {effect.amount > 0 ? '+' : ''}
                {effect.amount}
                {SKILL_TARGET_UNIT[effect.target] === 'percent' ? '%' : ''}
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

const SKILL_RANK_CLASS: Record<string, string> = {
  gold: styles.skillGold,
  blue: styles.skillBlue,
  red: styles.skillRed,
}

/**
 * 守れる守備位置。
 *
 * **どこを守れるかが分からないと入れ替えの判断ができない。**
 * 能力だけ見て動かすと、適性の無い位置に置いて失策が増えていた。
 * 本職を先頭に、守れる位置だけを**その位置での守備力**つきで並べる。
 */
function PlayablePositions({ player }: { player: Player }) {
  const playable = ALL_POSITIONS.filter(
    (position) => position !== player.position && isPlayable(player.aptitudes[position]),
  )
  const scoreAt = (position: Position) => Math.round(defenseScore(player, position))

  return (
    <div className={styles.aptRow}>
      <span className={`${styles.aptChip} ${styles.aptChipMain}`}>
        {player.position}
        <span className={styles.aptChipRank}>{scoreAt(player.position)}</span>
      </span>
      {playable.map((position) => (
        <span key={position} className={styles.aptChip}>
          {position}
          <span className={styles.aptChipRank}>{scoreAt(position)}</span>
        </span>
      ))}
      {playable.length === 0 && <span className={styles.aptNone}>他は守れない</span>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  // ランク1文字のときだけ色を付ける。弾道の矢印のような要素はそのまま出す
  const isRank = typeof value === 'string' && value.length === 1 && /[SABCDEFG]/.test(value)

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
            const aptitude = player?.aptitudes[position] ?? 0
            // 守れない位置は数字を出さない（0段は「守れない」の意味）
            const score = player && aptitude > 0 ? Math.round(defenseScore(player, position)) : null
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
                  {score ?? '—'}
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
