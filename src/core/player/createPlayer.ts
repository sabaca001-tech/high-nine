/** 選手の生成 */

import type { Rng } from '@/core/rng/random'
import { createAptitudes } from '@/core/lineup/aptitude'
import { rollInitialPitches } from './pitchDefs'
import { pickExchangeName } from './exchangeNames'
import { snapshotOf } from '@/core/types/player'
import { armFromVelocity, ARM_SPREAD } from './growth'
import { pitchingRating } from './rating'
import { emptyCareerStats } from './careerStats'
import type {
  Grade,
  GrowableKey,
  Motivation,
  Personality,
  Player,
  Position,
  Trajectory,
} from '@/core/types/player'
import { VELOCITY_MAX, VELOCITY_MIN } from '@/core/types/player'

/**
 * 姓（実在選手を想起させない一般的な姓のみ使用）。
 *
 * 1学年に十数人入部するので、数が少ないと同姓だらけになって見分けがつかない。
 * 姓120 × 名120 で約14,400通り。
 */
const SURNAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '石川', '前田', '藤田', '後藤', '岡田', '長谷川',
  '石井', '村上', '近藤', '坂本', '遠藤', '青木', '藤井', '西村', '福田', '太田',
  '三浦', '藤原', '岡本', '松田', '中川', '中野', '原田', '小野', '田村', '竹内',
  '金子', '和田', '中山', '石田', '上田', '森田', '原', '柴田', '酒井', '工藤',
  '横山', '宮崎', '宮本', '内田', '高木', '谷口', '安藤', '大野', '丸山', '今井',
  '高田', '藤本', '河野', '武田', '上野', '杉山', '増田', '小島', '平野', '大塚',
  '千葉', '久保', '松井', '岩崎', '桜井', '野口', '松尾', '野村', '菊地', '木下',
  '菅原', '久保田', '古川', '大西', '服部', '市川', '渡部', '岩田', '中西', '杉本',
  '高山', '樋口', '松岡', '小池', '山内', '尾崎', '島田', '白石', '秋山', '星野',
  '永井', '川口', '松浦', '大久保', '松下', '山下', '内藤', '川崎', '岡崎', '本田',
]

/** 名 */
const GIVEN_NAMES = [
  '大輔', '翔太', '健太', '拓也', '涼介', '悠斗', '陽介', '直樹', '雄大', '和也',
  '達也', '亮太', '颯太', '駿', '蓮', '湊', '陸', '樹', '奏太', '一輝',
  '瑛太', '光希', '康平', '智也', '隼人', '将也', '大地', '航平', '結翔', '匠',
  '海斗', '陽向', '悠真', '大翔', '律', '新', '碧', '湊斗', '朝陽', '翔',
  '大和', '陽太', '悠人', '悠介', '慎太郎', '圭介', '大樹', '裕太', '翔平', '竜也',
  '翼', '諒', '啓太', '俊介', '雅人', '浩二', '誠', '剛', '聡', '健吾',
  '大貴', '拓海', '翔真', '蒼太', '葵', '琉生', '陽斗', '颯真', '快斗', '悠太',
  '春樹', '秀樹', '直人', '亮', '淳', '学', '徹', '修平', '良太', '圭吾',
  '昌也', '智久', '貴之', '英樹', '隆之', '克也', '幸大', '泰輔', '竜輝', '翔吾',
  '大河', '迅', '諒太', '龍之介', '壮真', '湧斗', '一颯', '篤志', '悠', '蒼',
  '響', '岳', '遥斗', '瑛士', '央輔', '昂平', '凌', '佑樹', '遼', '修司',
  '侑真', '誠也', '晴斗', '湊真', '唯斗', '諒介', '涼太', '真人', '将大', '晃平',
]

/**
 * 女子の名。**マネージャーに使う。**
 * 男子の名簿から引いていた頃は、マネージャーが「翔太」「大輔」になっていた。
 */
