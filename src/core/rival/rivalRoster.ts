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
import { dayOfCell, seasonProgressOfDay } from '@/core/calendar/days'
import { createPlayer, GRADE_BASE, RIVAL_EXCHANGE_RATE } from '@/core/player/createPlayer'
import { overallRating, teamPoints } from '@/core/player/rating'
import { autoLineup } from '@/core/lineup/autoLineup'
import type { Grade, Player } from '@/core/types/player'
import type { RivalPlayer, RivalSchool } from './rivals'
import { classBonus, starsOf } from './rivals'

/**
 * 1学年あたりの人数。**強い学校ほど多い。**
 *
 * **5人（15人）では層が薄すぎた。** スタメン9人を15人から選ぶので、
 * 弱い選手まで必ず出場することになり、学校の力が上がらない。
 * 人数を増やすと**選ばれる9人の質だけが上がる**ので、
 * 突出した個人を作らずにチームを強くできる
 * （個人の上限を上げるとU18代表が90台で埋まってしまう）。
 *
 * 名門に部員が集まるのは現実にもそうで、
 * 「層の厚さ」を学校の格の表し方として使う。
 */
const PER_GRADE_MIN = 8
const PER_GRADE_MAX = 22

function perGradeOf(strength: number): number {
  return Math.min(PER_GRADE_MAX, PER_GRADE_MIN + Math.max(0, Math.round(strength / 5)))
}

/**
 * 学校の戦力を、選手ひとりの素質にどれだけ乗せるか。
 *
 * **そのまま乗せると上限に張り付いていた。**
 * 戦力46の学校の3年生は素質96になり、
 * `TALENT_SPREAD`（±18）が乗ると全能力が100付近で飽和する。
 * U18の名簿を作ったら「30人全員が総合98〜99」という並びになり、
 * 自校の選手は何をどう育てても届かなくなっていた。
 *
 * 学校の戦力は**層の厚さ**であって、突出した個人の多さではない。
 * 0.55にすると、戦力46の名門でも3年生の上位が総合90前後で止まる。
 */
export const ROSTER_TALENT_RATE = 0.55

/**
 * 学校の力を、選手ひとりの素質に変える。
 *
 * **上に行くほど詰める。** 素直に比例させていた頃は、
 * 地力68の名門の3年生が素質37を受け取り、
 * 学年のベース（50）と代の当たり（+9）が乗って**総合99**になっていた。
 * U18の30人が全員90超え・6人が95以上という並びで、
 * 自校の選手はどう育てても届かない。
 *
 * 自校の選手は練習の頭打ち（`diminishingMultiplier`）で
 * 85を超えたあたりからほとんど伸びなくなるのに、
 * 他校の選手だけ**その上限を無視して生成されていた**のが食い違いの正体。
 * 同じように、高いところほど効きを鈍らせる。
 */
export function rosterTalentOf(strength: number): number {
  const raw = strength * ROSTER_TALENT_RATE
  const eased = raw <= TALENT_KNEE ? raw : TALENT_KNEE + (raw - TALENT_KNEE) * TALENT_SLOPE
  return Math.min(TALENT_CAP, eased)
}

/** ここまでは素直に効く（戦力33ほど。県内の中堅上位まで） */
const TALENT_KNEE = 18
/** ここから上の効き */
const TALENT_SLOPE = 0.45

/**
 * 学校の力が選手に乗る**上限**。
 *
 * **強豪校の格は選手の能力で表さない。**
 * 学校を強くするたびに、そこに居る個人も強くなり、
 * U18代表が総合95〜100（球速160km/h台）で埋まっていた。
 * 「勝っている学校が強豪」という形（`RivalTitles`）に変えたので、
 * 能力のほうは高校生として無理のない範囲で止める。
 *
 * 3年生の素質は 50（学年）＋22 に代の当たり外れが乗る程度。
 * 名門との差は**部員の層の厚さ**（`perGradeOf`）で出す。
 */
const TALENT_CAP = 30

/** 各学年の何人目までを投手にするか */
const PITCHERS_PER_GRADE = 2

