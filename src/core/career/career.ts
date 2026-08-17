/**
 * 卒業後の進路の進行。
 *
 * 毎年3月の世代交代のタイミングで、在籍中の部員とは別に
 * 卒業生全員の1年ぶんを進める。プレイヤーの操作は入らない。
 */

import type { Rng } from '@/core/rng/random'
import type { Alumnus, CareerEntry, CareerPath, CareerStatus, ProSeason } from '@/core/types/career'
import { ageAt, isCareerActive, isInHallOfFame } from '@/core/types/career'

/** プロ球団名（実在球団を想起させない独自の名称） */
const PRO_TEAMS = [
  '東京グランドス',
  '大阪ブレイズ',
  '名古屋シャチホコズ',
  '福岡シーウインズ',
  '札幌ノーザンベアーズ',
  '横浜マリンスターズ',
  '広島レッドフェニックス',
  '仙台イーグルアイズ',
  '神戸ウェイブス',
  '千葉ソルティーズ',
]

/** 海外リーグの球団名 */
const OVERSEAS_TEAMS = ['シアトル・オーカス', 'ニューヨーク・ハーバーズ', 'テキサス・ロングホーン']

/** 大学名 */
const COLLEGES = ['青嶺大学', '東都経済大学', '西日本工科大学', '北央大学', '南海大学']

/** 社会人チーム名 */
const CORPORATE_TEAMS = ['大和重工', '中央銀行', '第一製鉄', '日本電機', '共栄運輸']

/**
 * 進路の判定基準（卒業時の総合）。
 *
 * **プロ入りは滅多に出ない水準に置く。** 76にしていた頃は
 * 3年育てれば誰でも届き、毎年のようにプロが出ていた。
 * 総合82は無戦略プレイでは10年に一度も届かない水準で、
 * 育て切った主軸だけが指名される。
 */
const PRO_THRESHOLD = 86

/**
 * 水準に届いた選手が実際に指名される確率。
 *
 * **届けば必ずプロ、をやめた。** 評判が上がって良い新入生が来るようになると、
 * 主軸が毎年のように水準へ届き、OB名鑑がプロだらけになる。
 * 実際の高校野球でも、注目された選手全員が指名されるわけではない。
 * 抜けて上（`PRO_SURE`）まで行けばほぼ確実に指名される。
 */
const DRAFT_CHANCE_MIN = 0.35
const PRO_SURE = 95
const COLLEGE_THRESHOLD = 62
const CORPORATE_THRESHOLD = 46

/** 大学の在学年数 */
const COLLEGE_LENGTH = 4

/** 1シーズンの試合数 */
const SEASON_GAMES = 143

/**
 * プロ入りで能力がどれだけ落ちるか。
 *
 * 高校の総合はあくまで**高校生の中での物差し**。
 * そのままプロへ持ち込むと、卒業した年から一線級の成績を残してしまい、
 * 「プロで通用するか」という段階が消えていた。
 * プロの物差しに置き換えるので、**ほとんどの選手は半分になる**。
 *
 * 稀に適応する選手がいる。ここが全員一律だと、
 * 誰を送り出しても同じ結末になってしまう。
 */
const PRO_SCALE = 0.5
const PRO_ADAPT_CHANCE = 0.12
const PRO_ADAPT_SCALE = 0.7
const PRO_PRODIGY_CHANCE = 0.03
const PRO_PRODIGY_SCALE = 0.85

/**
 * プロ入り後の能力は**高校とは別の物差し**（おおむね20〜60）。
 * 高校の基準（プロ入りが82以上）と混ぜて読まないこと。
 */
/** プロで戦力外になる実力の下限 */
const RELEASE_THRESHOLD = 22

/** 渡米を検討し始める実力 */
const OVERSEAS_THRESHOLD = 62

/**
 * 卒業時の進路を決める。
 *
 * 学校の評判が高いとスカウトの目に留まりやすく、少し有利になる。
 * **U18日本代表での活躍はそれよりずっと大きい**。
 * 全国のスカウトが直接見ている場なので、指名の確率が跳ね上がる。
 */