const FEMALE_GIVEN_NAMES = [
  '美咲', '陽菜', '結衣', '葵', '凛', '陽子', '彩花', '真央', '七海', '沙耶',
  '瑞希', '千夏', '莉子', '愛美', '咲良', '楓', '碧', '未來', '結菜', '柚希',
  '朝美', '菜月', '奈々', '心春', '琴音', '涼香', '桃花', '亜衣', '瞳', '春香',
  '智恵', '志保', '由紀', '香織', '典子', '早苗', '真希', '恵理', '亜美', '直美',
]

/** 生成を諦めて重複を許すまでの試行回数 */
const NAME_RETRY_LIMIT = 30

/**
 * 名前を1つ選ぶ。
 * 同じ部に同姓同名が並ぶと見分けがつかないので、
 * すでに使われている名前は避ける（避けきれなければそのまま返す）。
 */
export function pickName(rng: Rng, taken: readonly string[]): string {
  let name = ''
  for (let i = 0; i < NAME_RETRY_LIMIT; i++) {
    name = `${rng.pick(SURNAMES)} ${rng.pick(GIVEN_NAMES)}`
    if (!taken.includes(name)) return name
  }
  return name
}

/** 女子の名前を1つ選ぶ。マネージャー用 */
export function pickFemaleName(rng: Rng, taken: readonly string[]): string {
  let name = ''
  for (let i = 0; i < NAME_RETRY_LIMIT; i++) {
    name = `${rng.pick(SURNAMES)} ${rng.pick(FEMALE_GIVEN_NAMES)}`
    if (!taken.includes(name)) return name
  }
  return name
}

/**
 * 性格の出現率。
 *
 * **「天才肌」だけはレアにしてある。** 6分の1で出ていた頃は
 * どの学年にも数人いて、いちばん伸びる性格が当たり前に手に入っていた。
 * 引き当てたときに「当たりだ」と思える頻度まで下げ、
 * 代わりに入学時点の能力も高くしてある（`GENIUS_TALENT_BONUS`）。
 */
const PERSONALITY_WEIGHTS: { value: Personality; weight: number }[] = [
  { value: 'ど根性', weight: 20 },
  { value: 'クール', weight: 20 },
  { value: 'ムードメーカー', weight: 20 },
  { value: 'したたか', weight: 19 },
  { value: 'やんちゃ', weight: 19 },
  { value: '天才肌', weight: 2 },
]

/** 天才肌の入学時の上乗せ。素質そのものが違う */
export const GENIUS_TALENT_BONUS = 8

/**
 * 留学生の出現率。**天才肌と同じくらいの珍しさ**にしてある。
 *
 * 部員10人の代でおよそ5年に1人。他校も同じ率で作られるので、
 * 全国を見れば毎年どこかの学校に入ってくる。
 */
export const EXCHANGE_RATE = 0.02

/**
 * 留学生の体つき。**合計0で振り分ける。**
 *
 * 身体能力（パワー・走力・肩力）に振って、
 * そのぶん技術（ミート・守備・捕球）を引く。
 * 総合そのものは動かさないので、スカウトの「素質◯◯」とも食い違わない。
 * 上がるのは「何が得意な選手か」の分かりやすさだけ。
 */
const EXCHANGE_FIELDER_TILT = 7

/** 留学生の投手。球速とスタミナに寄せ、制球と変化球を引く */
const EXCHANGE_VELOCITY = 4
const EXCHANGE_STAMINA = 7
const EXCHANGE_PITCH_PENALTY = 5

/** 留学生の伸び代の上乗せ。得意な項目がさらに伸びる */
const EXCHANGE_GROWTH_BOOST = 1.45

/** 留学生が伸ばす能力。身体能力に限る */
const EXCHANGE_PITCHER_KEYS: GrowableKey[] = ['velocity', 'stamina']
const EXCHANGE_FIELDER_KEYS: GrowableKey[] = ['power', 'speed', 'arm']

