/**
 * ゲーム全体の状態＝セーブデータそのもの。
 *
 * 重要な制約:
 *  - JSON にそのまま変換できる形しか入れない（Map / Set / class / 関数は禁止）
 *  - 型を破壊的に変更したら SAVE_VERSION を上げ、src/save/migrate.ts に移行処理を追加する
 */

import type { RngState } from '@/core/rng/random'
import type { Player } from './player'
import type { TrainingFocus } from '@/core/player/trainingFocus'
import type { PracticeCard } from './card'
import type { BoardCell } from './board'
import type { LogEntry } from './event'
import type { Lineup } from './lineup'
import type { MatchResult, MatchSpeed, PendingMatchSetup } from './match'
import type { MatchState } from '@/core/match/simulateGame'
import type { GraduateRecord, SeasonReport } from './season'
import type { RegionId } from './region'
import type { RivalSchool } from '@/core/rival/rivals'
import type { ScoutingState } from '@/core/scout/scouting'
import type { TraitMap } from '@/core/scout/scoutTraits'
import type { UniformId } from '@/core/team/uniforms'
import type { Tournament } from './tournament'
import type { TeamManager } from '@/core/staff/managers'
import type { PendingPlayerEvent } from '@/core/event/playerEvents'
import type { FriendlyOffer } from '@/core/match/friendlyOffers'

/**
 * セーブデータのバージョン。
 * v1 → v2: Player に aptitudes / skills、GameState に lineup / practiceBoost を追加
 * v2 → v3: GameState に matchSpeed / pendingMatch を追加（試合の実装）
 * v3 → v4: GameState に reputation / graduates / pendingSeason を追加（世代交代）
 * v4 → v5: GameState に regionId / tournament / nationalsBerth を追加（大会）
 * v5 → v6: GameState に springBerth を追加（春の全国大会・冬合宿）
 * v6 → v7: GameState に funds を追加（部費・ショップ・コンバート）
 * v7 → v8: GameState に groundLevel / managerId を追加（施設・マネージャー）
 * v8 → v9: GameState に pendingFork を追加（ルート分岐）
 * v9 → v10: OB名鑑を「卒業後の進路つき」に拡張（プロ・大学・社会人）
 * v10 → v11: Player に history（能力の推移）を追加
 * v11 → v12: PitchingAbilities に pitches（持ち球）を追加
 * v12 → v13: 盤面を1マス1日・1年365マスに変更（月ごとのゴールを廃止）
 * v13 → v14: Player に focus（練習方針）と convertProgress を追加
 * v14 → v15: グラウンドの段階を1〜99に拡張、手札の枚数が評判で変わるように
 * v15 → v16: GameState に equipment（練習器具）を追加
 * v16 → v17: GameState に squad（一軍の指定）を追加
 * v17 → v18: GameState に pendingSetup（試合前のスタメン確認）を追加
 * v18 → v19: 試合を半回ずつ進める形に変更（matchState）。
 *            通算成績（Player.stats）・ライバル校・スカウト・U18代表を追加。
 *            転生OBを廃止。
 * v19 → v20: ライバル校に対戦成績（record）、卒業生に高校時代の通算成績
 *            （highSchool）を追加。全国の強豪校ぶんの学校も足す。
 * v20 → v21: スカウトを県の訪問制に変更（scouting の形が変わる）。
 *            GameState に scoutTraits（県ごとの選手の傾向）を追加。
 * v21 → v22: GameState に uniform を追加（学校名から色を導くのをやめた）。
 *            新年度に学校名・ユニフォーム・所在地を変えられるようにした。
 * v22 → v23: 盤面を1マス3日・1年122マスに変更（カードの数字が1〜5に）。
 *            大会を1回戦ずつのマスに分割。3年生は夏で引退。
 * v23 → v24: 盤面を1マス1日・1年365マスに戻す（boardPosition が通算日に戻る）。
 *            増えた手数ぶん、1手あたりの成長と消耗を薄めた。
 * v24 → v25: ProSeason に ability（そのシーズンの実力）を追加。
 *            プロ入りで能力がプロの物差しへ置き換わるようになった。
 * v25 → v26: Player に growthAptitude（能力ごとの伸びやすさ）を追加。
 *            練習の結果が選手ごとに変わるようになった。
 * v26 → v27: scouting に nationalTeam（U15日本代表の30人）を追加。
 * v27 → v28: Player に fatigue（投手の疲労）を追加。連投でパフォーマンスが落ちる。
 * v28 → v29: マネージャーを購入制から入部制に変更（managerId → managers）。
 *            個人イベントのマスとフェーズ（pendingEvent）を追加。
 * v29 → v30: 練習結果の報告フェーズ（pendingGrowth）を追加。
 *            マスの効果が始まる前に、その日の成長を必ず見せる。
 * v30 → v31: MatchState に mercy（コールドゲームの有無）を追加。
 *            全国大会だけコールドが無い。
 * v31 → v32: 練習試合の相手を選べるようにした（pendingOffers）。
 * v32 → v33: 他校が部員名簿を持つようになった（RivalSchool.rosterSeed）。
 *            Player に origin（入部の経路）を追加。
 * v33 → v34: ProSeason に細かい成績（二塁打・盗塁・四球・投球回・セーブ）と
 *            titles（獲得タイトル）を追加。
 * v34 → v35: 大会に draw（開幕時の抽選で決まる山）を追加。
 */
