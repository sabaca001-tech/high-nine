/**
 * 他校を保存用に詰め直す。
 *
 * **キー名が中身より重い。** 他校は2800校あり、1校ぶんの JSON は
 * `{"id":"rn1234","name":"稚内第一","regionId":"kita-hokkaido",…}` で
 * およそ115文字。うち半分以上がキー名と `regionId` の文字列で、
 * 実際の値は40文字ほどしかない。
 *
 * 配列に詰め替えるとキー名が丸ごと消え、
 * 県も `REGIONS` の添字（数値）で持てる。**1校115文字 → 42文字**。
 *
 * `GameState` の型は変えない。詰め替えるのは**保存するときだけ**で、
 * 読み込んだ時点で元の形に戻す。
 * core が保存の都合を知らずに済むようにするため（CLAUDE.md 1.1）。
 */

import type { RivalPlayer, RivalRecord, RivalSchool } from '@/core/rival/rivals'
import type { RegionId } from '@/core/types/region'
import { REGIONS } from '@/core/types/region'

/** 詰めた1校。末尾の要素は無ければ切り落とす */
type PackedSchool = unknown[]

/** 保存に使うキー。これがあれば詰められた形 */
export const PACKED_RIVALS_KEY = 'rivalsPacked'

const REGION_IDS: RegionId[] = REGIONS.map((region) => region.id)
const REGION_INDEX = new Map(REGION_IDS.map((id, index) => [id, index]))

/** 他校を詰める */
export function packRivals(schools: RivalSchool[]): PackedSchool[] {
  return schools.map((school) => {
    const row: unknown[] = [
      school.id,
      school.name,
      REGION_INDEX.get(school.regionId) ?? -1,
      school.tradition,
      school.strength,
      school.trend,
      school.rosterSeed,
      school.notable ? 1 : null,
      school.stars?.map(packStar) ?? null,
      school.record ? packRecord(school.record) : null,
    ]

    // 末尾の「無い」ものは切り落とす。
    // **0 は落とさない。** 戦力や入学年は0や負の値も普通に取る
    return trimTail(row, 7)
  })
}

/** 詰めた他校を元の形に戻す */
export function unpackRivals(packed: unknown[]): RivalSchool[] {
  if (!Array.isArray(packed)) return []

  return packed.flatMap((row): RivalSchool[] => {
    if (!Array.isArray(row)) return []

    const stars = row[8]
    const record = row[9]

    return [
      {
        id: String(row[0]),
        name: String(row[1]),
        regionId: REGION_IDS[Number(row[2])] ?? REGION_IDS[0],
        tradition: Number(row[3]),
        strength: Number(row[4]),
        trend: Number(row[5]),
        rosterSeed: Number(row[6]),
        ...(row[7] === 1 ? { notable: true } : {}),
        ...(Array.isArray(stars) ? { stars: stars.map(unpackStar) } : {}),
        ...(Array.isArray(record) ? { record: unpackRecord(record) } : {}),
      },
    ]
  })
}

/** 末尾の null を落とす。`keep` 個は必ず残す */
function trimTail(row: unknown[], keep: number): unknown[] {
  const trimmed = [...row]
  while (trimmed.length > keep && trimmed[trimmed.length - 1] === null) trimmed.pop()
  return trimmed
}

function packStar(star: RivalPlayer): unknown[] {
  return trimTail(
    [
      star.id,
      star.name,
      star.grade,
      star.isPitcher ? 1 : 0,
      star.rating,
      star.enrolledYear ?? null,
      star.skillId ?? null,
      star.scouted ? 1 : null,
    ],
    5,
  )
}

function unpackStar(row: unknown): RivalPlayer {
  const values = Array.isArray(row) ? row : []
  const enrolledYear = values[5]
  const skillId = values[6]

  return {
    id: String(values[0]),
    name: String(values[1]),
    grade: Number(values[2]) as RivalPlayer['grade'],
    isPitcher: values[3] === 1,
    rating: Number(values[4]),
    // **0 や負の年も有効。** ゲーム開始年の3年生は入学年が -1 になる
    ...(typeof enrolledYear === 'number' ? { enrolledYear } : {}),
    ...(typeof skillId === 'string' ? { skillId } : {}),
    ...(values[7] === 1 ? { scouted: true } : {}),
  }
}

function packRecord(record: RivalRecord): unknown[] {
  const row: unknown[] = [record.wins, record.losses, record.draws]
  if (record.last) row.push(record.last.year, record.last.label, record.last.outcome)
  return row
}

function unpackRecord(row: unknown[]): RivalRecord {
  const last =
    row.length >= 6
      ? {
          year: Number(row[3]),
          label: String(row[4]),
          outcome: String(row[5]) as 'win' | 'lose' | 'draw',
        }
      : null

  return {
    wins: Number(row[0]),
    losses: Number(row[1]),
    draws: Number(row[2]),
    last,
  }
}