/** 野手のポジション（投手を除く） */
const FIELDER_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

/**
 * 学年ごとの能力ベース値。
 * 1年生は低く、3年生は高い。ここに乱数の振れ幅を足す。
 *
 * **学年の差は、選手ごとの差（`ABILITY_SPREAD` ±14）より小さく取ってある。**
 * 学年差のほうが大きいと、誰が入ってきても「3年生＞2年生＞1年生」で並んでしまい、
 * 強い1年生も弱い3年生も生まれない。
 * いまは1年の上位（36+14＝50）が3年の平均に並び、
 * 3年の下位（50-14＝36）が1年の平均まで落ちる。
 *
 * 入学時点を高めに取っているのは、低いところから長く伸ばす形だと
 * 1年生が誰も使えず、3年間ずっと同じ顔ぶれで戦うことになっていたため。
 * そのぶん練習で伸びる量を抑えている（`CARD_GROWTH_SCALE`）。
 *
 * **ここを変えたら `OPPONENT_BASE_RATING` も直す。**
 * 相手チームも同じ値で作るので、平均（(36+44+50)/3 ＝ 43）が
 * 「互角」の基準になっている。
 */
export const GRADE_BASE: Record<Grade, number> = {
  1: 36,
  2: 44,
  3: 50,
}

/**
 * 選手ごとの素質の差（±）。**全能力をまとめて上下させる。**
 *
 * これが無いと「強い1年生」も「弱い3年生」も生まれない。
 * `ABILITY_SPREAD` は能力ごとに独立して振るので、
 * 6項目の平均である総合ではほぼ打ち消し合ってしまい（±3程度）、
 * **学年差だけが総合に残る**という状態になっていた。
 *
 * 学年差（1年→3年で14）より大きく取ることで、
 * 1年の上位が3年の平均に並び、3年の下位が1年の平均まで落ちる。
 *
 * **16では足りなくなった。** 能力ごとのばらつき（`ABILITY_SPREAD`）の
 * 合計を0に揃えたので、総合を動かすのはこの値だけになった。
 */
const TALENT_SPREAD = 18

/**
 * 球速（km/h）。素質（base）が速さになる。
 *
 * **`velocityScore` の刻みに合わせて置く。**
 * 実際に投げる帯では 5km/h ＝ 10点なので、素質1点 ＝ 0.5km/h。
 * 切片は「素質どおりの点数になる」ように取ってあり、
 * 素質60の投手は球速145km/h（＝60点、C）になる。
 *
 * **145km/h から上は効きを鈍らせる**（`VELOCITY_KNEE`）。
 * 素直に比例させていた頃は、素質の高い他校の3年生が軒並み160km/h超えで、
 * U18代表の投手が**全員160〜165km/h**という並びになっていた。
 * 実際の高校生で150km/h台後半は全国に数人いるかいないかで、
 * 160km/hはほとんど出ない。
 *
 *  平均的な1年（base36）で134km/h、平均的な3年（base50）で141km/h、
 *  素質に恵まれた3年（base66）で146km/h、
 *  全国屈指（base90）でも153km/h。そこから先は練習で伸ばす領域。
 */
function velocityFor(rng: Rng, base: number, grade: Grade): number {
  return Math.min(
    VELOCITY_MAX,
    Math.max(
      VELOCITY_MIN,
      Math.round(velocityFromBase(clampAbility(base)) + grade * 1.2 + rng.int(-3, 3)),
    ),
  )
}

/** 素質から球速（km/h）。上に行くほど鈍る */
function velocityFromBase(base: number): number {
  const straight = VELOCITY_INTERCEPT + Math.min(base, VELOCITY_KNEE) * 0.5
  return straight + Math.max(0, base - VELOCITY_KNEE) * VELOCITY_KNEE_RATE
}

/** 素質0のときの球速。`velocityScore` の対応表から逆算した値 */
const VELOCITY_INTERCEPT = 115

