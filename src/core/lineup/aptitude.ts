/** ポジション適性の生成と評価 */

import type { Rng } from '@/core/rng/random'
import { APTITUDE_MAX, APTITUDE_MULTIPLIER } from '@/core/types/player'
import type { Aptitude, Player, Position } from '@/core/types/player'

export const ALL_POSITIONS: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

/** 守備位置のグループ。近いポジションほど適性が付きやすい */
const INFIELD: Position[] = ['1B', '2B', '3B', 'SS']
const OUTFIELD: Position[] = ['LF', 'CF', 'RF']

/**
 * メインポジションから全ポジションの適性を作る。
 * 近い位置は守れるが、投手・捕手は専門職なので他の選手にはほぼ適性が付かない。
 *
 * **本職は必ず5**。そこから離れるほど段が下がり、0なら守れない。
 */
export function createAptitudes(rng: Rng, main: Position): Record<Position, Aptitude> {
  const result = {} as Record<Position, Aptitude>

  for (const position of ALL_POSITIONS) {
    result[position] = rollAptitude(rng, main, position)
  }
  result[main] = APTITUDE_MAX
  return result
}

function rollAptitude(rng: Rng, main: Position, target: Position): Aptitude {
  if (main === target) return APTITUDE_MAX

  /*
   * **本職以外はそう守れない。**
   * 隣の位置がほぼ全員3段以上だった頃は、誰をどこに置いても大差なく、
   * コンバートで適性を上げる意味も、守備位置を気にする意味も薄かった。
   * 「守れる」と言える3段は、**同じ系統の一部と一塁**だけに絞る。
   */

  // 投手は専門職。投手以外が投げるのも、投手が守るのも適性は低い
  if (target === 'P' || main === 'P') return rng.pick<Aptitude>([1, 0, 0, 0])

  // 捕手も専門職
  if (target === 'C') return rng.pick<Aptitude>([1, 0, 0])
  if (main === 'C') {
    // 捕手は一塁くらいなら守れる
    return target === '1B' ? rng.pick<Aptitude>([3, 2, 2]) : rng.pick<Aptitude>([1, 1, 0])
  }

  // 一塁は誰でもある程度守れる
  if (target === '1B') return rng.pick<Aptitude>([3, 3, 2, 2])

  const sameGroup =
    (INFIELD.includes(main) && INFIELD.includes(target)) ||
    (OUTFIELD.includes(main) && OUTFIELD.includes(target))

  if (sameGroup) return rng.pick<Aptitude>([4, 3, 2, 2, 1])
  return rng.pick<Aptitude>([1, 1, 0, 0])
}

/**
 * 守備の重要度。
 *
 * 打球が飛ぶ頻度と、そこを守れる選手の代わりの利かなさで決まる。
 * **二遊間 ＞ 捕手 ＞ 中堅 ＞ 三塁 ＞ 右翼 ＞ 一塁 ＞ 左翼 ＞ 投手** の順。
 * ここが下手な選手を置いたときの損失の大きさをそのまま表す。
 *
 * チーム守備力の加重平均と、自動編成で埋める順番の両方に使う。
 * 均等平均にしていた頃は、遊撃に守れない選手を置いても
 * 一塁の名手が居れば帳消しになってしまい、適性を気にする理由が無かった。
 */
export const POSITION_WEIGHT: Record<Position, number> = {
  SS: 1.0,
  '2B': 0.92,
  C: 0.85,
  CF: 0.78,
  '3B': 0.62,
  RF: 0.5,
  '1B': 0.36,
  LF: 0.3,
  // 投手の守備（フィールディング）は勝敗にほとんど効かない
  P: 0.2,
}

/**
 * その選手をその位置で起用したときの守備力。
 *
 * **守備の能力（`fielding`）がそのまま出る。**
 * 本職（5段）なら守備能力どおり、3段の位置ならその6割。
 * 捕球や肩を混ぜていた頃は、**能力表の「守備 C69」と
 * 守備適性の図に出る本職の数字（64）が食い違っていた**。
 * 同じ「守備」という言葉で2つの数字が出るなら、どちらかが嘘になる。
 *
 * 捕球と肩は守備位置ごとの補正には使わない
 * （捕球は捕手の盗塁阻止、肩は送球と総合に効く）。
 */
export function defenseScore(player: Player, position: Position): number {
  return player.batting.fielding * APTITUDE_MULTIPLIER[player.aptitudes[position]]
}

/**
 * 「守れない位置に置いた」度合い。0なら全員が本職相応。
 *
 * C（無難に守れる下限）より下の適性ぶんを、重要度で重み付けして合計する。
 * 遊撃にG適性の選手を置くと大きく、左翼に置いても小さい。
 * この値が失策率とヒット率に効く。
 */
export function misplacementPenalty(player: Player, position: Position): number {
  const gap = PLAYABLE_APTITUDE - player.aptitudes[position]
  if (gap <= 0) return 0
  return gap * POSITION_WEIGHT[position]
}

/** ここまでは無難に守れる。これを下回ると失策とヒットが増える */
export const PLAYABLE_APTITUDE: Aptitude = 3

/** 適性の見た目の並び順（5が最良） */
export const APTITUDE_ORDER: Aptitude[] = [5, 4, 3, 2, 1, 0]

/** 適性が「守れる」水準か。UI の色分けに使う */
export function isPlayable(aptitude: Aptitude): boolean {
  return aptitude >= PLAYABLE_APTITUDE
}
