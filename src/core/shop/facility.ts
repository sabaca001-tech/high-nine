/**
 * グラウンドレベル。
 *
 * 部費で買う**恒久的な強化**で、消耗品しか無かった
 * ショップに長期の使い道を与える。
 *
 * マネージャーはここにあったが、買うものではなくなったので
 * `src/core/staff/managers.ts` へ移した。
 */

/**
 * グラウンドの整備段階。1〜99。
 *
 * 段階を細かくしたのは、部費の使い道を**終わらない**ものにするため。
 * 5段階だと数年で上限に達し、以降は部費が余るだけだった。
 *
 * 上げっぱなしにはできない。**毎月一定の確率で荒れて下がる**ので、
 * 高い段階を保つには整備を続ける必要がある。
 */
export const GROUND_LEVEL_MIN = 1
export const GROUND_LEVEL_MAX = 99

/**
 * 最大まで整備したときの練習効率。
 *
 * **1.6では整備する意味が薄かった。** 日々の練習そのもの（`CARD_GROWTH_SCALE`）で
 * 伸びていたので、グラウンドは「あれば少し早い」程度の飾りだった。
 * 練習の伸びを下げたぶん、**どこで練習するか**の差を大きく取る。
 */
const GROUND_MAX_MULTIPLIER = 2.1

/**
 * 1段階上げるのにかかる額。**段階によらず一律。**
 *
 * 段階×3,000円にしていた頃は、Lv30で9万円・Lv60で18万円と際限なく上がり、
 * 後半は「部費が貯まったらとりあえず整備」しかできなくなっていた。
 * 一律にすると、**整備するか道具を買うか**の比較がいつでも同じ物差しでできる。
 */
const UPGRADE_COST = 50_000

/** 段階を 1〜99 に丸める */
export function clampGroundLevel(level: number): number {
  return Math.min(GROUND_LEVEL_MAX, Math.max(GROUND_LEVEL_MIN, Math.round(level)))
}

/**
 * 練習効率の倍率。
 *
 * 平方根にしているので**序盤ほど1段階の効きが大きい**。
 * 直線にすると、低い段階での整備がほとんど体感できなくなる。
 * Lv1=1.00 / Lv10=1.35 / Lv25=1.56 / Lv50=1.79 / Lv99=2.10
 */
export function groundMultiplier(level: number): number {
  const ratio = (clampGroundLevel(level) - GROUND_LEVEL_MIN) / (GROUND_LEVEL_MAX - GROUND_LEVEL_MIN)
  return 1 + (GROUND_MAX_MULTIPLIER - 1) * Math.sqrt(ratio)
}

/** 次の1段階にかかる部費。最大なら null */
export function groundUpgradeCost(level: number): number | null {
  if (clampGroundLevel(level) >= GROUND_LEVEL_MAX) return null
  return UPGRADE_COST
}

/** まとめて整備するときの合計額。上限を超えるぶんは数えない */
export function groundUpgradeCostFor(level: number, steps: number): { cost: number; steps: number } {
  let cost = 0
  let done = 0
  let current = clampGroundLevel(level)

  for (let i = 0; i < steps; i++) {
    const next = groundUpgradeCost(current)
    if (next === null) break
    cost += next
    current += 1
    done += 1
  }
  return { cost, steps: done }
}

/**
 * その段階の呼び名。数字だけだと違いが伝わらないので段階ごとに名前を付ける。
 */
export function groundName(level: number): string {
  const value = clampGroundLevel(level)
  if (value >= 90) return '聖地と呼ばれる球場'
  if (value >= 70) return '専用球場'
  if (value >= 50) return '室内練習場つき'
  if (value >= 35) return '打撃ケージ完備'
  if (value >= 20) return '整備された球場'
  if (value >= 10) return '手入れされたグラウンド'
  return '土のグラウンド'
}

/**
 * その月にグラウンドが荒れる確率。
 *
 * 段階が高いほど維持が難しい。上げっぱなしにできないようにするための仕組みで、
 * これが無いと部費が貯まった時点で最大段階に固定されてしまう。
 */
export function groundDecayChance(level: number): number {
  return 0.05 + clampGroundLevel(level) * 0.0025
}

/** 荒れたときに下がる段階数 */
export const GROUND_DECAY_STEPS = 2

/**
 * 評判に見合うグラウンドの段階。**ここまでは学校が面倒を見てくれる。**
 *
 * 強くなって名前が売れると、学校も部にお金をかける。
 * 部費を注ぎ込まないと土のグラウンドのままだった頃は、
 * **評判が上がっても練習環境は何も変わらず**、
 * 強豪校になった実感が「新入生の質」だけしか無かった。
 *
 * 評判20（弱小）でLv5、50でLv12、80でLv20、100でLv25。
 * プレイヤーが部費で上げるのはこの上なので、整備する意味は消えない。
 */
export function groundFloorFor(reputation: number): number {
  return clampGroundLevel(Math.floor(Math.max(0, reputation) * GROUND_REPUTATION_RATE))
}

const GROUND_REPUTATION_RATE = 0.25