/** ここまでは素質どおりに速くなる（素質60＝145km/h） */
const VELOCITY_KNEE = 60
/** そこから先の効き。素質90でも153km/hに収まる */
const VELOCITY_KNEE_RATE = 0.26

/**
 * 能力ごとのばらつき幅（±）。
 * こちらは「打撃は良いが守備は苦手」といった凸凹を作るためのもの。
 * 素質の差（`TALENT_SPREAD`）と役割が違う。
 *
 * **10では凸凹が足りなかった。** 6項目の平均が素質どおりになるよう
 * 合計を0に揃えているので、幅を広げても総合は動かない。
 * 動くのは「何が得意な選手か」の分かりやすさだけ。
 */
const ABILITY_SPREAD = 18

/**
 * 合計が0になるばらつきを `count` 個作る。
 *
 * 素直に `rng.int(-spread, spread)` を並べると、
 * たまたま全部プラス／全部マイナスに寄って**総合そのものがずれる**。
 * 平均を引いて中心に戻すことで、凸凹だけを大きくできる。
 */
function centeredSpread(rng: Rng, count: number, spread: number): number[] {
  const raw = Array.from({ length: count }, () => rng.int(-spread, spread))
  const mean = raw.reduce((sum, value) => sum + value, 0) / count
  return raw.map((value) => Math.round(value - mean))
}

/**
 * 本職の投手になる割合。
 *
 * 0.25にしていたところ、部員10人につき2〜3人が投手になり、
 * **打線を組むと投手が余る**状態だった。
 * 実際の部でも投手は1割台なので、10人に2人程度に下げている。
 * 投手不足の事故は `createInitialRoster` と `recruitFreshmen` の
 * 「最低人数の保証」で防ぐ。
 */
const PITCHER_RATE = 0.18

/**
 * 投手の野手能力の下限。投手としての総合に対する割合。
 * 0.55 なら、投手総合60の投手の打撃・守備は33〜60に散らばる。
 * 下げすぎると打席が完全な穴になるので、幅は残してある。
 */
const PITCHER_FIELDING_FLOOR = 0.55

export type CreatePlayerOptions = {
  id: string
  grade: Grade
  /** 入学時の記録に残す年月。省略時は記録を作らない */
  enrolledAt?: { year: number; month: number }
  /** 投手として作るか。省略時は乱数で決まる */
  isPitcher?: boolean
  /**
   * 才能補正。0が平均。+15なら全能力が15高い。
   * 推薦入学の逸材などを作るときに使う。
   */
  talentBonus?: number
  /**
   * 選手ごとの素質の振れ幅（±）。省略時は `TALENT_SPREAD`。
   * **0を渡すと `talentBonus` どおりの能力になる。**
   * スカウトのように「素質◯◯」と示してから入学させる場合に使う。
   */
  talentSpread?: number
  /** すでに部内で使われている名前。同姓同名を避けるために渡す */
  takenNames?: readonly string[]
  /**
   * 留学生として作るか。省略時は乱数で決まる（`EXCHANGE_RATE`）。
   * **名前を後から差し替える経路では `false` を渡す。**
   * スカウトや注目選手のように名前が先に決まっている選手が
   * 留学生の体つきだけ持つ、という食い違いを防ぐため。
   */
  exchange?: boolean
}

