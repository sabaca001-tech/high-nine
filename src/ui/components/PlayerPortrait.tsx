/**
 * 選手の顔。
 *
 * **写真ではなくベクターで描く**（画像アセットを持たない方針）。
 * 見た目は id から決まるので、同じ選手はいつでも同じ顔になる。
 *
 * ## 作り方
 *
 * **配置は全員同じ。変えるのはパーツだけ。**
 * 目の間隔・顎の幅・顔の長さまで乱数で振っていた頃は、
 * 顔ごとに骨格が変わって「人の顔に見えないもの」が混ざっていた。
 * 目は必ず `EYE_Y`、あごは `CHIN_Y`、耳は `±CHEEK` —— と位置を定数で固定し、
 * そこに入るパーツ（輪郭・髪型・眉・目・鼻・口）を差し替える形にしてある。
 *
 * ## 絵柄
 *
 * **陰影で立体を出す**（漫画のベタ塗りではなく、写真寄りの見え方）。
 *
 * - 肌・髪・瞳は放射／線形グラデーションで塗る
 * - 輪郭線は細く、色も黒ではなく**暗い肌色**にして線を目立たせない
 * - 頬・鼻・帽子の下に落ちる影を1枚ずつ乗せる
 *
 * **写真そのものは生成できない。** 顔写真を作るにはモデル（数十〜数百MB）を
 * 積むか外部サービスに投げるかで、どちらもこのゲームの前提
 * （オフラインで動く・画像アセットを持たない・セーブは localStorage）と噛み合わない。
 * 1人ぶんの顔写真は圧縮しても50〜200KBあり、30人×数十年ぶんを抱えると
 * localStorage の上限（5MB）を軽く超える。
 */

import type { CSSProperties } from 'react'
import { capInitial, normalizeCap } from '@/core/team/cap'
import type { CapDesign } from '@/core/team/cap'
import { useGameStore } from '@/state/useGameStore'
import { capColorOf } from '@/ui/theme/capColors'

