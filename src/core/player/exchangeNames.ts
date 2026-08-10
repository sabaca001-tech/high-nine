/**
 * 留学生の名前。
 *
 * **実在の選手を想起させない、一般的な名前だけを使う**（CLAUDE.md 5）。
 * 姓24 × 名24 で576通り。同じ学校に2人並ぶことはまず無い。
 *
 * **姓も名も4文字までにしてある。** カタカナは全角なので、
 * 「カルロス メンドーサ」のような長い名前は選手カードの
 * ネームプレート（110pxほど）に収まらず、
 * 「カル…／メンド…」と両方が切れて誰なのか読めなくなった。
 *
 * 出身地は持たせない。国籍まで作り込むと、名前と国の対応が
 * おかしいときに嘘になるし、ゲームの判断には何も効かないため。
 */

import type { Rng } from '@/core/rng/random'

const SURNAMES = [
  'ロペス', 'ソーサ', 'クルス', 'リベラ', 'ゴメス', 'ペーニャ',
  'オルテガ', 'バルガス', 'キンタナ', 'セペダ', 'ナバロ', 'メヒア',
  'ブラウン', 'カーター', 'ハリス', 'ベネット', 'クラーク', 'ミラー',
  'ウォン', 'チェン', 'リン', 'ソン', 'キム', 'ジョ',
]

const GIVEN_NAMES = [
  'カルロス', 'ミゲル', 'パブロ', 'フリオ', 'オスカル', 'エミリオ',
  'ラウル', 'ディエゴ', 'マルコ', 'ペドロ', 'アベル', 'イバン',
  'ケビン', 'デビン', 'ジョン', 'ライアン', 'トマス', 'アーロン',
  'ネイサン', 'ルイス', 'ジュノ', 'ミンス', 'ウェイ', 'ハオ',
]

/** 生成を諦めて重複を許すまでの試行回数 */
const RETRY_LIMIT = 20

/** 留学生の名前を1つ選ぶ。「名 姓」の順で並べる */
export function pickExchangeName(rng: Rng, taken: readonly string[]): string {
  let name = ''
  for (let i = 0; i < RETRY_LIMIT; i++) {
    name = `${rng.pick(GIVEN_NAMES)} ${rng.pick(SURNAMES)}`
    if (!taken.includes(name)) return name
  }
  return name
}

/** 名前が長すぎないことをテストで縛る。カード幅に収まる上限 */
export const EXCHANGE_NAME_MAX = 4
export const EXCHANGE_NAME_PARTS = { surnames: SURNAMES, givenNames: GIVEN_NAMES }