/** 選手を1人生成する */
export function createPlayer(rng: Rng, options: CreatePlayerOptions): Player {
  const { id, grade, talentBonus = 0 } = options
  const isPitcher = options.isPitcher ?? rng.chance(PITCHER_RATE)

  // **留学生。** 身体能力に寄った体つきで入ってくる
  const exchange = options.exchange ?? rng.chance(EXCHANGE_RATE)

  // 性格は能力より先に決める。天才肌は素質そのものが違うので、
  // 決まった性格が入学時の能力にも効く
  const personality = rng.weighted(PERSONALITY_WEIGHTS)
  const genius = personality === '天才肌'

  // 選手ごとの素質。全能力をまとめて上下させるので、総合にそのまま出る。
  // 素質を指定して作る場合（スカウトした選手）は振らない
  const spread = options.talentSpread ?? TALENT_SPREAD
  const talent = spread > 0 ? rng.int(-spread, spread) : 0

  const base = GRADE_BASE[grade] + talentBonus + talent + (genius ? GENIUS_TALENT_BONUS : 0)

  /*
   * 能力ごとのばらつき。
   *
   * **合計を0に揃えてある。** 素質どおりの総合になるので、
   * スカウトの「素質◯◯」と入学後の総合が食い違わない。
   * 揃えずに振っていた頃は、素質45と書いてあった選手が総合40で入ることがあった。
   *
   * 野手6項目・投手3項目をそれぞれ別に揃える。
   */
  const battingSpread = centeredSpread(rng, BATTING_KEYS.length, ABILITY_SPREAD)
  const pitchingSpread = isPitcher ? centeredSpread(rng, 3, ABILITY_SPREAD) : []

  const taken = options.takenNames ?? []
  const name = exchange ? pickExchangeName(rng, taken) : pickName(rng, taken)
  const position: Position = isPitcher ? 'P' : rng.pick(FIELDER_POSITIONS)
  // 留学生の投手は球速とスタミナに寄る。そのぶん制球と変化球を引く
  const pitchPenalty = exchange ? EXCHANGE_PITCH_PENALTY : 0
  const breaking = clampAbility(base + (pitchingSpread[2] ?? 0) - pitchPenalty)

  // **投手能力を先に決める。** 野手能力の上限に使うため
  const pitching = isPitcher
    ? {
        velocity: Math.min(
          VELOCITY_MAX,
          velocityFor(rng, base, grade) + (exchange ? EXCHANGE_VELOCITY : 0),
        ),
        control: clampAbility(base + pitchingSpread[0] - pitchPenalty),
        stamina: clampAbility(base + pitchingSpread[1] + (exchange ? EXCHANGE_STAMINA : 0)),
        breaking,
        pitches: rollInitialPitches(rng, breaking),
      }
    : null

  /**
   * 投手の野手能力。**自分の投手としての総合を超えない範囲で振る。**
   *
   * 以前は野手と同じ `ability()` で振っていたので、素質の高い投手は
   * 打撃・守備・走塁まで軒並み高く出ていた。
   * 自動編成が「打てるから」と別のポジションへ回したり、
   * 打線の中軸に据えたりして、**投手を投手として扱えなくなっていた**。
   */
  // 留学生の体つき。パワー・走力・肩力に振り、技術から引く（合計0）
  const tilt = exchange && !pitching ? [-1, 1, 1, 1, -1, -1] : [0, 0, 0, 0, 0, 0]

  let battingIndex = 0
  const fielderAbility = (): number => {
    if (!pitching) {
      const index = battingIndex++
      return clampAbility(base + battingSpread[index] + tilt[index] * EXCHANGE_FIELDER_TILT)
    }
    const cap = pitchingRating(pitching)
    return clampAbility(rng.int(Math.max(1, Math.round(cap * PITCHER_FIELDING_FLOOR)), cap))
  }

  const player: Player = {
    id,
    name,
    grade,
    position,
    isPitcher,
    batting: {
      trajectory: rollTrajectory(rng),
      meet: fielderAbility(),
      power: fielderAbility(),
      speed: fielderAbility(),
      // 投手の肩力は球速から導く（下で上書きする）
      arm: fielderAbility(),
      fielding: fielderAbility(),
      catching: fielderAbility(),
    },
    pitching,
    motivation: rollMotivation(rng),
    trust: 20 + rng.int(0, 20),
    condition: 70 + rng.int(0, 30),
    injuryMonths: 0,
    personality,
    growthAptitude: createGrowthAptitude(rng, isPitcher, exchange),
    aptitudes: createAptitudes(rng, position),
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
    ...(exchange ? { origin: 'exchange' as const } : {}),
  }

  // 投手の肩力は球速に連動させる。速い球を投げる腕が送球だけ弱いのは不自然。
  // ただし一致はさせない（`ARM_SPREAD` ぶんの個体差を乗せる）
  if (player.pitching) {
    const arm = armFromVelocity(player.pitching.velocity) + rng.int(-ARM_SPREAD, ARM_SPREAD)
    player.batting = { ...player.batting, arm: clampAbility(arm) }
  }

  // 入学時点を推移の起点として残す
  const at = options.enrolledAt
  return at ? { ...player, history: [snapshotOf(player, at.year, at.month)] } : player
}