export function decidePath(
  rng: Rng,
  rating: number,
  reputation: number,
  /** U18代表の実績による上乗せ（u18.ts の draftBonus） */
  u18Bonus = 0,
  /** 投手なら球速(km/h)。野手なら省略 */
  velocity?: number,
): CareerPath {
  // 評判はあくまで「目に留まりやすくなる」程度。実力を覆さない
  const bonus = Math.round((reputation - 20) * 0.05)
  const score =
    rating + bonus + u18Bonus + velocityDraftBonus(velocity) + rng.int(-4, 4)

  if (score >= PRO_THRESHOLD) {
    // 水準に届いても指名は確約されない。抜けて上ならほぼ確実
    const room = (score - PRO_THRESHOLD) / Math.max(1, PRO_SURE - PRO_THRESHOLD)
    const chance = DRAFT_CHANCE_MIN + (1 - DRAFT_CHANCE_MIN) * Math.min(1, room)
    if (rng.chance(chance)) return 'pro'
    // 指名されなかった選手は大学・社会人へ進む
    return score >= COLLEGE_THRESHOLD ? 'college' : 'corporate'
  }
  if (score >= COLLEGE_THRESHOLD) return 'college'
  if (score >= CORPORATE_THRESHOLD) return 'corporate'
  return 'none'
}

/**
 * 球速によるドラフトの上下。
 *
 * **高卒の投手はまず球速で見られる。** 150km/h に届かない投手は、
 * 他が全部突出していない限り指名まで行かないのが現実で、
 * 逆に150km/hを超えると一気に候補に入る。
 * 球速を無視していた頃は、制球とスタミナだけが良い138km/hの投手が
 * 毎年のように指名されていた。
 *
 *   140km/h → -20 ／ 145 → -10 ／ 150 → ±0 ／ 155 → +10
 *
 * 総合の水準（`PRO_THRESHOLD` ＝ 86）と合わせると、
 * 145km/hの投手は総合96、150km/hなら86で並ぶ。
 */
export function velocityDraftBonus(velocity?: number): number {
  if (velocity === undefined) return 0
  return clampRange(Math.round((velocity - DRAFT_VELOCITY_LINE) * 2), -20, 16)
}

/**
 * ここを超えると指名が現実味を帯びる球速(km/h)。
 *
 * **高校生の球速の帯に合わせてある。** 150にしていた頃は、
 * 生成される投手の帯（3年生の中央値137km/h）から遠すぎて、
 * ほとんどの投手が下限（-20）に張り付いていた。
 * いまはAランク（145km/h）の少し手前に置いてある。
 */
const DRAFT_VELOCITY_LINE = 143

/**
 * プロ入りしたときに能力をプロの物差しへ置き換える。
 *
 * 戻り値の `adapted` は「思ったより落ちなかった」かどうか。
 * 世代交代の報告に出して、稀な当たりが分かるようにする。
 */
export function toProAbility(
  rng: Rng,
  ability: number,
): { ability: number; adapted: boolean } {
  const roll = rng.float()
  const scale =
    roll < PRO_PRODIGY_CHANCE
      ? PRO_PRODIGY_SCALE
      : roll < PRO_PRODIGY_CHANCE + PRO_ADAPT_CHANCE
        ? PRO_ADAPT_SCALE
        : PRO_SCALE

  return {
    ability: clamp(ability * scale),
    adapted: scale > PRO_SCALE,
  }
}

