import { useEffect, useMemo, useRef, useState } from 'react'
import { benchPlayers } from '@/core/match/teamState'
import { fieldingPitchers } from '@/core/match/halfInning'
import type { MatchEventLog, MatchResult, MatchSpeed, PlayLog } from '@/core/types/match'
import { MATCH_SPEED_LABELS } from '@/core/types/match'
import { POSITION_LABELS } from '@/core/types/player'
import type { Player } from '@/core/types/player'
import { useGameStore } from '@/state/useGameStore'
import { DiamondView } from '@/ui/components/DiamondView'
import { playSound } from '@/ui/sound/sound'
import styles from './MatchScreen.module.css'

/** 1件あたりの再生間隔（ミリ秒） */
const DELAY: Record<MatchSpeed, number> = {
  normal: 800,
  fast: 550,
  skip: 0,
}

/** スコアボードに常に出しておく回数 */
const BOARD_INNINGS = 9

/** 参照を毎回作らないための空配列。作ると useMemo が毎描画で走る */
const NO_PLAYS: PlayLog[] = []
const NO_EVENTS: MatchEventLog[] = []

/** 時系列に並べた再生単位 */
type Entry =
  | { kind: 'play'; order: number; play: PlayLog }
  | { kind: 'event'; order: number; inning: number; half: PlayLog['half']; text: string }

/**
 * 試合の観戦。
 *
 * **試合は半回ずつ進む。** 再生が追いついたら次の半回を要求する。
 * 回の切れ目でしか状態が変わらないので、そこに選手交代を挟める。
 * 交代を挟まなければ、どの速度で見ても結果は同じになる。
 */
