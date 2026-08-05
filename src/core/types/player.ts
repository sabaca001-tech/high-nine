/** 選手に関する型定義 */

/** 学年 */
export type Grade = 1 | 2 | 3

/** ポジション */
export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF'

export const POSITION_LABELS: Record<Position, string> = {
  P: '投手',
  C: '捕手',
  '1B': '一塁手',
  '2B': '二塁手',
  '3B': '三塁手',
  SS: '遊撃手',
  LF: '左翼手',
  CF: '中堅手',
  RF: '右翼手',
}

/** 弾道（1〜4）。他の能力と違い上限が4なので別扱いにする */
export type Trajectory = 1 | 2 | 3 | 4

/** 野手能力。値はすべて 1〜100 */
export type BattingAbilities = {
  /** 弾道 1〜4 */
  trajectory: Trajectory
  /** ミート */
  meet: number
  /** パワー */
  power: number
  /** 走力 */
  speed: number
  /** 肩力 */
  arm: number
  /** 守備 */
  fielding: number
  /** 捕球 */
  catching: number
}

/**
 * 変化球の変化方向。打者から見た曲がる向き。
 * 同じ方向にも複数の球種があり、どれを覚えるかは選手ごとに決まる。
 */
export type PitchDirection =
  /** スライダー系（左へ） */
  | 'left'
  /** カーブ系（左下へ） */
  | 'lowerLeft'
  /** フォーク系（真下へ） */
  | 'down'
  /** シンカー系（右下へ） */
  | 'lowerRight'
  /** シュート系（右へ） */
  | 'right'
  /** 特殊（浮き上がる・揺れる） */
  | 'up'

/** 覚えている変化球1つ */
export type Pitch = {
  direction: PitchDirection
  /** 球種名（同じ方向でもカーブ／スローカーブなど複数ある） */
  name: string
  /** 変化量 1〜7 */
  level: number
}

/** 投手能力 */
export type PitchingAbilities = {
  /** 球速(km/h)。他と違い実数値で持つ */
  velocity: number
  /** コントロール 1〜100 */
  control: number
  /** スタミナ 1〜100 */
  stamina: number
  /** 変化球の総合力 1〜100。試合の判定にはこの値を使う */
  breaking: number
  /** 覚えている球種。どの方向に何を持っているかを見せるために持つ */
  pitches: Pitch[]
}

/**
 * 成長対象になる能力のキー。
 * 弾道だけは伸び方が特殊なので含めない。
 *
 * **球速（velocity）は km/h の実数値**で、他の能力（1〜100）と尺度が違う。
 * `getAbility` / `raiseAbility` / `calcGrowth` が個別に扱う。
 */
export type GrowableKey =
  | 'meet'
  | 'power'
  | 'speed'
  | 'arm'
  | 'fielding'
  | 'catching'
  | 'velocity'
  | 'control'
  | 'stamina'
  | 'breaking'

export const ABILITY_LABELS: Record<GrowableKey | 'trajectory', string> = {
  trajectory: '弾道',
  meet: 'ミート',
  power: 'パワー',
  speed: '走力',
  arm: '肩力',
  fielding: '守備',
  catching: '捕球',
  velocity: '球速',
  control: 'コントロール',
  stamina: 'スタミナ',
  breaking: '変化球',
}

/**
 * 伸びやすさの判定に使うしきい値。
 * 表示（「得意」「苦手」）と計算で同じ値を見るために1か所に置く。
 */
export const APTITUDE_STRONG = 1.2
export const APTITUDE_WEAK = 0.8

/** 能力値の下限・上限 */
export const ABILITY_MIN = 1
export const ABILITY_MAX = 100

/**
 * 球速の下限・上限（km/h）。
 * 他の能力と違って1〜100ではないので、専用の範囲で丸める。
 */
export const VELOCITY_MIN = 100
export const VELOCITY_MAX = 158

/**
 * 球速を他の能力と同じ 0〜100 の尺度に直す。
 *
 * **判定にも表示にも同じ関数を使うこと。** 以前は
 * `simulateAtBat`（115〜160）・`rating`（120〜160）・レーダー（110〜160）で
 * それぞれ別の式を持っていて、同じ球速が画面と判定で違う意味になっていた。
 */
export function velocityScore(velocity: number): number {
  return Math.min(100, Math.max(0, ((velocity - VELOCITY_BASE) / VELOCITY_RANGE) * 100))
}

/**
 * 球速の尺度。115km/h で0、150km/h で100。
 *
 * 上を160に取っていた頃は、実際に出る球速（120〜148）が
 * 0〜73にしか広がらず、**球速の良し悪しが数字に出なかった**。
 * 高校生が実際に投げる帯に合わせて詰めてある。
 */
const VELOCITY_BASE = 115
const VELOCITY_RANGE = 35

/**
 * やる気。-2(絶不調) 〜 +2(絶好調)。
 * 練習効率と試合でのパフォーマンスに影響する。
 */