/** 卒業直後の記録を作る */
export function createAlumnus(
  rng: Rng,
  base: {
    id: string
    name: string
    isPitcher: boolean
    position: Alumnus['position']
    year: number
    rating: number
    skills: string[]
    highSchool: import('@/core/player/careerStats').CareerStats
    /** U18代表の実績による上乗せ */
    u18Bonus?: number
    /** 卒業時の各能力。名鑑で「何が武器だったか」を見せる */
    finalAbilities?: import('@/core/types/player').AbilitySnapshot
  },
  reputation: number,
): Alumnus {
  const { u18Bonus = 0, ...record } = base
  // 投手は球速がそのまま指名の分かれ目になる
  const path = decidePath(
    rng,
    base.rating,
    reputation,
    u18Bonus,
    base.isPitcher ? base.finalAbilities?.velocity : undefined,
  )

  // 高校からそのままプロへ行く選手は、この時点でプロの物差しに置き換わる
  const ability = path === 'pro' ? toProAbility(rng, base.rating).ability : base.rating

  const status: CareerStatus =
    path === 'pro' ? 'pro' : path === 'college' ? 'college' : path === 'corporate' ? 'corporate' : 'retired'
  const team =
    path === 'pro'
      ? rng.pick(PRO_TEAMS)
      : path === 'college'
        ? rng.pick(COLLEGES)
        : path === 'corporate'
          ? rng.pick(CORPORATE_TEAMS)
          : null

  return {
    ...record,
    path,
    status,
    ability,
    team,
    collegeYears: path === 'college' ? 1 : 0,
    proSeasons: [],
    note: path === 'none' ? '高校で競技を終えた' : null,
    careerLog: [
      entryOf(base.year, base.year, status, team, ability, graduationText(path, team)),
    ],
  }
}

/** 経歴の1行を作る */
function entryOf(
  graduatedYear: number,
  year: number,
  status: CareerStatus,
  team: string | null,
  ability: number,
  text: string,
): CareerEntry {
  return { year, age: ageAt(graduatedYear, year), status, team, ability, text }
}

/** 経歴に1行足した記録を返す */
function withEntry(alumnus: Alumnus, year: number, status: CareerStatus, team: string | null, ability: number, text: string): CareerEntry[] {
  return [...(alumnus.careerLog ?? []), entryOf(alumnus.year, year, status, team, ability, text)]
}

function graduationText(path: CareerPath, team: string | null): string {
  if (path === 'pro') return `高校卒業後、${team}にドラフト指名され入団`
  if (path === 'college') return `${team}へ進学`
  if (path === 'corporate') return `${team}へ入社`
  return '高校で競技を終えた'
}

/**
 * 卒業生の記録を上限まで切り詰める。
 *
 * **プロに届いた選手は絶対に落とさない。** 単純に新しい順で切ると、
 * 何年も経ったあとに古いプロOBが押し出されて名鑑から消える。
 * 落とすのは高校で終えた選手など、記録として残す価値が薄いものから。
 *
 * 落とした選手の高校成績も歴代記録から消える点は承知のうえ
 * （セーブの大きさに上限が要るため）。
 */
export function trimGraduates(graduates: Alumnus[], limit: number): Alumnus[] {
  if (graduates.length <= limit) return graduates

  const kept = graduates.filter(isInHallOfFame)
  if (kept.length >= limit) return kept.slice(0, limit)

  const rest = graduates.filter((alumnus) => !isInHallOfFame(alumnus))
  // 元の並び（新しい順）を保つため、id ではなく元配列の順で拾い直す
  const survivors = new Set([...kept, ...rest.slice(0, limit - kept.length)])
  return graduates.filter((alumnus) => survivors.has(alumnus))
}

/** 1年ぶん進めた結果。ニュースは世代交代画面に出す */
export type CareerUpdate = {
  alumnus: Alumnus
  /** 表示したい出来事。無ければ null */
  news: string | null
}

/** 卒業生1人の1年を進める */
export function advanceCareer(rng: Rng, alumnus: Alumnus, year: number): CareerUpdate {
  if (!isCareerActive(alumnus)) return { alumnus, news: null }

  switch (alumnus.status) {
    case 'college':
      return advanceCollege(rng, alumnus, year)
    case 'pro':
    case 'mlb':
      return advancePro(rng, alumnus, year)
    case 'corporate':
      return advanceCorporate(rng, alumnus, year)
    default:
      return { alumnus, news: null }
  }
}

