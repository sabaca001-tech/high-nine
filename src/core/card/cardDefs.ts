/**
 * 練習カードの定義データ。
 * バランス調整はこのファイルの数値を触る（ロジック側に数値を書かない）。
 */

import type { CardNumber, PracticeKind } from '@/core/types/card'
import type { GrowableKey } from '@/core/types/player'

/** 効果の対象 */
export type PracticeTarget = 'all' | 'batter' | 'pitcher'

/** ひとつの能力への上昇効果 */
export type PracticeGain = {
  key: GrowableKey
  /** 基本上昇量。ここにやる気・学年などの補正が掛かる */
  amount: number
  target: PracticeTarget
}

/**
 * 能力以外の効果。練習以外のカードが持つ。
 * 効果の適用は gameEngine 側で行う（部やチームの状態を触るため）。
 */
export type PracticeSpecial =
  /** 全員のやる気が1段階上がる */
  | 'motivationUp'
  /** グラウンドの整備段階が上がる */
  | 'groundUp'
  /** 離脱中の選手の残り期間が1ヶ月減る */
  | 'heal'

export type PracticeDef = {
  kind: PracticeKind
  label: string
  /** カードに表示する短い説明 */
  description: string
  gains: PracticeGain[]
  /** 体力の増減。負なら消耗する */
  conditionDelta: number
  /** 信頼度の増減 */
  trustDelta: number
  /** 手札に出る重み */
  weight: number
  /** 能力以外の効果。練習以外のカードが持つ */
  special?: PracticeSpecial
}

