/**
 * 卒業後の進路の型定義。
 *
 * 卒業した選手は消えず、**在学中と並行して毎年その後が進む**。
 * プロなら年度ごとの成績が積み上がり、成績次第で戦力外・引退・渡米が起きる。
 * 大学組は4年後の成績でプロ／社会人／引退に分かれる。
 */

import type { AbilitySnapshot, Position } from './player'

/**
 * 高校を卒業した年の年齢。プロの成績を**年度ではなく年齢で読ませる**ための起点。
 *
 * 「3年目に24本」より「23歳で24本」のほうが、
 * その選手が早咲きだったのか遅咲きだったのかが分かる。
 */
export const GRADUATION_AGE = 18

/** 卒業する月。能力の記録を残す月に使う */
export const GRADUATION_MONTH = 3

/** 卒業した年（通算年）と見たい年から年齢を出す */
export function ageAt(graduatedYear: number, year: number): number {
  return GRADUATION_AGE + (year - graduatedYear)
}

/**
 * 経歴の1行。**所属が変わった出来事だけ**を積む。
 *
 * 「大学へ進み、4年後に指名され、7年目に移籍し、11年目に海外へ」
 * という道のりが、名鑑の数字からは一切読めなかった。
 * プロの成績（`proSeasons`）は毎年増えるが、
 * どこで何が起きたのかはそこには残らない。
 */
export type CareerEntry = {
  /** 通算年 */
  year: number
  /** そのときの年齢 */
  age: number
  status: CareerStatus
  /** 所属。無所属なら null */
  team: string | null
  /** そのときの実力（進んだ先の物差し） */
  ability: number
  /** 一言 */
  text: string
}

/** 卒業時に決まる進路 */
export type CareerPath =
  | 'pro' // プロ入り
  | 'college' // 大学進学
  | 'corporate' // 社会人野球
  | 'none' // 野球を続けない

export const CAREER_PATH_LABELS: Record<CareerPath, string> = {
  pro: 'プロ入り',
  college: '大学進学',
  corporate: '社会人',
  none: '競技引退',
}

/** 現在の状態 */
export type CareerStatus =
  | 'college' // 大学在学中
  | 'pro' // プロで現役
  | 'mlb' // 海外リーグへ移籍
  | 'corporate' // 社会人で現役
  | 'released' // 戦力外
  | 'retired' // 引退

export const CAREER_STATUS_LABELS: Record<CareerStatus, string> = {
  college: '大学在学',
  pro: 'プロ現役',
  mlb: '海外挑戦',
  corporate: '社会人',
  released: '戦力外',
  retired: '引退',
}

/** プロでの1年ぶんの成績 */
export type ProSeason = {
  /** ゲーム内の通算年 */
  year: number
  team: string
  /** 海外リーグでの成績か */
  overseas: boolean
  /**
   * そのシーズンを迎えた時点の実力（プロの物差し）。
   * 年ごとに残しておかないと、**現在値しか見えず推移が描けない**。
   */
  ability: number
  games: number
  /** 野手成績。投手なら null */
  batting: {
    atBats: number
    hits: number
    homeruns: number
    rbi: number
    /** 打率（小数第3位まで） */
    average: number
    /** 二塁打 */
    doubles: number
    /** 盗塁 */
    steals: number
    /** 四球 */
    walks: number
  } | null
  /** 投手成績。野手なら null */
  pitching: {
    wins: number
    losses: number
    strikeouts: number
    /** 防御率 */
    era: number
    /** 投球回 */
    innings: number
    /** セーブ */
    saves: number
  } | null
  /**
   * そのシーズンに獲ったタイトル。無ければ空。
   * リーグ全体を回してはいないので、**絶対的な水準**で判定している。
   */
  titles: string[]
}

/** 卒業生1人ぶんの記録。OB名鑑に載る */
export type Alumnus = {
  id: string
  name: string
  isPitcher: boolean
  position: Position
  /** 卒業した年（通算年） */
  year: number
  /** 卒業時の総合評価 */
  rating: number
  /** 卒業時に持っていた特殊能力 */
  skills: string[]
  /**
   * 高校3年間の通算成績。
   * 歴代ベストナインと通算記録は、在校生とこれを合わせて出す。
   */
  highSchool: import('@/core/player/careerStats').CareerStats

  path: CareerPath
  status: CareerStatus
  /** 現在の実力。プロ入り後も伸び縮みする */
  ability: number
  /** 所属。無所属なら null */
  team: string | null
  /** 大学に在学した年数（1〜4） */
  collegeYears: number
  /** プロでの年度別成績（古い順） */
  proSeasons: ProSeason[]
  /** 引退・戦力外などの一言 */
  note: string | null
  /**
   * 卒業時の各能力。**総合だけでは何が武器だったのか分からない。**
   * 古いセーブには無いので省略可。
   */
  finalAbilities?: AbilitySnapshot
  /**
   * 所属が変わった出来事の年表（古い順）。
   * 古いセーブには無いので省略可。
   */
  careerLog?: CareerEntry[]
}

/** プロで通算成績を集計する */
export function careerTotals(alumnus: Alumnus): {
  years: number
  games: number
  hits: number
  homeruns: number
  rbi: number
  average: number
  wins: number
  losses: number
  strikeouts: number
  era: number
} {
  let games = 0
  let atBats = 0
  let hits = 0
  let homeruns = 0
  let rbi = 0
  let wins = 0
  let losses = 0
  let strikeouts = 0
  let eraSum = 0
  let eraCount = 0

  for (const season of alumnus.proSeasons) {
    games += season.games
    if (season.batting) {
      atBats += season.batting.atBats
      hits += season.batting.hits
      homeruns += season.batting.homeruns
      rbi += season.batting.rbi
    }
    if (season.pitching) {
      wins += season.pitching.wins
      losses += season.pitching.losses
      strikeouts += season.pitching.strikeouts
      eraSum += season.pitching.era
      eraCount += 1
    }
  }

  return {
    years: alumnus.proSeasons.length,
    games,
    hits,
    homeruns,
    rbi,
    average: atBats > 0 ? Math.round((hits / atBats) * 1000) / 1000 : 0,
    wins,
    losses,
    strikeouts,
    era: eraCount > 0 ? Math.round((eraSum / eraCount) * 100) / 100 : 0,
  }
}

/**
 * OB名鑑に載るか。
 *
 * **プロに届いた選手だけを載せる。** 卒業生を全員並べていた頃は、
 * 高校で競技を終えた選手や社会人へ進んだ選手で埋まってしまい、
 * 「うちからプロが出た」という出来事が名鑑の中に埋もれていた。
 *
 * 大学経由でプロに入った選手もここに現れる。
 * 在学中はまだ載らず、**指名された年に名前が出る**。
 */
export function isInHallOfFame(alumnus: Alumnus): boolean {
  return alumnus.status === 'pro' || alumnus.status === 'mlb' || alumnus.proSeasons.length > 0
}

/**
 * まだプロを目指している途中か（大学在学中・社会人で現役）。
 * OB名鑑には出ないが、いずれ載るかもしれない選手たち。
 */
export function isCareerPending(alumnus: Alumnus): boolean {
  if (isInHallOfFame(alumnus)) return false
  return alumnus.status === 'college' || alumnus.status === 'corporate'
}

/** まだ進路が動く状態か */
export function isCareerActive(alumnus: Alumnus): boolean {
  return (
    alumnus.status === 'college' ||
    alumnus.status === 'pro' ||
    alumnus.status === 'mlb' ||
    alumnus.status === 'corporate'
  )
}
