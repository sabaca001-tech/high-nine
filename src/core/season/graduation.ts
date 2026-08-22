/**
 * 世代交代。
 * 3月から4月へ移るときに、3年生が卒業し、残りが進級し、新入生が加入する。
 */

import type { Rng } from '@/core/rng/random'
import { advanceCareer, createAlumnus } from '@/core/career/career'
import { createPlayer } from '@/core/player/createPlayer'
import { overallRating } from '@/core/player/rating'
import { draftBonus } from '@/core/player/u18'
import type { Grade, Player } from '@/core/types/player'
import { snapshotOf } from '@/core/types/player'
import type { GraduateRecord } from '@/core/types/season'
import { REPUTATION_INITIAL } from '@/core/types/season'
import { GRADUATION_MONTH } from '@/core/types/career'

/** 部員数の目安。評判が高いほど多くの入部希望者が来る */
const BASE_ROSTER_SIZE = 24

/** 部として最低限そろえる投手の数。これを切ったときは必ず投手を入れる */
const MIN_PITCHERS = 2

/**
 * **その年に入部する投手の人数。スカウトで獲れた投手も数に入れる。**
 *
 * 下限ではなく**固定**。抽選に任せていた頃は、
 * 投手が引退した年に「新入生が全員野手」を引くと立て直せない一方で、
 * 逆に投手ばかり5人入ってきて野手が薄くなる年もあった。
 * どちらも編成の事故で、プレイヤーの判断とは関係がない。
 *
 * 3年生が夏で引退することを考えると、毎年2人は入れておかないと
 * 秋の新チームで継投が組めない。逆に3人以上は要らない。
 */
const PITCHER_RECRUITS = 2

/** 1年で入る新入生の下限・上限。強豪校ならベンチ入り争いが起きる規模になる */
const MIN_RECRUITS = 4
const MAX_RECRUITS = 16

/**
 * 評判から新入生の実力補正を求める。
 *
 * **初期評判(20)のときが弱小校の水準**（`RECRUIT_BASE_TALENT`）。
 * ここを0にしていた頃は、無名の弱小校にも県内平均並みの新入生が来ていて、
 * 「弱いチームを強くする」という出発点にならなかった。
 *
 * 評判が下がっても**初期より悪くはならない**ようにしてある。
 * 下限を切らないと、負けが込んだ年から新入生まで悪くなって立て直せない。
 */
export function talentFromReputation(reputation: number): number {
  const gain = Math.max(0, reputation - REPUTATION_INITIAL) * REPUTATION_TALENT_RATE
  return Math.round(Math.min(RECRUIT_MAX_TALENT, RECRUIT_BASE_TALENT + gain))
}

/**
 * 評判20（弱小校）のときの新入生の実力補正。
 * 初期部員（`INITIAL_TALENT`）と揃えてある。
 * ずれていると、1年目の在校生と2年目の新入生で水準が段違いになる。
 */
const RECRUIT_BASE_TALENT = -10

/**
 * 一般入部の振れ幅（±）。自校の既定（18）より狭い。
 *
 * **11では上振れがスカウトと並んでいた。** 評判の高い学校だと
 * 「補正+10・振れ+4・素質+11」で入学時の総合が61まで出て、
 * U15代表（中心52）に通って獲る意味が薄れていた。
 */
const GENERAL_RECRUIT_SPREAD = 8

/**
 * 新入生の実力補正の上限。
 *
 * **頭打ちが要る。** 評判に比例させ続けると、評判が上限近くで
 * 新入生が前の代の3年生と同じ能力で入学し、3年かけて育てる意味が薄れる
 * （実際に起きた）。
 *
 * **10から下げてある。** 一般入部の上振れがU15代表と並んでいて、
 * 「わざわざ県外まで通って獲る」意味が薄かった。
 * 上振れは**スカウトと推薦枠に任せる**。
 */
const RECRUIT_MAX_TALENT = 7

/**
 * 評判1あたりの実力補正。
 *
 * 弱小校の水準（-10）から積み上げ、`RECRUIT_MAX_TALENT` で頭を打つ形。
 * 評判51で +-0、評判58で上限の +7。
 *
 * **0.45では上がるのが早すぎた。** 評判は勝てば数年で60〜80まで行くので、
 * そのぶん新入生が良くなり、チームが数年で県内最強になっていた。
 * 練習の伸び（`CARD_GROWTH_SCALE`）より、こちらのほうがよく効く。
 *
 * 0.18で基準を0にしていた頃は、評判20の弱小校にも県内平均並みの
 * 新入生が来ていて、**弱いチームを強くする出発点にならなかった**。
 */
const REPUTATION_TALENT_RATE = 0.45

/** 評判が高いほど多くの新入生が来る */
export function recruitCount(reputation: number, remaining: number): number {
  const target = BASE_ROSTER_SIZE + Math.floor(reputation / 12)
  return Math.max(MIN_RECRUITS, Math.min(MAX_RECRUITS, target - remaining))
}

