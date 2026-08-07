/** すごろく盤面に関する型定義 */

/**
 * マスの種別。
 * 本家の色分け（青=良/赤=悪/白=ランダム/緑=回復/黄=練習効率）を踏襲している。
 * 詳細は docs/game-design.md §2 を参照。
 */
export type CellKind =
  | 'practice' // 練: 選んだカードの練習内容で成長
  | 'good' // 青: 良いイベント
  | 'bad' // 赤: 悪いイベント
  | 'random' // 白: 良いことも悪いことも起こる
  | 'rest' // 緑: 体力が大きく回復
  | 'boost' // 黄: 練習効率アップ
  | 'training' // 特: 特訓（特殊能力の取得に挑戦）
  | 'event' // 人: 部員1人に起きる出来事。監督が選ぶ
  | 'alumni' // OB: 卒業生の訪問
  | 'match' // 試: 練習試合
  | 'fork' // 分: ルート分岐。この先の道筋を選ぶ
  | 'tournament' // 大会。必ず止まる
  | 'camp' // 合宿（夏・冬）。必ず止まる
  | 'blank' // 何も起きない
  | 'goal' // 年度末（3月31日）

export const CELL_LABELS: Record<CellKind, string> = {
  practice: '練習',
  good: 'グッド',
  bad: 'バッド',
  random: 'ランダム',
  rest: '休養',
  boost: '練習効率アップ',
  training: '特訓',
  event: '部員の出来事',
  alumni: 'OB訪問',
  match: '練習試合',
  fork: 'ルート分岐',
  tournament: '大会',
  camp: '合宿',
  blank: '何もなし',
  goal: '年度末',
}

/** マスに表示する短い記号 */
export const CELL_MARKS: Record<CellKind, string> = {
  practice: '練',
  good: '青',
  bad: '赤',
  random: '白',
  rest: '緑',
  boost: '黄',
  training: '特',
  event: '人',
  alumni: 'OB',
  match: '試',
  fork: '分',
  tournament: '大会',
  camp: '合宿',
  blank: '・',
  goal: '年度末',
}

/**
 * 必ず止まるマス。
 * 通り過ぎさせず、その日で移動を打ち切る。
 */
export const FORCED_STOP_KINDS: CellKind[] = ['tournament', 'camp']

export function isForcedStop(kind: CellKind): boolean {
  return FORCED_STOP_KINDS.includes(kind)
}

/** 盤面の1マス。index はマスの番号（0＝4月1日、1マス＝3日） */
export type BoardCell = {
  /** 0始まりのマス番号 */
  index: number
  kind: CellKind
  /**
   * 大会マスのときだけ入る大会の種類。
   * **回戦ごとに別のマス**が置かれ、敗退すると残りは普通のマスに戻る。
   */
  tournamentKind?: import('./tournament').TournamentKind
  /** 大会マスのときだけ入る回戦（1始まり） */
  round?: number
}
