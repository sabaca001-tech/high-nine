/**
 * グラウンドレベルとマネージャー。
 *
 * どちらも部費で買う**恒久的な強化**で、消耗品しか無かった
 * ショップに長期の使い道を与える。
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

/** 最大まで整備したときの練習効率 */
const GROUND_MAX_MULTIPLIER = 1.6

/** 1段階上げるのにかかる基本額。段階が上がるほど高くなる */
const UPGRADE_BASE_COST = 3000

/** 段階を 1〜99 に丸める */
export function clampGroundLevel(level: number): number {
  return Math.min(GROUND_LEVEL_MAX, Math.max(GROUND_LEVEL_MIN, Math.round(level)))
}

/**
 * 練習効率の倍率。
 *
 * 平方根にしているので**序盤ほど1段階の効きが大きい**。
 * 直線にすると、低い段階での整備がほとんど体感できなくなる。
 * Lv1=1.00 / Lv25=1.30 / Lv50=1.43 / Lv99=1.60
 */
export function groundMultiplier(level: number): number {
  const ratio = (clampGroundLevel(level) - GROUND_LEVEL_MIN) / (GROUND_LEVEL_MAX - GROUND_LEVEL_MIN)
  return 1 + (GROUND_MAX_MULTIPLIER - 1) * Math.sqrt(ratio)
}

/** 次の1段階にかかる部費。最大なら null */
export function groundUpgradeCost(level: number): number | null {
  const current = clampGroundLevel(level)
  if (current >= GROUND_LEVEL_MAX) return null
  return UPGRADE_BASE_COST * current
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
// ── マネージャー ──────────────────────────────

export type ManagerId = 'recorder' | 'trainer' | 'nutritionist' | 'analyst' | 'chief'

export type Manager = {
  id: ManagerId
  name: string
  description: string
  hireCost: number
}

/**
 * マネージャーは1人だけ雇える。
 * 雇い直すと前のマネージャーは退任する。
 */
export const MANAGERS: Manager[] = [
  {
    id: 'recorder',
    name: '記録係',
    description: '練習の成長量が8%上がる',
    hireCost: 180_000,
  },
  {
    id: 'trainer',
    name: 'トレーナー',
    description: '月が変わるときの体力回復が15増える',
    hireCost: 180_000,
  },
  {
    id: 'nutritionist',
    name: '栄養士',
    description: '練習での体力消費が25%減る',
    hireCost: 200_000,
  },
  {
    id: 'analyst',
    name: '分析担当',
    description: '試合での守備力が上がる',
    hireCost: 220_000,
  },
  {
    id: 'chief',
    name: '主務',
    description: '毎月の部費が30%増える',
    hireCost: 250_000,
  },
]

const MANAGER_BY_ID = new Map(MANAGERS.map((manager) => [manager.id, manager]))

export function findManager(id: string | null): Manager | undefined {
  return id ? MANAGER_BY_ID.get(id as ManagerId) : undefined
}

/** マネージャーによる練習成長の倍率 */
export function managerGrowthBonus(managerId: string | null): number {
  return managerId === 'recorder' ? 1.08 : 1
}

/** マネージャーによる体力消費の倍率 */
export function managerConditionCost(managerId: string | null): number {
  return managerId === 'nutritionist' ? 0.75 : 1
}

/** マネージャーによる月替わりの体力回復の上乗せ */
export function managerRecovery(managerId: string | null): number {
  return managerId === 'trainer' ? 15 : 0
}

/** マネージャーによる守備力の上乗せ */
export function managerDefenseBonus(managerId: string | null): number {
  return managerId === 'analyst' ? 8 : 0
}

/** マネージャーによる部費の倍率 */
export function managerFundsRate(managerId: string | null): number {
  return managerId === 'chief' ? 1.3 : 1
}