/**
 * 他校の部員ごとの素質の振れ幅（±）。**自校より小さく取る。**
 *
 * 既定（`TALENT_SPREAD` ＝ 18）のまま作ると、1学年5人しかいない名簿では
 * 平均が±8ほど揺れる。**地力64の名門が地力37の学校より弱く見える**ことが
 * 普通に起きていて（実測でスタメン平均67.3対69.8）、
 * 「名門は強い」という一覧の読み方そのものが成り立たなかった。
 *
 * 個人差は注目選手（`stars`）と**傑物**（下記）が担うので、
 * 名簿のほうは学校の格に寄せる。
 */
const ROSTER_TALENT_SPREAD = 5

/**
 * **傑物。** ごく稀に、学校の格を超えた選手が現れる。
 *
 * 振れ幅を絞った結果、他校の選手は**その学校の格どおり**に並ぶようになり、
 * U18代表の30人が横一線（総合86〜93）で顔ぶれの違いが出なくなっていた。
 * 「今年の代表にはとんでもないのが1人いる」という年が無いと、
 * 代表を見に行く意味も、そこへ届くかどうかの手応えも生まれない。
 *
 * **平均は下げ、最高だけを上げる。** 素質の底上げ（`STANDOUT_BONUS`）は
 * 大きいが、出るのは**300人に1人**なので名簿全体の水準は動かない。
 *
 * 代表の候補になるのは上位60校（`CANDIDATE_SCHOOLS`）の900人ほどなので、
 * **その代の傑物は2〜3人**。30人の中に数人だけ抜けた選手がいる形になる。
 */
const STANDOUT_CHANCE = 0.003
const STANDOUT_BONUS = { min: 18, max: 40 }

/**
 * その選手が傑物か。**種から決まる**ので、名簿を作り直しても同じ選手が傑物になる。
 * 乱数カーソルを消費しないので、他の選手の生成にも影響しない。
 */
function standoutBonusOf(seed: number): number {
  let hash = Math.imul(seed ^ 0x9e3779b9, 2246822519) >>> 0
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917)
  hash = (hash ^ (hash >>> 16)) >>> 0

  const roll = (hash & 0xffff) / 0xffff
  if (roll >= STANDOUT_CHANCE) return 0

  // 当たった中でも幅を持たせる（全員が同じ上乗せでは、また横一線になる）
  const within = ((hash >>> 16) & 0xffff) / 0xffff
  return Math.round(
    STANDOUT_BONUS.min + within * (STANDOUT_BONUS.max - STANDOUT_BONUS.min),
  )
}

/**
 * 他校の部員が**1年で伸びる量**。
 *
 * これが無かった頃は、他校の名簿は1年を通してまったく同じ能力だった。
 * 3年生が抜けても翌年の3年生が同じ基準で作られるので、
 * **卒業しても学校の力が1ミリも下がらない**。
 * こちらだけが3年生を送り出して弱くなる、という不自然な世界になっていた。
 *
 * 学年のベース（`GRADE_BASE`）の刻みに合わせてある（1年36→2年44→3年50）。
 * 年度末の1年生（36+4）が、翌年度初めの2年生（44-4）とちょうど並ぶので、
 * **選手ひとりの能力は年度をまたいでも途切れない**。
 * 下がるのは学校の平均のほうで、
 * 「よく育った3年生が抜けて、代わりに1年生が入る」ぶんだけ落ちる。
 *
 * **年度の真ん中を0にする**（4月1日は -4、年度末は +4）。
 * 4月を0にして積み上げると、1年を通した平均が丸ごと上がってしまい、
 * 夏の大会がそれまでより一段厳しくなる。
 * 実測でも、甲子園出場が30年で7.6回から4.0回まで落ちた。
 * 上げたいのは「年度の中での上下」であって、他校全体の水準ではない。
 */
export const RIVAL_YEAR_GROWTH = 8

/**
 * その時点の伸びぶん。年度の真ん中で0になるよう中心をずらす。
 *
 * **日で受け取る。** 月から出していた頃は1ヶ月に1回まとめて動く階段で、
 * 月をまたいだ途端に相手が1段強くなった。
 * 1マス1日なので、盤面の位置をそのまま渡せば毎日少しずつ動く。
 */
export function seasonGrowth(progress: number): number {
  return Math.round((clampProgress(progress) - 0.5) * RIVAL_YEAR_GROWTH)
}

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress))
}

