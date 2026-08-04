/**
 * セーブデータのバージョン移行。
 *
 * GameState の型を破壊的に変更したら:
 *  1. SAVE_VERSION を上げる
 *  2. ここに旧バージョン → 新バージョンの変換を追加する
 * これを怠ると、既存プレイヤーのセーブが読めなくなる。
 */

import { createRng } from '@/core/rng/random'
import { createAptitudes } from '@/core/lineup/aptitude'
import { autoLineup } from '@/core/lineup/autoLineup'
import type { GameState } from '@/core/types/game'
import { SAVE_VERSION } from '@/core/types/game'
import { snapshotOf } from '@/core/types/player'
import type { Player, Position } from '@/core/types/player'
import { REPUTATION_INITIAL } from '@/core/types/season'
import { monthlyFunds } from '@/core/shop/funds'
import { rollInitialPitches } from '@/core/player/pitchDefs'
import { createBoard, GOAL_INDEX, placeSeasonTournaments } from '@/core/board/boardDefs'
import { createTournament } from '@/core/tournament/tournament'
import { DEFAULT_REGION_ID, findRegion } from '@/core/types/region'
import { cellOfDay, firstDayOfMonth } from '@/core/calendar/days'
import { drawHand } from '@/core/card/drawCards'
import { autoSquad } from '@/core/player/squad'
import { handSizeFor } from '@/core/types/season'
import { emptyCareerStats } from '@/core/player/careerStats'
import { createRivals, emptyRivalRecord } from '@/core/rival/rivals'
import { emptyScouting } from '@/core/scout/scouting'
import { createTraits } from '@/core/scout/scoutTraits'
import { normalizeUniform } from '@/core/team/uniforms'
import type { Month } from '@/core/types/game'

/**
 * 読み込んだ生データを現行バージョンの GameState に変換する。
 * 変換できない場合は null を返す（＝新規ゲーム扱い）。
 */
export function migrate(raw: unknown): GameState | null {
  if (!isRecord(raw)) return null

  const version = typeof raw.version === 'number' ? raw.version : 0

  if (version > SAVE_VERSION) {
    // 新しいバージョンで保存されたデータは読めない（アプリを巻き戻した場合など）
    console.warn(`未知のセーブバージョンです: ${version}`)
    return null
  }

  let data = raw
  if (version < 2) {
    data = migrateV1ToV2(data)
  }
  if (version < 3) {
    data = migrateV2ToV3(data)
  }
  if (version < 4) {
    data = migrateV3ToV4(data)
  }
  if (version < 5) {
    data = migrateV4ToV5(data)
  }
  if (version < 6) {
    data = migrateV5ToV6(data)
  }
  if (version < 7) {
    data = migrateV6ToV7(data)
  }
  if (version < 8) {
    data = migrateV7ToV8(data)
  }
  if (version < 9) {
    data = migrateV8ToV9(data)
  }
  if (version < 10) {
    data = migrateV9ToV10(data)
  }
  if (version < 11) {
    data = migrateV10ToV11(data)
  }
  if (version < 12) {
    data = migrateV11ToV12(data)
  }
  if (version < 13) {
    data = migrateV12ToV13(data)
  }
  if (version < 14) {
    data = migrateV13ToV14(data)
  }
  if (version < 15) {
    data = migrateV14ToV15(data)
  }
  if (version < 16) {
    data = migrateV15ToV16(data)
  }
  if (version < 17) {
    data = migrateV16ToV17(data)
  }
  if (version < 18) {
    data = migrateV17ToV18(data)
  }
  if (version < 19) {
    data = migrateV18ToV19(data)
  }
  if (version < 20) {
    data = migrateV19ToV20(data)
  }
  if (version < 21) {
    data = migrateV20ToV21(data)
  }
  if (version < 22) {
    data = migrateV21ToV22(data)
  }
  if (version < 23) {
    data = migrateV22ToV23(data)
  }

  if (typeof data.version !== 'number' || data.version !== SAVE_VERSION) return null

  return isValidState(data) ? (data as unknown as GameState) : null
}

