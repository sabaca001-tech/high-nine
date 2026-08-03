/**
 * 所在地（地区）の定義。
 *
 * 夏の大会は地区ごとに1校が全国へ進むため、**参加校数がそのまま回戦数になる**。
 * 参加校の多い地区は勝ち抜くのに8回戦必要な一方、少ない地区は5回戦で済む。
 * ここが本作の難易度選択にあたる。
 *
 * 校数は2020年代の実際の規模を参考にした**概数**で、ゲームバランス用の値。
 * 正確な統計ではない。
 */

export type RegionId = string

/** 地方。遠征距離を測るためのまとまり */
export type AreaId =
  | 'hokkaido'
  | 'tohoku'
  | 'kanto'
  | 'hokushinetsu'
  | 'tokai'
  | 'kinki'
  | 'chugoku'
  | 'shikoku'
  | 'kyushu'
  | 'okinawa'

export type Region = {
  id: RegionId
  name: string
  /** 夏の大会の参加校数（概数） */
  schools: number
  /** 所属する地方。遠征費の計算に使う */
  area: AreaId
}

/** 北海道と東京は南北・東西に分かれるため、地区としては49になる */
export const REGIONS: Region[] = [
  { id: 'kita-hokkaido', name: '北北海道', schools: 100, area: 'hokkaido' },
  { id: 'minami-hokkaido', name: '南北海道', schools: 100, area: 'hokkaido' },
  { id: 'aomori', name: '青森', schools: 60, area: 'tohoku' },
  { id: 'iwate', name: '岩手', schools: 60, area: 'tohoku' },
  { id: 'akita', name: '秋田', schools: 43, area: 'tohoku' },
  { id: 'yamagata', name: '山形', schools: 44, area: 'tohoku' },
  { id: 'miyagi', name: '宮城', schools: 66, area: 'tohoku' },
  { id: 'fukushima', name: '福島', schools: 74, area: 'tohoku' },
  { id: 'ibaraki', name: '茨城', schools: 94, area: 'kanto' },
  { id: 'tochigi', name: '栃木', schools: 58, area: 'kanto' },
  { id: 'gunma', name: '群馬', schools: 62, area: 'kanto' },
  { id: 'saitama', name: '埼玉', schools: 154, area: 'kanto' },
  { id: 'chiba', name: '千葉', schools: 160, area: 'kanto' },
  { id: 'higashi-tokyo', name: '東東京', schools: 130, area: 'kanto' },
  { id: 'nishi-tokyo', name: '西東京', schools: 130, area: 'kanto' },
  { id: 'kanagawa', name: '神奈川', schools: 178, area: 'kanto' },
  { id: 'niigata', name: '新潟', schools: 78, area: 'hokushinetsu' },
  { id: 'toyama', name: '富山', schools: 44, area: 'hokushinetsu' },
  { id: 'ishikawa', name: '石川', schools: 46, area: 'hokushinetsu' },
  { id: 'fukui', name: '福井', schools: 30, area: 'hokushinetsu' },
  { id: 'yamanashi', name: '山梨', schools: 34, area: 'kanto' },
  { id: 'nagano', name: '長野', schools: 79, area: 'hokushinetsu' },
  { id: 'gifu', name: '岐阜', schools: 61, area: 'tokai' },
  { id: 'shizuoka', name: '静岡', schools: 106, area: 'tokai' },
  { id: 'aichi', name: '愛知', schools: 175, area: 'tokai' },
  { id: 'mie', name: '三重', schools: 56, area: 'tokai' },
  { id: 'shiga', name: '滋賀', schools: 47, area: 'kinki' },
  { id: 'kyoto', name: '京都', schools: 74, area: 'kinki' },
  { id: 'osaka', name: '大阪', schools: 170, area: 'kinki' },
  { id: 'hyogo', name: '兵庫', schools: 155, area: 'kinki' },
  { id: 'nara', name: '奈良', schools: 38, area: 'kinki' },
  { id: 'wakayama', name: '和歌山', schools: 38, area: 'kinki' },
  { id: 'tottori', name: '鳥取', schools: 24, area: 'chugoku' },
  { id: 'shimane', name: '島根', schools: 38, area: 'chugoku' },
  { id: 'okayama', name: '岡山', schools: 56, area: 'chugoku' },
  { id: 'hiroshima', name: '広島', schools: 86, area: 'chugoku' },
  { id: 'yamaguchi', name: '山口', schools: 55, area: 'chugoku' },
  { id: 'tokushima', name: '徳島', schools: 30, area: 'shikoku' },
  { id: 'kagawa', name: '香川', schools: 37, area: 'shikoku' },
  { id: 'ehime', name: '愛媛', schools: 56, area: 'shikoku' },
  { id: 'kochi', name: '高知', schools: 29, area: 'shikoku' },
  { id: 'fukuoka', name: '福岡', schools: 130, area: 'kyushu' },
  { id: 'saga', name: '佐賀', schools: 38, area: 'kyushu' },
  { id: 'nagasaki', name: '長崎', schools: 53, area: 'kyushu' },
  { id: 'kumamoto', name: '熊本', schools: 62, area: 'kyushu' },
  { id: 'oita', name: '大分', schools: 43, area: 'kyushu' },
  { id: 'miyazaki', name: '宮崎', schools: 48, area: 'kyushu' },
  { id: 'kagoshima', name: '鹿児島', schools: 68, area: 'kyushu' },
  { id: 'okinawa', name: '沖縄', schools: 60, area: 'okinawa' },
]

