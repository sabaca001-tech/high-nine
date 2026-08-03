import { useState } from 'react'
import { DEFAULT_REGION_ID, findRegion, REGIONS, roundsFor } from '@/core/types/region'
import type { Region } from '@/core/types/region'
import { formatFunds } from '@/core/shop/funds'
import { tournamentTravel } from '@/core/shop/travel'
import { useGameStore } from '@/state/useGameStore'
import styles from './NewGameScreen.module.css'

/** 全国大会に初戦だけ出たときの遠征費。地区ごとの遠さの目安として見せる */
function travelToNationals(region: Region): number {
  return tournamentTravel('nationals', region, 1).cost
}

/**
 * 新規ゲームの設定画面。
 *
 * 所在地の選択が実質の難易度選択になる。
 * 参加校が多い地区は全国へ行くまでの回戦数が多く、相手も強い。
 * 一方で甲子園から遠い地区は遠征費が重い。
 * 「勝ち抜きやすいが遠い」「勝ち抜きにくいが近い」の2軸で選ばせる。
 */
export function NewGameScreen() {
  const newGame = useGameStore((s) => s.newGame)
  // タイトル画面で選んだ枠に保存する
  const newGameSlot = useGameStore((s) => s.newGameSlot)
  const backToTitle = useGameStore((s) => s.backToTitle)

  const [schoolName, setSchoolName] = useState('さくら第一高校')
  const [regionId, setRegionId] = useState(DEFAULT_REGION_ID)

  const region = findRegion(regionId)
  const rounds = roundsFor(region.schools)

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={backToTitle}>
          ← 戻る
        </button>
        <h1 className={styles.title}>新しい学校</h1>
      </header>

      <div className={styles.body}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="schoolName">
            学校名
          </label>
          <input
            id="schoolName"
            className={styles.input}
            value={schoolName}
            maxLength={16}
            onChange={(event) => setSchoolName(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>所在地</span>
          <p className={styles.hint}>
            参加校が多い地区ほど全国までの道のりが長く、相手も強くなります。
            全国大会の会場から遠い地区は、出場するたびに遠征費がかさみます。
          </p>
        </div>

        <div className={styles.regionList}>
          {REGIONS.map((item) => {
            const itemRounds = roundsFor(item.schools)
            const tone =
              itemRounds >= 8 ? styles.tough : itemRounds >= 6 ? styles.mid : styles.easy
            const travel = travelToNationals(item)

            return (
              <button
                key={item.id}
                type="button"
                className={
                  item.id === regionId ? `${styles.region} ${styles.regionSelected}` : styles.region
                }
                onClick={() => setRegionId(item.id)}
              >
                <span>
                  <span className={styles.regionName}>{item.name}</span>
                  <span className={styles.regionSub}>{item.schools}校</span>
                  <span className={styles.regionSub}>
                    遠征費 {travel === 0 ? 'なし' : `${Math.round(travel / 1000)}k`}
                  </span>
                </span>
                <span className={`${styles.rounds} ${tone}`}>{itemRounds}勝</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.controls}>
        <p className={styles.summary}>
          {region.name}（{region.schools}校）— 全国へ <strong>{rounds}勝</strong> ／ 遠征費{' '}
          <strong>
            {travelToNationals(region) === 0 ? 'なし' : formatFunds(travelToNationals(region))}
          </strong>
        </p>
        <button
          type="button"
          className={styles.startButton}
          onClick={() => newGame(schoolName.trim() || 'さくら第一高校', regionId, newGameSlot)}
        >
          この学校で始める ▶
        </button>
      </div>
    </div>
  )
}