/**
 * v1 → v2
 *  - Player に aptitudes（ポジション適性）と skills（特殊能力）を追加
 *  - GameState に lineup（スタメン）と practiceBoost を追加
 */
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(raw.players)) return { ...raw, version: 2 }

  // 適性は乱数で作るが、セーブごとに毎回変わっては困るのでシードを固定する
  const rng = createRng(typeof raw.rngState === 'number' ? raw.rngState : 1)

  const players = raw.players.map((value) => {
    if (!isRecord(value)) return value
    const position = (value.position as Position) ?? 'CF'
    return {
      ...value,
      aptitudes: value.aptitudes ?? createAptitudes(rng, position),
      skills: Array.isArray(value.skills) ? value.skills : [],
    }
  })

  return {
    ...raw,
    version: 2,
    players,
    lineup: raw.lineup ?? autoLineup(players as Player[]),
    practiceBoost: raw.practiceBoost ?? null,
  }
}

/**
 * v2 → v3
 *  - GameState に matchSpeed（観戦速度）と pendingMatch（観戦中の試合）を追加
 */
function migrateV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    version: 3,
    matchSpeed: raw.matchSpeed ?? 'normal',
    pendingMatch: raw.pendingMatch ?? null,
  }
}

/**
 * v3 → v4
 *  - GameState に reputation（学校の評判）/ graduates（OB名鑑）/ pendingSeason を追加
 */
function migrateV3ToV4(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    version: 4,
    reputation: raw.reputation ?? REPUTATION_INITIAL,
    graduates: Array.isArray(raw.graduates) ? raw.graduates : [],
    pendingSeason: raw.pendingSeason ?? null,
  }
}

/**
 * v4 → v5
 *  - GameState に regionId（所在地）/ tournament / nationalsBerth を追加
 */
function migrateV4ToV5(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    version: 5,
    regionId: raw.regionId ?? DEFAULT_REGION_ID,
    tournament: raw.tournament ?? null,
    nationalsBerth: raw.nationalsBerth ?? false,
  }
}

/**
 * v5 → v6
 *  - GameState に springBerth（春の全国大会の出場権）を追加
 */
function migrateV5ToV6(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    version: 6,
    springBerth: raw.springBerth ?? false,
  }
}

/**
 * v6 → v7
 *  - GameState に funds（部費）を追加。初期値は1ヶ月ぶんの支給額
 */
function migrateV6ToV7(raw: Record<string, unknown>): Record<string, unknown> {
  const reputation = typeof raw.reputation === 'number' ? raw.reputation : REPUTATION_INITIAL
  return {
    ...raw,
    version: 7,
    funds: raw.funds ?? monthlyFunds(reputation),
  }
}

/**
 * v7 → v8
 *  - GameState に groundLevel / managerId を追加（施設・マネージャー）
 */
function migrateV7ToV8(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    version: 8,
    groundLevel: raw.groundLevel ?? 1,
    managerId: raw.managerId ?? null,
  }
}

/**
 * v8 → v9
 *  - GameState に pendingFork を追加（ルート分岐）
 */
function migrateV8ToV9(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, version: 9, pendingFork: raw.pendingFork ?? false }
}

/**
 * v9 → v10
 *  - OB名鑑に卒業後の進路（プロ・大学・社会人）を追加。
 *    既存の記録は「経過を追っていない」扱いにして引退済みにする。
 *    過去に遡って成績を作ると、実際にプレーした記録と区別がつかなくなるため。
 */
function migrateV9ToV10(raw: Record<string, unknown>): Record<string, unknown> {
  const graduates = Array.isArray(raw.graduates) ? raw.graduates : []

  return {
    ...raw,
    version: 10,
    graduates: graduates.map((value) => {
      if (!isRecord(value)) return value
      if (value.path !== undefined) return value

      const rating = typeof value.rating === 'number' ? value.rating : 40
      return {
        ...value,
        path: 'none',
        status: 'retired',
        ability: rating,
        team: null,
        collegeYears: 0,
        proSeasons: [],
        note: '卒業後の記録は残っていない',
      }
    }),
  }
}

/**
 * v10 → v11
 *  - Player に history（能力の推移）を追加。
 *    過去の記録は無いので、現在値を1点目として置く。
 */
function migrateV10ToV11(raw: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(raw.players)) return { ...raw, version: 11 }

  const year = typeof raw.year === 'number' ? raw.year : 1
  const month = typeof raw.month === 'number' ? raw.month : 4

  return {
    ...raw,
    version: 11,
    players: raw.players.map((value) => {
      if (!isRecord(value) || Array.isArray(value.history)) return value
      return {
        ...value,
        history: [snapshotOf(value as unknown as Player, year, month)],
      }
    }),
  }
}