/**
 * 盤面の位置から年度の進み具合を出す。
 * 呼び出し側が `dayOfCell` を挟み忘れないよう、まとめてここに置く。
 */
export function seasonProgressOfCell(boardPosition: number): number {
  return seasonProgressOfDay(dayOfCell(boardPosition))
}

/**
 * 学校の部員を作る。**同じ学校・同じ年なら必ず同じ結果になる。**
 *
 * **id には `r` を挟む。** 挟んでいなかった頃は
 * `${'${school.id}'}-${'${入学年}'}-${'${背番号}'}` という形が
 * 注目選手（`advanceRival` の `makeStar`）の id とまったく同じで、
 * **同じ名簿の中に同じ id の選手が2人**現れることがあった。
 * U18の名簿は id で選手を引き当てるので、
 * 「総合99で選んだはずが、引き当てたら総合71の別人」という取り違えが起きていた。
 *
 * 入学年ごとに種を分けているので、学年が上がっても同じ選手が同じ名前で残る。
 * 能力はその学校の今の戦力（`strength`）を基準にするので、
 * 学校が力をつければ在校生も少し強く見える。
 * 個人の成長を積み上げて持ち回るより、はるかに安く「学校の格」を表せる。
 *
 * 注目選手（`stars`）は**この名簿を置き換える形で混ぜる**。
 * スカウトで逃した選手が、その学校にちゃんと在籍していることになる。
 */
export function rivalRoster(
  school: RivalSchool,
  year: number,
  /**
   * 年度の進み具合（0＝4月1日、1＝年度末）。
   * `seasonProgressOfDay(dayOfCell(boardPosition))` を渡す。
   * 既定は年度の真ん中（伸びぶん0）。
   */
  progress = 0.5,
): Player[] {
  const players: Player[] = []
  // 年度の中でも伸びる。**乱数の引き方は変えない**ので、
  // 同じ学校・同じ年なら顔ぶれはそのままで能力だけが上がる
  const grown = seasonGrowth(progress)
  // 強い学校ほど部員が多い。選ばれる9人の質が上がる
  const perGrade = perGradeOf(school.strength)

  for (const grade of [3, 2, 1] as Grade[]) {
    // 入学年で種を決める。学年が上がっても同じ人物になる
    const enrolledYear = year - (grade - 1)

    // **名前の重複避けは学年の中だけで行う。**
    // 3学年ぶんをまとめて避けていた頃は、
    // 同じ代でも「その年に居合わせた他学年」によって名前が変わり、
    // 今年の1年生が来年は別人になっていた。
    // 学年をまたいだ同姓同名は 120×120 の名前から選ぶので滅多に起きない
    const takenNames: string[] = []

    for (let i = 0; i < perGrade; i++) {
      // **選手ごとに種を分ける。** 代ぶんの乱数を1本で回していた頃は、
      // 前の選手が引いた回数（投手の持ち球の数は能力で変わる）が
      // 後ろの選手の名前をずらしていた。
      // 学年が上がると能力の基準も上がるので、
      // 同じ代なのに翌年は3人目以降が別人になっていた
      const rng = createRng(playerSeed(school.rosterSeed, enrolledYear, i))
      const player = createPlayer(rng, {
        id: `${school.id}-r${enrolledYear}-${i}`,
        grade,
        isPitcher: i < PITCHERS_PER_GRADE,
        // **代ごとの当たり外れ**を足す。良い代を抱えた学校は3年かけて台頭し、
        // その代が卒業すると落ちる
        talentBonus:
          Math.round(rosterTalentOf(school.strength)) +
          classBonus(school, enrolledYear) +
          grown +
          // ごく稀に、学校の格を超えた傑物が現れる
          standoutBonusOf(playerSeed(school.rosterSeed, enrolledYear, i)),
        talentSpread: ROSTER_TALENT_SPREAD,
        // **他校に天才肌は出さない。** 母数が900人あるので、
        // 2%でも代表の枠がそれで埋まり、自校の選手が押し出される
        allowGenius: false,
        // 留学生も他校では珍しくする（同じ2%だと全国で270人になる）
        exchangeRate: RIVAL_EXCHANGE_RATE,
        takenNames,
      })
      takenNames.push(player.name)
      players.push(player)
    }
  }

  return mergeStars(players, school, year, grown)
}

