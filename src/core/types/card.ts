/** 練習カードに関する型定義 */

/** 練習種別 */
export type PracticeKind =
  | 'batting' // 打撃
  | 'running' // 走塁
  | 'fielding' // 守備
  | 'shoulder' // 肩力
  | 'pitching' // 投球
  | 'breaking' // 変化球
  | 'stamina' // 体力
  | 'mental' // メンタル
  | 'rest' // 休養
  // ── ここから練習以外のカード ──
  | 'bunt' // バント練習（ミートと走力）
  | 'longToss' // 打ち込み（パワーと弾道寄り）
  | 'sprint' // ダッシュ（走力と体力）
  | 'control' // 制球練習（投手のコントロール）
  | 'meeting' // ミーティング（やる気）
  | 'groundskeeping' // グラウンド整備（設備が良くなる）
  | 'medical' // 治療（怪我の回復）
  | 'study' // 自主学習（信頼度）
  | 'outing' // 息抜き（体力とやる気）
  // ── ここから練習器具が要るカード（買うと手札に出るようになる） ──
  | 'teeBatting' // ティー打撃
  | 'weight' // ウエイトトレーニング
  | 'agility' // アジリティ
  | 'machineBatting' // マシン打撃
  | 'bullpen' // ブルペン投球
  | 'videoStudy' // ビデオ分析

export const PRACTICE_LABELS: Record<PracticeKind, string> = {
  batting: '打撃練習',
  running: '走塁練習',
  fielding: '守備練習',
  shoulder: '遠投',
  pitching: '投球練習',
  breaking: '変化球練習',
  stamina: '走り込み',
  mental: 'メンタル強化',
  rest: '休養',
  bunt: 'バント練習',
  longToss: '打ち込み',
  sprint: 'ダッシュ',
  control: '制球練習',
  meeting: 'ミーティング',
  groundskeeping: 'グラウンド整備',
  medical: '治療',
  study: '自主学習',
  outing: '息抜き',
  teeBatting: 'ティー打撃',
  weight: 'ウエイト',
  agility: 'アジリティ',
  machineBatting: 'マシン打撃',
  bullpen: 'ブルペン投球',
  videoStudy: 'ビデオ分析',
}

/** カードの数字＝すごろくで進むマス数 */
/**
 * カードの数字＝進む日数。
 *
 * 盤面が1マス1日になったので、数字はそのまま「何日ぶん練習するか」を表す。
 * 1日ずつでは365手かかって終わらないので、1週間前後を中心にした。
 */
export type CardNumber = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/**
 * 手札に配られる1枚のカード。
 * id は React の key と選択判定に使う、その手札の中だけで一意な値。
 */
export type PracticeCard = {
  id: string
  number: CardNumber
  kind: PracticeKind
  /** レアカード（キラ）。効果が上昇する */
  isRare: boolean
}

/**
 * 手札の初期枚数。
 * 実際の枚数は学校の評判で変わる（`handSizeFor` を使う）。
 */
export const HAND_SIZE = 5
