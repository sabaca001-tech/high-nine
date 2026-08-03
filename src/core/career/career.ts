/**
 * 卒業後の進路の進行。
 *
 * 毎年3月の世代交代のタイミングで、在籍中の部員とは別に
 * 卒業生全員の1年ぶんを進める。プレイヤーの操作は入らない。
 */

import type { Rng } from '@/core/rng/random'
import type { Alumnus, CareerPath, ProSeason } from '@/core/types/career'
import { isCareerActive } from '@/core/types/career'

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

/** 進路の判定基準（卒業時の総合） */
const PRO_THRESHOLD = 76
const COLLEGE_THRESHOLD = 58
const CORPORATE_THRESHOLD = 44

/** 大学の在学年数 */
const COLLEGE_LENGTH = 4

/** 1シーズンの試合数 */
const SEASON_GAMES = 143

/** プロで戦力外になる実力の下限 */
const RELEASE_THRESHOLD = 45

/** 渡米を検討し始める実力 */
const OVERSEAS_THRESHOLD = 88

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
): CareerPath {
  const bonus = Math.round((reputation - 20) * 0.08)
  const score = rating + bonus + u18Bonus + rng.int(-4, 4)

  if (score >= PRO_THRESHOLD) return 'pro'
  if (score >= COLLEGE_THRESHOLD) return 'college'
  if (score >= CORPORATE_THRESHOLD) return 'corporate'
  return 'none'
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
  },
  reputation: number,
): Alumnus {
  const { u18Bonus = 0, ...record } = base
  const path = decidePath(rng, base.rating, reputation, u18Bonus)

  return {
    ...record,
    path,
    status:
      path === 'pro'
        ? 'pro'
        : path === 'college'
          ? 'college'
          : path === 'corporate'
            ? 'corporate'
            : 'retired',
    ability: base.rating,
    team:
      path === 'pro'
        ? rng.pick(PRO_TEAMS)
        : path === 'college'
          ? rng.pick(COLLEGES)
          : path === 'corporate'
            ? rng.pick(CORPORATE_TEAMS)
            : null,
    collegeYears: path === 'college' ? 1 : 0,
    proSeasons: [],
    note: path === 'none' ? '高校で競技を終えた' : null,
  }
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
      return advanceCollege(rng, alumnus)
    case 'pro':
    case 'mlb':
      return advancePro(rng, alumnus, year)
    case 'corporate':
      return advanceCorporate(rng, alumnus)
    default:
      return { alumnus, news: null }
  }
}

/** 大学。4年で卒業し、そこでの実力で進路が分かれる */
function advanceCollege(rng: Rng, alumnus: Alumnus): CareerUpdate {
  // 大学の4年間はまだ伸びる時期。ただし伸び幅には個人差がある
  const ability = clamp(alumnus.ability + rng.int(-3, 9))
  const years = alumnus.collegeYears + 1

  if (years <= COLLEGE_LENGTH) {
    return { alumnus: { ...alumnus, ability, collegeYears: years }, news: null }
  }

  // 卒業。大学での到達点で進路が決まる
  if (ability >= PRO_THRESHOLD - 4) {
    const team = rng.pick(PRO_TEAMS)
    return {
      alumnus: { ...alumnus, ability, collegeYears: COLLEGE_LENGTH, status: 'pro', team },
      news: `${alumnus.name}が大学を経て${team}に入団した`,
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
    },
    news: null,
  }
}

/** プロ。1年ぶんの成績を残し、実力の変化で進退が決まる */
function advancePro(rng: Rng, alumnus: Alumnus, year: number): CareerUpdate {
  const season = simulateProSeason(rng, alumnus, year)
  const proSeasons = [...alumnus.proSeasons, season]

  // 年齢による変化。5年目までは伸び、その後は下がっていく
  const years = proSeasons.length
  const drift = years <= 5 ? rng.int(-2, 6) : rng.int(-9, 2)
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
      alumnus: { ...updated, status: 'mlb', team },
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
      },
      news: `${alumnus.name}が現役を引退した（プロ${years}年）`,
    }
  }

  return { alumnus: updated, news: null }
}

/** 社会人。数年で競技を離れる */
function advanceCorporate(rng: Rng, alumnus: Alumnus): CareerUpdate {
  const ability = clamp(alumnus.ability + rng.int(-5, 3))

  if (ability < 40 || rng.chance(0.2)) {
    return {
      alumnus: {
        ...alumnus,
        ability,
        status: 'retired',
        team: null,
        note: '社会人でプレーを終えた',
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
  // 実力が低いと一軍に定着できない
  const playRate = clamp01((ability - 35) / 55)

  if (alumnus.isPitcher) {
    const games = clampRange(Math.round((12 + playRate * 20) * (0.8 + rng.float() * 0.4)), 1, 70)
    const wins = Math.max(0, Math.round(playRate * 14 * (0.5 + rng.float())))
    const losses = Math.max(0, Math.round((1 - playRate) * 12 * (0.4 + rng.float())))
    const strikeouts = Math.round(games * (2 + playRate * 5) * (0.7 + rng.float() * 0.6))
    const era = round2(clampRange(5.8 - playRate * 4 + (rng.float() - 0.5) * 1.6, 0.9, 9.9))

    return {
      year,
      team: alumnus.team ?? '無所属',
      overseas,
      games,
      batting: null,
      pitching: { wins, losses, strikeouts, era },
    }
  }

  const games = clampRange(
    Math.round((22 + playRate * 104) * (0.8 + rng.float() * 0.4)),
    1,
    SEASON_GAMES,
  )
  const atBats = Math.max(1, Math.round(games * (1.4 + playRate * 2.2)))
  const average = clampRange(0.19 + playRate * 0.13 + (rng.float() - 0.5) * 0.05, 0.12, 0.38)
  const hits = Math.round(atBats * average)
  const homeruns = Math.round(atBats * (0.005 + playRate * 0.05) * (0.5 + rng.float()))
  const rbi = Math.round(hits * 0.42 + homeruns * 1.7)

  return {
    year,
    team: alumnus.team ?? '無所属',
    overseas,
    games,
    batting: { atBats, hits, homeruns, rbi, average: round3(average) },
    pitching: null,
  }
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
