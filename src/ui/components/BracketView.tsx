import { useState } from 'react'
import type { Bracket, BracketTeam } from '@/core/tournament/bracket'
import { blocksOf, matchesAt, survivorsAt } from '@/core/tournament/bracket'
import type { BracketBlock } from '@/core/tournament/bracket'
import { roundName } from '@/core/types/tournament'
import { teamPointsFromRating, teamPointsLabel } from '@/core/player/rating'
import { opponentRating } from '@/core/season/matchReputation'
import { lineupPointsOf } from '@/core/rival/rivalRoster'
import { prestigeLabel } from '@/core/rival/rivals'
import type { RivalSchool } from '@/core/rival/rivals'
import styles from './BracketView.module.css'

/**
 * トーナメント表。
 *
 * **178校の対戦カードを全部並べても読めない。**
 * 375px の画面で意味があるのは「誰が残っているか」と
 * 「次の相手はどこを勝ち上がってきたか」の2つ。
 *
 * そこで、試合数が少ない回戦（ベスト16以降）は**対戦カードをそのまま**出し、
 * それより前の回戦は**勝ち残った学校の一覧**にしている。
 * 一覧は強い順に並べ、多いときは上位だけを出して残りは校数で示す。
 */
export function BracketView({
  bracket,
  totalRounds,
  currentRound,
  schools,
  year,
  progress,
}: {
  bracket: Bracket
  totalRounds: number
  currentRound: number
  /** 実在の学校。スタメンの平均を実測するのに使う */
  schools: RivalSchool[]
  year: number
  /** 年度の進み具合（0〜1）。他校の部員は年度が進むほど伸びている */
  progress?: number
}) {
  /**
   * 0は「山（ブロック）」の表示。
   * **開幕の時点では山から見せる。** 組み合わせが決まった直後にいちばん
   * 知りたいのは「優勝候補がどの山にいるか」なので、1回戦のカードより先に出す。
   */
  const [round, setRound] = useState(currentRound <= 1 ? BLOCK_TAB : currentRound)
  if (bracket.slots.length === 0) return null

  const shown = Math.min(round, totalRounds)
  const matches = matchesAt(bracket, shown)
  const decided = bracket.winners.length >= shown

  /**
   * その相手のスタメンの評価点。
   * **実在の学校なら実測する。** 甲子園はその大会限りの代表校も混ざるので、
   * 学校が見つからないときだけ戦力から見込みを立てる。
   */
  const rate = (team: BracketTeam): number => {
    const school = team.schoolId ? schools.find((item) => item.id === team.schoolId) : undefined
    return school
      ? lineupPointsOf(school, year, progress)
      : teamPointsFromRating(opponentRating(team.strength))
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.tabs}>
        {/*
          **組み合わせが決まった時点でいちばん知りたいのは「どの山にいるか」。**
          回戦ごとの対戦カードだけだと、優勝候補がどこに固まっているのかが読めない
        */}
        <button
          type="button"
          className={round === BLOCK_TAB ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setRound(BLOCK_TAB)}
        >
          山
        </button>
        {Array.from({ length: totalRounds }, (_, index) => {
          const value = index + 1
          const reached = bracket.winners.length >= value - 1
          return (
            <button
              key={value}
              type="button"
              disabled={!reached}
              className={value === shown ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setRound(value)}
            >
              {roundName(value, totalRounds)}
            </button>
          )
        })}
      </div>

      {round === BLOCK_TAB ? (
        <BlockList bracket={bracket} schools={schools} rate={rate} />
      ) : matches.length <= CARD_LIMIT ? (
        <div className={styles.cards}>
          {matches.map((match, index) => (
            <div key={index} className={styles.card}>
              <Side
                team={match.left}
                winner={decided && match.winner === match.left}
                rate={rate}
              />
              <span className={styles.vs}>–</span>
              <Side
                team={match.right}
                winner={decided && match.winner === match.right}
                rate={rate}
              />
            </div>
          ))}
        </div>
      ) : (
        <SurvivorList bracket={bracket} round={shown} rate={rate} />
      )}
    </section>
  )
}

/** 「山」のタブを表す値。回戦は1から数える */
const BLOCK_TAB = 0

/** 対戦カードで並べる上限。これを超える回戦は勝ち残り一覧にする */
const CARD_LIMIT = 8