export const PRACTICE_DEFS: Record<PracticeKind, PracticeDef> = {
  batting: {
    kind: 'batting',
    label: '打撃練習',
    description: 'ミートとパワーが伸びる',
    gains: [
      { key: 'meet', amount: 4, target: 'all' },
      { key: 'power', amount: 4, target: 'all' },
    ],
    conditionDelta: -8,
    trustDelta: 0,
    weight: 5,
  },
  running: {
    kind: 'running',
    label: '走塁練習',
    description: '走力が伸びる',
    gains: [{ key: 'speed', amount: 6, target: 'all' }],
    conditionDelta: -8,
    trustDelta: 0,
    weight: 4,
  },
  fielding: {
    kind: 'fielding',
    label: '守備練習',
    description: '守備と捕球が伸びる',
    gains: [
      { key: 'fielding', amount: 4, target: 'all' },
      { key: 'catching', amount: 4, target: 'all' },
    ],
    conditionDelta: -7,
    trustDelta: 0,
    weight: 4,
  },
  shoulder: {
    kind: 'shoulder',
    label: '遠投',
    description: '肩力が伸びる',
    gains: [{ key: 'arm', amount: 6, target: 'all' }],
    conditionDelta: -6,
    trustDelta: 0,
    weight: 3,
  },
  pitching: {
    kind: 'pitching',
    label: '投球練習',
    description: '投手のコントロールとノビが伸びる',
    gains: [
      { key: 'control', amount: 6, target: 'pitcher' },
      { key: 'stamina', amount: 4, target: 'pitcher' },
      { key: 'velocity', amount: 3, target: 'pitcher' },
      // ノビは投げ込みで身につく。速球そのものの威力が上がる
      { key: 'life', amount: 4, target: 'pitcher' },
    ],
    conditionDelta: -7,
    trustDelta: 0,
    weight: 4,
  },
  breaking: {
    kind: 'breaking',
    label: '変化球練習',
    description: '投手のキレが伸び、球種を覚えやすくなる',
    gains: [{ key: 'sharpness', amount: 7, target: 'pitcher' }],
    conditionDelta: -6,
    trustDelta: 0,
    weight: 3,
  },
  stamina: {
    kind: 'stamina',
    label: '走り込み',
    description: 'スタミナと走力が伸びるが、消耗が激しい',
    gains: [
      { key: 'stamina', amount: 7, target: 'pitcher' },
      // 下半身ができると球が速くなる。球速がいちばん伸びる練習
      { key: 'velocity', amount: 6, target: 'pitcher' },
      { key: 'speed', amount: 4, target: 'batter' },
    ],
    conditionDelta: -15,
    trustDelta: 0,
    weight: 3,
  },
  mental: {
    kind: 'mental',
    label: 'メンタル強化',
    description: '能力は伸びないが、信頼度が大きく上がる',
    gains: [],
    conditionDelta: -3,
    // **6では動いた実感が無かった。** 1枚で1〜2しか上がらず、
    // 報告にも出ないので「何も起きていない」と見える
    trustDelta: 11,
    weight: 2,
  },
  rest: {
    kind: 'rest',
    label: '休養',
    description: '体力が大きく回復する',
    gains: [],
    conditionDelta: 30,
    trustDelta: 0,
    weight: 3,
  },

  // ── ここから練習以外／派生のカード ──
  bunt: {
    kind: 'bunt',
    label: 'バント練習',
    description: 'ミートと走力が少し伸びる',
    gains: [
      { key: 'meet', amount: 3, target: 'all' },
      { key: 'speed', amount: 3, target: 'all' },
    ],
    conditionDelta: -5,
    trustDelta: 1,
    weight: 4,
  },
  longToss: {
    kind: 'longToss',
    label: '打ち込み',
    description: 'パワーが大きく伸びるが消耗する',
    gains: [{ key: 'power', amount: 7, target: 'all' }],
    conditionDelta: -15,
    trustDelta: 0,
    weight: 3,
  },
  sprint: {
    kind: 'sprint',
    label: 'ダッシュ',
    description: '走力とスタミナが伸びる',
    gains: [
      { key: 'speed', amount: 5, target: 'all' },
      { key: 'stamina', amount: 5, target: 'pitcher' },
    ],
    conditionDelta: -10,
    trustDelta: 0,
    weight: 4,
  },
  control: {
    kind: 'control',
    label: '制球練習',
    description: '投手のコントロールが大きく伸びる',
    gains: [{ key: 'control', amount: 7, target: 'pitcher' }],
    conditionDelta: -7,
    trustDelta: 0,
    weight: 3,
  },
  meeting: {
    kind: 'meeting',
    label: 'ミーティング',
    description: '全員のやる気が上がり、信頼度も上がる',
    gains: [],
    conditionDelta: -2,
    trustDelta: 7,
    weight: 3,
    special: 'motivationUp',
  },
  groundskeeping: {
    kind: 'groundskeeping',
    label: 'グラウンド整備',
    description: '部員総出で整備する。設備が1段階良くなる',
    gains: [],
    conditionDelta: -12,
    trustDelta: 3,
    weight: 2,
    special: 'groundUp',
  },
  medical: {
    kind: 'medical',
    label: '治療',
    description: '離脱中の選手の復帰が1ヶ月早まる',
    gains: [],
    conditionDelta: 4,
    trustDelta: 2,
    weight: 2,
    special: 'heal',
  },
  study: {
    kind: 'study',
    label: '自主学習',
    description: '練習は休むが、信頼度が大きく上がる',
    gains: [],
    conditionDelta: 2,
    trustDelta: 9,
    weight: 2,
  },
  outing: {
    kind: 'outing',
    label: '息抜き',
    description: '体力が回復し、やる気も上がる',
    gains: [],
    conditionDelta: 15,
    trustDelta: 2,
    weight: 3,
    special: 'motivationUp',
  },

  // ── ここから練習器具が要るカード ──
  teeBatting: {
    kind: 'teeBatting',
    label: 'ティー打撃',
    description: 'ミートが大きく伸びる',
    gains: [{ key: 'meet', amount: 8, target: 'all' }],
    conditionDelta: -8,
    trustDelta: 0,
    weight: 5,
  },
  weight: {
    kind: 'weight',
    label: 'ウエイト',
    description: 'パワーと肩力が大きく伸びる',
    gains: [
      { key: 'power', amount: 7, target: 'all' },
      { key: 'arm', amount: 4, target: 'all' },
    ],
    conditionDelta: -13,
    trustDelta: 0,
    weight: 5,
  },
  agility: {
    kind: 'agility',
    label: 'アジリティ',
    description: '走力と守備が伸びる',
    gains: [
      { key: 'speed', amount: 5, target: 'all' },
      { key: 'fielding', amount: 5, target: 'all' },
    ],
    conditionDelta: -9,
    trustDelta: 0,
    weight: 5,
  },
  machineBatting: {
    kind: 'machineBatting',
    label: 'マシン打撃',
    description: 'ミートとパワーが大きく伸びる',
    gains: [
      { key: 'meet', amount: 6, target: 'all' },
      { key: 'power', amount: 6, target: 'all' },
    ],
    conditionDelta: -11,
    trustDelta: 0,
    weight: 5,
  },
  bullpen: {
    kind: 'bullpen',
    label: 'ブルペン投球',
    description: '投手のコントロールとスタミナが大きく伸びる',
    gains: [
      { key: 'control', amount: 6, target: 'pitcher' },
      { key: 'stamina', amount: 6, target: 'pitcher' },
      { key: 'velocity', amount: 4, target: 'pitcher' },
      { key: 'life', amount: 5, target: 'pitcher' },
      { key: 'sharpness', amount: 4, target: 'pitcher' },
    ],
    conditionDelta: -10,
    trustDelta: 0,
    weight: 5,
  },
  videoStudy: {
    kind: 'videoStudy',
    label: 'ビデオ分析',
    description: '変化球とミートが伸びる。体を使わないので消耗しない',
    gains: [
      { key: 'sharpness', amount: 5, target: 'pitcher' },
      { key: 'meet', amount: 4, target: 'all' },
    ],
    conditionDelta: 0,
    trustDelta: 2,
    weight: 4,
  },
}

/** レアカード（キラ）の出現確率 */
export const RARE_CARD_RATE = 0.08

/** レアカードの効果倍率 */
export const RARE_MULTIPLIER = 2

/**
 * カードの数字（＝進むマス数）の出現重み。
 *
 * 平均2.5マス＝約7.5日。1マス3日・1年122マスなので、1年を約49手で回る。
 * 1マス1日だった頃（3〜12日・約49手）とテンポを揃えてある。
 *
 * ここを変えると1年の手数が変わり、**練習回数＝成長速度が直接動く**ので、
 * 変えるときは必ず `seasonBalance.test.ts` を回すこと。
 */
export const CARD_NUMBER_WEIGHTS: { value: CardNumber; weight: number }[] = [
  { value: 1, weight: 12 },
  { value: 2, weight: 26 },
  { value: 3, weight: 28 },
  { value: 4, weight: 20 },
  { value: 5, weight: 14 },
]
