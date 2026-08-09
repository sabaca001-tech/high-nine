import { validateLineup } from '@/core/lineup/autoLineup'
import { formatRecord, hasMet, recordOf } from '@/core/rival/rivals'
import type { RivalRecord } from '@/core/rival/rivals'
import { matchupLabel, teamRating } from '@/core/season/matchReputation'
import { FATIGUE_LABELS, fatigueLevel, fatigueOf } from '@/core/player/fatigue'
import { useGameStore } from '@/state/useGameStore'
import { AppLayout } from '@/ui/components/AppLayout'
import { OpponentRoster } from '@/ui/components/OpponentRoster'
import { LineupEditor } from './LineupScreen'
import styles from './PreMatchScreen.module.css'

/**
 * 試合前のスタメン確認。
 *
 * **この画面を閉じるまで試合はシミュレートされない。**
 * ここで組み替えたスタメンがそのまま結果に反映される。
 * 以前は止まったマスでその場で試合が終わっていたので、
 * 「誰を出すか」を決める余地が無かった。
 */
export function PreMatchScreen() {
  const game = useGameStore((s) => s.game)
  const startMatch = useGameStore((s) => s.startMatch)

  const setup = game?.pendingSetup
  if (!game || !setup) return null

  const school = setup.opponentSchoolId
    ? (game.rivals.find((rival) => rival.id === setup.opponentSchoolId) ?? null)
    : null

  // スタメンの投手枠に入っている選手＝この試合の先発
  const starterId = game.lineup.slots.find((slot) => slot.position === 'P')?.playerId
  const starter = game.players.find((player) => player.id === starterId) ?? null

  const problems = validateLineup(game.lineup, game.players)
  const ready = problems.length === 0

  return (
    <AppLayout title="スタメン確認" subtitle={`${game.year}年目 ${game.month}月`}>
      <div className={styles.opponent}>
        <span className={styles.label}>
          {setup.roundName ? `${setup.roundName}の相手` : '練習試合の相手'}
        </span>
        <span className={styles.name}>{setup.opponentName}</span>
        {setup.awayRegionName && (
          <span className={styles.away}>{setup.awayRegionName}へ遠征</span>
        )}
        {/* 全国大会ではどこの代表かを出す。同じ学校と何年も当たるため */}
        {setup.opponentRegionName && (
          <span className={styles.away}>{setup.opponentRegionName}代表</span>
        )}
        {/*
          力の差を言葉で出す。勝てば評判がどれだけ動くかがここで読めるので、
          「格上に挑む」ことに意味が生まれる。
        */}
        <span className={styles.matchup}>
          {matchupLabel(teamRating(game.players, game.lineup), setup.opponentStrength)}
        </span>
      </div>

      {/*
        これまでの対戦。「去年の夏、準決勝で負けた相手」が分かるようにする。
        毎回知らない相手と当たるだけでは、勝ち上がりに物語が乗らない。
      */}
      {school && hasMet(recordOf(school)) && <MeetingHistory record={recordOf(school)} />}

      {/*
        相手のスタメン。誰を警戒すべきかが分かると、
        こちらの編成（誰を投げさせるか・どこを固めるか）に判断が生まれる
      */}
      {school && <OpponentRoster school={school} year={game.year} />}

      {/*
        先発予定の投手が疲れていないか。連戦の最中は、
        **ここで気づいて代えられる**ようにしておく必要がある
      */}
      {starter && fatigueOf(starter) >= 15 && (
        <p className={styles.fatigue}>
          先発 {starter.name} は{FATIGUE_LABELS[fatigueLevel(starter)]}（{fatigueOf(starter)}）。
          このまま投げると早く崩れます
        </p>
      )}

      <LineupEditor />

      <div className={styles.controls}>
        {!ready && <p className={styles.warning}>編成が成立していません</p>}
        <button
          type="button"
          className={styles.startButton}
          disabled={!ready}
          onClick={startMatch}
        >
          試合開始 ▶
        </button>
      </div>
    </AppLayout>
  )
}

/** その学校との通算成績と、前回の顔合わせ */
function MeetingHistory({ record }: { record: RivalRecord }) {
  return (
    <p className={styles.history}>
      通算 {formatRecord(record)}
      {record.last && (
        <span className={styles.last}>
          前回：{record.last.year}年目 {record.last.label}で
          {record.last.outcome === 'win'
            ? '勝利'
            : record.last.outcome === 'lose'
              ? '敗戦'
              : '引き分け'}
        </span>
      )}
    </p>
  )
}
