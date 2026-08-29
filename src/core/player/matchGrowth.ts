/**
 * 試合での成績による能力の変動。
 *
 * 練習だけで伸びると、試合は「結果を見るだけ」の場面になってしまう。
 * **打った・抑えた選手はその場で伸び、打てなかった選手は落ちる。**
 * 誰を試合に出すかという判断に育成上の意味を持たせる。
 *
 * **引き金は勝敗ではなく、その選手自身の成績。**
 * 以前は勝った試合に上乗せ（1.2倍）していたが、それだと
 * 4タコでも勝ちチームに居れば伸びるし、好投しても味方が打てなければ損をする。
 * チームの勝敗はその選手の出来ではないので、評価に混ぜない。
 *
 * 練習と違って**回数が少ない**（1年に十数試合）ので、
 * 1試合の振れ幅は練習1回より大きくてよい。
 *
 * **日々の練習より、試合のほうが選手を変える。**
 * 伸びの土台を練習に置いていた頃は、大会で勝ち上がっても育成上の見返りが薄く、
 * 初戦で負けた年と優勝した年で3年後の姿がほとんど変わらなかった。
 * 練習（`CARD_GROWTH_SCALE`）を下げて、そのぶんを試合に寄せてある。
 *
 * **その日の仕事を果たしたなら、能力は下がらない。**
 * 投げて抑えた日に打席が凡打続きでも、打撃を落とさない
 * （9回無失点で能力が下がる、という結果になっていた）。
 *
 * **伸びにくさは練習と同じ**（`growthChanceFor`）。
 * 見ていなかった頃は、Aの能力もGの能力も同じように +1 されていて、
 * 練習では遠いはずのA以上が試合だけで積み上がっていた。
 *
 * **投げた結果は投手能力、打った結果は打撃能力。**
 * 1試合の出来をひとつの点数にまとめていた頃は、
 * 完封した投手のミートが伸びることがあった。
 * 何をして得た点数なのかが分からなくなるので、最初から分けて数える。
 */

import type { Rng } from '@/core/rng/random'
import type { BattingLine, PitchingLine } from '@/core/types/match'
import type { AbilityChange, GrowableKey, Player } from '@/core/types/player'
import { growthChanceFor, raiseAbility } from './growth'

/**
 * 打撃の点数。
 * 出塁と長打を評価し、**凡打と三振で差し引く**。
 * 4打数0安打2三振なら -2.1 で、はっきりマイナスになる。
 */
const HIT_POINT = 1
const EXTRA_BASE_POINT = 1
const HOMERUN_POINT = 2
const RBI_POINT = 0.6
const STEAL_POINT = 0.8
const WALK_POINT = 0.3
/** 凡打（打数 − 安打）。三振はさらに重ねて引く */
const OUT_MADE_POINT = -0.35
const STRIKEOUT_POINT = -0.25

/** 投球はアウトと奪三振で評価し、失点・被安打・四球で差し引く */
const OUT_POINT = 0.25
const K_POINT = 0.5
const EARNED_RUN_POINT = -0.8
const HIT_ALLOWED_POINT = -0.15
const WALK_ALLOWED_POINT = -0.2

/**
 * これだけの点数で能力が1動く。
 *
 * **3 → 1.25 → 1.0 と下げてきた。** 日々の練習の伸びを落としたぶん、
 * 試合の見返りを厚くしている。
 * 高い能力ほど上がりにくいのは変わらない（`growthChanceFor`）ので、
 * ここを下げて効くのは主に**伸びしろのある選手**のほう。
 */
const POINTS_PER_STEP = 1.0

/**
 * 下がるときは緩やかにする。
 * 1試合の不振で積み上げが崩れると、主力を試合に出すこと自体が怖くなる。
 */
const DECLINE_SCALE = 0.55

/** 1試合で下がる上限。伸びる側より狭くする */
const MAX_DECLINE = 2

/**
 * 大会の試合は同じ内容でも得るものが大きい。
 * 負ければ終わりの一発勝負で、しかも相手が強い。
 * **これは勝敗ではなく舞台の格なので、成績を引き金にする方針と矛盾しない。**
 */
export type MatchStage = 'practice' | 'pref' | 'nationals'

const STAGE_MULTIPLIER: Record<MatchStage, number> = {
  practice: 1,
  pref: 1.8,
  nationals: 2.6,
}

/** 1試合で伸びる上限。大勝したときに一気に完成させないための蓋 */
const STAGE_MAX_STEPS: Record<MatchStage, number> = {
  practice: 3,
  pref: 5,
  nationals: 6,
}

export type MatchGrowthResult = {
  player: Player
  changes: AbilityChange[]
}

/**
 * 1人ぶんの試合後の変動を求める。
 * 出場していなければ（line が両方 undefined なら）何も起きない。
 */