/** 大学。4年で卒業し、そこでの実力で進路が分かれる */
function advanceCollege(rng: Rng, alumnus: Alumnus, year: number): CareerUpdate {
  // 大学の4年間はまだ伸びる時期。ただし伸び幅には個人差がある
  const ability = clamp(alumnus.ability + rng.int(-3, 9))
  const years = alumnus.collegeYears + 1

  if (years <= COLLEGE_LENGTH) {
    return { alumnus: { ...alumnus, ability, collegeYears: years }, news: null }
  }

  // 卒業。大学での到達点で進路が決まる
  // 大学経由でも指名は確約されない
  if (ability >= PRO_THRESHOLD - 4 && rng.chance(0.55)) {
    const team = rng.pick(PRO_TEAMS)
    // 大学経由でも、プロに入る時点で物差しが変わるのは同じ
    const pro = toProAbility(rng, ability)
    return {
      alumnus: {
        ...alumnus,
        ability: pro.ability,
        collegeYears: COLLEGE_LENGTH,
        status: 'pro',
        team,
        careerLog: withEntry(alumnus, year, 'pro', team, pro.ability, `${team}にドラフト指名され入団`),
      },
      news: `${alumnus.name}が大学を経て${team}に入団した${
        pro.adapted ? '。プロの水にすぐ慣れそうだ' : ''
      }`,
    }
  }
  if (ability >= CORPORATE_THRESHOLD) {
    const team = rng.pick(CORPORATE_TEAMS)
    return {
      alumnus: {
        ...alumnus,
        ability,
        collegeYears: COLLEGE_LENGTH,
        status: 'corporate',
        team,
        careerLog: withEntry(alumnus, year, 'corporate', team, ability, `大学卒業後、${team}へ`),
      },
      news: `${alumnus.name}が大学卒業後、${team}に進んだ`,
    }
  }
  return {
    alumnus: {
      ...alumnus,
      ability,
      collegeYears: COLLEGE_LENGTH,
      status: 'retired',
      team: null,
      note: '大学卒業とともに競技を終えた',
      careerLog: withEntry(alumnus, year, 'retired', null, ability, '大学卒業とともに競技を終えた'),
    },
    news: null,
  }
}

/** プロ。1年ぶんの成績を残し、実力の変化で進退が決まる */
function advancePro(rng: Rng, alumnus: Alumnus, year: number): CareerUpdate {
  const season = simulateProSeason(rng, alumnus, year)
  const proSeasons = [...alumnus.proSeasons, season]

  // 年齢による変化。5年目までは伸び、その後は下がっていく。
  // プロの物差し（20〜60）は高校より幅が狭いので、振れ幅も小さくする
  const years = proSeasons.length
  const drift = years <= 5 ? rng.int(-1, 4) : rng.int(-6, 1)
  const ability = clamp(alumnus.ability + drift)

  const updated: Alumnus = { ...alumnus, proSeasons, ability }

  // 海外挑戦。実力が抜けていて、まだ若いうちに限る
  if (
    updated.status === 'pro' &&
    ability >= OVERSEAS_THRESHOLD &&
    years >= 3 &&
    years <= 9 &&
    rng.chance(0.3)
  ) {
    const team = rng.pick(OVERSEAS_TEAMS)
    return {
      alumnus: {
        ...updated,
        status: 'mlb',
        team,
        careerLog: withEntry(alumnus, year, 'mlb', team, ability, `海外リーグの${team}へ移籍`),
      },
      news: `${alumnus.name}が海外リーグの${team}へ移籍！`,
    }
  }

  // 戦力外。実力が落ちきったら通告される
  if (ability < RELEASE_THRESHOLD) {
    // 現役続行を選ぶこともある
    if (rng.chance(0.35) && years < 15) {
      const team = rng.pick(CORPORATE_TEAMS)
      return {
        alumnus: {
          ...updated,
          status: 'corporate',
          team,
          note: '戦力外通告を受け、社会人でプレーを続けた',
          careerLog: withEntry(alumnus, year, 'corporate', team, ability, `戦力外通告。${team}で現役を続ける`),
        },
        news: `${alumnus.name}が戦力外に。${team}で現役を続ける`,
      }
    }
    return {
      alumnus: {
        ...updated,
        status: 'retired',
        team: null,
        note: `プロ${years}年で引退`,
        careerLog: withEntry(alumnus, year, 'retired', null, ability, `プロ${years}年で引退`),
      },
      news: `${alumnus.name}が現役を引退した（プロ${years}年）`,
    }
  }

  // 長く続けた選手は自ら引退する
  if (years >= 16 || (years >= 12 && rng.chance(0.4))) {
    return {
      alumnus: {
        ...updated,
        status: 'retired',
        team: null,
        note: `プロ${years}年で現役を退いた`,
        careerLog: withEntry(alumnus, year, 'retired', null, ability, `プロ${years}年で現役を退いた`),
      },
      news: `${alumnus.name}が現役を引退した（プロ${years}年）`,
    }
  }

  // 移籍。**同じ球団で引退まで、ばかりでは経歴が動かない。**
  // 実力があればFAで、無ければトレードで動く。国内のプロだけが対象
  const transfer = transferFor(rng, updated, years)
  if (transfer) {
    return {
      alumnus: {
        ...updated,
        team: transfer.team,
        careerLog: withEntry(alumnus, year, updated.status, transfer.team, ability, transfer.text),
      },
      news: `${alumnus.name}が${transfer.team}へ移籍した（${transfer.kind}）`,
    }
  }

  return { alumnus: updated, news: null }
}