/**
 * v11 → v12
 *  - PitchingAbilities に pitches（持ち球）を追加
 *  - matchSpeed の 'skip' は設定として保存しなくなったので通常に戻す
 */
function migrateV11ToV12(raw: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(raw.players)) return { ...raw, version: 12 }

  // 変化球の値に見合った持ち球を後から与える
  const rng = createRng(typeof raw.rngState === 'number' ? raw.rngState : 1)

  return {
    ...raw,
    version: 12,
    matchSpeed: raw.matchSpeed === 'fast' ? 'fast' : 'normal',
    players: raw.players.map((value) => {
      if (!isRecord(value) || !isRecord(value.pitching)) return value
      if (Array.isArray(value.pitching.pitches)) return value

      const breaking = typeof value.pitching.breaking === 'number' ? value.pitching.breaking : 40
      return {
        ...value,
        pitching: { ...value.pitching, pitches: rollInitialPitches(rng, breaking) },
      }
    }),
  }
}

/**
 * v12 → v13
 *  - 盤面を「1マス1日・1年365マス」に変更した。
 *
 * 月ごとの13マス盤面とは互換が無いので、**盤面だけ作り直す**。
 * 進行中の月に合わせて、その月の1日目から再開する。
 * 選手や部費などの積み上げはそのまま引き継ぐので、育成の記録は失われない。
 */
function migrateV12ToV13(raw: Record<string, unknown>): Record<string, unknown> {
  const rng = createRng(typeof raw.rngState === 'number' ? raw.rngState : 1)
  const month = (typeof raw.month === 'number' ? raw.month : 4) as Month

  return {
    ...raw,
    version: 13,
    board: createBoard(rng),
    boardPosition: cellOfDay(firstDayOfMonth(month)),
    // 旧フェーズ monthEnd は年度末しか無くなったのでカード選択に戻す
    phase: raw.phase === 'monthEnd' ? 'cardSelect' : raw.phase,
    // 進行中の大会は盤面の対応が取れないので畳む
    tournament: null,
    rngState: rng.state,
  }
}

/**
 * v13 → v14
 *  - Player に focus（練習方針）と convertProgress を追加。
 *    既存の選手は全員「チーム練習に合わせる」から始める。
 */
function migrateV13ToV14(raw: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(raw.players)) return { ...raw, version: 14 }

  return {
    ...raw,
    version: 14,
    players: raw.players.map((value) => {
      if (!isRecord(value) || value.focus !== undefined) return value
      return { ...value, focus: { type: 'team' }, convertProgress: 0 }
    }),
  }
}

/**
 * v14 → v15
 *  - グラウンドの段階を 1〜5 から 1〜99 に変更した。
 *    旧Lv1〜5をおおよそ同じ練習効率になる新しい段階に読み替える。
 *  - 手札の枚数が評判で変わるようになったので、いまの評判に合わせて配り直す。
 */
function migrateV14ToV15(raw: Record<string, unknown>): Record<string, unknown> {
  const oldLevel = typeof raw.groundLevel === 'number' ? raw.groundLevel : 1
  // 旧Lv1=1.0 / 2=1.1 / 3=1.22 / 4=1.36 / 5=1.5 に近い新段階
  const CONVERTED = [1, 1, 12, 30, 55, 85]
  const groundLevel = CONVERTED[Math.min(5, Math.max(1, Math.round(oldLevel)))] ?? 1

  const reputation = typeof raw.reputation === 'number' ? raw.reputation : REPUTATION_INITIAL
  const rng = createRng(typeof raw.rngState === 'number' ? raw.rngState : 1)
  const serial = typeof raw.serial === 'number' ? raw.serial : 0

  return {
    ...raw,
    version: 15,
    groundLevel,
    hand: drawHand(rng, serial, handSizeFor(reputation)),
    serial: serial + handSizeFor(reputation),
    rngState: rng.state,
  }
}

/**
 * v15 → v16
 *  - GameState に equipment（練習器具）を追加。
 *    既存のセーブは何も持っていない状態から始める。
 */
function migrateV15ToV16(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, version: 16, equipment: Array.isArray(raw.equipment) ? raw.equipment : [] }
}