export function applyMatchGrowth(
  rng: Rng,
  player: Player,
  params: {
    batting?: BattingLine
    pitching?: PitchingLine
    /** 練習試合か、大会か。省略すると練習試合 */
    stage?: MatchStage
  },
): MatchGrowthResult {
  if (!params.batting && !params.pitching) return { player, changes: [] }

  const stage = params.stage ?? 'practice'

  let current = player
  const changes: AbilityChange[] = []

  /** 片方ぶん（打撃なら打撃）の点数を、その系統の能力に配る */
  const apply = (points: number, keys: GrowableKey[]) => {
    if (keys.length === 0) return

    const steps =
      points >= 0
        ? Math.min(
            STAGE_MAX_STEPS[stage],
            rollSteps(rng, (points * STAGE_MULTIPLIER[stage]) / POINTS_PER_STEP),
          )
        : -Math.min(MAX_DECLINE, rollSteps(rng, (-points * DECLINE_SCALE) / POINTS_PER_STEP))

    const delta = steps > 0 ? 1 : -1
    for (let i = 0; i < Math.abs(steps); i++) {
      const key = rng.pick(keys)
      // **高い能力ほど上がりにくいのは、練習でも試合でも同じ。**
      // 見ていなかった頃は、AもGも同じように +1 されていた。
      // 落ちるほうは鈍らせない（高い能力ほど落ちにくい、では逆になる）
      if (delta > 0 && !rng.chance(growthChanceFor(current, key))) continue

      const result = raiseAbility(current, key, delta)
      current = result.player
      if (result.change) changes.push(result.change)
    }
  }

  // **投打は別々に数える。** まとめて1つの点数にすると、
  // 完封した投手のミートが伸びたり、猛打賞の日に制球が落ちたりする
  const pitchingPoints = params.pitching
    ? performancePoints(undefined, params.pitching)
    : 0

  if (params.pitching) apply(pitchingPoints, PITCHING_KEYS)

  if (params.batting) {
    const battingPoints = performancePoints(params.batting, undefined)

    /*
     * **投げて結果を出した日は、打席の不振で能力を下げない。**
     *
     * 投打を別々に数えるようにしたとき、
     * 「9回を無失点に抑えたが4打数0安打」という試合で
     * **投球ぶんは伸びるのに打撃ぶんは落ちる**という結果になっていた。
     * その日の仕事を果たした選手の能力が下がるのは、どう見ても変。
     *
     * 逆（打ったが打たれた）は相殺しない。投げて打たれたのは、
     * 打撃で取り返せる類の失敗ではない。
     */
    apply(
      pitchingPoints > 0 && battingPoints < 0 ? 0 : battingPoints,
      battingKeysFor(player, params.batting),
    )
  }

  return { player: current, changes }
}

/**
 * その選手のこの試合の出来。
 * プラスなら伸び、マイナスなら落ちる。
 */
export function performancePoints(batting?: BattingLine, pitching?: PitchingLine): number {
  let points = 0

  if (batting) {
    const extraBases = batting.doubles + batting.triples
    const outsMade = Math.max(0, batting.atBats - batting.hits)
    points += batting.hits * HIT_POINT
    points += extraBases * EXTRA_BASE_POINT
    points += batting.homeruns * HOMERUN_POINT
    points += batting.rbi * RBI_POINT
    points += batting.steals * STEAL_POINT
    points += batting.walks * WALK_POINT
    points += outsMade * OUT_MADE_POINT
    points += batting.strikeouts * STRIKEOUT_POINT
  }

  if (pitching) {
    points += pitching.outs * OUT_POINT
    points += pitching.strikeouts * K_POINT
    points += pitching.earnedRuns * EARNED_RUN_POINT
    points += pitching.hits * HIT_ALLOWED_POINT
    points += pitching.walks * WALK_ALLOWED_POINT
  }

  return points
}

/**
 * 投球の結果で動く能力。
 *
 * **球速は入れない。** 球速は体づくりで上がるもので、
 * 好投した日に速くなるものではない（練習では伸びる）。
 * ここで動くのは、投げながら身につく制球・スタミナ・キレ・ノビ。
 */
const PITCHING_KEYS: GrowableKey[] = ['control', 'stamina', 'sharpness', 'life']

/**
 * 打席と守備の結果で動く能力。
 * 内容に関係なく全能力が動くと「試合に出しただけ」の成長になるので、
 * **何をした試合か**に寄せる。
 *
 * **投手が打った日は、主に投球に返す。**
 * 打った結果がそのまま打撃能力に乗っていた頃は、
 * 「9回を投げ切って打っても3安打」という試合で
 * 伸びたのがミートとパワーだけ、ということが起きていた。
 * 練習で野手のカードを投球に読み替えているのと同じ考え方
 * （振る力は投げる力、走れる下半身は投げ続ける下半身。`PITCHER_REDIRECT`）。
 */
function battingKeysFor(player: Player, batting: BattingLine): GrowableKey[] {
  const keys: GrowableKey[] = ['meet', 'power']

  // 長打を放った選手はパワーが、走った選手は走力が動きやすい
  if (batting.doubles + batting.triples + batting.homeruns > 0) keys.push('power')
  if (batting.steals > 0) keys.push('speed')

  // 出場して守っていれば守備も動く
  keys.push('fielding')

  // 投手なら**投球寄り**にする。打撃も動くが、主役は投げるほう
  return player.pitching ? [...PITCHING_KEYS, ...PITCHING_KEYS, ...keys] : keys
}

/** 端数は確率で切り上げる（1.4 なら 40% で 2、60% で 1） */
function rollSteps(rng: Rng, value: number): number {
  const floor = Math.floor(value)
  return floor + (rng.chance(value - floor) ? 1 : 0)
}