/**
 * 注目選手を名簿に差し込む。
 *
 * 同じ学年の**いちばん弱い選手と入れ替える**。
 * 単に足すと部員数が増えて他校より有利になるし、
 * いちばん強い選手を押しのけると学校の格が下がってしまう。
 */
function mergeStars(
  players: Player[],
  school: RivalSchool,
  year: number,
  grown: number,
): Player[] {
  const result = [...players]

  for (const star of starsOf(school)) {
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
    result[index] = materializeStar(star, weakest, grade, grown)
  }

  return result
}

/**
 * 注目選手を実際の選手にする。
 *
 * 素質（`rating`）どおりの能力になるよう、置き換える相手との差を補正で埋める。
 * 名前・学年・投手かどうか・触れ込みの特殊能力は注目選手のものを使う。
 */
function materializeStar(star: RivalPlayer, slot: Player, grade: Grade, grown: number): Player {
  const rng = createRng(hashId(star.id))
  const base = createPlayer(rng, {
    id: star.id,
    grade,
    isPitcher: star.isPitcher,
    talentBonus: star.rating - GRADE_BASE[grade] + grown,
    // 素質を示してから入学させるので、そこからさらに振らない
    talentSpread: 0,
    // 名前は注目選手のものを使うので、留学生としては作らない
    exchange: false,
    // 他校なので天才肌も出さない（素質は `rating` で決まっている）
    allowGenius: false,
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

/*
 * **学年のベースを引く。** `GRADE_BASE[1]`（36）で固定して引いていた頃は、
 * 3年生の注目選手が `50 + (rating - 36)` で作られ、
 * **素質93と書いてあった選手が総合107相当（＝全能力100）**になっていた。
 * 開始時の注目選手は3年生が多いので、U18代表が総合99で埋まる原因になっていた。
 */

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

/**
 * 選手1人ぶんの種。
 * 入学年で分けることで進級しても同じ人物になり、
 * 背番号（i）で分けることで**前の選手の引いた回数に左右されない**。
 */
function playerSeed(rosterSeed: number, enrolledYear: number, index: number): number {
  const base = (rosterSeed * 1103515245 + enrolledYear * 12345) >>> 0
  return (Math.imul(base ^ (index + 1), 2654435761) + index) >>> 0
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

/**
 * その学校のスタメン9人の平均総合。
 *
 * **戦力（`strength`）をそのまま出すと読めない。**
 * 「+15」と書かれても、自分のチームと比べてどうなのかが分からなかった。
 * 選手の総合と同じ物差しで出せば、そのまま比べられる。
 *
 * 名簿は種から作り直すので、ここで出る値は
 * **実際に試合で当たるスタメンの平均**と完全に一致する。
 * 1校あたり0.2msほどかかるので、画面では `useMemo` で抑えること。
 */
export function lineupRatingOf(
  school: RivalSchool,
  year: number,
  /** 年度の進み具合（0〜1）。既定は年度の真ん中 */
  progress = 0.5,
): number {
  const starters = lineupOf(school, year, progress)
  if (starters.length === 0) return 0
  return starters.reduce((sum, player) => sum + overallRating(player), 0) / starters.length
}

/**
 * その学校のスタメン9人の**評価点の合計**。画面に出すのはこちら。
 *
 * **平均総合では強豪が読めない。** 平均は穴の無さを測る値なので、
 * 飛び抜けた選手を抱えた学校が平らな学校に埋もれる。
 * 強豪は平均が高いとは限らず、点数が高い。
 */
export function lineupPointsOf(
  school: RivalSchool,
  year: number,
  progress = 0.5,
): number {
  return teamPoints(lineupOf(school, year, progress))
}

/** その学校のスタメン9人。名簿は種から作り直すので、試合で当たる顔ぶれと一致する */
function lineupOf(school: RivalSchool, year: number, progress: number): Player[] {
  const roster = rivalRoster(school, year, progress)
  const lineup = autoLineup(roster)
  const byId = new Map(roster.map((player) => [player.id, player]))

  return lineup.slots
    .map((slot) => byId.get(slot.playerId))
    .filter((player): player is Player => player !== undefined)
}
