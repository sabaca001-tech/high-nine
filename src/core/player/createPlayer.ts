/** 選手の生成 */

import type { Rng } from '@/core/rng/random'
import { createAptitudes } from '@/core/lineup/aptitude'
import { rollInitialPitches } from './pitchDefs'
import { snapshotOf } from '@/core/types/player'
import { emptyCareerStats } from './careerStats'
import type {
  Grade,
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

const PERSONALITIES: Personality[] = [
  'ど根性', 'クール', 'ムードメーカー', 'したたか', '天才肌', 'やんちゃ',
]

/** 野手のポジション（投手を除く） */
const FIELDER_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

/**
 * 学年ごとの能力ベース値。
 * 1年生は低く、3年生は高い。ここに乱数の振れ幅を足す。
 */
const GRADE_BASE: Record<Grade, number> = {
  1: 22,
  2: 38,
  3: 52,
}

/** 能力のばらつき幅（±） */
const ABILITY_SPREAD = 14

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
  /** すでに部内で使われている名前。同姓同名を避けるために渡す */
  takenNames?: readonly string[]
}

/** 選手を1人生成する */
export function createPlayer(rng: Rng, options: CreatePlayerOptions): Player {
  const { id, grade, talentBonus = 0 } = options
  const isPitcher = options.isPitcher ?? rng.chance(PITCHER_RATE)
  const base = GRADE_BASE[grade] + talentBonus

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
      arm: ability(),
      fielding: ability(),
      catching: ability(),
    },
    pitching: isPitcher
      ? {
          velocity: 118 + rng.int(0, 14) + Math.round(talentBonus * 0.3) + grade * 2,
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
    personality: rng.pick(PERSONALITIES),
    aptitudes: createAptitudes(rng, position),
    skills: [],
    history: [],
    stats: emptyCareerStats(),
    u18: [],
  }

  // 入学時点を推移の起点として残す
  const at = options.enrolledAt
  return at ? { ...player, history: [snapshotOf(player, at.year, at.month)] } : player
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