export const SAVE_VERSION = 36

/** 月（4月始まり。1〜12の暦月をそのまま使う） */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** 進行フェーズ。UI がどの画面を出すかの判断に使う */
export type Phase =
  | 'cardSelect' // 手札から1枚選ぶ
  | 'lineupCheck' // 試合前のスタメン確認
  | 'match' // 試合の観戦中
  | 'yearEnd' // 年度末（3月31日）の結果表示
  | 'newSeason' // 卒業と新入生加入の報告
  | 'tournament' // 大会の進行中（次の試合を待っている）
  | 'camp' // 合宿の方針選択
  | 'growthReport' // その日の成長の報告（マスの効果が始まる前に挟む）
  | 'matchOffer' // 練習試合の相手選び（断ることもできる）
  | 'playerEvent' // 部員1人に起きた出来事の選択
  | 'fork' // ルート分岐の選択

/**
 * 練習効率バフ。黄マスで得る。
 * 練習マスに止まったときだけ消費される（そこでしか練習が発生しないため）。
 */
export type PracticeBoost = {
  /** 成長量にかかる倍率 */
  multiplier: number
  /** 残り回数 */
  remaining: number
}

export type GameState = {
  version: number
  /** 乱数の状態。数値ひとつ */
  rngState: RngState

  /** 学校名 */
  schoolName: string
  /**
   * ユニフォームの色。**学校名から導かない。**
   * 導いていた頃は、学校名を変えると色まで変わってしまい選べなかった。
   */
  uniform: UniformId
  /** 通算年数（1年目＝1） */
  year: number
  month: Month
  phase: Phase

  /** 部員 */
  players: Player[]
  /** スタメン（打順と守備位置） */
  lineup: Lineup
  /**
   * ベンチ入りの選手id。スタメン画面で入れ替えられる。
   * ここに居ない選手はベンチ外で、練習の伸びが鈍い。
   */
  squad: string[]
  /** エースや主将などを将来指定するための参照用（MVPでは未使用） */
  captainId: string | null

  /** 1年ぶんの盤面（365マス＝1マス1日） */
  board: BoardCell[]
  /** コマの現在位置＝年度の通算日（0＝4月1日） */
  boardPosition: number

  /** 現在の手札 */
  hand: PracticeCard[]
  /** カードやログの id を採番するための通し番号。使うたびに増やす */
  serial: number

  /** 有効な練習効率バフ。無ければ null */
  practiceBoost: PracticeBoost | null

  /** 観戦速度の設定。次の試合にも引き継ぐ */
  matchSpeed: MatchSpeed
  /**
   * 進行中の試合。**半回ずつ進む**ので、回の切れ目でここに残る。
   * 決着したら null になり、結果が pendingMatch に移る。
   */
  matchState: MatchState | null
  /** 決着した試合の結果。観戦の再生に使う。無ければ null */
  pendingMatch: MatchResult | null
  /**
   * これから行う試合。スタメン確認中だけ入る。
   * ここに入っている間はまだ試合をシミュレートしていないので、
   * スタメンを変えた結果が試合に反映される。
   */
  pendingSetup: PendingMatchSetup | null

  /** 所在地。参加校数が大会の回戦数を決める */
  regionId: RegionId
  /**
   * 県内のライバル校。**毎年戦力が変わる。**
   * 大会と地元の練習試合の相手はここから引く。
   */
  rivals: RivalSchool[]
  /** 新入生のスカウト。県を訪問すると候補が挙がり、世代交代で結果が出る */
  scouting: ScoutingState
  /**
   * 県ごとの選手の傾向。**新規ゲームで一度だけ決まる。**
   * 途中で変わると「あの県は投手王国だった」という覚え方ができなくなる。
   */
  scoutTraits: TraitMap
  /** 進行中の大会。無ければ null */
  tournament: Tournament | null
  /** 夏の全国大会の出場権（夏の地区大会で優勝すると得る） */
  nationalsBerth: boolean
  /** 春の全国大会の出場権（秋季大会で優勝すると得る） */
  springBerth: boolean

  /** 部費。ショップの購入とコンバートに使う */
  funds: number
  /** グラウンドの整備段階 1〜99。練習の成長量にかかる。放っておくと荒れて下がる */
  groundLevel: number
  /**
   * 在籍しているマネージャー。**買うものではなく入部してくる。**
   * 役割は重複せず、3年生は年度替わりで卒業する。
   */
  managers: TeamManager[]
  /**
   * 持っている練習器具のid。
   * 買うと対応する練習カードが手札に出るようになり、壊れると出なくなる。
   */
  equipment: string[]
  /** ルート分岐の選択待ちなら true */
  pendingFork: boolean
  /**
   * 選択待ちの個人イベント。無ければ null。
   * 定義そのものは持たず id だけを持つ（セーブに関数を入れないため）。
   */
  pendingEvent: PendingPlayerEvent | null
  /**
   * 表示待ちの成長の報告。無ければ null。
   *
   * **マスの効果が画面を奪う前に、その日の成長を見せるための足止め。**
   * 試合マスに止まると、練習の結果を見る前に試合が始まってしまっていた。
   * `nextPhase` は報告を閉じたあとに進むフェーズ。
   */
  pendingGrowth: PendingGrowth | null
  /**
   * 練習試合の相手候補。選ぶまで試合は始まらない。
   * **県内の候補が必ず1つ入る**ので、部費が無くても断らずに戦える。
   */
  pendingOffers: FriendlyOffer[] | null
  /** 学校の評判 0〜100。勝つほど上がり、新入生の質と人数を決める */
  reputation: number
  /** OB名鑑。卒業していった選手の記録（新しい順） */
  graduates: GraduateRecord[]
  /** 表示待ちの世代交代の報告。無ければ null */
  pendingSeason: SeasonReport | null

  /** 画面に表示するログ（古いものから順。一定件数で切り捨てる） */
  log: LogEntry[]
}