export function MatchScreen() {
  const game = useGameStore((s) => s.game)
  const setMatchSpeed = useGameStore((s) => s.setMatchSpeed)
  const advanceMatch = useGameStore((s) => s.advanceMatch)
  const finishMatch = useGameStore((s) => s.finishMatch)

  const live = game?.matchState ?? null
  const result = game?.pendingMatch ?? null

  /**
   * スキップは「この試合だけ飛ばす」操作にする。
   * 設定として覚えると、一度スキップしたあと全試合が飛んでしまう。
   * 覚えるのは通常／高速だけ。
   */
  const [skipping, setSkipping] = useState(false)
  const savedSpeed: MatchSpeed = game?.matchSpeed === 'fast' ? 'fast' : 'normal'
  const speed: MatchSpeed = skipping ? 'skip' : savedSpeed

  /** 交代の画面を開いている間は進行を止める */
  const [substituting, setSubstituting] = useState(false)

  const plays = live?.plays ?? result?.plays ?? NO_PLAYS
  const events = live?.events ?? result?.events ?? NO_EVENTS

  // 打席と交代を order で1本の時系列にまとめる
  const timeline = useMemo<Entry[]>(() => toTimeline(plays, events), [plays, events])

  /** ここまで再生済み、という件数 */
  const [shown, setShown] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  // 再生を進める
  useEffect(() => {
    if (timeline.length === 0) return
    if (speed === 'skip') {
      setShown(timeline.length)
      return
    }
    if (shown >= timeline.length) return

    const timer = setTimeout(() => {
      setShown((current) => nextStep(timeline, current, speed))
    }, DELAY[speed])
    return () => clearTimeout(timer)
  }, [shown, speed, timeline])

  // 再生が追いついたら、次の半回を進めてもらう
  useEffect(() => {
    if (!live || substituting) return
    if (shown < timeline.length) return

    const timer = setTimeout(() => advanceMatch(speed === 'skip'), DELAY[speed])
    return () => clearTimeout(timer)
  }, [live, substituting, shown, timeline.length, speed, advanceMatch])

  // 新しい行が出たら一番下まで送る
  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [shown])

  // 直近の打席に合わせて効果音を鳴らす（スキップ中は鳴らさない）
  useEffect(() => {
    if (speed === 'skip' || shown === 0) return
    const entry = timeline[shown - 1]
    if (!entry || entry.kind !== 'play') return

    const { result: play, runsScored } = entry.play
    if (play === 'homerun') playSound('homerun')
    else if (runsScored > 0) playSound('hit')
    else if (play === 'single' || play === 'double' || play === 'triple') playSound('hit')
    else if (play === 'strikeout' || play === 'groundout' || play === 'flyout') {
      playSound('out')
    }
  }, [shown, speed, timeline])

  // 試合が終わって勝っていたら歓声
  useEffect(() => {
    if (result?.outcome === 'win' && shown >= timeline.length && shown > 0) {
      playSound('cheer')
    }
  }, [result, shown, timeline.length])

  if (!game) return null

  const visible = timeline.slice(0, Math.min(shown, timeline.length))
  // 決着し、かつ再生も追いついたら結果を出す
  const finished = result !== null && shown >= timeline.length
  const lastPlay = [...visible].reverse().find((entry) => entry.kind === 'play')
  const score = lastPlay?.kind === 'play' ? lastPlay.play.score : { player: 0, opponent: 0 }

  const opponentName = live?.away.name ?? result?.opponentName ?? ''
  /*
   * **スコアボードは再生済みの打席から組む。**
   *
   * `live.innings` をそのまま出していた頃は、半回ぶんが一括で計算されるので
   * **回の頭でその回の得点が両チームぶん出てしまい、
   * そのあとから打席の結果が流れてきていた**（点が入る前から点が見えている）。
   * 打席を1つ再生するたびに、その打席で入った点だけが増えるようにする。
   */
  const innings = inningsFromPlays(visible)

  return (
    <div className={styles.screen}>
      <Scoreboard
        opponentName={opponentName}
        innings={innings}
        finalScore={result?.finalScore ?? score}
        score={score}
        finished={finished}
      />

      {!finished && (
        <>
          <DiamondView play={lastPlay?.kind === 'play' ? lastPlay.play : null} />
          {lastPlay?.kind === 'play' && (
            <div className={styles.situation}>
              <span>
                {lastPlay.play.inning}回{lastPlay.play.half === 'top' ? '表' : '裏'}
              </span>
              <span>投: {lastPlay.play.pitcherName}</span>
            </div>
          )}
        </>
      )}

      {finished ? (
        <ResultPanel match={result} />
      ) : (
        <div className={styles.feed} ref={feedRef}>
          {visible.map((entry) =>
            entry.kind === 'play' ? (
              <div key={entry.play.id} className={styles.entry}>
                <span className={styles.entryInning}>
                  {entry.play.inning}回{entry.play.half === 'top' ? '表' : '裏'}
                </span>
                <span
                  className={
                    entry.play.highlight
                      ? `${styles.entryText} ${styles.highlight}`
                      : styles.entryText
                  }
                >
                  {entry.play.text}
                </span>
              </div>
            ) : (
              <div key={`e${entry.order}`} className={`${styles.entry} ${styles.eventEntry}`}>
                <span className={styles.entryInning}>
                  {entry.inning}回{entry.half === 'top' ? '表' : '裏'}
                </span>
                <span className={styles.entryText}>{entry.text}</span>
              </div>
            ),
          )}
        </div>
      )}

      <div className={styles.controls}>
        {finished ? (
          <button type="button" className={styles.doneButton} onClick={finishMatch}>
            試合終了
          </button>
        ) : (
          <>
            {(['normal', 'fast', 'skip'] as MatchSpeed[]).map((option) => (
              <button
                key={option}
                type="button"
                className={
                  speed === option
                    ? `${styles.speedButton} ${styles.speedActive}`
                    : styles.speedButton
                }
                onClick={() => {
                  // スキップはこの試合限り。設定としては保存しない
                  if (option === 'skip') setSkipping(true)
                  else {
                    setSkipping(false)
                    setMatchSpeed(option)
                  }
                }}
              >
                {MATCH_SPEED_LABELS[option]}
              </button>
            ))}
            {/*
              交代はスキップ観戦中は出さない。
              一気に決着させる操作と、回の切れ目で止める操作が噛み合わないため。
            */}
            {live && speed !== 'skip' && (
              <button
                type="button"
                className={styles.subButton}
                onClick={() => setSubstituting(true)}
              >
                交代
              </button>
            )}
          </>
        )}
      </div>

      {substituting && live && (
        <SubstitutionSheet state={live} onClose={() => setSubstituting(false)} />
      )}
    </div>
  )
}

/** スコアボードの1回ぶん。まだ始まっていない半回は伏せる */
type InningScore = {
  player: number
  opponent: number
  /** その半回が始まったか。始まっていなければ数字を出さない */
  topSeen: boolean
  bottomSeen: boolean
}

/**
 * 再生済みの打席から、回ごとの得点を組み立てる。
 *
 * **結果（`innings`）を使わない。** 結果はもう決まっているので、
 * それを出すと打席より先に点が見えてしまう。
 */
function inningsFromPlays(entries: Entry[]): InningScore[] {
  const rows: InningScore[] = []

  for (const entry of entries) {
    if (entry.kind !== 'play') continue

    const { inning, half, runsScored } = entry.play
    while (rows.length < inning) {
      rows.push({ player: 0, opponent: 0, topSeen: false, bottomSeen: false })
    }

    const row = rows[inning - 1]
    if (half === 'top') {
      row.topSeen = true
      row.opponent += runsScored
    } else {
      row.bottomSeen = true
      row.player += runsScored
    }
  }

  return rows
}