/**
 * 地方を「北から南へ」1本の軸に並べたときの位置。
 *
 * 日本列島は細長いので、緯度経度を持たなくても
 * この1次元の並びだけで移動距離のおおよその大小は再現できる。
 * 単位はおよそ100km。沖縄だけは海を隔てて大きく離す。
 */
const AREA_POSITION: Record<AreaId, number> = {
  hokkaido: 0,
  tohoku: 6,
  kanto: 11,
  hokushinetsu: 11,
  tokai: 14,
  kinki: 17,
  chugoku: 21,
  shikoku: 20,
  kyushu: 25,
  // 沖縄だけは必ず飛行機になるので、実距離よりも大きく離してある
  okinawa: 36,
}

/**
 * 地方をまたぐ移動の最小距離。
 * 中国と四国のように軸の上ではほぼ同じ位置でも、
 * 海を渡るぶん「近所」にはならないため下限を設ける。
 */
const MIN_CROSS_AREA_DISTANCE = 3

/**
 * 2つの地区の間の移動距離。同じ地方なら0（＝地元扱い）。
 * 遠征費はこの値に比例する。
 */
export function travelDistance(from: Region, to: Region): number {
  if (from.area === to.area) return 0
  const diff = Math.abs(AREA_POSITION[from.area] - AREA_POSITION[to.area])
  return Math.max(MIN_CROSS_AREA_DISTANCE, diff)
}

/** 全国大会の出場校数（各地区の代表） */
export const NATIONAL_ENTRANTS = REGIONS.length

/** 初期選択の地区 */
export const DEFAULT_REGION_ID = 'kanagawa'

const REGION_BY_ID = new Map(REGIONS.map((region) => [region.id, region]))

export function findRegion(id: RegionId): Region {
  return REGION_BY_ID.get(id) ?? REGIONS[0]
}

/**
 * 参加校数から必要な勝ち数（回戦数）を求める。
 * トーナメントなので log2。178校なら8回戦、24校なら5回戦。
 */
export function roundsFor(entrants: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, entrants))))
}

/**
 * 地区の激戦度。参加校が多いほど強豪が多いとみなす。
 * 相手の強さに加算される（神奈川で +4、鳥取で -4 程度）。
 */
export function regionStrength(region: Region): number {
  return Math.round((Math.log2(region.schools) - 6) * 3)
}
