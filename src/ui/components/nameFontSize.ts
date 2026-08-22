/**
 * 名前に使う文字サイズ。
 *
 * **切り詰めるより、小さく出すほうが情報が残る。**
 * 選手カードは375px幅で2列に並ぶので名前に割ける幅は約90px、
 * スタメンの行（`NamePlate`）も周りの数字を詰めた残りが同じくらいしかない。
 * 「長谷川 龍之介」や「カルロス メンドーサ」のような長い姓名が
 * **「カルロス …」と切れて誰か分からなくなる**ので、文字数に応じて縮める。
 *
 * **全体の長さと、姓・名それぞれの長さの両方を見る。**
 * 合計だけで決めていた頃は、「メンドーサ」のような
 * 長いカタカナの塊が入る名前で片方が省略記号になっていた
 * （合計が同じでも 3+3 と 1+5 では、詰まり方が違う）。
 * 逆に**3文字までしか無い名前は縮めない**ので、
 * 漢字の名前の見え方はこれまでと変わらない。
 */
export function nameFontSize(name: string): string {
  const [family, given] = splitName(name)
  const letters = family.length + given.length
  const longest = Math.max(family.length, given.length)

  return smaller(sizeForTotal(letters), sizeForPart(longest))
}

/** 合計の文字数で決まる大きさ */
function sizeForTotal(letters: number): number {
  if (letters >= 10) return 9
  if (letters >= 8) return 10
  if (letters >= 6) return 11
  if (letters >= 5) return 12
  return BASE_NAME_SIZE
}

/** 姓か名のうち長いほうで決まる大きさ。**4文字から縮め始める** */
function sizeForPart(longest: number): number {
  if (longest >= 6) return 9
  if (longest >= 5) return 10
  if (longest >= 4) return 11
  return BASE_NAME_SIZE
}

/** 縮めない場合の大きさ（`--fs-sm`）。漢字の姓名はここに収まる */
const BASE_NAME_SIZE = 13

function smaller(a: number, b: number): string {
  const size = Math.min(a, b)
  return size >= BASE_NAME_SIZE ? 'var(--fs-sm)' : `${size}px`
}

/** 「佐々木 龍之介」を姓と名に分ける。空白で区切って生成している */
export function splitName(name: string): [string, string] {
  const at = name.indexOf(' ')
  return at < 0 ? [name, ''] : [name.slice(0, at), name.slice(at + 1)]
}

/**
 * 姓と名を**2行に分けて出すか**。
 *
 * スタメンの行は、打順・評価点・学年・守備位置と並ぶので
 * 名前に残る幅が**76pxしかない**。
 * 「アレハンドロ ラミレス」は1行だと9pxまで縮めても92px要るので入らず、
 * 入る大きさ（7px）まで落とすと今度は読めない。
 *
 * **2行にすれば、長いほうの塊だけが幅を決める**ので
 * 「アレハンドロ」54px（9px×6）で収まる。
 * 短い名前まで2行にすると行の見え方が変わるので、入らないものだけ折る。
 */
export function shouldStackName(name: string): boolean {
  const [family, given] = splitName(name)
  return given.length > 0 && family.length + given.length >= STACK_LETTERS
}

/** ここから2行にする。「長谷川 龍之介」（6文字）は1行のまま */
const STACK_LETTERS = 8
