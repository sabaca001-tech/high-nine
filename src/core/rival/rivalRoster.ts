/**
 * 他校の部員。
 *
 * **試合ごとの使い捨てをやめた。** 以前は相手の9人を戦力値から
 * その場で作って捨てていたので、同じ学校と2回戦っても別人が出てきたし、
 * スカウトで逃した選手がその学校に居ることもなかった。
 * 「あの学校のあの選手」という手応えが生まれない。
 *
 * かといって全校ぶんの選手を保存すると、30校×15人で
 * セーブが一気に膨らむ（CLAUDE.md「他校を足すとき」）。
 *
 * **保存する代わりに、決まった種から毎回同じ部員を作る。**
 * 学校が持つのは `rosterSeed` という数値ひとつだけ。
 * 入学年ごとに種を分けるので、
 * 今年の1年生は来年も同じ名前の2年生として出てくる。
 */

import { createRng } from '@/core/rng/random'
import { createPlayer } from '@/core/player/createPlayer'
import { overallRating } from '@/core/player/rating'
import type { Grade, Player } from '@/core/types/player'
import type { RivalPlayer, RivalSchool } from './rivals'

/** 1学年あたりの人数。3学年で15人 */
const PER_GRADE = 5

/** 各学年の何人目までを投手にするか */
const PITCHERS_PER_GRADE = 2

/**
 * 学校の部員を作る。**同じ学校・同じ年なら必ず同じ結果になる。**
 *
 * 入学年ごとに種を分けているので、学年が上がっても同じ選手が同じ名前で残る。
 * 能力はその学校の今の戦力（`strength`）を基準にするので、
 * 学校が力をつければ在校生も少し強く見える。
 * 個人の成長を積み上げて持ち回るより、はるかに安く「学校の格」を表せる。
 *
 * 注目選手（`stars`）は**この名簿を置き換える形で混ぜる**。
 * スカウトで逃した選手が、その学校にちゃんと在籍していることになる。
 */
export function rivalRoster(school: RivalSchool, year: number): Player[] {
  const players: Player[] = []

  for (const grade of [3, 2, 1] as Grade[]) {
    // 入学年で種を決める。学年が上がっても同じ人物になる
    const enrolledYear = year - (grade - 1)
    const rng = createRng(cohortSeed(school.rosterSeed, enrolledYear))

    // **名前の重複避けは学年の中だけで行う。**
    // 3学年ぶんをまとめて避けていた頃は、
    // 同じ代でも「その年に居合わせた他学年」によって名前が変わり、
    // 今年の1年生が来年は別人になっていた。
    // 学年をまたいだ同姓同名は 120×120 の名前から選ぶので滅多に起きない
    const takenNames: string[] = []

    for (let i = 0; i < PER_GRADE; i++) {
      const player = createPlayer(rng, {
        id: `${school.id}-${enrolledYear}-${i}`,
        grade,
        isPitcher: i < PITCHERS_PER_GRADE,
        talentBonus: school.strength,
        takenNames,
      })
      takenNames.push(player.name)
      players.push(player)
    }
  }

  return mergeStars(players, school, year)
}

/**
 * 注目選手を名簿に差し込む。
 *
 * 同じ学年の**いちばん弱い選手と入れ替える**。
 * 単に足すと部員数が増えて他校より有利になるし、
 * いちばん強い選手を押しのけると学校の格が下がってしまう。
 */
function mergeStars(players: Player[], school: RivalSchool, year: number): Player[] {
  const result = [...players]

  for (const star of school.stars) {
    const grade = starGrade(star, year)
    if (grade === null) continue

    // 同学年で、投手/野手の区分が合う枠を探す。無ければ学年だけで探す
    const sameKind = result.filter(
      (player) => player.grade === grade && player.isPitcher === star.isPitcher,
    )
    const candidates = sameKind.length > 0 ? sameKind : result.filter((p) => p.grade === grade)
    if (candidates.length === 0) continue

    const weakest = candidates.reduce((a, b) => (overallRating(b) < overallRating(a) ? b : a))
    const index = result.indexOf(weakest)
    result[index] = materializeStar(star, weakest, grade)
  }

  return result
}

/**
 * 注目選手を実際の選手にする。
 *
 * 素質（`rating`）どおりの能力になるよう、置き換える相手との差を補正で埋める。
 * 名前・学年・投手かどうか・触れ込みの特殊能力は注目選手のものを使う。
 */
function materializeStar(star: RivalPlayer, slot: Player, grade: Grade): Player {
  const rng = createRng(hashId(star.id))
  const base = createPlayer(rng, {
    id: star.id,
    grade,
    isPitcher: star.isPitcher,
    talentBonus: star.rating - BASE_RATING,
    // 素質を示してから入学させるので、そこからさらに振らない
    talentSpread: 0,
  })

  return {
    ...base,
    id: star.id,
    name: star.name,
    position: star.isPitcher === slot.isPitcher ? slot.position : base.position,
    skills: star.skillId ? [star.skillId] : base.skills,
    ...(star.scouted ? { origin: 'scout' as const } : {}),
  }
}

/**
 * 素質の基準。`GRADE_BASE[1]` と揃える。
 * ここがずれると「素質60」と書いてあった選手が総合60で出てこない。
 */
const BASE_RATING = 36

/**
 * その注目選手の今の学年。卒業していれば null。
 *
 * 入学年が分かっていればそこから数える。
 * 分からない古いデータは、記録された学年のまま据え置く（卒業させない）。
 */
function starGrade(star: RivalPlayer, year: number): Grade | null {
  if (star.enrolledYear === undefined) return star.grade

  const grade = star.enrolledYear === year ? 1 : year - star.enrolledYear + 1
  if (grade < 1) return null
  if (grade > 3) return null
  return grade as Grade
}

/** 学年ごとの種。入学年で分けることで、進級しても同じ人物になる */
function cohortSeed(rosterSeed: number, enrolledYear: number): number {
  return (rosterSeed * 1103515245 + enrolledYear * 12345) >>> 0
}

/** 文字列から種を作る（注目選手の能力を毎回同じにするため） */
function hashId(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