type Props = {
  playerId: string
  size?: number
  /** 帽子をかぶせる */
  cap?: boolean
  /** 帽子のデザイン。省略時は自校の設定を使う */
  capDesign?: CapDesign
  /** ロゴに使う学校名。省略時は自校の名前 */
  schoolName?: string
  /** マネージャーは髪型の候補が変わる */
  variant?: 'player' | 'manager'
  /**
   * 留学生。**肌の色の候補が変わる。**
   * 日本人の肌は個人差が小さいので、通常は狭い範囲でしか振らない。
   */
  exchange?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * 輪郭線。**黒で囲まない。**
 * 黒い線で囲むと絵が漫画になるので、暗い肌色に寄せて線を沈める。
 */
const OUTLINE = 'rgba(60, 34, 22, 0.55)'

/** 目鼻立ちの線。ここだけは少し濃く取る */
const FEATURE = 'rgba(48, 28, 20, 0.85)'

// ── 位置（全員共通）──────────────────────

/** 目の高さ */
const EYE_Y = 1
/** 目の中心の左右の位置 */
const EYE_X = 13
/** 眉の高さ */
const BROW_Y = -9
/** あごの先 */
const CHIN_Y = 30
/** 頬（顔の最大幅の半分）。耳もここに付く */
const CHEEK = 32
/** 頭のてっぺん */
const HEAD_TOP = -46
/** 鼻の付け根 */
const NOSE_Y = 5
/** 口の高さ */
const MOUTH_Y = 20
/** 帽子のつばの高さ */
const BRIM_Y = -26

/**
 * 髪型のパスは、顔より小さい頭（男子±28／マネージャー±30）を前提に描いてある。
 * **顔より確実に外側へ出す**ように引き伸ばす。
 *
 * ここが足りないと、髪が顔の裏に隠れて**坊主頭に見える**。
 * 帽子をかぶる選手は前髪で誤魔化せるが、
 * かぶらないマネージャーは髪が1本も見えなくなっていた。
 */
const HAIR_SCALE_MALE = 1.3
const HAIR_SCALE_MANAGER = 1.22

/**
 * 目鼻立ちの縮尺。
 *
 * **顔に対してパーツが大きすぎた。** 目は左右で顔幅の8割を占めていて、
 * 人の顔というより記号に見えていた。
 * パスはそのままに、描くときだけ縮める。
 */
const FEATURE_SCALE = 0.74

/** 描画範囲。帽子と髪が顔より上に出るので上を広く取る */
const VIEW_BOX = '-52 -62 104 104'

// ── 色 ──────────────────────────────────

/**
 * 肌の色（日本人）。
 * **ほとんど差を付けない。** 実際、日焼けの度合いくらいしか変わらない。
 * 褐色まで混ぜていた頃は、同じ学校に人種が混ざって見えていた。
 */
const SKIN_JP = [
  { light: '#fff0e0', base: '#ffe0c3', shade: '#e8bd97' },
  { light: '#ffecd8', base: '#fbd9ba', shade: '#e0b28c' },
  { light: '#fde5cd', base: '#f7d2ae', shade: '#d9a882' },
  { light: '#f9dcc0', base: '#f1c9a2', shade: '#cf9c74' },
  { light: '#f3d3b4', base: '#e9bf95', shade: '#c58e66' },
  { light: '#eccaa8', base: '#e0b489', shade: '#b9825a' },
]

/** 肌の色（留学生）。ここだけ広く取る */
const SKIN_EXCHANGE = [
  { light: '#e6bb90', base: '#d5a273', shade: '#b07f54' },
  { light: '#cf9c72', base: '#bd8759', shade: '#96653c' },
  { light: '#b5825a', base: '#a06e46', shade: '#7d5130' },
  { light: '#96694a', base: '#835537', shade: '#633c24' },
  { light: '#7d573c', base: '#6a442b', shade: '#4d2f1b' },
]

/** 髪の色。日本人は黒〜焦げ茶が大半で、たまに明るい色 */
const HAIR_COLORS = [
  { light: '#3a3840', base: '#1d1c21', deep: '#0e0d10' },
  { light: '#3e3940', base: '#221f24', deep: '#111015' },
  { light: '#44393a', base: '#271f20', deep: '#150f10' },
  { light: '#4b3d38', base: '#2c2320', deep: '#171210' },
  { light: '#54453c', base: '#332822', deep: '#1b1411' },
  { light: '#5b4a3e', base: '#392c23', deep: '#1f1713' },
  { light: '#66523f', base: '#413124', deep: '#241a13' },
  { light: '#725c46', base: '#4b3728', deep: '#2b1e15' },
  { light: '#80684d', base: '#57402d', deep: '#33241a' },
  { light: '#8f7658', base: '#634a34', deep: '#3c2b1e' },
]

/** 瞳の色。黒目がちだが、少しだけ幅を持たせる */
const EYE_COLORS = [
  { light: '#3a2c2a', base: '#241a1b', deep: '#120c0d' },
  { light: '#453230', base: '#2b1e1c', deep: '#160e0d' },
  { light: '#513a2d', base: '#33231a', deep: '#1a1109' },
  { light: '#5d4430', base: '#3c2a1c', deep: '#20150c' },
  { light: '#6b503a', base: '#453120', deep: '#261a0f' },
  { light: '#7a5c42', base: '#4f3826', deep: '#2c1e12' },
]

// ── パーツ ──────────────────────────────

/**
 * 輪郭。**すべて同じ枠に収める**（頭のてっぺん・頬・あご先が共通）。
 * 変えるのは頬の張り方とあごの絞り方だけ。
 */
function faceShape(cheekY: number, jawIn: number, chinIn: number): string {
  return (
    `M ${-CHEEK} ${cheekY}` +
    ` C ${-CHEEK} ${HEAD_TOP + 4} ${-CHEEK * 0.62} ${HEAD_TOP} 0 ${HEAD_TOP}` +
    ` C ${CHEEK * 0.62} ${HEAD_TOP} ${CHEEK} ${HEAD_TOP + 4} ${CHEEK} ${cheekY}` +
    ` C ${CHEEK} ${cheekY + jawIn} ${chinIn} ${CHIN_Y - 6} 0 ${CHIN_Y}` +
    ` C ${-chinIn} ${CHIN_Y - 6} ${-CHEEK} ${cheekY + jawIn} ${-CHEEK} ${cheekY}` +
    ` z`
  )
}

/** 10種類。丸顔・面長・エラ張り・細面 など */
const FACE_SHAPES = [
  faceShape(-4, 10, 14),
  faceShape(-2, 12, 12),
  faceShape(-6, 8, 16),
  faceShape(0, 14, 10),
  faceShape(-3, 11, 18),
  faceShape(-5, 9, 11),
  faceShape(-1, 13, 15),
  faceShape(-7, 7, 13),
  faceShape(-2, 10, 9),
  faceShape(-4, 12, 17),
]

/**
 * 髪型（男子）。**頭の輪郭に沿わせ、毛先を尖らせる。**
 * どれも同じ頭（てっぺん `HEAD_TOP`、幅 `CHEEK`）に載る。
 */
const HAIR_MALE = [
  // 短いスパイク
  'M -28 -14 q 2 -28 28 -28 q 26 0 28 28 l -7 -11 l -4 9 l -6 -12 l -5 10 l -7 -11 l -6 10 l -5 -9 l -5 10 z',
  // 立ち上げた前髪
  'M -28 -12 q 1 -30 28 -30 q 27 0 28 30 l -6 -16 l -5 8 l -5 -15 l -6 9 l -5 -16 l -7 11 l -5 -9 l -5 12 z',
  // 七三分け
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 l -10 -14 q -12 9 -26 4 q -10 -4 -15 9 z',
  // 短く刈り上げ
  'M -27 -16 q 1 -26 27 -26 q 26 0 27 26 q -7 -7 -27 -7 q -20 0 -27 7 z',
  // 前髪を下ろす
  'M -28 -8 q 0 -34 28 -34 q 28 0 28 34 l -8 -12 l -6 11 l -7 -13 l -7 12 l -7 -12 l -6 11 l -6 -11 l -6 12 z',
  // 真ん中分け
  'M -28 -10 q 0 -32 28 -32 q 28 0 28 32 l -9 -13 q -9 8 -19 8 q -10 0 -19 -8 z',
  // ツンツン（毛先が長い）
  'M -28 -12 q 2 -30 28 -30 q 26 0 28 30 l -6 -20 l -5 10 l -5 -18 l -6 12 l -5 -19 l -7 13 l -5 -11 l -6 15 z',
  // 坊主
  'M -26 -18 q 2 -24 26 -24 q 24 0 26 24 q -8 -5 -26 -5 q -18 0 -26 5 z',
  // 横に流す
  'M -28 -10 q 0 -32 28 -32 q 28 0 28 32 l -12 -14 q -16 8 -30 2 q -8 -3 -14 10 z',
  // 前下がり
  'M -28 -6 q 0 -36 28 -36 q 28 0 28 36 l -7 -14 l -5 12 l -6 -14 l -6 13 l -6 -13 l -6 12 l -6 -12 l -6 14 z',
  // ソフトモヒカン
  'M -27 -14 q 1 -28 27 -28 q 26 0 27 28 l -6 -8 l -5 6 l -4 -18 l -6 16 l -5 -16 l -5 18 l -5 -6 l -5 8 z',
  // 天然パーマ（丸い束）
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 q -5 -6 -9 -2 q -5 -7 -10 -1 q -5 -8 -10 0 q -5 -6 -10 0 q -5 -5 -9 3 z',
  // 長めのマッシュ
  'M -29 -4 q 0 -38 29 -38 q 29 0 29 38 q -6 -14 -10 -16 q -8 6 -19 6 q -11 0 -19 -6 q -4 2 -10 16 z',
  // 刈り上げ＋前髪
  'M -27 -14 q 1 -28 27 -28 q 26 0 27 28 l -8 -10 l -6 9 l -7 -11 l -8 10 l -6 -9 l -7 11 z',
  // ぼさぼさ
  'M -28 -10 q 0 -32 28 -32 q 28 0 28 32 l -5 -12 l -6 6 l -4 -14 l -7 10 l -4 -14 l -7 12 l -5 -10 l -6 12 z',
  // 直毛の短髪
  'M -27 -13 q 1 -29 27 -29 q 26 0 27 29 l -9 -8 q -18 -6 -36 0 z',
]

/** 髪型（マネージャー）。輪郭の外まで下ろして長さを出す */
const HAIR_MANAGER = [
  // 肩までのストレート
  'M -30 -8 q 0 -34 30 -34 q 30 0 30 34 v 40 q -5 -30 -9 -35 q -12 7 -21 7 q -9 0 -21 -7 q -4 5 -9 35 z',
  // 前髪ぱっつん
  'M -30 -6 q 0 -36 30 -36 q 30 0 30 36 v 32 q -4 -26 -8 -30 h -44 q -4 4 -8 30 z',
  // ポニーテール
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 q 7 5 7 17 q 0 10 -5 15 q 2 -15 -5 -22 q -10 5 -25 5 q -15 0 -25 -5 q -5 5 -3 18 z',
  // ボブ
  'M -29 -8 q 0 -34 29 -34 q 29 0 29 34 v 16 q -5 -15 -8 -18 q -11 7 -21 7 q -10 0 -21 -7 q -3 3 -8 18 z',
  // サイドテール
  'M -29 -8 q 0 -34 29 -34 q 29 0 29 34 v 10 q -4 -12 -7 -15 q -11 7 -22 7 q -11 0 -22 -7 q -3 3 -7 15 q 0 16 -6 22 q -4 -12 6 -32 z',
  // 三つ編み
  'M -29 -8 q 0 -34 29 -34 q 29 0 29 34 v 26 q -4 -22 -8 -26 q -11 7 -21 7 q -10 0 -21 -7 q -4 4 -8 26 z',
  // 短めのショート
  'M -28 -12 q 0 -30 28 -30 q 28 0 28 30 v 6 q -5 -10 -8 -12 q -10 6 -20 6 q -10 0 -20 -6 q -3 2 -8 12 z',
  // ふんわり内巻き
  'M -30 -6 q 0 -36 30 -36 q 30 0 30 36 v 24 q -3 -12 -8 -14 q -6 8 -14 4 q 6 -8 4 -14 q -12 6 -24 0 q -2 6 4 14 q -8 4 -14 -4 q -5 2 -8 14 z',
  // 高い位置のお団子
  'M -28 -12 q 0 -26 28 -26 q 28 0 28 26 q -8 -6 -28 -6 q -20 0 -28 6 z M -8 -40 a 8 8 0 0 1 16 0 a 8 8 0 0 1 -16 0 z',
  // 分け目のあるロング
  'M -30 -6 q 0 -36 30 -36 q 30 0 30 36 v 38 q -5 -30 -9 -34 q -10 8 -21 8 q -11 0 -21 -8 q -4 4 -9 34 z',
]

/**
 * 前髪。**帽子をかぶると髪が全部隠れる**ので、つばの下に出るぶんを別に描く。
 * これがあるだけで「帽子をかぶった人」に見える。
 */
const BANGS = [
  'M 0 -3 l 9 15 l 4 -13 l 8 12 v -14 z',
  'M 0 -3 l 15 16 l 5 -15 v -4 z',
  'M 0 -3 l 6 10 l 4 -8 l 6 11 l 4 -9 l 5 8 v -12 z',
  'M 0 -3 l 11 13 l 3 -11 l 6 9 v -12 z',
  'M 0 -3 l 5 12 l 5 -10 l 5 12 l 4 -11 v -3 z',
  'M 0 -3 l 8 9 l 3 -7 l 7 10 l 3 -9 l 4 6 v -9 z',
]

/** 眉。角度と太さで気性を出す */
const BROWS = [
  { d: 'M -13 -3 l 14 3', width: 3.6 },
  { d: 'M -13 -1 l 14 0', width: 4.4 },
  { d: 'M -13 1 l 14 -5', width: 3.2 },
  { d: 'M -13 -4 l 14 5', width: 4.8 },
  { d: 'M -13 0 q 7 -5 14 0', width: 3.4 },
  { d: 'M -13 -2 q 7 -4 14 1', width: 4.2 },
  { d: 'M -12 -2 l 12 2', width: 5.2 },
  { d: 'M -13 2 l 14 -6', width: 4 },
  { d: 'M -13 -1 q 7 2 14 -3', width: 3 },
  { d: 'M -12 0 l 11 -1', width: 5.6 },
  { d: 'M -13 -3 q 7 1 14 2', width: 3.8 },
  { d: 'M -13 1 q 7 -6 14 -1', width: 4.6 },
]

/**
 * 目。白目の大きさ・瞳の大きさ・上まぶたの線を組み合わせる。
 * `tilt` は目尻の上がり（マイナスで吊り目）。
 */
const EYES = [
  { rx: 7.4, ry: 5.4, iris: 4.2, lid: 'M -8 -1 l 16 2', tilt: -3 },
  { rx: 7.8, ry: 6.2, iris: 4.6, lid: 'M -8 0 q 8 -5 16 0', tilt: 0 },
  { rx: 7.0, ry: 4.2, iris: 3.8, lid: 'M -8 0 l 16 0', tilt: 0 },
  { rx: 7.6, ry: 5.8, iris: 4.4, lid: 'M -8 0 q 8 -3 16 3', tilt: 2 },
  { rx: 8.2, ry: 6.6, iris: 5.0, lid: 'M -9 -1 q 9 -6 18 1', tilt: -1 },
  { rx: 6.6, ry: 4.6, iris: 3.6, lid: 'M -7 -1 l 14 3', tilt: -4 },
  { rx: 7.2, ry: 5.0, iris: 4.0, lid: 'M -8 1 q 8 -6 16 -1', tilt: -2 },
  { rx: 7.9, ry: 5.6, iris: 4.4, lid: 'M -8 -2 l 16 4', tilt: -5 },
  { rx: 7.4, ry: 6.0, iris: 4.8, lid: 'M -8 1 q 8 -2 16 4', tilt: 3 },
  { rx: 6.9, ry: 4.4, iris: 3.6, lid: 'M -7 0 q 7 -4 14 0', tilt: 0 },
  { rx: 8.0, ry: 5.2, iris: 4.2, lid: 'M -8 -1 q 8 -4 16 2', tilt: -1 },
  { rx: 7.1, ry: 5.6, iris: 4.6, lid: 'M -8 0 l 16 -2', tilt: 1 },
]

/** 鼻。線だけで示す（塗らない） */
const NOSES = [
  'M 1 0 l -3 8 l 6 1',
  'M 0 2 l -2 7 q 3 2 6 -1',
  'M 1 1 l -2 9 l 5 0',
  'M 0 3 q -3 5 0 7 q 3 1 5 -1',
  'M 1 0 l -1 9 l 4 1',
  'M 0 4 l -3 5 l 6 1',
  'M 1 2 q -4 5 -1 8 l 5 -1',
  'M 0 0 l -2 10 l 5 -1',
  'M 1 3 l -2 6 l 4 1',
  'M 0 1 q -3 7 1 9 l 4 -2',
]

/** 口 */
const MOUTHS = [
  'M -7 0 q 7 4 14 0',
  'M -6 0 l 12 0',
  'M -7 -1 q 7 8 14 0',
  'M -5 0 q 5 6 10 -1',
  'M -6 1 q 6 -5 12 0',
  'M -8 0 q 8 3 16 -1',
  'M -5 -1 l 10 2',
  'M -6 0 q 6 6 12 1',
  'M -7 1 q 7 -4 14 1',
  'M -4 0 q 4 5 8 0',
  'M -8 1 l 15 -2',
  'M -6 -1 q 6 7 12 -1',
]

/** 文字列から安定した数値を作る */
function hash(value: string): number {
  let total = 2166136261
  for (let i = 0; i < value.length; i++) {
    total ^= value.charCodeAt(i)
    total = Math.imul(total, 16777619)
  }
  return total >>> 0
}

/**
 * hash から1つ選ぶ。
 *
 * 注意: シフト結果が負にならないよう必ず符号なしで扱う。
 * `>>` を使うと 2^31 以上の hash で負の添字になり、undefined を引いて落ちる。
 */
function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length]
}