/**
 * v16 → v17
 *  - GameState に squad（一軍の指定）を追加。
 *    これまでは総合上位を自動で一軍にしていたので、同じ顔ぶれで作り直す。
 */
function migrateV16ToV17(raw: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(raw.squad)) return { ...raw, version: 17 }
  const players = Array.isArray(raw.players) ? (raw.players as unknown as Player[]) : []
  return { ...raw, version: 17, squad: autoSquad(players) }
}

/**
 * v17 → v18
 *  - GameState に pendingSetup（試合前のスタメン確認）を追加。
 *    観戦中に保存していた場合はそのまま観戦を続けられるよう、null で足すだけ。
 */
function migrateV17ToV18(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, version: 18, pendingSetup: raw.pendingSetup ?? null }
}

/**
 * v18 → v19
 *
 *  - 試合を半回ずつ進める形に変更（matchState）。
 *    観戦の途中でセーブすることはないので null で足すだけでよい。
 *  - Player に stats（通算成績）と u18（代表歴）を追加。
 *    過去の試合の成績は残っていないので、0 から数え始める。
 *  - GameState に rivals（県内のライバル校）と scouting（スカウト）を追加。
 *  - 転生OBを廃止。Player.reincarnatedFrom と
 *    SeasonReport.reincarnatedIds を取り除く。
 */
function migrateV18ToV19(raw: Record<string, unknown>): Record<string, unknown> {
  const players = Array.isArray(raw.players) ? raw.players : []
  const regionId = typeof raw.regionId === 'string' ? raw.regionId : DEFAULT_REGION_ID
  const rngState = typeof raw.rngState === 'number' ? raw.rngState : 1
  const rng = createRng(rngState)

  const pendingSeason = isRecord(raw.pendingSeason)
    ? stripReincarnation(raw.pendingSeason)
    : raw.pendingSeason ?? null

  return {
    ...raw,
    version: 19,
    matchState: null,
    // 途中の試合が残っていても、半回進行の状態は復元できない。
    // 結果（pendingMatch）だけは古い形のまま観戦を続けられる
    players: players.map((player) => upgradePlayerToV19(player)),
    rivals: Array.isArray(raw.rivals) ? raw.rivals : createRivals(rng, regionId),
    scouting: isRecord(raw.scouting) ? raw.scouting : emptyScouting(),
    pendingSeason,
    rngState: rng.state,
  }
}

function upgradePlayerToV19(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  const { reincarnatedFrom: _dropped, ...rest } = raw

  return {
    ...rest,
    stats: isRecord(raw.stats) ? raw.stats : emptyCareerStats(),
    u18: Array.isArray(raw.u18) ? raw.u18 : [],
  }
}

/** 世代交代の報告から転生OBの項目を落とし、新しい項目を足す */
function stripReincarnation(raw: Record<string, unknown>): Record<string, unknown> {
  const { reincarnatedIds: _dropped, ...rest } = raw
  return {
    ...rest,
    scoutResults: Array.isArray(raw.scoutResults) ? raw.scoutResults : [],
    rivalNews: Array.isArray(raw.rivalNews) ? raw.rivalNews : [],
  }
}

/**
 * v19 → v20
 *
 *  - RivalSchool に record（自校との対戦成績）を追加。
 *    過去の対戦は記録が残っていないので、0勝0敗から数え始める。
 *  - Alumnus に highSchool（高校3年間の通算成績）を追加。
 *    卒業済みの選手の成績は残っていないので空で埋める。
 *  - 県外の全国クラスの学校を足す。**県内の学校はそのまま残す**
 *    （作り直すと、いま追っている相手が消えてしまう）。
 */
function migrateV19ToV20(raw: Record<string, unknown>): Record<string, unknown> {
  const regionId = typeof raw.regionId === 'string' ? raw.regionId : DEFAULT_REGION_ID
  const rngState = typeof raw.rngState === 'number' ? raw.rngState : 1
  const rng = createRng(rngState)

  const existing = Array.isArray(raw.rivals) ? raw.rivals : []
  const withRecord = existing.map((school) =>
    isRecord(school) ? { ...school, record: school.record ?? emptyRivalRecord() } : school,
  )

  // 県外の学校がまだ無ければ足す。県内の学校は作り直さない
  const hasNational = withRecord.some(
    (school) => isRecord(school) && school.regionId !== regionId,
  )
  const rivals = hasNational
    ? withRecord
    : [...withRecord, ...createRivals(rng, regionId).filter((s) => s.regionId !== regionId)]

  const graduates = Array.isArray(raw.graduates)
    ? raw.graduates.map((alumnus) =>
        isRecord(alumnus)
          ? { ...alumnus, highSchool: alumnus.highSchool ?? emptyCareerStats() }
          : alumnus,
      )
    : raw.graduates

  return { ...raw, version: 20, rivals, graduates, rngState: rng.state }
}

