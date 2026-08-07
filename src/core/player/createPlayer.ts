/** 選手の生成 */

import type { Rng } from '@/core/rng/random'
import { createAptitudes } from '@/core/lineup/aptitude'
import { rollInitialPitches } from './pitchDefs'
import { snapshotOf } from '@/core/types/player'
import { armFromVelocity } from './growth'
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
 */
const TALENT_SPREAD = 16

/**
 * 球速（km/h）。素質（base）が速さになる。
 *
 * **実際の高校生の帯に収める。** `velocityScore` の逆算で置いていた頃は
 * 素質の高い3年生が154km/hに達し、プロでも稀な球速になっていた。
 *  平均的な1年（base36）で129km/h、平均的な3年（base50）で139km/h、
 *  素質に恵まれた3年（base66）で147km/h。
 */
function velocityFor(rng: Rng, base: number, grade: Grade): number {
  return Math.round(110 + clampAbility(base) * 0.5 + grade * 1.2 + rng.int(-3, 3))
}

/**
 * 能力ごとのばらつき幅（±）。
 * こちらは「打撃は良いが守備は苦手」といった凸凹を作るためのもの。
 * 素質の差（`TALENT_SPREAD`）と役割が違う。
 */
const ABILITY_SPREAD = 10

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
}

/** 選手を1人生成する */
export function createPlayer(rng: Rng, options: CreatePlayerOptions): Player {
  const { id, grade, talentBonus = 0 } = options
  const isPitcher = options.isPitcher ?? rng.chance(PITCHER_RATE)

  // 性格は能力より先に決める。天才肌は素質そのものが違うので、
  // 決まった性格が入学時の能力にも効く
  const personality = rng.weighted(PERSONALITY_WEIGHTS)
  const genius = personality === '天才肌'

  // 選手ごとの素質。全能力をまとめて上下させるので、総合にそのまま出る。
  // 素質を指定して作る場合（スカウトした選手）は振らない
  const spread = options.talentSpread ?? TALENT_SPREAD
  const talent = spread > 0 ? rng.int(-spread, spread) : 0

  const base = GRADE_BASE[grade] + talentBonus + talent + (genius ? GENIUS_TALENT_BONUS : 0)

  /** base を中心にばらつかせた能力値を1つ作る */
  const ability = (): number =>
    clampAbility(base + rng.int(-ABILITY_SPREAD, ABILITY_SPREAD))

  const name = pickName(rng, options.takenNames ?? [])
  const position: Position = isPitcher ? 'P' : rng.pick(FIELDER_POSITIONS)
  const breaking = ability()

  const player: Player = {
    id,
    name,
    grade,
    position,
    isPitcher,
    batting: {
      trajectory: rollTrajectory(rng),
      // 投手の打撃はやや低めにする
      meet: isPitcher ? clampAbility(ability() - 12) : ability(),
      power: isPitcher ? clampAbility(ability() - 12) : ability(),
      speed: ability(),
      // 投手の肩力は球速から導く（下で上書きする）
      arm: ability(),
      fielding: ability(),
      catching: ability(),
    },
    pitching: isPitcher
      ? {
          velocity: velocityFor(rng, base, grade),
          control: ability(),
          stamina: ability(),
          breaking,
          pitches: rollInitialPitches(rng, breaking),
        }
      : null,
    motivation: rollMotivation(rng),
    trust: 20 + rng.int(0, 20),
    condition: 70 + rng.int(0, 30),
    injuryMonths: 0,
    personality,
    growthAptitude: createGrowthAptitude(rng, isPitcher),
    aptitudes: createAptitudes(rng, position),
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
  }

  // 投手の肩力は球速に比例させる。速い球を投げる腕が送球だけ弱いのは不自然
  if (player.pitching) {
    player.batting = { ...player.batting, arm: armFromVelocity(player.pitching.velocity) }
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
): Partial<Record<GrowableKey, number>> {
  // 持っていない能力に得意・苦手を付けても意味が無い
  const pool: GrowableKey[] = isPitcher
    ? [...BATTING_KEYS, 'control', 'stamina', 'breaking']
    : [...BATTING_KEYS]

  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const aptitude: Partial<Record<GrowableKey, number>> = {}
  for (const key of shuffled.slice(0, STRONG_COUNT)) {
    aptitude[key] = round2(1.25 + rng.float() * 0.35)
  }
  for (const key of shuffled.slice(STRONG_COUNT, STRONG_COUNT + WEAK_COUNT)) {
    // 0.5まで下げると苦手な能力が事実上凍りつき、総合が伸び残る。
    // 「遅い」であって「動かない」ではない水準にする
    aptitude[key] = round2(0.6 + rng.float() * 0.2)
  }
  return aptitude
}

/** 得意・苦手にする能力の数 */
const STRONG_COUNT = 2
const WEAK_COUNT = 2

/** 野手も投手も持っている能力 */
const BATTING_KEYS: GrowableKey[] = ['meet', 'power', 'speed', 'arm', 'fielding', 'catching']

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 初期部員を生成する。
 * 各学年8人ずつ（計24人）。投手が最低1人は含まれるようにする。
 * ベンチ入り争いが起きる規模にして、控え選手の育成にも意味が出るようにしている。
 */
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