export function PlayerPortrait({
  playerId,
  size = 44,
  cap = false,
  capDesign,
  schoolName,
  variant = 'player',
  exchange = false,
  className,
  style,
}: Props) {
  /*
   * **帽子は自校の設定をそのまま使う。**
   * 呼び出し側ごとに色を渡していた頃は、画面によって帽子の色が違っていた。
   * 明示的に渡されたときだけそちらを優先する（エディットの試着で使う）。
   */
  const game = useGameStore((s) => s.game)
  const design = capDesign ?? normalizeCap(game?.cap)
  const school = schoolName ?? game?.schoolName ?? ''

  const h = hash(playerId)
  const manager = variant === 'manager'

  // **パーツごとに別のビットを使う。** 同じビットから引くと組み合わせが偏る
  const skin = pick(exchange ? SKIN_EXCHANGE : SKIN_JP, h)
  const hair = pick(HAIR_COLORS, h >>> 3)
  const hairstyle = pick(manager ? HAIR_MANAGER : HAIR_MALE, h >>> 7)
  const face = pick(FACE_SHAPES, h >>> 11)
  const brow = pick(BROWS, h >>> 14)
  const eye = pick(EYES, h >>> 17)
  const iris = pick(EYE_COLORS, h >>> 20)
  const nose = pick(NOSES, h >>> 22)
  const mouth = pick(MOUTHS, h >>> 25)
  const bang = pick(BANGS, h >>> 28)

  const crown = capColorOf(design.crown)
  const brim = capColorOf(design.brim)
  const logoColor = capColorOf(design.logoColor)

  // グラデーションの id は選手ごとに分ける（同じ id が複数あると混ざる）
  const skinId = `skin-${playerId}`
  const hairId = `hair-${playerId}`
  const irisId = `iris-${playerId}`
  const capId = `cap-${playerId}`
  const faceClip = `face-${playerId}`

  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      className={className}
      style={style}
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        {/* 肌。左上から光を当てて、輪郭に向かって落とす */}
        <radialGradient id={skinId} cx="38%" cy="28%" r="82%">
          <stop offset="0%" stopColor={skin.light} />
          <stop offset="55%" stopColor={skin.base} />
          <stop offset="100%" stopColor={skin.shade} />
        </radialGradient>
        {/* 髪。上を明るく、根元を暗く */}
        <linearGradient id={hairId} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={hair.light} />
          <stop offset="45%" stopColor={hair.base} />
          <stop offset="100%" stopColor={hair.deep} />
        </linearGradient>
        {/* 瞳。中心を暗く、周辺を明るく */}
        <radialGradient id={irisId} cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor={iris.light} />
          <stop offset="70%" stopColor={iris.base} />
          <stop offset="100%" stopColor={iris.deep} />
        </radialGradient>
        <linearGradient id={capId} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
        </linearGradient>
        {/* 頬や鼻の影が輪郭からはみ出さないよう切り抜く */}
        <clipPath id={faceClip}>
          <path d={face} />
        </clipPath>
      </defs>

      {/* 首と肩。顔より暗くして、顔を前に出す */}
      <path
        d={`M -10 ${CHIN_Y - 6} h 20 v 12 h -20 z`}
        fill={skin.shade}
        stroke={OUTLINE}
        strokeWidth="1"
      />
      <path
        d="M -48 48 q 12 -10 36 -12 h 24 q 24 2 36 12 z"
        fill="var(--uniform-a)"
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="1.2"
      />

      {/* 耳 */}
      <ellipse cx={-CHEEK + 1} cy="6" rx="4.4" ry="7.5" fill={skin.base} stroke={OUTLINE} strokeWidth="1" />
      <ellipse cx={CHEEK - 1} cy="6" rx="4.4" ry="7.5" fill={skin.base} stroke={OUTLINE} strokeWidth="1" />

      {/* 顔 */}
      <path d={face} fill={`url(#${skinId})`} stroke={OUTLINE} strokeWidth="1.2" />

      <g clipPath={`url(#${faceClip})`}>
        {/* 頬の陰。片側にだけ落として立体を出す */}
        <ellipse cx={CHEEK * 0.62} cy={EYE_Y + 8} rx="13" ry="18" fill={skin.shade} opacity="0.55" />
        {/* あご下の陰 */}
        <ellipse cx="0" cy={CHIN_Y + 2} rx="16" ry="7" fill={skin.shade} opacity="0.5" />
        {/* 帽子の下に落ちる影 */}
        {cap && <rect x="-30" y={BRIM_Y} width="60" height="9" fill="rgba(60,34,22,0.28)" />}
      </g>

      {/*
        髪。**顔の上に描く。**
        顔の裏に敷いていた頃は、輪郭からはみ出した縁しか見えず、
        帽子をかぶらないマネージャーが坊主頭に見えていた。
        髪型のパスは頭全体を覆う形なので、前に置けば生え際がそのまま出る。
      */}
      <path
        d={hairstyle}
        transform={`scale(${manager ? HAIR_SCALE_MANAGER : HAIR_SCALE_MALE})`}
        fill={`url(#${hairId})`}
        stroke={OUTLINE}
        strokeWidth="0.9"
      />

      {/* 眉 */}
      <path
        d={brow.d}
        transform={`translate(${-EYE_X + 4} ${BROW_Y}) scale(${FEATURE_SCALE})`}
        fill="none"
        stroke={hair.base}
        strokeWidth={brow.width}
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d={brow.d}
        transform={`translate(${EYE_X + 5} ${BROW_Y}) scale(${-FEATURE_SCALE} ${FEATURE_SCALE})`}
        fill="none"
        stroke={hair.base}
        strokeWidth={brow.width}
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* 目。白目・虹彩・瞳孔・ハイライトの4層 */}
      {[-1, 1].map((side) => (
        <g
          key={side}
          transform={`translate(${EYE_X * side} ${EYE_Y}) scale(${side * FEATURE_SCALE} ${FEATURE_SCALE})`}
        >
          <ellipse cx="0" cy="0" rx={eye.rx} ry={eye.ry} fill="#fdf7f2" />
          <ellipse cx="0.8" cy="0.4" rx={eye.iris * 0.92} ry={eye.iris} fill={`url(#${irisId})`} />
          <ellipse cx="0.8" cy="0.4" rx={eye.iris * 0.42} ry={eye.iris * 0.46} fill="#140f10" />
          <circle cx="2.2" cy={-eye.iris * 0.42} r={eye.iris * 0.3} fill="#ffffff" opacity="0.95" />
          {/* 上まぶた。細い線で目のふちを描く */}
          <path
            d={eye.lid}
            transform={`translate(0 ${-eye.ry - 0.4 + eye.tilt})`}
            fill="none"
            stroke={FEATURE}
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          {/* 下まぶた。薄く入れると目が丸く見える */}
          <path
            d={`M ${-eye.rx * 0.8} ${eye.ry * 0.8} q ${eye.rx * 0.8} ${eye.ry * 0.5} ${eye.rx * 1.6} ${-eye.ry * 0.1}`}
            fill="none"
            stroke={OUTLINE}
            strokeWidth="0.9"
          />
        </g>
      ))}

      {/* 鼻。線と影で示す */}
      <path
        d={nose}
        transform={`translate(0 ${NOSE_Y}) scale(${FEATURE_SCALE})`}
        fill="none"
        stroke={FEATURE}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />

      {/* 口。マネージャーは唇を塗る */}
      {manager ? (
        <path
          d={`M -5 ${MOUTH_Y} q 5 -2.5 10 0 q -5 4 -10 0 z`}
          fill="#c9736f"
          stroke={FEATURE}
          strokeWidth="0.8"
        />
      ) : (
        <path
          d={mouth}
          transform={`translate(0 ${MOUTH_Y}) scale(${FEATURE_SCALE})`}
          fill="none"
          stroke={FEATURE}
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {/* 帽子 */}
      {cap && (
        <g>
          {/* 前髪。つばの下から出す。これが無いと帽子が地肌に載って見える */}
          <path
            d={bang}
            transform={`translate(${-CHEEK * 0.62} ${BRIM_Y + 2})`}
            fill={`url(#${hairId})`}
            stroke={OUTLINE}
            strokeWidth="0.9"
          />
          <path
            d={bang}
            transform={`translate(${CHEEK * 0.62} ${BRIM_Y + 2}) scale(-1 1)`}
            fill={`url(#${hairId})`}
            stroke={OUTLINE}
            strokeWidth="0.9"
          />

          {/* 本体 */}
          <path
            d={`M ${-CHEEK - 2} ${BRIM_Y} a ${CHEEK + 2} ${CHEEK * 1.05} 0 0 1 ${CHEEK * 2 + 4} 0 z`}
            fill={crown}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="1"
          />
          <path
            d={`M ${-CHEEK - 2} ${BRIM_Y} a ${CHEEK + 2} ${CHEEK * 1.05} 0 0 1 ${CHEEK * 2 + 4} 0 z`}
            fill={`url(#${capId})`}
          />
          {/* つば */}
          <path
            d={`M ${-CHEEK - 3} ${BRIM_Y} h ${CHEEK * 2 + 6} q 8 1 7 5 q -1 3 -9 2 h ${-(CHEEK * 2 + 2)} q -6 0 -6 -3 z`}
            fill={brim}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="1"
          />
          {/* マーク */}
          <CapLogo design={design} schoolName={school} color={logoColor} y={BRIM_Y - CHEEK * 0.5} />
        </g>
      )}
    </svg>
  )
}

/** 帽子のマーク。文字と図形で描き分ける */
function CapLogo({
  design,
  schoolName,
  color,
  y,
}: {
  design: CapDesign
  schoolName: string
  color: string
  y: number
}) {
  if (design.logo === 'none') return null

  if (design.logo === 'initial') {
    return (
      <text
        x="0"
        y={y + 4}
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill={color}
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="0.8"
        paintOrder="stroke"
      >
        {capInitial(schoolName)}
      </text>
    )
  }

  const marks: Record<string, string> = {
    star: 'M 0 -9 l 2.6 5.6 l 6.2 0.7 l -4.6 4.2 l 1.3 6.1 l -5.5 -3.1 l -5.5 3.1 l 1.3 -6.1 l -4.6 -4.2 l 6.2 -0.7 z',
    bolt: 'M 2 -10 l -8 11 h 5 l -3 10 l 9 -12 h -5 z',
    leaf: 'M 0 -9 q 9 5 8 12 q -1 6 -8 6 q -7 0 -8 -6 q -1 -7 8 -12 z',
  }

  return (
    <path
      d={marks[design.logo]}
      transform={`translate(0 ${y})`}
      fill={color}
      stroke="rgba(0,0,0,0.45)"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  )
}