/** ひとつの山に名前を出す校数。全部出すと1山40校で読めない */
const BLOCK_NAME_LIMIT = 5

/**
 * 山ごとの顔ぶれ。
 *
 * **格の高い順に出す。** 戦力（その年の代）だけで並べると、
 * 「優勝候補が固まっている山」なのか「たまたま今年強い代が多い山」なのかが読めない。
 * 名門・強豪の呼び名は戦績から決まる（`prestigeLabel`）。
 */
function BlockList({
  bracket,
  schools,
  rate,
}: {
  bracket: Bracket
  schools: RivalSchool[]
  rate: (team: BracketTeam) => number
}) {
  const blocks = blocksOf(bracket)
  const gradeOf = (team: BracketTeam): string | null => {
    const school = team.schoolId ? schools.find((item) => item.id === team.schoolId) : undefined
    return school ? prestigeLabel(school) : null
  }

  return (
    <div className={styles.blocks}>
      {blocks.map((block: BracketBlock) => {
        const ranked = [...block.teams]
          .map((team) => ({ team, grade: gradeOf(team), rating: rate(team) }))
          .sort((a, b) => gradeWeight(b.grade) - gradeWeight(a.grade) || b.rating - a.rating)
        const shown = ranked.slice(0, BLOCK_NAME_LIMIT)
        const rest = ranked.length - shown.length

        return (
          <div
            key={block.name}
            className={block.ours ? `${styles.block} ${styles.blockOurs}` : styles.block}
          >
            <p className={styles.blockHead}>
              <span className={styles.blockName}>{block.name}山</span>
              <span className={styles.blockCount}>{block.teams.length}校</span>
              {block.ours && <span className={styles.blockHere}>自校</span>}
            </p>
            <div className={styles.chips}>
              {shown.map(({ team, grade, rating }, index) => (
                <span
                  key={`${team.name}-${index}`}
                  className={team.ours ? `${styles.chip} ${styles.chipOurs}` : styles.chip}
                >
                  {grade && <span className={styles.grade}>{grade}</span>}
                  {team.name}
                  <span className={styles.strength}>{teamPointsLabel(rating)}</span>
                </span>
              ))}
              {rest > 0 && <span className={styles.more}>他{rest}校</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 並べ替えのための格の重み */
function gradeWeight(grade: string | null): number {
  if (grade === '名門') return 3
  if (grade === '強豪') return 2
  if (grade === '有力') return 1
  return 0
}

/** 一覧に名前を出す校数。これを超えたぶんは「他◯校」でまとめる */
const NAME_LIMIT = 24

function Side({
  team,
  winner,
  rate,
}: {
  team: BracketTeam | null
  winner: boolean
  rate: (team: BracketTeam) => number
}) {
  const classNames = [styles.side]
  if (winner) classNames.push(styles.winner)
  if (team?.ours) classNames.push(styles.ours)

  return (
    <span className={classNames.join(' ')}>
      {team ? team.name : '不戦勝'}
      {team && <span className={styles.strength}>{teamPointsLabel(rate(team))}</span>}
    </span>
  )
}

function SurvivorList({
  bracket,
  round,
  rate,
}: {
  bracket: Bracket
  round: number
  rate: (team: BracketTeam) => number
}) {
  const survivors = [...survivorsAt(bracket, round)].sort((a, b) => b.strength - a.strength)
  const shown = survivors.slice(0, NAME_LIMIT)
  const rest = survivors.length - shown.length

  return (
    <>
      <p className={styles.count}>勝ち残り {survivors.length}校</p>
      <div className={styles.chips}>
        {shown.map((team, index) => (
          <span
            key={`${team.name}-${index}`}
            className={team.ours ? `${styles.chip} ${styles.chipOurs}` : styles.chip}
          >
            {team.name}
            <span className={styles.strength}>{teamPointsLabel(rate(team))}</span>
          </span>
        ))}
        {rest > 0 && <span className={styles.more}>他{rest}校</span>}
      </div>
      {/* 自校が上位に入らないこともあるので、居場所は必ず示す */}
      {!shown.some((team) => team.ours) && survivors.some((team) => team.ours) && (
        <p className={styles.note}>自校もこの回戦に残っている</p>
      )}
    </>
  )
}