function toTimeline(plays: PlayLog[], events: MatchEventLog[]): Entry[] {
  const entries: Entry[] = [
    ...plays.map((play) => ({ kind: 'play' as const, order: play.order, play })),
    ...events.map((event) => ({
      kind: 'event' as const,
      order: event.order,
      inning: event.inning,
      half: event.half,
      text: event.text,
    })),
  ]
  return entries.sort((a, b) => a.order - b.order)
}

/**
 * 次に進める位置を返す。
 * 高速では半回ぶんをまとめて進めるので、テンポが大きく変わる。
 */
function nextStep(timeline: Entry[], current: number, speed: MatchSpeed): number {
  if (speed !== 'fast') return current + 1

  const start = timeline[current]
  if (!start) return current + 1

  const inning = start.kind === 'play' ? start.play.inning : start.inning
  const half = start.kind === 'play' ? start.play.half : start.half

  let index = current
  while (index < timeline.length) {
    const entry = timeline[index]
    const entryInning = entry.kind === 'play' ? entry.play.inning : entry.inning
    const entryHalf = entry.kind === 'play' ? entry.play.half : entry.half
    if (entryInning !== inning || entryHalf !== half) break
    index++
  }
  return index
}

/**
 * 選手交代。
 *
 * 高校野球と同じく**退いた選手は戻れない**ので、それを画面にも書く。
 * 守備位置は動かさず、その枠に入る選手だけを選ぶ形にしている。
 *
 * ただし**投手の枠だけは、守備に就いている投手も選べる**。
 * 野手で出している投手を継投に使えないと、控え投手が尽きた時点で
 * どれだけ打たれても代えられなくなる。
 * この場合は誰も退かず、守備位置が組み直される。
 */