export type Motivation = -2 | -1 | 0 | 1 | 2

export const MOTIVATION_LABELS: Record<Motivation, string> = {
  [-2]: '絶不調',
  [-1]: '不調',
  0: '普通',
  1: '好調',
  2: '絶好調',
}

/** 性格。イベントの発生傾向や成長の癖に影響する（MVPでは表示のみ） */
export type Personality = 'ど根性' | 'クール' | 'ムードメーカー' | 'したたか' | '天才肌' | 'やんちゃ'

/**
 * ポジション適性。S が本職、G はほぼ守れない。
 * 適性の低い位置で起用すると守備能力に補正がかかる。
 */
export type Aptitude = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

/** 適性による守備能力の倍率 */
export const APTITUDE_MULTIPLIER: Record<Aptitude, number> = {
  S: 1.0,
  A: 0.95,
  B: 0.88,
  C: 0.8,
  D: 0.7,
  E: 0.58,
  F: 0.45,
  G: 0.3,
}

/** 選手 */
export type Player = {
  id: string
  /** 姓名（例: 佐藤 大輔） */
  name: string
  grade: Grade
  position: Position
  /** 投手かどうか。true なら pitching が必ず存在する */
  isPitcher: boolean
  batting: BattingAbilities
  /** 野手の場合は null */
  pitching: PitchingAbilities | null
  /** やる気 */
  motivation: Motivation
  /** 信頼度 0〜100。高いほど良いイベントが起きやすく、試合でも有利 */
  trust: number
  /** 体力 0〜100。低いと成長しにくく、怪我しやすい */
  condition: number
  /** 残り離脱月数。0なら健康（MVPでは常に0） */
  injuryMonths: number
  /**
   * 投手の疲労 0〜100。**体力（condition）とは別物。**
   * 投げたぶんだけ溜まり、日数で抜ける。連戦連投を咎めるための値で、
   * 野手には溜まらない（`core/player/fatigue.ts`）。
   */
  fatigue?: number
  personality: Personality
  /**
   * 能力ごとの伸びやすさ。1.0が標準で、書かれていない能力は1.0。
   *
   * **これが無いと、練習の結果が全員同じになる。**
   * やる気・学年・体力の補正はあったが、1回の伸びが1〜2という小さな値なので
   * 整数に丸めた時点で差が消え、誰を見ても「+1」しか出ていなかった。
   * 得意な能力は目に見えて伸び、苦手な能力はほとんど動かない。
   */
  growthAptitude: Partial<Record<GrowableKey, number>>
  /** 全ポジションの適性 */
  aptitudes: Record<Position, Aptitude>
  /** 習得している特殊能力のid */
  skills: string[]
  /**
   * 練習方針。選手ごとに自主練の内容を指定できる。
   * 省略時（既定）はチームの練習に合わせる。
   */
  focus?: import('@/core/player/trainingFocus').TrainingFocus
  /** コンバート練習の進み具合。CONVERT_STEPS で適性が1段階上がる */
  convertProgress?: number
  /** 入学時からの能力の推移（古い順） */
  history: AbilitySnapshot[]
  /**
   * 高校での通算成績。試合が終わるたびに積み上がる。
   * 率は保存せず、表示のたびに `careerStats.ts` で計算する。
   */
  stats: import('@/core/player/careerStats').CareerStats
  /** U18日本代表に選ばれた記録。ドラフトの評価に効く */
  u18: import('@/core/player/u18').U18Cap[]
}

/**
 * ある時点の能力の記録。
 * 入学時からの推移を折れ線で見せるために、月ごとに1件ずつ残す。
 */
export type AbilitySnapshot = {
  year: number
  month: number
  meet: number
  power: number
  speed: number
  arm: number
  fielding: number
  catching: number
  /** 投手のみ */
  velocity?: number
  control?: number
  stamina?: number
  breaking?: number
}

/** 記録を残す上限。3年間（36ヶ月）＋余裕 */
export const HISTORY_LIMIT = 44

/** 今の能力から記録を1件作る */
export function snapshotOf(player: Player, year: number, month: number): AbilitySnapshot {
  const b = player.batting
  const base: AbilitySnapshot = {
    year,
    month,
    meet: b.meet,
    power: b.power,
    speed: b.speed,
    arm: b.arm,
    fielding: b.fielding,
    catching: b.catching,
  }
  if (!player.pitching) return base

  return {
    ...base,
    velocity: player.pitching.velocity,
    control: player.pitching.control,
    stamina: player.pitching.stamina,
    breaking: player.pitching.breaking,
  }
}

/** 出場・練習ができる状態か（怪我で離脱していないか） */
export function isAvailable(player: Player): boolean {
  return player.injuryMonths <= 0
}

/** 能力がひとつ変動したことを表す。差分表示（ミート 32 → 35）に使う */
export type AbilityChange = {
  playerId: string
  key: GrowableKey | 'trajectory'
  before: number
  after: number
}