/** 表示待ちの成長の報告 */
export type PendingGrowth = {
  /** その日に動いた能力。伸びも下がりも含む */
  changes: import('./player').AbilityChange[]
  /** 報告を閉じたあとに進むフェーズ */
  nextPhase: Phase
}

/** ログの最大保持件数 */
export const LOG_LIMIT = 50

/** OB名鑑に残す最大人数 */
export const GRADUATES_LIMIT = 60

/**
 * エンジンへの入力（コマンド）。
 * UI はこれを dispatch するだけで、ルール計算は一切行わない。
 */
export type GameCommand =
  /** 手札からカードを1枚選ぶ */
  | { type: 'selectCard'; cardId: string }
  /** 年度末の結果を確認して次の年度へ */
  | { type: 'advanceYear' }
  /** スタメンを差し替える */
  | { type: 'setLineup'; lineup: Lineup }
  /** スタメンを自動編成する。方針を選べる（省略時はバランス） */
  | { type: 'autoLineup'; plan?: import('@/core/lineup/autoLineup').AutoLineupPlan }
  /** ベンチ入りを差し替える */
  | { type: 'setSquad'; squad: string[] }
  /** 観戦速度を変える */
  | { type: 'setMatchSpeed'; speed: MatchSpeed }
  /** スタメン確認を終えて試合を始める */
  | { type: 'startMatch' }
  /** 試合を半回ぶん進める。toEnd なら決着まで一気に進める */
  | { type: 'advanceMatch'; toEnd?: boolean }
  /** 試合中に選手を入れ替える（回の切れ目のみ） */
  | { type: 'substitutePlayer'; slotIndex: number; playerId: string }
  /** 試合の観戦を終えて結果を反映する */
  | { type: 'finishMatch' }
  /**
   * 世代交代の報告を確認して新年度を始める。
   * ここでだけ学校名・ユニフォーム・所在地を変えられる（省略すれば変更なし）。
   */
  | {
      type: 'finishSeason'
      schoolName?: string
      uniform?: UniformId
      regionId?: RegionId
    }
  /** 大会の次の試合を行う */
  | { type: 'playTournamentMatch' }
  /** 大会を終えて次の月へ進む */
  | { type: 'finishTournament' }
  /** 合宿の方針を決める */
  | { type: 'chooseCampPlan'; planId: string }
  /** 個人イベントで選択肢を選ぶ */
  | { type: 'choosePlayerEventChoice'; choiceId: string }
  /** その日の成長の報告を閉じて、止まったマスの効果へ進む */
  | { type: 'closeGrowthReport' }
  /** 練習試合の相手を選ぶ。null なら試合を行わない */
  | { type: 'chooseFriendlyMatch'; offerId: string | null }
  /** ショップでアイテムを買う（買った瞬間に効果が出る） */
  | { type: 'buyItem'; itemId: string }
  /** 選手ごとの練習方針を決める（コンバートもここで指示する） */
  | { type: 'setTrainingFocus'; playerId: string; focus: TrainingFocus }
  /** グラウンドを整備する。steps 段階ぶんまとめて上げられる（既定1） */
  | { type: 'upgradeGround'; steps?: number }
  /** 練習器具を買う。対応する練習カードが手札に出るようになる */
  | { type: 'buyEquipment'; equipmentId: string }
  /** スカウトで県を視察する。出張費を払い、候補が挙がる */
  | { type: 'visitScoutRegion'; regionId: RegionId }
  /** U15代表の1人に会いに行く。出身県までの出張費がかかる */
  | { type: 'approachNationalProspect'; prospectId: string }
  /** 視察中の県で候補1人に会いに行く（出張を1回使う） */
  | { type: 'approachProspect'; prospectId: string }
  /** ルート分岐で道筋を選ぶ */
  | { type: 'chooseRoute'; routeId: string }

/**
 * エンジンの戻り値。
 * state は新しい状態、events は「何が起きたか」。UI は events を演出に使う。
 */
export type EngineResult = {
  state: GameState
  events: import('./event').GameEvent[]
}