/**
 * 能力ごとの伸びやすさを決める。
 *
 * 得意を2つ、苦手を2つ選ぶ。**平均が1.0前後になるように配分する**
 * （得意 1.25〜1.6／苦手 0.6〜0.8）ので、チーム全体の成長速度は変わらない。
 * 変わるのは「誰のどの能力が伸びるか」だけ。
 *
 * これが無いと、1回の練習で全員が同じだけ伸びる。
 * やる気や学年の補正はあっても、1〜2という小さな値を整数に丸めた時点で
 * 差が消えてしまい、画面には「+1」しか出てこなかった。
 */
export function createGrowthAptitude(
  rng: Rng,
  isPitcher: boolean,
  /** 留学生。身体能力の伸び代が上乗せされる */
  exchange = false,
): Partial<Record<GrowableKey, number>> {
  // 持っていない能力に伸び代を付けても意味が無い。
  // **球速も対象に入れる。** 入れていなかった頃は、
  // 誰が投げても球速の伸び方が同じで、「伸び代のある投手」が生まれなかった
  const pool: GrowableKey[] = isPitcher
    ? [...BATTING_KEYS, 'velocity', 'control', 'stamina', 'breaking']
    : [...BATTING_KEYS]

  /*
   * **選手そのものの伸びやすさ。** 全能力にまとめて掛かる。
   *
   * 能力ごとの乱数だけだと、6〜10項目の平均は1.0に寄ってしまい
   * 「この選手はよく伸びる」が作れない（`TALENT_SPREAD` と同じ話）。
   * 素質が入学時の能力を決めるのに対して、こちらは3年間の伸びを決める。
   */
  const talent = 0.75 + rng.float() * 0.5

  const aptitude: Partial<Record<GrowableKey, number>> = {}
  for (const key of pool) {
    aptitude[key] = round2(clampAptitude(talent * (KEY_MIN + rng.float() * KEY_RANGE)))
  }

  /*
   * **1つだけ飛び抜けた能力を持つ選手。**
   * 全部がなだらかに伸びると、3年経っても「何が武器か」が言えない。
   */
  if (rng.chance(SPECIALIST_CHANCE)) {
    const key = rng.pick(pool)
    aptitude[key] = round2(clampAptitude((aptitude[key] ?? 1) * SPECIALIST_BOOST))
  }

  /*
   * **稀に、球速だけ飛び抜けて伸びる投手が出る。**
   * 150km/h はドラフトの分かれ目なので、そこへ届くかどうかが
   * 入学時の球速だけで決まってしまうと、育てる余地が無い。
   * 20人に1人、3年で10km/h以上伸びる素材を混ぜる。
   */
  if (isPitcher && rng.chance(LATE_BLOOMER_CHANCE)) {
    aptitude.velocity = round2(1.9 + rng.float() * 0.5)
  }

  /*
   * **留学生は身体能力が伸びる。**
   * 投手なら球速とスタミナ、野手ならパワー・走力・肩力。
   * 元の乱数に掛けるので、当たり外れは残る（全員が同じ伸び方にはならない）。
   */
  if (exchange) {
    for (const key of isPitcher ? EXCHANGE_PITCHER_KEYS : EXCHANGE_FIELDER_KEYS) {
      aptitude[key] = round2(clampAptitude((aptitude[key] ?? 1) * EXCHANGE_GROWTH_BOOST))
    }
  }

  return aptitude
}