function SubstitutionSheet({
  state,
  onClose,
}: {
  state: NonNullable<ReturnType<typeof useGameStore.getState>['game']>['matchState']
  onClose: () => void
}) {
  const substitutePlayer = useGameStore((s) => s.substitutePlayer)
  const [slotIndex, setSlotIndex] = useState<number | null>(null)

  if (!state) return null

  const team = state.home
  const find = (id: string): Player | undefined => team.players.find((p) => p.id === id)
  const bench = benchPlayers(team)
  const slot = slotIndex === null ? null : team.lineup.slots[slotIndex]

  // 投手の枠には投手能力を持つ選手しか入れられない。
  // **守備に就いている投手も候補に入れる**（マウンドへ回す交代）
  const fromField = slot?.position === 'P' ? fieldingPitchers(team) : []
  const candidates =
    slot?.position === 'P' ? [...bench.filter((p) => p.pitching), ...fromField] : bench

  /** その選手がいま守っている位置。ベンチなら null */
  const positionOf = (id: string) =>
    team.lineup.slots.find((s) => s.playerId === id)?.position ?? null

  return (
    <div className={styles.sheet}>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>選手交代</h2>
        <p className={styles.sheetNote}>一度退いた選手は、この試合に戻れません。</p>

        <h3 className={styles.sheetSection}>誰を代える？</h3>
        <div className={styles.slotList}>
          {team.lineup.slots.map((s, index) => {
            const player = find(s.playerId)
            return (
              <button
                key={`${index}-${s.playerId}`}
                type="button"
                className={
                  index === slotIndex ? `${styles.slot} ${styles.slotActive}` : styles.slot
                }
                onClick={() => setSlotIndex(index)}
              >
                <span className={styles.slotOrder}>{index + 1}</span>
                <span className={styles.slotPos}>{POSITION_LABELS[s.position]}</span>
                <span className={styles.slotName}>{player?.name ?? '—'}</span>
              </button>
            )
          })}
        </div>

        {slotIndex !== null && (
          <>
            <h3 className={styles.sheetSection}>誰を出す？</h3>
            {candidates.length === 0 ? (
              <p className={styles.sheetNote}>出せる控えがいません。</p>
            ) : (
              <div className={styles.slotList}>
                {candidates.map((player) => {
                  const from = positionOf(player.id)
                  return (
                    <button
                      key={player.id}
                      type="button"
                      className={styles.slot}
                      onClick={() => {
                        substitutePlayer(slotIndex, player.id)
                        onClose()
                      }}
                    >
                      <span className={styles.slotPos}>{player.grade}年</span>
                      <span className={styles.slotName}>{player.name}</span>
                      {from && (
                        <span className={styles.slotFrom}>{POSITION_LABELS[from]}から</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}

        <button type="button" className={styles.sheetClose} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}

function Scoreboard({
  opponentName,
  innings,
  finalScore,
  score,
  finished,
}: {
  opponentName: string
  innings: InningScore[]
  finalScore: { player: number; opponent: number }
  score: { player: number; opponent: number }
  finished: boolean
}) {
  const shownScore = finished ? finalScore : score
  // 試合中は済んだ回しか分からないので、9回ぶんの枠は常に確保する
  const columns = Math.max(BOARD_INNINGS, innings.length)

  return (
    <div className={styles.scoreboard}>
      <div className={styles.total}>
        <span className={styles.teamName}>{opponentName}</span>
        <span
          className={
            shownScore.opponent > shownScore.player
              ? `${styles.score} ${styles.leading}`
              : styles.score
          }
        >
          {shownScore.opponent}
        </span>
        <span className={styles.score}>-</span>
        <span
          className={
            shownScore.player > shownScore.opponent
              ? `${styles.score} ${styles.leading}`
              : styles.score
          }
        >
          {shownScore.player}
        </span>
        <span className={`${styles.teamName} ${styles.teamNameLeft}`}>自校</span>
      </div>

      <div className={styles.inningTable}>
        {Array.from({ length: columns }, (_, index) => {
          const inning = innings[index]
          // **まだ打席が回っていない半回は伏せる。**
          // 表と裏で別に見るので、進行中の回も「表だけ数字が出ている」形になる
          const top = inning?.topSeen === true
          const bottom = inning?.bottomSeen === true
          return (
            <div key={index} className={styles.inningColumn}>
              <div className={styles.inningHead}>{index + 1}</div>
              <div
                className={top ? styles.inningCell : `${styles.inningCell} ${styles.inningPending}`}
              >
                {top ? inning.opponent : '-'}
              </div>
              <div
                className={
                  bottom ? styles.inningCell : `${styles.inningCell} ${styles.inningPending}`
                }
              >
                {bottom ? inning.player : '-'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultPanel({ match }: { match: MatchResult }) {
  const mvp =
    match.battingLines.find((line) => line.playerId === match.mvpPlayerId) ??
    match.pitchingLines.find((line) => line.playerId === match.mvpPlayerId)

  const outcomeClass =
    match.outcome === 'win' ? styles.win : match.outcome === 'lose' ? styles.lose : styles.draw
  const outcomeText =
    match.outcome === 'win' ? 'WIN' : match.outcome === 'lose' ? 'LOSE' : 'DRAW'

  return (
    <div className={styles.result}>
      <div className={`${styles.outcome} ${outcomeClass}`}>{outcomeText}</div>

      {mvp && (
        <div className={styles.mvp}>
          今日のヒーロー
          <div className={styles.mvpName}>{mvp.name}</div>
        </div>
      )}

      <section className={styles.statSection}>
        <h2 className={styles.statTitle}>打撃成績</h2>
        <table className={styles.statTable}>
          <thead>
            <tr>
              <th>選手</th>
              <th>打数</th>
              <th>安打</th>
              <th>本塁打</th>
              <th>打点</th>
              <th>盗塁</th>
              <th>三振</th>
              <th>四球</th>
            </tr>
          </thead>
          <tbody>
            {match.battingLines.map((line) => (
              <tr key={line.playerId}>
                <td>{line.name}</td>
                <td>{line.atBats}</td>
                <td>{line.hits}</td>
                <td>{line.homeruns}</td>
                <td>{line.rbi}</td>
                <td>{line.steals}</td>
                <td>{line.strikeouts}</td>
                <td>{line.walks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.statSection}>
        <h2 className={styles.statTitle}>投手成績</h2>
        <table className={styles.statTable}>
          <thead>
            <tr>
              <th>選手</th>
              <th>回</th>
              <th>被安打</th>
              <th>失点</th>
              <th>自責</th>
              <th>奪三振</th>
              <th>四球</th>
            </tr>
          </thead>
          <tbody>
            {match.pitchingLines.map((line) => (
              <tr key={line.playerId}>
                <td>
                  {line.name}
                  {line.decision === 'win' && <span className={styles.decision}>○</span>}
                  {line.decision === 'lose' && <span className={styles.decision}>●</span>}
                </td>
                <td>{formatInnings(line.outs)}</td>
                <td>{line.hits}</td>
                <td>{line.runs}</td>
                <td>{line.earnedRuns}</td>
                <td>{line.strikeouts}</td>
                <td>{line.walks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

/** アウト数を「6回1/3」のような投球回表記にする */
function formatInnings(outs: number): string {
  const full = Math.floor(outs / 3)
  const rest = outs % 3
  if (rest === 0) return `${full}`
  return `${full}${rest === 1 ? '⅓' : '⅔'}`
}