/**
 * 移籍するか。しないなら null。
 *
 * FAは実力のある選手が9年目以降に、トレードは伸び悩んだ選手が中堅で動く。
 * どちらも**移籍先は今と違う球団**にする。
 */
function transferFor(
  rng: Rng,
  alumnus: Alumnus,
  years: number,
): { team: string; kind: string; text: string } | null {
  if (alumnus.status !== 'pro') return null

  const fa = years >= FA_YEARS && alumnus.ability >= FA_ABILITY && rng.chance(FA_CHANCE)
  const trade = !fa && years >= 3 && alumnus.ability < FA_ABILITY && rng.chance(TRADE_CHANCE)
  if (!fa && !trade) return null

  const others = PRO_TEAMS.filter((team) => team !== alumnus.team)
  if (others.length === 0) return null
  const team = rng.pick(others)

  return fa
    ? { team, kind: 'FA', text: `FA権を行使し${team}へ移籍` }
    : { team, kind: 'トレード', text: `トレードで${team}へ移籍` }
}

/** FAで動ける年数と、声がかかる実力 */
const FA_YEARS = 8
const FA_ABILITY = 42
const FA_CHANCE = 0.18

/** 伸び悩んだ選手のトレード */
const TRADE_CHANCE = 0.07

/** 社会人。数年で競技を離れる */
function advanceCorporate(rng: Rng, alumnus: Alumnus, year: number): CareerUpdate {
  const ability = clamp(alumnus.ability + rng.int(-5, 3))

  if (ability < 40 || rng.chance(0.2)) {
    return {
      alumnus: {
        ...alumnus,
        ability,
        status: 'retired',
        team: null,
        note: '社会人でプレーを終えた',
        careerLog: withEntry(alumnus, year, 'retired', null, ability, '社会人でプレーを終えた'),
      },
      news: null,
    }
  }
  return { alumnus: { ...alumnus, ability }, news: null }
}

/**
 * プロの1年ぶんの成績を作る。
 * 実力が高いほど出場機会も内容も良くなる。
 */
