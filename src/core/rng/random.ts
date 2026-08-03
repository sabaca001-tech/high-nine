/**
 * シード付き擬似乱数（mulberry32）
 *
 * なぜ Math.random() を使わないのか:
 *  - セーブ→リロードで結果が変わってしまうのを防ぐため
 *  - 同じシードなら必ず同じ結果になるので、テストが書けるため
 *  - 不具合の再現・リプレイができるため
 *
 * 乱数の「状態」はただの数値なので、そのまま GameState に入れて JSON 保存できる。
 */

/** 乱数の状態。数値ひとつだけなので JSON にそのまま保存できる */
export type RngState = number

/** 0以上1未満の値を1つ生成し、[値, 次の状態] を返す純粋関数 */
export function nextFloat(state: RngState): [number, RngState] {
  const s = (state + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

/**
 * 乱数カーソル。
 *
 * 純粋関数の [値, 次の状態] を毎回受け渡すのは記述が煩雑になるため、
 * 「1コマンドの処理中だけ使い捨てにする入れ物」を用意する。
 *
 * 使い方:
 *   const rng = createRng(state.rngState)
 *   const n = rng.int(1, 5)
 *   ...
 *   return { ...state, rngState: rng.state }   // 最後に状態を書き戻す
 *
 * 注意: このカーソル自体を GameState に入れてはいけない（保存できないため）。
 *       GameState に持たせるのは rng.state（数値）だけ。
 */
export type Rng = {
  /** 現在の内部状態。処理の最後に GameState へ書き戻す */
  readonly state: RngState
  /** 0以上1未満 */
  float(): number
  /** min以上max以下の整数（両端を含む） */
  int(min: number, max: number): number
  /** 確率 probability(0〜1) で true */
  chance(probability: number): boolean
  /** 配列から1つ選ぶ */
  pick<T>(items: readonly T[]): T
  /** 重み付きで1つ選ぶ */
  weighted<T>(items: readonly { value: T; weight: number }[]): T
  /** シャッフルした新しい配列を返す（元の配列は変更しない） */
  shuffle<T>(items: readonly T[]): T[]
}

/** 乱数カーソルを作る */
export function createRng(seed: RngState): Rng {
  let current = seed

  const float = (): number => {
    const [value, next] = nextFloat(current)
    current = next
    return value
  }

  return {
    get state() {
      return current
    },
    float,
    int(min, max) {
      if (max < min) throw new Error(`int(): min(${min}) が max(${max}) より大きい`)
      return min + Math.floor(float() * (max - min + 1))
    },
    chance(probability) {
      return float() < probability
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick(): 空の配列は選べない')
      return items[Math.floor(float() * items.length)]
    },
    weighted(items) {
      if (items.length === 0) throw new Error('weighted(): 空の配列は選べない')
      const total = items.reduce((sum, item) => sum + item.weight, 0)
      if (total <= 0) throw new Error('weighted(): 重みの合計が0以下')
      let threshold = float() * total
      for (const item of items) {
        threshold -= item.weight
        if (threshold < 0) return item.value
      }
      // 浮動小数の誤差で抜けた場合の保険
      return items[items.length - 1].value
    },
    shuffle(items) {
      const result = [...items]
      // Fisher-Yates
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(float() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
      }
      return result
    },
  }
}

/** 初期シードを作る。ゲーム開始時に一度だけ呼ぶ（ここだけは非決定的でよい） */
export function createSeed(): RngState {
  return Math.floor(Math.random() * 0xffffffff) | 0
}