/** 新入生を迎える。新規開始時と毎年4月の両方で使う */
export function recruitFreshmen(
  rng: Rng,
  params: {
    /** 在校生（進級後） */
    players: Player[]
    reputation: number
    year: number
    serial: number
    /** スカウトで獲れた投手の人数。今年の入部ぶんとして数える */
    scoutedPitchers?: number
  },
): {
  newcomers: Player[]
  recommendedIds: string[]
  serial: number
} {
  const { players, reputation } = params
  const scoutedPitchers = params.scoutedPitchers ?? 0

  const count = recruitCount(reputation, players.length)
  const baseTalent = talentFromReputation(reputation)

  // 評判が高いと推薦の逸材が来ることがある
  const hasRecommended = reputation >= 55 && rng.chance(reputation / 220)
  const recommendedIndex = hasRecommended ? rng.int(0, count - 1) : -1

  const newcomers: Player[] = []
  const recommendedIds: string[] = []
  let serial = params.serial

  const pitchersLeft = players.filter((player) => player.isPitcher).length

  for (let i = 0; i < count; i++) {
    const isRecommended = i === recommendedIndex
    const id = `p${serial++}`

    const player = createPlayer(rng, {
      id,
      grade: 1,
      enrolledAt: { year: params.year, month: 4 },
      // **投手の人数は抽選に任せず、こちらで決める。**
      // 足りなければ投手として作り、足りていれば**野手として作る**。
      // undefined（抽選）にしていた頃は、確約したぶんの上に
      // 抽選ぶんが積み上がって投手だらけの代ができていた
      isPitcher: needsPitcher(
        pitchersLeft,
        newcomers.filter((p) => p.isPitcher).length,
        scoutedPitchers,
      ),
      talentBonus: baseTalent + rng.int(-3, 3) + (isRecommended ? 14 : 0),
      /*
       * **一般入部は強豪でもDまで。**
       * 既定の振れ幅（±18）だと、評判が上がったチームには総合68（C）の
       * 新入生が普通に入ってきて、スカウトで通う意味が薄れていた。
       * 上振れはスカウト（U15代表）と推薦枠に任せる。
       */
      ...(isRecommended ? {} : { talentSpread: GENERAL_RECRUIT_SPREAD }),
      // 在校生と新入生の両方と同姓同名にならないようにする
      takenNames: [...players, ...newcomers].map((player) => player.name),
    })

    // **留学生の表記は上書きしない。** 推薦枠で来た留学生は「留学生」と出す
    newcomers.push(
      isRecommended && !player.origin ? { ...player, origin: 'recommended' } : player,
    )
    if (isRecommended) recommendedIds.push(id)
  }

  return { newcomers, recommendedIds, serial }
}

/**
 * その1人を投手にするか。**true / false のどちらかを必ず返す**（抽選しない）。
 *
 * 次のどちらかを満たしていなければ投手にする。
 *  - 部全体で `MIN_PITCHERS` 人
 *  - その年の入部で `PITCHER_RECRUITS` 人（スカウトぶんを含む）
 */
function needsPitcher(
  onRoster: number,
  recruitedSoFar: number,
  scoutedPitchers: number,
): boolean {
  const incoming = recruitedSoFar + scoutedPitchers
  return onRoster + incoming < MIN_PITCHERS || incoming < PITCHER_RECRUITS
}

export type SeasonChange = {
  /** 進級後＋新入生を加えた新しい部員 */
  players: Player[]
  graduates: GraduateRecord[]
  newcomers: Player[]
  recommendedIds: string[]
  /** 進路が進んだ既存のOB */
  updatedAlumni: GraduateRecord[]
  /** その年に起きた卒業生のニュース */
  careerNews: string[]
  /** 次に使う採番 */
  serial: number
}

/**
 * 学年を進め、卒業生を送り出し、新入生を迎える。
 *
 * @param year 新しい年（この年の4月が始まる）
 * @param serial id の採番に使う通し番号
 */
export function advanceSeason(
  rng: Rng,
  params: {
    players: Player[]
    reputation: number
    year: number
    serial: number
    /** OB名鑑。卒業後の進路を1年ぶん進めるために渡す */
    alumni?: GraduateRecord[]
    /** スカウトで獲れた投手の人数。今年の入部ぶんとして数える */
    scoutedPitchers?: number
  },
): SeasonChange {
  const { players, reputation, year, alumni = [] } = params

  // 卒業生は進路（プロ・大学・社会人）まで決めて記録する。
  // **通常は空になる。** 3年生は夏の大会が終わった時点で引退し、
  // そこでOB名鑑に載るため（gameEngine の retireThirdYears）。
  // ここに残るのは、引退の処理を通らなかった場合の保険
  const graduates: GraduateRecord[] = players
    .filter((player) => player.grade === 3)
    .map((player) =>
      createAlumnus(
        rng,
        {
          id: player.id,
          name: player.name,
          isPitcher: player.isPitcher,
          position: player.position,
          year,
          rating: overallRating(player),
          skills: [...player.skills],
          highSchool: player.stats,
          u18Bonus: draftBonus(player.u18),
          // 卒業時の各能力。総合だけでは何が武器だったのか分からない
          finalAbilities: snapshotOf(player, year, GRADUATION_MONTH),
        },
        reputation,
      ),
    )

  // 卒業しなかった選手を進級させる
  const promoted = players
    .filter((player) => player.grade < 3)
    .map((player) => ({ ...player, grade: (player.grade + 1) as Grade }))

  const recruited = recruitFreshmen(rng, {
    players: promoted,
    reputation,
    year,
    serial: params.serial,
    scoutedPitchers: params.scoutedPitchers ?? 0,
  })
  const { newcomers, recommendedIds } = recruited
  const serial = recruited.serial

  // 既にいる卒業生のその後を1年ぶん進める
  const updatedAlumni: GraduateRecord[] = []
  const careerNews: string[] = []
  for (const record of alumni) {
    const update = advanceCareer(rng, record, year)
    updatedAlumni.push(update.alumnus)
    if (update.news) careerNews.push(update.news)
  }

  return {
    players: [...promoted, ...newcomers],
    graduates,
    newcomers,
    recommendedIds,
    updatedAlumni,
    careerNews,
    serial,
  }
}