export function simulateProSeason(rng: Rng, alumnus: Alumnus, year: number): ProSeason {
  const overseas = alumnus.status === 'mlb'
  const ability = alumnus.ability
  // 実力が低いと一軍に定着できない。
  // プロの物差し（20〜60）に合わせた範囲で、20なら0・65で1になる
  const playRate = clamp01((ability - REPLACEMENT_LEVEL) / (ELITE_LEVEL - REPLACEMENT_LEVEL))

  if (alumnus.isPitcher) {
    const games = clampRange(Math.round((6 + playRate * 24) * (0.8 + rng.float() * 0.4)), 1, 60)
    const innings = Math.max(1, Math.round(games * (2.2 + playRate * 4.5)))
    // **勝敗は登板数と投球回から決める。**
    // 別々に振っていた頃は「6登板で11敗」という成立しない成績が出ていた
    const decisions = clampRange(Math.round(innings / 6.5), 0, games)
    const winShare = 0.22 + playRate * 0.45
    const wins = Math.round(decisions * winShare * (0.7 + rng.float() * 0.6))
    const losses = Math.max(0, decisions - wins)
    const saves = playRate > 0.5 && rng.chance(0.15) ? Math.round(playRate * 30 * rng.float()) : 0
    const strikeouts = Math.round(innings * (0.5 + playRate * 0.6) * (0.8 + rng.float() * 0.4))
    const era = round2(
      clampRange(6.8 - playRate * 4.6 + (rng.float() - 0.5) * 1.6, 1.2, 9.9),
    )

    const pitching = { wins, losses, strikeouts, era, innings, saves }
    return {
      year,
      team: alumnus.team ?? '無所属',
      overseas,
      ability,
      games,
      batting: null,
      pitching,
      titles: pitcherTitles(pitching),
    }
  }

  const games = clampRange(
    Math.round((12 + playRate * 118) * (0.8 + rng.float() * 0.4)),
    1,
    SEASON_GAMES,
  )
  const atBats = Math.max(1, Math.round(games * (1.2 + playRate * 2.4)))
  const average = clampRange(0.17 + playRate * 0.16 + (rng.float() - 0.5) * 0.05, 0.09, 0.38)
  const hits = Math.round(atBats * average)
  const homeruns = Math.round(atBats * (0.002 + playRate * 0.055) * (0.5 + rng.float()))
  const doubles = Math.round(hits * (0.14 + rng.float() * 0.08))
  const steals = Math.round(playRate * 24 * rng.float() * rng.float())
  const walks = Math.round(atBats * (0.05 + playRate * 0.06))
  const rbi = Math.round(hits * 0.42 + homeruns * 1.7)

  const batting = { atBats, hits, homeruns, rbi, average: round3(average), doubles, steals, walks }
  return {
    year,
    team: alumnus.team ?? '無所属',
    overseas,
    ability,
    games,
    batting,
    pitching: null,
    titles: batterTitles(batting, games),
  }
}

/**
 * プロの物差し。
 *
 * **高校の総合をそのまま持ち込んだら一流**、という水準に合わせる。
 * 高校で総合85まで育て切った選手が、能力を落とさずにプロへ入れたなら
 * 打率3割・規定打席という成績になる。
 * 実際は入団時に半分になる（`PRO_SCALE`）ので、
 * ほとんどの選手は控え（30試合・打率2割）から始まる。
 *
 * 以前は `(ability - 20) / 45` で、**半分になった実力（42前後）でも
 * 73試合・打率.254**という主力の成績が出ていた。
 * 「プロで通用するか」という段階が数字の上で消えていた。
 */
const REPLACEMENT_LEVEL = 38
const ELITE_LEVEL = 88

/**
 * タイトル。
 *
 * リーグ全体を回してはいないので、**絶対的な水準**で判定する。
 * 「その年のリーグで一番」を厳密に決めるにはNPB全体を持つ必要があり、
 * 卒業生の記録のためだけに抱えるには重すぎる。
 */
function batterTitles(
  batting: { average: number; homeruns: number; rbi: number; steals: number },
  games: number,
): string[] {
  const titles: string[] = []
  // 規定打席に届いていない選手はタイトル争いに乗らない
  if (games < 100) return titles

  if (batting.average >= 0.33) titles.push('首位打者')
  if (batting.homeruns >= 35) titles.push('本塁打王')
  if (batting.rbi >= 95) titles.push('打点王')
  if (batting.steals >= 35) titles.push('盗塁王')
  return titles
}

function pitcherTitles(pitching: {
  wins: number
  era: number
  strikeouts: number
  innings: number
  saves: number
}): string[] {
  const titles: string[] = []

  if (pitching.wins >= 15) titles.push('最多勝')
  if (pitching.innings >= 140 && pitching.era <= 2.3) titles.push('最優秀防御率')
  if (pitching.strikeouts >= 170) titles.push('最多奪三振')
  if (pitching.saves >= 30) titles.push('最多セーブ')
  return titles
}

function clamp(value: number): number {
  return Math.min(99, Math.max(1, Math.round(value)))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