/**
 * 能力ごとの伸び代の幅。平均が1.0になるように取る。
 *
 * **得意2つ・苦手2つ・残りは等倍、という配り方をやめた。**
 * 半分の能力が「ちょうど1.0」で並ぶので、3年育てると
 * どの選手も同じような形に落ち着いていた。
 * いまは全項目に別々の伸び代が付く。
 */
const KEY_MIN = 0.55
const KEY_RANGE = 0.9

/** 伸び代の下限・上限。ここを外すと「まったく動かない」能力ができる */
const APTITUDE_FLOOR = 0.4
const APTITUDE_CEILING = 2.4

function clampAptitude(value: number): number {
  return Math.min(APTITUDE_CEILING, Math.max(APTITUDE_FLOOR, value))
}

/** 1つの能力だけ飛び抜けて伸びる選手の出現率と、その倍率 */
const SPECIALIST_CHANCE = 0.3
const SPECIALIST_BOOST = 1.5

/** 球速の伸び代が飛び抜けている投手の出現率 */
const LATE_BLOOMER_CHANCE = 0.05

/** 野手も投手も持っている能力 */
const BATTING_KEYS: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 初期部員を生成する。
 * 各学年8人ずつ（計24人）。投手が最低1人は含まれるようにする。
 * ベンチ入り争いが起きる規模にして、控え選手の育成にも意味が出るようにしている。
 *
 * **弱小校の水準で作る**（`INITIAL_TALENT`）。
 * 素質どおり（0）だと県内のちょうど真ん中に並んでしまい、
 * 「弱いチームを強くする」という出発点にならなかった。
 * 評判20の新入生（`talentFromReputation`）と同じ水準に揃えてある。
 */
export const INITIAL_TALENT = -10

export function createInitialRoster(
  rng: Rng,
  perGrade = 8,
  /** 生成する学年。既定は3学年すべて */
  grades: Grade[] = [3, 2, 1],
): Player[] {
  const players: Player[] = []
  let counter = 0

  for (const grade of grades) {
    for (let i = 0; i < perGrade; i++) {
      counter++
      players.push(
        createPlayer(rng, {
          id: `p${counter}`,
          grade,
          // 各学年の先頭1人だけ投手を確約する。
          // 2人にしていた頃は投手が多くなりすぎた
          isPitcher: i < 1 ? true : undefined,
          // **弱小校から始める。** 素質どおり（0）で作っていた頃は、
          // 初期部員が県内のちょうど真ん中の水準（平均総合43）で、
          // 「弱いチームを強くする」という出発点になっていなかった
          talentBonus: INITIAL_TALENT,
          // 在校生は入学年が異なるので、記録の起点は加入月に揃える
          enrolledAt: { year: 1, month: 4 },
          takenNames: players.map((player) => player.name),
        }),
      )
    }
  }

  return players
}

/** 弾道。1〜2が大半で、4は稀 */
function rollTrajectory(rng: Rng): Trajectory {
  return rng.weighted<Trajectory>([
    { value: 1, weight: 45 },
    { value: 2, weight: 35 },
    { value: 3, weight: 15 },
    { value: 4, weight: 5 },
  ])
}

/** やる気。普通を中心に分布させる */
function rollMotivation(rng: Rng): Motivation {
  return rng.weighted<Motivation>([
    { value: -2, weight: 5 },
    { value: -1, weight: 20 },
    { value: 0, weight: 50 },
    { value: 1, weight: 20 },
    { value: 2, weight: 5 },
  ])
}

function clampAbility(value: number): number {
  return Math.min(100, Math.max(1, value))
}