/**
 * v20 → v21
 *
 *  - スカウトを県の訪問制に変更。`scouting` の形が変わったので**作り直す**。
 *    途中まで口説いていた候補は失われるが、
 *    古い候補には出身県も中学の成績も無いので引き継ぎようがない。
 *  - GameState に scoutTraits（県ごとの選手の傾向）を追加。
 */
function migrateV20ToV21(raw: Record<string, unknown>): Record<string, unknown> {
  const rngState = typeof raw.rngState === 'number' ? raw.rngState : 1
  const rng = createRng(rngState)

  return {
    ...raw,
    version: 21,
    scouting: emptyScouting(),
    scoutTraits: isRecord(raw.scoutTraits) ? raw.scoutTraits : createTraits(rng),
    rngState: rng.state,
  }
}

/**
 * v21 → v22
 *
 *  - GameState に uniform を追加。これまでは学校名のハッシュから色を決めていたので、
 *    近い色になるものを選ぶことはできない。**既定の色から始める**。
 */
function migrateV21ToV22(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    version: 22,
    uniform: normalizeUniform(typeof raw.uniform === 'string' ? raw.uniform : undefined),
  }
}

/**
 * v22 → v23
 *
 *  - 盤面を1マス1日（365マス）から1マス3日（122マス）に変更。
 *    マスの意味が変わったので**盤面を作り直す**。
 *    位置は日付を保って読み替える（4月に戻したりしない）。
 *  - 大会は1回戦ずつ別のマスに置く形になった。
 *    進行中の大会があっても、マスの持ち方が違うのでいったん畳む。
 */
function migrateV22ToV23(raw: Record<string, unknown>): Record<string, unknown> {
  const rngState = typeof raw.rngState === 'number' ? raw.rngState : 1
  const rng = createRng(rngState)
  const regionId = typeof raw.regionId === 'string' ? raw.regionId : DEFAULT_REGION_ID
  const region = findRegion(regionId)

  // 旧盤面の位置は「通算日」だったので、そのままマス番号に読み替える
  const oldDay = typeof raw.boardPosition === 'number' ? raw.boardPosition : 0
  const boardPosition = Math.min(GOAL_INDEX, cellOfDay(oldDay))

  const board = placeSeasonTournaments(createBoard(rng), {
    summerPref: createTournament('summerPref', region).totalRounds,
    autumnPref: createTournament('autumnPref', region).totalRounds,
  })

  // カードの数字も 3〜12 から 1〜5 に変わっているので引き直す
  const reputation = typeof raw.reputation === 'number' ? raw.reputation : REPUTATION_INITIAL
  const serial = typeof raw.serial === 'number' ? raw.serial : 0
  const handSize = handSizeFor(reputation)

  return {
    ...raw,
    version: 23,
    board,
    boardPosition,
    hand: drawHand(rng, serial, handSize),
    serial: serial + handSize,
    // 進行中の大会は畳む。回戦ぶんのマスが無いので続きを再現できない
    tournament: null,
    phase: raw.phase === 'tournament' ? 'cardSelect' : raw.phase,
    rngState: rng.state,
  }
}

/** 最低限の形チェック。全項目は見ないが、壊れたデータで画面が落ちるのを防ぐ */
function isValidState(raw: Record<string, unknown>): boolean {
  return (
    Array.isArray(raw.players) &&
    raw.players.length > 0 &&
    Array.isArray(raw.board) &&
    Array.isArray(raw.hand) &&
    Array.isArray(raw.log) &&
    isRecord(raw.lineup) &&
    Array.isArray((raw.lineup as Record<string, unknown>).slots) &&
    typeof raw.rngState === 'number' &&
    typeof raw.year === 'number' &&
    typeof raw.month === 'number' &&
    typeof raw.boardPosition === 'number' &&
    typeof raw.serial === 'number' &&
    typeof raw.schoolName === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
